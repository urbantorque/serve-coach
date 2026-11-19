/**
 * Draw the stills, build the coach's report, and hand it to the share sheet
 * (M3.2). Browser-only; loaded when the player asks for it, so none of it is
 * in the report's own chunk.
 */
import type { CoachContext } from './coachContext'
import { coachReportHtml, type CoachStill } from './coachReport'
import { shareBlob } from './reportCard'
import { causalPlan } from '../analysis/verdict'
import { drawSkeleton, fitBody } from '../pose/skeleton'
import { filmstripPoses, poseFrameAt } from '../storage/poseTrack'
import type { Analysis } from '../analysis/types'

type Reportable = Omit<Analysis, 'frames'> & { frames?: Analysis['frames'] }

/** The keyframe stills as PNG data URIs, drawn the way the report draws them. */
function stills(analysis: Reportable): CoachStill[] {
  const poses = filmstripPoses(analysis as Analysis)
  if (!poses) return []
  const out: CoachStill[] = []
  analysis.phases.forEach((phase, i) => {
    const frame = poseFrameAt(poses, i)
    if (!frame) return
    const canvas = document.createElement('canvas')
    canvas.width = 240
    canvas.height = 320
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#0f1218'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    drawSkeleton(ctx, { frame, aspect: poses.aspect, rect: fitBody(frame, poses.aspect, canvas.width, canvas.height), racket: analysis.handedness, figure: { still: true, ground: 1 } })
    out.push({ label: phase.label, src: canvas.toDataURL('image/png') })
  })
  return out
}

/**
 * The coach's page, in the order the report gave (N7.5): the report's plan when
 * it has one, which a player's own tags can reorder past chance (N2.9), and the
 * causal order where it was not passed.
 */
export async function sendCoachReport(
  analysis: Reportable,
  context?: CoachContext,
  given?: Analysis['focus'][],
): Promise<'shared' | 'downloaded' | 'cancelled' | 'failed'> {
  const plan = given?.length ? given : causalPlan(analysis.triage, analysis.diagnosis)
  const html = coachReportHtml(analysis, plan, stills(analysis), context)
  const day = new Date(analysis.createdAt).toISOString().slice(0, 10)
  return shareBlob(new Blob([html], { type: 'text/html' }), `serve-report-${day}.html`, 'Serve report for my coach', 'text/html')
}
