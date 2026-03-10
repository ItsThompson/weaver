import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: ['src/validate.ts'],
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    sourcemap: true,
    deps: {
      alwaysBundle: [/^@weaver\//],
    },
  },
  {
    entry: ['src/inject.ts'],
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    sourcemap: true,
    deps: {
      alwaysBundle: [/^@weaver\//],
    },
  },
]);
