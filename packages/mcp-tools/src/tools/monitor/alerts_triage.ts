import { z } from "zod";

import { defineTool, textResult } from "../../registry.js";

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

const InputSchema = z.object({
  omadacId: z.string().min(1).describe("Omada Controller ID (tenant)."),
  siteId: z.string().min(1).describe("Site ID to triage alerts in."),
  timeStart: z.number().int().optional().describe("Unix ms. Default: 24h ago."),
  timeEnd: z.number().int().optional().describe("Unix ms. Default: now."),
  pageSize: z
    .number()
    .int()
    .positive()
    .max(1000)
    .default(500)
    .describe("Max alerts fetched for grouping. Default 500."),
});

export const omadaAlertsTriageTool = defineTool({
  name: "omada_alerts_triage",
  title: "Triage Omada site alerts",
  description:
    "Read the alert log for a window, then group alerts by module, severity, " +
    "and affected device/client. Returns a priority-ordered summary suitable " +
    "for ticketing, plus the full grouping in structuredContent so a downstream " +
    "skill can draft tickets. Read-only — does not resolve / delete alerts.",
  inputSchema: InputSchema,
  handler: async (input, ctx) => {
    const { omadacId, siteId, pageSize } = input;
    const timeEnd = input.timeEnd ?? Date.now();
    const timeStart = input.timeStart ?? timeEnd - DEFAULT_WINDOW_MS;

    ctx.logger.debug("omada_alerts_triage", { omadacId, siteId, timeStart, timeEnd });

    const response = await ctx.client.call("getAlertLogsForSite", {
      path: { omadacId, siteId },
      query: {
        page: 1,
        pageSize,
        "filters.timeStart": timeStart,
        "filters.timeEnd": timeEnd,
      },
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
    const groups = triage(rows);
    return textResult(format(rows, groups, { timeStart, timeEnd, siteId }), {
      siteId,
      timeStart,
      timeEnd,
      totalRows: inner.totalRows ?? rows.length,
      groups,
    });
  },
});

interface AlertRow {
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

interface Group {
  key: string;
  module: string;
  severity: string;
  target: string;
  count: number;
  resolved: number;
  lastSeen: number | null;
  sample: string;
}

function severityRank(sev: string): number {
  switch (sev.toLowerCase()) {
    case "critical":
      return 0;
    case "error":
    case "high":
      return 1;
    case "warning":
    case "warn":
    case "medium":
      return 2;
    case "info":
    case "notice":
    case "low":
      return 3;
    default:
      return 4;
  }
}

function triage(rows: AlertRow[]): Group[] {
  const groups = new Map<string, Group>();
  for (const a of rows) {
    const module = a.module ?? "Unknown";
    const severity = a.severity ?? a.level ?? "unknown";
    const target = a.deviceName ?? a.deviceMac ?? a.clientMac ?? "—";
    const key = `${module}|${severity}|${target}`;
    const existing = groups.get(key);
    const timestamp = a.timestamp ?? null;
    if (existing) {
      existing.count += 1;
      if (a.resolved) existing.resolved += 1;
      if (timestamp !== null && (existing.lastSeen === null || timestamp > existing.lastSeen)) {
        existing.lastSeen = timestamp;
        existing.sample = a.message ?? a.content ?? existing.sample;
      }
    } else {
      groups.set(key, {
        key,
        module,
        severity,
        target,
        count: 1,
        resolved: a.resolved ? 1 : 0,
        lastSeen: timestamp,
        sample: a.message ?? a.content ?? "(no message)",
      });
    }
  }
  return [...groups.values()].sort((a, b) => {
    const sev = severityRank(a.severity) - severityRank(b.severity);
    if (sev !== 0) return sev;
    return b.count - a.count;
  });
}

function format(
  rows: AlertRow[],
  groups: Group[],
  window: { timeStart: number; timeEnd: number; siteId: string },
): string {
  const from = new Date(window.timeStart).toISOString();
  const to = new Date(window.timeEnd).toISOString();
  if (rows.length === 0) {
    return `No alerts to triage in site ${window.siteId} between ${from} and ${to}.`;
  }
  const header = `Triaged ${rows.length} alert(s) in ${window.siteId} → ${groups.length} distinct issue(s), ${from} – ${to}:`;
  const bullets = groups.slice(0, 30).map((g) => {
    const last = g.lastSeen ? new Date(g.lastSeen).toISOString() : "?";
    const unresolved = g.count - g.resolved;
    return (
      `  • [${g.severity}] ${g.module} · ${g.target} ×${g.count}` +
      ` (unresolved=${unresolved}, last=${last})\n    ${g.sample}`
    );
  });
  const footer =
    groups.length > 30 ? `\n  … ${groups.length - 30} lower-priority groups omitted.` : "";
  return [header, ...bullets].join("\n") + footer;
}
