/**
 * COMPATIBILITY SHIM — see src/components/pdf/VENDORED.md.
 *
 * pdfcn components import `usePdfcnTheme` / `useSafeMemo` from
 * `@/components/theme-provider`; the file installs at `./pdf/theme-provider`.
 */
export {
  PdfcnThemeProvider,
  usePdfcnTheme,
  useSafeMemo,
} from './pdf/theme-provider'
export type { PdfcnTheme, PdfcnThemeProviderProps } from './pdf/theme-provider'
