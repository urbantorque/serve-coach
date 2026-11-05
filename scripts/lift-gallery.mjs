#!/usr/bin/env node
/**
 * The before and after sets, side by side: `node scripts/lift-gallery.mjs`.
 *
 * Reads each set's log.json and writes docs/lift/gallery.html, one self-contained
 * page beside the pictures, opened from disk. Nothing here ships.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), 'docs', 'lift')
const logOf = (set) => JSON.parse(readFileSync(join(dir, set, 'log.json'), 'utf8'))
const before = new Map(logOf('before').map((s) => [s.name, s]))
const after = logOf('after')

const GROUPS = [
  ['First run', ['01', '02', '03', '04']],
  ['Filming', ['07']],
  ['Waiting', ['08']],
  ['The report', ['09', '10', '11', '12', '13', '14', '29']],
  ['When a clip is refused, or something fails', ['15', '16', '17', '26', '27', '28']],
  ['Today', ['18']],
  ['Progress', ['05', '06', '19', '21']],
  ['On court', ['24', '25']],
  ['Practice sessions', ['22', '23']],
  ['Settings', ['20']],
]

const NAMES = {
  '01': 'First open',
  '02': 'The first tap',
  '03': 'How to film',
  '04': 'The sample report',
  '05': 'Progress, with nothing yet',
  '06': 'History, with nothing yet',
  '07': 'The camera',
  '08': 'Waiting on a real clip',
  '09': 'A report on a real clip',
  10: 'A fresh report',
  11: 'A basket of serves',
  12: 'A report reopened',
  '12b': 'Against your own serve',
  13: 'A strain warning',
  14: 'A soft read',
  15: 'A refused clip',
  16: 'A video on its side',
  17: 'A crash',
  18: 'With a season behind it',
  19: 'Every serve',
  20: 'Settings',
  21: 'Progress, with a season',
  22: 'A finished practice',
  23: 'Planning a practice',
  24: 'The glance',
  25: 'The glance, a fault moved',
  26: 'The glance, refused',
  27: 'Offline, first open',
  28: 'Offline, no coach yet',
  29: 'Reduced motion',
}

const measure = (s) => (s ? `${s.screens} screens, ${s.controls} controls, ${s.words} words` : 'new')
const shot = (set, name) => {
  const full = join(dir, set, `${name}-full.png`)
  return { src: `${set}/${name}.png`, full: existsSync(full) ? `${set}/${name}-full.png` : `${set}/${name}.png` }
}

function card(state) {
  const key = state.name.slice(0, 3).replace(/-$/, '')
  const was = before.get(state.name)
  const a = shot('after', state.name)
  const b = was ? shot('before', state.name) : undefined
  return `<article>
  <h3>${NAMES[key] ?? state.name}</h3>
  <div class="pair">
    ${
      b
        ? `<figure><a href="${b.full}"><img loading="lazy" src="${b.src}" alt="Before: ${NAMES[key] ?? state.name}"></a><figcaption><strong>Before</strong> ${measure(was)}</figcaption></figure>`
        : `<figure class="none"><figcaption>Did not exist before</figcaption></figure>`
    }
    <figure><a href="${a.full}"><img loading="lazy" src="${a.src}" alt="After: ${NAMES[key] ?? state.name}"></a><figcaption><strong>After</strong> ${measure(state)}</figcaption></figure>
  </div>
</article>`
}

const sections = GROUPS.map(([title, keys]) => {
  const states = after.filter((s) => keys.some((k) => s.name.startsWith(`${k}-`) || s.name.startsWith(`${k}b-`)))
  return `<section><h2>${title}</h2><div class="grid">${states.map(card).join('\n')}</div></section>`
}).join('\n')

writeFileSync(
  join(dir, 'gallery.html'),
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Serve Coach, before and after</title>
<style>
:root { color-scheme: dark; }
body { margin: 0; padding: 32px 20px 64px; background: #0a0c10; color: #eef2f6; font: 16px/1.45 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
main { max-width: 1320px; margin: 0 auto; }
h1 { font-size: 34px; margin: 0 0 6px; letter-spacing: -0.02em; }
header p { margin: 0 0 8px; color: #a7b1c2; max-width: 62ch; }
h2 { font-size: 24px; margin: 44px 0 14px; letter-spacing: -0.01em; }
h3 { font-size: 16px; margin: 0 0 8px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 26px; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
figure { margin: 0; }
img { display: block; width: 100%; border-radius: 14px; box-shadow: 0 0 0 1px #232a36; }
figcaption { margin-top: 6px; font-size: 12.5px; line-height: 1.35; color: #a7b1c2; }
figcaption strong { display: block; color: #eef2f6; }
.none { display: grid; place-items: center; min-height: 240px; border-radius: 14px; box-shadow: inset 0 0 0 1px #232a36; color: #7b8799; }
a:focus-visible { outline: 2px solid #cdf94a; outline-offset: 2px; border-radius: 14px; }
</style>
</head>
<body>
<main>
<header>
<h1>Serve Coach, before and after</h1>
<p>Every state at 390 by 844, with the demo data the app ships for looking at these screens. Tap a picture for the whole page. Serves in the demo come from the synthetic rig, so their numbers are the rig's, not anybody's serve.</p>
</header>
${sections}
</main>
</body>
</html>
`,
)
console.log(`wrote docs/lift/gallery.html, ${after.length} states`)
