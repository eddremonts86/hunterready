import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

/**
 * The word Pro, on a capability that is free right now and will not always be.
 *
 * ## Why a free feature carries a price tag
 *
 * Beta gives every paid capability away (`betaPaidFree` in `src/lib/entitlements.ts`). Handing them
 * over unlabelled would teach a beta user that the hundred-and-three-design catalogue, the mixed
 * typefaces and colours, and the larger model are simply what this product is — and the day pricing
 * opens, every one of them would be experienced as something taken away. A tag costs nothing now and
 * buys the honesty then.
 *
 * ## It is drawn from the capability, never from the entitlement
 *
 * The old chip said "Paid plan" and rendered only when `!entitled`, so the moment the gate lifted the
 * label vanished with it. That coupling is the thing to avoid: **what tier a feature belongs to and
 * whether you may use it today are two different facts**, and only the second one moves. Callers pass
 * the first. Nothing here reads an entitlement.
 *
 * ## Colour
 *
 * Signal, not a fifth hue and not one of the three semantic colours. DESIGN.md allows exactly one
 * accent and reserves Affirm, Caution and Alert for fixed meanings; a tier is not a verification, not
 * a warning and not a failure. `subtle` swaps the filled wash for plain accent text, for the places
 * where a filled chip would be the loudest thing in a row it does not own.
 */
/**
 * Whether the product still calls itself beta, for the parts of the tree that say so.
 *
 * A deploy-time fact (`HR_RELEASE`, see `src/lib/entitlements.ts`) that has to reach seven scattered
 * places: this tag's tooltip, the sentence below it, the chip beside the wordmark, three lines of
 * landing-page copy and one on the privacy page. Threading a prop to all seven means seven chances
 * for one of them to be missed on the day it matters, and the one that gets missed is a promise the
 * product is no longer keeping.
 *
 * **Defaults to `true`.** Anything not wrapped in a provider keeps saying what it says today, and
 * the value arrives from `/api/processing` a moment after load — so in beta there is no flash, and
 * the flash that release mode does cost is a chip disappearing once, which is the right direction
 * for the mistake to fall.
 */
const BetaContext = createContext(true)

export function BetaProvider({
  value,
  children,
}: {
  /** `consent.beta`, which is `undefined` until the server answers. Undefined means beta. */
  value: boolean | undefined
  children: ReactNode
}) {
  return (
    <BetaContext.Provider value={value !== false}>
      {children}
    </BetaContext.Provider>
  )
}

export function useInBeta(): boolean {
  return useContext(BetaContext)
}

/**
 * The sentence that goes with the tag, in the one voice the whole product uses for this.
 *
 * A function of the switch rather than a constant, because the constant version was a promise with
 * no way to stop making it. After release the capability is simply part of the plan, and saying so
 * in one short sentence is more honest than a paragraph explaining what used to be free.
 */
export function proNote(beta: boolean): string {
  return beta
    ? 'Free for everyone while HunterReady is in beta. It becomes part of a paid plan later, and we will say so before that happens.'
    : 'Part of the paid plan.'
}

/** The same sentence, for a component that is inside the provider. */
export function useProNote(): string {
  return proNote(useInBeta())
}

export function ProTag({
  subtle = false,
  className = '',
}: {
  /** Accent text with no surface, for dense rows and section headings. */
  subtle?: boolean
  className?: string
}) {
  const beta = useInBeta()
  return (
    <span
      /*
        A title rather than a tooltip component: this appears on up to ninety-one cards at once and a
        tooltip per card is ninety-one listeners for one sentence that never changes.
      */
      title={`Part of the paid plan.${beta ? ' Free for everyone while HunterReady is in beta.' : ''}`}
      className={[
        'inline-flex shrink-0 items-center rounded-full text-[10px] font-semibold uppercase tracking-[0.06em]',
        subtle
          ? 'text-signal'
          : 'bg-signal-wash px-1.5 py-0.5 text-signal ring-1 ring-signal-edge ring-inset',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      Pro
    </span>
  )
}
