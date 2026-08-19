/**
 * Consent, before a CV leaves this machine.
 *
 * docs/07-privacy.md: *"Explicit consent before the first call, naming the provider — not buried in a
 * ToS checkbox."* What shipped until now was a sentence under the dropzone describing the transfer.
 * That is a **notice**, not consent: the person had already chosen their file, and nothing asked them
 * anything. The difference is the whole legal basis, and it is also just the honest thing.
 *
 * Three decisions worth stating, because each one is the opposite of the industry default:
 *
 *  • **The provider is named.** "A third-party AI provider" satisfies a checkbox and not a person.
 *    They are agreeing to a transfer to a company; they are entitled to know which one first. The
 *    name is fetched at run time because it is a deploy-time decision (`/api/processing`).
 *
 *  • **Declining is a real option that still works well.** It does not mean "we will do our best with
 *    regular expressions" — it means a model running on our own server, where the document never
 *    leaves the machine it was uploaded to. That distinction is the whole difference between a privacy
 *    option and a privacy penalty: if the private choice is also the bad choice, nobody takes it and
 *    the option was decoration.
 *
 *  • **Only asked of somebody it can happen to.** Since ADR-023 the third-party model is a paid
 *    capability, and `/api/processing` reports no provider to an anonymous or free visitor — so this
 *    gate never appears for them. That falls out of the existing rule below rather than needing a new
 *    one, and it is the right behaviour: asking permission for a transfer that cannot occur trains
 *    people to click through consent screens.
 *  • **When nothing is configured, nothing is asked.** If no model provider is set, no transfer will
 *    happen, and requesting consent for it would be theatre.
 *
 * The answer is remembered in `localStorage` so it is asked once. It is a preference about this
 * browser, not an account, and it is not sent anywhere.
 */
import { useEffect, useState } from 'react'

import { useInBeta } from '@/components/pro-tag'

const STORAGE_KEY = 'hunterready.processing-consent.v1'

/**
 * Which model reads this CV: one of the named companies, or our own machine.
 *
 * It used to be `'granted' | 'declined'`, which was the right shape while there was exactly one
 * company to grant anything to. There are two now, and the difference is not cosmetic: docs/07's rule
 * is consent to a **named provider**, so "granted" no longer identifies what was agreed to. Sending a
 * CV to DeepSeek on the strength of a yes given about MiniMax is precisely the transfer nobody agreed
 * to, and a two-state flag cannot tell the two apart.
 */
export type ConsentChoice = 'local' | (string & {})

/** The one that means "nothing leaves this machine". Not a provider id, and never will be one. */
export const LOCAL: ConsentChoice = 'local'

interface StoredConsent {
  /** `local`, or the id of the provider that was named at the time. */
  choice: ConsentChoice
  /**
   * Every provider on offer when the answer was given, joined.
   *
   * Not just the chosen one. If the deployment gains a company, the person was never shown that name
   * and their old answer cannot speak for it — the honest thing is to ask again rather than to treat
   * an answer about a shorter list as an answer about a longer one.
   */
  offered: string
  at: string
}

/** The providers a stored answer was given against, in a stable order for comparison. */
function fingerprint(providers: ReadonlyArray<{ id: string }>): string {
  return providers
    .map((p) => p.id)
    .sort()
    .join(',')
}

export interface ConsentState {
  /** Undefined while we are still asking the server who processes CVs. */
  provider?: string | null
  /** Every model this visitor may choose between. Empty when none is available to them. */
  providers: Array<{ id: string; name: string }>
  /** The name of the chosen one, for the chip and the copy. Undefined when the choice is local. */
  chosenName?: string
  /**
   * Whether this installation encrypts stored CVs (ADR-021). Undefined until the server has answered.
   *
   * It rides along with the provider question because it is the same kind of fact — something only the
   * deployment knows about what happens to a CV — and `/privacy` must read it rather than assert it, so
   * the page cannot claim encryption on an installation with no key.
   */
  encryptsAtRest?: boolean
  /** The account's plan — `pro`, `free`, `anonymous` — for the topbar chip. */
  plan?: string
  /**
   * Whether this visitor may use the paid designs. Undefined until the server has answered.
   *
   * It rides along here for the same reason `encryptsAtRest` does: this hook is already the one place
   * that asks the server what is true of *this* caller, and a second fetch of the same endpoint from a
   * second hook would be two sources for one answer.
   *
   * Advisory. The gate is `/api/render`, which refuses a locked pairing regardless of what any client
   * believes about itself.
   */
  paidDesigns?: boolean
  /**
   * Whether the product still calls itself beta. `undefined` until the server has answered.
   *
   * Rides along for the same reason `paidDesigns` does: this hook is already the one place that asks
   * the server what is true of this deployment. Read it as `beta !== false`, so the interface keeps
   * saying what it says today while the answer is in flight — the alternative is a "Beta" chip that
   * blinks into existence a moment after every page load.
   */
  beta?: boolean
  choice?: ConsentChoice
  decide: (choice: ConsentChoice) => void
  reset: () => void
}

function read(): StoredConsent | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return undefined
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'choice' in parsed &&
      'offered' in parsed
    ) {
      return parsed as StoredConsent
    }
  } catch {
    // A corrupt or unavailable store means we ask again. Asking twice is a small cost; assuming
    // consent we cannot evidence is not.
  }
  return undefined
}

export function useProcessingConsent(): ConsentState {
  const [provider, setProvider] = useState<string | null | undefined>(undefined)
  const [providers, setProviders] = useState<
    Array<{ id: string; name: string }>
  >([])
  /** Whether this installation encrypts stored CVs. `undefined` until asked — see `/api/processing`. */
  const [encryptsAtRest, setEncryptsAtRest] = useState<boolean | undefined>(
    undefined,
  )
  const [paidDesigns, setPaidDesigns] = useState<boolean | undefined>(undefined)
  const [beta, setBeta] = useState<boolean | undefined>(undefined)
  /** The account's plan, for the topbar chip. `anonymous` when there is no session. */
  const [plan, setPlan] = useState<string | undefined>(undefined)
  const [choice, setChoice] = useState<ConsentChoice | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void fetch('/api/processing')
      .then(
        (response) =>
          response.json() as Promise<{
            provider: string | null
            providers?: Array<{ id: string; name: string }>
            encryptsAtRest?: boolean
            paidDesigns?: boolean
            beta?: boolean
            plan?: string
          }>,
      )
      .then((data) => {
        if (cancelled) return
        setProvider(data.provider)
        const offered = Array.isArray(data.providers) ? data.providers : []
        setProviders(offered)
        setEncryptsAtRest(data.encryptsAtRest === true)
        setPaidDesigns(data.paidDesigns === true)
        // `!== false`, not `=== true`: an older server that does not send the field is in beta.
        setBeta(data.beta !== false)
        setPlan(typeof data.plan === 'string' ? data.plan : undefined)
        const stored = read()
        /**
         * A stored answer only counts for the provider it was given about. If the deployment moves
         * from one company to another, the person consented to a transfer that is no longer the one
         * being made, and they are asked again.
         */
        if (stored !== undefined && stored.offered === fingerprint(offered)) {
          setChoice(stored.choice)
        }
      })
      .catch(() => {
        // If we cannot find out who processes CVs, we do not guess and we do not ask. The upload
        // path stays available; extraction will fall back to the local rules if there is no provider.
        if (!cancelled) setProvider(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const decide = (next: ConsentChoice) => {
    setChoice(next)
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          choice: next,
          offered: fingerprint(providers),
          at: new Date().toISOString(),
        } satisfies StoredConsent),
      )
    } catch {
      // Private browsing. The choice still holds for this session.
    }
  }

  const reset = () => {
    setChoice(undefined)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* nothing to clear */
    }
  }

  return {
    provider,
    providers,
    chosenName: providers.find((p) => p.id === choice)?.name,
    encryptsAtRest,
    paidDesigns,
    beta,
    plan,
    choice,
    decide,
    reset,
  }
}

/** True when a decision is genuinely required: a provider exists and nobody has answered yet. */
export function needsConsent(state: ConsentState): boolean {
  return state.providers.length > 0 && state.choice === undefined
}

/**
 * The two marks, and the one rule they follow.
 *
 * Inline SVG on the same terms as every other icon in this app (`dropzone`, `target-panel`,
 * `review-form`): a 24 box, `currentColor`, round caps, `aria-hidden` because the title beside it
 * already says the word. No icon library — `lucide-react` is in the tree only because the vendored
 * `components/ui` pulls it, and reaching for it here would start a second convention.
 *
 * They are **descriptive, not evaluative**. One shows the text leaving the box, one shows it staying
 * in the rack, which is the single mechanical difference the screen is asking about. Both are the
 * same size, the same stroke and the same Ink Soft — never Signal, which in this system means
 * *chosen*, and never a shield or a lock on the local option, because a safety glyph on one answer
 * is an argument, and DESIGN.md rules arguments out of this decision.
 */
function LeavesIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 13.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4.5" />
      <path d="M14 4h6v6" />
      <path d="M20 4l-8.5 8.5" />
    </svg>
  )
}

function StaysIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3.5" y="4.5" width="17" height="6" rx="1.6" />
      <rect x="3.5" y="13.5" width="17" height="6" rx="1.6" />
      <path d="M7 7.5h.01" />
      <path d="M7 16.5h.01" />
    </svg>
  )
}

export function ConsentGate({
  providers,
  onDecide,
}: {
  /** Every company on offer, named. One card each — see the comment at the list below. */
  providers: ReadonlyArray<{ id: string; name: string }>
  onDecide: (choice: ConsentChoice) => void
}) {
  return (
    <div
      role="group"
      aria-labelledby="consent-heading"
      className="mx-auto flex w-full max-w-xl flex-col gap-7"
    >
      <div
        className="rise flex flex-col gap-3 text-center"
        style={{ animationDelay: '40ms' }}
      >
        <h2 id="consent-heading" className="text-display text-balance text-ink">
          Who should read your CV?
        </h2>
        {/* `pretty`, not `balance`: DESIGN.md's rule puts `balance` on display type, and on a phone a
            balanced four-line paragraph pulls into a narrow ragged column. `pretty` only fixes the
            orphan. */}
        <p className="text-lead mx-auto max-w-[34rem] text-pretty text-ink-soft">
          {/* Counts the cards rather than asserting a number — the list is the deployment's, and
              "Both options" survived on screen for exactly as long as there were two. */}
          Every option reads your file and pulls out the same details for you to
          check. The difference is whether the text leaves our machines, and
          whose machine it goes to.
        </p>
      </div>

      {/*
        Equal visual weight, deliberately.

        A filled primary pill beside an outlined one is the right pattern for an action with an
        obvious best answer — and the wrong one here. This is a consent decision, and styling the
        answer that suits us as the default is the same nudge docs/07-privacy.md rules out when it
        says "not buried in a ToS checkbox". So both options are the same choice card, in the same
        order every time, and neither is pre-selected.

        ## Three lines each, on the system's own ladder

        Title / Body / Meta, which is how DESIGN.md gets hierarchy — weight and size, never a second
        typeface and never an icon. Each card answers the same three questions in the same order, so
        the two are read as a comparison rather than as two paragraphs:

          1. What is this?          (Title)
          2. What happens to my file? (Body)
          3. What does it cost me?   (Meta)

        The third line is the one the previous version buried inside the second, and it is the only
        line where the two options genuinely differ in the user's favour or against it. Keeping it
        the same size and colour on both cards is what stops the comparison becoming a nudge.
      */}
      {/*
        One `rise` on the container, not one per card, and this is the whole of the motion decision.

        A staggered entrance is the house cadence (the landing hero runs 40 / 100 / 160 / 220 / 280ms)
        and it is wrong *here*: whichever card arrives first is the one the eye is on when the screen
        settles, and DESIGN.md's Don't is explicit — neither side of a consent decision may be styled
        as the obvious answer. A 60ms head start is styling, in the one dimension nobody audits.

        So the furniture staggers and the two answers arrive together, in the same frame.
      */}
      <div
        className="rise flex flex-col gap-3"
        style={{ animationDelay: '120ms' }}
      >
        {/*
          One card per company, each named, in the order the server gives them.

          docs/07 requires consent to a *named provider*. With one on offer that was a yes-or-no; with
          two it is this list, and choosing is the consent. Nothing marks a recommendation — no default,
          no "faster" badge, no reordering by our preference — because a nudge towards one company is a
          nudge about where somebody's employment history goes, and the cards are identical so the
          comparison stays theirs.
        */}
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onDecide(p.id)}
            className="choice"
          >
            <span className="flex items-start gap-3.5">
              <LeavesIcon className="mt-0.5 h-5 w-5 shrink-0 text-ink-soft" />
              <span className="flex flex-col gap-1">
                <span className="text-title">Send it to {p.name}</span>
                <span className="text-[0.9375rem] leading-relaxed text-ink-soft">
                  The text of your CV goes to {p.name}, one of the companies
                  whose larger model we pay for. It goes nowhere else, and we
                  keep no copy.
                </span>
                {/*
                  The second sentence is the one this screen owed people and did not say.

                  "We do not keep a copy" is a claim about *us*, and reads as though it settles the
                  question. It does not: docs/07 still carries zero-retention terms as a thing to
                  confirm, so we cannot state what the provider does on their side. Saying so plainly
                  is both the honest option and the more informative one, and it is the same
                  discipline `fabrication.ts` enforces on the model — do not assert what nothing backs.
                */}
                <span className="text-meta text-ink-soft">
                  The most accurate read, and the best chance with an unusual
                  layout. We have not confirmed their retention terms.
                </span>
              </span>
            </span>
          </button>
        ))}

        <button
          type="button"
          onClick={() => onDecide(LOCAL)}
          className="choice"
        >
          <span className="flex items-start gap-3.5">
            <StaysIcon className="mt-0.5 h-5 w-5 shrink-0 text-ink-soft" />
            <span className="flex flex-col gap-1">
              <span className="text-title">Keep it on our server</span>
              <span className="text-[0.9375rem] leading-relaxed text-ink-soft">
                A smaller model reads it on the machine you uploaded to. The
                file never leaves that machine, and no other company is
                involved.
              </span>
              <span className="text-meta text-ink-soft">
                Slower than the larger model, and an unusual layout will leave
                you more to correct.
              </span>
            </span>
          </span>
        </button>
      </div>

      {/*
        Promoted out of the footnote, because it is the answer to the question people actually have.

        This sentence was `text-meta` at the bottom of the screen, sharing a line with a stale
        pointer to Account. It is the one fact here that is *true of both answers* and that the
        reader can go and verify (`src/structure/redact.ts`, applied in `extract.ts` before the
        call), so it belongs between the two cards and the fine print rather than under it. On the
        Band, so it reads as a shared condition rather than as a third option.
      */}
      <p
        className="rise rounded-card border border-hairline bg-band px-5 py-4 text-[0.9375rem] leading-relaxed text-ink"
        style={{ animationDelay: '180ms' }}
      >
        Either way, your phone number and street address are taken out of the
        text before any model reads it, and put back on your copy afterwards.
      </p>

      <div
        className="rise flex flex-col items-center gap-2 text-center"
        style={{ animationDelay: '240ms' }}
      >
        <p className="text-meta text-ink-soft">
          You can switch at any time from the header. This answer is remembered
          in this browser only, and is not sent anywhere.
        </p>
        <a
          href="/privacy"
          className="text-meta font-medium text-signal underline decoration-signal/30 underline-offset-4 hover:decoration-signal"
        >
          What we do with your data
        </a>
      </div>
    </div>
  )
}

/**
 * Who reads your CV — the standing control, changeable at any moment.
 *
 * ## The promise this keeps
 *
 * The gate used to say "you can change your mind on the next upload" and then never ask again: the
 * answer is persisted, `needsConsent` requires an *absent* answer, and `reset` was exported and
 * called from nowhere. So the one decision this product asks a person to make about their own data
 * was, in practice, permanent and invisible — in the product whose whole proposition is being
 * straight about exactly this. Edd's instruction was plain: "debemos poder cambiar entre minimax y
 * local siempre que queramos."
 *
 * ## Why the unavailable option is shown rather than hidden
 *
 * Without an entitled account the server sends nothing outward whatever the client asks (ADR-023 —
 * `mayUseThirdParty` is an `&&` of plan and consent). Offering the choice anyway would be a button
 * that lies: a visitor could pick the third-party model, watch the local one run, and never be told.
 * So the option is drawn, plainly disabled, with the reason underneath. Hiding it would answer
 * "what am I missing?" with silence; a false choice would answer it with a fiction.
 *
 * The displayed value is the **effective** one, not the stored one — an old `granted` on an account
 * that no longer has the plan reads as local here, because local is what will happen.
 */
export function ProcessingChoice({
  providers,
  choice,
  onDecide,
  Control,
}: {
  /** Every model this visitor may choose. Empty when none is available to them. */
  providers: ReadonlyArray<{ id: string; name: string }>
  choice?: ConsentChoice
  onDecide: (choice: ConsentChoice) => void
  /** The app's `Segmented`, injected so this component does not reach into the route. */
  Control: (props: {
    label: string
    options: ReadonlyArray<{
      id: string
      label: string
      hint?: string
      disabled?: boolean
      pro?: boolean
    }>
    value: string
    onChange: (id: string) => void
  }) => React.ReactNode
}) {
  const entitled = providers.length > 0
  /*
    From the context rather than a prop, unlike everything else here. The injection rule above is
    about not reaching into the *route*; this is a deploy-time fact with a default, and threading it
    through as a fifth prop would put one more thing between the switch and the sentence it moves.
  */
  const beta = useInBeta()
  /*
    A stored answer naming a company that is no longer offered falls back to local rather than to the
    first one on the list. Picking a substitute would be the app choosing who receives somebody's CV.
  */
  const effective =
    choice !== undefined && providers.some((p) => p.id === choice)
      ? choice
      : LOCAL

  return (
    <div className="flex flex-col gap-2">
      <Control
        label="Who reads your CV"
        value={effective}
        onChange={onDecide}
        options={[
          {
            id: LOCAL,
            label: 'Our own server',
            hint: entitled
              ? 'Smaller and slower, and your CV never leaves this machine.'
              : undefined,
          },
          /*
            One option per company, each named. docs/07 requires consent to a named provider, and with
            more than one on offer that requirement is simply this list: choosing *is* the consent, and
            it records which. A single "send it away" toggle could not say who to.

            Nothing here is a recommendation. They are listed in the order the server gives them, with
            no default marked and no "faster" badge, because a nudge towards one company is a nudge
            about where somebody's employment history goes.
          */
          /*
            Tagged Pro, and the tag is the honest half of beta. The gate is the first screen anybody
            meets, and it is the one place where "Our own server ... Free, always" sits next to two
            options that are free only for now. Untagged, the list would teach the wrong thing at the
            worst moment.
          */
          ...providers.map((p) => ({
            id: p.id,
            label: p.name,
            pro: true,
            hint: `The larger model. Its text goes to ${p.name} and nowhere else; we keep no copy.${beta ? ' Free for everyone while we are in beta.' : ' Part of the paid plan.'}`,
          })),
          /*
            Kept for the visitor who has no plan: a locked option that says what it would give them.
            `entitled` is the server's answer, so while ADR-030's suspension is on this is the only
            second option anyone sees — and when the switch goes off it disappears, unedited.
          */
          ...(entitled
            ? []
            : [
                {
                  id: 'locked',
                  label: 'A larger model',
                  disabled: true,
                  hint: 'The larger model needs an account on the paid plan. Until then your CV is read here and never leaves this machine, which is the more private half of the deal, not the lesser one.',
                },
              ]),
        ]}
      />
    </div>
  )
}
