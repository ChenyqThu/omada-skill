import { describe, expect, it } from "vitest";
import {
  OmadaAuthError,
  OmadaError,
  OmadaRateLimitError,
  classifyHttpStatus,
  errorFromCategory,
} from "../src/index.js";

describe("classifyHttpStatus", () => {
  it.each([
    [401, "auth"],
    [403, "permission"],
    [404, "notFound"],
    [400, "validation"],
    [409, "validation"],
    [422, "validation"],
    [429, "rateLimit"],
    [500, "transient"],
    [503, "transient"],
    [599, "transient"],
    [418, "fatal"],
  ] as const)("status %i → %s", (status, expected) => {
    expect(classifyHttpStatus(status)).toBe(expected);
  });
});

describe("OmadaError hierarchy", () => {
  it("subclass instances propagate class name", () => {
    const err = new OmadaAuthError("no token");
    expect(err).toBeInstanceOf(OmadaError);
    expect(err.name).toBe("OmadaAuthError");
    expect(err.message).toBe("no token");
  });

  it("rate limit carries retryAfterMs", () => {
    const err = new OmadaRateLimitError("429 slow down", 3_000);
    expect(err.retryAfterMs).toBe(3_000);
  });

  it("errorFromCategory constructs the right subclass", () => {
    expect(errorFromCategory("auth", "x")).toBeInstanceOf(OmadaAuthError);
    expect(errorFromCategory("rateLimit", "x", { retryAfterMs: 100 })).toBeInstanceOf(
      OmadaRateLimitError,
    );
  });
});
