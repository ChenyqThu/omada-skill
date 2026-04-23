# omada-skill

AI-native integration layer for **TP-Link Omada Controller** — an MCP Server
plus curated Skills that let Claude (and any MCP client) drive Omada sites
the way an expert network engineer would.

## What's inside

| Piece | What it does |
|---|---|
| **MCP Server** (`apps/mcp-server`) | 22 intent-grouped tools + one code-sandbox escape hatch, for MSP / SI / Prosumer / internal Support scenarios |
| **Skills** (`skills/`) | 5 Claude Agent Skills bundled with the server: bulk-site-onboard, alert-triage, wifi-troubleshoot, guest-portal-wizard, support-assist |
| **Internal SDK** (`packages/sdk`) | Typed TypeScript client for the Omada Open API (1,713 endpoints), regenerated from the single source of truth in `specs/omada_api.json` |

## Quick start

Requires **Node 22 LTS** and **pnpm** (install via `corepack prepare pnpm@latest --activate`).

```bash
pnpm install
pnpm build

# Local (Claude Desktop, Cursor)
npx omada-mcp --stdio

# Remote (web Claude, managed agents)
npx omada-mcp --http --port 8787
```

Credentials via env (see [`docs/security.md`](./docs/security.md) for CIMD / Vault options):

```
OMADA_CLIENT_ID=...
OMADA_CLIENT_SECRET=...
OMADA_REGION=use1
```

## Documentation

Full navigation: [`docs/README.md`](./docs/README.md)

- [Architecture](./docs/architecture.md)
- [API regeneration SOP](./docs/api-regeneration.md)
- [Security & guardrails](./docs/security.md)
- [Deployment](./docs/deployment.md)
- [Contributing](./docs/contributing.md)

## Design origin

Built on the principles from Anthropic's
[Building agents that reach production systems with MCP](./docs/Building%20agents%20that%20reach%20production%20systems%20with%20MCP.md)
(Apr 2026) — intent-grouped tools, remote-first server, CIMD auth, MCP Apps,
and paired Skills-plus-MCP distribution.

## License

[MIT](./LICENSE) © 2026 Chen Yuanquan
