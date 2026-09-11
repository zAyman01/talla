import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { codedError } from '@talla/errors';

export interface SanitizedImage {
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  readonly contentType: 'image/webp';
}

/** No secrets, no database URL, nothing worth having if the sandbox is compromised. */
function sandboxEnvironment(): NodeJS.ProcessEnv {
  const environment = {} as NodeJS.ProcessEnv;
  environment['PATH'] = process.env['PATH'] ?? '';
  environment['HOME'] = process.env['HOME'] ?? '';
  return environment;
}

/** Docker image is built by the operator. No unsandboxed fallback is permitted. */
export async function sanitizeInSandbox(input: Uint8Array): Promise<SanitizedImage> {
  if (input.byteLength === 0 || input.byteLength > 12 * 1024 * 1024)
    throw codedError('INGEST_INVALID_FILE');
  const name = `talla-image-${randomUUID()}`;
  return new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      [
        'run',
        '--rm',
        '-i',
        '--name',
        name,
        '--network',
        'none',
        '--read-only',
        '--cap-drop=ALL',
        '--security-opt=no-new-privileges',
        '--pids-limit=32',
        '--memory=256m',
        '--cpus=1',
        '--tmpfs',
        '/tmp:rw,noexec,nosuid,size=64m',
        '--user',
        '65532:65532',
        'talla-image-worker:local',
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        // The sandbox gets a deliberately minimal environment: no secrets, no database
        // URL, nothing worth having if it is ever compromised (spec 12.2).
        //
        // Built by assignment rather than as a literal. Next augments `NodeJS.ProcessEnv`
        // to make `NODE_ENV` a required member, so an object literal here stops matching
        // `spawn` the moment this module is consumed from an application, and every
        // stream below then resolves to `never`. Widening the sandbox's environment to
        // satisfy a framework's type augmentation would be the wrong way round.
        env: sandboxEnvironment(),
      },
    );
    const chunks: Buffer[] = [];
    let length = 0;
    let settled = false;
    const fail = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      // Killing the CLI does not kill its container. Remove that unique job as well.
      const cleanup = spawn('docker', ['rm', '-f', name], { stdio: 'ignore' });
      cleanup.on('error', () => undefined);
      reject(new Error('INGEST_INVALID_FILE'));
    };
    const timer = setTimeout(fail, 20000);
    child.on('error', fail);
    child.stdin.on('error', fail);
    child.stderr.resume();
    child.stdout.on('data', (chunk: Buffer) => {
      length += chunk.length;
      if (length > 20 * 1024 * 1024) {
        fail();
        return;
      }
      chunks.push(chunk);
    });
    child.on('close', (code) => {
      if (settled) return;
      if (code !== 0) {
        fail();
        return;
      }
      try {
        const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (typeof parsed !== 'object' || parsed === null)
          throw new Error('Invalid result');
        const result = parsed as Record<string, unknown>;
        if (
          typeof result['bytes'] !== 'string' ||
          typeof result['width'] !== 'number' ||
          typeof result['height'] !== 'number' ||
          result['contentType'] !== 'image/webp'
        )
          throw new Error('Invalid result');
        if (
          !Number.isInteger(result['width']) ||
          !Number.isInteger(result['height']) ||
          result['width'] < 1 ||
          result['height'] < 1 ||
          result['width'] > 2048 ||
          result['height'] > 2048
        )
          throw new Error('Invalid dimensions');
        const bytes = Buffer.from(result['bytes'], 'base64');
        const hash = createHash('sha256').update(bytes).digest('hex');
        if (
          bytes.length === 0 ||
          bytes.length > 12 * 1024 * 1024 ||
          hash !== result['sha256']
        )
          throw new Error('Invalid bytes');
        settled = true;
        clearTimeout(timer);
        resolve({
          bytes,
          sha256: hash,
          width: result['width'],
          height: result['height'],
          contentType: 'image/webp',
        });
      } catch {
        fail();
      }
    });
    child.stdin.end(input);
  });
}
