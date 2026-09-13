import { execFileSync, spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const envPath = fileURLToPath(new URL('../apps/storefront/.env.local', import.meta.url));

if (!existsSync(envPath)) {
  const secret = () => randomBytes(32).toString('base64url');
  const tenants = JSON.stringify({
    demo: {
      tenantId: '11111111-1111-4111-8111-111111111111',
      name: 'النسيج',
    },
  });
  writeFileSync(
    envPath,
    [
      'TALLA_DATABASE_URL=postgresql://talla_app:talla_app_local@127.0.0.1:55432/talla',
      `TALLA_PRIVACY_ENCRYPTION_KEY=${secret()}`,
      `TALLA_PHONE_INDEX_KEY=${secret()}`,
      `TALLA_PHONE_TOKEN_KEY=${secret()}`,
      `TALLA_EXPERIMENT_KEY=${secret()}`,
      `TALLA_OWNER_SESSION_KEY=${secret()}`,
      'TALLA_PARENT_DOMAIN=talla.local',
      'TALLA_LOCAL_SUBDOMAIN=demo',
      `TALLA_TENANTS_JSON='${tenants}'`,
      'TALLA_SMS_PROVIDER=development',
      'TALLA_DEVELOPMENT_OTP_CODE=123456',
      'TALLA_TRUST_PROXY=false',
      'TALLA_ADMIN_HOST=127.0.0.1:3000',
      'TALLA_ADMIN_ORIGIN=http://127.0.0.1:3000',
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  chmodSync(envPath, 0o600);
}
let localEnvironment = readFileSync(envPath, 'utf8');
if (!localEnvironment.includes('TALLA_OWNER_SESSION_KEY=')) {
  localEnvironment += [
    `TALLA_OWNER_SESSION_KEY=${randomBytes(32).toString('base64url')}`,
    'TALLA_ADMIN_HOST=127.0.0.1:3000',
    'TALLA_ADMIN_ORIGIN=http://127.0.0.1:3000',
    '',
  ].join('\n');
  writeFileSync(envPath, localEnvironment, { mode: 0o600 });
}

execFileSync('docker', ['compose', 'up', '--detach', '--wait'], {
  cwd: root,
  stdio: 'inherit',
});

const migrationUrl =
  'postgresql://talla_migration:talla_migration_local@127.0.0.1:55432/talla';
execFileSync(process.execPath, ['scripts/migrate.mjs'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, TALLA_MIGRATION_DATABASE_URL: migrationUrl },
});
execFileSync(
  'docker',
  [
    'compose',
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'talla_migration',
    '-d',
    'talla',
    '-v',
    'ON_ERROR_STOP=1',
    '--set',
    `owner_hash=${createHmac(
      'sha256',
      Buffer.from(
        /^TALLA_PHONE_INDEX_KEY=(.+)$/m.exec(readFileSync(envPath, 'utf8'))?.[1] ?? '',
        'base64url',
      ),
    )
      .update('+201000000000')
      .digest('hex')}`,
  ],
  {
    cwd: root,
    input: "ALTER ROLE talla_app LOGIN PASSWORD 'talla_app_local';\n",
    stdio: ['pipe', 'inherit', 'inherit'],
  },
);
execFileSync(
  'docker',
  [
    'compose',
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'talla_migration',
    '-d',
    'talla',
    '-v',
    'ON_ERROR_STOP=1',
    '-f',
    '/dev/stdin',
  ],
  {
    cwd: root,
    input: Buffer.concat([
      await import('node:fs/promises').then(({ readFile }) =>
        readFile(new URL('../infra/local/040-seed.sql', import.meta.url)),
      ),
      Buffer.from(
        "\nINSERT INTO store_owners(tenant_id,id,phone_hash,display_name) VALUES('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555',:'owner_hash','مدير المتجر') ON CONFLICT (tenant_id,id) DO NOTHING;\n",
      ),
    ]),
    stdio: ['pipe', 'inherit', 'inherit'],
  },
);

if (process.argv.includes('--prepare')) {
  process.stdout.write('Local database and apps/storefront/.env.local are ready.\n');
} else {
  const child = spawn('pnpm', ['dev'], { cwd: root, stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 1));
}
