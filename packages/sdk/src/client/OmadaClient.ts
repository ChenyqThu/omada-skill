import {
  DEFAULT_SENSITIVE_KEYS,
  OmadaAuthError,
  OmadaFatalError,
  classifyHttpStatus,
  errorFromCategory,
  redact,
  retry,
  rootLogger,
} from "@omada/shared";
import type { Logger, OmadaError, RetryOptions } from "@omada/shared";

import { operations, type OperationId } from "../generated/operations.js";
import { FetchTransport } from "./transport.js";
import { resolveBaseUrl } from "./regions.js";
import type {
  AuditSink,
  AuthStrategy,
  CallParams,
  HttpResponse,
  OmadaClientOptions,
  Transport,
} from "./types.js";

/** OmadaError subclass marker so the retry layer can audit the final status. */
interface TaggedError extends OmadaError {
  __status?: number;
  __category?: string;
}

/**
 * Typed client for the Omada Open API.
 *
 * Call a named operation:
 *
 *     const client = new OmadaClient({ region: "use1", auth, transport });
 *     const sites = await client.call("listSites", {
 *       path: { omadacId: "oc-123" },
 *       query: { page: 1, pageSize: 50 },
 *     });
 *
 * The client itself is transport-agnostic — pass `MockTransport` for tests
 * and offline development, or `FetchTransport` (default) for live calls.
 */
export class OmadaClient {
  readonly baseUrl: string;
  private readonly transport: Transport;
  private readonly auth: AuthStrategy;
  private readonly logger: Logger;
  private readonly dryRun: boolean;
  private readonly auditSink?: AuditSink;
  private readonly retryOpts: RetryOptions;
  private readonly redactKeys: readonly string[];

  constructor(opts: OmadaClientOptions) {
    this.baseUrl = resolveBaseUrl({
      ...(opts.region !== undefined ? { region: opts.region } : {}),
      ...(opts.baseUrl !== undefined ? { baseUrl: opts.baseUrl } : {}),
    });
    this.transport = opts.transport ?? new FetchTransport();
    this.auth = opts.auth;
    this.logger = opts.logger ?? rootLogger.child("client");
    this.dryRun = opts.dryRun ?? false;
    if (opts.onAudit) this.auditSink = opts.onAudit;
    this.retryOpts = opts.retry ?? {};
    this.redactKeys = opts.redactKeys
      ? [...DEFAULT_SENSITIVE_KEYS, ...opts.redactKeys]
      : DEFAULT_SENSITIVE_KEYS;
  }

  async call<Op extends OperationId>(operationId: Op, params: CallParams = {}): Promise<unknown> {
    const info = operations[operationId];
    if (!info) {
      throw new OmadaFatalError(`Unknown operationId: ${String(operationId)}`);
    }

    const isWrite = info.method !== "get";
    if (isWrite && this.dryRun) {
      this.logger.info("dry-run short-circuit", {
        operationId,
        method: info.method,
        path: info.path,
      });
      this.audit({ operationId, method: info.method, path: info.path, dryRun: true });
      return { __dryRun: true, operationId, method: info.method, path: info.path, params };
    }

    const url = this.buildUrl(info.path, params.path, params.query);
    const headers: Record<string, string> = {
      accept: "application/json",
      ...params.headers,
    };
    let body: string | undefined;
    if (params.body !== undefined) {
      body = JSON.stringify(params.body);
      if (!("content-type" in headers) && !("Content-Type" in headers)) {
        headers["content-type"] = "application/json";
      }
    }

    const runOnce = async (): Promise<HttpResponse> => {
      const token = await this.auth.getToken();
      headers["authorization"] = `Bearer ${token}`;

      this.logger.debug("request", { operationId, method: info.method, url });

      const res = await this.transport.send({ method: info.method, url, headers, body });

      if (res.status === 401) {
        this.auth.invalidate();
        const err = new OmadaAuthError(`401 on ${String(operationId)}`) as TaggedError;
        err.__status = 401;
        err.__category = "auth";
        throw err;
      }
      if (res.status >= 400) {
        const category = classifyHttpStatus(res.status);
        const retryAfterMs = parseRetryAfter(res.headers["retry-after"]);
        const err = errorFromCategory(category, `${res.status} on ${String(operationId)}`, {
          ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
        }) as TaggedError;
        err.__status = res.status;
        err.__category = category;
        throw err;
      }

      return res;
    };

    try {
      const res = await retry(runOnce, this.retryOpts);
      this.audit({
        operationId,
        method: info.method,
        path: info.path,
        dryRun: false,
        status: res.status,
      });
      return res.body;
    } catch (err) {
      const tagged = err as TaggedError;
      this.audit({
        operationId,
        method: info.method,
        path: info.path,
        dryRun: false,
        ...(tagged.__status !== undefined ? { status: tagged.__status } : {}),
        ...(tagged.__category !== undefined ? { error: tagged.__category } : {}),
      });
      throw err;
    }
  }

  private buildUrl(
    pathTemplate: string,
    pathParams: CallParams["path"],
    query: CallParams["query"],
  ): string {
    let path = pathTemplate;
    for (const [key, value] of Object.entries(pathParams ?? {})) {
      const placeholder = `{${key}}`;
      if (!path.includes(placeholder)) {
        throw new OmadaFatalError(
          `Path param "${key}" does not appear in template "${pathTemplate}"`,
        );
      }
      path = path.replaceAll(placeholder, encodeURIComponent(String(value)));
    }
    const unresolved = path.match(/\{([^}]+)\}/);
    if (unresolved) {
      throw new OmadaFatalError(
        `Missing path param "${unresolved[1]}" for template "${pathTemplate}"`,
      );
    }
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined) continue;
      qs.set(key, String(value));
    }
    const queryStr = qs.toString();
    return `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}${queryStr ? `?${queryStr}` : ""}`;
  }

  private audit(event: {
    operationId: string;
    method: "get" | "post" | "put" | "patch" | "delete";
    path: string;
    dryRun: boolean;
    status?: number;
    error?: string;
  }): void {
    if (!this.auditSink) return;
    const raw = {
      ts: new Date().toISOString(),
      ...event,
    };
    this.auditSink(redact(raw, { keys: this.redactKeys }));
  }
}

function parseRetryAfter(header: string | undefined): number | undefined {
  if (!header) return undefined;
  const asSeconds = Number(header);
  if (Number.isFinite(asSeconds)) return asSeconds * 1000;
  const asDate = new Date(header).getTime();
  if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now());
  return undefined;
}
