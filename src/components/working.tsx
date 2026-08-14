/**
 * "Something is happening", said once, the same way everywhere.
 *
 * The idiom is not new — it is `Dropzone`'s, which had the only honest loader in the product: a ring
 * that turns, no percentage, and copy that names the wait. This lifts it out so the other six places
 * that needed it stop being six different answers, and so the two rules below are enforced by the
 * component rather than remembered by whoever edits next.
 *
 * ## Motion is never the only signal
 *
 * `styles.css` grants a reduced-motion visitor's request with a blanket rule that sets
 * `animation-iteration-count: 1` on everything. That is right for the drifting background washes and
 * wrong for a spinner: a ring that has stopped turning does not read as "reduced motion", it reads as
 * a hung application, and it is shown to the one person who cannot tell the difference by watching.
 *
 * Two things follow. The ring is marked `data-motion="essential"`, which the stylesheet exempts and
 * slows rather than freezes — its movement carries meaning, which is the distinction WCAG 2.3.3 draws.
 * And every spinner here is paired with words, so the message survives even if the motion does not.
 *
 * ## No progress we do not have
 *
 * DESIGN.md: *"Don't show a progress indicator for progress that has not happened."* None of these
 * operations reports progress — a render is one WASM call, a rewrite pass is a queue of model calls that
 * answers at the end — so nothing here accepts a percentage. `.indeterminate` in the stylesheet is the
 * bar-shaped member of the same family, for the same reason.
 */

/**
 * The ring. `aria-hidden` because the label beside it is what a screen reader should read; announcing
 * "image" next to "Building your PDF…" adds noise and no information.
 */
export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      aria-hidden
      data-motion="essential"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={`${className} animate-spin`}
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  )
}

/**
 * Ring plus words, as a live region.
 *
 * `role="status"` rather than `aria-live="assertive"`: this is polite by nature, and an assertive
 * region would interrupt someone mid-sentence to tell them a file is being built.
 *
 * `hint` is for the honest duration note — the thing `Dropzone` learned when scans started going
 * through OCR and "a few seconds" quietly became untrue. Pass one whenever the wait can be long, and
 * cover the slow case rather than promising the fast one.
 */
export function Working({
  label,
  hint,
  className = '',
}: {
  label: string
  hint?: string
  className?: string
}) {
  return (
    <p
      role="status"
      className={`flex items-center gap-2 text-[13px] leading-relaxed text-ink-soft ${className}`}
    >
      <Spinner className="h-3.5 w-3.5 shrink-0 text-signal" />
      <span>
        {label}
        {hint !== undefined && (
          <span className="text-ink-faint"> — {hint}</span>
        )}
      </span>
    </p>
  )
}

/**
 * The in-button form: swap the label and show the ring in place.
 *
 * `aria-busy` is on the button rather than the span so assistive technology reads the control as busy,
 * and the caller still owns `disabled` — a busy button that stays clickable is how you get two share
 * links, and a disabled button with an unchanged label is how you get "did my click register?".
 */
export function ButtonLabel({
  busy,
  idle,
  working,
}: {
  busy: boolean
  idle: string
  working: string
}) {
  if (!busy) return <>{idle}</>
  return (
    <span className="inline-flex items-center gap-2">
      <Spinner className="h-3.5 w-3.5" />
      {working}
    </span>
  )
}
