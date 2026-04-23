import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/test/**/*.test.ts",
      "packages/*/src/**/*.test.ts",
      "apps/*/test/**/*.test.ts",
      "apps/*/src/**/*.test.ts",
    ],
    reporters: "default",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
      exclude: [
        "packages/*/src/generated/**",
        "packages/*/src/**/*.test.ts",
        "apps/*/src/**/*.test.ts",
      ],
    },
  },
});
