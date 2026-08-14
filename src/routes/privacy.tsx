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
 *   • "Without an account we keep nothing" — ADR-004; the stateless path still writes nothing at all.
 *   • "90 days, then deleted"        — `RETENTION_DAYS`, the `delete_after` column, and the sweep in
 *                                      `scripts/db/retention.mjs`. One definition, three users.
 *   • "You can delete it yourself"   — `/api/account/delete`, a single cascading statement.
 *   • "Your phone number and address are removed" — `src/structure/redact.ts`.
 *   • "You can say no"               — the consent gate, and `useProvider: false` in extraction.
 *   • "We never log what your CV says" — `src/lib/log.ts` emits counts and codes only.
 *
 * If one of those stops being true, this page changes in the same commit. A privacy notice that
 * drifts from the code is worse than none, because it is a promise the user relies on.
 */
import { createFileRoute } from '@tanstack/react-router'
import { useProcessingConsent } from '@/components/consent-gate'
import { AccountControls } from '@/components/account-controls'
import { RETENTION_DAYS } from '@/db/retention-policy'

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
            The short version: we read it, we show you what we read, and if you
            have not signed in, we forget it. If you have, we keep it for{' '}
            {RETENTION_DAYS} days after your last visit and then delete it — and
            you can delete it yourself at any moment.
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
            <strong className="text-safelight">
              If you do not have an account, we do not keep it at all.
            </strong>{' '}
            Your CV is processed in memory to answer your request and is gone
            when the request ends. Closing the tab loses your work, which is the
            honest cost of not storing anything.
          </p>
          <p>
            If you sign in so we can remember your CV between visits, then we do
            store it — that is the point of the account, and it would be
            dishonest to describe it any other way. We keep it for{' '}
            <strong className="text-safelight">{RETENTION_DAYS} days</strong>{' '}
            after the last time you sign in, and then we delete it: your CV, any
            tailored versions, and the account itself. Signing in resets that
            clock, so nothing disappears while you are still using it.
          </p>
          <p className="text-developer-gray">
            The deletion is real, not a flag on a row. It happens whether or not
            you ask, and you can also ask at any moment with the button below.
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
            by declining on your next upload. If you create an account, storing
            your CV rests on the same basis: you asked us to remember it, and
            you can withdraw that by deleting it.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            Under the GDPR you have the right of access, correction, erasure,
            restriction, portability and objection. Without an account they are
            answered by the design, because we hold nothing about you. With one,
            they are answered by two buttons rather than a support email —
            download everything we hold, or delete all of it, both below. For
            anything else, write to{' '}
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

        {/*
          The Article 15 and 17 controls sit on this page rather than behind a settings menu, because
          this is the page somebody reads when they are deciding whether to trust us. A rights
          section that describes a right without offering it is an advertisement.
        */}
        <AccountControls />

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
