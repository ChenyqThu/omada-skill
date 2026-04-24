# Example — prosumer home, single AP, airtime spike

## Scenario

- **Operator**: prosumer homeowner.
- **Site**: `oc-home:site-apartment`.
- **Complaint**: "Wi-Fi got slow after 8 PM last night. One AP in the
  living room, twelve-ish devices."

## Transcript

```
User:  Wi-Fi at oc-home:site-apartment has been laggy every evening.
       Can you diagnose?

Claude:
  [calls omada_wifi_diagnose { omadacId:"oc-home", siteId:"site-apartment" }]
  Wi-Fi diagnosis for site site-apartment:
    Summary: APs=1 · wireless=12 · retry=14% · drop=0.4% · airtime=78%
    Wi-Fi health: healthy=0 · subHealth=1 · unhealthy=0
    Client health: poorSignal=0 · unhealthy=0 · subHealth=2

  Reading: retry (14%) and airtime (78%) both above the "zoom AP"
  thresholds. Clients look fine — poorSignal=0.

  Zooming the one AP.
  [calls omada_list_devices { omadacId:"oc-home", siteId:"site-apartment" }]
  AP Living-Room — mac=AA-BB-CC-DD-EE-01 · EAP225-v3 · connected.

  [calls omada_device_detail { kind:"ap", id:"AA-BB-CC-DD-EE-01",
                                omadacId, siteId }]
  ap Living-Room — fw 5.1.6 · uptime=12d · cpu=11% · mem=52%
    clients=12  Radios: 2

Claude verdict:
  Symptom       Retry 14%, airtime 78% — radio is saturated.
  Likely cause  Evening channel contention on 5 GHz (airtime >70%
                with healthy CPU, 12 clients on one radio).
  Evidence      omada_wifi_diagnose summary + omada_device_detail.
  Next step     Manual: audit 5 GHz channel plan, consider DFS
                channel or a second AP. No reboot needed — the AP
                itself is healthy.
  Not taken     omada_device_action (reboot) — would reset radios
                but won't fix channel saturation.
```

## Notes

- Two-tool path: `omada_wifi_diagnose` → `omada_device_detail`. No
  `omada_client_journey` needed because `poorSignal=0` — client
  quality isn't the issue.
- Total cost: 1 parallel site-wide call + 1 per-AP detail call.
