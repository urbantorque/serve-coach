/**
 * The seven product phases (METRICS §2.6): contiguous, non-overlapping spans with a key frame each.
 * The toss apex is a marker, not a boundary.
 */
import { LM, type EventEstimate, type PhaseSpan } from '../types.ts'
import { heightOf } from './events.ts'
import type { ServeCore } from './analyse.ts'
import { indexAt, midHip, pt, rangeIdx, type PoseTrack } from './track.ts'

function frameAt(track: PoseTrack, t: number): number {
  const i = indexAt(track, t)
  return i >= 0 ? track.frameIndex[i] : -1
}

export function buildPhases(core: ServeCore, track: PoseTrack): PhaseSpan[] {
  const e = core.events
  const release = e.tossRelease
  const contact = e.contact
  const trophy = e.trophy?.event
  if (!release || !contact || !core.ref) return []
  const ms = e.motionStart
  const setup = e.setupStart ?? { tReal: core.window.start, confidence: 0.4 } as EventEstimate
  const landing = e.landing?.event
  const recovery = e.recoveryEnd
  const conf = (a?: { confidence: number }, b?: { confidence: number }) => Math.min(a?.confidence ?? 0, b?.confidence ?? 0)
  const half = Math.max(track.dt, 0.01)
  const out: PhaseSpan[] = []
  const span = (phase: PhaseSpan['phase'], a: number, b: number, key: number, c: number) => {
    if (!(b >= a)) return
    out.push({ phase, startFrame: frameAt(track, a), endFrame: frameAt(track, b), keyFrame: frameAt(track, key), confidence: c })
  }
  const motion = ms?.tReal ?? release.tReal - 0.8
  span('setup', setup.tReal, motion, Math.max(setup.tReal, motion - 0.1), conf(setup, ms))
  span('toss', motion, release.tReal, release.tReal, conf(ms, release))
  const trophyT = trophy?.tReal ?? (release.tReal + contact.tReal) / 2
  span('loading', release.tReal, trophyT, trophyT, conf(release, trophy))
  // Drive key frame: the lowest hitting-wrist point between trophy and contact (racket-drop proxy)
  // if visible, else the midpoint.
  let driveKey = (trophyT + contact.tReal) / 2
  let lowest = -Infinity
  const wrist = core.hitWrist === 'left' ? LM.LEFT_WRIST : LM.RIGHT_WRIST
  for (const i of rangeIdx(track, trophyT, contact.tReal)) {
    const w = pt(track, i, wrist, 0.5)
    if (w && w.y > lowest) {
      lowest = w.y
      driveKey = track.t[i]
    }
  }
  const cStart = contact.tReal - half
  const cEnd = contact.tReal + half
  span('drive', trophyT, cStart, driveKey, conf(trophy, contact))
  // The contact key frame is the last frame at or before contact.
  let key = contact.tReal
  for (let i = indexAt(track, contact.tReal); i >= 0; i--) {
    if (track.t[i] <= contact.tReal + 1e-9) {
      key = track.t[i]
      break
    }
  }
  span('contact', cStart, cEnd, key, contact.confidence)
  if (landing) {
    // Absorption ends at the lowest pelvis within 0.4 s after landing, else landing + 0.25 s.
    let absorbEnd = landing.tReal + 0.25
    let lowH = Infinity
    for (const i of rangeIdx(track, landing.tReal, landing.tReal + 0.4)) {
      const m = midHip(track, i, 0.3)
      if (m) {
        const h = heightOf(core.ref, m.y)
        if (h < lowH) {
          lowH = h
          absorbEnd = track.t[i]
        }
      }
    }
    absorbEnd = Math.max(absorbEnd, cEnd)
    span('landing', cEnd, absorbEnd, landing.tReal, conf(contact, landing))
    if (recovery) span('recovery', absorbEnd, Math.max(absorbEnd, recovery.tReal), recovery.tReal, conf(landing, recovery))
  }
  return out
}
