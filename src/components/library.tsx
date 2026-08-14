/**
 * The account surface: sign in, keep a CV, and see what you have applied for — v0.5, made reachable.
 *
 * ## Why this component exists
 *
 * Every part of v0.5 was built and none of it could be reached. The tables, the repository, Better Auth,
 * the GDPR endpoints and the retention sweep were all verified against a real Postgres (ADR-019,
 * ADR-020) — and `SignIn` was rendered on no screen, so no session could exist, so nothing was ever
 * saved, so `/api/account/export` and `/api/account/delete` answered `no_account` to everybody.
 *
 * The consequence was not just a missing feature. `/privacy` says "if you sign in so we can remember
 * your CV between visits, then we do store it", and nothing stored anything. A privacy notice that
 * describes handling the code does not perform is wrong even when it over-discloses, because it is the
 * document somebody reads to decide whether to trust us.
 *
 * ## An invitation, never a wall
 *
 * ADR-004 and ADR-011: the artifact comes before any question. Signing in has to stay optional and
 * arrive *after* the CV exists, so this is a card in the review sidebar rather than a gate on the way
 * in. The copy says what it costs and what it buys in the same breath, because "create an account" with
 * no reason attached is the pattern this product is meant to be an alternative to.
 *
 * ## Saving is explicit
 *
 * No autosave. This product's whole stance is that nothing happens to your document unless you ask —
 * the same reason a rewrite is accepted one line at a time — and an autosave that silently writes an
 * employment history to a database the first time somebody types in a field would contradict the
 * sentence on `/privacy` about being asked first.
 */
import { useCallback, useEffect, useState } from 'react'
import { SignIn } from '@/components/sign-in'
import { ButtonLabel, Working } from '@/components/working'
import { signOut, useSession } from '@/lib/auth-client'
import type { Resume } from '@/schema/resume'

interface SavedResume {
  id: string
  label: string
  updatedAt: string
  resume: Resume
}

interface ShareLink {
  token: string
  label: string
  expiresAt: string
  views: number
  /** Computed on the server so the interface never has to decide what "expired" means. */
  live: boolean
}

interface Application {
  id: string
  resumeId: string
  /**
   * `null`, not `undefined`, when the column is empty.
   *
   * Postgres returns SQL NULL and `JSON.stringify` keeps it as `null`, so a `=== undefined` check
   * passes it straight through — which rendered a tracker row reading "Registered Nurse — null".
   */
  company?: string | null
  role?: string | null
  status: string
  createdAt: string
}

/** Absent covers `undefined`, `null` and a string of spaces. All three mean "we do not know". */
function present(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/** Relative, because "3 days ago" is the question being asked, not the calendar date. */
function ago(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const minutes = Math.round((Date.now() - then) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function Library({
  resume,
  onLoad,
  savedId,
  onSavedIdChange,
}: {
  /** The document on screen, so "Save" saves what the user is looking at. */
  resume: Resume
  onLoad: (resume: Resume) => void
  /**
   * Which stored row the document on screen corresponds to, held by the parent rather than here.
   *
   * It has to be the parent's, because saving an *application* needs it too and that happens on a
   * different screen. Keeping it local looked tidier and duplicated the base CV on every application
   * saved: the row id never reached `/api/application`, so it created a fresh base each time and after
   * five applications the library held six copies of one CV.
   */
  savedId?: string
  onSavedIdChange: (id: string) => void
}) {
  const { data: session } = useSession()
  const signedIn = session?.user !== undefined && session.user !== null

  const [showSignIn, setShowSignIn] = useState(false)
  const [resumes, setResumes] = useState<Array<SavedResume>>([])
  const [applications, setApplications] = useState<Array<Application>>([])
  /**
   * `false` once we know the server will never store anything — no `DATABASE_URL` on this
   * installation. Distinct from "not signed in", because one is an invitation and the other is not:
   * offering an account on a deployment that cannot keep one would be a dead end with a button on it.
   */
  const [available, setAvailable] = useState(true)
  const [links, setLinks] = useState<Array<ShareLink>>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | undefined>()
  /**
   * Whether the first list is still on its way.
   *
   * Its own flag rather than a branch on `resumes.length`, because those two states look identical and
   * mean opposite things: an empty list is "you have saved nothing yet", and this is "we have not asked
   * yet". Without it, somebody with ten saved CVs was shown the empty state — a message that is not
   * merely unhelpful but false, and the one that arrives first.
   */
  const [listing, setListing] = useState(true)
  /**
   * Which share action is in flight, keyed by token, plus `'new'` for creating one.
   *
   * Keyed rather than a single flag because several links are on screen at once: one boolean would put
   * every row in the same state and leave nobody able to tell which one they had clicked.
   */
  const [shareBusy, setShareBusy] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState<Set<string>>(new Set())

  /** Add/remove on a keyed busy set, without mutating the state object in place. */
  const mark = (
    set: (updater: (current: Set<string>) => Set<string>) => void,
    key: string,
    on: boolean,
  ) =>
    set((current) => {
      const next = new Set(current)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/library')
      if (response.status === 404) {
        // Ambiguous by design on the server (see `/api/library`): no account and no persistence answer
        // alike. The session tells us which one this is.
        setAvailable(signedIn ? true : available)
        setResumes([])
        setApplications([])
        return
      }
      if (!response.ok) return
      const payload = (await response.json()) as {
        resumes?: Array<SavedResume>
        applications?: Array<Application>
      }
      setResumes(payload.resumes ?? [])
      setApplications(payload.applications ?? [])
      try {
        const shareResponse = await fetch('/api/share')
        if (shareResponse.ok) {
          const shares = (await shareResponse.json()) as {
            links?: Array<ShareLink>
          }
          setLinks(shares.links ?? [])
        }
      } catch {
        // A share list that cannot be read is not a reason to interrupt somebody editing their CV.
      }
      const [first] = payload.resumes ?? []
      if (first !== undefined && savedId === undefined)
        onSavedIdChange(first.id)
    } catch {
      // A library that cannot be listed is not a reason to interrupt somebody editing their CV.
    } finally {
      // In `finally` so a 404, a parse failure and a dead network all stop claiming to be still loading.
      setListing(false)
    }
  }, [signedIn, available, savedId, onSavedIdChange])

  useEffect(() => {
    if (signedIn) void refresh()
    // Nothing is being fetched for a visitor with no account, so there is nothing to wait for. Without
    // this the signed-out panel would sit under a spinner for a request that is never sent.
    else setListing(false)
    // `refresh` is stable enough for this: it depends only on sign-in state, which is the trigger.
  }, [signedIn, refresh])

  /**
   * Save, either over the row this CV came from or as a new one.
   *
   * `asCopy` exists because the interface could only ever hold **one** saved CV per uploaded file. Sending
   * `resumeId` updates in place, and `savedId` is set the moment anything is saved, so a person wanting a
   * second version — the commonest reason to save at all, one CV per kind of job — had to find the original
   * file and upload it again. The storage never had a limit; there was just no way to ask for a new row.
   */
  const save = useCallback(
    async (asCopy = false) => {
      setBusy(true)
      setNote(undefined)
      try {
        /**
         * A name taken from the document, because two rows called "My CV" are not a library.
         *
         * The endpoint has always accepted a label and defaulted to `My CV`; the client never sent one,
         * which was invisible while only one row could exist. The moment "Save as a copy" shipped, the list
         * showed two identical names both saved today — a choice between indistinguishable things, which is
         * worse than having no choice.
         *
         * The headline is the discriminator that actually discriminates: somebody keeping several CVs is
         * keeping one per kind of job, and the headline is what a tailoring pass changes. Never the file
         * name — that is theirs, and it is usually their own name.
         */
        const from = resume.basics.headline ?? resume.work[0]?.role
        const label =
          from === undefined || from.trim() === ''
            ? undefined
            : (asCopy ? `${from.trim()} (copy)` : from.trim()).slice(0, 120)

        const response = await fetch('/api/library', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            resume,
            ...(label === undefined ? {} : { label }),
            // Omitting the id is what makes the endpoint create rather than update.
            ...(savedId === undefined || asCopy ? {} : { resumeId: savedId }),
          }),
        })
        if (response.status === 404) {
          setAvailable(false)
          return
        }
        if (!response.ok) {
          setNote('We could not save it just now. Your CV is untouched.')
          return
        }
        const payload = (await response.json()) as { resumeId?: string }
        if (typeof payload.resumeId === 'string')
          onSavedIdChange(payload.resumeId)
        /*
        A copy becomes the CV being edited, which is what somebody expects after asking for a copy: further
        changes belong to the new version, not to the one they branched from.
      */
        setNote(asCopy ? 'Saved as a new CV.' : 'Saved.')
        await refresh()
      } catch {
        setNote('We could not reach the server. Your CV is untouched.')
      } finally {
        setBusy(false)
      }
    },
    [resume, savedId, refresh, onSavedIdChange],
  )

  /**
   * Create a link for the CV on screen. Requires it to be saved first, and says so rather than saving
   * silently: publishing somebody's employment history is not a side effect of clicking Share.
   */
  const share = useCallback(async () => {
    if (savedId === undefined) {
      setNote('Save this CV first, then you can share it.')
      return
    }
    /**
     * Guarded, not just indicated. Two clicks on a silent button minted **two** public URLs to
     * somebody's employment history, and the second one is invisible to whoever created it — it does
     * not appear until the list refreshes, and closing a link you do not know exists is not something
     * anybody does.
     */
    if (shareBusy.has('new')) return
    mark(setShareBusy, 'new', true)
    try {
      const response = await fetch('/api/share', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resumeId: savedId }),
      })
      if (!response.ok) {
        setNote('We could not create a link just now.')
        return
      }
      const payload = (await response.json()) as { token?: string }
      if (typeof payload.token === 'string') {
        const url = `${window.location.origin}/s/${payload.token}`
        void navigator.clipboard?.writeText(url)
        setNote('Link copied. It closes itself in two weeks.')
      }
      await refresh()
    } catch {
      setNote('We could not reach the server.')
    } finally {
      mark(setShareBusy, 'new', false)
    }
  }, [savedId, refresh, shareBusy])

  /**
   * Close a link. The one action here whose whole purpose is to stop something being readable, which is
   * why silence was worst on this button: a person revoking a link is usually revoking it in a hurry,
   * and a control that gives no sign it registered invites a second click and then a doubt.
   */
  const revoke = useCallback(
    async (token: string) => {
      if (shareBusy.has(token)) return
      mark(setShareBusy, token, true)
      try {
        await fetch('/api/share', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        await refresh()
      } catch {
        setNote('We could not close that link just now.')
      } finally {
        mark(setShareBusy, token, false)
      }
    },
    [refresh, shareBusy],
  )

  const markSent = useCallback(
    async (variantId: string) => {
      if (sending.has(variantId)) return
      mark(setSending, variantId, true)
      try {
        await fetch('/api/application', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ variantId, status: 'sent' }),
        })
        await refresh()
      } catch {
        setNote('We could not update that just now.')
      } finally {
        mark(setSending, variantId, false)
      }
    },
    [refresh, sending],
  )

  if (!available) return null

  /* ── Not signed in: the invitation ──────────────────────────────────────────────────────── */
  if (!signedIn) {
    if (showSignIn) {
      return (
        <div className="card flex flex-col gap-3 p-4">
          <SignIn onSignedIn={() => setShowSignIn(false)} />
          <button
            type="button"
            onClick={() => setShowSignIn(false)}
            className="btn btn-quiet self-start px-3.5 py-2 text-[13px]"
          >
            Not now
          </button>
        </div>
      )
    }
    return (
      <div className="card flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold text-ink">
            Want this back next time?
          </h2>
          {/*
            The cost stated in the same breath as the benefit. Without an account we hold nothing, and
            that is the strongest thing this product says about itself — so the trade is named plainly
            rather than buried in a notice somebody reads afterwards.
          */}
          <p className="text-[13px] leading-relaxed text-ink-soft">
            Right now nothing is stored: close this tab and your work is gone.
            An account keeps your CV and the versions you tailor for each job —
            which means we do hold your employment history, for 90 days after
            your last visit, and you can delete all of it in one click.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowSignIn(true)}
          className="btn btn-quiet self-start px-4 py-2.5 text-[14px]"
        >
          Keep my CV here
        </button>
      </div>
    )
  }

  /* ── Signed in: the library ─────────────────────────────────────────────────────────────── */

  /*
    The first list, before it arrives. Not a skeleton of rows: we do not know how many there are, and a
    three-row shimmer in front of somebody who has one saved CV is a guess drawn as a fact. One line
    that says what is happening, in the card the list will occupy, so the panel does not resize twice.
  */
  if (listing) {
    return (
      <div className="card flex flex-col gap-3 p-4">
        <h2 className="text-[15px] font-semibold text-ink">Your account</h2>
        <Working label="Fetching what you have saved…" />
      </div>
    )
  }

  const others = resumes.filter((row) => row.id !== savedId)
  const current = resumes.find((row) => row.id === savedId)

  return (
    <div className="card flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-semibold text-ink">Your account</h2>
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-meta text-ink-soft underline decoration-hairline-strong underline-offset-4 transition-colors hover:text-ink"
        >
          Sign out
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(false)}
            className="btn btn-primary px-4 py-2 text-[13px] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ButtonLabel
              busy={busy}
              idle={current === undefined ? 'Save this CV' : 'Save changes'}
              working="Saving…"
            />
          </button>
          {current !== undefined && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void save(true)}
              title="Keep this version and start a second one"
              className="btn btn-quiet px-3.5 py-2 text-[13px] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Save as a copy
            </button>
          )}
          {current !== undefined && (
            <span className="text-meta text-ink-soft">
              Last saved {ago(current.updatedAt)}
            </span>
          )}
        </div>
        {note !== undefined && (
          <p role="status" className="text-[13px] text-ink-soft">
            {note}
          </p>
        )}
      </div>

      {others.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-hairline pt-3">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
            Also saved
          </h3>
          <ul className="flex flex-col gap-1">
            {others.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => {
                    onLoad(row.resume)
                    onSavedIdChange(row.id)
                  }}
                  className="flex w-full items-baseline justify-between gap-3 rounded-field px-2 py-1.5 text-left transition-colors hover:bg-band"
                >
                  <span className="text-[13px] font-medium text-ink">
                    {row.label}
                  </span>
                  <span className="tally shrink-0 text-[12px] text-ink-soft">
                    {ago(row.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*
        The tracker. Two states only — `draft` and `sent` — because those are the two this product can
        observe. An `interviewing` column would be asking the user to maintain a pipeline by hand, which
        is a different product.
      */}
      {applications.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-hairline pt-3">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
            Applications
            <span className="tally ml-1.5 font-normal normal-case tracking-normal">
              {applications.length}
            </span>
          </h3>
          <ul className="flex flex-col">
            {applications.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-hairline py-2 last:border-b-0"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-[13px] font-medium text-ink">
                    {present(row.role) ?? 'A job'}
                    {present(row.company) === undefined
                      ? ''
                      : ` — ${present(row.company)}`}
                  </span>
                  <span className="tally text-[12px] text-ink-soft">
                    {ago(row.createdAt)}
                  </span>
                </span>
                {row.status === 'sent' ? (
                  <span className="inline-flex shrink-0 items-center rounded-full bg-affirm-wash px-2 py-0.5 text-[11px] font-semibold text-affirm">
                    Sent
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={sending.has(row.id)}
                    aria-busy={sending.has(row.id)}
                    onClick={() => void markSent(row.id)}
                    className="btn btn-quiet shrink-0 px-3 py-1 text-[12px]"
                  >
                    <ButtonLabel
                      busy={sending.has(row.id)}
                      idle="Mark as sent"
                      working="Saving…"
                    />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*
        Share links. The copy names the expiry in the same breath as the action, because this is the one
        feature here that makes a CV readable without a password and the recipient is not the user.
      */}
      <div className="flex flex-col gap-2 border-t border-hairline pt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
            Share a link
          </h3>
          <button
            type="button"
            disabled={shareBusy.has('new')}
            aria-busy={shareBusy.has('new')}
            onClick={() => void share()}
            className="btn btn-quiet px-3.5 py-1.5 text-[12px]"
          >
            <ButtonLabel
              busy={shareBusy.has('new')}
              idle="Copy a link"
              working="Making it…"
            />
          </button>
        </div>
        <p className="text-[13px] leading-relaxed text-ink-soft">
          Anyone with the link can read this CV — no password. Every link closes
          itself after two weeks, and you can close one sooner.
        </p>
        {links.length > 0 && (
          <ul className="flex flex-col">
            {links.map((link) => (
              <li
                key={link.token}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-hairline py-2 last:border-b-0"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="tally text-[12px] text-ink">
                    {/* Six characters: enough to tell two links apart, not enough to be a credential. */}
                    …{link.token.slice(-6)}
                  </span>
                  <span className="text-meta text-ink-soft">
                    {link.live
                      ? `open until ${new Date(link.expiresAt).toLocaleDateString()}`
                      : 'closed'}
                    {link.views > 0
                      ? ` · opened ${link.views} ${link.views === 1 ? 'time' : 'times'}`
                      : ' · not opened yet'}
                  </span>
                </span>
                {link.live && (
                  <button
                    type="button"
                    disabled={shareBusy.has(link.token)}
                    aria-busy={shareBusy.has(link.token)}
                    onClick={() => void revoke(link.token)}
                    className="btn btn-quiet shrink-0 px-3 py-1 text-[12px]"
                  >
                    <ButtonLabel
                      busy={shareBusy.has(link.token)}
                      idle="Close it"
                      working="Closing…"
                    />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <a
        href="/privacy"
        className="text-meta text-ink-soft underline decoration-hairline-strong underline-offset-4 transition-colors hover:text-ink"
      >
        Download or delete everything we hold
      </a>
    </div>
  )
}
