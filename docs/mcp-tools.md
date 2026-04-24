# MCP tool reference

`omada-mcp` registers a curated set of **intent-shaped** tools — not a
1:1 mirror of the 2,269 Omada operations. As of **M3** the surface is
22 tools; M5 also publishes the five [`skills/`](../skills/) as MCP
resources (`resource://omada-skills/<name>`) so compatible clients
auto-load them alongside the tool list. Each tool below links to its
source under
[`packages/mcp-tools/src/tools/`](../packages/mcp-tools/src/tools/).

## Table of contents

| Lane              | Tools                                                                                                                                                                                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope             | [`omada_discover_scope`](#omada_discover_scope) · [`omada_list_sites`](#omada_list_sites)                                                                                                                                                                                         |
| Inventory         | [`omada_site_overview`](#omada_site_overview) · [`omada_list_devices`](#omada_list_devices) · [`omada_device_detail`](#omada_device_detail) · [`omada_list_clients`](#omada_list_clients) · [`omada_client_journey`](#omada_client_journey) · [`omada_topology`](#omada_topology) |
| Monitor / health  | [`omada_alerts_list`](#omada_alerts_list) · [`omada_alerts_triage`](#omada_alerts_triage) · [`omada_wifi_diagnose`](#omada_wifi_diagnose) · [`omada_voip_overview`](#omada_voip_overview) · [`omada_vpn_status`](#omada_vpn_status) · [`omada_audit_logs`](#omada_audit_logs)     |
| Firmware / report | [`omada_firmware_plan`](#omada_firmware_plan) · [`omada_exec_report`](#omada_exec_report)                                                                                                                                                                                         |
| Deploy (write)    | [`omada_apply_site_template`](#omada_apply_site_template) · [`omada_bulk_onboard`](#omada_bulk_onboard) · [`omada_portal_wizard`](#omada_portal_wizard)                                                                                                                           |
| Lifecycle (write) | [`omada_device_action`](#omada_device_action) · [`omada_firmware_rollout`](#omada_firmware_rollout) · [`omada_batch_change`](#omada_batch_change)                                                                                                                                 |
| Advanced          | [`omada_script`](#omada_script)                                                                                                                                                                                                                                                   |

All **write** tools flow through
[`runTwoPhase`](../packages/mcp-tools/src/helpers/two_phase.ts) — omit
`confirm_token` to get a preview + fresh token, then re-invoke with
identical input + that token to execute.

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

## `omada_discover_scope`

|                        |                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| **Since**              | M3                                                                                                        |
| **Kind**               | Read-only                                                                                                 |
| **Target user**        | All (MSP / SI / Prosumer / internal)                                                                      |
| **Backing operations** | MSP mode: `getCustomerList` → `GET /openapi/v1/{mspId}/customers`. Single-tenant mode: echo (no network). |
| **Source**             | [`tools/scope/discover_scope.ts`](../packages/mcp-tools/src/tools/scope/discover_scope.ts)                |

Preflight for any subsequent call. Pass **one** of `mspId` (MSP mode)
or `omadacId` (single-tenant); the tool refuses inputs with neither.
MSP mode paginates over customers; single-tenant mode echoes the given
controller without a network call. Use this first whenever a request
mentions multiple organisations.

## `omada_site_overview`

|                        |                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| **Since**              | M3                                                                                           |
| **Kind**               | Read-only                                                                                    |
| **Target user**        | Prosumer / SI / Internal support                                                             |
| **Backing operations** | `getSiteEntity` + `getOverview` (parallel)                                                   |
| **Source**             | [`tools/monitor/site_overview.ts`](../packages/mcp-tools/src/tools/monitor/site_overview.ts) |

Aggregates site identity with dashboard device/client counts. Returns
a 4–5 line health summary plus the raw payloads in `structuredContent`.
Prosumer/SI starting point for "how's my site doing?".

## `omada_list_devices`

|                        |                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| **Since**              | M3                                                                                             |
| **Kind**               | Read-only                                                                                      |
| **Target user**        | All                                                                                            |
| **Backing operations** | `getAllDeviceBySite`                                                                           |
| **Source**             | [`tools/inventory/list_devices.ts`](../packages/mcp-tools/src/tools/inventory/list_devices.ts) |

Lists APs / switches / gateways / stacks for one site, grouped by
kind. Use before `omada_device_detail` / `omada_device_action` to
discover MAC addresses.

## `omada_device_detail`

|                        |                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Since**              | M3                                                                                                                                      |
| **Kind**               | Read-only                                                                                                                               |
| **Target user**        | SI / Prosumer                                                                                                                           |
| **Backing operations** | Router on `kind`: `ap` → `getOverviewDetail`, `switch` → `getSwitchInfo`, `gateway` → `getGatewayInfo_1`, `stack` → `getOswStackDetail` |
| **Source**             | [`tools/inventory/device_detail.ts`](../packages/mcp-tools/src/tools/inventory/device_detail.ts)                                        |

One device's full inventory + health (uptime, cpu/mem, clients /
radios / ports). `id` is the MAC for ap/switch/gateway, `stackId` for
stacks. See the M3 HANDOFF for the `getGatewayInfo_1` quirk.

## `omada_list_clients`

|                        |                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| **Since**              | M3                                                                                             |
| **Kind**               | Read-only                                                                                      |
| **Target user**        | All                                                                                            |
| **Backing operations** | `getGridActiveClients`                                                                         |
| **Source**             | [`tools/inventory/list_clients.ts`](../packages/mcp-tools/src/tools/inventory/list_clients.ts) |

Wired + wireless clients for one site with free-text `searchKey` and
optional `wirelessOnly` filter. Use before `omada_client_journey`.

## `omada_client_journey`

|                        |                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| **Since**              | M3                                                                                                 |
| **Kind**               | Read-only                                                                                          |
| **Target user**        | Prosumer / SI                                                                                      |
| **Backing operations** | `getClientDetail` (optional) + `getClientJourney`                                                  |
| **Source**             | [`tools/inventory/client_journey.ts`](../packages/mcp-tools/src/tools/inventory/client_journey.ts) |

Pairs a client's current attachment with its roaming / disconnect
history. The first 10 events come back verbatim; older entries are
preserved in `structuredContent.journey`.

## `omada_topology`

|                        |                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------- |
| **Since**              | M3                                                                                 |
| **Kind**               | Read-only                                                                          |
| **Target user**        | All                                                                                |
| **Backing operations** | `getV3Topology` (default) / `getTopology` (pass `version="v2"` for legacy sites)   |
| **Source**             | [`tools/monitor/topology.ts`](../packages/mcp-tools/src/tools/monitor/topology.ts) |

Site topology graph — node / edge counts + a per-kind breakdown; raw
graph lives in `structuredContent.graph` for MCP Apps / viewers.

## `omada_alerts_list`

|                        |                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| **Since**              | M3                                                                                       |
| **Kind**               | Read-only                                                                                |
| **Target user**        | MSP / SI                                                                                 |
| **Backing operations** | `getAlertLogsForSite` with `filters.timeStart / timeEnd / module / resolved`             |
| **Source**             | [`tools/monitor/alerts_list.ts`](../packages/mcp-tools/src/tools/monitor/alerts_list.ts) |

Raw Insight / Service alerts for one site + window (default last 24h).
Module filter is a case-sensitive enum: `System` / `Device` / `Client`.

## `omada_alerts_triage`

|                        |                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| **Since**              | M3                                                                                           |
| **Kind**               | Read-only                                                                                    |
| **Target user**        | MSP / SI                                                                                     |
| **Backing operations** | `getAlertLogsForSite` + client-side grouping                                                 |
| **Source**             | [`tools/monitor/alerts_triage.ts`](../packages/mcp-tools/src/tools/monitor/alerts_triage.ts) |

Fetches up to 500 alerts and collapses them into `module|severity|target`
groups sorted by severity. The primary triage view for the
[`omada-alert-triage`](../skills/omada-alert-triage/SKILL.md) skill.

## `omada_wifi_diagnose`

|                        |                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| **Since**              | M3                                                                                           |
| **Kind**               | Read-only                                                                                    |
| **Target user**        | Prosumer / SI                                                                                |
| **Backing operations** | `getWifiSummary` + `getWifiHealthTimeList` + `getSiteClientHealthTimeList` (parallel)        |
| **Source**             | [`tools/monitor/wifi_diagnose.ts`](../packages/mcp-tools/src/tools/monitor/wifi_diagnose.ts) |

Fixed three-line site-wide Wi-Fi snapshot (`Summary`, `Wi-Fi health`,
`Client health`). Starting point for the
[`omada-wifi-troubleshoot`](../skills/omada-wifi-troubleshoot/SKILL.md)
skill.

## `omada_voip_overview`

|                        |                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| **Since**              | M3                                                                                           |
| **Kind**               | Read-only                                                                                    |
| **Target user**        | SI                                                                                           |
| **Backing operations** | `getVoip`                                                                                    |
| **Source**             | [`tools/monitor/voip_overview.ts`](../packages/mcp-tools/src/tools/monitor/voip_overview.ts) |

Site-level VoIP summary (calls / concurrency / status) for SI
deployments that bundle voice.

## `omada_vpn_status`

|                        |                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------- |
| **Since**              | M3                                                                                     |
| **Kind**               | Read-only                                                                              |
| **Target user**        | SI / MSP                                                                               |
| **Backing operations** | `getTunnelsStatus`                                                                     |
| **Source**             | [`tools/monitor/vpn_status.ts`](../packages/mcp-tools/src/tools/monitor/vpn_status.ts) |

Active VPN tunnel inventory with up/down state and peer addresses.

## `omada_audit_logs`

|                        |                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------- |
| **Since**              | M3                                                                                     |
| **Kind**               | Read-only                                                                              |
| **Target user**        | MSP / Internal support                                                                 |
| **Backing operations** | `getAuditLogsForSite` with `filters.timeStart / timeEnd` + free-text `searchKey`       |
| **Source**             | [`tools/monitor/audit_logs.ts`](../packages/mcp-tools/src/tools/monitor/audit_logs.ts) |

Who changed what, and when, inside one site. `searchKey` is
free-text substring over user / action / module. Used by
[`omada-support-assist`](../skills/omada-support-assist/SKILL.md) for
attribution.

## `omada_firmware_plan`

|                        |                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| **Since**              | M3                                                                                           |
| **Kind**               | Read-only                                                                                    |
| **Target user**        | MSP                                                                                          |
| **Backing operations** | `getGridFirmwareList` + `getGridUpgradePlans` (parallel)                                     |
| **Source**             | [`tools/monitor/firmware_plan.ts`](../packages/mcp-tools/src/tools/monitor/firmware_plan.ts) |

Pool of available firmware images plus scheduled upgrade plans. Brief
before running `omada_firmware_rollout`.

## `omada_exec_report`

|                        |                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| **Since**              | M3                                                                                       |
| **Kind**               | Read-only                                                                                |
| **Target user**        | MSP                                                                                      |
| **Backing operations** | `getMspDashboardOverall`                                                                 |
| **Source**             | [`tools/monitor/exec_report.ts`](../packages/mcp-tools/src/tools/monitor/exec_report.ts) |

Cross-site weekly KPI rollup for MSP leadership reviews.

## `omada_apply_site_template`

|                        |                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| **Since**              | M3                                                                                                     |
| **Kind**               | **Two-phase write** (medium risk)                                                                      |
| **Target user**        | MSP / SI                                                                                               |
| **Backing operations** | `bindSiteTemplate`                                                                                     |
| **Source**             | [`tools/deploy/apply_site_template.ts`](../packages/mcp-tools/src/tools/deploy/apply_site_template.ts) |

Binds a site-template (with optional per-switch device-template
bindings) to one target site. Two-phase handshake: phase 1 returns a
preview + `confirm_token`, phase 2 executes when the same token is
replayed.

## `omada_bulk_onboard`

|                        |                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| **Since**              | M3                                                                                       |
| **Kind**               | **Two-phase write** (medium risk)                                                        |
| **Target user**        | MSP                                                                                      |
| **Backing operations** | `batchSiteImport`                                                                        |
| **Source**             | [`tools/deploy/bulk_onboard.ts`](../packages/mcp-tools/src/tools/deploy/bulk_onboard.ts) |

Creates up to 300 sites at once by pulling backup files from an
operator-supplied FTP / SFTP / TFTP / SCP server. Two-phase. The MSP
workhorse behind the [`omada-bulk-site-onboard`](../skills/omada-bulk-site-onboard/SKILL.md) skill.

## `omada_portal_wizard`

|                        |                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| **Since**              | M3                                                                                         |
| **Kind**               | **Two-phase write** (medium risk)                                                          |
| **Target user**        | SI                                                                                         |
| **Backing operations** | `addPortal`                                                                                |
| **Source**             | [`tools/deploy/portal_wizard.ts`](../packages/mcp-tools/src/tools/deploy/portal_wizard.ts) |

Accepts a prepared `PortalSetting` VO and creates a captive portal.
The tool does not validate the VO beyond "is it a record" — consult
the controller OpenAPI for required fields. Paired with the
[`omada-guest-portal-wizard`](../skills/omada-guest-portal-wizard/SKILL.md)
skill.

## `omada_device_action`

|                        |                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| **Since**              | M3                                                                                               |
| **Kind**               | **Two-phase write** (**HIGH-RISK**)                                                              |
| **Target user**        | MSP / SI                                                                                         |
| **Backing operations** | `rebootDevice` / `forgetDevice` (routed on `action`)                                             |
| **Source**             | [`tools/lifecycle/device_action.ts`](../packages/mcp-tools/src/tools/lifecycle/device_action.ts) |

Per-device reboot or forget. Always two-phase; severity surfaced as
HIGH in the preview string. `forgetDevice` removes a device from the
site and disconnects all of its clients.

## `omada_firmware_rollout`

|                        |                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| **Since**              | M3                                                                                                     |
| **Kind**               | **Two-phase write** (**HIGH-RISK**)                                                                    |
| **Target user**        | MSP                                                                                                    |
| **Backing operations** | `onlineRollingUpgrade`                                                                                 |
| **Source**             | [`tools/lifecycle/firmware_rollout.ts`](../packages/mcp-tools/src/tools/lifecycle/firmware_rollout.ts) |

Starts a staged rolling upgrade across 1–500 named devices in one
site. Per-device downtime is possible while each device reboots.

## `omada_batch_change`

|                        |                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| **Since**              | M3                                                                                             |
| **Kind**               | **Two-phase write** (**HIGH-RISK**)                                                            |
| **Target user**        | MSP / SI (advanced)                                                                            |
| **Backing operations** | `batchController` (`POST /{omadacId}/batch`)                                                   |
| **Source**             | [`tools/lifecycle/batch_change.ts`](../packages/mcp-tools/src/tools/lifecycle/batch_change.ts) |

Wraps up to 20 OpenAPI writes atomically-ish (`interrupt=true` halts
at first failure). Tagged HIGH because `/batch` can chain arbitrary
writes — prefer a purpose-built tool when one exists.

## `omada_script`

|                        |                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------- |
| **Since**              | M3                                                                               |
| **Kind**               | Variable (GETs fast-path, non-GETs require two-phase handshake)                  |
| **Target user**        | Advanced                                                                         |
| **Backing operations** | Any registered `operationId` in the SDK's operations map                         |
| **Source**             | [`tools/advanced/script.ts`](../packages/mcp-tools/src/tools/advanced/script.ts) |

Escape hatch for operations that don't (yet) have an intent tool. GETs
run immediately; non-GETs go through the `@omada/guardrails`
two-phase helper at the severity tier whitelisted for that op. Agents
should prefer intent tools when they exist and fall back here only for
spec-new or rarely-used calls.
