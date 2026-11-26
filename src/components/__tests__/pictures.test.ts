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

report()
