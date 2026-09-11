import { defineConfig } from 'vitest/config';

/**
 * The browser gates (ADR-0023).
 *
 * Separate from `vitest.config.ts` because these files are a different kind of test: each
 * one drives a real Chromium against a running Talla, they are slow, and they must not
 * share a worker pool with a suite where most files start their own PostgreSQL.
 *
 *   pnpm gates
 *
 * They skip themselves when `TALLA_GATE_URL` names nothing. CONTRIBUTING carries the
 * three commands that produce something for them to point at.
 */
export default defineConfig({
  test: {
    include: ['test/gates/**/*.test.ts'],
    environment: 'node',
    // One at a time. Two Chromiums and a Lighthouse run competing for the same cores
    // measure each other rather than the page.
    fileParallelism: false,
    reporters: ['default'],
  },
});
