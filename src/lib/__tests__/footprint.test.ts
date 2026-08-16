/**
 * What one analysis holds, measured rather than asserted.
 *
 * The per-object constants in `footprint.ts` are not guesses about V8's layout;
 * they are read off the heap here, on every run, by allocating the real shapes.
 * The assertions are a ratchet rather than an accuracy check — the point is that
 * a change which makes a `Frame` twice as expensive turns this red, not that the
 * constant is exact to the byte.
 *
 * Measured in Node, which is V8, which is the engine Chrome runs. Safari's
 * JavaScriptCore lays objects out differently and these figures do not describe
 * it. That is a limit on the number, and it is written down rather than left for
 * somebody to discover.
 */
import {
  BYTES_PER_LANDMARK,
  blankFrame,
  canvasBytes,
  footprintOf,
  frameBytes,
  mb,
  stillBytes,
  sweepFootprint,
  worstCase,
  HEAP_BUDGET_BYTES,
  LANDMARKS_PER_FRAME,
  UNSEEN,
} from '../footprint'
import { MAX_FINE_FRAMES } from '../pose/extract'
import { buildServe } from '../analysis/syntheticServe'
import { buildPhases, detectServe } from '../analysis/phases'
import { MAX_SERVES } from '../analysis/serves'
import {
  KEEP_ALL_UNDER_PRESSURE,
  KEEP_STILLS,
  MAX_SESSIONS,
} from '../storage/db'
import { keyframePoses } from '../storage/poseTrack'
import type { Frame } from '../analysis/types'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

declare const process: { memoryUsage(): { heapUsed: number } }

/**
 * Bytes per item, allocating `n` of them and holding every one.
 *
 * No `global.gc()` — the runner does not expose it — so `n` is large enough that
 * collector noise is small against the total, and the array of pointers is
 * subtracted rather than left in the reading.
 */
function perItem(n: number, make: (i: number) => unknown): number {
  const before = process.memoryUsage().heapUsed
  const held: unknown[] = new Array(n)
  for (let i = 0; i < n; i++) held[i] = make(i)
  const after = process.memoryUsage().heapUsed
  // Read something off the array so nothing above can be optimised away.
  assert(held.length === n && held[n - 1] !== undefined, 'the allocation was elided')
  return (after - before) / n - 8
}

heading('What a sampled frame costs on the heap')

const landmarkBytes = perItem(200_000, () => ({ x: 0.5, y: 0.5, z: 0.5, visibility: 0.9 }))
note(`one landmark: ${landmarkBytes.toFixed(1)} bytes (constant says ${BYTES_PER_LANDMARK})`)

const wholeFrameBytes = perItem(20_000, (i) => blankFrame(i))
const overhead = wholeFrameBytes - 2 * LANDMARKS_PER_FRAME * landmarkBytes
note(`one frame: ${wholeFrameBytes.toFixed(0)} bytes, of which ${overhead.toFixed(0)} is not landmarks`)

check('a landmark costs about what the constant says', () => {
  // A ratchet, not an accuracy check. Two-fold either way is a change in the
  // shape of the data or in the engine, and both are worth being told about.
  assert(
    landmarkBytes > BYTES_PER_LANDMARK / 2 && landmarkBytes < BYTES_PER_LANDMARK * 2,
    `a landmark measured ${landmarkBytes.toFixed(1)} against a stated ${BYTES_PER_LANDMARK}`,
  )
})

check('a frame costs about what the arithmetic says', () => {
  const stated = frameBytes(1)
  assert(
    wholeFrameBytes > stated / 2 && wholeFrameBytes < stated * 2,
    `a frame measured ${wholeFrameBytes.toFixed(0)} against a stated ${stated}`,
  )
})

check('the frame overhead is small beside its landmarks, which is why the count is what matters', () => {
  // If this ever stops being true, `frameBytes(count)` is the wrong shape of
  // function and the footprint should be counting something else.
  assert(overhead < wholeFrameBytes / 2, `overhead was ${overhead.toFixed(0)} of ${wholeFrameBytes.toFixed(0)}`)
})

heading('What one analysis holds')

/** The worst single serve the sampler will produce: `MAX_FINE_FRAMES` frames. */
const WORST_SERVE_FRAMES = 120

/**
 * A keyframe still, at the size the extractor writes them.
 *
 * Base64 of a JPEG at quality 0.72, 420 px wide — `captureThumbnails`' own
 * default, and what `analyze.ts` calls it with. Length rather than content is
 * the whole of the cost, so the string is filled rather than encoded. A real
 * still at this width measures 27–80 KB depending on the clip's aspect ratio —
 * see the R5 note in `NEXT.md` — so this is a mid-range stand-in, not a worst
 * case; `stillBytes` counts whatever length actually arrives.
 */
const STILL = 'data:image/jpeg;base64,' + 'A'.repeat(48_000)

const oneServe = footprintOf({
  frames: Array.from({ length: WORST_SERVE_FRAMES }, (_, i) => blankFrame(i)),
  phases: Array.from({ length: 6 }, () => ({ thumbnail: STILL })) as never,
})

note(
  `worst single serve: ${mb(oneServe.total)} MB — ${mb(oneServe.frames)} MB of frames, ` +
    `${mb(oneServe.stills)} MB of stills`,
)

const basket = sweepFootprint(
  Array.from({ length: 8 }, () => ({
    frames: Array.from({ length: WORST_SERVE_FRAMES }, (_, i) => blankFrame(i)),
    phases: Array.from({ length: 6 }, () => ({ thumbnail: STILL })) as never,
  })),
)
note(`a swept basket of eight: ${mb(basket.total)} MB over ${basket.frameCount} frames`)
// The extractor never opens a full-size canvas: the ball pass runs at 256 px
// wide and the stills at 420, both scaled down from whatever was filmed. So the
// canvases are the smallest thing here, and a 4K clip does not make them bigger.
note(
  `canvases: ball pass ${mb(canvasBytes(256, 144))} MB, stills ${mb(canvasBytes(420, 236))} MB — ` +
    `both scaled down, so 4K footage does not enlarge them`,
)
note('not counted, and named in UNSEEN:')
for (const u of UNSEEN) note(`  · ${u}`)

check('in memory it is the landmarks that dominate, not the stills', () => {
  // The opposite way round from storage, and both are true. A stored report is
  // `Omit<Analysis, 'frames'>` — it has no frames at all — which is why nearly
  // all of its size is stills and why pruning drops pictures before numbers. In
  // memory the frames are present and they are the larger half. Reading either
  // fact as the other is how somebody optimises the wrong thing.
  assert(oneServe.frames > oneServe.stills, `frames ${oneServe.frames} against stills ${oneServe.stills}`)
  note(
    `  a stored copy of the same report is ${mb(oneServe.stills)} MB — the frames do not survive saving`,
  )
})

check('an absent still costs nothing, rather than counting as an empty one', () => {
  assert(stillBytes([undefined, undefined]) === 0, 'counted bytes for stills that are not there')
})

check('a canvas is four bytes a pixel and never negative', () => {
  assert(canvasBytes(2, 3) === 24, `${canvasBytes(2, 3)}`)
  assert(canvasBytes(-5, 10) === 0, 'a negative dimension produced bytes')
})

heading('The bound')

const worst = worstCase(MAX_FINE_FRAMES, MAX_SERVES, STILL.length)
note(
  `the constants allow ${mb(worst.total)} MB over ${worst.frameCount} frames — ` +
    `${MAX_SERVES} serves × ${MAX_FINE_FRAMES} frames`,
)
note(`budget ${mb(HEAP_BUDGET_BYTES)} MB, headroom ${(HEAP_BUDGET_BYTES / worst.total).toFixed(1)}×`)

check('the constants cannot allow more than the budget', () => {
  // Read off MAX_FINE_FRAMES and MAX_SERVES themselves rather than copied from
  // them, so raising either is what turns this red. That is the point: the two
  // numbers that bound the largest allocation in the app were a module-private
  // const and a default argument, and neither had anywhere to be argued with.
  assert(
    worst.total < HEAP_BUDGET_BYTES,
    `${mb(worst.total)} MB against a ${mb(HEAP_BUDGET_BYTES)} MB budget`,
  )
})

check('the budget is a ratchet with real headroom, not a line drawn under today', () => {
  // A budget sitting just above the current figure fails on the first honest
  // change and gets raised without thought, which is worse than not having one.
  // A budget a hundred times above it never fails at all.
  const headroom = HEAP_BUDGET_BYTES / worst.total
  assert(headroom > 2 && headroom < 20, `headroom is ${headroom.toFixed(1)}×`)
})

check('raising either constant is what the budget is watching', () => {
  // The failure mode this exists for, driven rather than described: a serve cap
  // raised to cover a long practice session, or a sampler taking four times the
  // frames, and nothing anywhere saying what that costs.
  assert(
    worstCase(MAX_FINE_FRAMES, 64, STILL.length).total > HEAP_BUDGET_BYTES,
    'a serve cap of 64 did not breach the budget',
  )
  assert(
    worstCase(MAX_FINE_FRAMES * 8, MAX_SERVES, STILL.length).total > HEAP_BUDGET_BYTES,
    'eight times the frames did not breach the budget',
  )
})

heading('What a stored pose track would cost, and at what precision')

/*
 * The gate on storing a serve as motion rather than as six photographs.
 *
 * A saved report drops its frames and keeps six base64 JPEGs, so "best against
 * latest" can only ever be two stills. Storing the track instead would make it
 * two skeletons — but only if a track is cheaper than the pictures it sits
 * beside, and that turns entirely on how it is encoded. Nothing is stored yet;
 * these checks exist so the encoding decision is a measurement rather than an
 * assumption, and so a future writer cannot quietly ship the naive form.
 */
/** A track's JSON size, in bytes, for one encoding. */
const sizeOf = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length

/*
 * Real landmarks from the rig, not a stand-in.
 *
 * The first draft invented plausible-looking coordinates and measured 24.6 kB
 * against the rig's own 21.5 — because how many digits a rounded number needs
 * depends entirely on where it lands, and inventing the distribution invents the
 * answer. A byte count taken off made-up bytes is not a measurement.
 */
const swingFrames = (() => {
  const frames = buildServe({ noise: 0.006, seed: 7000 }, 30)
  const skel = detectServe(frames, 30)
  return frames.slice(skel.keys.ready, skel.keys.finish + 1)
})()

const sampleFrame = (i: number) => swingFrames[i % swingFrames.length].image

const TYPICAL_SWING_FRAMES = swingFrames.length

check('the naive encoding is the one that kills the feature', () => {
  /*
   * Whole landmark objects, every axis, full float precision. This is what
   * `JSON.stringify(frames)` produces and what anybody would write first.
   * Measured on the rig it came to 278 kB for one serve — several times the
   * report it would be attached to — and the point of pinning it is that the
   * gap between this and the drawable form is the entire design decision.
   */
  const naive = Array.from({ length: TYPICAL_SWING_FRAMES }, (_, i) => ({
    t: i / 30,
    image: sampleFrame(i),
    world: swingFrames[i % swingFrames.length].world,
  }))
  const kb = sizeOf(naive) / 1024
  assert(kb > 100, `the naive form is now only ${kb.toFixed(1)} kB — re-read the encoding argument`)
  note(`naive whole-frame JSON: ${kb.toFixed(0)} kB for one serve`)
})

check('and the drawable encoding costs less than the stills it would sit beside', () => {
  /*
   * Image landmarks only, three decimals, flat arrays. Image rather than world
   * because the use is drawing a skeleton; three decimals because of the check
   * below; flat because the keys are two thirds of the bytes in the object form.
   *
   * A report keeps six keyframe JPEGs at roughly 4–8 kB of base64 each, so the
   * pictures on one report are 24–48 kB. A track that fits under that is not a
   * new storage problem, it is a cheaper one.
   */
  const round = (v: number, p: number) => Math.round(v * 10 ** p) / 10 ** p
  const drawable = Array.from({ length: TYPICAL_SWING_FRAMES }, (_, i) => [
    round(i / 30, 3),
    ...sampleFrame(i).flatMap((p) => [round(p.x, 3), round(p.y, 3), round(p.visibility, 2)]),
  ])
  const kb = sizeOf(drawable) / 1024
  assert(kb < 24, `the drawable form is now ${kb.toFixed(1)} kB, past the low end of what six stills cost`)
  note(`drawable track: ${kb.toFixed(1)} kB for one serve, against 24–48 kB of stills`)
})

check('three decimals is under a pixel on a phone', () => {
  /*
   * The precision decision, checked rather than chosen. Landmarks are normalised
   * to the frame, so a rounding step of 0.001 is a thousandth of the frame's
   * width — and the question is whether that is visible in the one thing the
   * track is for, which is drawing a body.
   *
   * 1080 is the tallest a phone clip here realistically is. If a future encoding
   * drops to two decimals to save bytes this goes red, which is the point: that
   * would be eleven pixels and a visibly wrong elbow.
   */
  const TALLEST = 1080
  const step = 0.001
  const worstPixels = (step / 2) * TALLEST
  assert(worstPixels < 1, `three decimals is ${worstPixels.toFixed(2)} px at ${TALLEST}p`)
  note(`3dp rounding is at most ${worstPixels.toFixed(2)} px at ${TALLEST}p; 2dp would be ${((0.01 / 2) * TALLEST).toFixed(0)} px`)
})

heading('What a stored track would do to the prune ladder')

/*
 * THE GATE THE TRACK IS ACTUALLY BLOCKED ON, and it is not the encoding.
 *
 * The checks above settled what a track costs. What they did not settle is
 * where it sits in the ladder that bounds a player's history: sixty reports at
 * 21 kB is 1.3 MB nothing currently strips, where the six keyframe poses a
 * report keeps today are 160 kB for the same sixty. The stills have a rung —
 * `planPrune` takes them off everything past `KEEP_STILLS` — and a track needs
 * to join one, be given its own, or be refused.
 *
 * The measurement below is what makes that a decision rather than a preference,
 * and the load-bearing finding is the second check: the six keyframe rows can be
 * lifted back out of a track EXACTLY, byte for byte, as the same values
 * `keyframePoses` writes today. That means a track is not a second thing stored
 * beside the poses — it is a superset of them, and the ladder gains a rung the
 * stills never had. Stripping a still leaves nothing behind. Downgrading a track
 * leaves the filmstrip intact.
 *
 * Nothing is stored yet. These exist so the writer arrives into a decided ladder
 * instead of deciding one on the way past.
 */

/** The swing as one flat row per frame — the drawable encoding, spanning `from`. */
function swingTrack(source: readonly Frame[], from: number, to: number, aspect: number) {
  const round3 = (v: number, p: number) => Math.round(v * 10 ** p) / 10 ** p
  const rows: number[][] = []
  for (let i = from; i <= to; i++) {
    const f = source[i]
    if (!f?.image?.length) continue
    const row: number[] = []
    for (const lm of f.image) {
      row.push(round3(lm.x, 3), round3(lm.y, 3), round3(lm.visibility, 2))
    }
    rows.push(row)
  }
  return { aspect: round3(aspect, 4), from, rows }
}

/*
 * The whole clip rather than `swingFrames`, which is already sliced to the
 * window: this section needs the frame numbers a `Phase` actually carries, and
 * those index the clip.
 */
const RIG_ASPECT = 16 / 9
const rigFrames = buildServe({ noise: 0.006, seed: 7000 }, 30)
const rigSkeleton = detectServe(rigFrames, 30)
const rigPhases = buildPhases(rigFrames, rigSkeleton.keys)
const rigPoses = keyframePoses(rigFrames, rigPhases, RIG_ASPECT)
const rigTrack = swingTrack(rigFrames, rigSkeleton.keys.ready, rigSkeleton.keys.finish, RIG_ASPECT)

check('the swing window holds every keyframe, so a track can always draw the filmstrip', () => {
  /*
   * Structural rather than lucky, which is why this runs six rigs and not one.
   * A track spanning `ready` to `finish` is the cheapest span that could carry
   * the swing; if a keyframe ever sat outside it, the downgrade below would
   * produce a filmstrip with a hole in it and the whole rung would need a wider
   * span. `buildPhases` reads its frames straight off `Keyframes`, so this is
   * really a claim about the detector's own ordering — worth stating here
   * because it is this rung that depends on it.
   */
  for (const seed of [7000, 11, 202, 3131, 44444, 909]) {
    const f = buildServe({ noise: 0.006, seed }, 30)
    const skel = detectServe(f, 30)
    const outside = buildPhases(f, skel.keys).filter(
      (p) => p.frame < skel.keys.ready || p.frame > skel.keys.finish,
    )
    assert(
      outside.length === 0,
      `seed ${seed}: ${outside.map((p) => p.id).join(', ')} fell outside ready..finish`,
    )
  }
})

check('keyframes lifted out of a track are the same bytes the report stores today', () => {
  /*
   * THE FINDING THE RUNG RESTS ON. Both forms round the same landmarks to the
   * same decimals, so a row taken from the track at a phase's own frame is not
   * merely close to the stored one — it is identical, and a downgrade is
   * therefore lossless with respect to everything on screen today.
   *
   * Compared against the real `keyframePoses` rather than a second copy of its
   * arithmetic, because a reimplementation agreeing with itself would prove
   * nothing. If either side ever changes its rounding this goes red, which is
   * exactly when the rung stops being free.
   */
  assert(rigPoses !== undefined, 'the rig produced no keyframe poses to compare against')
  const downgraded = {
    aspect: rigTrack.aspect,
    rows: rigPhases.map((p) => rigTrack.rows[p.frame - rigTrack.from] ?? null),
  }
  assert(
    JSON.stringify(downgraded) === JSON.stringify(rigPoses),
    'a track does not reproduce the stored keyframes — the downgrade is lossy',
  )
  note(`downgrade: ${(sizeOf(rigTrack) / 1024).toFixed(1)} kB of track becomes ${(sizeOf(rigPoses) / 1024).toFixed(1)} kB of keyframes, unchanged`)
})

const RIG_TRACK_BYTES = sizeOf(rigTrack)
const RIG_POSES_BYTES = sizeOf(rigPoses)
/** A still at the high end of what one has been measured at, times six. */
const STILLS_PER_REPORT = 6 * 8 * 1024

check('the pressure ladder gains a rung that beats deleting a report', () => {
  /*
   * The gap this closes is real and is in `planPrune` today. Once the quota
   * levels have taken the stills down to `KEEP_STILLS_UNDER_PRESSURE`, there is
   * nothing left to free except whole reports — the ladder steps straight from
   * "every image is gone" to "your history is shorter", and a player who is out
   * of room loses serves rather than pictures.
   *
   * A track downgrade sits between the two. It is the only thing in a stored
   * report that can get smaller twice.
   */
  const freedByDowngrade = KEEP_ALL_UNDER_PRESSURE * (RIG_TRACK_BYTES - RIG_POSES_BYTES)
  // What the step it replaces costs: the oldest report, images and all.
  const freedByDeletingOne = STILLS_PER_REPORT + RIG_TRACK_BYTES
  assert(
    freedByDowngrade > freedByDeletingOne,
    `downgrading frees ${(freedByDowngrade / 1024).toFixed(0)} kB, less than the ${(freedByDeletingOne / 1024).toFixed(0)} kB of deleting one report — the rung is not worth having`,
  )
  note(`downgrading ${KEEP_ALL_UNDER_PRESSURE} tracks frees ${(freedByDowngrade / 1024).toFixed(0)} kB before a single report is deleted`)
})

/**
 * The whole store at its limits, with a track on every report the ladder keeps.
 *
 * A RATCHET, and the same kind `HEAP_BUDGET_BYTES` is: nobody here has measured
 * a phone's IndexedDB quota, so this cannot be "the device limit, divided". It
 * fails on a change in kind — a longer history, a wider span than the swing, a
 * second landmark set per row.
 *
 * SET TIGHTER THAN THE FIRST DRAFT, and by the canary below rather than by
 * taste. At twice the worst case it caught nothing: the stills are capped at
 * `KEEP_STILLS`, so doubling the history only doubles the track half, and 3.6 MB
 * sat comfortably under a 4.5 MB line. A third above the measured worst case is
 * what actually makes the two checks below disagree, and it is still an order of
 * magnitude clear of the seed-to-seed spread in the track figure itself (21.3 to
 * 21.8 kB across six rigs).
 */
const STORE_RATCHET_BYTES = 3e6

const storeWorstCase = (sessions: number, trackBytes: number) =>
  Math.min(sessions, KEEP_STILLS) * STILLS_PER_REPORT + sessions * trackBytes

check('a track on every kept report stays inside the store ratchet', () => {
  const today = storeWorstCase(MAX_SESSIONS, RIG_POSES_BYTES)
  const withTracks = storeWorstCase(MAX_SESSIONS, RIG_TRACK_BYTES)
  assert(
    withTracks < STORE_RATCHET_BYTES,
    `a full history with tracks is ${mb(withTracks)} MB, past the ${mb(STORE_RATCHET_BYTES)} MB ratchet`,
  )
  note(
    `full history: ${mb(today)} MB today, ${mb(withTracks)} MB with a track on each of ${MAX_SESSIONS} — stills ${mb(KEEP_STILLS * STILLS_PER_REPORT)} MB of it`,
  )
  note(`per report the track costs ${((RIG_TRACK_BYTES - RIG_POSES_BYTES) / 1024).toFixed(1)} kB more than the six poses it replaces, and ${(STILLS_PER_REPORT / 1024).toFixed(0)} kB less than the photographs it outlives`)
})

check('and a longer history is what would breach it', () => {
  /*
   * The teeth. `MAX_SESSIONS` is the one constant here a future round is likely
   * to want raised, and the point of the ratchet is that raising it has to be
   * argued rather than typed.
   */
  assert(
    storeWorstCase(MAX_SESSIONS * 2, RIG_TRACK_BYTES) > STORE_RATCHET_BYTES,
    'twice the history did not breach the ratchet — it is set too loose to catch anything',
  )
  assert(
    storeWorstCase(MAX_SESSIONS, RIG_TRACK_BYTES * 4) > STORE_RATCHET_BYTES,
    'a track four times as wide did not breach the ratchet',
  )
})

report()
