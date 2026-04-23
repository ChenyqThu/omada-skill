import { OmadaRateLimitError, OmadaTransientError } from "./errors.js";

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  isRetryable?: (err: unknown) => boolean;
  onAttempt?: (attempt: number, err: unknown, waitMs: number) => void;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 10_000;

export async function retry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const jitter = opts.jitter ?? true;
  const isRetryable = opts.isRetryable ?? defaultIsRetryable;

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt >= maxAttempts || !isRetryable(err)) throw err;
      const waitMs = computeWait(err, attempt, baseDelayMs, maxDelayMs, jitter);
      opts.onAttempt?.(attempt, err, waitMs);
      await sleep(waitMs);
    }
  }
}

function defaultIsRetryable(err: unknown): boolean {
  return err instanceof OmadaTransientError || err instanceof OmadaRateLimitError;
}

function computeWait(
  err: unknown,
  attempt: number,
  base: number,
  max: number,
  jitter: boolean,
): number {
  if (err instanceof OmadaRateLimitError && err.retryAfterMs !== undefined) {
    return Math.min(err.retryAfterMs, max);
  }
  const exp = Math.min(base * 2 ** (attempt - 1), max);
  return jitter ? exp * (0.5 + Math.random() * 0.5) : exp;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
