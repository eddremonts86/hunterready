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

/**
 * The two words Stripe can say back to us.
 *
 * `checkout.sessions.create` takes a `success_url` and a `cancel_url` and that is the entire channel:
 * the person leaves for a hosted page on another origin and comes back through a plain redirect, with
 * no state of ours surviving the trip. So the acknowledgement has to travel in the address bar.
 *
 * Neither value is trusted for anything. `done` means "somebody came back from a checkout", not "a
 * payment succeeded" — `/api/billing/webhook` is the only thing that moves the `plan` column, and it
 * is signed. Typing `?billing=done` by hand gets you a toast and a re-read of the server's answer,
 * which is exactly what it would get you if you had paid nothing.
 */
export type BillingReturn = 'done' | 'cancelled'

export interface WorkspaceSearch {
  panel?: PanelId
  compare?: boolean
  cv?: string
  /**
   * **A moment, in a file that is otherwise only about places** — and the exception is deliberate.
   *
   * The rule above holds: `busy` and the error strings stay out of the URL because we own them and can
   * keep them in React state. This one we do not own. It is put there by another origin's redirect,
   * and the alternative to reading it is what shipped first: a person pays, lands back on the front
   * page, and nothing whatsoever acknowledges it.
   *
   * It stops being a place the moment it is read. The handler shows the acknowledgement and navigates
   * it away with `replace: true`, so it never enters history and a reload cannot replay it.
   */
  billing?: BillingReturn
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
    /*
      Two literals and nothing else. A closed list rather than any string, because this value chooses
      which sentence a person reads after paying money — and "we could not complete that" shown to
      somebody who just succeeded is worse than showing them nothing at all.
    */
    ...(search.billing === 'done' || search.billing === 'cancelled'
      ? { billing: search.billing }
      : {}),
  }
}
