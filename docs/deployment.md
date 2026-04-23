# Deployment

`omada-mcp` is a single-binary MCP server. It runs in two transports,
pairs with either real Omada credentials or a built-in fixture, and
has no state to persist beyond its OAuth token cache.

## Install

```bash
pnpm install        # one-time, from repo root
pnpm build
```

The compiled binary lives at `apps/mcp-server/dist/index.js` and is
registered as `omada-mcp` (see `bin` in the package.json).

## Environment variables

| Variable                   | Purpose                                                          | Default                                          |
| -------------------------- | ---------------------------------------------------------------- | ------------------------------------------------ |
| `OMADA_CLIENT_ID`          | OAuth client ID issued by the controller                         | (unset → mock mode)                              |
| `OMADA_CLIENT_SECRET`      | OAuth client secret                                              | (unset → mock mode)                              |
| `OMADA_REGION`             | Region key — currently only `use1` is defined                    | `use1`                                           |
| `OMADA_BASE_URL`           | Override the full controller URL (trumps `OMADA_REGION`)         | (region default)                                 |
| `OMADA_TOKEN_URL`          | Override the OAuth token endpoint                                | `<baseUrl>/openapi/authorize/token`              |
| `OMADA_DRY_RUN`            | `"1"` or `"true"` → all writes short-circuit with a plan preview | `false`                                          |
| `OMADA_MCP_CONFIRM_SECRET` | High-entropy secret mixed into confirm tokens (≥ 16 chars)       | (required for write tools with two-phase commit) |

### Local `.env.local`

The `dev:stdio`, `dev:http`, and `start` scripts in
`apps/mcp-server/package.json` pass Node's built-in
`--env-file-if-exists=.env.local` flag (resolved against each
script's cwd — `apps/mcp-server/`). Copy the repo-root `.env.example`
to `apps/mcp-server/.env.local` and fill in the values you need;
`.env.local` is git-ignored by the root `.gitignore`.

The flag is only attached to the dev/start scripts — running the
compiled binary directly (`node dist/index.js`, `npx omada-mcp`) does
**not** read `.env.local`. Use system environment variables or a
process manager for production deployments.

## stdio (Claude Desktop, Cursor)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "omada": {
      "command": "node",
      "args": ["/absolute/path/to/apps/mcp-server/dist/index.js", "--stdio"],
      "env": {
        "OMADA_CLIENT_ID": "…",
        "OMADA_CLIENT_SECRET": "…",
        "OMADA_REGION": "use1"
      }
    }
  }
}
```

Or during development, point directly at `tsx`:

```json
{
  "command": "pnpm",
  "args": ["--filter", "@omada/mcp-server", "dev:stdio"]
}
```

Restart Claude Desktop. The `omada_list_sites` tool should appear in
the tool picker.

## HTTP (web Claude, managed agents, remote access)

```bash
OMADA_CLIENT_ID=… OMADA_CLIENT_SECRET=… \
  npx omada-mcp --http --port 8787
```

The server listens on `127.0.0.1:8787` by default. Path `/mcp` accepts:

- `POST` — JSON-RPC request; first call initialises a session and the
  server sets `mcp-session-id` on the response.
- `GET` — opens an SSE stream for the session.
- `DELETE` — tears down a session (handled by the transport layer).
- `OPTIONS` — CORS preflight; origin is `*` for dev. Lock this down
  behind a reverse proxy (nginx, cloudflared) before exposing publicly.

Smoke test:

```bash
curl -sS -X POST http://127.0.0.1:8787/mcp \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":
       {"protocolVersion":"2025-06-18","capabilities":{},
        "clientInfo":{"name":"curl","version":"0"}}}'
```

Expect `event: message\ndata: {"result":{"protocolVersion":"2025-06-18",
"capabilities":{"tools":{}},"serverInfo":{"name":"omada-mcp", …}}}`.

## Mock mode

When `OMADA_CLIENT_ID` / `OMADA_CLIENT_SECRET` are absent, the server
boots with a `MockTransport` that serves the three sites in
`packages/sdk/src/client/mock/MockTransport.ts` (`SAMPLE_SITES`). No
network access needed. Ideal for:

- Claude Desktop demos where you don't want to expose credentials
- CI jobs that need to exercise the full MCP protocol
- Driving Claude through the tool schema without hitting TP-Link

The server logs a conspicuous `running in MOCK mode` warning at
startup so it's obvious when you accidentally forgot to set
credentials.

## Production hardening (not yet implemented — M5)

- Bind to `127.0.0.1` only, terminate TLS at a proxy, and require
  bearer-token auth at the proxy (MCP clients propagate it through
  the `authorization` header).
- Replace local env-var credentials with Claude Managed Agents Vault
  once `CIMDIntegration.ts` is filled in.
- Ship audit logs to a separate sink (currently stderr-only via the
  `Logger`).
- Rate-limit per-session at the proxy.
