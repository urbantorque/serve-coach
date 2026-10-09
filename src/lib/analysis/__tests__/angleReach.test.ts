/**
 * What each angle cannot see (D3.9): every named fault read on the rig from the
 * side, from behind and from a corner; the report's line for what was missed;
 * and the back view read as a full mode, on the rig and on real serves.
 */
import { ANGLE_BOUND, unseenBy, unseenLines } from '../angleReach'
import { diagnose } from '../diagnose'
import { FLAWS, type FlawFinding } from '../flaws'
import { measure } from '../metrics'
import { filmMocap } from '../mocapServe'
import { detectServe } from '../phases'
import { buildServe, type ServeDials } from '../syntheticServe'
import { cueIssues } from '../voice'
import { REAL_SERVES, seeds } from './repeatability'
import { tossedBall } from './tossedBall'
import { assert, check, heading, note, report } from './harness'

/** Camera yaws standing for each view: the guide's side, behind the baseline, and two corners. */
const SIDE = 86
const BEHIND = 8
const CORNERS = [30, 45]

const findingsFrom = (cameraYaw: number, dials: Partial<ServeDials> = {}): FlawFinding[] => {
  const frames = buildServe({ cameraYaw, noise: 0.004, depthNoise: 3, seed: 5, ...dials }, 60)
  const skel = detectServe(frames, 60)
  return diagnose(frames, skel, { ball: tossedBall(frames, skel, frames[skel.keys.contact].t) }).flaws
}

/** Every fault the engine names to players, once each. */
const NAMED = [...new Set(FLAWS.filter((s) => s.notNamed === undefined).map((s) => s.flaw))]

heading('What each angle cannot see')

check('every named fault is read from every angle, or is listed with the angle that wakes it', () => {
  const awake = { side: findingsFrom(SIDE), 'front-back': findingsFrom(BEHIND) }
  for (const yaw of [SIDE, BEHIND, ...CORNERS]) {
    const flaws = yaw === SIDE ? awake.side : yaw === BEHIND ? awake['front-back'] : findingsFrom(yaw)
    const missed: string[] = []
    for (const flaw of NAMED) {
      const bound = ANGLE_BOUND.filter((b) => b.flaw === flaw)
      if (!bound.length) {
        if (!flaws.some((f) => f.flaw === flaw)) missed.push(`${flaw} is not read from ${yaw}° and is not listed`)
        continue
      }
      for (const b of unseenBy({ flaws }).filter((u) => u.flaw === flaw)) {
        const woken = awake[b.filmFrom].some((f) => f.flaw === b.flaw && f.axis === b.axis)
        if (!woken) missed.push(`${flaw} (${b.axis}) is missed from ${yaw}° and ${b.filmFrom} does not read it either`)
      }
    }
    note(`${yaw}°: cannot see ${unseenBy({ flaws }).map((b) => `${b.flaw} ${b.axis}`).join(', ') || 'nothing'}`)
    assert(missed.length === 0, missed.join('; '))
  }
  // And a listed fault the angle named for it really does read: no entry stands
  // for an angle that cannot see it either.
  for (const b of ANGLE_BOUND) {
    assert(awake[b.filmFrom].some((f) => f.flaw === b.flaw && f.axis === b.axis), `${b.flaw} ${b.axis} is not read ${b.filmFrom}`)
  }
})

check('the report says what this angle missed, and where to stand, in the voice', () => {
  const line = (yaw: number) => unseenLines({ flaws: findingsFrom(yaw) })
  const side = line(SIDE)
  const behind = line(BEHIND)
  const corner = line(45)
  note(`side: ${side.join(' ')}`)
  note(`behind: ${behind.join(' ')}`)
  // Two faults from the side since L1.2 — the toss's sideways drift and the
  // body's sideways fold — and one line for both since L1.10, because they
  // send the player to the same place.
  assert(side.length === 1 && side[0].includes('behind the baseline'), `the side clip said: ${side.join(' | ')}`)
  assert(side[0].includes('toss') && side[0].includes('body folds'), `the side line left one out: ${side[0]}`)
  assert(behind.length === 1 && behind[0].includes('forward or back') && behind[0].includes('side-on'), 'the back clip did not send the player to the side')
  assert(corner.length === 2, `a 45° corner reads neither drift and said ${corner.length} lines`)
  for (const l of [...side, ...behind, ...corner]) assert(cueIssues(l).length === 0, `"${l}": ${cueIssues(l).join(', ')}`)
  assert(unseenLines(undefined).length === 0, 'a report with no diagnosis was told what it missed')
})

check('from behind, the sideways readings follow their dials through the noise', () => {
  for (const cameraYaw of [0, 8, 15]) {
    const read = (dials: Partial<ServeDials>) =>
      seeds(8).map((seed) => {
        const frames = buildServe({ cameraYaw, noise: 0.006, depthNoise: 4, depthBias: 0.006, seed, ...dials }, 50)
        const skel = detectServe(frames, 50)
        const d = diagnose(frames, skel)
        const tilt = measure(frames, skel, false).flatMap((f) => f.metrics).find((m) => m.id === 'shoulderTilt')?.value
        const drift = d.flaws.find((f) => f.flaw === 'toss_drift' && f.axis === 'lateral') ? d.signals.toss_drift_ratio : undefined
        return { drift, lean: d.signals.spine_lean_deg, tilt }
      })
    const apart = (lo: (number | undefined)[], hi: (number | undefined)[]) =>
      lo.every((x) => x !== undefined) && hi.every((x) => x !== undefined) && Math.max(...(lo as number[])) < Math.min(...(hi as number[]))
    const drift = [read({ tossWobbleLateral: 0 }), read({ tossWobbleLateral: 0.06 })].map((r) => r.map((x) => x.drift))
    const lean = [read({ spineLean: 4 }), read({ spineLean: 28 })].map((r) => r.map((x) => x.lean))
    const tilt = [read({ shoulderTilt: 10 }), read({ shoulderTilt: 40 })].map((r) => r.map((x) => x.tilt))
    assert(apart(drift[0], drift[1]), `${cameraYaw}°: a sideways drift and none overlapped`)
    assert(apart(lean[0], lean[1]), `${cameraYaw}°: a sideways lean and none overlapped`)
    assert(apart(tilt[0], tilt[1]), `${cameraYaw}°: a steep shoulder tilt and a flat one overlapped`)
  }
})

check('real serves filmed from the back fence read sideways and name none of it', () => {
  for (const fps of [30, 60]) {
    for (const serve of REAL_SERVES) {
      const frames = filmMocap(serve, { fps, bearing: 180, distance: 6 })
      const d = diagnose(frames, detectServe(frames, fps))
      const drift = d.flaws.find((f) => f.flaw === 'toss_drift')
      assert(drift?.axis === 'lateral', `a real serve from the back fence was not read sideways at ${fps} fps`)
      for (const flaw of ['toss_drift', 'posture_collapse'] as const) {
        assert(!d.flaws.find((f) => f.flaw === flaw)?.detected, `a real serve from the back fence was named ${flaw} at ${fps} fps`)
      }
    }
  }
})

report()
