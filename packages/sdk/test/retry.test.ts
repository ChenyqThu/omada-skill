import { describe, expect, it } from "vitest";

import { MockAuth, OmadaClient, operations, type OperationId } from "../src/index.js";
import type { HttpRequest, HttpResponse, Transport } from "../src/index.js";

/**
 * Transport that replays a pre-programmed sequence of responses, one per
 * `send()` call. Used to exercise the retry pipeline without time jitter from
 * the routed MockTransport.
 */
class SequenceTransport implements Transport {
  private index = 0;
  public readonly calls: HttpRequest[] = [];
  constructor(private readonly responses: HttpResponse[]) {}
  async send(req: HttpRequest): Promise<HttpResponse> {
    this.calls.push(req);
    const i = Math.min(this.index, this.responses.length - 1);
    this.index += 1;
    return this.responses[i]!;
  }
}

function pickReadOperation(): { opId: OperationId; pathParams: Record<string, string> } {
  for (const op of Object.values(operations)) {
    if (op.method !== "get") continue;
    const placeholders = [...op.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!);
    if (placeholders.length === 0) continue;
    const pathParams: Record<string, string> = {};
    for (const name of placeholders) pathParams[name] = `fixture-${name}`;
    return { opId: op.operationId as OperationId, pathParams };
  }
  throw new Error("generated operations had no parameterised GET — spec shape changed?");
}

describe("OmadaClient retry integration", () => {
  it("retries on 429 then succeeds, auditing once with final 200", async () => {
    const { opId, pathParams } = pickReadOperation();
    const transport = new SequenceTransport([
      { status: 429, headers: { "retry-after": "0" }, body: { msg: "slow" } },
      { status: 429, headers: { "retry-after": "0" }, body: { msg: "slow" } },
      { status: 200, headers: { "content-type": "application/json" }, body: { ok: true } },
    ]);
    const events: Array<{ status?: number; error?: string }> = [];
    const client = new OmadaClient({
      auth: new MockAuth(),
      transport,
      retry: { maxAttempts: 3, baseDelayMs: 1, jitter: false },
      onAudit: (e) =>
        events.push({
          ...(e.status !== undefined ? { status: e.status } : {}),
          ...(e.error !== undefined ? { error: e.error } : {}),
        }),
    });

    const result = await client.call(opId, { path: pathParams });
    expect(result).toEqual({ ok: true });
    expect(transport.calls).toHaveLength(3);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ status: 200 });
  });

  it("does not retry on 401 — invalidates and throws after one attempt", async () => {
    const { opId, pathParams } = pickReadOperation();
    const transport = new SequenceTransport([
      { status: 401, headers: {}, body: { msg: "bad token" } },
    ]);
    let invalidated = 0;
    const auth: InstanceType<typeof MockAuth> = Object.assign(new MockAuth(), {
      invalidate: () => {
        invalidated += 1;
      },
    });
    const events: Array<{ status?: number; error?: string }> = [];
    const client = new OmadaClient({
      auth,
      transport,
      retry: { maxAttempts: 3, baseDelayMs: 1, jitter: false },
      onAudit: (e) =>
        events.push({
          ...(e.status !== undefined ? { status: e.status } : {}),
          ...(e.error !== undefined ? { error: e.error } : {}),
        }),
    });

    await expect(client.call(opId, { path: pathParams })).rejects.toThrow(/401/);
    expect(transport.calls).toHaveLength(1);
    expect(invalidated).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ status: 401, error: "auth" });
  });

  it("exhausts retries on persistent 503 and audits final failure once", async () => {
    const { opId, pathParams } = pickReadOperation();
    const transport = new SequenceTransport([
      { status: 503, headers: {}, body: { msg: "down" } },
      { status: 503, headers: {}, body: { msg: "down" } },
      { status: 503, headers: {}, body: { msg: "down" } },
    ]);
    const events: Array<{ status?: number; error?: string }> = [];
    const client = new OmadaClient({
      auth: new MockAuth(),
      transport,
      retry: { maxAttempts: 3, baseDelayMs: 1, jitter: false },
      onAudit: (e) =>
        events.push({
          ...(e.status !== undefined ? { status: e.status } : {}),
          ...(e.error !== undefined ? { error: e.error } : {}),
        }),
    });

    await expect(client.call(opId, { path: pathParams })).rejects.toThrow(/503/);
    expect(transport.calls).toHaveLength(3);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ status: 503, error: "transient" });
  });
});
