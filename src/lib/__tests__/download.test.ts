/**
 * Reading the filename back out of `content-disposition`.
 *
 * This is the one piece of the download path that is pure logic, and it is load-bearing in a quiet way:
 * a blob download takes its name from the anchor, so if this returns `undefined` the file silently
 * becomes `CV.pdf` for everybody. Nothing fails, nothing logs, and the name the server carefully
 * transliterated is thrown away.
 *
 * The non-ASCII cases are the point. `docxFilename` exists because `ø` has no NFD decomposition and a
 * naive slug produced `Marta-S-rensen-CV.docx`; a parser that mangles what it fixed would put the defect
 * back one layer down.
 */
import { describe, expect, it } from 'vitest'
import { filenameFrom } from '../download'

describe('the plain form', () => {
  it('reads a quoted filename', () => {
    expect(filenameFrom('attachment; filename="Marta-Sorensen-CV.pdf"')).toBe(
      'Marta-Sorensen-CV.pdf',
    )
  })

  it('reads an unquoted filename', () => {
    expect(filenameFrom('attachment; filename=CV.docx')).toBe('CV.docx')
  })

  it('does not care about header case or spacing', () => {
    // Header casing is not ours to rely on: it survives one proxy and not the next.
    expect(filenameFrom('Attachment; FileName="CV.pdf"')).toBe('CV.pdf')
  })

  it('stops at the next parameter rather than swallowing it', () => {
    expect(filenameFrom('attachment; filename="CV.pdf"; size=1200')).toBe(
      'CV.pdf',
    )
  })
})

describe('the RFC 6266 encoded form, which is the one that survives a non-ASCII name', () => {
  it('decodes percent-escapes', () => {
    expect(
      filenameFrom("attachment; filename*=UTF-8''Marta-S%C3%B8rensen-CV.pdf"),
    ).toBe('Marta-Sørensen-CV.pdf')
  })

  it('prefers the encoded form when a header carries both', () => {
    /**
     * Servers send both for old clients: an ASCII fallback plus the real name. Taking the fallback would
     * silently prefer the degraded spelling of somebody's own name, which is the whole thing
     * `docxFilename`'s transliteration table was written to avoid.
     */
    expect(
      filenameFrom(
        'attachment; filename="Marta-Sorensen-CV.pdf"; ' +
          "filename*=UTF-8''Marta-S%C3%B8rensen-CV.pdf",
      ),
    ).toBe('Marta-Sørensen-CV.pdf')
  })

  it('falls back to the plain form when the escape sequence is malformed', () => {
    // `%zz` throws inside decodeURIComponent. A throw here would take down a working download over a
    // header we only ever wanted for cosmetics.
    expect(
      filenameFrom(
        'attachment; filename="CV.pdf"; filename*=UTF-8\'\'bad%zzname.pdf',
      ),
    ).toBe('CV.pdf')
  })
})

describe('when there is nothing to read', () => {
  it('returns undefined for a missing header, so the caller uses its own name', () => {
    expect(filenameFrom(null)).toBeUndefined()
  })

  it('returns undefined when the header carries no filename at all', () => {
    expect(filenameFrom('inline')).toBeUndefined()
  })

  it('returns undefined rather than an empty string', () => {
    // An empty `download` attribute makes the browser invent a name from the URL — which here is
    // `/api/render`, so the person receives a file called "render" with no extension.
    expect(filenameFrom('attachment; filename=""')).toBeUndefined()
  })
})
