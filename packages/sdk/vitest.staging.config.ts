import { defineConfig } from "vitest/config";

// Explicit config for `pnpm test:staging` — includes the staging file that
// the default config excludes. Still gated by describe.skipIf(!creds) so
// running this without OMADA_CLIENT_ID/SECRET produces a pass-by-skip.
export default defineConfig({
  test: {
    include: ["test/staging.test.ts"],
    testTimeout: 30_000,
  },
});
