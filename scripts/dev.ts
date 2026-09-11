import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Run one app's dev server with the repository's .env loaded.
 *
 * Next reads a .env next to the app it is serving, and this repository keeps one .env at
 * the root because `docker compose` passes that same file to five services. Rather than
 * keep four copies of the same secrets in sync, this loads the root file and hands the
 * result to Next through the environment.
 *
 *   node scripts/dev.ts storefront
 *
 * `--env-file` would do the same thing in one flag, but Next forwards its own execArgv to
 * the workers it spawns and Node refuses that flag inside NODE_OPTIONS, so the file is
 * loaded in this process instead.
 */

const apps = {
  storefront: { port: '3000' },
  admin: { port: '3001' },
} as const;

const name = process.argv[2];
if (name !== 'storefront' && name !== 'admin') {
  process.stderr.write('Usage: node scripts/dev.ts storefront|admin\n');
  process.exit(1);
}

if (!existsSync('.env')) {
  process.stderr.write('No .env. Copy .env.example and fill it in.\n');
  process.exit(1);
}
process.loadEnvFile('.env');

const child = spawn(
  process.execPath,
  [
    `apps/${name}/node_modules/next/dist/bin/next`,
    'dev',
    '--hostname',
    '127.0.0.1',
    '--port',
    apps[name].port,
    `apps/${name}`,
  ],
  { stdio: 'inherit', env: process.env },
);
child.on('exit', (code) => {
  process.exit(code ?? 0);
});
