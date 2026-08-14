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

type State = 'idle' | 'working' | 'confirming' | 'done' | 'none' | 'error'

export function AccountControls() {
  const [state, setState] = useState<State>('idle')
  const [message, setMessage] = useState<string | undefined>()

  const exportEverything = async () => {
    setState('working')
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
    setState('working')
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

      {state === 'confirming' ? (
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
              onClick={() => void deleteEverything()}
              className="btn flex-1 bg-alert px-4 py-2.5 text-[14px] text-white hover:bg-alert/90"
            >
              Yes, delete all of it
            </button>
            <button
              type="button"
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
            disabled={state === 'working'}
            onClick={() => void exportEverything()}
            className="btn btn-quiet flex-1 px-4 py-2.5 text-[14px]"
          >
            Download everything we hold
          </button>
          <button
            type="button"
            disabled={state === 'working'}
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
