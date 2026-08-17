/**
 * Liveness + readiness in one endpoint, used by the Dockerfile's HEALTHCHECK and by Coolify.
 *
 * "Readiness" here means the render path can actually work, because that is the only thing
 * this service exists to do and it is the part with real prerequisites: a WASM binary and
 * font files that the bundler does not emit and a bad deploy can silently drop (ADR-005).
 * A health check that only proves the process is listening would have reported green through
 * the exact outage Block 1 found.
 *
 * Returns no CV data and no configuration values — just what is present.
 */
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { REGISTERED_FAMILIES } from '@/render/fonts'

const WASM = join(process.cwd(), '.output/server/pkg/takumi_pdf_wasm_bg.wasm')

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        // In dev the WASM resolves from node_modules, so its absence in .output is expected.
        const built = await exists(join(process.cwd(), '.output/server'))
        const wasm = built ? await exists(WASM) : true

        let fonts = false
        try {
          const { loadThemeFonts } = await import('@/render/fonts')
          const loaded = await loadThemeFonts({
            typography: {
              body: { fontFamily: 'Source Sans 3' },
              heading: { fontFamily: 'Source Serif 4' },
            },
          })
          fonts = loaded.length > 0
        } catch {
          fonts = false
        }

        const ok = wasm && fonts

        return Response.json(
          {
            status: ok ? 'ok' : 'degraded',
            checks: {
              wasm,
              fonts,
              families: REGISTERED_FAMILIES.length,
            },
            /**
             * Which commit this bundle was built from.
             *
             * Three times in one session the answer to "why don't I see the change" was that the
             * container was serving an image built before the change, and each time it cost a round of
             * guessing at browser caches. Nothing in the interface says which build it is serving —
             * CLAUDE.md already warns about that in another context — so it says it here, and
             * `pnpm stale` turns it into one line.
             *
             * `unknown` when the build arg was not passed, which is honest: a missing stamp must not
             * read as "up to date".
             */
            build: process.env.HR_COMMIT ?? 'unknown',
          },
          { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } },
        )
      },
    },
  },
})
