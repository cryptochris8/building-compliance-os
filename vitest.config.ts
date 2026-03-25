import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/db/**', 'src/lib/**/__tests__/**'],
      thresholds: {
        statements: 25,
        branches: 20,
        functions: 20,
        lines: 25,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
