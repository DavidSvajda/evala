-- Private schema: deliberately excluded from Supabase's public Data API.
CREATE SCHEMA IF NOT EXISTS evala;
REVOKE ALL ON SCHEMA evala FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS evala.schema_migrations (
  version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS evala.users (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  profile jsonb NOT NULL,
  name text GENERATED ALWAYS AS (profile->>'name') STORED,
  email text GENERATED ALWAYS AS (profile->>'email') STORED,
  revision bigint NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS evala.game_versions (
  key text PRIMARY KEY,
  user_id text NOT NULL REFERENCES evala.users(id) ON DELETE CASCADE,
  game_id text NOT NULL,
  version text NOT NULL,
  payload jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 1,
  UNIQUE (user_id, game_id, version)
);
CREATE INDEX IF NOT EXISTS game_versions_owner ON evala.game_versions(user_id);
CREATE TABLE IF NOT EXISTS evala.games (
  user_id text NOT NULL REFERENCES evala.users(id) ON DELETE CASCADE,
  game_id text NOT NULL,
  version text NOT NULL,
  metadata jsonb NOT NULL,
  white text GENERATED ALWAYS AS (metadata->>'white') STORED,
  black text GENERATED ALWAYS AS (metadata->>'black') STORED,
  result text GENERATED ALWAYS AS (metadata->>'result') STORED,
  PRIMARY KEY (user_id, game_id),
  FOREIGN KEY (user_id, game_id, version)
    REFERENCES evala.game_versions(user_id, game_id, version) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS evala.training (
  user_id text PRIMARY KEY REFERENCES evala.users(id) ON DELETE CASCADE,
  state jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS evala.training_history (
  user_id text NOT NULL REFERENCES evala.users(id) ON DELETE CASCADE,
  puzzle_id text NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY (user_id, puzzle_id)
);
CREATE TABLE IF NOT EXISTS evala.sessions (
  key text PRIMARY KEY,
  user_id text NOT NULL REFERENCES evala.users(id) ON DELETE CASCADE,
  expires bigint NOT NULL,
  payload jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON evala.sessions(expires);
CREATE INDEX IF NOT EXISTS sessions_owner ON evala.sessions(user_id);
CREATE TABLE IF NOT EXISTS evala.login_nonces (
  key text PRIMARY KEY, used_at bigint NOT NULL,
  payload jsonb NOT NULL, revision bigint NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS nonces_expiry ON evala.login_nonces(used_at);
CREATE TABLE IF NOT EXISTS evala.public_shares (
  key text PRIMARY KEY,
  owner_hash text,
  payload jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS shares_owner ON evala.public_shares(owner_hash);
CREATE TABLE IF NOT EXISTS evala.app_state (
  key text PRIMARY KEY, payload jsonb NOT NULL, revision bigint NOT NULL DEFAULT 1
);
-- The backend role has no DDL privileges or access to other Supabase schemas.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'evala_app') THEN
    CREATE ROLE evala_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;
GRANT CONNECT ON DATABASE postgres TO evala_app;
GRANT USAGE ON SCHEMA evala TO evala_app;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['users','game_versions','games','training','training_history',
                          'sessions','login_nonces','public_shares','app_state'] LOOP
    EXECUTE format('ALTER TABLE evala.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON evala.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON evala.%I TO evala_app', t);
    IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname='evala' AND tablename=t AND policyname='backend_only') THEN
      EXECUTE format('CREATE POLICY backend_only ON evala.%I TO evala_app USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;
GRANT SELECT ON evala.schema_migrations TO evala_app;
INSERT INTO evala.schema_migrations(version) VALUES (1) ON CONFLICT DO NOTHING;
