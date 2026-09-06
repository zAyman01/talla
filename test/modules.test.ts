import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The ten modules of spec section 5, with the interface each publishes. A module is
 * imported through this file only; the boundary linter enforces that, and this test
 * enforces that the file exists to be imported.
 */
const MODULES = [
  'ingest',
  'understanding',
  'blocks',
  'solver',
  'assets',
  'viewer',
  'styling',
  'commerce',
  'tenancy',
  'shared',
] as const;

function manifest(path: string): { name: string; exports: Record<string, string> } {
  return JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')) as {
    name: string;
    exports: Record<string, string>;
  };
}

describe('module layout', () => {
  it.each(MODULES)('%s publishes one interface file', (name) => {
    const source = readFileSync(
      new URL(`../modules/${name}/index.ts`, import.meta.url),
      'utf8',
    );
    expect(source.length).toBeGreaterThan(0);
    expect(source, `${name} publishes nothing`).toContain('export');
  });

  it.each(MODULES)('%s exposes only its published entry point', (name) => {
    const { name: packageName, exports } = manifest(`modules/${name}/package.json`);
    expect(packageName).toBe(`@talla/${name}`);
    expect(Object.keys(exports)).toEqual(['.']);
    expect(exports['.']).toBe('./index.ts');
  });

  it('keeps the worker processes out of the module list', () => {
    // Workers are runtime boundaries, not modules (spec 5). They are packages so that
    // the image worker's dependencies stay visible and auditable.
    expect(manifest('workers/image/package.json').name).toBe('@talla/worker-image');
    expect(manifest('workers/gpu/package.json').name).toBe('@talla/worker-gpu');
  });
});
