import {
  FetchTransport,
  MockAuth,
  MockTransport,
  OAuthTokenStore,
  OmadaClient,
  REGIONS,
  SAMPLE_SITES,
  createJsonlAuditSink,
} from "@omada/sdk";
import type { AuditSink } from "@omada/sdk";
import type { Logger } from "@omada/shared";

import type { RuntimeConfig } from "./config.js";

export function buildOmadaClient(cfg: RuntimeConfig, logger: Logger): OmadaClient {
  const sdkLogger = logger.child("sdk");
  const onAudit = buildAuditSink(cfg, sdkLogger);
  if (cfg.mode === "mock") {
    return new OmadaClient({
      region: cfg.region,
      auth: new MockAuth("mock-token"),
      transport: buildMockTransport(),
      logger: sdkLogger,
      dryRun: cfg.dryRun,
      ...(onAudit ? { onAudit } : {}),
    });
  }
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error("internal: real mode requires clientId and clientSecret");
  }
  const baseUrl = cfg.baseUrl ?? REGIONS[cfg.region as keyof typeof REGIONS] ?? REGIONS.use1;
  const tokenUrl = cfg.tokenUrl ?? `${stripTrailingSlash(baseUrl)}/openapi/authorize/token`;
  const transport = new FetchTransport();
  const auth = new OAuthTokenStore(
    { clientId: cfg.clientId, clientSecret: cfg.clientSecret, tokenUrl },
    transport,
  );
  return new OmadaClient({
    region: cfg.region,
    ...(cfg.baseUrl ? { baseUrl: cfg.baseUrl } : {}),
    auth,
    transport,
    logger: sdkLogger,
    dryRun: cfg.dryRun,
    ...(onAudit ? { onAudit } : {}),
  });
}

function buildAuditSink(cfg: RuntimeConfig, logger: Logger): AuditSink | undefined {
  if (!cfg.auditDir) return undefined;
  return createJsonlAuditSink({
    dir: cfg.auditDir,
    onError: (err) => logger.error("audit sink write failed", { err: String(err) }),
  });
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function buildMockTransport(): MockTransport {
  return new MockTransport().route({
    method: "get",
    urlMatch: /\/openapi\/v1\/[^/]+\/sites(\?|$)/,
    body: {
      errorCode: 0,
      msg: "mock",
      result: {
        totalRows: SAMPLE_SITES.length,
        currentPage: 1,
        currentSize: SAMPLE_SITES.length,
        data: SAMPLE_SITES,
      },
    },
  });
}
