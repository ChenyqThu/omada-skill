import { describe, expect, it } from "vitest";

import { MockAuth, MockTransport, OmadaClient } from "@omada/sdk";
import { rootLogger } from "@omada/shared";

import { createDefaultRegistry, omadaListClientsTool } from "../src/index.js";

const logger = rootLogger.child("test");

const SAMPLE_CLIENTS = [
  {
    mac: "11-22-33-44-01",
    name: "laptop-a",
    ip: "10.0.0.100",
    wireless: true,
    ssid: "Corp",
    apName: "AP-1",
  },
  {
    mac: "11-22-33-44-02",
    name: "desk-b",
    ip: "10.0.0.101",
    wireless: false,
    switchName: "SW-1",
    port: 5,
  },
];

describe("omada_list_clients tool", () => {
  it("calls getGridActiveClients with page + pageSize and renders a summary", async () => {
    const transport = new MockTransport().route({
      method: "get",
      urlMatch: "/openapi/v1/oc-abc/sites/site-001/clients",
      body: {
        errorCode: 0,
        msg: "Success",
        result: {
          totalRows: 2,
          currentPage: 1,
          currentSize: 2,
          data: SAMPLE_CLIENTS,
        },
      },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });

    const result = await omadaListClientsTool.handler(
      { omadacId: "oc-abc", siteId: "site-001", page: 1, pageSize: 100 },
      { client, logger },
    );

    expect(result.isError).toBeUndefined();
    expect(transport.calls[0]?.url).toContain("/openapi/v1/oc-abc/sites/site-001/clients");
    expect(transport.calls[0]?.url).toContain("page=1");
    expect(transport.calls[0]?.url).toContain("pageSize=100");

    const text = result.content[0]!.text;
    expect(text).toMatch(/Found 2 client\(s\)/);
    expect(text).toContain("laptop-a");
    expect(text).toContain("wireless (Corp) via AP-1");
    expect(text).toContain("wired (SW-1/port 5)");

    const structured = result.structuredContent as { clients: unknown[]; totalRows: number };
    expect(structured.totalRows).toBe(2);
    expect(structured.clients).toEqual(SAMPLE_CLIENTS);
  });

  it("forwards wirelessOnly as filters.wireless=true", async () => {
    const transport = new MockTransport().route({
      urlMatch: "/openapi/v1/",
      body: { errorCode: 0, result: { data: [], totalRows: 0 } },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    await omadaListClientsTool.handler(
      { omadacId: "oc-abc", siteId: "s", page: 1, pageSize: 10, wirelessOnly: true },
      { client, logger },
    );
    expect(transport.calls[0]?.url).toContain("filters.wireless=true");
  });

  it("surfaces Omada error codes as structured tool errors", async () => {
    const transport = new MockTransport().route({
      urlMatch: "/openapi/v1/",
      body: { errorCode: -1001, msg: "permission denied" },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaListClientsTool.handler(
      { omadacId: "oc-abc", siteId: "s", page: 1, pageSize: 10 },
      { client, logger },
    );
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/errorCode=-1001/);
  });

  it("registered in the default registry and validates siteId", async () => {
    const registry = createDefaultRegistry();
    expect(registry.has("omada_list_clients")).toBe(true);
    const client = new OmadaClient({ auth: new MockAuth(), transport: new MockTransport() });
    const res = await registry.call(
      "omada_list_clients",
      { omadacId: "oc-abc" },
      { client, logger },
    );
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/siteId/);
  });
});
