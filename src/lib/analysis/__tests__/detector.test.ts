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
import { samplingRateFor } from '../../pose/rate'
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

/* ------------------------------------------------------- the shared pass */

const both = [racketHead, ballFlight] as readonly FrameDetector<unknown, unknown>[]

check('the pass reads one grid covering every window it kept', () => {
  const p = planSharedPass(both, anchors)
  const wins = [racketHead.window(anchors), ballFlight.window(anchors)]
  assert(p.window.start === Math.min(...wins.map((w) => w.start)), 'the union lost an early window')
  assert(p.window.end === Math.max(...wins.map((w) => w.end)), 'the union lost a late window')
  assert(p.times.length > 1 && p.times[0] === p.window.start, 'the grid does not start at the window')
  assert(
    p.times[p.times.length - 1] === p.window.end,
    'the grid stops short of contact, which is the frame that matters most in it',
  )
  for (let i = 1; i < p.times.length; i++) {
    assert(p.times[i] > p.times[i - 1], `the grid is not ascending at ${i}`)
  }
  note(`${p.members.join(' + ')} over ${p.window.start}–${p.window.end}s in ${p.times.length} frames`)
})

check('a detector gets no entry for a frame outside its own window', () => {
  // Absent, not empty. An entry for every frame would let `coverage.read` count
  // instants this detector's window never contained, which reports a window
  // barely opened as one fully covered.
  const p = planSharedPass(both, anchors)
  const frame: Bitmap = { data: new Uint8ClampedArray(4), width: 1, height: 1 }
  const early = p.read(frame, undefined, anchors.phase.toss + 0.01)
  assert('ball_flight' in early.by, 'the ball detector missed a frame inside its window')
  assert(!('racket_head' in early.by), 'the racket detector was offered a frame before trophy')
})

check('coverage counts the grid, the reads and the hits separately', () => {
  const p = planSharedPass(both, anchors)
  const frame: Bitmap = { data: new Uint8ClampedArray(4), width: 1, height: 1 }
  // Every other instant seeks — a variable-frame-rate phone clip, which is the
  // ordinary case rather than the broken one.
  const reads = p.times.filter((_, i) => i % 2 === 0).map((t) => p.read(frame, undefined, t))
  const out = p.harvest(reads)
  for (const id of p.members) {
    const c = out[id]!.coverage
    assert(c.read < c.asked, `${id} read every instant on a clip that skipped half of them`)
    assert(c.found <= c.read && c.read <= c.asked, `${id} coverage is out of order`)
  }
  /*
   * `asked` is this detector's own window, not the grid. Asserted by the count
   * rather than by an inequality, because an inequality passed here even when
   * `asked` was the whole grid — the racket window is a third of the union, so
   * "read is less than asked" stayed true while `asked` was wrong by a factor
   * of two and a half. That is a detector blaming itself for frames its window
   * never contained.
   */
  const head = racketHead.window(anchors)
  const inWindow = p.times.filter((t) => t >= head.start - 1e-9 && t <= head.end + 1e-9).length
  assert(
    out.racket_head!.coverage.asked === inWindow,
    `the racket detector was charged ${out.racket_head!.coverage.asked} instants for a window holding ${inWindow}`,
  )
  assert(inWindow < p.times.length, 'the two windows no longer differ, so this check proves nothing')
  // The racket stand-in keeps `[]` per frame, which is a kept value and not a
  // miss; the ball stand-in keeps `0`, likewise. `undefined` is the miss.
  assert(out.racket_head!.coverage.found === out.racket_head!.coverage.read, 'a kept value read as a miss')
})

check('dropping a slow detector is not reconsidered on the faster grid it leaves', () => {
  /*
   * The whole reason this planner is not three lines. `samplingRateFor` caps at
   * 32 Hz until the span passes MAX_FINE_FRAMES / FINE_FPS = 3.75s, so a
   * detector reaching far past contact drags the rate down for everyone.
   *
   * Here a greedy detector asks for the whole of a long clip and 4 Hz, so it
   * survives; the racket detector asks 24 Hz and does not. Removing it would
   * have shortened the span and raised the rate — and the plan still refuses
   * it, because a planner that re-admits produces a membership that depends on
   * the order the drops happened in.
   */
  const long: WindowAnchors = { ...anchors, duration: 30 }
  const greedy: FrameDetector<number, number> = {
    id: 'ball_flight',
    window: () => ({ start: 0, end: 30 }),
    minHz: 4,
    read: () => 0,
    finish: (_f, coverage) => ({ value: undefined, confidence: 0, coverage }),
  }
  const p = planSharedPass([racketHead, greedy] as readonly FrameDetector<unknown, unknown>[], long)
  const dropped = p.declined.find((d) => d.id === 'racket_head')
  assert(dropped?.reason === 'too_slow', 'the racket detector survived a 4 Hz grid')
  assert(dropped!.hz < racketHead.minHz, `refused at ${dropped!.hz} Hz against a stated ${dropped!.minHz}`)
  assert(p.members.length === 1 && p.members[0] === 'ball_flight', 'the wrong detector survived')
  assert(
    samplingRateFor(anchors.phase.contact - anchors.phase.trophy) > racketHead.minHz,
    'the round-trip this check is about no longer exists: the racket window is slow on its own',
  )
  note(`refused at ${dropped!.hz.toFixed(1)} Hz on a grid it would have beaten alone`)
})

check('a window clamped out of existence is declined, not planned for', () => {
  /*
   * A clip that stops at the strike. Ordinary footage, not an error.
   *
   * Its own detector rather than `ballFlight` above, and finding that out is
   * half the value of writing this check: the stand-in opens its window at the
   * toss, so it never collapses however early the clip ends. The detector W7
   * actually writes starts at contact — `WindowAnchors`' own comment says the
   * post-contact window "starts there and asks for time that may simply not
   * have been filmed" — and that is the one that can be clamped to nothing.
   */
  const postContact: FrameDetector<number, number> = {
    id: 'ball_flight',
    window: (a) => ({ start: a.phase.contact, end: Math.min(a.phase.contact + 0.25, a.duration) }),
    minHz: 20,
    read: () => 0,
    finish: (_f, coverage) => ({ value: undefined, confidence: 0, coverage }),
  }
  const stops: WindowAnchors = { phase: { ...anchors.phase, contact: 3.1 }, duration: 3.1 }
  const p = planSharedPass(
    [racketHead, postContact] as readonly FrameDetector<unknown, unknown>[],
    stops,
  )
  assert(
    p.declined.some((d) => d.id === 'ball_flight' && d.reason === 'window_empty'),
    'a post-contact window on a clip with no post-contact was planned for',
  )
  assert(p.members.includes('racket_head'), 'the racket detector was dropped along with it')
})

check('the planner still refuses rather than returning a plan it cannot make', () => {
  // The stub's guard, kept: the failure is a plan that type-checks, runs, reads
  // nothing, and produces full-confidence readings over zero frames.
  const refuses = (f: () => unknown, why: string) => {
    let threw = false
    try {
      f()
    } catch {
      threw = true
    }
    assert(threw, why)
  }
  refuses(() => planSharedPass([], anchors), 'planned a pass over no detectors')
  refuses(
    () => planSharedPass([racketHead, racketHead] as readonly FrameDetector<unknown, unknown>[], anchors),
    'accepted two detectors under one id, which silently overwrites one with the other',
  )
  const stops: WindowAnchors = { phase: { ...anchors.phase, trophy: 3.1, contact: 3.1 }, duration: 3.1 }
  refuses(() => planSharedPass([racketHead], stops), 'returned a plan with nothing left to plan for')
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
