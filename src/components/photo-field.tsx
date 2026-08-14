/**
 * The photo, for a European CV.
 *
 * Fourth instance this session of the same failure: `basics.photoUrl` has been in the schema since v0.1,
 * docs/05 describes a photo slot on `modern-eu`, and nothing rendered it and nothing set it. A field, a
 * paragraph of specification, and no way in.
 *
 * ## It never leaves the browser
 *
 * The file is read, cropped and re-encoded in the tab, and what is stored is a `data:` URL inside the
 * resume JSON — encrypted with everything else (ADR-021), carried along by every saved variant, no binary
 * storage anywhere, and never sent to a model. docs/07 treats a face as closer to a special category than
 * the rest of a CV, and the strongest protection available is that the bytes are never transmitted to a
 * third party at all. `photo.ts` carries the rest of the reasoning, including what re-encoding does to
 * the EXIF a phone attaches — GPS coordinates among it.
 *
 * ## It is only on one layout, and that is not a bug to fix
 *
 * `modern-intl` ignores a photo even when one is set, because US, UK and Irish guidance is to leave it
 * off and some screeners drop a document with an image in the header. So this control says where the
 * photo will appear rather than pretending the choice does not exist, and it offers to switch the layout
 * instead of quietly doing it: somebody who uploads a photo has not necessarily decided to apply under a
 * different convention.
 */
import { useRef, useState } from 'react'
import { Spinner } from '@/components/working'
import { cropToDataUrl, rejectPhoto } from '@/lib/photo'

export function PhotoField({
  value,
  onChange,
  /** True when the chosen template will actually draw it — the European one. */
  shown,
  onUseEuropeanLayout,
}: {
  value: string | undefined
  onChange: (next: string | undefined) => void
  shown: boolean
  onUseEuropeanLayout?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  /**
   * Where the square is taken from, top (0) to bottom (1).
   *
   * Exposed as a slider because the one thing an automatic crop reliably gets wrong is a head: portraits
   * put it in the upper third, and "it cut my face in half" is not something to leave a person to solve
   * by editing the file and starting again. The source image is held so moving the slider re-crops
   * without re-reading the file.
   */
  const [offset, setOffset] = useState(0.25)
  const sourceRef = useRef<HTMLImageElement | undefined>(undefined)

  const recrop = (at: number) => {
    const image = sourceRef.current
    if (image === undefined) return
    const next = cropToDataUrl(image, at)
    if (next !== undefined) onChange(next)
  }

  const take = (file: File | undefined) => {
    if (file === undefined) return
    setError(undefined)

    const refusal = rejectPhoto(file)
    if (refusal !== undefined) {
      setError(refusal)
      return
    }

    setBusy(true)
    const reader = new FileReader()
    reader.onerror = () => {
      setBusy(false)
      setError('We could not read that file. Try another one.')
    }
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => {
        setBusy(false)
        // A file can carry an image type and still not decode — a truncated download, mostly.
        setError('That file is not an image a browser can open.')
      }
      image.onload = () => {
        sourceRef.current = image
        const next = cropToDataUrl(image, offset)
        setBusy(false)
        if (next === undefined) {
          setError('We could not prepare that photo. Try another one.')
          return
        }
        onChange(next)
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold text-ink">Photo</span>

      <div className="flex items-start gap-3">
        {value === undefined ? (
          <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-field border border-dashed border-hairline-strong text-ink-faint">
            {busy ? (
              <Spinner className="h-5 w-5 text-signal" />
            ) : (
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                className="h-6 w-6"
              >
                <circle cx="12" cy="9" r="3.2" />
                <path d="M5 20c1.6-3.2 4-4.6 7-4.6s5.4 1.4 7 4.6" />
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
            )}
          </div>
        ) : (
          /*
            `img`, not a background: the square shown here is exactly the square that will be embedded, at
            the same aspect ratio, so what somebody approves is what a recruiter opens.
          */
          <img
            src={value}
            alt="Your photo, as it will appear on the CV"
            className="h-[72px] w-[72px] shrink-0 rounded-field border border-hairline object-cover"
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-meta leading-relaxed text-ink-soft">
            {value === undefined
              ? 'Normal on a CV in Denmark, Germany or Spain. It stays in this browser — we never send it anywhere.'
              : shown
                ? 'Top right of your CV. It stays in this browser — we never send it anywhere.'
                : 'Saved, but the International layout leaves photos off, so it is not on the document.'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="btn btn-quiet px-3 py-1.5 text-[12px]"
            >
              {value === undefined ? 'Add a photo' : 'Replace'}
            </button>
            {value !== undefined && (
              <button
                type="button"
                onClick={() => {
                  onChange(undefined)
                  sourceRef.current = undefined
                  setError(undefined)
                }}
                className="btn btn-quiet px-3 py-1.5 text-[12px]"
              >
                Remove
              </button>
            )}
            {value !== undefined &&
              !shown &&
              onUseEuropeanLayout !== undefined && (
                /*
                Offered, not done. Uploading a photo is not the same decision as applying under European
                convention, and switching the layout under somebody because they picked a file would be
                making a choice about their application on their behalf.
              */
                <button
                  type="button"
                  onClick={onUseEuropeanLayout}
                  className="btn btn-quiet px-3 py-1.5 text-[12px]"
                >
                  Use the European layout
                </button>
              )}
          </div>
        </div>
      </div>

      {/*
        The framing slider, only once there is something to frame. It re-crops from the source image held
        in memory, so dragging it costs no file read and loses no quality with each move — every crop comes
        from the original, never from the previous crop.
      */}
      {value !== undefined && sourceRef.current !== undefined && (
        <label className="flex items-center gap-2">
          <span className="text-meta shrink-0 text-ink-soft">Framing</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(offset * 100)}
            aria-label="Move the crop up or down"
            onChange={(event) => {
              const next = Number(event.target.value) / 100
              setOffset(next)
              recrop(next)
            }}
            className="h-1.5 min-w-0 flex-1 accent-signal"
          />
          <span className="text-meta shrink-0 text-ink-faint">
            {offset < 0.34 ? 'higher' : offset > 0.66 ? 'lower' : 'centred'}
          </span>
        </label>
      )}

      {error !== undefined && (
        <p
          role="status"
          className="rounded-field border border-caution/25 bg-caution-wash px-3 py-2 text-[13px] leading-relaxed text-ink"
        >
          {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          take(event.target.files?.[0])
          // Cleared so choosing the same file twice still fires a change.
          event.target.value = ''
        }}
      />
    </div>
  )
}
