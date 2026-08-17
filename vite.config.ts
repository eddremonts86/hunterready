import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

/**
 * Where `/api/*` goes while `vite dev` is running.
 *
 * ## Why this exists, and why it reverses a rule
 *
 * CLAUDE.md said: one dev environment, the container on :3100, do not start a second. The reason it
 * gave was exact and correct — *"the dev server reaches no database and no model, so a feature can
 * look finished there and be broken in the only environment that runs it"* — and it cost this project
 * a session once already.
 *
 * That reason is what this removes. With the proxy, **every API call goes to the container**: the same
 * Postgres, the same model, the same WASM renderer, the same entitlements. The only thing the dev
 * server owns is the client bundle, which is exactly the thing being edited when somebody asks why
 * they have to rebuild a 700MB image to see a moved button. Edd, after the fourth rebuild in an hour:
 * *"¿no hay una forma de que no tengamos que recrear el contenedor para ver los cambios?"*
 *
 * ## What is still only true in the container
 *
 * Server-rendered output and anything Nitro bundles rather than serves. ADR-005's failure — a green
 * `vite dev`, a green `vite build`, and a 500 in production because Rollup never emitted the WASM —
 * lived in the build, not in the browser. So the rule that survives is narrower than the old one and
 * still binding: **before calling render work done, `pnpm build && pnpm start`, or rebuild the
 * container and request the route.** The fast loop is for iterating; the slow one is for believing.
 *
 * `HR_API` overrides the target for anyone running the stack on another port.
 */
const API_TARGET = process.env.HR_API ?? 'http://localhost:3100'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  server: {
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        // Better Auth sets cookies for the container's origin; without this they are dropped and
        // every signed-in test in the dev loop silently behaves like an anonymous one.
        cookieDomainRewrite: 'localhost',
      },
    },
  },
  plugins: [
    devtools(),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
