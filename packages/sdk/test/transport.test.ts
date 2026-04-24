import { describe, expect, it } from "vitest";

import { FetchTransport } from "../src/index.js";

/** Minimal Response-shaped object — spares us a real Response dependency. */
function fakeResponse(
  status: number,
  body: string,
  contentType = "application/json",
): Pick<Response, "status" | "headers" | "text"> {
  const headers = new Headers({ "content-type": contentType });
  return {
    status,
    headers,
    text: async () => body,
  };
}

describe("FetchTransport", () => {
  it("lowercases response headers and parses JSON bodies", async () => {
    const transport = new FetchTransport({
      fetchImpl: (async () =>
        fakeResponse(200, JSON.stringify({ ok: true, n: 1 }))) as unknown as typeof fetch,
    });
    const res = await transport.send({
      method: "get",
      url: "https://example/x",
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, n: 1 });
    expect(res.headers["content-type"]).toBe("application/json");
  });

  it("falls back to raw text when content-type is non-JSON and body isn't parseable", async () => {
    const transport = new FetchTransport({
      fetchImpl: (async () =>
        fakeResponse(200, "<html>not json</html>", "text/html")) as unknown as typeof fetch,
    });
    const res = await transport.send({ method: "get", url: "https://example/y", headers: {} });
    expect(res.body).toBe("<html>not json</html>");
  });

  it("still JSON-parses when content-type is missing but body is JSON", async () => {
    const transport = new FetchTransport({
      fetchImpl: (async () => {
        // No content-type header at all.
        return {
          status: 200,
          headers: new Headers(),
          text: async () => JSON.stringify({ a: 1 }),
        };
      }) as unknown as typeof fetch,
    });
    const res = await transport.send({ method: "get", url: "https://example/z", headers: {} });
    expect(res.body).toEqual({ a: 1 });
  });

  it("returns undefined body for empty responses", async () => {
    const transport = new FetchTransport({
      fetchImpl: (async () => fakeResponse(204, "", "application/json")) as unknown as typeof fetch,
    });
    const res = await transport.send({ method: "delete", url: "https://example/d", headers: {} });
    expect(res.status).toBe(204);
    expect(res.body).toBeUndefined();
  });

  it("wraps network errors as OmadaTransientError", async () => {
    const transport = new FetchTransport({
      fetchImpl: (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
    });
    await expect(
      transport.send({ method: "get", url: "https://example/err", headers: {} }),
    ).rejects.toThrow(/network error/);
  });

  it("wraps AbortError as a timeout-shaped OmadaTransientError", async () => {
    const transport = new FetchTransport({
      timeoutMs: 1,
      fetchImpl: (async (_url: unknown, init: { signal: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      }) as unknown as typeof fetch,
    });
    await expect(
      transport.send({ method: "get", url: "https://example/slow", headers: {} }),
    ).rejects.toThrow(/timed out after 1 ms/);
  });
});
