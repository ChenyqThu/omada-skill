---
name: omada-alert-triage
description: |
  TRIGGER when an MSP or SI operator wants to grind through a batch of
  Insight / Service alerts on an Omada site — group them, prioritise
  them, and draft ticket-ready summaries backed by device detail and
  topology.
  TRIGGER for "what's wrong at site X right now?" / "triage the last
  24h of alerts on oc-abc:site-042" / "which AP is responsible for
  the red bar on the dashboard?".
  TRIGGER when alerts mention `Device`, `Client`, or `System` modules
  and the operator needs a signal-grouped view, not a raw log dump.
  SKIP for single-alert investigations where the operator already
  knows the device — use `omada_device_detail` directly.
  SKIP for config audit trails (who changed what, when) — use
  `omada-support-assist`.
  SKIP for pure capacity / Wi-Fi health questions — use
  `omada-wifi-troubleshoot`.
version: 0.1.0
tags: [omada, msp, si, alerts, triage, read-only]
requires-mcp-server: omada-skill>=0.1
---

# Alert triage (MSP / SI)

## Goal

Turn a noisy alert log into a prioritised, evidence-backed triage
list: fewer alerts than the controller shows, each one tied to a
device or topology node, ordered so the operator works the highest
severity first. 100 % read-only — this skill never resolves, deletes,
or acknowledges an alert. Hand-off ticket drafting to
[omada-support-assist](../omada-support-assist/SKILL.md).

## When to use

Positive triggers (3):

- "Triage last 24h of alerts on `oc-abc:site-042`."
- "There are 120 red alerts on the MSP dashboard this morning — which
  ones actually matter?"
- "Give me a ranked root-cause summary for the `Device` module alerts
  on `site-hq-sjc`."

Negative triggers (3):

- "Reboot AP `AA-BB-…-10`." → `omada_device_action`, not this skill.
- "Draft a ticket for the outage at `site-042`." → hand off to
  `omada-support-assist`.
- "Is my Wi-Fi slow?" → `omada-wifi-troubleshoot`.

## Required MCP tools

| Tool                  | Phase   | Risk | Used for                                      |
| --------------------- | ------- | ---- | --------------------------------------------- |
| `omada_alerts_list`   | 1-phase | read | Raw log pull, windowed; default 24h lookback. |
| `omada_alerts_triage` | 1-phase | read | Server-side-fetch + client-side grouping.     |
| `omada_device_detail` | 1-phase | read | Per-device health for top-N groups.           |
| `omada_topology`      | 1-phase | read | Where in the graph the impacted device sits.  |

## Workflow

1. **Scope the window.** Confirm the operator's intent in one
   sentence: `omadacId`, `siteId`, time window (default 24h). Convert
   relative times ("this morning", "last shift") to Unix ms before the
   tool calls.
2. **Skim the raw log.** Call `omada_alerts_list` with `pageSize=100`
   and any module / resolved filter the operator asked for. Read the
   text summary first; drop into `structuredContent.alerts` only when
   the text is insufficient (the first 50 bullets already contain
   severity · timestamp · target · message).
3. **Group the log.** Call `omada_alerts_triage` with the same
   `omadacId` + `siteId` and the same window (defaults match
   `omada_alerts_list`). The tool fetches up to 500 alerts, collapses
   them by `module|severity|target`, sorts by severity, and returns a
   priority-ordered list of groups. Use this as your "top N issues"
   view, not the raw log.
4. **Zoom top-N groups to devices.** For each of the top 3–5 groups
   where the target is a device (`deviceName` / `deviceMac` non-empty),
   call `omada_device_detail` with `kind` inferred from the group's
   module (`Device + WiFi issue → ap`, `Device + stack crash →
stack`, etc.). Capture firmware, uptime, CPU/mem, and `clients` /
   `portsUsed`. For client-module groups, skip to step 6.
5. **Render the topology once.** Call `omada_topology` with
   `version="v3"`. Read the node counts and cross-reference the
   device MACs from step 4 against the graph so the operator knows
   where in the site each fire is burning. Omit this step if the
   controller returns an empty graph (the tool emits "Topology for …
   is empty").
6. **Compose the triage report.** Output in this shape:
   - **Header**: site, window, total alerts seen, distinct groups.
   - **Top groups**: one bullet per group — `[severity] module ·
target ×count — last=<timestamp>` + a one-line sample message.
   - **Device context**: for each top-N group with a device, a sub-
     bullet summarising the `omada_device_detail` snapshot (fw,
     uptime, cpu/mem, clients).
   - **Topology hint**: "device `<name>` uplinks to `<parent>` (1
     hop from the gateway)".
   - **Suggested handoffs**: e.g. "reboot via
     `omada_device_action`", "ticket via `omada-support-assist`".
7. **Do not act.** Never call `omada_device_action`,
   `omada_batch_change`, or any write tool from this skill. If the
   operator asks to resolve / reboot / reprovision, hand off to the
   matching write skill — don't chain.

## Examples

- [examples/device-alert-storm.md](examples/device-alert-storm.md) —
  a site flooded by repeat `Device/critical` alerts from two APs.
- [examples/mixed-module-24h.md](examples/mixed-module-24h.md) — 24h
  of mixed `System` / `Device` / `Client` alerts, filtered to the
  unresolved subset.

## Pitfalls

- **Default window is 24h.** Ask before widening — a 7-day pull on a
  busy MSP site easily blows past `pageSize=1000`.
- **`omada_alerts_triage` fetches up to 500 alerts in one call.** For
  noisier sites, page `omada_alerts_list` to confirm the tail looks
  like the head — otherwise the top-N groups miss a long-tail issue.
- **`module` filter is case-sensitive.** Only `System`, `Device`,
  `Client` are valid enum values.
- **Severity ranking is best-effort.** `omada_alerts_triage` sorts
  `critical > error/high > warning/warn/medium > info/notice/low >
unknown`. The controller emits severity strings inconsistently; an
  "unknown" group is not necessarily low-impact — inspect the sample.
- **Topology v2 vs v3.** Default v3. Pass `version=v2` for older
  sites — the v3 endpoint returns an empty graph on legacy
  controllers and you'll mis-read it as "no impact".
- **`omada_device_detail` requires the right `kind`.** APs → `ap`,
  switches → `switch`, gateways → `gateway` (note: backed by
  `getGatewayInfo_1`, not bare), stacks → `stack`. Mis-routing yields
  an immediate `errorCode` but wastes a round-trip.
- **Client-module alerts rarely need `omada_device_detail`.** The
  target is a MAC you discover via `omada_list_clients` /
  `omada_client_journey`, not a device. Pivot to
  `omada-wifi-troubleshoot` for those.
