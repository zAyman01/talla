import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const connectionString = process.env.TALLA_MIGRATION_DATABASE_URL?.trim();
if (!connectionString) throw new Error('Missing TALLA_MIGRATION_DATABASE_URL');

const directory = fileURLToPath(
  new URL('../packages/database/migrations', import.meta.url),
);
const files = (await readdir(directory))
  .filter((name) => /^\d{3}-[a-z0-9-]+\.sql$/.test(name))
  .sort();
const client = new pg.Client({ connectionString });
await client.connect();

try {
  await client.query('SELECT pg_advisory_lock(8199165446117740614)');
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    sha256 text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  for (const name of files) {
    const sql = await readFile(
      new URL(`../packages/database/migrations/${name}`, import.meta.url),
      'utf8',
    );
    const sha256 = createHash('sha256').update(sql).digest('hex');
    const existing = /** @type {unknown} */ (
      (await client.query('SELECT sha256 FROM schema_migrations WHERE name=$1', [name]))
        .rows[0]
    );
    if (existing !== undefined) {
      if (
        typeof existing !== 'object' ||
        existing === null ||
        !('sha256' in existing) ||
        typeof existing.sha256 !== 'string'
      )
        throw new Error(`Migration ${name} has an invalid checksum record`);
      if (existing.sha256 !== sha256)
        throw new Error(`Migration ${name} changed after it was applied`);
      continue;
    }
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name,sha256) VALUES($1,$2)', [
        name,
        sha256,
      ]);
      await client.query('COMMIT');
      process.stdout.write(`Applied ${name}\n`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client
    .query('SELECT pg_advisory_unlock(8199165446117740614)')
    .catch(() => undefined);
  await client.end();
}
