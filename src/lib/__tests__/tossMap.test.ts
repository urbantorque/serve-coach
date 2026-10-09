/**
 * The toss map (D6.3): which serves it holds, along which axis, and what it
 * draws for each.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import TossMap from '../../components/TossMap'
import { tossMapFor } from '../tossMap'
import type { TossPlacement } from '../analysis/tossPlacement'
import type { ServeTag } from '../storage/db'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const serve = (id: string, placement?: TossPlacement) => ({ id, diagnosis: placement ? { tossPlacement: placement } : {} })
const ahead = (v: number): TossPlacement => ({ ahead: v, from: 'ball', confidence: 0.9 })

heading('The toss map')

check("it holds this basket's serves and nobody else's, in serve order", () => {
  const current = serve('serve-abc-2', ahead(0.3))
  const sessions = [serve('serve-abc-0', ahead(0.2)), serve('serve-abc-4', ahead(0.4)), serve('serve-xyz-1', ahead(0.9))]
  const map = tossMapFor(current, sessions, [])!
  note(map.points.map((p) => `${p.serve}:${p.value}`).join(' '))
  assert(map.axis === 'ahead', `axis ${map.axis}`)
  assert(map.points.map((p) => p.serve).join(',') === '1,3,5', 'the wrong serves, or out of order')
  assert(map.points.find((p) => p.serve === 3)!.current, 'the serve on screen was not marked')
})

check('one serve, a clip with no serve numbers, or another axis is no map', () => {
  assert(tossMapFor(serve('serve-abc-2', ahead(0.3)), [], []) === undefined, 'one serve made a map')
  assert(tossMapFor(serve('demo', ahead(0.3)), [serve('demo2', ahead(0.2))], []) === undefined, 'a clip-less id made a map')
  const across = { across: 0.1, from: 'ball' as const, confidence: 0.9 }
  assert(
    tossMapFor(serve('serve-abc-2', across), [serve('serve-abc-0', ahead(0.2))], []) === undefined,
    'a serve read along the other axis was put on the same strip',
  )
})

check('each outcome is drawn as its own shape and word, not colour alone', () => {
  const tags: ServeTag[] = [
    { id: 'serve-abc-0', outcome: 'in', taggedAt: 1 },
    { id: 'serve-abc-2', outcome: 'net', taggedAt: 1 },
  ]
  const map = tossMapFor(serve('serve-abc-2', ahead(0.3)), [serve('serve-abc-0', ahead(0.2)), serve('serve-abc-4', ahead(0.4))], tags)!
  const html = renderToStaticMarkup(createElement(TossMap, { map }))
  assert(/<circle[^>]*fill="var\(--great\)"/.test(html), 'a serve that went in was not a filled dot')
  assert(/<path[^>]*fill="var\(--work\)"/.test(html), 'a missed serve was not a diamond')
  assert(/<circle[^>]*fill="var\(--ink-1\)"[^>]*stroke="var\(--fg-faint\)"/.test(html), 'an untagged serve was not an empty ring')
  assert(html.includes('Serve 3: about two foot-lengths in front of your front foot, net.'), 'the list does not read the strip out')
  assert(html.includes('Not tagged'), 'the legend does not name the empty ring')
})

report()
