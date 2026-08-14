/**
 * What changed between two versions of a CV — v0.5's "version history and diffs between variants".
 *
 * Built now, ahead of the storage that will hold them, because it needs no storage: a diff is a pure
 * function of two documents. When persistence lands (ADR-018) this is already written and tested,
 * and the remaining work is a table rather than a feature.
 *
 * It is useful before then too. Tailoring produces a variant, rewriting changes bullets, and the
 * candidate currently has no way to see what a pass did to their CV beyond reading it again. "Show me
 * what changed" is the question, and answering it does not require an account.
 *
 * ## The shape of the answer
 *
 * Field-level, not line-level. `work[1].highlights[0]` is the unit a person thinks in — "the first
 * bullet of my second job" — and a textual diff of serialized JSON would report brace changes and
 * reordering as edits. Order changes are their own kind, because reordering is what tailoring does
 * and describing it as "removed then added" would make an honest move look destructive.
 */
import type { Resume } from '@/schema/resume'

export type ChangeKind = 'added' | 'removed' | 'changed' | 'reordered'

export interface Change {
  kind: ChangeKind
  /** Where, in the candidate's words: "Your second job — bullet 1". */
  where: string
  before?: string
  after?: string
}

function label(index: number, job: { company: string; role: string }): string {
  const name = job.company || job.role || `job ${index + 1}`
  return name
}

/** Same text apart from whitespace. Used so a reflow is not reported as an edit. */
function same(a: string | undefined, b: string | undefined): boolean {
  return (
    (a ?? '').replace(/\s+/g, ' ').trim() ===
    (b ?? '').replace(/\s+/g, ' ').trim()
  )
}

function diffStrings(
  where: string,
  before: string | undefined,
  after: string | undefined,
  changes: Array<Change>,
): void {
  if (same(before, after)) return
  const hadBefore = (before ?? '').trim() !== ''
  const hasAfter = (after ?? '').trim() !== ''
  if (!hadBefore && hasAfter) {
    changes.push({ kind: 'added', where, after })
  } else if (hadBefore && !hasAfter) {
    changes.push({ kind: 'removed', where, before })
  } else {
    changes.push({ kind: 'changed', where, before, after })
  }
}

/**
 * A list where the same items appear in a different order.
 *
 * Checked before item-by-item comparison, because tailoring's whole job is reordering and reporting
 * that as four removals and four additions would make a safe move look like a rewrite.
 */
function isReorder(before: Array<string>, after: Array<string>): boolean {
  if (before.length !== after.length || before.length < 2) return false
  if (before.every((item, index) => same(item, after[index]))) return false
  return [...before].sort().join('\u0000') === [...after].sort().join('\u0000')
}

function diffList(
  where: string,
  before: Array<string>,
  after: Array<string>,
  changes: Array<Change>,
): void {
  if (isReorder(before, after)) {
    changes.push({
      kind: 'reordered',
      where,
      before: before[0],
      after: after[0],
    })
    return
  }
  const length = Math.max(before.length, after.length)
  for (let index = 0; index < length; index++) {
    diffStrings(`${where} ${index + 1}`, before[index], after[index], changes)
  }
}

export function diffResumes(before: Resume, after: Resume): Array<Change> {
  const changes: Array<Change> = []

  diffStrings(
    'Your name',
    before.basics.fullName,
    after.basics.fullName,
    changes,
  )
  diffStrings(
    'Your title',
    before.basics.headline,
    after.basics.headline,
    changes,
  )
  diffStrings(
    'Your summary',
    before.basics.summary,
    after.basics.summary,
    changes,
  )
  diffStrings('Email', before.basics.email, after.basics.email, changes)
  diffStrings('Phone', before.basics.phone, after.basics.phone, changes)

  const jobs = Math.max(before.work.length, after.work.length)
  for (let index = 0; index < jobs; index++) {
    const was = before.work[index]
    const now = after.work[index]
    if (was === undefined && now !== undefined) {
      changes.push({
        kind: 'added',
        where: 'A job',
        after: label(index, now),
      })
      continue
    }
    if (was !== undefined && now === undefined) {
      changes.push({
        kind: 'removed',
        where: 'A job',
        before: label(index, was),
      })
      continue
    }
    if (was === undefined || now === undefined) continue

    const where = label(index, now)
    diffStrings(`${where} — job title`, was.role, now.role, changes)
    diffStrings(`${where} — employer`, was.company, now.company, changes)
    diffStrings(`${where} — start date`, was.startDate, now.startDate, changes)
    diffStrings(
      `${where} — end date`,
      was.endDate ?? undefined,
      now.endDate ?? undefined,
      changes,
    )
    diffList(`${where} — bullet`, was.highlights, now.highlights, changes)
  }

  const groups = Math.max(before.skills.length, after.skills.length)
  for (let index = 0; index < groups; index++) {
    const was = before.skills[index]
    const now = after.skills[index]
    if (was === undefined || now === undefined) {
      diffStrings('A skills group', was?.category, now?.category, changes)
      continue
    }
    diffList(`${now.category} skills`, was.items, now.items, changes)
  }

  return changes
}

/**
 * The breakdown without a total: "4 reworded, 2 reordered".
 *
 * Split out from `summarizeChanges` because the before-and-after view shows the total as a figure in its
 * own right, and a sentence that leads with the count again reads as a stutter — "1 change since you
 * uploaded it. 1 change — 1 reworded." One implementation, so the two places cannot start disagreeing
 * about what counts as what.
 */
export function changeBreakdown(changes: Array<Change>): string {
  const counts = changes.reduce<Record<ChangeKind, number>>(
    (acc, change) => ({ ...acc, [change.kind]: (acc[change.kind] ?? 0) + 1 }),
    { added: 0, removed: 0, changed: 0, reordered: 0 },
  )
  return [
    counts.changed > 0 ? `${counts.changed} reworded` : undefined,
    counts.reordered > 0 ? `${counts.reordered} reordered` : undefined,
    counts.added > 0 ? `${counts.added} added` : undefined,
    counts.removed > 0 ? `${counts.removed} removed` : undefined,
  ]
    .filter((part): part is string => part !== undefined)
    .join(', ')
}

/** One line a person can read: "6 changes — 4 bullets reworded, 2 reordered." */
export function summarizeChanges(changes: Array<Change>): string {
  if (changes.length === 0) return 'Nothing changed.'
  return `${changes.length} ${changes.length === 1 ? 'change' : 'changes'} — ${changeBreakdown(changes)}.`
}
