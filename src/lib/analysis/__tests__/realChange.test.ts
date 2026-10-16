/**
 * What counts as a real change, measured (L3.1).
 *
 * `realChange.ts` holds a floor for every score comparison the app prints. This
 * file films each serve in the ensembles many times with the suite's camera
 * noise, scores every take the way the report does, and asks of each figure:
 * how far did the camera alone move it between takes of ONE serve, nine times
 * in ten? The table must sit past every serve's answer, at both frame rates.
 *
 * The table was taken as the larger of this file's figures at `seeds(24)`,
 * which the suite runs, and at `seeds(60)` — change `OVER` to reproduce the
 * second. Both are printed.
 *
 * Then the other half: a floor that covered the noise by swallowing every real
 * fix would be worthless, so the rig's faults are fixed here and the change
 * has to show.
 */
import { FUNDAMENTALS, isMeasured, overallOf } from '../coaching'
import { measure } from '../metrics'
import { filmMocap } from '../mocapServe'
import { detectServe } from '../phases'
import {
  GAP_CHANGE,
  READ_DIFFERENTLY,
  REAL_CHANGE,
  ROW_CHANGE,
  bestWorstGap,
  changeOf,
  readAlike,
  rowChange,
  type ChangeScope,
} from '../realChange'
import { assessSpatial, viewFromCourtYaw } from '../spatial'
import { buildServe, type ServeDials } from '../syntheticServe'
import { LM } from '../geometry'
import type { Frame, Fundamental, FundamentalId } from '../types'
import { DEPTH_AWARE, DEPTH_BIAS, DEPTH_MULTIPLIER, IN_PLANE, REAL_SERVES, seeds } from './repeatability'
import { assert, check, heading, note, report } from './harness'

/** The draws each serve is filmed with. `seeds(60)` reproduces the wider half of the table. */
const OVER = seeds(24)

/** An ordinary phone and the rate the rest of the suite films at. */
const RATES = [30, 50]

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

function take(frames: Frame[], fps: number): Take | undefined {
  let skel
  try {
    skel = detectServe(frames, fps)
  } catch {
    return undefined
  }
  const view = viewFromCourtYaw(assessSpatial(frames, skel.keys.ready, skel.bodyHeight, skel).court_yaw_deg)
  const fundamentals = measure(frames, skel, view === 'side', { serveType: 'flat' })
  return { fundamentals, overall: overallOf(fundamentals) }
}

const stature = (f: Frame) =>
  (Math.max(f.image[LM.leftAnkle].y, f.image[LM.rightAnkle].y) - f.image[LM.nose].y) / 0.93

/** Every serve in the ensembles, filmed `OVER` times at `fps`. */
function filmed(fps: number): Record<string, Take[]> {
  const out: Record<string, Take[]> = {}
  for (const [name, dials] of Object.entries(FAMILY)) {
    out[name] = OVER.map((seed) => take(buildServe({ ...DEPTH_AWARE, ...dials, seed }, fps), fps)).filter(
      (t): t is Take => t !== undefined,
    )
  }
  // `realiseReal`'s camera: the noise scaled to the player's size in the picture.
  const rig = stature(buildServe({}, fps)[0])
  REAL_SERVES.forEach((serve, i) => {
    const scale = stature(filmMocap(serve, { fps })[0]) / rig
    out[`Bath ${i + 1}`] = OVER.map((seed) =>
      take(
        filmMocap(serve, {
          fps,
          seed,
          noise: IN_PLANE * scale,
          depthNoise: DEPTH_MULTIPLIER,
          depthBias: DEPTH_BIAS * scale,
        }),
        fps,
      ),
    ).filter((t): t is Take => t !== undefined)
  })
  return out
}

const byRate = RATES.map((fps) => ({ fps, serves: filmed(fps) }))

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
  return <T>(xs: T[]): T[] =>
    xs
      .map((x) => [next(), x] as const)
      .sort((a, b) => a[0] - b[0])
      .map(([, x]) => x)
}

/** Draws per serve for the statistics that need a basket or a mean. */
const DRAWS = 2000

/** Too few pairs read differently to take a percentile from; the floor is not measured on them. */
const MIN_PAIRS = 20

/** The largest p90 over every serve and rate, and which serve it was. */
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
    for (const [scope, xs] of Object.entries(apart)) if (xs.length >= MIN_PAIRS) keep(`${scope} apart`, p90(xs), where)

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
      for (let h = 1; h <= 3; h++) {
        for (const id of graded) {
          const xs = drawn.slice(0, 2 * h).map((i) => rowScores[i].get(id))
          if (xs.some((x) => x === undefined)) continue
          const ys = xs as number[]
          ;(rowMeans[`${id}/${h}`] ??= []).push(Math.abs(Math.round(mean(ys.slice(0, h)) - mean(ys.slice(h)))))
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
  const modal = byRate.find((r) => r.fps === 50)!.serves.modal
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
  for (const { where, trip, one } of tripAgainstOne) {
    assert(trip < one, `${where}: a trip median moves ${trip}, one serve ${one}`)
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

/** The middle take of a serve's ensemble, by overall, at 50 fps. */
function typical(name: string): Take {
  const takes = [...byRate.find((r) => r.fps === 50)!.serves[name]].sort((a, b) => a.overall - b.overall)
  return takes[Math.floor(takes.length / 2)]
}

check('reaching full height is a real change on the overall', () => {
  const before = typical('low contact')
  const after = typical('clean')
  const delta = after.overall - before.overall
  const change = changeOf(delta, 'overall', readAlike(before.fundamentals, after.fundamentals))
  note(`low contact ${before.overall} → full reach ${after.overall}: ${change}`)
  assert(change === 'up', `a full-height contact read as ${change} (${delta > 0 ? '+' : ''}${delta})`)
})

check('the commonest club serve fixed is never called no change', () => {
  // Legs and drop both fixed. The two are graded on different rows — the
  // collapse is gone — so this may be soft, and must not be "same".
  const before = typical('modal')
  const after = typical('clean')
  const delta = after.overall - before.overall
  const change = changeOf(delta, 'overall', readAlike(before.fundamentals, after.fundamentals))
  note(`modal ${before.overall} → clean ${after.overall}: ${change}`)
  assert(change === 'up' || change === 'soft', `fixing the modal serve read as ${change}`)
})

check('a toss arm held up is a real change on the overall', () => {
  const before = typical('toss arm drops')
  const after = typical('clean')
  const delta = after.overall - before.overall
  const change = changeOf(delta, 'overall', readAlike(before.fundamentals, after.fundamentals))
  note(`toss arm drops ${before.overall} → held ${after.overall}: ${change}`)
  assert(change === 'up', `holding the toss arm up read as ${change} (${delta > 0 ? '+' : ''}${delta})`)
})

heading('The rule')

check('a change is same, soft or a direction, and soft only between two serves read differently', () => {
  const scopes: ChangeScope[] = ['overall', 'swing', 'toss']
  for (const scope of scopes) {
    const floor = REAL_CHANGE[scope]
    assert(changeOf(floor - 1, scope) === 'same', `${scope}: just under the floor was not the same`)
    assert(changeOf(-(floor - 1), scope, false) === 'same', `${scope}: a small move read differently was not the same`)
    assert(changeOf(floor, scope) === 'up', `${scope}: the floor itself was not a change`)
    assert(changeOf(-floor, scope) === 'down', `${scope}: a fall at the floor was not a change`)
    assert(changeOf(floor, scope, false) === 'soft', `${scope}: read differently at the floor was not soft`)
    const wider = READ_DIFFERENTLY[scope]
    if (wider !== undefined) assert(changeOf(-wider, scope, false) === 'down', `${scope}: past the wider floor was not a change`)
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
  assert(readAlike(full, full), 'a report did not read alike with itself')
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
  assert(bestWorstGap(2) === REAL_CHANGE.overall, 'two serves are not held to the plain overall floor')
})

report()
