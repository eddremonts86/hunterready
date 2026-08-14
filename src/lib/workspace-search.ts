/**
 * Which screen you are on, expressed in the address bar.
 *
 * ## What was wrong with one route
 *
 * The workspace, the five sidebar panels, the comparison and the account all lived in React state on `/`,
 * so none of them had an address. The back button left the app instead of leaving the panel, no screen could
 * be bookmarked, and there was no link to send yourself — "the design tab of the CV I saved yesterday" was
 * four clicks every time, with no way to write it down.
 *
 * ## Only the three that are places
 *
 * `panel`, `compare` and `cv`. Not the chosen design, which belongs to the document and is saved with it;
 * not `busy` or the error strings, which are moments rather than places; and **never the resume**, which
 * stays in `sessionStorage`. A CV in a URL is a CV in browser history, in a server access log and in
 * anything that shortens links, which contradicts every promise in `/privacy`.
 *
 * ## An unreadable URL is not an error page
 *
 * Every field is dropped rather than rejected. A throw here would turn a mistyped or truncated link into a
 * broken landing page, and the landing page is the one screen that has to work — it is where somebody
 * arrives who has never seen this before. So `?panel=nonsense` opens the default panel and the router
 * rewrites the address bar to match.
 *
 * It lives in its own module for one reason: it is the kind of pure function that regresses silently. A
 * mistyped panel id in a URL produces a slightly wrong screen, not a crash, and nobody notices for a month.
 */

export type PanelId = 'check' | 'wording' | 'design' | 'job' | 'account'

/**
 * The sidebar's tabs, in order, and the only list of them.
 *
 * The search validator checks against this rather than keeping a second copy of the ids, so adding a tab
 * cannot leave the validator behind — the failure that would produce is a tab that works when clicked and
 * silently loses its panel when the same URL is opened from a bookmark.
 */
export const PANELS: ReadonlyArray<{ id: PanelId; label: string }> = [
  { id: 'check', label: 'Check' },
  { id: 'wording', label: 'Wording' },
  { id: 'design', label: 'Design' },
  { id: 'job', label: 'Job' },
  { id: 'account', label: 'Account' },
]

export interface WorkspaceSearch {
  panel?: PanelId
  compare?: boolean
  cv?: string
}

/** The default panel, left out of the URL so the front door stays `/` rather than `/?panel=check`. */
export const DEFAULT_PANEL: PanelId = 'check'

export function validateWorkspaceSearch(
  search: Record<string, unknown>,
): WorkspaceSearch {
  return {
    ...(typeof search.panel === 'string' &&
    PANELS.some((entry) => entry.id === search.panel)
      ? { panel: search.panel as PanelId }
      : {}),
    /*
      Both shapes accepted: a link typed by hand or pasted from a chat carries the string "true", while one
      built by the router carries a real boolean. Anything else — "1", "yes", "false" — is dropped, because
      guessing at intent here would make `?compare=0` turn the comparison *on*.
    */
    ...(search.compare === true || search.compare === 'true'
      ? { compare: true }
      : {}),
    // An id is opaque and belongs to the caller; the only thing worth checking is that there is one.
    ...(typeof search.cv === 'string' && search.cv !== ''
      ? { cv: search.cv }
      : {}),
  }
}
