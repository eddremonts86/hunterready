/**
 * Scroll reveal, and the two things that usually go wrong with it.
 *
 * 1. **It hides content from people who never see the animation.** The pattern is `opacity: 0` plus
 *    a class added on intersection, so anything that fails — no observer, a stalled observer, a user
 *    who asked for reduced motion — leaves the page blank. Both failure modes are handled below by
 *    revealing immediately rather than by hoping.
 * 2. **It re-animates on every scroll past.** A section that fades in again each time you scroll up
 *    is a section you cannot re-read. The observer unhooks itself after the first hit.
 *
 * The animation is decorative in the strict sense: remove it and the page says the same things in
 * the same order. That is what makes honouring `prefers-reduced-motion` a no-op rather than a
 * degraded experience.
 */
import { useEffect, useRef, useState } from 'react'

export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (element === null) return

    // Somebody who asked the OS for less motion is not asking to wait for a fade.
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (still || typeof IntersectionObserver === 'undefined') {
      setShown(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          setShown(true)
          // Once revealed, stay revealed: a section that fades in again on every pass is one you
          // cannot go back and re-read.
          observer.disconnect()
        }
      },
      // A little before the edge, so the movement finishes as the section becomes properly visible
      // rather than starting only once it is already in the middle of the screen.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, shown }
}

/**
 * `delay` staggers siblings. Kept small — a 300ms stagger across three cards means the last one
 * arrives after the eye has already moved on, which reads as lag rather than as choreography.
 *
 * Always a `<div>`, deliberately. The first version took an `as` prop for `section`/`li`/`header`;
 * a polymorphic ref cannot be typed without a cast, and a cast on a ref is how you end up passing a
 * `<li>` to something expecting a `<div>`. Semantics belong on the real element — this one only
 * animates, so it should be the element with no meaning.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const { ref, shown } = useReveal<HTMLDivElement>()
  return (
    <div
      ref={ref}
      data-in={shown}
      style={delay > 0 ? { transitionDelay: `${delay}ms` } : undefined}
      className={`reveal ${className}`}
    >
      {children}
    </div>
  )
}
