import { readFile } from 'node:fs/promises';
import { evaluateTrial } from '../src/index.ts';
import { parseTrialEvidence } from '../src/parse.ts';

const path = process.argv[2];
if (!path) throw new Error('Usage: pnpm --filter @talla/trial evaluate <evidence.json>');
// Operator-authored local evidence, never an HTTP upload. Evaluation validates numeric
// measurements and rejects malformed records; a bad file exits nonzero.
const evidence = parseTrialEvidence(JSON.parse(await readFile(path, 'utf8')) as unknown);
const report = evaluateTrial(evidence);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.passed ? 0 : 1;
