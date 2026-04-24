import { describe, expect, it } from "vitest";

import { MockAuth, MockTransport, OmadaClient } from "@omada/sdk";
import { rootLogger } from "@omada/shared";

import { omadaSiteOverviewTool } from "../src/index.js";

const logger = rootLogger.child("test");

describe("omada_site_overview tool", () => {
  it("merges getSiteEntity + getOverview into a summary", async () => {
    const transport = new MockTransport()
      .route({
        urlMatch: /\/openapi\/v1\/oc-abc\/sites\/site-001$/,
        body: {
          errorCode: 0,
          result: { name: "HQ", region: "USA", scenario: "Office" },
        },
      })
      .route({
        urlMatch: "/openapi/v1/oc-abc/sites/site-001/dashboard/overview-diagram",
        body: {
          errorCode: 0,
          result: {
            deviceTotal: 12,
            deviceConnectedTotal: 11,
            deviceDisconnectedTotal: 1,
            apTotal: 8,
            switchTotal: 3,
            gatewayTotal: 1,
            clientTotal: 64,
            wirelessClientTotal: 55,
            wiredClientTotal: 9,
            deviceAlertsTotal: 2,
          },
        },
      });
    const client = new OmadaClient({ auth: new MockAuth(), transport });

    const res = await omadaSiteOverviewTool.handler(
      { omadacId: "oc-abc", siteId: "site-001" },
      { client, logger },
    );

    expect(res.isError).toBeUndefined();
    expect(transport.calls).toHaveLength(2);
    const text = res.content[0]!.text;
    expect(text).toMatch(/Site HQ/);
    expect(text).toMatch(/total=12/);
    expect(text).toMatch(/connected=11/);
    expect(text).toContain("APs=8");
    expect(text).toContain("wireless=55");
    expect(text).toContain("deviceAlertsTotal=2");

    const structured = res.structuredContent as { entity: unknown; overview: unknown };
    expect(structured.entity).toMatchObject({ name: "HQ" });
    expect(structured.overview).toMatchObject({ deviceTotal: 12 });
  });

  it("returns an error when either underlying call has errorCode != 0", async () => {
    const transport = new MockTransport()
      .route({
        urlMatch: /\/openapi\/v1\/oc\/sites\/s$/,
        body: { errorCode: 0, result: { name: "S" } },
      })
      .route({
        urlMatch: "/dashboard/overview-diagram",
        body: { errorCode: -1009, msg: "dashboard unavailable" },
      });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaSiteOverviewTool.handler(
      { omadacId: "oc", siteId: "s" },
      { client, logger },
    );
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/errorCode=-1009/);
  });
});
