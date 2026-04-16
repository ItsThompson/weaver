import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    alias: {
      "@weaver/shared/": new URL("../shared/", import.meta.url).pathname,
      "@weaver/binding-kiro": new URL(
        "../bindings/kiro/src/index.ts",
        import.meta.url,
      ).pathname,
      "@weaver/binding-claude-code": new URL(
        "../bindings/claude-code/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
});
