/**
 * COMPATIBILITY SHIM — see src/components/pdf/VENDORED.md.
 *
 * pdfcn's components import their theme types from `@/components/pdf-themes`, a module the
 * registry never creates; the types actually install at `./pdf/theme-types`. This barrel
 * exists so not one vendored file has to be hand-edited.
 */
export type {
  BorderRadiusScale,
  ColorTokens,
  FontWeights,
  LetterSpacingScale,
  LineHeights,
  PageTokens,
  PdfcnTheme,
  PrimitiveTokens,
  SpacingScale,
  SpacingTokens,
  TypographyScale,
  TypographyTokens,
} from './pdf/theme-types'
