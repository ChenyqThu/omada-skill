import { describe, expect, it } from "vitest";

import { MockAuth, MockTransport, OmadaClient } from "@omada/sdk";
import { rootLogger } from "@omada/shared";

import { omadaTopologyTool } from "../src/index.js";

const logger = rootLogger.child("test");

describe("omada_topology tool", () => {
  it("defaults to v3 and renders node / edge counts by kind", async () => {
    const transport = new MockTransport().route({
      urlMatch: "/openapi/v3/oc/sites/s/topology",
      body: {
        errorCode: 0,
        result: {
          nodes: [
            { id: "n1", type: "ap" },
            { id: "n2", type: "ap" },
            { id: "n3", type: "switch" },
          ],
          links: [{ from: "n1", to: "n3" }],
        },
      },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaTopologyTool.handler(
      { omadacId: "oc", siteId: "s", version: "v3" },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    expect(transport.calls[0]?.url).toContain("/openapi/v3/");
    const text = res.content[0]!.text;
    expect(text).toMatch(/3 node\(s\), 1 edge\(s\)/);
    expect(text).toContain("ap: 2");
    expect(text).toContain("switch: 1");
  });

  it("version=v2 calls the legacy endpoint", async () => {
    const transport = new MockTransport().route({
      urlMatch: "/openapi/v2/oc/sites/s/topology",
      body: { errorCode: 0, result: { nodes: [], links: [] } },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaTopologyTool.handler(
      { omadacId: "oc", siteId: "s", version: "v2" },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    expect(transport.calls[0]?.url).toContain("/openapi/v2/");
  });

  it("surfaces errorCode", async () => {
    const transport = new MockTransport().route({
      urlMatch: /\/topology$/,
      body: { errorCode: -40001, msg: "not supported" },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaTopologyTool.handler(
      { omadacId: "oc", siteId: "s", version: "v3" },
      { client, logger },
    );
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/errorCode=-40001/);
  });
});
