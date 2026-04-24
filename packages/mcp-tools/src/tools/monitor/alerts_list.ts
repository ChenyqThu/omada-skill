import { z } from "zod";

import { defineTool, textResult } from "../../registry.js";

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

const InputSchema = z.object({
  omadacId: z.string().min(1).describe("Omada Controller ID (tenant)."),
  siteId: z.string().min(1).describe("Site ID to pull alerts for."),
  page: z.number().int().positive().default(1).describe("1-indexed page number."),
  pageSize: z
    .number()
    .int()
    .positive()
    .max(1000)
    .default(100)
    .describe("Items per page (default 100)."),
  timeStart: z.number().int().optional().describe("Unix ms. Default: 24h ago."),
  timeEnd: z.number().int().optional().describe("Unix ms. Default: now."),
  module: z.enum(["System", "Device", "Client"]).optional().describe("Restrict to one module."),
  resolved: z.boolean().optional().describe("Restrict to resolved / unresolved alerts."),
});

export const omadaAlertsListTool = defineTool({
  name: "omada_alerts_list",
  title: "List Omada site alerts",
  description:
    "List Insight / Service alerts for one site inside a time window. Defaults " +
    "to the last 24 hours. Returns a terse bullet list (module · severity · " +
    "message) plus the raw page in structuredContent. Use before " +
    "omada_alerts_triage to decide which events need action.",
  inputSchema: InputSchema,
  handler: async (input, ctx) => {
    const { omadacId, siteId, page, pageSize, module, resolved } = input;
    const now = Date.now();
    const timeEnd = input.timeEnd ?? now;
    const timeStart = input.timeStart ?? timeEnd - DEFAULT_WINDOW_MS;

    ctx.logger.debug("omada_alerts_list", { omadacId, siteId, timeStart, timeEnd });

    const query: Record<string, string | number | boolean | undefined> = {
      page,
      pageSize,
      "filters.timeStart": timeStart,
      "filters.timeEnd": timeEnd,
      ...(module !== undefined ? { "filters.module": module } : {}),
      ...(resolved !== undefined ? { "filters.resolved": resolved } : {}),
    };

    const response = await ctx.client.call("getAlertLogsForSite", {
      path: { omadacId, siteId },
      query,
    });

    if (!response || (response.errorCode !== undefined && response.errorCode !== 0)) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Omada API returned errorCode=${response?.errorCode} msg=${response?.msg ?? "unknown"}`,
          },
        ],
      };
    }

    const inner = response.result ?? {};
    const rows = (inner.data ?? []) as AlertRow[];
    return textResult(format(rows, inner, { timeStart, timeEnd, siteId }), {
      siteId,
      timeStart,
      timeEnd,
      totalRows: inner.totalRows ?? rows.length,
      alerts: rows,
    });
  },
});

interface AlertRow {
  id?: string;
  timestamp?: number;
  module?: string;
  severity?: string;
  level?: string;
  message?: string;
  content?: string;
  resolved?: boolean;
  deviceName?: string;
  deviceMac?: string;
  clientMac?: string;
  [key: string]: unknown;
}

function format(
  rows: AlertRow[],
  meta: { totalRows?: number; currentPage?: number },
  window: { timeStart: number; timeEnd: number; siteId: string },
): string {
  const from = new Date(window.timeStart).toISOString();
  const to = new Date(window.timeEnd).toISOString();
  if (rows.length === 0) {
    return `No alerts in site ${window.siteId} between ${from} and ${to}.`;
  }
  const header = `Found ${meta.totalRows ?? rows.length} alert(s) in ${window.siteId} from ${from} to ${to}:`;
  const bullets = rows.slice(0, 50).map((a) => {
    const when = a.timestamp ? new Date(a.timestamp).toISOString() : "?";
    const mod = a.module ?? "?";
    const sev = a.severity ?? a.level ?? "?";
    const who = a.deviceName ?? a.deviceMac ?? a.clientMac ?? "";
    const msg = a.message ?? a.content ?? "(no message)";
    const resolved = a.resolved ? " ✅" : "";
    return `  • [${sev}] ${when} · ${mod}${who ? ` · ${who}` : ""} — ${msg}${resolved}`;
  });
  const footer =
    rows.length > 50
      ? `\n  … ${rows.length - 50} more on this page — narrow with module / resolved.`
      : "";
  return [header, ...bullets].join("\n") + footer;
}
