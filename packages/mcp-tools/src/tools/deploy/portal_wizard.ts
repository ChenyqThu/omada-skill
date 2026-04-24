import { z } from "zod";

import { defineTool } from "../../registry.js";
import { runTwoPhase } from "../../helpers/two_phase.js";

const InputSchema = z.object({
  omadacId: z.string().min(1).describe("Omada Controller ID (tenant)."),
  siteId: z.string().min(1).describe("Site ID to create the portal under."),
  portalSetting: z
    .record(z.string(), z.unknown())
    .describe(
      "Captive-portal configuration body (PortalSetting VO). The wizard skill " +
        "prepares this payload before calling the tool; the tool passes it to " +
        "addPortal verbatim.",
    ),
  confirmToken: z
    .string()
    .optional()
    .describe("Token from the preview phase. Omit to receive a plan + new token."),
});

export const omadaPortalWizardTool = defineTool({
  name: "omada_portal_wizard",
  title: "Omada captive-portal wizard",
  description:
    "Two-phase tool that creates a captive portal on a site via addPortal. " +
    "Accepts a prepared PortalSetting VO from the portal-wizard skill and " +
    "applies it only after a confirm-token handshake.",
  inputSchema: InputSchema,
  handler: async (input, ctx) => {
    const { omadacId, siteId, portalSetting, confirmToken } = input;

    const plan = {
      operation: "addPortal",
      omadacId,
      siteId,
      portalName: (portalSetting["name"] as string | undefined) ?? "(unnamed)",
      authType: (portalSetting["authType"] as string | undefined) ?? "?",
      portalSetting,
    };

    return runTwoPhase(ctx, {
      operations: ["addPortal"],
      plan,
      confirmToken,
      renderPreview: (p) =>
        `Would create portal "${p["portalName"] as string}" on site ${p["siteId"] as string}` +
        ` (authType=${p["authType"] as string}).`,
      execute: () =>
        ctx.client.call("addPortal", {
          path: { omadacId, siteId },
          body: portalSetting,
        }),
      renderSuccess: (p, result) => {
        const errorCode = (result as { errorCode?: number }).errorCode;
        if (errorCode !== undefined && errorCode !== 0) {
          return `addPortal FAILED: errorCode=${errorCode} msg=${(result as { msg?: string }).msg ?? "unknown"}`;
        }
        return `Created portal "${p["portalName"] as string}" on site ${p["siteId"] as string}.`;
      },
    });
  },
});
