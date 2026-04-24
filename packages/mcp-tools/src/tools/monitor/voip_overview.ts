import { z } from "zod";

import { defineTool, textResult } from "../../registry.js";

const InputSchema = z.object({
  omadacId: z.string().min(1).describe("Omada Controller ID (tenant)."),
  siteId: z.string().min(1).describe("Site ID whose VoIP config to inspect."),
});

export const omadaVoipOverviewTool = defineTool({
  name: "omada_voip_overview",
  title: "Omada VoIP overview",
  description:
    "Read-only summary of a site's VoIP prioritisation config via getVoip. " +
    "Reports whether prioritisation is enabled and which DSCP / queue " +
    "settings are in play. Use as a preflight before tuning QoS.",
  inputSchema: InputSchema,
  handler: async (input, ctx) => {
    const { omadacId, siteId } = input;
    ctx.logger.debug("omada_voip_overview", { omadacId, siteId });

    const response = await ctx.client.call("getVoip", { path: { omadacId, siteId } });

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

    const voip = (response.result ?? {}) as VoipConfig;
    return textResult(format(voip, siteId), { siteId, voip });
  },
});

interface VoipConfig {
  enable?: boolean;
  dscp?: number | string;
  queue?: number | string;
  priority?: number | string;
  sipPort?: number;
  rtpPortRange?: string;
  [key: string]: unknown;
}

function format(cfg: VoipConfig, siteId: string): string {
  const enabled = cfg.enable === undefined ? "?" : cfg.enable ? "enabled" : "disabled";
  const lines = [`VoIP prioritisation for site ${siteId}: ${enabled}`];
  const extras: string[] = [];
  if (cfg.dscp !== undefined) extras.push(`dscp=${cfg.dscp}`);
  if (cfg.queue !== undefined) extras.push(`queue=${cfg.queue}`);
  if (cfg.priority !== undefined) extras.push(`priority=${cfg.priority}`);
  if (cfg.sipPort !== undefined) extras.push(`sipPort=${cfg.sipPort}`);
  if (cfg.rtpPortRange) extras.push(`rtp=${cfg.rtpPortRange}`);
  if (extras.length) lines.push(`  ${extras.join(" · ")}`);
  return lines.join("\n");
}
