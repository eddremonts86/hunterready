/**
 * Step 1 — the one action. Get the file.
 *
 * Per docs/11-flow.md this is the *only* thing asked before the user sees a rendered CV. No account,
 * no questionnaire, no preferences. The consent line is here because this is the moment the file is
 * about to leave the browser, and it names what happens rather than gesturing at "third parties"
 * (docs/07-privacy.md).
 *
 * It carries no headline of its own: the hero in `routes/index.tsx` owns the page's one statement,
 * and this component is the object beside it. That split is why it can be dropped into the hero, the
 * band, or a step screen without any of them fighting over which text is the H1.
 */
import { useCallback, useRef, useState } from 'react'
import { Spinner } from '@/components/working'
import { MAX_BYTES } from '@/ingest/detect'

/**
 * Photos are here on purpose, and `capture` is deliberately absent.
 *
 * A phone shows "Take Photo" alongside the photo library for an `image/*` accept, which is exactly the
 * flow we want for someone whose only copy of their CV is on paper. Adding `capture="environment"`
 * would force the camera and take the library away, which is worse for the person who photographed it
 * yesterday.
 */
const ACCEPT = '.pdf,.docx,.doc,.txt,.md,image/png,image/jpeg'

/**
 * The file picker, lifted out of the dropzone so more than one control can open it.
 *
 * The hero's primary button and the upload card both need to open the same picker, and duplicating a
 * hidden `<input type="file">` per button is how two of them end up with different `accept` lists.
 * The caller renders `input` once and hands `open` to whatever should trigger it.
 *
 * The `value = ''` reset is a real bug fix, not tidiness: without it, choosing the same file a second
 * time fires no `change` event, so a user whose first upload failed and who picks that same file
 * again gets silence.
 */
export function useFilePicker(
  onFile: (file: File) => void,
  busy: boolean,
): { open: () => void; input: React.ReactNode } {
  const inputRef = useRef<HTMLInputElement>(null)

  const open = useCallback(() => {
    if (!busy) inputRef.current?.click()
  }, [busy])

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT}
      className="hidden"
      onChange={(event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file !== undefined) onFile(file)
      }}
    />
  )

  return { open, input }
}

export function Dropzone({
  onFile,
  onPick,
  busy,
  error,
}: {
  /** Drag-and-drop path. */
  onFile: (file: File) => void
  /** Opens the shared picker owned by the caller (see `useFilePicker`). */
  onPick: () => void
  busy: boolean
  error?: string
}) {
  const [dragging, setDragging] = useState(false)

  const take = (files: FileList | null) => {
    const file = files?.[0]
    if (file !== undefined) onFile(file)
  }

  const open = () => {
    if (!busy) onPick()
  }

  return (
    <div className="flex flex-col gap-4">
      {/*
        The card is the drop target; the pill inside it is the control.

        This used to be one large <button> that was also the drop zone, which meant the visible
        primary action could not itself be a button — you cannot nest one. Splitting them gets a real
        pill CTA (the world's signature form) and keeps the whole surface droppable and clickable.
        Keyboard users reach the actual <button>, so nothing depends on the div's click handler.
      */}
      <div
        onClick={open}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (!busy) take(event.dataTransfer.files)
        }}
        className={[
          'card lift flex flex-col items-center gap-4 px-6 py-9 text-center transition-colors sm:px-9',
          busy ? 'cursor-wait' : 'cursor-pointer',
          dragging
            ? 'border-signal bg-signal-wash'
            : 'hover:border-hairline-strong',
        ].join(' ')}
      >
        <span
          aria-hidden
          className={[
            'flex h-14 w-14 items-center justify-center rounded-full transition-colors',
            dragging ? 'bg-signal text-white' : 'bg-signal-wash text-signal',
          ].join(' ')}
        >
          {busy ? (
            /* A ring that turns. Honest about "something is happening" without claiming a percentage
               we do not have — the server does not report progress on an OCR pass. This was the
               original of the shared `Spinner`; it now uses it rather than keeping its own copy. */
            <Spinner className="h-6 w-6" />
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <path d="M14 3v5h5" />
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
              <path d="M12 17v-5m0 0-2 2m2-2 2 2" />
            </svg>
          )}
        </span>

        <div className="flex flex-col gap-1.5">
          {/*
            "Add your CV", not "Drop your CV here".

            There is no dragging on a phone, and this product expects phones — PRODUCT.md's user is
            as likely to have photographed a printed CV as to have a file on a desktop. A heading that
            names an interaction the device cannot perform reads as an instruction the person has
            failed to follow. The drag affordance is still there and is still advertised, on the line
            below and only where a real pointer exists.
          */}
          <p className="text-title text-ink">
            {busy ? 'Reading your CV…' : 'Add your CV'}
          </p>
          <p className="text-[14px] text-ink-soft">
            {!busy && (
              <span className="hidden [@media(hover:hover)_and_(pointer:fine)]:inline">
                Drag it here, or choose a file.{' '}
              </span>
            )}
            {/*
              "A few seconds" was true until scans went through OCR, which takes closer to half a
              minute — and a progress message that has already expired is how a working upload starts
              looking broken. The dropzone cannot know it is a scan until the server answers, so the
              copy covers both rather than promising the fast case.
            */}
            {busy
              ? 'A few seconds, longer for a scan or a photo'
              : 'PDF, Word, plain text, or a photo of a printed page.'}
          </p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={(event) => {
            // The parent handles it; without this the picker opens twice on some browsers.
            event.stopPropagation()
            open()
          }}
          className="btn btn-primary px-6 py-3 text-[15px]"
        >
          {busy ? 'Working…' : 'Choose a file'}
        </button>

        {/*
          `ink-soft`, not `ink-faint`. This is 13px content and ink-faint is 3.07:1 on white — the
          token's own comment in styles.css restricts it to structural and large-format use, and this
          line broke that rule the moment it was written. Which formats are accepted is exactly the
          sort of thing somebody squints at.
        */}
        <p className="text-meta text-ink-soft">
          Up to {Math.round(MAX_BYTES / 1024 / 1024)} MB · .pdf .docx .doc .txt
          .md .png .jpg
        </p>
      </div>

      {error !== undefined && (
        <div
          role="alert"
          className="rounded-card border border-alert/25 bg-alert-wash px-4 py-3 text-center text-[14px] leading-relaxed text-ink"
        >
          {error}
        </div>
      )}

      {/* Centred, to match the card above it. Left-aligned it read as a stray paragraph in a
          centred section rather than as this control's own footnote. */}
      <p className="text-center text-meta text-ink-soft">
        To read your CV we send its text to an AI model. We do not keep a copy,
        and your phone number and street address are removed first.
      </p>
    </div>
  )
}
