import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const cruiser = fileURLToPath(
  new URL(
    '../node_modules/dependency-cruiser/bin/dependency-cruise.mjs',
    import.meta.url,
  ),
);

function cruise(...targets: string[]): { status: number | null; output: string } {
  const result = spawnSync(
    process.execPath,
    [cruiser, ...targets, '--config', '.dependency-cruiser.cjs'],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/**
 * The gate itself is tested, not just the tree. A boundary linter that passes because
 * its rules never match anything is worse than no linter: it reports green while the
 * boundaries dissolve.
 */
describe('module boundaries', () => {
  it('catches a module reaching into another module internals', () => {
    const { status, output } = cruise('test/fixtures/boundary-violation');
    expect(status, 'the planted violation did not fail the gate').not.toBe(0);
    expect(output).toContain('no-cross-module-internals');
    expect(output).toContain('commerce/internal/pricing.ts');
  }, 60_000);

  it('catches a client component reaching into the server container', () => {
    // The rule this proves is the one that keeps a connection string and four secrets
    // out of a browser bundle. A violation of it is invisible in review.
    const { status, output } = cruise('test/fixtures/client-into-server');
    expect(status, 'the planted violation did not fail the gate').not.toBe(0);
    expect(output).toContain('no-client-into-server');
    expect(output).toContain('server/container.ts');
  }, 60_000);

  it('passes on the real tree', () => {
    // `apps` is included because the root `boundaries` script cruises it. A test that
    // checks less than the gate does is a test that goes green while the gate goes red.
    const { status, output } = cruise('modules', 'packages', 'workers', 'apps');
    expect(status, output).toBe(0);
  }, 60_000);
});
