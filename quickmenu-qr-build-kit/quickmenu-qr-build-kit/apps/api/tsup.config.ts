import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["cjs"],
  dts: true,
  clean: true,
  outDir: "dist",
  target: "node20",
  external: ["@quickmenu/shared"],
  splitting: false,
  sourcemap: true,
});