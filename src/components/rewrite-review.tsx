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
import { ButtonLabel } from '@/components/working'
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
      <p className="text-[13px] leading-relaxed text-ink-soft">
        {removed.map((part, index) => (
          <span
            key={index}
            /* The strike carries the meaning, so the colour does not have to — and must not, because
               this is the candidate's own sentence at 13px and ink-faint is 3.07:1 on white. */
            className={part.changed ? 'line-through decoration-ink-faint' : ''}
          >
            {part.text}
          </span>
        ))}
      </p>
      {/*
        The proposal is marked in the accent, not in green. Green would say "approved" about a line
        nobody has approved yet — the whole point of this panel is that acceptance is a separate act.
      */}
      <p className="text-[13px] leading-relaxed text-ink">
        {added.map((part, index) => (
          <span
            key={index}
            className={
              part.changed
                ? 'rounded bg-signal-wash px-0.5 font-medium text-signal'
                : ''
            }
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
  /**
   * Whether a pass is running right now.
   *
   * Passed in rather than held here because the parent owns the request. Without it this component had
   * the longest silent wait in the product: "Try again with what I told you" starts a full pass — one
   * model call per bullet — and the flag that covered the *first* pass was on a button this component
   * replaces, so the second one showed nothing at all.
   */
  busy?: boolean
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
  busy = false,
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
      <div className="flex items-baseline justify-between gap-3 rounded-field bg-band px-3 py-2">
        <span className="text-[13px] font-semibold text-ink">Suggestions</span>
        <span className="flex items-baseline gap-1.5">
          <span className="tally text-[18px] font-extrabold leading-none text-signal">
            {pending.length}
          </span>
          <span className="text-meta text-ink-soft">
            {suggestions.length === 0
              ? 'nothing to change'
              : `of ${suggestions.length} left to decide`}
          </span>
        </span>
      </div>

      {suggestions.length === 0 && (
        <p className="text-[13px] leading-relaxed text-ink-soft">
          We did not find wording worth changing. That is a good sign — it means
          your bullets already lead with what you did.
        </p>
      )}

      {suggestions.map((rewrite) => {
        const isAccepted = accepted.has(keyOf(rewrite))
        return (
          <div
            key={keyOf(rewrite)}
            className="flex flex-col gap-3 rounded-choice border border-hairline bg-ground p-3.5"
          >
            <Diff
              before={rewrite.original}
              after={rewrite.suggestion ?? rewrite.original}
            />

            {rewrite.rationale !== '' && (
              <p className="text-meta leading-relaxed text-ink-soft">
                {rewrite.rationale}
              </p>
            )}

            {rewrite.questions.length > 0 && (
              /*
                The questions sit *with* the suggestion rather than in a separate panel, because they
                are about this sentence and answering one is how the bullet gets its number — from
                the candidate, which is the entire design.
              */
              <div className="flex flex-col gap-2.5 border-l-2 border-l-signal-edge pl-3">
                {rewrite.questions.map((question) => (
                  <div key={question} className="flex flex-col gap-1.5">
                    <label
                      htmlFor={`answer-${keyOf(rewrite)}-${question.slice(0, 12)}`}
                      className="text-[13px] font-medium leading-relaxed text-ink"
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
                      className="field !py-1.5 !text-[13px]"
                    />
                  </div>
                ))}
              </div>
            )}

            {/*
              "Use this" is the filled pill and "Keep mine" is the quiet one — the one place in this
              product where an unequal pair is correct. Both outcomes are fine, but only one of them
              is an action: keeping your own wording is what happens if you do nothing at all.
            */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isAccepted}
                onClick={() => onAccept(rewrite)}
                className="btn btn-primary px-3.5 py-1.5 text-[13px]"
              >
                {isAccepted ? 'Used' : 'Use this'}
              </button>
              <button
                type="button"
                onClick={() => onDismiss(rewrite)}
                className="btn btn-quiet px-3.5 py-1.5 text-[13px]"
              >
                Keep mine
              </button>
            </div>
          </div>
        )
      })}

      {onAnswer !== undefined &&
        Object.values(answers).some((text) => text.trim() !== '') && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              aria-busy={busy}
              onClick={() =>
                onAnswer(
                  Object.entries(answers)
                    .filter(([, text]) => text.trim() !== '')
                    .map(([question, text]) => `${question} ${text}`),
                )
              }
              className="btn btn-primary px-4 py-2 text-[13px]"
            >
              <ButtonLabel
                busy={busy}
                idle="Try again with what I told you"
                working="Reading your bullets again…"
              />
            </button>
            {/*
              The hint is only shown while it runs, and it names the shape of the wait rather than a
              duration: one call per bullet means a CV with four jobs waits noticeably longer than one
              with one, and a fixed "about ten seconds" would be wrong for most people.
            */}
            {busy && (
              <span className="text-meta leading-relaxed text-ink-soft">
                One pass over every bullet — the longer your history, the longer
                this takes.
              </span>
            )}
          </div>
        )}

      {pending.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => pending.forEach(onAccept)}
            className="btn btn-quiet px-3.5 py-1.5 text-[13px]"
          >
            Use all {pending.length}
          </button>
          {/* Present, never pre-selected (docs/06). The default state is always "decide each one". */}
          <span className="text-meta leading-relaxed text-ink-soft">
            You can still change any of them afterwards.
          </span>
        </div>
      )}

      {(guarded.length > 0 || questionsOnly.length > 0) && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="self-start text-meta font-medium text-signal underline decoration-signal/30 underline-offset-4 hover:decoration-signal"
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
              className="flex flex-col gap-2 rounded-choice border border-affirm/25 bg-affirm-wash p-3.5"
            >
              <p className="text-[13px] leading-relaxed text-ink">
                {rewrite.original}
              </p>
              {/*
                The one place a user sees the guard work for them. Hiding it would read as "we had no
                ideas here", which is untrue and much less reassuring than the truth.

                Affirm green, and that is not a mistake: from the candidate's side this is the system
                protecting them, so it should look like something that went right rather than like a
                failed suggestion.
              */}
              <p className="text-meta leading-relaxed text-ink-soft">
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
              className="flex flex-col gap-2 rounded-choice border border-hairline bg-ground p-3.5"
            >
              <p className="text-[13px] leading-relaxed text-ink">
                {rewrite.original}
              </p>
              <ul className="flex flex-col gap-1 border-l-2 border-l-signal-edge pl-3">
                {rewrite.questions.map((question) => (
                  <li
                    key={question}
                    className="text-meta leading-relaxed text-ink"
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
