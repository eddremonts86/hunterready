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
 *   • "Your CV is stored encrypted" — `src/db/crypto.ts`, AES-256-GCM, and the page reads
 *                                      `encryptionEnabled()` from the server so it cannot claim it on an
 *                                      installation with no key (ADR-021).
 *   • "Every link expires by itself"  — `shares.expiresAt` is `notNull`, `SHARE_DAYS` is the default and
 *                                      `SHARE_MAX_DAYS` the ceiling, clamped in `createShare`. There is
 *                                      no code path that creates a share without an expiry.
 *   • "We do not record who opened it" — `readShare` increments a counter and writes one `share.viewed`
 *                                      audit row against the *owner*. No visitor, no address, no time
 *                                      series.
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

export const Route = createFileRoute('/privacy')({
  component: Privacy,
  /**
   * Its own title. It inherited the root's — *"HunterReady — a CV automated screening can actually
   * read"* — which is a marketing line on the page somebody opens to decide whether to trust us with
   * their employment history, and it makes the tab unfindable among a dozen others.
   */
  head: () => ({
    meta: [
      { title: 'What we do with your CV | HunterReady' },
      {
        name: 'description',
        content:
          'What HunterReady processes, who sees it, how long it is kept, and how to delete it.',
      },
    ],
  }),
})

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
  /**
   * Read from the server, not asserted here.
   *
   * The page must not be able to claim encryption on an installation with no `DATA_ENCRYPTION_KEY`.
   * Same discipline as naming the provider: a statement about what this server does comes from the
   * server (ADR-021).
   */
  /**
   * Three states, not two, and the third one is why this is a `?:` rather than a boolean.
   *
   * `encryptsAtRest` is `undefined` until `/api/processing` answers. Collapsing that to `false` made
   * the page assert *"this installation stores your CV without encryption"* for the second or two
   * before the server replied — on an installation that encrypts. A privacy notice briefly saying the
   * worse of two things about itself is still a privacy notice saying something untrue, and it fooled
   * me during a production walk, which is exactly the audience it must not fool.
   */
  const encrypted = consent.encryptsAtRest
  const knowsEncryption = encrypted !== undefined
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
            {RETENTION_DAYS} days after your last visit and then delete it, and
            you can delete it yourself at any moment.
          </p>
        </div>

        <Section title="What we process">
          <p>
            Whatever is in the file you upload: your name, contact details,
            employment history, education, and anything else you have written on
            your CV. We do not ask for anything you have not already put there.
          </p>
        </Section>

        <Section title="Where it goes">
          {provider === undefined ? (
            /*
              True for almost everybody since ADR-023, and worded about what *happens* rather than about
              how the server is configured. The old copy said "this installation has no AI provider
              configured", which stops being the reason the moment a paid tier exists and would have
              been a false explanation of a true fact.
            */
            <p>
              Nowhere. Your CV is read by a model running on our own server, so
              it never leaves our machines and no other company sees it. That is
              the default, and for most people it is the only thing that ever
              happens.
            </p>
          ) : (
            <>
              <p>
                We send your CV's text to{' '}
                <strong className="font-semibold text-ink">{provider}</strong>,
                the company that runs the AI model we use.{' '}
                <strong className="font-semibold text-ink">
                  That is the only place it goes
                </strong>{' '}
                and never to an advertiser, a recruiter, a job board, or anyone
                else.
              </p>
              {/*
                The purposes, enumerated, because "to read a CV" stopped being the whole truth the
                moment this product could also rewrite, aim, write and translate. GDPR asks for the
                purposes and not only the recipient, and a reader who agreed to "reading" has not
                agreed to "translating". Anything added to src/optimize/ that calls a model belongs on
                this list on the same day it ships.
              */}
              <p className="text-ink-soft">
                It goes there for the things you ask for, and only those:
                reading your file into fields, suggesting stronger wording for a
                bullet, aiming your summary at an advert you pasted, reading
                that advert, drafting a cover letter, and translating your
                document when you switch its language. Nothing runs on its own.
                Each of those starts with a button you press.
              </p>
              <p className="text-ink-soft">
                Your phone number and street address are removed{' '}
                <strong className="font-semibold text-ink">
                  when we first read your file
                </strong>
                . They do not help a model read a CV, so they never leave our
                server. The later features send only the part they work on: a
                bullet, your summary, the section being translated, and your
                phone number, email address and links are not among them.
              </p>
              <p className="text-ink-soft">
                You can decline, and you can change your mind at any time under{' '}
                <strong className="font-semibold text-ink">Account</strong>. If
                you say no, everything above runs on a model on our own server
                instead. It never leaves our machines, and no other company sees
                it. It is a smaller model, so you may have a little more to
                correct.
              </p>
              {/*
                This paragraph used to say the transfer could not happen without a paid plan, full
                stop. While ADR-030's suspension is on that is **false for the commonest visitor**, and
                a privacy notice carrying a comforting sentence that no longer holds is worse than one
                that never made the promise. It reads the same server answer the consent gate does:
                `provider` is named only to somebody who can actually reach it.
              */}
              <p className="text-ink-soft">
                {consent.plan === 'pro' ? (
                  'Your plan includes the larger model, so this choice is yours to make and to change.'
                ) : (
                  <>
                    This is offered to everyone at the moment, account or not.
                    It is normally part of the paid plan. We have opened it up
                    while the model on our own server is too slow on the machine
                    it runs on to be worth waiting for.{' '}
                    <strong className="font-semibold text-ink">
                      Declining still works exactly as described above
                    </strong>
                    , and costs you only some accuracy and some time.
                  </>
                )}
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
            store it. That is the point of the account, and it would be
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
          {/*
            Stated with its limit in the same paragraph. "Encrypted at rest" is a phrase that does a lot
            of reassuring work and most products leave it there; on one server the key is on the same
            machine, and a reader deciding whether to trust us is entitled to that sentence too.
          */}
          {encrypted ? (
            <p>
              While we hold it,{' '}
              <strong className="font-semibold text-ink">
                your CV is stored encrypted
              </strong>
              . If someone got hold of our disk or a backup copy, what they
              would find is unreadable without a key that is not in it. Being
              straight about the limit: the key lives on the same server as the
              data, so this protects a stolen copy and not someone who has
              broken into the server itself.
            </p>
          ) : knowsEncryption ? (
            <p>
              This installation stores your CV without encryption. That is worth
              knowing rather than hiding: it means a copy of our database would
              be readable.
            </p>
          ) : (
            /* Neither claim, until the server has made one. "Checking" is the only true sentence here. */
            <p className="text-ink-soft">Checking how this server stores it…</p>
          )}
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
            account, because an audit trail the audited person can erase would
            not be one. Your identity is removed from them, so what is left says
            that
            <em> a</em> record was read, not whose.
          </p>
        </Section>

        {/*
          Share links get their own section rather than a clause inside another one. It is the only
          feature here that makes a CV readable without a password, so burying it in a paragraph about
          storage would be the kind of omission this page exists not to make.
        */}
        <Section title="If you share a link">
          <p>
            You can create a link that lets anyone read one of your CVs without
            signing in. While it is open, anyone who has the link can read that
            CV and download it as a PDF, including someone it was forwarded to.
          </p>
          <p>
            Every link{' '}
            <strong className="font-semibold text-ink">
              expires by itself after two weeks
            </strong>
            , and you can close one sooner from your account. There is no such
            thing here as a link that never expires; we did not build one on
            purpose, because a forgotten link that still works is the way a CV
            ends up somewhere nobody intended.
          </p>
          <p className="text-ink-soft">
            We count how many times a link has been opened so you can see
            whether it was used. We do not record who opened it, or when. That
            would be a log of people reading your CV, which is not ours to keep.
            Links are never shown to search engines.
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
            they are answered by two buttons rather than a support email:
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
            {/*
              Named, because a notice saying "you agreed to a transfer" is the ToS checkbox this page
              exists to be the opposite of. With more than one company on offer, which one you picked
              is the whole content of the answer.
            */}
            {consent.chosenName !== undefined
              ? `You have agreed to your CV being sent to ${consent.chosenName}.`
              : consent.choice !== undefined
                ? 'You have chosen to have your CV read on our server only.'
                : 'You have not been asked yet. We ask before your first upload.'}
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
