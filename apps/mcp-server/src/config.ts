import { homedir } from "node:os";

import type { Logger } from "@omada/shared";

export interface RuntimeConfig {
  mode: "mock" | "real";
  region: string;
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  baseUrl?: string | undefined;
  tokenUrl?: string | undefined;
  dryRun: boolean;
  /**
   * Directory for daily audit JSONL files. Unset disables file audit (M1
   * behaviour — audit events stay in-memory unless a caller wires a sink).
   * `~` expands to `os.homedir()`.
   */
  auditDir?: string | undefined;
  /**
   * Dev-only escape hatch: permit http:// URLs for baseUrl/tokenUrl when they
   * resolve to loopback. Never set in production; the SDK will otherwise refuse
   * to send client credentials over plaintext.
   */
  allowInsecureLoopback: boolean;
  /**
   * HTTP transport — shared bearer required for every request. Leaving this
   * unset binds to 127.0.0.1 only (see httpHost); exposing the server to any
   * other interface without setting a bearer is refused at startup.
   */
  httpBearer?: string | undefined;
  /**
   * HTTP transport — comma-separated allowlist of origins that may call `/mcp`.
   * When unset, only same-origin (no Origin header) requests are accepted.
   */
  httpAllowedOrigins: readonly string[];
  /**
   * HTTP transport — host to bind to. Defaults to "127.0.0.1".
   */
  httpHost: string;
  /**
   * HTTP transport — TCP port. Defaults to 8787.
   */
  httpPort: number;
}

/**
 * Reads runtime configuration from environment variables.
 * Falls back to "mock" mode when OMADA_CLIENT_ID / OMADA_CLIENT_SECRET
 * are missing — useful for local Claude Desktop demos and CI smoke tests.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const clientId = env["OMADA_CLIENT_ID"]?.trim() || undefined;
  const clientSecret = env["OMADA_CLIENT_SECRET"]?.trim() || undefined;
  const mode: "mock" | "real" = clientId && clientSecret ? "real" : "mock";
  const auditDirRaw = env["OMADA_AUDIT_DIR"]?.trim() || undefined;
  const httpAllowedOriginsRaw = env["OMADA_MCP_ALLOWED_ORIGINS"]?.trim() ?? "";
  const httpBearer = env["OMADA_MCP_BEARER"]?.trim() || undefined;
  const httpHost = env["OMADA_MCP_HOST"]?.trim() || "127.0.0.1";
  const httpPort = Number.parseInt(env["OMADA_MCP_PORT"]?.trim() || "8787", 10);
  if (!Number.isFinite(httpPort) || httpPort < 1 || httpPort > 65_535) {
    throw new Error(`invalid OMADA_MCP_PORT "${env["OMADA_MCP_PORT"]}"`);
  }
  return {
    mode,
    region: env["OMADA_REGION"]?.trim() || "use1",
    clientId,
    clientSecret,
    baseUrl: env["OMADA_BASE_URL"]?.trim() || undefined,
    tokenUrl: env["OMADA_TOKEN_URL"]?.trim() || undefined,
    dryRun: env["OMADA_DRY_RUN"] === "1" || env["OMADA_DRY_RUN"] === "true",
    auditDir: auditDirRaw ? expandHome(auditDirRaw) : undefined,
    allowInsecureLoopback:
      env["OMADA_ALLOW_INSECURE_LOOPBACK"] === "1" ||
      env["OMADA_ALLOW_INSECURE_LOOPBACK"] === "true",
    httpBearer,
    httpAllowedOrigins: httpAllowedOriginsRaw
      ? httpAllowedOriginsRaw
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : [],
    httpHost,
    httpPort,
  };
}

function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return `${homedir()}${path.slice(1)}`;
  return path;
}

export function logConfigSummary(cfg: RuntimeConfig, logger: Logger): void {
  logger.info("omada-mcp starting", {
    mode: cfg.mode,
    region: cfg.region,
    baseUrl: cfg.baseUrl ?? "(region default)",
    dryRun: cfg.dryRun,
    auditDir: cfg.auditDir ?? "(disabled)",
    httpHost: cfg.httpHost,
    httpPort: cfg.httpPort,
    httpBearerSet: cfg.httpBearer ? true : false,
    httpAllowedOrigins: cfg.httpAllowedOrigins.length > 0 ? cfg.httpAllowedOrigins : "(none)",
  });
  if (cfg.mode === "mock") {
    logger.warn(
      "running in MOCK mode (set OMADA_CLIENT_ID + OMADA_CLIENT_SECRET to switch to real controller)",
    );
  }
  if (cfg.allowInsecureLoopback) {
    logger.warn(
      "OMADA_ALLOW_INSECURE_LOOPBACK is ON — http:// URLs pointing at loopback will be accepted. Never use in production.",
    );
  }
}
