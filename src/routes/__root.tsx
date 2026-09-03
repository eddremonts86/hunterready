import { useEffect } from 'react'
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import appCss from '../styles.css?url'
import { registerServiceWorker } from '@/lib/pwa'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        /*
          `viewport-fit=cover` because installed on a phone this runs edge to edge, and without it
          iOS letterboxes the page between two grey bars on a notched device. It is only half the
          fix: it hands the notch's size to CSS as `env(safe-area-inset-*)`, and `styles.css` is
          where those are spent.
        */
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      {
        title: 'HunterReady | a CV automated screening can actually read',
      },
      {
        name: 'description',
        content:
          'Upload the CV you already have. We read it back to you the way a machine reads it, you check every detail, and you get a clean PDF that automated screening can parse.',
      },
      // The document is the product; a preview card that misrepresents it costs a share.
      { property: 'og:title', content: 'HunterReady' },
      {
        property: 'og:description',
        content:
          'Your CV, read back to you the way a machine reads it. Verifiably parseable PDFs.',
      },
      { property: 'og:type', content: 'website' },

      /*
        Installed-app metadata.

        `theme_color` in the manifest and this tag have to agree, and both are Ground rather than
        Signal. A blue status bar over this product's white chrome reads as a rendering fault, and
        DESIGN.md's one-accent rule is about controls — a status bar is not one.

        The two `*-web-app-capable` tags say the same thing to different browsers: the `apple-`
        prefixed one is what iOS has always read, the bare one is the standard Chrome adopted. iOS
        also needs its own title, because without it the home-screen label falls back to the
        `<title>` — which here is a sentence long enough to be truncated to "HunterReady | a CV…".
      */
      { name: 'theme-color', content: '#ffffff' },
      { name: 'application-name', content: 'HunterReady' },
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-title', content: 'HunterReady' },
      /*
        `default`, not `black-translucent`. Translucent draws the page under the clock and the
        battery, which needs every top-level surface to budget for it; this product's topbar is a
        white bar with a wordmark in it, and letting the system own that strip is both correct and
        one less thing to get wrong on a phone nobody here has.
      */
      { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      /*
        The manifest is what makes this installable at all; the icons are what it is installed as.
        There was no favicon of any kind before this — the tab showed a browser default — so the two
        PNGs are a fix as much as PWA plumbing.

        `apple-touch-icon` is separate because iOS ignores the manifest's icon array. Without it the
        home screen shows a screenshot of the page, which is unrecognisable at 60 pixels.
      */
      { rel: 'manifest', href: '/manifest.webmanifest' },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/icons/favicon-32.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '16x16',
        href: '/icons/favicon-16.png',
      },
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/icons/apple-touch-icon.png',
      },
    ],
  }),
  shellComponent: RootDocument,
  component: RootShell,
})

/**
 * The one component every route renders inside, and the only place client-side setup can live.
 *
 * `shellComponent` below produces the `<html>` document and **runs on the server only** — hydration
 * starts inside `<body>`, so an effect written there never fires in a browser. That was the first
 * attempt: the registration call was in the client bundle, `isSecureContext` was true, and
 * `getRegistrations()` returned an empty array with nothing logged, because the effect's component
 * was never mounted on the client.
 *
 * A root `component` rendering `<Outlet />` is what TanStack supplies by default, so naming it here
 * changes no rendering — it only gives the effect a mount point that exists on both sides.
 */
function RootShell() {
  useEffect(() => {
    void registerServiceWorker()
  }, [])

  return <Outlet />
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
