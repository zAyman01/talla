-- Provisions the two login roles for local development only.
--
-- Migration 001 creates `talla_app` as NOLOGIN and says the credential is provisioned out
-- of band, because a password in a migration is a password in every deployment that runs
-- it. This file is that out-of-band step for one machine: it runs once, on the first boot
-- of the development volume, and the password it sets is the one already written in plain
-- text in docker-compose.yml.
--
-- Two roles, not one, because spec 12.3 separates them. The application role can read and
-- write rows and owns nothing, so it cannot drop a policy that constrains it. The
-- migration role owns the schema and never serves a request.

-- Created here with LOGIN, so migration 001 finds it and only checks the invariant that
-- actually matters: it must not be superuser and must not bypass row-level security.
CREATE ROLE talla_app LOGIN PASSWORD 'local-development-only' NOSUPERUSER NOBYPASSRLS;

-- CREATEROLE so a clean volume still works if migration 001 has to create `talla_app`
-- itself, which is the path a deployment without this file takes.
CREATE ROLE talla_migrate LOGIN PASSWORD 'local-development-only' NOSUPERUSER NOBYPASSRLS CREATEROLE;

-- PostgreSQL 15 and later leave `public` owned by pg_database_owner with CREATE revoked,
-- so the migration role cannot create a table in it, let alone grant on one, until it
-- owns the schema.
ALTER SCHEMA public OWNER TO talla_migrate;
