# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

### Notes

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
