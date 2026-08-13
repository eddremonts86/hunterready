/**
 * Serves a fixture Resume as JSON so the preview has data before ingestion exists.
 *
 * Temporary scaffolding: once Blocks 6–9 land, the real flow is upload → extract → edit, and
 * the resume lives in the browser rather than being fetched by name. Delete this route then.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { Resume } from '@/schema/resume'

const FIXTURES = ['nurse-senior', 'sales-junior', 'switcher'] as const
type FixtureName = (typeof FIXTURES)[number]

function isFixtureName(value: string): value is FixtureName {
  return (FIXTURES as ReadonlyArray<string>).includes(value)
}

export const Route = createFileRoute('/api/resume')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requested =
          new URL(request.url).searchParams.get('fixture') ?? 'nurse-senior'
        const name: FixtureName = isFixtureName(requested)
          ? requested
          : 'nurse-senior'

        const raw = await readFile(
          join(process.cwd(), 'fixtures/expected', `${name}.json`),
          'utf8',
        )

        // Parsed rather than passed through: the preview should never render a shape the
        // renderer would reject.
        return Response.json(Resume.parse(JSON.parse(raw)), {
          headers: { 'cache-control': 'no-store' },
        })
      },
    },
  },
})
