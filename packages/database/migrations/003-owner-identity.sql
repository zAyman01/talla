-- Owner identity, sessions, and rate limits. Apply with the migration role.
--
-- These tables are platform level, not tenant scoped, and that is forced by the login
-- flow rather than chosen for convenience: an owner types a phone number before any
-- tenant is known, so a policy keyed on app.current_tenant would deny the lookup that
-- decides what app.current_tenant should be. See docs/decisions/0022.
--
-- The application role gets SELECT only on owners and owner_tenants. Provisioning a
-- store owner is an out of band operation, so a compromised application cannot create an
-- owner or grant itself membership of a tenant it does not already serve.

CREATE TABLE owners (
  id uuid PRIMARY KEY,
  -- HMAC of the phone number, never the number. The same index key the buyer path uses.
  phone_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
);

-- The table that decides which tenant an owner is allowed to become. It carries a
-- tenant_id and still cannot be under a tenant policy, which is exactly why it needs a
-- justified entry in the row-level security coverage allowlist rather than an exception
-- somebody adds quietly.
CREATE TABLE owner_tenants (
  owner_id uuid NOT NULL REFERENCES owners(id),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, tenant_id)
);
CREATE INDEX owner_tenants_by_tenant ON owner_tenants (tenant_id);

CREATE TABLE owner_challenges (
  id uuid PRIMARY KEY,
  -- NULL when the number belongs to nobody. A challenge is still written, and still
  -- costs the same work, so a caller cannot learn which numbers are registered.
  owner_id uuid REFERENCES owners(id),
  phone_hash text NOT NULL,
  ip_hash text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX owner_challenges_phone_rate ON owner_challenges (phone_hash, created_at DESC);
CREATE INDEX owner_challenges_ip_rate ON owner_challenges (ip_hash, created_at DESC);

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id),
  -- sha256 of the cookie token, never the token. A leaked backup must not hand over
  -- live sessions (spec 12.4).
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  -- Ending a session revokes it rather than deleting it. A deleted row cannot be the
  -- target of rotated_from, and more to the point it destroys the evidence that makes a
  -- disputed access answerable. Retention removes them on a schedule (Stage O), not at
  -- the moment somebody signs out.
  revoked_at timestamptz,
  -- Session fixation: the id rotates on privilege change, and the chain stays visible
  -- so a disputed access is answerable from the audit log (ADR-0007 names SIM swap as a
  -- real regional attack, and recovery disputes are settled from this).
  rotated_from uuid REFERENCES sessions(id)
);
CREATE INDEX sessions_by_owner ON sessions (owner_id);
CREATE INDEX sessions_expiry ON sessions (expires_at) WHERE revoked_at IS NULL;

-- Fixed window counters. Spec 6 puts these in Redis; ADR-0019 keeps them here until the
-- styling result cache makes Redis worth operating.
CREATE TABLE rate_limits (
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (bucket, window_start)
);
CREATE INDEX rate_limits_sweep ON rate_limits (window_start);

GRANT SELECT ON owners, owner_tenants TO talla_app;
GRANT SELECT, INSERT, UPDATE ON owner_challenges TO talla_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO talla_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limits TO talla_app;
