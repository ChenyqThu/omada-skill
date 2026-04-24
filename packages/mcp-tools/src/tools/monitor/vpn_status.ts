import { z } from "zod";

import { defineTool, textResult } from "../../registry.js";

const InputSchema = z.object({
  omadacId: z.string().min(1).describe("Omada Controller ID (tenant)."),
  siteId: z.string().min(1).describe("Site ID to read VPN / tunnel state from."),
});

export const omadaVpnStatusTool = defineTool({
  name: "omada_vpn_status",
  title: "Omada VPN / remote-access tunnel status",
  description:
    "Fetch the site's remote-access tunnel statuses via getTunnelsStatus. " +
    "Returns a per-tunnel summary (name · mode · peer · status · bytes) plus " +
    "the raw array in structuredContent. Read-only.",
  inputSchema: InputSchema,
  handler: async (input, ctx) => {
    const { omadacId, siteId } = input;
    ctx.logger.debug("omada_vpn_status", { omadacId, siteId });

    const response = await ctx.client.call("getTunnelsStatus", {
      path: { omadacId, siteId },
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

    const tunnels = (response.result ?? []) as TunnelStatus[];
    return textResult(format(tunnels, siteId), { siteId, tunnels });
  },
});

interface TunnelStatus {
  name?: string;
  mode?: string;
  type?: string;
  peerAddress?: string;
  localAddress?: string;
  status?: string | number;
  uptimeStr?: string;
  rxBytes?: number;
  txBytes?: number;
  [key: string]: unknown;
}

function format(tunnels: TunnelStatus[], siteId: string): string {
  if (tunnels.length === 0) return `No tunnels configured on site ${siteId}.`;
  const header = `Found ${tunnels.length} tunnel(s) on site ${siteId}:`;
  const bullets = tunnels.slice(0, 50).map((t) => {
    const name = t.name ?? "(unnamed)";
    const mode = t.mode ?? t.type ?? "?";
    const peer = t.peerAddress ?? "?";
    const status = t.status ?? "?";
    const uptime = t.uptimeStr ? ` · up=${t.uptimeStr}` : "";
    const rx = t.rxBytes !== undefined ? ` · rx=${t.rxBytes}` : "";
    const tx = t.txBytes !== undefined ? ` · tx=${t.txBytes}` : "";
    return `  • ${name} — ${mode} peer=${peer} · ${status}${uptime}${rx}${tx}`;
  });
  const more = tunnels.length > 50 ? `\n  … ${tunnels.length - 50} more tunnels omitted.` : "";
  return [header, ...bullets].join("\n") + more;
}
