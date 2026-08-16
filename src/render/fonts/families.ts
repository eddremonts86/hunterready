/**
 * Which families exist, and the file slug each one is bundled under.
 *
 * Split out of the loader because the loader is server-only: it reads bytes with `node:fs` and resolves
 * paths with `process.cwd()`. The chooser in the interface needs the *names*, and importing them from
 * the loader dragged the whole reader into the browser bundle, where the page died on
 * `process is not defined`. One list, no Node, both sides.
 */
export const FAMILY_SLUGS: ReadonlyMap<string, string> = new Map([
  // ── The chooser's catalogue. Every one proved to render through takumi before it was offered. ──
  ['Lato', 'lato'],
  ['Open Sans', 'open-sans'],
  ['Noto Sans', 'noto-sans'],
  ['PT Sans', 'pt-sans'],
  ['Fira Sans', 'fira-sans'],
  ['IBM Plex Sans', 'ibm-plex-sans'],
  ['Work Sans', 'work-sans'],
  ['Public Sans', 'public-sans'],
  ['Rubik', 'rubik'],
  ['Karla', 'karla'],
  ['Mulish', 'mulish'],
  ['Manrope', 'manrope'],
  ['Inter', 'inter'],
  ['Barlow', 'barlow'],
  ['Asap', 'asap'],
  ['Poppins', 'poppins'],
  ['Montserrat', 'montserrat'],
  ['Nunito Sans', 'nunito-sans'],
  ['Outfit', 'outfit'],
  ['Urbanist', 'urbanist'],
  ['Jost', 'jost'],
  ['Barlow Condensed', 'barlow-condensed'],
  ['Fira Sans Condensed', 'fira-sans-condensed'],
  ['Saira Condensed', 'saira-condensed'],
  ['Encode Sans Condensed', 'encode-sans-condensed'],
  ['Oswald', 'oswald'],
  ['Merriweather', 'merriweather'],
  ['Libre Baskerville', 'libre-baskerville'],
  ['Crimson Text', 'crimson-text'],
  ['Cardo', 'cardo'],
  ['Spectral', 'spectral'],
  ['PT Serif', 'pt-serif'],
  ['Noto Serif', 'noto-serif'],
  ['Bitter', 'bitter'],
  ['Zilla Slab', 'zilla-slab'],
  ['Roboto Slab', 'roboto-slab'],
  ['Arvo', 'arvo'],
  ['Alegreya', 'alegreya'],
  ['Vollkorn', 'vollkorn'],
  ['Literata', 'literata'],
  ['Gelasio', 'gelasio'],
  ['Faustina', 'faustina'],
  ['Cormorant Garamond', 'cormorant-garamond'],
  ['Prata', 'prata'],
  ['Bodoni Moda', 'bodoni-moda'],
  ['IBM Plex Mono', 'ibm-plex-mono'],
  ['JetBrains Mono', 'jetbrains-mono'],
  ['Space Mono', 'space-mono'],
  ['Archivo', 'archivo'],
  ['Chivo', 'chivo'],
  ['Source Sans 3', 'source-sans-3'],
  ['Source Serif 4', 'source-serif-4'],
  ['Courier Prime', 'courier-prime'],
  ['Archivo Narrow', 'archivo-narrow'],
  ['Caveat Brush', 'caveat-brush'],
  // The character expansion (ADR-025): display, classical, grotesque, warm, geometric.
  ['Playfair Display', 'playfair-display'],
  ['EB Garamond', 'eb-garamond'],
  ['Space Grotesk', 'space-grotesk'],
  ['Lora', 'lora'],
  ['Josefin Sans', 'josefin-sans'],
])

/** Every family the renderer can draw, for a chooser to offer. */
export const REGISTERED_FAMILIES = [...FAMILY_SLUGS.keys()]
