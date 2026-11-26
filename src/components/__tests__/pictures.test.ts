/**
 * Pictures that explain (Mirror Wave 2): where a screen said in words what a
 * picture can say honestly, it shows the picture, with words for a screen
 * reader, and keeps in words only what the picture can't say.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import PlacementDiagram from '../PlacementDiagram'
import FramingDiagram from '../FramingDiagram'
import Glance from '../../screens/Glance'
import { sampleAnalysis } from '../../dev/sampleAnalysis'
import { REJECTIONS } from '../../lib/analysis/triage'
import { REFUSAL_PICTURE } from '../../lib/refusalPicture'
import { PLACEMENT } from '../../lib/placement'
import { assert, check, heading, report } from '../../lib/analysis/__tests__/harness'

const fs = fsUntyped as { readFileSync: (p: string, e: string) => string }
const code = (file: string) =>
  fs
    .readFileSync(`src/${file}`, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

heading('Pictures that explain (Mirror Wave 2)')

check('the camera’s first-time card draws where the phone goes, and says only the rest (M2.1)', () => {
  const svg = renderToStaticMarkup(createElement(PlacementDiagram))
  assert(svg.includes('role="img"') && svg.includes(`the phone stands ${PLACEMENT.distance} to your side`), 'the diagram has no words for a screen reader')
  const camera = code('components/FramingCheck.tsx')
  const card = camera.slice(camera.indexOf('className="film-rules"'), camera.indexOf('</ol>', camera.indexOf('className="film-rules"')))
  assert(card.includes('<PlacementDiagram />'), 'the card doesn’t draw the placement')
  assert(!/side-on/.test(card) && !card.includes('PLACEMENT.distance'), 'the card still says in words what the picture draws')
  assert(code('components/FilmingGuide.tsx').includes('<PlacementDiagram />'), 'the guide draws its own copy, not the one picture')
})

check('a refusal draws its fix where the reason is the camera, and only there (M2.2)', () => {
  assert(JSON.stringify(Object.keys(REFUSAL_PICTURE).sort()) === JSON.stringify([...REJECTIONS].sort()), 'a refusal reason is undecided')
  const live = sampleAnalysis()
  const g = globalThis as { localStorage?: unknown; window?: unknown }
  const before = { storage: g.localStorage, window: g.window }
  g.localStorage = { getItem: () => JSON.stringify({ handsFree: false }), setItem: () => {}, removeItem: () => {} }
  g.window = { matchMedia: () => ({ matches: false }) }
  const drawn = (reason: string) => {
    const analysis = { ...live, triage: { ...live.triage, status: 'rejected', reason } } as typeof live
    const out = renderToStaticMarkup(createElement(Glance, { analysis, onOpenReport: () => {}, onBack: () => {} }))
    assert(out.includes('glance-hints'), `the ${reason} refusal didn’t render`)
    return out.includes('feet at the bottom, racket at full reach') ? 'framing' : out.includes('the phone stands') ? 'placement' : null
  }
  try {
    for (const reason of REJECTIONS) assert(drawn(reason) === REFUSAL_PICTURE[reason], `${reason} draws ${drawn(reason)}, not ${REFUSAL_PICTURE[reason]}`)
    // A reason this build has no words for is refused with the placement's hint.
    assert(drawn('a_reason_from_a_newer_build') === 'placement', 'an unknown refusal draws no placement')
  } finally {
    g.localStorage = before.storage
    g.window = before.window
  }
  const svg = renderToStaticMarkup(createElement(FramingDiagram))
  assert(svg.includes('role="img"') && svg.includes('aria-label="The phone upright, with all of you'), 'the framing picture has no words for a screen reader')
})

report()
