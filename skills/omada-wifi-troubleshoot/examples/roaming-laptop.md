# Example — roaming laptop ping-ponging between APs

## Scenario

- **Operator**: SI helping a hybrid-work customer.
- **Site**: `oc-acme:site-office-b2`.
- **Complaint**: "One laptop (`AC-BD-71-EF-01-02`) keeps dropping in
  the meeting room. Everyone else is fine."

## Transcript (abridged)

```
User:  Troubleshoot client AC-BD-71-EF-01-02 on oc-acme:site-office-b2
       — it keeps dropping in the meeting rooms.

Claude:
  [calls omada_wifi_diagnose { omadacId:"oc-acme", siteId:"site-office-b2" }]
  Summary: APs=6 · wireless=84 · retry=5% · drop=0.3% · airtime=34%
  Wi-Fi health: healthy=5 · subHealth=1 · unhealthy=0
  Client health: poorSignal=2 · unhealthy=0 · subHealth=4

  Site-wide signals look mostly healthy. Client health reports 2 poor-
  signal clients — likely this laptop is one of them. Zooming.

  [calls omada_client_journey { clientMac:"AC-BD-71-EF-01-02",
                                omadacId, siteId, includeDetail:true }]
  Client Macbook-Dana (AC-BD-71-EF-01-02) · 10.40.7.122
    now: ssid=acme-staff · ap=AP-B2-MeetingEast · signal=-71dBm
    Journey: 18 event(s)
      2026-04-23T13:12Z · roam   @ AP-B2-MeetingEast ssid=acme-staff
      2026-04-23T13:11Z · roam   @ AP-B2-MeetingWest ssid=acme-staff
      2026-04-23T13:11Z · roam   @ AP-B2-MeetingEast ssid=acme-staff
      2026-04-23T13:10Z · roam   @ AP-B2-MeetingWest ssid=acme-staff
      … 14 more

  4 roams in 2 minutes between MeetingEast and MeetingWest — classic
  ping-pong. Checking MeetingEast utilisation.

  [calls omada_device_detail { kind:"ap", id:<MeetingEast MAC>, … }]
  ap AP-B2-MeetingEast — fw 5.1.6 · cpu=14% · mem=43% · clients=27
  [calls omada_device_detail { kind:"ap", id:<MeetingWest MAC>, … }]
  ap AP-B2-MeetingWest — fw 5.1.6 · cpu=13% · mem=40% · clients=22

Claude verdict:
  Symptom       Client roams 4× / 2 min between MeetingEast /
                MeetingWest; signal -71 dBm.
  Likely cause  Overlapping coverage with identical channel +
                client's minimum-RSSI threshold too forgiving.
  Evidence      omada_client_journey + omada_device_detail.
  Next step     Manual: raise min-RSSI on both APs or re-plan
                channels; neither AP is overloaded so a reboot
                won't help.
  Not taken     omada_device_action — would disconnect all 49
                clients on those APs, unjustified.
```

## Notes

- The skill does not recommend a reboot even though the two APs are
  the obvious targets — overloaded APs would show high CPU or
  retry, and neither does.
- `omada_wifi_diagnose` surfaced `Client health · poorSignal=2` first,
  which justified the client-journey zoom.
