import { z } from "zod";

import { defineTool, textResult } from "../../registry.js";

const InputSchema = z.object({
  omadacId: z.string().min(1).describe("Omada Controller ID (tenant)."),
  siteId: z.string().min(1).describe("Site ID the client currently sits in."),
  clientMac: z.string().min(1).describe("MAC of the client (discover via omada_list_clients)."),
  includeDetail: z
    .boolean()
    .default(true)
    .describe("Fetch getClientDetail alongside the connection history."),
});

export const omadaClientJourneyTool = defineTool({
  name: "omada_client_journey",
  title: "Omada client journey",
  description:
    "Pair a client's current detail (getClientDetail) with its recent roaming / " +
    "connection history (getClientJourney). Summarises SSID / AP / port hops " +
    "so an operator or prosumer can reason about roaming behaviour.",
  inputSchema: InputSchema,
  handler: async (input, ctx) => {
    const { omadacId, siteId, clientMac, includeDetail } = input;
    ctx.logger.debug("omada_client_journey", { omadacId, siteId, clientMac });

    const detailPromise = includeDetail
      ? ctx.client.call("getClientDetail", {
          path: { omadacId, siteId, clientMac },
        })
      : Promise.resolve(undefined);
    const [detailRaw, journeyRaw] = await Promise.all([
      detailPromise,
      ctx.client.call("getClientJourney", {
        path: { omadacId, siteId, clientMac },
      }),
    ]);

    const firstError = pickError(detailRaw) ?? pickError(journeyRaw);
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

    const detail = ((detailRaw?.result ?? {}) as ClientDetail) ?? {};
    const journey = ((journeyRaw.result ?? []) as JourneyEntry[]) ?? [];
    return textResult(format(clientMac, detail, journey), {
      clientMac,
      detail,
      journey,
    });
  },
});

interface ClientDetail {
  name?: string;
  hostName?: string;
  ip?: string;
  vendor?: string;
  ssid?: string;
  apName?: string;
  switchName?: string;
  port?: number;
  signalLevel?: number;
  signalRank?: number;
  [key: string]: unknown;
}

interface JourneyEntry {
  timestamp?: number;
  action?: string;
  ssid?: string;
  apName?: string;
  apMac?: string;
  switchName?: string;
  switchMac?: string;
  port?: number;
  reason?: string;
  [key: string]: unknown;
}

function pickError(
  resp: { errorCode?: number; msg?: string } | undefined,
): { errorCode: number | string; msg: string } | null {
  if (resp === undefined) return null;
  if (!resp) return { errorCode: "unknown", msg: "empty response" };
  if (resp.errorCode !== undefined && resp.errorCode !== 0) {
    return { errorCode: resp.errorCode, msg: resp.msg ?? "unknown" };
  }
  return null;
}

function format(clientMac: string, detail: ClientDetail, journey: JourneyEntry[]): string {
  const name = detail.name ?? detail.hostName ?? "(unnamed)";
  const ip = detail.ip ? ` · ${detail.ip}` : "";
  const header = `Client ${name} (${clientMac})${ip}`;

  const nowParts: string[] = [];
  if (detail.ssid) nowParts.push(`ssid=${detail.ssid}`);
  if (detail.apName) nowParts.push(`ap=${detail.apName}`);
  if (detail.switchName) nowParts.push(`switch=${detail.switchName}`);
  if (detail.port !== undefined) nowParts.push(`port=${detail.port}`);
  if (detail.signalLevel !== undefined) nowParts.push(`signal=${detail.signalLevel}dBm`);
  const nowLine = nowParts.length ? `  now: ${nowParts.join(" · ")}` : "";

  const historyHeader = `  Journey: ${journey.length} event(s)`;
  const historyLines = journey.slice(0, 10).map((e) => {
    const when = e.timestamp ? new Date(e.timestamp).toISOString() : "?";
    const action = e.action ?? "?";
    const where = e.apName ?? e.switchName ?? "?";
    const ssid = e.ssid ? ` ssid=${e.ssid}` : "";
    const reason = e.reason ? ` reason=${e.reason}` : "";
    return `    ${when} · ${action} @ ${where}${ssid}${reason}`;
  });
  const more = journey.length > 10 ? [`    … ${journey.length - 10} older events omitted.`] : [];

  return [header, nowLine, historyHeader, ...historyLines, ...more].filter(Boolean).join("\n");
}
