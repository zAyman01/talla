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
    // The browser gates are excluded here and run by `pnpm gates` instead. They each
    // launch a Chromium, they take an order of magnitude longer than everything else, and
    // sharing a worker pool with a suite where most files start a PGlite instance runs
    // the machine out of memory. CI runs them as their own job for the same reason.
    exclude: ['**/node_modules/**', 'test/gates/**'],
    environment: 'node',
    // A count, not a fraction of the cores. Most files here start a PGlite instance,
    // which is a WebAssembly PostgreSQL carrying its own heap, so the ceiling is memory
    // and not parallelism: four forks sit under about two gigabytes, and a twelve core
    // machine running one fork per core exhausts a 16 GB laptop partway through. The
    // symptom is a worker exiting with no message and a different set of files reported
    // missing on every run, which reads like flaky tests and is not.
    maxWorkers: 4,
    // Coverage percentage is not a target (spec 16.3). The five test kinds named there
    // are, and none of them is served by a threshold number.
    reporters: ['default'],
  },
});
