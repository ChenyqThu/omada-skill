---
name: omada-guest-portal-wizard
description: |
  TRIGGER when an SI operator wants to stand up a branded Omada
  captive portal (guest Wi-Fi splash page) end-to-end — collect
  requirements, assemble the PortalSetting payload, and run the
  two-phase handshake to create it via `addPortal`.
  TRIGGER for "spin up a guest Wi-Fi portal on site X with our
  corporate logo and terms" / "add a voucher-auth portal to the
  lounge SSID" / "roll out the same portal across these sites".
  TRIGGER when the request mentions `authType`, `portalSetting`,
  `voucher`, `landing page`, or references a brand book.
  SKIP for changes to an existing portal — edit via the controller
  UI or a future update-portal tool.
  SKIP for SSID-level changes that don't involve a portal — use
  `omada_apply_site_template` directly.
  SKIP for MSP-wide rollouts of new sites — use
  `omada-bulk-site-onboard`, then run this skill per site.
version: 0.1.0
tags: [omada, si, portal, captive, write, two-phase]
requires-mcp-server: omada-skill>=0.1
---

# Guest portal wizard (SI)

## Goal

Walk the operator through the `PortalSetting` payload: authentication
type, landing page, SSIDs bound, session lifetime, branding. Preview
the plan, get explicit confirmation, and call `addPortal` through the
two-phase helper. If the portal's configuration lives in a site
template, also bind that template via `omada_apply_site_template`.

## When to use

Positive triggers (3):

- "Spin up a guest Wi-Fi captive portal on `site-hq-sjc` with our
  logo and a 30-min session."
- "Create a voucher-auth portal on the lounge SSID for `site-042`."
- "Apply the `tmpl-guest-portal-v2` template to `site-042` and create
  the matching captive portal."

Negative triggers (3):

- "Change the splash page background colour on the existing portal."
  → existing portal = controller UI or future update-portal tool.
- "Onboard 40 new sites." → `omada-bulk-site-onboard`.
- "Why is the portal not loading for guests?" → that's a read-only
  troubleshoot, not this skill.

## Required MCP tools

| Tool                        | Phase   | Risk           | Used for                                   |
| --------------------------- | ------- | -------------- | ------------------------------------------ |
| `omada_portal_wizard`       | 2-phase | write · medium | Create the portal via `addPortal`.         |
| `omada_apply_site_template` | 2-phase | write · medium | Bind the site-template that references it. |

Both tools go through the same two-phase helper. Neither this skill
nor the tools delete or update an existing portal — both are
create-only.

## Workflow

1. **Interview the operator.** Collect the ten fields the
   `PortalSetting` VO cares about (see `RESOURCES.md`):
   `name`, `authType`, `ssids` / `ssidId`, `landingPageUrl`,
   `redirectUrl`, `rateLimit`, `sessionTimeout`,
   `landingUrl` / `landingUrlEnable`, branding fields (`logoUrl`,
   `backgroundImgUrl`, `primaryColor`). Don't guess defaults — a
   field left out becomes Omada's default and surprises the operator
   later.
2. **Assemble the `PortalSetting` VO locally.** Build one object that
   matches the Omada spec. Do not send a half-filled skeleton — the
   `portalSetting` input is passed verbatim to `addPortal`; missing
   required keys surface as `errorCode != 0` only in phase 2.
3. **(Optional) Apply the site-template first.** If the operator
   referenced a site-template (`tmpl-guest-portal-*`) that already
   encodes the SSID + VLAN + portal pointer, call
   `omada_apply_site_template` **first** with phase 1 / phase 2.
   Having the template bound before the portal is created avoids a
   window where the SSID exists without a portal pointer.
4. **Portal wizard — phase 1.** Call `omada_portal_wizard` with
   `omadacId`, `siteId`, and the assembled `portalSetting`. Omit
   `confirm_token`. The tool returns a preview like
   `Would create portal "guest-lounge" on site site-042
(authType=Voucher).` plus a fresh token.
5. **Portal wizard — phase 2.** Show the preview _and the full
   `plan.portalSetting` payload_ to the operator, not just the
   one-line preview. The payload is where mistakes hide (wrong SSID
   ID, typo'd terms URL). Once confirmed, re-invoke
   `omada_portal_wizard` with the same input + `confirm_token`.
6. **Validate the result.** On phase 2 success the tool returns
   `Created portal "…" on site …`. Capture the `structuredContent`
   for the audit handoff.
7. **Handoff.** Point the operator at the Omada UI's Portal page for
   visual validation (the tools don't render the splash page). If
   this is part of a bulk onboarding wave, hand back to
   [omada-bulk-site-onboard](../omada-bulk-site-onboard/SKILL.md).

## Two-phase handshake

Both tools use the same contract:

1. Omit `confirm_token` → receive `phase: "preview"`, a plan, and a
   `confirm_token`.
2. Show the preview _verbatim_.
3. Re-invoke with **identical input** + `confirm_token` → execution
   (`phase: "executed"`).

Any field drift between phases invalidates the token. The helper
rejects with a clear error; regenerate by dropping the token and
starting phase 1 again.

## Examples

- [examples/voucher-portal-single-site.md](examples/voucher-portal-single-site.md)
  — voucher-auth portal on one site, no template.
- [examples/branded-portal-with-template.md](examples/branded-portal-with-template.md)
  — branded portal backed by a shared site-template.

## Pitfalls

- **`portalSetting` is pass-through.** The tool does not validate the
  VO beyond "is it a record". Every required key and constraint is
  enforced by `addPortal`. Always read the controller's OpenAPI
  reference for the current required fields before running phase 1.
- **`authType` strings vary by controller version.** Valid values
  include `None`, `Voucher`, `Local`, `Radius`, `Facebook`,
  `External` (per `RESOURCES.md`). Old controllers accept only a
  subset — verify on staging before production.
- **SSID references are site-scoped.** The `ssidIds` inside the VO
  are site-local. Copy-pasting a portal payload across sites without
  re-binding SSIDs creates a portal attached to nothing.
- **`OMADA_MCP_CONFIRM_SECRET` required.** Like every write tool,
  the portal wizard refuses to run without a ≥16-char secret.
- **There is no "update" path.** Running this skill twice against the
  same site name can create a second portal; it does not replace the
  first. Use the Omada UI to delete / update.
- **Templates first, portals second.** If you call the portal tool
  before binding the site-template, the template may later overwrite
  the SSID → portal mapping when the operator eventually binds it.
