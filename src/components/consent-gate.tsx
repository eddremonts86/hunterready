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
  const [choice, setChoice] = useState<ConsentChoice | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void fetch('/api/processing')
      .then(
        (response) => response.json() as Promise<{ provider: string | null }>,
      )
      .then((data) => {
        if (cancelled) return
        setProvider(data.provider)
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

  return { provider, choice, decide, reset }
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
      className="rim bench mx-auto flex w-full max-w-xl flex-col gap-4 p-5"
    >
      <div className="flex flex-col gap-2">
        <h2 id="consent-heading" className="stencil text-[11px] text-safelight">
          Before you upload
        </h2>
        <p className="text-[12px] leading-relaxed text-tray-enamel">
          To read your CV we send its text to{' '}
          <strong className="text-safelight">{provider}</strong>, a company that
          runs the AI model we use. That is the only place it goes, and we do
          not keep a copy.
        </p>
        <p className="text-[11px] leading-relaxed text-developer-gray">
          Your phone number and street address are removed before anything is
          sent — the model does not need them to read a CV.
        </p>
      </div>

      {/*
        Equal visual weight, deliberately.

        A filled primary button beside an outlined one is the right pattern for an action with an
        obvious best answer — and the wrong one here. This is a consent decision, and styling the
        answer that suits us as the default is the same nudge docs/07-privacy.md rules out when it
        says "not buried in a ToS checkbox". Whichever way someone leans should be their lean.
      */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => onDecide('granted')}
          className="rim flex-1 px-4 py-3 text-[11px] text-tray-enamel transition-colors hover:bg-amber-shadow/25 focus-visible:bg-amber-shadow/25"
        >
          <span className="stencil">Yes, send it to {provider}</span>
        </button>
        <button
          type="button"
          onClick={() => onDecide('declined')}
          className="rim flex-1 px-4 py-3 text-[11px] text-tray-enamel transition-colors hover:bg-amber-shadow/25 focus-visible:bg-amber-shadow/25"
        >
          <span className="stencil">No — use your own model</span>
        </button>
      </div>

      {/*
        Not a consolation prize, and it must not read like one. It is a real model on our own hardware —
        smaller than the one above, so a very unusual layout may need more correcting, and that is the
        whole of the trade. Overstating it would be dishonest; understating it makes the private choice
        look like a penalty.
      */}
      <p className="text-[10px] leading-relaxed text-developer-gray">
        Your CV is read by a model on our own server instead, so it never leaves
        our machines. It is a smaller model, so on an unusual layout you may
        have a little more to correct. You can change your mind on the next
        upload.
      </p>

      <a
        href="/privacy"
        className="stencil text-[9px] text-safelight/70 underline underline-offset-4 hover:text-safelight"
      >
        What we do with your data
      </a>
    </div>
  )
}
