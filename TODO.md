# Omada Skill — Quality Improvement TODO

Living punch list. New items arrive as the review surfaces more; old items
move into the completion log once they land.

**Sources**: security-reviewer, code-reviewer (architecture), critic (quality),
Explore (coverage).

Priorities:

- **P0** — safety/stability blockers, fix first
- **P1** — correctness & security hardening
- **P2** — maintainability, robustness, dev experience
- **A** — architecture & release process
- **T** — test coverage gaps
- **D** — discovered during implementation (append here)

---

## P0 — Safety / Stability

- [x] **P0-1** HTTP transport has no auth and allows `Access-Control-Allow-Origin: *`; add bearer check + origin allowlist + Host validation — `apps/mcp-server/src/transport/http.ts:111`
- [x] **P0-2** `OAuthTokenStore` accepts non-positive `expiresIn` → token storm; reject `expiresIn <= 0` — `packages/sdk/src/client/auth/OAuthTokenStore.ts:97`
- [x] **P0-3** `OMADA_BASE_URL` / `OMADA_TOKEN_URL` accept any scheme; enforce `https:` (or loopback for dev) before sending `client_secret` — `apps/mcp-server/src/config.ts:36`, `packages/sdk/src/client/regions.ts:21`

## P1 — Security & Correctness

- [x] **P1-1** Confirm token uses `createHash` + string-compare + unbounded recursion → switch to `createHmac` + `timingSafeEqual` + depth cap in `canonicalize` — `packages/guardrails/src/confirmToken.ts:48`
- [x] **P1-2** `parseRetryAfter` returns 0 on past HTTP-date → thundering-herd; return `undefined` to fall back to exponential backoff — `packages/sdk/src/client/OmadaClient.ts:216`
- [x] **P1-3** `paginate()` default `maxPages = Infinity` → infinite loop on broken servers; enforce hard upper cap (10_000) — `packages/shared/src/pagination.ts:22`
- [x] **P1-4** `JsonlAuditSink` defaults `onError` to `console.error`; loss-of-audit risk. Make `onError` required and add `flush()` for SIGTERM — `packages/sdk/src/client/audit/JsonlAuditSink.ts:39`

## P2 — Quality / Dev Experience

- [x] **P2-1** `JsonlAuditSink.tail` promise chain grows unboundedly over days; reset when drained — `packages/sdk/src/client/audit/JsonlAuditSink.ts:43`
- [x] **P2-2** `frontmatter.ts` indent logic does not break when a subsequent line is less-indented than `firstIndent` — `packages/mcp-tools/src/skills/frontmatter.ts:78`
- [x] **P2-3** `redact.ts` walks cyclic objects infinitely; add `WeakSet` guard — `packages/shared/src/redact.ts`
- [x] **P2-4** `JsonlAuditSink` has daily rotation only; add optional size cap — `packages/sdk/src/client/audit/JsonlAuditSink.ts`
- [x] **P2-5** `parseArgs({strict: false})` silently accepts unknown flags; flip to `true` — `apps/mcp-server/src/index.ts:53`
- [x] **P2-6** dev-only CVE exposure via `vite`/`esbuild` transitive; `pnpm up vitest@latest` + `pnpm.overrides`

## A — Architecture & Release

- [x] **A-1** No release workflow consumes changesets; add `.github/workflows/release.yml` (dry-run while packages stay `private`)
- [x] **A-2** `scripts/validate-skills.ts` does not resolve `omada_*` tool names in `SKILL.md` against the registry; add cross-check
- [x] **A-3** `api-diff.yml` comments but does not fail on breaking operation removals; add `--fail-on-breaking` mode and wire it
- [x] **A-4** `packages/sdk/src/client/index.ts` uses `export *` exposing `MockTransport`, `JsonlAuditSink`, `CIMDIntegration`. Curate a `public.ts` barrel before flipping `private: false`
- [x] **A-5** README / HANDOFF / CHANGELOG all describe M5 with drift. Make CHANGELOG the only temporal log; shrink HANDOFF to a "current state" pointer
- [x] **A-6** `docs/api-regeneration.md` still says "M5 will automate most of this"; rewrite as post-M5 state

## T — Test Coverage Gaps

- [x] **T-1** `OmadaClient.ts` — add direct unit tests for `call()` dispatch, header build, path-param substitution, auth injection
- [x] **T-2** `frontmatter.ts` — fuzz/edge tests for mixed indent, tabs, nested maps, block scalars, trailing CR
- [x] **T-3** `alerts_triage.ts` — tests for grouping/scoring logic in isolation
- [x] **T-4** `OAuthTokenStore.ts` — tests for negative/zero `expiresIn`, concurrent fetches, expired-cache refresh
- [x] **T-5** `loader.ts` — real-filesystem edge cases (missing files, malformed frontmatter, duplicate skill ids)

## D — Discovered During Implementation

- [x] **D-1** `skills/omada-support-assist/SKILL.md` wrapped the backtick reference `` `omada-wifi-troubleshoot` `` across a line break. Markdown renders that as a visible space inside the code span. Fix: joined the line. The new `skill:validate` tool-name cross-check caught this.

---

## Open follow-ups (not part of this pass)

Items observed but intentionally deferred — revisit after M6 auth lands:

- **`validate-skills` could also lint tool-names referenced inside table rows
  vs inside prose.** Today it grabs any `omada_*` / `omada-*` token; a
  deliberate false example in a `## Pitfalls` section would be falsely
  flagged. None of the current skills trip this — add a `<!-- skill-validate:ignore -->`
  escape hatch if it surfaces later.
- **Lefthook pre-commit shallowness.** Runs eslint + prettier + commitlint
  only. Does not run `pnpm skill:validate`, `pnpm spec:diff`, typecheck, or
  tests. Adding them would slow commits measurably on a warm cache — weigh
  that against catching drift one push earlier.
- **CI matrix.** `.github/workflows/ci.yml` runs Node 22 only. When M6 lands
  a staging harness, add a Node 20 row plus an optional coverage upload.
- **Alias layer for renamed operationIds.** A soft-landing window that maps
  old IDs to new ones would let TP-Link rename an operation without an
  atomic cutover. Document as `packages/sdk/src/client/operationAliases.ts`
  when the first rename actually happens; premature otherwise.
- **`JsonlAuditSink` max-attempts backoff on transient fs errors.**
  Currently a single `appendFile` failure reports through `onError` and the
  event is lost. If operators deploy against a flaky network mount, add a
  short retry here.

---

## Completion Log

- 2026-04-24 P0-1 HTTP transport: bearer + origin allowlist + Host validation + `OMADA_MCP_*` env vars
- 2026-04-24 P0-2 `OAuthTokenStore` rejects non-positive `expires_in`
- 2026-04-24 P0-3 `assertSecureUrl` enforces https/loopback; threaded through `OmadaClient` and `OAuthTokenStore`
- 2026-04-24 P1-1 HMAC + `timingSafeEqual` + recursion cap in `confirmToken`; next-bucket tolerance for clock skew
- 2026-04-24 P1-2 `parseRetryAfter` returns `undefined` for past / non-positive values
- 2026-04-24 P1-3 `paginate` hard-capped at `PAGINATE_HARD_CAP = 10_000`
- 2026-04-24 P1-4 `createJsonlAuditSink` — `onError` required, `flush()` method, returns `JsonlAuditSink` interface
- 2026-04-24 P2-1 Tail promise chain reset when drained
- 2026-04-24 P2-2 Block-scalar indent logic breaks cleanly on outdent
- 2026-04-24 P2-3 `redact` guards cycles with `WeakSet`
- 2026-04-24 P2-4 `maxBytes` size-based rotation to `.N.jsonl`
- 2026-04-24 P2-5 `parseArgs({ strict: true })`
- 2026-04-24 P2-6 `pnpm.overrides` pins `vite >= 6.4.2`, `esbuild >= 0.25.0`; `pnpm audit` clean
- 2026-04-24 A-1 `.github/workflows/release.yml` + `release:version` / `release:publish` scripts
- 2026-04-24 A-2 `validate-skills.ts` cross-checks tool + skill references
- 2026-04-24 A-3 `scripts/diff-api.ts --fail-on-breaking` + wired into `api-diff.yml`
- 2026-04-24 A-4 `packages/sdk/src/public.ts` curated barrel + `./public` subpath; `@internal` tags on Mock\*
- 2026-04-24 A-5 `HANDOFF.md` shrunk to current-state pointer; CHANGELOG absorbed the narrative
- 2026-04-24 A-6 `docs/api-regeneration.md` rewritten to reflect post-M5 automation
- 2026-04-24 D-1 Fixed wrapped backtick in `skills/omada-support-assist/SKILL.md`
- 2026-04-24 T-1 `client.test.ts` +5 cases (unknown op, insecure URL guard, encoding, content-type, past Retry-After)
- 2026-04-24 T-2 `skills.test.ts` +8 frontmatter cases (scalar outdent, folded, CRLF, quotes, comments, errors, empty array)
- 2026-04-24 T-3 `alerts.test.ts` +4 triage cases (defaults, severity sort, resolved counter, empty window)
- 2026-04-24 T-4 `oauth.test.ts` +4 cases (zero/negative expiresIn, http:// refused, loopback opt-in)
- 2026-04-24 T-5 `skills.test.ts` +4 loader cases (missing SKILL.md, duplicate names, malformed file, BOM)

Test suite at the end of this pass: **192 passing** (was 166).
