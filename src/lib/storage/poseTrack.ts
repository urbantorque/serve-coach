/**
 * The six keyframes kept as a body rather than as six photographs.
 *
 * A stored report keeps base64 JPEGs of its keyframes, and the prune ladder
 * strips them past `KEEP_STILLS` because they are nearly all of a row's weight.
 * The consequence is on screen: open a report from two months ago and the
 * filmstrip is six grey rectangles. The numbers survived and the pictures did
 * not, so the one thing a player wanted to look back at is the one thing gone.
 *
 * WHY THIS IS AFFORDABLE WHEN THE PICTURES ARE NOT. A keyframe still is 4–8 kB
 * of base64; six of them are 24–48 kB. Six poses at the precision below are
 * about 1.5 kB — fifteen to thirty times cheaper — because a body is 33 points
 * and a photograph is a hundred thousand pixels of court, sky and fence that
 * nothing ever reads. `footprint.test.ts` measures both.
 *
 * AND NOW THE WHOLE SWING, WHICH IS THE SAME ROWS. `swingTrack` below stores
 * every frame between `ready` and `finish` in exactly this encoding, so the six
 * keyframes are rows of it rather than a second copy — `keyframesFromTrack`
 * lifts them out byte for byte, which is what lets a report carry one or the
 * other and never both. 21.3 kB against 2.7, and against 24–48 kB of
 * photographs. What it buys that six poses cannot is motion: a saved serve has
 * no video left, so a track is the only way an old report replays rather than
 * merely illustrating itself.
 *
 * THREE DECIMALS, AND IT IS A MEASUREMENT. Landmarks are normalised to the
 * frame, so the rounding step is a thousandth of the frame — at most half a
 * pixel at 1080p, against five pixels and a visibly wrong elbow at two decimals.
 * Pinned in `footprint.test.ts` rather than argued here.
 *
 * NOT A PHOTOGRAPH, AND THE DIFFERENCE IS THE POINT. This is what the tracker
 * saw, not what the camera did. It cannot show a player their grip, their face,
 * the light or the fence behind them, and it never becomes a still that could be
 * mistaken for one. It is also, for the same reason, the only part of a report
 * that carries no image of anybody — which is a privacy property worth having on
 * the thing that outlives the pictures.
 */
import type { Analysis, Frame, Landmark, Phase } from '../analysis/types'

/** Decimals kept for a normalised landmark coordinate. */
export const POSE_PRECISION = 3
/** Decimals kept for visibility, which only ever gates drawing. */
const VISIBILITY_PRECISION = 2
/** Values per landmark in a row: x, y, visibility. */
const STRIDE = 3

export interface KeyframePoses {
  /**
   * Video width ÷ height, carried because `drawSkeleton` pre-multiplies image x
   * by it and a stored report has no video left to ask.
   */
  aspect: number
  /**
   * One row per phase, in the report's own `phases` order, or `null` for a phase
   * whose frame was not available. Flat rather than objects: the keys are two
   * thirds of the bytes in the object form, and nothing reads a row except the
   * function below.
   */
  rows: (number[] | null)[]
}

const round = (v: number, p: number) => Math.round(v * 10 ** p) / 10 ** p

/**
 * Encode the pose at each keyframe.
 *
 * Takes the phases rather than raw indices so the rows line up with the array
 * the report renders, position for position — a row that meant a different
 * keyframe from the caption beside it would be worse than a grey rectangle.
 *
 * `undefined` when nothing could be encoded at all, so a caller stores no field
 * rather than an empty one.
 */
export function keyframePoses(
  frames: readonly Frame[],
  phases: readonly Pick<Phase, 'frame'>[],
  aspect: number,
): KeyframePoses | undefined {
  if (!frames.length || !phases.length || !(aspect > 0)) return undefined

  let any = false
  const rows = phases.map((p) => {
    const f = frames[p.frame]
    if (!f?.image?.length) return null
    any = true
    const row: number[] = []
    for (const lm of f.image) {
      row.push(
        round(lm.x, POSE_PRECISION),
        round(lm.y, POSE_PRECISION),
        round(lm.visibility, VISIBILITY_PRECISION),
      )
    }
    return row
  })

  return any ? { aspect: round(aspect, 4), rows } : undefined
}

/**
 * Rebuild a drawable frame from one stored row.
 *
 * A `Frame` is more than landmarks — it has an index, a timestamp, a visibility
 * and a world track — and none of that survives, so the parts that are not
 * stored come back as the honest absence rather than as plausible values.
 * `world` is empty because no world landmarks were kept, and anything that
 * wanted those has to notice they are missing rather than read a fabricated
 * number.
 */
function frameFromRow(row: number[], index: number, t: number): Frame {
  const image: Landmark[] = []
  for (let i = 0; i < row.length; i += STRIDE) {
    image.push({ x: row[i], y: row[i + 1], z: 0, visibility: row[i + 2] })
  }
  return { index, t, image, world: [], visibility: 1 }
}

/** A row that could not have come out of this encoder. */
const drawable = (row: unknown): row is number[] =>
  Array.isArray(row) && row.length > 0 && row.length % STRIDE === 0

/**
 * One keyframe, as a drawable frame.
 *
 * `t` is zero because a keyframe pose carries no time of its own — the stills it
 * stands in for are looked at, not played. `SwingTrack` does keep times, and
 * `trackFrameAt` below returns them.
 *
 * `undefined` for a row that was never captured or is the wrong length, which is
 * also the guard against a row written by a build that used a different stride.
 */
export function poseFrameAt(poses: KeyframePoses | undefined, index: number): Frame | undefined {
  const row = poses?.rows?.[index]
  return drawable(row) ? frameFromRow(row, index, 0) : undefined
}

/**
 * A stored value reshaped so nothing downstream throws on it.
 *
 * Reports outlive the code that wrote them, and this one is read straight into a
 * drawing loop. A row of the wrong length, a row that is not an array, or an
 * aspect of zero all produce a canvas full of `NaN` rather than an exception, so
 * the check is here rather than at the point of drawing.
 */
export function readKeyframePoses(v: unknown): KeyframePoses | undefined {
  if (!v || typeof v !== 'object') return undefined
  const raw = v as { aspect?: unknown; rows?: unknown }
  if (typeof raw.aspect !== 'number' || !(raw.aspect > 0)) return undefined
  if (!Array.isArray(raw.rows)) return undefined

  const rows = raw.rows.map(readRow)
  return rows.some(Boolean) ? { aspect: raw.aspect, rows } : undefined
}

/** One stored row, or `null` if nothing about it can be trusted. */
const readRow = (r: unknown): number[] | null =>
  Array.isArray(r) && r.length > 0 && r.length % STRIDE === 0 && r.every((n) => typeof n === 'number')
    ? (r as number[])
    : null

/* --------------------------------------------------------------- the swing */

/**
 * The whole swing, in the same rows.
 *
 * WHY THIS IS NOT A SECOND THING BESIDE THE KEYFRAMES. A row here is encoded
 * exactly as a keyframe row is — same landmarks, same decimals, same stride — so
 * the six keyframe rows can be lifted back out of a track byte for byte. That is
 * measured rather than asserted (`footprint.test.ts`, "What a stored track would
 * do to the prune ladder"), and it is the whole reason this ships: a report
 * stores a track *instead of* its poses, and `keyframesFromTrack` produces the
 * poses on demand. Storing both would be paying twice for the same six rows.
 *
 * WHAT IT COSTS AND WHERE IT SITS IN THE LADDER. 21.3 kB for a serve, against
 * 2.7 kB for the six poses it replaces and 24–48 kB for the photographs it
 * outlives. So it is kept on every report the ladder keeps — there is no routine
 * rung and no second horizon for a player to learn — and the quota levels
 * downgrade it to its own keyframes rather than deleting it. Stripping a still
 * leaves nothing behind; this is the only thing in a stored report that can get
 * smaller twice.
 *
 * THE SPAN IS `ready` TO `finish`, which is the cheapest span that can still
 * draw the filmstrip: every keyframe falls inside it, checked across six rigs
 * rather than taken from the detector's ordering on faith.
 */
export interface SwingTrack {
  /** As `KeyframePoses.aspect` — `drawSkeleton` needs it and a stored report has no video. */
  aspect: number
  /** The clip frame `rows[0]` came from, so a `Phase.frame` can index straight in. */
  from: number
  /**
   * Seconds into the clip, one per row.
   *
   * Kept parallel rather than pushed onto the front of each row, which would
   * have been fewer bytes to reason about and would have cost the property above:
   * a row that starts with a timestamp is no longer the same row a keyframe
   * stores. Sampling is not evenly spaced — `seekTo` files a frame under the time
   * the seek actually reached — so a replay that assumed a fixed step would drift.
   */
  times: number[]
  /**
   * One row per frame in `from..from + rows.length - 1`, `null` where the tracker
   * saw nothing.
   *
   * Null-preserving rather than compacted, and that is load-bearing: every reader
   * here finds a frame by subtracting `from`, so a row dropped in the middle
   * would silently shift every later frame and draw the trophy under the caption
   * reading Contact.
   */
  rows: (number[] | null)[]
}

/**
 * Encode the swing between two frames.
 *
 * `undefined` when the span is empty or nothing in it was tracked, so a caller
 * stores no field rather than an empty one — the same contract `keyframePoses`
 * has.
 */
export function swingTrack(
  frames: readonly Frame[],
  from: number,
  to: number,
  aspect: number,
): SwingTrack | undefined {
  if (!frames.length || !(aspect > 0)) return undefined
  const first = Math.max(0, Math.round(from))
  const last = Math.min(frames.length - 1, Math.round(to))
  if (!(last >= first)) return undefined

  let any = false
  const times: number[] = []
  const rows: (number[] | null)[] = []
  for (let i = first; i <= last; i++) {
    const f = frames[i]
    times.push(round(f?.t ?? 0, 3))
    if (!f?.image?.length) {
      rows.push(null)
      continue
    }
    any = true
    const row: number[] = []
    for (const lm of f.image) {
      row.push(
        round(lm.x, POSE_PRECISION),
        round(lm.y, POSE_PRECISION),
        round(lm.visibility, VISIBILITY_PRECISION),
      )
    }
    rows.push(row)
  }

  return any ? { aspect: round(aspect, 4), from: first, times, rows } : undefined
}

/**
 * The six keyframes, taken back out of a track.
 *
 * This is the prune ladder's downgrade and the report's own reader in one
 * function, which is deliberate: if the two ever diverged, a pruned report would
 * draw a different filmstrip from the same serve before it was pruned.
 *
 * Positional against `phases`, exactly as `keyframePoses` is, and a phase whose
 * frame falls outside the stored span produces `null` rather than the nearest
 * row — a body drawn under the wrong caption is worse than a grey box, because
 * it still looks like a serve.
 */
export function keyframesFromTrack(
  track: SwingTrack | undefined,
  phases: readonly Pick<Phase, 'frame'>[],
): KeyframePoses | undefined {
  if (!track || !phases.length) return undefined
  const rows = phases.map((p) => track.rows[p.frame - track.from] ?? null)
  return rows.some(Boolean) ? { aspect: track.aspect, rows } : undefined
}

/**
 * The six poses a report should draw, from whichever form it is carrying.
 *
 * One function because there are three states in a real store and a screen must
 * not have to know which it is holding: a fresh or recent report has a track, a
 * report pruned under quota pressure has the keyframes the downgrade left it,
 * and a report written before either existed has nothing. The track is preferred
 * where both are somehow present, since it is the form the other is derived from.
 */
export function filmstripPoses(
  a: Pick<Analysis, 'poses' | 'track' | 'phases'>,
): KeyframePoses | undefined {
  return keyframesFromTrack(a.track, a.phases) ?? a.poses
}

/**
 * A stored track reshaped so nothing downstream throws on it.
 *
 * Same door `readKeyframePoses` is, for the same reason — reports outlive the
 * code that wrote them. `times` is repaired to the row count rather than refused
 * with it: a missing timestamp costs a replay its spacing, and a row is worth
 * drawing without one.
 */
export function readSwingTrack(v: unknown): SwingTrack | undefined {
  if (!v || typeof v !== 'object') return undefined
  const raw = v as { aspect?: unknown; from?: unknown; times?: unknown; rows?: unknown }
  if (typeof raw.aspect !== 'number' || !(raw.aspect > 0)) return undefined
  if (typeof raw.from !== 'number' || !Number.isFinite(raw.from) || raw.from < 0) return undefined
  if (!Array.isArray(raw.rows)) return undefined

  const rows = raw.rows.map(readRow)
  if (!rows.some(Boolean)) return undefined

  const stored = Array.isArray(raw.times) ? raw.times : []
  const times = rows.map((_, i) => (typeof stored[i] === 'number' ? (stored[i] as number) : 0))
  return { aspect: raw.aspect, from: Math.round(raw.from), times, rows }
}

/* ---------------------------------------------------------------- playback */

/**
 * The cadence a replay falls back to when the stored times cannot be trusted.
 *
 * `readSwingTrack` repairs a missing timestamp to zero rather than refusing the
 * row it belongs to, which is the right trade for a filmstrip and the wrong one
 * for a clock: a run of zeroes would play a whole swing in an instant. Thirty a
 * second is the low end of what a phone films at, so an assumed replay runs at
 * or slower than life and never faster — a serve shown quicker than it happened
 * is the one error that would make a player misjudge their own timing.
 */
export const REPLAY_ASSUMED_STEP = 1 / 30

/** One drawable instant of a replay. */
export interface ReplaySample {
  /** Index into `SwingTrack.rows`; add `from` for the clip's own frame number. */
  row: number
  /**
   * Seconds from the start of the replay, not from the start of the clip.
   *
   * Relative because there is no clip left to be absolute against: the video a
   * stored report was made from is long gone, and an elapsed time counted from
   * a walk-up nobody can watch is a number with nothing behind it.
   */
  at: number
}

export interface Replay {
  samples: ReplaySample[]
  /** Total seconds, so a caller can loop without re-reading the last sample. */
  duration: number
  /**
   * True when the stored times were unusable and `at` is `REPLAY_ASSUMED_STEP`
   * counted out rather than measured. Nothing on screen states a duration, so
   * this changes pacing and not a printed number — but a caller that ever wants
   * to print one has to be able to see the difference first.
   */
  assumedSpacing: boolean
}

/**
 * A stored swing, as the instants a replay can actually draw.
 *
 * ONLY TRACKED ROWS. A row the tracker lost is not a sample: there is no body
 * to draw at it, and blanking the canvas for a frame reads as the app faulting
 * rather than as a gap in what a phone could see. Dropping it instead leaves its
 * time out of the sequence too, so the swing simply holds still for exactly as
 * long as the tracking was missing — which is the honest picture of the gap.
 *
 * `undefined` below two samples, because one pose is not motion. A report in
 * that state has a filmstrip and no replay, which is the same answer as a report
 * with no track at all rather than a player that shows one frame forever.
 */
export function replayFrom(track: SwingTrack | undefined): Replay | undefined {
  if (!track) return undefined

  const rows: number[] = []
  for (let i = 0; i < track.rows.length; i++) if (drawable(track.rows[i])) rows.push(i)
  if (rows.length < 2) return undefined

  const times = rows.map((r) => track.times[r])
  /*
   * Monotonic and non-degenerate, or not used at all. `seekTo` files a frame
   * under the time the seek actually reached, so real sampling is uneven — that
   * is the whole reason the times are stored — but it is never backwards, and a
   * span of zero is the repaired-to-zero case above rather than a fast serve.
   */
  const measured =
    times.every((t) => typeof t === 'number' && Number.isFinite(t)) &&
    times.every((t, i) => i === 0 || t >= times[i - 1]) &&
    times[times.length - 1] > times[0]

  const samples = rows.map((row, i) => ({
    row,
    at: measured ? round(times[i] - times[0], 3) : round(i * REPLAY_ASSUMED_STEP, 3),
  }))
  return {
    samples,
    duration: samples[samples.length - 1].at,
    assumedSpacing: !measured,
  }
}

/**
 * One row of a stored swing, as a drawable frame.
 *
 * Takes a row index rather than a clip frame — every reader here subtracts
 * `from` once and works in row space after that, and a function that accepted
 * both would eventually be handed the wrong one.
 *
 * Unlike `poseFrameAt` this carries the real `index` and `t`, because a track
 * knows both: the clip frame is `from + row`, and the time is what the sampler
 * recorded rather than a step somebody assumed.
 */
export function trackFrameAt(track: SwingTrack | undefined, row: number): Frame | undefined {
  const r = track?.rows?.[row]
  if (!drawable(r)) return undefined
  return frameFromRow(r, track!.from + row, track!.times[row] ?? 0)
}

/**
 * Where each keyframe sits in a replay's samples, by name.
 *
 * EXACT OR ABSENT, and this is the same rule `keyframesFromTrack` follows for
 * the same reason: a phase whose own row was never tracked gets no entry rather
 * than the nearest one. The player parks on these and captions what it parks on,
 * so a nearest-row fallback would eventually caption the trophy as the contact —
 * and the picture would still look like a serve, which is what makes it the
 * error nobody catches.
 */
export function phaseSamples(
  replay: Replay | undefined,
  track: SwingTrack | undefined,
  phases: readonly Pick<Phase, 'id' | 'frame'>[],
): Map<string, number> {
  const found = new Map<string, number>()
  if (!replay || !track) return found
  const byRow = new Map<number, number>()
  replay.samples.forEach((s, i) => byRow.set(s.row, i))
  for (const p of phases) {
    const i = byRow.get(p.frame - track.from)
    if (i !== undefined) found.set(p.id, i)
  }
  return found
}
