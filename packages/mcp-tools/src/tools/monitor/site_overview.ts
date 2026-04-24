import { z } from "zod";

import { defineTool, textResult } from "../../registry.js";

const InputSchema = z.object({
  omadacId: z.string().min(1).describe("Omada Controller ID (tenant)."),
  siteId: z.string().min(1).describe("Site ID to summarise."),
});

export const omadaSiteOverviewTool = defineTool({
  name: "omada_site_overview",
  title: "Omada site health + dashboard overview",
  description:
    "Aggregate a single site's identity (getSiteEntity) with its dashboard " +
    "overview diagram (getOverview). Returns a compact health summary — device " +
    "counts, alerts, client totals — plus the raw payloads in structuredContent. " +
    "Prosumer / SI starting point when asked 'how's my site doing?'.",
  inputSchema: InputSchema,
  handler: async (input, ctx) => {
    const { omadacId, siteId } = input;
    ctx.logger.debug("omada_site_overview", { omadacId, siteId });

    const [entity, overview] = await Promise.all([
      ctx.client.call("getSiteEntity", { path: { omadacId, siteId } }),
      ctx.client.call("getOverview", { path: { omadacId, siteId } }),
    ]);

    const firstError = pickError(entity) ?? pickError(overview);
    if (firstError) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Omada API returned errorCode=${firstError.errorCode} msg=${firstError.msg}`,
          },
        ],
      };
    }

    const entityResult = (entity.result ?? {}) as SiteEntity;
    const overviewResult = (overview.result ?? {}) as OverviewPayload;
    return textResult(format(entityResult, overviewResult, siteId), {
      siteId,
      entity: entityResult,
      overview: overviewResult,
    });
  },
});

interface SiteEntity {
  name?: string;
  region?: string;
  timeZone?: string;
  scenario?: string;
  type?: string | number;
  [key: string]: unknown;
}

interface OverviewPayload {
  deviceTotal?: number;
  deviceConnectedTotal?: number;
  deviceDisconnectedTotal?: number;
  deviceIsolatedTotal?: number;
  deviceAlertsTotal?: number;
  clientTotal?: number;
  wiredClientTotal?: number;
  wirelessClientTotal?: number;
  guestTotal?: number;
  apTotal?: number;
  switchTotal?: number;
  gatewayTotal?: number;
  [key: string]: unknown;
}

function pickError(
  resp: { errorCode?: number; msg?: string } | undefined,
): { errorCode: number | string; msg: string } | null {
  if (!resp) return { errorCode: "unknown", msg: "empty response" };
  if (resp.errorCode !== undefined && resp.errorCode !== 0) {
    return { errorCode: resp.errorCode, msg: resp.msg ?? "unknown" };
  }
  return null;
}

function format(entity: SiteEntity, overview: OverviewPayload, siteId: string): string {
  const name = entity.name ?? "(unnamed)";
  const region = entity.region ? ` · ${entity.region}` : "";
  const scenario = entity.scenario ? ` · ${entity.scenario}` : "";
  const header = `Site ${name} (${siteId})${region}${scenario}`;

  const deviceLine =
    `  Devices: total=${overview.deviceTotal ?? "?"}` +
    ` connected=${overview.deviceConnectedTotal ?? "?"}` +
    ` disconnected=${overview.deviceDisconnectedTotal ?? "?"}` +
    (overview.deviceIsolatedTotal !== undefined ? ` isolated=${overview.deviceIsolatedTotal}` : "");

  const kindParts: string[] = [];
  if (overview.apTotal !== undefined) kindParts.push(`APs=${overview.apTotal}`);
  if (overview.switchTotal !== undefined) kindParts.push(`Switches=${overview.switchTotal}`);
  if (overview.gatewayTotal !== undefined) kindParts.push(`Gateways=${overview.gatewayTotal}`);
  const kindLine = kindParts.length ? `    ${kindParts.join(" · ")}` : "";

  const clientLine =
    `  Clients: total=${overview.clientTotal ?? "?"}` +
    (overview.wirelessClientTotal !== undefined
      ? ` wireless=${overview.wirelessClientTotal}`
      : "") +
    (overview.wiredClientTotal !== undefined ? ` wired=${overview.wiredClientTotal}` : "") +
    (overview.guestTotal !== undefined ? ` guests=${overview.guestTotal}` : "");

  const alertLine =
    overview.deviceAlertsTotal !== undefined
      ? `  Alerts: deviceAlertsTotal=${overview.deviceAlertsTotal}`
      : "";

  return [header, deviceLine, kindLine, clientLine, alertLine].filter(Boolean).join("\n");
}
