/**
 * Overlay scene builder (DESIGN §2.7, §8.11). A pure function of the current frame and the stored
 * tracks: it returns canvas primitives in normalised clip coordinates plus DOM label specs. Labels
 * that carry a number carry the MetricValue itself, so the label renders it through <MetricValue>
 * with its data state (never a bare number on video). One overlay at a time (research 09 §6.3).
 */
import { LM, type Handedness, type MetricId, type MetricValue, type ServeEvents } from '../../../analysis/types.ts'
import type { BallTrackCompact, PoseTrackCompact } from '../../../data/domain.ts'
import { BONES, BODY_JOINTS, boneTier, jointTier, TIER_OPACITY } from './skeleton.ts'
import { rulerLabel, rulerTicks } from './geometry.ts'
import {
  ballNear,
  ballPoints,
  frontToeOf,
  higherWristOf,
  hipTrace,
  landmarksAt,
  midHipAt,
  tossPeak,
  type Pt,
  type StandingRef,
} from './tracks.ts'

/** The overlay chips (DESIGN §8.11 item 3). */
export type OverlayId = 'body' | 'toss' | 'contact' | 'legs' | 'none'
export const OVERLAY_IDS: readonly OverlayId[] = ['body', 'toss', 'contact', 'legs', 'none']

/** COACHING §8.1 overlay ids (evidence.overlay), which pick the default chip and its variant. */
export type FocusOverlay =
  | 'apex-scatter' | 'apex-vs-toe' | 'toss-arc' | 'contact-height-line' | 'contact-vs-toe'
  | 'hip-rise' | 'hip-path' | 'shoulder-line' | 'timing-strip' | 'outcome-tally' | 'landing-marks' | 'none'

/** The chip a focus overlay opens on (timing and outcome overlays are not drawn on video). */
export function chipForFocus(focus: FocusOverlay | undefined | null): OverlayId {
  switch (focus) {
    case 'apex-scatter':
    case 'apex-vs-toe':
    case 'toss-arc':
      return 'toss'
    case 'contact-height-line':
    case 'contact-vs-toe':
      return 'contact'
    case 'hip-rise':
    case 'hip-path':
    case 'landing-marks':
      return 'legs'
    default:
      return 'body'
  }
}

export interface NPoint {
  x: number
  y: number
}

/** optic: current skeleton; line: measurement lines (#F4F6F2); ball: sky blue; ghost: comparison. */
export type Ink = 'optic' | 'line' | 'ball' | 'ghost'

export type Prim =
  | { kind: 'segment'; a: NPoint; b: NPoint; ink: Ink; width: number; dash?: readonly number[]; alpha?: number }
  | { kind: 'polyline'; points: NPoint[]; ink: Ink; width: number; dash?: readonly number[]; alpha?: number }
  | { kind: 'dot'; at: NPoint; r: number; ink: Ink; alpha?: number; ring?: boolean }
  /** A run of dots thinned so neighbours are at least minGapPx apart on screen (the last is always drawn). */
  | { kind: 'dots'; points: (NPoint & { faded?: boolean })[]; r: number; ink: Ink; minGapPx: number }
  | { kind: 'ring'; at: NPoint; r: number; ink: Ink; width: number }
  /** A short tick of fixed pixel length, centred on `at` (h = horizontal). */
  | { kind: 'tick'; at: NPoint; lengthPx: number; orient: 'h' | 'v'; ink: Ink; width: number }
  /** Small canvas text (ruler graduations only; never a metric value). */
  | { kind: 'text'; at: NPoint; text: string; align: 'left' | 'right'; dx: number }

export interface LabelSpec {
  id: string
  at: NPoint
  /** Which side of the anchor the pill sits on (away from the body). */
  side: 'left' | 'right'
  /** Words before the value ("Peak", "Hips rose"). */
  text: string
  metric?: { id: MetricId; value: MetricValue }
  /** A second value after "in" (drive time after leg drive). */
  metric2?: { id: MetricId; value: MetricValue; joiner: string }
}

export interface OverlayScene {
  prims: Prim[]
  labels: LabelSpec[]
}

export interface GhostPose {
  pose: PoseTrackCompact
  frame: number
  map: (p: NPoint) => NPoint
}

export interface SceneInput {
  overlay: OverlayId
  frame: number
  pose?: PoseTrackCompact
  ball?: BallTrackCompact
  events: ServeEvents
  handedness: Handedness
  standing: StandingRef | null
  /** Standing height as a fraction of frame height. */
  bodyHeightNorm: number | null
  /** width / height of the displayed clip. */
  aspect: number
  metrics: Partial<Record<MetricId, MetricValue>>
  focus?: FocusOverlay | null
  /** Other serves' apexes in this set-up (apex-scatter). */
  peers?: NPoint[]
  ghost?: GhostPose | null
}

/** +1 when "into the court" is image right. The side camera sits on the hitting-arm side (D1). */
export function forwardSign(handedness: Handedness): 1 | -1 {
  return handedness === 'right' ? 1 : -1
}

const usable = (m: MetricValue | undefined): m is MetricValue => Boolean(m && m.status && m.status !== 'unavailable')

function skeletonPrims(lm: (Pt | null)[], ink: Ink, map: (p: NPoint) => NPoint = (p) => p): Prim[] {
  const out: Prim[] = []
  const ghost = ink === 'ghost'
  for (const [a, b] of BONES) {
    const pa = lm[a]
    const pb = lm[b]
    if (!pa || !pb) continue
    const tier = boneTier(pa.v, pb.v)
    if (tier === 'hidden') continue
    out.push({
      kind: 'segment',
      a: map(pa),
      b: map(pb),
      ink,
      width: ghost ? 2.5 : 3,
      ...(ghost ? { dash: [6, 4] } : tier === 'faded' ? { dash: [5, 4] } : {}),
      alpha: ghost ? 0.85 : TIER_OPACITY[tier],
    })
  }
  if (!ghost) {
    for (const j of BODY_JOINTS) {
      const p = lm[j]
      if (!p) continue
      const tier = jointTier(p.v)
      if (tier === 'hidden') continue
      out.push({ kind: 'dot', at: map(p), r: 3.5, ink, alpha: TIER_OPACITY[tier] })
    }
  }
  return out
}

/** Horizontal half-width of the player's column in normalised x (0.35 standing heights). */
function columnHalfWidth(bodyHeightNorm: number, aspect: number): number {
  return (0.35 * bodyHeightNorm) / aspect
}

/** The ball at contact: the track sample nearest contact, else the toss fit, else null. */
export function contactBall(ball: BallTrackCompact | undefined, events: ServeEvents): NPoint | null {
  const c = events.contact
  if (!c) return null
  const near = ballNear(ball, c.frameIndex, 2)
  return near ? { x: near.x, y: near.y } : null
}

export function buildScene(input: SceneInput): OverlayScene {
  const prims: Prim[] = []
  const labels: LabelSpec[] = []
  const { frame, pose, ball, events, standing, bodyHeightNorm: bh, aspect, metrics } = input
  const fwd = forwardSign(input.handedness)
  const forwardSide: 'left' | 'right' = fwd === 1 ? 'right' : 'left'
  const backSide: 'left' | 'right' = fwd === 1 ? 'left' : 'right'

  if (input.ghost) {
    const glm = landmarksAt(input.ghost.pose, input.ghost.frame)
    if (glm) prims.push(...skeletonPrims(glm, 'ghost', input.ghost.map))
  }

  switch (input.overlay) {
    case 'none':
      break

    case 'body': {
      const lm = landmarksAt(pose, frame)
      if (lm) prims.push(...skeletonPrims(lm, 'optic'))
      // Trophy frame: the shoulder line, extended 20% past each shoulder; band word only (D5).
      const trophy = events.trophy
      if (lm && trophy && Math.abs(frame - trophy.frameIndex) <= 2) {
        const ls = lm[LM.LEFT_SHOULDER]
        const rs = lm[LM.RIGHT_SHOULDER]
        if (ls && rs && ls.v >= 0.5 && rs.v >= 0.5) {
          const dx = rs.x - ls.x
          const dy = rs.y - ls.y
          const a = { x: ls.x - 0.2 * dx, y: ls.y - 0.2 * dy }
          const b = { x: rs.x + 0.2 * dx, y: rs.y + 0.2 * dy }
          prims.push({ kind: 'segment', a, b, ink: 'line', width: 3 })
          const band = metrics['shoulder-tilt-trophy']
          if (usable(band)) {
            const end = fwd === 1 ? (a.x > b.x ? a : b) : a.x < b.x ? a : b
            labels.push({ id: 'shoulder', at: end, side: forwardSide, text: 'Shoulder tilt', metric: { id: 'shoulder-tilt-trophy', value: band } })
          }
        }
      }
      break
    }

    case 'toss': {
      const release = events.tossRelease?.frameIndex ?? -Infinity
      const contactF = events.contact?.frameIndex ?? Infinity
      const trail = ballPoints(ball, { kind: 'toss', from: release - 2, to: Math.min(frame, contactF) })
      if (trail.length > 1) prims.push({ kind: 'polyline', points: trail.map(({ x, y }) => ({ x, y })), ink: 'ball', width: 2 })
      if (trail.length) prims.push({ kind: 'dots', points: trail.map((p) => ({ x: p.x, y: p.y, faded: p.predicted })), r: 3, ink: 'ball', minGapPx: 9 })
      // Outgoing ball points when detected.
      if (Number.isFinite(contactF) && frame > contactF) {
        for (const p of ballPoints(ball, { kind: 'outgoing', from: contactF, to: frame })) {
          prims.push({ kind: 'dot', at: { x: p.x, y: p.y }, r: 3, ink: 'ball', alpha: 0.7 })
        }
      }
      // Height ruler in multiples of the player's standing height, behind the body.
      if (standing && bh) {
        const rx = standing.columnX - fwd * columnHalfWidth(bh, aspect) * 1.2
        const ticks = rulerTicks(standing.groundY, bh, [0.5, 1, 1.5, 2, 2.5])
        const top = ticks.length ? Math.min(...ticks.map((t) => t.y)) : standing.groundY - bh
        prims.push({ kind: 'segment', a: { x: rx, y: standing.groundY }, b: { x: rx, y: top }, ink: 'line', width: 2, alpha: 0.9 })
        for (const t of ticks) {
          prims.push({ kind: 'tick', at: { x: rx, y: t.y }, lengthPx: Number.isInteger(t.k) ? 12 : 7, orient: 'h', ink: 'line', width: 2 })
          if (Number.isInteger(t.k)) prims.push({ kind: 'text', at: { x: rx, y: t.y }, text: rulerLabel(t.k), align: fwd === 1 ? 'right' : 'left', dx: 10 })
        }
      }
      // Apex scatter (COACHING §8.1 apex-scatter): every other serve's peak in this set-up.
      if (input.focus === 'apex-scatter' && input.peers?.length) {
        for (const p of input.peers) prims.push({ kind: 'dot', at: p, r: 3, ink: 'ball', alpha: 0.8 })
      }
      const apexF = events.tossApex?.frameIndex
      const apex = tossPeak(ball)
      if (apex && apexF !== undefined && frame >= apexF - 1) {
        prims.push({ kind: 'dot', at: { x: apex.x, y: apex.y }, r: 5, ink: 'ball', ring: true })
        if (standing && bh) {
          const rx = standing.columnX - fwd * columnHalfWidth(bh, aspect) * 1.2
          prims.push({ kind: 'segment', a: { x: rx, y: apex.y }, b: { x: apex.x, y: apex.y }, ink: 'line', width: 1, alpha: 0.7, dash: [3, 3] })
        }
        const h = metrics['toss-apex-height']
        labels.push({ id: 'apex', at: { x: apex.x, y: apex.y }, side: forwardSide, text: 'Peak', ...(usable(h) ? { metric: { id: 'toss-apex-height', value: h } } : {}) })
        if (input.focus === 'apex-vs-toe' && standing?.toe) {
          prims.push({ kind: 'segment', a: standing.toe, b: { x: standing.toe.x, y: apex.y }, ink: 'line', width: 2 })
          const f = metrics['toss-forward']
          if (usable(f)) labels.push({ id: 'toe', at: { x: standing.toe.x, y: (standing.toe.y + apex.y) / 2 }, side: backSide, text: 'From your toe', metric: { id: 'toss-forward', value: f } })
        }
      }
      if (events.contact && frame >= events.contact.frameIndex) {
        const drop = metrics['toss-drop']
        const cb = contactBall(ball, events)
        if (cb && usable(drop)) labels.push({ id: 'drop', at: cb, side: forwardSide, text: 'Dropped', metric: { id: 'toss-drop', value: drop } })
      }
      break
    }

    case 'contact': {
      const cb = contactBall(ball, events)
      const lm = events.contact ? landmarksAt(pose, events.contact.frameIndex) : null
      const hitWrist = higherWristOf(lm)
      const point = cb ?? (hitWrist ? { x: hitWrist.x, y: hitWrist.y } : null)
      if (point && standing && bh) {
        const half = columnHalfWidth(bh, aspect)
        prims.push({ kind: 'segment', a: { x: standing.columnX - half, y: point.y }, b: { x: standing.columnX + half, y: point.y }, ink: 'line', width: 2 })
      }
      if (standing?.toe && point) {
        prims.push({ kind: 'segment', a: standing.toe, b: { x: standing.toe.x, y: point.y }, ink: 'line', width: 2 })
        prims.push({ kind: 'tick', at: standing.toe, lengthPx: 14, orient: 'h', ink: 'line', width: 2 })
      }
      if (point) {
        prims.push({ kind: 'dot', at: point, r: 5, ink: 'ball', ring: true })
        const ratio = metrics['contact-height-ratio']
        labels.push({ id: 'contact', at: point, side: forwardSide, text: 'Contact', ...(usable(ratio) ? { metric: { id: 'contact-height-ratio', value: ratio } } : {}) })
        const fwdM = metrics['contact-forward']
        if (standing?.toe && usable(fwdM)) {
          labels.push({ id: 'contact-toe', at: { x: standing.toe.x, y: (standing.toe.y + point.y) / 2 }, side: backSide, text: 'From your toe', metric: { id: 'contact-forward', value: fwdM } })
        }
      }
      break
    }

    case 'legs': {
      // Floor row and start-toe line: where the player's feet were before the toss.
      if (standing && bh) {
        const half = columnHalfWidth(bh, aspect) * 1.6
        prims.push({ kind: 'segment', a: { x: standing.columnX - half, y: standing.groundY }, b: { x: standing.columnX + half, y: standing.groundY }, ink: 'line', width: 2, alpha: 0.9 })
        if (standing.toe) prims.push({ kind: 'tick', at: { x: standing.toe.x, y: standing.groundY }, lengthPx: 16, orient: 'v', ink: 'line', width: 2 })
      }
      const release = events.tossRelease?.frameIndex
      const contactF = events.contact?.frameIndex
      if (release !== undefined && contactF !== undefined) {
        const trace = hipTrace(pose, release, Math.min(frame, contactF))
        if (trace.length > 1) prims.push({ kind: 'polyline', points: trace.map(({ x, y }) => ({ x, y })), ink: 'line', width: 2 })
      }
      const low = events.lowestHip ?? events.trophy
      const lowHip = low ? midHipAt(pose, low.frameIndex) : null
      if (low && lowHip && frame >= low.frameIndex) prims.push({ kind: 'ring', at: lowHip, r: 6, ink: 'line', width: 2 })
      const contactHip = contactF !== undefined ? midHipAt(pose, contactF) : null
      if (lowHip && contactHip && contactF !== undefined && frame >= contactF && bh) {
        // Bracket beside the body, away from the toss side: tick at the lowest hip, tick at contact.
        const offset = columnHalfWidth(bh, aspect) * 0.9
        const x = fwd === 1 ? Math.min(lowHip.x, contactHip.x) - offset : Math.max(lowHip.x, contactHip.x) + offset
        prims.push({ kind: 'tick', at: { x, y: lowHip.y }, lengthPx: 14, orient: 'h', ink: 'line', width: 1 })
        prims.push({ kind: 'tick', at: { x, y: contactHip.y }, lengthPx: 14, orient: 'h', ink: 'line', width: 1 })
        prims.push({ kind: 'segment', a: { x, y: lowHip.y }, b: { x, y: contactHip.y }, ink: 'line', width: 2 })
        const rise = metrics['leg-drive']
        labels.push({
          id: 'rise',
          at: { x, y: (lowHip.y + contactHip.y) / 2 },
          side: backSide,
          text: 'Hips rose',
          ...(usable(rise) ? { metric: { id: 'leg-drive', value: rise } } : {}),
        })
      } else if (low && lowHip && frame >= low.frameIndex) {
        labels.push({ id: 'lowest', at: lowHip, side: backSide, text: 'Lowest point' })
      }
      // Front-foot landing on the floor row, relative to the start-toe line.
      const landing = events.landing
      if (landing && frame >= landing.frameIndex && standing) {
        const lm = landmarksAt(pose, landing.frameIndex)
        const toe = frontToeOf(lm, input.handedness)
        if (toe) {
          prims.push({ kind: 'tick', at: { x: toe.x, y: standing.groundY }, lengthPx: 16, orient: 'v', ink: 'line', width: 2 })
          const dist = metrics['landing-distance']
          if (usable(dist)) labels.push({ id: 'landing', at: { x: toe.x, y: standing.groundY }, side: forwardSide, text: 'Landed', metric: { id: 'landing-distance', value: dist } })
        }
      }
      break
    }
  }
  return { prims, labels }
}

/** What an overlay needs; a chip with a missing need is disabled with this reason (PRODUCT §6.6). */
export function overlayUnavailableReason(
  overlay: OverlayId,
  data: { pose?: PoseTrackCompact; ball?: BallTrackCompact; events: ServeEvents },
): string | null {
  const poseFrames = data.pose?.frameIndices.length ?? 0
  const tossPts = ballPoints(data.ball, { kind: 'toss' }).length
  switch (overlay) {
    case 'body':
      return poseFrames ? null : 'Body not tracked on this serve'
    case 'toss':
      return tossPts >= 3 ? null : 'Ball not tracked on this serve'
    case 'contact':
      if (!data.events.contact) return 'Contact not found on this serve'
      return poseFrames || tossPts ? null : 'Contact not found on this serve'
    case 'legs':
      return poseFrames ? null : 'Body not tracked on this serve'
    default:
      return null
  }
}
