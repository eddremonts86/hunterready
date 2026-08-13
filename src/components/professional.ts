/**
 * COMPATIBILITY SHIM — see src/components/pdf/VENDORED.md.
 *
 * `pdf/theme-provider.tsx` imports `professionalTheme` from `@/components/professional`;
 * the theme installs at `./pdf/theme-professional`.
 *
 * Note this is pdfcn's *own* professional theme, kept only to satisfy the provider's
 * default. HunterReady's document themes live in `src/render/themes/` and are the ones the
 * UI offers — pdfcn's carry colored accents, which a sector-neutral CV should not.
 */
export { professionalTheme } from './pdf/theme-professional'
