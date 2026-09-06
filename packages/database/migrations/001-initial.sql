-- Apply with a migration role, never the application connection.
CREATE TABLE tenants (
  id uuid PRIMARY KEY,
  subdomain text NOT NULL UNIQUE CHECK (subdomain ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'),
  name_ar text NOT NULL,
  name_en text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE garments (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  id uuid NOT NULL,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  price integer NOT NULL CHECK (price > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','processing','confirmation','ready','failed','archived')),
  spec jsonb,
  published_assets jsonb,
  stock_epoch bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE stock (
  tenant_id uuid NOT NULL,
  garment_id uuid NOT NULL,
  size text NOT NULL CHECK (size IN ('XS','S','M','L','XL','XXL')),
  quantity integer NOT NULL CHECK (quantity >= 0),
  PRIMARY KEY (tenant_id, garment_id, size),
  FOREIGN KEY (tenant_id, garment_id) REFERENCES garments(tenant_id, id)
);

CREATE TABLE orders (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL,
  reference text NOT NULL,
  total integer NOT NULL CHECK (total > 0),
  buyer_ciphertext text,
  buyer_phone_hash text NOT NULL,
  status text NOT NULL DEFAULT 'placed' CHECK (status IN ('placed','confirmed','dispatched','fulfilled','cancelled')),
  cohort text NOT NULL CHECK (cohort IN ('control','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz,
  cancelled_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (tenant_id, reference)
);
CREATE INDEX orders_phone_velocity ON orders (tenant_id, buyer_phone_hash, created_at);

CREATE TABLE order_lines (
  tenant_id uuid NOT NULL,
  order_id uuid NOT NULL,
  garment_id uuid NOT NULL,
  size text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price integer NOT NULL CHECK (unit_price > 0),
  PRIMARY KEY (tenant_id, order_id, garment_id, size),
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id),
  FOREIGN KEY (tenant_id, garment_id) REFERENCES garments(tenant_id, id)
);

CREATE TABLE pins (
  tenant_id uuid NOT NULL,
  anchor_id uuid NOT NULL,
  suggested_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, anchor_id, suggested_id),
  FOREIGN KEY (tenant_id, anchor_id) REFERENCES garments(tenant_id, id),
  FOREIGN KEY (tenant_id, suggested_id) REFERENCES garments(tenant_id, id),
  CHECK (anchor_id <> suggested_id)
);

CREATE TABLE audit_log (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  id bigint GENERATED ALWAYS AS IDENTITY,
  actor_id text NOT NULL,
  action text NOT NULL,
  entity_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE jobs (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  garment_id uuid NOT NULL,
  stage text NOT NULL CHECK (stage IN ('ingest','understanding','solve','assets')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  error_code text,
  trace_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, garment_id) REFERENCES garments(tenant_id, id)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['garments','stock','orders','order_lines','pins','audit_log','jobs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)', t);
  END LOOP;
END $$;

CREATE FUNCTION forbid_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_log is append only'; END $$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();

-- Provision LOGIN/password out of band. No credential is committed.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='talla_app') THEN
    CREATE ROLE talla_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='talla_app' AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'talla_app must not bypass RLS';
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO talla_app;
GRANT SELECT ON tenants TO talla_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON garments, stock, orders, order_lines, pins, jobs TO talla_app;
GRANT SELECT, INSERT ON audit_log TO talla_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO talla_app;
