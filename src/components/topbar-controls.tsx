/**
 * The two things that were hidden inside a tab, put in the header where they belong.
 *
 * ## Why they moved
 *
 * Edd, looking at the Account panel: *"este panel de login/sign up escondido aquí no tiene sentido"*.
 * He is right, and it was worse than untidy. Both of these are **global facts about the session**, not
 * steps in editing a CV:
 *
 *  • **Who you are.** Signing in lived behind `?panel=account`, which only exists once a CV is loaded —
 *    so on the landing page, the screen most visitors see first, there was no way to sign in at all.
 *    A returning customer had to upload a CV they had already saved in order to find the door.
 *  • **Which model reads it.** The choice was reachable from one tab of one screen, while the thing it
 *    governs — where the text of somebody's CV goes — applies to every screen there is.
 *
 * ## The locked option is drawn, not hidden
 *
 * ADR-023 makes the larger model the paid capability, and `mayUseThirdParty` is an `&&` of plan and
 * consent, so the server overrules a client that asks for what it has not paid for. The audit's P0 was
 * that we offered the choice anyway — a button that lies. The answer is not to hide it: somebody who
 * cannot see what they would get has no reason to buy it. So it is **shown, and clicking it explains
 * what the larger model does better**, with numbers we actually measured rather than adjectives.
 */
import { useEffect, useRef, useState } from 'react'
import { SignIn } from '@/components/sign-in'
import { signOut } from '@/lib/auth-client'
import { PRO_IN_BETA, ProTag } from '@/components/pro-tag'
import { LOCAL } from '@/components/consent-gate'
import type { ConsentChoice } from '@/components/consent-gate'

/** Shuts a popover on Escape and on a click outside it — the two things every popover must do. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    const onDown = (event: MouseEvent) => {
      if (ref.current !== null && !ref.current.contains(event.target as Node)) {
        close()
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, close])
  return ref
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="lift absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-card border border-hairline bg-ground p-4">
      {children}
    </div>
  )
}

/**
 * Signed out: a "Sign in" button. Signed in: the account, and the way out of it.
 *
 * The label is deliberately not an avatar with a mystery-meat dropdown. On a product used once a
 * fortnight by people who are not sure whether they ever made an account, a word beats a picture.
 */
export function AccountMenu({
  plan,
  onOpenAccount,
}: {
  /** `pro`, `free`, or `anonymous` when there is no session. Undefined until the server answers. */
  plan?: string
  /** Opens the Account panel, when there is a workspace to open it in. */
  onOpenAccount?: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  const signedIn = plan === 'pro' || plan === 'free'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={
          signedIn
            ? 'btn btn-quiet h-9 px-3.5 text-[13px]'
            : 'btn btn-primary h-9 px-4 text-[13px]'
        }
      >
        {signedIn ? 'Account' : 'Sign in'}
      </button>

      {open && (
        <Panel>
          {signedIn ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-semibold text-ink">
                  You are signed in
                </span>
                {plan === 'pro' && (
                  <span className="inline-flex h-6 items-center rounded-full bg-signal px-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-white">
                    Pro
                  </span>
                )}
              </div>
              <p className="text-[13px] leading-relaxed text-ink-soft">
                {plan === 'pro'
                  ? 'Your CVs are saved between visits, and the larger model is available to you.'
                  : 'Your CVs are saved between visits, and the larger model is open to everyone for now.'}
              </p>
              {onOpenAccount !== undefined && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onOpenAccount()
                  }}
                  className="btn btn-quiet px-4 py-2 text-[13px]"
                >
                  Saved CVs, export and deletion
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  void signOut().then(() => window.location.reload())
                }}
                className="self-start rounded-full px-2 py-1 text-[13px] text-ink-soft transition-colors hover:bg-band hover:text-ink"
              >
                Sign out
              </button>
            </div>
          ) : (
            /*
              The whole sign-in form, in the header, on every screen — including the landing page,
              where until now there was no way in at all.
            */
            <SignIn compact onSignedIn={() => window.location.reload()} />
          )}
        </Panel>
      )}
    </div>
  )
}

/**
 * Which model is reading this CV, and what the other one would do differently.
 *
 * Shown as the current state, not as a menu of two: on a header there is room for one true sentence,
 * and "Read here" is the fact somebody actually wants confirmed at a glance.
 */
export function ModelMenu({
  providers,
  choice,
  onDecide,
}: {
  /** Every model this visitor may choose between. Empty when none is available to them. */
  providers: ReadonlyArray<{ id: string; name: string }>
  choice?: ConsentChoice
  onDecide: (choice: ConsentChoice) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  const entitled = providers.length > 0
  const chosen = providers.find((p) => p.id === choice)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Which model reads your CV"
        className="flex h-9 items-center gap-2 rounded-full border border-hairline-strong px-3 text-[13px] font-medium text-ink transition-colors hover:bg-band"
      >
        <span
          aria-hidden
          className={`h-2 w-2 rounded-full ${chosen === undefined ? 'bg-affirm' : 'bg-signal'}`}
        />
        {/*
          The label stays at every width. It used to be `hidden sm:inline`, which left a phone with a
          bare coloured dot in a pill: a control that says nothing about itself, on the one screen
          where there is no hover to reveal it.
        */}
        <span>{chosen?.name ?? 'Read here'}</span>
      </button>

      {open && (
        <Panel>
          <div className="flex flex-col gap-3">
            <span className="text-[15px] font-semibold text-ink">
              Who reads your CV
            </span>

            <button
              type="button"
              onClick={() => onDecide(LOCAL)}
              aria-pressed={chosen === undefined}
              className="choice flex-col items-start gap-1 px-3.5 py-3 text-left"
            >
              <span className="text-[14px] font-semibold">Our own server</span>
              <span className="text-[12px] leading-relaxed text-ink-soft">
                A small model on our own hardware. Your CV never leaves this
                machine. Free, always.
              </span>
            </button>

            {/*
              One per company, named, and the choice records which — see `consent-gate.tsx`. This is
              the same decision the gate asks on the first upload; this is where it is changed
              afterwards, which is what makes the gate's promise true rather than a one-time formality.
            */}
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onDecide(p.id)}
                aria-pressed={chosen?.id === p.id}
                className="choice flex-col items-start gap-1 px-3.5 py-3 text-left"
              >
                {/*
                  Tagged, because "Our own server" directly above says "Free, always" and these two
                  are the ones that will not be. Without the tag the only priced thing in the list is
                  the one that is permanently free, which reads as the opposite of the truth.
                */}
                <span className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold">{p.name}</span>
                  <ProTag />
                </span>
                <span className="text-[12px] leading-relaxed text-ink-soft">
                  {`Its text goes to ${p.name} and nowhere else; we keep no copy.`}
                </span>
              </button>
            ))}

            {!entitled && (
              <button
                type="button"
                aria-pressed={false}
                /*
                  Not `disabled`. A disabled control tells somebody they cannot have a thing and
                  nothing about what the thing is; this one is pressable and answers the question
                  underneath it. The server still decides — `mayUseThirdParty` is plan AND consent —
                  which is exactly why it can be safely clickable.
                */
                className="choice flex-col items-start gap-1 px-3.5 py-3 text-left"
              >
                <span className="flex items-center gap-2 text-[14px] font-semibold">
                  A larger model
                  <span className="rounded-full bg-signal-wash px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.05em] text-signal">
                    Pro
                  </span>
                </span>
                <span className="text-[12px] leading-relaxed text-ink-soft">
                  Faster, and it finds better wording on more of your lines. Its
                  text would go to one named provider and nowhere else.
                </span>
              </button>
            )}

            {!entitled && <UpgradeNote />}
          </div>
        </Panel>
      )}
    </div>
  )
}

/**
 * Why the larger model is worth paying for — measured, not adjectives.
 *
 * Every number here comes from `rewrite-quality.test.ts` and ADR-027, and it stays that way. The
 * temptation in an upsell is to write "10x better wording"; this product's entire proposition is that
 * it does not say things it cannot show, and a landing page that lies about the model is not made
 * honest by a privacy page that does not.
 */
function UpgradeNote() {
  return (
    <div className="flex flex-col gap-2 rounded-choice bg-band p-3.5">
      <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
        What the larger model changes
        <ProTag />
      </span>
      <ul className="flex flex-col gap-1.5 text-[12px] leading-relaxed text-ink-soft">
        <li>
          <span className="font-semibold text-ink">It answers every line.</span>{' '}
          Measured across our fixtures, the small model has nothing to say about
          roughly one bullet in eight.
        </li>
        <li>
          <span className="font-semibold text-ink">It is not a wait.</span> One
          pass over a CV on our own hardware is minutes; on the larger model it
          is seconds.
        </li>
        <li>
          {/* 60 was the catalogue two releases ago. It is 103, and the landing page counts them. */}
          <span className="font-semibold text-ink">
            All 103 designs, not 12.
          </span>{' '}
          And your CVs saved between visits.
        </li>
      </ul>
      <p className="text-[12px] leading-relaxed text-ink-soft">
        The same rule holds on both: nothing is invented, and no claim moves
        between employers.
      </p>
      {/*
        TODO(payments): no gateway yet — Edd's call, and deliberately not urgent. `auth_users.plan` is
        already the switch; a provider only has to write to it. See docs/08-roadmap.md.

        This used to read "Paid plans are not open yet", which was the whole story when the gate was
        shut. During beta the gate is open (`betaPaidFree`), so that sentence would leave somebody
        already using the larger model reading that they cannot have it.
      */}
      <p className="text-[12px] font-medium text-ink">{PRO_IN_BETA}</p>
    </div>
  )
}
