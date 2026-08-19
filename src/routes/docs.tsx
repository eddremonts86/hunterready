/**
 * `/docs` — the `/v1` contract, browsable.
 *
 * ## What it renders, and why that is not a second description
 *
 * Scalar, pointed at `/v1/openapi.json` on this same origin. The document is generated from the Zod
 * schemas the runtime validates against (`src/api/openapi.ts`), so the page cannot describe a
 * `Resume` the API would reject. That is the whole reason there is a page rather than a prettier
 * Markdown file: `docs/api/README.md` was already a hand-written second description, and this
 * codebase has been bitten four times by descriptions that were true when they were written.
 *
 * The README is **not** replaced. It explains consent, what is deliberately absent, and a worked
 * example, and OpenAPI is worse at prose and better at reference. They sit beside each other.
 *
 * ## The test console, and the one thing that would have made it a privacy breach
 *
 * "Try it" on a CV API means somebody pasting a real document and a real key into a web page. That is
 * a reasonable thing for an API console to be for — and Scalar's quickstart configures `proxyUrl:
 * 'https://proxy.scalar.com'` to dodge CORS, which would route that document through a third party
 * we never named to anyone. It would have been the quietest possible violation of the one rule in
 * CLAUDE.md with no automated proof behind it.
 *
 * `/v1` is same-origin from here, so no proxy is needed at all. `proxyUrl` is set to the empty string
 * rather than left out, because "the default is fine" is an assumption and this is not a place to
 * hold one.
 *
 * ⚠️ **And a configuration option is a promise, so the page does not rely on one.** The first guard
 * written here grepped the built assets for `proxy.scalar.com` and went red: the string is compiled
 * into three Scalar chunks whether or not anything calls it. A grep cannot tell a dead constant from
 * a live default, and neither can a reader — so it was the wrong instrument, and loosening it until
 * it passed would have been the wrong fix.
 *
 * The page therefore carries `connect-src 'self'`. If a future Scalar release changes its default, if
 * the option is renamed, if somebody deletes the line below — **the browser refuses the request**.
 * The one rule in CLAUDE.md with no automated proof behind it now has one here that does not depend
 * on anybody reading this comment. Everything the page legitimately needs is same-origin already:
 * the document at `/v1/openapi.json`, and whatever the console posts to `/v1/*`.
 *
 * ## Theming
 *
 * `theme: 'none'` and the app's own tokens mapped onto Scalar's variables. Not an attempt to make it
 * indistinguishable — a reference renderer has its own furniture and pretending otherwise produces a
 * page belonging to neither. Signal is the accent, Figtree is the type, Ink is the text, and DESIGN.md's
 * three semantic colours are left alone: Scalar uses green and red for HTTP methods, which is its own
 * vocabulary and not ours to spend.
 *
 * Light only, forced. The app has no dark mode, so a docs page with one would be the second design
 * language this is trying to avoid.
 */
import { createFileRoute } from '@tanstack/react-router'
import { ApiReferenceReact } from '@scalar/api-reference-react'

/*
  Scalar's own stylesheet, and it is not optional.

  `theme: 'none'` turns off its *palette*, not its layout — the first build without this import
  rendered every heading, table and code block as unstyled flow text with a two-hundred-pixel logo
  at the bottom of the page. Everything was there and nothing was readable.
*/
import '@scalar/api-reference-react/style.css'

export const Route = createFileRoute('/docs')({
  head: () => ({
    meta: [
      { title: 'API reference | HunterReady' },
      /*
        Enforcement, not configuration. See the note on this module: the console on this page can
        carry a CV and an API key, and this is what makes "it goes to our server and nowhere else" a
        fact about the browser rather than a promise about a config object.

        `connect-src` only — this is not a hardening pass on the whole page, it is one directive
        about one risk. `'self'` covers the document fetch and every `/v1` call the console makes.
      */
      {
        'http-equiv': 'Content-Security-Policy',
        content: "connect-src 'self'",
      },
      {
        name: 'description',
        content:
          'Read a CV into structured fields, and render structured fields into a PDF that automated screening can parse.',
      },
    ],
  }),
  component: ApiDocs,
})

/**
 * Scalar's own variables, given the app's values.
 *
 * A string rather than a stylesheet because that is the shape `customCss` takes, and keeping it next
 * to the configuration means the two cannot be edited apart.
 */
const THEME = `
  .scalar-app {
    --scalar-font: 'Figtree Variable', 'Figtree', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    --scalar-font-code: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace;

    /* Ink, and its two quieter weights. */
    --scalar-color-1: #101a33;
    --scalar-color-2: #5a6478;
    --scalar-color-3: #8a93a6;

    /* One accent, and it is Signal. DESIGN.md allows exactly one. */
    --scalar-color-accent: #1b3bd8;
    --scalar-background-accent: #eef2ff;

    /* Ground, then Band for the panels that sit on it. */
    --scalar-background-1: #ffffff;
    --scalar-background-2: #f4f6fa;
    --scalar-background-3: #e2e7f0;
    --scalar-border-color: #e2e7f0;
  }
`

function ApiDocs() {
  return (
    <ApiReferenceReact
      configuration={{
        url: '/v1/openapi.json',
        theme: 'none',
        customCss: THEME,

        /*
          Same origin, so nothing needs proxying. Empty rather than absent: see the note above about
          what the default would have sent, and where.
        */
        proxyUrl: '',

        /*
          Scalar's AI chat, off by name rather than by accident.

          It is enabled by default on localhost and needs a paid key in production, so it would have
          disappeared on deploy on its own — which is precisely the wrong reason for it to be absent.
          A chat that reads the OpenAPI document and answers through somebody else's service is a
          decision, and it is not one this page needs: the document is 27 KB and it is right there.
          Left implicit, the next person to add a key turns it on everywhere without noticing.
        */
        agent: { disabled: true },

        /*
          Scalar's own toolbar — Developer Tools, Configure, Share, Deploy — is its platform's
          furniture, not this API's. `'localhost'` is the default and it puts a row of buttons that
          do nothing for us above our own title.
        */
        showDeveloperTools: 'never',

        // The app has no dark mode; a docs page with one would be a second design language.
        forceDarkModeState: 'light',
        hideDarkModeToggle: true,

        /* The document is the deliverable — a partner should be able to take it to their generator. */
        documentDownloadType: 'json',
      }}
    />
  )
}
