/**
 * Which way the body went after contact, signed by the swing's own net
 * direction (L5.7): the rig's travel dial read either sign from the side,
 * every Bath serve read forward, and nothing read where the net is along the
 * lens or the clip stopped at the ball.
 */
import { diagnose } from '../diagnose'
import { detectServe } from '../phases'
import { buildServe, type ServeDials } from '../syntheticServe'
import { filmMocap } from '../mocapServe'
import { LANDING_TRAVEL_MIN_SECONDS } from '../landingTravel'
import { UNCALIBRATED } from '../tiers'
import { REAL_SERVES } from './repeatability'
import type { Frame } from '../types'
import { assert, check, heading, near, note, report } from './harness'

const FPS = 50
/** The rig's standing height, in metres. */
const STANDING_M = 1.8

const travelOf = (frames: Frame[], fps = FPS) => diagnose(frames, detectServe(frames, fps)).landingTravel
const rig = (dials: Partial<ServeDials>, fps = FPS) => travelOf(buildServe(dials, fps), fps)

heading('Falling back, signed')

check('from the side the rig reads its travel dial either sign, at the picture scale', () => {
  for (const cameraYaw of [82, 60]) {
    const row = [-0.3, -0.15, 0, 0.15, 0.3].map((landingTravel) => rig({ landingTravel, cameraYaw })!.forward)
    note(`yaw ${cameraYaw}: ${row.join(' / ')} for -0.3 / -0.15 / 0 / 0.15 / 0.3 m`)
    near(row[2], 0, 0.002, `standing still read from yaw ${cameraYaw}`)
    assert(row[0] < row[1] && row[1] < row[2] && row[2] < row[3] && row[3] < row[4], 'the reading is not in the order of the dial')
    near(row[1], -row[3], 0.002, 'a fall back and the same travel forward read different sizes')
    // Square to the lens the whole travel is across the picture; turned 30°
    // from it, the cosine of the turn.
    const across = Math.cos(((90 - cameraYaw) * Math.PI) / 180)
    near(row[3], (0.15 / STANDING_M) * across, 0.006, `0.15 m from yaw ${cameraYaw}`)
  }
})

check('a tracker’s noise at 30 fps leaves the sign of a fall back alone', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const back = rig({ landingTravel: -0.15, cameraYaw: 82, noise: 0.006, seed }, 30)!.forward
    const ahead = rig({ landingTravel: 0.15, cameraYaw: 82, noise: 0.006, seed }, 30)!.forward
    assert(back < -0.05 && ahead > 0.05, `seed ${seed}: ${back} back and ${ahead} forward`)
  }
})

check('every Bath serve travels forward, from either side, at 30 and 60 fps', () => {
  const all: number[] = []
  for (const serve of REAL_SERVES) {
    for (const bearing of [90, 270]) {
      for (const fps of [30, 60]) {
        const read = travelOf(filmMocap(serve, { fps, bearing }), fps)
        assert(read !== undefined, `a Bath serve from bearing ${bearing} at ${fps} fps read no travel`)
        const t = read!
        assert(t.forward > 0, `a Bath serve from bearing ${bearing} at ${fps} fps read ${t.forward}, falling back`)
        all.push(t.forward)
      }
    }
  }
  note(`${all.length} reads, ${Math.min(...all).toFixed(3)}–${Math.max(...all).toFixed(3)} standing heights forward`)
})

check('nothing is read where the net is along the lens', () => {
  for (const cameraYaw of [30, 8]) assert(rig({ landingTravel: -0.3, cameraYaw }) === undefined, `a fall back was read from yaw ${cameraYaw}`)
  for (const bearing of [0, 180]) {
    assert(travelOf(filmMocap(REAL_SERVES[0], { fps: 30, bearing }), 30) === undefined, `travel was read from bearing ${bearing}`)
  }
})

check('a clip that stops at the ball reads nothing, not a player who stood still', () => {
  const frames = buildServe({ landingTravel: -0.3, cameraYaw: 82 }, FPS)
  const contact = detectServe(frames, FPS).keys.contact
  const cut = frames.slice(0, contact + Math.floor(LANDING_TRAVEL_MIN_SECONDS * FPS * 0.5) + 1)
  assert(travelOf(cut) === undefined, 'a clip ending at contact read a travel')
})

check('the dial moves nothing until the ball has gone', () => {
  const still = buildServe({ cameraYaw: 82 }, FPS)
  const back = buildServe({ cameraYaw: 82, landingTravel: -0.3 }, FPS)
  const contact = detectServe(still, FPS).keys.contact
  for (let i = 0; i <= contact; i++) {
    for (let k = 0; k < still[i].image.length; k++) {
      assert(still[i].image[k].x === back[i].image[k].x && still[i].image[k].y === back[i].image[k].y, `frame ${i} moved before contact`)
    }
  }
})

check('falling back is declared uncalibrated, and the reason says why', () => {
  const why = UNCALIBRATED.landing_travel_ratio
  assert(why !== undefined && /not named/.test(why), 'the signed landing has no uncalibrated entry')
})

report()
