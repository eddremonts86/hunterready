/**
 * The app icons, generated from the wordmark rather than drawn by hand.
 *
 * ## Why a generator and not twelve PNGs somebody exported once
 *
 * The same reason `scripts/bundle-fonts.mjs` and `make-fixtures.mjs` are scripts: the inputs are the
 * two facts this product already has — Signal Blue (`#1b3bd8`) and Figtree, both read from source here
 * rather than retyped — so a token change is a re-run instead of an archaeology exercise. The PNGs are
 * committed because `public/` is served directly and the build must not need Chrome.
 *
 * ## The mark
 *
 * DESIGN.md defines no app icon, so this derives one from the only mark that exists: the wordmark,
 * whose signature is **the full stop in Signal Blue** (DESIGN.md line 60). At 48 physical pixels on a
 * home screen "HunterReady." is illegible and a lowercase mark is mush, so the icon keeps the initials
 * and the full stop — `HR.` — and inverts the colour relationship: the field carries the accent and
 * the glyph is white. Ink on white was the alternative and it disappears against a light wallpaper,
 * which is where half of these will sit.
 *
 * ## Maskable is a separate file on purpose
 *
 * Android crops a maskable icon to whatever shape the launcher likes, guaranteeing only the middle
 * 80%. Shipping one icon declared `"any maskable"` means either a mark that floats in a tiny island on
 * Chrome's own surfaces, or one that gets its edges shaved on a circular launcher. Two files, two
 * purposes: the plain pair is drawn to its own edge, the maskable pair holds the glyph inside the safe
 * circle and lets the blue bleed.
 *
 * Rendered by headless Chrome over the debugging protocol rather than with `--screenshot`. That flag
 * writes the PNG and then does not exit on this machine — the run produced one icon and hung until it
 * was killed, twice, once per profile. Driving one long-lived browser is both faster and the thing
 * that already works here.
 *
 *   node scripts/make-icons.mjs
 */
import { spawn } from 'node:child_process'
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public/icons')
const TMP = join(ROOT, '.icon-build')

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/** Read from source, never retyped — a token edit is meant to reach these files. */
const CSS = readFileSync(join(ROOT, 'src/styles.css'), 'utf8')
function token(name) {
  const found = new RegExp(`--color-${name}:\\s*([^;]+);`).exec(CSS)
  if (found === null)
    throw new Error(`make-icons: --color-${name} is not in styles.css`)
  return found[1].trim()
}
const SIGNAL = token('signal')
const GROUND = token('ground')

const FONT = join(
  ROOT,
  'node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2',
)
if (!existsSync(FONT)) throw new Error(`make-icons: Figtree is not at ${FONT}`)
const FONT_DATA = readFileSync(FONT).toString('base64')

/**
 * One icon's HTML.
 *
 * `safe` is the fraction of the square the glyph must stay inside. 1 for the plain icons, 0.8 for the
 * maskable ones — Android's guaranteed-visible region is a circle of 80% diameter, so anything outside
 * it is a mark that may or may not survive the launcher's crop.
 */
function page({ size, safe }) {
  // Optically fitted rather than derived: `HR.` is three glyphs, so a ratio that suits two leaves the
  // full stop hanging off the edge at 512 and clipped at 192.
  const fontSize = size * safe * 0.3
  return `<!doctype html><meta charset="utf-8"><style>
  @font-face {
    font-family: 'Figtree Variable';
    src: url(data:font/woff2;base64,${FONT_DATA}) format('woff2-variations');
    font-weight: 300 900;
  }
  html, body { margin: 0; padding: 0; background: ${SIGNAL}; }
  .icon {
    width: ${size}px; height: ${size}px;
    background: ${SIGNAL};
    display: flex; align-items: center; justify-content: center;
    font-family: 'Figtree Variable';
    font-weight: 800;
    font-size: ${fontSize}px;
    /* The wordmark's own tightening. Default tracking at this weight reads as three separate letters. */
    letter-spacing: ${-fontSize * 0.04}px;
    color: ${GROUND};
    /* Figtree's cap height leaves the optical centre low; nudged up by a fraction of the em. */
    line-height: 1;
    padding-bottom: ${fontSize * 0.06}px;
    box-sizing: border-box;
  }
</style><div class="icon">HR.</div>`
}

const TARGETS = [
  { name: 'icon-192.png', size: 192, safe: 1 },
  { name: 'icon-512.png', size: 512, safe: 1 },
  { name: 'icon-maskable-192.png', size: 192, safe: 0.8 },
  { name: 'icon-maskable-512.png', size: 512, safe: 0.8 },
  /* iOS applies its own corner radius and rejects transparency, so this is a square opaque tile. */
  { name: 'apple-touch-icon.png', size: 180, safe: 1 },
  { name: 'favicon-32.png', size: 32, safe: 1 },
  { name: 'favicon-16.png', size: 16, safe: 1 },
]

mkdirSync(OUT, { recursive: true })
mkdirSync(TMP, { recursive: true })

const PORT = 9422
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${join(TMP, 'profile')}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** The browser needs a moment before it answers; a fixed sleep here would be either flaky or slow. */
let version
for (let attempt = 0; attempt < 40; attempt += 1) {
  try {
    version = await (
      await fetch(`http://127.0.0.1:${PORT}/json/version`)
    ).json()
    break
  } catch {
    await sleep(250)
  }
}
if (version === undefined) {
  chrome.kill()
  throw new Error(
    'make-icons: headless Chrome never answered on the debugging port',
  )
}

const target = await (
  await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, {
    method: 'PUT',
  })
).json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve) =>
  ws.addEventListener('open', resolve, { once: true }),
)

let messageId = 0
const pending = new Map()
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id !== undefined && pending.has(message.id)) {
    pending.get(message.id)(message)
    pending.delete(message.id)
  }
})
function send(method, params = {}) {
  const id = (messageId += 1)
  return new Promise((resolve, reject) => {
    pending.set(id, (m) =>
      m.error
        ? reject(new Error(`${method}: ${m.error.message}`))
        : resolve(m.result),
    )
    ws.send(JSON.stringify({ id, method, params }))
  })
}

await send('Page.enable')

for (const icon of TARGETS) {
  /*
    `deviceScaleFactor: 1` so the PNG is the pixel count asked for. At the default 2 every icon came
    out double size, which a launcher scales down without complaint — the manifest would have been
    declaring sizes it did not have.
  */
  await send('Emulation.setDeviceMetricsOverride', {
    width: icon.size,
    height: icon.size,
    deviceScaleFactor: 1,
    mobile: false,
  })
  const html = page(icon)
  await send('Page.navigate', {
    url: `data:text/html;base64,${Buffer.from(html).toString('base64')}`,
  })
  // The face is a data URI in the document, so there is no network wait — only layout and rasterise.
  await sleep(350)
  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  })
  writeFileSync(join(OUT, icon.name), Buffer.from(data, 'base64'))
  console.log(
    `make-icons: ${icon.name}  ${icon.size}\u00d7${icon.size}${icon.safe < 1 ? '  (maskable safe zone)' : ''}`,
  )
}

ws.close()
chrome.kill()
/* Chrome still holds its profile directory for a moment after the signal; removing it first fails
   with ENOTEMPTY and leaves a stray `.icon-build/` behind. */
await new Promise((resolve) => chrome.once('exit', resolve))
rmSync(TMP, { recursive: true, force: true })
console.log(
  `make-icons: ${TARGETS.length} icons \u2192 public/icons/  (${SIGNAL} field, Figtree 800)`,
)
