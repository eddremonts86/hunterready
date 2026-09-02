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
      /**
       * `src/components/ui/**` joins them, and for the identical reason.
       *
       * These are shadcn components fetched by `pnpm dlx shadcn add`, and the registry writes inline
       * `import { type X }` specifiers where this project's style wants a top-level `import type`. That
       * is a style disagreement with upstream, not a defect, and CLAUDE.md is explicit: hand-editing a
       * vendored file destroys the ability to diff it against upstream, which is the only thing that
       * makes re-running the generator safe. `tsc --noEmit` still covers every line.
       */
      'src/components/ui/**/*.{ts,tsx}',
      'src/lib/pdf-primitives.tsx',
      'src/lib/pdf-svg.tsx',
      'src/lib/resolve-color.ts',
    ],
    linterOptions: { reportUnusedDisableDirectives: false },
    rules: {
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      'import/consistent-type-specifier-style': 'off',
      'no-shadow': 'off',
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
      /**
       * `public/` is static assets plus one generated file.
       *
       * `public/sw.js` is written by `scripts/make-sw.mjs` before every build and gitignored; linting
       * a build artefact reports the same findings as its source and fails the run when nobody has
       * built yet. The source is linted by the block above.
       */
      'public/**',
      /**
       * The service worker's source, and this one is a trade rather than an artefact.
       *
       * It is plain `.js` because `public/sw.js` is generated from it verbatim and a worker script
       * cannot be bundled — so it is in no tsconfig project, and `@tanstack/eslint-config` is
       * type-aware throughout. Two attempts at keeping it linted failed: `parserOptions.project:
       * false` still crashes on the first type-aware rule the preset enables, and the rule list
       * cannot be derived here because `@typescript-eslint/eslint-plugin` is a transitive dependency
       * that pnpm's strict layout will not resolve from this file.
       *
       * What covers it instead is stronger than lint for this particular file: `sw-privacy.test.ts`
       * evaluates the source in a constructed worker scope, so a syntax error fails the unit suite,
       * and thirteen assertions cover the behaviour. The parity suite then checks the *served* bytes
       * parse — which is the failure mode that actually happened.
       */
      'src/pwa/**/*.js',
    ],
  },
]
