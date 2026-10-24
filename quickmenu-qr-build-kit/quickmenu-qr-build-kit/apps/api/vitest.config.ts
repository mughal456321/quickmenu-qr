import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"],
    globals: true,
    isolate: true,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/services/**/*.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 75,
      },
    },
  },
  resolve: {
    alias: {
      "@quickmenu/shared": path.resolve(
        __dirname,
        "../../packages/shared/src/index.ts"
      ),
    },
  },
});