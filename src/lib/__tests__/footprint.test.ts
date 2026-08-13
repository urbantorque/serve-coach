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
import { MAX_SERVES } from '../analysis/serves'
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
 * Base64 of a JPEG at quality 0.72, 640 px wide — the shape `keyframeStills`
 * produces. Length rather than content is the whole of the cost, so the string
 * is filled rather than encoded.
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

report()
