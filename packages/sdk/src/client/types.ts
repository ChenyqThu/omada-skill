import type { Logger, RetryOptions } from "@omada/shared";

import type { HttpMethod, OperationId } from "../generated/operations.js";
import type { schemaOperations } from "../generated/index.js";

export type { HttpMethod, OperationId, RetryOptions };

// ─────────────────────────────────────────────────────────────────────────────
// Operation-level type derivations from the openapi-typescript schema.
//
// `OperationId` comes from the runtime `operations` map (keys that actually
// ship in operations.ts). `schemaOperations` is the openapi-typescript type
// export — it contains every operation node in the spec, occasionally with a
// `_1` suffix when two paths share the same operationId. The runtime map
// always picks one of those, so `OperationId` is a subset of
// `keyof schemaOperations`; the conditional below just pleases TypeScript.
//
// Call sites get `ResponseFor<Op>` for free on every `client.call(op, …)` —
// the old `Promise<unknown>` return type is gone. `ParamsFor<Op>` is opt-in
// (callers pass the generic `CallParams` shape by default; narrow to
// `ParamsFor<Op>` when they want path/query/body autocompletion).
// ─────────────────────────────────────────────────────────────────────────────

type SchemaOp<Op extends OperationId> = Op extends keyof schemaOperations
  ? schemaOperations[Op]
  : never;

type ResponseBody<Op extends OperationId> =
  SchemaOp<Op> extends { responses: { 200: { content: infer C } } }
    ? C extends { "application/json": infer R }
      ? R
      : C extends { "*/*": infer R }
        ? R
        : unknown
    : unknown;

/**
 * Response body type for `Op` (the `200` content, stripped of the media-type
 * wrapper). Defaults to `unknown` for operations the schema doesn't enumerate.
 */
export type ResponseFor<Op extends OperationId> = ResponseBody<Op>;

type SchemaParams<Op extends OperationId> =
  SchemaOp<Op> extends { parameters: infer P } ? P : never;

type PathParamsFor<Op extends OperationId> =
  SchemaParams<Op> extends { path?: infer P } ? P : never;

type QueryParamsFor<Op extends OperationId> =
  SchemaParams<Op> extends { query?: infer Q } ? Q : never;

type RequestBodyFor<Op extends OperationId> =
  SchemaOp<Op> extends { requestBody: { content: { "application/json": infer B } } }
    ? B
    : SchemaOp<Op> extends { requestBody?: { content: { "application/json": infer B } } }
      ? B | undefined
      : unknown;

/**
 * Fully narrowed call-params shape for `Op`: the path/query/body derived from
 * the OpenAPI spec. Optional to use — the runtime `call()` still accepts the
 * looser `CallParams` shape so existing callers don't need changes.
 */
export interface ParamsFor<Op extends OperationId> {
  path?: PathParamsFor<Op>;
  query?: QueryParamsFor<Op>;
  body?: RequestBodyFor<Op>;
  headers?: Record<string, string>;
}

export interface HttpRequest {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: string | undefined;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface Transport {
  send(req: HttpRequest): Promise<HttpResponse>;
}

export interface AuthStrategy {
  getToken(): Promise<string>;
  invalidate(): void;
}

export interface CallParams {
  path?: Record<string, string | number>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface AuditEvent {
  ts: string;
  operationId: string;
  method: HttpMethod;
  path: string;
  dryRun: boolean;
  status?: number;
  error?: string;
}

export type AuditSink = (event: AuditEvent) => void;

export interface OmadaClientOptions {
  /** Human-friendly region key (e.g. "use1"). Ignored if baseUrl is set. */
  region?: string;
  /** Fully-qualified controller base URL — wins over region. */
  baseUrl?: string;
  /** How the client acquires bearer tokens for every request. */
  auth: AuthStrategy;
  /** HTTP transport. Defaults to FetchTransport; swap with MockTransport in tests. */
  transport?: Transport;
  /** Logger. Defaults to `rootLogger.child("client")`. */
  logger?: Logger;
  /** If true, write operations short-circuit and return a `{__dryRun: true}` stub. */
  dryRun?: boolean;
  /** Called after every request (success or failure). Events are redacted before delivery. */
  onAudit?: AuditSink;
  /**
   * Extra keys to redact from audit events (merged with the shared default
   * list — `authorization`, `token`, `client_secret`, …). Useful for
   * endpoint-specific fields the default set doesn't cover.
   */
  redactKeys?: readonly string[];
  /**
   * Retry policy for transient/rateLimit failures. Defaults to
   * `{ maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 10_000, jitter: true }`.
   * Auth (401) failures are never retried — they invalidate the token cache
   * and re-throw so the caller's next call can acquire a fresh token.
   */
  retry?: RetryOptions;
  /**
   * Permit `http://` base URLs that point at loopback hosts (127.0.0.0/8, ::1,
   * localhost). Defaults to false — real controllers must be HTTPS. Exists for
   * local development against a mock HTTP server; never enable in production.
   */
  allowInsecureLoopback?: boolean;
}
