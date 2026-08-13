# Current Spec — HunterReady v0.1

**Created:** 2026-08-13
**Status:** v0.1 complete except the Coolify deploy (needs credentials — owner's call).
**Owner:** Edd

---

## 1. Goal (one sentence)

Ingest an existing CV in `.pdf` / `.docx` / `.doc` / `.txt` / `.md`, extract it into
a canonical structured schema the user can review and correct, and render a
well-designed, **verifiably ATS-parseable** PDF the user can download.

## 2. Why

"Upload CV → pretty PDF" is crowded. The unsolved part is that good-looking CVs are
usually machine-unreadable, and nobody proves otherwise. HunterReady proves it on
every build with an automated round-trip test. That verifier is the product's spine,
so it is built in v0.1 rather than bolted on later.

## 3. Scope

**In:**

- 5 input formats, magic-byte detection, actionable rejections
- Layout-aware text normalization (two-column PDF handling)
- LLM structured extraction → Zod-validated `Resume` + per-field confidence
- Review/edit form with low-confidence fields highlighted
- 2 templates (`modern-intl` + `modern-eu` — both regional conventions, ADR-010) × 3
  themes, rendered via pdfcn + takumi-pdf
- Live preview, download, deployed to Coolify
- Stateless: no persistence, no CV content in logs

**Out (later milestones):**

- AI rewriting, JD tailoring, scoring (v0.3–v0.4)
- Accounts, saved versions (v0.5)
- DOCX export, cover letters, multi-language (v1.0)
- OCR for scanned PDFs (v0.2) — v0.1 detects and explains instead

## 4. Verifier (how we know it's done)

| #   | Check                    | Method                                                                          |
| --- | ------------------------ | ------------------------------------------------------------------------------- |
| 1   | ATS round-trip green     | `pnpm test ats` — render → extract → assert all critical fields + reading order |
| 2   | Extraction accuracy      | field-level diff vs `fixtures/expected/*.json`: ≥95% clean, ≥85% two-column     |
| 3   | Schema integrity         | every fixture passes `Resume.parse()`                                           |
| 4   | End-to-end in production | upload → edit → download at the live URL, < 20 s                                |
| 5   | Privacy                  | deliberate production error → Sentry payload contains no CV content             |
| 6   | Taste                    | Edd would send the output PDF                                                   |

Verifier 1 must itself be verified by breaking it on purpose (Block 5).

## 5. Environment

- Stack: TanStack Start + React 19 + TS + Tailwind v4 + shadcn/ui + pdfcn(Takumi) + Zod + react-hook-form + Vitest
- Path: `~/Projects/eddremonts86/HunterReady/`
- Deploy: Docker → Coolify (Hetzner), per the `coolify-deploy` skill
- Secrets: read `dev-env/env-config/.env` first; never hardcode, never echo
- LLM: Anthropic API — Haiku 4.5 for extraction

## 6. Plan

15 blocks of ≤30 min in [docs/10-plan-v0.1.md](../docs/10-plan-v0.1.md).
**Block 1 is a spike** (takumi-pdf WASM under a production build). If it fails,
apply ADR-005's fallback before continuing — do not build on a broken render path.

## 7. Risks

| Risk                                                 | Mitigation                                                                                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ~~takumi-pdf WASM fails to bundle under Vite/Nitro~~ | **Materialized and fixed 2026-08-13.** The build emitted no WASM and production 500'd; `scripts/copy-wasm.mjs` resolves it, Block 1b guards it. TanStack Start stays (ADR-005) |
| Two-column PDF extraction is unreliable              | Block 7 normalizer with column detection; measured per fixture, not assumed                                                                                                    |
| pdfcn license unknown                                | Confirm in Block 1; blast radius bounded — takumi-pdf underneath is a normal npm package                                                                                       |
| Ingestion eats the whole timebox                     | It is the hard part by design; Phase B ships a working render path independently                                                                                               |
| `.doc` support inflates the image ~450 MB            | ADR-008; instrument the `.doc` share and revisit with data                                                                                                                     |

## 8. Definition of archive

When all 6 verifier checks pass, move this file to
`ai-os/archive/2026-XX-XX-hunterready-v0.1.md` with a one-line summary and reset
`specs/current_spec.md` to the no-active-Spec template.
