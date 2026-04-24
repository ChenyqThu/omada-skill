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
 * This file is still a **placeholder for M5 / M6**. The shape is fixed now so
 * the final wire-in doesn't need to move files or rename imports — only fill
 * in the `fetchEnvelope()` + `exchange()` bodies. M5 added option-shape
 * validation so misconfiguration fails at construction time rather than on
 * first `getToken()` call.
 */
export interface CIMDIntegrationOptions {
  /** CIMD base URL (region-specific). Must be an `https://` URL. */
  cimdBaseUrl: string;
  /** Caller identity / workload principal registered with CIMD. */
  principalId: string;
  /** Path to the local signing material that proves principal identity. */
  principalKeyPath: string;
  /** Optional: override the default envelope TTL (seconds). 60 ≤ ttl ≤ 3600. */
  envelopeTtlSec?: number;
}

/**
 * M5 placeholder: CIMD-backed `AuthStrategy`. `getToken()` / `invalidate()`
 * still throw until the real implementation lands, but the constructor now
 * validates its options eagerly so operator misconfiguration surfaces at
 * startup rather than at first use.
 */
export class CIMDIntegration implements AuthStrategy {
  constructor(private readonly _opts: CIMDIntegrationOptions) {
    validateCIMDOptions(_opts);
  }

  async getToken(): Promise<string> {
    throw new OmadaFatalError("M5: CIMD integration is not yet wired");
  }

  invalidate(): void {
    throw new OmadaFatalError("M5: CIMD integration is not yet wired");
  }
}

function validateCIMDOptions(opts: CIMDIntegrationOptions): void {
  requireNonEmpty(opts, "cimdBaseUrl");
  requireNonEmpty(opts, "principalId");
  requireNonEmpty(opts, "principalKeyPath");
  requireHttps(opts.cimdBaseUrl, "cimdBaseUrl");

  if (opts.envelopeTtlSec !== undefined) {
    const ttl = opts.envelopeTtlSec;
    if (!Number.isFinite(ttl) || ttl < 60 || ttl > 3600) {
      throw new OmadaFatalError(
        `CIMDIntegration: envelopeTtlSec must be between 60 and 3600 seconds, got ${ttl}`,
      );
    }
  }
}

function requireNonEmpty<T extends object>(obj: T, key: keyof T & string): void {
  const v = obj[key];
  if (typeof v !== "string" || v.trim() === "") {
    throw new OmadaFatalError(`CIMDIntegration: ${key} is required`);
  }
}

function requireHttps(raw: string, key: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new OmadaFatalError(`CIMDIntegration: ${key} is not a valid URL`);
  }
  if (url.protocol !== "https:") {
    throw new OmadaFatalError(`CIMDIntegration: ${key} must use https://`);
  }
}
