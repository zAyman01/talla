# Incident runbook

Short on purpose. A runbook nobody can read at two in the morning is a runbook nobody
reads. Every command here has been run; none of it is written from the documentation of a
tool somebody meant to try.

**Who is called.** Two people, no rota. Whoever is reachable starts, and tells the other.
There is no escalation path because there is nobody to escalate to, which means the first
responder owns the incident until it is closed.

---

## 1. Suspend a store

A store is suspended when its owner asks, when a payment relationship ends, or when its
catalogue is being used for something the contract forbids. It is one column, and it takes
effect on the next request.

```
docker compose exec postgres psql -U postgres -d talla_dev \
  -c "UPDATE tenants SET active = false WHERE subdomain = 'nasij'"
```

The storefront then answers every request for that host exactly as it answers a host that
names no store at all. That is deliberate (`modules/tenancy`): telling the two apart hands
anyone the list of stores that exist.

Reversing it is the same statement with `true`. Nothing is deleted, no order is touched,
and the owner's session keeps working on the admin origin, because suspension is a
commercial state and not a security one.

---

## 2. Roll back a bad publish

Both applications are stateless. A rollback is redeploying the previous image, and there
is nothing to drain: the job runner's leases expire on their own and another runner picks
the work up (`workers/jobs/runner.ts`).

```
docker compose up -d --no-deps storefront admin
```

**Migrations do not roll back.** They are forward-only and the runner records a checksum
per applied file, so a deployment that tries to re-run an edited migration stops and names
it (`packages/database/src/migrate.ts`). If a migration is the problem, the fix is a new
migration. An older image against a newer schema is the normal case and is expected to
work, which is why columns are added before they are used and dropped a release later.

---

## 3. Restore from a backup

### Taking one

```
docker compose exec postgres pg_dump -U postgres -Fc -d talla_dev -f /tmp/talla.dump
docker compose cp postgres:/tmp/talla.dump ./talla-$(date +%F).dump
```

`-Fc` is the custom format: compressed, and restorable table by table, which matters when
the thing that needs restoring is one store rather than the estate.

### Putting one back

Never over the live database. Restore beside it, check it, then switch.

```
docker compose exec postgres psql -U postgres -d postgres -c "CREATE DATABASE talla_restore"
docker compose cp ./talla-2026-09-12.dump postgres:/tmp/restore.dump
docker compose exec postgres pg_restore -U postgres -d talla_restore --no-owner /tmp/restore.dump
```

Then check the four things that matter, in this order:

1. **Row counts** against what the incident says should be there.
2. **Row-level security survived.** `pg_dump` carries policies, and a restore that quietly
   dropped them is a restore that serves every store's data to every host.
   ```
   SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
    WHERE relname IN ('orders','garments','audit_log');
   ```
3. **The migration ledger.** `SELECT count(*) FROM schema_migrations` must match the
   number of files in `packages/database/migrations`, or the application will try to apply
   one that is already in the schema.
4. **The login roles exist.** They are cluster level, not database level, so a restore
   into a fresh cluster has none of them and nothing can connect. `docker/postgres-init.sql`
   is what creates them locally; a deployment provisions them out of band.

### The drill

**Run 2026-09-12. Result: passed.** Dump of the development database at 41,939 bytes,
restored into a scratch database. Tenants, garments, orders and audit rows all matched;
`orders`, `garments` and `audit_log` came back with row-level security enabled and forced;
the migration ledger held all three migrations.

One thing the drill made concrete. A buyer whose contact details were erased **stayed
erased** in the restored copy, because the dump was taken afterwards. A dump taken *before*
an erasure restores the details along with everything else, so a restore that crosses a
data-subject erasure has to be followed by running the erasure again:

```
node scripts/data-subject.ts erase --store <subdomain> --phone <e164> --actor <you>
```

The audit log names every erasure that has been performed, which is how you find the ones
to repeat.

Re-run the drill whenever the schema changes shape, and at least twice a year. Record the
date and the result in this file. A backup that has never been restored is not a backup.

---

## 4. A buyer asks for their data, or asks to be forgotten

Both are operator commands, and both refuse to run without an actor identity, because an
unattributable erasure is the shape of both a legitimate request and an attack.

```
node scripts/data-subject.ts export --store <subdomain> --phone <e164> --actor <you> --out buyer.json
node scripts/data-subject.ts erase  --store <subdomain> --phone <e164> --actor <you>
```

The export file holds the name, phone and address in the clear. Hand it over the way the
buyer asked for it and then delete it. Erasure clears the contact details and leaves the
order: the store still has to account for what it sold.

Retention does the same thing on a schedule, `TALLA_RETENTION_DAYS` after an order is
fulfilled or cancelled, and records a row per store per sweep whether or not it erased
anything (`workers/jobs/retention.ts`). "When did retention last run for this store" is:

```
SELECT entity_id, details FROM audit_log
 WHERE action = 'retention.swept' ORDER BY id DESC LIMIT 1;
```

---

## 5. The viewer is blank for everybody

Check the tier first. `chooseTier` sends a device with no WebGL, a software rasteriser, or
a data-saver preference to photographs rather than a canvas, and that is working as
intended rather than an incident.

A real one looks like: tier A or B devices reaching the page and getting nothing. The
storefront falls back to photographs on a lost context, so a blank stage means the
photographs are missing too, which is an asset problem and not a renderer one.

---

## 6. What is not in here yet

Named so they are not discovered during the incident that needs them.

- **No alerting.** Nothing pages anybody. The first report of an outage will come from a
  store owner.
- **No per-tenant bandwidth alarm** (spec 12.6). A scraped catalogue is found on the
  invoice.
- **No edge rate limiting.** Rate limits are in PostgreSQL (ADR-0019), which means a
  volumetric attack reaches the origin before it is refused.
- **No staging.** Changes are verified locally and in CI.

All four are Stage O items that need a deployment target chosen first. They are tracked in
[`../superpowers/plans/2026-09-12-stage-g-and-o.md`](../superpowers/plans/2026-09-12-stage-g-and-o.md).
