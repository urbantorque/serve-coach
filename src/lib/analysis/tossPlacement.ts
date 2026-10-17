/**
 * Where the toss went, measured from the front foot (D3.1).
 *
 * The reading a club player most needs and a camera can give honestly: the
 * top of the toss against the front ankle, in body heights. From the side the
 * picture's horizontal is the court's length, so it reads how far in front;
 * from behind it is the court's width, so it reads how far to the hitting side.
 * From a corner the two are mixed in one number and neither is read.
 *
 * FROM THE BALL WHEN THERE IS ONE, FROM THE HAND WHEN NOT. The ball's apex is
 * the quantity. Without it, the tossing hand's position at release is where a
 * vertical toss goes — and a toss is never quite vertical, so that answer is
 * hedged and says which it is.
 *
 * MEASURED AND NOT GRADED. The published distances are for contact rather than
 * the toss's top — flat serves struck 0.30–0.37 statures in front of the front
 * foot and kick serves 0.23–0.24 (Connolly 2021), 56 against 51 cm in
 * professional men (Vacek 2023) — and the ball barely moves forward as it falls,
 * so they are the band this reading is waiting for (D2.1). Until then it is data,
 * declared in `UNCALIBRATED`, and the base for the toss map (D6.3).
 */
import type { BallFlight } from '../vision/ballTrack'
import { sided } from './geometry'
import type { Skeleton } from './phases'
import type { Frame } from './types'

export interface TossPlacement {
  /** Body heights in front of the front ankle, towards the net. From the side only. */
  ahead?: number
  /** Body heights from the front ankle towards the hitting side. From behind or in front only. */
  across?: number
  /** The ball's apex, or the hand's release standing in for it. */
  from: 'ball' | 'hand'
  confidence: number
}

/**
 * Where a toss should peak, for the toss map's target band (L4.7), in statures
 * from the front ankle — the reading's own units.
 *
 * RE-DERIVED ON REAL MOTION (D2.1), NOT CITED. The published distances are
 * for contact and measured from the toe (`contactAhead`'s source: 0.28–0.37
 * of height for flat serves), and this is the top of the toss from the ankle,
 * read from the tossing hand wherever no ball was tracked — which is every
 * Bath serve, so the band has to hold what a hand-read real serve does. Each
 * band holds all six Bath serves at 30 and 60 fps and holds the rig's toss,
 * dialled off line, outside it (`tossTarget.test.ts`). A ball-read toss
 * sits a little further on than the hand that let it go; the rig's clean
 * ball reads inside both.
 *
 * For the picture only. Nothing is named from it: the reading stays in
 * `UNCALIBRATED` until a band for the toss itself is published.
 */
export const TOSS_TARGET: Record<'ahead' | 'across', { band: [number, number]; source: { motion: string } }> = {
  ahead: {
    band: [0, 0.3],
    source: {
      motion:
        'Bath serves from the side read 0.04 to 0.16 from the hand; the rig toss 0.2 m behind reads -0.12 and 0.9 m in front 0.52',
    },
  },
  across: {
    band: [-0.075, 0.15],
    source: {
      motion:
        'Bath serves from behind and in front read -0.004 to 0.072 from the hand; the rig toss 0.2 m to the tossing side reads -0.14 and 0.4 m to the hitting side 0.20',
    },
  },
}

/** A hand-only reading is worth this much of a ball one. */
const HAND_ONLY = 0.5

/** Too little swing across the picture to say which way the net is. */
const MIN_SWEEP = 0.03

export function readTossPlacement(
  frames: Frame[],
  skel: Pick<Skeleton, 'keys' | 'bodyHeight' | 'racket' | 'toss'>,
  view: 'side' | 'front-back' | 'angled',
  ball?: BallFlight,
  /** Frame width over height, to put a ball's width-normalised x in landmark units. */
  aspect = 1,
): TossPlacement | undefined {
  if (view === 'angled') return undefined
  const { keys, bodyHeight } = skel
  const R = sided(skel.racket)
  const T = sided(skel.toss)
  const ready = frames[keys.ready]
  const front = ready?.image[T.ankle]
  if (!front || (front.visibility ?? 0) < 0.5) return undefined

  const fromBall = ball !== undefined && ball.confidence >= 0.45
  const released = frames[keys.toss]?.image[T.wrist]
  if (!fromBall && !released) return undefined
  const x = fromBall ? ball.apex.x * aspect : released.x
  const offset = (x - front.x) / bodyHeight
  const confidence = Math.round((fromBall ? ball.confidence : HAND_ONLY) * 100) / 100
  const from: TossPlacement['from'] = fromBall ? 'ball' : 'hand'

  if (view === 'side') {
    // Which way the net is: the racket hand travels towards it from the drop
    // to contact.
    const sweep = frames[keys.contact].image[R.wrist].x - frames[keys.drop].image[R.wrist].x
    if (Math.abs(sweep) / bodyHeight < MIN_SWEEP) return undefined
    return { ahead: round(offset * Math.sign(sweep)), from, confidence }
  }
  // From behind or in front: which way is the hitting side, from the shoulders.
  const side = ready.image[R.shoulder].x - ready.image[T.shoulder].x
  if (Math.abs(side) / bodyHeight < MIN_SWEEP) return undefined
  return { across: round(offset * Math.sign(side)), from, confidence }
}

const round = (v: number) => Math.round(v * 1000) / 1000
