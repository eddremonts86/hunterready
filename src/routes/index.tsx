/**
 * THESIS: the room and the print are different objects under different light. This screen refuses
 * the resume-builder convention of form-panel-beside-preview-panel by making the print a lit
 * object set into a dark bench.
 * OWN-WORLD: safelight amber on print black, Darkroom Brown bench, tray-rim hairlines, stencilled
 * caps labels, seven-segment tallies. Depth is amber falloff; no shadows.
 * STORY: their file becomes data, they check what we were unsure about, and they pull a print.
 * FIRST VIEWPORT: before a file exists, one dropzone and one sentence — nothing else, because the
 * artifact comes before any question (ADR-011). After it, the bench: controls and the check-list on
 * the left, the print under white light on the right, primary action at the bench's right end.
 * FORM: Darkroom Safelight Bay — user-pinned challenger over assigned index 7. Staging: twinned
 * probe, committed as bench-plus-inspection-window. Seed key 01690489.
 *
 * Flow: docs/11-flow.md. Load → Develop → Check → Inspect → Print, all client-side state: the
 * resume never goes anywhere except to /api/render to be typeset (ADR-004).
 */
import { useCallback, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Dropzone } from '@/components/dropzone'
import { PaperPreview } from '@/components/paper-preview'
import { ReviewForm } from '@/components/review-form'
import { Resume } from '@/schema/resume'
import type { FieldProvenance } from '@/schema/provenance'
import { needsReview } from '@/schema/provenance'
import { estimateFit } from '@/render/fit'
import { getTheme, THEME_IDS, themeLabels } from '@/render/themes'
import type { ThemeId } from '@/render/themes'
import { TEMPLATE_IDS, templates } from '@/render/templates/registry'
import type { TemplateId } from '@/render/templates/registry'

export const Route = createFileRoute('/')({ component: PrintRoom })

interface Loaded {
  resume: Resume
  provenance: Array<FieldProvenance>
  warnings: Array<string>
  method: 'llm' | 'rules'
  /** Read off an image. Carried through because it changes what the review step asks of the user. */
  ocr: boolean
}

const SAMPLES = [
  { id: 'nurse-senior', label: 'Nurse · 15 yrs' },
  { id: 'sales-junior', label: 'Sales · 3 yrs' },
  { id: 'switcher', label: 'Career switch' },
] as const

function Label({ children }: { children: React.ReactNode }) {
  return <div className="stencil text-[10px] text-safelight/70">{children}</div>
}

/**
 * The test strip: stepped, adjacent, reversible. DESIGN.md's answer to the darkroom's "there is no
 * undo" — every variant is previewed before it is committed, so this is the grammar for *every*
 * choice in the product rather than a one-off control.
 */
function TestStrip<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ id: T; label: string; hint?: string }>
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div className="flex flex-col gap-px">
      {options.map((option) => {
        const active = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            title={option.hint}
            className={[
              'group flex items-center gap-2.5 px-2.5 py-2 text-left transition-colors',
              active
                ? 'bg-safelight text-print-black'
                : 'text-tray-enamel/70 hover:bg-amber-shadow/25 hover:text-tray-enamel',
            ].join(' ')}
          >
            <span
              aria-hidden
              className={[
                'h-4 w-1.5 shrink-0',
                active
                  ? 'bg-print-black'
                  : 'bg-developer-gray group-hover:bg-silver-gray',
              ].join(' ')}
            />
            <span className="stencil text-[10px]">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** POSTs the edited resume so the download is what the user is looking at, not a fixture. */
function downloadPdf(resume: Resume, templateId: TemplateId, themeId: ThemeId) {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = `/api/render?template=${templateId}&theme=${themeId}&download=1`
  form.style.display = 'none'
  const input = document.createElement('input')
  input.type = 'hidden'
  input.name = 'resume'
  input.value = JSON.stringify(resume)
  form.appendChild(input)
  document.body.appendChild(form)
  form.submit()
  form.remove()
}

function PrintRoom() {
  const [loaded, setLoaded] = useState<Loaded | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [templateId, setTemplateId] = useState<TemplateId>('modern-intl')
  const [themeId, setThemeId] = useState<ThemeId>('modern')

  const upload = useCallback(async (file: File) => {
    setBusy(true)
    setError(undefined)
    try {
      const body = new FormData()
      body.append('file', file)
      const response = await fetch('/api/ingest', { method: 'POST', body })
      const payload = (await response.json()) as Record<string, unknown>

      if (!response.ok) {
        setError(
          typeof payload.message === 'string'
            ? payload.message
            : 'Something went wrong reading that file. Please try again.',
        )
        return
      }

      // Validate what came back rather than trusting it: the renderer must never see a shape it
      // would reject, and a bad response should surface here, not as a blank preview.
      const parsed = Resume.safeParse(payload.resume)
      if (!parsed.success) {
        setError(
          'We read your file but could not make sense of the result. Please try again.',
        )
        return
      }

      setLoaded({
        resume: parsed.data,
        provenance:
          (payload.provenance as Array<FieldProvenance> | undefined) ?? [],
        warnings: (payload.warnings as Array<string> | undefined) ?? [],
        method: payload.method === 'rules' ? 'rules' : 'llm',
        ocr: payload.ocr === true,
      })
    } catch {
      setError(
        'We could not reach the server. Check your connection and try again.',
      )
    } finally {
      setBusy(false)
    }
  }, [])

  const loadSample = useCallback(async (id: string) => {
    setBusy(true)
    setError(undefined)
    try {
      const response = await fetch(`/api/resume?fixture=${id}`)
      const parsed = Resume.safeParse(await response.json())
      if (parsed.success) {
        setLoaded({
          resume: parsed.data,
          provenance: [],
          warnings: [],
          method: 'rules',
          ocr: false,
        })
      }
    } catch {
      setError('Could not load the sample.')
    } finally {
      setBusy(false)
    }
  }, [])

  // ── Station 1: nothing but the dropzone ─────────────────────────────────────────────────
  if (loaded === undefined) {
    return (
      <div className="flex min-h-screen flex-col bg-print-black">
        <header className="bench rim mx-4 mt-4 flex items-baseline gap-3 px-4 py-3 lg:mx-6">
          <span className="stencil text-[13px] text-safelight">
            HunterReady
          </span>
          <span className="text-[10px] text-developer-gray">
            the print room
          </span>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
          <Dropzone onFile={upload} busy={busy} error={error} />

          <div className="flex flex-col items-center gap-2">
            <span className="stencil text-[9px] text-tray-enamel/40">
              or look at a sample first
            </span>
            <div className="flex flex-wrap justify-center gap-2">
              {SAMPLES.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void loadSample(sample.id)}
                  className="rim stencil px-3 py-1.5 text-[9px] text-tray-enamel/70 transition-colors hover:bg-amber-shadow/25 hover:text-tray-enamel"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Stations 3–5: check, inspect, print ─────────────────────────────────────────────────
  const template = templates[templateId]
  const theme = getTheme(themeId)
  const toCheck = loaded.provenance.filter(needsReview).length
  const readFields = loaded.provenance.length
  // A hint while they edit; the PDF is the authority on pagination.
  const fit = estimateFit(loaded.resume, theme)

  return (
    <div className="min-h-screen bg-print-black">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-4 p-4 lg:h-screen lg:p-6">
        <header className="bench rim flex flex-wrap items-baseline justify-between gap-3 px-4 py-3">
          <div className="flex items-baseline gap-3">
            <span className="stencil text-[13px] text-safelight">
              HunterReady
            </span>
            <span className="text-[10px] text-developer-gray">
              the print room
            </span>
          </div>
          <div className="flex items-center gap-4">
            {/* Every station re-enterable, no warning, nothing destroyed (DESIGN.md). */}
            <button
              type="button"
              onClick={() => {
                setLoaded(undefined)
                setError(undefined)
              }}
              className="stencil text-[9px] text-tray-enamel/50 underline decoration-dotted hover:text-tray-enamel"
            >
              start over
            </button>
            <button
              type="button"
              onClick={() => downloadPdf(loaded.resume, templateId, themeId)}
              className="stencil bg-safelight px-4 py-1.5 text-[10px] text-print-black transition-colors hover:bg-amber-shadow"
            >
              Pull a print
            </button>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 lg:min-h-0 lg:flex-row">
          {/* The bench: what changes the print, and what still needs checking. */}
          <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[340px] lg:overflow-y-auto">
            {loaded.warnings.length > 0 && (
              <div className="rim border-l-2 border-l-safelight bg-darkroom-brown/70 p-3">
                <Label>Worth knowing</Label>
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {loaded.warnings.map((warning, i) => (
                    <li
                      key={i}
                      className="text-[11px] leading-relaxed text-tray-enamel/80"
                    >
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <ReviewForm
              resume={loaded.resume}
              provenance={loaded.provenance}
              ocr={loaded.ocr}
              onChange={(resume) => setLoaded({ ...loaded, resume })}
            />

            <div className="bench rim flex flex-col gap-4 p-3">
              <div className="flex flex-col gap-2">
                <Label>Paper</Label>
                <TestStrip
                  options={TEMPLATE_IDS.map((id) => ({
                    id,
                    label: templates[id].label.replace('Modern — ', ''),
                    hint: templates[id].hint,
                  }))}
                  value={templateId}
                  onChange={setTemplateId}
                />
                <p className="text-[10px] leading-relaxed text-developer-gray">
                  {template.hint}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Developer</Label>
                <TestStrip
                  options={THEME_IDS.map((id) => ({
                    id,
                    label: themeLabels[id].label,
                    hint: themeLabels[id].hint,
                  }))}
                  value={themeId}
                  onChange={setThemeId}
                />
                <p className="text-[10px] leading-relaxed text-developer-gray">
                  {themeLabels[themeId].hint}
                </p>
              </div>
            </div>
          </aside>

          {/* The inspection window: white light, hard edge, no radius. */}
          <main className="flex min-h-[70vh] flex-1 flex-col lg:min-h-0">
            <div className="flex items-center justify-between bg-tray-enamel px-3 py-1.5">
              <span className="stencil text-[9px] text-print-black/60">
                Under white light
              </span>
              <span className="stencil text-[9px] text-print-black/45">
                A4 ·{' '}
                {template.atsRating === 'verified'
                  ? 'parse verified'
                  : 'design-first'}
                {` · ${fit.pages} page${fit.pages === 1 ? '' : 's'}`}
                {readFields > 0 &&
                  ` · ${readFields - toCheck}/${readFields} read cleanly`}
              </span>
            </div>
            {fit.advice !== undefined && (
              <p className="bg-tray-enamel px-3 pb-2 text-[10px] leading-relaxed text-print-black/70">
                {fit.advice}
              </p>
            )}
            <PaperPreview
              resume={loaded.resume}
              theme={theme}
              Template={template.Component}
            />
          </main>
        </div>
      </div>
    </div>
  )
}
