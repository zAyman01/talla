# Security checklist

Operational companion to spec section 12. The spec carries the threat model and the
reasoning; this is what gets checked.

Talla takes untrusted files from semi-trusted accounts, holds several competing stores'
commercial data in one database, and collects buyer name, phone, and home address from the
first cash-on-delivery order. All three are live from day one.

---

## The three trust boundaries

A mistake in these is not recoverable by a follow-up commit. Both engineers review every
change to them.

1. **`workers/image`.** The only component parsing bytes chosen by someone outside the
   system. Assume it will eventually be compromised and give it nothing worth having.
2. **Tenancy and RLS policies.** The line between one store's data and a competitor's.
3. **Order confirmation.** Where a client could otherwise choose a price.

## Upload pipeline

- [ ] Image worker runs in its own container, **no network egress**, read-only filesystem
      apart from one scratch mount, seccomp profile, non-root, dropped capabilities.
- [ ] Hard CPU, memory, and wall-clock limits.
- [ ] Worker cannot reach the database or object storage. It receives a file and returns a
      result.
- [ ] Format allowlist verified by **content sniffing**, never by extension or by
      client-supplied MIME type.
- [ ] SVG rejected. It is a script container, not an image format.
- [ ] Archives and container formats rejected.
- [ ] Decoded pixel count and decoded byte size capped **before** decoding. A 40KB PNG can
      decode to gigabytes.
- [ ] First operation is a **canonical decode and re-encode** at bounded resolution.
      Everything downstream sees only bytes Talla wrote.
- [ ] **EXIF stripped.** This is a privacy control as much as a security one: phone cameras
      write GPS into product photos, and a small store's product photo is very often taken
      at the owner's home.
- [ ] No shell-out with a user-influenced argument. Library bindings only.
- [ ] User filenames never used as paths. Store by generated ID; keep the original as an
      untrusted display string.

## Tenant isolation

- [ ] Every tenant-scoped table has `tenant_id NOT NULL` and an RLS policy.
- [ ] Policies are **deny by default**. A table with RLS on and no policy returns nothing.
- [ ] Application role **cannot bypass RLS**. Migrations use a separate privileged role.
- [ ] Tenant context is set once per request, in one place, before any query.
- [ ] **CI test enumerates every table and fails if any lacks RLS.** A table added in a
      hurry cannot silently become the leak.
- [ ] CI test runs a representative query set as tenant A while tenant B's data exists and
      asserts zero cross-tenant rows.
- [ ] Object storage uses per-tenant key prefixes, with bucket policies scoped to the prefix.
- [ ] Anything unpublished is served by short-lived signed URL only.
- [ ] Published catalog assets are public by design and share a bucket with nothing else.

An application-layer `WHERE tenant_id = ?` is correct until the one query that forgets it,
and that query gets written before a pilot demo. The database has to be the one saying no.

## Authentication and sessions

- [ ] Store owners authenticate by phone OTP.
- [ ] OTP rate limited per phone **and** per IP, expiring in five minutes, attempts capped.
- [ ] Auth responses never reveal whether a number is registered.
- [ ] Cookies `HttpOnly`, `Secure`, `SameSite=Lax`, and **host-only**. Never scoped to the
      parent domain: a cookie on `.talla.app` is readable by every tenant subdomain, which
      turns one hostile store into a compromise of all of them.
- [ ] Admin lives on a single dedicated origin, not on per-tenant subdomains.
- [ ] Session ID rotates on privilege change. Admin has an idle timeout.
- [ ] Tenant theming is a fixed set of tokens. **Never raw CSS or HTML.** A store that can
      inject markup into its own storefront can phish its own buyers, on Talla's certificate.

## Commerce integrity

Cash on delivery means a fake order costs the store a real courier trip, and the store will
attribute that cost to Talla.

- [ ] Client never sends a price. Total recomputed server side at submission.
- [ ] Stock decremented in the same transaction as the order.
- [ ] Phone OTP required before confirming an order above a configurable value.
- [ ] Velocity limits per phone, per device, and per address.
- [ ] Per-tenant daily cap on unverified order value.
- [ ] Store-visible block list.

## Availability and abuse

- [ ] TLS everywhere, no plaintext, HSTS with preload. Buyers are on public wi-fi across the
      target market.
- [ ] DDoS protection and rate limiting **at the CDN edge**, not at the origin.
- [ ] Rate limits on catalog, search, styling, and asset endpoints, per IP and per tenant.
- [ ] Bot rules on the admin origin.
- [ ] **Per-tenant bandwidth alarm.** A scraped catalog is a CDN bill, and the first sign is
      otherwise the invoice.

Mesh assets are downloadable by anyone who can view the store. Accepted, not fought: asset
DRM on WebGL does not work. The public LOD is reduced detail, full detail stays private, and
the moat is the pipeline and the commerce work.

## Privacy

Buyer name, phone, and address are personal data under Egypt's PDPL 151/2020 and its
regional equivalents. Obligations attach from the first order, not at stage two.

- [ ] Controller and processor split written into the store contract. Otherwise the store
      assumes Talla carries it and Talla assumes the store does.
- [ ] Primary database in a MENA or EU region. Cross-border transfer is the provision most
      likely to be enforced, and choosing the region on day one costs nothing.
- [ ] Collect only what a courier needs. No date of birth, no gender, no persistent buyer
      profile in v1.
- [ ] Buyer contact fields encrypted at column level, so a leaked backup is not a leaked
      address book.
- [ ] Retention window defined **before** the first pilot. PII deleted or anonymized on
      schedule; analytics keeps aggregates only.
- [ ] Deletion and export paths exist, even as a support-operated script.
- [ ] Holdout experiment uses a device-scoped pseudonymous identifier, never a buyer identity.
- [ ] **WhatsApp handoff sends a reference and a link, not order contents.** Pushing name,
      address, and basket into a third-party thread is an unnecessary disclosure and an
      unnecessary processor relationship.
- [ ] Privacy notice in Arabic, written for a real buyer, live before the first store.

## Operations

- [ ] No secrets in the repository, ever. Secret scanner blocks merge on high severity.
- [ ] A leaked credential is **rotated**, not deleted from history and forgotten.
- [ ] Append-only audit log covering price changes, stock changes, order state transitions,
      and admin logins. During a pilot dispute this is what settles the argument.
- [ ] **Buyer PII never appears in a log line**, including inside error payloads. Leaked PII
      in logs is the most common way a careful team still has a breach.
- [ ] Lockfiles committed. Automated vulnerability alerts. CI actions pinned by commit SHA.
      SBOM per release.
- [ ] Backups encrypted and **restore-tested** on a schedule. An untested backup is a belief.
- [ ] Least privilege everywhere: the web app cannot write to the published-asset bucket,
      the image worker cannot reach the database, the GPU worker cannot read buyer PII.
- [ ] Written incident path: who is called, what is disclosed, and the 72-hour notification
      clock. Two people need this more than fifty do, because there is nobody else to
      improvise.

## When to re-run the threat model

Any new external interface changes it materially. Specifically:

- Adding card or wallet payment (adds PCI scope).
- Shipping the Shopify widget (embedding in someone else's page is a new trust boundary).
- Accepting buyer selfies (adds biometric obligations that do not currently apply).
