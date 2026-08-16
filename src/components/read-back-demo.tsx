/**
 * The hero's object: the product's core moment, animated.
 *
 * HunterReady's one interesting instant is when a file becomes a list of fields you can check. A
 * static screenshot cannot show that, and a claim about it ("smart extraction!") is just a claim. So
 * the hero plays it: a sample CV filling in field by field, with a tick on each detail and one marked
 * for checking at the end.
 *
 * ## Why this is a demo and not a lie
 *
 * DESIGN.md's **No Invented Proof** rule bans fabricated ratings, counts and testimonials. This is
 * deliberately none of those — it is a labelled illustration of our own interface, using the same
 * sample CV that ships in `fixtures/` and is reachable from the landing page as "Nurse · 15 yrs".
 * Nothing here asserts a fact about the world, about accuracy, or about anyone's results. The caption
 * says it is a sample, in words, under the card.
 *
 * It also does two jobs beyond decoration: it sets the expectation that the user will be *checking
 * our work* rather than typing their history, and — because the sample is Danish — it proves the
 * chrome's Latin-Extended coverage on the most-viewed screen in the product.
 *
 * ## Motion
 *
 * `prefers-reduced-motion` does not slow the loop down; it renders the finished state and never
 * starts a timer. A looping animation is the exact thing that setting exists for, and a person who
 * has asked for stillness should get the informative end state, not a frozen empty card.
 */
import { useEffect, useState } from 'react'

/** The same nurse who ships as a fixture, so nothing here is invented for the marketing. */
const DEMO = {
  initials: 'MS',
  name: 'Marta Sørensen',
  headline: 'Registered Nurse, Intensive Care',
  jobs: [
    {
      role: 'Shift Lead Nurse, Intensive Care',
      company: 'Rigshospitalet',
      dates: '2019 - Present',
    },
    {
      role: 'Nurse, Post-Operative Recovery',
      company: 'Herlev Hospital',
      dates: '2016 - 2019',
    },
    {
      role: 'Nurse, General Surgical Ward',
      company: 'Herlev Hospital',
      dates: '2014 - 2016',
      // The point of the whole card. A product that claims a perfect read is a product that is
      // lying; the one that says "this line I am unsure about" is the one you can trust.
      flagged: true,
    },
  ],
  education: 'BSc Nursing, Københavns Professionshøjskole',
  skills: ['Intensive care', 'Ventilator management', 'Triage'],
}

/** Reveal thresholds. One tick per field group, then a hold on the finished state. */
const STEPS = 6
const HOLD_TICKS = 9
const TICK_MS = 420

function Tick({ flagged = false }: { flagged?: boolean }) {
  return flagged ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-caution-wash px-1.5 py-0.5 text-[10px] font-semibold text-caution">
      check
    </span>
  ) : (
    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-affirm-wash text-affirm">
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-2.5 w-2.5"
      >
        <path d="m5 12.5 4.5 4.5L19 7" />
      </svg>
    </span>
  )
}

function Row({ show, children }: { show: boolean; children: React.ReactNode }) {
  if (!show) return null
  return <div className="rise">{children}</div>
}

export function ReadBackDemo() {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTick(STEPS)
      return
    }
    const timer = window.setInterval(() => {
      // Count up, hold on the finished state, then start over. The hold is the important part: the
      // completed card is what the page is actually saying, so it is what is on screen most.
      setTick((current) => (current >= STEPS + HOLD_TICKS ? 0 : current + 1))
    }, TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  const done = tick >= STEPS
  const progress = Math.min(100, Math.round((tick / STEPS) * 100))
  const status = done
    ? 'Read 8 of 9 details cleanly'
    : tick <= 1
      ? 'Reading your CV…'
      : tick <= 4
        ? 'Finding your experience…'
        : 'Reading your education…'

  return (
    <div className="flex flex-col gap-3">
      {/*
        One label for assistive technology instead of a looping list of half-built rows. A screen
        reader user gets the point of the illustration in a sentence; the animation is for eyes.
      */}
      <div
        role="img"
        aria-label="An illustration of HunterReady reading a sample CV: it fills in the name, three jobs, education and skills, ticking each detail and marking one date for checking."
        className="card lift overflow-hidden"
      >
        <div className="flex flex-col gap-2 border-b border-hairline px-5 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              {!done && (
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  className="h-3.5 w-3.5 animate-spin text-signal"
                >
                  <path d="M12 3a9 9 0 1 0 9 9" />
                </svg>
              )}
              {status}
            </span>
            <span className="tally text-[12px] font-semibold text-ink-soft">
              {done ? '1 to check' : `${progress}%`}
            </span>
          </div>
          <div aria-hidden className="h-1 w-full rounded-full bg-band">
            <div
              className="h-full rounded-full bg-signal transition-[width] duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5">
          <Row show={tick >= 1}>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-signal text-[13px] font-bold text-white">
                {DEMO.initials}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[15px] font-bold text-ink">
                  {DEMO.name}
                </span>
                <span className="truncate text-[13px] text-ink-soft">
                  {DEMO.headline}
                </span>
              </span>
              <span className="ml-auto">
                <Tick />
              </span>
            </div>
          </Row>

          <div className="flex flex-col gap-2.5">
            {DEMO.jobs.map((job, index) => (
              <Row key={job.role} show={tick >= 2 + index}>
                <div className="flex items-start gap-3 border-l-2 border-l-hairline pl-3">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[13px] font-semibold text-ink">
                      {job.role}
                    </span>
                    <span className="truncate text-[12px] text-ink-soft">
                      {job.company} · {job.dates}
                    </span>
                  </span>
                  <span className="ml-auto pt-0.5">
                    <Tick flagged={job.flagged === true} />
                  </span>
                </div>
              </Row>
            ))}
          </div>

          <Row show={tick >= 5}>
            <div className="flex items-center gap-3 border-l-2 border-l-hairline pl-3">
              <span className="truncate text-[12px] text-ink">
                {DEMO.education}
              </span>
              <span className="ml-auto">
                <Tick />
              </span>
            </div>
          </Row>

          <Row show={tick >= 6}>
            <div className="flex flex-wrap gap-1.5">
              {DEMO.skills.map((skill) => (
                <span key={skill} className="chip !py-0.5 !text-[12px]">
                  {skill}
                </span>
              ))}
            </div>
          </Row>
        </div>
      </div>

      {/* The label that keeps this an illustration rather than a claim (DESIGN.md: No Invented Proof). */}
      <p className="text-center text-meta text-ink-soft">
        A sample CV, read back field by field. This is the screen you get after
        uploading.
      </p>
    </div>
  )
}
