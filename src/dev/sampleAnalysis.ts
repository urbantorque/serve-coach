/**
 * Builds a complete Analysis from the synthetic serve rig, with no camera and
 * no video file. Used to exercise the report UI during development — open the
 * app with `?demo` — and dynamically imported so it never reaches production.
 */
import { pickFocus } from '../lib/analysis/analyze'
import { measure } from '../lib/analysis/metrics'
import { buildPhases, detectServe } from '../lib/analysis/phases'
import { statusOf } from '../lib/analysis/geometry'
import { FUNDAMENTALS } from '../lib/analysis/coaching'
import type { Analysis } from '../lib/analysis/types'
import { buildServe, type ServeDials } from '../lib/analysis/__tests__/syntheticServe'

/**
 * A blank clip matching the sample analysis's duration, so the player and its
 * canvas overlay can be mounted without filming anything. The skeleton will not
 * line up with the picture — there is no player in it — but every code path
 * runs for real.
 */
export async function sampleClip(seconds: number, width = 480, height = 480): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const stream = canvas.captureStream(0)
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack
  const rec = new MediaRecorder(stream, { mimeType: 'video/webm' })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  rec.start()

  const frames = Math.round(seconds * 30)
  for (let i = 0; i < frames; i++) {
    ctx.fillStyle = '#12202a'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#1b3040'
    ctx.fillRect(0, height * 0.82, width, height * 0.18)
    ctx.fillStyle = '#4a5a68'
    ctx.font = '16px sans-serif'
    ctx.fillText(`sample frame ${i + 1}`, 16, 30)
    track.requestFrame()
    await new Promise((r) => setTimeout(r, 8))
  }
  rec.stop()
  await new Promise((r) => (rec.onstop = r))
  return URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }))
}

/**
 * Squeeze a sample analysis onto a clip of a different length.
 *
 * MediaRecorder decides how long the generated clip actually is, and it is
 * never quite what was asked for. Without this the analysis refers to times
 * past the end of the video, every keyframe after the middle clamps to the last
 * frame, and the player looks broken when it is not.
 */
export function fitToClip(analysis: Analysis, duration: number): Analysis {
  const span = analysis.window.end - analysis.window.start
  // `duration` can be NaN when the metadata probe timed out, and NaN fails
  // `<= 0` — it would scale every frame and phase time to NaN.
  if (span <= 0 || !(duration > 0)) return analysis
  const scale = (duration * 0.98) / span
  const at = (t: number) => (t - analysis.window.start) * scale

  return {
    ...analysis,
    frames: analysis.frames.map((f) => ({ ...f, t: at(f.t) })),
    phases: analysis.phases.map((p) => ({ ...p, t: at(p.t) })),
    window: { start: 0, end: duration * 0.98 },
  }
}

/** A basket of serves with a wandering contact height, for the comparison UI. */
export function sampleBasket(): Analysis[] {
  return [1.38, 1.19, 1.44, 1.28].map((contactReach) => sampleAnalysis({ contactReach }))
}

export function sampleAnalysis(dials: Partial<ServeDials> = {}): Analysis {
  const fps = 32
  // A recognisably club-level serve: stiff legs, shallow drop, arm dropping early.
  const frames = buildServe(
    { trophyKneeAngle: 165, dropBelowShoulder: 0.08, tossArmHold: 0.2, contactReach: 1.2, ...dials },
    fps,
  )
  const skel = detectServe(frames, fps)
  const sideView = skel.shoulderWidth / skel.bodyHeight < 0.1
  const fundamentals = measure(frames, skel, sideView)
  const phases = buildPhases(frames, skel.keys)

  const totalWeight = fundamentals.reduce((s, f) => s + FUNDAMENTALS[f.id].weight, 0)
  const overall = Math.round(
    fundamentals.reduce((s, f) => s + f.score * FUNDAMENTALS[f.id].weight, 0) / totalWeight,
  )

  return {
    id: 'demo',
    createdAt: Date.now(),
    scale: { bodyHeight: skel.bodyHeight, groundY: skel.groundY },
    serveType: 'flat',
    // Square: the rig builds image coordinates in a space where x and y already
    // share a unit, which is what an aspect of 1 means to the player.
    video: { name: 'sample.mp4', durationMs: 3000, width: 720, height: 720 },
    handedness: skel.racket,
    quality: {
      confidence: 0.86,
      warnings: ['This is a sample report built from a simulated serve, not a real video.'],
      view: sideView ? 'side' : 'angled',
      sampledFps: fps,
      swingSamples: Math.max(0, skel.keys.contact - skel.keys.drop),
    },
    phases,
    fundamentals,
    overall,
    overallStatus: statusOf(overall),
    // Uses the real chooser rather than a copy of it: a harness that
    // reimplements what it is meant to be previewing drifts away from the app
    // silently, and then demonstrates behaviour that does not exist.
    focus: pickFocus(fundamentals),
    frames,
    window: { start: frames[0].t, end: frames[frames.length - 1].t },
    serves: { count: 1, index: 0 },
  }
}
