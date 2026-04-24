import { z } from "zod";

import { defineTool } from "../../registry.js";
import { runTwoPhase } from "../../helpers/two_phase.js";
import type { OperationId } from "@omada/sdk";

const InputSchema = z.object({
  omadacId: z.string().min(1).describe("Omada Controller ID (tenant)."),
  siteId: z.string().min(1).describe("Site ID the device belongs to."),
  deviceMac: z.string().min(1).describe("MAC of the device to act on (AA-BB-CC-DD-EE-FF)."),
  action: z
    .enum(["reboot", "forget"])
    .describe("Lifecycle action — both are high-risk and require confirmation."),
  confirmToken: z
    .string()
    .optional()
    .describe("Token from the preview phase. Omit to receive a plan + new token."),
});

const ACTION_OP: Record<"reboot" | "forget", OperationId> = {
  reboot: "rebootDevice",
  forget: "forgetDevice",
};

export const omadaDeviceActionTool = defineTool({
  name: "omada_device_action",
  title: "Omada device lifecycle action (reboot / forget)",
  description:
    "Two-phase, HIGH-RISK tool for per-device lifecycle actions — reboot or " +
    "forget. Backs onto rebootDevice / forgetDevice. Always requires a " +
    "confirm_token handshake; mismatched plans are rejected. For stack-level " +
    "actions use a dedicated tool once available.",
  inputSchema: InputSchema,
  handler: async (input, ctx) => {
    const { omadacId, siteId, deviceMac, action, confirmToken } = input;
    const op = ACTION_OP[action];
    const plan = { operation: op, omadacId, siteId, deviceMac, action };

    return runTwoPhase(ctx, {
      operations: [op],
      plan,
      confirmToken,
      renderPreview: (p) =>
        `Would ${p["action"] as string} device ${p["deviceMac"] as string} in site ${p["siteId"] as string}` +
        `${action === "forget" ? " (device will be removed from site, clients disconnected)" : " (device will reboot, outage ~2 min)"}.`,
      execute: () =>
        ctx.client.call(op, {
          path: { omadacId, siteId, deviceMac },
        }),
      renderSuccess: (p, result) => {
        const errorCode = (result as { errorCode?: number }).errorCode;
        if (errorCode !== undefined && errorCode !== 0) {
          return `${p["operation"] as string} FAILED: errorCode=${errorCode} msg=${(result as { msg?: string }).msg ?? "unknown"}`;
        }
        return `${(p["action"] as string).toUpperCase()} issued for ${p["deviceMac"] as string}.`;
      },
    });
  },
});
