# 0002. PostgreSQL row-level security as the isolation mechanism

**Status:** Accepted
**Date:** 2026-09-04

## Context

Talla is multi-tenant, and the tenants are competing clothing stores in the same city who
often know each other. The data at risk is not abstract: catalog, stock, order volume, and
therefore margins.

The default approach is `WHERE tenant_id = ?` in application query code. Two alternatives
were considered: a database per tenant, and a schema per tenant.

## Decision

One database, one schema, `tenant_id NOT NULL` on every tenant-scoped table, and a
PostgreSQL row-level security policy on every one of them. Policies deny by default. The
application connects as a role that cannot bypass RLS. Tenant context is set once per
request, before any query runs.

Two CI tests enforce it: one enumerates every table and fails the build if any lacks a
policy, and one runs a representative query set as tenant A while tenant B's data exists and
asserts zero cross-tenant rows.

## Consequences

Policy definitions add complexity to migrations, and there is a small query-planning cost.
Debugging a query that returns nothing now has one more possible cause.

In exchange, isolation stops depending on every query being written correctly. An
application-layer filter is correct until the one query that forgets it, and that query gets
written at 1am before a pilot demo. This is the difference between a bug and a breach that
must be disclosed to three stores who talk to each other.

A database per tenant would isolate harder but makes cross-tenant operations (the styling
engine's shared block library, aggregate instrumentation, migrations across 50 stores)
disproportionately painful at this scale.

The CI tests are the load-bearing part. Without them this decays into "we meant to add a
policy to that table".
