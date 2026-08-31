# HunterReady

Turn any existing CV (`.pdf`, `.docx`, `.doc`, `.txt`, `.md`) into a well-designed,
**verifiably ATS-safe** PDF — then optimize it against a specific job description.

**Status: v0.2 substantially done.** v0.1 is complete (every block of
[docs/10-plan-v0.1.md](docs/10-plan-v0.1.md) except the Coolify deploy, which needs credentials).
v0.2 was driven by two real CVs and then by its own measurements rather than by a feature list — see
ADR-015 through ADR-017 and [docs/08-roadmap.md](docs/08-roadmap.md).

**180 tests green in the container** (`pnpm test:docker`, nothing skipped), 176 on a bare machine,
plus 6 production-parity tests; lint and typecheck clean. `accuracy-report.txt` records extraction
quality per fixture: **100% on all eight**, under a scorer that was corrected first — the previous
92%/96% headline was flattering us, and had been hiding a candidate's job title welded onto their name
(ADR-016). A scanned or photographed CV now goes through OCR and says so (ADR-017).

Created 2026-08-13.

---

## The one-line thesis

Most CV tools are either _pretty but unparseable_ or _parseable but ugly_.
HunterReady renders vector PDFs with real selectable text from a canonical
structured schema, and **proves** on every build that a machine can read the
result back out.

## What it does (v0.1)

```
upload CV → extract to structured JSON → user reviews/fixes → render styled PDF → download
```

Stateless by default: nothing about the user's CV is persisted. See
[docs/07-privacy.md](docs/07-privacy.md).

## Quickstart

```bash
pnpm install
node scripts/bundle-fonts.mjs   # once: copies the bundled OFL faces into src/render/fonts/files
pnpm dev
```

Dev server runs at http://localhost:3000.

**Extraction needs a model provider.** Put one in `.env` (gitignored):

```bash
DEEPSEEK_API_KEY=...       # or ANTHROPIC_API_KEY, or HUNTERREADY_LLM_TOKEN + _BASE_URL + _MODEL
```

Without one the app still works: it falls back to rule-based extraction, reports lower confidence,
and sends nothing to a third party. See `src/structure/provider.ts` for the resolution order.

### Docker — the real runtime

Every system dependency lives in the image, nothing is expected from the host (ADR-012):

```bash
pnpm docker:build
docker run --rm -p 3100:3000 -e DEEPSEEK_API_KEY=... hunterready:local
```

**Never trust `pnpm dev` or a green `pnpm build` for the render path.** The WASM
renderer resolves differently in the Nitro build, so verify with:

```bash
pnpm build && pnpm start
```

## Documentation map

Product and design truth live at the root; engineering detail lives in `docs/`.

| Doc                                                        | What's in it                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| [PRODUCT.md](PRODUCT.md)                                   | Durable product truth — users, purpose, positioning, constraints         |
| [DESIGN.md](DESIGN.md)                                     | The visual world ("The Print Room") — palette, type, layout, named rules |
| [.impeccable/surfaces/](.impeccable/surfaces/)             | Per-surface briefs, incl. the review screen's direction contract         |
| [docs/01-vision-and-scope.md](docs/01-vision-and-scope.md) | Problem, competition, what we refuse to build                            |
| [docs/02-architecture.md](docs/02-architecture.md)         | Stack, data flow, module boundaries, deployment                          |
| [docs/03-resume-schema.md](docs/03-resume-schema.md)       | The canonical Zod contract every module speaks                           |
| [docs/04-ingestion.md](docs/04-ingestion.md)               | `.pdf`/`.docx`/`.doc`/`.txt` → schema, incl. failure modes               |
| [docs/05-pdf-rendering.md](docs/05-pdf-rendering.md)       | pdfcn + takumi-pdf research, templates, ATS ruleset                      |
| [docs/06-ai-optimization.md](docs/06-ai-optimization.md)   | Bullet rewriting, JD tailoring, scoring, anti-fabrication                |
| [docs/07-privacy.md](docs/07-privacy.md)                   | PII, GDPR, retention, LLM data flow, consent                             |
| [docs/08-roadmap.md](docs/08-roadmap.md)                   | v0.1 → v1.0 milestones                                                   |
| [docs/09-decisions.md](docs/09-decisions.md)               | ADR log + open questions                                                 |
| [docs/10-plan-v0.1.md](docs/10-plan-v0.1.md)               | Block-by-block execution plan with verifiers                             |
| [docs/11-flow.md](docs/11-flow.md)                         | The complete user flow, and what we refuse to copy                       |
| [specs/current_spec.md](specs/current_spec.md)             | Active AI-OS Spec for v0.1                                               |

## Stack

TanStack Start (Vite 8 + Nitro 3) · React 19 · TypeScript 6 · Tailwind 4 ·
shadcn/ui · **pdfcn** components on the **takumi-pdf** renderer · Zod ·
react-hook-form · Vitest · Docker → Coolify.

Scaffolded with `@tanstack/cli create --framework react --deployment nitro`.
Rationale and the Next.js fallback: [docs/09-decisions.md](docs/09-decisions.md).

## Scripts

| Command                          | What it does                                                            |
| -------------------------------- | ----------------------------------------------------------------------- |
| `pnpm dev`                       | Vite dev server on :3000                                                |
| `pnpm build`                     | Vite build **+ copies the takumi WASM into `.output/server/pkg/`**      |
| `pnpm start`                     | Runs the built Nitro server (`.output/server/index.mjs`)                |
| `pnpm test`                      | Fast unit tests (schema, provenance, fixtures)                          |
| `pnpm test:parity`               | Builds, boots the real server, demands a real PDF back                  |
| `pnpm test accuracy`             | Field-level extraction scores per fixture → `accuracy-report.txt`       |
| `pnpm lint` / `pnpm format`      | ESLint / Prettier                                                       |
| `node scripts/make-fixtures.mjs` | Regenerates the synthetic input fixtures                                |
| `node scripts/bundle-fonts.mjs`  | Copies the bundled OFL faces out of node_modules                        |
| `pnpm docker:build`              | Builds the production image (LibreOffice, fonts, WASM, no node_modules) |

`NODE_ENV=production` matters for the build: with anything else, Vite emits the dev JSX
transform and every SSR render dies on `jsxDEV is not a function`. The Dockerfile must
set it.
