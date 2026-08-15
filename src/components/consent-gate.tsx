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

const STORAGE_KEY = 'hunterready.processing-consent.v1'

export type ConsentChoice = 'granted' | 'declined'

interface StoredConsent {
  choice: ConsentChoice
  /** Who was named at the time. If the provider changes, the old answer no longer applies. */
  provider: string
  at: string
}

export interface ConsentState {
  /** Undefined while we are still asking the server who processes CVs. */
  provider?: string | null
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
      'provider' in parsed
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
  /** Whether this installation encrypts stored CVs. `undefined` until asked — see `/api/processing`. */
  const [encryptsAtRest, setEncryptsAtRest] = useState<boolean | undefined>(
    undefined,
  )
  const [paidDesigns, setPaidDesigns] = useState<boolean | undefined>(undefined)
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
            encryptsAtRest?: boolean
            paidDesigns?: boolean
            plan?: string
          }>,
      )
      .then((data) => {
        if (cancelled) return
        setProvider(data.provider)
        setEncryptsAtRest(data.encryptsAtRest === true)
        setPaidDesigns(data.paidDesigns === true)
        setPlan(typeof data.plan === 'string' ? data.plan : undefined)
        const stored = read()
        /**
         * A stored answer only counts for the provider it was given about. If the deployment moves
         * from one company to another, the person consented to a transfer that is no longer the one
         * being made, and they are asked again.
         */
        if (stored !== undefined && stored.provider === data.provider) {
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
          provider: provider ?? '',
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

  return { provider, encryptsAtRest, paidDesigns, plan, choice, decide, reset }
}

/** True when a decision is genuinely required: a provider exists and nobody has answered yet. */
export function needsConsent(state: ConsentState): boolean {
  return (
    typeof state.provider === 'string' &&
    state.provider !== '' &&
    state.choice === undefined
  )
}

export function ConsentGate({
  provider,
  onDecide,
}: {
  provider: string
  onDecide: (choice: ConsentChoice) => void
}) {
  return (
    <div
      role="group"
      aria-labelledby="consent-heading"
      className="mx-auto flex w-full max-w-xl flex-col gap-7"
    >
      <div className="flex flex-col gap-3 text-center">
        <h2 id="consent-heading" className="text-display text-ink">
          Who should read your CV?
        </h2>
        <p className="text-lead text-ink-soft">
          Either way we pull out your details and you check them. The only
          difference is which computer does the reading.
        </p>
      </div>

      {/*
        Equal visual weight, deliberately.

        A filled primary pill beside an outlined one is the right pattern for an action with an
        obvious best answer — and the wrong one here. This is a consent decision, and styling the
        answer that suits us as the default is the same nudge docs/07-privacy.md rules out when it
        says "not buried in a ToS checkbox". So both options are the same choice card, in the same
        order every time, and neither is pre-selected.

        The reference's stacked option cards are exactly the right form for it: two answers, each
        with a title and the one sentence that actually distinguishes them.
      */}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => onDecide('granted')}
          className="choice"
        >
          <span className="flex flex-col gap-0.5">
            <span className="text-[16px] font-semibold">
              Send it to {provider}
            </span>
            <span className="text-[14px] leading-relaxed text-ink-soft">
              The larger model, and the most accurate read. Its text goes to{' '}
              {provider} and nowhere else; we do not keep a copy.
            </span>
          </span>
        </button>

        {/*
          Not a consolation prize, and it must not read like one. It is a real model on our own
          hardware — smaller than the one above, so a very unusual layout may need more correcting,
          and that is the whole of the trade. Overstating it would be dishonest; understating it
          makes the private choice look like a penalty.
        */}
        <button
          type="button"
          onClick={() => onDecide('declined')}
          className="choice"
        >
          <span className="flex flex-col gap-0.5">
            <span className="text-[16px] font-semibold">
              Keep it on your server
            </span>
            <span className="text-[14px] leading-relaxed text-ink-soft">
              A model running on our own machines, so the file never leaves
              them. It is smaller, so an unusual layout may leave you a little
              more to correct.
            </span>
          </span>
        </button>
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-meta text-ink-soft">
          Your phone number and street address are removed before either model
          sees the text. You can change this whenever you like, under Account.
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
  provider,
  choice,
  onDecide,
  Control,
}: {
  /** The third-party provider's name, or null/undefined when this visitor cannot reach it. */
  provider?: string | null
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
    }>
    value: string
    onChange: (id: string) => void
  }) => React.ReactNode
}) {
  const entitled = typeof provider === 'string' && provider !== ''
  const effective = entitled && choice === 'granted' ? 'provider' : 'local'

  return (
    <div className="flex flex-col gap-2">
      <Control
        label="Who reads your CV"
        value={effective}
        onChange={(id) => onDecide(id === 'provider' ? 'granted' : 'declined')}
        options={[
          {
            id: 'local',
            label: 'Our own server',
            hint: entitled
              ? 'Smaller and slower, and your CV never leaves this machine.'
              : undefined,
          },
          {
            id: 'provider',
            label: entitled ? provider : 'A larger model',
            disabled: !entitled,
            hint: entitled
              ? `The larger model. Its text goes to ${provider} and nowhere else; we keep no copy.`
              : 'The larger model needs an account on the paid plan. Until then your CV is read here and never leaves this machine — which is the more private half of the deal, not the lesser one.',
          },
        ]}
      />
    </div>
  )
}
