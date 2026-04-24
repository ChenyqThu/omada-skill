# Handoff · M4 → M5

> Short, honest state-of-the-branch for the next operator. Written
> after the five M4 skills landed under `skills/**`. **M5 covers
> distribution (MCP resources), spec-diff automation, and real-
> controller dogfood.**

## 1 · What landed in M4

Five agent skills under `skills/<name>/`, following the Anthropic
Agent Skill convention documented in `docs/skills.md`. Every skill
ships:

- `SKILL.md` with calibrated frontmatter (3 positive + 3 negative
  triggers in `description`, `version`, `tags`,
  `requires-mcp-server: omada-skill>=0.1`) and a 7-section body
  (Goal · When to use · Required MCP tools · Workflow · Examples ·
  Pitfalls — with a dedicated Two-phase handshake section for the
  write-heavy skill).
- `RESOURCES.md` with glossary / reference tables / links to
  related skills.
- Two `examples/*.md` showing the skill end-to-end, including the
  token-handshake dialogue for writes.
- One `checklists/*.md` — preflight for writes, runbook for
  read-only skills.

| Skill                       | Persona          | Tools orchestrated                                                                                                  |
| --------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `omada-bulk-site-onboard`   | MSP              | `omada_discover_scope`, `omada_list_sites`, `omada_bulk_onboard`, `omada_apply_site_template`, `omada_batch_change` |
| `omada-alert-triage`        | MSP / SI         | `omada_alerts_list`, `omada_alerts_triage`, `omada_device_detail`, `omada_topology`                                 |
| `omada-guest-portal-wizard` | SI               | `omada_portal_wizard`, `omada_apply_site_template`                                                                  |
| `omada-wifi-troubleshoot`   | Prosumer / SI    | `omada_wifi_diagnose`, `omada_client_journey`, `omada_device_detail` (kind=ap)                                      |
| `omada-support-assist`      | Internal support | `omada_site_overview`, `omada_alerts_list`, `omada_audit_logs`, `omada_device_detail`                               |

Every workflow step cites a real tool registered in
`packages/mcp-tools/src/tools/**`. Skills never invent operation
IDs. Write skills explicitly document the phase-1 / phase-2 token
handshake; read-only skills explicitly name the write skill they
hand off to (and never chain through it).

State of the tree: **142 tests still green** (no new runtime code).
`pnpm turbo run typecheck lint test build` ≈ 5 s warm — unchanged
since the M3→M4 boundary, since M4 is pure markdown.

## 2 · Skill authoring conventions (follow these for M5)

- **Frontmatter triggers calibrated against 3+3**. The `description`
  block in each `SKILL.md` names three positive triggers and three
  explicit skips. When M5 starts recording conversation samples,
  refine these against real utterances.
- **Two-phase skills show both phases in one preview**. Never run
  phase 2 without echoing the plan payload — not just the one-line
  preview string — back to the operator.
- **Read-only skills never chain into writes**. They name the write
  skill (`omada_device_action`, `omada_batch_change`, etc.) and
  stop. Hand-off is explicit.
- **Workflows never invent operations**. If a skill wants an
  operation that doesn't have an intent tool yet (e.g. listing
  SSIDs), it routes through `omada_script` with the operationId
  copied from the spec — not a guess.

## 3 · What is **not** done

Intentionally parked for M5:

- **MCP-resource distribution** — `apps/mcp-server` still does not
  expose the skills as `resource://omada-skills/<name>`. The M5
  task is to add a resource registration pass in
  `apps/mcp-server/src/index.ts` that walks `skills/**`, parses
  each frontmatter, and publishes the markdown body. Stretch goal:
  a Claude plugin bundle.
- **CIMD + Claude Vault wiring** — `CIMDIntegration` /
  `AuthCodeFlow` stubs still throw; unchanged from M2-09.
- **`scripts/diff-api.ts` + `api-diff.yml`** — baseline snapshot at
  `specs/snapshots/2026-04-23.json` is still the only snapshot.
- **Staging dogfood** — the `pnpm test:staging` harness is still
  dormant. Running it (with `OMADA_CLIENT_ID` / `OMADA_CLIENT_SECRET`
  set) is the cleanest way to calibrate the skill triggers from
  real conversations.
- **Tool docs in `docs/mcp-tools.md`** — the roadmap table at the
  bottom still says "M3" for the 21 new tools. Same carryover from
  M3: back-fill the per-tool reference sections in the same style
  as `omada_list_sites`.
- **Per-skill unit tests** — M4 doesn't add a skill linter /
  validator. If M5 adds the MCP-resource publisher, fold a
  frontmatter parser + schema check into the same PR (it's cheap).

## 4 · Starting M5

Two viable first moves:

1. **Distribute the skills as MCP resources.** `apps/mcp-server`
   already owns the `createDefaultRegistry()` call; add a
   `registerSkillResources(serverRoot)` step that:
   - Walks `skills/*/SKILL.md`.
   - Parses the YAML frontmatter (reuse the `yaml` package if
     already pulled in by any existing dep, else pull a tiny one).
   - Publishes each skill as `resource://omada-skills/<name>` with
     `text/markdown` content-type and the body verbatim.
   - Adds 5+ tests to `packages/mcp-tools/test/` or
     `apps/mcp-server/test/` asserting the resources are registered
     and parseable.

2. **Wire `scripts/diff-api.ts`.** Parse the current
   `specs/omada_api.json` vs `specs/snapshots/2026-04-23.json` and
   emit a markdown delta. Hook it into `.github/workflows/` as
   `api-diff.yml` so contributors see spec drift during PR review.

Either is a clean, scoped M5 kickoff. Distribution unblocks
end-to-end dogfood; diff-api unblocks schema regeneration.

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

## 6 · Traps & quirks

Carry-overs from M1/M2/M3 still apply. New in M4 (skill-authoring-
specific):

- **Frontmatter is indicative, not enforced.** No runtime parser
  reads it yet. If M5 adds a parser, treat every existing skill as
  a test vector — the current five are intentionally conservative
  (no array-typed triggers, only standard YAML).
- **Cross-skill links use relative paths.** `RESOURCES.md` files
  link to sibling skills via `../<name>/SKILL.md`. Keep the skill
  slugs stable across renames; otherwise run a find-and-replace
  across `skills/**`.
- **Examples quote tool output verbatim.** The transcripts in
  `examples/*.md` intentionally echo the exact text-summary shapes
  that tools produce today (including the `phase=preview /
executed` prefixes, the bulleted alert lines, the device-detail
  fields). If a tool's output format changes, grep the examples
  and update.
- **Checklists have no runtime effect.** They're author-side
  discipline. When M5 adds the resource publisher, optionally fold
  the checklist into the MCP tool description as a "recommended
  preflight" pointer.
- **No per-skill package yet.** `packages/skills/` is still empty,
  and M4 didn't create it. Adding a `packages/skills` workspace is
  an option for M5 — but only if a distribution mechanism needs
  compiled code. Pure-markdown distribution doesn't.

## 7 · What is ready to commit but not yet committed

- `CHANGELOG.md` — new `### Added — M4 (skills)` / `### Changed —
M4` / `### Notes — M4` under `[Unreleased]`, already on disk.
- `HANDOFF.md` — this file, created fresh. Previous M3→M4 handoff
  archived to `docs/archive/HANDOFF-m3-to-m4.md`.
- `docs/skills.md` — intro + "Shipped skills (M4)" + dogfood plan
  updated to reflect the landed work.
- `skills/**` — 25 new markdown files (5 skills × 5 files each).

Per the earlier convention: stage them explicitly —
`git add CHANGELOG.md HANDOFF.md docs/skills.md docs/archive/HANDOFF-m3-to-m4.md skills/`
when you're ready to commit.
