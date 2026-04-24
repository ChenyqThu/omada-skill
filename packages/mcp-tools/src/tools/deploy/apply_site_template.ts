import { z } from "zod";

import { defineTool } from "../../registry.js";
import { runTwoPhase } from "../../helpers/two_phase.js";

const SwitchBinding = z.object({
  mac: z.string().min(1).describe("Switch MAC address (AA-BB-CC-DD-EE-FF)."),
  deviceTemplateId: z
    .string()
    .min(1)
    .optional()
    .describe("Device-template ID to apply to this switch."),
});

const InputSchema = z.object({
  omadacId: z.string().min(1).describe("Omada Controller ID (tenant)."),
  siteTemplateId: z.string().min(1).describe("Site-template ID to bind."),
  siteId: z.string().min(1).describe("Target site ID to bind the template to."),
  switches: z
    .array(SwitchBinding)
    .optional()
    .describe("Optional per-switch device-template bindings."),
  confirmToken: z
    .string()
    .optional()
    .describe("Token from the preview phase. Omit to receive a plan + new token."),
});

export const omadaApplySiteTemplateTool = defineTool({
  name: "omada_apply_site_template",
  title: "Apply Omada site template to a site",
  description:
    "Two-phase tool: bind a site-template (optionally with per-switch device " +
    "templates) to a site via bindSiteTemplate. Phase 1 returns a preview + " +
    "confirm token; phase 2 executes when the same token is replayed.",
  inputSchema: InputSchema,
  handler: async (input, ctx) => {
    const { omadacId, siteTemplateId, siteId, switches, confirmToken } = input;

    const plan = {
      operation: "bindSiteTemplate",
      omadacId,
      siteTemplateId,
      siteId,
      switches: switches ?? [],
    };

    return runTwoPhase(ctx, {
      operations: ["bindSiteTemplate"],
      plan,
      confirmToken,
      renderPreview: (p) =>
        `Would bind site-template ${p["siteTemplateId"] as string} to site ${p["siteId"] as string}` +
        (((p["switches"] as unknown[] | undefined)?.length ?? 0) > 0
          ? ` · ${(p["switches"] as unknown[]).length} per-switch device-template binding(s)`
          : " · no per-switch bindings"),
      execute: () =>
        ctx.client.call("bindSiteTemplate", {
          path: { omadacId, siteTemplateId },
          body: {
            siteId,
            ...(switches && switches.length > 0 ? { switches } : {}),
          },
        }),
      renderSuccess: (p, result) => {
        const errorCode = (result as { errorCode?: number }).errorCode;
        if (errorCode !== undefined && errorCode !== 0) {
          return `bindSiteTemplate FAILED: errorCode=${errorCode} msg=${(result as { msg?: string }).msg ?? "unknown"}`;
        }
        return `Bound site-template ${p["siteTemplateId"] as string} → site ${p["siteId"] as string}.`;
      },
    });
  },
});
