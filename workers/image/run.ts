import { canonicalize } from './canonicalize.ts';

// Fixed stdin/stdout protocol. No user filename becomes a path or command argument.
const chunks: Buffer[] = [];
let length = 0;
try {
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    length += bytes.byteLength;
    if (length > 12 * 1024 * 1024) throw new Error('INGEST_INVALID_FILE');
    chunks.push(bytes);
  }
  const image = await canonicalize(Buffer.concat(chunks));
  process.stdout.write(
    JSON.stringify({ ...image, bytes: Buffer.from(image.bytes).toString('base64') }),
  );
} catch {
  // Decoder messages may contain attacker-controlled metadata. Never print them.
  process.stdout.write(JSON.stringify({ error: 'INGEST_INVALID_FILE' }));
  process.exitCode = 1;
}
