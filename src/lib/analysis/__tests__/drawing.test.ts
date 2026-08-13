/**
 * The overlay drawing, checked without a browser.
 *
 * `drawSkeleton` is the one piece of this app that is only ever exercised by
 * looking at it, and it is also the piece a player looks at most — it is what
 * the keyframe stills carry, and those outlive the video. A recording stub
 * standing in for a canvas context is enough to assert the things that actually
 * go wrong: a limb drawn to a landmark that was never populated, or a racket drawn
 * from knuckles nobody could see.
 */
import { LM } from '../geometry'
import { detectServe } from '../phases'
import { drawSkeleton, fitContain } from '../../pose/skeleton'
import { buildServe } from '../syntheticServe'
import { assert, check, heading, note, report } from './harness'

const FPS = 50

/** Records the calls a canvas context receives, and nothing else. */
function recordingContext() {
  const strokes: { from: [number, number]; to: [number, number]; dashed: boolean; style: string }[] = []
  const arcs: { x: number; y: number; r: number; style: string }[] = []
  const texts: string[] = []
  let dash: number[] = []
  let current: [number, number] = [0, 0]
  /**
   * How many times the expensive calls fired — the ones that make the browser
   * actually rasterise a path, as opposed to `lineTo`, which only appends to
   * one already being built. See "Frame budget on a long clip" below: this is
   * what a trail or a flight path bucketed into a fixed number of strokes
   * costs, independent of how many points went into building each stroke.
   */
  let strokeCalls = 0
  let pathsBegun = 0

  const ctx = {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    lineCap: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    clearRect() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    beginPath() {
      pathsBegun++
    },
    closePath() {},
    moveTo(x: number, y: number) {
      current = [x, y]
    },
    lineTo(x: number, y: number) {
      strokes.push({
        from: current,
        to: [x, y],
        dashed: dash.length > 0,
        style: String(ctx.strokeStyle),
      })
      current = [x, y]
    },
    arc(x: number, y: number, r: number) {
      arcs.push({ x, y, r, style: String(ctx.strokeStyle || ctx.fillStyle) })
    },
    ellipse(x: number, y: number, r: number) {
      arcs.push({ x, y, r, style: String(ctx.strokeStyle) })
    },
    arcTo() {},
    setLineDash(d: number[]) {
      dash = d
    },
    stroke() {
      strokeCalls++
    },
    fill() {},
    // The callout draws its plate as a solid rectangle now — text on bare
    // footage is unreadable, so every label sits on one. The stub records no
    // fills, but it has to accept them or the callout tests die on the plate
    // before they ever reach the words they are checking.
    fillRect() {},
    strokeRect() {},
    fillText(text: string) {
      texts.push(String(text))
    },
    measureText: (t: string) => ({ width: String(t).length * 7 }),
  }

  return { ctx, strokes, arcs, texts, calls: () => ({ strokeCalls, pathsBegun }) }
}

const W = 480
const H = 640

function drawOnce(options: Partial<Parameters<typeof drawSkeleton>[1]> = {}) {
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  const { ctx, strokes, arcs, texts, calls } = recordingContext()
  drawSkeleton(ctx as unknown as CanvasRenderingContext2D, {
    frame: frames[skel.keys.trophy],
    aspect: 1,
    rect: fitContain(W, H, 1),
    racket: skel.racket,
    bodyHeight: skel.bodyHeight,
    sequence: { frames, index: skel.keys.trophy },
    ...options,
  })
  return { strokes, arcs, texts, frames, skel, calls: calls() }
}

const finite = (n: number) => Number.isFinite(n)

heading('Drawing the tracked body')

check('every line drawn lands somewhere real', () => {
  const { strokes } = drawOnce()
  assert(strokes.length > 0, 'nothing was drawn at all')
  for (const s of strokes) {
    assert(
      finite(s.from[0]) && finite(s.from[1]) && finite(s.to[0]) && finite(s.to[1]),
      `a line was drawn to a non-finite point: ${JSON.stringify(s)}`,
    )
  }
  note(`${strokes.length} line segments on a clean trophy frame`)
})

check('nothing is drawn outside the video rectangle', () => {
  const { strokes } = drawOnce()
  const rect = fitContain(W, H, 1)
  // A generous margin: the racket estimate legitimately reaches past the body,
  // and a hand near the edge of frame puts it past the edge of the picture.
  const pad = Math.max(rect.dw, rect.dh) * 0.5
  for (const s of strokes) {
    for (const [x, y] of [s.from, s.to]) {
      assert(
        x > rect.ox - pad && x < rect.ox + rect.dw + pad && y > rect.oy - pad && y < rect.oy + rect.dh + pad,
        `a line ran far outside the picture: (${x.toFixed(0)}, ${y.toFixed(0)})`,
      )
    }
  }
})

check('the keyframe callout names a body position, not a number', () => {
  const { texts } = drawOnce({ annotation: 'trophy' })
  assert(texts.length > 0, 'the callout drew no text at all')
  const value = texts[0]
  note(`callout reads "${value}"`)
  assert(!/\d/.test(value), `the callout still shows a number: "${value}"`)
  assert(!/[°×%]/.test(value), `the callout still shows a unit: "${value}"`)
  // The trophy callout is judged on knee bend, and the synthetic serve loads its
  // legs properly — so it has to come back as a load, not as straight legs.
  assert(/load|bent|squat/i.test(value), `the trophy callout reads "${value}"`)
  assert(
    texts.some((t) => t.toUpperCase() === 'KNEE BEND'),
    'the callout no longer says which joint it is describing',
  )
})

check('the callout is anchored to the joint it describes', () => {
  const plain = drawOnce().strokes.length
  const annotated = drawOnce({ annotation: 'contact' }).strokes.length
  assert(annotated > plain, 'the callout drew no leader line back to the body')
})

check('a target dial is drawn only for a measurement that was handed a band', () => {
  // The gate that keeps a hedged measurement from getting a picture. Confidence
  // lives at the caller, so the caller withholds the band — and this is what
  // says the drawing side honours that rather than reaching for a default.
  const bare = drawOnce({ annotation: 'trophy' }).strokes.length
  const dialled = drawOnce({ annotation: 'trophy', bands: { kneeBend: [30, 60] } }).strokes.length
  assert(dialled > bare, 'a band was supplied and nothing extra was drawn')

  const unrelated = drawOnce({
    annotation: 'trophy',
    bands: { armExtension: [160, 180] },
  }).strokes.length
  assert(
    unrelated === bare,
    'a band for a different measurement drew a dial on this keyframe anyway',
  )
})

check('the dial never claims the arc on the body is the measurement', () => {
  /*
   * The reason this is a dial in the plate and not a wedge at the joint.
   *
   * The arc at the joint is drawn between two limb directions in image space;
   * the number beside it is `jointAngle` of the world landmarks. Those differ by
   * the projection `geometry.ts` refuses to reason about — side-on, a real 20°
   * of shoulder tilt reads as 60°+. Shading a band across that arc would turn a
   * pointer into a measurement.
   *
   * So: whatever the band says, the arc at the joint is unchanged. Only the
   * plate grows.
   */
  const narrow = drawOnce({ annotation: 'trophy', bands: { kneeBend: [30, 35] } })
  const wide = drawOnce({ annotation: 'trophy', bands: { kneeBend: [5, 175] } })
  assert(
    narrow.strokes.length === wide.strokes.length,
    'the number of strokes moved with the band, so something is being scaled by it at the joint',
  )
})

check('the racket is drawn when the hand is visible', () => {
  const withRacket = drawOnce().strokes.length
  const withoutBodyHeight = drawOnce({ bodyHeight: undefined }).strokes.length
  note(`${withRacket} segments with the racket, ${withoutBodyHeight} without`)
  assert(
    withRacket > withoutBodyHeight,
    'supplying a body height drew no racket',
  )
})

check('no racket is drawn when the knuckles are lost', () => {
  const frames = buildServe({}, FPS).map((f) => ({
    ...f,
    image: f.image.map((l, i) =>
      ([LM.leftIndex, LM.rightIndex, LM.leftPinky, LM.rightPinky] as number[]).includes(i)
        ? { ...l, visibility: 0.02 }
        : l,
    ),
  }))
  const skel = detectServe(frames, FPS)
  const { ctx, strokes } = recordingContext()
  drawSkeleton(ctx as unknown as CanvasRenderingContext2D, {
    frame: frames[skel.keys.trophy],
    aspect: 1,
    rect: fitContain(W, H, 1),
    racket: skel.racket,
    bodyHeight: skel.bodyHeight,
    sequence: { frames, index: skel.keys.trophy },
  })
  const visible = drawOnce().strokes.length
  assert(strokes.length < visible, 'a racket was drawn from knuckles nobody could see')
})

heading('Drawing the ball')

check('the ball flight is drawn as one smooth curve, not a dashed raw path', () => {
  const rect = fitContain(W, H, 1)
  const path = Array.from({ length: 8 }, (_, i) => ({ x: 0.3 + i * 0.04, y: 0.2 + i * 0.03 }))
  const withoutBall = drawOnce().strokes.length
  const { arcs, strokes } = drawOnce({ ball: { x: 0.45, y: 0.3, path } })
  const dashed = strokes.filter((s) => s.dashed)
  assert(dashed.length === 0, 'the flight arc is still drawn dashed, like a polyline through raw samples')
  assert(
    strokes.length - withoutBall >= path.length - 1,
    'the flight arc was not drawn as a continuous run of segments',
  )
  const marker = arcs.find(
    (a) => Math.abs(a.x - (rect.ox + 0.45 * rect.dw)) < 1 && Math.abs(a.y - (rect.oy + 0.3 * rect.dh)) < 1,
  )
  assert(marker !== undefined, 'no ball marker was drawn at the requested position')
})

heading('Frame budget on a long clip')

/**
 * Falls back to `Date.now()` where `performance` is not a global — see the
 * same guard in `diagnose.ts`. Millisecond precision is coarse for timing a
 * single draw call, which is exactly why the check below reads the stroke
 * count as the real evidence and the timing only as a sanity check on it.
 */
const timeNow = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()

/**
 * Every trail-drawing call `PosePlayer` makes, at whatever sampled-frame
 * count a clip produced — never per-segment, always the same six buckets
 * doubled for the underlay. Built directly rather than through `drawOnce`
 * because the point is varying `fps`, which decides how many *sampled*
 * frames land inside the same swing: the honest stand-in for "a longer
 * clip", since `PosePlayer` only ever plays back the detected serve, not
 * the whole original recording behind it.
 */
function trailCost(fps: number) {
  const frames = buildServe({}, fps)
  const skel = detectServe(frames, fps)
  const { ctx, calls } = recordingContext()
  const started = timeNow()
  drawSkeleton(ctx as unknown as CanvasRenderingContext2D, {
    frame: frames[skel.keys.trophy],
    aspect: 1,
    rect: fitContain(W, H, 1),
    racket: skel.racket,
    bodyHeight: skel.bodyHeight,
    sequence: { frames, index: skel.keys.trophy },
    trail: { frames, from: 0, to: frames.length - 1 },
  })
  return { frameCount: frames.length, ms: timeNow() - started, strokeCalls: calls().strokeCalls }
}

check('the trail costs the same strokes on ten times the sampled frames', () => {
  const short = trailCost(30)
  const long = trailCost(300)
  note(`${short.frameCount} frames: ${short.strokeCalls} strokes, ${short.ms.toFixed(2)}ms`)
  note(`${long.frameCount} frames: ${long.strokeCalls} strokes, ${long.ms.toFixed(2)}ms`)
  assert(
    long.frameCount > short.frameCount * 5,
    `the long case is not actually longer — ${long.frameCount} vs ${short.frameCount} frames proves nothing`,
  )
  assert(
    long.strokeCalls === short.strokeCalls,
    `trail strokes scaled with frame count instead of staying bucketed: ${short.strokeCalls} strokes at ${short.frameCount} frames, ${long.strokeCalls} at ${long.frameCount}`,
  )
})

check('a ball flight ten times as long still buckets into the same stroke count', () => {
  const short = drawOnce({
    ball: { x: 0.45, y: 0.3, path: Array.from({ length: 33 }, (_, i) => ({ x: 0.2 + i * 0.002, y: 0.3 + i * 0.001 })) },
  }).calls
  const long = drawOnce({
    ball: { x: 0.45, y: 0.3, path: Array.from({ length: 330 }, (_, i) => ({ x: 0.2 + i * 0.0002, y: 0.3 + i * 0.0001 })) },
  }).calls
  note(`33-point flight: ${short.strokeCalls} strokes; 330-point flight: ${long.strokeCalls} strokes`)
  assert(
    long.strokeCalls === short.strokeCalls,
    `flight strokes scaled with path length instead of staying bucketed: ${short.strokeCalls} vs ${long.strokeCalls}`,
  )
})

check('a full overlay — trail, ghost, racket and flight together — costs the same strokes at any clip length', () => {
  /*
   * Everything switched on at once, at ten times the sampled frames, so a
   * regression in one drawer cannot hide behind another staying flat. Stroke
   * count is the evidence asserted on; a real canvas's rasterising cost lives
   * in that call, not in how the path leading up to it was built. Timing was
   * tried here too and dropped: this stub allocates an object and stringifies
   * a colour on every `lineTo`, which no real canvas does, and that bookkeeping
   * cost swamped the sub-millisecond durations involved — measured at
   * anywhere from 2x to 5x across otherwise identical runs, noise wide enough
   * to make a timing assertion here worse than no check at all. `note`d
   * instead, for a human reading a failure to have context, not asserted on.
   */
  const draw = (fps: number) => {
    const frames = buildServe({}, fps)
    const skel = detectServe(frames, fps)
    const { ctx, calls } = recordingContext()
    const started = timeNow()
    drawSkeleton(ctx as unknown as CanvasRenderingContext2D, {
      frame: frames[skel.keys.contact],
      aspect: 1,
      rect: fitContain(W, H, 1),
      racket: skel.racket,
      bodyHeight: skel.bodyHeight,
      sequence: { frames, index: skel.keys.contact },
      trail: { frames, from: 0, to: frames.length - 1 },
      annotation: 'contact',
      ball: {
        x: 0.45,
        y: 0.3,
        path: Array.from({ length: 33 }, (_, i2) => ({ x: 0.2 + i2 * 0.002, y: 0.3 + i2 * 0.001 })),
      },
    })
    return { frameCount: frames.length, strokeCalls: calls().strokeCalls, ms: timeNow() - started }
  }

  const short = draw(30)
  const long = draw(300)
  note(`${short.frameCount} frames: ${short.strokeCalls} strokes, ${short.ms.toFixed(3)}ms (informational)`)
  note(`${long.frameCount} frames: ${long.strokeCalls} strokes, ${long.ms.toFixed(3)}ms (informational)`)
  assert(
    long.strokeCalls === short.strokeCalls,
    `the combined overlay's strokes scaled with frame count instead of staying bucketed: ${short.strokeCalls} at ${short.frameCount} frames, ${long.strokeCalls} at ${long.frameCount}`,
  )
})

report()
