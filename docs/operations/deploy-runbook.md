# Production Deploy Runbook

How a push to `master` becomes a healthy production release, and what must be configured in the repo
and in Coolify so a deploy never leaves the app half-broken.

The policy here is BuilderHunt's, adapted rather than copied: same branch model, same "Quality green
on master deploys", same Coolify trigger. What is different is what a release can get _wrong_.
BuilderHunt's risk is the database — migrations, roles, pgvector. HunterReady has no database at all,
so there is no migration orchestrator and nothing to roll back. Its risk is the **image**: the PDF
renderer is WASM and the fonts are bundled, and both can be absent from a build that exited 0.

---

## TL;DR — the deploy flow

```
pnpm ci:local                # the gate. The pre-push hook runs it for you.
  ↓  git push origin <branch>  →  open a PR  →  merge to dev  →  PR dev → master
GitHub: Quality (pull_request, and again on push to master)
  ↓  green
GitHub: Deploy to Coolify   (workflow_run: Quality completed on master)
  ↓
Coolify: docker build (Dockerfile, --frozen-lockfile)
  ↓
Coolify: start container → HEALTHCHECK /api/health passes
  ↓
Deploy workflow re-verifies from outside: status ok, wasm true, fonts true, landing 200
  ↓
Release live ✓
```

**The single most important rule: a deploy is not verified by a status code.** `/api/health` returns

```json
{ "status": "ok", "checks": { "wasm": true, "fonts": true, "families": 5 } }
```

and the deploy workflow asserts `wasm` and `fonts` field by field. That is not defensive
programming for its own sake — it is the one production incident this project has had. In v0.1 Block
1, `vite dev` worked, `vite build` exited 0, the container started clean, and every render answered
500 because Rollup never emitted `takumi_pdf_wasm_bg.wasm` into `.output`. Nothing in the pipeline was
red. `scripts/copy-assets.mjs` fixes the cause; this step is what would have caught it.

---

## Branches

| Branch                                              | Means                                       | Protection                                                    |
| --------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| `master`                                            | production. Green Quality here **deploys**. | PR only. Confirm before pushing — treat a merge as a release. |
| `dev`                                               | integration. Quality runs, nothing deploys. | PR preferred; direct pushes are gated by the pre-push hook.   |
| `feat/…` `fix/…` `chore/…` `docs/…` `ci/…` `test/…` | one change each, kebab-case                 | PR into `dev`                                                 |

Commits are conventional with a scope, imperative, and say _why_ where the why is not obvious:
`fix(ingest): read a scan through OCR instead of refusing it`.

## The gate

`pnpm ci:local` (`scripts/ci/local-quality.sh`) mirrors `.github/workflows/quality.yml`. The pre-push
hook runs it on **every** branch, because CI only fires on pull requests and on `master`/`dev` — so a
feature branch pushed straight up has this and nothing else.

```bash
pnpm ci:local          # format, lint, typecheck, unit, docker suite, parity
pnpm ci:local --fast   # skips the two Docker steps. Not a gate — see below.
SKIP_CI_LOCAL=1 git push   # bypass. Never for master.
```

Two things about it are load-bearing:

- **`NODE_ENV=production` is pinned.** Vitest defaults to `NODE_ENV=test`, which makes Vite emit the
  development JSX transform into a bundle running against production React; every SSR render then
  dies with `jsxDEV is not a function`. The workflow pins the same value. If the two ever disagree,
  "it passed locally" stops meaning anything.
- **`pnpm test` alone is not enough, and it does not say so.** LibreOffice, Tesseract and poppler live
  in the image and deliberately not on a laptop (ADR-012), so the `.doc` and OCR suites _skip
  themselves_: 176 tests pass instead of 183, in green. `pnpm test:docker` builds the Dockerfile's
  `test` stage — node_modules _and_ the system binaries in one place — and is the only environment
  where those suites run.

## Coolify configuration

| Setting                 | Value                                       | Why                                                                                                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build pack              | Dockerfile                                  | The image is the contract (ADR-012). No nixpacks.                                                                                                                                                                                                                                     |
| Dockerfile target       | _(leave empty — the final `runtime` stage)_ | Never `test`: that stage carries node_modules and dev dependencies.                                                                                                                                                                                                                   |
| Port                    | 3000                                        | `ENV PORT=3000`, and `CMD node .output/server/index.mjs`.                                                                                                                                                                                                                             |
| Healthcheck             | inherited from the image                    | `HEALTHCHECK` is in the Dockerfile, using Node's own `fetch` so the image needs no curl.                                                                                                                                                                                              |
| Post-deployment command | `node scripts/deploy/orchestrate.mjs`       | **Never bare `drizzle-kit migrate`.** The roles migration creates the app role without a password on purpose, so migrating alone leaves the app unable to authenticate — the container starts and every DB-backed page 500s. Step 4 of the orchestrator exists to catch exactly that. |

Environment variables Coolify must set:

| Name                          | Required | Notes                                                                                                                                          |
| ----------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `LLM_API_KEY` / provider vars | no       | Absent is a supported state: extraction falls back to the deterministic rules path and the app keeps working. See `src/structure/provider.ts`. |
| `PORT`                        | no       | Defaults to 3000 in the image.                                                                                                                 |

**Never** paste a key into a repo file, a commit, or a build log. `.env` and `.env.*` are gitignored
except `.env.example`.

## GitHub configuration

### The live deployment

|                 |                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------- |
| URL             | `https://hunterready.eduardoinerarte.dk`                                                       |
| Coolify project | `hunterready` (its own project, matching every other app on that server)                       |
| DNS             | wildcard `*.eduardoinerarte.dk` already points at the host, so a new subdomain needs no record |

### Coolify API quirks, found the hard way

The create and update endpoints do **not** accept the same fields, and the errors are unhelpful:

- `POST /api/v1/applications/public` rejects **`fqdn`** and **`dockerfile_target_build`** with
  `422 {"field":["This field is not allowed."]}`. Create without them.
- `PATCH /api/v1/applications/<uuid>` accepts the target stage as `dockerfile_target_build`, but the
  domain is **`domains`**, not `fqdn` — `fqdn` is rejected on update too, even though it is the field
  name the API _returns_. Write `domains`, read `fqdn`.

So provisioning is two calls: create, then patch the domain and the target stage. Same family of
quirk as `is_build_time` on the envs endpoint (see the `env-config-and-secrets` skill).

Secrets (Settings → Secrets and variables → Actions → _Secrets_):

| Name                | Example                                   |
| ------------------- | ----------------------------------------- |
| `COOLIFY_API_URL`   | `https://coolify.example.com`             |
| `COOLIFY_API_TOKEN` | a Coolify API token with deploy rights    |
| `COOLIFY_APP_UUID`  | the application UUID from its Coolify URL |

Variables (same page, _Variables_ tab):

| Name             | Example                                           |
| ---------------- | ------------------------------------------------- |
| `PRODUCTION_URL` | `https://hunterready.example` — no trailing slash |

The deploy workflow's first step checks all four and **fails loudly** with the names of the missing
ones rather than half-running. Until they exist, merging to `master` is safe: Quality runs, Deploy
stops immediately with a configuration error, and nothing is triggered in Coolify.

Once a real domain is settled, prefer hard-coding it in `deploy.yml` over the variable, and keep the
`-L`-less `curl` — a domain parked on URL forwarding answers 302 on every path and lands on a 200
homepage, which reads as health.

## If a deploy goes red

1. **Deploy failed, Quality green.** The image built in CI (`pnpm test:docker` builds the same
   Dockerfile), so suspect Coolify: wrong target stage, wrong port, or a missing env row.
2. **`wasm` false.** `scripts/copy-assets.mjs` did not run or did not find the WASM. Check `pnpm build`
   locally, then `ls .output/server/pkg/`.
3. **`fonts` false.** The bundled OFL fonts are missing from `.output/server/fonts`. Same script.
4. **Health never 200.** The container is not serving. Read the Coolify build and runtime logs; the
   healthcheck itself has a 20s start period, so a slow boot shows as retries rather than failure.
5. **Rolling back** is redeploying the previous commit from Coolify's deployment list. There is no
   database, so a rollback is complete and instant — the one genuine advantage of having no state.

## The database (v0.5, ADR-019)

|           |                                                                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Resource  | `hunterready-db`, Postgres 18, in the `hunterready` Coolify project                                                                           |
| Exposure  | **internal only** (`is_public: false`). Migrations run _inside_ the Coolify network as the post-deployment command; nothing needs it exposed. |
| Roles     | `hunterready_owner` (Coolify's), `hunterready_app`, `hunterready_readonly`                                                                    |
| Retention | 90 days from the last sign-in, swept by `scripts/db/retention.mjs`                                                                            |

Env rows Coolify must carry, beyond the model provider:

| Name                     | Notes                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `DATABASE_URL`           | the **app** role. Internal hostname is the database's Coolify uuid.                 |
| `DATABASE_MIGRATION_URL` | the **owner** role. Only migrations and the retention sweep use it.                 |
| `DATABASE_APP_PASSWORD`  | provisioned onto `hunterready_app` by the orchestrator on every deploy              |
| `SESSION_SECRET`         | `openssl rand -hex 32`. Unset disables sessions rather than signing with a default. |

### Verifying it locally before trusting it in production

The production database is internal-only, which is correct — so the SQL and the orchestrator are
verified against a throwaway local Postgres, and the real run happens inside the Coolify network:

```bash
docker run -d --name hr-pg -e POSTGRES_USER=hunterready_owner -e POSTGRES_PASSWORD=localdev \
  -e POSTGRES_DB=hunterready -p 55432:5432 postgres:18-alpine

DATABASE_MIGRATION_URL="postgres://hunterready_owner:localdev@127.0.0.1:55432/hunterready" \
DATABASE_URL="postgres://hunterready_app:applocaldev@127.0.0.1:55432/hunterready" \
DATABASE_APP_PASSWORD=applocaldev pnpm deploy:db
```

Both failure paths are worth confirming after any change to the orchestrator, because a deploy step
that cannot fail is not a check:

- unset `DATABASE_APP_PASSWORD` → step 3 must exit 1
- give `DATABASE_URL` a wrong password → step 4 must exit 1

`src/db/__tests__/repository.test.ts` skips itself when no database is reachable, so CI without one is
not red for the wrong reason. Point `DATABASE_MIGRATION_URL` at the local container to run it.

## Coolify and Docker Compose: the trap that took production down

Recorded because the symptom points at nothing. The site answered **`503 no available server`** while
Coolify reported the application `running:healthy` and the deploy log was entirely green.

**For a `build_pack: dockercompose` application, Coolify ignores the `fqdn` field.** It builds the
Traefik labels from **`docker_compose_domains`**, which held the auto-generated
`app-<uuid>.<ip>.sslip.io:3000` — so the proxy was routing a hostname nobody requests. `fqdn` looked
correct in the API, which is exactly why the deploy passed.

The fix, and the shape took three rejected attempts to find:

```bash
# PATCH /api/v1/applications/<uuid>
# `docker_compose_domains` is an ARRAY of {name, domain}, where `name` is the compose SERVICE name.
{"docker_compose_domains":[{"name":"app","domain":"https://hunterready.eduardoinerarte.dk"}]}
```

The rejections, in order, because each one names a wrong guess worth not repeating:

| sent                           | answer                                              |
| ------------------------------ | --------------------------------------------------- |
| a JSON **string**              | `must be an array`                                  |
| an **object** keyed by service | `docker_compose_domains.app.name field is required` |
| the field named `domains`      | `cannot be used for dockercompose applications`     |

Four more things this cost, all of them cheap once known:

- **`SERVICE_FQDN_<SERVICE>_<PORT>` must be declared on the service**, not only as a stack-level
  variable. It is what tells the proxy which container and port back the domain.
- **`expose`, not `ports`.** Coolify routes over the stack's own network. Publishing to the host does
  not help it find the container and collides with everything else on that number.
- **Postgres 18 mounts at `/var/lib/postgresql`**, not `/var/lib/postgresql/data`. The old path makes
  the container refuse to start — and easy to miss, because a `docker run` with no volume works fine.
- `docker_compose_raw` is base64 in the API. `/services` and `/applications` are different endpoints
  with different shapes; a compose stack created as an application is not visible under services.

**BuilderHunt is not the model for this.** It runs `build_pack: dockerfile`, so its group in the
Coolify UI does not come from a compose stack at all. Copying its answers here was the wrong instinct.
