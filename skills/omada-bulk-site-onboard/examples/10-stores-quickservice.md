# Example — 10-store quick-service retail rollout

Single controller, single template, no per-switch bindings. The
smallest realistic shape of this skill. Times are illustrative.

## Scenario

- **Operator**: MSP onboarding engineer.
- **MSP**: `msp-acme`, single customer `oc-acme-retail`.
- **Goal**: bring 10 new store locations online under
  `site-template-quickservice` with guest + staff SSIDs from the
  corporate template. Backups already uploaded to
  `sftp://backups.msp.local:22/acme/stores/`.

## Transcript

```
User:  Onboard these 10 stores under oc-acme-retail using
       site-template-quickservice. Backups are on backups.msp.local
       under /acme/stores/, one `.cfg` per store. Don't bind per-switch
       templates.

Claude:
  [calls omada_discover_scope { omadacId: "oc-acme-retail" }]
  Scope confirmed — single-tenant controller oc-acme-retail.

  [calls omada_list_sites { omadacId: "oc-acme-retail", pageSize: 500 }]
  Controller currently manages 3 site(s). The 10 stores are all new.

  Phase 1 — previewing bulk import.
  [calls omada_bulk_onboard {
     omadacId: "oc-acme-retail",
     fileServerConfig: { protocol: "SFTP", hostname: "backups.msp.local",
                         port: 22, username: "omada-bot", password: "***" },
     siteImportConfigList: [
       { siteName: "QS-01", filePath: "/acme/stores/qs-01.cfg" },
       … (9 more entries)
     ],
  }]
  Response:
    phase=preview
    Would import 10 site(s) from SFTP://backups.msp.local:22:
      • QS-01 ← /acme/stores/qs-01.cfg
      • QS-02 ← /acme/stores/qs-02.cfg
      … 8 more sites
    confirm_token=83f1c0…7a2

  Please confirm to proceed.

User:  confirmed

Claude:
  Phase 2 — executing.
  [calls omada_bulk_onboard {same input}, confirm_token: "83f1c0…7a2"]
  Response:
    phase=executed
    Submitted 10 site import(s) on controller oc-acme-retail.

  [calls omada_list_sites { omadacId: "oc-acme-retail", pageSize: 500 }]
  Confirmed — 13 sites now under oc-acme-retail (10 new).
  Collecting their siteIds for the template step: site-0f1 … site-0fa.

  Phase 1 — previewing site-template bindings (10 preview tokens).
  [calls omada_apply_site_template × 10, no confirm_token]
  Each returns a phase=preview with its own token.
  Summary:
    • QS-01 (site-0f1) ← tmpl-quickservice · no per-switch bindings
    … (9 more)

  Please confirm to bind the template to all 10 sites.

User:  go

Claude:
  Phase 2 — executing 10 bindings.
  [calls omada_apply_site_template × 10 with per-site tokens]
    9 of 10 succeeded (phase=executed).
    1 failed: QS-07 → errorCode=-44210 msg="siteTemplateId not found".

  Handoff: QS-07 needs the template to be present on this controller
  before retry. All other stores are fully onboarded; omada_audit_logs
  entries are available under oc-acme-retail for the last 15 minutes.
```

## Notes

- Every `omada_apply_site_template` call used its own confirm token;
  tokens are plan-scoped.
- `QS-07` failed because the template was only published in a sibling
  customer — a preflight-checklist item that should have been caught
  at step 3. We still proceed with the other 9 rather than abort.
- Total wall-clock: ~40 s for imports, ~90 s for template binding on
  a warm controller.
