/**
 * Keeping the CV you are working on across a reload.
 *
 * ## The bug this closes
 *
 * Every screen in this product lived in React state on `/`, so a refresh — or a stray ⌘R, or a browser
 * restoring a tab, or the OS killing a background tab on a phone — returned you to the landing page with
 * nothing. For a signed-in user that cost the unsaved edits. For an anonymous visitor, which ADR-023 makes
 * the commonest kind, it cost **the entire CV**: the upload, the corrections field by field, the accepted
 * rewrites, all of it, with no way back but the original file and doing it again.
 *
 * ## Why `sessionStorage` and not `localStorage`
 *
 * The privacy notice says, in the library panel and in `/privacy`: *close this tab and your work is gone.*
 * That sentence is a promise, and `localStorage` would break it — the CV would sit in the browser profile
 * until something cleared it, which on a shared or family computer is a real exposure and not one anybody
 * agreed to.
 *
 * `sessionStorage` is scoped to the tab and dies with it. So a reload keeps the work and closing the tab
 * still destroys it, which is exactly what was already promised. The promise did not have to change; the
 * behaviour just had to catch up to it.
 *
 * This is also **not** the same thing as an account. Nothing here reaches a server (ADR-004): it is the
 * same browser holding the same document a moment longer.
 */
import { Resume } from '@/schema/resume'
import { FieldProvenance } from '@/schema/provenance'
import { z } from 'zod'

const KEY = 'hunterready.working'

/**
 * The whole working state, not just the resume.
 *
 * Dropping the provenance on a reload would silently remove every "we were not sure we read this" mark and
 * leave the counter at zero — the document would look checked when nobody had checked it, which is worse
 * than losing the session outright.
 */
export const WorkingCopy = z.object({
  resume: Resume,
  original: Resume,
  provenance: z.array(FieldProvenance).default([]),
  warnings: z.array(z.string()).default([]),
  method: z.enum(['llm', 'local', 'rules']),
  ocr: z.boolean().default(false),
  /**
   * Whether this document was read from a file or written here.
   *
   * Carried through the reload because it decides what the second step *says*: a CV nobody read has
   * nothing to check, and restoring one as `file` would greet its author with "we could not tell
   * which fields to double-check" about a file that never existed. Defaults to `file`, so a copy
   * written by a previous deploy restores as what it almost certainly was.
   */
  origin: z.enum(['file', 'blank']).default('file'),
  /** Which stored row this came from, when it came from one. */
  savedResumeId: z.string().optional(),
})

export type WorkingCopy = z.infer<typeof WorkingCopy>

/**
 * Read the tab's working copy, or `undefined`.
 *
 * Validated through the schema rather than cast: a stored copy can outlive a schema change by one deploy,
 * and a `Resume` the renderer would reject must not reach it. An unreadable copy is treated as no copy —
 * the person starts again, which is the situation they were in before this existed.
 */
export function readWorkingCopy(): WorkingCopy | undefined {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw === null) return undefined
    const parsed = WorkingCopy.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : undefined
  } catch {
    // No sessionStorage at all — Safari's private mode has thrown on it, and a preview is not worth a crash.
    return undefined
  }
}

export function writeWorkingCopy(copy: WorkingCopy): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(copy))
  } catch {
    /**
     * Quota, most likely: a photo is a data URL inside the resume, and a browser can refuse.
     *
     * Swallowed deliberately. Failing to *save* a spare copy must never interrupt somebody editing their
     * CV — the document on screen is unaffected, and the only loss is the thing that did not exist an hour
     * ago. Telling them about it would be raising an alarm about a safety net.
     */
  }
}

export function clearWorkingCopy(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* nothing to clear if the store is unavailable */
  }
}
