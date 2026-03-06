import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  sourcemap: true,
  deps: {
    alwaysBundle: [/^@weaver\//],
    alwaysExternal: ['better-sqlite3'],
  },
});
