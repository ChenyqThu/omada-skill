import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/test/**/*.test.ts",
      "packages/*/src/**/*.test.ts",
      "apps/*/test/**/*.test.ts",
      "apps/*/src/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "packages/sdk/test/staging.test.ts"],
    reporters: "default",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
      exclude: [
        "packages/*/src/generated/**",
        "packages/*/src/**/*.test.ts",
        "apps/*/src/**/*.test.ts",
        // Runtime entry points and thin transport glue are smoke-tested by
        // apps/mcp-server/test/server.test.ts — measuring line coverage on
        // the process-boot paths just punishes tidy wiring.
        "apps/mcp-server/src/index.ts",
        "apps/mcp-server/src/transport/**",
      ],
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 70,
        branches: 70,
      },
    },
  },
});
