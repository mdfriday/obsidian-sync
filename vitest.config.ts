import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'tests/**/*.test.ts',
      'src/sync/sync-core/tests/**/*.test.ts',
    ],
    // Removed: 'src/sync/core/**' exclusion — sync-core tests are now included explicitly.
    // The old src/sync/core/** (now moved into sync-core/src/core/) is excluded via
    // not matching *.test.ts — only test files are included.
    exclude: ['node_modules'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'src/foundry/**',
        'src/services/license.ts',
        'src/services/licenseState.ts',
        'src/license.ts',
        'src/sync/sync-core/src/**',
      ],
    },
  },
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, 'tests/__mocks__/obsidian.ts'),
      '@mdfriday/sync-core': path.resolve(__dirname, 'src/sync/sync-core/src/index.ts'),
    },
  },
});

