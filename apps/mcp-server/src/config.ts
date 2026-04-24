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
  return {
    mode,
    region: env["OMADA_REGION"]?.trim() || "use1",
    clientId,
    clientSecret,
    baseUrl: env["OMADA_BASE_URL"]?.trim() || undefined,
    tokenUrl: env["OMADA_TOKEN_URL"]?.trim() || undefined,
    dryRun: env["OMADA_DRY_RUN"] === "1" || env["OMADA_DRY_RUN"] === "true",
    auditDir: auditDirRaw ? expandHome(auditDirRaw) : undefined,
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
  });
  if (cfg.mode === "mock") {
    logger.warn(
      "running in MOCK mode (set OMADA_CLIENT_ID + OMADA_CLIENT_SECRET to switch to real controller)",
    );
  }
}
