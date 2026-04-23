# Contributing

## Prerequisites

- **Node** 22 LTS (`.nvmrc` / `.node-version` are pinned)
- **pnpm** 10 (`corepack prepare pnpm@latest --activate` or
  `npm install -g pnpm`)
- A working git installation

```bash
pnpm install          # installs + registers lefthook pre-commit hooks
pnpm turbo run typecheck lint test build   # baseline check
```

## Branching & commits

- Work on feature branches off `main`: `feat/*`, `fix/*`, `chore/*`.
- `main` is protected; land via PR.
- **Conventional Commits**, enforced by commitlint on `commit-msg`:

  ```
  feat(mcp-tools): add omada_alerts_list
  fix(sdk): honour Retry-After as HTTP-date
  chore(spec): regenerate SDK from omada_api.json 2026-05-01
  docs(security): clarify confirm-token TTL window
  ```

  Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `perf`,
  `test`, `ci`, `build`, `revert`, `style`.

- Keep commits atomic — the test suite should pass at every commit.
- Do not `--amend` shared history. Prefer new commits; squash locally
  if needed.

## Pre-commit hook

`lefthook.yml` runs:

- `eslint --cache` on staged `*.{ts,tsx,js,mjs,cjs}`
- `prettier --write --ignore-unknown` on staged text files

Both stage back their fixes automatically. If eslint reports an error
it cannot auto-fix, the commit aborts — investigate and re-stage.
Never bypass with `--no-verify`.

## Adding a new MCP tool

The checklist for a new tool under `packages/mcp-tools/src/tools/…`:

1. Decide whether it is read-only or a write. Writes belong in a
   later milestone (M3); M1 is read-only only.
2. Write `defineTool({ name, description, inputSchema: z.object(…),
handler })` in a new file under a sensible subdirectory.
3. Register it in `packages/mcp-tools/src/tools/index.ts` inside
   `createDefaultRegistry()`.
4. Call `ctx.client.call("theOperationId", …)` — **never** hard-code
   a path; the operationId map is the source of truth.
5. Add a vitest file next to `test/registry.test.ts` using
   `MockTransport` so it stays offline.
6. Document it in [`mcp-tools.md`](./mcp-tools.md).
7. If the tool calls a high-risk operationId, add that op to
   `packages/guardrails/src/highRiskOps.ts` with a severity tier and
   wire in the confirm-token two-phase flow.

## Updating `specs/omada_api.json`

Follow [`api-regeneration.md`](./api-regeneration.md) verbatim. CI
fails if committed generated files drift from the spec.

## Running the server locally

```bash
# stdio (attach to Claude Desktop)
pnpm --filter @omada/mcp-server dev:stdio

# HTTP (curl, Cursor, browser MCP clients)
pnpm --filter @omada/mcp-server dev:http
```

Without credentials it starts in mock mode — see
[`deployment.md`](./deployment.md#mock-mode).

## Style (code)

- Enforced by eslint + prettier — `pnpm format` applies prettier everywhere.
- Import rules:
  - Type-only → `import type { X }` (required by `verbatimModuleSyntax`).
  - `.js` extension in relative imports (NodeNext resolution).
- Errors: subclass `OmadaError` from `@omada/shared`; `classifyHttpStatus`
  / `errorFromCategory` cover HTTP failure cases.
- Logging: use `logger.child("subsystem")`, never `console.log`. The
  server's stdout is reserved for the stdio transport.

## Style (docs)

- Aim for scannable first-person-plural prose. One idea per paragraph.
- ASCII diagrams over Mermaid unless the source has to ship to a
  non-markdown renderer.
- Link laterally between docs; keep the `docs/README.md` index short.
