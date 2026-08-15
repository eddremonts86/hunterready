# 12 — The competition, and what is worth taking from it

**Reviewed 2026-08-15**, in the browser, on the live sites. Nothing here is from memory or from a
press release: every claim is quoted from a page I loaded, and where I could not verify something I
say so.

Read this with [PRODUCT.md](../PRODUCT.md) open. The point is not to become any of these products.
Three of them are better funded than this one and all three are chasing the same customer with the
same promise; the only durable position is the one they cannot copy without changing what they are.

---

## Who is out there

|                                 | What they sell                                                                    | Where they are strong                        | Where they are exposed                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **JobAssist** (`jobassist.com`) | Auto-apply: matched jobs, tailored CV and letter, form filled and submitted       | Conversion craft. The funnel is the product. | Volume over truth; €9.99 → €39.99/month renewal; no verifiable claim anywhere                         |
| **Jobscan** (`jobscan.co`)      | "Optimize your resume for the **exact** ATS" — match score against a named system | Owns the ATS anxiety, and teaches it         | Score is keyword overlap, not readability; the resume still has to parse                              |
| **Enhancv** (`enhancv.com`)     | Beautiful ATS-friendly templates + AI writer + one-click tailoring                | Design breadth, 11 years of trust signals    | "We test every template against the major ATS" — a claim about **templates**, never about _your_ file |

### What all three do that we do not

1. **A header that works.** Logo, three or four section links, `Log in` and a filled `Sign up`
   pill. Every one of them. Ours hid signing in behind a tab that only exists after an upload —
   fixed today, and it should never have shipped that way.
2. **One promise, one primary action, above the fold.** Then the same action repeated after every
   proof section. No page has two competing primaries.
3. **Proof next to the promise.** A rating, a count, a logo wall — placed inside the hero, not in a
   testimonials section a thousand pixels down.
4. **A pricing page that answers "what will you charge me and when".** Jobscan's free tier is real
   and permanent (5 scans a month). JobAssist's is a trial that becomes €39.99/month, disclosed in
   small print under each plan.
5. **An FAQ that is really the objection-handling.** "Will employers know it was AI?" "How do I
   cancel?" "Is my data safe?" These are the three fears; each of them answers all three.

---

## The onboarding, walked

**JobAssist** — the whole funnel before an account:

```
/ (landing) → "Start Applying" → /quiz
  1/20  "What's your current employment status?"   4 choice cards, one tap
  2/20  "Better roles exist. We'll find them."     a reassurance slide, one button
  …20 steps of alternating question / reassurance…
  → upload CV → results → paywall
```

The shape is deliberate and it is worth understanding rather than dismissing. **No account, no
price, no form fields for twenty screens.** One decision per screen, each with a subtitle saying why
it is being asked ("This helps us match you with the right opportunities"), a back arrow, and a
counter. By the time money is mentioned the visitor has invested twenty small yeses.

**What I will not copy:** length for its own sake, and a "quiz" that is mostly commitment
manufacturing. Twenty screens to reach a paywall is a toll booth with a personality.

**What is worth copying, and already fits our grain:** one decision per screen, each with its
reason under it, a visible position ("3 of 6"), and a back arrow that always works. ADR-011 already
calls for exactly this for the Check flow, generated from provenance rather than from a script — so
the questions would be _about the person's own CV_, which is a better version of the same idea: every
answer improves their document instead of profiling them.

---

## Our position, stated honestly

Everyone in this table says "ATS-friendly". Enhancv's wording is the most careful and it is still
about the **template**: _"We test every Enhancv template against the major Applicant Tracking
Systems."_ Jobscan scores keyword overlap against a job posting.

HunterReady does the thing none of them does: **it takes the file it just produced, parses it back
with an independent parser, and shows you the result.** That is `pnpm test ats`, the round-trip, and
the "Parse verified" badge in the workspace. It is a claim about **your document**, not about a
template family, and it can be demonstrated on screen in about four seconds.

Second position, equally uncopyable by them: **nothing is invented, and now nothing moves between
employers** (ADR-028). JobAssist's FAQ says the quiet part out loud — _"Nothing flags your
application as automated"_ — which is a promise about not being caught. Ours is a promise about the
document being true. Those attract different customers and only one of them holds up in an interview.

Third: **it works with no account at all.** Anonymous upload, correct, download. Jobscan requires an
account for the free scan; Enhancv requires one to build; JobAssist requires twenty questions.

---

## What to take, in the order it is worth taking

### Now — the landing page

1. **Hero:** eyebrow, one headline, one sentence, one primary action, and the proof _beside_ it.
   Our proof is not a star rating we do not have — it is the parse check and the accuracy table.
2. **A "what it costs you to do it yourself" comparison.** JobAssist's two-column "Doing it alone /
   With JobAssist" is the clearest section on any of these sites. Ours writes itself: a CV that a
   parser mangles, invented numbers to defend in an interview, a template that looks fine and
   arrives as one paragraph.
3. **Three steps, numbered.** Upload → check what we read → download something that parses.
4. **An FAQ that answers the real fears:** what happens to my file, does the employer know, can I
   use it without paying, what do you actually check.
5. **A footer with the legal and support links** a paying customer looks for before paying.

### Next — pricing, when there is a gateway

Jobscan's shape is the honest one and it is also the one that converts here: **a real, permanent
free tier with a monthly quota**, then one paid plan. Their numbers, for the record: free = 5 scans a
month forever; paid = $29.98/month billed quarterly, or $49.95 monthly. JobAssist: €19.99 first
month then €39.99/month.

No introductory price that triples on renewal. It converts, and it is the single most complained-about
pattern in this category — their own FAQ has a "How to Cancel" link in the footer, which tells you
what their support inbox looks like.

### Later — features worth considering, with the reason and the risk

| Feature                                                              | Why it fits us                                                                                              | The risk                                                                                                                                                                       |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Browser extension** that reads the advert from the page you are on | Removes the paste step from the Job panel, which is the highest-friction moment in the product              | A permission prompt on every job board; scope creep into scraping                                                                                                              |
| **Application tracker** (applied / replied / interview)              | We already store variants per employer; this is the missing verb, and it is what keeps somebody coming back | Becomes a CRM if unchecked                                                                                                                                                     |
| **Interview questions from their own CV**                            | We have the parsed document and the advert already; the questions would be grounded, not generic            | Only if it stays grounded — a generic question list is worthless                                                                                                               |
| **LinkedIn profile check**                                           | Same parse-and-report machinery pointed at a different surface                                              | Their terms; and it is a different product                                                                                                                                     |
| **Auto-apply**                                                       | The category is going there                                                                                 | **Recommend against.** It is the one feature that would make us responsible for what an employer receives, and it is incompatible with "the candidate signs off on every word" |

---

## The uncomfortable observation

JobAssist's visual language is nearly identical to ours: navy on white, a wordmark with a blue full
stop, a display headline with a blue full stop, pill buttons, hairline cards. Two teams arrived here
independently because it is what the category currently looks like.

So **the design is not what makes us look amateur, and copying more of their design will not fix it.**
What they have that we do not is _structure and evidence_: a page that answers the questions a buyer
asks in the order they ask them. That is the gap, and it is content work, not a repaint.
