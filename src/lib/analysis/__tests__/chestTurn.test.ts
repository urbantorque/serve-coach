/**
 * When the chest turns, from the side (D3.6): the shoulder line's width in the
 * picture, swept on the rig at the guide's camera angles, held under noise,
 * read on real serves from both sides, and refused where it cannot be read.
 */
import { diagnose } from '../diagnose'
import { filmMocap } from '../mocapServe'
import { detectServe } from '../phases'
import { buildServe, type ServeDials } from '../syntheticServe'
import { REAL_SERVES, seeds } from './repeatability'
import { assert, check, heading, note, report } from './harness'

const read = (dials: Partial<ServeDials>, fps = 50) => {
  const frames = buildServe(dials, fps)
  const d = diagnose(frames, detectServe(frames, fps))
  return { turn: d.chestTurn, finding: d.flaws.find((f) => f.flaw === 'early_shoulder_rotation') }
}
const named = (r: ReturnType<typeof read>) => r.finding?.detected === true && r.finding.signal === 'chest_open_ms'

heading('When the chest turns, from the side')

check('a chest that turns ahead of the swing reads before the drop, at every side-on angle', () => {
  for (const cameraYaw of [82, 86, 90]) {
    // The rig's trophy shoulders sit at 61 − shoulderYaw: 82 is the clean
    // serve's coiled line, 10 a chest already turned most of the way.
    const row = [82, 60, 40, 10].map((shoulderYaw) => read({ cameraYaw, shoulderYaw }))
    note(`camera ${cameraYaw}°: shoulders half turned at ${row.map((r) => r.turn?.shouldersMs).join(' / ')} ms from the drop`)
    assert(row.every((r) => r.turn !== undefined), `the turn went unread from ${cameraYaw}°`)
    for (let i = 1; i < row.length; i++) {
      assert(row[i].turn!.shouldersMs <= row[i - 1].turn!.shouldersMs, `${cameraYaw}°: an earlier turn read later`)
    }
    assert(row[0].turn!.shouldersMs > 0 && !named(row[0]), `${cameraYaw}°: the clean serve was read as opening early`)
    assert(row[3].turn!.shouldersMs < 0 && named(row[3]), `${cameraYaw}°: the open chest was not named from the side`)
  }
})

check('the hips are read on their own line, and do not move the shoulders', () => {
  const row = [30, 56, 90].map((hipYaw) => read({ hipYaw }))
  note(`hips half turned at ${row.map((r) => r.turn?.hipsMs).join(' / ')} ms, shoulders at ${row.map((r) => r.turn?.shouldersMs).join(' / ')}`)
  assert(new Set(row.map((r) => r.turn?.shouldersMs)).size === 1, 'turning the hips moved the shoulders')
  assert(row[2].turn!.hipsMs > row[0].turn!.hipsMs, 'hips wound further back did not turn later')
})

check('tracker noise never names a clean serve', () => {
  for (const fps of [30, 60]) {
    const early = seeds(24).filter((seed) => named(read({ noise: 0.006, depthNoise: 4, depthBias: 0.006, seed }, fps)))
    note(`${fps} fps: ${early.length} of 24 noisy clean serves named`)
    assert(early.length === 0, `${early.length} clean serves were named at ${fps} fps`)
  }
})

check('real serves turn after the racket drops, from both sides', () => {
  const ms: number[] = []
  for (const bearing of [90, 270]) {
    for (const fps of [30, 60]) {
      for (const serve of REAL_SERVES) {
        const frames = filmMocap(serve, { fps, bearing })
        const d = diagnose(frames, detectServe(frames, fps))
        assert(d.chestTurn !== undefined, `a real serve's turn went unread from ${bearing}° at ${fps} fps`)
        if (d.chestTurn) ms.push(d.chestTurn.shouldersMs)
        const f = d.flaws.find((x) => x.flaw === 'early_shoulder_rotation')
        assert(!f?.detected, `a real serve was named early from ${bearing}° at ${fps} fps (${f?.value} ms)`)
      }
    }
  }
  note(`real shoulders half turned ${Math.min(...ms)}–${Math.max(...ms)} ms after the drop`)
  assert(Math.min(...ms) > 21, 'a real serve turned within the noise floor of the drop')
})

check('from a corner or from behind it is not read, and the corner reads the coil instead', () => {
  const corner = read({ cameraYaw: 45, shoulderYaw: 82, hipYaw: 116 })
  assert(corner.turn === undefined, 'the turn was read from a corner')
  assert(corner.finding?.signal === 'separation_deg' && corner.finding.detected, 'the corner lost the coil reading')
  assert(read({ cameraYaw: 0 }).turn === undefined, 'the turn was read from behind')
})

report()
