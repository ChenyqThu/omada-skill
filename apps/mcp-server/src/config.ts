import type { Logger } from "@omada/shared";

export interface RuntimeConfig {
  mode: "mock" | "real";
  region: string;
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  baseUrl?: string | undefined;
  tokenUrl?: string | undefined;
  dryRun: boolean;
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
  return {
    mode,
    region: env["OMADA_REGION"]?.trim() || "use1",
    clientId,
    clientSecret,
    baseUrl: env["OMADA_BASE_URL"]?.trim() || undefined,
    tokenUrl: env["OMADA_TOKEN_URL"]?.trim() || undefined,
    dryRun: env["OMADA_DRY_RUN"] === "1" || env["OMADA_DRY_RUN"] === "true",
  };
}

export function logConfigSummary(cfg: RuntimeConfig, logger: Logger): void {
  logger.info("omada-mcp starting", {
    mode: cfg.mode,
    region: cfg.region,
    baseUrl: cfg.baseUrl ?? "(region default)",
    dryRun: cfg.dryRun,
  });
  if (cfg.mode === "mock") {
    logger.warn(
      "running in MOCK mode (set OMADA_CLIENT_ID + OMADA_CLIENT_SECRET to switch to real controller)",
    );
  }
}
