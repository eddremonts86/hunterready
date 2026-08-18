# 03 — Name and domain

- **Date:** 2026-08-18 · **Status:** draft · **Blocks:** 3 · **Author:** Edd

## Objective

Establish that "HunterReady" is available and defensible as a name and a domain, or choose another
before anything is printed on an invoice.

## Context

docs/09 question 8. Availability across `.dev` / `.app` / `.com` and trademark were never checked, and
this was always marked "needed by v1.0". Production runs on
`hunterready.eduardoinerarte.dk`, a personal subdomain, which is fine for a beta and is not a name.

It is cheap now and gets more expensive with every month of use: the name is in the wordmark, the
footer, the email address, the PDF filenames, the OG cards, and eventually on a receipt. A rename
after payments open touches all of those plus the thing customers recognise.

## Acceptance criteria

- [ ] A written answer on availability for `.com`, `.dev` and `.app`, with prices.
- [ ] A trademark search recorded for the relevant classes in DK/EU, with the date.
- [ ] Either the domain is bought, or a replacement name is chosen and the same checks pass for it.

## Non-goals

- A rebrand. The visual identity is settled (DESIGN.md); this is the name and the address.
- Registering a trademark. Knowing whether one is blocked is the question here.

## Plan

### Block 1: availability (20 min)

- [ ] Check `hunterready` on `.com`, `.dev`, `.app`, and `.dk` given the market. Record prices.
- [ ] **Verify:** the answer is a list with prices and dates, not an impression.

### Block 2: trademark (30 min)

- [ ] Search EUIPO and the Danish register for "HunterReady" and near neighbours in the software and
      recruitment classes.
- [ ] **Verify:** a recorded search with the register, the classes and the date. A clean search that
      nobody can date is not evidence.

### Block 3: decide and buy (20 min)

- [ ] Buy the domain, or choose a replacement and repeat blocks 1 and 2 for it.
- [ ] **Verify:** DNS resolves and the certificate issues.

## Risks

| Risk                                              | Probability | Impact | Mitigation                                                 |
| ------------------------------------------------- | ----------- | ------ | ---------------------------------------------------------- |
| The name is taken in a class that matters         | low         | high   | Doing this before invoices is the mitigation               |
| A rename lands after users know the old one       | low         | high   | Same. This item exists to make that impossible             |
| Buying the domain but not migrating, so both live | med         | low    | Block 3 finishes at a resolving certificate, not a receipt |

## Verification (end-to-end)

The chosen domain serves the app over HTTPS and the trademark search is on file with its date.
