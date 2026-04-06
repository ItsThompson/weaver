import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["sync/**/*.test.ts", "logger/**/*.test.ts"],
  },
});
