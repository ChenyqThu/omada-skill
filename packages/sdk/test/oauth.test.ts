import { describe, expect, it } from "vitest";

import { MockTransport, OAuthTokenStore } from "../src/index.js";

describe("OAuthTokenStore", () => {
  it("caches the token until close to expiry", async () => {
    const transport = new MockTransport().route({
      method: "post",
      urlMatch: "/oauth2/token",
      body: { access_token: "tok-1", expires_in: 3600, token_type: "Bearer" },
    });
    const store = new OAuthTokenStore(
      { clientId: "id", clientSecret: "sec", tokenUrl: "https://example.com/oauth2/token" },
      transport,
    );

    expect(await store.getToken()).toBe("tok-1");
    expect(await store.getToken()).toBe("tok-1");
    // Second call should be served from cache — only one round-trip.
    expect(transport.calls).toHaveLength(1);
  });

  it("de-duplicates concurrent fetches into one network call", async () => {
    let resolveBody: (value: unknown) => void = () => {
      throw new Error("unused");
    };
    const deferred = new Promise<unknown>((resolve) => {
      resolveBody = resolve;
    });
    const transport: MockTransport = new MockTransport();
    // Patch send to return the deferred promise once so we control timing.
    const originalSend = transport.send.bind(transport);
    transport.send = async (req) => {
      if (req.url.includes("oauth2/token")) {
        const body = await deferred;
        return { status: 200, headers: { "content-type": "application/json" }, body };
      }
      return originalSend(req);
    };
    const store = new OAuthTokenStore(
      { clientId: "id", clientSecret: "sec", tokenUrl: "https://example.com/oauth2/token" },
      transport,
    );

    const p1 = store.getToken();
    const p2 = store.getToken();
    resolveBody({ access_token: "tok-concurrent", expires_in: 3600 });
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toBe("tok-concurrent");
    expect(b).toBe("tok-concurrent");
  });

  it("accepts Omada wrapped response shape", async () => {
    const transport = new MockTransport().route({
      method: "post",
      urlMatch: "/oauth2/token",
      body: {
        errorCode: 0,
        msg: "ok",
        result: { accessToken: "omada-tok", expiresIn: 7200 },
      },
    });
    const store = new OAuthTokenStore(
      { clientId: "id", clientSecret: "sec", tokenUrl: "https://example.com/oauth2/token" },
      transport,
    );
    expect(await store.getToken()).toBe("omada-tok");
  });

  it("raises OmadaAuthError on 4xx token response", async () => {
    const transport = new MockTransport().route({
      method: "post",
      urlMatch: "/oauth2/token",
      status: 401,
      body: { error: "invalid_client" },
    });
    const store = new OAuthTokenStore(
      { clientId: "bad", clientSecret: "bad", tokenUrl: "https://example.com/oauth2/token" },
      transport,
    );
    await expect(store.getToken()).rejects.toThrow(/OAuth token endpoint returned 401/);
  });

  it("invalidate() forces a fresh fetch next time", async () => {
    const transport = new MockTransport().route({
      method: "post",
      urlMatch: "/oauth2/token",
      body: { access_token: "tok-1", expires_in: 3600 },
    });
    const store = new OAuthTokenStore(
      { clientId: "id", clientSecret: "sec", tokenUrl: "https://example.com/oauth2/token" },
      transport,
    );
    await store.getToken();
    expect(transport.calls).toHaveLength(1);
    store.invalidate();
    await store.getToken();
    expect(transport.calls).toHaveLength(2);
  });

  it("rejects a zero expires_in as a misbehaving response", async () => {
    const transport = new MockTransport().route({
      method: "post",
      urlMatch: "/oauth2/token",
      body: { access_token: "tok-zero", expires_in: 0 },
    });
    const store = new OAuthTokenStore(
      { clientId: "id", clientSecret: "sec", tokenUrl: "https://example.com/oauth2/token" },
      transport,
    );
    await expect(store.getToken()).rejects.toThrow(/non-positive expires_in/);
  });

  it("rejects a negative expires_in instead of caching a pre-expired token", async () => {
    const transport = new MockTransport().route({
      method: "post",
      urlMatch: "/oauth2/token",
      body: { access_token: "tok-neg", expires_in: -3600 },
    });
    const store = new OAuthTokenStore(
      { clientId: "id", clientSecret: "sec", tokenUrl: "https://example.com/oauth2/token" },
      transport,
    );
    await expect(store.getToken()).rejects.toThrow(/non-positive expires_in/);
  });

  it("refuses to construct with an http:// tokenUrl (unless allowInsecureLoopback)", () => {
    expect(
      () =>
        new OAuthTokenStore(
          { clientId: "id", clientSecret: "sec", tokenUrl: "http://evil.example.com/token" },
          new MockTransport(),
        ),
    ).toThrow(/Refusing insecure URL/);
  });

  it("permits http:// tokenUrl on loopback when allowInsecureLoopback is set", () => {
    const transport = new MockTransport().route({
      method: "post",
      urlMatch: "/oauth2/token",
      body: { access_token: "tok-lo", expires_in: 3600 },
    });
    expect(
      () =>
        new OAuthTokenStore(
          {
            clientId: "id",
            clientSecret: "sec",
            tokenUrl: "http://127.0.0.1:8787/oauth2/token",
            allowInsecureLoopback: true,
          },
          transport,
        ),
    ).not.toThrow();
  });
});
