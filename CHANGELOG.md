# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — M2 (SDK maturation)

- **`.env.local` loading** (M2-01) — `dev:stdio` / `dev:http` / `start`
  scripts load `apps/mcp-server/.env.local` via Node 22's native
  `--env-file-if-exists`; no `dotenv` dependency. Ships `.env.example`
  documenting every supported variable (`OMADA_CLIENT_ID` /
  `OMADA_CLIENT_SECRET` / `OMADA_REGION` / `OMADA_BASE_URL` /
  `OMADA_TOKEN_URL` / `OMADA_DRY_RUN` / `OMADA_MCP_CONFIRM_SECRET` /
  `OMADA_AUDIT_DIR`).
- **`callPaginated<Op>()` helper** (M2-03) — async-generator wrapper
  around `paginate()` from `@omada/shared`; consumes Omada's
  `{ totalRows, currentPage, data }` pagination envelope. Multi-page
  support landed in `MockTransport.pagedRoute()` for offline tests.
- **JSONL audit sink** (M2-05) — `createJsonlAuditSink({ dir })` appends
  redacted events to `${dir}/YYYY-MM-DD.jsonl` with automatic date
  rotation. `apps/mcp-server` wires it when `OMADA_AUDIT_DIR` is set,
  otherwise falls back to the M1 in-process callback.
- **Coverage gate** (M2-07) — `vitest.config.ts` enforces ≥70 % lines /
  statements / functions / branches via `@vitest/coverage-v8`. New
  tests across SDK transport/regions and shared logger/redact closed
  the gaps.
- **Staging test scaffold** (M2-06) — `packages/sdk/test/staging.test.ts`
  runs against a real controller when `OMADA_CLIENT_ID` /
  `OMADA_CLIENT_SECRET` are present; `describe.skipIf` keeps CI green
  when they are absent. New `pnpm test:staging` script.
- **Schema-derived response type** (M2-08) —
  `OmadaClient.call<Op>(opId, params): Promise<ResponseFor<Op>>` now
  returns the `application/json` body inferred from the generated
  `schemaOperations` map. `ParamsFor<Op>` is also exported for callers
  who want narrowed path/query/body types (runtime call still accepts
  the looser `CallParams` shape, so existing callers need no changes).
  Build now copies `src/generated/schema.d.ts` to `dist/` so the
  derived types resolve across project references.
- **M5 auth-strategy stubs** (M2-09) —
  `packages/sdk/src/client/auth/CIMDIntegration.ts` and
  `.../AuthCodeFlow.ts` lock in the file layout for the auth
  strategies that M5 will implement. Both `implements AuthStrategy`
  and throw `OmadaFatalError("M5: … not yet wired")` from every
  method; not wired into `buildClient`.

### Changed — M2

- **OmadaClient retry** (M2-02) — every `call<Op>()` now runs inside
  the shared `retry()` helper (`maxAttempts=3, baseDelayMs=500,
  maxDelayMs=10_000, jitter=true` by default, overridable via
  `OmadaClientOptions.retry`). 429 responses honour `Retry-After`;
  401s invalidate the token cache and are re-thrown without retry.
- **Audit / logger redaction** (M2-04) — `OmadaClient.audit()` pipes
  every event through `redact()` before delivery, and `rootLogger`'s
  `debug` / `info` / `warn` / `error` redact their `meta` argument.
  Extra keys can be merged via `OmadaClientOptions.redactKeys`.
  `OMADA_LOG_NO_REDACT=1` disables redaction for local development.

### Notes

- Test count rose from 54 (M1) to 89 at the end of M2 (30 shared + 30
  sdk + 10 guardrails + 12 mcp-tools + 7 mcp-server).
- 9 M2 commits land on `claude/recursing-tu-4d315b` (M2-01 … M2-09).
- `pnpm turbo run typecheck lint test build` stays green under 4 s
  warm; coverage run ≈ 2–3× a plain `test`.

### Added — M1 (initial scaffold)

- **Scaffold** — MIT LICENSE, `.gitignore`, `.gitattributes`,
  `.editorconfig`, Node 22 LTS pinning, top-level `README.md`.
- **Specs** — `specs/omada_api.json` as single source of truth
  (1,713 paths / 2,269 operations, OpenAPI 3.0.1); baseline snapshot
  `specs/snapshots/2026-04-23.json` for future diff.
- **Monorepo toolchain** — pnpm 10 workspace, turborepo 2, TypeScript
  5.9 (NodeNext ESM strict), ESLint 9 flat config, Prettier 3,
  Lefthook (pre-commit + commit-msg), commitlint (Conventional
  Commits), Changesets.
- **`@omada/shared`** — `OmadaError` hierarchy + HTTP status
  classifier, structured JSON logger, async-generator pagination,
  retry with exponential backoff + jitter, sensitive-key redactor.
- **`@omada/sdk`** — typed client generated from the spec:
  `schema.d.ts` (openapi-typescript, 6.1 MiB), `operations.ts`
  (2,269 ops map, 0 collisions); `OmadaClient.call<Op>(opId, params)`
  with path interpolation, query encoding, bearer-token injection;
  OAuth2 Client Credentials token store (cache + dedup + Omada-
  wrapped + RFC 6749 responses); `FetchTransport` (native `fetch`
  with 30 s timeout); `MockTransport` + `SAMPLE_SITES` fixture;
  dry-run + audit-sink middleware.
- **`@omada/guardrails`** — whitelist of 10 high-risk operationIds
  with severity tiers, deterministic HMAC-bucketed confirm-token
  two-phase-commit helper.
- **`@omada/mcp-tools`** — `defineTool` + `ToolRegistry` with
  zod-to-JSON-Schema and structured error results; first tool
  `omada_list_sites` wrapping `getSiteList`.
- **`apps/mcp-server`** — `omada-mcp` binary; stdio +
  `StreamableHTTPServerTransport` dual transport; config from env
  vars with mock fallback when credentials are absent;
  protocolVersion 2025-06-18.
- **Automation** — `pnpm generate` regenerates SDK from the spec;
  GitHub Actions CI runs typecheck / lint / test / build on Node 22
  and fails if committed generated files drift from the spec; PR
  template with test-plan checklist.
- **Documentation** — `docs/README.md` (navigation),
  `docs/architecture.md` (layered mental model),
  `docs/api-regeneration.md` (SOP for spec updates),
  `docs/deployment.md` (stdio + HTTP + Claude Desktop config),
  `docs/security.md` (auth, scopes, dry-run, confirm tokens, audit),
  `docs/contributing.md`, `docs/mcp-tools.md`, `docs/skills.md`.

### Notes — M1

- 54 vitest cases passing in ~600 ms (14 shared + 11 sdk + 10
  guardrails + 12 mcp-tools + 7 mcp-server).
- Cold `pnpm turbo run typecheck lint test build` ≈ 2–3 s.
- Mock mode starts the full MCP stack with no network and three
  `SAMPLE_SITES` — useful for offline demo and CI.

<!--
Add entries under the following categories before the next release:
- Added
- Changed
- Deprecated
- Removed
- Fixed
- Security
-->
