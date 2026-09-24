import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts?(x)'],
    environmentMatchGlobs: [['apps/web/src/**/*.test.ts?(x)', 'jsdom']],
    setupFiles: ['./apps/web/src/test/setup.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
