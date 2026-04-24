# Triage runbook checklist

Quick checklist for the alert-triage skill. Read-only; no write gate.

## Scope

- [ ] `omadacId` + `siteId` confirmed with the operator (copy-paste,
      not guessed).
- [ ] Time window fixed. Default 24h; widen only on request.
- [ ] Relative times converted to Unix ms _and_ echoed back as ISO
      strings so the operator can sanity-check timezone.

## Pull

- [ ] `omada_alerts_list` with `pageSize=100` and the operator's
      module / resolved filter (if any).
- [ ] If `totalRows > pageSize`, page once more to confirm the tail
      doesn't hide a different pattern.

## Group

- [ ] `omada_alerts_triage` with the **same window + same
      `omadacId`/`siteId`**. Mismatched windows produce misleading
      comparisons.
- [ ] Sort pre-verified: critical → error → warning → info → unknown.
- [ ] Top 3–5 groups picked for device zoom, not the full list.

## Zoom

- [ ] For each top device-scoped group, `omada_device_detail` with
      the right `kind` (ap/switch/gateway/stack).
- [ ] Gateway zoom uses `getGatewayInfo_1` behind the scenes — kind
      `gateway` still works, but double-check the response
      `errorCode` if a regenerated SDK removes the `_1` suffix.
- [ ] Skip zoom for client-module groups — pivot to
      `omada-wifi-troubleshoot`.

## Topology

- [ ] `omada_topology` once, `version="v3"`. If the result says
      "Topology for … is empty", retry with `version="v2"` on legacy
      sites before giving up.
- [ ] Cross-reference top-N device MACs against graph nodes to call
      out shared uplinks / aggregation points.

## Output

- [ ] Header line with site / window / totals.
- [ ] Top groups as a ranked bullet list.
- [ ] Device context sub-bullets only for the groups worth acting on.
- [ ] Explicit handoffs named, never taken: `omada_device_action`,
      `omada-support-assist`, `omada-wifi-troubleshoot`.
- [ ] No write tool invoked. No alert marked resolved.
