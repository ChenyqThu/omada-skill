import { createHash, randomBytes } from "node:crypto";

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
  // Accept current bucket and previous one to cover token issued near bucket edge.
  return (
    token === digest(plan, secret, bucket, ttl) || token === digest(plan, secret, bucket - 1, ttl)
  );
}

function digest(plan: unknown, secret: string, bucket: number, ttl: number): string {
  const canonical = canonicalJSON(plan);
  return createHash("sha256")
    .update(secret)
    .update("|")
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
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return Object.fromEntries(entries.map(([k, v]) => [k, canonicalize(v)]));
}

export function generateSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
