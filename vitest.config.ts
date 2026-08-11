import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts?(x)'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
