/**
 * The shared clip (N5.6). It builds the poster, so its last frame has to say
 * what the poster says; it slows into the ball without stepping; and a
 * then-and-now keeps each swing, racket and all, inside its own half.
 */
import { sampleAnalysis } from '../../../dev/sampleAnalysis'
import { swingOf } from '../../figure/swing'
import { renderReportCard, POSTER_W } from '../serveCard'
import { frameAt, pairLayout, serveClipPainter, thenNowPainter, timeline } from '../swingClip'
import { assert, check, heading, note, report } from '../../analysis/__tests__/harness'

const noopProxy = (): unknown =>
  new Proxy(function () {}, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : noopProxy()),
    apply: () => noopProxy(),
    construct: () => noopProxy() as object,
  })

/** A canvas that writes down every word drawn on it and how visibly. */
function recording() {
  const texts: { text: string; alpha: number }[] = []
  const state: Record<string, unknown> = { globalAlpha: 1 }
  const ctx = new Proxy(state, {
    get: (t, k) => {
      if (k === 'fillText') return (s: string) => void texts.push({ text: String(s), alpha: Number(t.globalAlpha) })
      if (k === 'measureText') return (s: string) => ({ width: String(s).length * 22 })
      if (k in t) return t[k as string]
      return () => noopProxy()
    },
    set: (t, k, v) => {
      t[k as string] = v
      return true
    },
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts }
}

const g = globalThis as unknown as { document?: unknown; Path2D?: unknown }
g.Path2D = class {
  moveTo() {}
  lineTo() {}
  bezierCurveTo() {}
  quadraticCurveTo() {}
  closePath() {}
  arc() {}
  ellipse() {}
  addPath() {}
}

async function posterTexts(r: Parameters<typeof renderReportCard>[0], best?: string) {
  const rec = recording()
  const canvas = { width: 0, height: 0, getContext: () => rec.ctx, toBlob: (cb: (b: unknown) => void) => cb({ size: 1 }) }
  const had = g.document
  g.document = { createElement: () => canvas }
  try {
    await renderReportCard(r, undefined, best)
  } finally {
    g.document = had
  }
  return rec.texts.map((t) => t.text)
}

const base = { ...sampleAnalysis(), speed: { speed: { ms: 37, low: 34.5, high: 39.5 } } } as unknown as ReturnType<typeof sampleAnalysis>
const tall = sampleAnalysis({ contactReach: 1.28 }, 2)

heading('One serve: the poster, built')

await check('the last frame says exactly what the poster says', async () => {
  const rec = recording()
  const p = serveClipPainter(rec.ctx, base, { bestScore: 'Your best trip yet.', device: 'phone' })
  assert(p !== undefined, 'no clip for a report with a swing')
  p!.draw(p!.total)
  const clip = rec.texts.filter((t) => t.alpha > 0.99).map((t) => t.text)
  const poster = await posterTexts(base, 'Your best trip yet.')
  note(clip.join(' | '))
  assert(clip.length === poster.length && poster.every((t) => clip.includes(t)), `the clip ends on other words than the poster: ${poster.filter((t) => !clip.includes(t)).join(', ')}`)
})

await check('no word of the reading shows before the swing reaches the ball', async () => {
  const rec = recording()
  const p = serveClipPainter(rec.ctx, base, { device: 'phone' })!
  const landAt = p.total - 2.2 - 1.3
  for (let s = 0; s < landAt - 0.01; s += 0.25) p.draw(s)
  const shown = rec.texts.filter((t) => t.alpha > 0).map((t) => t.text)
  assert(!shown.includes(String(base.overall)), 'the score showed before the swing landed')
  assert(!shown.includes('Working on'), 'the fix showed before the swing landed')
  assert(shown.includes('Ready') && shown.includes('Contact'), `the moments weren’t named as they passed: ${[...new Set(shown)].join(', ')}`)
})

await check('the number counts up to the score', async () => {
  const rec = recording()
  const p = serveClipPainter(rec.ctx, base, { device: 'phone' })!
  for (let s = p.total - 3.6; s <= p.total; s += 0.05) p.draw(s)
  const numbers = rec.texts.map((t) => t.text).filter((t) => /^\d+$/.test(t)).map(Number)
  const scores = numbers.filter((n) => n <= base.overall)
  assert(scores.some((n) => n < base.overall) && scores[scores.length - 1] === base.overall, 'the number didn’t count up to the score')
})

heading('Slowing into the ball')

await check('steady through the wind-up, slowest at the ball, and stopped there', () => {
  const t = timeline(1.5)
  const at = (s: number) => t.clock(s)
  assert(Math.abs(at(0) + 1.5) < 1e-9, 'the swing doesn’t start at its beginning')
  assert(Math.abs(at(t.total)) < 1e-9, 'the swing doesn’t stop at the ball')
  const start = (at(0.6) - at(0.5)) / 0.1
  const end = (at(0.5 + t.play) - at(0.4 + t.play)) / 0.1
  note(`start ${start.toFixed(2)}x real speed, at the ball ${end.toFixed(2)}x, clip ${t.total.toFixed(1)} s`)
  assert(end < start / 2, 'the ball isn’t the slowest part')
  assert(t.total > 7 && t.total < 11, 'a clip people wouldn’t sit through, or one too short to read')
})

await check('the body glides between tracked frames rather than stepping', () => {
  const swing = swingOf(base)!
  const to = swing.moments.contact!
  const t = timeline(swing.frames[to].t - swing.frames[0].t)
  const places: number[] = []
  for (let s = 0; s <= t.total; s += 1 / 30) places.push(frameAt(swing, 0, to, t.clock(s)))
  assert(places.every((p, i) => i === 0 || p >= places[i - 1] - 1e-9), 'the swing ran backwards')
  assert(Math.max(...places) === to, 'the swing never reached the ball, or went past it')
  const between = places.filter((p) => p % 1 > 0.05 && p % 1 < 0.95).length
  note(`${between} of ${places.length} clip frames fall between tracked frames`)
  assert(between > places.length / 4, 'slow motion holds whole frames, which steps')
})

heading('Then and now')

await check('each swing, racket and all, stays inside its own half and under the header', () => {
  for (const pair of [
    [swingOf(tall)!, swingOf(base)!],
    [swingOf(base)!, swingOf({ ...tall, handedness: 'left' })!],
  ]) {
    const placed = pairLayout(pair)
    placed.forEach((p, n) => {
      const pad = p.at.stature * 0.08
      for (let i = p.from; i <= p.to; i++) {
        for (const q of pair[n].frames[i].image.map(p.at.place)) {
          assert(q.x >= 0 && q.x <= POSTER_W / 2, `a body crosses into the other half (x ${q.x.toFixed(0)})`)
          assert(q.y >= 136, `a body reaches the header (y ${q.y.toFixed(0)})`)
        }
      }
      for (const q of p.path) {
        if (!q) continue
        assert(q.x - pad >= 0 && q.x + pad <= POSTER_W / 2, `a racket crosses into the other half (x ${q.x.toFixed(0)})`)
        assert(q.y - pad >= 136, `a racket reaches the header (y ${q.y.toFixed(0)})`)
      }
    })
    const [a, b] = placed.map((p) => p.at.stature)
    assert(Math.abs(a - b) / a < 0.02, `the two are drawn at different sizes (${a.toFixed(0)} and ${b.toFixed(0)})`)
  }
})

await check('the newer score lands, and a rough read says so', () => {
  const swing = swingOf(base)!
  const rec = recording()
  const p = thenNowPainter(rec.ctx, {
    then: { swing: swingOf(tall)!, caption: '3 Sep', score: 58, soft: true },
    now: { swing, caption: '14 Nov', score: 76 },
    headline: '10 weeks apart',
    device: 'phone',
  })
  p.draw(p.total)
  const all = rec.texts.map((t) => t.text).join(' | ')
  note(all)
  assert(all.includes('58') && all.includes('76') && all.includes('3 Sep') && all.includes('14 Nov'), 'a score or its date is missing')
  assert(all.includes('10 weeks apart'), 'no headline')
  assert(all.includes('rough read'), 'a rough read went out looking like a clear one')
})

report()
