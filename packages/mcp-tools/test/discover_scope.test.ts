import { describe, expect, it } from "vitest";

import { MockAuth, MockTransport, OmadaClient } from "@omada/sdk";
import { rootLogger } from "@omada/shared";

import { createDefaultRegistry, omadaDiscoverScopeTool } from "../src/index.js";

const logger = rootLogger.child("test");

describe("omada_discover_scope tool", () => {
  it("single-tenant mode echoes omadacId without a network call", async () => {
    const transport = new MockTransport();
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaDiscoverScopeTool.handler(
      { omadacId: "oc-abc", page: 1, pageSize: 100 },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    expect(transport.calls).toHaveLength(0);
    expect(res.content[0]?.text).toMatch(/Single-tenant scope/);
    expect(res.content[0]?.text).toContain("oc-abc");
    const structured = res.structuredContent as { mode: string; customers: unknown[] };
    expect(structured.mode).toBe("single");
    expect(structured.customers).toEqual([{ omadacId: "oc-abc" }]);
  });

  it("MSP mode calls getCustomerList and summarises customers", async () => {
    const transport = new MockTransport().route({
      method: "get",
      urlMatch: "/openapi/v1/msp/msp-001/customers",
      body: {
        errorCode: 0,
        result: {
          totalRows: 2,
          currentPage: 1,
          data: [
            { name: "Acme Corp", customerId: "cust-1", omadacId: "oc-acme" },
            { name: "Beta Inc", customerId: "cust-2", omadacId: "oc-beta" },
          ],
        },
      },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaDiscoverScopeTool.handler(
      { mspId: "msp-001", page: 1, pageSize: 100 },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    expect(transport.calls[0]?.url).toContain("/openapi/v1/msp/msp-001/customers");
    const text = res.content[0]!.text;
    expect(text).toMatch(/2 customer\(s\)/);
    expect(text).toContain("Acme Corp");
    expect(text).toContain("oc-acme");
    const structured = res.structuredContent as { mode: string; totalRows: number };
    expect(structured.mode).toBe("msp");
    expect(structured.totalRows).toBe(2);
  });

  it("rejects when neither mspId nor omadacId is provided", async () => {
    const registry = createDefaultRegistry();
    expect(registry.has("omada_discover_scope")).toBe(true);
    const client = new OmadaClient({ auth: new MockAuth(), transport: new MockTransport() });
    const res = await registry.call("omada_discover_scope", {}, { client, logger });
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/mspId|omadacId/);
  });

  it("surfaces Omada error codes in MSP mode", async () => {
    const transport = new MockTransport().route({
      urlMatch: "/openapi/v1/",
      body: { errorCode: -1002, msg: "msp not found" },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaDiscoverScopeTool.handler(
      { mspId: "unknown", page: 1, pageSize: 100 },
      { client, logger },
    );
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/errorCode=-1002/);
  });
});
