# Security model

## Threat model

`omada-skill` sits between an AI agent and a production network
controller. The relevant threats are:

| Threat                                         | Controls                                                                                                                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent hallucinates a destructive call          | Every write goes through a two-phase confirm (plan → confirm_token → apply). Catastrophic operations are whitelisted and cannot be called at all without an explicit tool built for them. |
| Stolen OAuth credentials                       | Scope tokens by role on the controller side; use short-lived Client Credentials (default 1 hour). `OAuthTokenStore.invalidate()` on 401 forces re-issuance.                               |
| Agent exfiltrates telemetry to the LLM context | Redaction of sensitive headers/fields via `@omada/shared`'s `redact()` before any structured content leaves the tool.                                                                     |
| Prompt injection via tool output               | Tool outputs are plain text; we never `eval` returned values or auto-apply them. Structured content is opaque to the LLM unless it asks.                                                  |
| Replay of old plans                            | Confirm tokens are HMAC-bucketed with a 5-minute TTL and tied to the canonical plan; a stale plan cannot be re-confirmed.                                                                 |

## Authentication

**OAuth2 Client Credentials** is the only fully-implemented flow in M1.

```
POST <baseUrl>/openapi/authorize/token
content-type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=…&client_secret=…
```

The controller responds with either RFC 6749 shape or the Omada-wrapped
shape; both are parsed (`OAuthTokenStore.parseTokenResponse`).

Tokens are cached in memory until `expires_in - 60 s`. Concurrent
`getToken()` calls de-duplicate into a single network fetch. On 401
the cache is invalidated so the next call forces a refresh.

**Authorization Code** flow (delegated login) and **CIMD + Claude
Vault** (delegated credential management) are stubbed in
`packages/sdk/src/client/auth/` and planned for M5.

## Scopes

The Omada Open API's `components.securitySchemes` block is currently
missing from the JSON, so scopes are inferred from error messages at
runtime. M5 will:

- Maintain a hand-curated scope map alongside the generated operations
- Enforce a scope-checker middleware on the client side
- Tag each MCP tool with the scopes it requires so the server can hide
  tools the caller's token cannot exercise

## Dry-run

`OmadaClient.dryRun = true` makes every non-`GET` call short-circuit
before reaching the transport:

```jsonc
{
  "__dryRun": true,
  "operationId": "deleteSite",
  "method": "delete",
  "path": "/openapi/v1/{omadacId}/sites/{siteId}",
  "params": {
    /* what would have been sent */
  },
}
```

The result is logged by the `audit` sink and returned to the caller.
No bearer token is attached, no network request happens.

Turn on via `OMADA_DRY_RUN=1` for a whole process, or per-tool via the
tool's input schema (planned — M3).

## High-risk whitelist

Ten operationIds are flagged in
`packages/guardrails/src/highRiskOps.ts`:

```
deleteSite, deleteSiteTemplate,          // catastrophic / medium
forgetDevice, rebootDevice, factoryReset, // medium / catastrophic
rebootMlag, forceProvisionStack, forgetStack, // high / catastrophic / catastrophic
onlineRollingUpgrade, ispUpgradeGateway   // high
```

Tools that intend to call one of these must opt in by calling
`isHighRiskOperation()` explicitly. The unimplemented default is
"refuse and return isError"; M3 writes enforce this path.

## Confirm tokens (two-phase commit)

For tools that ultimately need to write:

1. **Phase 1** (no `confirm_token` in the input): the tool builds a
   plan (`{op, siteId, diff, …}`), calls
   `issueConfirmToken(plan)`, and returns a text preview
   - the token + `__phase: "plan"`.
2. **Phase 2** (same inputs + `confirm_token`): the tool re-builds
   the plan and calls `verifyConfirmToken(plan, token)`. If the plan
   hash matches, the write proceeds; otherwise it fails closed with
   a "plan changed, re-plan" error.

Tokens are HMAC-SHA-256 over
`(secret ‖ bucket ‖ ttl ‖ canonicalPlanJson)` truncated to 32 chars
of base64url. Two buckets' worth are accepted on verification so a
token issued at the very end of one bucket still works at the start
of the next.

The secret must be set via `OMADA_MCP_CONFIRM_SECRET` (≥ 16 chars).
Generate one with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

## Audit log

`OmadaClient` fires an `AuditEvent` for every call:

```ts
{
  ts: ISO8601,
  operationId: "getSiteList",
  method: "get",
  path: "/openapi/v1/{omadacId}/sites",
  dryRun: false,
  status: 200,
  error: undefined,   // or "auth" | "rateLimit" | "transient" | ...
}
```

M1 keeps the sink in-process (`onAudit` option on `OmadaClient`).
M2 routes it to `~/.omada-mcp/audit/YYYY-MM-DD.jsonl` and applies
`redact()` before serialising.
