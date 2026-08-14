/**
 * The database client, constructed **lazily** — and that is not a micro-optimisation.
 *
 * ## The trap this avoids
 *
 * Building the client at module scope is enough to break the entire browser bundle without anyone
 * calling it. TanStack Start's generated route tree pulls every `src/routes/api/**` module into the
 * *client* bundle too — a route module has to exist client-side for client navigation, even when its
 * only client-relevant export is nothing at all. So any repository reachable from an API route
 * *executes* in the browser, and `postgres`'s Node internals reference `Buffer`.
 *
 * The symptom is the worst kind: `ReferenceError: Buffer is not defined` throws before React mounts,
 * the server-rendered HTML displays perfectly, every button silently stops working, and nothing
 * reaches the console through normal means. `builderhunt/src/shared/lib/db/client.ts` carries the
 * full account — it cost that project a debugging session with no visible error to start from.
 *
 * A `Proxy` that constructs on first property access means the bundle may *contain* this module
 * without ever *running* the connection.
 *
 * ## Two roles, not one
 *
 * `db` is the application role. `migrationDb` is the owner, used only by migrations and by the
 * retention sweep, and it is a separate URL so the web service never holds the owner identity —
 * `drizzle/0001_roles.sql` and the deploy runbook explain why.
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

type Db = PostgresJsDatabase<typeof schema>

/**
 * Conservative pool sizes. This runs on one small VPS beside a PDF renderer and Tesseract, and a
 * connection pool that is generous on paper is a memory bill in practice.
 */
const POOL = { max: 5, idle_timeout: 20, connect_timeout: 10 } as const

function lazy(resolveUrl: () => string): Db {
  let instance: Db | undefined
  const resolve = (): Db => {
    if (instance === undefined) {
      const url = resolveUrl()
      if (url === '') {
        throw new Error(
          'No database URL configured. Set DATABASE_URL; see docs/operations/deploy-runbook.md.',
        )
      }
      instance = drizzle(postgres(url, POOL), { schema })
    }
    return instance
  }
  // The whole point: nothing runs until a property is actually read.
  return new Proxy({} as Db, {
    get: (_target, property) => {
      const value = Reflect.get(resolve(), property)
      return typeof value === 'function' ? value.bind(resolve()) : value
    },
  })
}

const url = (name: string): string => (process.env[name] ?? '').trim()

/** The application role. Everything a request does goes through this. */
export const db: Db = lazy(() => url('DATABASE_URL'))

/**
 * The owner role: migrations, and the retention sweep that deletes expired rows.
 *
 * Falls back to `DATABASE_URL` so a local developer with one connection string is not blocked, but
 * production sets both and the runbook says so.
 */
export const migrationDb: Db = lazy(
  () => url('DATABASE_MIGRATION_URL') || url('DATABASE_URL'),
)

/** True when persistence is configured at all. The app is fully usable without it (ADR-019). */
export function isPersistenceEnabled(): boolean {
  return url('DATABASE_URL') !== ''
}

export { schema }
