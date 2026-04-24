# Handoff · M5 → M6

> Short, honest state-of-the-branch for the next operator. Written
> after the M5 distribution + tooling pass landed. **M6 is the
> missing external-dependency work: real CIMD + Authorization-Code
> bodies, staging dogfood, and skill-trigger calibration against
> recorded conversations.**

## 1 · What landed in M5

Four deliverables, all on main:

1. **Skill loader + MCP-resource publisher.** `@omada/mcp-tools` now
   ships `src/skills/` — a pure frontmatter parser (no YAML dep), a
   filesystem loader, and a layout linter. `apps/mcp-server` reads
   those on startup and exposes each skill as
   `resource://omada-skills/<slug>` with `text/markdown` content.
   `buildMcpServer` accepts an optional `skills` array (tests) or
   `skillsDir` (explicit path); the default resolves
   `<repoRoot>/skills` from the compiled module location.
2. **Two CLIs the root `package.json` had already declared.**
   - `pnpm skill:validate` → `scripts/validate-skills.ts`, exits
     non-zero on any error-severity issue; `--strict` elevates
     missing companion assets (RESOURCES.md / examples/ /
     checklists/) to errors for CI.
   - `pnpm spec:diff` → `scripts/diff-api.ts`, operation-granular
     delta between `specs/omada_api.json` and the latest
     `specs/snapshots/*.json`. Supports `--baseline`, `--output`,
     `--fail-on-change`.
3. **CI wiring.**
   - `.github/workflows/ci.yml` gained a `pnpm skill:validate
--strict` step.
   - `.github/workflows/api-diff.yml` runs the spec diff on any PR
     that touches `specs/**` or the diff script, uploads the
     markdown as an artefact, and posts/updates a sticky PR comment.
4. **Auth-stub validation.** `CIMDIntegration` and `AuthCodeFlow`
   now validate their options at construction time (non-empty
   required fields, `https://` scheme, loopback redirect per RFC
   8252, `envelopeTtlSec` range). The method bodies still throw
   the M5 placeholder message — **that is the M6 work**.

Plus **back-filled** per-tool reference sections in
`docs/mcp-tools.md` for the M3 surface (22 tools) with a ToC, risk
tiers, and source links.

State of the tree: **166 tests green** (was 142).

| Package             | M4 → M5                         |
| ------------------- | ------------------------------- |
| `@omada/shared`     | 30 → 30                         |
| `@omada/sdk`        | 30 → 39 (+9 auth-stub cases)    |
| `@omada/guardrails` | 10 → 10                         |
| `@omada/mcp-tools`  | 64 → 76 (+12 skills.test cases) |
| `@omada/mcp-server` | 7 → 11 (+4 resource cases)      |

`pnpm turbo run typecheck lint test build` ≈ 5 s warm, unchanged.

## 2 · MCP resource contract (stable from M5 on)

Skills published via the MCP resource protocol:

- **URI scheme**: `resource://omada-skills/<slug>` where `<slug>` is
  the skill's directory name (which must match its frontmatter
  `name`).
- **MIME type**: `text/markdown` — the full SKILL.md body including
  the YAML frontmatter block.
- **Listing**: `resources/list` returns `{ uri, name, description,
mimeType }`; `description` is the first non-blank line of the
  frontmatter `description` block (typically the leading TRIGGER
  sentence).
- **Capability flag**: the server advertises `{ resources: {} }`
  only when at least one skill is loaded. If the skills directory
  is empty / missing, clients see tool-only capabilities and
  `resources/list` is not registered.

The wire is unchanged across `stdio` and `http` transports.

## 3 · What is **not** done (the M6 punch list)

Intentionally parked for M6:

- **CIMD + AuthCodeFlow bodies.** M5 tightened option validation;
  `getToken()` / `invalidate()` still throw
  `OmadaFatalError("M5: … is not yet wired")`. Filling these in
  requires TP-Link IdP docs I don't have access to — specifically:
  - CIMD envelope-fetch endpoint shape (URL, headers, signing
    scheme on `principalKeyPath`), plus the controller-side
    exchange endpoint.
  - Whether Authorization-Code PKCE targets the controller's
    `/openapi/authorize/code` + `/openapi/authorize/token` as
    advertised, or a cloud-hosted shim.
  - Where refresh tokens live (Claude Vault? local file? OS
    keyring?). The current options block doesn't model persistence.
    Once those are documented, the implementation is mechanical.

- **Staging dogfood.** The `pnpm test:staging` harness still sits
  idle. Running it with real credentials should:
  1. Verify every M3 read-only tool round-trips against a live
     controller (`getSiteList` first, then the other 15 reads).
  2. Exercise **one** write via `OMADA_DRY_RUN=1` to confirm the
     two-phase helper renders a clean preview without execution.
  3. Promote a subset to a real write in a controlled sandbox,
     then roll it back manually.

- **Skill-trigger calibration.** Record 10+ real conversation
  samples per skill, adjust the `description` TRIGGER / SKIP
  bullets in each `SKILL.md` against actual utterances, and land
  the edits as a follow-up PR. The `skill:validate --strict` gate
  still passes; this is semantic refinement.

- **Resource subscriptions.** MCP clients that watch skills live
  would benefit from `ResourceListChangedNotificationSchema`. M5
  intentionally did not wire this — skills are author-time artefacts
  and nobody's editing them mid-session. Revisit if that changes.

- **Plugin bundle.** Claude plugin packaging (`omada-mcp` binary +
  bundled skills) is still the stretch goal. Waiting on a Claude
  client that accepts the plugin format.

- **Workflow polish.** `api-diff.yml` uses `actions/github-script@v7`
  — pin to a specific SHA for supply-chain hygiene in the next pass.

## 4 · Starting M6

Three viable first moves, in rough priority order:

1. **Close the auth loop.** With TP-Link IdP docs in hand, fill the
   `fetchEnvelope()` / `exchange()` bodies in
   `packages/sdk/src/client/auth/`. Wire the resulting strategies
   through `apps/mcp-server/src/buildClient.ts` alongside the
   existing client-credentials path so operators can opt into
   CIMD / PKCE via env vars (`OMADA_AUTH_STRATEGY=cimd|authcode|cc`).
   Add integration tests under `packages/sdk/test/`.

2. **Run the staging harness.** Ship a `docs/staging-runbook.md`
   capturing the sequence above, then execute it. Record the
   outcomes back into `docs/archive/` so future operators have a
   playbook rather than a cold start.

3. **Calibrate skill triggers from transcripts.** Spin up a small
   `skills/_calibration/transcripts/` directory (ignored by
   `skill:validate`) with anonymised real prompts, then tune each
   SKILL.md's frontmatter. Commit trigger changes per-skill,
   separate from the calibration corpus.

## 5 · Configuration surface (unchanged from M3)

```
OMADA_CLIENT_ID=
OMADA_CLIENT_SECRET=
OMADA_REGION=use1
OMADA_BASE_URL=
OMADA_TOKEN_URL=
OMADA_DRY_RUN=1
OMADA_MCP_CONFIRM_SECRET=     # required for write tools
OMADA_AUDIT_DIR=
OMADA_LOG_NO_REDACT=1
```

When M6 lands CIMD / AuthCode, plan an additive set like:

```
OMADA_AUTH_STRATEGY=cc|cimd|authcode  # default: cc
OMADA_CIMD_BASE_URL=
OMADA_CIMD_PRINCIPAL_ID=
OMADA_CIMD_PRINCIPAL_KEY_PATH=
OMADA_AUTHCODE_REDIRECT_URI=
```

Keep the existing `OMADA_CLIENT_ID` / `OMADA_CLIENT_SECRET` path
as `cc` (client credentials) — it's the one that actually works
today and shouldn't regress.

## 6 · Traps & quirks

Carry-overs still apply. New in M5 (loader / CLI / CI specifics):

- **Skill loader is synchronous on startup.** `buildMcpServer`
  walks the filesystem once at server construction. If you add a
  skill at runtime the server must be restarted to pick it up.
  (Resource-change subscriptions, per §3, would fix this; none of
  our M1–M5 tests need it.)
- **Frontmatter parser is narrow by design.** No YAML dep; it
  handles `string`, `|` / `>` block scalars, and `[a, b]` inline
  arrays. Nested maps or unknown constructs become `SkillIssue`s
  instead of crashing. If M6 skills want richer metadata, either
  broaden the parser or pull a real YAML dep (~30 KB) — the shape
  is isolated under `src/skills/frontmatter.ts`.
- **Scripts import TS via relative paths.** `scripts/*.ts` imports
  `../packages/mcp-tools/src/skills/index.ts` — tsx resolves it
  directly. Root `package.json` does **not** list workspace
  packages as deps; keep it that way unless there's a strong
  reason.
- **`spec:diff` shows only operation-level changes.** Request /
  response schema drift is not surfaced. That's deliberate — for
  schema diff, run `pnpm generate` and review the
  `packages/sdk/src/generated/schema.d.ts` hunk in the PR.
  Operation-level changes are what move the MCP tool surface.
- **`skill:validate` exit code semantics.** Errors → exit 1,
  warnings → exit 0. CI uses `--strict` to elevate warnings. Local
  authoring runs without `--strict` so mid-edit trees don't fail
  the hook.
- **`api-diff.yml` needs `pull-requests: write`.** Already set.
  Fork-based PRs don't receive the write permission and the
  `github-script` step will silently no-op; the artefact still
  uploads.
- **Auth-stub `redirectUri` loopback rule.** Only `127.0.0.1`,
  `::1`, and `localhost` are accepted on `http://`. Any other
  non-`https` redirect is rejected at construction. Adjust in
  `packages/sdk/src/client/auth/AuthCodeFlow.ts` if the controller
  requires a different loopback name.

## 7 · What is ready to commit but not yet committed

- `CHANGELOG.md` — new `### Added — M5` / `### Changed — M5` /
  `### Notes — M5` under `[Unreleased]`, already on disk.
- `HANDOFF.md` — this file, created fresh. M4 → M5 archived to
  `docs/archive/HANDOFF-m4-to-m5.md`.
- `docs/mcp-tools.md` — back-filled per-tool reference sections.
- `packages/mcp-tools/src/skills/**`, `packages/mcp-tools/test/skills.test.ts`,
  and the updated barrel.
- `apps/mcp-server/src/server.ts` + `apps/mcp-server/test/server.test.ts`.
- `packages/sdk/src/client/auth/*.ts` + `packages/sdk/test/auth-stubs.test.ts`.
- `scripts/validate-skills.ts`, `scripts/diff-api.ts`.
- `.github/workflows/ci.yml`, `.github/workflows/api-diff.yml`.

Per the earlier convention, stage them explicitly — the commit
plan below groups them logically.
