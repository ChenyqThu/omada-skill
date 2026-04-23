import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Logger } from "@omada/shared";

import type { TransportHandle } from "./stdio.js";

export interface StartHttpOptions {
  server: Server;
  port: number;
  host: string;
  logger: Logger;
  /** Max body size per request, in bytes. Default: 1 MiB. */
  maxBodyBytes?: number;
}

export async function startHttpTransport(opts: StartHttpOptions): Promise<TransportHandle> {
  const { server, port, host, logger } = opts;
  const maxBodyBytes = opts.maxBodyBytes ?? 1_048_576;
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req, res) => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? host}`);
    if (url.pathname !== "/mcp") {
      res.writeHead(404, { "content-type": "text/plain" }).end("Not Found");
      return;
    }

    const sessionId = firstHeader(req.headers["mcp-session-id"]);
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      if (req.method !== "POST") {
        res.writeHead(400, { "content-type": "text/plain" }).end("Missing MCP session");
        return;
      }
      const t = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports.set(sid, t);
          logger.debug("session opened", { sessionId: sid });
        },
      });
      t.onclose = () => {
        const sid = t.sessionId;
        if (sid) {
          transports.delete(sid);
          logger.debug("session closed", { sessionId: sid });
        }
      };
      await server.connect(t);
      transport = t;
    }

    let body: unknown;
    if (req.method === "POST") {
      try {
        body = await readJsonBody(req, maxBodyBytes);
      } catch (err) {
        logger.warn("bad request body", { error: String(err) });
        res.writeHead(400, { "content-type": "application/json" }).end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32700, message: "Parse error" },
            id: null,
          }),
        );
        return;
      }
    }
    await transport.handleRequest(req, res, body);
  });

  await new Promise<void>((resolve) => httpServer.listen(port, host, resolve));
  logger.info("HTTP transport listening", {
    endpoint: `http://${host}:${port}/mcp`,
  });

  const closed = new Promise<void>((resolve) => {
    httpServer.once("close", () => resolve());
  });

  return {
    closed,
    stop: async () => {
      await Promise.allSettled([...transports.values()].map((t) => t.close()));
      transports.clear();
      if (!httpServer.listening) return;
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => {
          if (!err || (err as NodeJS.ErrnoException).code === "ERR_SERVER_NOT_RUNNING") {
            resolve();
          } else {
            reject(err);
          }
        });
      });
    },
  };
}

function setCors(res: ServerResponse): void {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "access-control-allow-headers",
    "content-type, mcp-session-id, mcp-protocol-version, authorization",
  );
  res.setHeader("access-control-expose-headers", "mcp-session-id");
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

async function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > maxBytes) throw new Error(`body exceeds ${maxBytes} bytes`);
    chunks.push(buf);
  }
  if (total === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
