import { randomUUID, timingSafeEqual } from "node:crypto";
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
  /**
   * Shared bearer expected in `Authorization: Bearer <token>`. Required unless
   * `host` is loopback — binding to a non-loopback interface without a bearer
   * is refused at startup to avoid accidentally exposing the Omada controller
   * to the local network.
   */
  bearer?: string | undefined;
  /**
   * Allowed `Origin` values. Requests from origins not in this list are
   * rejected. Same-origin CLI callers (no Origin header) are always accepted.
   * Used both for the pre-flight/`access-control-allow-origin` echo and the
   * per-request origin check that guards against drive-by CSRF from a browser
   * tab on the same machine.
   */
  allowedOrigins?: readonly string[];
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

function isLoopbackBind(host: string): boolean {
  if (LOOPBACK_HOSTS.has(host)) return true;
  return /^127(?:\.\d{1,3}){3}$/.test(host);
}

function safeBearerEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function startHttpTransport(opts: StartHttpOptions): Promise<TransportHandle> {
  const { server, port, host, logger } = opts;
  const maxBodyBytes = opts.maxBodyBytes ?? 1_048_576;
  const bearer = opts.bearer;
  const allowedOrigins = new Set(opts.allowedOrigins ?? []);
  const transports = new Map<string, StreamableHTTPServerTransport>();

  if (!isLoopbackBind(host) && !bearer) {
    throw new Error(
      `Refusing to start HTTP transport on non-loopback host "${host}" without OMADA_MCP_BEARER. ` +
        `Set OMADA_MCP_BEARER to a high-entropy shared secret, or bind to 127.0.0.1.`,
    );
  }

  const expectedHostPrefixes = new Set<string>([
    `${host}:${port}`,
    // Well-formed Host header for default ports is just the host, but node's
    // http parser preserves `:port` — we only need the exact bound pair.
  ]);

  const httpServer = createServer(async (req, res) => {
    const origin = firstHeader(req.headers["origin"]);
    setCors(res, origin, allowedOrigins);

    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    // Reject cross-origin requests before doing any work: browsers send an
    // `Origin` on cross-site fetches, so the presence of a non-allowlisted
    // origin means the caller is not same-origin.
    if (origin !== undefined && !allowedOrigins.has(origin)) {
      logger.warn("rejected origin", { origin });
      res.writeHead(403, { "content-type": "text/plain" }).end("Forbidden origin");
      return;
    }

    // Block DNS rebinding by verifying the Host header matches what we bound.
    const hostHeader = firstHeader(req.headers["host"]);
    if (!hostHeader || !expectedHostPrefixes.has(hostHeader)) {
      logger.warn("rejected host header", { host: hostHeader });
      res.writeHead(421, { "content-type": "text/plain" }).end("Misdirected request");
      return;
    }

    if (bearer !== undefined) {
      const provided = firstHeader(req.headers["authorization"]);
      if (!provided || !provided.startsWith("Bearer ")) {
        res.writeHead(401, { "content-type": "text/plain" }).end("Missing bearer");
        return;
      }
      if (!safeBearerEqual(provided.slice("Bearer ".length), bearer)) {
        res.writeHead(401, { "content-type": "text/plain" }).end("Bad bearer");
        return;
      }
    }

    const url = new URL(req.url ?? "/", `http://${hostHeader}`);
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
    bearerRequired: bearer ? true : false,
    allowedOrigins: allowedOrigins.size > 0 ? [...allowedOrigins] : "(same-origin only)",
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

function setCors(
  res: ServerResponse,
  origin: string | undefined,
  allowed: ReadonlySet<string>,
): void {
  // Echo the caller's Origin only when it is in the allowlist. Without an
  // explicit allowlist, we refuse to echo an origin — preventing the previous
  // `*` default from granting credentials-bearing cross-origin access.
  if (origin !== undefined && allowed.has(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "origin");
    res.setHeader("access-control-allow-credentials", "true");
  }
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
