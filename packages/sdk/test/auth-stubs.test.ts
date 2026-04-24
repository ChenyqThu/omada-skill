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
