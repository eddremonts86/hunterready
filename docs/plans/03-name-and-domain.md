# 03 — Name and domain

- **Date:** 2026-08-18 · **Status:** draft · **Blocks:** 3 · **Author:** Edd

> **2026-08-19: block 1 done, and the deadline moved.**
>
> `hunterready` is **free on all seven** TLDs checked — `.com` `.dev` `.app` `.dk` `.io` `.co` `.net`
> — and each method was controlled against a domain that is certainly registered, because the first
> one lied: RDAP returns 404 for `eduardoinerarte.dk`, which is Edd's live production host. `.dk`
> came from DK Hostmaster's own whois, `.io`/`.co` from whois, `.dev`/`.app` from RDAP with `web.dev`
> and `web.app` as the control. Porkbun, where `builderhunt.dev` already lives: `.dev` $8.75 first
> year, $12.87 renewal.
>
> **Block 2 is deliberately not done, and the reason is a decision rather than a blocker.** Edd is
> not sure `HunterReady` survives beta, and paying to clear a name you may drop is spending on the
> answer to a question you might never ask.
>
> ⚠️ **But this item said "needed by v1.0", and that is the wrong trigger.** The moment a trademark
> collision stops being cheap is the moment **somebody pays** — the name goes on an invoice, on a
> payment-provider account, and on a card statement, and renaming stops being a find-and-replace and
> becomes a communication to people who gave you money. Measured today, a rename costs 20 occurrences
> across 7 files, **all documentation and none in `src/`**. After the first payment it costs that
> plus everything spent building recognition, which is why the cost grows with how well it goes.
>
> **So the trademark search is now a precondition of [plan 01](01-pricing-and-payments.md), not of
> v1.0**, and the name has to be decided before pricing opens rather than "after beta" — those are
> the same moment, and doing them in that order means either renaming a paid product or delaying the
> checkout.

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
