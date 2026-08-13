# 06 — AI Optimization

Not in v0.1. Designed now because the schema and UI must not need rework later.

## Hard rule: no fabrication

The model may **restructure, compress, reorder and improve the language** of what
the candidate wrote. It may never introduce:

- numbers, percentages, currency amounts, team sizes, user counts
- employers, roles, dates, locations
- technologies, tools, certifications, degrees
- outcomes or claims not present in the source

Enforcement, in layers (prompting alone is not enforcement):

1. **Prompt:** explicit prohibition + "if a metric would strengthen this bullet,
   emit a `question` instead of a claim".
2. **Post-check:** extract every number, proper noun and acronym from the rewritten
   text; assert each appears in the source bullet or elsewhere in the same resume.
   Violations are rejected and retried once, then the original is kept.
3. **UI:** every rewrite is shown as a side-by-side diff. Nothing is applied until
   the user accepts it. Bulk-accept exists but defaults off.

This is the ethical core of the product and also the legal safe harbour — the
candidate is the one who signs off on every word.

## Feature 1 — Bullet rewriting (v0.3)

Operates on one `work[i].highlights[j]` at a time. Small, cheap, cacheable calls.

Target shape: `<strong action verb> + <what> + <how/scope> + <outcome if the user
supplied one>`. Kill weak openers ("Responsible for", "Worked on", "Helped with"),
passive voice, first person, and duplicate verbs across adjacent bullets.

Output per bullet:

```ts
{
  original: string,
  suggestion: string,
  rationale: string,            // one short line, shown on hover
  questions: string[],          // "How many users did this affect?"
  changed: ("verb"|"structure"|"concision"|"jargon")[],
}
```

`questions` is the feature that separates this from every generic AI resume tool:
it turns hallucination pressure into a user prompt. Answers feed back in as source
material, so the metric is the candidate's, not the model's.

## Feature 2 — JD tailoring (v0.4)

Input: the `Resume` + a pasted job description.

```
JD ──▶ extract requirements ──▶ { hardSkills[], softSkills[], responsibilities[], seniority, keywords[] }
                                        │
              ┌─────────────────────────┼──────────────────────────┐
              ▼                         ▼                          ▼
        MATCHED                   WEAK EVIDENCE                 MISSING
   (in resume, keep and       (present but buried →         (not in resume →
    surface earlier)           re-emphasize, resurface        report as a gap,
                               from an older role)            never invent)
```

Actions the tailoring pass is permitted to take:

- Reorder `work[].highlights` so relevant evidence sits in the first two bullets.
- Reorder `skills[]` groups and items to lead with what the JD asks for.
- Adopt the JD's vocabulary **when it names the same thing** the candidate already
  did (`"CI/CD"` ↔ `"GitHub Actions pipelines"`) — a controlled synonym map, not
  free rein.
- Rewrite `basics.summary` to target the role, from existing material only.
- Suggest which `projects` to include or drop.

It may not add skills, change dates, or inflate seniority.

Output is a **variant**, not a mutation. Each application keeps its own variant so
the candidate can see what they sent to whom (needs v0.5 persistence).

## Feature 3 — Score (v0.4)

**Rule-based and transparent, not an LLM number.** LLM-produced scores are unstable
across runs and impossible to explain, which makes them worthless for a user trying
to improve. Every point must be traceable to a rule.

| Dimension              | Weight | Computed from                                            |
| ---------------------- | ------ | -------------------------------------------------------- |
| Keyword coverage vs JD | 30     | matched / required hard skills                           |
| Section completeness   | 15     | contact, summary, ≥1 work, education, skills present     |
| Bullet quality         | 20     | share of bullets with a strong verb + quantified outcome |
| Concision              | 10     | bullets ≤ 2 lines; page count vs experience years        |
| ATS-safety             | 15     | round-trip test result for the chosen template           |
| Consistency            | 10     | date formats, tense, no gaps left unexplained            |

Displayed as a checklist with the specific fixes, and the score as a byproduct.
Nobody improves a CV from "68/100"; people improve it from
"4 of 11 bullets have no outcome — here they are".

## Model routing (cost)

| Task                      | Model     | Why                                         |
| ------------------------- | --------- | ------------------------------------------- |
| Extraction / structuring  | Haiku 4.5 | mechanical, schema-constrained, high volume |
| Bullet rewriting          | Opus 5    | quality is the product here                 |
| JD requirement extraction | Sonnet 5  | structured, moderate nuance                 |
| Scoring                   | none      | deterministic code                          |

Rough per-CV budget: extraction ~10–15k input / ~3k output; a full rewrite pass on
a 2-page CV ~25 bullet calls. Cache aggressively on `hash(bullet + promptVersion)` —
users re-run this constantly while iterating.

## Privacy

CV content leaving the machine for an LLM provider requires **explicit, specific
consent** shown before the first call, naming the provider. See [07-privacy.md](07-privacy.md).
Extraction (v0.1) also uses an LLM, so this consent gate is needed from day one —
it is not deferrable to v0.3.
