import { describe, expect, it } from "vitest";
import { z } from "zod";

import { MockAuth, MockTransport, OmadaClient, operations } from "@omada/sdk";
import { rootLogger } from "@omada/shared";

import { ToolRegistry, defineTool, errorResult, textResult } from "../src/registry.js";
import type { ToolContext } from "../src/types.js";

const logger = rootLogger.child("test");

function buildCtx(): ToolContext {
  return {
    client: new OmadaClient({
      auth: new MockAuth(),
      transport: new MockTransport().route({ urlMatch: "", body: {} }),
    }),
    logger,
  };
}

describe("ToolRegistry", () => {
  it("rejects duplicate registration", () => {
    const a = defineTool({
      name: "ping",
      description: "ping",
      inputSchema: z.object({}),
      handler: async () => textResult("pong"),
    });
    const reg = new ToolRegistry().register(a);
    expect(() => reg.register(a)).toThrow(/already registered/);
  });

  it("list() exposes JSON schema, not zod", () => {
    const reg = new ToolRegistry().register(
      defineTool({
        name: "echo",
        description: "echo",
        inputSchema: z.object({ msg: z.string() }),
        handler: async ({ msg }) => textResult(msg),
      }),
    );
    const descriptors = reg.list();
    expect(descriptors).toHaveLength(1);
    const d = descriptors[0]!;
    expect(d.name).toBe("echo");
    expect((d.inputSchema as { type?: string; properties?: { msg?: unknown } }).type).toBe(
      "object",
    );
    expect((d.inputSchema as { properties?: { msg?: unknown } }).properties?.msg).toBeDefined();
  });

  it("call() validates input via zod and returns structured error", async () => {
    const reg = new ToolRegistry().register(
      defineTool({
        name: "shout",
        description: "shout",
        inputSchema: z.object({ text: z.string().min(3) }),
        handler: async ({ text }) => textResult(text.toUpperCase()),
      }),
    );
    const ctx = buildCtx();
    const ok = await reg.call("shout", { text: "hi there" }, ctx);
    expect(ok.isError).toBeUndefined();
    expect(ok.content[0]?.text).toBe("HI THERE");

    const bad = await reg.call("shout", { text: "no" }, ctx);
    expect(bad.isError).toBe(true);
    expect(bad.content[0]?.text).toMatch(/Invalid input for tool "shout"/);
  });

  it("unknown tool returns structured error instead of throwing", async () => {
    const reg = new ToolRegistry();
    const ctx = buildCtx();
    const res = await reg.call("nope", {}, ctx);
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/Unknown tool/);
  });

  it("handler exception becomes structured error", async () => {
    const reg = new ToolRegistry().register(
      defineTool({
        name: "boom",
        description: "boom",
        inputSchema: z.object({}),
        handler: async () => {
          throw new Error("kaboom");
        },
      }),
    );
    const res = await reg.call("boom", {}, buildCtx());
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/kaboom/);
  });
});

describe("canonical operationIds", () => {
  it("getSiteList is present in the generated operations map", () => {
    expect(operations["getSiteList"]).toBeDefined();
    expect(operations["getSiteList"]?.method).toBe("get");
    expect(operations["getSiteList"]?.path).toBe("/openapi/v1/{omadacId}/sites");
  });
});

describe("helpers", () => {
  it("errorResult marks isError and wraps as TextContent", () => {
    const e = errorResult("bad");
    expect(e.isError).toBe(true);
    expect(e.content[0]?.type).toBe("text");
    expect(e.content[0]?.text).toBe("bad");
  });

  it("textResult can carry structured content", () => {
    const r = textResult("ok", { value: 42 });
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent).toEqual({ value: 42 });
  });
});
