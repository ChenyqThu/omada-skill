# Portal preflight

Run before `omada_portal_wizard` phase 1.

## Identity + scope

- [ ] `omadacId` confirmed.
- [ ] `siteId` confirmed (not guessed from site name).
- [ ] Existing portals on the site inspected via Omada UI (this skill
      does not list / update / delete).

## Payload

- [ ] `name` chosen — does not collide with an existing portal on
      the same site.
- [ ] `authType` decided AND known to be supported on this
      controller version (`None`/`Voucher`/`Local`/`Radius`/`Facebook`
      /`External`).
- [ ] `ssidIds` resolved to the site-scoped IDs (not SSID names).
- [ ] Branding URLs are HTTPS, reachable from the guest VLAN, and
      owned by the operator.
- [ ] For voucher auth: `voucherPool.poolId` exists; duration matches
      `sessionTimeout`.
- [ ] For Radius auth: Radius profile pre-configured on the
      controller with a valid shared secret.
- [ ] Terms-of-service reference fits the controller's field type
      (some versions reject long strings).

## Ordering

- [ ] If a site-template encodes this portal's SSID / VLAN, bind the
      template first via `omada_apply_site_template`.
- [ ] If the portal must exist before the template, flag the
      create-then-bind race to the operator explicitly — they own the
      decision.

## Write-safety

- [ ] `OMADA_MCP_CONFIRM_SECRET` exported (≥16 chars).
- [ ] Staging run on `OMADA_DRY_RUN=1` completed for any new
      template / portal shape.
- [ ] Operator read the full `plan.portalSetting` payload before
      confirming phase 2 — not just the one-line preview.
- [ ] Rollback path documented (delete portal via Omada UI).
