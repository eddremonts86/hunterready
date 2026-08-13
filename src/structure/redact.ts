/**
 * Data minimisation before the LLM call.
 *
 * A phone number and a street address contribute nothing to extraction quality — they are just
 * strings to be copied, and a regex copies them perfectly for free. So they never leave the
 * server. This is GDPR data minimisation as a concrete measurable act rather than a paragraph in
 * a policy (docs/07-privacy.md): the payload that reaches a third party is smaller by exactly the
 * fields that identify a person most directly.
 *
 * The redacted values are put back locally afterwards, so the user loses nothing.
 */

export interface Redaction {
  /** The text with sensitive spans replaced by placeholders. */
  text: string
  /** placeholder → original value, for reinstatement after extraction. */
  restore: Map<string, string>
}

/**
 * Phone numbers, permissively: international prefixes, spaces, dots, dashes, parentheses.
 * Requires 7+ digits so it cannot swallow a date range or a postcode.
 */
const PHONE = /(\+?\d[\d\s().-]{6,}\d)/g

/** Street addresses: a number attached to a street word, in our three languages. */
const STREET =
  /\b\d{1,4}\s+[A-ZÆØÅÁÉÍÓÚÑ][\wæøåáéíóúñ]*\s+(street|st|road|rd|avenue|ave|lane|ln|drive|dr|calle|avenida|vej|gade|allé|alle)\b\.?/gi

/** Danish/European style: street word then number ("Nørrebrogade 42"). */
const STREET_REVERSED =
  /\b[A-ZÆØÅ][\wæøå]*(vej|gade|allé|alle|straat|strasse|calle)\s+\d{1,4}[A-Za-z]?\b/gi

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

export function redactForLlm(text: string): Redaction {
  const restore = new Map<string, string>()
  let counter = 0

  const replace = (input: string, pattern: RegExp, kind: string): string =>
    input.replace(pattern, (match) => {
      // A "phone" with too few digits is something else — a date, a room count, a licence.
      if (kind === 'PHONE' && digitsOnly(match).length < 7) return match

      const placeholder = `[${kind}_${counter++}]`
      restore.set(placeholder, match.trim())
      return placeholder
    })

  let out = text
  out = replace(out, STREET, 'ADDRESS')
  out = replace(out, STREET_REVERSED, 'ADDRESS')
  out = replace(out, PHONE, 'PHONE')

  return { text: out, restore }
}

/** Put the real values back into any string the model returned. */
export function reinstate(value: string, restore: Map<string, string>): string {
  let out = value
  for (const [placeholder, original] of restore) {
    if (out.includes(placeholder)) out = out.split(placeholder).join(original)
  }
  return out
}

/** Walk an object graph and reinstate every string. */
export function reinstateDeep<T>(value: T, restore: Map<string, string>): T {
  if (restore.size === 0) return value
  if (typeof value === 'string') return reinstate(value, restore) as T
  if (Array.isArray(value)) {
    return value.map((item) => reinstateDeep(item, restore)) as T
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      out[key] = reinstateDeep(item, restore)
    }
    return out as T
  }
  return value
}

/**
 * The first phone number in the document, recovered locally. The model never sees it, so this is
 * how `basics.phone` gets filled.
 */
export function findPhone(text: string): string | undefined {
  const matches = [...text.matchAll(PHONE)]
    .map((m) => m[1].trim())
    .filter(
      (value) =>
        digitsOnly(value).length >= 7 && digitsOnly(value).length <= 15,
    )
  return matches[0]
}
