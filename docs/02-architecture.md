# 02 — Architecture

## Core constraint that drives everything

`takumi-pdf` (the renderer under pdfcn) is a **WASM module that runs in a server
runtime** — Node.js, Bun, or Cloudflare Workers. PDF generation therefore cannot
happen in a static SPA. The app needs a server. That single fact decides the stack.

## Data flow

```
                      ┌──────────────── browser ─────────────────┐
  file (pdf/docx/     │  1. Dropzone                             │
  doc/txt/md)  ──────▶│  4. Review + edit form (react-hook-form) │
                      │  5. Preview  ──▶  6. Download            │
                      └───────┬──────────────────┬───────────────┘
                              │ multipart        │ Resume JSON
                              ▼                  ▼
                      ┌──────────────── server ──────────────────┐
                      │  2. ingest/                              │
                      │     detect type → extract raw text       │
                      │     (+ layout hints)                     │
                      │            │                             │
                      │            ▼                             │
                      │  3. structure/                           │
                      │     LLM → Resume JSON → Zod validate     │
                      │     → confidence sidecar                 │
                      │            │                             │
                      │            ▼                             │
                      │  7. render/                              │
                      │     Resume + template + theme            │
                      │     → pdfcn components → takumi-pdf      │
                      │     → Uint8Array                         │
                      └──────────────────────────────────────────┘
```

Steps 2, 3 and 7 are pure functions over serializable input. That is deliberate:
each is independently testable, and each can later move to a queue or a separate
service without touching the others.

## Module boundaries

```
src/
├── routes/                    # TanStack Start file-based routes
│   ├── index.tsx              # upload
│   ├── review.$sessionId.tsx  # edit + preview  ← has a surface brief
│   └── api/
│       ├── ingest.tsx         # POST file  → { resume, provenance }
│       ├── render.tsx         # POST resume → application/pdf
│       └── pdf/smoke.tsx      # Block 1 spike; delete once render.ts lands
├── ingest/
│   ├── detect.ts              # magic-byte + extension sniffing
│   ├── adapters/
│   │   ├── pdf.ts             # unpdf / pdfjs text layer
│   │   ├── docx.ts            # mammoth → semantic HTML
│   │   ├── doc.ts             # LibreOffice headless → docx → docx.ts
│   │   └── text.ts            # txt / md passthrough
│   └── index.ts               # detect → adapter → RawDocument
├── structure/
│   ├── prompt.ts              # extraction prompt (versioned)
│   ├── extract.ts             # LLM call → Zod parse → repair loop
│   └── heuristics.ts          # date normalization, dedupe, ordering
├── schema/
│   ├── resume.ts              # ⭐ canonical Zod schema — the contract
│   └── provenance.ts          # per-field confidence sidecar
├── render/
│   ├── templates/
│   │   ├── modern-ats.tsx     # v0.1 template
│   │   └── registry.ts        # id → component + metadata + ats rating
│   ├── themes/                # hex token sets (see 05-pdf-rendering.md)
│   └── render.ts              # (resume, templateId, themeId) → Uint8Array
├── components/
│   ├── pdf/                   # ⚠️ pdfcn-owned, installed via shadcn CLI
│   └── ui/                    # ⚠️ shadcn-owned
└── lib/
```

**Rule:** `components/pdf/` and `components/ui/` are vendored copy-paste code.
Do not refactor them by hand — that breaks the ability to diff against upstream.
Wrap them in `render/templates/` instead.

## Why the schema sits in the middle

`schema/resume.ts` is the only thing four modules agree on. Consequences:

- The ingestion pipeline can be rewritten (better parser, different LLM) without
  touching templates.
- New templates are pure functions `Resume → JSX`. Adding one is a contained task.
- The AI optimizer operates on structured data, not on prose, so it can target a
  single bullet without re-emitting the document.
- Fixtures are just JSON. Snapshot testing becomes trivial.

Get this wrong and every future feature pays for it. See [03-resume-schema.md](03-resume-schema.md).

**API routes are file routes.** TanStack Start has no separate API directory: a route
file exports `createFileRoute('/api/x')({ server: { handlers: { GET, POST } } })` and
returns a normal `Response`. They are `.tsx` because the render handlers contain JSX.
Import `takumi-pdf` _inside_ the handler (`await import('takumi-pdf')`) so the 3.7 MB
WASM never reaches the client graph.

**Verified versions** (scaffolded 2026-08-13): React 19.2, Vite 8.2, Nitro 3 beta,
Tailwind 4.3, TypeScript 6.0, Node 26 local.

## Deployment

Docker image → Coolify on Hetzner (existing setup, see the `coolify-deploy` and
`pnpm-docker-deploy` skills in AI-OS).

- Node 22 slim base.
- `takumi-pdf` needs no Chromium — the image stays small (~200 MB) and cold start
  is fast. This is the main practical win over a Puppeteer/`html-pdf` approach.
- **The WASM must be copied into the server output.** `pnpm build` runs
  `scripts/copy-assets.mjs`, which places `takumi_pdf_wasm_bg.wasm` at
  `.output/server/pkg/`. Rollup does not emit it, and without it the built server 500s
  on the first render while `vite dev` works fine (ADR-005 spike, Block 1). This is why
  the image can ship `.output/` alone with no `node_modules`.
- Fonts: bundle the WOFF2 files into the image rather than fetching Google Fonts
  at request time. Deterministic output, no network dependency in the render path.
- `.doc` support requires `libreoffice-core` in the image (+~450 MB). See the
  decision in [09-decisions.md](09-decisions.md).

## State

v0.1 holds nothing. The parsed `Resume` object lives in the browser (and in a
short-lived signed session blob if the payload is too large for a form post).
No database, no object storage, no logs containing CV content.

Persistence arrives in v0.5 with Convex, at which point retention policy and
consent copy must ship in the same release — not after.

## Observability

- Structured logs with a `requestId`, **never** CV content or extracted fields.
- Metrics that matter: ingestion success rate by file type, mean fields corrected
  by the user per document (this is the parser's real quality signal), render
  duration p95, ATS round-trip pass rate.
