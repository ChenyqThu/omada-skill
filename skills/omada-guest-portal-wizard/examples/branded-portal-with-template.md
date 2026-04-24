# Example — branded portal backed by a site-template

Site-template drives the SSID + VLAN config; this skill creates the
matching captive portal after the template is bound.

## Scenario

- **Operator**: SI solution architect.
- **Site**: `oc-globex:site-store-09` (retail store).
- **Goal**: apply `tmpl-retail-guest-v2` (which defines the
  `retail-guest` SSID + VLAN 305) and stand up the branded captive
  portal that the template expects.

## Transcript (abridged)

```
User:  Apply tmpl-retail-guest-v2 to site-store-09 on oc-globex, then
       create the branded guest portal per our brand book.

Claude:
  Two writes today. Both go through the two-phase handshake.

  Step A — omada_apply_site_template phase 1.
  [calls omada_apply_site_template { omadacId:"oc-globex",
                                     siteTemplateId:"tmpl-retail-guest-v2",
                                     siteId:"site-store-09" }]
  → phase=preview
    Would bind site-template tmpl-retail-guest-v2 to site
    site-store-09 · no per-switch bindings.
    confirm_token=aaa…111

User:  confirm A

Claude:
  Step A — phase 2.
  [calls omada_apply_site_template { same, confirm_token:"aaa…111" }]
  → phase=executed
    Bound site-template tmpl-retail-guest-v2 → site site-store-09.

  Step B — assemble PortalSetting (branded, terms from brand book,
  no rate limit — store already has a per-SSID throttle on VLAN 305).
  portalSetting =
    { name:"store-guest", authType:"Local",
      ssidIds:["ssid-site-store-09-retail-guest"],
      sessionTimeout:60,
      landingUrlEnable:true,
      landingUrl:"https://globex.example/welcome",
      logoUrl:"https://cdn.globex.example/brand/logo-v4.svg",
      backgroundImgUrl:"https://cdn.globex.example/brand/bg-hero.jpg",
      primaryColor:"#c62828",
      termsOfService:"https://globex.example/legal/store-wifi" }

  Step B — omada_portal_wizard phase 1.
  → phase=preview
    Would create portal "store-guest" on site site-store-09
    (authType=Local).
    confirm_token=bbb…222

User:  confirm B

Claude:
  Step B — phase 2.
  [calls omada_portal_wizard { same, confirm_token:"bbb…222" }]
  → phase=executed
    Created portal "store-guest" on site site-store-09.

  Handoff:
    • Visually confirm the branded splash in the Omada UI.
    • Record operator + tokens in omada_audit_logs via
      omada-support-assist if compliance needs an evidence trail.
```

## Notes

- Order matters: template first, portal second. The template
  defines the SSID `ssid-site-store-09-retail-guest`; creating the
  portal before the template is bound would mean attaching to an
  SSID that may not exist yet.
- Two independent confirm tokens — plans are fingerprinted
  separately, and showing the operator each preview prevents
  cross-wiring.
- No rollback: if Step B fails after Step A, the template stays
  bound. That's fine in practice (template only changes the SSID /
  VLAN on a brand-new site) but worth flagging in the operator's
  runbook.
