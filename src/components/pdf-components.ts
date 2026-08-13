/**
 * COMPATIBILITY SHIM — see src/components/pdf/VENDORED.md.
 *
 * Every pdfcn component's props interface extends `PDFComponentProps` from
 * `@/components/pdf-components`. That module is never created by the registry, **and the
 * type itself is never shipped anywhere** — so `TextProps`, `HeadingProps`, `StackProps`,
 * `SectionProps` and `LinkProps` all lost `children` and `style`, which is where 10 of the
 * 38 compile errors came from.
 *
 * Reconstructed from how the components use it: they read `children` and spread `style`
 * over the resolved theme styles. If a future pdfcn release ships the real type, delete
 * this definition and re-export theirs.
 */
import type { ReactNode } from 'react'
import type { Style } from '@/lib/pdf-primitives'

export type { Style }

/** Base props shared by every pdfcn PDF component. */
export interface PDFComponentProps {
  children?: ReactNode
  /** Merged over the theme-resolved styles, so callers can override any of them. */
  style?: Style
}
