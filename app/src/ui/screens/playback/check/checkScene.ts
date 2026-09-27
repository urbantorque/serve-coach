/**
 * Overlay for "Check this serve": the person's own marks as open crosshairs on the frame they were
 * placed on (the standing pair joined by a thin line), and, only after the marks are saved, the app's
 * points as dots (sky blue for the ball, optic for the feet and the height reference). While marking,
 * nothing from the app is drawn (METRICS §5.6 blinding).
 */
import type { AnnotatedPoint } from '../../../../data/domain.ts'
import type { MarkDraft } from '../../../../validation/annotation/marks.ts'
import type { MarkPoint } from '../../../../validation/annotation/types.ts'
import type { OverlayScene, Prim } from '../../../components/video/overlayScene.ts'

const BALL_POINTS: readonly AnnotatedPoint[] = ['ballAtApex', 'ballAtContact']

export interface CheckSceneInput {
  frame: number
  draft: MarkDraft
  /** The point the next tap places (drawn a little larger). */
  active?: AnnotatedPoint | null
  /** The app's points, only once the comparison is shown. */
  app?: Partial<Record<AnnotatedPoint, MarkPoint>> | null
}

export function checkScene({ frame, draft, active, app }: CheckSceneInput): OverlayScene {
  const prims: Prim[] = []
  const p = draft.points

  // App points first, so the person's crosshairs sit on top.
  if (app) {
    for (const [id, pt] of Object.entries(app) as [AnnotatedPoint, MarkPoint][]) {
      const mine = p[id]
      const standing = id === 'headTopSetup' || id === 'floorSetup' || id === 'frontToeSetup'
      // Standing references are the app's pre-toss median: show them on the frame the person used.
      const onFrame = standing ? mine?.frameIndex === frame : pt.frameIndex === frame || mine?.frameIndex === frame
      if (!onFrame) continue
      if (BALL_POINTS.includes(id)) prims.push({ kind: 'dot', at: pt, r: 5, ink: 'ball', ring: true })
      else if (id === 'frontToeLanding' || id === 'frontToeSetup') prims.push({ kind: 'dot', at: pt, r: 4.5, ink: 'optic', ring: true })
      else prims.push({ kind: 'tick', at: pt, lengthPx: 28, orient: 'h', ink: 'optic', width: 3 })
    }
  }

  const head = p.headTopSetup
  const floor = p.floorSetup
  if (head && floor && head.frameIndex === frame && floor.frameIndex === frame) {
    prims.push({ kind: 'segment', a: { x: floor.x, y: floor.y }, b: { x: floor.x, y: head.y }, ink: 'line', width: 1, dash: [3, 3], alpha: 0.8 })
    prims.push({ kind: 'segment', a: { x: head.x, y: head.y }, b: { x: floor.x, y: head.y }, ink: 'line', width: 1, dash: [3, 3], alpha: 0.8 })
  }
  for (const [id, pt] of Object.entries(p) as [AnnotatedPoint, MarkPoint][]) {
    if (pt.frameIndex !== frame) continue
    prims.push({ kind: 'cross', at: pt, sizePx: id === active ? 26 : 20, ink: 'line', width: id === active ? 2.5 : 2 })
  }
  return { prims, labels: [] }
}
