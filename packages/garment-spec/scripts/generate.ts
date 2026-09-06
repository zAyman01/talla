import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { renderTypes } from '../src/render-types.ts';
import { generatedTypesPath } from '../src/paths.ts';

await writeFile(generatedTypesPath, await renderTypes(), 'utf8');
process.stdout.write(`wrote ${fileURLToPath(generatedTypesPath)}\n`);
