/**
 * Test helper (pipeline unit tests only): a crude side-view serve as sparse PoseFrames. The tossing
 * wrist is above the head from 1.0 to 1.6 s, the hitting wrist from 1.9 s to 2.3 s with its highest
 * point at `contactT`; the hips travel forward (+x) after contact. Optionally mirrored labels.
 */
import { LM, type Landmark, type PoseFrame } from '../types.ts'

export interface ServePoseOptions {
  t0?: number
  contactT?: number
  hz?: number
  durationS?: number
  x?: number
  /** Swap left/right labels (MediaPipe side-view mirror). */
  mirrored?: boolean
  forward?: 1 | -1
}

export function standingLandmarks(x = 0.5): Landmark[] {
  const l: Landmark[] = Array.from({ length: 33 }, () => ({ x, y: 0.55, visibility: 0.9 }))
  l[LM.NOSE] = { x, y: 0.3, visibility: 0.95 }
  for (const k of [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER]) l[k] = { x, y: 0.37, visibility: 0.9 }
  for (const k of [LM.LEFT_ELBOW, LM.RIGHT_ELBOW]) l[k] = { x, y: 0.45, visibility: 0.9 }
  for (const k of [LM.LEFT_WRIST, LM.RIGHT_WRIST]) l[k] = { x, y: 0.52, visibility: 0.9 }
  for (const k of [LM.LEFT_HIP, LM.RIGHT_HIP]) l[k] = { x, y: 0.55, visibility: 0.9 }
  for (const k of [LM.LEFT_KNEE, LM.RIGHT_KNEE]) l[k] = { x, y: 0.66, visibility: 0.9 }
  for (const k of [LM.LEFT_ANKLE, LM.RIGHT_ANKLE]) l[k] = { x, y: 0.76, visibility: 0.9 }
  for (const k of [LM.LEFT_HEEL, LM.RIGHT_HEEL]) l[k] = { x, y: 0.77, visibility: 0.9 }
  for (const k of [LM.LEFT_FOOT_INDEX, LM.RIGHT_FOOT_INDEX]) l[k] = { x: x + 0.02, y: 0.77, visibility: 0.9 }
  return l
}

/** Landmarks of the crude serve at time t (serve contact at contactT). */
export function servePoseAt(t: number, contactT: number, options: Pick<ServePoseOptions, 'x' | 'mirrored' | 'forward'> = {}): Landmark[] {
  const forward = options.forward ?? 1
  const toss = options.mirrored ? LM.RIGHT_WRIST : LM.LEFT_WRIST
  const hit = options.mirrored ? LM.LEFT_WRIST : LM.RIGHT_WRIST
  const x = (options.x ?? 0.4) + (t > contactT ? forward * 0.06 * Math.min(1, (t - contactT) / 0.5) : 0)
  const l = standingLandmarks(x)
  const rel = t - (contactT - 1.2)
  if (rel >= 0 && rel <= 0.6) l[toss] = { x: x + 0.03, y: 0.22, visibility: 0.9 }
  const dt = t - contactT
  if (dt >= -0.3 && dt <= 0.1) l[hit] = { x: x + 0.05, y: 0.12 + 0.6 * dt * dt, visibility: 0.9 }
  return l
}

export function servePoses(options: ServePoseOptions = {}): PoseFrame[] {
  const t0 = options.t0 ?? 0
  const contactT = options.contactT ?? t0 + 2.2
  const hz = options.hz ?? 15
  const duration = options.durationS ?? 3.8
  const frames: PoseFrame[] = []
  for (let i = 0; i <= duration * hz; i++) {
    const t = t0 + i / hz
    frames.push({ frameIndex: Math.round(t * 60), tReal: t, landmarks: servePoseAt(t, contactT, options), score: 0.9, source: 'injected' })
  }
  return frames
}
