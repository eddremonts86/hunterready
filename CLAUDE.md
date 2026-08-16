# HunterReady — instructions for AI CLIs

Read `~/Projects/ai-os/CLAUDE.md` first. This file adds project-specific rules.

## What this is

CV optimizer: ingest `.pdf`/`.docx`/`.doc`/`.txt`/`.md` → canonical `Resume` schema
→ user review → verifiably ATS-safe designed PDF via pdfcn + takumi-pdf.

Status: **v0.1–v0.10 shipped** — ingestion, review, PDF and DOCX export, bullet rewriting, job
targeting, accounts with GDPR controls, cover letters, EN/ES/DA output, expiring share links, and
writing a CV from nothing.
See [docs/08-roadmap.md](docs/08-roadmap.md) for what each release contains and what it cost.
**What is open lives in one place**: [that file's open list](docs/08-roadmap.md#what-is-actually-open),
maintained; the per-version sections above it are history and their old "still to do" lists are not.
Pricing and payments is the only item blocking v1.0. There is **no active Spec** —
[specs/current_spec.md](specs/current_spec.md) says so and says how to start the next one.

**Four features shipped as schema plus documentation and nothing else**, found one after another in a
single session: `variant-diff`, all of v0.4's targeting, all of v0.5's persistence, and `basics.photoUrl`
— which had a field, a paragraph in docs/05 describing its slot on `modern-eu`, and no code on either
end. The check below is one command and it is not optional.

**Before calling a version done, check the feature is reachable.** Three releases in a row shipped a
complete, tested layer that no screen imported — v0.3's `variant-diff`, all of v0.4's targeting, all of
v0.5's persistence. A passing unit test argues convincingly that a feature works while nobody can get to
it. The check costs one command:

```bash
grep -rn "optimize/thing" src --include='*.ts' --include='*.tsx' | grep -v __tests__
```

## Before touching code

1. Read [PRODUCT.md](PRODUCT.md) — product truth. The audience is **all sectors**, not
   tech; that single fact invalidates most default assumptions about a "CV app".
2. Read [DESIGN.md](DESIGN.md) — the visual world and its named rules. Before building
   any surface, read its brief in `.impeccable/surfaces/`.
3. Read [docs/02-architecture.md](docs/02-architecture.md) and [docs/03-resume-schema.md](docs/03-resume-schema.md).
4. Check [docs/09-decisions.md](docs/09-decisions.md) — do not re-litigate settled ADRs.
5. New architectural choice? Append an ADR. Do not rewrite existing ones.

## Hard rules

- **`src/schema/resume.ts` is the contract.** Changing it means touching ingestion,
  templates, tests and fixtures. Bump `schemaVersion` and add a migration.
- **Never edit `src/components/pdf/` or `src/components/ui/` by hand.** Vendored
  copy-paste code; hand edits destroy the ability to diff against upstream. Wrap it.
- **Every template obeys the ATS ruleset** in [docs/05-pdf-rendering.md](docs/05-pdf-rendering.md)
  and must pass the round-trip test. No exceptions, including "just for this design".
- **No fabrication in AI features.** Numbers, employers, dates, technologies and
  outcomes may never be invented. See [docs/06-ai-optimization.md](docs/06-ai-optimization.md).
- **No CV content in logs, errors, analytics or telemetry.** Ever. See [docs/07-privacy.md](docs/07-privacy.md).
- **The print is not ours.** DESIGN.md's hardest rule: Signal Blue (`#1B3BD8`), every
  other chrome colour, and the chrome typeface (Figtree) appear nowhere in a CV preview
  or an exported PDF. Documents draw from their **own** print palette — seven accent inks
  and their washes in `src/render/themes/tokens.ts`, enforced by test — and the renderer's
  own bundled faces (ten OFL families — see `scripts/bundle-fonts.mjs`). A CV
  carrying our accent carries our brand into someone else's job application; a CV carrying
  a navy of its own is just a CV (ADR-024).
  _This rule outlived the v0.6 world change unaltered — it was never about amber, and it
  was never about banning color._
- **Nothing is irreversible, and nothing warns that it is.** The darkroom world says
  "there is no undo"; this product says the opposite. Variants are test strips.
- **PDF colors are hex.** The renderer rejects `oklch`. Themes are a hand-maintained
  hex mirror of the app tokens (ADR-003).
- **Flexbox only** in PDF templates. No CSS grid — Satori-lineage subset.
- **Elevation is the two-layer shadow recipe** in DESIGN.md, Ink-tinted, and used only to
  say "this surface is above that one" — never to make something look important. The old
  Falloff Rule (no `box-shadow` anywhere, depth as amber falloff) was repealed with the
  darkroom world in v0.6; it described a dark room lit by one lamp.
- **Don't revive the darkroom.** Amber, safelight, test strips, stencilled caps,
  seven-segment numerals and the 4px stamped radius are retired. Reaching for one piece of
  a replaced world produces a screen belonging to neither.
- **Never assume a tech career** in copy, fixtures, skill taxonomies or sample content.
- Secrets come from `dev-env/env-config/.env`. Never hardcode, never echo, never commit.

## Verification (AI-OS rule: runtime evidence, not builds)

Never claim a block done on `pnpm build` alone. **This is not a style preference here —
it is a bug that already happened.** The Block 1 spike passed `vite dev` and passed
`pnpm build` with exit 0, then 500'd in production because Rollup never emitted the
renderer's WASM. For anything touching the render path, the only valid evidence is:

```bash
pnpm build && pnpm start   # then request the route and open the PDF
```

- Render changes → produce a PDF, open it, describe what you saw.
- Ingestion changes → print the field-accuracy table across fixtures.
- UI changes → exercise it in the browser, screenshot it.
- Deploy → report URL + one-line status.

`pnpm test ats` is the gate that matters most. If it has never failed, it is not
working — break it deliberately to confirm.

## Branches and deploys

Same policy as `builderhunt`. Read [docs/operations/deploy-runbook.md](docs/operations/deploy-runbook.md)
before pushing anything.

- `master` is **production**: Quality green there triggers the Coolify deploy. Treat a merge as a
  release, and **confirm with Edd before pushing to it**.
- `dev` is integration. Quality runs; nothing deploys.
- Work happens on `feat/…`, `fix/…`, `chore/…`, `docs/…`, `ci/…`, `test/…` — kebab-case, one change
  each — and merges via PR into `dev`.
- `.githooks/pre-push` runs `pnpm ci:local` on **every** branch, because CI only fires on pull
  requests and on `master`/`dev`. `pnpm prepare` wires it; `SKIP_CI_LOCAL=1 git push` bypasses it, and
  doing that on `master` is how red code reaches production.

**`pnpm test` is not the gate, and it will not tell you.** LibreOffice, Tesseract and poppler live in
the image and deliberately not on a laptop (ADR-012), so the `.doc` and OCR suites skip themselves —
176 tests green instead of 183. Use `pnpm test:docker` before claiming ingestion work is done.

## Conventions

- Language: **English** in all files, commits, comments and logs. Chat with Edd in Spanish.
- Commits: conventional with a scope, imperative, and say _why_ when the why is not obvious —
  `fix(ingest): read a scan through OCR instead of refusing it`.
- Package manager: `pnpm` only.
- Dates in data: `YYYY` or `YYYY-MM` strings. Never `Date`. `null` end date = current.
- Tests live next to what they test in `__tests__/`.

## Commands

**There is one dev environment and it is the container on `:3100`.** `vite dev` used to run alongside
it on 3007; having both was worse than having one. The dev server reaches **no database and no model**
— `/api/processing` answers with an empty body, extraction silently falls back to the rule engine, and
Wording, translation, accounts and encryption-at-rest are all off — so a feature can look finished
there and be broken in the only environment that runs it. It also cannot prove the render path at all
(ADR-005). Do not start a second one.

```bash
docker build -t hunterready:local .   # after any source change…
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d   # …then restart it
```

⚠️ Run `docker build` directly, **not** `pnpm docker:build`. A global pnpm of a different major than
this repo's crashes in its dependency-status check before it runs the script, and prints a stack trace
with exit code 0 — a build that never happened, reported as a success.

```bash
pnpm build && pnpm start    # the only way to trust the WASM render path
pnpm test                   # unit suite, incl. ATS round-trip and the accuracy table
pnpm test:docker            # the same suite WITH system binaries — nothing skips
pnpm test:parity            # builds, boots a server, requests the real routes
pnpm lint                   # eslint

# What the free tier actually produces. Opt-in — ~26 model calls, a minute on Metal, minutes on CPU.
OLLAMA_BASE_URL=http://localhost:11500 pnpm test:measure
```

**The rewrite numbers move between runs, and the thresholds say so.** Four runs of identical code
measured silence (bullets the pass could say nothing about) at 27%, 4%, 15% and 12% — temperature 0.3
over 26 bullets is not a stable number. `rewrite-quality.test.ts` therefore gates on the **aggregate**
with loose ceilings, and only cross-employer drift is held at a hard zero, because since ADR-028 the
guard rejects exactly what the suite counts. Do not tighten a threshold to a single lucky run.

**The local model in Docker on a Mac runs on the CPU, and that is the whole latency story.**
Docker Desktop's Linux VM has no Metal passthrough, so the `llm` container never touches the M-series
GPU. Measured on an M4 Pro, same model (`qwen2.5:3b-instruct`), same prompts:

|                        | container (CPU) | host Ollama (Metal, `100% GPU`) |      |
| ---------------------- | --------------- | ------------------------------- | ---- |
| raw generation         | 17.8 tok/s      | 80 tok/s                        | 4.5× |
| extraction, end to end | 10.9 s          | 2.5 s                           | 4.4× |
| whole-CV translation   | 43.8 s          | 11.0 s                          | 4.0× |

The fix is one line in `docker-compose.local.yml` (gitignored): point `OLLAMA_BASE_URL` at
`http://host.docker.internal:11500`, the brew `ollama serve`. `host.docker.internal` reaches it even
though it binds `127.0.0.1` — Docker Desktop proxies it. The container keeps running and keeps its
config; it is simply not the one answering. Production is untouched: Coolify has no
`docker-compose.local.yml`, and its VPS has no GPU either way.

⚠️ Two traps found while measuring this. **`:11434` on this Mac is a _different_ Docker stack**, not
the brew Ollama — benchmarking it "natively" measures another CPU container and shows no difference at
all. Check with `lsof -nP -iTCP:11434 -sTCP:LISTEN`. And the brew service defaults to a **4096-token
context** while the container sets 16384; the small local-refine schema fits, but raise it before
trusting the host path for anything with a larger prompt.

**vLLM is not the lever here.** Its headline 2–5× is throughput under _concurrent_ load on CUDA —
continuous batching and PagedAttention — while this app deliberately runs one request at a time
(`OLLAMA_NUM_PARALLEL: '1'`, because the box hosts a dozen apps). Apple Silicon GPU support exists
only through the separate `vLLM-Metal` project, and in Docker on a Mac it could only reach the CPU,
i.e. the 17.8 tok/s baseline. The 4× above is the GPU that was already in the machine going unused.

**A `.test.tsx` file is silently ignored.** `vitest.config.ts` includes `src/**/*.test.ts` only, so a
test written with JSX in it never runs and never complains. Use `createElement` in a `.test.ts` file.

**A stale `.output/` shadows the source of truth for fonts.** `FONT_DIRS` prefers
`.output/server/fonts` over `src/render/fonts/files`, so a test can pass or fail against fonts that are
not the ones in the repo. Run `node scripts/copy-assets.mjs` after touching the font bundle.

**Use `pnpm test:docker` before claiming ingestion work is done.** On a bare machine the
LibreOffice (`.doc`) and Tesseract (OCR) suites skip themselves, because those binaries
live in the image and deliberately not on a laptop (ADR-012) — so `pnpm test` reports
green on code it never executed. The `test` stage exists for exactly this: the runtime
image has the tools but no `node_modules`, the build stage has `node_modules` but no
tools. 180 tests in the container, 176 outside it.

Fixture generators (`scripts/make-fixtures.mjs`, `make-interleaved.mjs`,
`make-scanned.mjs`) are documented in [fixtures/input/README.md](fixtures/input/README.md).
Read ADR-016 before touching one: a fixture that is harder than reality wastes days.
