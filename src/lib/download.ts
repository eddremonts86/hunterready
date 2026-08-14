/**
 * Saving a rendered document, without letting a failed render take the page with it.
 *
 * ## Why this is not a form POST any more
 *
 * It used to be. `downloadDocument` built a hidden `<form>`, submitted it, and let the browser stream
 * the response to disk — which is the textbook way to download a file without buffering it in memory,
 * and it was the wrong trade here for two reasons.
 *
 * The first is a bug that had nothing to do with loaders. A form POST is a **navigation**. As long as
 * the response carries `content-disposition: attachment` the browser saves it and stays put, but the
 * moment the server answers with anything else — a 422, or the 500 that an unhandled render throw
 * produces — the browser navigates to that response and the page is gone. Everything the person had on
 * screen lives in React state: the corrections they just made field by field, the rewrites they
 * accepted one at a time, the tailored variant. For an anonymous visitor, which ADR-023 makes the
 * default and the commonest case, none of it is stored anywhere. A render failure meant re-uploading
 * the file and redoing every correction, and the render path is precisely the part of this codebase
 * that has failed in production before (ADR-005, the WASM bug).
 *
 * The second is that a form POST cannot be awaited. There is no load event, no completion callback,
 * nothing — so the button could not say it was working even if we wanted it to. The slowest single
 * operation in the product, and the last one before the payoff, had no way to indicate it was running.
 *
 * Buffering the bytes fixes both, and the cost it was avoiding is not real at this size: a CV renders
 * to a few hundred kilobytes. The same pattern already downloads the GDPR export in
 * `account-controls.tsx`.
 *
 * ## The filename comes from the server
 *
 * A blob download takes its name from the anchor's `download` attribute, not from the header, so the
 * name has to be read back out of `content-disposition`. That is deliberate rather than convenient:
 * `docxFilename` transliterates (`ø` has no NFD decomposition, so a naive slug produced
 * `Marta-S-rensen-CV.docx`) and `renderResume` has its own rules. Recomputing any of that here would be
 * a second implementation of a thing that is already subtle, and it would drift.
 */

/** What the caller needs to show a message that is true. Never carries CV content — see docs/07. */
export class DownloadFailed extends Error {}

/**
 * Pull the filename out of a `content-disposition` header.
 *
 * Handles the `filename*=UTF-8''…` form first, because that is the one that survives a non-ASCII name
 * correctly, then the plain quoted form. Returns `undefined` rather than guessing when neither parses —
 * the caller has a fallback and a wrong name is worse than a generic one.
 */
export function filenameFrom(header: string | null): string | undefined {
  if (header === null) return undefined

  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (encoded?.[1] !== undefined) {
    try {
      return decodeURIComponent(encoded[1].trim())
    } catch {
      /* a malformed escape sequence is not a filename; fall through to the plain form */
    }
  }

  const plain = /filename="?([^";]+)"?/i.exec(header)
  const name = plain?.[1]?.trim()
  return name === undefined || name === '' ? undefined : name
}

/**
 * Hand a blob to the browser as a saved file.
 *
 * Split out so the two callers share one revoke path: an object URL that is never revoked keeps the
 * whole document alive in memory for the life of the tab.
 */
function save(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * POST a JSON body to a render endpoint and save what comes back.
 *
 * Throws `DownloadFailed` with a sentence fit to show somebody. The caller is expected to catch it and
 * put it on screen: the whole point of moving off the form POST is that a failure is now something the
 * page can report instead of something the page disappears into.
 */
export async function saveRendered(
  url: string,
  body: unknown,
  fallbackName: string,
): Promise<void> {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new DownloadFailed(
      'We could not reach the server. Your CV is still here — try again.',
    )
  }

  if (!response.ok) {
    /**
     * Read the server's own sentence when it wrote one, and never surface a status code or a stack.
     * The endpoints answer with a coded `message`; anything else gets the generic line, because an
     * error page's HTML is not a message and pasting it on screen has told users nothing since 1997.
     */
    let message: string | undefined
    try {
      const payload = (await response.json()) as Record<string, unknown>
      if (typeof payload.message === 'string') message = payload.message
    } catch {
      /* not JSON — the generic line below is the honest answer */
    }
    throw new DownloadFailed(
      message ??
        'Something went wrong building the file. Your CV is still here — try again.',
    )
  }

  const blob = await response.blob()
  if (blob.size === 0) {
    // A zero-byte document is a failure that answered 200. Saving it would look like success and open
    // as a corrupt file in front of whoever the person sent it to.
    throw new DownloadFailed(
      'The file came back empty, so we did not save it. Please try again.',
    )
  }

  save(
    blob,
    filenameFrom(response.headers.get('content-disposition')) ?? fallbackName,
  )
}
