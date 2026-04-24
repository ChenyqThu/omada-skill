import { z } from "zod";

import { defineTool } from "../../registry.js";
import { runTwoPhase } from "../../helpers/two_phase.js";

const Action = z.object({
  method: z.enum(["POST", "PATCH", "PUT", "DELETE"]),
  path: z
    .string()
    .min(1)
    .describe("OpenAPI request path (no host), same as a regular OpenAPI call."),
  body: z.string().optional().describe("Stringified JSON body."),
  query: z.string().optional().describe("Query string (without the leading '?')."),
});

const InputSchema = z.object({
  omadacId: z.string().min(1).describe("Omada Controller ID (tenant)."),
  interrupt: z
    .boolean()
    .default(true)
    .describe(
      "If true (default), the controller halts the batch at the first failed " +
        "action. Set false to run every action regardless of earlier errors.",
    ),
  actions: z.array(Action).min(1).max(20).describe("Up to 20 OpenAPI calls to execute in order."),
  confirmToken: z
    .string()
    .optional()
    .describe("Token from the preview phase. Omit to receive a plan + new token."),
});

export const omadaBatchChangeTool = defineTool({
  name: "omada_batch_change",
  title: "Omada /batch wrapper (HIGH-RISK)",
  description:
    "Two-phase, HIGH-RISK wrapper over batchController (POST /{omadacId}/batch). " +
    "Executes up to 20 OpenAPI writes atomically-ish (`interrupt` controls " +
    "fail-fast). Use when a single conceptual change requires multiple calls " +
    "— e.g. 'rename + re-tag + restart'. Always requires a confirm_token " +
    "handshake. Prefer purpose-built tools when one exists.",
  inputSchema: InputSchema,
  handler: async (input, ctx) => {
    const { omadacId, interrupt, actions, confirmToken } = input;
    const plan = {
      operation: "batchController",
      omadacId,
      interrupt,
      actions,
    };

    return runTwoPhase(ctx, {
      operations: ["batchController"],
      plan,
      confirmToken,
      renderPreview: (p) => {
        const list = p["actions"] as { method: string; path: string }[];
        const lines = list.slice(0, 10).map((a, i) => `    ${i + 1}. ${a.method} ${a.path}`);
        const more = list.length > 10 ? `\n    … ${list.length - 10} more actions` : "";
        return `Would execute ${list.length} action(s) via /batch (interrupt=${p["interrupt"] as boolean}):\n${lines.join("\n")}${more}`;
      },
      execute: () =>
        ctx.client.call("batchController", {
          path: { omadacId },
          body: {
            interrupt,
            actions,
          },
        }),
      renderSuccess: (p, result) => {
        const errorCode = (result as { errorCode?: number }).errorCode;
        if (errorCode !== undefined && errorCode !== 0) {
          return `batchController FAILED: errorCode=${errorCode} msg=${(result as { msg?: string }).msg ?? "unknown"}`;
        }
        const responses = (result as { result?: { response?: unknown[] } }).result?.response ?? [];
        const count = (p["actions"] as unknown[]).length;
        return `Batch of ${count} action(s) completed with ${responses.length} response(s).`;
      },
    });
  },
});
