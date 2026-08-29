/**
 * GDPR Article 15 and 17, as two buttons.
 *
 * docs/07's design goal, verbatim: *"Self-service export (JSON + PDF) and self-service
 * delete-everything — GDPR Articles 15 and 17 satisfied by a button, not a support email."*
 *
 * Three things about how they behave, each the opposite of the usual:
 *
 *  • **Delete asks once, in words, and names what goes.** Not "Are you sure?" — that tells the person
 *    nothing they did not already know. It says which things disappear, because the whole point is an
 *    informed decision rather than a confirmed click.
 *  • **Export downloads immediately.** No email, no "we will send you a link within 30 days", which is
 *    the industry's way of making a right expensive enough that nobody exercises it.
 *  • **They are visible without an account**, explaining that there is nothing to export or delete
 *    yet. A rights section that only appears once you have something to lose reads as a trap.
 */
import { useState } from 'react'
import { ButtonLabel } from '@/components/working'

/**
 * `exporting` and `deleting` rather than one `working`, and the distinction is not cosmetic.
 *
 * With a single `working`, pressing "Yes, delete all of it" moved the state out of `confirming`, which
 * removed the confirmation view and replaced it with the two idle buttons, greyed out and silent. The
 * screen looked like the dialog had been dismissed at the exact moment the only irreversible operation
 * in the product had in fact just started. TypeScript is what surfaced it: a `state === 'working'` check
 * inside the `confirming` branch is unreachable, because the two states were mutually exclusive.
 *
 * Naming the operation lets the confirmation stay on screen and say what it is doing.
 */
type State =
  | 'idle'
  | 'exporting'
  | 'deleting'
  | 'confirming'
  | 'done'
  | 'none'
  | 'error'
  | 'billing'

export function AccountControls() {
  const [state, setState] = useState<State>('idle')
  const [message, setMessage] = useState<string | undefined>()

  /**
   * Cancelling, in two clicks: this one, then Stripe's.
   *
   * The plan's criterion is "reachable from the account panel in no more than two clicks", and
   * Stripe's billing portal is the shortest honest route — it cancels, shows invoices and updates
   * the card, and it is the same page whatever we change here later.
   *
   * **`404` is the ordinary answer, not an error.** Almost everybody reading this panel has never
   * paid, and the button says so rather than opening a page about a subscription that does not
   * exist. Nothing here touches the plan: the portal emits webhooks like anything else, and
   * `/api/billing/webhook` stays the only path to that column.
   */
  const manageBilling = async () => {
    setState('billing')
    setMessage(undefined)
    try {
      const response = await fetch('/api/billing/portal', { method: 'POST' })
      if (response.status === 404) {
        setState('idle')
        setMessage('There is no subscription on this account.')
        return
      }
      const payload = (await response.json().catch(() => ({}))) as {
        url?: string
        message?: string
      }
      if (!response.ok || typeof payload.url !== 'string') {
        setState('idle')
        setMessage(payload.message ?? 'We could not open the billing page.')
        return
      }
      window.location.href = payload.url
    } catch {
      setState('idle')
      setMessage('We could not reach the server. Please try again.')
    }
  }

  const exportEverything = async () => {
    setState('exporting')
    setMessage(undefined)
    try {
      const response = await fetch('/api/account/export')
      if (response.status === 404) {
        setState('none')
        return
      }
      if (!response.ok) throw new Error('export failed')
      const blob = await response.blob()
      // Straight to a file. A right that arrives as an email in 30 days is a right on paper.
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'hunterready-my-data.json'
      link.click()
      URL.revokeObjectURL(url)
      setState('done')
      setMessage('Downloaded everything we hold about you.')
    } catch {
      setState('error')
      setMessage(
        'We could not put that together just now. Nothing was changed.',
      )
    }
  }

  const deleteEverything = async () => {
    setState('deleting')
    setMessage(undefined)
    try {
      const response = await fetch('/api/account/delete', { method: 'POST' })
      if (response.status === 404) {
        setState('none')
        return
      }
      if (!response.ok) throw new Error('delete failed')
      setState('done')
      setMessage(
        'Deleted. Your CV, every tailored version, and the account itself.',
      )
    } catch {
      setState('error')
      setMessage('We could not delete that just now. Nothing was changed.')
    }
  }

  return (
    <div className="card flex flex-col gap-4 p-5">
      <h2 className="text-title text-ink">Your data</h2>

      {/*
        The confirmation stays on screen while the deletion runs. It used to leave the moment the request
        started, which put the idle buttons back in front of somebody who had just pressed the only
        irreversible button in the product — indistinguishable from having cancelled.
      */}
      {state === 'confirming' || state === 'deleting' ? (
        <div className="flex flex-col gap-3">
          {/*
            Names what goes, rather than asking "are you sure?". A confirmation that repeats the
            question adds a click and no information.
          */}
          <p className="rounded-field border border-alert/25 bg-alert-wash px-3 py-2.5 text-[14px] leading-relaxed text-ink">
            This deletes your CV, every tailored version you have made, the
            record of where you applied, and the account itself. It happens
            immediately and cannot be undone.
          </p>
          {/*
            The only destructive action in the product, so it is the only place a button is allowed
            to be red — and the safe answer keeps the same visual weight rather than being styled as
            the obvious one. The information is in the sentence above, not in the colour.
          */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={state === 'deleting'}
              aria-busy={state === 'deleting'}
              onClick={() => void deleteEverything()}
              className="btn flex-1 bg-alert px-4 py-2.5 text-[14px] text-white hover:bg-alert/90"
            >
              <ButtonLabel
                busy={state === 'deleting'}
                idle="Yes, delete all of it"
                working="Deleting…"
              />
            </button>
            {/*
              Disabled too, once the deletion is running. "Keep my data" is a promise this button can no
              longer keep at that point, and offering it would be worse than removing it.
            */}
            <button
              type="button"
              disabled={state === 'deleting'}
              onClick={() => setState('idle')}
              className="btn btn-quiet flex-1 px-4 py-2.5 text-[14px]"
            >
              Keep my data
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={state === 'exporting'}
            aria-busy={state === 'exporting'}
            onClick={() => void exportEverything()}
            className="btn btn-quiet flex-1 px-4 py-2.5 text-[14px]"
          >
            {/*
              An export gathers every stored CV, every variant and every application row and serialises
              them, so it is the slowest of the two — and the label used to stay unchanged while it ran,
              which reads as a button that swallowed the click.
            */}
            <ButtonLabel
              busy={state === 'exporting'}
              idle="Download everything we hold"
              working="Putting it together…"
            />
          </button>
          <button
            type="button"
            disabled={state === 'exporting' || state === 'billing'}
            aria-busy={state === 'billing'}
            onClick={() => void manageBilling()}
            className="btn btn-quiet flex-1 px-4 py-2.5 text-[14px]"
          >
            {/*
              "Subscription", not "Cancel". Somebody who wants to cancel finds it here, and somebody
              who wants an invoice or a new card finds it in the same place — and a button labelled
              Cancel is one nobody presses to check a receipt.
            */}
            <ButtonLabel
              busy={state === 'billing'}
              idle="Subscription and invoices"
              working="Opening…"
            />
          </button>
          <button
            type="button"
            disabled={state === 'exporting' || state === 'billing'}
            onClick={() => setState('confirming')}
            className="btn btn-quiet flex-1 px-4 py-2.5 text-[14px]"
          >
            Delete everything
          </button>
        </div>
      )}

      {state === 'none' && (
        <p role="status" className="text-meta leading-relaxed text-ink-soft">
          You do not have an account, so there is nothing stored to download or
          delete. Whatever you are working on lives in this browser tab only.
        </p>
      )}
      {message !== undefined && (
        <p
          role="status"
          className="rounded-field bg-band px-3 py-2 text-[13px] leading-relaxed text-ink"
        >
          {message}
        </p>
      )}
    </div>
  )
}
