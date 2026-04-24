import { describe, expect, it } from "vitest";

import { MockAuth, MockTransport, OmadaClient } from "@omada/sdk";
import { rootLogger } from "@omada/shared";

import { omadaDeviceDetailTool } from "../src/index.js";

const logger = rootLogger.child("test");

describe("omada_device_detail tool", () => {
  it("routes kind=ap to getOverviewDetail (/aps/{apMac})", async () => {
    const transport = new MockTransport().route({
      urlMatch: "/openapi/v1/oc/sites/s/aps/AA-01",
      body: {
        errorCode: 0,
        result: {
          name: "AP-1",
          model: "EAP670",
          firmwareVersion: "5.5.0",
          ip: "10.0.0.21",
          cpuUtil: 22,
          memUtil: 41,
          clients: 14,
          radios: [{}, {}, {}],
        },
      },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaDeviceDetailTool.handler(
      { omadacId: "oc", siteId: "s", kind: "ap", id: "AA-01" },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    expect(transport.calls[0]?.url).toContain("/aps/AA-01");
    const text = res.content[0]!.text;
    expect(text).toMatch(/ap AP-1/);
    expect(text).toContain("cpu=22%");
    expect(text).toContain("Radios: 3");
  });

  it("routes kind=switch to getSwitchInfo (/switches/{switchMac})", async () => {
    const transport = new MockTransport().route({
      urlMatch: "/switches/BB-02",
      body: { errorCode: 0, result: { name: "SW-1", model: "SG2428", portsUsed: 12 } },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaDeviceDetailTool.handler(
      { omadacId: "oc", siteId: "s", kind: "switch", id: "BB-02" },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    expect(res.content[0]!.text).toContain("switch SW-1");
    expect(res.content[0]!.text).toContain("portsUsed=12");
  });

  it("routes kind=gateway to getGatewayInfo_1 (/gateways/{gatewayMac})", async () => {
    const transport = new MockTransport().route({
      urlMatch: "/gateways/CC-03",
      body: { errorCode: 0, result: { name: "GW-1" } },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaDeviceDetailTool.handler(
      { omadacId: "oc", siteId: "s", kind: "gateway", id: "CC-03" },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    expect(transport.calls[0]?.url).toContain("/gateways/CC-03");
  });

  it("routes kind=stack to getOswStackDetail (/stacks/{stackId})", async () => {
    const transport = new MockTransport().route({
      urlMatch: "/stacks/stack-1",
      body: { errorCode: 0, result: { name: "Stack-A" } },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaDeviceDetailTool.handler(
      { omadacId: "oc", siteId: "s", kind: "stack", id: "stack-1" },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    expect(transport.calls[0]?.url).toContain("/stacks/stack-1");
  });

  it("surfaces Omada error codes as structured tool errors", async () => {
    const transport = new MockTransport().route({
      urlMatch: "/openapi/v1/",
      body: { errorCode: -20107, msg: "device not found" },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaDeviceDetailTool.handler(
      { omadacId: "oc", siteId: "s", kind: "ap", id: "missing" },
      { client, logger },
    );
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/errorCode=-20107/);
  });
});
