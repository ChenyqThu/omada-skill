import { describe, expect, it } from "vitest";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MockAuth, MockTransport, OmadaClient, SAMPLE_SITES } from "@omada/sdk";
import { rootLogger } from "@omada/shared";

import { buildMcpServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { buildOmadaClient } from "../src/buildClient.js";

async function connectPair() {
  const transport = new MockTransport().route({
    method: "get",
    urlMatch: "/openapi/v1/",
    body: {
      errorCode: 0,
      msg: "mock",
      result: {
        totalRows: SAMPLE_SITES.length,
        currentPage: 1,
        currentSize: SAMPLE_SITES.length,
        data: SAMPLE_SITES,
      },
    },
  });
  const omada = new OmadaClient({ auth: new MockAuth(), transport });
  const server = buildMcpServer({ client: omada, logger: rootLogger.child("test") });

  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  const mcp = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), mcp.connect(clientSide)]);
  return { mcp, omada };
}

describe("omada-mcp over the MCP protocol", () => {
  it("exposes omada_list_sites in tools/list with a JSON schema", async () => {
    const { mcp } = await connectPair();
    const { tools } = await mcp.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("omada_list_sites");

    const listTool = tools.find((t) => t.name === "omada_list_sites");
    expect(listTool).toBeDefined();
    expect(listTool?.description).toMatch(/List sites/);
    const schema = listTool?.inputSchema as { type?: string; properties?: Record<string, unknown> };
    expect(schema?.type).toBe("object");
    expect(schema?.properties).toHaveProperty("omadacId");
    expect(schema?.properties).toHaveProperty("page");
    expect(schema?.properties).toHaveProperty("pageSize");
  });

  it("invokes omada_list_sites and renders the SAMPLE_SITES summary", async () => {
    const { mcp } = await connectPair();
    const result = await mcp.callTool({
      name: "omada_list_sites",
      arguments: { omadacId: "mock-omadac", page: 1, pageSize: 10 },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe("text");
    expect(content[0]?.text).toMatch(/Found 3 site\(s\)/);
    expect(content[0]?.text).toContain("HQ — San Jose");
  });

  it("zod validation failure is surfaced as an isError tool result", async () => {
    const { mcp } = await connectPair();
    const result = await mcp.callTool({
      name: "omada_list_sites",
      arguments: {},
    });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(text).toMatch(/omadacId/);
  });

  it("unknown tool returns an isError result rather than throwing", async () => {
    const { mcp } = await connectPair();
    const result = await mcp.callTool({ name: "does_not_exist", arguments: {} });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text).toMatch(/Unknown tool/);
  });
});

describe("config + buildOmadaClient", () => {
  it("loadConfig() chooses mock mode without credentials", () => {
    const cfg = loadConfig({});
    expect(cfg.mode).toBe("mock");
    expect(cfg.region).toBe("use1");
    expect(cfg.dryRun).toBe(false);
  });

  it("loadConfig() chooses real mode when both creds are present", () => {
    const cfg = loadConfig({
      OMADA_CLIENT_ID: "id",
      OMADA_CLIENT_SECRET: "sec",
      OMADA_REGION: "use1",
      OMADA_DRY_RUN: "1",
    });
    expect(cfg.mode).toBe("real");
    expect(cfg.dryRun).toBe(true);
    expect(cfg.clientId).toBe("id");
  });

  it("buildOmadaClient() in mock mode talks to the built-in fixture", async () => {
    const cfg = loadConfig({});
    const client = buildOmadaClient(cfg, rootLogger.child("test"));
    const result = (await client.call("getSiteList", {
      path: { omadacId: "mock-omadac" },
      query: { page: 1, pageSize: 10 },
    })) as {
      errorCode: number;
      result: { data: unknown[] };
    };
    expect(result.errorCode).toBe(0);
    expect(result.result.data).toHaveLength(SAMPLE_SITES.length);
  });
});
