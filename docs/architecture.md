# Architecture

`omada-skill` turns the Omada Open API (OpenAPI 3.0.1, 1,713 paths, 2,269
operations) into something a language-model agent can use safely and
productively. The architecture is a **thin, typed SDK at the base, a
small set of intent-shaped MCP tools on top, and a transport-agnostic
server that speaks MCP to any client**.

## Layering

```
┌─────────────────────────────────────────────────────────────┐
│  Claude Desktop / Cursor / Web Claude / Managed Agents      │  MCP client
└──────────────┬──────────────────────────┬───────────────────┘
               │ stdio                    │ HTTP + SSE
┌──────────────▼──────────────────────────▼───────────────────┐
│  apps/mcp-server                                             │  MCP Server
│  • StdioServerTransport        • StreamableHTTPServerTransport
│  • CORS, 1 MiB body cap,       • per-session routing by
│    bearer auth headers           mcp-session-id header
│  • ListToolsRequestSchema → ToolRegistry.list()
│  • CallToolRequestSchema  → ToolRegistry.call()
└──────────────┬───────────────────────────────────────────────┘
               │
┌──────────────▼─────────┬────────────────────────────────────┐
│  packages/mcp-tools    │  packages/guardrails              │
│  • defineTool(z)       │  • HIGH_RISK_OPERATION_IDS         │
│  • ToolRegistry        │  • riskSeverity()                  │
│  • omada_list_sites    │  • issueConfirmToken /             │
│    (M1 seed; 21 more     verifyConfirmToken (two-phase      │
│    in M3 per plan)       commit, canonical plan hash)       │
└──────────────┬─────────┴────────────────────────────────────┘
               │
┌──────────────▼───────────────────────────────────────────────┐
│  packages/sdk                                                 │
│  ├─ generated/schema.d.ts   (openapi-typescript output)      │
│  ├─ generated/operations.ts (operationId → {method, path,    │
│  │                           tags, summary, deprecated})     │
│  └─ client/                                                  │
│     • OmadaClient.call<Op>(opId, params)                    │
│     • OAuthTokenStore (client_credentials, caching, dedup)  │
│     • FetchTransport   (timeout + error classification)      │
│     • MockTransport    (offline + test fixture)              │
└──────────────┬───────────────────────────────────────────────┘
               │ HTTPS + OAuth2
┌──────────────▼───────────────────────────────────────────────┐
│  Omada Controller Open API                                    │
│  (use1-omada-northbound.tplinkcloud.com; region map in       │
│   packages/sdk/src/client/regions.ts)                        │
└──────────────────────────────────────────────────────────────┘
```

## Why these layers

Every layer is an answer to a specific problem the next layer up would
otherwise have to solve itself.

| Layer              | The problem it solves                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Spec → codegen** | Agents cannot read OpenAPI; we compile it to TypeScript types + an `operationId → metadata` map so the rest of the stack is type-safe and free of path strings.                                                    |
| **SDK client**     | OAuth token lifecycle, retry classification, dry-run, audit events — cross-cutting concerns that every tool would otherwise re-implement.                                                                          |
| **Guardrails**     | High-risk writes (delete site, reboot device, factory reset, …) need a two-phase commit — a list, a severity tier, and a deterministic confirm-token mechanism.                                                    |
| **MCP tools**      | 1,713 endpoints ≫ any agent's tool budget. `omada_list_sites` is the first of ~22 planned **intent-shaped** wrappers that map user goals to 1–N API calls, per Anthropic's "fewer, well-described tools" guidance. |
| **MCP server**     | Speak MCP (2025-06-18), route between transports, manage sessions, and delegate every call to the registry.                                                                                                        |

## Data flow — `omada_list_sites`

1. Claude Desktop issues `tools/list` over stdio → server returns
   `{name: "omada_list_sites", description, inputSchema (JSON Schema)}`.
2. User prompts "list my sites". Claude issues `tools/call` with
   `arguments: {omadacId, page, pageSize}`.
3. Registry runs zod validation on arguments; on failure returns
   `{isError: true, content: [{type:"text", text:"Invalid …"}]}` rather
   than throwing (MCP convention).
4. Tool handler calls `client.call("getSiteList", {path, query})`.
5. `OmadaClient` resolves the region base URL, interpolates path
   params, serialises query, acquires a bearer token via
   `OAuthTokenStore.getToken()` (cache hit or token endpoint POST),
   and sends the request through `FetchTransport` (or `MockTransport`
   in mock mode / tests).
6. Response is classified by status (401 invalidates the auth cache;
   4xx/5xx raise typed `OmadaError` subclasses; 2xx resolves).
7. Tool handler formats a text summary (site count + first N bullets)
   and attaches `structuredContent: {totalRows, currentPage, sites}`
   for programmatic access.
8. MCP server serialises the result and sends it back; Claude renders
   the text in chat.

## Mock mode

Starting without `OMADA_CLIENT_ID` / `OMADA_CLIENT_SECRET` wires the SDK
with a `MockTransport` pre-seeded with `SAMPLE_SITES`. The full stack
— auth, registry, server, MCP protocol — runs end-to-end against the
fixture, which keeps local development, CI, and demo flows all
offline-friendly. See [`deployment.md`](./deployment.md#mock-mode) for
how to switch to a real controller.

## Layout

```
omada_skill/
├── apps/mcp-server/               # the binary
├── packages/
│   ├── shared/                    # logger, errors, retry, redact, pagination
│   ├── sdk/                       # typed Omada API client (internal today)
│   ├── guardrails/                # high-risk whitelist + confirm tokens
│   └── mcp-tools/                 # intent-shaped MCP tools + registry
├── skills/                        # Claude Agent Skills (M4 — roadmap)
├── specs/
│   ├── omada_api.json             # single source of truth
│   └── snapshots/                 # dated baselines for api-diff
├── scripts/generate.ts            # spec → SDK codegen
├── docs/                          # you are here
└── .github/workflows/ci.yml
```

## What M1 intentionally does NOT cover

These items from the plan are deferred — architecture is already laid
out for them, only implementation work remains.

- **More MCP tools**: only `omada_list_sites` exists; 21 more planned
  (M3).
- **Skills**: `skills/` directory reserved; 5 bundled skills planned (M4).
- **Elicitation / MCP Apps**: server is ready for `capabilities.elicitation`
  and app content, M3/M4 wire them up.
- **Claude Vault / CIMD integration**: placeholders only; M5 binds to
  Claude Managed Agents.
- **Tool search (lazy schema load)**: registry is eager; M3 adds the
  progressive-disclosure hook described in the Anthropic article.
- **`api-diff.yml` CI**: structural diff + breaking-change gate planned
  for M5.
