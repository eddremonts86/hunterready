/**
 * The way back to a CV you already saved, from the landing page.
 *
 * ## The absurdity this removes
 *
 * Saving worked. Loading did not — not because the code was missing, but because of *where it lived*. The
 * library panel renders inside the workspace, and the workspace only exists once a CV is loaded, so opening
 * a stored CV required uploading a CV first. Somebody with three saved versions had to find the original
 * file and upload it again to reach the list of things they had saved precisely so they would not have to.
 *
 * The storage was never the limit: `listResumes` returns every row and there is no cap. The only thing
 * missing was a door on the outside of the building.
 *
 * ## It says nothing at all when there is nothing to say
 *
 * Renders `null` for a visitor with no account, and for an installation with no database — the endpoint
 * answers 404 to both, deliberately (see `/api/library`), and this does not try to tell them apart. An
 * invitation to sign in belongs beside the CV somebody has just made, where it means "keep *this*", not on
 * a landing page where it is one more thing between a person and the upload button (ADR-011: the artifact
 * comes before any question).
 */
import { useEffect, useState } from 'react'
import { Spinner } from '@/components/working'
import { useSession } from '@/lib/auth-client'
import { Resume } from '@/schema/resume'

interface SavedRow {
  id: string
  label: string
  updatedAt: string
  resume: Resume
}

/** "3 days ago". Relative, because the useful question is "is this the one I did last week?". */
function ago(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const days = Math.floor((Date.now() - then) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  const months = Math.round(days / 30)
  return months === 1 ? 'a month ago' : `${months} months ago`
}

export function SavedCvs({
  onOpen,
}: {
  onOpen: (row: { id: string; resume: Resume }) => void
}) {
  const { data: session } = useSession()
  const signedIn = session?.user !== undefined && session.user !== null
  const [rows, setRows] = useState<Array<SavedRow> | undefined>()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!signedIn) {
      setRows(undefined)
      return
    }
    let cancelled = false
    setLoading(true)
    void fetch('/api/library')
      .then(async (response) => {
        if (!response.ok) return { resumes: [] }
        return (await response.json()) as { resumes?: Array<unknown> }
      })
      .then((payload) => {
        if (cancelled) return
        /**
         * Validated row by row, and a bad row is skipped rather than failing the list.
         *
         * A stored document can outlive a schema change by a deploy. Dropping the one row that no longer
         * parses still shows the other four; rejecting the payload would tell somebody with four good CVs
         * that they have none.
         */
        const parsed = (payload.resumes ?? []).flatMap((row) => {
          const shape = row as Partial<SavedRow> & { resume?: unknown }
          const resume = Resume.safeParse(shape.resume)
          if (!resume.success || typeof shape.id !== 'string') return []
          return [
            {
              id: shape.id,
              label: shape.label ?? 'Saved CV',
              updatedAt: shape.updatedAt ?? '',
              resume: resume.data,
            },
          ]
        })
        setRows(parsed)
      })
      .catch(() => {
        // A library that cannot be listed is not a reason to block the upload button behind an error.
        if (!cancelled) setRows([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [signedIn])

  if (!signedIn) return null
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-card border border-hairline bg-ground px-4 py-3">
        <Spinner className="h-3.5 w-3.5 text-signal" />
        <span className="text-[13px] text-ink-soft">
          Fetching what you have saved…
        </span>
      </div>
    )
  }
  if (rows === undefined || rows.length === 0) return null

  return (
    <div className="flex flex-col gap-2 rounded-card border border-hairline bg-ground p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-semibold text-ink">
          Pick up where you left off
        </h2>
        <span className="tally text-meta text-ink-soft">
          {rows.length} saved
        </span>
      </div>
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li key={row.id} className="border-b border-hairline last:border-b-0">
            <button
              type="button"
              onClick={() => onOpen({ id: row.id, resume: row.resume })}
              className="flex w-full items-baseline justify-between gap-3 rounded-field px-2 py-2.5 text-left transition-colors hover:bg-band"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-[14px] font-medium text-ink">
                  {row.label}
                </span>
                {/*
                  The name on the document and the date — never a filename, which is theirs.

                  The label above is now the headline the CV is aimed at ("Registered Nurse — Intensive
                  Care"), so repeating the headline here would print the same sentence twice. The name is
                  what confirms this is the right person's document, and the date is what separates two
                  versions aimed at the same kind of job.
                */}
                <span className="text-meta text-ink-soft">
                  {/* Always present: `Basics.fullName` is `z.string().min(1)`, and the row was parsed. */}
                  {row.resume.basics.fullName}
                  {row.updatedAt === '' ? '' : ` · saved ${ago(row.updatedAt)}`}
                </span>
              </span>
              <span className="shrink-0 text-[13px] font-semibold text-signal">
                Open
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
