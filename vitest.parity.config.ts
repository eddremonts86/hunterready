import { defineConfig } from 'vitest/config'

/**
 * Production-parity suite (Block 1b). Slow by nature: it runs a real `pnpm build` and
 * boots the Nitro output, because that is the only thing that catches the class of bug
 * found in Block 1 — a green `vite dev` and a green `vite build` that still 500s in
 * production. Kept out of `pnpm test` so the fast loop stays fast.
 */
export default defineConfig({
  // Mirrors vite.config.ts so `@/` resolves here too.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.parity.test.ts'],
    // One build shared by the whole file; parallel builds would fight over .output.
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
})
