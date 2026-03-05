/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
  moduleNameMapper: {
    '^@weaver/shared/(.*)$': '<rootDir>/../shared/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '\\.(css|scss)$': 'identity-obj-proxy',
    '^@cloudscape-design/components/table$': '<rootDir>/__tests__/mocks/cloudscape-table.tsx',
    '^@cloudscape-design/components/tabs$': '<rootDir>/__tests__/mocks/cloudscape-tabs.tsx',
    '^@cloudscape-design/components/expandable-section$': '<rootDir>/__tests__/mocks/cloudscape-expandable-section.tsx',
    '^@cloudscape-design/components/header$': '<rootDir>/__tests__/mocks/cloudscape-header.tsx',
    '^@cloudscape-design/components/button$': '<rootDir>/__tests__/mocks/cloudscape-button.tsx',
    '^@cloudscape-design/components/text-filter$': '<rootDir>/__tests__/mocks/cloudscape-text-filter.tsx',
    '^@cloudscape-design/components/(.+)$': '<rootDir>/__tests__/mocks/cloudscape-passthrough.tsx',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.jest.json' }],
  },
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  setupFiles: ['<rootDir>/__tests__/setup.ts'],
};
