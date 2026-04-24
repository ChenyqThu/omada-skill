import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    // Staging hits a live controller; only the dedicated `test:staging`
    // script should pick it up. CI + default `pnpm test` must skip.
    exclude: ["**/node_modules/**", "**/dist/**", "test/staging.test.ts"],
  },
});
