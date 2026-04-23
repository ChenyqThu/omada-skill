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

## 2. Drop in the new JSON

```bash
cp path/to/new/omada_api.json specs/omada_api.json
```

Do not hand-edit. If TP-Link hasn't declared `components.securitySchemes`
(known gap), inject the OAuth2 type override in the SDK codegen
post-process step instead of mutating the spec.

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

## M5 will automate most of this

- `scripts/diff-api.ts` will emit a structured JSON diff
- `.github/workflows/api-diff.yml` will comment on PRs with a breaking
  vs non-breaking summary and auto-fail on unapproved breaks
- `operationAliases.ts` will let us provide a soft-landing rename
  window
