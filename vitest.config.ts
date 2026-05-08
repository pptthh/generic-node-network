import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['test/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['lib/**/*.ts'],
      exclude: ['lib/types/**', 'lib/**/*.d.ts'],
      thresholds: {
        lines: 67,
        functions: 67,
        branches: 50,
        statements: 67,
      },
    },
  },
});
