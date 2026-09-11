import { writeFile } from 'node:fs/promises';
// Relative, like `scripts/seed-dev.ts`: the root workspace declares no dependency on the
// packages, and a tool is not a reason to give it one.
import { loadConfig } from '../packages/config/src/index.ts';
import { createDatabase, createPrivacyBox } from '../packages/database/src/index.ts';
import type { Sql } from '../packages/database/src/index.ts';
import { eraseBuyerContact, exportBuyerOrders } from '../modules/commerce/index.ts';
import { reveal } from '../packages/sensitive/src/index.ts';

/**
 * The operator path for a buyer's right of access and right of erasure.
 *
 * Egypt PDPL 151/2020 gives a buyer both, and spec 12.7 says these paths exist from v1
 * even if a support-operated script is all they are. `exportBuyerOrders` and
 * `eraseBuyerContact` have been written and callable for some time, which is not the same
 * as a right anybody can exercise: without this file, answering a buyer means somebody
 * opening a REPL against production and writing the call themselves.
 *
 *   node scripts/data-subject.ts export --store nasij --phone +201000000001 --actor mahmoud
 *   node scripts/data-subject.ts erase  --store nasij --phone +201000000001 --actor mahmoud
 *
 * **The actor is required.** Erasure writes an audit row naming who performed it, and an
 * unattributable erasure of a buyer's contact details is worse than none: it is the shape
 * of both a legitimate request and an attack, and the log is what tells them apart.
 *
 * **Nothing here prints a buyer's details.** The export is written to a file the operator
 * names; stdout carries a path and a count. A phone number echoed into a terminal is a
 * phone number in a shell history, a screen recording, and whatever collects the
 * deployment's console (spec 16.5).
 */

interface Arguments {
  readonly command: 'export' | 'erase';
  readonly store: string;
  readonly phone: string;
  readonly actor: string;
  readonly out: string | undefined;
}

function usage(problem: string): never {
  process.stderr.write(
    `${problem}\n\n` +
      'Usage:\n' +
      '  node scripts/data-subject.ts export --store <subdomain> --phone <e164> --actor <id> [--out <file>]\n' +
      '  node scripts/data-subject.ts erase  --store <subdomain> --phone <e164> --actor <id>\n',
  );
  process.exit(1);
}

function parse(argv: readonly string[]): Arguments {
  const command = argv[0];
  if (command !== 'export' && command !== 'erase') usage('Expected "export" or "erase".');

  const flags = new Map<string, string>();
  for (let i = 1; i < argv.length; i += 2) {
    const name = argv[i];
    const value = argv[i + 1];
    if (name === undefined || !name.startsWith('--') || value === undefined)
      usage(`Malformed argument near "${name ?? ''}".`);
    flags.set(name.slice(2), value);
  }

  const store = flags.get('store');
  const phone = flags.get('phone');
  const actor = flags.get('actor');
  if (store === undefined || store === '') usage('--store is required.');
  if (phone === undefined || !/^\+\d{7,15}$/.test(phone))
    usage('--phone is required, in E.164 form.');
  // Refused here rather than deeper, so `erase` cannot get halfway and then fail on the
  // audit write it was supposed to make.
  if (actor === undefined || actor.trim() === '')
    usage(
      '--actor is required: an erasure nobody signed is an erasure nobody can explain.',
    );

  return { command, store, phone, actor: actor.trim(), out: flags.get('out') };
}

const args = parse(process.argv.slice(2));
const config = loadConfig();
const database = createDatabase({ connectionString: reveal(config.databaseUrl) });
const privacy = createPrivacyBox(reveal(config.encryptionKey), reveal(config.indexKey));

try {
  const { rows } = await database.platform((sql: Sql) =>
    sql.query<{ id: string }>('SELECT id FROM tenants WHERE subdomain = $1', [
      args.store,
    ]),
  );
  const tenantId = rows[0]?.id;
  if (tenantId === undefined) {
    process.stderr.write(`No store with subdomain "${args.store}".\n`);
    process.exit(1);
  }

  if (args.command === 'export') {
    const orders = await exportBuyerOrders(database, privacy, tenantId, args.phone);
    const path = args.out ?? `talla-export-${args.store}-${String(Date.now())}.json`;
    await writeFile(path, JSON.stringify(orders, null, 2), 'utf8');
    process.stdout.write(
      `Wrote ${String(orders.length)} order(s) to ${path}.\n` +
        "It contains the buyer's name, phone and address in the clear. Hand it over the " +
        'way the buyer asked for it, then delete it.\n',
    );
  } else {
    const erased = await eraseBuyerContact(
      database,
      privacy,
      tenantId,
      args.phone,
      args.actor,
    );
    process.stdout.write(
      `Erased contact details on ${String(erased)} order(s) in "${args.store}", ` +
        `recorded against "${args.actor}".\n` +
        'The orders themselves remain: the store still has to account for what it sold.\n',
    );
  }
} finally {
  await database.close();
}
