import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/migrate.ts';

/**
 * The gate CONTRIBUTING has listed since the beginning: every tenant-scoped table carries
 * row-level security, forced, with a policy. Spec 12.3 says no exceptions and no "add it
 * later", because adding it later means auditing every query ever written.
 *
 * This file also tests the gate itself. A coverage assertion that passes because its
 * query matches nothing is worse than no assertion: it reports green while the isolation
 * dissolves. The same reasoning is already applied to the boundary linter in
 * `test/boundaries.test.ts`.
 */

/**
 * Tables that carry a `tenant_id` and still must not be under a tenant policy.
 *
 * There is exactly one reason to be here: the table is read *before* a tenant context
 * exists, so a policy keyed on `app.current_tenant` would deny the lookup that decides
 * what `app.current_tenant` should be. `modules/tenancy` already records this for the
 * registry lookup.
 *
 * Every entry needs its own justification on the line beside it. Adding to this map is a
 * visible diff somebody has to defend, which is the whole point of it being a map rather
 * than a count.
 *
 * Note that only tables carrying a `tenant_id` can appear here at all, because only those
 * are in the coverage query's scope. `owners`, `sessions`, `owner_challenges` and
 * `rate_limits` have no tenant column and are not exemptions, they are simply not
 * tenant-scoped data.
 */
const PLATFORM_TABLES: Readonly<Record<string, string>> = {
  owner_tenants:
    'The membership join that decides which tenant an owner may become. It is read at ' +
    'login, before app.current_tenant is set, so a policy keyed on that setting would ' +
    'deny the lookup that determines what the setting should be. The application role ' +
    'holds SELECT only, so a compromised application cannot grant itself membership.',
};

interface TableRow extends Record<string, unknown> {
  readonly tablename: string;
  readonly rls: boolean;
  readonly forced: boolean;
  readonly policies: number;
}

/**
 * Every ordinary table in `public` carrying a `tenant_id` column.
 *
 * The heuristic is the column name, which is what makes it mechanical. It holds because
 * every tenant-scoped table in this schema names the column `tenant_id`; a table that
 * scoped itself by some other column would slip past, so that convention is load bearing.
 */
async function tenantTables(db: PGlite): Promise<readonly TableRow[]> {
  const { rows } = await db.query<TableRow>(`
    SELECT c.relname AS tablename,
           c.relrowsecurity AS rls,
           c.relforcerowsecurity AS forced,
           (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
      )
    ORDER BY c.relname`);
  return rows;
}

function coverageProblems(
  tables: readonly TableRow[],
  allowlist: Readonly<Record<string, string>>,
): readonly string[] {
  const problems: string[] = [];

  for (const table of tables) {
    if (Object.hasOwn(allowlist, table.tablename)) continue;
    if (!table.rls) problems.push(`${table.tablename} does not have row-level security`);
    else if (!table.forced)
      problems.push(`${table.tablename} does not force row-level security`);
    else if (table.policies === 0) problems.push(`${table.tablename} has no policy`);
  }

  const present = new Set(tables.map((table) => table.tablename));
  for (const name of Object.keys(allowlist)) {
    if (!present.has(name)) {
      // A stale exemption is how an allowlist turns into a place things go to be
      // forgotten. If the table is gone, so is its reason for being excused.
      problems.push(`${name} is exempted but no longer exists`);
    }
  }

  return problems;
}

const db = new PGlite();
beforeAll(async () => {
  await runMigrations(db);
}, 60_000);
afterAll(async () => {
  await db.close();
});

describe('row-level security coverage', () => {
  it('covers every tenant-scoped table in the shipped schema', async () => {
    const tables = await tenantTables(db);

    expect(
      tables.length,
      'no tenant-scoped tables found, the query is wrong',
    ).toBeGreaterThan(0);
    expect(coverageProblems(tables, PLATFORM_TABLES)).toEqual([]);
  });

  it('lists the tables it is actually checking, so a silent narrowing is visible', async () => {
    const tables = await tenantTables(db);

    expect(tables.map((table) => table.tablename)).toEqual([
      'audit_log',
      'garments',
      'jobs',
      'order_lines',
      'orders',
      'owner_tenants',
      'phone_challenges',
      'pins',
      'stock',
    ]);
  });

  it('keeps the exemption list to tables that genuinely cannot carry a policy', async () => {
    const tables = await tenantTables(db);
    const exempt = tables.filter((table) =>
      Object.hasOwn(PLATFORM_TABLES, table.tablename),
    );

    // One entry. If this number grows, the growth is the thing to look at: every
    // exemption is a table row-level security is not protecting.
    expect(exempt.map((table) => table.tablename)).toEqual(['owner_tenants']);
  });
});

describe('the coverage gate itself', () => {
  it('catches a tenant table with no row-level security at all', () => {
    const problems = coverageProblems(
      [{ tablename: 'leaky', rls: false, forced: false, policies: 0 }],
      {},
    );
    expect(problems).toEqual(['leaky does not have row-level security']);
  });

  it('catches a tenant table whose owner bypasses its own policy', () => {
    // ENABLE without FORCE leaves the table owner exempt, and the owner is whoever ran
    // the migration. The policy reads as present and does nothing.
    const problems = coverageProblems(
      [{ tablename: 'leaky', rls: true, forced: false, policies: 1 }],
      {},
    );
    expect(problems).toEqual(['leaky does not force row-level security']);
  });

  it('catches a tenant table that is locked down with no policy to let anyone in', () => {
    const problems = coverageProblems(
      [{ tablename: 'leaky', rls: true, forced: true, policies: 0 }],
      {},
    );
    expect(problems).toEqual(['leaky has no policy']);
  });

  it('catches an exemption for a table that no longer exists', () => {
    const problems = coverageProblems(
      [{ tablename: 'garments', rls: true, forced: true, policies: 1 }],
      { removed_table: 'justified when it existed' },
    );
    expect(problems).toEqual(['removed_table is exempted but no longer exists']);
  });

  it('catches a real policy-less table planted in a real database', async () => {
    // The unit checks above prove the predicate. This proves the query feeding it finds
    // a table that was added without anybody thinking about isolation.
    await db.exec('CREATE TABLE planted_leak (tenant_id uuid NOT NULL, note text)');
    try {
      const problems = coverageProblems(await tenantTables(db), PLATFORM_TABLES);
      expect(problems).toContain('planted_leak does not have row-level security');
    } finally {
      await db.exec('DROP TABLE planted_leak');
    }
  }, 30_000);
});
