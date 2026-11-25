/**
 * What counts as a real change, measured (L3.1).
 *
 * `realChange.ts` holds a floor for every score comparison the app prints. This
 * file films each serve in the ensembles many times with the suite's camera
 * noise, reads every take the way the app reads a file and scores it the way
 * the report does, and asks of each figure: how far did the camera alone move
 * it between takes of ONE serve, nine times in ten? The table must sit past
 * every serve's answer, on a 30 fps file and a 60 fps file.
 *
 * Then the other half: a floor that covered the noise by swallowing every real
 * fix would be worthless, so the rig's faults are fixed here and the change
 * has to show.
 */
import { runEngine } from '../../../dev/mocap/engine'
import { FUNDAMENTALS, isMeasured, overallOf } from '../coaching'
import {
  GAP_CHANGE,
  READ_DIFFERENTLY,
  REAL_CHANGE,
  ROW_CHANGE,
  bestWorstGap,
  changeOf,
  readAlike,
  readAlikeKey,
  rowChange,
  type ChangeScope,
} from '../realChange'
import { unswapFrames } from '../swapGuard'
import { type ServeDials } from '../syntheticServe'
import type { Frame, Fundamental, FundamentalId } from '../types'
import { FILE_RATES, REAL_SERVES, realOnFile, rigOnFile, seeds } from './repeatability'
import { assert, check, heading, note, report } from './harness'

/** The draws each serve is filmed with. */
const OVER = seeds(240)

/** Rigid legs and a racket left well above the shoulder — `engine.test.ts`'s modal club serve. */
const MODAL: Partial<ServeDials> = { trophyKneeAngle: 170, dropBelowShoulder: -0.25 }

/**
 * The family: the modal serve's two faults apart, the faults the report names
 * at a club tier one at a time, the shallow drop that sits on the collapse's
 * border, and the modal serve with a low reach on top. The dials are the ones
 * the flaw, demo and bands suites already detect.
 */
const FAMILY: Record<string, Partial<ServeDials>> = {
  modal: MODAL,
  clean: {},
  'rigid legs': { trophyKneeAngle: 170 },
  'no drop': { dropBelowShoulder: -0.25 },
  'shallow drop': { dropBelowShoulder: -0.2 },
  'low contact': { contactReach: 1.0 },
  tray: { palmToSky: 80, trophyForearmDrop: 0.22 },
  'collapsed elbow': { dropBelowShoulder: 0.1, dropElbowLift: -1.5 },
  'toss arm drops': { tossArmHold: 0.15 },
  'wobbly toss': { tossWobble: 0.15 },
  'modal, low reach': { ...MODAL, contactReach: 1.0 },
}

const AREAS = Object.keys(FUNDAMENTALS) as FundamentalId[]

interface Take {
  fundamentals: Fundamental[]
  overall: number
}

/** The back fence, as the noise table films it. */
const BEHIND = { bearing: 180, distance: 6 }

/** One take, through the app's own path, swap guard and levelling and confidence included. */
function take(frames: Frame[]): Take | undefined {
  const read = runEngine(unswapFrames(frames).frames, 32)
  if (!read.ok) return undefined
  return { fundamentals: read.run.fundamentals, overall: overallOf(read.run.fundamentals) }
}

/** Every serve in the ensembles, filmed `OVER` times on a file at `fps`. */
function filmed(fps: number): Record<string, Take[]> {
  const out: Record<string, Take[]> = {}
  for (const [name, dials] of Object.entries(FAMILY)) {
    out[name] = OVER.map((seed) => take(rigOnFile(dials, seed, fps))).filter((t): t is Take => t !== undefined)
  }
  REAL_SERVES.forEach((serve, i) => {
    out[`Bath ${i + 1}`] = OVER.map((seed) => take(realOnFile(serve, {}, seed, fps))).filter((t): t is Take => t !== undefined)
    // From behind as well, which the noise table measures and a player may film from.
    out[`Bath ${i + 1} from behind`] = OVER.map((seed) => take(realOnFile(serve, BEHIND, seed, fps))).filter(
      (t): t is Take => t !== undefined,
    )
  })
  return out
}

const byRate = FILE_RATES.map((fps) => ({ fps, serves: filmed(fps) }))

/** The 90th percentile, as the nearest rank: a value some pair actually produced. */
function p90(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(0.9 * sorted.length) - 1)]
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const scoreOf = (t: Take, scope: 'overall' | FundamentalId) =>
  scope === 'overall' ? t.overall : t.fundamentals.find((f) => f.id === scope && isMeasured(f))?.score

/** A fixed shuffle, so every run resamples the same baskets. */
function shuffler() {
  let state = 12345
  const next = () => ((state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const shuffle = <T>(xs: T[]): T[] =>
    xs
      .map((x) => [next(), x] as const)
      .sort((a, b) => a[0] - b[0])
      .map(([, x]) => x)
  /** `n` distinct items, drawn without replacement: the first `n` of a partial shuffle. */
  const pick = <T>(xs: T[], n: number): T[] => {
    const a = [...xs]
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(next() * (a.length - i))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a.slice(0, n)
  }
  return Object.assign(shuffle, { pick })
}

/** Draws per serve for the statistics that need a basket or a mean. */
const DRAWS = 2000

/** Too few pairs read differently to take a percentile from; the floor is not measured on them. */
const MIN_PAIRS = 20

/**
 * Too few takes on the side read differently, however many pairs they make. One
 * odd take against 239 others is 239 pairs, and the floor it set was one take's
 * distance from the rest, not a percentile (H44).
 */
const MIN_ODD_TAKES = 5

/** The largest p90 over every serve and file, and which serve it was. */
interface Worst {
  value: number
  where: string
}
const worst: Record<string, Worst> = {}
/** Per serve: how far a trip median moves, beside how far one serve does. */
const tripAgainstOne: { where: string; trip: number; one: number }[] = []
function keep(key: string, value: number, where: string) {
  if (!Number.isFinite(value)) return
  if (!worst[key] || value > worst[key].value) worst[key] = { value, where }
}

for (const { fps, serves } of byRate) {
  for (const [name, takes] of Object.entries(serves)) {
    const where = `${name} at ${fps} fps`
    const alike: Record<string, number[]> = {}
    const apart: Record<string, number[]> = {}
    // Which way each take was graded, per scope, so a side read differently by a
    // take or two is not a measurement.
    const classes: Record<string, Map<string, number>> = {}
    for (const t of takes) {
      for (const scope of ['overall', ...AREAS] as const) {
        const key = readAlikeKey(t.fundamentals, scope)
        const m = (classes[scope] ??= new Map())
        m.set(key, (m.get(key) ?? 0) + 1)
      }
    }
    const oddTakes = (scope: string) => {
      const counts = [...(classes[scope]?.values() ?? [])]
      return counts.reduce((a, b) => a + b, 0) - Math.max(0, ...counts)
    }
    for (let i = 0; i < takes.length; i++) {
      for (let j = i + 1; j < takes.length; j++) {
        const [a, b] = [takes[i], takes[j]]
        for (const scope of ['overall', ...AREAS] as const) {
          const x = scoreOf(a, scope)
          const y = scoreOf(b, scope)
          if (x === undefined || y === undefined) continue
          const bucket = readAlike(a.fundamentals, b.fundamentals, scope) ? alike : apart
          ;(bucket[scope] ??= []).push(Math.abs(x - y))
        }
      }
    }
    for (const [scope, xs] of Object.entries(alike)) keep(scope, p90(xs), where)
    for (const [scope, xs] of Object.entries(apart)) {
      if (xs.length >= MIN_PAIRS && oddTakes(scope) >= MIN_ODD_TAKES) keep(`${scope} apart`, p90(xs), where)
    }

    // The comparisons that are averages or baskets, drawn without replacement.
    const shuffle = shuffler()
    const trip: number[] = []
    const single: number[] = []
    const gap: number[] = []
    const range: Record<number, number[]> = {}
    const rowMeans: Record<string, number[]> = {}
    const graded = [...new Set(takes.flatMap((t) => t.fundamentals.flatMap((f) => f.metrics.map((m) => m.id))))]
    const rowScores = takes.map((t) => new Map(t.fundamentals.flatMap((f) => f.metrics).map((m) => [m.id, m.score])))
    const order = takes.map((_, i) => i)
    // A row's mean is drawn from the takes that carry it. Drawn from every take, a
    // row a collapse takes off most takes left a handful of draws, so its floor
    // came from the steady serves, and the serves it was for went uncovered (H44).
    const carrying = Object.fromEntries(graded.map((id) => [id, order.filter((i) => rowScores[i].has(id))]))
    for (let k = 0; k < DRAWS; k++) {
      const drawn = shuffle(order)
      const basket = drawn.map((i) => takes[i])
      const s = basket.map((t) => t.overall)
      // `tripPoints`: one trip's median against another's, three serves
      // each — the smallest trip a chip, a record or the six-week line will
      // stand on (L3.2). Taken over every take, collapse or not: a trip's
      // serves cannot be held to rows read alike.
      trip.push(Math.abs(median(s.slice(0, 3)) - median(s.slice(3, 6))))
      single.push(Math.abs(s[0] - s[1]))
      const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs)
      gap.push(Math.abs(spread(s.slice(0, 6)) - spread(s.slice(6, 12))))
      for (let n = 2; n <= 6; n++) {
        const b = basket.slice(0, n)
        let hi = 0
        let lo = 0
        b.forEach((t, i) => {
          if (t.overall > b[hi].overall) hi = i
          if (t.overall <= b[lo].overall) lo = i
        })
        if (readAlike(b[hi].fundamentals, b[lo].fundamentals)) (range[n] ??= []).push(b[hi].overall - b[lo].overall)
      }
      // `findPracticeFocus`: a row's mean over h serves against the h before.
      for (const id of graded) {
        if (carrying[id].length < 6) continue
        const ys = shuffle.pick(carrying[id], 6).map((i) => rowScores[i].get(id)!)
        for (let h = 1; h <= 3; h++) {
          ;(rowMeans[`${id}/${h}`] ??= []).push(Math.abs(Math.round(mean(ys.slice(0, h)) - mean(ys.slice(h, 2 * h)))))
        }
      }
    }
    keep('trip', p90(trip), where)
    tripAgainstOne.push({ where, trip: p90(trip), one: p90(single) })
    keep('gap', p90(gap), where)
    for (const [n, xs] of Object.entries(range)) keep(`best–worst of ${n}`, p90(xs), where)
    for (const [key, xs] of Object.entries(rowMeans)) keep(`row mean ${key}`, p90(xs), where)
  }
}

const served = (key: string) => worst[key]?.value
const said = (key: string) => (worst[key] ? `${worst[key].value} (${worst[key].where})` : 'not measured')

heading('The camera alone, against every floor')

check('no serve shows a like-for-like change past the floor more than one time in ten', () => {
  for (const scope of ['overall', ...AREAS] as const) {
    const moved = served(scope)
    note(`${scope}: moves ${said(scope)}, floor ${REAL_CHANGE[scope]}`)
    assert(moved !== undefined, `${scope} was never measured twice alike`)
    assert(
      moved! < REAL_CHANGE[scope],
      `${scope} moves ${said(scope)} between takes, and the floor is ${REAL_CHANGE[scope]}`,
    )
  }
})

check('serves graded on different rows are held to their own floor, where the ensembles make them', () => {
  for (const scope of ['overall', ...AREAS] as const) {
    const moved = served(`${scope} apart`)
    const floor = READ_DIFFERENTLY[scope]
    note(`${scope} read differently: moves ${said(`${scope} apart`)}, floor ${floor ?? 'none — always soft'}`)
    if (moved === undefined) {
      // Nothing measured, so nothing may be claimed: a change read
      // differently in this area stays soft however large it is.
      assert(floor === undefined, `${scope} has a read-differently floor of ${floor} and no measurement behind it`)
      continue
    }
    assert(floor !== undefined, `${scope} is read differently by noise (${said(`${scope} apart`)}) and has no floor for it`)
    assert(moved < floor!, `${scope} read differently moves ${said(`${scope} apart`)}, past its floor of ${floor}`)
    assert(floor! >= REAL_CHANGE[scope], `${scope}'s read-differently floor is under its like-for-like one`)
  }
})

check('the collapse does flip under noise on the serve this is for', () => {
  // The reason `READ_DIFFERENTLY` exists. If the rig stopped flipping, the
  // floor would be measuring something that no longer happens.
  const modal = byRate[0].serves.modal
  let pairs = 0
  let apart = 0
  for (let i = 0; i < modal.length; i++)
    for (let j = i + 1; j < modal.length; j++) {
      pairs++
      if (!readAlike(modal[i].fundamentals, modal[j].fundamentals)) apart++
    }
  note(`modal club serve: ${apart} of ${pairs} take-pairs read on different rows`)
  assert(apart / pairs > 0.25, `only ${apart} of ${pairs} pairs flipped`)
})

check('the averages and baskets sit under their floors', () => {
  note(`trip (median of 3 against 3): moves ${said('trip')}, floor ${REAL_CHANGE.trip}`)
  assert(served('trip')! < REAL_CHANGE.trip, `a trip median moves ${said('trip')}`)
  note(`basket gap (6 against 6): moves ${said('gap')}, floor ${GAP_CHANGE}`)
  assert(served('gap')! < GAP_CHANGE, `the gap moves ${said('gap')}`)
  for (let n = 2; n <= 6; n++) {
    const key = `best–worst of ${n}`
    note(`${key}, read alike: ${said(key)}, floor ${bestWorstGap(n)}`)
    assert(served(key)! < bestWorstGap(n), `${key} reaches ${said(key)}`)
  }
})

check('a trip median drifts less than a single serve, on every serve', () => {
  // The reason the headline is a trip and not a serve (L3.2). Measured on
  // every take, so a serve whose drop collapses on some of them counts its
  // flips in both columns.
  // Never further than one serve, on any serve. A serve whose single takes
  // already barely move can tie at the percentile; the worst serve cannot.
  for (const { where, trip, one } of tripAgainstOne) {
    assert(trip <= one, `${where}: a trip median moves ${trip}, one serve ${one}`)
  }
  const worstOne = Math.max(...tripAgainstOne.map((t) => t.one))
  note(`worst serve: a trip median moves ${said('trip')}, one serve up to ${worstOne}`)
  assert(served('trip')! < worstOne, 'the trip floor is no tighter than a single serve')
})

check('every card row has a floor, and its mean over one to three serves a side stays under it', () => {
  const rows = new Set(
    Object.keys(worst)
      .filter((k) => k.startsWith('row mean '))
      .map((k) => k.slice('row mean '.length).split('/')[0]),
  )
  for (const id of rows) {
    assert(id in ROW_CHANGE, `${id} moves between takes and has no floor`)
    const area = (Object.entries(FUNDAMENTALS).find(([, f]) => f.metrics.includes(id))?.[0] ?? 'contact') as FundamentalId
    const line: string[] = []
    for (let h = 1; h <= 3; h++) {
      const key = `row mean ${id}/${h}`
      if (served(key) === undefined) continue
      line.push(`${h} a side ${served(key)} < ${rowChange(id, area, h)}`)
      assert(
        served(key)! < rowChange(id, area, h),
        `${id}'s mean of ${h} moves ${said(key)}, and the floor for ${h} a side is ${rowChange(id, area, h)}`,
      )
    }
    note(`${id}: ${line.join(', ')}`)
  }
  for (const id of Object.keys(ROW_CHANGE)) assert(rows.has(id), `${id} has a floor and the ensembles never read it`)
})

heading('A fix still shows')

/**
 * How a fix reads over every pair of a take before it and a take after, on a 30
 * fps file. A player compares two ordinary takes, not two medians, so these are
 * rates (H44): the checks used to test one median pair each.
 */
function fixed(before: string, after: string) {
  const tally: Record<string, number> = { up: 0, down: 0, same: 0, soft: 0 }
  const a = byRate[0].serves[before]
  const b = byRate[0].serves[after]
  for (const x of a) {
    for (const y of b) tally[changeOf(y.overall - x.overall, 'overall', readAlike(x.fundamentals, y.fundamentals))]++
  }
  const n = a.length * b.length
  const share = (k: string) => tally[k] / n
  note(`${before} → ${after}: up ${(share('up') * 100).toFixed(1)}%, soft ${(share('soft') * 100).toFixed(1)}%, same ${(share('same') * 100).toFixed(1)}%, down ${(share('down') * 100).toFixed(1)}%`)
  return share
}

check('reaching full height is a real change on the overall, on nearly every pair', () => {
  const share = fixed('low contact', 'clean')
  assert(share('up') >= 0.9, `a full-height contact read as a change on ${(share('up') * 100).toFixed(1)}% of pairs`)
})

check('the commonest club serve fixed is almost never called no change', () => {
  // Legs and drop both fixed. The two are graded on different rows — the
  // collapse is gone — so this may be soft, and is almost never "same".
  const share = fixed('modal', 'clean')
  assert(share('same') <= 0.03, `fixing the modal serve read as no change on ${(share('same') * 100).toFixed(1)}% of pairs`)
  assert(share('down') === 0, 'fixing the modal serve read as a fall')
})

check('a toss arm held up is a real change on the overall, on most pairs', () => {
  const share = fixed('toss arm drops', 'clean')
  assert(share('up') >= 0.7, `holding the toss arm up read as a change on ${(share('up') * 100).toFixed(1)}% of pairs`)
})

heading('The rule')

check('a change is same, soft or a direction, and soft only between two serves read differently', () => {
  const scopes: ChangeScope[] = ['overall', 'swing', 'toss']
  for (const scope of scopes) {
    const floor = REAL_CHANGE[scope]
    assert(changeOf(floor - 1, scope) === 'same', `${scope}: just under the floor wasn’t the same`)
    assert(changeOf(-(floor - 1), scope, false) === 'same', `${scope}: a small move read differently wasn’t the same`)
    assert(changeOf(floor, scope) === 'up', `${scope}: the floor itself wasn’t a change`)
    assert(changeOf(-floor, scope) === 'down', `${scope}: a fall at the floor wasn’t a change`)
    assert(changeOf(floor, scope, false) === 'soft', `${scope}: read differently at the floor wasn’t soft`)
    const wider = READ_DIFFERENTLY[scope]
    if (wider !== undefined) assert(changeOf(-wider, scope, false) === 'down', `${scope}: past the wider floor wasn’t a change`)
    else assert(changeOf(99, scope, false) === 'soft', `${scope}: with no wider floor, read differently was claimed`)
  }
})

check('two reports read alike only when the same rows were graded', () => {
  const card = (rows: Record<string, string[]>): Fundamental[] =>
    Object.entries(rows).map(
      ([id, ms]) => ({ id, score: ms.length ? 70 : 0, metrics: ms.map((m) => ({ id: m, score: 70 })) }) as unknown as Fundamental,
    )
  const full = card({ swing: ['dropDepth', 'elbowAtDrop', 'dropToContact', 'handUnderElbow'], rhythm: ['loadRatio'], toss: ['releaseHeight'] })
  const collapsed = card({ swing: ['dropDepth', 'handUnderElbow'], rhythm: [], toss: ['releaseHeight'] })
  assert(readAlike(full, full), 'a report didn’t read alike with itself')
  assert(!readAlike(full, collapsed), 'a collapse read alike on the overall')
  assert(!readAlike(full, collapsed, 'swing'), 'a collapse read alike on the swing')
  assert(readAlike(full, collapsed, 'toss'), 'the toss read differently when only the swing changed')
  // The order rows come in is not a difference.
  const reordered = card({ toss: ['releaseHeight'], rhythm: ['loadRatio'], swing: ['handUnderElbow', 'dropToContact', 'elbowAtDrop', 'dropDepth'] })
  assert(readAlike(full, reordered), 'the same rows in another order read differently')
})

check('the best–worst bar rises with the basket and holds at its ends', () => {
  for (let n = 3; n <= 6; n++) assert(bestWorstGap(n) >= bestWorstGap(n - 1), `the bar fell from ${n - 1} to ${n} serves`)
  assert(bestWorstGap(1) === bestWorstGap(2), 'one serve has its own bar')
  assert(bestWorstGap(12) === bestWorstGap(6), 'a big basket fell off the table')
  assert(bestWorstGap(2) === REAL_CHANGE.overall, 'two serves aren’t held to the plain overall floor')
})

report()
