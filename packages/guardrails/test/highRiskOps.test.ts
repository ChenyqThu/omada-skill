import { describe, expect, it } from "vitest";

import {
  HIGH_RISK_OPERATION_IDS,
  isHighRiskOperation,
  riskSeverity,
  issueConfirmToken,
  verifyConfirmToken,
} from "../src/index.js";

describe("isHighRiskOperation", () => {
  it("recognises catastrophic ops", () => {
    expect(isHighRiskOperation("deleteSite")).toBe(true);
    expect(isHighRiskOperation("factoryReset")).toBe(true);
  });

  it("ignores read ops", () => {
    expect(isHighRiskOperation("getSiteList")).toBe(false);
  });

  it("set is frozen-ish (no accidental additions through mutations)", () => {
    const before = HIGH_RISK_OPERATION_IDS.size;
    // Set is not literally frozen, but re-adding should be a no-op.
    (HIGH_RISK_OPERATION_IDS as Set<string>).add("deleteSite");
    expect(HIGH_RISK_OPERATION_IDS.size).toBe(before);
  });
});

describe("riskSeverity", () => {
  it("returns documented tiers", () => {
    expect(riskSeverity("deleteSite")).toBe("catastrophic");
    expect(riskSeverity("onlineRollingUpgrade")).toBe("high");
    expect(riskSeverity("rebootDevice")).toBe("medium");
    expect(riskSeverity("getSiteList")).toBe("low");
  });

  it("high-risk ops without explicit tier default to medium", () => {
    // Every operationId in HIGH_RISK_OPERATION_IDS must have a severity ≥ medium.
    for (const op of HIGH_RISK_OPERATION_IDS) {
      const sev = riskSeverity(op);
      expect(["medium", "high", "catastrophic"]).toContain(sev);
    }
  });
});

describe("confirmToken", () => {
  const secret = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaa"; // ≥16 chars
  const plan = { op: "deleteSite", siteId: "site-001" };
  const now = () => 1_000_000_000_000;

  it("issues + verifies within the same bucket", () => {
    const token = issueConfirmToken(plan, { secret, now });
    expect(verifyConfirmToken(plan, token, { secret, now })).toBe(true);
  });

  it("rejects a token for a different plan", () => {
    const token = issueConfirmToken(plan, { secret, now });
    const tampered = { ...plan, siteId: "site-002" };
    expect(verifyConfirmToken(tampered, token, { secret, now })).toBe(false);
  });

  it("canonicalises plan key order (stable across JS iteration order)", () => {
    const a = issueConfirmToken({ a: 1, b: 2, c: [1, 2] }, { secret, now });
    const b = issueConfirmToken({ c: [1, 2], b: 2, a: 1 }, { secret, now });
    expect(a).toBe(b);
  });

  it("tolerates the previous bucket (edge-of-window issuance)", () => {
    const ttlSeconds = 300;
    const issueAt = () => 1_000_000_000_000;
    const verifyAt = () => issueAt() + ttlSeconds * 1_000 + 1;
    const token = issueConfirmToken(plan, { secret, ttlSeconds, now: issueAt });
    expect(verifyConfirmToken(plan, token, { secret, ttlSeconds, now: verifyAt })).toBe(true);
  });

  it("rejects an expired token (two buckets later)", () => {
    const ttlSeconds = 300;
    const issueAt = () => 1_000_000_000_000;
    const verifyAt = () => issueAt() + ttlSeconds * 1_000 * 3;
    const token = issueConfirmToken(plan, { secret, ttlSeconds, now: issueAt });
    expect(verifyConfirmToken(plan, token, { secret, ttlSeconds, now: verifyAt })).toBe(false);
  });
});
