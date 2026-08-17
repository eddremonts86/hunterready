/**
 * Keeping open rewrite suggestions pointing at the right bullets while the CV is edited underneath them.
 *
 * ## The misfire this prevents
 *
 * A suggestion is addressed by `{workIndex, highlightIndex}` into `resume.work`. The person can edit the
 * CV's *structure* while suggestions are open — remove a job in the Check panel, delete a bullet, undo a
 * removal — and every one of those renumbers the coordinates. Accepting a suggestion after that would
 * write the model's text over **the wrong bullet**: not a stale hint, a corruption of a line the person
 * never asked to change.
 *
 * The tailoring actions solved this by discarding the suggestions (reordering scrambles everything, so
 * nothing survives anyway). A single row edit is different: twenty-four of twenty-five suggestions are
 * still perfectly good, and throwing them away over an unrelated deletion punishes the person for
 * correcting their CV. So the coordinates shift instead — the exact pattern `shiftProvenance` already
 * uses for the confidence flags, which face the same renumbering.
 *
 * Pure and index-based on purpose: the caller decides what was edited and where; this file only does the
 * arithmetic, which is what makes it testable enough to trust.
 */

/** A structural edit the review form performed. Field/text edits are not structural and never shift. */
export type StructuralEdit =
  /** A work row inserted (`delta: 1`) at `at`, or removed (`delta: -1`) from `at`. */
  | { kind: 'work-row'; at: number; delta: 1 | -1 }
  /** A bullet inserted or removed at `at` inside `resume.work[workIndex]`. */
  | { kind: 'work-bullet'; workIndex: number; at: number; delta: 1 | -1 }
  /**
   * The whole experience section emptied, or put back by an undo.
   *
   * Not expressible as a run of `work-row` edits: the caller applies one edit per change, and a list
   * of N removals would have to be replayed in the right order against coordinates that move under
   * each other. This says the thing that actually happened. It arrived when the panel learned to
   * remove a whole section — "You is the only one that cannot be removed" — and every open suggestion
   * about a job that is no longer there has to go with it.
   */
  | { kind: 'work-cleared' }

interface Target {
  workIndex: number
  highlightIndex: number
}

/**
 * Where one suggestion's coordinates land after the edit, or `undefined` when its bullet is gone.
 *
 * A removed row takes its suggestions with it — advice about a job the person deleted is advice about
 * nothing. Same for a removed bullet.
 */
export function shiftTarget<T extends Target>(
  entry: T,
  edit: StructuralEdit,
): T | undefined {
  /*
    Everything, dropped. Advice about a job the person deleted is advice about nothing, and that is as
    true for the whole list at once as it is for one row. An undo restores the rows; it does not
    restore the suggestions, because they were about a document that has been through two edits since.
  */
  if (edit.kind === 'work-cleared') return undefined

  if (edit.kind === 'work-row') {
    if (entry.workIndex < edit.at) return entry
    if (edit.delta === -1 && entry.workIndex === edit.at) return undefined
    return { ...entry, workIndex: entry.workIndex + edit.delta }
  }

  // Bullet edits touch one job; every other job's coordinates are exactly as true as before.
  if (entry.workIndex !== edit.workIndex) return entry
  if (entry.highlightIndex < edit.at) return entry
  if (edit.delta === -1 && entry.highlightIndex === edit.at) return undefined
  return { ...entry, highlightIndex: entry.highlightIndex + edit.delta }
}

/** The whole list, shifted. Survivors keep their order; the removed row's entries vanish. */
export function shiftTargets<T extends Target>(
  entries: Array<T>,
  edit: StructuralEdit,
): Array<T> {
  return entries.flatMap((entry) => {
    const moved = shiftTarget(entry, edit)
    return moved === undefined ? [] : [moved]
  })
}
