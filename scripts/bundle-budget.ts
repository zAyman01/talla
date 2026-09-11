import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

/**
 * The bundle size budget, measured rather than assumed.
 *
 * Spec 11.1 budgets time to first dressed render on a mid-range Android over a throttled
 * connection, and the first thing that spends that budget is JavaScript on the critical
 * path. The storefront started shipping Three.js when the mannequin landed. It is code
 * split behind `dynamic(..., { ssr: false })`, which is correct, and it was unmeasured,
 * which is how "correct today" becomes "regressed in March".
 *
 * **What this measures.** `rootMainFiles` and the polyfills from Turbopack's build
 * manifest, gzipped: the shared runtime every page loads before anything renders. The
 * viewer is not in it, which is the code splitting behind `dynamic(..., { ssr: false })`
 * working. A first attempt measured every chunk in the output directory and reported 359
 * KB, which counted Three.js as though a buyer downloaded it before seeing the page. A
 * number that wrong is worse than none: the first person to hit it would have raised the
 * budget rather than believed it.
 *
 * **What it does not measure.** Per-page client chunks beyond the shared root, and actual
 * time to first dressed render on a real phone. TTFD needs the reference device on a
 * throttled network and is the Phase 0 device gate (spec 22), not this. Green here means
 * the shared critical path did not grow, and nothing more than that.
 */

/**
 * A baseline lock, not a number derived from the spec.
 *
 * Spec 11.1 budgets time to first dressed render in seconds on a reference phone, not
 * kilobytes, and no arithmetic turns one into the other. So this gate answers a narrower
 * and more useful question: **did the shared critical path grow?**
 *
 * Measured at 166 KB gzipped for both applications when the gate landed, which is React
 * plus the Next runtime and almost nothing of ours. The budget is set just above it: room
 * for a dependency upgrade, not room to absorb a new framework without noticing. Raising
 * it is allowed and should come with a reason in the commit that does it.
 */
const BUDGET_BYTES = 180 * 1024;
const appName = process.argv[2] ?? 'storefront';
const buildDirectory = new URL(`../apps/${appName}/.next/`, import.meta.url);

interface Manifest {
  readonly rootMainFiles?: readonly string[];
  readonly polyfillFiles?: readonly string[];
}

async function exists(path: URL): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * The shared root chunks, from the manifest Turbopack actually writes.
 *
 * Note the filename: `build-manifest.json`, not `app-build-manifest.json`. Turbopack
 * does not emit the latter, and reaching for it is what sent a first version of this
 * script down a fallback that measured every chunk in the output directory.
 *
 * A missing or unfamiliar manifest fails the gate rather than approximating. A budget
 * that quietly measures the wrong thing is how a regression ships green.
 */
async function entryChunks(): Promise<readonly string[]> {
  const manifestPath = new URL('build-manifest.json', buildDirectory);
  if (!(await exists(manifestPath))) {
    process.stderr.write(
      `No build manifest for ${appName}. Run "pnpm build" before the budget check.\n`,
    );
    process.exit(1);
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;
  const files = [...(manifest.rootMainFiles ?? []), ...(manifest.polyfillFiles ?? [])];
  if (files.length === 0) {
    process.stderr.write(
      `${appName} build manifest lists no root chunks. The manifest shape has changed.\n`,
    );
    process.exit(1);
  }
  return [...new Set(files)].filter((file) => file.endsWith('.js'));
}

let total = 0;
const measured: { name: string; bytes: number }[] = [];
for (const file of await entryChunks()) {
  const path = new URL(file, buildDirectory);
  if (!(await exists(path))) continue;
  const bytes = gzipSync(await readFile(path)).byteLength;
  total += bytes;
  measured.push({ name: file, bytes });
}

measured.sort((a, b) => b.bytes - a.bytes);
for (const chunk of measured.slice(0, 5)) {
  process.stdout.write(
    `  ${String(Math.round(chunk.bytes / 1024)).padStart(5)} KB  ${chunk.name}\n`,
  );
}

const kilobytes = Math.round(total / 1024);
const budget = Math.round(BUDGET_BYTES / 1024);
if (total > BUDGET_BYTES) {
  process.stderr.write(
    `${appName} critical path is ${String(kilobytes)} KB gzipped, over the ${String(budget)} KB budget.\n` +
      'Move work off the critical path, or change the budget in this file with a reason.\n',
  );
  process.exit(1);
}
process.stdout.write(
  `${appName} critical path: ${String(kilobytes)} KB gzipped, budget ${String(budget)} KB.\n`,
);
