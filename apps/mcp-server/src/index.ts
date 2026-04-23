#!/usr/bin/env node
/**
 * omada-mcp — MCP server for TP-Link Omada Controller.
 *
 * Usage:
 *   omada-mcp [--stdio | --http] [--port N] [--host H]
 */
import { parseArgs } from "node:util";

import { rootLogger } from "@omada/shared";
import type { Logger } from "@omada/shared";

import { buildOmadaClient } from "./buildClient.js";
import { loadConfig, logConfigSummary } from "./config.js";
import { buildMcpServer } from "./server.js";
import { startHttpTransport } from "./transport/http.js";
import { startStdioTransport } from "./transport/stdio.js";
import type { TransportHandle } from "./transport/stdio.js";

const HELP = `omada-mcp — MCP server for TP-Link Omada Controller

Usage:
  omada-mcp [--stdio | --http] [--port N] [--host HOST]

Options:
  --stdio           Run in stdio mode (default; for Claude Desktop, Cursor)
  --http            Run in HTTP + SSE mode (for remote agents, web Claude)
  --port N          HTTP port (default 8787)
  --host HOST       HTTP host (default 127.0.0.1)
  -h, --help        Show this help

Environment:
  OMADA_CLIENT_ID      OAuth client ID (omit for mock mode)
  OMADA_CLIENT_SECRET  OAuth client secret
  OMADA_REGION         Omada region (default: use1)
  OMADA_BASE_URL       Override controller base URL
  OMADA_TOKEN_URL      Override OAuth token endpoint
  OMADA_DRY_RUN        Set to "1" to dry-run all write operations

Without OMADA_CLIENT_ID + OMADA_CLIENT_SECRET the server starts in
MOCK mode with fixture data — useful for offline development.
`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      stdio: { type: "boolean" },
      http: { type: "boolean" },
      port: { type: "string", short: "p" },
      host: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: false,
  });

  if (values.help) {
    process.stdout.write(HELP);
    return;
  }

  const mode: "stdio" | "http" = values.http ? "http" : "stdio";
  const logger: Logger = rootLogger.child("server");
  const config = loadConfig();
  logConfigSummary(config, logger);

  const client = buildOmadaClient(config, logger);
  const server = buildMcpServer({ client, logger });

  let handle: TransportHandle;
  if (mode === "http") {
    const port = parsePort(values.port);
    const host = typeof values.host === "string" && values.host ? values.host : "127.0.0.1";
    handle = await startHttpTransport({ server, port, host, logger });
  } else {
    handle = await startStdioTransport({ server, logger });
  }

  await waitForShutdown(handle, logger);
  logger.info("server stopped");
}

function parsePort(raw: unknown): number {
  const asString = typeof raw === "string" ? raw : "8787";
  const port = Number.parseInt(asString, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65_535) {
    throw new Error(`invalid --port "${asString}"`);
  }
  return port;
}

async function waitForShutdown(handle: TransportHandle, logger: Logger): Promise<void> {
  let shuttingDown = false;
  const shutdown = async (reason: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("shutting down", { reason });
    try {
      await handle.stop();
    } catch (err) {
      logger.error("stop failed", { error: String(err) });
    }
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  await Promise.race([
    handle.closed.then(() => shutdown("transport closed")),
    new Promise<void>((resolve) => {
      process.once("SIGINT", () => resolve());
      process.once("SIGTERM", () => resolve());
    }),
  ]);
}

main().catch((err) => {
  process.stderr.write(
    `[omada-mcp] fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  );
  process.exit(1);
});
