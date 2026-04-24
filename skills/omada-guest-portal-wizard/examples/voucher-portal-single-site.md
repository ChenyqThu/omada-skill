# Example — voucher-auth portal, single site

Simplest real shape: one site, no template, voucher auth.

## Scenario

- **Operator**: SI field engineer.
- **Site**: `oc-acme:site-lounge`, new conference centre.
- **Goal**: captive portal on the existing `guest-lounge` SSID with
  voucher auth, 120-min sessions, Acme branding.

## Transcript

```
User:  Stand up a voucher-auth guest portal on oc-acme:site-lounge.
       SSID name is "guest-lounge", pool is vp-weekly, 120 min
       sessions. Use the Acme logo + #0f5cff.

Claude:
  I need the site-scoped SSID ID for "guest-lounge" — M3's tool
  surface doesn't list SSIDs directly. Options:
    (a) You paste the SSID ID from the controller UI.
    (b) I call omada_script { operationId: "listSsids" } to fetch it.

User:  Use (b).

Claude:
  [calls omada_script { operationId:"listSsids", path:{ omadacId:"oc-acme",
                       siteId:"site-lounge" } }]
  → 3 SSIDs on site-lounge. "guest-lounge" → ssid-site-lounge-guest.

  Assembled PortalSetting:
    { name:"guest-lounge", authType:"Voucher",
      ssidIds:["ssid-site-lounge-guest"], sessionTimeout:120,
      logoUrl:"https://cdn.acme.com/logos/acme.svg",
      primaryColor:"#0f5cff",
      termsOfService:"https://cdn.acme.com/legal/wifi-tos.txt",
      voucherPool:{ poolId:"vp-weekly", durationMinutes:120 } }

  Phase 1 — previewing.
  [calls omada_portal_wizard { omadacId, siteId, portalSetting }]
  → phase=preview
    Would create portal "guest-lounge" on site site-lounge
    (authType=Voucher).
    confirm_token=a4c…9f1

  Please review the full portalSetting above before confirming.

User:  confirm

Claude:
  Phase 2 — executing.
  [calls omada_portal_wizard { same, confirm_token:"a4c…9f1" }]
  → phase=executed
    Created portal "guest-lounge" on site site-lounge.

  Handoff:
    • Visually check the splash page in the Omada UI (Portal tab).
    • If auth fails in production, pivot to omada-support-assist to
      pull audit logs + device detail.
```

## Notes

- The SSID-ID lookup used `omada_script`. That's a known M3 rough
  edge (no dedicated SSID-list tool yet) — document it per site.
- `sessionTimeout=120` matches `voucherPool.durationMinutes`;
  mismatches look like silent logouts to guests.
- Two-phase handshake ran cleanly because the operator didn't edit
  any field between phases. Any edit invalidates the token.
