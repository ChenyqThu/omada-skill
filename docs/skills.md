# Skills

**Skills** are the procedural knowledge that turns a bag of MCP tools
into an Omada-fluent agent. Per Anthropic's
[MCP production guide](./Building%20agents%20that%20reach%20production%20systems%20with%20MCP.md):

> MCP gives an agent access to tools and data from external systems,
> while skills teach an agent the procedural knowledge of how to use
> those tools to accomplish real work.

M1 does not ship any skills. The `skills/` directory is reserved, and
the distribution pattern below is the design target for M4.

## Planned skills (M4)

Five skills, one per target user segment plus internal tooling:

| Skill                       | Persona          | Goal                                                                           | Tools invoked                                                                                                       |
| --------------------------- | ---------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `omada-bulk-site-onboard`   | MSP              | Onboard a list of customer sites from a template with consistent SSIDs / VLANs | `omada_discover_scope`, `omada_list_sites`, `omada_apply_site_template`, `omada_bulk_onboard`, `omada_batch_change` |
| `omada-alert-triage`        | MSP              | Group, prioritise, and draft tickets for a batch of alerts                     | `omada_alerts_list`, `omada_alerts_triage`, `omada_device_detail`, `omada_topology`                                 |
| `omada-guest-portal-wizard` | SI               | Stand up a branded Captive Portal end-to-end                                   | `omada_portal_wizard`, `omada_apply_site_template`                                                                  |
| `omada-wifi-troubleshoot`   | Prosumer         | Answer "why is my Wi-Fi slow?" via a fixed diagnostic playbook                 | `omada_wifi_diagnose`, `omada_client_journey`, `omada_device_detail`                                                |
| `omada-support-assist`      | Internal Support | Draft tier-1 tickets with evidence attached                                    | `omada_site_overview`, `omada_device_detail`, `omada_alerts_list`, `omada_audit_logs`                               |

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

Neither mechanism is implemented in M1.

## Dogfood plan (M4)

1. Write M4's five skills against a real staging controller.
2. Record 10+ conversation samples per skill to calibrate the
   `description` triggers / non-triggers.
3. Run two design-partner MSP engagements through
   `omada-bulk-site-onboard` and `omada-alert-triage` end-to-end,
   including rollback drills.
4. Convert friction points into `checklists/*.md` and `Pitfalls` bullets.
