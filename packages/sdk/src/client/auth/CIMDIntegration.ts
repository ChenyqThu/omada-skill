import { OmadaFatalError } from "@omada/shared";

import type { AuthStrategy } from "../types.js";

/**
 * Configuration for Omada CIMD (Cloud Identity & Management) integration.
 *
 * CIMD is TP-Link's centralized credential broker. Instead of embedding
 * `client_id` / `client_secret` in the controller, the MCP process retrieves a
 * short-lived credential envelope from CIMD and exchanges it for a controller
 * access token.
 *
 * This file is a **placeholder for M5**. The shape is fixed now so the final
 * wire-in (M5) doesn't need to move files or rename imports — only fill in the
 * `fetchEnvelope()` + `exchange()` bodies.
 */
export interface CIMDIntegrationOptions {
  /** CIMD base URL (region-specific). */
  cimdBaseUrl: string;
  /** Caller identity / workload principal registered with CIMD. */
  principalId: string;
  /** Path to the local signing material that proves principal identity. */
  principalKeyPath: string;
  /** Optional: override the default envelope TTL (seconds). */
  envelopeTtlSec?: number;
}

/**
 * M5 placeholder: CIMD-backed `AuthStrategy`. Every method throws
 * `OmadaFatalError` until the real implementation lands.
 *
 * Kept here (rather than in M5) so `packages/sdk/src/client/auth/` already has
 * its final shape — M3 tools can reference the type without the directory
 * layout shifting underneath them later.
 */
export class CIMDIntegration implements AuthStrategy {
  constructor(private readonly _opts: CIMDIntegrationOptions) {
    void this._opts;
  }

  async getToken(): Promise<string> {
    throw new OmadaFatalError("M5: CIMD integration is not yet wired");
  }

  invalidate(): void {
    throw new OmadaFatalError("M5: CIMD integration is not yet wired");
  }
}
