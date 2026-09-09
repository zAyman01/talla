CREATE TABLE phone_challenges (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  id uuid NOT NULL,
  phone_hash text NOT NULL,
  ip_hash text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX phone_challenges_phone_rate
  ON phone_challenges (tenant_id, phone_hash, created_at DESC);
CREATE INDEX phone_challenges_ip_rate
  ON phone_challenges (tenant_id, ip_hash, created_at DESC);

ALTER TABLE phone_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_challenges FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON phone_challenges
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON phone_challenges TO talla_app;
