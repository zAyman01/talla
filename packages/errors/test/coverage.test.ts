import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { errorCatalog } from '../src/index.ts';
import type { ErrorCode } from '../src/index.ts';

/**
 * A taxonomy nobody raises is documentation.
 *
 * Before Stage S this catalogue was 419 lines imported exactly once in the whole
 * repository, as a type, while commerce raised its codes as free-text strings. This test
 * is what stops that happening again: every code is either raised somewhere in the tree,
 * or listed below with the stage that will raise it.
 */

/**
 * Codes with no producer yet. Each names the stage that reaches it, so the list shrinks
 * on a schedule rather than becoming the place codes go to be forgotten.
 */
const NOT_YET_REACHABLE: Readonly<Record<string, string>> = {
  INGEST_BACKGROUND_BUSY: 'Stage E: capture-quality assessor',
  INGEST_BLURRY: 'Stage E: capture-quality assessor',
  INGEST_GARMENT_CROPPED: 'Stage E: capture-quality assessor',
  INGEST_GRAY_CARD_MISSING: 'Stage E: gray-card detector',
  INGEST_GRAY_CARD_UNREADABLE: 'Stage E: gray-card detector',
  INGEST_TOO_DARK: 'Stage E: capture-quality assessor',
  INGEST_NO_MATCHING_BLOCK: 'Stage E: block selection',
  UNDERSTAND_LOW_CONFIDENCE: 'Stage E: understanding confidence thresholds',
  UNDERSTAND_SEGMENTATION_FAILED: 'Stage E: segmentation',
  SOLVE_SELF_INTERSECTION: 'Stage E: the Dress Solver',
  STOCK_UNAVAILABLE:
    'Task 8: the catalogue route distinguishes a sold-out garment from an insufficient quantity',
};

const ROOTS = ['modules', 'packages', 'workers', 'apps'];
const SKIP_DIRECTORIES = new Set(['node_modules', '.next', 'dist', 'coverage', 'test']);

/**
 * Lines that name a code without producing one.
 *
 * A first attempt counted any occurrence anywhere, and declared thirteen codes covered
 * that were only ever named in a type: `SolveFailure = 'SOLVE_NON_CONVERGENT' | ...`
 * declares a code, it does not raise it, and a union nothing returns is exactly the
 * decoration this test exists to catch. A second attempt matched specific call shapes and
 * missed real producers written slightly differently, which is worse: a coverage test
 * that under-reports teaches people to edit the deferral list.
 *
 * So: any quoted occurrence counts, except in a type declaration or a comment.
 */
function isDeclarationOrComment(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('|') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('type ') ||
    trimmed.startsWith('export type ') ||
    line.includes('Extract<')
  );
}

async function sourceFiles(directory: string): Promise<string[]> {
  const found: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      found.push(...(await sourceFiles(path)));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      found.push(path);
    }
  }
  return found;
}

const repoRoot = new URL('../../../', import.meta.url);

async function codesRaisedInTree(): Promise<ReadonlySet<string>> {
  const raised = new Set<string>();
  for (const root of ROOTS) {
    for (const path of await sourceFiles(fileURLToPath(new URL(`${root}/`, repoRoot)))) {
      if (path.endsWith('packages/errors/src/catalog.ts')) continue;
      if (path.includes('.test.')) continue;
      const source = await readFile(path, 'utf8');
      for (const line of source.split(/\r?\n/)) {
        if (isDeclarationOrComment(line)) continue;
        for (const code of Object.keys(errorCatalog)) {
          if (line.includes(`'${code}'`)) raised.add(code);
        }
      }
    }
  }
  return raised;
}

describe('every code in the taxonomy has a producer', () => {
  it('finds each code raised in the tree, or listed with the stage that will raise it', async () => {
    const raised = await codesRaisedInTree();
    const orphans = Object.keys(errorCatalog).filter(
      (code) => !raised.has(code) && !Object.hasOwn(NOT_YET_REACHABLE, code),
    );

    expect(
      orphans,
      'these codes exist in the catalog and nothing produces them. Raise them, or list them in NOT_YET_REACHABLE with the stage that will.',
    ).toEqual([]);
  }, 60_000);

  it('keeps the deferral list honest by failing when a listed code starts being raised', async () => {
    const raised = await codesRaisedInTree();
    const stale = Object.keys(NOT_YET_REACHABLE).filter((code) => raised.has(code));

    expect(
      stale,
      'these codes are listed as not yet reachable but something raises them now. Remove them from NOT_YET_REACHABLE.',
    ).toEqual([]);
  }, 60_000);

  it('lists only real codes, so a typo in the deferral list cannot hide one', () => {
    const unknown = Object.keys(NOT_YET_REACHABLE).filter(
      (code) => !Object.hasOwn(errorCatalog, code),
    );
    expect(unknown).toEqual([]);
  });

  it('leaves INTERNAL_ERROR reachable, since every unrecognised throw becomes one', () => {
    const code: ErrorCode = 'INTERNAL_ERROR';
    expect(Object.hasOwn(NOT_YET_REACHABLE, code)).toBe(false);
  });
});
