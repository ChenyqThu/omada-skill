# Changesets

This directory is managed by [changesets](https://github.com/changesets/changesets).

## When to add a changeset

Add one whenever a PR changes published behavior. Today, `@omada/sdk` is marked
`private: true`, so changesets are informational only — but we already run the
tooling so we're ready to flip to public release without rework.

```bash
pnpm changeset        # create a new changeset interactively
pnpm changeset status # see what would release
```

## Config

See [`config.json`](./config.json). Base branch is `main`. Access is
`restricted` until we decide to publish `@omada/sdk` externally (see
`docs/architecture.md` §"SDK 策略").
