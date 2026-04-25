// @omada/sdk — curated public surface.
//
// This barrel enumerates the stable API consumers outside this repo may rely
// on. The top-level `src/index.ts` re-exports internal fixtures (MockAuth,
// MockTransport, SAMPLE_SITES) so other workspace packages can use them for
// tests; when the SDK flips `private: false` in `package.json`, the intended
// `main` / `exports` entry becomes this file so those internals stop leaking.
//
// Keep this file additive. Every line here is an irreversible public
// commitment once the package is published.

// Typed operations catalogue — generated from the OpenAPI spec.
export { operations, type OperationId, type HttpMethod } from "./generated/operations.js";

// Core client + request/response + option types.
export { OmadaClient } from "./client/OmadaClient.js";
export type {
  OmadaClientOptions,
  CallParams,
  ParamsFor,
  ResponseFor,
  HttpRequest,
  HttpResponse,
  AuthStrategy,
  Transport,
  AuditSink,
  AuditEvent,
  RetryOptions,
} from "./client/types.js";

// Transport default + region helpers.
export { FetchTransport } from "./client/transport.js";
export {
  REGIONS,
  resolveBaseUrl,
  isKnownRegion,
  assertSecureUrl,
  type RegionKey,
  type ResolveBaseUrlOptions,
} from "./client/regions.js";

// Pagination helpers (the `callPaginated` convenience wrapper lives here).
export { callPaginated } from "./client/pagination.js";

// Auth strategies operators wire into OmadaClient.
export { OAuthTokenStore, type OAuthClientCredentials } from "./client/auth/OAuthTokenStore.js";
export { CIMDIntegration, type CIMDIntegrationOptions } from "./client/auth/CIMDIntegration.js";
export { AuthCodeFlow, type AuthCodeFlowOptions } from "./client/auth/AuthCodeFlow.js";

// Audit sink (file-backed JSONL). Consumers may also implement `AuditSink`
// themselves; this one is exported because it's the reference wiring.
export {
  createJsonlAuditSink,
  type JsonlAuditSinkOptions,
  type JsonlAuditSink,
} from "./client/audit/JsonlAuditSink.js";
