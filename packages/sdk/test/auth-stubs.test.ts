import { describe, expect, it } from "vitest";

import { AuthCodeFlow, CIMDIntegration } from "../src/index.js";

describe("M5 auth stubs", () => {
  it("CIMDIntegration.getToken() throws the M5 placeholder error", async () => {
    const strategy = new CIMDIntegration({
      cimdBaseUrl: "https://cimd.example.com",
      principalId: "workload-abc",
      principalKeyPath: "/tmp/noop.key",
    });
    await expect(strategy.getToken()).rejects.toThrow(/M5.*CIMD/);
    expect(() => strategy.invalidate()).toThrow(/M5.*CIMD/);
  });

  it("AuthCodeFlow.getToken() throws the M5 placeholder error", async () => {
    const strategy = new AuthCodeFlow({
      clientId: "cli-abc",
      authorizeUrl: "https://controller.example/openapi/authorize/code",
      tokenUrl: "https://controller.example/openapi/authorize/token",
      redirectUri: "http://127.0.0.1:41729/callback",
    });
    await expect(strategy.getToken()).rejects.toThrow(/M5.*Authorization-Code/);
    expect(() => strategy.invalidate()).toThrow(/M5.*Authorization-Code/);
  });
});

describe("CIMDIntegration option validation", () => {
  const valid = {
    cimdBaseUrl: "https://cimd.example.com",
    principalId: "workload-abc",
    principalKeyPath: "/tmp/noop.key",
  } as const;

  it("rejects a missing required field", () => {
    expect(() => new CIMDIntegration({ ...valid, principalId: "" })).toThrow(
      /principalId is required/,
    );
  });

  it("rejects a non-https CIMD URL", () => {
    expect(() => new CIMDIntegration({ ...valid, cimdBaseUrl: "http://cimd.example.com" })).toThrow(
      /must use https/,
    );
  });

  it("rejects an out-of-range envelopeTtlSec", () => {
    expect(() => new CIMDIntegration({ ...valid, envelopeTtlSec: 10 })).toThrow(
      /between 60 and 3600/,
    );
    expect(() => new CIMDIntegration({ ...valid, envelopeTtlSec: 4000 })).toThrow(
      /between 60 and 3600/,
    );
  });

  it("accepts a valid envelopeTtlSec override", () => {
    expect(() => new CIMDIntegration({ ...valid, envelopeTtlSec: 600 })).not.toThrow();
  });
});

describe("AuthCodeFlow option validation", () => {
  const valid = {
    clientId: "cli-abc",
    authorizeUrl: "https://controller.example/openapi/authorize/code",
    tokenUrl: "https://controller.example/openapi/authorize/token",
    redirectUri: "http://127.0.0.1:41729/callback",
  } as const;

  it("rejects a missing required field", () => {
    expect(() => new AuthCodeFlow({ ...valid, clientId: "" })).toThrow(/clientId is required/);
  });

  it("rejects non-https authorize / token URLs", () => {
    expect(
      () => new AuthCodeFlow({ ...valid, authorizeUrl: "http://controller.example/x" }),
    ).toThrow(/authorizeUrl must use https/);
    expect(() => new AuthCodeFlow({ ...valid, tokenUrl: "http://controller.example/y" })).toThrow(
      /tokenUrl must use https/,
    );
  });

  it("accepts loopback http redirectUri (RFC 8252)", () => {
    expect(
      () => new AuthCodeFlow({ ...valid, redirectUri: "http://localhost:41729/cb" }),
    ).not.toThrow();
    expect(
      () => new AuthCodeFlow({ ...valid, redirectUri: "http://127.0.0.1:41729/cb" }),
    ).not.toThrow();
  });

  it("rejects a non-loopback http redirectUri", () => {
    expect(() => new AuthCodeFlow({ ...valid, redirectUri: "http://attacker.example/cb" })).toThrow(
      /https.* or http.* loopback/,
    );
  });

  it("rejects an empty clientSecret / scope when explicitly provided", () => {
    expect(() => new AuthCodeFlow({ ...valid, clientSecret: "   " })).toThrow(
      /clientSecret must be non-empty/,
    );
    expect(() => new AuthCodeFlow({ ...valid, scope: "" })).toThrow(/scope must be non-empty/);
  });
});
