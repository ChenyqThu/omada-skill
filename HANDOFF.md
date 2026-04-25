# Handoff — current state

> One-page pointer to the branch state. Milestone prose lives in
> [`CHANGELOG.md`](./CHANGELOG.md); the in-flight punch list lives in
> [`TODO.md`](./TODO.md). This file only answers three questions: _what
> works now_, _what doesn't_, _what to open first_.

## Where we are

- **M5 shipped** — skill loader, MCP-resource publisher, skill-validate and
  spec-diff CLIs, CI wiring, auth-stub option validation, `docs/mcp-tools.md`
  back-fill. Details: [`CHANGELOG.md § M5`](./CHANGELOG.md).
- **Post-M5 quality pass** has landed the findings from the cross-functional
  review (security · code · architecture · quality):
  security hardening (HTTP transport bearer/origin/Host, URL scheme
  enforcement, HMAC confirm token), correctness fixes (OAuth `expiresIn`,
  `Retry-After`, pagination cap), dev-experience wins (release workflow,
  skill→tool cross-validator, api-diff fail-on-breaking, curated public
  surface), and the `TODO.md` tracker itself.
- **M6 blockers unchanged** — CIMD / AuthCode bodies, staging dogfood,
  skill-trigger calibration against recorded transcripts.

Test suite: run `pnpm turbo run typecheck lint test build`. The CHANGELOG
records counts per milestone; avoid hard-coding a number here since it drifts
every time a test lands.

## What to open first

Three starter moves, rough priority order. Each is gated on a different
external input — see the linked doc for the exact contract we're waiting
on.

1. **Close the auth loop.** Fill `fetchEnvelope()` / `exchange()` bodies in
   `packages/sdk/src/client/auth/{CIMDIntegration,AuthCodeFlow}.ts` using
   TP-Link IdP documentation. Wire through `apps/mcp-server/src/buildClient.ts`
   (`OMADA_AUTH_STRATEGY=cc|cimd|authcode`). Add integration tests under
   `packages/sdk/test/`.
   See [`docs/m6-auth-research-questions.md`](./docs/m6-auth-research-questions.md)
   — the questions that need answers from TP-Link engineering before any
   line of code is safe to write here.
2. **Run the staging harness.** `pnpm test:staging` with real credentials;
   the runbook skeleton at [`docs/staging-runbook.md`](./docs/staging-runbook.md)
   covers env setup, read-only smoke, two-phase dry-run, and one real
   write under sandbox. Each `TBD` cell gets replaced as the run produces
   actual values.
3. **Calibrate skill triggers from transcripts.** Land a
   `skills/_calibration/transcripts/` corpus (ignored by `skill:validate`)
   and tune each SKILL.md's frontmatter bullets against actual utterances.

## Active configuration surface

| Env var                         | Purpose                                                         |
| ------------------------------- | --------------------------------------------------------------- |
| `OMADA_CLIENT_ID`               | OAuth client credentials — leave unset for mock mode            |
| `OMADA_CLIENT_SECRET`           | Paired with CLIENT_ID                                           |
| `OMADA_REGION`                  | Region key (default `use1`)                                     |
| `OMADA_BASE_URL`                | Override controller base URL (must be `https://`)               |
| `OMADA_TOKEN_URL`               | Override OAuth token endpoint (must be `https://`)              |
| `OMADA_DRY_RUN`                 | `1` / `true` short-circuits every write                         |
| `OMADA_MCP_CONFIRM_SECRET`      | ≥16-char secret for two-phase confirm tokens (write tools)      |
| `OMADA_AUDIT_DIR`               | Directory for daily JSONL audit files                           |
| `OMADA_MCP_BEARER`              | Required when HTTP transport binds non-loopback                 |
| `OMADA_MCP_ALLOWED_ORIGINS`     | CSV allowlist for `/mcp` `Origin` header                        |
| `OMADA_MCP_HOST` / `_PORT`      | HTTP bind override (defaults `127.0.0.1:8787`)                  |
| `OMADA_ALLOW_INSECURE_LOOPBACK` | Dev-only: permit `http://` URLs on loopback                     |
| `OMADA_LOG_NO_REDACT`           | Disable redaction of log fields (debugging only, leaks secrets) |

Planned additive set for M6 auth:

```
OMADA_AUTH_STRATEGY=cc|cimd|authcode   # default cc
OMADA_CIMD_BASE_URL=
OMADA_CIMD_PRINCIPAL_ID=
OMADA_CIMD_PRINCIPAL_KEY_PATH=
OMADA_AUTHCODE_REDIRECT_URI=
```

## Traps & quirks

These behaviours surprise new contributors:

- **Skill loader is synchronous.** The server walks `skills/` once at
  startup. Restart after adding a skill; resource-change subscriptions are
  future work.
- **Frontmatter parser is narrow by design.** No YAML dependency; supports
  `string`, `|` / `>` block scalars, `[a, b]` inline arrays. Anything nested
  turns into a `SkillIssue` rather than crashing.
- **Scripts import TS sources directly.** `scripts/*.ts` pull from
  `packages/*/src/...` via relative paths so `tsx` resolves without a
  prebuilt `dist/`. Do not list workspace packages as root deps.
- **`spec:diff` is operation-level only.** Request / response schema drift
  is intentionally out of scope; review the generated `schema.d.ts` hunk in
  the PR instead.
- **`skill:validate` exit semantics.** Errors → exit 1, warnings → exit 0.
  CI passes `--strict` to elevate warnings. Local authoring runs unstricted.
- **`api-diff.yml` needs `pull-requests: write`.** Already set. Fork PRs
  don't receive that permission and the `github-script` step no-ops; the
  artefact upload still works.
- **HTTP transport refuses to start when binding non-loopback without a
  bearer.** The failure is loud, on purpose.
- **`OMADA_LOG_NO_REDACT` disables redaction.** Do not set outside a
  controlled debugging session.

For the living set of outstanding improvements, open [`TODO.md`](./TODO.md).
