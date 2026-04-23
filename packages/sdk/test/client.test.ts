import { describe, expect, it } from "vitest";

import {
  MockAuth,
  MockTransport,
  OmadaClient,
  SAMPLE_SITES,
  operations,
  type OperationId,
} from "../src/index.js";

/**
 * Picks a deterministic read-only operation whose path is parameterised by
 * `{omadacId}` — this guarantees the tests exercise path interpolation and
 * query serialisation without hard-coding an operationId that may drift.
 */
function pickReadOperation(): { opId: OperationId; pathParams: Record<string, string> } {
  for (const op of Object.values(operations)) {
    if (op.method !== "get") continue;
    const placeholders = [...op.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!);
    if (placeholders.length === 0) continue;
    // Every slot gets a recognisable fixture value.
    const pathParams: Record<string, string> = {};
    for (const name of placeholders) pathParams[name] = `fixture-${name}`;
    return { opId: op.operationId as OperationId, pathParams };
  }
  throw new Error("generated operations had no parameterised GET — spec shape changed?");
}

describe("OmadaClient", () => {
  it("resolves use1 base URL by default", () => {
    const client = new OmadaClient({ auth: new MockAuth(), transport: new MockTransport() });
    expect(client.baseUrl).toBe("https://use1-omada-northbound.tplinkcloud.com");
  });

  it("interpolates path params, appends query, attaches bearer token", async () => {
    const { opId, pathParams } = pickReadOperation();
    const transport = new MockTransport().route({
      urlMatch: "fixture-",
      body: { errorCode: 0, result: SAMPLE_SITES },
    });
    const client = new OmadaClient({
      auth: new MockAuth("test-token-42"),
      transport,
    });

    const result = await client.call(opId, {
      path: pathParams,
      query: { page: 2, pageSize: 25, include: undefined },
    });

    expect(result).toEqual({ errorCode: 0, result: SAMPLE_SITES });
    expect(transport.calls).toHaveLength(1);
    const sent = transport.calls[0]!;
    expect(sent.url).toContain("https://use1-omada-northbound.tplinkcloud.com");
    for (const [name, value] of Object.entries(pathParams)) {
      expect(sent.url).toContain(value);
      expect(sent.url).not.toContain(`{${name}}`);
    }
    expect(sent.url).toContain("page=2");
    expect(sent.url).toContain("pageSize=25");
    expect(sent.url).not.toContain("include=");
    expect(sent.headers["authorization"]).toBe("Bearer test-token-42");
    expect(sent.headers["accept"]).toBe("application/json");
  });

  it("throws OmadaAuthError and invalidates cache on 401", async () => {
    const { opId, pathParams } = pickReadOperation();
    let invalidated = 0;
    const auth: InstanceType<typeof MockAuth> = Object.assign(new MockAuth(), {
      invalidate: () => {
        invalidated += 1;
      },
    });
    const transport = new MockTransport().route({
      urlMatch: "fixture-",
      status: 401,
      body: { errorCode: -401, msg: "unauthorized" },
    });
    const client = new OmadaClient({ auth, transport });
    await expect(client.call(opId, { path: pathParams })).rejects.toThrow(/401/);
    expect(invalidated).toBe(1);
  });

  it("dry-run short-circuits write operations without hitting transport", async () => {
    let writeOp: OperationId | undefined;
    let pathParams: Record<string, string> | undefined;
    for (const op of Object.values(operations)) {
      if (op.method === "get") continue;
      const placeholders = [...op.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!);
      if (placeholders.length === 0) continue;
      writeOp = op.operationId as OperationId;
      pathParams = Object.fromEntries(placeholders.map((n) => [n, "x"]));
      break;
    }
    if (!writeOp || !pathParams) throw new Error("no write op found — spec shape changed?");

    const transport = new MockTransport();
    const client = new OmadaClient({
      auth: new MockAuth(),
      transport,
      dryRun: true,
    });
    const result = (await client.call(writeOp, { path: pathParams, body: { foo: 1 } })) as {
      __dryRun: boolean;
      operationId: string;
    };
    expect(result.__dryRun).toBe(true);
    expect(result.operationId).toBe(writeOp);
    expect(transport.calls).toHaveLength(0);
  });

  it("fires audit sink on success and on error", async () => {
    const { opId, pathParams } = pickReadOperation();
    const events: Array<{ operationId: string; status?: number; error?: string }> = [];
    const okTransport = new MockTransport().route({ urlMatch: "fixture-", body: {} });
    const okClient = new OmadaClient({
      auth: new MockAuth(),
      transport: okTransport,
      onAudit: (e) =>
        events.push({
          operationId: e.operationId,
          ...(e.status !== undefined ? { status: e.status } : {}),
          ...(e.error !== undefined ? { error: e.error } : {}),
        }),
    });
    await okClient.call(opId, { path: pathParams });
    expect(events).toHaveLength(1);
    expect(events[0]?.status).toBe(200);
    expect(events[0]?.error).toBeUndefined();

    const errTransport = new MockTransport().route({
      urlMatch: "fixture-",
      status: 429,
      headers: { "retry-after": "2" },
      body: { msg: "slow down" },
    });
    const errClient = new OmadaClient({
      auth: new MockAuth(),
      transport: errTransport,
      onAudit: (e) =>
        events.push({
          operationId: e.operationId,
          ...(e.status !== undefined ? { status: e.status } : {}),
          ...(e.error !== undefined ? { error: e.error } : {}),
        }),
    });
    await expect(errClient.call(opId, { path: pathParams })).rejects.toThrow(/429/);
    expect(events).toHaveLength(2);
    expect(events[1]?.status).toBe(429);
    expect(events[1]?.error).toBe("rateLimit");
  });

  it("raises on missing path params instead of sending bogus URLs", async () => {
    const { opId } = pickReadOperation();
    const transport = new MockTransport();
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    await expect(client.call(opId, { path: {} })).rejects.toThrow(/Missing path param/);
    expect(transport.calls).toHaveLength(0);
  });
});
