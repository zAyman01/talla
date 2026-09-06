import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The workspace scripts are the contract between a developer's terminal and the CI
 * gates. CI calls these names and nothing else, so a rename that misses the workflow
 * turns a blocking gate into a silently skipped one (spec 16.4).
 */
const rootManifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as {
  scripts: Record<string, string>;
  engines: Record<string, string>;
  packageManager: string;
};

describe('workspace manifest', () => {
  it('exposes every script CI depends on', () => {
    for (const script of [
      'generate',
      'typecheck',
      'lint',
      'format:check',
      'test',
      'boundaries',
    ]) {
      expect(rootManifest.scripts[script], `missing script: ${script}`).toBeTruthy();
    }
  });

  it('pins the toolchain the plan was written against', () => {
    expect(rootManifest.engines['node']).toMatch(/^>=24/);
    expect(rootManifest.packageManager).toMatch(/^pnpm@/);
  });
});
