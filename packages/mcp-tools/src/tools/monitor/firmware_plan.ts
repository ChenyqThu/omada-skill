import { z } from "zod";

import { defineTool, textResult } from "../../registry.js";

const InputSchema = z.object({
  omadacId: z.string().min(1).describe("Omada Controller ID (tenant)."),
  page: z.number().int().positive().default(1).describe("1-indexed page for the plan listing."),
  pageSize: z.number().int().positive().max(1000).default(100).describe("Items per page."),
});

export const omadaFirmwarePlanTool = defineTool({
  name: "omada_firmware_plan",
  title: "Omada firmware plan overview",
  description:
    "Read-only overview of firmware inventory + configured upgrade plans. " +
    "Fetches getGridFirmwareList (available firmware pool) and " +
    "getGridUpgradePlans (scheduled / active plans) in parallel. Use to brief " +
    "an operator before omada_firmware_rollout.",
  inputSchema: InputSchema,
  handler: async (input, ctx) => {
    const { omadacId, page, pageSize } = input;
    ctx.logger.debug("omada_firmware_plan", { omadacId, page, pageSize });

    const [pool, plans] = await Promise.all([
      ctx.client.call("getGridFirmwareList", {
        path: { omadacId },
        query: { page, pageSize },
      }),
      ctx.client.call("getGridUpgradePlans", {
        path: { omadacId },
        query: { page, pageSize },
      }),
    ]);

    const firstError = pickError(pool) ?? pickError(plans);
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

    const poolInner = pool.result ?? {};
    const plansInner = plans.result ?? {};
    const firmwares = ((poolInner as { data?: FirmwareRow[] }).data ?? []) as FirmwareRow[];
    const planRows = ((plansInner as { data?: PlanRow[] }).data ?? []) as PlanRow[];

    return textResult(format(firmwares, planRows, omadacId), {
      omadacId,
      firmwares,
      plans: planRows,
    });
  },
});

interface FirmwareRow {
  model?: string;
  version?: string;
  releaseDate?: string;
  fileName?: string;
  [key: string]: unknown;
}

interface PlanRow {
  planId?: string;
  name?: string;
  status?: string;
  mode?: string;
  startAt?: number;
  targetVersion?: string;
  siteScope?: string;
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

function format(firmwares: FirmwareRow[], plans: PlanRow[], omadacId: string): string {
  const lines = [`Firmware plan for controller ${omadacId}:`];
  lines.push(`  Firmware pool: ${firmwares.length} image(s)`);
  for (const f of firmwares.slice(0, 10)) {
    lines.push(
      `    • ${f.model ?? "?"} ${f.version ?? "?"}${f.releaseDate ? ` · ${f.releaseDate}` : ""}`,
    );
  }
  if (firmwares.length > 10) lines.push(`    … ${firmwares.length - 10} more images omitted.`);
  lines.push(`  Upgrade plans: ${plans.length} configured`);
  for (const p of plans.slice(0, 10)) {
    const status = p.status ?? "?";
    const when = p.startAt ? new Date(p.startAt).toISOString() : "?";
    lines.push(
      `    • ${p.name ?? p.planId ?? "(plan)"} · ${status} · target=${p.targetVersion ?? "?"} · startAt=${when}`,
    );
  }
  if (plans.length > 10) lines.push(`    … ${plans.length - 10} more plans omitted.`);
  return lines.join("\n");
}
