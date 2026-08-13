/**
 * The privacy notice docs/07-privacy.md lists as required before launch: what is processed, by whom,
 * on what basis, for how long.
 *
 * Written to be *read*, not to be defensible. The audience is a nurse or a warehouse supervisor
 * deciding whether to hand over their employment history, and a page of legal boilerplate answers
 * none of the three questions they actually have — where does it go, do you keep it, can I say no.
 * So it is short, it names the company, and it uses the second person.
 *
 * Every claim here is a claim about the code, and each one has something enforcing it:
 *   • "We do not store your CV"      — ADR-004, the pipeline is stateless; nothing writes to disk.
 *   • "Your phone number and address are removed" — `src/structure/redact.ts`.
 *   • "You can say no"               — the consent gate, and `useProvider: false` in extraction.
 *   • "We never log what your CV says" — `src/lib/log.ts` emits counts and codes only.
 *
 * If one of those stops being true, this page changes in the same commit. A privacy notice that
 * drifts from the code is worse than none, because it is a promise the user relies on.
 */
import { createFileRoute } from '@tanstack/react-router'
import { useProcessingConsent } from '@/components/consent-gate'

export const Route = createFileRoute('/privacy')({ component: Privacy })

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="stencil text-[11px] text-safelight">{title}</h2>
      <div className="flex flex-col gap-2 text-[12px] leading-relaxed text-tray-enamel">
        {children}
      </div>
    </section>
  )
}

function Privacy() {
  const consent = useProcessingConsent()
  const provider =
    typeof consent.provider === 'string' && consent.provider !== ''
      ? consent.provider
      : undefined

  return (
    <div className="flex min-h-screen flex-col bg-print-black">
      <header className="bench rim mx-4 mt-4 flex items-baseline gap-3 px-4 py-3 lg:mx-6">
        <a href="/" className="stencil text-[13px] text-safelight">
          HunterReady
        </a>
        <span className="text-[10px] text-developer-gray">privacy</span>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-7 p-6 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl leading-tight text-tray-enamel">
            What we do with your CV
          </h1>
          <p className="text-[12px] leading-relaxed text-developer-gray">
            The short version: we read it, we show you what we read, and we
            forget it. There is no account and no database.
          </p>
        </div>

        <Section title="What we process">
          <p>
            Whatever is in the file you upload — your name, contact details,
            employment history, education, and anything else you have written on
            your CV. We do not ask for anything you have not already put there.
          </p>
        </Section>

        <Section title="Where it goes">
          {provider === undefined ? (
            <p>
              Nowhere. This installation has no AI provider configured, so your
              CV is read entirely on our own server and no third party sees it.
            </p>
          ) : (
            <>
              <p>
                To read a CV well we send its text to{' '}
                <strong className="text-safelight">{provider}</strong>, the
                company that runs the AI model we use. That is the only place it
                goes.
              </p>
              <p className="text-developer-gray">
                Your phone number and street address are removed before the text
                is sent. They do not help a model read a CV, so they never leave
                our server.
              </p>
              <p className="text-developer-gray">
                You can decline. We ask before your first upload, and if you say
                no, your CV is read here instead and nothing is transmitted
                anywhere. That option stays available every time.
              </p>
            </>
          )}
        </Section>

        <Section title="How long we keep it">
          <p>
            We do not. Your CV is processed in memory to answer your request and
            is gone when the request ends — it is never written to a disk or a
            database. Closing the tab loses your work, which is the honest cost
            of not storing anything.
          </p>
        </Section>

        <Section title="What we record">
          <p>
            Counts and outcomes: that a file was uploaded, its size, how many
            jobs we found, how long it took, and whether anything failed. Never
            what your CV says, never your name, never the filename.
          </p>
        </Section>

        <Section title="The legal basis">
          <p>
            Your consent, asked for before the first transfer and withdrawable
            by declining on your next upload. Since nothing is stored, there is
            nothing to request a copy of or ask us to delete — the deletion
            happens by itself, every time.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            Under the GDPR you have the right of access, correction, erasure,
            restriction, portability and objection. Most of them are answered by
            the design: we hold nothing about you. For anything else, write to{' '}
            <a
              href="mailto:eddremonts86@gmail.com"
              className="text-safelight underline underline-offset-4"
            >
              eddremonts86@gmail.com
            </a>
            .
          </p>
        </Section>

        <div className="rim flex flex-col gap-3 bg-darkroom-brown/60 p-4">
          <p className="text-[11px] leading-relaxed text-tray-enamel">
            {consent.choice === 'granted'
              ? `You have agreed to your CV being sent to ${provider ?? 'the model provider'}.`
              : consent.choice === 'declined'
                ? 'You have chosen to have your CV read on our server only.'
                : 'You have not been asked yet — we ask before your first upload.'}
          </p>
          {consent.choice !== undefined && (
            <button
              type="button"
              onClick={consent.reset}
              className="rim stencil self-start px-3 py-1.5 text-[9px] text-tray-enamel/70 transition-colors hover:bg-amber-shadow/25 hover:text-tray-enamel"
            >
              Ask me again
            </button>
          )}
        </div>

        <a
          href="/"
          className="stencil text-[10px] text-safelight/70 underline underline-offset-4 hover:text-safelight"
        >
          Back
        </a>
      </main>
    </div>
  )
}
