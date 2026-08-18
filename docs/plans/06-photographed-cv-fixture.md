# 06 — A photographed CV fixture

- **Date:** 2026-08-18 · **Status:** draft (blocked on a real photo) · **Blocks:** 3 · **Author:** Edd

## Objective

Get one genuinely photographed CV — perspective skew, uneven light, a shadow — and find out what OCR
does with it.

## Context

A missing input. `scanned.pdf` is a clean rasterisation: straight, evenly lit, no shadow, no phone
camera. It proves the OCR path is wired, and it cannot fake any of the things that make a photo hard.

This matters more than it sounds for this product's audience. "All sectors" includes people whose only
copy of their CV is a printed page, and the phone in their hand is the scanner. That path either works
or it quietly returns nonsense, and the product currently tells them it was a scan and to double-check
— which is the right behaviour and untested against a real photo.

**Needs the container.** Tesseract lives in the image and deliberately not on a laptop (ADR-012), so
this is `pnpm test:docker`, not `pnpm test`.

## Acceptance criteria

- [ ] One photographed CV in `fixtures/input/`, taken with a phone, not scanned.
- [ ] The accuracy table prints for it under `pnpm test:docker`, and the score is recorded here.
- [ ] The interface's "this was a scan" warning is confirmed to appear for it.

## Non-goals

- Deskewing or preprocessing. Find out what happens first; a correction built before the measurement
  is a guess.
- A set of photos. One real one teaches more than five synthetic ones.

## Plan

### Block 1: take one (20 min, Edd)

- [ ] Print a synthetic CV, photograph it at an angle, indoors, with a visible shadow.
- [ ] **Verify:** it is skewed and unevenly lit. A flat, bright photo is `scanned.pdf` again.

### Block 2: run it through the container (30 min)

- [ ] Add it to `fixtures/input/` with its expected result.
- [ ] `pnpm test:docker` and read the table.
- [ ] **Verify:** the table prints. If OCR returns nothing usable, that is the finding.

### Block 3: confirm the honest warning (20 min)

- [ ] Upload it in the browser against the container and confirm the scan warning appears.
- [ ] **Verify:** screenshot it. This is the surface that tells somebody to check the result, so it
      failing silently would be worse than the OCR being poor.

## Risks

| Risk                                          | Probability | Impact | Mitigation                                                |
| --------------------------------------------- | ----------- | ------ | --------------------------------------------------------- |
| OCR returns unusable text and the item stalls | med         | med    | That is a result. Record it and decide separately         |
| The fixture is harder than any real photo     | med         | med    | ADR-016. One ordinary photo, not a worst case             |
| Skipped locally and looks green               | high        | high   | `pnpm test` skips OCR silently; only `test:docker` counts |

## Verification (end-to-end)

`pnpm test:docker` prints the table for the photograph, and the browser shows the scan warning for it.
