/**
 * Station 1 — Load. One screen, one job: get the file.
 *
 * Per docs/11-flow.md this is the *only* thing asked before the user sees a rendered CV. No
 * account, no questionnaire, no preferences. The consent line is here because this is the moment
 * the file is about to leave the browser, and it names the provider rather than gesturing at
 * "third parties" (docs/07-privacy.md).
 */
import { useRef, useState } from 'react'
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

export function Dropzone({
  onFile,
  busy,
  error,
}: {
  onFile: (file: File) => void
  busy: boolean
  error?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const take = (files: FileList | null) => {
    const file = files?.[0]
    if (file !== undefined) onFile(file)
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl leading-tight text-tray-enamel">
          Your CV, read back to you the way a machine reads it.
        </h1>
        <p className="text-[12px] leading-relaxed text-developer-gray">
          Upload what you already have. We pull out the details, you check them,
          and you get a clean PDF that automated screening can actually read.
        </p>
      </div>

      {/* Large target, one action, keyboard-reachable: this is used on a phone, at night. */}
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (!busy) take(e.dataTransfer.files)
        }}
        className={[
          'rim flex min-h-44 flex-col items-center justify-center gap-3 p-8 transition-colors',
          busy ? 'cursor-wait opacity-60' : 'cursor-pointer',
          dragging ? 'bg-amber-shadow/30' : 'bench hover:bg-amber-shadow/15',
        ].join(' ')}
      >
        <span className="stencil text-[11px] text-safelight">
          {busy ? 'Reading your file…' : 'Drop your CV here'}
        </span>
        <span className="text-[11px] text-developer-gray">
          {/*
            "A few seconds" was true until scans went through OCR, which takes closer to half a
            minute — and a progress message that has already expired is how a working upload starts
            looking broken. The dropzone cannot know it is a scan until the server answers, so the
            copy covers both rather than promising the fast case.
          */}
          {busy
            ? 'A few seconds — longer for a scan or a photo'
            : 'or click to choose a file'}
        </span>
        <span className="stencil text-[9px] text-tray-enamel/40">
          PDF · Word (.docx, .doc) · plain text · a photo of a printed CV — up
          to {Math.round(MAX_BYTES / 1024 / 1024)} MB
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => take(e.target.files)}
      />

      {error !== undefined && (
        <div
          role="alert"
          className="rim border-l-2 border-l-safelight bg-darkroom-brown/70 p-3 text-[12px] leading-relaxed text-tray-enamel"
        >
          {error}
        </div>
      )}

      {/* Named provider, plain sentence, at the moment of the decision. */}
      <p className="text-[10px] leading-relaxed text-developer-gray">
        To read your CV we send its text to an AI model provider. We do not
        store your CV — it is processed and dropped. Your phone number and
        street address are removed before anything is sent.
      </p>
    </div>
  )
}
