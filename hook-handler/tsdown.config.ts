import { defineConfig } from "tsdown";

const shared = {
  format: "esm" as const,
  platform: "node" as const,
  target: "es2022" as const,
  sourcemap: true,
  deps: { alwaysBundle: [/^@weaver\//] },
};

export default defineConfig([
  { entry: ["src/validate/validate.ts"], ...shared },
  { entry: ["src/inject/inject.ts"], ...shared },
  { entry: ["src/sync/sync-entry.ts"], ...shared },
]);
