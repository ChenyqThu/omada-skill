import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Two-phase commit for write tools.
 *
 * Phase 1: tool is called with dryRun=true (or no confirm_token). The
 *   tool computes the plan, calls `issueConfirmToken(plan)`, and returns
 *   the token along with a human-readable diff preview.
 *
 * Phase 2: caller repeats the call with the same parameters plus
 *   `confirm_token`. The tool calls `verifyConfirmToken(plan, token)` —
 *   if the plan has changed since phase 1 the token is rejected, forcing
 *   another dry-run round.
 *
 * Tokens are deterministic from the plan, a server-side secret, and the
 * issue timestamp (rounded to TTL buckets). This avoids storing anything
 * on the server side.
 */
export interface ConfirmTokenOptions {
  /** Server-local secret mixed into every token. Reads from env if omitted. */
  secret?: string;
  /** Token lifetime in seconds. Default: 300 (5 minutes). */
  ttlSeconds?: number;
  /** Override for tests. */
  now?: () => number;
}

const DEFAULT_TTL_SECONDS = 300;

/**
 * Maximum plan-tree depth the canonicalizer will traverse. Deeply nested
 * attacker-supplied structures could otherwise stack-overflow the verifier,
 * turning the two-phase commit into a DoS vector. The cap is intentionally
 * much larger than any realistic tool plan.
 */
export const CANONICALIZE_MAX_DEPTH = 64;

export function issueConfirmToken(plan: unknown, opts: ConfirmTokenOptions = {}): string {
  const secret = requireSecret(opts.secret);
  const ttl = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const now = Math.floor((opts.now?.() ?? Date.now()) / 1000);
  const bucket = Math.floor(now / ttl);
  return digest(plan, secret, bucket, ttl);
}

export function verifyConfirmToken(
  plan: unknown,
  token: string,
  opts: ConfirmTokenOptions = {},
): boolean {
  const secret = requireSecret(opts.secret);
  const ttl = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const now = Math.floor((opts.now?.() ?? Date.now()) / 1000);
  const bucket = Math.floor(now / ttl);
  // Accept current, previous, and next buckets. `previous` covers tokens
  // issued just before a bucket boundary; `next` covers callers whose clock
  // is slightly ahead of the server.
  const candidates = [
    digest(plan, secret, bucket, ttl),
    digest(plan, secret, bucket - 1, ttl),
    digest(plan, secret, bucket + 1, ttl),
  ];
  return candidates.some((expected) => safeEqual(token, expected));
}

function safeEqual(a: string, b: string): boolean {
  // `timingSafeEqual` requires equal-length buffers — return false fast for
  // length mismatches without leaking timing information via throw.
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function digest(plan: unknown, secret: string, bucket: number, ttl: number): string {
  const canonical = canonicalJSON(plan);
  return createHmac("sha256", secret)
    .update(String(bucket))
    .update("|")
    .update(String(ttl))
    .update("|")
    .update(canonical)
    .digest("base64url")
    .slice(0, 32);
}

function requireSecret(explicit: string | undefined): string {
  if (explicit) return explicit;
  const env = process.env["OMADA_MCP_CONFIRM_SECRET"];
  if (env && env.length >= 16) return env;
  throw new Error(
    "OMADA_MCP_CONFIRM_SECRET is not set (or shorter than 16 chars). " +
      "Set it to a high-entropy value before using confirm tokens.",
  );
}

function canonicalJSON(value: unknown): string {
  return JSON.stringify(canonicalize(value, 0));
}

function canonicalize(value: unknown, depth: number): unknown {
  if (depth > CANONICALIZE_MAX_DEPTH) {
    throw new Error(
      `confirm-token plan exceeds max depth ${CANONICALIZE_MAX_DEPTH}; refusing to canonicalize`,
    );
  }
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => canonicalize(item, depth + 1));
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return Object.fromEntries(entries.map(([k, v]) => [k, canonicalize(v, depth + 1)]));
}

export function generateSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
