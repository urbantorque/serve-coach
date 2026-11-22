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
import type { Frame } from '../types'
import { assert, check, heading, note, report } from './harness'

const FPS = 50

/** Records the calls a canvas context receives, and nothing else. */
function recordingContext() {
  const strokes: { from: [number, number]; to: [number, number]; dashed: boolean; style: string; alpha: number }[] = []
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
  /** One entry per rasterised path — see `stroke()` below for why. */
  const passes: { style: string; dashed: boolean }[] = []

  const ctx = {
    strokeStyle: '',
    fillStyle: '',
    globalAlpha: 1,
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
        alpha: ctx.globalAlpha,
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
      /*
       * The style at the moment the path is rasterised, which is not the style
       * when its segments were appended.
       *
       * `strokes` above records `strokeStyle` at `lineTo` time, and for anything
       * that builds a whole path and then colours it — the ghosts do, and so does
       * every two-pass dark-edge stroke in the file — that is the *previous*
       * element's colour, or the empty string on the first path of a frame. Fine
       * for asserting geometry, useless for asserting ink, and the difference
       * only shows up when something actually checks a colour.
       */
      passes.push({ style: String(ctx.strokeStyle), dashed: dash.length > 0 })
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

  return { ctx, strokes, arcs, texts, passes, calls: () => ({ strokeCalls, pathsBegun }) }
}

/** Rig frames as a tracker reports them: no racket of their own. */
const tracked = (frames: Frame[]): Frame[] => frames.map(({ racket: _racket, ...f }) => (void _racket, f))

const W = 480
const H = 640

function drawOnce(options: Partial<Parameters<typeof drawSkeleton>[1]> = {}) {
  // Stands in for a tracked serve, so without the racket the rig places for
  // drawing models (L4.4): a tracked frame has to have its racket estimated.
  const frames = tracked(buildServe({}, FPS))
  const skel = detectServe(frames, FPS)
  const { ctx, strokes, arcs, texts, passes, calls } = recordingContext()
  drawSkeleton(ctx as unknown as CanvasRenderingContext2D, {
    frame: frames[skel.keys.trophy],
    aspect: 1,
    rect: fitContain(W, H, 1),
    racket: skel.racket,
    bodyHeight: skel.bodyHeight,
    sequence: { frames, index: skel.keys.trophy },
    ...options,
  })
  return { strokes, arcs, texts, passes, frames, skel, calls: calls() }
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

check('the diagram in the plate is a limb, and it is the one being judged', () => {
  /*
   * What replaced the arc, and the reason it is worth a test of its own.
   *
   * The dial used to be a 180° sweep with the band shaded and the reading
   * ticked. Honest, and useless to the person reading it: a club player has to
   * convert a fraction of a sweep into a knee before it tells them anything.
   * `targetShape.ts` now supplies the two bones either side of the joint at the
   * angle that was measured, and the same pair dashed at the middle of the band.
   *
   * Two things have to hold for that to be an improvement rather than
   * decoration. The drawing has to MOVE with the measurement — a figure that
   * looked the same at every knee angle would be an arc with extra steps — and
   * the target half has to stay dashed, which is the only thing separating it
   * from a second, equally confident limb the player never produced.
   */
  const drawn = drawOnce({ annotation: 'trophy', bands: { kneeBend: [30, 60] } })
  const bare = drawOnce({ annotation: 'trophy' })

  // The dashed strokes are the target limb. Nothing else on a keyframe still is
  // dashed — the ghost is not passed here — so their presence is the diagram's.
  const dashed = drawn.strokes.filter((s) => s.dashed)
  assert(dashed.length > 0, 'the target limb was drawn solid, so it reads as a second measurement')
  assert(
    bare.strokes.filter((s) => s.dashed).length === 0,
    'something was already drawing dashed without a band, so this check proves nothing',
  )

  /*
   * And the two limbs disagree by as much as the two numbers do.
   *
   * This is the claim the whole diagram rests on, and it is NOT the same as
   * "the drawing changes when the band changes". Both figures are fitted into
   * one box together — they have to be, or a 20° bend and a 50° one each fill
   * their own box and come out looking alike — and a shared fit normalises away
   * the absolute size. What survives it, and what a player actually reads, is
   * the GAP between the solid limb and the dashed one.
   *
   * So: park the same serve against three bands. Asked for what it already
   * does, the two limbs should land on top of each other; asked for something
   * far away, they should separate. The rig's trophy knee sits near 47°.
   *
   * The pairing leans on draw order, which `drawShapeDial` fixes deliberately —
   * the target goes down first and dashed, the player's own on top and solid, so
   * the body is never underneath its own correction. The two segments after the
   * last dashed one are therefore the solid limb.
   */
  const gapAgainst = (band: [number, number]) => {
    const s = drawOnce({ annotation: 'trophy', bands: { kneeBend: band } }).strokes
    const last = s.map((x) => x.dashed).lastIndexOf(true)
    assert(last >= 1 && last + 2 < s.length, 'the plate did not draw a dashed pair and a solid pair')
    const target = [s[last - 1], s[last]]
    const yours = [s[last + 1], s[last + 2]]
    assert(!yours[0].dashed && !yours[1].dashed, 'the player’s own limb came out dashed')
    /*
     * The two FREE ends, which is where an angle shows.
     *
     * `lines` is `[[a, b], [b, c]]` with `b` the joint, so `b` is the same point
     * in both figures by construction — they share an origin. Averaging it in
     * would halve every reading for no reason and quietly make the diagram look
     * half as expressive as it is.
     */
    const ends = (pair: typeof yours): [number, number][] => [pair[0].from, pair[1].to]
    const [ay, cy] = ends(yours)
    const [at, ct] = ends(target)
    // Measured against the drawn bone rather than in pixels: both figures are
    // fitted into the plate together, so the absolute size is whatever the box
    // was, and "a third of a thigh apart" is a claim that survives a change of
    // plate size while "eight pixels apart" is not.
    const bone = Math.hypot(yours[0].to[0] - yours[0].from[0], yours[0].to[1] - yours[0].from[1])
    return (
      (Math.hypot(ay[0] - at[0], ay[1] - at[1]) + Math.hypot(cy[0] - ct[0], cy[1] - ct[1])) /
      2 /
      Math.max(1e-6, bone)
    )
  }

  const asIs = gapAgainst([44, 50])
  const straighter = gapAgainst([2, 6])
  const deeper = gapAgainst([82, 88])
  assert(
    asIs < 0.06,
    `a target the player is already at drew a limb ${(asIs * 100).toFixed(0)}% of a bone from ` +
      'their own, so the picture invents a correction on a serve that needs none',
  )
  assert(
    straighter > 0.3 && deeper > 0.3,
    `a target far from the reading separated by only ${(Math.min(straighter, deeper) * 100).toFixed(0)}% ` +
      'of a bone, so the plate is not showing the difference it exists for',
  )
  note(
    `  measured ~47°: the target limb sits ${(asIs * 100).toFixed(0)}% of a bone away for a band ` +
      `at 47, ${(straighter * 100).toFixed(0)}% for one at 4 and ${(deeper * 100).toFixed(0)}% for one at 85`,
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
  const frames = tracked(buildServe({}, FPS)).map((f) => ({
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

/* ------------------------------------------------- the other serve, dashed -- */

heading('Another of your own serves, drawn under this one')

/**
 * A paired body as `pairTracks` hands one over: every landmark above the hips
 * populated, every one below it `null`.
 *
 * Built by hand rather than by running the pairing, because what is under test
 * here is what the *drawing* does with the holes. Whether the holes are in the
 * right places is `trackPair.test.ts`'s question and is answered there.
 */
function pairedBody(): ({ x: number; y: number } | null)[] {
  const below = new Set<number>([
    LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle,
    LM.leftHeel, LM.rightHeel, LM.leftToe, LM.rightToe,
  ])
  return Array.from({ length: 33 }, (_, i) =>
    below.has(i) ? null : { x: 0.4 + (i % 5) * 0.03, y: 0.15 + (i % 7) * 0.04 },
  )
}

check('the studio’s ghost control draws the other serve at its strength, and not at all when off (W6.3)', () => {
  const half = drawOnce({ paired: pairedBody(), pairedAlpha: 0.5 }).strokes.filter((st) => st.dashed)
  assert(half.length > 0 && half.every((st) => Math.abs(st.alpha - 0.5) < 1e-9), `the half ghost drew at ${half.map((st) => st.alpha).join(', ')}`)
  const off = drawOnce({ paired: pairedBody(), pairedAlpha: 0 }).strokes.filter((st) => st.dashed)
  assert(off.length === 0, `an "off" ghost still drew ${off.length} dashed lines`)
})

check('the other serve is drawn dashed, so it can never read as a tracked body', () => {
  const { strokes, passes } = drawOnce({ paired: pairedBody() })
  assert(strokes.some((s) => s.dashed), 'the paired body drew no dashed line at all')

  /*
   * Both halves of the distinction, and both are load-bearing. `PALETTE.ghost`
   * is `neutral` held back, so a *solid* line of it is exactly what a
   * lightly-tracked limb looks like — dashed is what stops a player reading
   * their own last serve as a measurement of this one. Read off `passes` rather
   * than `strokes`, because the colour is set after the path is built.
   */
  const dashed = passes.filter((p) => p.dashed)
  assert(dashed.length > 0, 'nothing was rasterised while the dash was on')
  for (const p of dashed) {
    assert(
      /rgba\(238, 242, 246, 0\.38\)|rgba\(0, 0, 0, 0\.45\)/.test(p.style),
      `a dashed path was rasterised in ${p.style || '(no colour set)'}, not the ghost's own ink`,
    )
  }
  // The accent is the answer to "which arm am I meant to be watching", and a
  // second body wearing any of it would take that answer away.
  assert(
    !dashed.some((p) => /205, 249, 74/.test(p.style)),
    'the other serve was drawn in the accent',
  )
})

check('nothing is drawn below the hips, however the caller filled the array', () => {
  const { strokes, arcs } = drawOnce({ paired: pairedBody() })
  const plain = drawOnce()
  /*
   * The check that matters, and it is a count rather than a coordinate: the
   * ghost's bone list stops at the hip line, so adding a paired body may add
   * exactly the torso, the two arms and one head — eight bones and one arc — and
   * nothing knee-shaped. A leg drawn here would be inviting a player to watch
   * noise, per the 0.0387-against-0.0341 measurement in `poseTrack.ts`.
   */
  const added = strokes.filter((s) => s.dashed).length
  assert(added === 8, `the paired body drew ${added} bones, not the eight above the hips`)
  assert(
    arcs.length === plain.arcs.length + 1,
    `the paired body drew ${arcs.length - plain.arcs.length} arcs, not the one head`,
  )
})

check('a body with holes above the hips drops those bones and keeps the rest', () => {
  // Reachable: `pairTracks` returns the whole array and a caller could hand over
  // a body from a track that lost a wrist. A bone with one end missing must not
  // be drawn to a null and must not take its neighbours with it.
  const holed = pairedBody()
  holed[LM.leftWrist] = null
  const { strokes } = drawOnce({ paired: holed })
  const dashed = strokes.filter((s) => s.dashed)
  assert(dashed.length === 7, `losing one wrist cost ${8 - dashed.length} bones, not one`)
  for (const s of dashed) {
    assert(
      finite(s.from[0]) && finite(s.from[1]) && finite(s.to[0]) && finite(s.to[1]),
      `a bone was drawn to a missing landmark: ${JSON.stringify(s)}`,
    )
  }
})

check('the dash is put back before anything tracked is drawn', () => {
  /*
   * The failure this catches is silent and total: `setLineDash` is context
   * state, so leaving it on would draw the player's own body dashed as well —
   * the one thing the ghost's whole treatment exists to prevent — and every
   * check above would still pass, because they only ever look at the dashed
   * strokes.
   */
  const { strokes } = drawOnce({ paired: pairedBody() })
  const solid = strokes.filter((s) => !s.dashed)
  assert(solid.length > 0, 'every line on the frame came out dashed')
  const plain = drawOnce()
  assert(
    solid.length === plain.strokes.filter((s) => !s.dashed).length,
    `the tracked body lost ${plain.strokes.filter((s) => !s.dashed).length - solid.length} solid lines to the ghost`,
  )
})

check('no paired body means no extra drawing at all', () => {
  const { strokes } = drawOnce()
  assert(
    strokes.every((s) => !s.dashed),
    'something drew dashed on a report with no second serve to compare against',
  )
})

report()
