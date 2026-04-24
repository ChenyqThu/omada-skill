# Example — MSP-wide two-controller rollout

Bigger shape: two controllers, per-switch bindings, and one composite
follow-up via `omada_batch_change`.

## Scenario

- **Operator**: MSP deployment lead.
- **MSP**: `msp-globex`.
- **Goal**: onboard 40 new franchise locations split across two
  controllers (`oc-globex-us` with 25, `oc-globex-eu` with 15). Each
  site needs the shared `tmpl-franchise-v4` bound, plus a per-switch
  `tmpl-sw-24p` for the main closet switch and `tmpl-sw-8p` for the
  mezzanine switch. After the rollout, rename one legacy site via
  `omada_batch_change` because it needs to line up with the new naming
  convention.

## Transcript (abridged)

```
User:  Roll out tmpl-franchise-v4 across msp-globex. 25 US + 15 EU,
       plus the switch-template bindings from our runbook. After, can
       you also rename site-legacy-09 to site-franchise-09 on the US
       controller in the same run?

Claude:
  [calls omada_discover_scope { mspId: "msp-globex", pageSize: 500 }]
  MSP manages 2 customer(s) — oc-globex-us, oc-globex-eu.

  [calls omada_list_sites × 2]
  Inventory: oc-globex-us has 112 sites (25 new pending), oc-globex-eu
  has 48 sites (15 new pending). No name collisions in either bucket.

  Preflight (checklists/preflight.md):
    ✓ Backup file server reachable from both controllers.
    ✓ VLAN 201/202 not already in use on target sites.
    ✓ SSIDs "globex-staff"/"globex-guest" not duplicated.
    ✓ site-legacy-09 exists on oc-globex-us.
  All checks pass.

  Phase 1 — omada_bulk_onboard × 2 (one per controller, 25 + 15 sites).
  [tokens tok-us-bulk / tok-eu-bulk returned]

User:  confirm both

Claude:
  Phase 2 — executing both.
  → US import: phase=executed, 25/25 succeeded.
  → EU import: phase=executed, 15/15 succeeded.

  Phase 1 — omada_apply_site_template × 40 with per-switch bindings.
  Example preview for first site:
    siteTemplateId=tmpl-franchise-v4 → site-us-041
    switches:
      • AA-BB-CC-DD-01-01 → tmpl-sw-24p
      • AA-BB-CC-DD-01-02 → tmpl-sw-8p

User:  go

Claude:
  Executing 40 bindings. 40/40 succeeded.

  Phase 1 — omada_batch_change for the rename
  [HIGH-RISK, severity=high, 1 action].
  Action 1: PATCH /openapi/v1/{omadacId}/sites/{siteId}
            body: {"name":"site-franchise-09"}
  confirm_token=…

User:  confirm

Claude:
  Batch of 1 action(s) completed with 1 response(s).
  All 40 new sites + 1 rename applied. Audit entries:
    • oc-globex-us: 25 imports + 25 bindings + 1 rename.
    • oc-globex-eu: 15 imports + 15 bindings.
  Hand-off: suggest omada-guest-portal-wizard next if the operator
  wants the captive portal on all 40 sites.
```

## Notes

- `omada_batch_change` for the single rename is overkill — a dedicated
  rename tool would be safer. We use `/batch` here only because it
  keeps the rollout + rename in the same confirm-token workflow the
  operator already approved, _and_ it ends up in the audit log as a
  single operator-initiated change.
- Per-switch bindings live inside `omada_apply_site_template`, not
  `omada_batch_change` — keeping them in the primary template tool
  means the preview string clearly says "2 per-switch device-template
  binding(s)" for each site.
- Wall-clock: ~3 min for 40 imports, ~6 min for 40 bindings on a warm
  dual-controller setup.
