import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The sandboxed Windows runner denies concurrent writes to the shared SSR
    // cache; running files in one worker keeps `npm test` deterministic.
    fileParallelism: false,
    include: ['src/**/*.test.ts'],
  },
})
