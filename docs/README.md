# omada-skill docs

Navigation for the `omada-skill` monorepo.

## For users of the MCP server

- **[Deployment](./deployment.md)** — run `omada-mcp` in stdio (Claude Desktop, Cursor) or HTTP (web Claude, managed agents)
- **[MCP tool reference](./mcp-tools.md)** — what every tool does, its input schema, and example transcripts
- **[Skills](./skills.md)** — Claude Agent Skills bundled with the server (roadmap)
- **[Security](./security.md)** — authentication, scopes, dry-run, confirm tokens, audit logs

## For contributors

- **[Architecture](./architecture.md)** — the mental model: SDK → guardrails → mcp-tools → mcp-server, and why
- **[API regeneration SOP](./api-regeneration.md)** — when TP-Link ships a new `omada_api.json`, how to absorb it safely
- **[Contributing](./contributing.md)** — commit style, lint hooks, how to add a tool

## Reference

- [Anthropic: Building agents that reach production systems with MCP](./Building%20agents%20that%20reach%20production%20systems%20with%20MCP.md) — the design principles this project implements

## Planning

- `~/.claude/plans/omada-mcp-fizzy-owl.md` — the original M1–M5 plan (plan-mode artefact, not in the repo)
