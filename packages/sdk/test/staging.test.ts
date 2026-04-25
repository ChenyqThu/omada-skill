import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  FetchTransport,
  OAuthTokenStore,
  OmadaClient,
  REGIONS,
  callPaginated,
  createJsonlAuditSink,
} from "../src/index.js";

/**
 * Live-controller integration tests. OFF by default — the suite is excluded
 * from the SDK's default vitest include and gated on OMADA_CLIENT_ID /
 * OMADA_CLIENT_SECRET so CI and casual `pnpm test` runs never touch
 * staging.
 *
 * To run locally:
 *   pnpm test:staging
 * with `.env.local` (or shell env) providing:
 *   OMADA_CLIENT_ID, OMADA_CLIENT_SECRET
 *   OMADA_REGION       (default: use1)
 *   OMADA_BASE_URL     (optional — wins over region)
 *   OMADA_TOKEN_URL    (optional)
 *   OMADA_OMADAC_ID    (required — tests can't discover this)
 *
 * Behaviour under verify: reads real site lists via pagination, runs one
 * dry-run write to prove short-circuiting, and verifies the JsonlAuditSink
 * wrote events to disk. No mutating calls hit the controller.
 */

const creds = {
  clientId: process.env["OMADA_CLIENT_ID"]?.trim(),
  clientSecret: process.env["OMADA_CLIENT_SECRET"]?.trim(),
  omadacId: process.env["OMADA_OMADAC_ID"]?.trim(),
};

const credsAvailable = Boolean(creds.clientId && creds.clientSecret && creds.omadacId);

interface SiteSummary {
  siteId?: string;
  name?: string;
  [key: string]: unknown;
}

describe.skipIf(!credsAvailable)("OmadaClient against staging controller", () => {
  let auditDir: string;
  let client: OmadaClient;

  beforeAll(async () => {
    if (!credsAvailable) return;
    auditDir = await mkdtemp(join(tmpdir(), "omada-staging-audit-"));
    const region = process.env["OMADA_REGION"]?.trim() || "use1";
    const baseUrl =
      process.env["OMADA_BASE_URL"]?.trim() ||
      REGIONS[region as keyof typeof REGIONS] ||
      REGIONS.use1;
    const tokenUrl =
      process.env["OMADA_TOKEN_URL"]?.trim() ||
      `${baseUrl.replace(/\/+$/, "")}/openapi/authorize/token`;

    const transport = new FetchTransport();
    const auth = new OAuthTokenStore(
      {
        clientId: creds.clientId!,
        clientSecret: creds.clientSecret!,
        tokenUrl,
      },
      transport,
    );
    client = new OmadaClient({
      region,
      baseUrl,
      auth,
      transport,
      onAudit: createJsonlAuditSink({
        dir: auditDir,
        onError: (err) => console.error("[staging audit]", err),
      }),
    });
  });

  afterAll(async () => {
    if (auditDir) await rm(auditDir, { recursive: true, force: true });
  });

  it("paginates getSiteList without hand-rolling page loops", async () => {
    const seen: SiteSummary[] = [];
    for await (const batch of callPaginated<SiteSummary>(
      client,
      "getSiteList",
      { path: { omadacId: creds.omadacId! } },
      { pageSize: 50, maxPages: 20 },
    )) {
      seen.push(...batch);
      if (seen.length > 500) break;
    }
    expect(seen.length).toBeGreaterThan(0);
    // First page should at minimum carry an id-like field.
    expect(seen[0]).toBeTypeOf("object");
  }, 30_000);

  it("dry-run short-circuits a write without calling the controller", async () => {
    const dryClient = new OmadaClient({
      region: process.env["OMADA_REGION"]?.trim() || "use1",
      auth: {
        // Fresh auth stub — dry-run must not even try to fetch a token.
        getToken: () => {
          throw new Error("dry-run should not have requested a token");
        },
        invalidate: () => {},
      },
      dryRun: true,
    });
    const result = (await dryClient.call("activeDevice", {
      path: { omadacId: creds.omadacId!, siteId: "fake-site" },
      body: { mac: "aa:bb:cc:dd:ee:ff" },
    })) as { __dryRun: boolean };
    expect(result.__dryRun).toBe(true);
  });

  it("writes every real call into the JsonlAuditSink file", async () => {
    const today = new Date().toISOString().slice(0, 10);
    // Give fire-and-forget appends a moment to flush after the paginated test.
    for (let i = 0; i < 30; i++) {
      try {
        const raw = await readFile(join(auditDir, `${today}.jsonl`), "utf8");
        if (raw.length > 0) {
          const lines = raw.trimEnd().split("\n");
          expect(lines.length).toBeGreaterThan(0);
          const first = JSON.parse(lines[0]!) as { operationId?: string };
          expect(first.operationId).toBeDefined();
          return;
        }
      } catch {
        /* not yet */
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("audit file was never written");
  }, 10_000);
});
