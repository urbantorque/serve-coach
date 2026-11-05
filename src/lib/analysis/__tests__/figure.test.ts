/**
 * A figure worth looking at (L4.4): the one renderer every model and every
 * tracked body goes through, with limbs that have weight, a racket off the
 * forearm, the ball's flight, the faulty segment in `--work` and the target
 * dashed — checked on a recording context, without a browser.
 */
import { LM, sided } from '../geometry'
import { mirrorFrame } from '../mirror'
import { detectServe } from '../phases'
import { drawSkeleton, fitContain } from '../../pose/skeleton'
import { buildServe, rigStrikeFlight } from '../syntheticServe'
import { ballMarkerAt } from '../../vision/ballTrack'
import { faultDemo } from '../../faultDemo'
import { modelMotion } from '../../figure/modelMotion'
import { highlightOf } from '../../demoDraw'
import type { Frame } from '../types'
import { assert, check, heading, note, report } from './harness'

const FPS = 60
const W = 480
const H = 640
const WORK = '#ff7a6b'

type Pt = { x: number; y: number }
interface Sub {
  points: Pt[]
  closed: boolean
  arcs: { x: number; y: number; r: number; anticlockwise: boolean }[]
}
interface Op {
  op: 'fill' | 'stroke'
  style: string
  dashed: boolean
  subs: Sub[]
}

/** Every path a context is asked to paint, with the ink and dash it was painted in. */
function pathRecorder() {
  const ops: Op[] = []
  const ellipses: Pt[] = []
  let subs: Sub[] = []
  let dash: number[] = []
  let shift: Pt = { x: 0, y: 0 }
  const sub = () => {
    if (!subs.length) subs.push({ points: [], closed: false, arcs: [] })
    return subs[subs.length - 1]
  }
  const ctx = {
    strokeStyle: '' as unknown,
    fillStyle: '' as unknown,
    lineWidth: 1,
    lineCap: '',
    lineJoin: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
    clearRect() {},
    save() {},
    restore() {
      shift = { x: 0, y: 0 }
    },
    translate(x: number, y: number) {
      shift = { x: shift.x + x, y: shift.y + y }
    },
    rotate() {},
    beginPath() {
      subs = []
    },
    closePath() {
      sub().closed = true
    },
    moveTo(x: number, y: number) {
      subs.push({ points: [{ x, y }], closed: false, arcs: [] })
    },
    lineTo(x: number, y: number) {
      sub().points.push({ x, y })
    },
    arc(x: number, y: number, r: number, _a: number, _b: number, anticlockwise = false) {
      sub().arcs.push({ x, y, r, anticlockwise })
    },
    ellipse(x: number, y: number) {
      ellipses.push({ x: x + shift.x, y: y + shift.y })
    },
    arcTo() {},
    quadraticCurveTo() {},
    setLineDash(d: number[]) {
      dash = d
    },
    fill() {
      ops.push({ op: 'fill', style: String(ctx.fillStyle), dashed: false, subs })
    },
    stroke() {
      ops.push({ op: 'stroke', style: String(ctx.strokeStyle), dashed: dash.length > 0, subs })
    },
    fillRect() {},
    strokeRect() {},
    fillText() {},
    measureText: (t: string) => ({ width: String(t).length * 7 }),
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops, ellipses, dash: () => dash }
}

const frames = buildServe({}, FPS)
const skel = detectServe(frames, FPS)
const rect = fitContain(W, H, 1)
const toPx = (p: Pt) => ({ x: rect.ox + p.x * rect.dw, y: rect.oy + p.y * rect.dh })

function draw(frame: Frame, extra: Partial<Parameters<typeof drawSkeleton>[1]> = {}) {
  const rec = pathRecorder()
  drawSkeleton(rec.ctx, { frame, aspect: 1, rect, racket: skel.racket, ...extra })
  return rec
}

/** Twice the signed area of a closed polygon: positive one way round, negative the other. */
const area = (pts: Pt[]) =>
  pts.reduce((sum, p, i) => {
    const q = pts[(i + 1) % pts.length]
    return sum + p.x * q.y - q.x * p.y
  }, 0)

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

heading('Limbs with weight')

check('a thigh is wider at the hip than the knee, and the racket arm heavier than the tossing arm', () => {
  const frame = frames[skel.keys.trophy]
  const { ops } = draw(frame)
  const neutral = ops.find((o) => o.op === 'fill' && o.style.startsWith('rgba(238, 242, 246, 0.82'))!
  assert(neutral !== undefined, 'the body was not filled in its neutral ink')
  const hip = toPx(frame.image[LM.leftHip])
  const knee = toPx(frame.image[LM.leftKnee])
  const thigh = neutral.subs.find(
    (s) => s.closed && s.points.length === 4 && dist({ x: (s.points[0].x + s.points[3].x) / 2, y: (s.points[0].y + s.points[3].y) / 2 }, hip) < 1 &&
      dist({ x: (s.points[1].x + s.points[2].x) / 2, y: (s.points[1].y + s.points[2].y) / 2 }, knee) < 1,
  )
  assert(thigh !== undefined, 'no band runs from the hip to the knee')
  const atHip = dist(thigh!.points[0], thigh!.points[3])
  const atKnee = dist(thigh!.points[1], thigh!.points[2])
  note(`thigh ${atHip.toFixed(1)} px at the hip, ${atKnee.toFixed(1)} px at the knee`)
  assert(atHip > atKnee * 1.2, 'the thigh does not taper')

  const width = (style: string) => {
    const op = ops.find((o) => o.op === 'fill' && o.style === style)!
    const upper = op.subs.find((s) => s.closed)!
    return dist(upper.points[0], upper.points[3])
  }
  assert(width('rgb(205, 249, 74)') > width('rgba(120, 200, 255, 0.95)'), 'the racket arm is no heavier than the tossing arm')
})

check('each ink is one fill, every band winds one way, so no joint is painted twice or punched out', () => {
  const { ops } = draw(frames[skel.keys.drop])
  const fills = ops.filter((o) => o.op === 'fill')
  // The bands of each ink in one fill. The racket arm's joint dots are a fill
  // of the same accent on top, which is the dot, not a second coat of limb.
  const banded = (o: Op) => o.subs.some((s) => s.closed && s.points.length === 4)
  for (const style of ['rgba(238, 242, 246, 0.82)', 'rgba(120, 200, 255, 0.95)', 'rgb(205, 249, 74)']) {
    assert(fills.filter((o) => o.style === style && banded(o)).length === 1, `${style} bands were filled more than once`)
  }
  const bands = fills.filter((o) => o.style !== 'rgba(238, 242, 246, 0.1)').flatMap((o) => o.subs)
  const quads = bands.filter((s) => s.closed && s.points.length === 4)
  const circles = bands.flatMap((s) => s.arcs)
  note(`${quads.length} bands and ${circles.length} joint ends`)
  assert(quads.length >= 14 * 2, `only ${quads.length} bands across the limbs and their dark edges`)
  assert(quads.every((q) => area(q.points) > 0), 'a band winds the other way and would cancel a joint')
  assert(circles.every((c) => !c.anticlockwise), 'a joint end winds the other way')
})

check('every joint still carries its dot', () => {
  const frame = frames[skel.keys.trophy]
  const { ops } = draw(frame)
  const dots = ops.filter((o) => o.op === 'fill').flatMap((o) => o.subs.flatMap((s) => s.arcs))
  const arm = sided(skel.racket)
  for (const lm of [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle, arm.elbow, arm.wrist]) {
    const at = toPx(frame.image[lm])
    assert(dots.some((d) => dist(d, at) < 0.5), `no dot on landmark ${lm}`)
  }
})

heading('A racket off the forearm')

check('a rig frame is drawn holding its own racket, with no hand to estimate from', () => {
  const frame = frames[skel.keys.contact]
  const { ellipses } = draw(frame)
  assert(frame.racket !== undefined, 'the rig placed no racket')
  assert(ellipses.length === 1, `${ellipses.length} racket heads drawn`)
  const head = toPx(frame.racket!.head)
  assert(dist(ellipses[0], head) < 0.5, 'the racket head is not where the rig put it')
  // And a tracked frame, with no racket and no body height, draws none.
  const { racket: _r, ...bare } = frame
  void _r
  assert(draw(bare).ellipses.length === 0, 'a racket was invented for a tracked frame')
})

check('the lay-back dial turns the racket off the forearm at the drop, and nothing the engine reads', () => {
  const angleAt = (dials: { racketLayBack: number }, key: 'drop' | 'contact') => {
    const rig = buildServe(dials, FPS)
    const f = rig[detectServe(rig, FPS).keys[key]]
    const arm = sided('right')
    const fx = f.image[arm.wrist].x - f.image[arm.elbow].x
    const fy = f.image[arm.wrist].y - f.image[arm.elbow].y
    const rx = f.racket!.head.x - f.racket!.grip.x
    const ry = f.racket!.head.y - f.racket!.grip.y
    return (Math.acos((fx * rx + fy * ry) / (Math.hypot(fx, fy) * Math.hypot(rx, ry))) * 180) / Math.PI
  }
  const low = angleAt({ racketLayBack: 30 }, 'drop')
  const high = angleAt({ racketLayBack: 90 }, 'drop')
  note(`at the drop the racket sits ${low.toFixed(0)}° off the forearm at a 30° dial, ${high.toFixed(0)}° at 90°`)
  assert(high - low > 20, 'the dial barely turns the racket')
  const still = Math.abs(angleAt({ racketLayBack: 30 }, 'contact') - angleAt({ racketLayBack: 90 }, 'contact'))
  assert(still < 3, `the dial moved the racket at contact by ${still.toFixed(1)}°`)
  // A drawing dial: the landmarks are identical whatever it says.
  const a = buildServe({ racketLayBack: 30 }, FPS)
  const b = buildServe({ racketLayBack: 90 }, FPS)
  assert(
    a.every((f, i) => f.image.every((l, k) => l.x === b[i].image[k].x && l.y === b[i].image[k].y)),
    'the lay-back dial moved a landmark',
  )
})

check('the racket goes with the hand when the serve is mirrored', () => {
  const f = frames[skel.keys.trophy]
  const m = mirrorFrame(f, 1)
  assert(m.racket !== undefined && Math.abs(m.racket.head.x - (1 - f.racket!.head.x)) < 1e-9, 'the mirrored racket stayed put')
})

heading('The ball, from the toss to the strings')

check('the model ball leaves the tossing hand and meets the middle of the strings at contact', () => {
  const flight = rigStrikeFlight(frames, skel.keys.contact)
  assert(flight !== undefined, 'no flight built')
  const first = flight!.samples[0]
  const last = flight!.samples[flight!.samples.length - 1]
  const head = frames[skel.keys.contact].racket!.head
  note(`${flight!.samples.length} samples; apex ${flight!.apex.y.toFixed(3)} against contact ${head.y.toFixed(3)}`)
  assert(Math.abs(last.t - frames[skel.keys.contact].t) < 1e-9, 'the flight ends somewhere other than contact')
  assert(dist(last, head) < 1e-9, 'the ball misses the strings')
  // Let go where the hand comes closest to the arc (L4.5): within a hand's
  // width of the wrist, which is a ball leaving fingers, not appearing in air.
  const release = frames.find((f) => f.t === first.t)!
  const handGap = dist(first, release.image[LM.leftWrist]) / 0.54
  note(`the ball leaves ${handGap.toFixed(3)} body heights from the wrist`)
  assert(handGap < 0.05, 'the ball does not leave the tossing hand')
  assert(flight!.apex.y < Math.min(first.y, head.y), 'the ball never rises above the hand or the strings')
  // Drawn as a flight and a marker.
  const { ops } = draw(frames[skel.keys.drop], { ball: ballMarkerAt(flight, frames[skel.keys.drop].t) })
  assert(ops.some((o) => o.op === 'fill' && o.style === 'rgba(255, 214, 92, 0.95)'), 'no ball marker')
})

check('every model serve carries its ball, on the player own side', () => {
  for (const racket of ['right', 'left'] as const) {
    const m = modelMotion(racket)!
    const contact = m.frames.find((f) => Math.abs(f.t - m.contactT) < 1e-9)!
    const end = m.ball!.samples[m.ball!.samples.length - 1]
    assert(dist(end, contact.racket!.head) < 1e-9, `${racket}: the ball misses the mirrored strings`)
  }
})

heading('The faulty segment, and where it should be')

check('the segment a fault is in is painted in --work, and only when asked', () => {
  const frame = frames[skel.keys.drop]
  const arm = sided(skel.racket)
  const plain = draw(frame).ops.filter((o) => o.style === WORK)
  assert(plain.length === 0, 'work ink on a body with no fault named')
  const marked = draw(frame, { work: [[arm.shoulder, arm.elbow]] }).ops.filter((o) => o.op === 'fill' && o.style === WORK)
  assert(marked.length === 1, `${marked.length} work fills`)
  const band = marked[0].subs.filter((s) => s.closed)
  assert(band.length === 1, `${band.length} bones painted for one`)
  const shoulder = toPx(frame.image[arm.shoulder])
  assert(dist({ x: (band[0].points[0].x + band[0].points[3].x) / 2, y: (band[0].points[0].y + band[0].points[3].y) / 2 }, shoulder) < 1, 'the work band is not on the upper arm')
})

check('the target is dashed, drawn under the body, and the dash is put back', () => {
  const frame = frames[skel.keys.drop]
  const arm = sided(skel.racket)
  const target = [{ a: frame.image[arm.shoulder], b: { x: frame.image[arm.shoulder].x, y: frame.image[arm.shoulder].y - 0.1 } }]
  const rec = draw(frame, { target })
  const dashed = rec.ops.filter((o) => o.dashed)
  assert(dashed.some((o) => o.style === 'rgba(238, 242, 246, 0.8)'), 'the target was not stroked dashed in its ink')
  const firstLimb = rec.ops.findIndex((o) => o.op === 'fill' && o.style === 'rgba(238, 242, 246, 0.82)')
  const lastDash = rec.ops.map((o) => o.dashed).lastIndexOf(true)
  assert(lastDash < firstLimb, 'the target was drawn over the body')
  assert(rec.dash().length === 0, 'the dash leaked past the target')
  // On a model it goes over the body (L4.5): the dashed shape is the instruction.
  const over = draw(frame, { target, targetOver: true })
  const overLimb = over.ops.findIndex((o) => o.op === 'fill' && o.style === 'rgba(238, 242, 246, 0.82)')
  const firstDash = over.ops.findIndex((o) => o.dashed)
  assert(firstDash > overLimb, 'a target asked for on top went under the body')
  assert(over.dash().length === 0, 'the dash leaked past a target on top')
})

check('a demonstration paints its part on the faulty body, with the fix hung dashed from the same joint', () => {
  for (const racket of ['right', 'left'] as const) {
    const arm = sided(racket)
    const demo = faultDemo('collapsed_elbow', racket)!
    assert(demo.part === 'elbow', `${racket}: the collapsed elbow names ${demo.part}`)
    const at = (s: typeof demo.fault) => s.frames[s.phases.find((p) => p.id === 'drop')!.frame]
    const h = highlightOf(demo.part, racket, at(demo.fault), at(demo.fix))
    assert(JSON.stringify(h.work) === JSON.stringify([[arm.shoulder, arm.elbow]]), `${racket}: marks ${JSON.stringify(h.work)}`)
    const shoulder = at(demo.fault).image[arm.shoulder]
    assert(dist(h.target[0].a, shoulder) < 1e-9, `${racket}: the dashed arm does not hang from the fault's shoulder`)
  }
})

report()
