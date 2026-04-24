# Skills

**Skills** are the procedural knowledge that turns a bag of MCP tools
into an Omada-fluent agent. Per Anthropic's
[MCP production guide](./Building%20agents%20that%20reach%20production%20systems%20with%20MCP.md):

> MCP gives an agent access to tools and data from external systems,
> while skills teach an agent the procedural knowledge of how to use
> those tools to accomplish real work.

As of **M4**, `skills/` ships five calibrated skills (below). The
distribution pattern at the bottom of this page — MCP Server-
distributed skills as `resource://omada-skills/<name>` — remains an
**M5** target; M4 itself adds only the skill markdown artefacts.

## Shipped skills (M4)

Five skills, one per target user segment plus internal tooling:

| Skill                                                                       | Persona          | Goal                                                                           | Tools invoked                                                                                                       |
| --------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| [`omada-bulk-site-onboard`](../skills/omada-bulk-site-onboard/SKILL.md)     | MSP              | Onboard a list of customer sites from a template with consistent SSIDs / VLANs | `omada_discover_scope`, `omada_list_sites`, `omada_apply_site_template`, `omada_bulk_onboard`, `omada_batch_change` |
| [`omada-alert-triage`](../skills/omada-alert-triage/SKILL.md)               | MSP / SI         | Group, prioritise, and draft handoffs for a batch of alerts                    | `omada_alerts_list`, `omada_alerts_triage`, `omada_device_detail`, `omada_topology`                                 |
| [`omada-guest-portal-wizard`](../skills/omada-guest-portal-wizard/SKILL.md) | SI               | Stand up a branded Captive Portal end-to-end                                   | `omada_portal_wizard`, `omada_apply_site_template`                                                                  |
| [`omada-wifi-troubleshoot`](../skills/omada-wifi-troubleshoot/SKILL.md)     | Prosumer / SI    | Answer "why is my Wi-Fi slow?" via a fixed diagnostic playbook                 | `omada_wifi_diagnose`, `omada_client_journey`, `omada_device_detail`                                                |
| [`omada-support-assist`](../skills/omada-support-assist/SKILL.md)           | Internal Support | Draft tier-1 tickets with evidence attached                                    | `omada_site_overview`, `omada_device_detail`, `omada_alerts_list`, `omada_audit_logs`                               |

## Skill format

Each skill lives under `skills/<skill-name>/` and follows Anthropic's
Agent Skill convention:

```
skills/omada-bulk-site-onboard/
├── SKILL.md                # frontmatter + procedural prose
├── RESOURCES.md            # glossary, MSP model, common errors
├── examples/
│   ├── 10-stores-quickservice.md
│   └── multi-region-rollout.md
└── checklists/
    └── preflight.md        # pre-execution checks (VLAN / SSID / DHCP conflicts)
```

`SKILL.md` frontmatter:

```yaml
---
name: omada-bulk-site-onboard
description: |
  TRIGGER when the user wants to onboard multiple Omada customer sites
  from a template with consistent SSIDs/VLANs/firmware. SKIP for
  single-site changes or read-only queries.
version: 0.1.0
tags: [omada, msp, bulk, onboarding]
requires-mcp-server: omada-skill>=0.1
---
```

The body documents:

1. **Goal** — the outcome in one sentence.
2. **When to use** — 3 triggers + 3 explicit non-triggers, so Claude's
   skill selector matches precisely.
3. **Required tools** — the MCP tool names the skill orchestrates.
4. **Workflow** — numbered steps, each one naming the tool called.
5. **Examples** — pointer to `examples/…`.
6. **Pitfalls** — bullet list of known traps (API quirks, ordering
   constraints, etc.).

## Distribution

Target pattern: **MCP Server-distributed skills**. The server exposes
each skill as an MCP Resource (`resource://omada-skills/<name>`) so
compatible clients auto-load them alongside the tool set. Versioning
is pinned to the server's version, which pins to the spec baseline.

A fallback is the `Claude plugin bundle` format — ship skills +
`omada-mcp` binary as a single installable artefact for Claude Desktop.

Neither mechanism is wired up yet: M4 ships the skills as plain
markdown under `skills/**`; exposing them as MCP resources or
bundling them as a plugin is **M5** work. See `HANDOFF.md` §4 for
the proposed kickoff.

## Dogfood plan

1. ✅ **Author** — the five skills land in `skills/**` with
   calibrated frontmatter, two `examples/*.md`, one
   `checklists/*.md`, and `RESOURCES.md` each.
2. ⏭ **Calibrate** — record 10+ conversation samples per skill
   against a staging controller to refine the triggers / non-
   triggers in the frontmatter.
3. ⏭ **Design-partner drill** — run two MSP engagements through
   `omada-bulk-site-onboard` and `omada-alert-triage` end-to-end,
   including rollback. Feed friction points back into
   `checklists/*.md` and the `Pitfalls` bullets.
4. ⏭ **Distribute (M5)** — expose the five skills as
   `resource://omada-skills/<name>` MCP resources and/or bundle
   them as a Claude plugin.
