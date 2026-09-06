import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { renderTokens } from '../src/render-tokens.ts';
import { generatedTokensPath } from '../src/paths.ts';

await writeFile(generatedTokensPath, await renderTokens(), 'utf8');
process.stdout.write(`wrote ${fileURLToPath(generatedTokensPath)}\n`);
