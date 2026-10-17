/**
 * The toss map's target (L4.7), re-derived on real motion under D2.1's rule:
 * every Bath serve reads inside it, and the rig's toss, dialled off line,
 * reads outside it — from the side for the band in front, from behind and in
 * front for the band across.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { runEngine } from '../../../dev/mocap/engine'
import { filmMocap } from '../mocapServe'
import { detectServe } from '../phases'
import { buildServe, rigBall, type RigToss } from '../syntheticServe'
import { TOSS_TARGET, readTossPlacement } from '../tossPlacement'
import { tossMapFor } from '../../tossMap'
import { targetLine } from '../../tossPlaceCopy'
import TossMap from '../../../components/TossMap'
import { cueIssues } from '../voice'
import type { Session } from '../../storage/db'
import { REAL_SERVES } from './repeatability'
import { assert, check, heading, note, report } from './harness'

const inside = (v: number, [lo, hi]: [number, number]) => v >= lo && v <= hi

heading('Real serves read inside the target')

check('every Bath serve tosses inside the band in front, from the side, at 30 and 60 fps', () => {
  const band = TOSS_TARGET.ahead.band
  for (const fps of [30, 60]) {
    const reads = REAL_SERVES.map((serve) => {
      const run = runEngine(filmMocap(serve, { fps }), fps)
      assert(run.ok, `a Bath serve was refused at ${fps} fps`)
      return run.ok ? run.run.diagnosis?.tossPlacement?.ahead : undefined
    })
    note(`${fps} fps: ${reads.map((v) => v?.toFixed(3)).join(', ')} against ${band.join(' to ')}`)
    for (const v of reads) assert(v !== undefined && inside(v, band), `a Bath toss read ${v} in front, outside ${band.join(' to ')}`)
  }
})

check('every Bath serve tosses inside the band across, from behind and from in front', () => {
  const band = TOSS_TARGET.across.band
  for (const bearing of [0, 180]) {
    const reads = REAL_SERVES.map((serve) => {
      const run = runEngine(filmMocap(serve, { fps: 30, bearing }), 30)
      return run.ok ? run.run.diagnosis?.tossPlacement?.across : undefined
    })
    note(`bearing ${bearing}: ${reads.map((v) => v?.toFixed(3)).join(', ')} against ${band.join(' to ')}`)
    for (const v of reads) assert(v !== undefined && inside(v, band), `a Bath toss read ${v} across, outside ${band.join(' to ')}`)
  }
})

heading('The rig, tossing off line, reads outside it')

const SIDE = 82
const BEHIND = 8
function placed(toss: RigToss, cameraYaw: number, view: 'side' | 'front-back') {
  const dials = { cameraYaw, noise: 0, seed: 5 }
  const frames = buildServe(dials, 50)
  return readTossPlacement(frames, detectServe(frames, 50), view, rigBall(frames, toss, dials))!
}

check('a toss behind the foot or far in front falls outside the band in front, and a clean one inside', () => {
  const band = TOSS_TARGET.ahead.band
  const behind = placed({ forward: -0.2, sideways: 0 }, SIDE, 'side').ahead!
  const far = placed({ forward: 0.9, sideways: 0 }, SIDE, 'side').ahead!
  const clean = placed({ forward: 0.3, sideways: 0 }, SIDE, 'side').ahead!
  note(`behind ${behind}, far ${far}, clean ${clean}`)
  assert(behind < band[0], `0.2 m behind read ${behind}, inside`)
  assert(far > band[1], `0.9 m in front read ${far}, inside`)
  assert(inside(clean, band), `the clean toss read ${clean}, outside`)
})

check('a toss drifting to either side falls outside the band across, and a clean one inside', () => {
  const band = TOSS_TARGET.across.band
  const tossing = placed({ forward: 0.3, sideways: -0.2 }, BEHIND, 'front-back').across!
  const hitting = placed({ forward: 0.3, sideways: 0.4 }, BEHIND, 'front-back').across!
  const clean = placed({ forward: 0.3, sideways: 0.1 }, BEHIND, 'front-back').across!
  note(`tossing side ${tossing}, hitting side ${hitting}, clean ${clean}`)
  assert(tossing < band[0], `0.2 m to the tossing side read ${tossing}, inside`)
  assert(hitting > band[1], `0.4 m to the hitting side read ${hitting}, inside`)
  assert(inside(clean, band), `the clean toss read ${clean}, outside`)
})

heading('On the map')

const serve = (id: string, ahead: number) =>
  ({ id, createdAt: 0, diagnosis: { tossPlacement: { ahead, from: 'ball', confidence: 0.9 } } }) as unknown as Session

check('the map carries the band, counts the tosses in it, and says it in foot-lengths', () => {
  const current = serve('serve-abc-0', 0.1)
  const map = tossMapFor(current, [serve('serve-abc-1', 0.2), serve('serve-abc-2', 0.45), serve('serve-abc-3', -0.05)], [])!
  assert(JSON.stringify(map.target) === JSON.stringify(TOSS_TARGET.ahead.band), 'the map lost its band')
  assert(map.inTarget === 2, `${map.inTarget} tosses counted in the band`)
  const line = targetLine('ahead', map.target, map.inTarget, map.points.length)
  note(line)
  assert(line.includes('over your front foot to two foot-lengths in front'), 'the band is not said in foot-lengths')
  assert(cueIssues(line).length === 0, `"${line}": ${cueIssues(line).join('; ')}`)
  const across = targetLine('across', TOSS_TARGET.across.band, 1, 3)
  note(across)
  assert(cueIssues(across).length === 0, `"${across}": ${cueIssues(across).join('; ')}`)
  const html = renderToStaticMarkup(createElement(TossMap, { map }))
  assert(html.includes('class="toss-map-target"'), 'no band drawn')
  assert(html.includes('2 of 4 tosses peaked there'), 'the count is not on the map')
})

report()
