/**
 * Platform or pinpoint (D3.2): swept against the rig's `pinpointSlide`, held
 * under tracker noise, and read on real serve motion.
 */
import { readStance } from '../stance'
import { detectServe } from '../phases'
import { buildServe, type ServeDials } from '../syntheticServe'
import { filmMocap } from '../mocapServe'
import { REAL_SERVES, seeds } from './repeatability'
import { assert, check, heading, note, report } from './harness'

const FPS = 30
const stanceOf = (dials: Partial<ServeDials>, view: 'side' | 'front-back' | 'angled' = 'side') => {
  const frames = buildServe(dials, FPS)
  return readStance(frames, detectServe(frames, FPS), view)
}

heading('The stance, from the feet closing')

check('the pinpoint dial is read from the guide placement: flat feet, an undecided middle, a slide', () => {
  const row = [0, 0.3, 0.5, 0.8].map((p) => stanceOf({ pinpointSlide: p }))
  note(row.map((s, i) => `${[0, 0.3, 0.5, 0.8][i]} → ${s ? `${s.kind} ${s.closure}` : 'no call'}`).join(' · '))
  assert(row[0]?.kind === 'platform', 'feet that never moved were not a platform')
  assert(row[1] === undefined, 'a slide a third of the way was called either way')
  assert(row[2]?.kind === 'pinpoint' && row[3]?.kind === 'pinpoint', 'a back foot slid up was not a pinpoint')
})

check('tracker noise does not flip the call', () => {
  for (const [p, want] of [
    [0, 'platform'],
    [0.6, 'pinpoint'],
  ] as const) {
    const calls = seeds(24).map((seed) => stanceOf({ pinpointSlide: p, noise: 0.006, depthNoise: 4, depthBias: 0.006, seed })?.kind)
    const right = calls.filter((c) => c === want).length
    note(`pinpoint ${p}: ${right}/24 ${want}, ${calls.filter((c) => c && c !== want).length} the other way`)
    assert(right >= 23 && !calls.some((c) => c && c !== want), `pinpoint ${p} read ${want} on only ${right} of 24`)
  }
})

check('from a corner the stance is not read at all', () => {
  assert(stanceOf({ cameraYaw: 45 }, 'angled') === undefined, 'a corner camera called a stance')
})

check('the real serves are platforms from the side and from behind', () => {
  for (const bearing of [90, 270, 180]) {
    const calls = REAL_SERVES.map((serve) => {
      const frames = filmMocap(serve, { bearing, fps: FPS })
      return readStance(frames, detectServe(frames, FPS), bearing === 180 ? 'front-back' : 'side')
    })
    note(`bearing ${bearing}: ${calls.map((c) => (c ? `${c.kind[0]}${c.closure}` : '—')).join(' ')}`)
    assert(calls.every((c) => c?.kind === 'platform'), `a real platform stance read otherwise from bearing ${bearing}`)
  }
})

report()
