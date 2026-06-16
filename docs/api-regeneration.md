# API regeneration SOP

`specs/omada_api.json` is the single source of truth. When TP-Link
ships a new version, this is the procedure.

## 1. Snapshot the current spec

Keep an immutable baseline of what shipped so we can diff against it.

```bash
cp specs/omada_api.json "specs/snapshots/$(date +%Y-%m-%d).json"
git add specs/snapshots/
git commit -m "chore(spec): snapshot $(date +%Y-%m-%d) baseline"
```

## 2. Pull the latest spec

The spec is published live by the controller's springdoc endpoint — no
auth required — so fetch it directly instead of hand-copying:

```bash
pnpm spec:fetch                          # use1 cloud, group "00 All" → specs/omada_api.json
pnpm spec:fetch --region euw1            # other cloud region (use1|euw1|aps1|apne1|sa1)
pnpm spec:fetch --base-url https://<controller>:8043   # self-hosted controller
```

`spec:fetch` downloads `<base>/v3/api-docs/00%20All`, validates it's an
OpenAPI doc, refuses to write if the op count drops >10% (broken-payload
guard), and re-serializes to 2-space JSON so `git diff` stays reviewable.
Discover all 18 springdoc groups at `<base>/v3/api-docs/swagger-config`;
group `00 All` is the complete superset the SDK is built from.

Do not hand-edit. If TP-Link hasn't declared `components.securitySchemes`
(known gap), it's injected in `scripts/build-docs.ts` for the docs portal,
not by mutating the spec.

## 3. Regenerate

```bash
pnpm generate
```

This rewrites three files:

- `packages/sdk/src/generated/schema.d.ts` — openapi-typescript output
- `packages/sdk/src/generated/operations.ts` — operationId → metadata map
- `packages/sdk/src/generated/index.ts` — barrel

The script prints a summary:

```
[generate] reading spec: /…/specs/omada_api.json
[generate] Omada Open API v0.1 (openapi 3.0.1)
[generate] running openapi-typescript ...
[generate]   → schema.d.ts (6086.7 KiB, 892 ms)
[generate]   → operations.ts (2269 ops across 1713 paths, 0 collisions)
[generate]   → index.ts
[generate] top tags: Wired Network(100), Ap(75), Device(75), ...
[generate] ✓ done
```

If the op count or `collisions` drop to a suspicious number, stop and
investigate — the spec may have broken.

## 4. Re-run the suite

```bash
pnpm turbo run typecheck lint test build
```

Any failure here is one of:

- **Typecheck**: a generated field removed/renamed that a tool still
  uses. Update the tool, then re-run.
- **Lint**: unusual, almost never caused by regeneration.
- **Tests**: check `packages/mcp-tools/test/registry.test.ts`'s
  "canonical operationIds" case — if `getSiteList` disappeared or
  changed path, the test will flag it before tools do.

## 5. Review the diff manually

```bash
git diff specs/omada_api.json               # usually huge — inspect with eyes
git diff packages/sdk/src/generated/operations.ts | head -200
```

Look for:

- **Removed operationIds** — any tool that hard-codes them breaks.
  Grep: `rg '"operationIdHere"' packages/mcp-tools/src`.
- **Changed HTTP methods** (GET ↔ POST) — rare, but guardrails depend
  on method to decide dry-run.
- **New high-risk ops** — scan new ops for `delete`, `reboot`,
  `factoryReset`, `force`, `upgrade` and add them to
  `packages/guardrails/src/highRiskOps.ts` + its severity map.

## 6. Commit

```bash
git add specs/omada_api.json packages/sdk/src/generated/
git commit -m "chore(spec): regenerate SDK from omada_api.json $(date +%Y-%m-%d)"
```

CI will run `pnpm generate` and fail the PR if
`packages/sdk/src/generated/` would change — i.e., the committed
generated code is stale.

## 7. Post-merge: announce breaking changes

If the diff removes any operationId or changes any method/path that
existing tools use, open a CHANGELOG entry under
`## Changed` or `## Removed` and ping downstream consumers.

## Automation in place

- `scripts/fetch-spec.ts` (`pnpm spec:fetch`) downloads the live spec from
  the controller's public `/v3/api-docs` endpoint, guards against truncated
  payloads, and normalizes formatting — replacing the old manual copy.
- `scripts/diff-api.ts` emits an operation-level markdown diff. Supports
  `--fail-on-change` (all changes) and `--fail-on-breaking` (removed
  ops + method/path changes).
- `.github/workflows/api-diff.yml` runs the diff on every PR touching
  `specs/`, posts a sticky comment, and fails the job when the diff is
  breaking.
- `.github/workflows/ci.yml` regenerates the SDK and fails on any
  `packages/sdk/src/generated/` drift — stale generated code can't
  land.

Still manual (future work):

- No soft-landing alias layer for renamed operationIds — renames show
  up as remove-then-add and the diff action flags them breaking.
- No automated high-risk op scan — the `highRiskOps.ts` update in
  §5 is still a human review step.
