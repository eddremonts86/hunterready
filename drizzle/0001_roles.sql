-- Runtime roles, created WITHOUT credentials.
--
-- Copied from builderhunt/drizzle/0002_database_roles.sql, and what makes it worth copying is the
-- consequence: deployment automation provisions and rotates the LOGIN passwords out of band, so no
-- migration in git ever contains one and the web service never holds an identity that can alter the
-- schema.
--
-- The trap that comes with it: `drizzle-kit migrate` alone leaves the application unable to
-- authenticate. `scripts/deploy/orchestrate.mjs` is the post-deployment command, and its step 4
-- exists solely to catch that. Builderhunt's runbook records four failed deploys learning it.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hunterready_app') THEN
    CREATE ROLE hunterready_app LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hunterready_readonly') THEN
    CREATE ROLE hunterready_readonly LOGIN;
  END IF;
END
$$;
--> statement-breakpoint

ALTER ROLE hunterready_app      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE hunterready_readonly LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
--> statement-breakpoint

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO hunterready_app, hunterready_readonly;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hunterready_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hunterready_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO hunterready_readonly;
--> statement-breakpoint

-- Better Auth writes and reads its own four tables through the app role, so it needs the grants
-- above. It never needs DDL: the schema is ours, applied by migration as the owner.
--
-- The readonly role is denied the auth tables outright. A read-only analytics session has no business
-- seeing session tokens or password hashes, and "readonly" is not the same claim as "harmless".
REVOKE ALL ON TABLE auth_accounts, auth_sessions, auth_verifications FROM hunterready_readonly;
--> statement-breakpoint

-- The application may not DELETE from the audit log. An actor who can erase the record of their own
-- access has an audit log in name only, so pruning is the owner's job (`pnpm db:retention`).
REVOKE DELETE ON TABLE access_log FROM hunterready_app;
--> statement-breakpoint

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hunterready_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO hunterready_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO hunterready_readonly;
