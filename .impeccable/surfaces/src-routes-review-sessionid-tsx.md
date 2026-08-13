---
version: 1
slug: 'src-routes-review-sessionid-tsx'
primary_target: 'src/routes/review.$sessionId.tsx'
related_targets: ['src/routes/index.tsx']
---

# Surface brief — Review & Inspect

**Scope:** the review/edit screen, the product's core surface. Where the extracted
record is corrected and the print is inspected. Not the upload screen, not the landing page.

**Visitor mode:** Operate. Task completion, scanability and recoverability outrank
expression. Brand lives in the bench and the light, never in the way of the work.

## Audience, job, task

A working adult of any profession, often at night, who has just handed over a CV file
and now has to confirm that a machine read it correctly. They are not evaluating
software; they are anxious about a job. The task: scan what was extracted, fix what is
wrong, and see what the finished document will look like — in that order, without ever
being made to feel they broke something.

## Content and proof on this surface

The only proof that matters here is the parse tally: how many critical fields survived,
stated plainly, from the real round-trip check rather than a claim. Low-confidence
fields are marked honestly rather than presented as finished. No social proof, no
progress gamification, no score until v0.4.

## Constraints

- Two light states with a hard edge; the print never carries the room's accent.
- Every station re-enterable; no irreversible action, no warning that one is.
- The edit form must be usable by someone who has never filled a 40-field form.
- Screen readers are a primary path, not an afterthought.
- Preview costs a server render — debounce it; never block editing on it.

## Direction contract

**THESIS:** The room and the print are different objects under different light. This
screen refuses the resume-builder convention of form-panel beside preview-panel by
making the print a lit object set into a dark bench.

**OWN-WORLD:** Safelight amber on print black, Darkroom Brown bench, tray-rim
hairlines, condensed engraved caps, seven-segment tallies, grease-pencil annotation.
Depth is amber falloff; no shadows.

**STORY:** Their file was developed into data; the uncertain parts are marked honestly;
they fix those and pull a print.

**FIRST VIEWPORT:** Full-width bench in safelight. Left two-thirds: the extracted record
as station panels on Darkroom Brown, low-confidence fields wearing a grease-pencil mark.
Right third: the inspection window — white-light enamel, hard edge, print at readable
scale. A loupe bar spans both; the strip between them tallies in seven-segment what the
parser read. Primary action at the bench's right end, amber fill.

**FORM:** Darkroom Safelight Bay — user-pinned challenger over assigned index 7
(mark-sense form). Staging: twinned probe, committed as the loupe over test strip and
print with the verdict strip between. Seed key 01690489.

## Unresolved

- Font families (all four roles) — resolved at implementation, banned-defaults list binding.
- Error-state color, drawn from the world's own safelight red rather than invented.
- Whether the loupe bar is dragged or follows the focused field.
- Mobile: whether the inspection window becomes a separate station or a peel-up sheet.
