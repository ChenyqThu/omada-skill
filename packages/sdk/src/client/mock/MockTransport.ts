import type { AuthStrategy, HttpRequest, HttpResponse, Transport } from "../types.js";

export interface MockRoute {
  /** HTTP method to match (case-insensitive). Omit to match any. */
  method?: string;
  /** Substring or RegExp tested against the full request URL. */
  urlMatch: string | RegExp;
  /** Response status. Default: 200. */
  status?: number;
  /** Response body (will be delivered verbatim). */
  body: unknown;
  /** Response headers (merged with `{content-type: application/json}` default). */
  headers?: Record<string, string>;
}

export interface MockCapturedRequest extends HttpRequest {
  /** Monotonic index of this request (0-based). */
  index: number;
}

/**
 * Minimal in-memory Transport implementation for unit tests and offline
 * development. Supports multiple routes tried in registration order plus a
 * captured request log for assertions.
 */
export class MockTransport implements Transport {
  private readonly routes: MockRoute[] = [];
  public readonly calls: MockCapturedRequest[] = [];

  route(r: MockRoute): this {
    this.routes.push(r);
    return this;
  }

  async send(req: HttpRequest): Promise<HttpResponse> {
    this.calls.push({ ...req, index: this.calls.length });
    for (const r of this.routes) {
      if (r.method && r.method.toLowerCase() !== req.method.toLowerCase()) continue;
      const matches =
        typeof r.urlMatch === "string" ? req.url.includes(r.urlMatch) : r.urlMatch.test(req.url);
      if (!matches) continue;
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

/** AuthStrategy that always returns the same token — use with MockTransport. */
export class MockAuth implements AuthStrategy {
  constructor(private readonly token: string = "mock-token") {}
  async getToken(): Promise<string> {
    return this.token;
  }
  invalidate(): void {
    /* no-op */
  }
}

export const SAMPLE_SITES = [
  { siteId: "site-001", name: "HQ — San Jose", region: "USA", type: 0, scenario: "Office" },
  { siteId: "site-002", name: "Store — Brooklyn", region: "USA", type: 0, scenario: "Retail" },
  { siteId: "site-003", name: "Store — Portland", region: "USA", type: 0, scenario: "Retail" },
];
