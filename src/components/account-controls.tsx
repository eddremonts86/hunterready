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
    <div className="rim flex flex-col gap-3 bg-darkroom-brown/60 p-4">
      <h2 className="stencil text-[11px] text-safelight">Your data</h2>

      {state === 'confirming' ? (
        <div className="flex flex-col gap-3">
          {/*
            Names what goes, rather than asking "are you sure?". A confirmation that repeats the
            question adds a click and no information.
          */}
          <p className="text-[12px] leading-relaxed text-tray-enamel">
            This deletes your CV, every tailored version you have made, the
            record of where you applied, and the account itself. It happens
            immediately and cannot be undone.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void deleteEverything()}
              className="rim stencil flex-1 px-3 py-2 text-[9px] text-tray-enamel transition-colors hover:bg-amber-shadow/25"
            >
              Yes, delete all of it
            </button>
            <button
              type="button"
              onClick={() => setState('idle')}
              className="rim stencil flex-1 px-3 py-2 text-[9px] text-tray-enamel/70 transition-colors hover:bg-amber-shadow/25 hover:text-tray-enamel"
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
            className="rim stencil flex-1 px-3 py-2 text-[9px] text-tray-enamel transition-colors hover:bg-amber-shadow/25 disabled:opacity-50"
          >
            Download everything we hold
          </button>
          <button
            type="button"
            disabled={state === 'working'}
            onClick={() => setState('confirming')}
            className="rim stencil flex-1 px-3 py-2 text-[9px] text-tray-enamel transition-colors hover:bg-amber-shadow/25 disabled:opacity-50"
          >
            Delete everything
          </button>
        </div>
      )}

      {state === 'none' && (
        <p
          role="status"
          className="text-[10px] leading-relaxed text-developer-gray"
        >
          You do not have an account, so there is nothing stored to download or
          delete. Whatever you are working on lives in this browser tab only.
        </p>
      )}
      {message !== undefined && (
        <p
          role="status"
          className="text-[10px] leading-relaxed text-tray-enamel/80"
        >
          {message}
        </p>
      )}
    </div>
  )
}
