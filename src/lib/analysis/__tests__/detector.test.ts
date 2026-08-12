/**
 * The detector contract, pinned.
 *
 * This suite lives here rather than beside `detector.ts` because the runner
 * only bundles `src/lib/analysis/__tests__/*.test.ts`, and a contract test in a
 * directory nothing runs is worse than no test: it looks like coverage.
 *
 * Two kinds of check, enforced by two different tools, which is worth being
 * explicit about because the runner cannot see half of them. The type
 * assignments below are erased by esbuild before this file runs, so they prove
 * nothing at `npm test`; they fail at `npm run typecheck`, which is what makes
 * them the real assertions here. The runtime checks that follow cover the two
 * things a type cannot state: that the detector ids are actually distinct, and
 * that the unbuilt pass planner refuses rather than fabricates.
 *
 * `detector.ts` is types and stubs, so there is no behaviour to test yet. What
 * there is to protect is the shape two workstreams are about to build against
 * in parallel, and the moment it stops fitting `readBitmaps` or stops being
 * DOM-free is the moment one of them silently rewrites it.
 */
import {
  DETECTOR_IDS,
  planSharedPass,
  type DetectorId,
  type DetectorReading,
  type FrameDetector,
  type PixelRead,
  type Seconds,
  type TimeWindow,
  type WindowAnchors,
} from '../../vision/detector'
import type { Bitmap } from '../../vision/ballTrack'
// Type-only, and it must stay that way: a value import would pull `extract.ts`
// and its `document.createElement` into a Node bundle. Erased, it costs nothing
// and still checks the one thing worth checking about that module here.
import type { readBitmaps } from '../../pose/extract'
import { assert, check, heading, note, report } from './harness'

/* ------------------------------------------------------------ type pins */

/**
 * The shape `readBitmaps` will accept, read off the function itself rather than
 * copied. Copied, it would go stale the first time that signature changed and
 * this suite would keep passing against a contract nothing upstream honours.
 */
type ReadBitmapsCallback = Parameters<typeof readBitmaps>[2]

/**
 * A `PixelRead` must be usable as `readBitmaps`' `read` argument with no
 * adapter. This assignment is the whole reason `PixelRead` takes `Bitmap` and
 * not `ImageData`: `ImageData` is assignable to `Bitmap`, so the callback stays
 * DOM-free and still slots in. Reverse the two and this line stops compiling.
 */
const _fitsReadBitmaps: ReadBitmapsCallback = ((_frame, _previous, _t) => null) as PixelRead<null>

/** A stand-in for the racket-head detector W6 will write. */
interface HeadBlob {
  x: number
  y: number
}

const racketHead: FrameDetector<HeadBlob[], { peakSpeed: number }> = {
  id: 'racket_head',
  // Trophy to contact, in seconds. Read straight off the anchors — there is no
  // frame index anywhere in this, which is the property being pinned.
  window: (a) => ({ start: a.phase.trophy, end: Math.min(a.phase.contact, a.duration) }),
  minHz: 24,
  read: (_frame, _previous, _t) => [],
  finish: (_frames, coverage) => ({ value: undefined, confidence: 0, coverage }),
}

/** And for the post-contact ball work in W7. Different `TFrame`, same contract. */
const ballFlight: FrameDetector<number, { launchDeg: number }> = {
  id: 'ball_flight',
  window: (a) => ({ start: a.phase.toss, end: Math.min(a.phase.contact + 0.25, a.duration) }),
  minHz: 20,
  read: () => 0,
  finish: (_frames, coverage) => ({ value: undefined, confidence: 0, coverage }),
}

/**
 * Both must fit in one heterogeneous pass despite disagreeing about `TFrame`
 * and `TResult`. This is the assignability `planSharedPass` depends on, and it
 * is fragile in a specific way: declaring `finish` as a property rather than a
 * method makes its parameters contravariant under `strict`, and this array
 * stops compiling. The failure would land on whichever workstream added the
 * second detector, months after the file that caused it was written.
 */
const _mixedPass: readonly FrameDetector<unknown, unknown>[] = [racketHead, ballFlight]

/* --------------------------------------------------------------- runtime */

heading('detector contract')

const anchors: WindowAnchors = {
  phase: { ready: 0.4, toss: 0.9, trophy: 1.4, drop: 1.62, contact: 1.85, finish: 2.3 },
  duration: 3.1,
}

check('every detector id is distinct', () => {
  // The one collision types cannot catch: two workstreams both reaching for the
  // obvious name and one silently overwriting the other's frames in the shared
  // pass. A union of duplicate string literals collapses without complaint.
  assert(
    new Set(DETECTOR_IDS).size === DETECTOR_IDS.length,
    `DETECTOR_IDS has a duplicate: ${DETECTOR_IDS.join(', ')}`,
  )
  assert(DETECTOR_IDS.length >= 2, 'both planned detectors should have reserved a name')
  note(`reserved: ${DETECTOR_IDS.join(', ')}`)
})

check('a window is seconds of clip, not frames', () => {
  for (const d of [racketHead, ballFlight] as const) {
    const w: TimeWindow = d.window(anchors)
    // A frame index would sail past `duration` on any clip longer than about a
    // second and a half at 32 fps. Seconds cannot.
    assert(w.start >= 0, `${d.id} asked to start at ${w.start}s, before the clip`)
    assert(w.end <= anchors.duration, `${d.id} asked for ${w.end}s of a ${anchors.duration}s clip`)
    assert(w.end > w.start, `${d.id} asked for an empty window`)
  }
  const head = racketHead.window(anchors)
  assert(
    head.start === anchors.phase.trophy && head.end === anchors.phase.contact,
    'the racket-head window should be exactly trophy to contact',
  )
})

check('a window clamps to the clip rather than running off the end', () => {
  // The post-contact case, which is the one that bites: a clip that stops just
  // after the strike. Asking for time that was never filmed hands the pass a
  // seek that cannot succeed, and `readBitmaps` skips it — the detector then
  // reports thin coverage of a window that was never there to cover.
  const short: WindowAnchors = { phase: { ...anchors.phase, contact: 3.0 }, duration: 3.1 }
  const w = ballFlight.window(short)
  assert(w.end <= short.duration, `asked for ${w.end}s of a ${short.duration}s clip`)
})

check('a reading can say it did not measure', () => {
  const r: DetectorReading<{ peakSpeed: number }> = racketHead.finish([], {
    asked: 12,
    read: 9,
    found: 0,
  })
  // Not zero. A racket head that was never found is not a racket head at rest.
  assert(r.value === undefined, 'a detector that found nothing reported a value anyway')
  assert(
    r.coverage.found <= r.coverage.read && r.coverage.read <= r.coverage.asked,
    `coverage is out of order: asked ${r.coverage.asked}, read ${r.coverage.read}, found ${r.coverage.found}`,
  )
})

check('the unbuilt pass planner refuses instead of fabricating a plan', () => {
  // The failure this guards is a stub that returns an empty plan: it type-checks,
  // runs, reads nothing, and produces full-confidence readings over zero frames.
  // Whoever wired it up would get a report rather than an error.
  let threw = false
  try {
    planSharedPass([racketHead, ballFlight] as readonly FrameDetector<unknown, unknown>[], anchors)
  } catch (err) {
    threw = true
    assert(
      /not built/.test((err as Error).message),
      `refused, but not legibly: ${(err as Error).message}`,
    )
  }
  assert(threw, 'planSharedPass returned a plan it could not have made')
})

check('the contract stays DOM-free', () => {
  // `detector.ts` states its pixels as `Bitmap`, so this file — and every
  // detector written against it — runs in Node with no canvas. If that ever
  // stops being true the bundle fails to load and this suite never gets here,
  // which is the point: the assertion is that the import above resolved.
  const frame: Bitmap = { data: new Uint8ClampedArray(4), width: 1, height: 1 }
  const t: Seconds = 0.5
  const seen: DetectorId = racketHead.id
  assert(racketHead.read(frame, undefined, t).length === 0, 'the stand-in fold kept something')
  assert(seen === 'racket_head', 'detector id did not survive the round trip')
  assert(typeof _fitsReadBitmaps === 'function' && _mixedPass.length === 2, 'type pins present')
})

report()
