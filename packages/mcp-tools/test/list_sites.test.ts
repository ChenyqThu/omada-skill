import { describe, expect, it } from "vitest";

import { MockAuth, MockTransport, OmadaClient, SAMPLE_SITES } from "@omada/sdk";
import { rootLogger } from "@omada/shared";

import { createDefaultRegistry, omadaListSitesTool } from "../src/index.js";
import type { ToolRegistry } from "../src/index.js";

const logger = rootLogger.child("test");

describe("omada_list_sites tool", () => {
  it("calls getSiteList with path + pagination and renders a summary", async () => {
    const transport = new MockTransport().route({
      method: "get",
      urlMatch: "/openapi/v1/oc-abc/sites",
      body: {
        errorCode: 0,
        msg: "Success",
        result: {
          totalRows: SAMPLE_SITES.length,
          currentPage: 1,
          currentSize: SAMPLE_SITES.length,
          data: SAMPLE_SITES,
        },
      },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });

    const result = await omadaListSitesTool.handler(
      { omadacId: "oc-abc", page: 1, pageSize: 50 },
      { client, logger },
    );

    expect(result.isError).toBeUndefined();
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]?.url).toContain("/openapi/v1/oc-abc/sites");
    expect(transport.calls[0]?.url).toContain("page=1");
    expect(transport.calls[0]?.url).toContain("pageSize=50");

    const text = result.content[0]!.text;
    expect(text).toMatch(/Found 3 site\(s\)/);
    for (const site of SAMPLE_SITES) {
      expect(text).toContain(site.name);
      expect(text).toContain(site.siteId);
    }

    const structured = result.structuredContent as { sites: unknown[]; totalRows: number };
    expect(structured.totalRows).toBe(3);
    expect(structured.sites).toEqual(SAMPLE_SITES);
  });

  it("surfaces Omada error codes as structured tool errors", async () => {
    const transport = new MockTransport().route({
      urlMatch: "/openapi/v1/",
      body: { errorCode: -1001, msg: "permission denied" },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaListSitesTool.handler(
      { omadacId: "oc-xyz", page: 1, pageSize: 10 },
      { client, logger },
    );
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/errorCode=-1001/);
    expect(res.content[0]?.text).toMatch(/permission denied/);
  });

  it("empty result renders as 'No sites found'", async () => {
    const transport = new MockTransport().route({
      urlMatch: "/openapi/v1/",
      body: { errorCode: 0, result: { totalRows: 0, data: [] } },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaListSitesTool.handler(
      { omadacId: "oc-abc", page: 1, pageSize: 10 },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    expect(res.content[0]?.text).toMatch(/No sites found/);
  });

  it("zod schema applied via registry rejects missing omadacId", async () => {
    const registry: ToolRegistry = createDefaultRegistry();
    const client = new OmadaClient({
      auth: new MockAuth(),
      transport: new MockTransport(),
    });
    const res = await registry.call("omada_list_sites", {}, { client, logger });
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/omadacId/);
  });
});
