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
      include: ["src/domain/**/*.ts", "src/services/**/*.ts"],
      exclude: ["**/*.test.ts"],
      thresholds: {
        // Overall backend business-logic coverage (Week 6 acceptance).
        lines: 70,
        functions: 70,
        statements: 70,
        branches: 70,
        // The pure domain engine must stay above 90% (Part A).
        "src/domain/**": {
          lines: 90,
          functions: 90,
          statements: 90,
          branches: 90,
        },
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