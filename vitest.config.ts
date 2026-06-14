import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    dedupe: ['graphql'],
  },
  test: {
    environment: 'node',
    pool: 'forks',
    poolOptions: {
      forks: {
        isolate: false,
      },
    },
    server: {
      deps: {
        inline: ['graphql', '@apollo/subgraph', 'graphql-yoga'],
      },
    },
  },
})
