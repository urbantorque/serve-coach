// App icon source (DESIGN §0 "Chalk and Optic", §2.2 tokens). One simple geometric mark, not a tennis-ball
// clip-art: an optic ball at the peak of a dotted toss path above a chalk baseline, with a small bracket
// beside the peak for "how steady is your toss" (the D5 hero metric). Graphite tile (--surface-inverse),
// optic ball (--optic), chalk lines (--bg Day). All shapes sit inside the maskable safe zone (a circle of
// 40% of the size around the centre), so one drawing serves every purpose.
//
// Used by render-icons.mjs (PNG sizes via the Playwright library) and written to public/favicon.svg.

export const TOKENS = {
  tile: '#1A201C', // --surface-inverse (Day)
  optic: '#D4EE48', // --optic
  chalk: '#F1F3EF', // --bg (Day), the chalk of a court line
}

/**
 * @param {{ shape: 'square' | 'rounded', detail: 'full' | 'small' }} options
 *   square: full bleed (maskable, apple-touch-icon; the platform applies its own mask);
 *   rounded: a 22% rounded tile with transparent corners (favicon, "any" icons);
 *   small: drops the dotted path, which turns to noise below 48 px.
 */
export function iconSvg({ shape = 'rounded', detail = 'full' } = {}) {
  const { tile, optic, chalk } = TOKENS
  const bg = shape === 'square' ? `<rect width="512" height="512" fill="${tile}"/>` : `<rect width="512" height="512" rx="112" fill="${tile}"/>`
  const path =
    detail === 'full'
      ? `<line x1="236" y1="352" x2="236" y2="214" stroke="${chalk}" stroke-opacity="0.7" stroke-width="12" stroke-linecap="round" stroke-dasharray="0.1 30"/>`
      : ''
  const parts = [
    bg,
    `<line x1="150" y1="384" x2="362" y2="384" stroke="${chalk}" stroke-width="16" stroke-linecap="round"/>`,
    path,
    `<circle cx="236" cy="158" r="50" fill="${optic}"/>`,
    `<path d="M318 126 H350 V190 H318" fill="none" stroke="${chalk}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>`,
  ].filter(Boolean)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">\n  ${parts.join('\n  ')}\n</svg>\n`
}
