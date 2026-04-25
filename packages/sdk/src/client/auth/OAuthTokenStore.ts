import { OmadaAuthError } from "@omada/shared";

import { assertSecureUrl } from "../regions.js";
import type { AuthStrategy, HttpResponse, Transport } from "../types.js";

export interface OAuthClientCredentials {
  clientId: string;
  clientSecret: string;
  /** OAuth token endpoint URL (usually `<baseUrl>/openapi/authorize/token`). */
  tokenUrl: string;
  /** Optional OAuth scope string. */
  scope?: string;
  /** Refresh `refreshLeadMs` before the cached token would expire. Default: 60_000. */
  refreshLeadMs?: number;
  /**
   * Permit `http://` tokenUrl on loopback hosts. Defaults to false — credentials
   * are sent in the request body, so plaintext HTTP would leak them. Intended
   * for local dev/CI against a mock OAuth server only.
   */
  allowInsecureLoopback?: boolean;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/**
 * Acquires and caches an access token via OAuth2 Client Credentials grant.
 *
 * Works with both shapes we have observed from Omada controllers:
 *   - RFC 6749 native `{ access_token, expires_in, token_type }`
 *   - Omada wrapped `{ errorCode: 0, msg, result: { accessToken, expiresIn } }`
 *
 * Concurrent `getToken()` calls de-duplicate into a single network fetch.
 */
export class OAuthTokenStore implements AuthStrategy {
  private cached?: CachedToken;
  private inFlight?: Promise<string>;
  private readonly refreshLeadMs: number;

  constructor(
    private readonly creds: OAuthClientCredentials,
    private readonly transport: Transport,
  ) {
    this.refreshLeadMs = creds.refreshLeadMs ?? 60_000;
    // Refuse to construct with a URL that would leak client_secret in
    // plaintext. Operators who truly need dev-local HTTP can opt in via
    // allowInsecureLoopback.
    assertSecureUrl(creds.tokenUrl, {
      allowInsecureLoopback: creds.allowInsecureLoopback ?? false,
    });
  }

  async getToken(): Promise<string> {
    if (this.cached && Date.now() < this.cached.expiresAt - this.refreshLeadMs) {
      return this.cached.accessToken;
    }
    if (!this.inFlight) {
      this.inFlight = this.fetchToken().finally(() => {
        this.inFlight = undefined;
      });
    }
    return this.inFlight;
  }

  invalidate(): void {
    this.cached = undefined;
  }

  private async fetchToken(): Promise<string> {
    const form = new URLSearchParams();
    form.set("grant_type", "client_credentials");
    form.set("client_id", this.creds.clientId);
    form.set("client_secret", this.creds.clientSecret);
    if (this.creds.scope) form.set("scope", this.creds.scope);

    const res = await this.transport.send({
      method: "post",
      url: this.creds.tokenUrl,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: form.toString(),
    });

    const token = parseTokenResponse(res);
    this.cached = token;
    return token.accessToken;
  }
}

function parseTokenResponse(res: HttpResponse): CachedToken {
  if (res.status >= 400) {
    throw new OmadaAuthError(
      `OAuth token endpoint returned ${res.status}: ${summarizeBody(res.body)}`,
    );
  }
  const outer = res.body as Record<string, unknown> | undefined;
  const inner = (outer?.["result"] as Record<string, unknown> | undefined) ?? outer;
  const accessToken =
    (inner?.["accessToken"] as string | undefined) ??
    (inner?.["access_token"] as string | undefined);
  const expiresInRaw =
    (inner?.["expiresIn"] as number | string | undefined) ??
    (inner?.["expires_in"] as number | string | undefined) ??
    3600;
  const expiresIn = Number(expiresInRaw);
  if (!accessToken || !Number.isFinite(expiresIn)) {
    throw new OmadaAuthError(
      `OAuth response missing access_token / expires_in: ${summarizeBody(res.body)}`,
    );
  }
  // Reject non-positive expires_in — a zero or negative TTL would cache a
  // token that is already expired and cause every subsequent call to refetch,
  // producing a credentials storm against the token endpoint.
  if (expiresIn <= 0) {
    throw new OmadaAuthError(
      `OAuth response has non-positive expires_in (${expiresIn}): ${summarizeBody(res.body)}`,
    );
  }
  return {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

function summarizeBody(body: unknown): string {
  try {
    return JSON.stringify(body).slice(0, 200);
  } catch {
    return String(body).slice(0, 200);
  }
}
