# Example — tier-1 outage ticket with audit attribution

## Scenario

- **Operator**: internal support tier-1 on shift.
- **Site**: `oc-msp:site-042`.
- **Window**: 2026-04-23T13:00Z → 2026-04-23T14:00Z.
- **Complaint from MSP**: store went dark for ~20 minutes around
  13:00. They want a ticket with evidence.

## Transcript (abridged)

```
User:  Draft a ticket for the outage at oc-msp:site-042 between
       13:00 and 14:00 UTC today.

Claude:
  Window locked: 2026-04-23T13:00Z → 2026-04-23T14:00Z.

  [calls omada_site_overview { omadacId:"oc-msp", siteId:"site-042" }]
  Site Store-42 (site-042) · USA · Retail
    Devices: total=9 connected=8 disconnected=1
      APs=4 · Switches=1 · Gateways=1
    Clients: total=83 wireless=71 wired=12 guests=0
    Alerts: deviceAlertsTotal=1

  [calls omada_alerts_list { omadacId, siteId, timeStart, timeEnd,
                             pageSize:100 }]
  Found 34 alert(s) in site-042 from … to …:
    • [critical] 13:02Z · Device · AP-Storefront — Device disconnected
    • [critical] 13:02Z · Device · AP-Stockroom  — Device disconnected
    …

  [calls omada_audit_logs { omadacId, siteId, timeStart:13:00Z-30m,
                            timeEnd:14:00Z, pageSize:100 }]
  Found 4 audit entry(ies) in site-042 …:
    • 12:58Z · alice@msp (203.0.113.7) · wireless/modify
      — updated radio band of SSID "store-guest"
    • 13:20Z · alice@msp · wireless/modify — reverted radio change
    • 13:45Z · bob@support · device/reboot — rebooted AP-Storefront
    • 13:55Z · bob@support · device/reboot — rebooted AP-Stockroom

  Device mentioned in 22 of 34 alerts is AP-Storefront.
  [calls omada_device_detail { kind:"ap", id:"AA-BB-CC-DD-EE-10" }]
  ap AP-Storefront (AA-BB-CC-DD-EE-10) · EAP670 · fw 1.6.10 · 10.0.42.11
    uptime=00:24:03 · cpu=11% · mem=48% · clients=0

Claude draft:
  # Incident — site-042 · 2026-04-23T13:00Z–14:00Z

  ## Summary
  Two APs at Store-42 went offline for ~20 min starting 13:02 UTC,
  correlated with a wireless-config change by alice@msp at 12:58.
  The change was reverted at 13:20, and AP-Storefront + AP-Stockroom
  were rebooted by bob@support at 13:45 / 13:55. Current state:
  AP-Stockroom still disconnected.

  ## Site context
  Site Store-42 (site-042) · USA · Retail — Devices: total=9
  connected=8 disconnected=1 APs=4 Switches=1 Gateways=1 · Clients:
  total=83 wireless=71 wired=12.

  ## Alerts in window
  … top 20 bullets from omada_alerts_list …

  ## Audit activity
  • 12:58Z · alice@msp (203.0.113.7) · wireless/modify — updated
    radio band of SSID "store-guest"   ↑ possible correlation:
    alert spike starts at 13:02.
  • 13:20Z · alice@msp · wireless/modify — reverted radio change
  • 13:45Z · bob@support · device/reboot — rebooted AP-Storefront
  • 13:55Z · bob@support · device/reboot — rebooted AP-Stockroom

  ## Device context
  ap AP-Storefront (AA-BB-CC-DD-EE-10) · EAP670 · fw 1.6.10 ·
  10.0.42.11 — uptime 24 min, cpu=11%, mem=48%, clients=0.
  AP-Stockroom still disconnected at 14:00Z.

  ## Suggested hand-offs (not executed here)
  - Investigate AP-Stockroom specifically; reboot if needed via
    omada_device_action (HIGH-RISK).
  - If wireless-config regressions recur, tighten change-window
    policy — not a tooling fix.

  ## IDs & evidence
  - omadacId: oc-msp
  - siteId:   site-042
  - MAC(s):   AA-BB-CC-DD-EE-10, AA-BB-CC-DD-EE-11
  - Audit trail: $OMADA_AUDIT_DIR/2026-04-23.jsonl
```

## Notes

- The skill never claims "alice caused this"; it says "possible
  correlation" and lists the audit entry. Attribution is the
  operator's call.
- AP-Stockroom is still disconnected — called out, not fixed. Hand-
  off explicitly references `omada_device_action`.
