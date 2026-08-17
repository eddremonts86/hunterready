/**
 * One name for a person's document, built one way.
 *
 * There were two implementations. The `.docx` one transliterated properly; the PDF one stripped
 * combining marks and stopped there, so the same nurse downloaded `Marta-Sorensen-CV.docx` and
 * `Marta-S-rensen-CV.pdf` from two buttons a centimetre apart. Its own doc comment claimed
 * `"Marta Sørensen" → "Marta-Sorensen-CV.pdf"`, which is what the code was supposed to do and not what
 * it did — the divergence was invisible because the browser read the filename out of a response header
 * that nothing in the codebase ever looked at.
 *
 * Sharing it is the actual fix. Two copies of a subtle rule drift, and this rule is subtle twice over.
 */

/**
 * Characters with no NFD decomposition.
 *
 * `é` is `e` plus a combining acute, so stripping combining marks handles it. **`ø` is not.** It is
 * U+00F8, a single character that decomposes to itself, and the same is true of `æ`, `ß`, `đ` and `ł`.
 * Relying on NFD alone turned `Marta Sørensen` into `Marta-S-rensen`, which is a Danish nurse's name
 * mangled in the filename of the document she is about to send to a Danish hospital. Two of the three
 * languages this product targets are full of these.
 */
const TRANSLITERATE: Record<string, string> = {
  ø: 'o',
  Ø: 'O',
  æ: 'ae',
  Æ: 'Ae',
  å: 'a',
  Å: 'A',
  œ: 'oe',
  Œ: 'Oe',
  ß: 'ss',
  đ: 'd',
  Đ: 'D',
  ð: 'd',
  Ð: 'D',
  þ: 'th',
  Þ: 'Th',
  ł: 'l',
  Ł: 'L',
  ñ: 'n',
  Ñ: 'N',
}

/**
 * `Marta Sørensen` → `Marta-Sorensen`. ASCII only, because some ATS portals reject a non-ASCII filename
 * outright and others accept it and then display it as mojibake to the person reading the application.
 *
 * Returns `''` for a name that leaves nothing behind — a CV whose only name is written in a script this
 * cannot romanise. The callers decide what to call that file; none of them may call it `-CV`.
 */
export function asciiName(fullName: string): string {
  return fullName
    .replace(/[øØæÆåÅœŒßđĐðÐþÞłŁñÑ]/g, (char) => TRANSLITERATE[char] ?? char)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * The filename for somebody's CV in a given format.
 *
 * `CV.pdf` when the name romanises to nothing — not `CV-CV.pdf`, which is what the PDF path produced,
 * because it substituted the fallback and *then* appended the suffix.
 */
export function documentFilename(
  fullName: string,
  extension: 'pdf' | 'docx' | 'html',
): string {
  const base = asciiName(fullName)
  return `${base === '' ? 'CV' : `${base}-CV`}.${extension}`
}
