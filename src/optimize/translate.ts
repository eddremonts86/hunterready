/**
 * Translating the whole document — v0.8's line, moved by its owner.
 *
 * ## What changed and why it is safe to change
 *
 * v0.8 translated headings and dates only, on the argument that a mistranslated job title is a wrong
 * claim about someone's career. That argument was about *silent* translation. This is the opposite: the
 * person picks a language and asks for their document in it (Edd: "si cambio el lenguaje aquí, todo el
 * documento debe ser en el idioma al que se cambió"). Translation on demand is not fabrication — no fact
 * is added — but it can still *damage* facts, so every model call runs inside guards:
 *
 *   - **Numbers survive verbatim.** A field whose translation does not contain exactly the same digits
 *     keeps its original text. "24-bed unit" may become "unidad de 24 camas"; it may not become 42.
 *   - **Proper nouns are never translated** — people, employers, institutions, products, emails, URLs.
 *     The prompt says so, and the fullName/company/institution/url fields are never sent at all.
 *   - **Empty or bloated answers keep the original.** A translation three times the source's length is
 *     the model editorialising, not translating.
 *
 * A field that fails a guard falls back to its own original — the failure mode is "one line stayed in
 * Danish", never "one line now says something else".
 *
 * ## Batched small, for the machine that has to run it
 *
 * Fields go to the model in small numbered batches (the local 3B model cannot satisfy a whole-resume
 * schema — the extraction path learned that the hard way), and each batch reports progress, so the
 * narrated wait shows "batch 3 of 9" instead of a silent minute.
 */
import type { Provider } from '@/structure/provider'
import type { Resume } from '@/schema/resume'
import { strings } from '@/render/locale'
import type { OutputLocale } from '@/render/locale'

/** One translatable string, addressed by a dot-path into the resume. */
interface Slot {
  path: Array<string | number>
  text: string
}

const BATCH_SIZE = 8

/** Digits, in order. Translation may move words; it may not touch a single number. */
export function digitsOf(text: string): string {
  return (text.match(/\d/g) ?? []).join('')
}

/** Whether a translated field is acceptable, or the original must be kept. */
export function guardTranslation(source: string, translated: string): boolean {
  if (translated.trim() === '') return false
  if (digitsOf(source) !== digitsOf(translated)) return false
  // Three times the length is the model explaining rather than translating.
  if (translated.length > Math.max(40, source.length * 3)) return false
  return true
}

/**
 * Every field the document owner is asking to have translated.
 *
 * Deliberately absent: fullName, company, institution, emails, phones, URLs, link labels? — link labels
 * yes ("Portafolio"), URLs no. Certification names stay: "Advanced Life Support (ALS)" is the name of a
 * certificate, and its Spanish employer knows it by that name.
 */
export function translatableSlots(resume: Resume): Array<Slot> {
  const slots: Array<Slot> = []
  const add = (path: Array<string | number>, text: string | undefined) => {
    if (text !== undefined && text.trim() !== '') slots.push({ path, text })
  }

  add(['basics', 'headline'], resume.basics.headline)
  add(['basics', 'summary'], resume.basics.summary)
  resume.basics.links.forEach((link, i) =>
    add(['basics', 'links', i, 'label'], link.label),
  )
  resume.basics.personalDetails.forEach((detail, i) => {
    add(['basics', 'personalDetails', i, 'label'], detail.label)
    add(['basics', 'personalDetails', i, 'value'], detail.value)
  })
  resume.work.forEach((job, i) => {
    add(['work', i, 'role'], job.role)
    add(['work', i, 'summary'], job.summary)
    job.highlights.forEach((text, j) => add(['work', i, 'highlights', j], text))
  })
  resume.education.forEach((entry, i) => {
    add(['education', i, 'degree'], entry.degree)
    add(['education', i, 'field'], entry.field)
    entry.highlights.forEach((text, j) =>
      add(['education', i, 'highlights', j], text),
    )
  })
  resume.skills.forEach((group, i) => {
    add(['skills', i, 'category'], group.category)
    group.items.forEach((item, j) => add(['skills', i, 'items', j], item))
  })
  resume.projects.forEach((project, i) => {
    add(['projects', i, 'description'], project.description)
    project.highlights.forEach((text, j) =>
      add(['projects', i, 'highlights', j], text),
    )
  })
  resume.languages.forEach((language, i) =>
    add(['languages', i, 'name'], language.name),
  )
  resume.custom.forEach((section, i) => {
    add(['custom', i, 'title'], section.title)
    section.items.forEach((item, j) => add(['custom', i, 'items', j], item))
  })

  return slots
}

/** Write one translated string back at its path, immutably. */
export function writeSlot(
  resume: Resume,
  path: Array<string | number>,
  value: string,
): Resume {
  const clone = structuredClone(resume) as unknown as Record<string, unknown>
  let cursor: unknown = clone
  for (const key of path.slice(0, -1)) {
    cursor = (cursor as Record<string | number, unknown>)[key]
  }
  ;(cursor as Record<string | number, unknown>)[path[path.length - 1]] = value
  return clone as unknown as Resume
}

export interface TranslateResult {
  resume: Resume
  translated: number
  /** Fields whose translation failed a guard and kept their original text. */
  kept: number
}

export async function translateResume(input: {
  resume: Resume
  target: OutputLocale
  provider: Provider
  onProgress?: (label: string, detail?: string) => void
  signal?: AbortSignal
}): Promise<TranslateResult> {
  const onProgress = input.onProgress ?? (() => {})
  const slots = translatableSlots(input.resume)
  const language = strings(input.target).endonym

  const batches: Array<Array<Slot>> = []
  for (let i = 0; i < slots.length; i += BATCH_SIZE) {
    batches.push(slots.slice(i, i + BATCH_SIZE))
  }

  let resume = structuredClone(input.resume)
  let translated = 0
  let kept = 0

  for (const [index, batch] of batches.entries()) {
    onProgress(
      `Translating into ${language}`,
      `batch ${index + 1} of ${batches.length}`,
    )

    let answers: Array<string> | undefined
    try {
      const response = await input.provider.client.messages.create(
        {
          model: input.provider.model,
          max_tokens: 2000,
          tools: [
            {
              name: 'submit_translations',
              description: `Submit the ${batch.length} translations, in order.`,
              input_schema: {
                type: 'object' as const,
                properties: {
                  translations: {
                    type: 'array',
                    items: { type: 'string' },
                    description: `Exactly ${batch.length} strings, one per numbered source line, same order.`,
                  },
                },
                required: ['translations'],
              },
            },
          ],
          tool_choice: { type: 'tool', name: 'submit_translations' },
          messages: [
            {
              role: 'user',
              content: `Translate each numbered line into ${language}. Rules, all binding:
- Translate the words; never the facts. Every number, date, percentage and quantity stays exactly as written.
- Never translate names of people, companies, institutions, products, certifications, or technologies. Emails and URLs stay untouched.
- One translation per line, same order, nothing added, nothing merged.
- Professional register, plain wording, no embellishment.

${batch.map((slot, i) => `${i + 1}. ${slot.text}`).join('\n')}

Call submit_translations.`,
            },
          ],
        },
        { signal: input.signal },
      )
      const tool = response.content.find(
        (block) => block.type === 'tool_use',
      ) as { input?: { translations?: unknown } } | undefined
      const raw = tool?.input?.translations
      answers = Array.isArray(raw)
        ? raw.filter((item): item is string => typeof item === 'string')
        : undefined
    } catch {
      answers = undefined
    }

    for (const [i, slot] of batch.entries()) {
      const candidate = answers?.[i]
      if (candidate !== undefined && guardTranslation(slot.text, candidate)) {
        resume = writeSlot(resume, slot.path, candidate.trim())
        translated++
      } else {
        // The failure mode is "this line stayed in its language", never "this line changed meaning".
        kept++
      }
    }
  }

  return { resume: { ...resume, locale: input.target }, translated, kept }
}
