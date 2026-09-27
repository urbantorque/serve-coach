/**
 * The app's own image points for the ones a person marks in "Check this serve" (ball at the peak and
 * at contact, front toe at landing, and the standing floor, head height and front toe), read from the
 * stored tracks the same way the overlays draw them. Shown only after the marks are saved (blinding)
 * and written into the validation export.
 */
import type { AnnotatedPoint, ServeAnalysis } from '../../../../data/domain.ts'
import type { TrackRecord } from '../../../../data/records.ts'
import type { MarkPoint } from '../../../../validation/annotation/types.ts'
import { contactBall } from '../../../components/video/overlayScene.ts'
import { ballNear, frontToeOf, landmarksAt, standingRef, tossPeak, type StandingRef } from '../../../components/video/tracks.ts'

/** Standing reference over the frames before the toss (as useServePlayback does). */
export function standingFor(serve: Pick<ServeAnalysis, 'window' | 'events' | 'handedness'>, track: Pick<TrackRecord, 'pose'> | null | undefined): StandingRef | null {
  if (!track?.pose) return null
  const start = serve.window.startFrame
  const end = (serve.events.motionStart ?? serve.events.tossRelease)?.frameIndex ?? start + 30
  return standingRef(track.pose, serve.handedness, start, Math.max(start + 1, end - 1))
}

export function appPointsFor(
  serve: Pick<ServeAnalysis, 'window' | 'events' | 'handedness'>,
  track: Pick<TrackRecord, 'pose' | 'ball'> | null | undefined,
): { points: Partial<Record<AnnotatedPoint, MarkPoint>>; standingNorm: number | null } {
  const out: Partial<Record<AnnotatedPoint, MarkPoint>> = {}
  const e = serve.events
  const apexF = e.tossApex?.frameIndex
  if (apexF !== undefined) {
    const peak = ballNear(track?.ball, apexF, 2) ?? tossPeak(track?.ball)
    if (peak) out.ballAtApex = { frameIndex: apexF, x: peak.x, y: peak.y }
  }
  const cb = contactBall(track?.ball, e)
  if (cb && e.contact) out.ballAtContact = { frameIndex: e.contact.frameIndex, ...cb }
  if (e.landing) {
    const toe = frontToeOf(landmarksAt(track?.pose, e.landing.frameIndex), serve.handedness)
    if (toe) out.frontToeLanding = { frameIndex: e.landing.frameIndex, x: toe.x, y: toe.y }
  }
  const standing = standingFor(serve, track)
  const bh = track?.pose?.bodyHeightHU ?? null
  if (standing) {
    const f = serve.window.startFrame
    out.floorSetup = { frameIndex: f, x: standing.columnX, y: standing.groundY }
    if (bh) out.headTopSetup = { frameIndex: f, x: standing.columnX, y: standing.groundY - bh }
    if (standing.toe) out.frontToeSetup = { frameIndex: f, ...standing.toe }
  }
  return { points: out, standingNorm: bh }
}
