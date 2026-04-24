import { describe, expect, it } from "vitest";

import { MockAuth, MockTransport, OmadaClient } from "@omada/sdk";
import { rootLogger } from "@omada/shared";

import { omadaClientJourneyTool } from "../src/index.js";

const logger = rootLogger.child("test");

describe("omada_client_journey tool", () => {
  it("pairs detail with connection history", async () => {
    const transport = new MockTransport()
      .route({
        urlMatch: /\/sites\/s\/clients\/AA-01$/,
        body: {
          errorCode: 0,
          result: { name: "laptop", ip: "10.0.0.100", ssid: "Corp", apName: "AP-1" },
        },
      })
      .route({
        urlMatch: /\/sites\/s\/clients\/AA-01\/client-connection$/,
        body: {
          errorCode: 0,
          result: [
            { timestamp: 1_700_000_000_000, action: "connect", apName: "AP-1", ssid: "Corp" },
            { timestamp: 1_700_000_100_000, action: "roam", apName: "AP-2", ssid: "Corp" },
          ],
        },
      });
    const client = new OmadaClient({ auth: new MockAuth(), transport });

    const res = await omadaClientJourneyTool.handler(
      { omadacId: "oc", siteId: "s", clientMac: "AA-01", includeDetail: true },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    expect(transport.calls).toHaveLength(2);
    const text = res.content[0]!.text;
    expect(text).toContain("laptop");
    expect(text).toContain("Journey: 2 event(s)");
    expect(text).toContain("roam @ AP-2");

    const structured = res.structuredContent as { journey: unknown[]; detail: unknown };
    expect(structured.journey).toHaveLength(2);
    expect(structured.detail).toMatchObject({ ssid: "Corp" });
  });

  it("skips detail fetch when includeDetail=false", async () => {
    const transport = new MockTransport().route({
      urlMatch: "/client-connection",
      body: { errorCode: 0, result: [] },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaClientJourneyTool.handler(
      { omadacId: "oc", siteId: "s", clientMac: "AA-01", includeDetail: false },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]?.url).toContain("/client-connection");
  });

  it("surfaces errorCode from the journey call", async () => {
    const transport = new MockTransport()
      .route({
        urlMatch: /\/clients\/AA-01$/,
        body: { errorCode: 0, result: {} },
      })
      .route({
        urlMatch: "/client-connection",
        body: { errorCode: -30104, msg: "client not found" },
      });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaClientJourneyTool.handler(
      { omadacId: "oc", siteId: "s", clientMac: "AA-01", includeDetail: true },
      { client, logger },
    );
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/errorCode=-30104/);
  });
});
