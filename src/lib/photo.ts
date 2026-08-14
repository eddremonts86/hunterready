/**
 * Turning a photo somebody took into the square a European CV expects, entirely in their browser.
 *
 * ## Nothing is uploaded
 *
 * The file never leaves the tab. It is read with `FileReader`, drawn to a `<canvas>`, and re-encoded as a
 * `data:` URL that lives inside the resume JSON — so it is encrypted with everything else (ADR-021),
 * travels with each saved variant, and needs no binary storage anywhere. docs/07 is the reason this
 * matters more than convenience: a face is closer to a special category of personal data than the rest of
 * a CV, and the cheapest way to protect it is for it never to be sent.
 *
 * Re-encoding also strips EXIF, which is not a side effect worth losing. A phone photo carries GPS
 * coordinates, a camera serial number and a timestamp; sending a recruiter the latitude and longitude of
 * the room the picture was taken in is not something a person applying for a job has agreed to.
 *
 * ## Bounded, because this string ends up in a database row and a PDF
 *
 * The document draws the photo at 78pt ≈ 27.5mm, so there is a point past which extra pixels are bytes
 * nobody can see. Where that point sits was decided by the renderer rather than by the print size — see
 * `PHOTO_FORMAT`, which is the constraint that set `PHOTO_SIZE_PX`.
 */

/**
 * Pixels on each side of the stored square, and the number is a compromise the renderer forced.
 *
 * The document draws the photo at 78pt ≈ 27.5mm, so 325px would be 300dpi and 217px would be 200dpi.
 * 260 is about 240dpi: past the point where a photograph at that size looks soft, and — see the encoding
 * note below — a third of the bytes of 400px.
 *
 * Every one of those bytes is paid for four times: in the encrypted `jsonb` row, in the body of every
 * render request, in every share-link read, and in the GDPR export.
 */
export const PHOTO_SIZE_PX = 260

/**
 * **PNG, and not by preference.** takumi-pdf embeds a PNG data URL and *silently drops* a JPEG or WebP
 * one — the image simply is not in the PDF, with no error anywhere.
 *
 * Measured through the real endpoint, one 64px square encoded three ways, counting image XObjects in the
 * returned bytes: PNG → 1, JPEG → 0, WebP → 0. It was found because the browser preview showed a photo
 * and the downloaded PDF had none, which is the exact failure mode this project fears most — the preview
 * and the print disagreeing, quietly.
 *
 * The cost is real and it is why `PHOTO_SIZE_PX` came down. On photographic content, PNG is roughly five
 * times a JPEG: at 400px, 342KB against 54KB; at 260px, 139KB against 24KB. Those are worst-case numbers
 * from a noisy test image — a real portrait has smooth areas and compresses better — but the ceiling is
 * what has to fit in a database row.
 *
 * If a later version of the renderer learns JPEG, this is the constant to revisit, and `PHOTO_SIZE_PX`
 * can go back up at the same time.
 */
export const PHOTO_FORMAT = 'image/png'

/** What a file has to be under before we will even open it, so a 40MB RAW cannot lock up a phone. */
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024

/** Formats a browser can reliably decode into a canvas. HEIC is absent because Safari alone reads it. */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export interface CropRect {
  sx: number
  sy: number
  size: number
}

/**
 * Which square to take out of a `width × height` photo.
 *
 * Horizontally centred always. Vertically the caller chooses, and the default is **not** the centre: a
 * portrait photograph almost always has the head in the upper third, so a true centre crop takes the
 * chest and the chin. `offset` is 0 (flush to the top) to 1 (flush to the bottom), and 0.25 is the
 * default because it keeps a head whole in the overwhelming majority of phone portraits.
 *
 * Pure, and separated from the canvas for that reason: this is the part that can be wrong in a way a
 * screenshot would not show, and the part worth testing.
 */
export function squareCrop(
  width: number,
  height: number,
  offset = 0.25,
): CropRect {
  const size = Math.min(width, height)
  const clamped = Math.min(1, Math.max(0, offset))
  return {
    sx: Math.round((width - size) / 2),
    // `(height - size)` is zero on a landscape photo, so the offset correctly does nothing there.
    sy: Math.round((height - size) * clamped),
    size,
  }
}

/** Why a file was refused, in words the caller can show without translating a code. */
export type PhotoRejection = string

/**
 * Check a file before reading it. Returns `undefined` when it is fine.
 *
 * Type *and* size, because the two failures feel completely different to the person: one is "that is not
 * a picture" and the other is "that picture is enormous", and a single message covering both would be
 * wrong for each.
 */
export function rejectPhoto(file: {
  type: string
  size: number
}): PhotoRejection | undefined {
  if (!PHOTO_TYPES.includes(file.type)) {
    return 'That needs to be a JPEG, PNG or WebP. A photo straight off an iPhone is often HEIC — opening it and re-saving as JPEG works.'
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return `That file is ${Math.round(file.size / (1024 * 1024))}MB, which is more than we can open in a browser tab. Anything under ${MAX_PHOTO_BYTES / (1024 * 1024)}MB is fine.`
  }
  return undefined
}

/**
 * Draw the chosen square into a `data:` URL.
 *
 * Browser only — it needs a canvas. Kept here beside `squareCrop` so the two halves of one operation are
 * not in different files, and so the caller never has to touch a canvas itself.
 */
export function cropToDataUrl(
  image: HTMLImageElement,
  offset = 0.25,
): string | undefined {
  const { sx, sy, size } = squareCrop(
    image.naturalWidth,
    image.naturalHeight,
    offset,
  )
  const canvas = document.createElement('canvas')
  canvas.width = PHOTO_SIZE_PX
  canvas.height = PHOTO_SIZE_PX
  const context = canvas.getContext('2d')
  if (context === null) return undefined

  /**
   * White underneath, even though PNG keeps its alpha.
   *
   * A portrait cut out of its background would otherwise be transparent, and the square would show
   * whatever the page is — which is white today and is a theme's decision tomorrow. Filling it here means
   * the square in the sidebar and the square in the PDF are the same picture, which is the promise the
   * preview makes.
   */
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, PHOTO_SIZE_PX, PHOTO_SIZE_PX)
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    image,
    sx,
    sy,
    size,
    size,
    0,
    0,
    PHOTO_SIZE_PX,
    PHOTO_SIZE_PX,
  )
  return canvas.toDataURL(PHOTO_FORMAT)
}
