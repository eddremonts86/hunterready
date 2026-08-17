/**
 * The reader's chosen typefaces, laid over a theme.
 *
 * Extracted from `render.tsx` when the HTML export arrived, because the two paths have to produce the
 * same document and "the same" was about to mean "two copies of this that agree today". The colour half
 * already lived in one place — `withColours` — and this is its twin; a font substitution that happened
 * in the PDF and not in the HTML would be invisible until somebody compared the two files side by side,
 * which is exactly when it is most embarrassing.
 */
import type { PdfcnTheme } from '@/components/pdf/theme-types'
import { quoteFamily } from './themes/custom'

export function applyAxes(
  theme: PdfcnTheme,
  fonts: { body?: string; heading?: string } | undefined,
): PdfcnTheme {
  if (fonts === undefined) return theme
  /*
    Quoted, always. takumi parses `fontFamily` as CSS, and CSS rejects an unquoted family name ending
    in a digit: "Source Sans 3" fails with `Unexpected token: 3`. Two of the sixty catalogued families
    are named that way, and quoting all of them is simpler than remembering which. The loader strips
    the quotes again on its side, so both forms reach the same files — and a browser reading the HTML
    export needs them quoted for the same reason takumi does.
  */
  return {
    ...theme,
    typography: {
      ...theme.typography,
      body: {
        ...theme.typography.body,
        fontFamily:
          fonts.body === undefined
            ? theme.typography.body.fontFamily
            : quoteFamily(fonts.body),
      },
      heading: {
        ...theme.typography.heading,
        fontFamily:
          fonts.heading === undefined
            ? theme.typography.heading.fontFamily
            : quoteFamily(fonts.heading),
      },
    },
  }
}
