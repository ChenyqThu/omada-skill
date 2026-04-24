import { z } from "zod";

import { defineTool } from "../../registry.js";
import { runTwoPhase } from "../../helpers/two_phase.js";

const InputSchema = z.object({
  omadacId: z.string().min(1).describe("Omada Controller ID (tenant)."),
  siteId: z.string().min(1).describe("Site ID whose devices to upgrade."),
  macs: z
    .array(z.string().min(1))
    .min(1)
    .max(500)
    .describe("MACs of devices to include in the rolling upgrade (1–500)."),
  confirmToken: z
    .string()
    .optional()
    .describe("Token from the preview phase. Omit to receive a plan + new token."),
});

export const omadaFirmwareRolloutTool = defineTool({
  name: "omada_firmware_rollout",
  title: "Omada firmware rollout (HIGH-RISK)",
  description:
    "Two-phase, HIGH-RISK tool backing onlineRollingUpgrade. Starts a staged " +
    "rolling firmware upgrade across the named devices in one site. Downtime " +
    "is possible per device for the duration of its reboot. Always requires a " +
    "confirm_token handshake.",
  inputSchema: InputSchema,
  handler: async (input, ctx) => {
    const { omadacId, siteId, macs, confirmToken } = input;
    const plan = { operation: "onlineRollingUpgrade", omadacId, siteId, macs };

    return runTwoPhase(ctx, {
      operations: ["onlineRollingUpgrade"],
      plan,
      confirmToken,
      renderPreview: (p) => {
        const list = p["macs"] as string[];
        const preview = list
          .slice(0, 5)
          .map((m) => `    • ${m}`)
          .join("\n");
        const more = list.length > 5 ? `\n    … ${list.length - 5} more` : "";
        return `Would start rolling firmware upgrade for ${list.length} device(s) in site ${p["siteId"] as string}:\n${preview}${more}`;
      },
      execute: () =>
        ctx.client.call("onlineRollingUpgrade", {
          path: { omadacId, siteId },
          body: { macs },
        }),
      renderSuccess: (p, result) => {
        const errorCode = (result as { errorCode?: number }).errorCode;
        if (errorCode !== undefined && errorCode !== 0) {
          return `onlineRollingUpgrade FAILED: errorCode=${errorCode} msg=${(result as { msg?: string }).msg ?? "unknown"}`;
        }
        const taskId = (result as { result?: { taskId?: string } }).result?.taskId;
        const count = (p["macs"] as string[]).length;
        return `Rolling upgrade started for ${count} device(s)${taskId ? ` · taskId=${taskId}` : ""}.`;
      },
    });
  },
});
