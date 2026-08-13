/**
 * Enforcement layer 3 — the human (docs/06-ai-optimization.md).
 *
 * Layers 1 and 2 decide what may be *offered*. This decides what is **applied**, and the answer is
 * always "whatever the candidate accepted, one line at a time". Their name goes on the document.
 *
 * The rules the design has to hold, each one the opposite of a common convenience:
 *
 *  • **Nothing is applied until it is accepted.** There is no auto-apply and no "apply all and
 *    review later". The diff is a decision, not a receipt.
 *  • **Accept-all exists and defaults off**, per docs/06. It stays visible, because a person with
 *    twenty good suggestions should not have to click twenty times — but it is never the state you
 *    arrive in.
 *  • **A rejected suggestion is reported, not hidden.** When the model invented something and we
 *    threw it away, the bullet still appears, saying so. Hiding it would read as "we had no ideas
 *    for this one", which is a different and untrue statement — and it is the only place a user can
 *    see the guard working for them.
 *  • **Questions are the feature.** A bullet with no suggestion but a real question is not a
 *    failure; it is the tool asking for the number instead of inventing one.
 */
import { useState } from 'react'
import type { BulletRewrite } from '@/optimize/rewrite'

/**
 * Word-level diff, computed here rather than pulled in as a dependency.
 *
 * A character diff on a rewritten sentence highlights the inside of words and is unreadable; a
 * line diff on a one-line bullet highlights everything. Words are the unit a person compares.
 */
function diffWords(before: string, after: string) {
  const a = before.split(/(\s+)/)
  const b = after.split(/(\s+)/)

  // Longest common subsequence over tokens. Bullets are short — a table is fine and exact beats
  // clever here, because a diff that is subtly wrong is worse than none.
  const lengths: Array<Array<number>> = Array.from(
    { length: a.length + 1 },
    () => new Array<number>(b.length + 1).fill(0),
  )
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i][j] =
        a[i] === b[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1])
    }
  }

  const removed: Array<{ text: string; changed: boolean }> = []
  const added: Array<{ text: string; changed: boolean }> = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      removed.push({ text: a[i], changed: false })
      added.push({ text: b[j], changed: false })
      i++
      j++
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      removed.push({ text: a[i], changed: true })
      i++
    } else {
      added.push({ text: b[j], changed: true })
      j++
    }
  }
  while (i < a.length) removed.push({ text: a[i++], changed: true })
  while (j < b.length) added.push({ text: b[j++], changed: true })

  return { removed, added }
}

function Diff({ before, after }: { before: string; after: string }) {
  const { removed, added } = diffWords(before, after)
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] leading-relaxed text-developer-gray">
        {removed.map((part, index) => (
          <span
            key={index}
            className={part.changed ? 'text-silver-gray line-through' : ''}
          >
            {part.text}
          </span>
        ))}
      </p>
      <p className="text-[11px] leading-relaxed text-tray-enamel">
        {added.map((part, index) => (
          <span
            key={index}
            className={part.changed ? 'bg-amber-shadow/40 text-safelight' : ''}
          >
            {part.text}
          </span>
        ))}
      </p>
    </div>
  )
}

export interface RewriteReviewProps {
  rewrites: Array<BulletRewrite>
  /** Applied one at a time — the component never hands back a whole modified resume. */
  onAccept: (rewrite: BulletRewrite) => void
  onDismiss: (rewrite: BulletRewrite) => void
  accepted: Set<string>
  /**
   * Called with everything the candidate has typed in reply to our questions.
   *
   * Asking a question and giving nowhere to answer it is worse than not asking: it names the gap and
   * then leaves the person to fix it alone. The answers go back through the pipeline as source
   * material, which is what lets the guard permit the figure.
   */
  onAnswer?: (answers: Array<string>) => void
}

export function keyOf(rewrite: {
  workIndex: number
  highlightIndex: number
}): string {
  return `${rewrite.workIndex}:${rewrite.highlightIndex}`
}

export function RewriteReview({
  rewrites,
  onAccept,
  onDismiss,
  accepted,
  onAnswer,
}: RewriteReviewProps) {
  const [showAll, setShowAll] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string>>({})

  const suggestions = rewrites.filter((r) => r.outcome === 'suggested')
  const guarded = rewrites.filter((r) => r.outcome === 'fabricated')
  const questionsOnly = rewrites.filter(
    (r) => r.outcome !== 'suggested' && r.questions.length > 0,
  )
  const pending = suggestions.filter((r) => !accepted.has(keyOf(r)))

  return (
    <div className="flex flex-col gap-3">
      <div className="rim flex items-baseline justify-between bg-darkroom-brown/70 px-3 py-2">
        <span className="stencil text-[9px] text-safelight/70">
          Suggestions
        </span>
        <span className="flex items-baseline gap-2">
          <span className="segment text-[18px] text-safelight">
            {pending.length}
          </span>
          <span className="text-[10px] text-developer-gray">
            {suggestions.length === 0
              ? 'nothing to change'
              : `of ${suggestions.length} left to decide`}
          </span>
        </span>
      </div>

      {suggestions.length === 0 && (
        <p className="text-[10px] leading-relaxed text-developer-gray">
          We did not find wording worth changing. That is a good sign — it means
          your bullets already lead with what you did.
        </p>
      )}

      {suggestions.map((rewrite) => {
        const isAccepted = accepted.has(keyOf(rewrite))
        return (
          <div
            key={keyOf(rewrite)}
            className="rim flex flex-col gap-3 bg-darkroom-brown/40 p-3"
          >
            <Diff
              before={rewrite.original}
              after={rewrite.suggestion ?? rewrite.original}
            />

            {rewrite.rationale !== '' && (
              <p className="text-[10px] leading-relaxed text-developer-gray">
                {rewrite.rationale}
              </p>
            )}

            {rewrite.questions.length > 0 && (
              /*
                The questions sit *with* the suggestion rather than in a separate panel, because they
                are about this sentence and answering one is how the bullet gets its number — from
                the candidate, which is the entire design.
              */
              <div className="flex flex-col gap-2 border-l border-l-safelight/40 pl-3">
                {rewrite.questions.map((question) => (
                  <div key={question} className="flex flex-col gap-1">
                    <label
                      htmlFor={`answer-${keyOf(rewrite)}-${question.slice(0, 12)}`}
                      className="text-[10px] leading-relaxed text-safelight/80"
                    >
                      {question}
                    </label>
                    <input
                      id={`answer-${keyOf(rewrite)}-${question.slice(0, 12)}`}
                      value={answers[question] ?? ''}
                      onChange={(event) =>
                        setAnswers({
                          ...answers,
                          [question]: event.target.value,
                        })
                      }
                      placeholder="Your answer, in your own words"
                      className="rim bg-print-black/40 px-2 py-1.5 text-[11px] text-tray-enamel placeholder:text-developer-gray/60"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                disabled={isAccepted}
                onClick={() => onAccept(rewrite)}
                className="rim stencil px-3 py-1.5 text-[9px] text-tray-enamel transition-colors hover:bg-amber-shadow/25 disabled:opacity-40"
              >
                {isAccepted ? 'Used' : 'Use this'}
              </button>
              <button
                type="button"
                onClick={() => onDismiss(rewrite)}
                className="rim stencil px-3 py-1.5 text-[9px] text-tray-enamel/60 transition-colors hover:bg-amber-shadow/25 hover:text-tray-enamel"
              >
                Keep mine
              </button>
            </div>
          </div>
        )
      })}

      {onAnswer !== undefined &&
        Object.values(answers).some((text) => text.trim() !== '') && (
          <button
            type="button"
            onClick={() =>
              onAnswer(
                Object.entries(answers)
                  .filter(([, text]) => text.trim() !== '')
                  .map(([question, text]) => `${question} ${text}`),
              )
            }
            className="rim stencil px-3 py-2 text-[9px] text-tray-enamel transition-colors hover:bg-amber-shadow/25"
          >
            Try again with what I told you
          </button>
        )}

      {pending.length > 1 && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => pending.forEach(onAccept)}
            className="rim stencil px-3 py-1.5 text-[9px] text-tray-enamel/70 transition-colors hover:bg-amber-shadow/25 hover:text-tray-enamel"
          >
            Use all {pending.length}
          </button>
          {/* Present, never pre-selected (docs/06). The default state is always "decide each one". */}
          <span className="text-[9px] leading-relaxed text-developer-gray">
            You can still change any of them afterwards.
          </span>
        </div>
      )}

      {(guarded.length > 0 || questionsOnly.length > 0) && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="stencil self-start text-[9px] text-safelight/70 underline underline-offset-4 hover:text-safelight"
        >
          {showAll ? 'Hide' : 'Show'} the{' '}
          {guarded.length + questionsOnly.length} we did not suggest anything
          for
        </button>
      )}

      {showAll && (
        <div className="flex flex-col gap-2">
          {guarded.map((rewrite) => (
            <div
              key={keyOf(rewrite)}
              className="rim flex flex-col gap-1.5 border-l-2 border-l-safelight bg-darkroom-brown/40 p-3"
            >
              <p className="text-[11px] leading-relaxed text-tray-enamel">
                {rewrite.original}
              </p>
              {/*
                The one place a user sees the guard work for them. Hiding it would read as "we had no
                ideas here", which is untrue and much less reassuring than the truth.
              */}
              <p className="text-[10px] leading-relaxed text-developer-gray">
                We had a suggestion for this one and threw it away: it added{' '}
                {rewrite.rejected?.map((f) => f.value).join(', ')}, which is not
                anywhere on your CV. We will not put words in your mouth, so
                your own wording stands.
              </p>
            </div>
          ))}

          {questionsOnly.map((rewrite) => (
            <div
              key={keyOf(rewrite)}
              className="rim flex flex-col gap-1.5 bg-darkroom-brown/40 p-3"
            >
              <p className="text-[11px] leading-relaxed text-tray-enamel">
                {rewrite.original}
              </p>
              <ul className="flex flex-col gap-1 border-l border-l-safelight/40 pl-3">
                {rewrite.questions.map((question) => (
                  <li
                    key={question}
                    className="text-[10px] leading-relaxed text-safelight/80"
                  >
                    {question}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
