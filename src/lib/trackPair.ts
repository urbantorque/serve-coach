/**
 * May these two saved serves be drawn on top of each other, and where does the
 * older one go.
 *
 * WHY THIS IS A MODULE AND NOT A COMPONENT. `poseTrack.ts`'s own header already
 * worked out what it would take to draw two stored tracks together, and every
 * number in it came off the rig. This is that derivation as code, with nothing
 * about canvases in it, because the expensive half of a ghost is the decision to
 * show one at all — and a decision taken inside a draw call is a decision nobody
 * can test.
 *
 * THE TRANSFORM, AND WHY IT IS TAKEN ONCE RATHER THAN PER FRAME. A track is
 * levelled image space, so how far away the phone stood and where in the frame
 * the player stood ride along with the body. Translating to the hip centre and
 * scaling by shoulder-to-ankle removes both: measured on the rig, a ±15% zoom
 * goes from 0.083 body heights to 0.0009, and a pan of 0.08 of the frame to
 * exactly zero.
 *
 * It is taken at contact and then held for the whole swing. Re-deriving it every
 * frame would subtract the body's own motion along with the camera's — the hip
 * centre rising between the trophy and contact *is* the leg drive, and a ghost
 * that normalised it away would show two serves agreeing about the one thing
 * they might really differ on.
 *
 * WHAT IT CANNOT REMOVE. Camera angle, because that is a projection change
 * rather than a similarity transform: about 0.0072 body heights per degree of
 * yaw difference, dead linear from 5° to 25°. Two noise realisations of one
 * identical serve sit 0.0341 apart, and five degrees of camera costs 0.0352 —
 * the same thing. Past five the camera starts adding more than the tracker
 * already does, which is where `GHOST_YAW_TOLERANCE_DEG` comes from and why it
 * is not a taste.
 *
 * AND WHY NOTHING BELOW THE HIPS COMES BACK. Removing the leg load entirely —
 * trophy knee from 133° to 166°, no load at all — moves the worst drawn landmark
 * 0.0387 against that 0.0341 floor. A player told to watch their legs against a
 * ghost would be watching noise, so the legs are not returned at all rather than
 * returned with a warning attached. The ankles are still *read*, for the scale:
 * a shoulder-to-ankle length is a measurement, and a drawn foot is a claim about
 * where it was.
 */
import { LM, dist2d, midpoint } from './analysis/geometry'
import { VISIBLE_FLOOR } from './analysis/groundTruth'
import type { Analysis, Landmark } from './analysis/types'
import { scoringVersionOf, typeOf } from './progress'
import { replayFrom, trackFrameAt, type SwingTrack } from './storage/poseTrack'

/**
 * Degrees of camera difference past which two serves stop being comparable.
 *
 * Five, because that is where the camera's contribution overtakes the tracker's
 * own — see the header. Not a slider: raising it does not admit more clips, it
 * admits clips whose difference is the phone.
 */
export const GHOST_YAW_TOLERANCE_DEG = 5

/**
 * Why a pair was refused, as an enum.
 *
 * No sentence, for the reason `diagnose.ts` composes none: a screen wants to say
 * something different about a camera that moved than about a report too old to
 * carry a track, and a string decided here would be the same words in both
 * places or a second copy of the copy rules.
 */
export type PairRefusal =
  /** One of the two kept no swing worth replaying — pruned, or older than tracks. */
  | 'no_track'
  /** One camera angle is the 45 that stands in for a reading nobody could take. */
  | 'yaw_unmeasured'
  /** Both angles were measured and they differ by more than the tolerance. */
  | 'camera_moved'
  /** The two were scored against different rubrics, so nothing crosses. */
  | 'rubric_changed'
  /** A flat serve and a kick are different motions, not two goes at one. */
  | 'serve_type_changed'
  /** Contact itself was never tracked on one of them, so there is nothing to align on. */
  | 'no_contact'
  /** Hips, shoulders or ankles were not visible at contact, so there is no transform. */
  | 'no_scale'

/** One instant of the older serve, ready to draw over the newer one. */
export interface PairedSample {
  /**
   * Seconds before (negative) or after contact.
   *
   * Relative to contact rather than to the start of the clip, because the start
   * of a clip is whenever somebody pressed record and contact is the one instant
   * both serves genuinely share.
   */
  fromContact: number
  /**
   * The older body in the newer serve's normalised image space, indexed exactly
   * as `Frame.image`, with `null` for every landmark below the hips.
   *
   * Full length and holed rather than short, so a caller indexing by `LM.*` gets
   * the landmark it asked for or nothing — a compacted array would put the wrong
   * joint under every name.
   */
  image: ({ x: number; y: number } | null)[]
}

export interface TrackPair {
  /** The older swing, in time order, contact at zero. */
  samples: PairedSample[]
  /** Seconds from the start of the newer serve's replay to its contact. */
  contactAt: number
  /** Degrees between the two cameras — never more than `GHOST_YAW_TOLERANCE_DEG`. */
  yawGap: number
}

export type PairResult = { ok: true; pair: TrackPair } | { ok: false; refusal: PairRefusal }

/**
 * What a stored serve has to carry to be one half of a pair.
 *
 * Structural rather than `Session`, so this module does not depend on the
 * database to answer a question about geometry — and so a live `Analysis`, which
 * has all five fields, can be paired against a saved one without being stored
 * first.
 */
export type Pairable = Pick<
  Analysis,
  'track' | 'phases' | 'serveType' | 'scoringVersion' | 'triage'
>

/** Landmarks that are read but never returned — see the header. */
const LEGS: ReadonlySet<number> = new Set<number>([
  LM.leftKnee,
  LM.rightKnee,
  LM.leftAnkle,
  LM.rightAnkle,
  LM.leftHeel,
  LM.rightHeel,
  LM.leftToe,
  LM.rightToe,
])

/** The six the transform is built from. All must be visible at contact. */
const BASIS = [
  LM.leftShoulder,
  LM.rightShoulder,
  LM.leftHip,
  LM.rightHip,
  LM.leftAnkle,
  LM.rightAnkle,
]

/**
 * The similarity transform one serve is measured in.
 *
 * `aspect` is folded in here rather than left to the caller: a track stores x
 * normalised to frame width, so two clips filmed in different orientations
 * disagree about what an x of 0.1 is worth. Everything below works in width-over-
 * height units, where a distance is a distance.
 */
interface Basis {
  hip: { x: number; y: number }
  /** Shoulder-to-ankle, in the same units. Positive by construction. */
  scale: number
  aspect: number
}

/**
 * A stored landmark in units where x and y are the same length.
 *
 * Stays a `Landmark` rather than becoming a bare point so `midpoint` and
 * `dist2d` can be the ones already in `geometry.ts`. A second midpoint written
 * beside a transform is how a pivot drifts.
 */
const flat = (lm: Landmark, aspect: number): Landmark => ({
  x: lm.x * aspect,
  y: lm.y,
  z: 0,
  visibility: lm.visibility,
})

function basisAt(track: SwingTrack, row: number): Basis | undefined {
  const frame = trackFrameAt(track, row)
  if (!frame) return undefined
  for (const i of BASIS) {
    if ((frame.image[i]?.visibility ?? 0) <= VISIBLE_FLOOR) return undefined
  }

  const a = track.aspect
  const hip = midpoint(flat(frame.image[LM.leftHip], a), flat(frame.image[LM.rightHip], a))
  const shoulder = midpoint(
    flat(frame.image[LM.leftShoulder], a),
    flat(frame.image[LM.rightShoulder], a),
  )
  const ankle = midpoint(flat(frame.image[LM.leftAnkle], a), flat(frame.image[LM.rightAnkle], a))

  const scale = dist2d(shoulder, ankle)
  return scale > 0 ? { hip, scale, aspect: a } : undefined
}

/** The row a phase sits at, in this track's own row space. */
function rowOfContact(s: Pairable): number | undefined {
  const contact = s.phases?.find((p) => p.id === 'contact')
  if (!contact || !s.track) return undefined
  const row = contact.frame - s.track.from
  return row >= 0 && row < s.track.rows.length ? row : undefined
}

/**
 * Decide whether two saved serves may be drawn together, and align them.
 *
 * `newer` is the serve on screen and `older` is the one being drawn underneath
 * it; the result is in `newer`'s coordinates, so a caller draws the ghost with
 * the same transform it already draws the live body with.
 *
 * Every refusal below is silent by design. This is an extra picture on a report
 * that is complete without one, and a screen explaining at length why it will
 * not show a comparison the player never asked for is worse than one that simply
 * does not offer it.
 */
export function pairTracks(newer: Pairable, older: Pairable): PairResult {
  if (typeOf(newer) !== typeOf(older)) return { ok: false, refusal: 'serve_type_changed' }
  if (scoringVersionOf(newer) !== scoringVersionOf(older)) {
    return { ok: false, refusal: 'rubric_changed' }
  }
  if (!newer.track || !older.track) return { ok: false, refusal: 'no_track' }

  /*
   * `yaw_measured` first, and it is the whole reason that field exists: an angle
   * nobody could read comes back as 45, and 45 is also a real corner-on reading,
   * so two clips that both failed to measure would differ by 0° and sail through
   * the gate below — the confident nonsense arriving through the guard written to
   * stop it (R49·1).
   *
   * `Number.isFinite` beside it because `triage.quality` has no stored-shape
   * guard yet (R65): a row written before the block, or corrupted in place, can
   * arrive claiming `yaw_measured` with no number behind it. Without this the gap
   * is `NaN`, which fails the comparison and refuses as `camera_moved` — the
   * right outcome under the wrong name, and a wrong name is what a later reader
   * trusts.
   */
  const qn = newer.triage?.quality
  const qo = older.triage?.quality
  if (!qn?.yaw_measured || !qo?.yaw_measured) return { ok: false, refusal: 'yaw_unmeasured' }
  if (!Number.isFinite(qn.yaw_deg) || !Number.isFinite(qo.yaw_deg)) {
    return { ok: false, refusal: 'yaw_unmeasured' }
  }

  const yawGap = Math.abs(qn.yaw_deg - qo.yaw_deg)
  if (!(yawGap <= GHOST_YAW_TOLERANCE_DEG)) return { ok: false, refusal: 'camera_moved' }

  const contactNewer = rowOfContact(newer)
  const contactOlder = rowOfContact(older)
  if (contactNewer === undefined || contactOlder === undefined) {
    return { ok: false, refusal: 'no_contact' }
  }

  const to = basisAt(newer.track, contactNewer)
  const from = basisAt(older.track, contactOlder)
  if (!to || !from) return { ok: false, refusal: 'no_scale' }

  const replayNewer = replayFrom(newer.track)
  const replayOlder = replayFrom(older.track)
  if (!replayNewer || !replayOlder) return { ok: false, refusal: 'no_track' }

  const contactAt = replayNewer.samples.find((s) => s.row === contactNewer)?.at
  if (contactAt === undefined) return { ok: false, refusal: 'no_contact' }

  /*
   * The older serve's own clock, zeroed at contact. `replayFrom` has already
   * decided whether the stored times can be trusted and fallen back to a cadence
   * if not, so this reads its `at` rather than the raw `times` — two readers of
   * the same track disagreeing about how fast it happened is exactly the kind of
   * drift a second copy of that decision would produce.
   */
  const zero = replayOlder.samples.find((s) => s.row === contactOlder)?.at
  if (zero === undefined) return { ok: false, refusal: 'no_contact' }

  const k = to.scale / from.scale
  const samples: PairedSample[] = []
  for (const s of replayOlder.samples) {
    const frame = trackFrameAt(older.track, s.row)
    if (!frame) continue
    const image = frame.image.map((lm, i) => {
      if (LEGS.has(i)) return null
      const p = flat(lm, from.aspect)
      return {
        x: (to.hip.x + (p.x - from.hip.x) * k) / to.aspect,
        y: to.hip.y + (p.y - from.hip.y) * k,
      }
    })
    samples.push({ fromContact: Math.round((s.at - zero) * 1000) / 1000, image })
  }

  return { ok: true, pair: { samples, contactAt, yawGap } }
}
