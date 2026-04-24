import { describe, expect, it } from "vitest";

import { OmadaAuthError, OmadaRateLimitError, OmadaTransientError } from "../src/errors.js";
import { retry } from "../src/retry.js";

const FAST = { baseDelayMs: 1, maxDelayMs: 1, jitter: false };

describe("retry", () => {
  it("returns immediately on first success without calling onAttempt", async () => {
    const calls: number[] = [];
    const result = await retry(async () => {
      calls.push(Date.now());
      return "ok";
    }, FAST);
    expect(result).toBe("ok");
    expect(calls).toHaveLength(1);
  });

  it("retries OmadaTransientError and succeeds within maxAttempts", async () => {
    let tries = 0;
    const attempts: number[] = [];
    const result = await retry(
      async () => {
        tries += 1;
        if (tries < 3) throw new OmadaTransientError("boom");
        return tries;
      },
      { ...FAST, maxAttempts: 5, onAttempt: (n) => attempts.push(n) },
    );
    expect(result).toBe(3);
    expect(attempts).toEqual([1, 2]);
  });

  it("honours OmadaRateLimitError.retryAfterMs instead of exponential backoff", async () => {
    const waitList: number[] = [];
    let tries = 0;
    await retry(
      async () => {
        tries += 1;
        if (tries < 2) throw new OmadaRateLimitError("slow down", 7);
        return "ok";
      },
      {
        maxAttempts: 3,
        baseDelayMs: 1,
        maxDelayMs: 1000, // well above the retryAfterMs so the hint wins
        jitter: false,
        onAttempt: (_n, _err, waitMs) => waitList.push(waitMs),
      },
    );
    expect(waitList).toEqual([7]);
  });

  it("caps retryAfterMs at maxDelayMs", async () => {
    const waitList: number[] = [];
    let tries = 0;
    await retry(
      async () => {
        tries += 1;
        if (tries < 2) throw new OmadaRateLimitError("slow", 99_999);
        return "ok";
      },
      {
        maxAttempts: 2,
        baseDelayMs: 1,
        maxDelayMs: 5,
        jitter: false,
        onAttempt: (_n, _err, waitMs) => waitList.push(waitMs),
      },
    );
    expect(waitList).toEqual([5]);
  });

  it("gives up and re-throws once maxAttempts is exhausted", async () => {
    let tries = 0;
    await expect(
      retry(
        async () => {
          tries += 1;
          throw new OmadaTransientError("persistent");
        },
        { ...FAST, maxAttempts: 3 },
      ),
    ).rejects.toThrow(/persistent/);
    expect(tries).toBe(3);
  });

  it("does not retry errors that defaultIsRetryable rejects (e.g. auth)", async () => {
    let tries = 0;
    await expect(
      retry(
        async () => {
          tries += 1;
          throw new OmadaAuthError("401");
        },
        { ...FAST, maxAttempts: 5 },
      ),
    ).rejects.toThrow(/401/);
    expect(tries).toBe(1);
  });

  it("honours a caller-supplied isRetryable predicate", async () => {
    let tries = 0;
    await expect(
      retry(
        async () => {
          tries += 1;
          throw new Error("custom-domain");
        },
        {
          ...FAST,
          maxAttempts: 3,
          isRetryable: (err) => (err as Error).message === "custom-domain",
        },
      ),
    ).rejects.toThrow(/custom-domain/);
    expect(tries).toBe(3);
  });

  it("applies exponential backoff with jitter when no retry-after is present", async () => {
    const waits: number[] = [];
    let tries = 0;
    await retry(
      async () => {
        tries += 1;
        if (tries < 3) throw new OmadaTransientError("x");
        return "ok";
      },
      {
        maxAttempts: 5,
        baseDelayMs: 10,
        maxDelayMs: 100,
        jitter: true,
        onAttempt: (_n, _err, waitMs) => waits.push(waitMs),
      },
    );
    // With jitter: each wait = exp * (0.5–1.0); first attempt 10 * [0.5,1.0] = [5,10]
    expect(waits[0]).toBeGreaterThanOrEqual(5);
    expect(waits[0]).toBeLessThanOrEqual(10);
    // second: 20 * [0.5,1.0] = [10,20]
    expect(waits[1]).toBeGreaterThanOrEqual(10);
    expect(waits[1]).toBeLessThanOrEqual(20);
  });
});
