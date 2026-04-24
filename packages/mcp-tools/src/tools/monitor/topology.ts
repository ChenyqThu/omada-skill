import { z } from "zod";

import { defineTool, textResult } from "../../registry.js";

const InputSchema = z.object({
  omadacId: z.string().min(1).describe("Omada Controller ID (tenant)."),
  siteId: z.string().min(1).describe("Site ID to render topology for."),
  version: z
    .enum(["v3", "v2"])
    .default("v3")
    .describe("Topology endpoint version. Default v3 (newer); v2 for legacy sites."),
});

export const omadaTopologyTool = defineTool({
  name: "omada_topology",
  title: "Omada site topology",
  description:
    "Fetch a site's topology graph — nodes (devices + uplinks + clients) and " +
    "edges. Returns a terse 'N nodes · M edges' summary with a breakdown per " +
    "node kind, plus the raw graph in structuredContent for downstream viewers " +
    "(MCP Apps). Default v3; pass version=v2 for older controllers.",
  inputSchema: InputSchema,
  handler: async (input, ctx) => {
    const { omadacId, siteId, version } = input;
    ctx.logger.debug("omada_topology", { omadacId, siteId, version });

    const response =
      version === "v2"
        ? await ctx.client.call("getTopology", { path: { omadacId, siteId } })
        : await ctx.client.call("getV3Topology", { path: { omadacId, siteId } });

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

    const graph = (response.result ?? {}) as TopologyGraph;
    return textResult(format(graph, siteId, version), { siteId, version, graph });
  },
});

interface TopologyNode {
  id?: string;
  name?: string;
  type?: string;
  deviceType?: string;
  kind?: string;
  [key: string]: unknown;
}
interface TopologyGraph {
  nodes?: TopologyNode[];
  links?: unknown[];
  edges?: unknown[];
  [key: string]: unknown;
}

function format(graph: TopologyGraph, siteId: string, version: string): string {
  const nodes = graph.nodes ?? [];
  const edges = graph.links ?? graph.edges ?? [];
  if (nodes.length === 0 && edges.length === 0) {
    return `Topology for ${siteId} (${version}) is empty.`;
  }
  const byKind = new Map<string, number>();
  for (const n of nodes) {
    const kind = (n.type ?? n.deviceType ?? n.kind ?? "unknown").toString();
    byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
  }
  const header = `Site ${siteId} topology (${version}): ${nodes.length} node(s), ${edges.length} edge(s)`;
  const breakdown = [...byKind.entries()]
    .sort()
    .map(([k, n]) => `  ${k}: ${n}`)
    .join("\n");
  return `${header}\n${breakdown}`;
}
