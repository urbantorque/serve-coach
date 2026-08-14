/**
 * Which serves in a basket get keyframe pictures, and how many seeks that costs.
 *
 * The sweep used to capture six stills for every serve it measured — thirty-six
 * across a full basket — and `pairStills` then showed twelve of them. The other
 * twenty-four were seeked to, decoded, drawn, JPEG-encoded and dropped, on the
 * most expensive path in the app and the one a picked multi-serve clip now
 * enters without being asked.
 *
 * Three claims are pinned here. That the comparison names exactly two serves
 * and names them by their number in the clip rather than their place in the
 * array; that going back for one serve's pictures costs six seeks and a basket
 * therefore costs twelve however many serves it holds; and that a still
 * captured from a finished report is drawn in the same space as one captured
 * during the analysis, which is the thing that would break silently and look
 * like a tracking bug rather than a plumbing one.
 *
 * WHAT THIS CANNOT SEE. That `analyzeAllServes` actually passes
 * `skipThumbnails: true` down to each serve — that call needs a decoder, a
 * landmarker and a real clip, which is the same block `NEXT.md` records against
 * the fixture shoot. The saving is pinned here as arithmetic over the pieces;
 * the wiring between them is read, not run.
 */
import { bandsFor, captureServeStills, keyframeOverlay, rawSpaceOf, MAX_CONSISTENCY_SERVES } from '../analyze'
import { pairStills, servesInGap } from '../consistency'
import { buildPhases, detectServe } from '../phases'
import { buildServe } from '../syntheticServe'
import type { ServeGap } from '../consistency'
import type { Analysis, Fundamental } from '../types'
import { assert, check, heading, note, report } from './harness'

const FPS = 50

/**
 * A canvas context that accepts anything and records nothing.
 *
 * `drawing.test.ts` has a stub that records strokes, because what it checks is
 * what was drawn. Nothing here cares: the claim is about how many times the
 * video was seeked, so the drawing only has to not throw. A proxy rather than a
 * hand-written stub so a new call inside `drawSkeleton` cannot fail this file
 * for a reason that has nothing to do with what it is checking.
 *
 * `measureText` is the one exception and has to answer properly. The callouts
 * size their plate from it and then read `.width` off the result, so a no-op
 * returning `undefined` is not a permissive stub — it is a crash, and one that
 * would look like a bug in the overlay rather than in this file.
 */
function anyContext(): CanvasRenderingContext2D {
  return new Proxy(
    {},
    {
      get: (target: Record<string, unknown>, key: string) => {
        if (key in target) return target[key]
        if (key === 'measureText') return (t: string) => ({ width: String(t).length * 7 })
        return () => undefined
      },
      set: (target: Record<string, unknown>, key: string, value: unknown) => {
        target[key] = value
        return true
      },
    },
  ) as unknown as CanvasRenderingContext2D
}

/** Enough of a `<video>`, a canvas and a `document` to count seeks. */
function stubHost() {
  const seeks: number[] = []
  const listeners = new Map<string, (() => void)[]>()
  let currentTime = 0

  const video = {
    duration: 30,
    videoWidth: 480,
    videoHeight: 640,
    get currentTime() {
      return currentTime
    },
    set currentTime(t: number) {
      currentTime = t
      seeks.push(t)
      queueMicrotask(() => {
        for (const fn of listeners.get('seeked') ?? []) fn()
      })
    },
    addEventListener(name: string, fn: () => void) {
      listeners.set(name, [...(listeners.get(name) ?? []), fn])
    },
    removeEventListener(name: string, fn: () => void) {
      listeners.set(name, (listeners.get(name) ?? []).filter((f) => f !== fn))
    },
  }

  const canvas = {
    width: 0,
    height: 0,
    getContext: () => anyContext(),
    toDataURL: () => 'data:image/jpeg;base64,stub',
  }

  const previous = (globalThis as { document?: unknown }).document
  ;(globalThis as { document?: unknown }).document = { createElement: () => canvas }

  return {
    video: video as unknown as HTMLVideoElement,
    seeks,
    restore: () => {
      ;(globalThis as { document?: unknown }).document = previous
    },
  }
}

/** One measured serve, real enough for the overlay to draw it. */
function serveAt(indexInClip: number, count: number, overall: number): Analysis {
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  const fundamentals: Fundamental[] = [
    {
      id: 'swing',
      label: 'Swing',
      score: overall,
      metrics: [
        { id: 'dropDepth', label: 'Racket drop', score: overall, value: 1, ideal: [0, 2] },
        // Hedged, so `bandsFor` must leave it out — a dial is more convincing
        // than the word "about" printed beside it.
        { id: 'contactHeight', label: 'Contact height', score: 90, value: 1, ideal: [0, 2], confidence: 0.2 },
      ],
    } as unknown as Fundamental,
  ]
  return {
    frames,
    phases: buildPhases(frames, skel.keys),
    fundamentals,
    handedness: skel.racket,
    overall,
    scale: { bodyHeight: skel.bodyHeight, groundY: skel.groundY },
    serves: { count, index: indexInClip },
  } as unknown as Analysis
}

/* --------------------------------------------------- which two, and by what */

heading('Which serves in a basket are worth going back for')

const basket = [0, 1, 2, 3, 4, 5].map((i) => serveAt(i, 6, 50 + i * 5))
const gap: ServeGap = {
  best: 6,
  worst: 1,
  bestScore: 75,
  worstScore: 50,
  differences: [],
} as unknown as ServeGap

check('the comparison names exactly two serves, however big the basket', () => {
  for (const size of [2, 4, 6]) {
    const serves = Array.from({ length: size }, (_, i) => serveAt(i, size, 50 + i))
    const named = servesInGap(serves, { ...gap, best: size, worst: 1 })
    assert(named !== undefined, `a basket of ${size} named no pair at all`)
    assert(named!.length === 2, `a basket of ${size} named ${named!.length} serves`)
  }
})

check('serves are found by their number in the clip, not their place in the array', () => {
  // The reason `servesInGap` exists rather than an index lookup: a sweep skips
  // a serve it could not read and covers only the last few of a long basket, so
  // the third entry is routinely not the third serve.
  const late = [3, 4, 5].map((i) => serveAt(i, 8, 50 + i))
  const named = servesInGap(late, { ...gap, best: 6, worst: 4 })
  assert(named !== undefined, 'found neither serve in a sweep that started at serve 4')
  assert(named![0].serves.index === 5, `best was serve index ${named![0].serves.index}, expected 5`)
  assert(named![1].serves.index === 3, `worst was serve index ${named![1].serves.index}, expected 3`)
})

check('a gap naming a serve that was never measured pairs nothing', () => {
  assert(
    servesInGap(basket, { ...gap, best: 99, worst: 1 }) === undefined,
    'claimed a pair from a serve that is not in the sweep',
  )
})

/* ------------------------------------------------------------- what it costs */

heading('What the pictures cost')

const host = stubHost()
let oneServeSeeks = 0
let pairSeeks = 0
try {
  const [best, worst] = servesInGap(basket, gap)!
  const before = host.seeks.length
  await captureServeStills(host.video, best, 0.75)
  oneServeSeeks = host.seeks.length - before
  await captureServeStills(host.video, worst, 0.75)
  pairSeeks = host.seeks.length - before
} finally {
  host.restore()
}

check('one serve costs one seek per keyframe and no more', () => {
  assert(
    oneServeSeeks === basket[0].phases.length,
    `${oneServeSeeks} seeks for ${basket[0].phases.length} keyframes`,
  )
})

check('a whole basket costs two serves of seeks, not six', () => {
  // The saving, stated as the arithmetic rather than as a remembered number.
  // Every serve used to pay `oneServeSeeks`; now exactly the two the comparison
  // names do, whatever `MAX_CONSISTENCY_SERVES` is set to.
  const wasteful = MAX_CONSISTENCY_SERVES * oneServeSeeks
  note(`${pairSeeks} seeks where the sweep used to spend ${wasteful}`)
  assert(pairSeeks === 2 * oneServeSeeks, `a pair cost ${pairSeeks}, expected ${2 * oneServeSeeks}`)
  assert(pairSeeks < wasteful, 'capturing only the named pair saved nothing')
})

check('the stills captured are the ones the strip then shows', () => {
  // The two halves have to agree about which serves they mean. They agree by
  // being one lookup — if they ever stop, the strip renders empty boxes for a
  // serve whose pictures were taken.
  const strip = pairStills(basket, gap)
  assert(strip !== undefined, 'no strip was built from the two serves just captured')
  assert(strip!.positions.length > 0, 'the strip has no positions in it')
  assert(
    strip!.positions.every((p) => p.best && p.worst),
    'a row came back with a picture missing on one side',
  )
})

check('the four serves nobody asked about were never pictured', () => {
  // The whole point, stated from the other end: everything outside the pair
  // still has no thumbnail on any phase.
  const untouched = basket.filter((a) => a.serves.index !== 5 && a.serves.index !== 0)
  assert(untouched.length === 4, `expected 4 unpaired serves, found ${untouched.length}`)
  for (const serve of untouched) {
    assert(
      serve.phases.every((p) => !p.thumbnail),
      `serve ${serve.serves.index} was given pictures nothing shows`,
    )
  }
})

/* ------------------------------------------- the same picture, either route */

heading('A still captured afterwards is the same still')

check('hedged measurements get no target dial, whichever route drew them', () => {
  const bands = bandsFor(basket[0].fundamentals)
  assert('dropDepth' in bands, 'a trusted measurement lost its dial')
  assert(
    !('contactHeight' in bands),
    'a hedged measurement was given a dial — a diagram outweighs the word "about" beside it',
  )
})

check('a clip that needed no levelling is handed back untouched', () => {
  // Identity rather than a copy, deliberately: most clips need no correction,
  // and rebuilding every frame for them would be the levelling cost paid by
  // the clips that avoided it.
  const raw = rawSpaceOf(basket[0], 0.75)
  assert(raw.frames === basket[0].frames, 'an untilted clip had its frames rebuilt')
  assert(raw.ball === basket[0].ball, 'an untilted clip had its ball rebuilt')
})

check('a levelled clip is rotated back before anything is drawn on it', () => {
  // The failure this prevents looks like a tracking bug rather than a plumbing
  // one: a still is unrotated video pixels, so a levelled skeleton drawn over
  // it sits off the body by exactly the roll that was corrected.
  const tilted = {
    ...basket[0],
    tilt: { roll_deg: 8, cx: 0.5, cy: 0.5 },
  } as unknown as Analysis
  const raw = rawSpaceOf(tilted, 0.75)
  assert(raw.frames !== tilted.frames, 'a tilted clip was drawn in the levelled space')
  const moved = raw.frames.some((f, i) =>
    f.image.some((l, j) => Math.abs(l.x - tilted.frames[i].image[j].x) > 1e-9),
  )
  assert(moved, 'the rotation back produced identical landmarks')
})

check('the overlay refuses nothing it is handed — one definition, two callers', () => {
  // `keyframeOverlay` is the shape that stops the analysis path and the sweep
  // path becoming two copies of one drawing call, which is what
  // `readOutboundFlight` had to be rescued from: a formula written twice,
  // tested once, agreeing at exactly one camera angle.
  const serve = basket[0]
  const decorate = keyframeOverlay({
    frames: serve.frames,
    ball: undefined,
    phases: serve.phases,
    aspect: 0.75,
    racket: serve.handedness,
    bodyHeight: serve.scale.bodyHeight,
    bands: bandsFor(serve.fundamentals),
  })
  for (let i = 0; i < serve.phases.length; i++) {
    decorate(anyContext(), i, { w: 315, h: 420 })
  }
  note(`drew ${serve.phases.length} keyframes through the shared overlay`)
})

report()
