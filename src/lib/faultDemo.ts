/**
 * A fault, shown moving: the same serve with the fault and without it.
 *
 * WHAT THIS IS FOR. A drill is a sentence, and a player told "your racket stops
 * short behind you" has to picture both their own swing and the one they are
 * meant to make. A coach would show them. The app has no footage to show — no
 * video is stored, and none was ever licensed — but it has the synthetic rig,
 * which can pose any fault it can detect. So each named fault has a dial, and
 * the demonstration is two rig serves that differ in that dial alone, drawn
 * side by side on one clock that lines them up at contact.
 *
 * SIDE BY SIDE, NOT ONE OVER THE OTHER. The report already draws a second serve
 * as a dashed body under the first, and that was tried here first. Two bodies a
 * fault apart overlap almost everywhere, the dashed ink is dim on purpose, and
 * that ghost is drawn from the hips up — so the one difference the picture
 * exists to show was the hardest thing on it to see.
 *
 * ONE DIFFERENCE, ON PURPOSE. Both bodies start from `CLEAN_SERVE` rather than
 * from the player's serve or the club-level serve the example report uses. Any
 * second difference between them is a second thing for the eye to chase, and the
 * point of the picture is the one change the drill asks for.
 *
 * EARNED, NOT DRAWN. Every dial here is checked in `faultDemo.test.ts`: the
 * engine must name the fault on the one serve and not on the other. A
 * demonstration of something the app would not itself detect would be teaching
 * a picture rather than a fault, and a dial that drifts out of detection fails
 * the build rather than quietly showing a clean serve under a fault's name.
 *
 * WHAT IS LEFT OUT is decided in `faultDemoDials.ts`, with the measurements: a
 * fault is shown only where the two bodies visibly differ.
 *
 * Built on the device, on demand: `buildServe` is a few milliseconds and the
 * module is loaded only when somebody asks to see a fault.
 */
import { CLEAN_SERVE, MODEL_TOSS_APEX, buildServe, rigStrikeFlight, type ServeDials } from './analysis/syntheticServe'
import { buildPhases, detectServe } from './analysis/phases'
import { mirrorFrames } from './analysis/mirror'
import type { FlawId } from './analysis/flaws'
import type { Frame, Phase, PhaseId } from './analysis/types'
import type { BallFlight } from './vision/ballTrack'
import { DEMOS, type DemoPart } from './faultDemoDials'

/**
 * The rate the demonstration serves are built at. Faster than any clip the app
 * reads, because this is a drawing rather than a measurement and a smoother
 * replay costs nothing but a few more rows that are never stored.
 */
const DEMO_FPS = 60

/** The rig builds in a square image space — see `SAMPLE_VIDEO` in `sampleAnalysis`. */
export const DEMO_ASPECT = 1

/** One of the two serves: ready to finish, and where its keyframes fall. */
export interface DemoServe {
  frames: Frame[]
  phases: Phase[]
  /** Seconds into its own clip that contact happens — the shared zero. */
  contactT: number
  /** The ball this serve hits, from the release to the strings (L4.4). */
  ball?: BallFlight
}

export interface FaultDemo {
  /** The clean serve's keyframe where the fault shows, and where the picture parks. */
  moment: PhaseId
  /** The serve with the fault in it. */
  fault: DemoServe
  /** The same serve without it. */
  fix: DemoServe
  racket: 'left' | 'right'
  /** What to watch, named under the picture and painted on the faulty body (L4.5). */
  part: DemoPart
}

/** A flight reflected with the body, for a left-hander. */
const mirrorFlight = (f: BallFlight): BallFlight => ({
  ...f,
  apex: { ...f.apex, x: DEMO_ASPECT - f.apex.x },
  samples: f.samples.map((s) => ({ ...s, x: DEMO_ASPECT - s.x })),
})

/**
 * A rig serve and the ball it hits, on the player's own side: what a
 * demonstration draws, and what its test diagnoses, ball and all.
 *
 * The rig builds right-handed serves. A left-hander is shown their own side,
 * because a mirror image of somebody else's arm is one more translation to do
 * while trying to picture a fault. The ball is built on the rig's own frames
 * and mirrored with the body.
 */
export function demoRig(
  dials: Partial<ServeDials>,
  racket: 'left' | 'right',
  apex = MODEL_TOSS_APEX,
): { frames: Frame[]; ball?: BallFlight } | undefined {
  const rig = buildServe({ ...dials, noise: 0, dropout: 0 }, DEMO_FPS)
  const frames = racket === 'left' ? mirrorFrames(rig, DEMO_ASPECT) : rig
  try {
    const skel = detectServe(frames, DEMO_FPS, racket)
    const flight = rigStrikeFlight(rig, skel.keys.contact, apex)
    const ball = flight && racket === 'left' ? mirrorFlight(flight) : flight
    return ball ? { frames, ball } : { frames }
  } catch {
    return undefined
  }
}

function built(dials: Partial<ServeDials>, racket: 'left' | 'right', apex?: number): DemoServe | undefined {
  const rig = demoRig(dials, racket, apex)
  if (!rig) return undefined
  try {
    const skel = detectServe(rig.frames, DEMO_FPS, racket)
    const phases = buildPhases(rig.frames, skel.keys)
    // Ready to finish only: the rig's lead-in and follow-through are a body
    // standing still, and a loop that spends half its time there is a loop the
    // eye stops watching. Times are the clip's own, so the ball still finds them.
    const span = rig.frames.slice(phases[0].frame, phases[phases.length - 1].frame + 1)
    const shift = phases[0].frame
    return {
      frames: span,
      phases: phases.map((p) => ({ ...p, frame: p.frame - shift })),
      contactT: rig.frames[skel.keys.contact].t,
      ...(rig.ball ? { ball: rig.ball } : {}),
    }
  } catch {
    return undefined
  }
}

/**
 * Build the demonstration for one fault, or nothing when there is none.
 *
 * `undefined` rather than a throw for every failure: this is an extra picture
 * beside a drill that is complete without it, and the button that asked for it
 * simply goes away.
 */
export function faultDemo(flaw: FlawId, racket: 'left' | 'right'): FaultDemo | undefined {
  const demo = DEMOS[flaw]
  if (!demo) return undefined
  const fault = built(demo.dials, racket, demo.apex)
  // `CLEAN_SERVE` spelled out rather than `{}`, so a reader sees which serve
  // the fault is being measured against.
  const fix = built({ ...CLEAN_SERVE }, racket)
  if (!fault || !fix) return undefined
  return { moment: demo.moment, fault, fix, racket, part: demo.part }
}

/** Exposed for the test, which has to diagnose the same frames the picture is drawn from. */
export const demoFrames = (dials: Partial<ServeDials>, racket: 'left' | 'right'): Frame[] | undefined =>
  demoRig(dials, racket)?.frames

/** The rate the frames from `demoFrames` are built at, for whoever detects on them. */
export { DEMO_FPS }
