/**
 * A page for looking at the figure on real motion: `/figurelab.html`.
 *
 * Dev only, like `bench.html`, and not in the build. It films one Bath serve
 * with the virtual phone and paints it through the same code the app uses, so
 * a change to the body can be judged by eye before it reaches a screen.
 */
import fixture from '../../lib/analysis/__tests__/fixtures/bath-serves.json'
import { LM } from '../../lib/analysis/geometry'
import { filmMocap, unpackMocap, type MocapServe } from '../../lib/analysis/mocapServe'
import { paintAthlete, paintRibbon, paintTrace, gripOf, type Material } from '../../lib/figure/athlete'
import { nearSide, statureOf, type Pt } from '../../lib/figure/shape'

const fromBase64 = (t: string) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0))
const params = new URLSearchParams(location.search)
const which = params.get('serve') ?? 'bath-39'
const bearing = Number(params.get('bearing') ?? 90)
const packed = fixture.serves.find((s) => s.id === which) ?? fixture.serves[0]
const serve: MocapServe = unpackMocap(packed as Parameters<typeof unpackMocap>[0], fromBase64)
const fps = 60
const frames = filmMocap(serve, { fps, bearing, aspect: 1, lead: 0 })
const contactIndex = frames.reduce((best, f, i) => (f.image[LM.rightWrist].y < frames[best].image[LM.rightWrist].y ? i : best), 0)

/** Canvas placement for one frame, fitted to the body through the whole motion. */
function placer(w: number, h: number, pad = 0.03) {
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const f of frames) {
    for (const p of f.image) {
      x0 = Math.min(x0, p.x)
      x1 = Math.max(x1, p.x)
      y0 = Math.min(y0, p.y)
      y1 = Math.max(y1, p.y)
    }
  }
  const scale = Math.min((w * (1 - pad * 2)) / (x1 - x0), (h * (1 - pad * 2)) / (y1 - y0))
  const ox = (w - (x1 - x0) * scale) / 2 - x0 * scale
  const oy = (h - (y1 - y0) * scale) / 2 - y0 * scale + h * 0.04
  return (p: { x: number; y: number }): Pt => ({ x: p.x * scale + ox, y: p.y * scale + oy })
}

function stage(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#0a0c10'
  ctx.fillRect(0, 0, w, h)
  const g = ctx.createRadialGradient(w * 0.42, h * 0.32, 0, w * 0.42, h * 0.32, h * 0.72)
  g.addColorStop(0, 'rgba(120, 140, 170, 0.34)')
  g.addColorStop(0.5, 'rgba(60, 74, 96, 0.14)')
  g.addColorStop(1, 'rgba(10, 12, 16, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

function canvasFor(title: string, w: number, h: number) {
  const dpr = 2
  const c = document.createElement('canvas')
  c.width = w * dpr
  c.height = h * dpr
  c.style.width = `${w}px`
  c.style.height = `${h}px`
  const fig = document.createElement('figure')
  fig.append(c)
  const cap = document.createElement('figcaption')
  cap.textContent = title
  fig.append(cap)
  document.getElementById('lab')!.append(fig)
  const ctx = c.getContext('2d')!
  ctx.scale(dpr, dpr)
  return ctx
}

/** Where the floor is: the lowest the feet get. */
function floorOf(place: (p: { x: number; y: number }) => Pt) {
  return Math.max(...frames.flatMap((f) => [29, 30, 31, 32].map((k) => place(f.image[k]).y)))
}

interface Look {
  still?: boolean
  ground?: number
  work?: string[]
  rim?: number
  bare?: boolean
}

function figureAt(ctx: CanvasRenderingContext2D, i: number, w: number, h: number, material: Material, look: Look = {}) {
  const place = placer(w, h)
  const placed = frames[i].image.map(place)
  const stature = Math.max(...frames.map((f) => statureOf(f.image.map(place))))
  const gear = frames[i].racket
  return paintAthlete(ctx, placed, {
    material,
    racket: 'right',
    gear: !look.bare && gear ? { grip: gripOf(placed, 'right'), head: place(gear.head) } : undefined,
    stature,
    near: nearSide(placed, frames[i].world),
    work: look.work,
    rim: look.rim,
    ground: look.ground,
    still: look.still,
    floorY: floorOf(place),
  })
}

const moments = [0.28, 0.62, 0.8, 1, 1.12].map((k) => Math.round(contactIndex * k))

for (const material of ['graphite', 'silver'] as Material[]) {
  for (const [name, i] of [
    ['trophy', moments[1]],
    ['drop', moments[2]],
    ['contact', contactIndex],
  ] as const) {
    const ctx = canvasFor(`${material} ${name}`, 300, 400)
    stage(ctx, 300, 400)
    figureAt(ctx, i, 300, 400, material, { ground: 1, still: true })
  }
}

{
  const ctx = canvasFor('work on: tossing arm', 300, 400)
  stage(ctx, 300, 400)
  figureAt(ctx, moments[1], 300, 400, 'graphite', { ground: 1, work: ['left-upper', 'left-fore', 'left-hand'] })
}
{
  const ctx = canvasFor('thumb', 72, 96)
  stage(ctx, 72, 96)
  figureAt(ctx, contactIndex, 72, 96, 'silver', { rim: 0 })
}
{
  const ctx = canvasFor('your serve in one picture', 390, 480)
  stage(ctx, 390, 480)
  const place = placer(390, 480)
  const stature = Math.max(...frames.map((f) => statureOf(f.image.map(place))))
  const from = Math.round(contactIndex * 0.2)
  for (let i = from; i < contactIndex; i += 7) {
    const placed = frames[i].image.map(place)
    paintTrace(ctx, placed, { racket: 'right', stature, near: nearSide(placed, frames[i].world), alpha: 0.05 + 0.1 * ((i - from) / (contactIndex - from)) })
  }
  const path = frames.slice(from, contactIndex + 1).map((f) => place(f.racket!.head))
  paintRibbon(ctx, path, 7)
  figureAt(ctx, contactIndex, 390, 480, 'graphite', { ground: 1, still: true })
}

// What a frame costs at a phone's canvas size, on this machine.
{
  const c = document.createElement('canvas')
  c.width = 720
  c.height = 960
  const ctx = c.getContext('2d')!
  ctx.scale(2, 2)
  const t0 = performance.now()
  const count = 120
  for (let k = 0; k < count; k++) {
    ctx.clearRect(0, 0, 360, 480)
    figureAt(ctx, Math.round(contactIndex * 0.3) + (k % 60), 360, 480, 'graphite', { ground: 1 })
  }
  ctx.getImageData(0, 0, 1, 1)
  const ms = (performance.now() - t0) / count
  const p = document.createElement('p')
  p.id = 'cost'
  p.textContent = `${ms.toFixed(2)} ms a frame at 720x960`
  document.body.append(p)
  console.error(p.textContent)
}
document.title = 'ready'
