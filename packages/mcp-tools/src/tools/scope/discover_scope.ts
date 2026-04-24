import { z } from "zod";

import { defineTool, textResult } from "../../registry.js";
import type { ToolContext, ToolResult } from "../../types.js";

const InputSchema = z
  .object({
    mspId: z
      .string()
      .min(1)
      .optional()
      .describe("MSP tenant ID. When set, this tool enumerates the MSP's customers."),
    omadacId: z
      .string()
      .min(1)
      .optional()
      .describe("Controller ID for single-tenant mode. Returned as the only scope."),
    page: z.number().int().positive().default(1).describe("Page for MSP customer pagination."),
    pageSize: z
      .number()
      .int()
      .positive()
      .max(1000)
      .default(100)
      .describe("Items per page for MSP customer pagination."),
    searchKey: z.string().optional().describe("Free-text filter (MSP mode only)."),
  })
  .refine((v) => v.mspId !== undefined || v.omadacId !== undefined, {
    message: "Provide either mspId (MSP mode) or omadacId (single-tenant mode).",
  });

export const omadaDiscoverScopeTool = defineTool({
  name: "omada_discover_scope",
  title: "Discover Omada operating scope",
  description:
    "Preflight for any subsequent Omada operation: tell the agent which " +
    "controller(s) + customers it can operate on. In MSP mode (mspId set) the " +
    "handler calls getCustomerList and returns each customer's omadacId. In " +
    "single-tenant mode (omadacId set) it echoes that scope without network " +
    "traffic. Call this first if the user mentions multiple organisations.",
  inputSchema: InputSchema,
  handler: async (input, ctx) => {
    if (input.mspId !== undefined) {
      return callMsp(input as MspInput, ctx);
    }
    // Single-tenant: no network call; just echo the scope the user gave us.
    const omadacId = input.omadacId!;
    return textResult(
      `Single-tenant scope:\n  • omadacId=${omadacId}\n  (use omada_list_sites next to enumerate sites.)`,
      {
        mode: "single",
        customers: [{ omadacId }],
      },
    );
  },
});

type MspInput = z.infer<typeof InputSchema> & { mspId: string };

async function callMsp(input: MspInput, ctx: ToolContext): Promise<ToolResult> {
  const { mspId, page, pageSize, searchKey } = input;
  const query: Record<string, string | number | boolean | undefined> = {
    page,
    pageSize,
    ...(searchKey !== undefined ? { searchKey } : {}),
  };

  const response = await ctx.client.call("getCustomerList", {
    path: { mspId },
    query,
  });

  if (!response || (response.errorCode !== undefined && response.errorCode !== 0)) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: `Omada API returned errorCode=${response?.errorCode} msg=${response?.msg ?? "unknown"}`,
        },
      ],
    };
  }

  const inner = response.result ?? {};
  const rows = (inner.data ?? []) as CustomerRow[];
  return textResult(formatCustomers(rows, inner, mspId), {
    mode: "msp",
    mspId,
    totalRows: inner.totalRows ?? rows.length,
    currentPage: inner.currentPage ?? page,
    customers: rows,
  });
}

interface CustomerRow {
  name?: string;
  customerId?: string;
  omadacId?: string;
  controllerId?: string;
  status?: string | number;
  [key: string]: unknown;
}

function formatCustomers(
  rows: CustomerRow[],
  meta: { totalRows?: number; currentPage?: number },
  mspId: string,
): string {
  if (rows.length === 0) {
    return `MSP ${mspId} has no customers matching the filter.`;
  }
  const header =
    `MSP ${mspId} manages ${meta.totalRows ?? rows.length} customer(s)` +
    (meta.currentPage ? ` (page ${meta.currentPage})` : "") +
    ":";
  const bullets = rows.slice(0, 100).map((c) => {
    const name = c.name ?? "(unnamed)";
    const cid = c.customerId ?? "(no-id)";
    const oid = c.omadacId ?? c.controllerId ?? "(no-omadacId)";
    return `  • ${name} — customerId=${cid} · omadacId=${oid}`;
  });
  const footer =
    rows.length > 100 ? `\n  … ${rows.length - 100} more omitted — narrow with searchKey.` : "";
  return [header, ...bullets].join("\n") + footer;
}
