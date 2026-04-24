---
name: omada-wifi-troubleshoot
description: |
  TRIGGER when a prosumer / SI operator asks "why is my Wi-Fi slow?"
  on an Omada site and wants a fixed diagnostic playbook — site-wide
  health signals, per-client journey, per-AP detail — without chasing
  individual API calls.
  TRIGGER for "Wi-Fi is unstable at `site-home`" / "client X keeps
  roaming" / "AP Living-Room looks overloaded".
  TRIGGER when the operator mentions `retryRate`, `airtime`,
  `roaming`, `poor signal`, or asks for an AP/client health snapshot.
  SKIP when the question is purely about alerts in the last N hours
  — use `omada-alert-triage`.
  SKIP for writes (reboot, firmware, portal) — hand off to the
  matching write skill once root-cause is clear.
  SKIP for multi-site MSP reports — use `omada_exec_report` directly.
version: 0.1.0
tags: [omada, prosumer, si, wifi, diagnostics, read-only]
requires-mcp-server: omada-skill>=0.1
---

# Wi-Fi troubleshoot (Prosumer / SI)

## Goal

Fixed diagnostic playbook for "my Wi-Fi is slow". One site, maybe
one client and/or one AP. Read-only: the skill never reboots,
reprovisions, or changes a radio. Ends with a plain-language summary
the operator can hand to the user or hand off to a write skill.

## When to use

Positive triggers (3):

- "Wi-Fi at `oc-home:site-apartment` is laggy, what's going on?"
- "My laptop (MAC `ab:cd:…`) keeps dropping in the living room."
- "AP `Living-Room` looks overloaded — is that the actual problem?"

Negative triggers (3):

- "List the last 24h of alerts." → `omada-alert-triage`.
- "Reboot the AP." → `omada_device_action` (HIGH-RISK).
- "Weekly report for all sites." → `omada_exec_report`.

## Required MCP tools

| Tool                   | Phase   | Risk | Used for                                    |
| ---------------------- | ------- | ---- | ------------------------------------------- |
| `omada_wifi_diagnose`  | 1-phase | read | Parallel site-wide summary + health series. |
| `omada_client_journey` | 1-phase | read | One client's roaming + current attachment.  |
| `omada_device_detail`  | 1-phase | read | One AP's inventory + utilisation snapshot.  |

## Workflow

1. **Scope one site.** The playbook is site-scoped; reject cross-site
   comparisons and point the operator at `omada_exec_report`.
   Confirm `omadacId` + `siteId`.
2. **Site-wide snapshot.** Call `omada_wifi_diagnose`. The tool
   fetches `getWifiSummary`, `getWifiHealthTimeList`, and
   `getSiteClientHealthTimeList` in parallel and returns three lines:
   `Summary`, `Wi-Fi health`, `Client health`. Read them before
   zooming anywhere — they point at AP-count / retry-rate /
   poor-signal clients without needing a name.
3. **Interpret the signals.**
   - `retry > 10%` or `airtime > 70%` → air congestion / channel
     plan issue. Zoom APs next (step 5).
   - `poorSignalTotal > 0` → coverage or client placement. Zoom the
     specific client(s) next (step 4).
   - `unhealthyTotal > 0` on Wi-Fi series but summary fine → past
     incident, not live. Confirm with `omada-alert-triage`.
4. **(Conditional) Zoom one client.** If the operator named a client
   or the poor-signal bucket is non-zero, call `omada_client_journey`
   with `clientMac`. The tool returns current SSID / AP / signal and
   up to 10 journey events (roaming hops, disconnect reasons). Use
   the journey to spot rapid flapping between two APs.
5. **(Conditional) Zoom one AP.** If the operator named an AP or the
   retry/airtime signals implicate APs, call `omada_device_detail`
   with `kind="ap"` and the AP MAC. Read `cpu/mem/clients`,
   `radios` count, firmware. High client count with low CPU is
   normal; high CPU + low clients hints at interference or internal
   fault.
6. **Compose the verdict.** A four-line summary the operator can
   paste back to their user:
   - **Symptom**: what signals looked off.
   - **Likely cause**: one or two candidates, ranked.
   - **Evidence**: which tool surfaced it.
   - **Next step**: manual check, or hand-off to the matching
     write skill (reboot / firmware / portal).
7. **Do not act.** No write-tool calls. Any suggested reboot /
   firmware roll / portal change is named but not executed.

## Examples

- [examples/slow-wifi-home.md](examples/slow-wifi-home.md) —
  prosumer home, single AP, airtime spike.
- [examples/roaming-laptop.md](examples/roaming-laptop.md) —
  SI-flavoured, client journey shows ping-ponging between APs.

## Pitfalls

- **`omada_wifi_diagnose` returns whatever the controller emits.**
  If the controller is a fresh install or has no clients yet, the
  tool legitimately returns "(no diagnostic signals — controller
  returned empty payloads)". Don't "retry" — the site is idle.
- **Per-client zoom needs a MAC.** `getClientJourney` is keyed on
  `clientMac`, not name. Look up via `omada_list_clients` if only a
  hostname is known.
- **`omada_device_detail kind="ap"` reads `getOverviewDetail`.** The
  data is a dashboard-style snapshot — one moment in time. For a
  time-series view the operator wants a ticketed runbook, not this
  skill.
- **Summary vs health series.** The `Summary` line (current rates)
  and the `Wi-Fi health` bucket totals come from different endpoints;
  a discrepancy usually means a recent incident rolled off the
  summary window.
- **Don't call `omada_alerts_triage` here.** Alerts are a parallel
  lens; chaining them in this skill bloats the output. Point the
  operator at `omada-alert-triage` if they want the alert angle.
- **Single-site only.** The tool returns per-site counts; averaging
  across sites is misleading. For multi-site health, use
  `omada_exec_report`.
