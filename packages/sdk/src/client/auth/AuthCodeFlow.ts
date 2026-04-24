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
 * Placeholder for M5 — the shape is fixed now so M3/M4 callers can reference
 * the type while the real implementation (PKCE, loopback redirect, refresh
 * token persistence) lands later.
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
  /** Redirect URI registered with the controller (typically a loopback port). */
  redirectUri: string;
  /** Optional scope string. */
  scope?: string;
}

/**
 * M5 placeholder: Authorization-Code-with-PKCE `AuthStrategy`. Every method
 * throws `OmadaFatalError` until the real implementation lands.
 */
export class AuthCodeFlow implements AuthStrategy {
  constructor(private readonly _opts: AuthCodeFlowOptions) {
    void this._opts;
  }

  async getToken(): Promise<string> {
    throw new OmadaFatalError("M5: Authorization-Code flow is not yet wired");
  }

  invalidate(): void {
    throw new OmadaFatalError("M5: Authorization-Code flow is not yet wired");
  }
}
