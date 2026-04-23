import { OmadaTransientError } from "@omada/shared";

import type { HttpRequest, HttpResponse, Transport } from "./types.js";

export interface FetchTransportOptions {
  /** Request timeout in milliseconds. Default: 30_000. */
  timeoutMs?: number;
  /** Override for tests. */
  fetchImpl?: typeof fetch;
}

export class FetchTransport implements Transport {
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: FetchTransportOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async send(req: HttpRequest): Promise<HttpResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(req.url, {
        method: req.method.toUpperCase(),
        headers: req.headers,
        body: req.body,
        signal: controller.signal,
      });
      const text = await res.text();
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      return { status: res.status, headers, body: parseBody(text, headers["content-type"]) };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new OmadaTransientError(`request timed out after ${this.timeoutMs} ms`, {
          cause: err,
        });
      }
      throw new OmadaTransientError("network error", { cause: err });
    } finally {
      clearTimeout(timer);
    }
  }
}

function parseBody(text: string, contentType: string | undefined): unknown {
  if (!text) return undefined;
  if (contentType?.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  // Fall back: best-effort JSON parse, then raw text.
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
