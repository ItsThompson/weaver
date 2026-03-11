import { defineConfig } from "tsdown";

// Main and preload MUST be separate builds. Electron runs them in different
// process contexts (main vs renderer), so the bundler must never code-split
// or share chunks between them.
export default defineConfig([
  {
    entry: ["src/main.ts"],
    format: "cjs",
    platform: "node",
    target: "es2022",
    sourcemap: true,
    deps: {
      alwaysBundle: [/^@weaver\//],
      neverBundle: ["electron"],
    },
  },
  {
    entry: ["src/preload.ts"],
    format: "cjs",
    platform: "node",
    target: "es2022",
    sourcemap: true,
    deps: {
      neverBundle: ["electron"],
    },
  },
]);
