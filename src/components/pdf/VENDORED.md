# Vendored from pdfcn

Copy-paste components from the [pdfcn](https://www.pdfcn.dev) shadcn-compatible registry.
**We own this code now** — upstream fixes do not flow in (ADR-002).

- **Installed:** 2026-08-13
- **Registry:** `https://pdfcn.dev/r/{name}.json` (see `components.json`)
- **Renderer:** Takumi (`takumi-pdf` 0.6.4 + `@takumi-rs/helpers` 2.7.2)

## Installed

```bash
pnpm dlx shadcn@latest add \
  @pdfcn/takumi/text @pdfcn/takumi/heading @pdfcn/takumi/section \
  @pdfcn/takumi/stack @pdfcn/takumi/divider @pdfcn/takumi/list \
  @pdfcn/takumi/link @pdfcn/takumi/keep-together @pdfcn/takumi/page-break \
  @pdfcn/takumi/page-number

pnpm dlx shadcn@latest add \
  @pdfcn/takumi/theme-professional @pdfcn/takumi/theme-modern @pdfcn/takumi/theme-executive
```

Components: text, heading, section, stack, divider, list, link, keep-together,
page-break, page-number. Themes: professional, modern, executive. Plus
`theme-provider.tsx`, `theme-types.ts`, `primitives.ts`, `pdfcn-theme.ts`, and
`src/lib/{resolve-color,pdf-primitives,pdf-svg}.ts(x)`.

Not installed (add when a template needs them): alert, badge, card, data-table, form,
graph, key-value, page-footer, page-header, pdf-image, qr-code, signature, table,
watermark. `pdf-image` will be needed by `modern-eu` for the photo slot.

## Rule

**Do not edit these files to change behavior.** Wrap them in `src/render/templates/`
instead — hand edits destroy the ability to diff against upstream. The one exception is a
broken vendored file, and every such patch is listed below.

## ⚠️ The registry does not compile as shipped

Straight after install, `tsc --noEmit` reported **38 errors across 13 of the 16 installed
files** — and zero elsewhere in the project. Two distinct faults:

**1. Four module paths the registry never creates.** The components import from
`@/components/pdf-themes`, `@/components/pdf-components`, `@/components/theme-provider`
and bare `@/components`, while the files actually install under
`src/components/pdf/`. One of those, `PDFComponentProps`, **is not shipped anywhere at
all** — and since every component's props interface extends it, `TextProps`,
`HeadingProps`, `StackProps`, `SectionProps` and `LinkProps` all silently lost `children`
and `style`. That accounted for 10 of the 38 errors.

**2. One piece of dead code** tripping `noUnusedLocals`.

### How it is fixed: shims, not edits

Fault 1 is resolved by five **new** files that provide the paths the registry expects, so
not one vendored component is modified and the diff against upstream stays clean:

| Shim | Provides |
| --- | --- |
| `src/components/pdf-themes.ts` | re-exports the 12 theme interfaces from `./pdf/theme-types` |
| `src/components/pdf-components.ts` | re-exports `Style`, and **defines `PDFComponentProps`** (`children` + `style`), reconstructed from how the components use it |
| `src/components/theme-provider.ts` | re-exports the provider and its hooks |
| `src/components/professional.ts` | re-exports `professionalTheme` for the provider's default |
| `src/components/index.ts` | re-exports `professionalTheme` for the bare `@/components` import |

If a future pdfcn release ships the real `PDFComponentProps`, delete our definition and
re-export theirs.

## Local patches (edits to vendored files — keep this list at zero where possible)

### 1. `page-number/page-number.tsx` — removed dead code

`_formatPageNumber` was declared and referenced nowhere, breaking `noUnusedLocals`. It is
superseded: the component splits `format` on `{page}`/`{total}` and emits
`className="pageNumber"` / `className="totalPages"` spans, which is the Takumi convention
and works correctly — the `format` prop *is* honored. Re-apply after any re-install.

### 2. `src/lib/pdf-primitives.tsx` — invalid eslint-disable reference

Upstream writes `// eslint-disable-next-line eslint(nextjs/no-img-element)`. That is not a
valid rule reference and ESLint hard-errors on the unknown rule, so it cannot be silenced
by config. This project is not Next.js, so the rule will never exist here; the directive
was turned into a plain comment. Re-apply after any re-install.

## Lint and typecheck policy

`eslint.config.js` turns off two stylistic rules for these paths
(`no-unnecessary-type-assertion`, `no-unnecessary-condition`) and stops reporting unused
disable directives. Correctness rules stay on, and **`tsc --noEmit` covers every vendored
file** — a real type error here still fails the build. Holding third-party copy-paste
source to our house style would mean editing it, which is exactly what destroys the
ability to diff against upstream.

## Known caveats

- The theme files' doc comments reference `@react-pdf/renderer` and `StyleSheet.create`,
  so these components appear to be adapted from a react-pdf original. Expect the odd
  react-pdf idiom that the Takumi renderer ignores.
- `ColorTokens` requires `destructive`, `success`, `warning`, `info` and `accent`. A CV has
  no alerts, so HunterReady's own themes neutralize them to grays — otherwise a component
  that happens to reference one could put a colored badge inside a user's CV.
  See `src/render/themes/`.

## License

**Not documented on the pdfcn site** as of 2026-08-13 — no LICENSE in the registry payload
and no statement in the docs. Open question 1 in `docs/09-decisions.md`. Blast radius is
bounded: `takumi-pdf` underneath is a normal npm package with an active upstream, so worst
case we keep these files and drop the registry.
