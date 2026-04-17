import { defineConfig } from "tsdown";

const shared = {
  format: "esm" as const,
  platform: "node" as const,
  target: "es2022" as const,
  sourcemap: true,
  deps: { alwaysBundle: [/^@weaver\//] },
};

export default defineConfig([
  { entry: ["src/index.ts"], ...shared },
  { entry: ["src/log-event.ts"], ...shared },
  { entry: ["src/sync/sync-entry.ts"], ...shared },
]);
