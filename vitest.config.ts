import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'test/**/*.test.ts',
      'packages/*/test/**/*.test.ts',
      'modules/*/test/**/*.test.ts',
      'workers/*/test/**/*.test.ts',
      'apps/*/test/**/*.test.ts',
    ],
    environment: 'node',
    // Half the cores, not all of them. Most files in this suite start a PGlite instance,
    // which is a WebAssembly PostgreSQL with its own heap, and one fork per core runs a
    // 16 GB machine out of memory partway through. The symptom is a worker exiting with
    // no message and a different set of files reported missing on every run, which reads
    // like flaky tests and is not.
    maxWorkers: '50%',
    // Coverage percentage is not a target (spec 16.3). The five test kinds named there
    // are, and none of them is served by a threshold number.
    reporters: ['default'],
  },
});
