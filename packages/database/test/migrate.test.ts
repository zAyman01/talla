import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrationFiles, runMigrations } from '../src/migrate.ts';

let db: PGlite;
beforeEach(() => {
  db = new PGlite();
});
afterEach(async () => {
  await db.close();
});

/** A throwaway migrations directory, so a test can edit a "shipped" file. */
async function directory(files: Record<string, string>): Promise<URL> {
  const path = await mkdtemp(join(tmpdir(), 'talla-migrations-'));
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(path, name), body, 'utf8');
  }
  return pathToFileURL(`${path}/`);
}

const ONE = 'CREATE TABLE widgets (id integer PRIMARY KEY);';
const TWO = 'ALTER TABLE widgets ADD COLUMN label text;';

describe('runMigrations', () => {
  it('applies every migration in numeric order and records each one', async () => {
    const dir = await directory({ '001-one.sql': ONE, '002-two.sql': TWO });

    const applied = await runMigrations(db, { directory: dir });

    expect(applied).toEqual(['001-one.sql', '002-two.sql']);
    const { rows } = await db.query<{ version: string }>(
      'SELECT version FROM schema_migrations ORDER BY version',
    );
    expect(rows.map((row) => row.version)).toEqual(['001-one.sql', '002-two.sql']);
  }, 30_000);

  it('is a no-op on a database that is already current', async () => {
    const dir = await directory({ '001-one.sql': ONE });
    await runMigrations(db, { directory: dir });

    // An empty array rather than a cheerful repeat of what it did last time.
    expect(await runMigrations(db, { directory: dir })).toEqual([]);
  }, 30_000);

  it('refuses a migration that changed after it was applied', async () => {
    const dir = await directory({ '001-one.sql': ONE });
    await runMigrations(db, { directory: dir });

    // Editing a shipped migration is the failure CLAUDE.md 7 forbids. Before the
    // checksum, this was a rule people remembered.
    await writeFile(
      new URL('001-one.sql', dir),
      `${ONE}\nALTER TABLE widgets ADD c int;`,
    );

    await expect(runMigrations(db, { directory: dir })).rejects.toThrow(
      /001-one\.sql changed after it was applied/,
    );
  }, 30_000);

  it('ignores a line ending change, which is not an edit', async () => {
    const dir = await directory({ '001-one.sql': ONE });
    await runMigrations(db, { directory: dir });
    await writeFile(new URL('001-one.sql', dir), ONE.replaceAll('\n', '\r\n'));

    // Being told you edited a shipped migration because you opened it in the wrong
    // editor would make the gate something people learn to work around.
    expect(await runMigrations(db, { directory: dir })).toEqual([]);
  }, 30_000);

  it('refuses a database carrying a migration the repository no longer has', async () => {
    const dir = await directory({ '001-one.sql': ONE, '002-two.sql': TWO });
    await runMigrations(db, { directory: dir });

    const shrunk = await directory({ '001-one.sql': ONE });
    await expect(runMigrations(db, { directory: shrunk })).rejects.toThrow(
      /002-two\.sql was applied but is no longer in the repository/,
    );
  }, 30_000);

  it('rolls back a failing migration rather than recording it', async () => {
    const dir = await directory({
      '001-one.sql': ONE,
      '002-broken.sql':
        'CREATE TABLE gadgets (id integer); SELECT nonexistent_function();',
    });

    await expect(runMigrations(db, { directory: dir })).rejects.toThrow(
      /002-broken\.sql failed/,
    );

    const { rows } = await db.query<{ version: string }>(
      'SELECT version FROM schema_migrations',
    );
    expect(rows.map((row) => row.version)).toEqual(['001-one.sql']);
    // The table from the failed migration must not survive its rollback.
    const { rows: tables } = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM pg_class WHERE relname = 'gadgets'",
    );
    expect(tables[0]?.count).toBe(0);
  }, 30_000);

  it('refuses to run as the application role', async () => {
    const dir = await directory({ '001-one.sql': 'CREATE ROLE talla_app NOLOGIN;' });
    await runMigrations(db, { directory: dir });
    await db.exec('SET ROLE talla_app');

    // Migrating as talla_app would leave new tables owned by the role that row-level
    // security is meant to constrain.
    await expect(runMigrations(db, { directory: dir })).rejects.toThrow(
      /must not run as the application role/,
    );
    await db.exec('RESET ROLE');
  }, 30_000);
});

describe('migrationFiles', () => {
  it('rejects a file whose order is a guess', async () => {
    const dir = await directory({ 'add-widgets.sql': ONE });
    await expect(migrationFiles(dir)).rejects.toThrow(/must be named <number>/);
  });

  it('rejects two files claiming the same position', async () => {
    const dir = await directory({ '003-one.sql': ONE, '003-two.sql': TWO });
    await expect(migrationFiles(dir)).rejects.toThrow(/share position 003/);
  });

  it('orders by number, not by string, so 010 follows 009', async () => {
    const dir = await directory({
      '009-nine.sql': ONE,
      '010-ten.sql': TWO,
      '002-two.sql': TWO,
    });
    const files = await migrationFiles(dir);
    expect(files.map((file) => file.version)).toEqual([
      '002-two.sql',
      '009-nine.sql',
      '010-ten.sql',
    ]);
  });

  it('reads the repository migrations without complaint', async () => {
    const files = await migrationFiles();
    expect(files.length).toBeGreaterThan(0);
    expect(files[0]?.version).toBe('001-initial.sql');
  });
});
