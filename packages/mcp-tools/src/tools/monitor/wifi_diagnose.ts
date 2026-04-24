import { z } from "zod";

import { defineTool, textResult } from "../../registry.js";

const InputSchema = z.object({
  omadacId: z.string().min(1).describe("Omada Controller ID (tenant)."),
  siteId: z.string().min(1).describe("Site ID to diagnose Wi-Fi on."),
});

export const omadaWifiDiagnoseTool = defineTool({
  name: "omada_wifi_diagnose",
  title: "Omada Wi-Fi diagnostic playbook",
  description:
    "Fixed Wi-Fi diagnostic playbook: fetch the site's wifi summary, wifi " +
    "health timeline, and client health timeline in parallel, then condense " +
    "them into a few lines an operator can scan. Prosumer starting point for " +
    "'why is my Wi-Fi slow?'.",
  inputSchema: InputSchema,
  handler: async (input, ctx) => {
    const { omadacId, siteId } = input;
    ctx.logger.debug("omada_wifi_diagnose", { omadacId, siteId });

    const [summary, wifiHealth, clientHealth] = await Promise.all([
      ctx.client.call("getWifiSummary", { path: { omadacId, siteId } }),
      ctx.client.call("getWifiHealthTimeList", { path: { omadacId, siteId } }),
      ctx.client.call("getSiteClientHealthTimeList", { path: { omadacId, siteId } }),
    ]);

    const firstError = pickError(summary) ?? pickError(wifiHealth) ?? pickError(clientHealth);
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

    const payload = {
      summary: summary.result ?? {},
      wifiHealth: wifiHealth.result ?? {},
      clientHealth: clientHealth.result ?? {},
    };
    return textResult(format(payload, siteId), { siteId, ...payload });
  },
});

function pickError(
  resp: { errorCode?: number; msg?: string } | undefined,
): { errorCode: number | string; msg: string } | null {
  if (!resp) return { errorCode: "unknown", msg: "empty response" };
  if (resp.errorCode !== undefined && resp.errorCode !== 0) {
    return { errorCode: resp.errorCode, msg: resp.msg ?? "unknown" };
  }
  return null;
}

interface WifiSummary {
  apTotal?: number;
  clientTotal?: number;
  wirelessClientTotal?: number;
  retryRate?: number;
  dropRate?: number;
  airTimeUtilRate?: number;
  [key: string]: unknown;
}

interface HealthSeries {
  healthyTotal?: number;
  subHealthTotal?: number;
  unHealthTotal?: number;
  poorSignalTotal?: number;
  dataPoints?: unknown[];
  [key: string]: unknown;
}

function format(
  payload: { summary: unknown; wifiHealth: unknown; clientHealth: unknown },
  siteId: string,
): string {
  const s = payload.summary as WifiSummary;
  const w = payload.wifiHealth as HealthSeries;
  const c = payload.clientHealth as HealthSeries;

  const lines = [`Wi-Fi diagnosis for site ${siteId}:`];

  const summaryParts: string[] = [];
  if (s.apTotal !== undefined) summaryParts.push(`APs=${s.apTotal}`);
  if (s.wirelessClientTotal !== undefined) summaryParts.push(`wireless=${s.wirelessClientTotal}`);
  if (s.retryRate !== undefined) summaryParts.push(`retry=${s.retryRate}%`);
  if (s.dropRate !== undefined) summaryParts.push(`drop=${s.dropRate}%`);
  if (s.airTimeUtilRate !== undefined) summaryParts.push(`airtime=${s.airTimeUtilRate}%`);
  if (summaryParts.length) lines.push(`  Summary: ${summaryParts.join(" · ")}`);

  const wifiParts: string[] = [];
  if (w.healthyTotal !== undefined) wifiParts.push(`healthy=${w.healthyTotal}`);
  if (w.subHealthTotal !== undefined) wifiParts.push(`subHealth=${w.subHealthTotal}`);
  if (w.unHealthTotal !== undefined) wifiParts.push(`unhealthy=${w.unHealthTotal}`);
  if (wifiParts.length) lines.push(`  Wi-Fi health: ${wifiParts.join(" · ")}`);

  const clientParts: string[] = [];
  if (c.poorSignalTotal !== undefined) clientParts.push(`poorSignal=${c.poorSignalTotal}`);
  if (c.unHealthTotal !== undefined) clientParts.push(`unhealthy=${c.unHealthTotal}`);
  if (c.subHealthTotal !== undefined) clientParts.push(`subHealth=${c.subHealthTotal}`);
  if (clientParts.length) lines.push(`  Client health: ${clientParts.join(" · ")}`);

  if (lines.length === 1)
    lines.push("  (no diagnostic signals — controller returned empty payloads)");

  return lines.join("\n");
}
