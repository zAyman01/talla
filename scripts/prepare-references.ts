import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { sanitizeInSandbox } from '../modules/ingest/index.ts';

const output = new URL('../apps/storefront/public/references/', import.meta.url);
await mkdir(output, { recursive: true });
for (const name of ['tee-front', 'tee-back', 'jeans']) {
  const raw = await readFile(
    new URL(`../fixtures/reference/${name}.jpg`, import.meta.url),
  );
  const clean = await sanitizeInSandbox(raw);
  await writeFile(new URL(`${name}.webp`, output), clean.bytes);
  process.stdout.write(`${name}: ${String(clean.bytes.length)} canonical bytes\n`);
}
await copyFile(
  new URL('../fixtures/reference/mannequin.glb', import.meta.url),
  new URL('mannequin.glb', output),
);
