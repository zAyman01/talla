CREATE TABLE store_owners (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  id uuid NOT NULL,
  phone_hash text NOT NULL CHECK (phone_hash ~ '^[a-f0-9]{64}$'),
  display_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,phone_hash)
);

CREATE TABLE owner_sessions (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  token_hash text NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,token_hash),
  FOREIGN KEY (tenant_id,owner_id) REFERENCES store_owners(tenant_id,id)
);

CREATE INDEX owner_sessions_expiry ON owner_sessions (expires_at);

ALTER TABLE store_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_owners FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON store_owners
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

ALTER TABLE owner_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON owner_sessions
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

GRANT SELECT ON store_owners TO talla_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON owner_sessions TO talla_app;
