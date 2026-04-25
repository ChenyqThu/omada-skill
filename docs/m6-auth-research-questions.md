# M6 auth — research questions for TP-Link

> Use this document to drive the conversation with TP-Link engineering when
> the dev team is reachable. Each section maps directly to a method body or
> wiring step the SDK needs in order to drop the `M5: … not yet wired`
> placeholders in `packages/sdk/src/client/auth/{CIMDIntegration,AuthCodeFlow}.ts`.
>
> Updates from research land directly here; once a section is fully
> answered, copy the contract into the relevant `.ts` file and tick the
> matching item in [`TODO.md`](../TODO.md).

## Why this doc exists

The post-M5 quality pass closed every internal punch-list item. The
remaining M6 work is gated on contracts only TP-Link can supply:

1. **CIMD envelope contract** — exact request/response of the credential
   broker, signing scheme, error semantics.
2. **CIMD → controller token exchange** — which controller endpoint takes
   the envelope and returns a usable bearer.
3. **Authorization Code flow** — PKCE support, scope strings, refresh
   tokens, redirect-URI registration rules.
4. **Region routing** — whether CIMD / AuthCode endpoints differ from the
   controller `baseUrl` per region.
5. **Operational unknowns** — key rotation, monitoring fields, error
   surfaces.

Until §1–§3 are answered we cannot finish either auth strategy without
guessing at field names — and a guess that compiles will silently fail in
prod (or worse, succeed insecurely).

---

## §1 — CIMD envelope contract

CIMD = TP-Link's "Cloud Identity & Management" credential broker. Replaces
storing a long-lived `client_secret` on every workload.

| Question                                                                             | Why it matters                                                            | Status |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------ |
| What HTTP path does `fetchEnvelope()` POST to under `cimdBaseUrl`?                   | Determines the URL we build in `CIMDIntegration.fetchEnvelope()`.         | open   |
| What is the request body shape? (form-encoded? JSON? signed JWT?)                    | Controls whether we use `application/x-www-form-urlencoded` or a JWT lib. | open   |
| What signing algorithm proves `principalId` identity? (HMAC? mTLS? RSA-signed JWT?)  | Determines what `principalKeyPath` actually points at — symmetric / PEM.  | open   |
| What is the response body shape? Field names, TTL field, expected `Content-Type`.    | Drives the parsing in the `getToken()` path.                              | open   |
| What does an envelope look like wire-side? Opaque token? JWT? Structured JSON?       | Decides whether we cache the envelope vs immediately exchange it.         | open   |
| How are envelope errors surfaced? (HTTP status + body shape; specific error codes.)  | Maps onto our `OmadaAuthError` / `OmadaFatalError` classification.        | open   |
| What's the minimum / maximum TTL? Is `envelopeTtlSec` a request parameter or a hint? | Today we accept `60..3600` in option validation; needs ratification.      | open   |
| Are envelopes single-use, or cacheable until TTL?                                    | Caching halves the auth latency on hot paths.                             | open   |
| Is there a "rotate principal key" path we should expose?                             | Affects whether we need a `rotateKey()` method on the strategy.           | open   |

## §2 — CIMD → controller token exchange

After `fetchEnvelope()` we still need a controller bearer to call the M3
intent tools.

| Question                                                                                | Why it matters                                                              | Status |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------ |
| What controller endpoint accepts a CIMD envelope and returns a bearer?                  | The `exchange()` method has no URL today.                                   | open   |
| Is the envelope passed in an `Authorization: …` header or in the body?                  | Affects request shape for `OmadaClient`'s call boundary.                    | open   |
| Does the response use the RFC 6749 shape, or the Omada-wrapped `errorCode/result/data`? | We already parse both in `OAuthTokenStore.parseTokenResponse`; reuse if so. | open   |
| What's the access-token TTL relative to the envelope's TTL?                             | Decides whether we re-cache or always re-exchange.                          | open   |
| What's the failure mode when an envelope is replayed? (`invalid_grant`? specific code?) | Drives the retry / invalidate decision.                                     | open   |
| Does the controller require any additional headers (e.g. `omadacId`, region tag)?       | Determines extra option fields on `CIMDIntegrationOptions`.                 | open   |

## §3 — Authorization Code flow (delegated user)

Targets the case where a human operator authorizes the MCP process once
and the resulting refresh token survives across sessions.

| Question                                                                                | Why it matters                                                                  | Status |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------ |
| Is PKCE supported on `/openapi/authorize/code`? Required? S256 or plain?                | Public-client redirect flow needs PKCE; without it we must keep `clientSecret`. | open   |
| Are loopback redirect URIs accepted (`http://127.0.0.1:<port>/cb`) per RFC 8252?        | Today's option validation accepts loopback http; controller must too.           | open   |
| What scope strings exist? Separator? Required scope for site-read vs site-write?        | We need to populate the `scope` option meaningfully.                            | open   |
| Does the token endpoint return a refresh token? What's its TTL? Sliding or absolute?    | Decides whether we need a persistent refresh-token store at all.                | open   |
| What revocation endpoint exists? RFC 7009 `/revoke`?                                    | Drives whether `invalidate()` does anything more than dropping the cache.       | open   |
| Does consent need to be re-collected after refresh-token expiry, or auto-renews on use? | Affects the operator-experience story.                                          | open   |
| What error codes does the consent screen surface back via `error=…` redirect?           | Lets the loopback callback handler render a useful message.                     | open   |
| Are PAR (pushed-authorization-request, RFC 9126) endpoints available?                   | If yes, request integrity becomes much stronger; nice-to-have.                  | open   |

## §4 — Region routing

We currently key controllers by `OMADA_REGION` ⇒ `baseUrl`. Auth endpoints
may not follow the same key.

| Question                                                                     | Why it matters                                                               | Status |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------ |
| Is `cimdBaseUrl` always derivable from the controller's region?              | Saves operators a config var.                                                | open   |
| Does CIMD region ↔ controller region need to match, or are they independent? | Affects misconfiguration error messages.                                     | open   |
| Are the AuthCode `/authorize` + `/token` URLs region-scoped or global?       | Decides whether `AuthCodeFlowOptions.{authorizeUrl,tokenUrl}` need defaults. | open   |

## §5 — Operational unknowns

Lower priority than §1–§3 but worth covering before rollout.

| Question                                                                           | Why it matters                                                  | Status |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------ |
| What's the SLO on CIMD envelope endpoints? Latency budget?                         | Sets reasonable retry / timeout defaults.                       | open   |
| Are there documented monitoring fields we should emit on envelope refresh?         | Lets operators alert on auth failures cleanly.                  | open   |
| What's the principal-key rotation policy? (manual? scheduled?)                     | Drives whether we need a hot-reload path on `principalKeyPath`. | open   |
| Is there a sandbox/staging CIMD instance we can dogfood against before production? | Required for staging-runbook validation.                        | open   |
| Are there rate limits on `/authorize/token` we should respect?                     | If so, we may want to add per-flow concurrency caps.            | open   |

---

## What lands once §1–§3 are answered

```
packages/sdk/src/client/auth/CIMDIntegration.ts
  fetchEnvelope()  — POST cimdBaseUrl/<endpoint>, sign with principalKeyPath
  exchange()       — POST controller token endpoint with envelope
  getToken()       — cache + de-dup like OAuthTokenStore
  invalidate()     — drop the bearer cache; envelope cache stays

packages/sdk/src/client/auth/AuthCodeFlow.ts
  startAuthorize() — open browser to authorizeUrl with PKCE challenge
  handleCallback() — accept ?code=…&state=… on a loopback HTTP server
  exchange()       — POST tokenUrl, store refresh_token in OS keychain
  getToken()       — cache + refresh
  invalidate()     — drop cache; on 401 call /revoke if available

apps/mcp-server/src/buildClient.ts
  switch on OMADA_AUTH_STRATEGY ∈ {cc, cimd, authcode}
  cc       → OAuthTokenStore (today's behaviour)
  cimd     → new CIMDIntegration({…})
  authcode → new AuthCodeFlow({…})

apps/mcp-server/src/config.ts
  OMADA_AUTH_STRATEGY = cc | cimd | authcode (default cc)
  OMADA_CIMD_BASE_URL
  OMADA_CIMD_PRINCIPAL_ID
  OMADA_CIMD_PRINCIPAL_KEY_PATH
  OMADA_AUTHCODE_REDIRECT_URI
```

Each item already has its option-shape validation in place from M5; only
the bodies need to land.

## Bringing answers back

When research returns answers, update the table cells (`open` →
`answered: …`) and copy the actionable contract into the matching `.ts`
file's docstring. Then implement, add integration tests under
`packages/sdk/test/auth-{cimd,authcode}.test.ts`, and tick the matching
items in `TODO.md`'s M6 section (to be added when the first answer lands).

For the staging side, see [`docs/staging-runbook.md`](./staging-runbook.md).
