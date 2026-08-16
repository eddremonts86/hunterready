import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
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
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

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
