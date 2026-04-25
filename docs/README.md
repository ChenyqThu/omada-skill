# omada-skill docs

> English · [中文](./README.zh.md)

Navigation for the `omada-skill` monorepo.

## For users of the MCP server

- **[Deployment](./deployment.md)** — run `omada-mcp` in stdio
  (Claude Desktop, Cursor) or HTTP (web Claude, managed agents).
- **[MCP tool reference](./mcp-tools.md)** — every intent tool's input
  schema, backing operation, risk tier, and source link. Covers all 22
  tools shipped in M3.
- **[Skills](./skills.md)** · [中文版](./skills.zh.md) — how the five
  Claude Agent Skills under [`skills/`](../skills/) are structured and
  published as `resource://omada-skills/<name>` MCP resources.
- **[Security & guardrails](./security.md)** — authentication scopes,
  dry-run, the two-phase confirm-token handshake, and the JSONL audit
  sink.

## For contributors

- **[Architecture](./architecture.md)** — the mental model: SDK →
  guardrails → mcp-tools → mcp-server.
- **[API regeneration SOP](./api-regeneration.md)** — absorbing a new
  `specs/omada_api.json`, plus how `pnpm spec:diff` surfaces
  operation-level drift against the latest snapshot.
- **[Contributing](./contributing.md)** — commit style (Conventional
  Commits), lint hooks (lefthook), and how to add a new intent tool
  or a new skill.

## M6 — what's next

- **[M6 auth research questions](./m6-auth-research-questions.md)** —
  the contract questions for TP-Link engineering that gate filling in
  the CIMD / Authorization-Code stub bodies.
- **[Staging runbook](./staging-runbook.md)** — step-by-step playbook
  for the first end-to-end pass against a real controller. Skeleton
  today; the first operator to dogfood replaces every `TBD` cell.

## Milestone history

- **[STATUS.zh.md](./STATUS.zh.md)** — M1 → M5 milestone summary
  (Chinese), with test counts per package and what's deferred to M6.
- **[HANDOFF.md](../HANDOFF.md)** — the current
  "next-operator-read-me-first" doc. One was written at every milestone
  boundary; historical versions live under [`archive/`](./archive/).

## Reference

- [Anthropic · Building agents that reach production systems with MCP](./Building%20agents%20that%20reach%20production%20systems%20with%20MCP.md)
  (Apr 2026) — the design principles this project implements.

## Archive

Historical per-milestone handoffs:

- [M1 → M2](./archive/HANDOFF-m1-to-m2.md)
- [M2 → M3](./archive/HANDOFF-m2-to-m3.md)
- [M3 → M4](./archive/HANDOFF-m3-to-m4.md)
- [M4 → M5](./archive/HANDOFF-m4-to-m5.md)
