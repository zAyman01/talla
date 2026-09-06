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
  });

  it('passes on the real tree', () => {
    const { status, output } = cruise('modules', 'packages', 'workers');
    expect(status, output).toBe(0);
  });
});
