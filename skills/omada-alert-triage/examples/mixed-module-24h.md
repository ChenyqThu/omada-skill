# Example — 24h mixed-module triage, unresolved only

## Scenario

- **Operator**: MSP service desk.
- **Goal**: 24h look at unresolved alerts across modules to populate
  the morning stand-up board.

## Transcript (abridged)

```
User:  Triage unresolved alerts for oc-msp-acme:site-hq-sjc, default
       window. Skip already-resolved ones.

Claude:
  [calls omada_alerts_list { …, resolved:false }]
  → 84 unresolved alert(s) in 24h, modules: System × 5, Device × 46,
    Client × 33.

  [calls omada_alerts_triage { same window, pageSize:500 }]
  → 11 distinct groups. Top 5:
    1. [error] Device · SW-CORE ×22  "Port flap on Gi0/1"
    2. [warning] Client · — ×19       "Blacklisted: auth failure"
    3. [error] Device · GW-SJC ×12   "WAN latency spike"
    4. [warning] System · site-hq-sjc ×5  "NTP peer unreachable"
    5. [warning] Client · AC-BD-… ×4  "Roaming storm"

  Zooming the two device groups.
  [calls omada_device_detail { kind:"switch", id:"AA-CC-…-CORE" }]
  switch SW-CORE — fw 7.2.4 · uptime=12d · cpu=4% · mem=38% · portsUsed=28
  [calls omada_device_detail { kind:"gateway", id:"AA-CC-…-GW" }]
  gateway GW-SJC — fw 2.4.8 · uptime=12d · cpu=9% · mem=34%

  [calls omada_topology { version:"v3" }]
  Site site-hq-sjc topology (v3): 34 node(s), 41 edge(s)
    ap:20 switch:6 gateway:1 client:7
  SW-CORE is the aggregation layer; Gi0/1 is the uplink to GW-SJC.

Claude report:
  24h unresolved triage — site-hq-sjc:
    1. Device/error · SW-CORE Gi0/1 port flap ×22 — prime suspect,
       same port that carries the GW-SJC uplink.
    2. Device/error · GW-SJC WAN latency ×12 — likely downstream of #1.
    3. Client/warning · blacklist storm ×19 — pivot to
       omada-wifi-troubleshoot; target MACs already captured in
       structuredContent.alerts.
    4. System/warning · NTP ×5 — low priority.
    5. Client/warning · roaming storm on AC-BD-… ×4 — pivot to
       omada-wifi-troubleshoot.
  Handoff: ticket via omada-support-assist; don't reboot SW-CORE
  without change-window approval (it's the aggregation layer).
```

## Notes

- `resolved=false` cuts the log in half early; the triage helper sees
  only the interesting subset.
- Two groups (`Device/SW-CORE` + `Device/GW-SJC`) clearly chain via
  the topology — call it out explicitly so the operator doesn't open
  two tickets.
- Client module groups get a pivot hint, not a device zoom.
