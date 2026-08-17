/**
 * The web-page export.
 *
 * What is being asserted is that it is *the same document*, not a second implementation that resembles
 * it. The PDF path and this one share the theme, the axes and the template component; these tests
 * check the joins — that the chosen design's own words come out, that the fonts travel with the file,
 * and that the reader's chosen typeface and colour are honoured here exactly as they are in the print.
 *
 * The parse-back guarantee is not repeated here and should not be: the ATS round trip is about a PDF
 * going through a text extractor, and nobody uploads a `.html` to a screener. This file is for the
 * candidate's own use — a link, a portfolio page, something to print from a browser.
 */
import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { renderResumeHtml } from '../html'
import { Resume } from '@/schema/resume'

const base = Resume.parse(
  JSON.parse(await readFile('fixtures/expected/nurse-senior.json', 'utf8')),
)

/**
 * What a reader sees, rather than what the file says.
 *
 * React escapes an apostrophe to `&#x27;` on the way out, so a bullet reading "the team's first
 * one-pager" is present and correct in the page and absent from a naive `toContain`. Decoding the
 * handful of entities React emits is the difference between testing the document and testing the
 * encoder.
 */
function readable(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

describe('the HTML export', () => {
  it('carries the document itself, not a summary of it', async () => {
    const text = readable((await renderResumeHtml(base)).html)
    expect(text).toContain(base.basics.fullName)
    for (const job of base.work) {
      expect(text, `missing employer: ${job.company}`).toContain(job.company)
      expect(text, `missing role: ${job.role}`).toContain(job.role)
      for (const bullet of job.highlights) {
        expect(text, `missing bullet: ${bullet.slice(0, 40)}…`).toContain(
          bullet,
        )
      }
    }
  })

  it('is a whole page a browser can open on its own', async () => {
    const { html, filename } = await renderResumeHtml(base)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain(`<title>`)
    expect(filename).toMatch(/^[A-Za-z0-9-]+-CV\.html$/)
  })

  /**
   * The reason the file is large, and the reason it is worth it.
   *
   * ADR-022's lesson is that a font which is present but unreachable draws nothing and says nothing
   * about it. A CDN link would fail the same silent way on a machine that is offline or filtered, and
   * the person sending the file would never see it happen.
   */
  it('embeds its typefaces rather than fetching them', async () => {
    const { html } = await renderResumeHtml(base)
    expect(html).toContain('@font-face')
    expect(html).toContain('src:url(data:font/')
    expect(html).not.toMatch(/https?:\/\/[^"')]*fonts/i)
  })

  it('honours the reader’s own typeface and colours, the same as the print does', async () => {
    const { html } = await renderResumeHtml(base, {
      fonts: { body: 'Merriweather', heading: 'Bodoni Moda' },
      colours: { accent: '#7a1f3d', paper: '#fbf7f2' },
    })
    expect(html).toContain('Merriweather')
    expect(html).toContain('Bodoni Moda')
    expect(html.toLowerCase()).toContain('#7a1f3d')
    expect(html.toLowerCase()).toContain('#fbf7f2')
  })

  it('draws a spacer as room and no words', async () => {
    const plain = await renderResumeHtml({ ...base, custom: [] })
    const spaced = await renderResumeHtml({
      ...base,
      custom: [{ title: '', items: [], space: 64 }],
    })
    // The gap is in the markup…
    expect(spaced.html).toContain('64')
    // …and the readable text is untouched by it.
    expect(readable(spaced.html)).toBe(readable(plain.html))
  })

  it('escapes a name that contains markup rather than emitting it', async () => {
    const { html } = await renderResumeHtml({
      ...base,
      basics: { ...base.basics, fullName: '<script>alert(1)</script>' },
    })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
