/**
 * The contact instant, from every cue the clip offers, and how far they agree.
 *
 * Contact has always been the racket hand at its highest (`phases.ts`). That is
 * a good stand-in and a fragile one: the wrist is the landmark the pose model
 * tracks worst at that instant (`kalman.ts`), and every contact-frame reading,
 * every timing band and the ball's `contactBelowPeak` hang off that one index
 * (`ANALYSIS-REVIEW.md` F7). The tracked ball is a second witness. Until impact
 * it is on its arc; after it, it is not. So the last moment it was still on
 * its arc says when the racket met it, to within a sample, independently of
 * where the pose model put the hand.
 *
 * Two things this does not do, on purpose:
 *
 * It does not average the two. On real serves the wrist peaks 5–45 ms before
 * the racket head's highest point (`mocap.test.ts`), so the ball's moment sits
 * after the wrist's on a well-read clip, and every band in the engine is
 * defined on the wrist's. Averaging would move every contact reading by a
 * share of a lag nothing graded is calibrated for. The wrist keeps deciding
 * unless it is grossly late.
 *
 * And the racket box does not vote. It is EfficientDet-Lite0 at 256 px on a
 * blurred racket, drawn and never tested against footage (F7, `racket.ts`);
 * a third witness nobody has checked is not a witness.
 *
 * What the ball does instead is twofold. When the wrist's "peak" comes well
 * after the ball had already left its arc, the wrist was tracked late — it can
 * only be late, the ball cannot meet a racket that has not arrived — and the
 * earliest cue decides, as the review asked. And when the two disagree by more
 * than a real serve's lag explains, every reading taken at contact is hedged
 * rather than one cue being picked silently.
 */
import type { BallFlight } from '../vision/ballTrack'
import { flightHeightAt } from '../vision/ballTrack'
import { clamp, median, sided } from './geometry'
import { detectServe, type Skeleton } from './phases'
import type { Frame } from './types'

/** The same floor `findBall` keeps a flight at. Below it there is no ball to ask. */
const BALL_TRUSTED = 0.45

/**
 * How far the ball may sit after the wrist and still agree with it, seconds.
 *
 * The wrist peaks 5–45 ms before the racket head reaches its highest on the
 * Bath serves, and the head's highest is the nearest stand-in for impact the
 * capture has. Fifteen milliseconds over that for the half-sample the ball's
 * moment is read to.
 */
export const CONTACT_LAG_MAX = 0.06

/**
 * How far before the wrist the ball must have left its arc for the wrist to be
 * overruled, seconds — and never less than two samples.
 *
 * Generous because the ball stopping being found is not always the ball being
 * hit: a missed detection on the last frame or two before impact reads as an
 * early break. Two samples of that is ordinary; a tenth of a second is a wrist
 * peak after the hit, which is a tracking fault and nothing else.
 */
export const WRIST_LATE = 0.1

/**
 * How high above the racket hand the ball may be when it is struck, in body
 * heights. The racket head sits 0.26 statures above the wrist at impact on the
 * Bath serves; this allows for a bent arm and a long racket. A ball last seen
 * higher than this had not come down to the racket yet, so it was lost rather
 * than hit, and says nothing about contact.
 */
const REACH_ABOVE_HAND = 0.45

export interface ContactRead {
  /** The moment taken as contact, seconds on the serve's clock. */
  t: number
  /** Which cue decided it. */
  from: 'wrist' | 'ball'
  /** The racket hand at its highest, as `phases.ts` found it. */
  wrist: number
  /**
   * When the ball left its arc: half a sample after the last moment it was
   * still on it. Absent without a trusted ball, or when the ball was last seen
   * out of the racket's reach.
   */
  ball?: number
  /** Ball minus wrist, milliseconds, when both exist. */
  spreadMs?: number
  /**
   * 0.5–1: how far the cues agree, applied to every reading taken at contact.
   * One with a single cue — a lone witness is not a disagreement.
   */
  agreement: number
}

/**
 * Read the contact instant from the wrist and, when there is one, the ball.
 *
 * `ball` must be on the same clock as `frames` — the serve's, `retimeFlight`.
 */
export function readContact(frames: Frame[], skel: Skeleton, ball?: BallFlight): ContactRead {
  const wrist = skel.times.contact
  const lone: ContactRead = { t: wrist, from: 'wrist', wrist, agreement: 1 }
  if (!ball || ball.confidence < BALL_TRUSTED || ball.samples.length < 3) return lone

  const k = skel.keys.contact
  const lo = clamp(k - 3, 0, frames.length - 1)
  const hi = clamp(k + 3, 0, frames.length - 1)
  const steps: number[] = []
  for (let i = lo + 1; i <= hi; i++) steps.push(frames[i].t - frames[i - 1].t)
  const step = steps.length ? median(steps) : 1 / 30

  const lastOnArc = Math.max(...ball.samples.map((s) => s.t))
  const ballT = lastOnArc + step / 2

  // Within reach of the racket when it was last seen: below its own apex's
  // height is not required (a ball can be struck on the rise), but it has to
  // be over the hand and no further above it than a racket reaches.
  const hand = frames[k]?.image[sided(skel.racket).wrist]
  if (!hand) return lone
  const above = (hand.y - flightHeightAt(ball, lastOnArc)) / skel.bodyHeight
  if (above < 0 || above > REACH_ABOVE_HAND) return lone

  const spread = ballT - wrist
  const late = Math.max(WRIST_LATE, 2 * step)
  const from: ContactRead['from'] = spread < -late ? 'ball' : 'wrist'

  // How far outside a real serve's lag the two sit. The ball a sample early is
  // a missed detection, not a disagreement; past the lag the ball after the
  // wrist means the wrist peaked early or the ball was followed past impact.
  const outside = Math.max(0, -step - spread, spread - CONTACT_LAG_MAX)
  const agreement = clamp(1 - outside / 0.2, 0.5, 1)

  return {
    t: from === 'ball' ? ballT : wrist,
    from,
    wrist,
    ball: ballT,
    spreadMs: Math.round(spread * 1000),
    agreement: Math.round(agreement * 100) / 100,
  }
}

/**
 * The serve's keyframes with contact read from every cue: `detectServe`, then
 * again with contact bounded when the ball overrules the wrist.
 *
 * Every keyframe after the first is searched from contact, so a contact that
 * moves has to be found again rather than patched. The second read is asked
 * the same way as the first — the hand forced only if it was — so a guessed
 * hand stays a guess. Its contact sample is the last one at or before the
 * ball's moment, and its time is the ball's own.
 */
export function detectWithContact(
  frames: Frame[],
  fps: number,
  hand: Skeleton['racket'] | undefined,
  ball: BallFlight | undefined,
  first: Skeleton = detectServe(frames, fps, hand),
): { skel: Skeleton; contact: ContactRead } {
  const contact = readContact(frames, first, ball)
  if (contact.from !== 'ball') return { skel: first, contact }
  try {
    const again = detectServe(frames, fps, hand, { contactBy: contact.t })
    return { skel: { ...again, times: { ...again.times, contact: contact.t } }, contact }
  } catch {
    // No serve before the ball's moment — the ball's own arc must have been
    // wrong about it. The hand stands, and the disagreement still hedges.
    return { skel: first, contact: { ...contact, t: contact.wrist, from: 'wrist' } }
  }
}
