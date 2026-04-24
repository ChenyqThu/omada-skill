import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MockAuth, MockTransport, OmadaClient } from "@omada/sdk";
import { rootLogger } from "@omada/shared";

import { omadaScriptTool } from "../src/index.js";

const logger = rootLogger.child("test");

const PREV_SECRET = process.env["OMADA_MCP_CONFIRM_SECRET"];
beforeAll(() => {
  process.env["OMADA_MCP_CONFIRM_SECRET"] = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaa";
});
afterAll(() => {
  if (PREV_SECRET === undefined) delete process.env["OMADA_MCP_CONFIRM_SECRET"];
  else process.env["OMADA_MCP_CONFIRM_SECRET"] = PREV_SECRET;
});

describe("omada_script tool", () => {
  it("rejects unknown operationIds", async () => {
    const transport = new MockTransport();
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaScriptTool.handler(
      { operationId: "notARealOperation" },
      { client, logger },
    );
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/Unknown operationId/);
    expect(transport.calls).toHaveLength(0);
  });

  it("runs GETs without a confirm handshake", async () => {
    const transport = new MockTransport().route({
      method: "get",
      urlMatch: "/openapi/v1/oc-abc/sites",
      body: { errorCode: 0, result: { data: [] } },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaScriptTool.handler(
      {
        operationId: "getSiteList",
        path: { omadacId: "oc-abc" },
        query: { page: 1, pageSize: 10 },
      },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    expect(transport.calls).toHaveLength(1);
    expect(res.content[0]!.text).toMatch(/ran successfully/);
  });

  it("requires confirm_token for non-GET operations (preview only in phase 1)", async () => {
    const transport = new MockTransport();
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaScriptTool.handler(
      {
        operationId: "rebootDevice",
        path: { omadacId: "oc", siteId: "s", deviceMac: "AA-01" },
      },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    expect(transport.calls).toHaveLength(0);
    expect(res.content[0]!.text).toMatch(/confirm required/);
    expect(res.content[0]!.text).toContain("POST");
  });
});
