import { describe, expect, it } from "vitest";

import { MockAuth, MockTransport, OmadaClient } from "@omada/sdk";
import { rootLogger } from "@omada/shared";

import { omadaWifiDiagnoseTool } from "../src/index.js";

const logger = rootLogger.child("test");

describe("omada_wifi_diagnose tool", () => {
  it("fans out to summary + wifi/client health and renders a condensed view", async () => {
    const transport = new MockTransport()
      .route({
        urlMatch: "/dashboard/wifi-summary",
        body: {
          errorCode: 0,
          result: { apTotal: 8, wirelessClientTotal: 55, retryRate: 3, airTimeUtilRate: 22 },
        },
      })
      .route({
        urlMatch: "/wifi/health/timeline",
        body: { errorCode: 0, result: { healthyTotal: 7, subHealthTotal: 1, unHealthTotal: 0 } },
      })
      .route({
        urlMatch: "/health/client/timeline",
        body: { errorCode: 0, result: { poorSignalTotal: 4, subHealthTotal: 2 } },
      });

    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaWifiDiagnoseTool.handler(
      { omadacId: "oc", siteId: "s" },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    expect(transport.calls).toHaveLength(3);
    const text = res.content[0]!.text;
    expect(text).toMatch(/Wi-Fi diagnosis for site s/);
    expect(text).toContain("APs=8");
    expect(text).toContain("retry=3%");
    expect(text).toContain("healthy=7");
    expect(text).toContain("poorSignal=4");
  });

  it("surfaces errorCode from any sub-call", async () => {
    const transport = new MockTransport()
      .route({
        urlMatch: "/wifi-summary",
        body: { errorCode: 0, result: {} },
      })
      .route({
        urlMatch: "/wifi/health/timeline",
        body: { errorCode: -10010, msg: "insight disabled" },
      })
      .route({
        urlMatch: "/health/client/timeline",
        body: { errorCode: 0, result: {} },
      });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaWifiDiagnoseTool.handler(
      { omadacId: "oc", siteId: "s" },
      { client, logger },
    );
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/errorCode=-10010/);
  });
});
