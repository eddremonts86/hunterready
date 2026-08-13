//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
      /**
       * Off deliberately, and it is a considered trade rather than laziness.
       *
       * Without `noUncheckedIndexedAccess`, TypeScript types `array[i]` and a regex capture group
       * as always-present. This rule then reports every runtime guard over one as dead code and
       * asks for its removal — advice that would delete exactly the checks that stop the CV
       * parser crashing on a malformed file. The rule is only sound with that compiler flag on,
       * and turning it on costs ~70 call-site changes across the ingestion pipeline.
       *
       * Tech debt, tracked: enable both together in v0.2, in one pass, with the tests green.
       */
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
  {
    // Vendored pdfcn copy-paste code (src/components/pdf/VENDORED.md). We own it, but we do
    // not hold third-party source to our house style: it ships redundant type assertions,
    // and `eslint-disable` comments for Next.js rules this project does not have. Style
    // rules off, correctness left on, and `tsc --noEmit` still covers all of it — so a real
    // type error here still fails. Editing these files for lint taste would destroy the
    // ability to diff against upstream, which is the whole point of keeping them pristine.
    files: [
      'src/components/pdf/**/*.{ts,tsx}',
      'src/lib/pdf-primitives.tsx',
      'src/lib/pdf-svg.tsx',
      'src/lib/resolve-color.ts',
    ],
    linterOptions: { reportUnusedDisableDirectives: false },
    rules: {
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
  {
    // `.output` and `dist` hold build artifacts that are not in any tsconfig project,
    // so the typed parser errors on them. The scaffold does not ignore them.
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      '.output/**',
      'dist/**',
      '.nitro/**',
      '.tanstack/**',
    ],
  },
]
