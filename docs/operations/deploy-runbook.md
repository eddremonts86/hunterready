# Production Deploy Runbook

How a push to `master` becomes a healthy production release, and what must be configured in the repo
and in Coolify so a deploy never leaves the app half-broken.

The policy here is BuilderHunt's, adapted rather than copied: same branch model, same "Quality green
on master deploys", same Coolify trigger. What is different is what a release can get _wrong_.
BuilderHunt's risk is the database — migrations, roles, pgvector. HunterReady has had one since v0.5,
with its own orchestrator and the same roles problem, so that risk is now shared. What is still its
own is the **image**: the PDF renderer is WASM and the fonts are bundled, and both can be absent from
a build that exited 0.

_(This paragraph used to say the app had no database and nothing to roll back. That stopped being true
at v0.5 and the sentence outlived it by five releases — see "The database" below, and the
post-deployment command in the Coolify table, which exists precisely because there is state.)_

---

> **Never set `HR_UNLOCK_DESIGNS` in Coolify.** It is the developer switch that removes the paid-design
> gate for a whole process (`src/lib/entitlements.ts`). It belongs in `docker-compose.local.yml`
> (gitignored) and nowhere else; in production it would give the paid catalogue away silently.
> _Since ADR-033, `HR_RELEASE=true` overrides it — a safety net, not a licence to set it._

## Moving the domain

Written while buying `hunterready.dev`, because the first thing this repository will do if the steps
are taken in the wrong order is **refuse to deploy** — and the error will look like a broken pipeline
rather than a half-finished DNS change.

### Why the order matters

The deploy workflow resolves the Coolify application by name and then asserts, independently, that it
answers on `vars.PRODUCTION_URL`. Two facts have to agree before anything ships, because a name
collision across environments is how the wrong app gets restarted and **Coolify reports success**.

Change the domain in Coolify first and the next release stops with:

```
"hunterready" (dockercompose) answers on [hunterready.dev],
but PRODUCTION_URL is https://hunterready.eduardoinerarte.dk
 — one of the two is wrong, so nothing was deployed
```

That is the guard working. The way through it is not to hurry.

### The order that works

The workflow collects **every** host the application answers on into a set and checks membership, so
an application carrying both domains satisfies either value of `PRODUCTION_URL`. That is what makes
this a switch rather than a cutover.

1. **Buy the domain.** `builderhunt.dev` is at Porkbun, and so are its nameservers, so the new one
   belongs there too — same panel, same DNS.
2. **Point it at the box.** An `A` record for the apex at **`178.105.106.79`**, which is where
   `hunterready.eduardoinerarte.dk` resolves today. No `AAAA`: the VPS answers on v4 only, and a
   `AAAA` that resolves to nothing is a site that fails for exactly the users whose network prefers
   v6. Add `www` as a `CNAME` to the apex if you want it, or leave it off.
3. **Add it in Coolify _beside_ the old one, not instead of it.** This is a docker-compose
   application, so the host lives per service in `docker_compose_domains` and it is comma-separated.
   Both domains, both live. Wait for the certificate.
4. **Verify the new host before touching anything in GitHub.**
   ```bash
   curl -s https://hunterready.dev/api/health
   pnpm stale --url https://hunterready.dev
   ```
5. **Now** set `PRODUCTION_URL` to `https://hunterready.dev` in GitHub → Settings → Variables. Until
   this moment the old value is still true, so a release in the middle of the move still deploys.
6. **`BETTER_AUTH_URL` in Coolify, and this one is not cosmetic.** It is the auth base URL _and_ the
   thing `session.ts` reads to decide whether cookies are `secure`. Left pointing at the old host,
   sign-in breaks in a way that looks like an account bug: the cookie is issued for an origin nobody
   is on. Restart after changing it.
7. **Deploy once and read `/api/processing`**, not just `/api/health` — a session that cannot be read
   reports `plan: "anonymous"` for a signed-in account, which is the symptom step 6 produces.
8. **Leave the old domain answering for a while.** It costs nothing, and it is what a bookmark, a
   share link somebody already sent, and an integration's hardcoded base URL will keep using.

⚠️ **`.dev` is HSTS-preloaded at the TLD.** Every `.dev` is HTTPS-only in every browser, with no
plaintext fallback and no way to click through a certificate warning. Nothing to do — Coolify issues
the certificate — but if step 4 fails, it will fail as a hard error rather than as a warning.

**What does not need touching:** nothing in `src/`. The OpenAPI document reports the origin the reader
reached rather than a constant, so `/v1/openapi.json` is correct on both domains from the first
minute, and no share link or e-mail builds an absolute URL from a configured host.

## Going out of beta

**One variable, one restart.** Set `HR_RELEASE=true` in Coolify and restart. That is the whole
procedure; nothing else in the environment needs touching, and nothing else in the environment can
override it.

Rehearse it first — this is the one state a laptop otherwise cannot show you, because `NODE_ENV`
and `HR_UNLOCK_DESIGNS` both open the catalogue in development:

```bash
pnpm host                          # :3011, beta — what production serves today
HR_RELEASE=true PORT=3012 pnpm host   # :3012, released — what it will serve
```

Two tabs, compared. `.claude/launch.json` was cut to a single entry on 2026-08-23 and that entry is
the released view with the Stripe fixtures set, so it covers the second command and a little more; the
beta view is a bare `pnpm host`.

Then, after the restart, four facts and one refusal:

```bash
curl -s https://hunterready.eduardoinerarte.dk/api/processing
```

```
"beta": false                 the interface stops saying it, everywhere at once
"thirdPartyForYou": false     an anonymous visitor's CV is read on our hardware
"paidDesigns": false          the catalogue is gated
"thirdPartyConfigured": true  the models are still there — this reports configuration, not entitlement
```

```bash
curl -s -o /dev/null -w '%{http_code}\n' 'https://hunterready.eduardoinerarte.dk/api/render?fixture=nurse-senior&template=sidebar&theme=onyx'
```

`402` is the pass. `200` means the switch did not take, and the first thing to check is whether the
running image predates ADR-033 — `docker exec hunterready-app sh -c 'grep -rl HR_RELEASE .output/server/ | wc -l'`.

**To go back**, unset it and restart. Nothing is one-way.

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
{ "status": "ok", "checks": { "wasm": true, "fonts": true, "families": 10 } }
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

| Name                          | Required | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LLM_API_KEY` / provider vars | no       | Absent is a supported state: extraction falls back to the deterministic rules path and the app keeps working. See `src/structure/provider.ts`.                                                                                                                                                                                                                                                                                                                               |
| `PORT`                        | no       | Defaults to 3000 in the image.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `HR_THIRD_PARTY_FOR_ALL`      | no       | `true` opens the third-party model to everyone, account or not (ADR-030). ⚠️ **Redundant since beta shipped** — `thirdParty` is `everyone \|\| beta \|\| paid` and beta defaults on, so removing this alone changes nothing measurable. It is being left set on purpose. The exit is `HR_RELEASE`, below.                                                                                                                                                                    |
| `HR_BETA_PAID_FREE`           | no       | Defaults **on** in code, so unset means beta: every Pro capability included and every one still labelled Pro. The finer-grained half of `HR_RELEASE`, kept for the case where one capability has to move alone. Not the lever to reach for.                                                                                                                                                                                                                                  |
| `HR_RELEASE`                  | no       | **The switch out of beta (ADR-033).** `true` and the product is released in one move: no beta labelling anywhere in the interface, paid designs and the mixed axes gated, and an anonymous visitor's CV read on our own hardware. It **overrides** the two rows above and `HR_UNLOCK_DESIGNS`, so it is a complete answer on its own and cannot be defeated by a variable nobody deleted. Flip it the day pricing opens; unset it to go back. See "Going out of beta" below. |

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
1. **`"hunterready" (dockercompose) answers on […], but PRODUCTION_URL is …`** — the resolve step
   could not find the expected host among the ones the application actually answers on, so it refused
   to deploy somewhere it cannot identify. **Check the application in Coolify before touching
   anything:** production may be perfectly healthy on the previous release, which is exactly what the
   guard is for.

   **Where that host lives depends on the build pack, and this cost a release on 2026-08-15.** A
   Dockerfile application keeps it in `fqdn`. A **docker compose** application — which this one is,
   since the stack is app plus Postgres plus the local model — keeps it per service in
   `docker_compose_domains` and leaves `fqdn` **null**. The guard read `fqdn` only, so its first run
   refused a good release with `answers on null` while the domain had never moved. It now reads both
   and prints what it found.

   Two things worth more than the fix: the API also refuses a `domains` write on a compose application
   (`use docker_compose_domains instead`), and _"the infrastructure lost its config"_ is a far more
   expensive thing to believe than to check — one `GET /api/v1/applications/<uuid>` settles it.

   **Do not "fix" a genuine one by relaxing the guard.** It is the only thing standing between a
   renamed or duplicated application and a release going somewhere nobody is looking.

1. **`wasm` false.** `scripts/copy-assets.mjs` did not run or did not find the WASM. Check `pnpm build`
   locally, then `ls .output/server/pkg/`.
1. **`fonts` false.** The bundled OFL fonts are missing from `.output/server/fonts`. Same script.
1. **Health never 200.** The container is not serving. Read the Coolify build and runtime logs; the
   healthcheck itself has a 20s start period, so a slow boot shows as retries rather than failure.
1. **Rolling back** is redeploying the previous commit from Coolify's deployment list. There is no
   database, so a rollback is complete and instant — the one genuine advantage of having no state.

## The database (v0.5, ADR-019)

|           |                                                                                                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Resource  | the `db` **service of the compose stack** — `postgres:18-alpine`, container `hunterready-db`, volume `hunterready_postgres_data`                                                                             |
| Exposure  | **internal only**, reachable as `db:5432` on the stack's own network. Migrations run inside that network as Coolify's post-deployment command (`node scripts/deploy/orchestrate.mjs`); nothing is published. |
| Roles     | `hunterready_owner` (the compose `POSTGRES_USER`), `hunterready_app`, `hunterready_readonly`                                                                                                                 |
| Retention | 90 days from the last sign-in, swept by `scripts/db/retention.mjs`                                                                                                                                           |

**It is not a standalone Coolify database resource, and adding one is the mistake to avoid.** The
stack carries its own Postgres, so a separate resource is something nothing has a connection string
for. One was created alongside the stack on 14 Aug 2026 and sat there running `postgres:16-alpine`
with no client at all until it was deleted on the 15th. If the Coolify UI shows a `hunterready-db`
outside the compose stack, that is the empty one, not this one.

Env rows Coolify must carry, beyond the model provider:

| Name                    | Notes                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`     | the **owner** role. The compose file builds `DATABASE_MIGRATION_URL` from it.                                                            |
| `DATABASE_APP_PASSWORD` | the **app** role. The compose file builds `DATABASE_URL` from it; the orchestrator provisions it onto `hunterready_app` on every deploy. |
| `BETTER_AUTH_SECRET`    | `openssl rand -hex 32`. Signs sessions.                                                                                                  |
| `BETTER_AUTH_URL`       | the public origin. A wrong value breaks the auth callbacks and nothing else, which makes it slow to spot.                                |
| `DATA_ENCRYPTION_KEY`   | see below. **Unset means plaintext**, and it was unset in production from the first deploy until 15 Aug 2026.                            |

Neither `DATABASE_URL` nor `DATABASE_MIGRATION_URL` is a Coolify row: the compose file composes both
from the two passwords above and the internal `db` hostname. Setting them by hand in Coolify creates a
second source of truth that the compose file then overrides, silently.

`SESSION_SECRET` was on this list and is gone. Nothing in `src/` or `scripts/` has read it since auth
moved to Better Auth — `BETTER_AUTH_SECRET` is the one that signs sessions now.

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

## The encryption key (ADR-021)

`DATA_ENCRYPTION_KEY` — 64 hex characters, `openssl rand -hex 32`. Set it in Coolify's environment for
the stack, exactly like the database passwords.

**It was empty in production from the first deploy until 15 Aug 2026.** The live key is now set for
both the production and preview scopes, and its copy lives in the AI-OS master `.env` as
`HUNTERREADY_DATA_ENCRYPTION_KEY`. That file is one laptop; point 1 below is still owed.

Confirm the state from outside rather than from the log, which only speaks on first use:
`curl -s https://hunterready.eduardoinerarte.dk/api/processing` reports `encryptsAtRest`.

### Everything stored before the key existed is still plaintext

Turning the key on fixed the future and nothing else. `encryptJson` runs on a write, so a CV nobody
edits again is never encrypted, and `decryptJson` passes a non-envelope straight through — which is
what keeps those rows readable and also what makes them easy to forget.

```bash
pnpm db:reencrypt --check   # count what is still plaintext, change nothing
pnpm db:reencrypt           # encrypt it
```

Runs as the owner, is safe to run twice, and covers the three encrypted columns: `resumes.document`,
`variants.document`, `variants.gap_report`. Its predicate is "not an envelope", so an already-encrypted
row is never selected and never double-wrapped.

The script re-implements the envelope, because `scripts/` is plain `.mjs` and this repo has no
TypeScript runner, so `crypto.ts` cannot be imported into it. That is the same second-copy trap
`retention.mjs` documents, and what holds the two together is
`src/db/__tests__/reencrypt-envelope.test.ts`, which reads across the boundary in both directions.
Change the envelope on either side and that test fails. Do not delete it to make a change pass.

```bash
openssl rand -hex 32
```

**Losing it loses every stored CV.** There is no recovery path and there should not be one, so the
obligation is real:

1. Back the key up somewhere that is **not this server** — a password manager entry is fine, a note on
   the same host is not.
2. Never rotate it without re-encrypting first. Changing the key makes every existing row throw
   `could not decrypt stored CV content`, which is the correct behaviour and not a fixable state without
   the old key. A rotation is: read with the old key, write with the new one, in one pass, with both keys
   present.
3. A wrong or missing key is visible rather than silent. At startup the app logs
   `crypto.state` with `encrypting` or `plaintext_no_key`, and a malformed key logs
   `crypto.bad_key` and falls back to plaintext rather than pretending. Grep for those after a deploy.

An installation with no key still works and stores plaintext. That is deliberate — it keeps a laptop
usable — and it is also why `/privacy` reads the real state from the server instead of asserting
encryption in prose.
