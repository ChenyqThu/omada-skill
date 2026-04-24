import { describe, expect, it } from "vitest";

import { MockAuth, MockTransport, OmadaClient } from "@omada/sdk";
import { rootLogger } from "@omada/shared";

import { createDefaultRegistry, omadaListDevicesTool } from "../src/index.js";

const logger = rootLogger.child("test");

const SAMPLE_DEVICES = [
  { mac: "AA-BB-CC-01", name: "AP-1", model: "EAP670", type: "ap", status: 10, ip: "10.0.0.21" },
  {
    mac: "AA-BB-CC-02",
    name: "SW-1",
    model: "SG2428",
    type: "switch",
    status: 10,
    ip: "10.0.0.31",
  },
  { mac: "AA-BB-CC-03", name: "GW-1", model: "ER7206", type: "gateway", status: 0, ip: "10.0.0.1" },
];

describe("omada_list_devices tool", () => {
  it("calls getAllDeviceBySite and renders devices grouped by kind", async () => {
    const transport = new MockTransport().route({
      method: "get",
      urlMatch: "/openapi/v1/oc-abc/sites/site-001/devices/all",
      body: { errorCode: 0, msg: "Success", result: SAMPLE_DEVICES },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });

    const result = await omadaListDevicesTool.handler(
      { omadacId: "oc-abc", siteId: "site-001" },
      { client, logger },
    );

    expect(result.isError).toBeUndefined();
    expect(transport.calls[0]?.url).toContain("/openapi/v1/oc-abc/sites/site-001/devices/all");

    const text = result.content[0]!.text;
    expect(text).toMatch(/Found 3 device\(s\)/);
    expect(text).toContain("ap (1)");
    expect(text).toContain("switch (1)");
    expect(text).toContain("gateway (1)");
    expect(text).toMatch(/AA-BB-CC-01/);

    const structured = result.structuredContent as { devices: unknown[]; count: number };
    expect(structured.count).toBe(3);
    expect(structured.devices).toEqual(SAMPLE_DEVICES);
  });

  it("surfaces Omada error codes as structured tool errors", async () => {
    const transport = new MockTransport().route({
      urlMatch: "/openapi/v1/",
      body: { errorCode: -1005, msg: "site not found" },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaListDevicesTool.handler(
      { omadacId: "oc-abc", siteId: "missing" },
      { client, logger },
    );
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/errorCode=-1005/);
  });

  it("empty result renders as 'No devices found'", async () => {
    const transport = new MockTransport().route({
      urlMatch: "/openapi/v1/",
      body: { errorCode: 0, result: [] },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaListDevicesTool.handler(
      { omadacId: "oc-abc", siteId: "empty" },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    expect(res.content[0]?.text).toMatch(/No devices found/);
  });

  it("registered in the default registry and validates input", async () => {
    const registry = createDefaultRegistry();
    expect(registry.has("omada_list_devices")).toBe(true);
    const client = new OmadaClient({ auth: new MockAuth(), transport: new MockTransport() });
    const res = await registry.call(
      "omada_list_devices",
      { omadacId: "oc-abc" },
      { client, logger },
    );
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/siteId/);
  });
});
