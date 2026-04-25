import type { AuthStrategy, HttpRequest, HttpResponse, Transport } from "../types.js";

export interface MockRoute {
  /** HTTP method to match (case-insensitive). Omit to match any. */
  method?: string;
  /** Substring or RegExp tested against the full request URL. */
  urlMatch: string | RegExp;
  /** Response status. Default: 200. */
  status?: number;
  /** Static response body (ignored when `respond` is set). */
  body?: unknown;
  /** Response headers (merged with `{content-type: application/json}` default). */
  headers?: Record<string, string>;
  /**
   * Dynamic responder — overrides `body`/`status`/`headers` when present.
   * Receives the captured request and returns a full response; useful for
   * paged endpoints that need to inspect query params.
   */
  respond?: (req: HttpRequest) => HttpResponse | Promise<HttpResponse>;
}

export interface MockCapturedRequest extends HttpRequest {
  /** Monotonic index of this request (0-based). */
  index: number;
}

export interface PagedRouteOptions<T> {
  urlMatch: string | RegExp;
  method?: string;
  items: T[];
  /** Rows per page. Default: 2. */
  pageSize?: number;
  /** Omit `totalRows` from the envelope to exercise the empty-page terminator. */
  omitTotalRows?: boolean;
  /** Query key naming the page number. Default: `page`. */
  pageParam?: string;
}

/**
 * Minimal in-memory Transport implementation for unit tests and offline
 * development. Supports multiple routes tried in registration order plus a
 * captured request log for assertions.
 *
 * @internal — test/dev fixture; NOT part of the published public API. Do not
 *   import from application code. Packaged consumers should depend on
 *   `@omada/sdk` (public surface) not this module.
 */
export class MockTransport implements Transport {
  private readonly routes: MockRoute[] = [];
  public readonly calls: MockCapturedRequest[] = [];

  route(r: MockRoute): this {
    this.routes.push(r);
    return this;
  }

  /**
   * Register a dynamic paged route that slices `items` according to the
   * request's `page` query parameter. The envelope matches the real Omada
   * shape: `{ errorCode: 0, result: { data, totalRows, currentPage, currentSize } }`.
   */
  pagedRoute<T>(opts: PagedRouteOptions<T>): this {
    const pageSize = opts.pageSize ?? 2;
    const pageParam = opts.pageParam ?? "page";
    return this.route({
      urlMatch: opts.urlMatch,
      ...(opts.method !== undefined ? { method: opts.method } : {}),
      respond: (req) => {
        const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?") + 1) : "";
        const params = new URLSearchParams(qs);
        const page = Number(params.get(pageParam) ?? "1");
        const start = (page - 1) * pageSize;
        const slice = opts.items.slice(start, start + pageSize);
        const result: Record<string, unknown> = {
          data: slice,
          currentPage: page,
          currentSize: pageSize,
        };
        if (!opts.omitTotalRows) result["totalRows"] = opts.items.length;
        return {
          status: 200,
          headers: { "content-type": "application/json" },
          body: { errorCode: 0, msg: "Success", result },
        };
      },
    });
  }

  async send(req: HttpRequest): Promise<HttpResponse> {
    this.calls.push({ ...req, index: this.calls.length });
    for (const r of this.routes) {
      if (r.method && r.method.toLowerCase() !== req.method.toLowerCase()) continue;
      const matches =
        typeof r.urlMatch === "string" ? req.url.includes(r.urlMatch) : r.urlMatch.test(req.url);
      if (!matches) continue;
      if (r.respond) return await r.respond(req);
      return {
        status: r.status ?? 200,
        headers: { "content-type": "application/json", ...r.headers },
        body: r.body,
      };
    }
    return {
      status: 404,
      headers: { "content-type": "application/json" },
      body: {
        errorCode: -1,
        msg: `MockTransport: no route matched ${req.method.toUpperCase()} ${req.url}`,
      },
    };
  }

  /** Clear captured calls (routes are preserved). */
  reset(): void {
    this.calls.length = 0;
  }
}

/**
 * AuthStrategy that always returns the same token — use with MockTransport.
 *
 * @internal — test/dev fixture; NOT part of the published public API.
 */
export class MockAuth implements AuthStrategy {
  constructor(private readonly token: string = "mock-token") {}
  async getToken(): Promise<string> {
    return this.token;
  }
  invalidate(): void {
    /* no-op */
  }
}

/**
 * @internal — test/dev fixture; NOT part of the published public API.
 */
export const SAMPLE_SITES = [
  { siteId: "site-001", name: "HQ — San Jose", region: "USA", type: 0, scenario: "Office" },
  { siteId: "site-002", name: "Store — Brooklyn", region: "USA", type: 0, scenario: "Retail" },
  { siteId: "site-003", name: "Store — Portland", region: "USA", type: 0, scenario: "Retail" },
];
