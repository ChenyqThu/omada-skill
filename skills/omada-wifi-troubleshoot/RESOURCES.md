# Resources — wifi-troubleshoot

## Signal → hypothesis table

`omada_wifi_diagnose` returns three lines. Use this table to pick the
zoom path:

| Line                      | Threshold | Hypothesis                          | Next tool                  |
| ------------------------- | --------- | ----------------------------------- | -------------------------- |
| Summary · `retry`         | > 10 %    | Air congestion or interference.     | `omada_device_detail` (AP) |
| Summary · `airtime`       | > 70 %    | Channel saturation / bad DFS.       | `omada_device_detail` (AP) |
| Summary · `drop`          | > 2 %     | Client quality (device, placement). | `omada_client_journey`     |
| Wi-Fi health · unhealthy  | > 0       | Past / ongoing AP health incident.  | `omada-alert-triage`       |
| Client health · poor      | > 0       | Coverage / range / client NIC.      | `omada_client_journey`     |
| Client health · unhealthy | > 0       | Auth / DHCP / VLAN.                 | `omada-support-assist`     |

Thresholds are starting heuristics, not absolutes — the operator's
baseline for the site always wins.

## `omada_client_journey` read-outs

`journey` events typically carry one of:

- `action="connect"` — client associated; `ssid` + `apName` set.
- `action="disconnect"` — `reason` explains why (e.g. `inactive`,
  `low rssi`, `auth timeout`).
- `action="roam"` — moved between APs; `apName` is the _new_ AP.

"Ping-pong" is 3+ roams within 60 s between the same two APs —
usually min-RSSI thresholds too generous or overlapping coverage
with identical channels.

## `omada_device_detail kind="ap"` snapshot

Fields the skill actually reads:

- `cpuUtil` / `memUtil` — high + no clients = internal fault.
- `clients` — how many are attached right now.
- `radios[]` length — confirms dual/tri-band expectation.
- `firmwareVersion` — lag behind a known-good build hints at
  upgrade-first.

Ignore `ports*` fields for APs — they're only meaningful on
switches / gateways.

## Common prosumer scenarios

- **"TV keeps buffering after dinner"** — airtime spike on 5 GHz when
  the neighbourhood comes home. Summary airtime shoots past 70 %;
  AP cpu fine. Advise channel plan / DFS audit.
- **"Work laptop is unstable upstairs"** — `poorSignalTotal > 0` +
  journey shows ping-ponging between upstairs + hallway APs. Advise
  lower min-RSSI or better AP placement.
- **"Guest network works fine, my phone doesn't"** — single-client
  issue. Journey shows repeat disconnects with `reason="dhcp
timeout"`. Pivot to `omada-support-assist` for audit logs.

## Related skills

- [omada-alert-triage](../omada-alert-triage/SKILL.md) — for alert
  windows instead of live signals.
- [omada-support-assist](../omada-support-assist/SKILL.md) — if the
  operator wants a ticket with audit evidence.
