/**
 * The page a share link opens — v0.9.
 *
 * ## Whose page this is
 *
 * Not the candidate's. Every other screen in this product is built for the person editing their CV; this
 * one is for a recruiter who was sent a link, and the only thing they want is the document. So the chrome
 * is almost nothing: the sheet, who it belongs to, and one line saying how long the link lasts.
 *
 * ## Read-only, and visibly so
 *
 * No edit fields, no rewrite suggestions, no gap report, no account controls. The download is offered
 * because that is what a recruiter does next, and it is the same document already on screen — refusing it
 * would protect nothing and cost the feature its purpose.
 *
 * ## One message for every failure
 *
 * Revoked, expired, unknown and deleted all show the same thing, because distinguishing them tells a
 * visitor holding a guessed URL whether a CV exists. The copy is written for the honest case — somebody
 * following a link that has aged out — and says what to do about it.
 */
import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { PaperPreview } from '@/components/paper-preview'
import { Resume } from '@/schema/resume'
import { getTheme } from '@/render/themes'
import { templates } from '@/render/templates/registry'

export const Route = createFileRoute('/s/$token')({
  component: SharedCv,
  head: () => ({
    meta: [
      // Belt and braces with the `X-Robots-Tag` on `/api/shared`. A CV in a search index is a leak that
      // outlives the link it came from.
      { name: 'robots', content: 'noindex, nofollow, noarchive' },
      { title: 'A shared CV — HunterReady' },
    ],
  }),
})

interface Shared {
  resume: Resume
  label: string
  expiresAt: string
}

/** "until 28 August" — the date, because a recruiter wants to know if they can come back to it. */
function until(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
}

function SharedCv() {
  const { token } = Route.useParams()
  const [shared, setShared] = useState<Shared | undefined>()
  const [state, setState] = useState<'loading' | 'ready' | 'gone'>('loading')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(
          `/api/shared?token=${encodeURIComponent(token)}`,
        )
        if (!response.ok) {
          if (!cancelled) setState('gone')
          return
        }
        const payload = (await response.json()) as {
          resume?: unknown
          label?: string
          expiresAt?: string
        }
        const parsed = Resume.safeParse(payload.resume)
        if (!parsed.success) {
          if (!cancelled) setState('gone')
          return
        }
        if (cancelled) return
        setShared({
          resume: parsed.data,
          label: payload.label ?? '',
          expiresAt: payload.expiresAt ?? '',
        })
        setState('ready')
      } catch {
        if (!cancelled) setState('gone')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-band">
        <p className="text-[14px] text-ink-soft">Opening the CV…</p>
      </div>
    )
  }

  if (state === 'gone' || shared === undefined) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ground px-6 text-center">
        <h1 className="text-display text-ink">
          This link is no longer open
          <span className="text-signal">.</span>
        </h1>
        {/*
          Deliberately says nothing about *why*. Revoked, expired, unknown and deleted are one message,
          because distinguishing them confirms to somebody holding a guessed URL that a CV exists.
        */}
        <p className="max-w-[54ch] text-[15px] leading-relaxed text-ink-soft">
          Share links expire, and the person who sent it can close it at any
          time. Ask them for a new one.
        </p>
        <a href="/" className="btn btn-quiet mt-2 px-4 py-2.5 text-[14px]">
          What this is
        </a>
      </div>
    )
  }

  const template = templates['modern-intl']
  const theme = getTheme('modern')

  return (
    <div className="flex min-h-screen flex-col bg-band">
      <header className="sticky top-0 z-20 border-b border-hairline bg-ground/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1100px] items-center justify-between gap-4 px-4 sm:px-6">
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[15px] font-semibold text-ink">
              {shared.resume.basics.fullName}
            </span>
            {shared.label !== '' && (
              <span className="truncate text-meta text-ink-soft">
                {shared.label}
              </span>
            )}
          </span>
          {/*
            The same POST the owner's download uses. It is the document already on screen, so withholding
            it would protect nothing and cost the feature its only purpose.
          */}
          <form
            method="POST"
            action="/api/render?template=modern-intl&theme=modern&download=1"
          >
            <input
              type="hidden"
              name="resume"
              value={JSON.stringify(shared.resume)}
            />
            <button
              type="submit"
              className="btn btn-primary shrink-0 px-4 py-2 text-[13px]"
            >
              Download the PDF
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-3 px-4 py-5 sm:px-6">
        {shared.expiresAt !== '' && (
          <p className="text-meta text-ink-soft">
            This link is open until {until(shared.expiresAt)}. It was shared
            with you by {shared.resume.basics.fullName}, who can close it at any
            time.
          </p>
        )}
        <div className="card flex min-h-[70vh] flex-1 flex-col overflow-hidden">
          <PaperPreview
            resume={shared.resume}
            theme={theme}
            Template={template.Component}
          />
        </div>
      </main>
    </div>
  )
}
