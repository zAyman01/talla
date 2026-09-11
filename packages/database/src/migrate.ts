import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

/**
 * Forward-only migrations, enforced rather than agreed.
 *
 * CLAUDE.md section 7 says migrations are forward-only and never edited after shipping.
 * Until now that was a sentence in a document, which is the kind of rule that holds until
 * the first time editing one file looks cheaper than writing a second. Recording a
 * checksum per applied migration turns it into a mechanism: an edited file stops the
 * deployment and names itself.
 *
 * This module is also the single place that knows which migrations exist. Before it, two
 * test files each carried their own hardcoded list, so adding a migration meant editing
 * both, and forgetting meant a test quietly running against last month's schema.
 */

export interface MigrationTarget {
  // SQL result types are supplied by callers because SQL text does not carry a TS row
  // type. pg and PGlite both expose this same generic result contract.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  query<T extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
  /**
   * A migration file holds many statements. PGlite runs those through `exec`; `pg` runs
   * them through `query`. Supplying `exec` is what lets one runner drive both.
   */
  readonly exec?: (sql: string) => Promise<unknown>;
}

export interface MigrationFile {
  /** The filename, which is the recorded version. Unambiguous and greppable. */
  readonly version: string;
  readonly order: number;
  readonly body: string;
  readonly checksum: string;
}

const MIGRATIONS = new URL('../migrations/', import.meta.url);
const NUMBERED = /^(\d+)-[a-z0-9-]+\.sql$/;

/**
 * Line endings are normalised before hashing. `.gitattributes` pins `*.sql` to LF, so
 * this should never matter, and if it ever does the failure would be a developer being
 * told they edited a shipped migration when all they did was open it in the wrong editor.
 */
function checksumOf(body: string): string {
  return createHash('sha256').update(body.replaceAll('\r\n', '\n'), 'utf8').digest('hex');
}

/** Every migration on disk, in the order it must be applied. */
export async function migrationFiles(
  directory: URL = MIGRATIONS,
): Promise<readonly MigrationFile[]> {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.sql'));
  const files: MigrationFile[] = [];
  const seen = new Map<number, string>();

  for (const name of names.sort()) {
    const match = NUMBERED.exec(name);
    if (match === null || match[1] === undefined) {
      throw new Error(
        `Migration ${name} must be named <number>-<kebab-case>.sql so its order is not a guess`,
      );
    }
    const order = Number.parseInt(match[1], 10);
    const earlier = seen.get(order);
    if (earlier !== undefined) {
      // Two files claiming the same position apply in whichever order the filesystem
      // happens to return, which is a difference between machines nobody will find.
      throw new Error(`Migrations ${earlier} and ${name} share position ${match[1]}`);
    }
    seen.set(order, name);
    const body = await readFile(new URL(name, directory), 'utf8');
    files.push({ version: name, order, body, checksum: checksumOf(body) });
  }

  return files.sort((a, b) => a.order - b.order);
}

const BOOKKEEPING = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

export interface MigrateOptions {
  readonly directory?: URL;
}

/**
 * Apply every migration that has not been applied yet. Returns the versions applied by
 * this call, so an already-current database returns an empty array rather than lying.
 */
export async function runMigrations(
  target: MigrationTarget,
  options: MigrateOptions = {},
): Promise<readonly string[]> {
  const { rows: role } = await target.query<{ role: string }>(
    'SELECT current_user AS role',
  );
  if (role[0]?.role === 'talla_app') {
    // The application role is NOSUPERUSER NOBYPASSRLS and owns nothing. Migrating as it
    // would either fail confusingly or, worse, succeed and leave the new tables owned by
    // the role that RLS is supposed to constrain. There is no opt out: no legitimate
    // migration run is the application role.
    throw new Error('Migrations must not run as the application role talla_app');
  }

  const files = await migrationFiles(options.directory);
  await target.query(BOOKKEEPING);

  const { rows: applied } = await target.query<{ version: string; checksum: string }>(
    'SELECT version, checksum FROM schema_migrations',
  );
  const recorded = new Map(applied.map((row) => [row.version, row.checksum]));
  const onDisk = new Set(files.map((file) => file.version));

  for (const version of recorded.keys()) {
    if (!onDisk.has(version)) {
      // A migration that ran against this database and no longer exists means the
      // history the database believes in is not the history the repository carries.
      throw new Error(
        `Migration ${version} was applied but is no longer in the repository`,
      );
    }
  }

  const runBody = async (body: string): Promise<void> => {
    if (target.exec !== undefined) {
      await target.exec(body);
      return;
    }
    await target.query(body);
  };

  const appliedNow: string[] = [];
  for (const file of files) {
    const previous = recorded.get(file.version);
    if (previous === file.checksum) continue;
    if (previous !== undefined) {
      throw new Error(
        `Migration ${file.version} changed after it was applied. Migrations are forward only: write a new one instead of editing this one (CLAUDE.md 7).`,
      );
    }

    await target.query('BEGIN');
    try {
      await runBody(file.body);
      await target.query(
        'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)',
        [file.version, file.checksum],
      );
      await target.query('COMMIT');
    } catch (error) {
      await target.query('ROLLBACK');
      throw new Error(`Migration ${file.version} failed`, { cause: error });
    }
    appliedNow.push(file.version);
  }

  return appliedNow;
}
