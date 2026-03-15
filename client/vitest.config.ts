import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: "jsdom",
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      setupFiles: ["./__tests__/setup.ts"],
      alias: {
        "@weaver/shared/": new URL("../shared/", import.meta.url).pathname,
      },
    },
  }),
);
