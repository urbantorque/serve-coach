/**
 * What to tell somebody about their framing while they can still move the phone.
 *
 * The app already checks framing — `framingIssues` runs over six preview frames
 * inside `analyze`, and `blockingFramingIssue` refuses the worst of it. The
 * trouble is *when*: that check happens after the player has filmed, stopped,
 * uploaded and waited, so the earliest they can learn the phone was in a
 * position the engine cannot read from is about half a minute after the moment
 * the advice would have been worth anything.
 *
 * This module is that same judgement, taken over a live preview instead. It
 * deliberately owns no thresholds of its own. Every line it draws is drawn
 * somewhere else already:
 *
 *   · `framingIssues` decides cropped, unclear, too far and hands unseen.
 *   · `blockingFramingIssue` decides which of those the analyser would refuse.
 *   · `DEPTH_YAW_RANGE` decides which camera angles collapse a body axis.
 *   · `NOTABLE_ROLL` decides when a tilt is worth correcting for.
 *
 * That is not tidiness. A viewfinder with its own idea of "good enough" is worse
 * than no viewfinder: it would wave a clip through that the upload path then
 * refuses, and the player would have filmed on a green light. Asking the real
 * gate the real question is the only way that cannot happen.
 *
 * What this module does own is the ORDER. Several things can be wrong at once
 * and a player at a court can act on exactly one of them, so the table below is
 * a ranking and the ranking is the deliverable.
 */
import { imageXSplit } from '../analysis/axes'
import { blockingFramingIssue } from '../analysis/analyze'
import { LM, median } from '../analysis/geometry'
import { framingIssues } from '../analysis/groundTruth'
import { ANKLES_SEEN_FLOOR, MIN_STANDING_HEIGHT, NOSE_SHARE_OF_HEIGHT } from '../analysis/phases'
import { NOTABLE_ROLL, assessSpatial, type Spatial } from '../analysis/spatial'
import type { Frame, Landmark } from '../analysis/types'
import { cue } from '../analysis/voice'

/**
 * How many preview frames a verdict is taken over.
 *
 * Not chosen here. `assessSpatial` reads the seven frames ending at the index it
 * is handed — `readyIndex - 6` through `readyIndex` — and takes a median across
 * them, because a player rocking on their feet puts a few frames several degrees
 * off vertical and one of those drags a mean further than the tilt being
 * measured. Judging on a shorter ring than the function's own window would hand
 * that median fewer samples than it was written for; judging on a longer one
 * would show a verdict built partly from frames `assessSpatial` never saw.
 */
export const PREVIEW_WINDOW = 7

/**
 * What the preview showed, in the terms the ranking below argues about.
 *
 * Deliberately not "a yaw, a roll, a height and some visibilities" as four bare
 * numbers. Two of those four are only meaningful against thresholds that already
 * exist in `framingIssues`, and copying those thresholds in here to re-apply
 * them is precisely how a second opinion about framing gets born. So visibility
 * and apparent size arrive already judged, by the judge the upload path uses,
 * and the angles arrive as the `Spatial` the analysis pass would have built.
 */
export interface FramingReading {
  /**
   * `framingIssues`' own verdict on the preview frames. The same strings, from
   * the same function, that `blockingFramingIssue` gates a real upload on.
   */
  issues: readonly string[]
  /** Roll and yaw of the preview, or null when there was no pose to read them from. */
  spatial: Spatial | null
  /**
   * False when `spatial.yaw_deg` is `estimateYaw`'s fallback rather than a
   * reading — no standing height to divide the shoulder span by, so it returned
   * 45. That fallback happens to produce no advice, because 45 sits inside
   * `DEPTH_YAW_RANGE`; getting the right answer by luck is not a reason to let a
   * number nobody measured decide what a player is told.
   */
  yaw_measured: boolean
  /** How many preview frames went into the above. */
  samples: number
}

/**
 * Everything this can say.
 *
 * Listed worst first to match `RANKING` below, but the union is NOT the
 * ranking and nothing can make it one: a type has no runtime order, so no test
 * can pin this list against that table and the two drifted apart the first time
 * a call was added to both. `framingRanking()` is the only answer to "which of
 * these two wins", here and in the tests. This order is a courtesy to a reader
 * and it is allowed to be wrong; that one is checked.
 */
export type FramingCall =
  | 'looking'
  | 'no-player'
  | 'body-cut'
  | 'hands-unseen'
  | 'body-unclear'
  | 'head-cropped'
  | 'feet-cropped'
  | 'too-far'
  | 'turn-off-side'
  | 'turn-off-square'
  | 'off-vertical'
  | 'ready'

/**
 * How much this costs, in the three tiers `blockingFramingIssue` already names.
 *
 * `refused` means the upload path throws this clip out — the player would film,
 * wait, and get a terminal screen. `hedged` means it survives with measurements
 * discounted or dropped. `clear` means nothing here would cost anything, which
 * is a claim about framing alone and about nothing else in the clip.
 */
export type FramingGrade = 'looking' | 'refused' | 'hedged' | 'clear'

export interface FramingVerdict {
  call: FramingCall
  grade: FramingGrade
  /** One instruction, through `voice.ts`, for the player to act on now. */
  cue: string
  /** Everything else that fired, still in ranked order. Nothing here is shown as advice. */
  also: FramingCall[]
}

/**
 * The ranking, worst first, with what each one costs and why it sits here.
 *
 * The three at the top are the three `blockingFramingIssue` refuses, in its
 * order, so that whenever the analyser would refuse this framing the call the
 * player sees is the reason it would refuse. `assertsRefusalsAreTopThree` in the
 * tests holds that together if either side moves.
 */
const RANKING: {
  call: FramingCall
  grade: Exclude<FramingGrade, 'looking'>
  /** The instruction, before `voice.ts` sees it. */
  say: string
  fires: (r: FramingReading) => boolean
}[] = [
  {
    // No pose at all. On an upload this is the flat refusal "I found no player
    // in that clip"; in a viewfinder it is the ordinary state of a phone that
    // has just been propped against a bag, so the wording is an invitation
    // rather than a verdict.
    call: 'no-player',
    grade: 'refused',
    say: '**Step into the shot** where the camera can see all of you.',
    fires: (r) => r.issues.includes('nobody-visible'),
  },
  {
    // Both ends outside the frame. Standing height falls back to the torso, but
    // the ground line is derived from the head, so with neither end visible the
    // ruler every height is measured against has no fixed point.
    call: 'body-cut',
    grade: 'refused',
    say: '**Turn the phone upright** and step back until your head and feet both fit.',
    fires: (r) => r.issues.includes('feet-cropped') && r.issues.includes('head-cropped'),
  },
  {
    // Neither wrist ever found. The swing, the drop, the toss and contact are
    // all read off a wrist, so there is no serve here to measure however good
    // the rest looks — and the model does not fail loudly, it infers a hand.
    // Said as distance when the framing agrees, because "move closer" is
    // something a player can act on.
    call: 'hands-unseen',
    grade: 'refused',
    say: '**Move the phone closer** until your body fills the frame. Every swing reading comes off your racket hand.',
    fires: (r) => r.issues.includes('hands-unseen'),
  },
  {
    // Shoulders and hips unseen. Ranked straight after the refusals because
    // those four landmarks are what roll and yaw are read from and what the
    // fallback ruler is measured on — so with them gone, everything below this
    // line in the table is being decided on landmarks the tracker is guessing.
    call: 'body-unclear',
    grade: 'hedged',
    say: '**Move into better light** where the camera can see your shoulders and hips.',
    fires: (r) => r.issues.includes('body-unclear'),
  },
  {
    // Head out of shot. Above feet, because the fallback for a missing ground
    // line is a torso measurement and there is no fallback at all for a missing
    // head — standing height is taken from the nose, and a nose pinned to the
    // top edge of the picture shrinks every height in the report at once.
    call: 'head-cropped',
    grade: 'hedged',
    say: '**Tilt the phone up** until your head fits, with room above your racket.',
    fires: (r) => r.issues.includes('head-cropped'),
  },
  {
    call: 'feet-cropped',
    grade: 'hedged',
    say: '**Tilt the phone down or step back** until your feet fit. Your own height is the ruler.',
    fires: (r) => r.issues.includes('feet-cropped'),
  },
  {
    // Standing small in frame. Below the crops on purpose: every measurement in
    // the report is a ratio of the player's own body, so distance costs
    // sharpness rather than moving the ruler. It refuses only when it takes the
    // hands with it, which is `hands-unseen`, four rows above.
    call: 'too-far',
    grade: 'hedged',
    say: '**Move the phone closer** until your body fills the frame height.',
    fires: (r) => r.issues.includes('too-far-away'),
  },
  {
    // Dead side-on, past the top of DEPTH_YAW_RANGE. The shoulder line points at
    // the lens, so the across-the-body axis foreshortens to nothing — at 85
    // degrees a sideways drift survives into image x at a gain of 0.087, and
    // recovering it would multiply the reading and all its jitter by 11.5.
    call: 'turn-off-side',
    grade: 'hedged',
    say: '**Move the phone a step round** so it sees you from a corner. Dead side-on hides a toss drifting sideways.',
    fires: (r) => collapsed(r) === 'lateral',
  },
  {
    // Front or back on, below the bottom of DEPTH_YAW_RANGE. The clip still
    // works — the filming guide says so — but how far in front of the body
    // contact happens is inferred rather than seen, and four measurements are
    // hedged for it.
    call: 'turn-off-square',
    grade: 'hedged',
    say: '**Move the phone round to your side**, level with the baseline. A front view loses how far in front you hit.',
    fires: (r) => collapsed(r) === 'depth',
  },
  {
    /*
     * Last, and the only one here that the pipeline repairs rather than
     * suffers: the frame is rotated back onto the player's own standing axis
     * before anything is measured. What it costs is confidence in that
     * correction, and it is the cheapest thing on this list to fix.
     *
     * NAMED FOR WHAT WAS SEEN, NOT FOR A CAUSE. This fires on `roll_deg`, which
     * `estimateRoll` reads as the angle of the player's own shoulder-mid-over-
     * ankle-mid axis off image vertical — a single number that a tilted phone
     * and a leaning player produce identically. spatial.ts says so three lines
     * above the constant this row imports ("a body leaning on its own two
     * degrees looks the same as a phone held two degrees off"), and a probe
     * over the rig confirms it: rotating the upper body about the ankle
     * midpoint by 5/8/12 degrees with the phone level returns byte-identical
     * `roll_deg` and the same call as `unlevelFrames` tilting the phone by the
     * same angles with the player upright. That is harmless in the analysis
     * path, which corrects the frame and discounts confidence without telling
     * anybody to move. In a viewfinder it is not: an earlier version of this
     * row said "Straighten the phone so it sits level", which sends a player
     * with a natural stance lean on a correctly-aimed tripod to tilt the one
     * object in the picture that was already right. So the cue reports the
     * picture, names both cheap fixes, and admits it cannot separate them.
     */
    call: 'off-vertical',
    grade: 'hedged',
    say: '**Straighten up, and check the phone is level.** One of the two is leaning and I cannot tell which.',
    fires: (r) => r.spatial !== null && Math.abs(r.spatial.roll_deg) >= NOTABLE_ROLL,
  },
]

/** What the good state says. Kept beside the table so the editor sees them together. */
const READY_CUE = '**Film from here.** The camera can read your whole body and the angle.'

/** And what it says before there is anything to judge. */
const LOOKING_CUE = '**Stand where you will serve** and hold still while I look.'

/**
 * Which body axis, if either, has collapsed into the lens at this yaw.
 *
 * Asked through `imageXSplit` rather than by comparing the yaw to
 * `DEPTH_YAW_RANGE` here, because that file is the sole owner of what image x
 * means at an angle and it already splits the window per axis — the two ends
 * fail opposite axes and a single `depth_unreliable` flag cannot say which.
 */
function collapsed(r: FramingReading): 'depth' | 'lateral' | null {
  if (!r.spatial || !r.yaw_measured) return null
  const split = imageXSplit(r.spatial.yaw_deg, r.spatial.roll_confidence)
  if (!split.depth.readable) return 'depth'
  if (!split.lateral.readable) return 'lateral'
  return null
}

/**
 * The whole ranking, applied.
 *
 * Grade comes from `blockingFramingIssue` at the top of the list rather than
 * from the table, so this can never call something survivable that the upload
 * path is about to throw out. The table's own grade is used for everything the
 * refusal gate does not claim.
 */
export function judgeFraming(r: FramingReading): FramingVerdict {
  if (r.samples < PREVIEW_WINDOW && !r.issues.includes('nobody-visible')) {
    return { call: 'looking', grade: 'looking', cue: cue(LOOKING_CUE), also: [] }
  }

  const fired = RANKING.filter((row) => row.fires(r))
  if (!fired.length) {
    return { call: 'ready', grade: 'clear', cue: cue(READY_CUE), also: [] }
  }

  const [worst, ...rest] = fired
  const refusing = blockingFramingIssue([...r.issues]) !== undefined

  return {
    call: worst.call,
    grade: refusing ? 'refused' : worst.grade,
    cue: cue(worst.say),
    also: rest.map((row) => row.call),
  }
}

/** Every cue this can put on screen, for the editor to run over. */
export const everyFramingCue = (): string[] => [
  LOOKING_CUE,
  READY_CUE,
  ...RANKING.map((row) => row.say),
]

/** The ranking's call ids, in order, so a test can pin the order down. */
export const framingRanking = (): FramingCall[] => RANKING.map((row) => row.call)

/* ------------------------------------------------------ reading the preview */

/**
 * Standing height in image units, from the preview window.
 *
 * Medians rather than a single frame, and the constants are `detectServe`'s
 * own, imported: the feet stay put so their median is the ground, and the nose
 * sits at `NOSE_SHARE_OF_HEIGHT` of standing height above it.
 *
 * The recipe is NOT identical, and the difference is the window. `detectServe`
 * takes its head reading across only the opening ~30% of the stance, because
 * the player it is looking at is about to sink into the load and a median over
 * the whole window would measure them mid-crouch. There is no motion to slice
 * here — the preview is `PREVIEW_WINDOW` frames of somebody standing in front
 * of a propped phone — so this takes the median across all of it. For a player
 * standing still the two agree; for a player walking into shot they do not, and
 * nothing here gates on stillness, so this is a known limit rather than an
 * equivalence.
 *
 * Returns null rather than a number whenever the ankles are not actually in
 * shot. `detectServe`'s fallback at that point is torso length over
 * `TORSO_SHARE_OF_HEIGHT`, which is a second ruler with its own error; the
 * player is already being told their feet are cropped by the row above this one
 * in the ranking, so a hedged height buys nothing they are not already fixing.
 */
export function standingHeight(frames: readonly Frame[]): number | null {
  if (!frames.length) return null

  const ankles: Landmark[] = []
  for (const f of frames) {
    const l = f.image[LM.leftAnkle]
    const r = f.image[LM.rightAnkle]
    if (l) ankles.push(l)
    if (r) ankles.push(r)
  }
  if (!ankles.length) return null
  if (median(ankles.map((a) => a.visibility ?? 0)) < ANKLES_SEEN_FLOOR) return null

  const noses = frames.map((f) => f.image[LM.nose]?.y).filter((y): y is number => y !== undefined)
  if (!noses.length) return null

  const height = (median(ankles.map((a) => a.y)) - median(noses)) / NOSE_SHARE_OF_HEIGHT
  return Number.isFinite(height) && height > MIN_STANDING_HEIGHT ? height : null
}

/**
 * Turn a window of preview frames into the reading the ranking argues about.
 *
 * `assessSpatial` is asked for the last frame in the window, which is exactly
 * the seven-frame span it reads back over when the window is `PREVIEW_WINDOW`
 * long. Handing it a zero height when there is none is safe and deliberate: it
 * returns its own 45-degree fallback, and `yaw_measured` records that the number
 * came from there so nothing downstream mistakes it for a measurement.
 */
export function readFraming(frames: readonly Frame[]): FramingReading {
  const issues = framingIssues([...frames])
  if (!frames.length) {
    return { issues, spatial: null, yaw_measured: false, samples: 0 }
  }

  const height = standingHeight(frames)
  return {
    issues,
    spatial: assessSpatial([...frames], frames.length - 1, height ?? 0),
    yaw_measured: height !== null,
    samples: frames.length,
  }
}

/**
 * One preview detection, in the shape the analysis engine measures.
 *
 * The aspect correction is the `Frame` contract in types.ts, not a local choice:
 * image x is normalised by width and y by height, so on anything but a square
 * video they are different units, and scaling x by the aspect ratio is what puts
 * a 2D distance between two landmarks back on one scale. `assessSpatial` reads a
 * shoulder span and a body angle off exactly those distances, so a preview built
 * without this would report a yaw and a roll that belong to a stretched picture.
 */
export function previewFrame(
  image: readonly { x: number; y: number; z: number; visibility?: number }[],
  world: readonly { x: number; y: number; z: number; visibility?: number }[],
  aspect: number,
  index: number,
  t: number,
): Frame {
  const safe = aspect > 0 ? aspect : 1
  return {
    index,
    t,
    image: image.map((l) => ({ x: l.x * safe, y: l.y, z: l.z, visibility: l.visibility ?? 1 })),
    world: world.map((l) => ({ x: l.x, y: l.y, z: l.z, visibility: l.visibility ?? 1 })),
    visibility: 0,
  }
}
