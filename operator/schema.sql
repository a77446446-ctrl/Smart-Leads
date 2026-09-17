-- Отдельная база центрального сервиса. Клиентские таблицы здесь не создаются.
CREATE TABLE IF NOT EXISTS operator_instance (
  id uuid PRIMARY KEY,
  name varchar(120) NOT NULL,
  customer varchar(160) NOT NULL,
  domain text NOT NULL UNIQUE,
  contact varchar(240) NOT NULL DEFAULT '',
  plan varchar(120) NOT NULL DEFAULT '',
  monthly_fee_kopecks integer NOT NULL DEFAULT 0 CHECK (monthly_fee_kopecks >= 0),
  paid_until date,
  backup_at date,
  restore_at date,
  service_status varchar(16) NOT NULL CHECK (service_status IN ('active', 'paused', 'archived')),
  notes text NOT NULL DEFAULT '',
  key_hash char(64),
  last_seen_at timestamptz,
  report jsonb,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operator_instance_created ON operator_instance (created_at DESC, id);
CREATE INDEX IF NOT EXISTS operator_instance_seen ON operator_instance (last_seen_at);
CREATE TABLE IF NOT EXISTS operator_audit (
  id bigserial PRIMARY KEY,
  instance_id uuid REFERENCES operator_instance(id),
  action varchar(60) NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operator_audit_instance ON operator_audit (instance_id, created_at DESC);
