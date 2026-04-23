# MCP tool reference

`omada-mcp` registers a curated set of **intent-shaped** tools — not a
1:1 mirror of the 2,269 Omada operations. M1 ships a single seed tool;
the other 21 planned for M3 are listed at the bottom of this page as
a roadmap.

## `omada_list_sites`

|                       |                                                    |
| --------------------- | -------------------------------------------------- |
| **Since**             | M1 (0.1.0)                                         |
| **Kind**              | Read-only                                          |
| **Target user**       | All (MSP / SI / Prosumer / internal)               |
| **Backing operation** | `getSiteList` → `GET /openapi/v1/{omadacId}/sites` |

List sites under an Omada Controller. Returns a concise text summary
plus the raw pages in `structuredContent`.

### Input

| Field       | Type            | Default      | Notes                                                         |
| ----------- | --------------- | ------------ | ------------------------------------------------------------- |
| `omadacId`  | string, ≥1 char | — (required) | Controller ID. Find it on the controller's Cloud Access page. |
| `page`      | int ≥ 1         | `1`          | 1-indexed page number.                                        |
| `pageSize`  | int 1 – 500     | `50`         | Items per page.                                               |
| `searchKey` | string          | —            | Free-text filter matched on name / region / scenario.         |

### Success output

Text summary, e.g.:

```
Found 3 site(s) (page 1, 3 per page):
  • HQ — San Jose — siteId=site-001 · USA · Office
  • Store — Brooklyn — siteId=site-002 · USA · Retail
  • Store — Portland — siteId=site-003 · USA · Retail
```

…plus `structuredContent`:

```jsonc
{
  "totalRows": 3,
  "currentPage": 1,
  "currentSize": 3,
  "sites": [
    /* raw Omada site objects */
  ],
}
```

### Failure modes

- **Invalid input** — zod validation failure returns `isError: true`
  with a `• omadacId: Required` style message.
- **Omada `errorCode != 0`** — surfaced verbatim:
  `Omada API returned errorCode=-1001 msg=permission denied`.
- **Transport failure** — `OmadaTransientError` or `OmadaAuthError`
  bubbles up through the registry's catch and returns
  `Tool "omada_list_sites" failed: <message>`.

### Example Claude transcript

```
User: list my Omada sites for controller oc-abc.

Claude: [calls omada_list_sites {"omadacId":"oc-abc","page":1,"pageSize":50}]
        You have 3 sites:
         1. HQ — San Jose (site-001) — Office
         2. Store — Brooklyn (site-002) — Retail
         3. Store — Portland (site-003) — Retail
```

---

## Roadmap (M3)

The plan at `~/.claude/plans/omada-mcp-fizzy-owl.md` details 22 intent
tools. Beyond the seed above:

| Name                        | Target        | Backing                                                |
| --------------------------- | ------------- | ------------------------------------------------------ |
| `omada_discover_scope`      | All           | MSP/customer hierarchy preflight                       |
| `omada_site_overview`       | Prosumer / SI | Dashboard + Health                                     |
| `omada_list_devices`        | All           | AP / Switch / Gateway / Stack unified                  |
| `omada_device_detail`       | SI / Prosumer | Device + health + ports / radios                       |
| `omada_list_clients`        | All           | Client + Insight                                       |
| `omada_client_journey`      | Prosumer / SI | Client history + roaming                               |
| `omada_alerts_list`         | MSP / SI      | Insight / Service alerts                               |
| `omada_alerts_triage`       | MSP / SI      | Multi-endpoint root-cause merge                        |
| `omada_wifi_diagnose`       | Prosumer / SI | Fixed WiFi playbook                                    |
| `omada_topology`            | All           | Topology v2/v3 as an MCP App HTML                      |
| `omada_apply_site_template` | MSP / SI      | Template rollout (write)                               |
| `omada_bulk_onboard`        | MSP           | MSP + Site Template + Wireless (write)                 |
| `omada_portal_wizard`       | SI            | Captive Portal wizard (write)                          |
| `omada_firmware_plan`       | MSP           | Firmware upgrade planning (read)                       |
| `omada_firmware_rollout`    | MSP           | Staged rollout (**high-risk write**)                   |
| `omada_device_action`       | MSP / SI      | reboot / forget / forceProvision (**high-risk write**) |
| `omada_voip_overview`       | SI            | VoIP summary                                           |
| `omada_vpn_status`          | SI / MSP      | VPN tunnels                                            |
| `omada_audit_logs`          | MSP           | Audit log query                                        |
| `omada_exec_report`         | MSP           | Cross-site weekly KPI report (MCP App)                 |
| `omada_batch_change`        | MSP / SI      | `/batch` wrapper (**high-risk write**)                 |
| `omada_script`              | Advanced      | Code-sandbox escape hatch (Cloudflare pattern)         |
