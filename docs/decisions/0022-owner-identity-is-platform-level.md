# 0022. Owner identity is platform level, and tenant membership is a join

**Status:** Accepted
**Date:** 2026-09-11

## Context

Spec 12.3 is unambiguous: every tenant-scoped table has row-level security, no exceptions
and no "add it later". Migration `001-initial.sql` holds that line across all seven tables
it creates, and `packages/database/test/rls-coverage.test.ts` now enforces it mechanically
for every table added afterwards.

Store owner authentication runs into a sequencing problem that no amount of policy writing
solves. An owner arrives at the admin origin and types a phone number. At that moment:

- No tenant is known. The admin origin is one dedicated hostname serving every store
  (spec 12.4), so there is no subdomain to resolve.
- The thing that will eventually name the tenant is the owner's membership.
- A policy keyed on `app.current_tenant` would therefore deny the lookup whose entire
  purpose is to decide what `app.current_tenant` should be.

`modules/tenancy` already records this shape for the subdomain registry: "the platform
registry lookup is deliberately outside a tenant transaction: the tenant is not known yet."
Owner identity is the same problem arriving from a second direction.

## Decision

**Owner identity is platform level.** `owners`, `owner_challenges`, `sessions` and
`rate_limits` carry no `tenant_id` and are not tenant-scoped data. `owner_tenants` is the
membership join, carries a `tenant_id`, and is **the one table exempted** from the
row-level security coverage gate, with its justification written into the allowlist beside
it.

`packages/database` gains `Database.platform(work)`: a transaction with no tenant context.

**Admin resolves its tenant from the session, never from a header.** `withOwnerTenant`
takes the owner id from the session, the requested tenant from the route, and refuses with
`AUTH_FORBIDDEN` unless the pair appears in `owner_tenants`. The storefront keeps resolving
from `Host`, because a buyer is anonymous and the host is the only thing that can name the
tenant there.

The code lives in `modules/tenancy` rather than a new module, because what it produces is
the right to act as a tenant. That is the same question `resolve` answers from a hostname,
asked by a different surface.

## Consequences

**`platform` is not a privileged escape hatch, and the reason is precise.** The application
role is `NOSUPERUSER NOBYPASSRLS`, and every tenant-scoped table forces row-level security
with a policy keyed on `app.current_tenant`. With no tenant set, that policy matches
nothing, so a platform connection reads zero rows from `garments`, `orders`, and the rest.
The blast radius of the method is exactly the platform tables it exists to reach. This is
asserted directly in `test/owner-auth-postgres.test.ts`.

**The exemption is one table, and it is visible.** The allowlist is a map from table name
to justification, not a count, so adding to it is a diff somebody has to defend. The
application role holds `SELECT` only on `owners` and `owner_tenants`, so a compromised
application cannot create an owner or grant itself membership of a store it does not
already serve.

**Admin cannot be tricked by a `Host` header.** This is the security property the decision
buys. One origin serves every store, so a tenant read from a header would be a tenant
chosen by whoever sent the request. Taking it from the session and checking membership
makes that class of bug unreachable rather than guarded against.

**Self-service signup is not possible**, and that is intended for now. Owners are
provisioned out of band, which matches spec section 19: the first ten stores are sold in
person. When signup arrives it is a new write path with its own abuse surface, and it
should be designed as one rather than falling out of an `INSERT` grant nobody discussed.

**An unknown phone number is indistinguishable from a known one.** `startLogin` writes a
challenge row and generates a code either way, and only sends a message when the number
belongs to an owner. Verification then fails identically for an unregistered number and a
wrong code. Without this, the login form is a way to enumerate which shops use Talla.
Timing is not equalised, and at pilot scale that residual is accepted rather than hidden.
