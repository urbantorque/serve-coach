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
import { buildConsistency } from '../lib/analysis/consistency'
import { swingTrack } from '../lib/storage/poseTrack'
import { findPracticeFocus } from '../lib/practice'
import { KEEP_STILLS, type PracticeLog, type Session } from '../lib/storage/db'
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
  //
  // The forearm drop is 0.25 rather than 0.4, and the difference is anatomy
  // rather than taste. Past about 0.3 that dial stops laying the arm over and
  // starts lengthening the forearm — at 0.4 it is 1.40× the upper arm, where a
  // real one is about 0.8 (see its KNOWN LIMIT in `syntheticServe.ts`). At 0.25
  // the wrist flag is raised on 20 of 24 noise realisations, which is exactly
  // the rate 0.4 managed, so the demo poses an arm that exists and earns the
  // same flag at the same rate rather than reaching it by stretching.
  injury: { spineLean: 34, palmToSky: 80, trophyForearmDrop: 0.25 },
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
    // Well under the contact band, which since it was re-anchored on published
    // impact heights starts at 1.14; 1.16 used to sit below the old 1.28.
    contactReach: 1.0,
    tossElbow: 138,
  },
}

/**
 * The clip the rig pretends it filmed.
 *
 * Named rather than inlined because two things now read it: the report renders
 * its dimensions, and `keyframePoses` needs its aspect. Two literals would be
 * two chances for a drawn skeleton to be stretched against the report it sits on.
 */
const SAMPLE_VIDEO = { name: 'sample.mp4', durationMs: 3000, width: 720, height: 720 }

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

/**
 * A stand-in keyframe still.
 *
 * The rig has no camera, so a seeded history would be the one thing `?demo`
 * cannot show pictures for — and "Then, and now" is *entirely* pictures. The
 * right count, the right aspect and the right labels, obviously not a body.
 */
function placeholderStill(label: string): string {
  const canvas = document.createElement('canvas')
  canvas.width = 150
  canvas.height = 200
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.fillStyle = '#151a24'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = '#232a38'
  ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1)
  ctx.fillStyle = '#7b8799'
  ctx.font = '13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(label, canvas.width / 2, canvas.height / 2)
  return canvas.toDataURL('image/png')
}

/**
 * A season of practice, so the six screens that need one can be looked at.
 *
 * THE PROBLEM THIS SOLVES. `?demo` builds one report, and a third of this app is
 * about what happens across many: the trend chart, the delta bars, the
 * repeatability trend, "Your records", "Then, and now", the six-week milestone,
 * the practice card's improving/stuck/slipping verdicts and the streak lines.
 * Every one of those needs a history spanning weeks, which until now could only
 * be produced by going out and filming for weeks. So they shipped unwalked —
 * and two of the defects found on 2026-08-16 lived in exactly that gap, one of
 * them a disagreement between the home card and the report that is only visible
 * with both on screen and a recalibration in the history.
 *
 * WHAT IS DELIBERATELY IN IT. Each of these turns on a branch that is otherwise
 * unreachable, and none of them is decoration:
 *
 *   · **Eight trips over eleven weeks**, chained so `tripsOf` cuts them where
 *     intended — past `MILESTONE_SPAN_MS`, so `sixWeekMilestone` speaks, and
 *     inside `STREAK_GAP_MS`, so the streak and longest-run lines do.
 *   · **A rubric break** three trips in. `currentRubricEra` should cut the
 *     records, the rolling average and the practice window at it while the
 *     chart still draws the older points behind a rule.
 *   · **Two kick serves** among the flat ones, so the "showing your flat serves
 *     only" aside appears with a real count behind it.
 *   · **Baskets on four of the trips**, so the repeatability trend has more than
 *     one point and `recurring` can name an element that came last twice.
 *   · **Keyframe stills on the newest reports only**, which is what `KEEP_STILLS`
 *     leaves behind — so "Then, and now" picks its pair the way it will in life
 *     rather than always finding pictures.
 *   · **A drill logged twice against the weakest measurement**, which is the
 *     branch `practiceHeadline` splits "stuck" on.
 *
 * WHAT IT IS NOT. Not fixtures, not stored, and not evidence about anything:
 * every serve in here is the synthetic rig with its dials moved, so the numbers
 * are the rig's numbers. It exists to make screens reachable, not to validate
 * them.
 */
export function sampleHistory(now = Date.now()): {
  sessions: Session[]
  practice: PracticeLog[]
} {
  const DAY = 24 * 60 * 60 * 1000

  /**
   * Trips, oldest first: how many days back, and what was hit on each.
   *
   * `sore` folds the spine or turns the wrist past `injuriesIn`'s absolute
   * limits on one serve of that trip, which is what `strain.ts` counts. The two
   * are placed to produce both halves of that block at once, which is the state
   * worth being able to look at and one no clean history reaches:
   *
   *   · **`back` on three of the last six answerable trips, including the most
   *     recent** — a live pattern, so `recurringStrain` speaks.
   *   · **`wrist` on the second and third trips and never since** — five clean
   *     trips, inside `STRAIN_WINDOW` and past `CLEARED_TRIPS`, so
   *     `clearedStrain` speaks about the same history in the other direction.
   *
   * Deliberately one serve per sore trip rather than all of them, because a trip
   * counting once however many of its serves were flagged is the property most
   * worth being able to see on a screen.
   */
  const trips: {
    daysAgo: number
    serves: { reach: number; kick?: boolean; basket?: boolean; sore?: 'back' | 'wrist' }[]
  }[] = [
    { daysAgo: 77, serves: [{ reach: 1.11 }, { reach: 1.14, basket: true }, { reach: 1.1 }] },
    { daysAgo: 69, serves: [{ reach: 1.13 }, { reach: 1.15, sore: 'wrist' }] },
    { daysAgo: 61, serves: [{ reach: 1.12 }, { reach: 1.16 }, { reach: 1.13, sore: 'wrist' }] },
    // The recalibration lands here — everything from this trip on is rubric 2.
    { daysAgo: 47, serves: [{ reach: 1.18, basket: true }, { reach: 1.15 }, { reach: 1.17 }] },
    { daysAgo: 39, serves: [{ reach: 1.2 }, { reach: 1.19, kick: true }, { reach: 1.21, sore: 'back' }] },
    { daysAgo: 25, serves: [{ reach: 1.24, basket: true }, { reach: 1.22 }] },
    { daysAgo: 12, serves: [{ reach: 1.27, sore: 'back' }, { reach: 1.25, kick: true }, { reach: 1.26 }] },
    { daysAgo: 3, serves: [{ reach: 1.31, basket: true }, { reach: 1.29 }, { reach: 1.3, sore: 'back' }] },
  ]

  const sessions: Session[] = []
  let n = 0

  for (const [t, trip] of trips.entries()) {
    for (const [i, serve] of trip.serves.entries()) {
      // Minutes apart inside a trip, which is what `sameTrip` is measuring.
      const createdAt = now - trip.daysAgo * DAY + i * 11 * 60 * 1000
      // The same dials `?demo=injury` uses, split by joint, so each flag is
      // earned through `injuriesIn` here too rather than written onto the
      // report. `injury` sets both at once; this history needs them apart.
      const sore =
        serve.sore === 'back'
          ? { spineLean: DEMO_DIALS.injury.spineLean }
          : serve.sore === 'wrist'
            ? {
                palmToSky: DEMO_DIALS.injury.palmToSky,
                trophyForearmDrop: DEMO_DIALS.injury.trophyForearmDrop,
              }
            : {}
      const a = sampleAnalysis({ contactReach: serve.reach, ...sore })
      const { frames: _f, ...rest } = a
      void _f

      const session = {
        ...rest,
        // The real key shape, so `clipIdOf` collapses a re-swept basket the way
        // it does in life.
        id: `serve-demo${n}-0`,
        createdAt,
        serveType: serve.kick ? ('kick' as const) : ('flat' as const),
        scoringVersion: t < 3 ? 1 : 2,
      } as Session

      if (serve.basket) {
        const basket = sampleBasket().map((b, k) => ({
          ...b,
          // Widening early, tightening later: the gap trend is the one chart
          // whose improvement is a number going down.
          overall: Math.round(b.overall + (8 - t) * (k % 2 ? 1.4 : -1.4)),
        }))
        session.consistency = buildConsistency(basket, 5)
      }

      sessions.push(session)
      n++
    }
  }

  // `listSummaries` hands back newest first, and several readers say out loud
  // that they must not depend on that — so the demo supplies it that way and
  // any that quietly does will show it here.
  sessions.reverse()

  /*
   * Stills on the newest `KEEP_STILLS`, which is the prune's own rule applied
   * rather than a guess at how many is realistic.
   *
   * It matters to more than one screen. "Then, and now" chooses its pair by
   * counting back exactly this far and then *fetching* to see whether the
   * pictures really survived, so a seed that gave stills to everything would
   * make that screen appear on terms no real history ever meets, and a seed
   * that gave them to too few would make it never appear at all — which is what
   * happened on the first attempt at this list.
   */
  sessions.forEach((s, i) => {
    if (i < KEEP_STILLS) {
      s.phases = s.phases.map((p) => ({ ...p, thumbnail: placeholderStill(p.label) }))
    }
  })

  /*
   * Two drills logged against whatever the card is actually going to name.
   *
   * Asked of `findPracticeFocus` rather than guessed at: `drilled` only reaches
   * a sentence when the logs and the focus agree on a measurement id, so a
   * hard-coded id here would silently produce the never-logged branch instead
   * of the drilled one, which is the pair this seed exists to show.
   */
  const focus = findPracticeFocus(sessions)
  const practice: PracticeLog[] = focus
    ? [
        { id: `${focus.metricId}-a`, metricId: focus.metricId, drill: focus.drill.name, assignedAt: now - 20 * DAY, doneAt: now - 20 * DAY },
        { id: `${focus.metricId}-b`, metricId: focus.metricId, drill: focus.drill.name, assignedAt: now - 6 * DAY, doneAt: now - 6 * DAY },
      ]
    : []

  return { sessions, practice }
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
    video: SAMPLE_VIDEO,
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
    // The same call `analyze` makes, so the demo shows the branch a pruned
    // report reaches rather than a rig-only shortcut around it.
    track: swingTrack(frames, phases[0].frame, phases[phases.length - 1].frame, SAMPLE_VIDEO.width / SAMPLE_VIDEO.height),
    frames,
    window: { start: frames[0].t, end: frames[frames.length - 1].t },
    serves: { count: 1, index: 0 },
  }
}
