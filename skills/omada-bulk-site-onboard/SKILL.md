---
name: omada-bulk-site-onboard
description: |
  TRIGGER when the operator wants to stand up multiple Omada customer
  sites from a shared site-template — consistent SSIDs, VLANs, and
  device-template bindings — in one workflow.
  TRIGGER when an MSP is onboarding a new batch of stores, branches, or
  tenants and asks to "roll out", "provision", "clone", or "replicate"
  a site configuration across N locations.
  TRIGGER when a request mentions `batchSiteImport`, `bindSiteTemplate`,
  a backup file server (FTP/SFTP/TFTP/SCP), or a list of sites that
  should end up identical.
  SKIP for single-site changes — use the site UI or a targeted tool.
  SKIP for read-only queries like "list my sites" — use
  `omada_list_sites` directly.
  SKIP for firmware-only rollouts — use `omada-support-assist` +
  `omada_firmware_rollout`.
version: 0.1.0
tags: [omada, msp, bulk, onboarding, write, two-phase]
requires-mcp-server: omada-skill>=0.1
---

# Bulk site onboard (MSP)

## Goal

Drive the MSP onboarding loop: discover scope, import new sites from
backup files via `batchSiteImport`, apply shared site-templates via
`bindSiteTemplate`, and — only when a single-purpose tool is missing —
fall back to `omada_batch_change` for small, composite writes. The
skill never invents operation IDs: every step maps to an intent tool
registered in `packages/mcp-tools/src/tools/**`.

## When to use

Positive triggers (3):

- "Onboard 25 new Starbucks stores under our MSP from the corporate
  template."
- "Roll out `site-template-retail-v3` to every new customer we added
  last week."
- "Import these 40 site backups from our SFTP server in one batch."

Negative triggers (3):

- "Rename site `store-014`." → single-site edit; call the site-rename
  operation directly.
- "Show me all sites under MSP `msp-acme`." → read-only; call
  `omada_discover_scope` + `omada_list_sites`.
- "Upgrade firmware on a list of APs." → use
  `omada_firmware_plan` + `omada_firmware_rollout`.

## Required MCP tools

| Tool                        | Phase   | Risk             | Used for                                          |
| --------------------------- | ------- | ---------------- | ------------------------------------------------- |
| `omada_discover_scope`      | 1-phase | read             | Enumerate MSP customers + `omadacId`s.            |
| `omada_list_sites`          | 1-phase | read             | Inventory existing sites under one controller.    |
| `omada_bulk_onboard`        | 2-phase | write · medium   | Create up to 300 sites from backup files.         |
| `omada_apply_site_template` | 2-phase | write · medium   | Bind a shared site-template to a target site.     |
| `omada_batch_change`        | 2-phase | write · **high** | Composite write escape hatch (prefer the others). |

## Workflow

1. **Discover scope.** Call `omada_discover_scope` with the MSP ID to
   list every managed customer and their `omadacId`. In single-tenant
   mode, pass `omadacId` directly; the tool echoes it without a network
   call. Persist the chosen controller for every subsequent step.
2. **Inventory existing sites per controller.** For each controller in
   scope, call `omada_list_sites` with `pageSize=500` and any
   `searchKey` the operator provided (region, scenario). Split the
   operator's list into _needs-creation_ (missing) and
   _needs-template_ (exists, still to be conformed).
3. **Run preflight checks.** Walk `checklists/preflight.md` before any
   write: backup files reachable, VLANs unique, SSIDs not already in
   conflict, per-site DHCP ranges don't overlap, clock/NTP is sane.
   Abort and surface the list to the user if any check fails.
4. **Bulk-create new sites — phase 1.** Call `omada_bulk_onboard` with
   the prepared `fileServerConfig` + `siteImportConfigList`. Omit
   `confirm_token`. The tool returns a preview (`phase: "preview"`),
   lists the first 5 site names ← file paths, and issues a fresh
   `confirm_token` derived from the canonicalised plan.
5. **Bulk-create new sites — phase 2.** Present the preview to the
   operator verbatim. Once they say "yes" / "confirm", re-invoke
   `omada_bulk_onboard` with **the same input** plus
   `confirm_token=<token>`. The tool calls `batchSiteImport` and
   returns `phase: "executed"`. If the plan drifted, the helper
   rejects the token — rebuild phase 1 and try again.
6. **Bind the shared site-template per site — phase 1.** For every
   site in `needs-template`, call `omada_apply_site_template` with
   the controller + site IDs + `siteTemplateId` (+ optional per-switch
   `deviceTemplateId` bindings). Collect the returned `confirm_token`
   into a map keyed by `siteId`. Do **not** re-use tokens across
   sites — each plan is fingerprinted independently.
7. **Bind the shared site-template per site — phase 2.** Present the
   full list to the operator in one message. On confirmation, iterate
   the map and re-invoke `omada_apply_site_template` for each site
   with its stored token. Record failures but continue — the helper
   returns a per-call `phase: "executed" | isError`, never aborts the
   loop for you.
8. **Composite tweaks (optional).** If a site needs a multi-step write
   that lacks a dedicated tool (e.g. "rename + re-tag + restart"),
   bundle up to 20 OpenAPI actions into `omada_batch_change` with the
   same two-phase handshake. Prefer this over `omada_script`: the
   /batch wrapper gives you atomic-ish behaviour (`interrupt=true`)
   and is already tagged `high` severity by the guardrails whitelist.
9. **Report.** Summarise: sites created, templates bound, failures
   (with `errorCode` + `msg`), and any composite changes. Attach the
   MSP / controller / site IDs so the operator can verify in the
   Omada UI or in `omada_audit_logs` afterwards.

## Examples

- [examples/10-stores-quickservice.md](examples/10-stores-quickservice.md)
  — single-region retail rollout onto `site-template-quickservice`.
- [examples/multi-region-rollout.md](examples/multi-region-rollout.md)
  — MSP-wide rollout across two controllers with per-switch bindings.

## Pitfalls

- **`OMADA_MCP_CONFIRM_SECRET` is mandatory.** Writes refuse to run if
  the server was started without a ≥16-char secret; see
  `apps/mcp-server/.env.local`.
- **Tokens are plan-scoped.** Changing _any_ field between phase 1
  and phase 2 (even whitespace in a site name) invalidates the token.
  When in doubt, regenerate by dropping `confirm_token`.
- **300-site cap per `omada_bulk_onboard`.** For larger fleets, shard
  the list and run the handshake per shard.
- **Backup file paths are controller-resolved.** The controller, not
  Claude, pulls from the file server. Relative paths, VPN
  requirements, and firewall rules live on the controller side —
  document them in the site's runbook, don't patch them here.
- **`batchController` is tagged high-risk on purpose.** `/batch` can
  chain arbitrary writes, so the guardrails helper treats it like a
  firmware rollout. Prefer `omada_apply_site_template` +
  `omada_bulk_onboard` over `omada_batch_change` when you have the
  choice.
- **MSP mode requires `mspId`, single-tenant requires `omadacId`.**
  `omada_discover_scope` refuses inputs that provide neither.
- **Rollback is manual.** None of the write tools expose an
  auto-rollback. If phase 2 partially fails, inspect the per-site
  result, re-run for the failed subset, and capture the attempt in
  `omada_audit_logs` for postmortem.
