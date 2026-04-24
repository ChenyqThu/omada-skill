import { z } from "zod";

import { defineTool, textResult } from "../../registry.js";

const InputSchema = z.object({
  omadacId: z.string().min(1).describe("Omada Controller ID (tenant)."),
  siteId: z.string().min(1).describe("Site ID whose clients to list."),
  page: z.number().int().positive().default(1).describe("1-indexed page number."),
  pageSize: z
    .number()
    .int()
    .positive()
    .max(1000)
    .default(100)
    .describe("Items per page (default 100, max 1000)."),
  searchKey: z.string().optional().describe("Free-text filter (name, MAC, IP, or vendor)."),
  wirelessOnly: z
    .boolean()
    .optional()
    .describe("Restrict to wireless clients (maps to filters.wireless=true)."),
});

export const omadaListClientsTool = defineTool({
  name: "omada_list_clients",
  title: "List clients in an Omada site",
  description:
    "List connected clients for one site (wired + wireless). Returns a concise " +
    "text summary (name · MAC · IP · connection · AP/port) plus the raw page in " +
    "structuredContent. Use before omada_client_journey or omada_device_detail.",
  inputSchema: InputSchema,
  handler: async (input, ctx) => {
    const { omadacId, siteId, page, pageSize, searchKey, wirelessOnly } = input;
    ctx.logger.debug("omada_list_clients", { omadacId, siteId, page, pageSize });

    const query: Record<string, string | number | boolean | undefined> = {
      page,
      pageSize,
      ...(searchKey !== undefined ? { searchKey } : {}),
      ...(wirelessOnly !== undefined ? { "filters.wireless": String(wirelessOnly) } : {}),
    };

    const response = await ctx.client.call("getGridActiveClients", {
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
    const rows = (inner.data ?? []) as ClientRow[];
    return textResult(formatClients(rows, inner, siteId), {
      siteId,
      totalRows: inner.totalRows ?? rows.length,
      currentPage: inner.currentPage ?? page,
      currentSize: inner.currentSize ?? rows.length,
      clients: rows,
    });
  },
});

interface ClientRow {
  mac?: string;
  name?: string;
  hostName?: string;
  ip?: string;
  vendor?: string;
  wireless?: boolean;
  ssid?: string;
  apName?: string;
  switchName?: string;
  port?: number | string;
  vlanId?: number;
  [key: string]: unknown;
}

function formatClients(
  rows: ClientRow[],
  meta: { totalRows?: number; currentPage?: number; currentSize?: number },
  siteId: string,
): string {
  if (rows.length === 0) {
    return `No clients found in site ${siteId}.`;
  }
  const header =
    `Found ${meta.totalRows ?? rows.length} client(s) in site ${siteId} ` +
    `(page ${meta.currentPage ?? 1}, ${meta.currentSize ?? rows.length} shown):`;
  const bullets = rows.slice(0, 50).map((c) => {
    const name = c.name ?? c.hostName ?? "(unnamed)";
    const mac = c.mac ?? "(no-mac)";
    const ip = c.ip ? ` · ${c.ip}` : "";
    const conn = c.wireless
      ? `wireless${c.ssid ? ` (${c.ssid})` : ""}${c.apName ? ` via ${c.apName}` : ""}`
      : `wired${c.switchName ? ` (${c.switchName}` : ""}${c.port !== undefined ? `/port ${c.port})` : c.switchName ? ")" : ""}`;
    return `  • ${name} — mac=${mac}${ip} · ${conn}`;
  });
  const footer =
    rows.length > 50
      ? `\n  … ${rows.length - 50} more on this page — narrow with searchKey / filters.`
      : "";
  return [header, ...bullets].join("\n") + footer;
}
