import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'packages/*/test/**/*.test.ts'],
    environment: 'node',
    // Coverage percentage is not a target (spec 16.3). The five test kinds named there
    // are, and none of them is served by a threshold number.
    reporters: ['default'],
  },
});
