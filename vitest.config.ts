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
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/.output/**',
      '**/dist/**',
      '**/*.parity.test.ts',
    ],
  },
})
