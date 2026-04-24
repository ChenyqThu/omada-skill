# omada-skill

> English · [中文](./README.zh.md)

AI-native integration layer for **TP-Link Omada Controller** — an MCP server
plus curated Claude Agent Skills that let Claude (and any MCP client) drive
Omada sites the way an expert network engineer would.

## What's inside

| Piece                                                           | What it does                                                                                                                                                                |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MCP server** — [`apps/mcp-server`](./apps/mcp-server)         | 22 intent-grouped tools + one operation escape hatch, dual stdio / HTTP transport, two-phase commit on all writes, JSONL audit sink.                                        |
| **Agent skills** — [`skills/`](./skills)                        | 5 Claude Agent Skills shipped as MCP resources (`resource://omada-skills/<name>`): bulk-site-onboard, alert-triage, guest-portal-wizard, wifi-troubleshoot, support-assist. |
| **Internal SDK** — [`packages/sdk`](./packages/sdk)             | Typed TypeScript client for the Omada Open API (2,269 operations), regenerated from the single source of truth in [`specs/omada_api.json`](./specs/omada_api.json).         |
| **Guardrails** — [`packages/guardrails`](./packages/guardrails) | High-risk operation whitelist with severity tiers, deterministic HMAC-bucketed confirm tokens for the two-phase helper.                                                     |

## Project status (M5 landed)

**166 tests green**, `pnpm turbo run typecheck lint test build` under 6 s
cold. Detailed milestone history in
[`docs/STATUS.zh.md`](./docs/STATUS.zh.md) and the fresh handoff in
[`HANDOFF.md`](./HANDOFF.md).

- **M1** — monorepo scaffold, SDK generated, guardrails, mcp-server, seed
  tool, specs baseline. 54 tests.
- **M2** — SDK maturation: retry, JSONL audit, coverage gate, staging
  scaffold, typed responses, M5 auth-strategy stubs. 89 tests.
- **M3** — 22 intent tools + two-phase commit helper. 142 tests.
- **M4** — 5 agent skills with frontmatter, RESOURCES, examples,
  checklists. 142 tests (pure markdown).
- **M5** — skill loader, MCP-resource publisher, `pnpm skill:validate` +
  `pnpm spec:diff` CLIs, CI wiring, auth-stub option validation,
  `docs/mcp-tools.md` back-fill. 166 tests.
- **M6** (blocked on external docs / credentials) — real CIMD +
  Authorization-Code bodies, staging dogfood, skill-trigger calibration.
  See [`HANDOFF.md §3`](./HANDOFF.md).

## Quick start

Requires **Node 22 LTS** and **pnpm** (install via
`corepack prepare pnpm@latest --activate`).

```bash
pnpm install
pnpm build

# Local (Claude Desktop, Cursor)
npx omada-mcp --stdio

# Remote (web Claude, managed agents)
npx omada-mcp --http --port 8787
```

Credentials via env — see [`docs/security.md`](./docs/security.md) for
CIMD / Vault options (M6):

```
OMADA_CLIENT_ID=...
OMADA_CLIENT_SECRET=...
OMADA_REGION=use1
OMADA_DRY_RUN=1                 # optional: short-circuit every write
OMADA_MCP_CONFIRM_SECRET=...    # required (≥16 chars) for write tools
OMADA_AUDIT_DIR=./audit         # optional: JSONL audit sink
```

Without `OMADA_CLIENT_ID` + `OMADA_CLIENT_SECRET` the server starts in
**mock mode** with three built-in `SAMPLE_SITES` — handy for offline
development.

## Repo scripts

```bash
pnpm build                 # turbo run build
pnpm test                  # turbo run test (166 tests)
pnpm test:staging          # real-controller integration (needs creds)
pnpm typecheck             # turbo run typecheck
pnpm lint                  # turbo run lint
pnpm generate              # regenerate SDK from specs/omada_api.json
pnpm spec:diff             # diff current spec vs latest snapshot
pnpm skill:validate        # lint skills/** (pass --strict for CI)
pnpm skill:validate --strict
```

## Documentation

Full navigation: [`docs/README.md`](./docs/README.md) (English),
[`docs/README.zh.md`](./docs/README.zh.md) (中文).

- [Architecture](./docs/architecture.md)
- [MCP tool reference](./docs/mcp-tools.md) — every tool's backing
  operation and risk tier
- [Skills authoring guide](./docs/skills.md)
  · [中文版](./docs/skills.zh.md)
- [Security & guardrails](./docs/security.md)
- [Deployment](./docs/deployment.md) — stdio + HTTP + Claude Desktop
- [API regeneration SOP](./docs/api-regeneration.md)
- [Contributing](./docs/contributing.md)
- [Milestone history (中文)](./docs/STATUS.zh.md)

## Design origin

Built on the principles from Anthropic's
[Building agents that reach production systems with MCP](./docs/Building%20agents%20that%20reach%20production%20systems%20with%20MCP.md)
(Apr 2026) — intent-grouped tools, remote-first server, CIMD auth, MCP
Apps, and paired Skills-plus-MCP distribution.

## License

[MIT](./LICENSE) © 2026 Chen Yuanquan
