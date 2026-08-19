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
import { readFile, stat } from 'node:fs/promises'
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

  /**
   * The paywall, asked the way somebody would walk around it.
   *
   * "Make it yours" sells a typeface and a colour of your own. A free layout wearing a paid design's
   * ink and face is most of what the paid design *is*, so leaving the axes ungated made the plan
   * optional — and not subtly: it is one query parameter on a public endpoint.
   *
   * Tested here rather than as a unit, because the claim being made is about the deployed server. A
   * mocked `entitlementFor` would pass while a build that dropped the check shipped, and this suite
   * exists precisely for the bugs that only appear once Nitro has the code (ADR-005).
   */
  it('hands the axes to a caller with no plan, because beta is on', async () => {
    /*
      The server above runs with no `HR_BETA_PAID_FREE`, which is what Coolify runs, so this is the
      deployed behaviour: beta defaults on and the axes are included. Asserted rather than assumed,
      because "everything is free during beta" is a promise made on the landing page and the only
      place it is true or false is a built server.
    */
    const plain = await fetch(`${baseUrl}/api/render?fixture=nurse-senior`)
    expect(plain.status, 'a free design untouched must still render').toBe(200)

    for (const axis of ['accent=%23aa0000', 'bodyFont=Merriweather']) {
      const res = await fetch(
        `${baseUrl}/api/render?fixture=nurse-senior&${axis}`,
      )
      expect(res.status, `expected 200 for ?${axis} during beta`).toBe(200)
      expect(res.headers.get('content-type')).toContain('application/pdf')
    }
  })

  /**
   * The shape that decides whether the local model is a free tier or a spinner.
   *
   * Ingest on production's local model took 57s (docs/plans/04), and this is the request a
   * first-time visitor makes before they have seen anything work. Held open, it is a request every
   * proxy and mobile network between a phone and the server is entitled to cut.
   *
   * Tested here rather than as a unit for the reason this whole suite exists: the claim is about a
   * built server. `job-result.ts` is a module-level `Map`, so a unit test proves the map works while
   * a build that split the route and the store across isolated contexts would ship — and the failure
   * would be a job id that never resolves, which looks exactly like a slow model.
   *
   * `plain.txt` on purpose: no LibreOffice, no Tesseract, no model. The pipeline falls back to the
   * rule engine, which is fine — what is under test is the shape, not the extraction.
   */
  describe('a long ingest hands back a job id instead of holding the request open', () => {
    const jobId = 'parity-6f1c9a24-detached-ingest'

    async function upload(fields: Record<string, string>) {
      const bytes = await readFile('fixtures/input/plain.txt')
      const form = new FormData()
      form.append(
        'file',
        new File([bytes], 'plain.txt', { type: 'text/plain' }),
      )
      for (const [k, v] of Object.entries(fields)) form.append(k, v)
      return fetch(`${baseUrl}/api/ingest`, { method: 'POST', body: form })
    }

    it('accepts in milliseconds, then serves the CV once and only once', async () => {
      const started = Date.now()
      const accepted = await upload({ progress: jobId, detach: 'true' })
      const acceptedIn = Date.now() - started

      expect(
        accepted.status,
        `expected 202, got ${accepted.status}. server log:\n${serverLog}`,
      ).toBe(202)
      expect(await accepted.json()).toEqual({ jobId })
      /*
        Generous by two orders of magnitude against the 57s it replaces. The number being asserted is
        "did not wait for the pipeline", not a performance budget — a tight bound here would go red on
        a loaded CI runner and teach everyone to re-run it.
      */
      expect(acceptedIn, 'the POST waited for the work').toBeLessThan(3_000)

      // Poll exactly as the page does, on the same 700ms rhythm.
      let collected: Response | undefined
      for (let i = 0; i < 90; i++) {
        const poll = await fetch(`${baseUrl}/api/result?id=${jobId}`)
        if (poll.status !== 204) {
          collected = poll
          break
        }
        await new Promise((r) => setTimeout(r, 700))
      }

      expect(collected, 'the job never produced a result').toBeDefined()
      expect(collected?.status).toBe(200)
      expect(collected?.headers.get('cache-control')).toBe('no-store')

      const body = (await collected?.json()) as {
        resume?: { basics?: { fullName?: string } }
        method?: string
      }
      // A real read of a real file, not an empty envelope with the right shape.
      expect(body.resume?.basics?.fullName).toMatch(/Whitfield/i)
      expect(body.method).toBeDefined()

      /*
        Collecting deletes. The id is in a URL, which is the least private place a string can be, and
        the thing behind it is somebody's name, email and phone number.
      */
      const second = await fetch(`${baseUrl}/api/result?id=${jobId}`)
      expect(second.status, 'the CV was still readable after collection').toBe(
        204,
      )
    })

    it('still answers with the CV itself when nobody asks to detach', async () => {
      /*
        The other shape, unchanged. Every existing caller and the `/v1` contract published this week
        depend on it, and one handler now serves both — so the day the detached path is edited, this
        is what says the synchronous one came along.
      */
      const res = await upload({ progress: 'parity-9e3b17c0-sync-ingest' })
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        resume?: { basics?: { fullName?: string } }
      }
      expect(body.resume?.basics?.fullName).toMatch(/Whitfield/i)
    })
  })

  it('says it is in beta, because it is', async () => {
    // The positive half of the release switch, on the server that runs Coolify's configuration.
    const res = await fetch(`${baseUrl}/api/processing`)
    const body = (await res.json()) as { beta?: boolean; paidDesigns?: boolean }
    expect(body.beta).toBe(true)
    expect(body.paidDesigns).toBe(true)
  })

  /**
   * The contract, and the page that draws it, against the build that ships.
   *
   * Both belong here rather than in a unit test, and for different reasons. The document is built by
   * calling `z.toJSONSchema` on the real `Resume` — which **500'd the first time it was requested**,
   * with "Transforms cannot be represented in JSON Schema", while `tsc` and every unit test stayed
   * green. And the page mounts a Vue application inside React through a bundler that has to agree
   * with both. Neither failure has a shape a mock can produce.
   */
  describe('the API describes itself', () => {
    it('serves an OpenAPI document generated from the live schemas', async () => {
      const res = await fetch(`${baseUrl}/v1/openapi.json`)
      expect(
        res.status,
        `expected 200, got ${res.status}. server log:\n${serverLog}`,
      ).toBe(200)
      expect(res.headers.get('content-type')).toContain('application/json')

      const doc = (await res.json()) as {
        openapi?: string
        servers?: Array<{ url: string }>
        paths?: Record<string, unknown>
        components?: {
          schemas?: Record<string, { properties?: Record<string, unknown> }>
        }
      }

      expect(doc.openapi).toMatch(/^3\.0\./)
      expect(Object.keys(doc.paths ?? {})).toContain('/v1/cv')
      /*
        The base URL is whatever the reader reached, never a constant. A document that hardcodes
        production points anybody evaluating a preview build at the live API.
      */
      expect(doc.servers?.[0]?.url).toBe(baseUrl)
      // Proof it came from `src/schema/resume.ts` and not from a fixture someone pasted in.
      expect(
        Object.keys(doc.components?.schemas?.Resume?.properties ?? {}),
      ).toContain('basics')
    })

    it('needs no key, because a contract you cannot read is one you cannot evaluate', async () => {
      // The only /v1 route that does not call `enterV1`, and the only one that should not.
      const res = await fetch(`${baseUrl}/v1/openapi.json`)
      expect(res.status).not.toBe(401)
    })

    it('serves the reference page', async () => {
      const res = await fetch(`${baseUrl}/docs`)
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('HunterReady')
    })

    it('forbids the reference page from connecting anywhere but here', async () => {
      /*
        The one that would have been a privacy breach rather than a bug.

        Scalar's quickstart sets `proxyUrl: 'https://proxy.scalar.com'` to dodge CORS. On a page whose
        "Test Request" button carries a **CV and an API key**, that routes somebody's employment
        history through a company nobody named to them.

        ⚠️ **The first version of this test grepped the built assets for that host and went red** —
        the string is compiled into three Scalar chunks whether or not anything calls it. A grep
        cannot tell a dead constant from a live default. Loosening it until it passed would have
        replaced a real question with a green tick, so the page carries `connect-src 'self'` instead
        and this asserts the browser is the thing enforcing it.

        Config can be renamed, defaults can change, a line can be deleted in a refactor. A CSP holds
        through all three.
      */
      const html = await (await fetch(`${baseUrl}/docs`)).text()

      const csp = /<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>/i.exec(
        html,
      )?.[0]
      expect(csp, `no CSP on /docs. server log:\n${serverLog}`).toBeDefined()
      /*
        Entity-decoded first: React serialises the apostrophes as `&#x27;`, which the browser's HTML
        parser unescapes before the CSP is read. Matching the raw markup would have meant either a
        regex nobody can read, or a test quietly asserting the wrong string.
      */
      const directive = (csp ?? '').replace(/&#x27;/g, "'")
      expect(directive).toMatch(/connect-src\s+'self'/)
    })
  })

  it('logs no unhandled server errors', () => {
    expect(serverLog).not.toMatch(/ENOENT|unhandled|HTTPError/i)
  })
})

/**
 * The paywall the beta suspends, proved against a build rather than a mock.
 *
 * A second server, which is worth what it costs. The suite's whole reason for existing is that a
 * mocked `entitlementFor` passes while a build that dropped the check ships (ADR-005), and beta
 * turning the gate off would otherwise have deleted the only place that claim was ever tested
 * against Nitro. The day pricing opens, this is the test that says the gate still exists.
 *
 * No rebuild: `.output` is whatever `beforeAll` above produced. Only the environment differs, which
 * is exactly the difference being tested.
 */
describe('with beta off, the paywall is still there', () => {
  let gated: ChildProcess | undefined
  let gatedUrl = ''

  beforeAll(async () => {
    const port = await freePort()
    gatedUrl = `http://127.0.0.1:${port}`
    gated = spawn('node', [SERVER_ENTRY], {
      cwd: ROOT,
      env: { ...PROD_ENV, PORT: String(port), HR_BETA_PAID_FREE: 'false' },
      stdio: 'pipe',
    })
    await waitForServer(`${gatedUrl}/`)
  })

  afterAll(() => {
    gated?.kill()
  })

  it('refuses custom typefaces and colours to a caller with no plan', async () => {
    const plain = await fetch(`${gatedUrl}/api/render?fixture=nurse-senior`)
    expect(plain.status, 'a free design untouched must still render').toBe(200)

    for (const axis of ['accent=%23aa0000', 'bodyFont=Merriweather']) {
      const res = await fetch(
        `${gatedUrl}/api/render?fixture=nurse-senior&${axis}`,
      )
      expect(res.status, `expected 402 for ?${axis}`).toBe(402)
      const body = (await res.json()) as { error?: string; message?: string }
      expect(body.error).toBe('axes_locked')
      // The refusal has to say what would unlock it; a bare 402 is a dead end on screen.
      expect(body.message).toContain('paid plan')
    }
  })

  it('refuses a paid design, which is the other half of the same gate', async () => {
    const res = await fetch(
      `${gatedUrl}/api/render?fixture=nurse-senior&template=sidebar&theme=onyx`,
    )
    expect(res.status).toBe(402)
    const body = (await res.json()) as { error?: string }
    expect(body.error).toBe('design_locked')
  })
})

/**
 * One switch out of beta, proved against a build with **both older switches set against it**.
 *
 * Edd's ask, 2026-08-19: a fast way to go from beta to release, reacting properly — while explicitly
 * leaving `HR_THIRD_PARTY_FOR_ALL=true` in Coolify, because the spend is capped by a monthly plan.
 *
 * That is why this server sets both of the old variables to `true` and then sets `HR_RELEASE` on top.
 * A release switch that merely *defaulted* the others off would pass a unit test and be defeated in
 * production by a variable nobody deleted — and the person flipping it would have no way to tell,
 * because the interface would look released while anonymous visitors kept spending tokens.
 *
 * Asserted against Nitro rather than a mock for the reason the whole suite exists (ADR-005): a build
 * that dropped the check would ship green.
 */
describe('one switch takes the product out of beta', () => {
  let released: ChildProcess | undefined
  let releasedUrl = ''

  beforeAll(async () => {
    const port = await freePort()
    releasedUrl = `http://127.0.0.1:${port}`
    released = spawn('node', [SERVER_ENTRY], {
      cwd: ROOT,
      env: {
        ...PROD_ENV,
        PORT: String(port),
        // Both of these say "give it away". The one below says no, and it is the one that counts.
        HR_THIRD_PARTY_FOR_ALL: 'true',
        HR_BETA_PAID_FREE: 'true',
        HR_UNLOCK_DESIGNS: 'true',
        HR_RELEASE: 'true',
      },
      stdio: 'pipe',
    })
    await waitForServer(`${releasedUrl}/`)
  })

  afterAll(() => {
    released?.kill()
  })

  it('reports itself out of beta, with nothing given away', async () => {
    const res = await fetch(`${releasedUrl}/api/processing`)
    const body = (await res.json()) as {
      beta?: boolean
      paidDesigns?: boolean
      thirdPartyForYou?: boolean
      provider?: string | null
      providers?: Array<unknown>
      plan?: string
    }

    expect(body.beta, 'HR_RELEASE=true and it still calls itself beta').toBe(
      false,
    )
    expect(body.plan).toBe('anonymous')
    /*
      The three that Edd named. `thirdPartyForYou` is the entitlement — the field `thirdPartyAvailable`
      looked like it answered and did not, which is how plan 04 came to carry an acceptance criterion
      that could never have passed.
    */
    expect(body.thirdPartyForYou).toBe(false)
    expect(body.paidDesigns).toBe(false)
    expect(body.provider ?? null).toBeNull()
    expect(body.providers ?? []).toHaveLength(0)
  })

  it('locks the paid catalogue, with the developer unlock set against it', async () => {
    const plain = await fetch(`${releasedUrl}/api/render?fixture=nurse-senior`)
    expect(plain.status, 'a free design must still render after release').toBe(
      200,
    )

    const paid = await fetch(
      `${releasedUrl}/api/render?fixture=nurse-senior&template=sidebar&theme=onyx`,
    )
    expect(paid.status).toBe(402)
    expect(((await paid.json()) as { error?: string }).error).toBe(
      'design_locked',
    )
  })

  it('locks the axes, which is the other half of the same gate', async () => {
    for (const axis of ['accent=%23aa0000', 'bodyFont=Merriweather']) {
      const res = await fetch(
        `${releasedUrl}/api/render?fixture=nurse-senior&${axis}`,
      )
      expect(res.status, `expected 402 for ?${axis} after release`).toBe(402)
      const body = (await res.json()) as { error?: string; message?: string }
      expect(body.error).toBe('axes_locked')
      // The refusal still has to say what would unlock it; a bare 402 is a dead end on screen.
      expect(body.message).toContain('paid plan')
    }
  })
})
