# Handoff · M2 → M3

> Short, honest state-of-the-branch for the next operator. Written after
> M2-09 landed. **M3 is the 22 intent tools.**

## 1 · What landed in M2

9 commits on `claude/recursing-tu-4d315b`, ahead of `main`:

| #     | Commit    | What it did                                                                               |
| ----- | --------- | ----------------------------------------------------------------------------------------- |
| M2-01 | `67fa3af` | `.env.local` loading via `--env-file-if-exists` + `.env.example`                          |
| M2-02 | `7a25d5f` | `retry()` middleware wrapped around every `OmadaClient.call()`                            |
| M2-03 | `728ab78` | `callPaginated<Op>()` + `MockTransport.pagedRoute()` multi-page fixture                   |
| M2-04 | `b742e44` | `redact()` piped into audit sink + `rootLogger` meta; `redactKeys` option                 |
| M2-05 | `e378758` | `createJsonlAuditSink({ dir })` — daily-rotated JSONL; `OMADA_AUDIT_DIR` wiring           |
| M2-06 | `2ae3cb8` | `pnpm test:staging` scaffold; `describe.skipIf(!OMADA_CLIENT_ID)` keeps CI green          |
| M2-07 | `464860f` | `vitest` coverage ≥ 70 % lines/branches/fns/statements; filled SDK/shared gaps            |
| M2-08 | `328102c` | `call<Op>` return type derived from `schemaOperations`; `ParamsFor<Op>` exported          |
| M2-09 | `be26576` | `CIMDIntegration` + `AuthCodeFlow` stubs — throw `OmadaFatalError("M5: … not yet wired")` |

State of the tree: **89 tests green in ≈ 600 ms** (30 shared + 30 sdk + 10
guardrails + 12 mcp-tools + 7 mcp-server). `pnpm turbo run typecheck lint
test build` ≈ 3 s warm / 20 s cold.

## 2 · What the client can do now

```ts
// Real credentials (or unset → falls back to MockTransport via buildClient):
const client = new OmadaClient({
  region: "use1",
  auth: new OAuthTokenStore({ clientId, clientSecret, tokenUrl }, transport),
  retry: { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 10_000, jitter: true },
  onAudit: createJsonlAuditSink({ dir: process.env.OMADA_AUDIT_DIR }),
});

// Response type is narrowed — `sites.result?.data` has IDE autocompletion:
const sites = await client.call("getSiteList", {
  path: { omadacId },
  query: { page: 1, pageSize: 50 },
});

// Or walk every page with the helper:
for await (const batch of callPaginated(client, "getSiteList", {
  path: { omadacId },
})) {
  console.log(batch.length);
}
```

- 429 → exponential backoff with jitter + `Retry-After` honoured.
- 401 → `auth.invalidate()`, re-thrown (no retry; caller's next call mints a fresh token).
- Every call emits one audit event (`authorization`, `token`, `client_secret`, … redacted).
- `OMADA_DRY_RUN=1` → every non-GET short-circuits into a plan preview stub.

## 3 · What is **not** done

These are intentionally parked for M3 / M4 / M5. Do not chase them during M3
unless a concrete tool requires them:

- **M3 · the 22 intent tools** — only `omada_list_sites` exists today.
- **M4 · the 5 Skills** — `packages/skills/` is still empty.
- **M5 · CIMD + Claude Vault real wiring** — stubs exist (M2-09) but throw.
- **M5 · `scripts/diff-api.ts` + `api-diff.yml` CI step** — baseline snapshot
  at `specs/snapshots/2026-04-23.json` is still the only snapshot.
- **Staging test run** — scaffold (M2-06) is dormant because the worktree
  does not have controller credentials. Run once the operator has them:
  `OMADA_CLIENT_ID=… OMADA_CLIENT_SECRET=… pnpm test:staging`.

## 4 · Starting M3

The 22 intent tools live in `packages/mcp-tools/src/tools/`. Use
`omada_list_sites` (`packages/mcp-tools/src/tools/scope/list_sites.ts`) as
the template:

1. `defineTool({ name, description, inputSchema: z.object({...}), handler })`.
2. In the handler, call `ctx.client.call("<operationId>", { path, query, body })`.
   The response type is auto-narrowed thanks to M2-08 — no casts needed.
3. For writes, check `packages/guardrails/src/whitelist.ts` and issue a
   confirm token via `issueConfirmToken()` before the second-phase call.
4. Register the tool in `packages/mcp-tools/src/tools/index.ts`.

The canonical intent list is in `docs/skills.md` + the 22-tool table in
`docs/mcp-tools.md` (if missing, re-derive from the M1 planning notes).

## 5 · Configuration surface (for `.env.local`)

Already documented in `.env.example`, repeated here for scanners:

```
OMADA_CLIENT_ID=              # real staging creds; unset = mock mode
OMADA_CLIENT_SECRET=
OMADA_REGION=use1             # or override with OMADA_BASE_URL
OMADA_BASE_URL=               # fully-qualified, wins over region
OMADA_TOKEN_URL=              # defaults to `${baseUrl}/openapi/authorize/token`
OMADA_DRY_RUN=1               # short-circuit every non-GET
OMADA_MCP_CONFIRM_SECRET=     # required for confirm-token tools
OMADA_AUDIT_DIR=              # e.g. ~/.omada-mcp/audit; unset → in-process only
OMADA_LOG_NO_REDACT=1         # local dev escape hatch — do NOT set in prod
```

## 6 · Traps & quirks (carry-over from M1 + new in M2)

- **`consistent-type-imports`** — `import type { … }` for all type-only
  imports. Lefthook will block the commit otherwise.
- **`pnpm build` copies `schema.d.ts` manually** — `tsc -b` will NOT
  re-emit a `.d.ts` source file. If you add another raw `.d.ts` under
  `src/generated/`, extend the `cp` step in `packages/sdk/package.json`
  or M2-08's derived types will silently collapse to `{}` when consumed
  via project references.
- **Duplicate operationIds** — `openapi-typescript` suffixes the second
  path with `_1` (`schemaOperations["foo_1"]`). The runtime
  `OperationId` is `keyof typeof operations` and is always a subset, so
  `Op extends keyof schemaOperations` is the right conditional when
  writing new derived types.
- **`describe.skipIf`** — staging tests MUST be skipped when env vars are
  absent. CI does not provision controller credentials.
- **`.omc/` + `.claude/worktrees/`** — runtime state, already gitignored.
  Do not commit anything under them.

## 7 · What is ready to commit but not yet committed

- `CHANGELOG.md` — new `### Added / Changed / Notes` under `[Unreleased]`
  summarizing M2-01 … M2-09. Already updated in the working tree.
- `HANDOFF.md` — this file. Created fresh (no prior version in-repo).

Per the original M1 handoff directive: **do not commit these without the
operator's explicit approval**. `git status` should show both as
untracked/modified — stage them with `git add CHANGELOG.md HANDOFF.md`
when you're ready.
