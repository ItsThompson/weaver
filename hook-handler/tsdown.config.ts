import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: ['src/validate/validate.ts'],
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    sourcemap: true,
    deps: {
      alwaysBundle: [/^@weaver\//],
    },
  },
  {
    entry: ['src/inject/inject.ts'],
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    sourcemap: true,
    deps: {
      alwaysBundle: [/^@weaver\//],
    },
  },
]);
