# Handoff · M3 → M4

> Short, honest state-of-the-branch for the next operator. Written after
> the 22nd M3 intent tool (`omada_script`) landed. **M4 is the 5 Skills
> that orchestrate these tools.**

## 1 · What landed in M3

22 intent tools now ship under `packages/mcp-tools/src/tools/**`. They
all register into `createDefaultRegistry()`, return a concise text
summary plus the raw JSON in `structuredContent`, and route through
the generated `operations` map (so `client.call<Op>` response types are
narrowed for free, per M2-08).

| Tool                        | Backing operation(s)                           | Risk             |
| --------------------------- | ---------------------------------------------- | ---------------- |
| `omada_discover_scope`      | `getCustomerList` (MSP) + echo (single-tenant) | read             |
| `omada_list_sites`          | `getSiteList` (M1 seed)                        | read             |
| `omada_site_overview`       | `getSiteEntity` + `getOverview`                | read             |
| `omada_list_devices`        | `getAllDeviceBySite`                           | read             |
| `omada_device_detail`       | kind-routed: AP/switch/gateway/stack detail    | read             |
| `omada_list_clients`        | `getGridActiveClients`                         | read             |
| `omada_client_journey`      | `getClientDetail` + `getClientJourney`         | read             |
| `omada_alerts_list`         | `getAlertLogsForSite`                          | read             |
| `omada_alerts_triage`       | `getAlertLogsForSite` + client-side grouping   | read             |
| `omada_topology`            | `getV3Topology` / `getTopology`                | read             |
| `omada_wifi_diagnose`       | wifi-summary + wifi/client health timelines    | read             |
| `omada_voip_overview`       | `getVoip`                                      | read             |
| `omada_vpn_status`          | `getTunnelsStatus`                             | read             |
| `omada_audit_logs`          | `getAuditLogsForSite`                          | read             |
| `omada_firmware_plan`       | `getGridFirmwareList` + `getGridUpgradePlans`  | read             |
| `omada_exec_report`         | `getMspDashboardOverall`                       | read             |
| `omada_apply_site_template` | `bindSiteTemplate`                             | write · medium   |
| `omada_bulk_onboard`        | `batchSiteImport`                              | write · medium   |
| `omada_portal_wizard`       | `addPortal`                                    | write · medium   |
| `omada_device_action`       | `rebootDevice` / `forgetDevice`                | write · **high** |
| `omada_firmware_rollout`    | `onlineRollingUpgrade`                         | write · **high** |
| `omada_batch_change`        | `batchController`                              | write · **high** |
| `omada_script`              | any registered operationId (GET fast-path)     | variable         |

State of the tree: **142 tests green in ≈ 1 s**
(30 shared + 30 sdk + 10 guardrails + 64 mcp-tools + 7 mcp-server + 1
guardrails tier update). `pnpm turbo run typecheck lint test build` ≈
5 s warm, 20 s cold.

## 2 · Two-phase commit helper

Every write tool flows through
`packages/mcp-tools/src/helpers/two_phase.ts`:

```ts
return runTwoPhase(ctx, {
  operations: ["bindSiteTemplate"],
  plan, // canonicalised into the confirm-token digest
  confirmToken, // from the tool's inputSchema
  renderPreview, // human-readable diff shown on phase 1
  execute, // called only after a valid token matches
  renderSuccess,
});
```

Phase 1 (no `confirm_token`) → issue a token, return the preview with
`phase: "preview"` in `structuredContent`. Phase 2 (same input +
matching `confirm_token`) → verify, execute, return
`phase: "executed"`. Mismatched plans (tampered input) are rejected
with `isError: true`.

Severity is derived from `@omada/guardrails`' `riskSeverity(opId)` —
M3 also tagged `batchController` as `high` because the `/batch`
wrapper can chain arbitrary writes.

## 3 · What is **not** done

Intentionally parked for M4 / M5:

- **M4 · the 5 skills** — `packages/skills/` / `skills/` is still
  empty. `docs/skills.md` lists the design targets:
  `omada-bulk-site-onboard`, `omada-alert-triage`,
  `omada-guest-portal-wizard`, `omada-wifi-troubleshoot`,
  `omada-support-assist`.
- **M5 · CIMD + Claude Vault wiring** — `CIMDIntegration` /
  `AuthCodeFlow` stubs still throw (unchanged from M2-09).
- **M5 · `scripts/diff-api.ts` + `api-diff.yml`** — baseline snapshot
  at `specs/snapshots/2026-04-23.json` is still the only snapshot.
- **Staging test run** — scaffold is still dormant; run with
  `OMADA_CLIENT_ID=… OMADA_CLIENT_SECRET=… pnpm test:staging` once the
  operator has controller credentials.
- **Tool docs in `docs/mcp-tools.md`** — the roadmap table at the
  bottom of that file still says "M3" for the 21 new tools. The next
  operator should back-fill the per-tool reference sections in the
  same style as `omada_list_sites`.

## 4 · Starting M4

Skills live under `skills/<skill-name>/SKILL.md` with optional
`RESOURCES.md`, `examples/`, `checklists/`. Frontmatter is documented
in `docs/skills.md`. Each skill:

1. **Triggers** — 3 positive + 3 negative in the frontmatter
   `description`; calibrated against real conversation samples.
2. **Tool recipe** — numbered steps naming each MCP tool invoked from
   this repo. The skill must never invent operation IDs.
3. **Pitfalls** — carry-over list from the staging dogfood.

For write-heavy skills (bulk onboard, portal wizard, firmware
rollout), document the two-phase handshake explicitly: first call
returns a preview + `confirm_token`, second call replays the token.

## 5 · Configuration surface (unchanged from M2)

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

Carry-overs from M1/M2 still apply. New in M3:

- **`OMADA_MCP_CONFIRM_SECRET`** must be ≥ 16 chars and exported
  before you can invoke the 8 write tools (or `omada_script` for a
  non-GET operation). Tests set it inside `beforeAll` /
  `afterAll` blocks — do the same if you add new write-tool tests.
- **Plan canonicalisation** — the confirm-token helper sorts keys and
  JSON-stringifies the plan. Store stable, serialisable plan objects;
  don't shove `Date` or `Buffer` through.
- **`getGatewayInfo_1`** — per the M2-08 note, the runtime operation
  map picks up `_1`-suffixed ops for duplicate paths. `omada_device_detail`
  hard-codes the `_1` variant — if the spec gets regenerated and the
  duplicate resolves to a bare `getGatewayInfo`, update the router.
- **Duplicate imports in `tools/index.ts`** — if you register a tool,
  keep the triad (`import`, `export`, `registry.register`) in lexical
  order so the file stays easy to scan.

## 7 · What is ready to commit but not yet committed

- `CHANGELOG.md` — new `### Added — M3` / `### Changed — M3` /
  `### Notes — M3` under `[Unreleased]`, already on disk.
- `HANDOFF.md` — this file, created fresh. Previous M2→M3 handoff
  archived to `docs/archive/HANDOFF-m2-to-m3.md`.

Per earlier handoff convention: stage them explicitly —
`git add CHANGELOG.md HANDOFF.md docs/archive/HANDOFF-m2-to-m3.md`
when you're ready to commit.
