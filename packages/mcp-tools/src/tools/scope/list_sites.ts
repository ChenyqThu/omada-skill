import { z } from "zod";

import { defineTool, textResult } from "../../registry.js";

const InputSchema = z.object({
  omadacId: z
    .string()
    .min(1)
    .describe("Omada Controller ID (tenant). Find via the controller's Cloud Access page."),
  page: z.number().int().positive().default(1).describe("1-indexed page number."),
  pageSize: z
    .number()
    .int()
    .positive()
    .max(500)
    .default(50)
    .describe("Items per page (default 50, max 500)."),
  searchKey: z
    .string()
    .optional()
    .describe("Free-text filter matched against site name, region, and scenario."),
});

export const omadaListSitesTool = defineTool({
  name: "omada_list_sites",
  title: "List Omada sites",
  description:
    "List sites under an Omada Controller. Returns a concise text summary plus " +
    "the raw JSON in structuredContent. Use this before any site-scoped operation " +
    "to discover siteId values, or to build an MSP overview of all managed sites. " +
    "Pagination is optional — the handler walks pages automatically up to pageSize.",
  inputSchema: InputSchema,
  handler: async (input, ctx) => {
    const { omadacId, page, pageSize, searchKey } = input;
    ctx.logger.debug("omada_list_sites", { omadacId, page, pageSize });

    const query: Record<string, string | number | boolean | undefined> = {
      page,
      pageSize,
      ...(searchKey !== undefined ? { searchKey } : {}),
    };

    const response = (await ctx.client.call("getSiteList", {
      path: { omadacId },
      query,
    })) as {
      errorCode?: number;
      msg?: string;
      result?: {
        totalRows?: number;
        currentPage?: number;
        currentSize?: number;
        data?: SiteRow[];
      };
    } | null;

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
    const rows = inner.data ?? [];
    return textResult(formatSites(rows, inner), {
      totalRows: inner.totalRows ?? rows.length,
      currentPage: inner.currentPage ?? page,
      currentSize: inner.currentSize ?? rows.length,
      sites: rows,
    });
  },
});

interface SiteRow {
  siteId?: string;
  name?: string;
  region?: string;
  type?: number | string;
  scenario?: string;
  timeZone?: string;
  [key: string]: unknown;
}

function formatSites(
  rows: SiteRow[],
  meta: { totalRows?: number; currentPage?: number; currentSize?: number },
): string {
  if (rows.length === 0) {
    return "No sites found.";
  }
  const header =
    `Found ${meta.totalRows ?? rows.length} site(s)` +
    (meta.currentPage
      ? ` (page ${meta.currentPage}${meta.currentSize ? `, ${meta.currentSize} per page` : ""})`
      : "") +
    ":";
  const bullets = rows.slice(0, 50).map((s) => {
    const name = s.name ?? "(unnamed)";
    const id = s.siteId ?? "(no-id)";
    const region = s.region ? ` · ${s.region}` : "";
    const scenario = s.scenario ? ` · ${s.scenario}` : "";
    return `  • ${name} — siteId=${id}${region}${scenario}`;
  });
  const footer =
    rows.length > 50 ? `\n  … ${rows.length - 50} more omitted — narrow with searchKey.` : "";
  return [header, ...bullets].join("\n") + footer;
}
