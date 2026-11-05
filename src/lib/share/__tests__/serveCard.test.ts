/**
 * The picture that leaves the phone. It is read with no app around it, so it has
 * to carry its own honesty, and it never carries a photograph of anybody.
 */
import { sampleAnalysis } from '../../../dev/sampleAnalysis'
import { renderReportCard } from '../serveCard'
import { assert, check, heading, note, report } from '../../analysis/__tests__/harness'

const noopProxy = (): unknown =>
  new Proxy(function () {}, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : noopProxy()),
    apply: () => noopProxy(),
    construct: () => noopProxy() as object,
  })

function recording() {
  const texts: string[] = []
  const fonts: string[] = []
  const state: Record<string, unknown> = {}
  const ctx = new Proxy(state, {
    get: (t, k) => {
      if (k === 'fillText') return (s: string) => void texts.push(String(s))
      if (k === 'measureText') return (s: string) => ({ width: String(s).length * 22 })
      if (k in t) return t[k as string]
      return () => noopProxy()
    },
    set: (t, k, v) => {
      if (k === 'font') fonts.push(String(v))
      t[k as string] = v
      return true
    },
  })
  const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob: (cb: (b: unknown) => void) => cb({ size: 1 }) }
  return { canvas, texts, fonts }
}

const g = globalThis as unknown as { document?: unknown; Path2D?: unknown }

async function draw(report: Parameters<typeof renderReportCard>[0], best?: string) {
  const r = recording()
  const had = g.document
  g.document = { createElement: () => r.canvas }
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
  try {
    await renderReportCard(report, undefined, best)
  } finally {
    g.document = had
  }
  return r
}

heading('What travels')

const base = { ...sampleAnalysis({ contactReach: 1.28 }), speed: undefined }
const fast = { ...base, speed: { speed: { ms: 37, low: 34.5, high: 39.5 } } } as unknown as typeof base

await check('the number, the words for it, the date and the one thing being worked on', async () => {
  const { texts } = await draw(base)
  const all = texts.join(' | ')
  note(all)
  assert(texts.includes(String(base.overall)), 'no score on the card')
  assert(all.includes('Working on'), 'nothing says what is being worked on')
  assert(!/\*\*/.test(all), 'the markup reached the picture')
})

await check('a speed says about, its range, and that no radar checked it', async () => {
  const all = (await draw(fast)).texts.join(' | ')
  assert(all.includes('about'), 'the speed claimed to be exact')
  assert(/likely \d+ to \d+, no radar/.test(all), 'no range, or no word on the radar')
  const none = (await draw(base)).texts.join(' | ')
  assert(!none.includes('radar'), 'a serve with no speed talked about one')
})

await check('a soft read says so on the picture', async () => {
  const soft = { ...base, quality: { ...base.quality, confidence: 0.3 } }
  const said = (await draw(soft)).texts.join(' | ')
  const clear = (await draw(base)).texts.join(' | ')
  assert(said !== clear, 'a rough read looks like a clear one')
})

await check('a record, when there is one, takes the foot', async () => {
  const all = (await draw(base, 'Your best trip yet.')).texts.join(' | ')
  assert(all.includes('Your best trip yet.'), 'the record is not on the card')
})

await check('it draws a figure and no photograph, even with stills on the report', async () => {
  const stills = { ...base, phases: base.phases.map((p) => ({ ...p, thumbnail: 'data:image/jpeg;base64,AAAA' })) }
  let loaded = 0
  ;(globalThis as { Image?: unknown }).Image = class {
    constructor() {
      loaded++
    }
  }
  await draw(stills)
  assert(loaded === 0, 'a photograph was loaded for the card')
})

await check('the card is in the app\'s own face', async () => {
  const { fonts } = await draw(fast)
  assert(fonts.every((f) => f.includes('Archivo')), 'a line fell back to the system face')
  assert(fonts.some((f) => f.includes('extra-condensed')), 'the numerals are not the score face')
})

report()
