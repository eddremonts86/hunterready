# 11 — The Complete Flow

Written 2026-08-13 after studying a 20-step onboarding flow (JobAssist) Edd supplied as
reference. This document takes its **mechanics**, refuses its **premise**, and refuses its
**look**. All three decisions are argued below, because copying any of them by accident
would cost us the product.

---

## What the reference gets right, and we take

| Mechanic                                                                                                                  | Why it matters _for our audience specifically_                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **One question per screen**                                                                                               | PRODUCT.md says the review step must be usable by someone who has never filled a 40-field form. This is the answer to that requirement. A dense form is the single most likely reason a nurse abandons us.                                                                                                                                                                                                                |
| **Progress counter + bar** (`7/20`)                                                                                       | Sets an expectation and lets people decide to continue. Unknown-length flows get abandoned. **Taken as the "N to check" figure on the review form, not as a station counter** — the `n/3` rail we built for Upload → Check → Download was removed once it was obvious no screen was ever step 3, so it read "2 of 3" forever on the screen where the work was done. A counter earns its place by counting something real. |
| **Back arrow on every screen**                                                                                            | Already an invariant for us: every station re-enterable, nothing irreversible, no warnings (DESIGN.md's Test Strip Rule). The reference confirms the pattern is expected.                                                                                                                                                                                                                                                 |
| **Interstitial reassurance screens** between question clusters                                                            | Pacing. A 20-step flow survives because roughly every fourth screen explains rather than asks. Cheap, and it converts dread into momentum.                                                                                                                                                                                                                                                                                |
| **Large single-column tap targets**                                                                                       | The real usage scene: a phone, at night, tired.                                                                                                                                                                                                                                                                                                                                                                           |
| **Helper hints under the input** — _"Specific titles get better matches. 'Project Manager' works better than 'Manager'."_ | Teaching in context, in plain language, at the moment of the decision. Exactly the register our audience needs, and the opposite of a tooltip glossary.                                                                                                                                                                                                                                                                   |
| **Chips + suggested additions**                                                                                           | Perfect for the skills step: extracted skills as removable chips. **With one hard limit** — see the fabrication note below.                                                                                                                                                                                                                                                                                               |
| **A distribution behind a single choice** (the salary histogram)                                                          | Honest data as decision context rather than a number with no scale. Our version of this is the parse tally and the page-fit indicator.                                                                                                                                                                                                                                                                                    |
| **An explicit escape hatch** (_"I'm open to any industry"_)                                                               | Every constrained question needs the "none of these" door, or people lie to the form.                                                                                                                                                                                                                                                                                                                                     |
| **Encouraging state copy** (_"Great start — add a few more cities…"_)                                                     | Warmth without gamification. No confetti, no streaks.                                                                                                                                                                                                                                                                                                                                                                     |

### The chips caveat

The reference suggests _new job titles_ to add. We may suggest **phrasings of what the
candidate already has** — never a skill they did not claim. Suggesting "Backend Engineer" to
someone who wrote "Software Developer" is a synonym. Suggesting "Kubernetes" because their
sector often uses it is fabrication, and it is the thing that gets a candidate humiliated in
an interview. See [06-ai-optimization.md](06-ai-optimization.md).

---

## What we refuse, and why

**1. Twenty questions before any value.** This is the big one.

The reference can demand 20 steps because it sells the automation of drudgery — the value is
invisible until the robot starts applying, so it has to be promised. We sell **a document the
user can look at**. Our value is visible in fifteen seconds.

So we invert the order: **artifact first, questions later, and only the questions the
document itself raises.**

Twenty screens before a single visible result would be our worst possible funnel, and for a
stressed job seeker at 22:40 it is an insult: they came with a file and a fear, and we would
answer with a survey.

**2. Fabricated social proof.** The reference lands seven stock-avatar faces, _"Used by job
seekers around the world"_, and the Netflix / Spotify / Dropbox / Meta logos under a
`Start Now` button. Those logos almost certainly mean _"users have applied to these
companies"_, not _"these companies use this"_ — and the avatars are stock.

PRODUCT.md's Evidence section is explicit: no testimonials, no case studies, no logos, no
usage numbers, and none of it may be invented. We have exactly one proof point and it is
real: **the round-trip test.** Show the extracted text next to the rendered CV and let people
see that every field survived. That is stronger than a logo wall because it is checkable.

**3. Auto-apply, job matching, and "let AI handle your job search".** In our explicit
non-goals ([01-vision-and-scope.md](01-vision-and-scope.md)). Different product, different
risk, and mass auto-application is what gets candidates blocked by the very ATS portals we
are trying to help them survive.

**4. Questions that serve us instead of the user.** _"Have you used AI job tools before?"_
changes nothing about the output. Our rule: **if an answer does not change the document or
the advice, we do not ask it.**

**5. The look.** Royal blue on white, geometric sans, pill buttons, rounded cards, soft
blue-tinted illustrations of floating documents. This is — precisely and literally — the
category default I named and rejected when choosing the visual world: _"the friendly SaaS
resume builder — soft indigo, rounded cards, illustration of a person holding a document."_

Adopting it would discard the Print Room world for the exact thing the world exists to
refuse. The mechanics transfer; the skin does not. Every screen below is rendered in
safelight amber on print black, with the document under white light
([DESIGN.md](../DESIGN.md)).

---

## The flow

```
  LAND ─▶ LOAD ─▶ DEVELOP ─▶ CHECK ─▶ INSPECT ─▶ PRINT ─▶ [IMPROVE] ─▶ [TAILOR]
   0        1        2         3         4         5          v0.3        v0.4
                              ▲                   │
                              └─── re-enterable ──┘
```

Station names are the darkroom's, and they are the nav (DESIGN.md, Layout).

### 0 · Land — _Persuade_ (v1.0)

One screen, one job: make the mechanism intelligible and get the file.

- The claim, in one line, in plain language — no "ATS" unexplained.
- **The proof, demonstrated not asserted:** a real CV next to the real text a parser read
  back out of it, every field accounted for. This is the only social proof we have and it
  cannot be faked.
- The dropzone, above the fold.
- The privacy line: we do not store your CV. True as long as v0.1's design holds.
- No logo wall. No avatars. No numbers we cannot substantiate.

### 1 · Load — one screen

Drop or pick a file. `.pdf` `.docx` `.doc` `.txt` `.md`, stated plainly with sizes.
The one-sentence LLM consent line, naming the provider ([07-privacy.md](07-privacy.md)).
Nothing else on the screen.

### 2 · Develop — automatic, ~10–20s

The reference would show a spinner. We name the stations, because the darkroom's own
grammar is a sequence of named baths and because a named step that takes 8 seconds feels
shorter than an anonymous one that takes 4:

> reading the file → finding the sections → pulling out your history → checking what a
> machine can read

The last one is the differentiator, running in front of the user. If the file is a scanned
image, this is where we say so, in plain words, with a way forward.

### 3 · Check — **one question per screen, and this is where the reference earns its place**

Here is the difference that matters: **we do not invent the questions. The parse does.**

Every step in this phase is generated from something the extraction was unsure about —
`confidence < 0.7` or `inferred` in the provenance sidecar
([03-resume-schema.md](03-resume-schema.md)). Consequences:

- **The length is proportional to the mess in their file.** A clean single-column PDF might
  produce two screens. A ten-year-old Word table might produce nine. A fixed 20 is a
  fixed insult to the person who brought a clean file.
- **Every question is earned.** We can always answer "why are you asking me this?" — because
  we could not read it confidently, and here is the source line we got it from.
- **The counter is honest**: `3 of 6 to check`, not a fake 20.

Screen anatomy: the field group, large; the extracted value pre-filled and editable; the
source line from the original document, quoted, so the user is checking our work rather than
retyping their life; `Looks right` as the primary action, editing as the secondary.

Order: identity and contact first (a wrong email is fatal, and it is the cheapest fix), then
employment history, then education, then skills, then the long tail.

A `Skip to the end and just show me the CV` door on every screen. Some people want the
document now and will fix things in the inspection view. Refusing them is paternalistic.

### 4 · Inspect — built (Block 4)

The bench and the white-light inspection window. Template and theme as test strips.
The parse tally with real numbers from the round-trip check. Page-fit warning.
This screen is already live at `/`.

### 5 · Print

Download. Filename `Firstname-Lastname-CV.pdf`, diacritics stripped.
DOCX export lands here in v1.0 — many portals require it.

### 6 · Improve — v0.3

**The one-question-per-screen mechanic reaches its best use here, not in onboarding.**

Bullet rewriting produces a `questions` array — _"How many people were on that shift?"_,
_"Over what period?"_ — precisely because the model is forbidden from inventing the number
([06-ai-optimization.md](06-ai-optimization.md)). Each of those is one screen, one question,
one big input, skippable.

That is the same pattern the reference uses to collect _its_ preferences, pointed at
something only we can ask: the metric that turns a weak bullet into a strong true one. The
candidate's answer becomes their own evidence. Nothing is invented, and the flow feels like
being interviewed by someone competent rather than processed by a form.

### 7 · Tailor — v0.4

Paste a job posting → matched / weak-evidence / missing report → a variant.
Gaps are shown as gaps. We never close one by inventing a skill.

---

## Rules the flow obeys

1. **Value before questions.** The user sees a rendered CV before we ask anything optional.
2. **Every question is earned** — by low confidence, or by a rewrite that needs a real
   number. If the answer changes nothing, it is not asked.
3. **One decision per screen** in Check and Improve.
4. **Every station re-enterable**, forwards and backwards, always, without warnings.
5. **Honest counters.** Progress reflects real remaining work, never a padded total.
6. **A skip door on every optional screen.**
7. **No invented proof, no invented metrics, no invented skills** — anywhere, ever.
8. **Plain language.** "ATS" never appears without being explained in the same breath.

## Open

- Where the account gate lands (v0.5). Current instinct: after the first download, never
  before — the artifact is the argument for signing up.
- Whether Check runs before or after the first render. Instinct: render immediately with the
  uncertain fields marked _in the document_, then offer to check them. That way the artifact
  arrives first and the questions are visibly about improving something real.
