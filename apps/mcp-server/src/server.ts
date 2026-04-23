import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createDefaultRegistry } from "@omada/mcp-tools";
import type { ToolRegistry } from "@omada/mcp-tools";
import type { OmadaClient } from "@omada/sdk";
import type { Logger } from "@omada/shared";

export interface BuildMcpServerOptions {
  client: OmadaClient;
  logger: Logger;
  registry?: ToolRegistry;
}

export function buildMcpServer(opts: BuildMcpServerOptions): Server {
  const registry = opts.registry ?? createDefaultRegistry();
  const server = new Server(
    { name: "omada-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: registry.list().map((d) => ({
      name: d.name,
      ...(d.title !== undefined ? { title: d.title } : {}),
      description: d.description,
      inputSchema: d.inputSchema as Record<string, unknown>,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const result = await registry.call(name, args ?? {}, {
      client: opts.client,
      logger: opts.logger.child("tool"),
    });
    return result as Awaited<ReturnType<Parameters<typeof server.setRequestHandler>[1]>>;
  });

  return server;
}
