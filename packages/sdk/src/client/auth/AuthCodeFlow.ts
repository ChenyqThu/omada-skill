import { OmadaFatalError } from "@omada/shared";

import type { AuthStrategy } from "../types.js";

/**
 * Configuration for OAuth2 Authorization Code flow with PKCE.
 *
 * This flow targets the interactive case: a human operator authorizes the MCP
 * process once via the controller's consent screen, and the resulting refresh
 * token is stored securely (e.g. Claude Vault) so subsequent sessions can
 * mint access tokens without re-prompting.
 *
 * Placeholder for M5 / M6 — the shape is fixed now so M3/M4 callers can
 * reference the type while the real implementation (PKCE, loopback redirect,
 * refresh token persistence) lands later. M5 added option-shape validation
 * so misconfiguration fails at construction time.
 */
export interface AuthCodeFlowOptions {
  /** OAuth `client_id` registered with the controller. */
  clientId: string;
  /** Optional `client_secret` — omitted for public clients doing PKCE. */
  clientSecret?: string;
  /** Controller authorization endpoint (`/openapi/authorize/code`). */
  authorizeUrl: string;
  /** Controller token endpoint (`/openapi/authorize/token`). */
  tokenUrl: string;
  /**
   * Redirect URI registered with the controller. Typically a loopback on
   * `http://127.0.0.1:<port>/…`; `https://` URLs are also accepted.
   */
  redirectUri: string;
  /** Optional scope string (space-separated per RFC 6749 §3.3). */
  scope?: string;
}

/**
 * M5 placeholder: Authorization-Code-with-PKCE `AuthStrategy`. `getToken()`
 * and `invalidate()` still throw until the real implementation lands; the
 * constructor now validates its options eagerly so operator misconfiguration
 * surfaces at startup rather than at first use.
 */
export class AuthCodeFlow implements AuthStrategy {
  constructor(private readonly _opts: AuthCodeFlowOptions) {
    validateAuthCodeOptions(_opts);
  }

  async getToken(): Promise<string> {
    throw new OmadaFatalError("M5: Authorization-Code flow is not yet wired");
  }

  invalidate(): void {
    throw new OmadaFatalError("M5: Authorization-Code flow is not yet wired");
  }
}

function validateAuthCodeOptions(opts: AuthCodeFlowOptions): void {
  requireNonEmpty(opts, "clientId");
  requireNonEmpty(opts, "authorizeUrl");
  requireNonEmpty(opts, "tokenUrl");
  requireNonEmpty(opts, "redirectUri");
  requireHttpsUrl(opts.authorizeUrl, "authorizeUrl");
  requireHttpsUrl(opts.tokenUrl, "tokenUrl");
  requireLoopbackOrHttpsUrl(opts.redirectUri, "redirectUri");
  if (opts.clientSecret !== undefined && opts.clientSecret.trim() === "") {
    throw new OmadaFatalError("AuthCodeFlow: clientSecret must be non-empty when provided");
  }
  if (opts.scope !== undefined && opts.scope.trim() === "") {
    throw new OmadaFatalError("AuthCodeFlow: scope must be non-empty when provided");
  }
}

function requireNonEmpty<T extends object>(obj: T, key: keyof T & string): void {
  const v = obj[key];
  if (typeof v !== "string" || v.trim() === "") {
    throw new OmadaFatalError(`AuthCodeFlow: ${key} is required`);
  }
}

function requireHttpsUrl(raw: string, key: string): void {
  const url = parseUrl(raw, key);
  if (url.protocol !== "https:") {
    throw new OmadaFatalError(`AuthCodeFlow: ${key} must use https://`);
  }
}

function requireLoopbackOrHttpsUrl(raw: string, key: string): void {
  const url = parseUrl(raw, key);
  const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);
  const isLoopback = url.protocol === "http:" && loopbackHosts.has(url.hostname);
  if (!isLoopback && url.protocol !== "https:") {
    throw new OmadaFatalError(
      `AuthCodeFlow: ${key} must use https:// or http:// on a loopback host`,
    );
  }
}

function parseUrl(raw: string, key: string): URL {
  try {
    return new URL(raw);
  } catch {
    throw new OmadaFatalError(`AuthCodeFlow: ${key} is not a valid URL`);
  }
}
