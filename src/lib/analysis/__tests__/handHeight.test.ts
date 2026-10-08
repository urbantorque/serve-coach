/**
 * Contact height without the lens's perspective (D7.4): real serves filmed from
 * the five places players stand read the same height, and the rig — drawn
 * without perspective — reads what it read before.
 */
import { median, sided } from '../geometry'
import { handHeightAt } from '../handHeight'
import { filmMocap } from '../mocapServe'
import { detectServe } from '../phases'
import { buildServe } from '../syntheticServe'
import { NOISE_FLOOR } from '../tiers'
import { PLACEMENTS } from '../../../dev/mocap/report'
import { REAL_SERVES } from './repeatability'
import { assert, check, heading, note, report } from './harness'

/** Contact height read both ways: off the picture alone, and with the hand's part from the world skeleton. */
function read(frames: ReturnType<typeof buildServe>, fps: number) {
  const skel = detectServe(frames, fps)
  const R = sided(skel.racket)
  const f = frames[skel.keys.contact]
  return {
    pictured: (skel.groundY - f.image[R.wrist].y) / skel.bodyHeight,
    corrected: handHeightAt(frames, skel, f, R.wrist),
  }
}

heading('Contact height without perspective')

check('real serves read the same height from every place a phone stands', () => {
  const medians = PLACEMENTS.map((p) => {
    const rows = REAL_SERVES.map((s) => read(filmMocap(s, { ...p.phone, fps: 30 }), 30))
    return { name: p.name, pictured: median(rows.map((r) => r.pictured)), corrected: median(rows.map((r) => r.corrected)) }
  })
  const spread = (k: 'pictured' | 'corrected') => {
    const xs = medians.map((m) => m[k])
    return Math.max(...xs) - Math.min(...xs)
  }
  for (const m of medians) note(`${m.name}: ${m.pictured.toFixed(3)} off the picture, ${m.corrected.toFixed(3)} without perspective`)
  note(`spread across placements: ${spread('pictured').toFixed(3)} → ${spread('corrected').toFixed(3)}`)
  // Within the noise floor of their own midpoint: as close as the same camera
  // filming the same serve twice.
  assert(spread('corrected') / 2 <= NOISE_FLOOR.contact_height_ratio, `the placements still disagree by ${spread('corrected').toFixed(3)}`)
  assert(spread('corrected') < spread('pictured') / 3, 'the correction did not close the gap the picture left')
})

check('the rig, which has no perspective to remove, reads what it read', () => {
  for (const contactReach of [1.0, 1.2, 1.38]) {
    const r = read(buildServe({ contactReach }, 50), 50)
    note(`reach ${contactReach}: ${r.pictured.toFixed(3)} off the picture, ${r.corrected.toFixed(3)} corrected`)
    assert(Math.abs(r.corrected - r.pictured) < 0.015, `the rig moved by ${(r.corrected - r.pictured).toFixed(3)} at reach ${contactReach}`)
  }
})

check('with no world skeleton, it is the picture as before', () => {
  const frames = buildServe({}, 50)
  const blind = frames.map((f) => ({ ...f, world: f.world.map((w) => ({ ...w, y: NaN })) }))
  const skel = detectServe(blind, 50)
  const R = sided(skel.racket)
  const f = blind[skel.keys.contact]
  const pictured = (skel.groundY - f.image[R.wrist].y) / skel.bodyHeight
  assert(handHeightAt(blind, skel, f, R.wrist) === pictured, 'a missing skeleton was not answered by the picture')
})

report()
