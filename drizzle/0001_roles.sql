-- Runtime roles, created WITHOUT credentials.
--
-- Copied from builderhunt/drizzle/0002_database_roles.sql, and the reason it is worth copying is the
-- consequence: deployment automation provisions and rotates the LOGIN passwords out of band, so no
-- migration file in git ever contains one, and the web service never holds an identity that can alter
-- the schema.
--
-- The trap that comes with it: `drizzle-kit migrate` alone leaves the application unable to
-- authenticate, because these roles have no password yet. Run the orchestrator (`pnpm deploy:db`) as
-- the post-deployment command. Builderhunt's runbook records four failed deploys learning that.

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

-- No superuser, no createdb, no createrole, and no BYPASSRLS. The application role is exactly as
-- privileged as it needs to be to serve a request and no more.
ALTER ROLE hunterready_app      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE hunterready_readonly LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
--> statement-breakpoint

-- Nothing is granted to PUBLIC. A new table is unreachable until it is granted deliberately.
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

-- The application may not DELETE from the audit log. An actor who can erase the record of their own
-- access has an audit log in name only, so retention pruning is the owner's job (`pnpm db:retention`).
REVOKE DELETE ON TABLE access_log FROM hunterready_app;
--> statement-breakpoint

-- Same grants for anything a later migration adds, so a new table is never accidentally unreachable
-- or accidentally world-readable.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hunterready_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO hunterready_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO hunterready_readonly;
