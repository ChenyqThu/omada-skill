# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security — quality pass (post-M5)

- **HTTP transport hardening.** The `/mcp` endpoint now requires a shared
  bearer (`OMADA_MCP_BEARER`) whenever bound to a non-loopback interface, and
  CORS no longer defaults to `*`. Requests with a non-allowlisted `Origin` or
  a `Host` header that doesn't match the bound interface are rejected — the
  latter defeats DNS-rebinding. Token comparison is `timingSafeEqual`.
  Added env vars: `OMADA_MCP_BEARER`, `OMADA_MCP_ALLOWED_ORIGINS`,
  `OMADA_MCP_HOST`, `OMADA_MCP_PORT`.
- **URL scheme enforcement.** `resolveBaseUrl` and `OAuthTokenStore` refuse
  any `http://` URL unless it targets a loopback host and the caller has
  explicitly opted in via `allowInsecureLoopback` / `OMADA_ALLOW_INSECURE_LOOPBACK`.
  Stops `client_secret` from being sent over plaintext to an attacker-controlled
  `OMADA_TOKEN_URL`.
- **Confirm token crypto.** Switched from `createHash("sha256").update(secret)`
  to `crypto.createHmac("sha256", secret)`, replaced string equality with
  `timingSafeEqual`, capped the `canonicalize()` recursion depth, and accept
  the bucket-ahead-by-one window so clock-skewed callers verify cleanly.
- **Dependency audit.** Forced `vite >= 6.4.2` and `esbuild >= 0.25.0` via
  `pnpm.overrides` — clears GHSA-4w7w-66w2-5vf9 + GHSA-67mh-4wv8-2f99.
  `pnpm audit` now reports 0 advisories.

### Fixed — quality pass (post-M5)

- `OAuthTokenStore` rejects non-positive `expires_in` values so callers can't
  loop refetching a pre-expired token.
- `parseRetryAfter()` returns `undefined` for past `Retry-After` HTTP-dates
  (clock skew / stale headers) instead of yielding a zero delay that triggered
  thundering-herd retries.
- `paginate()` now has a hard upper bound (`PAGINATE_HARD_CAP = 10_000`) that
  `maxPages` can only narrow, preventing misbehaving servers from driving an
  infinite generator loop.
- SKILL.md frontmatter parser no longer mis-handles block scalars whose
  follow-up lines are less-indented than the first content line.
- `redact()` guards cyclic object graphs with a `WeakSet` instead of
  blowing the stack.

### Changed — quality pass (post-M5)

- `createJsonlAuditSink`: `onError` is now required (audit loss is not a
  silent-default case), returns a `JsonlAuditSink` that also exposes
  `flush()` for SIGTERM drain, rotates when a line would cross `maxBytes`
  (optional), and resets the internal write-tail chain once drained so
  long-running servers don't grow an unbounded microtask history.
- `scripts/validate-skills.ts` cross-checks `omada_*` / `omada-*` references
  in every SKILL.md against the tool registry + sibling skill ids. A
  rename or typo now fails pre-commit / CI instead of at MCP runtime.
- `scripts/diff-api.ts` gained `--fail-on-breaking`; `.github/workflows/api-diff.yml`
  runs it in addition to the comment step, failing PRs that remove an
  operation or move a method/path.
- `apps/mcp-server` CLI flips `parseArgs({ strict: true })` so unknown flags
  are rejected at startup rather than silently ignored.
- `packages/sdk/src/public.ts` — curated public barrel (opt-in via the
  `@omada/sdk/public` exports subpath). `MockTransport`, `MockAuth`, and
  `SAMPLE_SITES` are marked `@internal`; they stay reachable from the
  workspace-wide `@omada/sdk` import but are excluded from the public
  surface for when the package flips `private: false`.

### Added — quality pass (post-M5)

- `.github/workflows/release.yml` — Changesets versioning/publishing workflow.
  No-op while packages are `private: true`, but opens the "Version Packages"
  PR muscle so we find out about missing changesets during development rather
  than at publish time.
- `TODO.md` — living punch list of review findings, P0/P1/P2/A/T, updated as
  items land.

### Added — M5 (distribution + tooling)

- **Skill loader** in `@omada/mcp-tools` (`src/skills/`) with pure
  frontmatter parser, filesystem loader, and a layout linter. Parses
  the M4 YAML shape (`name` / `description: |` / `version` / `tags[]`
  / `requires-mcp-server`) without adding a YAML dependency. Exposes
  `SKILL_RESOURCE_PREFIX` + `SKILL_MIME_TYPE` constants.
- **MCP-resource publisher** in `apps/mcp-server` — the server now
  advertises each skill as `resource://omada-skills/<slug>` with
  `text/markdown` content. `buildMcpServer` accepts an optional
  `skills` override (tests) or `skillsDir` (explicit path); the
  default resolves `<repoRoot>/skills` from the compiled module.
- **`pnpm skill:validate`** (`scripts/validate-skills.ts`) — walks
  `skills/**`, parses each SKILL.md, optionally runs the strict
  layout lint (`--strict` for CI), exits non-zero on errors.
- **`pnpm spec:diff`** (`scripts/diff-api.ts`) — diffs the current
  OpenAPI spec against the latest snapshot at operation granularity
  (added / removed / changed operations; method · path ·
  `deprecated` · `summary`). Supports `--baseline`, `--output`,
  `--fail-on-change`.
- **`.github/workflows/api-diff.yml`** — runs the operation diff on
  any PR that touches `specs/**` or the diff script; uploads the
  markdown as an artefact and posts/updates a sticky PR comment.
- **`auth-stubs` validation** — `CIMDIntegration` and `AuthCodeFlow`
  now validate their options in the constructor (non-empty required
  fields, `https://` scheme, loopback redirect per RFC 8252, TTL
  range) instead of only throwing from `getToken()`. Method bodies
  are still M5 placeholders.

### Changed — M5

- `apps/mcp-server/src/server.ts` now declares `resources: {}` in
  capabilities when at least one skill is loaded, and registers
  `ListResourcesRequestSchema` + `ReadResourceRequestSchema`
  handlers. The existing tool surface is unchanged.
- `ci.yml` gained a `pnpm skill:validate --strict` step between the
  turbo pipeline and `pnpm generate`.
- `docs/mcp-tools.md` — back-filled per-tool reference sections for
  the M3 surface (22 tools), with a table of contents, source
  links, and per-tool backing operations / risk tier.

### Notes — M5

- `@omada/mcp-tools` grew from 64 → 76 tests (12 new
  `skills.test.ts` cases covering frontmatter parsing + layout lint
  + loader happy path against the real `skills/` tree).
- `@omada/mcp-server` grew from 7 → 11 tests (4 new resource-layer
  cases over the MCP protocol).
- `@omada/sdk` grew from 30 → 39 tests (9 new option-validation
  cases on the two auth stubs).
- Total: **166 tests** (was 142), still under 2 s.
- `pnpm turbo run typecheck lint test build` stays green.

### Added — M4 (skills)

- **5 new agent skills** under `skills/<skill-name>/`, following
  Anthropic's Agent Skill convention documented in `docs/skills.md`:
  - `omada-bulk-site-onboard` (MSP) — drives
    `omada_discover_scope`, `omada_list_sites`, `omada_bulk_onboard`,
    `omada_apply_site_template`, and `omada_batch_change` through the
    two-phase handshake for onboarding batches of sites from backup
    files and templates.
  - `omada-alert-triage` (MSP / SI) — read-only playbook over
    `omada_alerts_list`, `omada_alerts_triage`, `omada_device_detail`,
    and `omada_topology`; collapses noisy alert logs into ranked
    groups + device context + topology hints.
  - `omada-guest-portal-wizard` (SI) — assembles a `PortalSetting`
    VO, runs `omada_portal_wizard` through its two-phase handshake,
    and optionally chains `omada_apply_site_template` for
    template-backed portals.
  - `omada-wifi-troubleshoot` (Prosumer / SI) — three-step
    diagnostic over `omada_wifi_diagnose`, `omada_client_journey`,
    and `omada_device_detail` (kind=ap) with explicit thresholds for
    deciding which zoom path to take.
  - `omada-support-assist` (internal tier-1) — compiles a ticket
    draft from `omada_site_overview`, `omada_alerts_list`,
    `omada_audit_logs`, and `omada_device_detail` across a locked
    incident window. Read-only; hands off to write skills.
- **Skill companion assets** — every skill ships a `RESOURCES.md`
  (glossary / reference tables / related skills), two `examples/*.md`
  (calibration transcripts with real tool calls + token handshakes),
  and one `checklists/*.md` (preflight / runbook / evidence).
- **Frontmatter calibration** — each `SKILL.md` carries the
  `name` / `description` / `version` / `tags` /
  `requires-mcp-server` block from `docs/skills.md`, with 3 positive
  + 3 negative triggers in the `description` so downstream skill
  selectors match precisely.

### Changed — M4

- `docs/skills.md` — replaced the M1 "planned" framing with an M4
  "implemented" entry for every skill plus a cross-link to the
  distribution roadmap still pending in M5.

### Notes — M4

- No new runtime code or packages. Skills are pure markdown under
  `skills/**`; distribution as MCP resources is the M5 item.
- No test-count delta: 142 vitest cases still pass in ≈ 1 s
  (`pnpm turbo run typecheck lint test build` ≈ 5 s warm).
- Every workflow in a skill cites a real tool registered in
  `packages/mcp-tools/src/tools/**`. Skills never invent operation
  IDs.

### Added — M3 (intent tools)

- **21 new MCP intent tools** rounding out the 22-tool M3 surface
  (`omada_list_sites` from M1 remains the seed). All tools live in
  `packages/mcp-tools/src/tools/**`, register into
  `createDefaultRegistry()`, and return a terse text summary with
  structured JSON in `structuredContent`.
- **Read-only discovery / health** — `omada_discover_scope`,
  `omada_site_overview`, `omada_list_devices`, `omada_device_detail`
  (kind-routed over AP / switch / gateway / stack endpoints),
  `omada_list_clients`, `omada_client_journey`, `omada_topology`
  (v2 + v3), `omada_wifi_diagnose`.
- **Read-only monitoring** — `omada_alerts_list`, `omada_alerts_triage`
  (client-side grouping by module / severity / target),
  `omada_voip_overview`, `omada_vpn_status`, `omada_audit_logs`,
  `omada_firmware_plan`, `omada_exec_report` (MSP dashboard).
- **Two-phase write helper** — `packages/mcp-tools/src/helpers/two_phase.ts`
  issues + verifies `@omada/guardrails` confirm tokens, tagging severity
  from the whitelist. Every write tool routes through it.
- **Medium-risk writes** — `omada_apply_site_template`
  (`bindSiteTemplate`), `omada_bulk_onboard` (`batchSiteImport`),
  `omada_portal_wizard` (`addPortal`).
- **High-risk writes** — `omada_device_action` (reboot / forget),
  `omada_firmware_rollout` (`onlineRollingUpgrade`),
  `omada_batch_change` (`batchController`).
- **Escape hatch** — `omada_script` invokes any registered operationId
  by name. GETs run immediately; non-GETs require the confirm-token
  handshake.

### Changed — M3

- `HIGH_RISK_OPERATION_IDS` now tags `batchController` as high-risk
  (severity `high`) because the `/batch` wrapper can chain arbitrary
  writes. Existing guardrail tests still pass.

### Notes — M3

- Test count rose from 89 (end of M2) to 142 with M3.
  `@omada/mcp-tools` alone grew from 12 → 64 tests across 16 files.
- `pnpm turbo run typecheck lint test build` ≈ 5 s warm; still fully
  green.
- Tool routing by directory: `scope/`, `inventory/`, `monitor/`,
  `deploy/`, `lifecycle/`, `advanced/`.

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
