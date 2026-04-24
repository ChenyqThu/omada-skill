# Ticket evidence checklist

## Window

- [ ] `omadacId` + `siteId` confirmed (never guessed from a name).
- [ ] `timeStart` + `timeEnd` captured as Unix ms; echoed back as
      ISO strings.
- [ ] Window chosen with the operator — refuse vague phrases like
      "the incident window" without explicit timestamps.

## Pulls

- [ ] `omada_site_overview` — one line of identity context.
- [ ] `omada_alerts_list` with the window + any module / resolved
      filter the operator asked for.
- [ ] `omada_audit_logs` with the same window + `searchKey` if the
      scope is obvious (e.g. `wireless`, `portal`, `device`).
- [ ] `omada_device_detail` only when a device is named.

## Correlation

- [ ] Alerts clustered by timestamp / module / target before writing
      the ticket.
- [ ] Audit entries that precede an alert spike by ≤5 min flagged as
      "possible correlation". No causal claims.
- [ ] Revert / remediation audit entries after the spike called out —
      they bound the incident.

## Output

- [ ] Markdown ticket follows the `RESOURCES.md` template (Summary ·
      Site · Alerts · Audit · Device · Handoffs · IDs).
- [ ] IDs & tokens section lists `omadacId`, `siteId`, MAC(s), and a
      path hint for the JSONL audit artefact.
- [ ] Suggested hand-offs reference the matching write skill by name
      (never executed here).

## Hand-off

- [ ] Operator knows the ticket is a _draft_, not a ready-to-close
      investigation.
- [ ] If the operator wants to act (reboot / firmware / portal),
      the next skill is named explicitly and the ticket is attached.
