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
 *   • "We keep a log of when it was read" — the `access_log` table, written by `record()` in
 *                                      `src/db/repository.ts` and included in the export.
 *
 * One of these was false for a while and it is worth recording how. The sentence about storing a CV for
 * an account holder was written when the schema landed, and the code that would have stored anything was
 * unreachable: `SignIn` was on no screen, so no session existed, so nothing was saved. The page
 * over-disclosed rather than under-disclosed, which is the less dangerous direction and still wrong —
 * this is the document somebody uses to decide whether to trust us, and a claim it makes has to be one
 * the code performs.
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
    <section className="flex flex-col gap-2.5">
      <h2 className="text-title text-ink">{title}</h2>
      {/*
        A real reading measure. This page exists to be read end to end by somebody deciding whether
        to trust us, so the column is capped near 70 characters and the body is set at 15px on the
        primary ink — not the secondary gray that legal pages default to.
      */}
      <div className="flex max-w-[68ch] flex-col gap-2.5 text-[15px] leading-relaxed text-ink">
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
    <div className="flex min-h-screen flex-col bg-ground">
      <header className="sticky top-0 z-20 border-b border-hairline bg-ground/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-4 px-5">
          <a
            href="/"
            className="font-bold tracking-[-0.03em] text-ink text-[17px]"
          >
            HunterReady<span className="text-signal">.</span>
          </a>
          <span className="text-meta text-ink-soft">Privacy</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-9 px-5 py-12 lg:py-16">
        <div className="flex flex-col gap-4">
          <h1 className="text-hero text-ink">
            What we do with your CV
            <span className="text-signal">.</span>
          </h1>
          {/* The whole page in four lines, set as a lead. Somebody who reads only this is not
              misinformed — which is the test a privacy summary has to pass. */}
          <p className="max-w-[62ch] text-lead text-ink-soft">
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
                <strong className="font-semibold text-ink">{provider}</strong>,
                the company that runs the AI model we use. That is the only
                place it goes.
              </p>
              <p className="text-ink-soft">
                Your phone number and street address are removed before the text
                is sent. They do not help a model read a CV, so they never leave
                our server.
              </p>
              <p className="text-ink-soft">
                You can decline. We ask before your first upload, and if you say
                no, your CV is read by a model running on our own server instead
                — it never leaves our machines, and no other company sees it. It
                is a smaller model, so you may have a little more to correct.
                That option stays available every time.
              </p>
            </>
          )}
        </Section>

        <Section title="How long we keep it">
          <p>
            <strong className="font-semibold text-ink">
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
            <strong className="font-semibold text-ink">
              {RETENTION_DAYS} days
            </strong>{' '}
            after the last time you sign in, and then we delete it: your CV, any
            tailored versions, and the account itself. Signing in resets that
            clock, so nothing disappears while you are still using it.
          </p>
          <p className="text-ink-soft">
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
          {/*
            The access log is a thing we hold, so it is named here rather than left to be discovered in
            an export. It is also the one record that deliberately outlives an erasure — a log that can
            be deleted by the person it logs is not an audit trail — so saying that plainly, along with
            the fact that nothing identifying stays in it, is the only honest way to keep it.
          */}
          <p>
            If you have an account we also keep a log of when your stored CV was
            read, changed or exported, and whether it was you or us who did it.
            That is there so nobody can look at your data without leaving a
            trace, including us. It records the action and the time, never the
            content.
          </p>
          <p className="text-ink-soft">
            Those log entries are the one thing that survives deleting your
            account — an audit trail the audited person can erase would not be
            one. Your identity is removed from them, so what is left says that
            <em> a</em> record was read, not whose.
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
              className="font-medium text-signal underline decoration-signal/30 underline-offset-4 hover:decoration-signal"
            >
              eddremonts86@gmail.com
            </a>
            .
          </p>
        </Section>

        {/* Where you stand right now, on the page that explains the choice. A privacy notice that
            cannot tell you what you already agreed to is asking you to remember for it. */}
        <div className="flex flex-col items-start gap-3 rounded-card border border-signal-edge bg-signal-wash p-5">
          <p className="text-[15px] leading-relaxed text-ink">
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
              className="btn btn-quiet px-4 py-2 text-[14px]"
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
          className="btn btn-quiet self-start px-4 py-2.5 text-[14px]"
        >
          Back to your CV
        </a>
      </main>
    </div>
  )
}
