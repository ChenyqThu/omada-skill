# Example — "who changed what, and what broke"

## Scenario

- **Operator**: internal support investigating a config regression.
- **Site**: `oc-acme:site-branch-09`.
- **Window**: yesterday, full day (2026-04-22T00:00Z → 2026-04-23T00:00Z).
- **Question**: "Who changed the SSID config, and did it correlate
  with any client drops?"

## Transcript

```
User:  Who changed the SSID config on oc-acme:site-branch-09 yesterday,
       and did any clients drop afterwards?

Claude:
  Window locked: 2026-04-22T00:00Z → 2026-04-23T00:00Z.

  [calls omada_site_overview { omadacId:"oc-acme", siteId:"site-branch-09" }]
  Site Branch-09 · USA · Office — Devices: total=14 connected=14
  APs=6 Switches=3 Gateways=1 · Clients: total=110.

  [calls omada_audit_logs { … searchKey:"wireless" }]
  Found 3 audit entry(ies):
    • 2026-04-22T10:15Z · carol@acme (10.1.0.5) · wireless/modify
      — updated VLAN tag of SSID "branch-staff"
    • 2026-04-22T10:45Z · carol@acme · wireless/modify — reverted
    • 2026-04-22T15:02Z · dan@acme · wireless/create — new SSID
      "branch-vpn" on VLAN 720

  [calls omada_alerts_list { … module:"Client" }]
  Found 27 alert(s) — Client module:
    • 10:17Z · Client · AC-BD-…-01 — DHCP timeout
    • 10:18Z · Client · AC-BD-…-02 — auth failure
    … 25 more between 10:17Z and 10:44Z
    (no Client alerts after the revert at 10:45Z)

  No device-module alerts in the window.

Claude draft:
  # Incident — site-branch-09 · 2026-04-22T00:00Z–2026-04-23T00:00Z

  ## Summary
  27 client-side alerts clustered between 10:17Z and 10:44Z on
  2026-04-22, tightly bracketed by an SSID VLAN change + revert by
  carol@acme. No device-side alerts. Tail (after 10:45Z) clean.

  ## Site context
  Site Branch-09 · USA · Office — Devices: total=14 connected=14
  APs=6 Switches=3 Gateways=1 · Clients: total=110.

  ## Alerts in window
  27 Client-module alerts — DHCP timeout / auth failure against
  AC-BD-…-01 … AC-BD-…-27. Earliest 10:17Z, latest 10:44Z.

  ## Audit activity
  • 10:15Z · carol@acme (10.1.0.5) · wireless/modify — updated VLAN
    tag of SSID "branch-staff"         ↑ possible correlation:
    alert spike starts 2 min later.
  • 10:45Z · carol@acme · wireless/modify — reverted
                                         ↑ possible correlation:
    alert spike stops immediately after.
  • 15:02Z · dan@acme · wireless/create — unrelated new SSID.

  ## Suggested hand-offs (not executed here)
  - Post-mortem conversation with carol@acme on change-control.
  - No device reboot needed — clients healed on their own after
    revert.

  ## IDs & evidence
  - omadacId: oc-acme
  - siteId:   site-branch-09
  - Audit trail: $OMADA_AUDIT_DIR/2026-04-22.jsonl
```

## Notes

- `searchKey:"wireless"` narrowed audit to the relevant module
  quickly — 3 entries instead of hundreds.
- `module:"Client"` on the alerts side matched the incident's blast
  radius. Device-module was explicitly _empty_; calling that out is
  part of the attribution.
- No `omada_device_detail` call — incident is SSID-scoped, no named
  device worth snapshotting.
