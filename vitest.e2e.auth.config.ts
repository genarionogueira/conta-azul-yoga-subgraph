import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/e2e/keycloak-auth.e2e.test.ts'],
    globalSetup: ['tests/e2e/setup.auth.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
    pool: 'forks',
    poolOptions: {
      forks: {
        isolate: true,
      },
    },
  },
})
