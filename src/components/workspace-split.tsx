/**
 * The workspace's two halves, and a handle between them.
 *
 * ## Why a fixed column was wrong
 *
 * The panel was 400px and the document took whatever was left. That is a guess about which of the two
 * somebody is doing, and it is wrong half the time: writing a summary in a 400px box wraps a sentence
 * into five lines and truncates an email address mid-word, while reading a rendered A4 wants every
 * pixel the other way. Both are real postures in the same session, and the person switching between
 * them is the only one who knows which they are in.
 *
 * ## Only where it is a split
 *
 * Below `lg` the two stack, and a drag handle between stacked blocks is a control that does nothing.
 * The panel group exists only on the wide layout; the narrow one renders the same children in the
 * same order with nothing around them.
 *
 * ## Remembering it
 *
 * `react-resizable-panels` v4 dropped `autoSaveId`, so the layout is stored here: read once before
 * the first paint, written back when a drag settles. A preference restated on every visit is not a
 * preference. Sizes are strings, because in v4 a number means pixels and a string means percent, and
 * a percentage is what survives a change of window.
 */
import { useEffect, useState } from 'react'
import type { Layout } from 'react-resizable-panels'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'

/** Tailwind's `lg`. Matched in JS because the panel group is a component, not a class. */
const WIDE = '(min-width: 1024px)'

/** A `Layout` is a map of panel id to flex-grow, so the panels below carry explicit ids. */
function readLayout(key: string): Layout | undefined {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return undefined
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return undefined
    }
    const entries = Object.entries(parsed)
    return entries.length > 0 &&
      entries.every(([, value]) => typeof value === 'number')
      ? (parsed as Layout)
      : undefined
  } catch {
    return undefined
  }
}

export function WorkspaceSplit({
  panel,
  document: doc,
  /** Distinguishes one workspace's remembered size from another's. */
  storageId,
}: {
  panel: React.ReactNode
  document: React.ReactNode
  storageId: string
}) {
  const [wide, setWide] = useState(false)
  const [layout, setLayout] = useState<Layout | undefined>(undefined)

  useEffect(() => {
    setLayout(readLayout(storageId))
    const query = window.matchMedia(WIDE)
    const sync = () => setWide(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [storageId])

  if (!wide) {
    return (
      <div className="flex flex-1 flex-col gap-5">
        {panel}
        {doc}
      </div>
    )
  }

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      defaultLayout={layout}
      onLayoutChanged={(next) => {
        try {
          localStorage.setItem(storageId, JSON.stringify(next))
        } catch {
          /* Private browsing. The drag still holds for this session. */
        }
      }}
      className="flex min-h-0 flex-1"
    >
      <ResizablePanel
        id="panel"
        defaultSize="34"
        minSize="24"
        maxSize="68"
        className="flex min-h-0 flex-col"
      >
        {panel}
      </ResizablePanel>
      {/*
        `withHandle` draws the grip. A handle nobody can see is a handle nobody tries, and this one is
        the answer to the complaint that started it.
      */}
      <ResizableHandle
        withHandle
        className="mx-3 w-px bg-hairline transition-colors hover:bg-signal-edge"
      />
      <ResizablePanel
        id="document"
        defaultSize="66"
        minSize="32"
        className="flex min-h-0 flex-col"
      >
        {doc}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
