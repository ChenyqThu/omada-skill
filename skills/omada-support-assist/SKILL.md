---
name: omada-support-assist
description: |
  TRIGGER when an internal support operator wants a tier-1 ticket
  draft for an Omada site issue, with evidence (site overview,
  device detail, recent alerts, audit trail) attached automatically.
  TRIGGER for "draft a ticket for the outage on `site-042`" / "put
  together an incident summary for oc-abc between 2 PM and 4 PM" /
  "who changed config on `site-hq` this morning, and what broke?".
  TRIGGER when the request asks for a compile-it-for-me artefact, not
  an interactive diagnosis.
  SKIP for live root-cause investigation — use
  `omada-wifi-troubleshoot` or `omada-alert-triage` first.
  SKIP when the operator wants to *act* (reboot / upgrade / rebind)
  — the matching write skill.
  SKIP for multi-site MSP KPI reports — use `omada_exec_report`
  directly.
version: 0.1.0
tags: [omada, support, ticketing, audit, read-only]
requires-mcp-server: omada-skill>=0.1
---

# Support assist (internal tier-1 ticket drafting)

## Goal

Compile a tier-1 ticket draft for one site + one incident window. The
skill pulls site overview, recent alerts, audit attribution, and
(optionally) a device snapshot, then returns a ticket-shaped document
the operator can paste into the ticketing system. 100 % read-only.

## When to use

Positive triggers (3):

- "Draft a support ticket for the outage at `oc-msp:site-042` between
  13:00 and 14:00 UTC."
- "Compile an incident summary for `site-hq-sjc` this morning — focus
  on the SW-CORE port flap."
- "Who changed the SSID config on `site-branch-09` yesterday, and did
  it correlate with any client drops?"

Negative triggers (3):

- "Why is Wi-Fi slow?" → `omada-wifi-troubleshoot`.
- "Reboot `AP-Storefront`." → `omada_device_action`.
- "Give me the weekly MSP KPI roll-up." → `omada_exec_report` tool
  directly.

## Required MCP tools

| Tool                  | Phase   | Risk | Used for                                       |
| --------------------- | ------- | ---- | ---------------------------------------------- |
| `omada_site_overview` | 1-phase | read | One-line site identity + device/client totals. |
| `omada_alerts_list`   | 1-phase | read | Raw alerts inside the incident window.         |
| `omada_audit_logs`    | 1-phase | read | Who changed what, and when, within the window. |
| `omada_device_detail` | 1-phase | read | Snapshot of the accused device, if named.      |

## Workflow

1. **Lock the incident window.** Collect three things explicitly:
   `omadacId`, `siteId`, and the window (`timeStart` / `timeEnd` in
   ISO strings). Convert relative phrases ("this morning", "last
   shift") to Unix ms **and** echo the ISO back so the operator can
   catch timezone errors.
2. **Site identity.** Call `omada_site_overview`. The one-line site
   identity + current device/client totals seed the top of the
   ticket and confirm the `siteId` is alive on the right controller.
3. **Alerts inside the window.** Call `omada_alerts_list` with the
   window from step 1 and `pageSize=100`. Capture the text summary
   verbatim for the ticket body; the first 50 bullets are
   ticket-shaped already (`[severity] ts · module · target — msg`).
4. **Audit attribution.** Call `omada_audit_logs` with the same
   window plus any `searchKey` the operator provided (module, user,
   action). Pair each alert cluster from step 3 with the closest
   preceding audit entry — "config change by `alice@msp` at 12:58 ×
   spike at 13:00" is the attribution the ticket lives on.
5. **Device snapshot (conditional).** If the incident names a device,
   call `omada_device_detail` with the right `kind` and paste the
   one-line summary into the ticket. Skip when the incident is
   site-wide / client-scoped.
6. **Assemble the ticket.** Emit one markdown document with:
   - `# Incident — <site name> · <window ISO>`
   - **Summary**: one sentence.
   - **Site context**: the `omada_site_overview` line.
   - **Alerts in window**: the text summary from step 3, truncated
     to the top 20 bullets.
   - **Audit activity**: last 20 entries from step 4, emphasising
     entries that bracket the alert spike.
   - **Device context** (if any): the `omada_device_detail` line.
   - **Suggested hand-offs**: the write skills that _could_ fix
     this (never executed here).
   - **IDs & tokens**: `omadacId`, `siteId`, `MAC`(s), and a link
     hint for the JSONL audit artefact under `OMADA_AUDIT_DIR`.
7. **Hand off, don't act.** If the operator asks the skill to
   "go fix it" — redirect to the matching write skill. This skill
   never issues reboots, firmware rolls, template binds, or portal
   creates.

## Examples

- [examples/tier1-outage-ticket.md](examples/tier1-outage-ticket.md)
  — store-level outage ticket with audit-trail attribution.
- [examples/config-change-audit.md](examples/config-change-audit.md)
  — "who changed what, and what broke" investigation ticket.

## Pitfalls

- **Windows matter more than filters.** Choose the window first,
  apply module / resolved / searchKey filters second. A tight
  window on the wrong day is worse than a loose window.
- **Audit logs are site-scoped.** `getAuditLogsForSite` only returns
  entries within `siteId`. Cross-site incidents need one call per
  site; stitch the output manually.
- **Audit log search keys are free-text.** `searchKey` is matched
  against user / action / module — case-insensitive substring,
  nothing structured. Use the Omada UI's advanced filter when the
  substring is ambiguous.
- **`omada_device_detail` kind selection still applies.** Use `ap`,
  `switch`, `gateway`, or `stack`. Re-read `omada-alert-triage`'s
  resources table if unsure.
- **Don't invent root-cause.** The skill's ticket is a _draft_ with
  evidence. Rank audit entries by temporal proximity to alert
  spikes, but stop short of asserting causation. The operator
  decides, not the skill.
- **Respect `OMADA_LOG_NO_REDACT=0`.** Audit + alert payloads are
  already redacted by `@omada/shared`'s redactor before they reach
  the tool result. Don't bypass redaction to "improve" the ticket.
- **No write tool calls.** If you find yourself about to call
  `omada_device_action`, `omada_batch_change`, etc., stop and hand
  off — the ticket is the deliverable, not the fix.
