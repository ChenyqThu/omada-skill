import { z } from "zod";

import { defineTool, textResult } from "../../registry.js";

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

const InputSchema = z.object({
  omadacId: z.string().min(1).describe("Omada Controller ID (tenant)."),
  siteId: z.string().min(1).describe("Site ID to read audit logs for."),
  page: z.number().int().positive().default(1).describe("1-indexed page number."),
  pageSize: z.number().int().positive().max(1000).default(100).describe("Items per page."),
  timeStart: z.number().int().optional().describe("Unix ms. Default: 24h ago."),
  timeEnd: z.number().int().optional().describe("Unix ms. Default: now."),
  searchKey: z.string().optional().describe("Free-text filter (user / action / module)."),
});

export const omadaAuditLogsTool = defineTool({
  name: "omada_audit_logs",
  title: "Query Omada site audit logs",
  description:
    "Read-only query over the site audit log (getAuditLogsForSite). Defaults " +
    "to the last 24h. Use before attributing a change to a user or to compile " +
    "an incident timeline.",
  inputSchema: InputSchema,
  handler: async (input, ctx) => {
    const { omadacId, siteId, page, pageSize, searchKey } = input;
    const timeEnd = input.timeEnd ?? Date.now();
    const timeStart = input.timeStart ?? timeEnd - DEFAULT_WINDOW_MS;

    ctx.logger.debug("omada_audit_logs", { omadacId, siteId, timeStart, timeEnd });

    const query: Record<string, string | number | boolean | undefined> = {
      page,
      pageSize,
      "filters.timeStart": timeStart,
      "filters.timeEnd": timeEnd,
      ...(searchKey !== undefined ? { searchKey } : {}),
    };

    const response = await ctx.client.call("getAuditLogsForSite", {
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
    const rows = (inner.data ?? []) as AuditRow[];
    return textResult(format(rows, inner, { siteId, timeStart, timeEnd }), {
      siteId,
      timeStart,
      timeEnd,
      totalRows: inner.totalRows ?? rows.length,
      logs: rows,
    });
  },
});

interface AuditRow {
  timestamp?: number;
  user?: string;
  userName?: string;
  role?: string;
  module?: string;
  action?: string;
  message?: string;
  ip?: string;
  [key: string]: unknown;
}

function format(
  rows: AuditRow[],
  meta: { totalRows?: number; currentPage?: number },
  window: { siteId: string; timeStart: number; timeEnd: number },
): string {
  const from = new Date(window.timeStart).toISOString();
  const to = new Date(window.timeEnd).toISOString();
  if (rows.length === 0) return `No audit entries in ${window.siteId} between ${from} and ${to}.`;
  const header = `Found ${meta.totalRows ?? rows.length} audit entry(ies) in ${window.siteId} (${from} – ${to}):`;
  const bullets = rows.slice(0, 50).map((r) => {
    const when = r.timestamp ? new Date(r.timestamp).toISOString() : "?";
    const user = r.user ?? r.userName ?? "?";
    const ip = r.ip ? ` (${r.ip})` : "";
    const mod = r.module ?? "?";
    const action = r.action ?? "?";
    const msg = r.message ? ` — ${r.message}` : "";
    return `  • ${when} · ${user}${ip} · ${mod}/${action}${msg}`;
  });
  const more =
    rows.length > 50 ? `\n  … ${rows.length - 50} more on this page — narrow with searchKey.` : "";
  return [header, ...bullets].join("\n") + more;
}
