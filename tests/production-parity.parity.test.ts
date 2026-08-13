/**
 * Block 1b — production-parity guard.
 *
 * Exists because of a bug that already shipped once (Block 1, ADR-005): `vite dev`
 * rendered PDFs fine, `pnpm build` exited 0, and the built Nitro server returned 500
 * with ENOENT on takumi-pdf's WASM. Rollup bundles the module but never emits the 3.7 MB
 * binary, because it is loaded through `readFileSync(new URL(...))` rather than an import.
 *
 * So this suite refuses to trust the build's exit code. It builds, boots the real output,
 * and asks for a real PDF. Any future dependency, Nitro upgrade or export-map change that
 * breaks the WASM path fails here instead of in production.
 *
 *   pnpm test:parity
 *
 * To confirm the guard actually guards: remove `&& node scripts/copy-assets.mjs` from the
 * build script and watch it fail.
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const WASM_PATH = join(ROOT, '.output/server/pkg/takumi_pdf_wasm_bg.wasm')
const SERVER_ENTRY = join(ROOT, '.output/server/index.mjs')

let server: ChildProcess | undefined
let baseUrl = ''
let serverLog = ''

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('could not determine a free port'))
        return
      }
      const { port } = address
      probe.close(() => resolve(port))
    })
  })
}

/**
 * `NODE_ENV=production` is not decoration. Vitest sets `NODE_ENV=test`, and inheriting
 * that makes Vite's React plugin emit the *development* JSX transform (`jsxDEV`) into a
 * bundle that runs against production React — so every SSR render dies with
 * "jsxDEV is not a function" and the server 500s on every route. Found the hard way.
 */
const PROD_ENV = { ...process.env, NODE_ENV: 'production' }

function run(command: string, args: Array<string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: 'pipe',
      env: PROD_ENV,
    })
    let output = ''
    child.stdout.on('data', (c: Buffer) => (output += c.toString()))
    child.stderr.on('data', (c: Buffer) => (output += c.toString()))
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else
        reject(
          new Error(`${command} ${args.join(' ')} exited ${code}\n${output}`),
        )
    })
  })
}

async function waitForServer(url: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError = 'no attempt made'
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
      lastError = `status ${res.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`server never became ready: ${lastError}\n${serverLog}`)
}

beforeAll(async () => {
  // The build is the thing under test. Do not skip it when .output already exists.
  await run('pnpm', ['build'])

  const port = await freePort()
  baseUrl = `http://127.0.0.1:${port}`

  server = spawn('node', [SERVER_ENTRY], {
    cwd: ROOT,
    env: { ...PROD_ENV, PORT: String(port) },
    stdio: 'pipe',
  })
  server.stdout?.on('data', (c: Buffer) => (serverLog += c.toString()))
  server.stderr?.on('data', (c: Buffer) => (serverLog += c.toString()))

  await waitForServer(`${baseUrl}/`)
})

afterAll(() => {
  server?.kill()
})

describe('the built server can render a PDF', () => {
  it('emits the takumi WASM into the server output', async () => {
    const { size } = await stat(WASM_PATH)
    // ~3.7 MB today. A tiny file would mean something copied a placeholder.
    expect(size).toBeGreaterThan(1_000_000)
  })

  it('serves the app shell', async () => {
    const res = await fetch(`${baseUrl}/`)
    expect(res.status).toBe(200)
  })

  it('reports healthy, including the render prerequisites', async () => {
    const res = await fetch(`${baseUrl}/api/health`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      status: string
      checks: { wasm: boolean; fonts: boolean }
    }
    expect(body.status).toBe('ok')
    expect(body.checks.wasm).toBe(true)
    expect(body.checks.fonts).toBe(true)
  })

  it('emits the bundled fonts into the server output', async () => {
    // takumi has no base-14: without these the PDF renders blank pages, not an error.
    const { size } = await stat(
      join(ROOT, '.output/server/fonts/source-sans-3-latin-400-normal.woff2'),
    )
    expect(size).toBeGreaterThan(10_000)
  })

  it('returns a real PDF from the render route', async () => {
    const res = await fetch(`${baseUrl}/api/render?fixture=nurse-senior`)

    expect(
      res.status,
      `expected 200, got ${res.status}. server log:\n${serverLog}`,
    ).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/pdf')

    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(bytes.byteLength).toBeGreaterThan(5_000)

    // %PDF — the magic bytes. A JSON error page would fail here.
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('%PDF')
  })

  it('logs no unhandled server errors', () => {
    expect(serverLog).not.toMatch(/ENOENT|unhandled|HTTPError/i)
  })
})
