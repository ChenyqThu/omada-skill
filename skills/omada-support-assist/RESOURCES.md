# Resources — support-assist

## Ticket template

Emit this shape. Fields in square brackets are placeholders.

```
# Incident — [site name] · [window ISO start]–[window ISO end]

## Summary
[One sentence: what happened, on whose site, and the apparent blast radius.]

## Site context
[omada_site_overview one-line output]

## Alerts in window
[top 20 bullets from omada_alerts_list — keep the original
 `[severity] ts · module · target — message` format]

## Audit activity
[last 20 entries from omada_audit_logs — keep the original
 `ts · user (ip) · module/action — message` format]
[Call out entries that bracket the alert spike with "↑ possible
 correlation: …".]

## Device context   ← optional, include only if a device is named
[omada_device_detail one-line output]

## Suggested hand-offs (not executed here)
- [e.g. reboot AP-Storefront via omada_device_action — HIGH-RISK]
- [e.g. rebind tmpl-retail-v3 via omada_apply_site_template]

## IDs & evidence
- omadacId: [oc-…]
- siteId:   [site-…]
- MAC(s):   [AA-BB-…, …]
- Audit trail: $OMADA_AUDIT_DIR/$DATE.jsonl
```

## Time window cheatsheet

Same as `omada-alert-triage/RESOURCES.md` — Unix ms in / ISO string
back:

| Phrase                | Conversion rule                        |
| --------------------- | -------------------------------------- |
| "last 24h"            | `end = now; start = end - 86_400_000`  |
| "this morning"        | `start = today 04:00 local; end = now` |
| "13:00 – 14:00 UTC"   | parse explicit ISO; keep UTC           |
| "the incident window" | reject — ask for explicit timestamps   |

## Audit log rhythm

Typical support scenarios + audit `searchKey` hints:

| Scenario                    | Good `searchKey`       |
| --------------------------- | ---------------------- |
| "who changed SSID config?"  | `wireless` / `ssid`    |
| "who forgot a device?"      | `forget` / `device`    |
| "bulk site import last PM?" | `import` / `batchSite` |
| "portal went missing"       | `portal`               |

The `searchKey` is free-text substring, not structured — lean on
short, specific keywords.

## Typical correlation patterns

- **Config change → immediate device flap**: audit shows a
  `wireless/modify` by a specific user at T-1 min; alerts show
  `Device/critical · AP-X` at T. Strong correlation — mention it in
  the ticket.
- **Template rebind → SSID outage**: `template/bind` on the site at
  T; alerts show `Client/warning · auth failure` storm at T+2. Same
  correlation, different blast radius.
- **Firmware rollout → rolling disconnects**: audit
  `firmware/onlineRollingUpgrade` at T; alerts show paced
  `Device/critical · disconnected` entries every few minutes as
  each device reboots. Correlate, but don't call it a regression
  unless alerts persist beyond the rollout window.

## Related skills

- [omada-alert-triage](../omada-alert-triage/SKILL.md) — when you
  need to pick the window before drafting the ticket.
- [omada-wifi-troubleshoot](../omada-wifi-troubleshoot/SKILL.md) —
  when the ticket is about Wi-Fi health, not a discrete incident.
- [omada-bulk-site-onboard](../omada-bulk-site-onboard/SKILL.md) /
  [omada-guest-portal-wizard](../omada-guest-portal-wizard/SKILL.md)
  — the write skills this skill hands off to.
