import type { Logger } from "@omada/shared";

import type { HttpMethod, OperationId } from "../generated/operations.js";

export type { HttpMethod, OperationId };

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
  /** Called after every request (success or failure). Redact before persisting. */
  onAudit?: AuditSink;
}
