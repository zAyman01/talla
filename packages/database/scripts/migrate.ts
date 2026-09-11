import { Pool } from 'pg';
import { runMigrations } from '../src/migrate.ts';

/**
 * Apply pending migrations. Run with the migration role, never the application role:
 *
 *   TALLA_MIGRATION_DATABASE_URL=postgresql://talla_migrate@host/talla pnpm --filter @talla/database migrate
 *
 * This reads one variable directly rather than going through `@talla/config`. A
 * migration container has no object storage, no session secret and no OTP channel, and
 * demanding them here would mean inventing values to satisfy a validator.
 */
const url = process.env['TALLA_MIGRATION_DATABASE_URL'];
if (url === undefined || url.trim() === '') {
  process.stderr.write('TALLA_MIGRATION_DATABASE_URL is missing\n');
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
try {
  const applied = await runMigrations(pool);
  if (applied.length === 0) {
    process.stdout.write('No pending migrations\n');
  } else {
    for (const version of applied) process.stdout.write(`Applied ${version}\n`);
  }
} finally {
  await pool.end();
}
