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
export function ProTag({
  subtle = false,
  className = '',
}: {
  /** Accent text with no surface, for dense rows and section headings. */
  subtle?: boolean
  className?: string
}) {
  return (
    <span
      /*
        A title rather than a tooltip component: this appears on up to ninety-one cards at once and a
        tooltip per card is ninety-one listeners for one sentence that never changes.
      */
      title="Part of the paid plan. Free for everyone while HunterReady is in beta."
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

/**
 * The sentence that goes with the tag, in the one voice the whole product uses for this.
 *
 * Exported as a constant rather than retyped, because it was already three near-copies across the
 * axes panel, the model picker and the design gallery, and three near-copies of a promise is how a
 * product ends up making slightly different ones.
 */
export const PRO_IN_BETA =
  'Free for everyone while HunterReady is in beta. It becomes part of a paid plan later, and we will say so before that happens.'
