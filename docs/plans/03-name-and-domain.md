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

### Block 2, searched 2026-08-23 — clean on the exact name, and the residual risk is `Hunter` itself

- [x] Search EUIPO and the Danish register for "HunterReady" and near neighbours in the software and
      recruitment classes.
- [x] **Verify:** recorded below with the register, the query, the classes and the date.
- [ ] **The official Danish register is still unsearched, and it is the one gap.** See below.

**This is a search, not a legal opinion**, exactly as this plan said before it was run. It establishes
that the exact name is unoccupied. It does not establish that the name is defensible, because the
question a lawyer would ask is not about `HunterReady` — it is about confusing similarity to `Hunter`,
and the numbers below are the size of that question rather than an answer to it.

#### EUIPO — eSearch plus, the official EU register · 2026-08-23

| query                                                                  | result                                                    |
| ---------------------------------------------------------------------- | --------------------------------------------------------- |
| Basic search, all tabs: `HunterReady`                                  | **0 trade marks, 0 designs, 0 owners, 0 representatives** |
| Advanced: mark name **contains** `HunterReady`                         | **no results**                                            |
| _Control_: mark name **contains** `Hunter`                             | **802**                                                   |
| Mark name contains `Hunter`, Nice class **9** (software)               | **333**                                                   |
| Mark name contains `Hunter`, Nice class **42** (SaaS, software design) | **137**                                                   |

The control is the point. A zero from a search nobody has proved can return a number is worth nothing —
the same reasoning as checking domain availability against a domain that is certainly registered. 802
also matches what the basic search reports across its trade-mark tab, from a different code path.

**The basic search matches substrings**, which makes the zero stronger than an exact-match zero would
be: querying `Hunter` returns `HunterDouglas` and `DERBI-HUNTER`, so nothing anywhere in the register
contains the string `HunterReady`.

Reproducible URLs, which is what makes this evidence rather than an assertion:

```
https://euipo.europa.eu/eSearch/#basic/1+1+1+1/100+100+100+100/HunterReady
https://euipo.europa.eu/eSearch/#advanced/trademarks/1/100/n1=MarkVerbalElementText&v1=Hunter&o1=AND&c1=CONTAINS&n2=GoodsServicesClassNumber&v2=9&o2=AND&sf=ApplicationNumber&so=asc
```

⚠️ **Changing the hash does not re-run the search** — the page keeps showing the previous result, which
is how a stale zero can be mistaken for an answer. Paste the URL and **reload**, then check that the
form fields actually hold the values before believing the count. This cost one wrong reading during
this search: `Hunter*` appeared to return 0, which was the previous query's zero still on screen, not a
statement about wildcards.

#### Denmark — the official register was **not** searched, and this is deliberate

DKPTO's PVSonline (<https://onlineweb.dkpto.dk/pvsonline/Varemaerke>) puts a **reCAPTCHA on the search
form**. That is the site asking for a human, and defeating it to obtain a legal fact would produce a
record worth less than no record — so the form was filled and left unsubmitted. Two things worth
keeping from having got that far:

- Its trademark data was current to **2026-08-21**, so it is not a stale register.
- It states that it **excludes EU trade marks** by design. So DKPTO and EUIPO are genuinely two
  searches, not one with a fallback.

**What ten minutes of Edd's time closes:** open that URL, tick both `DKvaremærke` and `MPvaremærke`
(they default on), set `Mærketekst` to `Indeholder` + `HunterReady`, solve the check, press `Søg`.
Then again with `Hunter` and `Klasse (Nice)` 9, and once more with 42.

#### TMview — the EUIPN's own federated tool, as a cross-check · 2026-08-23

<https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=Hunter>

| query                                                  | result     |
| ------------------------------------------------------ | ---------- |
| `HunterReady`, all offices (142.4 M marks, 83 offices) | **0 rows** |
| _Control_: `Hunter`, all offices                       | **19,133** |
| ⤷ of which **Dinamarca – DKPTO**                       | **59**     |
| ⤷ of which EUIPO                                       | 704        |
| ⤷ Germany 463 · Sweden 105 · Norway 69                 | context    |

**TMview says of itself that it is not an official register and has no legal effect**, and the numbers
show why that matters: its EUIPO slice is **704** where EUIPO's own register says **802**, about 12%
short. So the Danish zero above is real but weaker evidence than the EUIPO zero, and it does not
replace the official search.

#### What this leaves

- **The exact name is free** in the EU register and in every office TMview federates. That was the
  question blocking plan 01, and on the exact name it is answered.
- **The residual risk is `Hunter`**, with 333 marks in class 9 and 137 in class 42 at EUIPO alone. None
  of the ones surfaced in passing is in this market — `Hunter Douglas` (blinds), `Hunter Fan Company`,
  `Hunter Boots`, `DERBI-HUNTER` — but 470 marks is not a list to eyeball, and whether a coined compound
  ending in a common English word is confusingly similar to that family is a judgement, not a query.
- **One official register is unsearched**, and it is Edd's ten minutes.

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
