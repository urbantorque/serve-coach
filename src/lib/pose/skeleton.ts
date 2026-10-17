import { readoutOf } from '../analysis/anatomy'
import { SOFT_MEASUREMENT } from '../analysis/confidence'
import { LM, jointAngle, type Side, sided } from '../analysis/geometry'
import { racketToDraw, smoothedRacket, type RacketEstimate } from '../analysis/racket'
import { boundsOf, figureOf, type Figure } from '../analysis/targetShape'
import type { Frame, Metric, PhaseId } from '../analysis/types'

export type Limb = ReturnType<typeof sided>

/* ---------------------------------------------------------------- palette ---
 *
 * Every colour this overlay can draw, in one place, with what it means. They
 * were scattered through the file as raw rgba() literals, which is how the same
 * green ended up meaning "racket arm" in one function and "ball trail" in
 * another — and how a change of palette becomes a hunt.
 *
 * Three meanings, and no fourth: neutral body, the chain being judged, injury.
 * If something new needs drawing it has to claim one of those or explain itself.
 */
const PALETTE = {
  /**
   * Goes under every stroke before its colour does.
   *
   * This is the whole reason the overlay is readable, and it is not decoration.
   * Footage is not a backdrop: a white line crosses a white shirt, a yellow one
   * crosses the ball itself, and either vanishes at exactly the frame it was
   * drawn for. A wider near-black stroke of the same path, first, gives every
   * line its own edge no matter what it happens to be passing over. Every
   * drawn element in this file has one — bones, racket, ball, arcs, dots and
   * the leader line — and each is wide enough to leave ~1.6px of dark showing
   * on both sides of the colour.
   */
  under: 'rgba(0, 0, 0, 0.45)',

  /** Torso and legs: tracked, but not what any of the six positions is judged on. */
  neutral: 'rgba(238, 242, 246, 0.82)',

  /** The trunk's own area, the same neutral held right back: weight, not a shape to read. */
  torso: 'rgba(238, 242, 246, 0.1)',

  /** Head outline and the joint dots on it — the same body at full strength. */
  limb: '#eef2f6',

  /**
   * The tossing arm, in blue.
   *
   * It is the other arm doing the other job, and it is deliberately not the
   * accent: the accent answers "which arm am I meant to be watching", and if
   * both arms carry it the answer is gone.
   */
  toss: 'rgba(120, 200, 255, 0.95)',

  /**
   * The app's one accent, in the one place it is allowed to be bright.
   *
   * It marks the racket arm and its callout, and nothing else, so that "the
   * green one" is always the answer to "which arm am I meant to be watching".
   * This is `--lime`, and footage is the darkest ground in the app.
   */
  active: 'rgb(205, 249, 74)',

  /** The accent held back, for the parts that are an estimate: the racket. */
  activeSoft: 'rgba(205, 249, 74, 0.7)',

  /** The hairline from the callout arc out to its plate. Quieter than a bone. */
  leader: 'rgba(205, 249, 74, 0.55)',

  /**
   * Injury risk, and nothing else — not a bad toss, not a low score.
   *
   * Nothing in this file draws it yet. It is named here so the colour is
   * already spoken for when a joint does have to be flagged, and so nobody
   * reaches for the accent to mean "worst rung of the ramp".
   */
  risk: '#ff7a6b',

  /**
   * The segment a fault is in (L4.4), in `--work`: the app's colour for
   * something to work on. The same hue as `risk`, because on a body the two
   * are one claim — this part of you is where the trouble is — and a drawn
   * figure has room for one warning colour, not two.
   */
  work: '#ff7a6b',

  /** Where the faulty segment should be, stroked dashed: a target, never a measurement. */
  target: 'rgba(238, 242, 246, 0.8)',

  /**
   * The ball marker: warm amber, not the accent.
   *
   * A lime marker on a yellow-green tennis ball is an invisible marker, which
   * is the one thing a tracking overlay cannot be. Amber with a dark ring
   * separates from the ball, the sky and the court all at once.
   */
  ball: 'rgba(255, 214, 92, 0.95)',

  /** Flight path, oldest → newest: slate warming toward the accent. */
  ballOld: [152, 162, 179] as const,
  ballNew: [205, 249, 74] as const,

  /** Any text on the picture sits on this. Near-black ink — never bare video. */
  plate: 'rgba(10, 12, 16, 0.82)',
  plateLabel: 'rgba(238, 242, 246, 0.72)',

  /**
   * The target pose, and the band it was placed by.
   *
   * This claims no fourth meaning: it is `neutral` again, held back and always
   * stroked dashed, because a ghost is the same player somewhere they were not.
   * A solid line of any colour here reads as a second tracked body, and the one
   * thing this overlay must never do is let a target be mistaken for a
   * measurement. Dashed and dim is the whole distinction, so both halves are
   * mandatory — see `drawGhost`, which sets the dash itself rather than
   * trusting a caller to have left one on.
   */
  ghost: 'rgba(238, 242, 246, 0.38)',

  /**
   * The target band as a zone across the picture. Deliberately not the accent:
   * the accent means "the arm being judged", and a lime wash over a third of
   * the frame would drown the one thing it is reserved for.
   */
  ghostZone: 'rgba(238, 242, 246, 0.09)',
} as const

/** Colour steps along the ball's flight. Eight is past the eye's resolution here. */
const BALL_PATH_BANDS = 8

/** The trail's two passes, pre-split so the alpha can be spliced in per bucket. */
const TRAIL_UNDER_RGB = '0, 0, 0'
const TRAIL_ACTIVE_RGB = '205, 249, 74'

/* The token stack, spelled out for canvas. Same family and same fallbacks as
   `--font` in tokens.css, so a callout burned into a keyframe still matches the
   page it was captured from. The app ships no webfonts. */
const UI_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif'

/**
 * A bone with weight (L4.4): two landmarks and the band's width at each, in
 * the overlay's own units (`scale`). Wider at the joint nearer the trunk —
 * a thigh is heavier than a shin, an upper arm than a forearm — so a figure
 * reads as a body with mass rather than as wire, while every band still runs
 * through the landmark it was measured from.
 */
type Bone = readonly [number, number, number, number]

const BONES: Bone[] = [
  [LM.leftShoulder, LM.rightShoulder, 3.4, 3.4],
  [LM.leftShoulder, LM.leftHip, 3.8, 3.4],
  [LM.rightShoulder, LM.rightHip, 3.8, 3.4],
  [LM.leftHip, LM.rightHip, 3.4, 3.4],
  [LM.leftHip, LM.leftKnee, 5.6, 4.2],
  [LM.leftKnee, LM.leftAnkle, 4.2, 3],
  [LM.leftAnkle, LM.leftToe, 3, 2.4],
  [LM.rightHip, LM.rightKnee, 5.6, 4.2],
  [LM.rightKnee, LM.rightAnkle, 4.2, 3],
  [LM.rightAnkle, LM.rightToe, 3, 2.4],
]

/** Upper arm and forearm, by side; the racket arm a step heavier than the tossing one. */
const ARM_WEIGHT = { racket: [5.4, 4.4, 3.4], toss: [4.8, 3.8, 3] } as const

/** How far the dark edge reaches past every band, in the overlay's units. */
const UNDER_GROW = 3.6

/**
 * Which joint each keyframe is judged on, for the on-image callout.
 *
 * `metric` is what turns the angle into words. The callout used to read "168°",
 * which is the same fact as "arm dead straight" and none of the same use: a
 * player watching their own contact frame cannot tell whether 168 is good, and
 * can tell instantly whether their arm is straight. The arc stays, because the
 * arc is the part that shows *where* on the body the reading came from.
 */
export const ANNOTATIONS: Partial<
  Record<
    PhaseId,
    {
      label: string
      metric: string
      joints: (racket: Limb, toss: Limb) => [number, number, number]
    }
  >
> = {
  toss: {
    label: 'Tossing elbow',
    metric: 'tossArmExtension',
    joints: (_r, t) => [t.shoulder, t.elbow, t.wrist],
  },
  trophy: { label: 'Knee bend', metric: 'kneeBend', joints: (r) => [r.hip, r.knee, r.ankle] },
  drop: {
    label: 'Hitting elbow',
    metric: 'elbowAtDrop',
    joints: (r) => [r.shoulder, r.elbow, r.wrist],
  },
  contact: {
    label: 'Arm extension',
    metric: 'armExtension',
    joints: (r) => [r.shoulder, r.elbow, r.wrist],
  },
}

/* --------------------------------------------------------------------- ghost ---
 *
 * The position the player should have been in, drawn over the position they
 * were in.
 *
 * The report can say "struck below full reach" all day; a player cannot act on
 * a phrase they have to translate into their own body. So this puts the target
 * on the picture. Everything below exists to stop that from becoming a lie,
 * because a crisp outline is far more convincing than a sentence and will be
 * believed long after the sentence has been hedged.
 *
 * ONE RULE: the ghost is placed by the same number the card prints, and by
 * nothing else. It is not a model pose, not a pro's serve, not a hand-drawn
 * ideal. It is this player's own tracked landmarks moved by exactly the
 * distance the target band asks for, so `readoutOf` applied to the ghost
 * returns the phrase already printed beside it. A ghost that disagrees with its
 * own caption is worse than no ghost — the player would be looking at one claim
 * and reading another, and would rightly stop believing both.
 *
 * WHAT THAT RULES OUT, which is most of the report. A target can only be drawn
 * ON THE BODY where the measurement lives in the plane the canvas draws in.
 * Three of the app's five areas fail that outright:
 *
 * (Every one of the three is now drawn — as a small figure beside the reading
 * rather than over the player, in the plane the number is actually measured in.
 * That is `analysis/targetShape.ts`, and it is a different mechanism answering a
 * different question: not "where should this body have been in this photograph",
 * which is what everything below refuses, but "what does forty degrees look
 * like". Nothing under this line is superseded. A diagram beside the picture
 * claims nothing about the pixels; a crisp outline over somebody's own shoulder
 * claims everything, and the refusals stand exactly as written.)
 *
 *   - `shoulderTilt` is world-space by construction, and `geometry.ts` already
 *     spells out why: side-on, the shoulder line points nearly at the camera,
 *     its horizontal component collapses, and a modest 20° tilt projects as
 *     60°+.
 *   - `hipShoulderSeparation` is built almost entirely out of world z, the
 *     least reliable thing the pose model outputs.
 *   - `kneeBend` is a world 3-D angle, and this ghost has only image
 *     coordinates to place. There is no image-space construction that would
 *     re-measure to the world angle on the caption, and the ONE RULE above is
 *     that the ghost's own readout must be the phrase printed beside it. It is
 *     also not a height, so the one motion this ghost can perform — sliding the
 *     whole body along image y — cannot express it at all: a translation
 *     changes no angle anywhere. So the trophy keyframe gets no ghost, and the
 *     honest description of that is "this mechanism cannot draw an angle",
 *     not "the camera cannot see one".
 *
 *     WHICH IS WHAT THIS SAID, and it was wrong in a way worth leaving on the
 *     record, because it is the failure mode Wave 1 was about. It read: a knee
 *     bends front-to-back, front-to-back is the axis a side-on camera cannot
 *     see, and a 70° bend projects as a 168.9° leg at 82° of yaw and a
 *     dead-straight 180.0° at 90°. Those two figures are real and they
 *     reproduce. They are also a measurement of the RIG, not of cameras.
 *     `syntheticServe.ts` bends the knee purely in world z — dump the trophy
 *     frame and the thigh moves dx 0.0000, dz 0.2516 — and world z on this rig
 *     is the axis ACROSS the player, which `axes.ts` prices at cos(yaw): 0.139
 *     at 82° and 0.000 at 90°. So the rig bends the knee sideways, and the
 *     sideways axis is the one that collapses side-on. A knee bent the way a
 *     knee bends, in the sagittal plane — world x here, gain sin(yaw) — projects
 *     at the same yaws and the same 70° bend to 110.5° at 82° and 110.0° at 90°
 *     against a world 110.3°. Half a degree, at the framing the app recommends.
 *     The sentence had the geometry exactly backwards: it is the FACE-ON
 *     framing that destroys a knee angle (153.1° image against 110° world at
 *     20° of yaw), which is the framing the app already tells people not to use.
 *     `__tests__/ghost.test.ts` pins all of this so the reversal cannot come
 *     back as a fresh discovery.
 *
 * WHAT SURVIVES is the family measured straight down image y against the court:
 * `(groundY - landmark.y) / bodyHeight`. There is no projection in it, no depth
 * to infer and no angle to foreshorten — it is a height in the picture, divided
 * by a height in the picture, and both of its terms are carried on the report
 * for exactly this purpose (see `Analysis.scale`, which names "a model pose to
 * compare against" as the reason it exists).
 */
const HEIGHT_TARGETS: Partial<
  Record<PhaseId, { metric: string; landmark: (racket: Limb, toss: Limb) => number; ballMetric?: string }>
> = {
  toss: { metric: 'releaseHeight', landmark: (_r, t) => t.wrist },
  // With the ball followed to the racket the card reads the ball's own height
  // and drops the hand's (`metrics.ts`), so the target does too (L4.8): it is
  // measured at the ball, against the ball's band. Before, the hand's row was
  // gone and so was the ghost, on exactly the clips the app read best.
  contact: { metric: 'contactHeight', landmark: (r) => r.wrist, ballMetric: 'ballContactHeight' },
}

/**
 * The ghost's own bones: the torso and both arms, and nothing below the hips.
 *
 * The arms are here because a target drawn as a torso with no arms is a target
 * for nothing a player can see themselves doing — the whole measurement is
 * about where one hand was.
 *
 * The legs are gone because of what a rigid translation does to them. The ghost
 * is this player's own pose slid up image y, so every joint angle is identical
 * and the only way the hand reaches higher is if the feet leave the court. Drawn
 * feet hanging in the air are a claim, and the claim is "jump this much
 * higher" — a cause the report already scores on its own card, with its own
 * band, right beside this picture. The numbers are in `ghostFor`: the implied
 * `bodyExtension` runs 0.213 to 0.302 against the serve's real 0.086 and a top
 * rung of 0.16.
 *
 * From the hips up the translation still asserts nothing beyond the number it
 * came from, so that is where it stops. This is the same trade the ghost makes
 * everywhere: draw only what the measurement licenses, and let the shaded band
 * and the gap line carry what is left.
 */
const GHOST_BONES: [number, number][] = [
  [LM.leftShoulder, LM.rightShoulder],
  [LM.leftShoulder, LM.leftHip],
  [LM.rightShoulder, LM.rightHip],
  [LM.leftHip, LM.rightHip],
  [LM.leftShoulder, LM.leftElbow],
  [LM.leftElbow, LM.leftWrist],
  [LM.rightShoulder, LM.rightElbow],
  [LM.rightElbow, LM.rightWrist],
]

/** A target pose, in the same normalised image space as `Frame.image`. */
export interface Ghost {
  /** Where every landmark should have been, indexed exactly as `Frame.image`. */
  image: { x: number; y: number }[]
  /** The target band itself, as a horizontal zone in normalised image y. */
  zone: { top: number; bottom: number }
  /**
   * Image y of the NEAR edge of the band, at the anchor: the actual shortfall.
   *
   * The one number on this overlay that a player reads as a distance, and the
   * reason it is separate from the body. `image` is translated to the band's
   * midpoint, because that is the only placement whose readout is the phrase on
   * the caption — see `ghostFor`. The gap line is a different claim: it says
   * "you were here, you needed to be there", and what the player needed was to
   * reach the band, not its middle.
   *
   * Drawing that line to the midpoint overstated the correction by up to half a
   * band no matter how small the real miss was. Swept through the real pipeline:
   * a contact height of 1.2632 against an ideal of [1.28, 1.50] is a shortfall
   * of 0.0168 body heights — about 3 cm on a 1.8 m player — and the picture drew
   * 0.1268, seven and a half times the miss and 6.5% of the frame's height. At
   * 1.2434 it was four times, at 1.2237 three. A house that will not state a
   * number it did not measure cannot draw one either, and the drawn magnitude
   * was the only quantity on the overlay nobody had measured.
   */
  reachY: number
  /**
   * Where the measured hand actually was, in the same normalised image space.
   *
   * Carried rather than read off whatever frame happens to be on screen, and
   * that is what lets the caller stop pinning the ghost to one exact sample
   * index. `drawGhost` used to start its gap line at the LIVE frame's anchor, so
   * drawing it a sample past contact would have run the line from a hand that
   * was never measured — the arm is already coming down — and overstated the
   * correction by however far it fell in 30 ms. The defence against that was
   * exact index equality in `PosePlayer`, which is a defence with a silent
   * failure in it: `seekTo` sets `currentTime` and the browser snaps it to a
   * decoded frame boundary, so on a clip whose boundaries sit more than half a
   * sample off the pose cadence the nearest sample is the neighbour and the
   * ghost simply never appears, while the angle callout beside it still does.
   *
   * With the measured point travelling on the ghost, the gap line is the gap on
   * the card no matter which frame is showing, and the caller can use the same
   * 90 ms window its sibling callout uses.
   */
  from: { x: number; y: number }
  /** The landmark the target is about — where the leader and the plate hang. */
  anchor: number
  /** The report's own target phrase. Never a second wording of it. */
  label: string
}

export interface GhostInput {
  phase: PhaseId
  /**
   * The keyframe the measurement was taken on, in the space it was taken in.
   * Undefined for a report reopened from storage, which keeps no frames — the
   * ordinary case, and the reason every gate below starts by refusing.
   */
  frame?: Frame
  /** Every measurement on the report. An absent one is absent, never defaulted. */
  metrics: readonly Metric[]
  racket: Side
  /** Standing height and the court surface, in image units. */
  scale?: { bodyHeight: number; groundY: number }
  /**
   * Where the ball was on this keyframe, in the same space as `Frame.image`
   * (x pre-multiplied by the aspect), when it was tracked. A height measured at
   * the ball is measured from here.
   */
  ball?: { x: number; y: number }
  /**
   * Whether the report carries a roll correction.
   *
   * `scale.groundY` and `scale.bodyHeight` are quantities of the *levelled*
   * space the measurements were taken in, and the canvas draws raw video
   * pixels. On a corrected clip the two differ by exactly the roll that was
   * taken out, so a ghost placed off `groundY` would sit tilted away from the
   * body it is meant to be a target for — a hand's width out at the edge of the
   * frame on a 4° correction, which is `NOTABLE_ROLL` and the smallest one that
   * gets corrected at all. The transform back is owned by `spatial.ts` at frame
   * granularity and there is no point-level export of it; a second copy here is
   * how a pivot and a sign drift apart. So a rolled clip gets no ghost. It is a
   * minority of clips — see `Analysis.tilt`, "absent on the clips that needed no
   * correction, which is most".
   */
  rolled?: boolean
}

/**
 * The target pose for a keyframe, or nothing.
 *
 * Nothing is the common answer and the safe one. Every refusal below is a case
 * where the app would otherwise be drawing a crisp outline over a number it has
 * already admitted it cannot see.
 */
export function ghostFor(o: GhostInput): Ghost | undefined {
  const spec = HEIGHT_TARGETS[o.phase]
  if (!spec || !o.frame || o.rolled) return undefined

  const { bodyHeight, groundY } = o.scale ?? { bodyHeight: 0, groundY: 0 }
  if (!(bodyHeight > 0) || !Number.isFinite(groundY)) return undefined

  const ballRow = spec.ballMetric ? o.metrics.find((x) => x.id === spec.ballMetric) : undefined
  const atBall = ballRow !== undefined && o.ball !== undefined && Number.isFinite(o.ball.y)
  const m = atBall ? ballRow : o.metrics.find((x) => x.id === spec.metric)
  // Absent is absent. `metrics.ts` drops a measurement it could not take rather
  // than flooring it, so a missing card here means the app never had the number
  // — and a ghost is a claim about a number.
  if (!m || !Number.isFinite(m.value)) return undefined

  // Soft is not good enough either, and this is the gate the whole feature turns
  // on. `confidence.ts` softens every height ratio at once when the feet are
  // cropped and standing height falls back to a torso estimate — which is
  // precisely the input `groundY` and `bodyHeight` are, so a low-confidence
  // height ghost would be a crisp line drawn from two guessed numbers. The card
  // beside it already says "approximate"; the picture must not say otherwise.
  if (m.confidence < SOFT_MEASUREMENT || m.softness) return undefined

  const [lo, hi] = m.ideal
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return undefined

  // Inside the band, nothing is drawn. `FundamentalCard` withholds "Aim for" on
  // exactly this test and for exactly this reason: a player who is already where
  // they were asked to be does not need the app correcting them, and a ghost
  // sitting on top of their own body is a correction with no content.
  if (m.value >= lo && m.value <= hi) return undefined

  // The midpoint, not the near edge. `targetOf` reads the printed target phrase
  // off the middle of the band, so the midpoint is the one value in it whose
  // readout is guaranteed to be the words already on the card. Placing the ghost
  // at the near edge would ask for less than the caption says and could land it
  // a whole rung away from its own label.
  const target = (lo + hi) / 2

  // And the near edge, which is a different question with a different answer:
  // how far short the player actually was. That is what the gap line measures —
  // see `Ghost.reachY`. A player under the band has to come up to `lo`; one
  // over it has to come down to `hi`.
  const reach = m.value < lo ? lo : hi

  const arm = sided(o.racket)
  const anchor = spec.landmark(arm, sided(o.racket === 'right' ? 'left' : 'right'))
  // The point the height was measured at: the ball where the card read the
  // ball, the landmark where it read the hand. The plate still hangs off the
  // hand (`anchor`), which is where a player looks for their own arm.
  const actual = atBall ? o.ball : o.frame.image[anchor]
  if (!actual || !Number.isFinite(actual.y)) return undefined

  // Image y grows downwards, so a taller target is a smaller y.
  const targetY = groundY - target * bodyHeight
  const dy = targetY - actual.y
  if (!Number.isFinite(dy)) return undefined

  /*
   * The whole body moves, not the arm.
   *
   * The measurement is "how high above the court did that hand meet the ball",
   * and the only correction it licenses is "that body, this much higher".
   * Moving the arm alone would be asserting the fix is an arm action, which
   * this number does not say — the report scores arm extension, leg drive and
   * body extension on their own cards, each with their own band.
   *
   * A rigid translation is the least any of that, and it is not none, which is
   * why the legs are left out of `GHOST_BONES`. Every joint angle is unchanged
   * by construction, so the only way the ghost's hand gets higher is by the
   * whole body leaving the court — and drawn feet floating above the surface
   * read as one thing only. Measured on the same sweep, the ghost's ankles imply
   * a `bodyExtension` of 0.302 at a contact reach of 1.15 and 0.213 at 1.24,
   * against the serve's real 0.086; `anatomy.ts` puts the top rung, 'Big jump',
   * at above 0.16. A player parked on the contact keyframe would be reading a
   * card that says they were up off the court by a normal amount while looking
   * at a target hanging one and a half to two times the top rung of that card's
   * own ladder. So the ghost is drawn from the hips up, where the translation
   * asserts nothing beyond the number it came from, and the band and the gap
   * line carry the rest.
   *
   * Taken from the raw tracked frame rather than the smoothed one the player
   * sees, for the reason `PosePlayer` gives about the trail and the racket: the
   * smoother is for the eye, and anything carrying a number is derived from what
   * was measured. It costs nothing here anyway — the anchor lands on an absolute
   * height computed from the band and the scale, so the one landmark the ghost
   * is judged by does not depend on the player's per-frame noise at all.
   */
  return {
    image: o.frame.image.map((p) => ({ x: p.x, y: p.y + dy })),
    zone: { top: groundY - hi * bodyHeight, bottom: groundY - lo * bodyHeight },
    reachY: groundY - reach * bodyHeight,
    from: { x: actual.x, y: actual.y },
    anchor,
    label: m.target,
  }
}

/** Where the video actually sits inside a box, under `object-fit: contain`. */
export interface DrawRect {
  ox: number
  oy: number
  dw: number
  dh: number
}

/**
 * The video letterboxes inside its box whenever the two aspects differ, and
 * landmarks are normalised to the video frame — so they must be mapped into the
 * letterboxed rect rather than the box, or the skeleton sits off the body.
 */
export function fitContain(boxW: number, boxH: number, videoAspect: number): DrawRect {
  const boxAspect = boxW / Math.max(1, boxH)
  const dw = boxAspect > videoAspect ? boxH * videoAspect : boxW
  const dh = boxAspect > videoAspect ? boxH : boxW / videoAspect
  return { ox: (boxW - dw) / 2, oy: (boxH - dh) / 2, dw, dh }
}

/**
 * A body fitted to a box by its own extent (L4.6), centred, at a share of the
 * box's height — so two bodies filmed at different distances, or one filmed
 * and one built, are drawn the same size beside each other. Landmarks only:
 * a racket or a ball may reach past the fit, as they do past a body.
 */
export function fitBody(frame: Frame, aspect: number, w: number, h: number, fill = 0.78): DrawRect {
  const xs = frame.image.map((l) => l.x / aspect).filter(Number.isFinite)
  const ys = frame.image.map((l) => l.y).filter(Number.isFinite)
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)]
  const d = Math.min((w * 0.9) / Math.max(1e-3, x1 - x0), (h * fill) / Math.max(1e-3, y1 - y0))
  return { ox: w / 2 - ((x0 + x1) / 2) * d, oy: h / 2 - ((y0 + y1) / 2) * d, dw: d, dh: d }
}

export interface SkeletonOptions {
  frame: Frame
  /** Video width ÷ height. Image landmark x is pre-multiplied by this. */
  aspect: number
  rect: DrawRect
  racket: Side
  /** Fading trail of the racket hand across these frames, up to the current one. */
  trail?: { frames: Frame[]; from: number; to: number }
  /** Angle callout to draw, if this frame is a judged keyframe. */
  annotation?: PhaseId
  /**
   * Target bands by metric id, for the measurements worth drawing one for.
   *
   * A metric absent from here gets no dial. That is how "nothing is drawn over
   * a measurement the app has hedged" is enforced, and it is enforced at the
   * caller rather than here because confidence is the caller's to know — the
   * same division `drawGhost` already uses. Whatever is passed has to be the
   * band the report prints as the target, or the picture and the caption
   * disagree, which is the one thing the ghost's rule forbids outright.
   */
  bands?: Record<string, [number, number] | undefined>
  /**
   * Standing height in image units. Supplying it draws the estimated racket;
   * without it the arm simply ends at the hand, as before.
   */
  bodyHeight?: number
  /** All tracked frames and where we are in them, so the racket can be steadied. */
  sequence?: { frames: Frame[]; index: number }
  /**
   * A real racket box, keyed by frame index, where the object detector in
   * `analyze.ts` caught one — trophy to contact only, see `findRacketBoxes`.
   * Preferred over `smoothedRacket`'s wrist-and-knuckles guess whenever the
   * current frame has an entry, because it is grounded in something actually
   * seen rather than extrapolated from the hand.
   */
  racketBoxes?: Map<number, RacketEstimate>
  /** The tracked ball, drawn as a marker plus its flight path. */
  ball?: { x: number; y: number; path?: { x: number; y: number }[] }
  /**
   * Enlarges the angle callout relative to the body. The stills are shown far
   * smaller than the player, so a callout sized for the player shrinks to a few
   * illegible pixels in the filmstrip.
   */
  calloutScale?: number
  /**
   * The target pose to draw behind the tracked one, from `ghostFor`.
   *
   * Optional, and absent far more often than not. Passing one is a claim that
   * the app can see the measurement it was built from — build it with
   * `ghostFor`, which owns every reason not to, rather than assembling one here.
   */
  ghost?: Ghost
  /**
   * Another of this player's own serves, already aligned onto this one.
   *
   * Indexed exactly as `Frame.image`, with `null` for every landmark this app
   * will not draw — which is everything below the hips, and is decided in
   * `lib/trackPair.ts` rather than here. That module owns every reason not to
   * produce one at all: a camera that moved, a rubric change, a contact nobody
   * tracked. Passing one is a claim that two saved serves are genuinely
   * comparable, and this file is in no position to check that.
   *
   * Never passed alongside `ghost`. They are the same ink saying two different
   * things — one is where you were not, the other is where you should have been
   * — and they live on different screens for that reason: this on `TrackPlayer`,
   * which has no video, and `ghost` on `PosePlayer`, which does.
   */
  paired?: readonly ({ x: number; y: number } | null)[]
  /**
   * Where the toss peaked against the front foot, for the toss still (D4.6).
   * Build it with `tossMarkFor`, which refuses a picture that is not upright.
   */
  tossMark?: TossMark
  /**
   * The bones a fault is in, as landmark pairs, painted in `--work` over the
   * body (L4.4). The caller decides which: a fault demonstration knows the
   * one limb its dial moved, and nothing else on screen has a claim to it.
   */
  work?: [number, number][]
  /** The racket in `--work`, for a fault in the racket itself (L4.5). */
  workRacket?: boolean
  /** The ball in `--work`, for a fault in the toss (L4.5). */
  workBall?: boolean
  /**
   * Where those bones should be, as segments in the same normalised image
   * space as `Frame.image`, stroked dashed under the body (L4.4). Dashed for
   * the reason the ghost is: a target must never read as a measurement.
   */
  target?: { a: { x: number; y: number }; b: { x: number; y: number } }[]
  /**
   * Draw the target over the body rather than under it (L4.5). For a model
   * only: on a demonstration the dashed shape is the instruction, and the
   * hips' target sits on the body it is a target for. A player's own body is
   * never drawn under anything, which is why this is not the default.
   */
  targetOver?: boolean
}

/**
 * Where the toss peaked against the front foot, drawn on the toss still (D4.6).
 *
 * The toss placement reading (`readTossPlacement`) said as a picture: a line up
 * from the front ankle to the height of the toss's top, and across to where the
 * top was, under the toss map's own sentence. Both points are in the same
 * normalised image space as `Frame.image`.
 */
export interface TossMark {
  /** The front ankle at the ready position, where the reading is measured from. */
  foot: { x: number; y: number }
  /** The toss's top: the ball's apex, or the hand at release standing in for it. */
  peak: { x: number; y: number }
  /** The toss map's phrase for the same number (`placeLine`). */
  label: string
}

/** The overline on the toss marker's plate. */
const TOSS_OVERLINE = 'TOSS PEAK'

/**
 * The toss mark for a still, or nothing.
 *
 * Nothing on a levelled clip, for the reason `ghostFor` gives: a still is raw
 * video, and the line up from the foot is only "up" in an upright picture.
 */
export function tossMarkFor(o: {
  frames: Frame[]
  readyFrame: number
  tossFrame: number
  racket: 'right' | 'left'
  /** The flight in the stills' own space, x width-normalised as `BallFlight` keeps it. */
  ball?: { apex: { x: number; y: number } }
  aspect: number
  placement?: { ahead?: number; across?: number; from: 'ball' | 'hand' }
  rolled: boolean
  label: (axis: 'ahead' | 'across', value: number) => string
}): TossMark | undefined {
  const p = o.placement
  if (!p || o.rolled) return undefined
  const value = p.ahead ?? p.across
  if (value === undefined) return undefined
  const T = sided(o.racket === 'right' ? 'left' : 'right')
  const foot = o.frames[o.readyFrame]?.image[T.ankle]
  const hand = o.frames[o.tossFrame]?.image[T.wrist]
  const peak = p.from === 'ball' && o.ball ? { x: o.ball.apex.x * o.aspect, y: o.ball.apex.y } : hand
  if (!foot || !peak) return undefined
  return {
    foot: { x: foot.x, y: foot.y },
    peak: { x: peak.x, y: peak.y },
    label: o.label(p.ahead !== undefined ? 'ahead' : 'across', value),
  }
}

function drawTossMark(
  ctx: CanvasRenderingContext2D,
  m: TossMark,
  rect: DrawRect,
  aspect: number,
  scale: number,
): void {
  const { ox, oy, dw, dh } = rect
  const at = (p: { x: number; y: number }) => ({ x: ox + (p.x / aspect) * dw, y: oy + p.y * dh })
  const foot = at(m.foot)
  const peak = at(m.peak)
  const corner = { x: foot.x, y: peak.y }

  // The ghost's two-stroke ink, dashed up from the foot because the foot line
  // is a reference, and solid across because the gap across is the reading.
  const stroke = (dashed: boolean, colour: string) => {
    ctx.setLineDash(dashed ? [6 * scale, 5 * scale] : [])
    ctx.strokeStyle = PALETTE.under
    ctx.lineWidth = 4.4 * scale
    ctx.stroke()
    ctx.strokeStyle = colour
    ctx.lineWidth = 2 * scale
    ctx.stroke()
  }
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(foot.x, foot.y)
  ctx.lineTo(corner.x, corner.y)
  stroke(true, PALETTE.ghost)
  ctx.beginPath()
  ctx.moveTo(corner.x, corner.y)
  ctx.lineTo(peak.x, peak.y)
  stroke(false, PALETTE.ball)
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.arc(peak.x, peak.y, 5 * scale, 0, Math.PI * 2)
  stroke(false, PALETTE.ball)

  // The ghost's plate, so the still speaks in one voice: the sentence, and an
  // overline saying what it is about.
  const labelSize = 9.5 * scale
  const valueSize = 12.5 * scale
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `620 ${valueSize}px ${UI_FONT}`
  const valueW = ctx.measureText(m.label).width
  ctx.font = `500 ${labelSize}px ${UI_FONT}`
  const w = Math.min(dw - 8 * scale, Math.max(valueW, ctx.measureText(TOSS_OVERLINE).width) + 22 * scale)
  const h = 36 * scale
  const mid = (foot.x + peak.x) / 2
  const lx = Math.min(Math.max(mid, ox + w / 2 + 4 * scale), ox + dw - w / 2 - 4 * scale)
  const ly = Math.min(Math.max(peak.y - h, oy + h / 2 + 4 * scale), oy + dh - h / 2 - 4 * scale)
  roundRectPath(ctx, lx - w / 2, ly - h / 2, w, h, Math.min(9 * scale, h / 2))
  ctx.fillStyle = PALETTE.plate
  ctx.fill()
  ctx.font = `620 ${valueSize}px ${UI_FONT}`
  ctx.fillStyle = PALETTE.limb
  ctx.fillText(m.label, lx, ly - 5 * scale, w - 12 * scale)
  ctx.font = `500 ${labelSize}px ${UI_FONT}`
  ctx.fillStyle = PALETTE.plateLabel
  ctx.fillText(TOSS_OVERLINE, lx, ly + 9 * scale)
}

/**
 * Draw the tracked body over a video frame.
 *
 * Shared by the live player and the keyframe stills so the two cannot drift
 * apart — the stills are the only part of a serve that outlives the session, and
 * they should look like what the player showed.
 */
export function drawSkeleton(ctx: CanvasRenderingContext2D, o: SkeletonOptions): void {
  const { frame: f, aspect, rect } = o
  const { ox, oy, dw, dh } = rect
  const arm = sided(o.racket)
  const tossArm = sided(o.racket === 'right' ? 'left' : 'right')

  const at = (lm: number) => ({
    x: ox + (f.image[lm].x / aspect) * dw,
    y: oy + f.image[lm].y * dh,
  })
  const scale = Math.min(dw, dh) / 420

  // The target goes down before anything tracked does, so the player's own body
  // is always the thing on top. Drawn last it would sit over the very limb it is
  // a target for, and the picture would be answering "where were you" with the
  // answer to "where should you have been".
  // Drawn from the ghost's own record of where the measured hand was, not from
  // this frame's — see `Ghost.from`.
  // The other serve goes down before the target does and long before the tracked
  // body, for the same reason: whatever the player actually did is the thing on
  // top. These two never arrive together — see `SkeletonOptions.paired` — and the
  // order is fixed anyway rather than left to whichever check ran first.
  if (o.paired) drawPairedGhost(ctx, o.paired, rect, aspect, scale)

  if (o.ghost) drawGhost(ctx, o.ghost, rect, aspect, scale)
  if (o.target?.length && !o.targetOver) drawTarget(ctx, o.target, rect, aspect, scale)
  if (o.tossMark) drawTossMark(ctx, o.tossMark, rect, aspect, scale)

  if (o.trail && o.trail.to > o.trail.from + 1) {
    const { frames, from, to } = o.trail
    ctx.lineCap = 'round'
    const pt = (fr: Frame) => ({
      x: ox + (fr.image[arm.wrist].x / aspect) * dw,
      y: oy + fr.image[arm.wrist].y * dh,
    })
    /*
     * The fade is quantised into a handful of polylines, not drawn per segment.
     *
     * A trail can be fifty frames long and a per-segment stroke costs a path
     * apiece, twice over — that is a hundred and eighty paths a frame for one
     * fading tail. Six steps of alpha are indistinguishable from a continuous
     * ramp at this width, and each step is a single polyline.
     *
     * The underlay is a whole pass rather than a second stroke per bucket
     * because it is wider than the trail: interleaved, each bucket's dark edge
     * would land back over the end of the bucket before it and bead the swing
     * path. Butt caps because consecutive buckets share their endpoint exactly
     * — a round cap there would double the alpha at six places along the arc.
     */
    ctx.lineCap = 'butt'
    ctx.lineJoin = 'round'
    const steps = 6
    const segments = to - from
    for (let pass = 0; pass < 2; pass++) {
      ctx.lineWidth = (pass === 0 ? 6 : 3) * scale
      for (let k = 0; k < steps; k++) {
        const lo = from + Math.floor((segments * k) / steps)
        const hi = from + Math.floor((segments * (k + 1)) / steps)
        if (hi <= lo) continue
        const alpha = 0.08 + (0.5 * (k + 1)) / steps
        ctx.strokeStyle =
          pass === 0
            ? `rgba(${TRAIL_UNDER_RGB}, ${alpha})`
            : `rgba(${TRAIL_ACTIVE_RGB}, ${alpha})`
        ctx.beginPath()
        const first = pt(frames[lo])
        ctx.moveTo(first.x, first.y)
        for (let i = lo + 1; i <= hi; i++) {
          const q = pt(frames[i])
          ctx.lineTo(q.x, q.y)
        }
        ctx.stroke()
      }
    }
  }

  /*
   * Limbs with weight (L4.4): each bone a tapered band with a round end at
   * each joint, built as one path per colour and FILLED once.
   *
   * Filled rather than stroked bone by bone because a colour with any
   * transparency would land twice where two bones meet, and the joints are
   * exactly what is measured. One fill of one path paints the union once. Every
   * shape winds the same way — quads and circles both positive — so where they
   * overlap the winding adds rather than cancels, and no joint comes out as a
   * hole. The underlay is the same shapes grown by the dark edge, filled
   * first, so it covers the whole limb before any colour lands on it.
   */
  const bonePath = (bones: readonly Bone[], grow: number) => {
    ctx.beginPath()
    for (const [a, b, wa, wb] of bones) {
      const p = at(a)
      const q = at(b)
      const ra = (wa * scale + grow) / 2
      const rb = (wb * scale + grow) / 2
      const len = Math.hypot(q.x - p.x, q.y - p.y) || 1
      const nx = -(q.y - p.y) / len
      const ny = (q.x - p.x) / len
      ctx.moveTo(p.x - nx * ra, p.y - ny * ra)
      ctx.lineTo(q.x - nx * rb, q.y - ny * rb)
      ctx.lineTo(q.x + nx * rb, q.y + ny * rb)
      ctx.lineTo(p.x + nx * ra, p.y + ny * ra)
      ctx.closePath()
      ctx.moveTo(p.x + ra, p.y)
      ctx.arc(p.x, p.y, ra, 0, Math.PI * 2)
      ctx.moveTo(q.x + rb, q.y)
      ctx.arc(q.x, q.y, rb, 0, Math.PI * 2)
    }
  }
  const limbs = (bones: readonly Bone[], color: string) => {
    bonePath(bones, UNDER_GROW * scale)
    ctx.fillStyle = PALETTE.under
    ctx.fill()
    bonePath(bones, 0)
    ctx.fillStyle = color
    ctx.fill()
  }

  // The trunk's area first, faint, so the figure has a body between its lines.
  {
    const corners = [LM.leftShoulder, LM.rightShoulder, LM.rightHip, LM.leftHip].map(at)
    ctx.beginPath()
    ctx.moveTo(corners[0].x, corners[0].y)
    for (const c of corners.slice(1)) ctx.lineTo(c.x, c.y)
    ctx.closePath()
    ctx.fillStyle = PALETTE.torso
    ctx.fill()
  }

  limbs(BONES, PALETTE.neutral)

  const armBones = (side: Limb, w: readonly [number, number, number]): Bone[] => [
    [side.shoulder, side.elbow, w[0], w[1]],
    [side.elbow, side.wrist, w[1], w[2]],
  ]
  limbs(armBones(tossArm, ARM_WEIGHT.toss), PALETTE.toss)

  // The racket arm last and in the accent: it is drawn over the tossing arm on
  // purpose, because when the two cross it is the hitting arm you are watching.
  limbs(armBones(arm, ARM_WEIGHT.racket), PALETTE.active)

  // The bones the fault is in, over everything else on the body (L4.4), each
  // at the weight that bone already has.
  if (o.work?.length) {
    const weighted = [...BONES, ...armBones(arm, ARM_WEIGHT.racket), ...armBones(tossArm, ARM_WEIGHT.toss)]
    limbs(
      o.work.map(([a, b]): Bone => {
        const known = weighted.find(([p, q]) => (p === a && q === b) || (p === b && q === a))
        return known ? [a, b, known[a === known[0] ? 2 : 3], known[a === known[0] ? 3 : 2]] : [a, b, 5, 4]
      }),
      PALETTE.work,
    )
  }

  // The racket, where the hand can be seen well enough to point it. Drawn under
  // the joint dots so the hand still reads as the anchor, and skipped silently
  // when the knuckles are lost — a racket swinging off at a guessed angle is
  // worse than no racket at all.
  // A rig frame carries the racket it was built with (L4.4) — a model serve is
  // drawn holding exactly that. A tracked frame's is estimated from the hand.
  const sequence = o.sequence
  const bodyHeight = o.bodyHeight
  const est =
    f.racket ??
    (bodyHeight && bodyHeight > 0
      ? racketToDraw(o.racketBoxes?.get(sequence?.index ?? -1), () =>
          sequence ? smoothedRacket(sequence.frames, sequence.index, o.racket, bodyHeight) : undefined,
        )
      : undefined)
  {
    if (est) {
      const grip = { x: ox + (est.grip.x / aspect) * dw, y: oy + est.grip.y * dh }
      const head = { x: ox + (est.head.x / aspect) * dw, y: oy + est.head.y * dh }
      const dx = head.x - grip.x
      const dy = head.y - grip.y
      const len = Math.hypot(dx, dy) || 1
      // Shaft stops short of the head so the two do not visually merge.
      const throatX = grip.x + dx * 0.62
      const throatY = grip.y + dy * 0.62

      // Shaft and head are each built once and stroked twice — dark and wide,
      // then the accent — so the underlay costs a stroke, not a second path.
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(grip.x, grip.y)
      ctx.lineTo(throatX, throatY)
      ctx.strokeStyle = PALETTE.under
      ctx.lineWidth = 6 * scale
      ctx.stroke()
      ctx.strokeStyle = o.workRacket ? PALETTE.work : PALETTE.activeSoft
      ctx.lineWidth = 2.6 * scale
      ctx.stroke()

      // An ellipse with its long axis along the shaft, which is what a racket
      // head looks like from any angle that is not straight on.
      ctx.save()
      ctx.translate(head.x, head.y)
      ctx.rotate(Math.atan2(dy, dx))
      ctx.beginPath()
      ctx.ellipse(0, 0, len * 0.3, len * 0.23, 0, 0, Math.PI * 2)
      ctx.strokeStyle = PALETTE.under
      ctx.lineWidth = 5.6 * scale
      ctx.stroke()
      ctx.strokeStyle = o.workRacket ? PALETTE.work : PALETTE.activeSoft
      ctx.lineWidth = 2.2 * scale
      ctx.stroke()
      ctx.restore()
    }
  }

  // The ball. Not the racket arm's accent, because the whole point is that it is
  // a separate thing being tracked separately — and because a lime marker on a
  // yellow-green tennis ball is no marker at all. See PALETTE.ball.
  if (o.ball) {
    const toPoint = (p: { x: number; y: number }) => ({ x: ox + p.x * dw, y: oy + p.y * dh })
    // The path is already the fitted arc, evaluated at a fine, even step —
    // not raw per-frame detections — so it is drawn as one smooth stroke
    // rather than a dashed polyline. Older stretches of the arc sit closer to
    // slate, and the curve warms toward the accent as it nears the ball's
    // current moment, which reads as a single intentional flight rather than
    // a trail of dots.
    if (o.ball.path && o.ball.path.length > 1) {
      const pts = o.ball.path.map(toPoint)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      // One dark polyline under the whole flight before the graded segments go
      // down. Sky is the least predictable thing in the frame — a pale flight
      // path over an overcast one is the case this exists for — and doing it as
      // a single path keeps it to one extra stroke for the arc, not one each.
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
      ctx.strokeStyle = PALETTE.under
      ctx.lineWidth = 4.4 * scale
      ctx.stroke()
      // Graded in bands rather than a stroke per segment. The arc is evaluated
      // at a fine even step, so a per-segment gradient meant thirty-odd
      // `beginPath`/`stroke` pairs and thirty-odd freshly built `rgba(...)`
      // strings every repaint — on its own, about half the rasterising work of
      // the entire overlay, for one curve. The grade it produced was far finer
      // than anything visible: across the whole flight the alpha moves 0.16 to
      // 0.56 and the width by half a pixel, so eight steps of it look the same
      // and cost a quarter as much. Consecutive bands share their end point and
      // the joins are round, so the flight is still one continuous line.
      const [r0, g0, b0] = PALETTE.ballOld
      const [r1, g1, b1] = PALETTE.ballNew
      const segments = pts.length - 1
      const bands = Math.min(BALL_PATH_BANDS, segments)
      for (let band = 0; band < bands; band++) {
        const from = Math.round((band * segments) / bands)
        const to = Math.round(((band + 1) * segments) / bands)
        if (to <= from) continue
        // The mean of the ages the per-segment loop would have used here, so the
        // band sits where its segments' colours averaged out rather than at one
        // end of them.
        const age = (from + 1 + to) / 2 / segments
        const r = Math.round(r0 + (r1 - r0) * age)
        const g = Math.round(g0 + (g1 - g0) * age)
        const b = Math.round(b0 + (b1 - b0) * age)
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.16 + 0.4 * age})`
        ctx.lineWidth = (1.3 + 0.5 * age) * scale
        ctx.beginPath()
        ctx.moveTo(pts[from].x, pts[from].y)
        for (let i = from + 1; i <= to; i++) ctx.lineTo(pts[i].x, pts[i].y)
        ctx.stroke()
      }
    }
    const b = toPoint(o.ball)
    ctx.fillStyle = o.workBall ? PALETTE.work : PALETTE.ball
    ctx.strokeStyle = PALETTE.under
    ctx.lineWidth = 2.8 * scale
    ctx.beginPath()
    ctx.arc(b.x, b.y, 5.5 * scale, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }

  const nose = at(LM.nose)
  const shoulderSpan = Math.abs(at(LM.leftShoulder).x - at(LM.rightShoulder).x)
  const headR = Math.max(9 * scale, shoulderSpan * 0.42, 11)
  ctx.beginPath()
  ctx.arc(nose.x, nose.y - headR * 0.25, headR, 0, Math.PI * 2)
  ctx.strokeStyle = PALETTE.under
  ctx.lineWidth = 6.4 * scale
  ctx.stroke()
  ctx.strokeStyle = PALETTE.limb
  ctx.lineWidth = 3 * scale
  ctx.stroke()

  /*
   * The joint dots: all the ones sharing a colour in a single path, filled and
   * then ringed in the dark.
   *
   * The ring is not decoration — a white dot on a white sleeve is a hole in the
   * skeleton, and these mark the joints every angle in the report is read from.
   * `moveTo` before each arc keeps the discs as separate subpaths; without it
   * the path draws a line from one joint to the next on its way round.
   */
  ctx.strokeStyle = PALETTE.under
  ctx.lineWidth = 1.8 * scale
  ctx.fillStyle = PALETTE.limb
  const dotR = 3.2 * scale
  ctx.beginPath()
  for (const lm of [
    LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip,
    LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle,
    tossArm.elbow, tossArm.wrist,
  ]) {
    const p = at(lm)
    ctx.moveTo(p.x + dotR, p.y)
    ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2)
  }
  ctx.fill()
  ctx.stroke()

  ctx.lineWidth = 2.2 * scale
  ctx.fillStyle = PALETTE.active
  const armR = 4.6 * scale
  ctx.beginPath()
  for (const lm of [arm.elbow, arm.wrist]) {
    const p = at(lm)
    ctx.moveTo(p.x + armR, p.y)
    ctx.arc(p.x, p.y, armR, 0, Math.PI * 2)
  }
  ctx.fill()
  ctx.stroke()

  if (o.target?.length && o.targetOver) drawTarget(ctx, o.target, rect, aspect, scale)

  const annotation = o.annotation ? ANNOTATIONS[o.annotation] : undefined
  if (annotation) {
    const [ai, bi, ci] = annotation.joints(arm, tossArm)
    const deg = jointAngle(f.world[ai], f.world[bi], f.world[ci])
    // The knee measurement is stored as how far the leg is bent away from
    // straight, not as the angle at the joint, so it is translated in the same
    // units it was measured in — otherwise a deep load would read as straight.
    const value = annotation.metric === 'kneeBend' ? 180 - deg : deg
    // Only where the caller handed over a band for this measurement, which it
    // does only for one it measured and trusts. See `bands`.
    const band = o.bands?.[annotation.metric]
    drawAngle(
      ctx,
      at(ai),
      at(bi),
      at(ci),
      readoutOf(annotation.metric, value),
      annotation.label,
      scale * (o.calloutScale ?? 1),
      o.rect.dw,
      band && { metric: annotation.metric, value, band },
    )
  }
}

/**
 * Where a faulty segment should be, dashed (L4.4): a dark dashed edge, the
 * target ink dashed over it, and an open ring where the far joint belongs.
 * The dash is reset before returning, so nothing drawn after inherits it.
 */
function drawTarget(
  ctx: CanvasRenderingContext2D,
  segments: NonNullable<SkeletonOptions['target']>,
  rect: DrawRect,
  aspect: number,
  scale: number,
): void {
  const at = (p: { x: number; y: number }) => ({ x: rect.ox + (p.x / aspect) * rect.dw, y: rect.oy + p.y * rect.dh })
  ctx.save()
  ctx.lineCap = 'butt'
  ctx.setLineDash([7 * scale, 6 * scale])
  ctx.beginPath()
  for (const s of segments) {
    const a = at(s.a)
    const b = at(s.b)
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
  }
  ctx.strokeStyle = PALETTE.under
  ctx.lineWidth = 6.4 * scale
  ctx.stroke()
  ctx.strokeStyle = PALETTE.target
  ctx.lineWidth = 3 * scale
  ctx.stroke()
  ctx.setLineDash([])
  const r = 5 * scale
  ctx.beginPath()
  for (const s of segments) {
    const b = at(s.b)
    ctx.moveTo(b.x + r, b.y)
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2)
  }
  ctx.strokeStyle = PALETTE.under
  ctx.lineWidth = 4.4 * scale
  ctx.stroke()
  ctx.strokeStyle = PALETTE.target
  ctx.lineWidth = 2 * scale
  ctx.stroke()
  ctx.restore()
}

/* ------------------------------------------------------------------ callout */

type Pt = { x: number; y: number }

/**
 * A rounded rectangle as the context's *current* path, ready to be filled and
 * then stroked.
 *
 * Written out of `arcTo` rather than calling `ctx.roundRect`, which is recent
 * enough that a phone two iOS versions behind would throw mid-frame and take
 * the whole overlay with it — and the overlay is the app. It builds into the
 * current path instead of returning a `Path2D` so that nothing is allocated on
 * a frame: the caller fills and strokes the one path it built.
 */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.lineTo(x + w - rad, y)
  ctx.arcTo(x + w, y, x + w, y + rad, rad)
  ctx.lineTo(x + w, y + h - rad)
  ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad)
  ctx.lineTo(x + rad, y + h)
  ctx.arcTo(x, y + h, x, y + h - rad, rad)
  ctx.lineTo(x, y + rad)
  ctx.arcTo(x, y, x + rad, y, rad)
  ctx.closePath()
}

/**
 * The target pose: a band, a dashed body inside it, and the gap between the two
 * spelled out as a line from where the player was to where they should have been.
 *
 * Everything here is dashed and dim on purpose, and the dash is set inside this
 * function rather than by the caller. It is the only thing separating a target
 * from a measurement on a picture where both are white lines over the same body,
 * and a caller that forgot to set it would produce a second solid skeleton — two
 * bodies, equally confident, one of them fictional. It is also cleared before
 * returning, because this draws first and every tracked limb after it is solid.
 */
/**
 * Another of this player's serves, dashed under the one they are watching.
 *
 * SAME INK AS THE TARGET GHOST, AND THAT IS DELIBERATE. `PALETTE.ghost` exists
 * for "the same player somewhere they were not", which describes both. Dashed
 * and dim is the whole distinction from a tracked body, so both halves are set
 * here rather than trusted to a caller — the same rule `drawGhost` follows, for
 * the same reason.
 *
 * NOTHING BELOW THE HIPS ARRIVES, and this function does not decide that. A
 * landmark that is `null` is simply skipped, so a bone with either end missing
 * is not drawn and the picture ends at the hip line. The measured argument for
 * that lives in `poseTrack.ts` — removing the leg load entirely moves the worst
 * landmark 0.0387 against a 0.0341 noise floor, so legs drawn here would be
 * inviting a player to watch noise — and it is enforced in the data by
 * `pairTracks` rather than in this loop, which is why this only has to skip.
 *
 * NO ZONE, NO GAP LINE, NO LABEL. Those three belong to `drawGhost` because a
 * target is a claim about where a hand should have been, and this is not a claim
 * at all — it is the player's own body on another day. Drawing a leader from one
 * to the other would invent a direction the app has not earned.
 */
function drawPairedGhost(
  ctx: CanvasRenderingContext2D,
  image: readonly ({ x: number; y: number } | null)[],
  rect: DrawRect,
  aspect: number,
  scale: number,
): void {
  const { ox, oy, dw, dh } = rect
  const at = (p: { x: number; y: number }) => ({
    x: ox + (p.x / aspect) * dw,
    y: oy + p.y * dh,
  })

  ctx.setLineDash([6 * scale, 5 * scale])
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'round'

  const stroke = () => {
    ctx.strokeStyle = PALETTE.under
    ctx.lineWidth = 4.4 * scale
    ctx.stroke()
    ctx.strokeStyle = PALETTE.ghost
    ctx.lineWidth = 2 * scale
    ctx.stroke()
  }

  let drawn = 0
  ctx.beginPath()
  for (const [a, b] of GHOST_BONES) {
    const p = image[a]
    const q = image[b]
    if (!p || !q) continue
    const from = at(p)
    const to = at(q)
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    drawn++
  }
  // Nothing drawn is not a blank stroke — an empty path still costs two passes,
  // and a body with no bones is not a body a player should be shown at all.
  if (drawn) stroke()

  const nose = image[LM.nose]
  const left = image[LM.leftShoulder]
  const right = image[LM.rightShoulder]
  if (nose && left && right) {
    // Sized off the shoulder span exactly as the target ghost's head is, so two
    // dashed bodies on one screen could never be told apart by their heads.
    const head = at(nose)
    const span = Math.abs(at(left).x - at(right).x)
    const headR = Math.max(9 * scale, span * 0.42, 11)
    ctx.beginPath()
    ctx.arc(head.x, head.y - headR * 0.25, headR, 0, Math.PI * 2)
    stroke()
  }

  ctx.setLineDash([])
}

function drawGhost(
  ctx: CanvasRenderingContext2D,
  g: Ghost,
  rect: DrawRect,
  aspect: number,
  scale: number,
): void {
  const { ox, oy, dw, dh } = rect
  const at = (p: { x: number; y: number }) => ({
    x: ox + (p.x / aspect) * dw,
    y: oy + p.y * dh,
  })

  // The band, first and underneath. It is drawn as a zone and not a line because
  // the target *is* a range — `ideal` is a pair — and a single rule across the
  // picture would be claiming a precision the report does not have. A player who
  // lands anywhere in the shaded strip has done what was asked.
  const edges = [oy + g.zone.top * dh, oy + g.zone.bottom * dh]
  const bandTop = Math.min(edges[0], edges[1])
  const bandHeight = Math.abs(edges[1] - edges[0])
  ctx.fillStyle = PALETTE.ghostZone
  ctx.fillRect(ox, bandTop, dw, bandHeight)

  ctx.setLineDash([6 * scale, 5 * scale])
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'round'

  // Same two-stroke treatment as every tracked chain: one dark pass wide enough
  // to leave an edge showing, then the colour. Footage is not a backdrop, and a
  // dim white line has less to spare than a bright one, not more.
  const stroke = () => {
    ctx.strokeStyle = PALETTE.under
    ctx.lineWidth = 4.4 * scale
    ctx.stroke()
    ctx.strokeStyle = PALETTE.ghost
    ctx.lineWidth = 2 * scale
    ctx.stroke()
  }

  ctx.beginPath()
  for (const [a, b] of GHOST_BONES) {
    const p = at(g.image[a])
    const q = at(g.image[b])
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(q.x, q.y)
  }
  stroke()

  const nose = at(g.image[LM.nose])
  const span = Math.abs(at(g.image[LM.leftShoulder]).x - at(g.image[LM.rightShoulder]).x)
  const headR = Math.max(9 * scale, span * 0.42, 11)
  ctx.beginPath()
  ctx.arc(nose.x, nose.y - headR * 0.25, headR, 0, Math.PI * 2)
  stroke()

  /*
   * The gap itself, from the hand that was measured to the near edge of the
   * band — not to the dashed hand.
   *
   * This is the one thing the two poses cannot say on their own: overlaid, a
   * body and its target read as a double exposure until something names which
   * way the correction runs. It is also the only mark on this overlay carrying a
   * MAGNITUDE, which is why it does not end where the ghost's hand ends. The
   * ghost stands at the band's midpoint because that is the only placement whose
   * readout is the phrase on the plate; the player's actual shortfall is the
   * distance to the band's near edge, and on a serve missing by 3 cm the two
   * differ by seven and a half times. See `Ghost.reachY`.
   *
   * So the line stops at the edge of the shaded zone, where the correction
   * genuinely ends, and the dashed body above it is the caption's pose rather
   * than the size of anybody's miss.
   */
  const target = at(g.image[g.anchor])
  const measured = at(g.from)
  ctx.beginPath()
  ctx.moveTo(measured.x, measured.y)
  ctx.lineTo(target.x, oy + g.reachY * dh)
  stroke()

  ctx.setLineDash([])

  // The label sits on the same soft-cornered ink plate as the angle callout, so
  // a player reads the two as one voice. Its type is `limb` rather than the
  // accent: the accent is what a *measured* callout is set in, and the whole
  // point of this plate is that it is the only words on the picture describing
  // something that did not happen.
  const labelSize = 9.5 * scale
  const valueSize = 12.5 * scale
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `620 ${valueSize}px ${UI_FONT}`
  const valueW = ctx.measureText(g.label).width
  ctx.font = `500 ${labelSize}px ${UI_FONT}`
  const w = Math.max(valueW, ctx.measureText(GHOST_OVERLINE).width) + 22 * scale
  const h = 36 * scale

  // Pinned inside the picture on both axes. The target is by construction
  // further up the frame than the player, and at the top of the reach it is
  // close enough to the edge that a plate centred on it would hang half outside
  // the video — over the page, on a letterboxed clip.
  const lx = Math.min(Math.max(target.x, ox + w / 2 + 4 * scale), ox + dw - w / 2 - 4 * scale)
  const ly = Math.min(
    Math.max(target.y - headR - h * 0.9, oy + h / 2 + 4 * scale),
    oy + dh - h / 2 - 4 * scale,
  )

  roundRectPath(ctx, lx - w / 2, ly - h / 2, w, h, Math.min(9 * scale, h / 2))
  ctx.fillStyle = PALETTE.plate
  ctx.fill()

  ctx.font = `620 ${valueSize}px ${UI_FONT}`
  ctx.fillStyle = PALETTE.limb
  ctx.fillText(g.label, lx, ly - 5 * scale)
  ctx.font = `500 ${labelSize}px ${UI_FONT}`
  ctx.fillStyle = PALETTE.plateLabel
  ctx.fillText(GHOST_OVERLINE, lx, ly + 9 * scale)
}

/**
 * The overline on the ghost's plate, in the report's own words.
 *
 * Literally the string `FundamentalCard` prints above the same target phrase, so
 * the picture and the card are not two different ways of saying it. Upper-cased
 * once here rather than at the call site because it is also measured, and
 * measuring one casing while drawing another is how a plate comes out too narrow.
 */
const GHOST_OVERLINE = 'AIM FOR'

/**
 * An arc at the joint, a hairline out to a plate, and the position in words.
 *
 * The plate is anchored rather than floating: the leader line runs from the arc
 * to its edge, so on a frame with four things happening at once it is never
 * ambiguous which joint is being described. The phrase sets the plate's width, so
 * the type shrinks — down to a floor — rather than the plate growing past the
 * edge of the picture on a phone. The plate is soft-cornered ink: type set
 * straight onto footage is legible right up until the frame it is not.
 */
/**
 * The target band beside the reading, drawn as the body part it is about.
 *
 * IT IS NOT DRAWN AT THE JOINT, and that is the whole decision. The arc on the
 * body is a locator — its own doc comment says so — because it is drawn between
 * two limb directions in image space while the number beside it is `jointAngle`
 * of the *world* landmarks. Those are different quantities: the projection is
 * exactly what `geometry.ts` refuses to reason about for shoulder tilt, where a
 * real 20° reads as 60°+ side-on. Shading a band across that arc would turn a
 * pointer into a measurement, and a picture asserts far more than the sentence
 * beside it — the same reason the trophy ghost was withdrawn.
 *
 * So the band is drawn in the space the number lives in, off to one side, where
 * it claims nothing about the pixels behind it. WHAT CHANGED is what gets drawn
 * there. It used to be a 180° arc with the band shaded and the reading ticked —
 * an honest chart, and one nobody can put their body into. A player reading
 * "athletic load" beside an arc still has to convert a fraction of a sweep into
 * a knee. Now it is the limb itself: the two bones either side of the joint at
 * the angle that was measured, and the same pair dashed at the middle of the
 * band. Same footprint, same claim, same refusal to touch the body — and the
 * difference between the two figures is a leg bending, which is the thing the
 * card is asking for.
 *
 * `targetShape.ts` owns the construction and proves it re-measures to the
 * number on the plate. Anything it will not draw falls through to no diagram at
 * all rather than to an invented one.
 */
function drawShapeDial(
  ctx: CanvasRenderingContext2D,
  metric: string,
  cx: number,
  cy: number,
  half: number,
  value: number,
  band: [number, number],
  scale: number,
): void {
  const yours = figureOf(metric, value)
  const theirs = figureOf(metric, (band[0] + band[1]) / 2)
  if (!yours || !theirs) return

  /*
   * One fit across both figures, and both edges of the band.
   *
   * Scaled apart, a 20° bend and a 50° one each fill the box and come out
   * looking alike — which removes precisely the difference this exists to show.
   * The edges are in the fit too so that widening a band cannot resize the pair,
   * which is what keeps `drawing.test.ts`'s "the dial never claims the arc on
   * the body is the measurement" honest: the stroke count and the geometry of
   * the tracked body are both untouched by what the band says.
   */
  const box = boundsOf([yours, theirs, ...[band[0], band[1]]
    .map((v) => figureOf(metric, v))
    .filter((f): f is Figure => !!f)])
  const w = Math.max(1e-6, box.max.x - box.min.x)
  const h = Math.max(1e-6, box.max.y - box.min.y)
  const fit = Math.min((half * 2) / w, (half * 2) / h)
  const at = (p: { x: number; y: number }) => ({
    x: cx + (p.x - (box.min.x + box.max.x) / 2) * fit,
    y: cy + (p.y - (box.min.y + box.max.y) / 2) * fit,
  })

  const trace = (lines: { x: number; y: number }[][]) => {
    ctx.beginPath()
    for (const line of lines) {
      line.forEach((p, i) => {
        const q = at(p)
        if (i) ctx.lineTo(q.x, q.y)
        else ctx.moveTo(q.x, q.y)
      })
    }
  }

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Whatever does not move with the number, in the quietest ink and drawn once.
  if (theirs.reference.length) {
    ctx.setLineDash([])
    trace(theirs.reference)
    ctx.strokeStyle = PALETTE.under
    ctx.lineWidth = 3 * scale
    ctx.stroke()
    ctx.strokeStyle = PALETTE.ghostZone
    ctx.lineWidth = 1.2 * scale
    ctx.stroke()
  }

  // The target, underneath and dashed. Dashed and dim is the only thing
  // separating a target from a measurement here, exactly as in `drawGhost`, and
  // the dash is set and cleared inside this function for the same reason it is
  // there: a caller that forgot would draw two equally confident limbs, one of
  // them fictional.
  ctx.setLineDash([3.2 * scale, 2.6 * scale])
  trace(theirs.lines)
  ctx.strokeStyle = PALETTE.under
  ctx.lineWidth = 3.6 * scale
  ctx.stroke()
  ctx.strokeStyle = PALETTE.ghost
  ctx.lineWidth = 1.6 * scale
  ctx.stroke()
  ctx.setLineDash([])

  // What the player did, on top and solid, in the accent the callout beside it
  // is already set in.
  trace(yours.lines)
  ctx.strokeStyle = PALETTE.under
  ctx.lineWidth = 4.2 * scale
  ctx.stroke()
  ctx.strokeStyle = PALETTE.active
  ctx.lineWidth = 2 * scale
  ctx.stroke()

  // The joint the reading was taken at, so the figure has an anchor the eye can
  // find at filmstrip size.
  const dot = Math.max(1.4, 1.7 * scale)
  ctx.beginPath()
  for (const p of yours.joints) {
    const q = at(p)
    ctx.moveTo(q.x + dot, q.y)
    ctx.arc(q.x, q.y, dot, 0, Math.PI * 2)
  }
  ctx.fillStyle = PALETTE.active
  ctx.fill()
  ctx.strokeStyle = PALETTE.under
  ctx.lineWidth = 1.2 * scale
  ctx.stroke()
}

function drawAngle(
  ctx: CanvasRenderingContext2D,
  a: Pt,
  b: Pt,
  c: Pt,
  value: string,
  label: string,
  scale: number,
  maxWidth: number,
  /**
   * The measured value and the band it is judged against, in the metric's own
   * units — or nothing, which draws no dial at all.
   *
   * Absent for every measurement the caller does not trust. That gate lives at
   * the caller because that is where confidence lives, and it is the same rule
   * the ghost follows: nothing below `SOFT_MEASUREMENT` gets a picture, because
   * a hedge in the copy cannot catch up with a diagram somebody has already
   * believed.
   */
  judged?: { metric: string; value: number; band: [number, number] },
) {
  const a1 = Math.atan2(a.y - b.y, a.x - b.x)
  const a2 = Math.atan2(c.y - b.y, c.x - b.x)
  const radius = 26 * scale

  let delta = a2 - a1
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2

  ctx.beginPath()
  ctx.arc(b.x, b.y, radius, a1, a1 + delta, delta < 0)
  ctx.strokeStyle = PALETTE.under
  ctx.lineWidth = 5.8 * scale
  ctx.stroke()
  ctx.strokeStyle = PALETTE.active
  ctx.lineWidth = 2.4 * scale
  ctx.stroke()

  const mid = a1 + delta / 2
  const lead = radius + 34 * scale
  const lx = b.x + Math.cos(mid) * lead
  const ly = b.y + Math.sin(mid) * lead

  // A body position needs more room than three digits did, so the type gives
  // way before the plate does. The floor keeps it legible on a filmstrip still.
  const cap = Math.max(90 * scale, Math.min(maxWidth * 0.52, 260 * scale))
  const measure = (px: number) => {
    ctx.font = `620 ${px}px ${UI_FONT}`
    return ctx.measureText(value).width
  }
  const size = fittedSize(value, cap, scale, measure)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const valueW = measure(size)
  // The overline is measured in the font it is actually set in. It used to be
  // measured in the value's font and scaled by a guess, which is close enough
  // right up until a long position name arrives — and a plate that comes out too
  // narrow puts the label back on bare video.
  const labelSize = 9.5 * scale
  ctx.font = `500 ${labelSize}px ${UI_FONT}`
  // The figure sits inside the plate, so the plate has to grow by exactly its
  // width plus its gap — computed here rather than guessed, or a long body
  // position and a limb end up sharing the same pixels.
  //
  // Half again the radius of the arc it replaces. An arc reads at any size
  // because it is one curve against a track; two bones at forty degrees to two
  // other bones is a comparison, and a comparison needs room. Measured on the
  // rig through `drawing.test.ts`: at the arc's old radius, a target a full
  // forty degrees from the reading separated from it by about five pixels.
  const dialR = 15 * scale
  const dialGap = judged ? dialR * 2 + 10 * scale : 0
  const w = Math.max(valueW, ctx.measureText(label.toUpperCase()).width) + 22 * scale + dialGap
  const h = 38 * scale

  // Hairline from the arc to the plate, so the words stay attached to the joint.
  ctx.beginPath()
  ctx.moveTo(b.x + Math.cos(mid) * radius, b.y + Math.sin(mid) * radius)
  ctx.lineTo(lx - Math.cos(mid) * (w / 2), ly - Math.sin(mid) * (h / 2))
  ctx.strokeStyle = PALETTE.under
  ctx.lineWidth = Math.max(2.4, 3.6 * scale)
  ctx.stroke()
  ctx.strokeStyle = PALETTE.leader
  ctx.lineWidth = Math.max(0.6, 1 * scale)
  ctx.stroke()

  // A soft-cornered ink plate, the same near-black the app's cards sit on. One
  // path, built once and filled: a Path2D would allocate on every frame the
  // playhead is parked on a keyframe.
  roundRectPath(ctx, lx - w / 2, ly - h / 2, w, h, Math.min(9 * scale, h / 2))
  ctx.fillStyle = PALETTE.plate
  ctx.fill()

  // Text shifts right by half the dial's footprint so the pair stays centred in
  // the plate they now share.
  const textX = lx + dialGap / 2

  ctx.font = `620 ${size}px ${UI_FONT}`
  ctx.fillStyle = PALETTE.active
  ctx.fillText(value, textX, ly - 6 * scale)
  ctx.font = `500 ${labelSize}px ${UI_FONT}`
  ctx.fillStyle = PALETTE.plateLabel
  ctx.fillText(label.toUpperCase(), textX, ly + 9 * scale)

  if (judged) {
    drawShapeDial(
      ctx,
      judged.metric,
      lx - w / 2 + 11 * scale + dialR,
      ly,
      dialR,
      judged.value,
      judged.band,
      scale,
    )
  }
}

/**
 * The largest type size at which the phrase still fits the card, remembered.
 *
 * The search is a dozen `measureText` calls, and this runs inside the animation
 * loop — every frame the playhead sits on a keyframe, at sixty frames a second,
 * for a string that changes a handful of times in a whole report. The cache is
 * keyed on everything the answer depends on and capped, so a long session
 * cannot grow it without bound: it holds a few dozen entries and then recycles.
 */
const FIT_CACHE = new Map<string, number>()
const FIT_CACHE_MAX = 128

function fittedSize(
  value: string,
  cap: number,
  scale: number,
  measure: (px: number) => number,
): number {
  // Rounded into the key so sub-pixel jitter in the canvas size — a device
  // pixel ratio that is not a whole number — does not miss every single time.
  const key = `${value}|${Math.round(cap)}|${Math.round(scale * 20)}`
  const hit = FIT_CACHE.get(key)
  if (hit !== undefined) return hit

  let size = 14 * scale
  while (size > 8.5 * scale && measure(size) + 22 * scale > cap) size -= 0.5 * scale

  if (FIT_CACHE.size >= FIT_CACHE_MAX) FIT_CACHE.clear()
  FIT_CACHE.set(key, size)
  return size
}
