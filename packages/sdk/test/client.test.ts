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

  it("resolves euw1 (Europe West) region", () => {
    const client = new OmadaClient({
      region: "euw1",
      auth: new MockAuth(),
      transport: new MockTransport(),
    });
    expect(client.baseUrl).toBe("https://euw1-omada-northbound.tplinkcloud.com");
  });

  it("resolves aps1 (Asia Pacific Singapore) region", () => {
    const client = new OmadaClient({
      region: "aps1",
      auth: new MockAuth(),
      transport: new MockTransport(),
    });
    expect(client.baseUrl).toBe("https://aps1-omada-northbound.tplinkcloud.com");
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
      retry: { maxAttempts: 1 },
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

  it("redacts sensitive keys in audit events using the caller's redactKeys augmentation", async () => {
    const { opId, pathParams } = pickReadOperation();
    const captured: Array<Record<string, unknown>> = [];
    const transport = new MockTransport().route({ urlMatch: "fixture-", body: {} });
    const client = new OmadaClient({
      auth: new MockAuth(),
      transport,
      redactKeys: ["operationId"],
      onAudit: (e) => captured.push(e as unknown as Record<string, unknown>),
    });
    await client.call(opId, { path: pathParams });
    expect(captured).toHaveLength(1);
    expect(captured[0]?.["operationId"]).toBe("[REDACTED]");
    expect(captured[0]?.["path"]).toBe(
      Object.values(operations).find((o) => o.operationId === opId)?.path,
    );
  });

  it("raises on missing path params instead of sending bogus URLs", async () => {
    const { opId } = pickReadOperation();
    const transport = new MockTransport();
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    await expect(client.call(opId, { path: {} })).rejects.toThrow(/Missing path param/);
    expect(transport.calls).toHaveLength(0);
  });

  it("rejects a bogus operationId at call time", async () => {
    const client = new OmadaClient({ auth: new MockAuth(), transport: new MockTransport() });
    await expect(
      client.call("thisOperationDoesNotExist" as unknown as OperationId),
    ).rejects.toThrow(/Unknown operationId/);
  });

  it("refuses construction with a non-https baseUrl unless allowInsecureLoopback is set", () => {
    expect(
      () =>
        new OmadaClient({
          auth: new MockAuth(),
          transport: new MockTransport(),
          baseUrl: "http://evil.example.com",
        }),
    ).toThrow(/Refusing insecure URL/);
    expect(
      () =>
        new OmadaClient({
          auth: new MockAuth(),
          transport: new MockTransport(),
          baseUrl: "http://127.0.0.1:8787",
          allowInsecureLoopback: true,
        }),
    ).not.toThrow();
  });

  it("encodes path param values — no injection via slashes", async () => {
    const { opId, pathParams } = pickReadOperation();
    const dirty = Object.fromEntries(Object.entries(pathParams).map(([k]) => [k, "a/b c?d"]));
    const transport = new MockTransport().route({ urlMatch: "omada", body: {} });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    await client.call(opId, { path: dirty });
    const sent = transport.calls[0]!;
    // The fixture value should be fully URL-encoded — no raw `/`, space, or `?`
    // is allowed to slip through.
    expect(sent.url).toContain("a%2Fb%20c%3Fd");
    expect(sent.url).not.toMatch(/a\/b c\?d/);
  });

  it("sets content-type application/json when a body is present", async () => {
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
    const transport = new MockTransport().route({ urlMatch: "omada", body: { ok: true } });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    await client.call(writeOp, { path: pathParams, body: { foo: 1 } });
    const sent = transport.calls[0]!;
    expect(sent.headers["content-type"]).toBe("application/json");
    expect(sent.body).toBe(JSON.stringify({ foo: 1 }));
  });

  it("ignores stale/past Retry-After headers and falls through to default backoff", async () => {
    // Past HTTP-date shouldn't make the retry immediate. We set retry to 1
    // attempt so the call fails fast; the important property is that the
    // thrown error does NOT carry a zero retryAfterMs that upstream callers
    // would misinterpret as "safe to retry instantly".
    const { opId, pathParams } = pickReadOperation();
    const pastDate = new Date(Date.now() - 60_000).toUTCString();
    const transport = new MockTransport().route({
      urlMatch: "fixture-",
      status: 429,
      headers: { "retry-after": pastDate },
      body: { msg: "slow" },
    });
    const client = new OmadaClient({
      auth: new MockAuth(),
      transport,
      retry: { maxAttempts: 1 },
    });
    const promise = client.call(opId, { path: pathParams });
    await expect(promise).rejects.toThrow(/429/);
    await promise.catch((err) => {
      const maybeRetryAfter = (err as { retryAfterMs?: number }).retryAfterMs;
      expect(maybeRetryAfter).toBeUndefined();
    });
  });
});
