# Preflight — bulk-site-onboard

Run this **before** the first `omada_bulk_onboard` phase-1 call. All
items are cheap (mostly read-only). If any fails, stop and surface the
list to the operator — the two-phase write tools won't save you from
conflicting plans.

## Scope

- [ ] MSP vs single-tenant mode decided. `mspId` OR `omadacId` set,
      never both.
- [ ] Target controller(s) resolved via `omada_discover_scope`. Every
      subsequent step references the exact `omadacId`.
- [ ] Operator has provided the target site list (names + backup file
      paths + optional per-switch MACs). No implicit "same as last time".

## File server

- [ ] `fileServerConfig` complete: protocol + hostname + port supplied.
- [ ] For FTP / SFTP / SCP: `username` + `password` supplied (or the
      controller is configured for anonymous).
- [ ] For TFTP: `username`/`password` **omitted** (TFTP has no auth).
- [ ] Backup files named consistently; one `.cfg` per target site.
- [ ] Controller can reach the file server (operator vouches or tests
      with a single-site import first).

## Existing inventory

- [ ] `omada_list_sites` run for every controller in scope. Delta
      between operator list and existing sites resolved.
- [ ] No duplicate site names between imports and existing inventory
      (Omada error `-44111`).
- [ ] For sites that already exist, the plan is "bind template" not
      "import again" — use `omada_apply_site_template`, not
      `omada_bulk_onboard`.

## Networking hygiene

- [ ] VLANs in the template are not already reserved for another
      service on the target sites.
- [ ] SSIDs in the template don't clash with existing wireless
      configs.
- [ ] DHCP scopes don't overlap between sites that share an uplink.
- [ ] Controller clock / NTP source sane (look at
      `omada_audit_logs` for recent drift).

## Write-safety

- [ ] `OMADA_MCP_CONFIRM_SECRET` exported on the MCP server (≥16
      chars). Writes silently refuse otherwise.
- [ ] `OMADA_AUDIT_DIR` set so the JSONL audit sink captures every
      preview + execution.
- [ ] Shard large rollouts: 25 → 100 → 300 sites per wave. Never feed
      `omada_bulk_onboard` its full 300-site cap in one shot.
- [ ] Operator has a rollback story (delete via site UI, or the
      corresponding Omada delete tool once available). None of the M3
      tools auto-rollback.

## Sign-off

- [ ] Operator has read the preview string verbatim before phase 2.
- [ ] Confirm tokens stored per step — never reused across plans.
- [ ] A dry-run (`OMADA_DRY_RUN=1`) has been done on a staging
      controller for any never-seen-before template.
