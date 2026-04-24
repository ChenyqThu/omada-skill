# Example — device alert storm

Two APs repeatedly drop in a single site; the raw log has 60+ entries,
but triage collapses them to two actionable groups.

## Scenario

- **Operator**: NOC engineer on shift.
- **Site**: `oc-retail:site-212` (downtown store).
- **Complaint**: "Red banner on the dashboard for 45 min. Alerts
  module says 60+ critical events but it's hard to tell which AP is
  the problem."

## Transcript

```
User:  Triage last 2h of alerts for oc-retail:site-212.

Claude:
  Window: 2026-04-23T18:00Z → 2026-04-23T20:00Z.
  [calls omada_alerts_list { omadacId:"oc-retail", siteId:"site-212",
                             timeStart:…, timeEnd:…, pageSize:100 }]
  → 62 alerts on page 1 (62 total — fits in one page).

  [calls omada_alerts_triage { same window }]
  → Triaged 62 alert(s) in site-212 → 3 distinct issue(s):
    • [critical] Device · AP-Storefront ×41
       (unresolved=41, last=2026-04-23T19:58Z)
       "Device disconnected"
    • [critical] Device · AP-Stockroom ×18
       (unresolved=18, last=2026-04-23T19:54Z)
       "Device disconnected"
    • [warning] System · site-212 ×3
       (unresolved=0, last=2026-04-23T18:10Z)
       "NTP sync delayed"

  Top-2 groups are device-scoped. Zooming.

  [calls omada_device_detail { kind:"ap", id:"AA-BB-CC-DD-EE-10", … }]
  ap AP-Storefront (AA-BB-CC-DD-EE-10) · EAP670 · fw 1.6.10 · 10.0.212.11
    uptime=00:07:12 · cpu=19% · mem=47% · clients=0

  [calls omada_device_detail { kind:"ap", id:"AA-BB-CC-DD-EE-11", … }]
  ap AP-Stockroom (AA-BB-CC-DD-EE-11) · EAP670 · fw 1.6.10 · 10.0.212.12
    uptime=00:09:45 · cpu=16% · mem=43% · clients=0

  [calls omada_topology { siteId:"site-212", version:"v3" }]
  Site site-212 topology (v3): 12 node(s), 15 edge(s)
    ap: 4  switch: 1  gateway: 1  client: 6

  Both APs uplink to switch SW-212 (single-hop).

Claude report:
  Triage for site-212 (2h window, 62 alerts → 3 groups):
    1. [critical] AP-Storefront (AA-BB-CC-DD-EE-10) — disconnected ×41
         fw 1.6.10, uptime only 7 min, clients=0 — flapping, not
         cleanly offline.
    2. [critical] AP-Stockroom  (AA-BB-CC-DD-EE-11) — disconnected ×18
         fw 1.6.10, uptime 9 min, clients=0 — flapping, same pattern.
    3. [warning] System/NTP sync delayed ×3 (resolved).
  Both impacted APs uplink to SW-212 on the same switch. Likely
  shared-uplink / PoE / STP event.

  Suggested next steps (not taken by this skill):
    • Inspect SW-212 via omada_device_detail kind=switch.
    • If SW-212 looks fine, hand off to omada-support-assist to cut
      a ticket with audit-log context.
    • If the operator decides to reboot either AP, use
      omada_device_action — HIGH-RISK, two-phase.
```

## Notes

- The raw log had 62 entries. Triage produced 3 rows — a 20× noise
  reduction before the operator even reads.
- The shared uplink hint comes from `omada_topology`; without it the
  two AP flaps look like independent incidents.
- No write tool is invoked. Handing off to
  `omada-support-assist` / `omada_device_action` is explicit.
