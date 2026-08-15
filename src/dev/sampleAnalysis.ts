/**
 * Builds a complete Analysis from the synthetic serve rig, with no camera and
 * no video file.
 *
 * Not dev-only, whatever the folder name suggests: "See an example report" on
 * an empty home screen is this, and it is the first thing a real first-time
 * player sees. Dynamic import keeps it out of the initial bundle — that is what
 * the `import()` buys, not exclusion from the build. The rig it is built on
 * therefore lives in `lib/analysis` rather than under `__tests__`, so that
 * editing it is visibly editing something a user can reach.
 */
import { pickFocus } from '../lib/analysis/analyze'
import { measure } from '../lib/analysis/metrics'
import { buildPhases, detectServe } from '../lib/analysis/phases'
import { statusOf, weightedScore } from '../lib/analysis/geometry'
import { diagnose } from '../lib/analysis/diagnose'
import { assessResilience, triage } from '../lib/analysis/triage'
import { causalFocus } from '../lib/analysis/verdict'
import { FUNDAMENTALS } from '../lib/analysis/coaching'
import type { Analysis } from '../lib/analysis/types'
import { buildServe, type ServeDials } from '../lib/analysis/syntheticServe'

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

/**
 * Serves dialled to reach a screen that is otherwise hard to get to.
 *
 * `?demo=injury` and `?demo=refused` exist because both of those screens are
 * decided by the engine rather than by a prop — you cannot navigate to them, you
 * have to produce a serve or a clip that triggers one. Which meant that until
 * now the only way to look at the injury banner was to go and film somebody
 * collapsing sideways, and the only way to look at the refusal was to film
 * something bad enough to be thrown out. Neither got looked at.
 *
 * These are dials into the same rig every other demo uses, not fixtures with the
 * answers written in: the injury clip earns its flag through `injuriesIn`, and
 * the refused clip earns its rejection through `rejectionFor`, exactly as a real
 * one would.
 */
export const DEMO_DIALS: Record<string, Partial<ServeDials>> = {
  // A spine folding well past the absolute limit, plus a tray grip rotated hard
  // through the ball: the lumbar flag and the wrist flag together.
  injury: { spineLean: 34, palmToSky: 80, trophyForearmDrop: 0.4 },
  // Heavy tracker noise smears the racket hand through the swing, which is what
  // `too_blurry` is measuring. Nothing here says "reject"; the resilience pass
  // decides that on its own.
  refused: { noise: 0.05, dropout: 0.35 },
  // A recognisable club serve: legs nearly straight, trunk barely coiled,
  // shoulders flat, arm folded at contact and the ball met below full reach.
  // Every one of those lands outside its band, which is the only state in which
  // `TargetShape` draws anything at all — a clean serve correctly shows no
  // target figures, so the demo that exercises them has to be a faulty one.
  shapes: {
    trophyKneeAngle: 166,
    shoulderYaw: 62,
    hipYaw: 58,
    shoulderTilt: 5,
    contactReach: 1.16,
    tossElbow: 138,
  },
}

/** A basket of serves with a wandering contact height, for the comparison UI. */
export function sampleBasket(): Analysis[] {
  // Five serves in the clip, of which the second could not be read — which is
  // the ordinary shape of a real sweep and the one worth having the demo show.
  // Each serve carries its own place in the clip: the panel labels its chips
  // from that rather than from their position in the list, so a basket of
  // `serves.index: 0` reports would render as several serves all numbered one.
  const indices = [0, 2, 3, 4]
  return [1.38, 1.19, 1.44, 1.28].map((contactReach, i) => {
    const a = sampleAnalysis({ contactReach })
    a.serves = { count: 5, index: indices[i] }
    return a
  })
}

export function sampleAnalysis(dials: Partial<ServeDials> = {}, tier?: number): Analysis {
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

  // The diagnostic half of the pipeline, run for real. Without it the demo
  // renders a report whose focus comes from the measurement ranking, which is
  // the fallback rather than the behaviour — no injury flag, no named fault, no
  // tier line, and no way to look at any of them without filming a serve.
  const diagnosis = diagnose(frames, skel, { tier })
  const verdict = triage(diagnosis, assessResilience(frames, skel))

  const overall = weightedScore(
    fundamentals.map((f) => ({ score: f.score, weight: FUNDAMENTALS[f.id].weight })),
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
    // The real chooser, both halves of it. A harness that reimplements what it
    // is meant to be previewing drifts away from the app silently and then
    // demonstrates behaviour that does not exist — which is exactly what
    // happened when the focus moved to the named fault and this line was left
    // calling the ranking on its own.
    focus: causalFocus(verdict) ?? pickFocus(fundamentals),
    diagnosis,
    triage: verdict,
    frames,
    window: { start: frames[0].t, end: frames[frames.length - 1].t },
    serves: { count: 1, index: 0 },
  }
}
