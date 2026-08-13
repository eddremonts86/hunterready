import { defineConfig } from 'vitest/config'

/**
 * Fast unit tests. `*.parity.test.ts` is excluded on purpose — those build the app and
 * boot a server, so they run from `pnpm test:parity` (see vitest.parity.config.ts).
 */
export default defineConfig({
  // Mirrors vite.config.ts. Without it the `@/` and `#/` tsconfig paths do not resolve
  // under Vitest and any test importing src/ fails at import time.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    /**
     * Vitest's 5s default is tuned for pure functions. Some tests here shell out to Tesseract and
     * read a 200-dpi page of pixels, which is seconds of real work per call — and a laptop absorbs
     * that while a CI runner does not.
     *
     * That is not hypothetical: the first push to this repo went green locally and red on GitHub with
     * five timeouts, every one of them an OCR-bearing test. The `--fast`-less local gate could not
     * catch it, because the one part of CI it cannot reproduce is the runner's CPU.
     *
     * Generous rather than tight, deliberately. A timeout here should mean "something hung", not
     * "the machine was busy" — a flaky gate teaches people to re-run it, which is worse than no gate.
     */
    testTimeout: 60_000,
    hookTimeout: 180_000,
    /**
     * One test file at a time.
     *
     * This suite shells out to LibreOffice, `pdftoppm` and Tesseract. Run in parallel, two files
     * rasterize the same 300-dpi page simultaneously and starve each other on a two-core runner — the
     * first CI run failed exactly that way, reporting `no_text_layer` for a scan that reads fine, from
     * two independent worker processes at once.
     *
     * Serial costs about half a minute of CI time. It buys a suite whose result depends on the code
     * rather than on how many cores the machine happened to have, which is the only kind of gate worth
     * having: a suite that fails one run in five teaches people to press re-run.
     */
    fileParallelism: false,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/.output/**',
      '**/dist/**',
      '**/*.parity.test.ts',
    ],
  },
})
