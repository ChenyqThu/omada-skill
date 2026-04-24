# Resources — alert-triage

## Alert modules

| Module   | Typical content                                     | Typical target     |
| -------- | --------------------------------------------------- | ------------------ |
| `System` | Controller-wide events: license, reachability, NTP. | controller / site  |
| `Device` | AP / switch / gateway failures, firmware, uplink.   | `deviceMac` / name |
| `Client` | Auth failures, roaming, blacklists.                 | `clientMac`        |

The skill's grouping key is `module|severity|target`. Same module +
same severity against the same device collapses to one row.

## Severity vocabulary (observed)

Omada emits any of these in `severity` / `level` — the triage helper
normalises to the first column:

| Normalised | Seen on the wire                  |
| ---------- | --------------------------------- |
| critical   | `Critical`, `CRITICAL`            |
| error      | `Error`, `High`, `HIGH`           |
| warning    | `Warning`, `Warn`, `Medium`       |
| info       | `Info`, `Notice`, `Low`           |
| unknown    | `Unknown`, missing, other strings |

`omada_alerts_triage` sorts in that order. "unknown" buckets should
always be read — they often contain new alert types the controller
hasn't mapped yet.

## Time-window conversion

`omada_alerts_list` / `omada_alerts_triage` expect Unix milliseconds
(`timeStart` / `timeEnd`). Convenience values:

```
24h = 24 * 60 * 60 * 1000 = 86_400_000
7d  = 604_800_000
30d = 2_592_000_000
```

Convert "last shift" / "yesterday morning" to explicit Unix ms before
the tool call; the skill should echo the resolved ISO string back to
the operator so they can spot off-by-one mistakes (UTC vs local).

## `omada_device_detail` kind routing

| Kind      | Endpoint            | ID expected                  |
| --------- | ------------------- | ---------------------------- |
| `ap`      | `getOverviewDetail` | AP MAC (AA-BB-CC-DD-EE-FF)   |
| `switch`  | `getSwitchInfo`     | Switch MAC                   |
| `gateway` | `getGatewayInfo_1`  | Gateway MAC (see M3 HANDOFF) |
| `stack`   | `getOswStackDetail` | `stackId` (not a MAC)        |

Mis-selecting `kind` returns the controller's normal "permission
denied" or "not found" error through the guardrails wrapper — no
silent substitution.

## Typical alert patterns

- **Repeat uplink flap on an AP** — `Device/critical` group with
  `deviceMac` constant, `count` growing. Pair with
  `omada_topology` to see whether the uplink switch is itself
  flapping.
- **Client blacklist spike** — `Client/warning` groups against
  multiple MACs from the same SSID. Usually a bad PSK rotation;
  confirm with `omada_audit_logs` (via `omada-support-assist`).
- **System license expiring** — `System/warning` on `site-entity` /
  site name. Not device-scoped; skip `omada_device_detail`.

## Related skills

- [omada-wifi-troubleshoot](../omada-wifi-troubleshoot/SKILL.md) —
  once a client-module group surfaces.
- [omada-support-assist](../omada-support-assist/SKILL.md) — once the
  operator wants to cut a ticket / attach audit evidence.
