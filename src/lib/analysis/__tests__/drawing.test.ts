/**
 * The overlay drawing, checked without a browser.
 *
 * `drawSkeleton` is the one piece of this app that is only ever exercised by
 * looking at it, and it is also the piece a player looks at most — it is what
 * the keyframe stills carry, and those outlive the video. A recording stub
 * standing in for a canvas context is enough to assert the things that actually
 * go wrong: a limb drawn to a landmark that was never populated, a racket drawn
 * from knuckles nobody could see, or a reference pose quietly not drawn at all.
 */
import { LM } from '../geometry'
import { modelPoseAt } from '../modelServe'
import { detectServe } from '../phases'
import { drawSkeleton, fitContain } from '../../pose/skeleton'
import { buildServe } from './syntheticServe'
import { assert, check, heading, note, report } from './harness'

const FPS = 50

/** Records the calls a canvas context receives, and nothing else. */
function recordingContext() {
  const strokes: { from: [number, number]; to: [number, number]; dashed: boolean; style: string }[] = []
  const arcs: { x: number; y: number; r: number; style: string }[] = []
  const texts: string[] = []
  let dash: number[] = []
  let current: [number, number] = [0, 0]

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
    beginPath() {},
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
    stroke() {},
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

  return { ctx, strokes, arcs, texts }
}

const W = 480
const H = 640

function drawOnce(options: Partial<Parameters<typeof drawSkeleton>[1]> = {}) {
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  const { ctx, strokes, arcs, texts } = recordingContext()
  drawSkeleton(ctx as unknown as CanvasRenderingContext2D, {
    frame: frames[skel.keys.trophy],
    aspect: 1,
    rect: fitContain(W, H, 1),
    racket: skel.racket,
    bodyHeight: skel.bodyHeight,
    sequence: { frames, index: skel.keys.trophy },
    ...options,
  })
  return { strokes, arcs, texts, frames, skel }
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

heading('Drawing the target shape')

check('the reference pose is drawn, dashed, and only when asked for', () => {
  const plain = drawOnce()
  const frames = plain.frames
  const skel = plain.skel
  const ghost = modelPoseAt('trophy', {
    frame: frames[skel.keys.trophy],
    bodyHeight: skel.bodyHeight,
    racket: skel.racket,
  })
  assert(ghost !== undefined, 'no reference pose was produced')

  const withGhost = drawOnce({ ghost })
  const dashed = withGhost.strokes.filter((s) => s.dashed)
  note(`${dashed.length} dashed segments for the reference pose`)
  assert(dashed.length >= 10, `the reference skeleton drew only ${dashed.length} segments`)
  assert(
    plain.strokes.filter((s) => s.dashed).length === 0,
    'dashed lines appeared without a reference pose being supplied',
  )
})

check('the reference pose is drawn under the player, not over them', () => {
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  const ghost = modelPoseAt('trophy', {
    frame: frames[skel.keys.trophy],
    bodyHeight: skel.bodyHeight,
    racket: skel.racket,
  })!
  const { strokes } = drawOnce({ ghost })
  const lastDashed = strokes.map((s) => s.dashed).lastIndexOf(true)
  const firstSolid = strokes.findIndex((s) => !s.dashed)
  assert(
    firstSolid > lastDashed,
    'the player was drawn before the reference, so the reference covers them',
  )
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

report()
