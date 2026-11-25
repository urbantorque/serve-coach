/**
 * A serve read against the player's own usual and best (lift item 8).
 *
 * Two kinds of history. Seeded readings, where a row's spread and a day's shift
 * can be set exactly and thousands of histories cost nothing, carry the
 * statistics. The real engine on the rig, with its tracker noise and its dials
 * jittered serve to serve, carries the proof that real report rows behave.
 *
 * WHAT THIS PROVES. Consistency, not accuracy. Everything here is synthetic: the
 * noise is drawn from a model and no real player's spread has been measured, so
 * a false-alarm rate below is the sums keeping their stated rate on the noise
 * they were given, not a rate on anybody's clips.
 */
import {
  FALSE_READINGS_PER_SERVE,
  MAD_TO_SD,
  MAX_BASELINE_SERVES,
  MAX_READINGS,
  MIN_BASELINE_SERVES,
  ROW_WORDS,
  SERVES_A_TRIP_COUNTS_FOR,
  againstBest,
  againstUsual,
  baselineFor,
  cameraMultiple,
  closestToBest,
  earlierBest,
  playerBaseline,
  reachOf,
  selfLine,
  spreadMultiple,
  type BandMove,
  type Direction,
} from '../baseline'
import { sampleAnalysis } from '../../dev/sampleAnalysis'
import { CARD_NOISE_SD } from '../analysis/cardNoise'
import { METRICS } from '../analysis/coaching'
import { median } from '../analysis/geometry'
import { MAX_WORDS, command, cueIssues, plain, wordCount } from '../analysis/voice'
import type { ServeDials } from '../analysis/syntheticServe'
import type { ServeTag, Session } from '../storage/db'
import type { ServeType } from '../storage/prefs'
import { assert, check, heading, near, note, report } from '../analysis/__tests__/harness'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const ROWS = Object.keys(CARD_NOISE_SD)
const VERSION = 5

/** Seeded, so a run measures the same rate every time. */
function seeded(seed: number) {
  let a = seed | 0
  const uniform = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const normal = () => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform())
  return { uniform, normal }
}

/** The middle of a row's flat band: a reading with room either side of it. */
const middle = (id: string) => (METRICS[id].ideal[0] + METRICS[id].ideal[1]) / 2

let ids = 0

/** A report carrying these readings, each row as the card builds one. */
function stub(at: number, values: Record<string, number>, over: Partial<Session> = {}, confidence = 1): Session {
  const metrics = Object.entries(values).map(([id, value]) => ({
    id,
    label: METRICS[id].label,
    value,
    unit: METRICS[id].unit,
    decimals: METRICS[id].decimals,
    ideal: METRICS[id].ideal,
    confidence,
    score: 70,
  }))
  return {
    id: `serve-s${ids++}-0`,
    createdAt: at,
    overall: 70,
    serveType: 'flat',
    scoringVersion: VERSION,
    triage: { status: 'ok' },
    quality: { view: 'side' },
    fundamentals: [{ id: 'toss', score: 70, metrics }],
    ...over,
  } as unknown as Session
}

/** Serves on `trips` visits a week apart, in one list of readings per serve. */
function spaced(readings: Record<string, number>[], trips: number, over: Partial<Session> = {}, start = 0): Session[] {
  const perTrip = Math.ceil(readings.length / trips)
  return readings.map((r, i) =>
    stub(start + Math.floor(i / perTrip) * 7 * DAY + (i % perTrip) * 0.1 * HOUR, r, over),
  )
}

/** One row's readings, every other row held in the middle of its band. */
const row = (id: string, value: number): Record<string, number> => ({
  ...Object.fromEntries(ROWS.map((r) => [r, middle(r)])),
  [id]: value,
})

/** A row that wanders around `at` by exactly these offsets. */
const around = (id: string, at: number, offsets: number[]) => offsets.map((o) => row(id, at + o))

/** Twelve offsets, a median of zero and a MAD of `step`. */
const TWELVE = (step: number) => [-3, -2, -1, -1, 0, 0, 0, 0, 1, 1, 2, 3].map((k) => k * step)

const later = (sessions: Session[]) => Math.max(...sessions.map((s) => s.createdAt)) + 7 * DAY

heading('A usual, a spread and a noise')

check('the usual is the median, the spread a scaled MAD, the noise never under the camera', () => {
  const history = spaced(around('kneeBend', 50, TWELVE(5)), 3)
  const base = playerBaseline(history)
  const knee = base?.rows.find((r) => r.metricId === 'kneeBend')
  assert(Boolean(knee), 'twelve serves over three trips made no baseline')
  near(knee!.typical, 50, 1e-9, 'the usual')
  near(knee!.spread, 5 * 1.4826, 1e-9, 'the spread')
  assert(knee!.noise === knee!.spread, 'a spread wider than the camera wasn’t the noise')
  const flat = base!.rows.find((r) => r.metricId === 'contactHeight')!
  assert(flat.spread === 0 && flat.noise === CARD_NOISE_SD.contactHeight, 'a dead steady row went under the camera')
  assert(base!.serves === 12 && base!.trips === 3 && base!.ids.length === 12, JSON.stringify(base))
  assert(knee!.readout === 'Knees well bent', `the usual read "${knee!.readout}"`)
})

check('one wild take moves neither the usual nor the spread by much', () => {
  const offsets = TWELVE(5)
  const steady = playerBaseline(spaced(around('kneeBend', 50, offsets), 3))!.rows.find((r) => r.metricId === 'kneeBend')!
  offsets[11] = 90
  const wild = playerBaseline(spaced(around('kneeBend', 50, offsets), 3))!.rows.find((r) => r.metricId === 'kneeBend')!
  assert(wild.typical === steady.typical && wild.spread === steady.spread, 'a single take moved the baseline')
})

check('a row with no measured camera noise has no baseline', () => {
  const readings = TWELVE(0.01).map((o) => ({ ...row('kneeBend', 50), tossPeakHeight: 1.6 + o }))
  const base = playerBaseline(spaced(readings, 3))!
  assert(!base.rows.some((r) => r.metricId === 'tossPeakHeight'), 'a ball row with no floor was given a spread')
})

heading('Too little to say')

check('below the minimum the baseline is absent, not guessed', () => {
  const offsets = TWELVE(5)
  const enough = spaced(around('kneeBend', 50, offsets), 3)
  assert(playerBaseline(enough) !== undefined, 'twelve serves over three trips weren’t enough')
  assert(playerBaseline(enough.slice(0, MIN_BASELINE_SERVES - 1)) === undefined, 'eleven serves made a baseline')
  assert(playerBaseline([]) === undefined, 'an empty history made a baseline')
  const serve = stub(later(enough), row('kneeBend', 90))
  assert(baselineFor(serve, enough.slice(0, 11)) === undefined, 'a serve found a usual in eleven')
})

check('one trip can’t make a usual, however many serves it holds', () => {
  const offsets = [...TWELVE(5), ...TWELVE(5), ...TWELVE(5)]
  assert(playerBaseline(spaced(around('kneeBend', 50, offsets), 1)) === undefined, 'thirty-six serves in a day made a usual')
  assert(playerBaseline(spaced(around('kneeBend', 50, offsets), 2)) === undefined, 'two trips made a usual')
  assert(playerBaseline(spaced(around('kneeBend', 50, offsets), 3)) !== undefined, 'three trips of twelve made no usual')
  // Ten on one day and a serve each on two others count for six.
  const lopsided = [
    ...around('kneeBend', 50, TWELVE(5).slice(0, 10)).map((r, i) => stub(i * HOUR * 0.1, r)),
    stub(7 * DAY, row('kneeBend', 50)),
    stub(14 * DAY, row('kneeBend', 50)),
  ]
  assert(playerBaseline(lopsided) === undefined, `a lopsided twelve counted for ${SERVES_A_TRIP_COUNTS_FOR * 3}`)
})

check('a player who films every evening has a sitting a day, not one long trip', () => {
  // Every gap under a day, which the trip rule's own chaining would call one trip.
  const readings = around('kneeBend', 50, TWELVE(5))
  const evenings = readings.map((r, i) => stub(Math.floor(i / 4) * 23 * HOUR + (i % 4) * 0.1 * HOUR, r))
  assert(playerBaseline(evenings)?.trips === 3, `${playerBaseline(evenings)?.trips} trips in three evenings`)
  // And three goes at it inside one afternoon are still that afternoon.
  const afternoon = readings.map((r, i) => stub(Math.floor(i / 4) * 2 * HOUR + (i % 4) * 0.1 * HOUR, r))
  assert(playerBaseline(afternoon) === undefined, 'three goes in one afternoon made a usual')
})

check('a soft reading, a graded-nothing area and a refused clip all stay out', () => {
  const history = spaced(around('kneeBend', 50, TWELVE(5)), 3)
  const soft = history.map((s, i) => (i === 0 ? stub(s.createdAt, row('kneeBend', 50), {}, 0.3) : s))
  assert(playerBaseline(soft) === undefined, 'a soft reading was counted towards the twelve')

  const refused = history.map((s, i) => (i === 0 ? { ...s, triage: { status: 'rejected' } } : s)) as Session[]
  assert(playerBaseline(refused) === undefined, 'a refused clip was counted')

  // An area the clip graded nothing in has no reading to give, and costs no row.
  const hollow = history.map((s) => ({
    ...s,
    fundamentals: [...s.fundamentals, { id: 'rhythm', score: 0, metrics: [] }],
  })) as Session[]
  assert(playerBaseline(hollow)!.rows.length === playerBaseline(history)!.rows.length, 'an empty area changed the rows')
})

heading('Like with like')

const twoKinds = (over: Partial<Session>) => {
  const mine = spaced(around('kneeBend', 50, TWELVE(5)), 3)
  const other = spaced(around('kneeBend', 90, TWELVE(5)), 3, over, 0.5 * HOUR)
  return { mine, other, all: [...mine, ...other] }
}

check('other serve types never mix', () => {
  const { all, other } = twoKinds({ serveType: 'kick' })
  const flat = playerBaseline(all, { serveType: 'flat' })!
  const kick = playerBaseline(all, { serveType: 'kick' })!
  assert(flat.rows.find((r) => r.metricId === 'kneeBend')!.typical === 50, 'kicks moved the flat usual')
  assert(kick.rows.find((r) => r.metricId === 'kneeBend')!.typical === 90, 'flat serves moved the kick usual')
  assert(flat.serves === 12 && kick.serves === 12, 'the two types were pooled')
  const serve = other[other.length - 1]
  assert(againstUsual(serve, flat).length === 0, 'a kick was read against a flat usual')
})

check('other scoring versions never mix, and a new rubric starts again', () => {
  const old = spaced(around('kneeBend', 90, TWELVE(5)), 3, { scoringVersion: VERSION - 1 })
  const fresh = spaced(around('kneeBend', 50, TWELVE(5)), 3, {}, later(old))
  const base = playerBaseline([...old, ...fresh])!
  assert(base.scoringVersion === VERSION && base.serves === 12, `pooled across a recalibration: ${JSON.stringify(base.ids.length)}`)
  assert(base.rows.find((r) => r.metricId === 'kneeBend')!.typical === 50, 'the old rubric moved the usual')
  assert(playerBaseline([...old, ...fresh], { scoringVersion: VERSION - 1 }) === undefined, 'an old rubric was served by the newest era')
  const oldServe = stub(later(fresh), row('kneeBend', 120), { scoringVersion: VERSION - 1 })
  assert(againstUsual(oldServe, base).length === 0, 'an old report was read against the new rubric')
  // The first few serves of a new rubric have no usual, whatever came before.
  const first = stub(later(old) + HOUR, row('kneeBend', 120))
  assert(baselineFor(first, old) === undefined, 'a new rubric borrowed the old usual')
})

check('an era in the middle isn’t stitched over', () => {
  const a = spaced(around('kneeBend', 90, TWELVE(5)), 3)
  const b = spaced(around('kneeBend', 20, TWELVE(5)), 3, { scoringVersion: VERSION + 1 }, later(a))
  const c = spaced(around('kneeBend', 50, TWELVE(5)), 3, {}, later(b))
  const base = playerBaseline([...c, ...b, ...a])!
  assert(base.serves === 12 && base.rows.find((r) => r.metricId === 'kneeBend')!.typical === 50, 'two runs of one rubric were joined around a third')
})

check('first and second serves stay apart once tagged', () => {
  const firsts = spaced(around('kneeBend', 50, TWELVE(5)), 3)
  const seconds = spaced(around('kneeBend', 30, TWELVE(5)), 3, {}, 0.5 * HOUR)
  const tags: ServeTag[] = [
    ...seconds.map((s) => ({ id: s.id, serveNumber: 2 as const, taggedAt: 1 })),
    ...firsts.slice(0, 4).map((s) => ({ id: s.id, serveNumber: 1 as const, taggedAt: 1 })),
  ]
  const all = [...firsts, ...seconds]
  const first = playerBaseline(all, { tags, serveNumber: 1 })!
  const second = playerBaseline(all, { tags, serveNumber: 2 })!
  assert(first.rows.find((r) => r.metricId === 'kneeBend')!.typical === 50, 'seconds moved the first-serve usual')
  assert(second.rows.find((r) => r.metricId === 'kneeBend')!.typical === 30, 'firsts moved the second-serve usual')
  // Untagged firsts stand with tagged firsts, and a tagged second goes to its own.
  assert(first.serves === 12, `${first.serves} first serves counted`)
  const next = stub(later(all), row('kneeBend', 30))
  const asSecond = baselineFor(next, all, [...tags, { id: next.id, serveNumber: 2, taggedAt: 1 }])!
  assert(asSecond.serveNumber === 2, 'a tagged second serve took the first-serve usual')
  assert(asSecond.rows.find((r) => r.metricId === 'kneeBend')!.typical === 30, 'a second serve was read against firsts')
  const untagged = baselineFor(next, all, tags)!
  assert(untagged.serveNumber === 1 && untagged.rows.find((r) => r.metricId === 'kneeBend')!.typical === 50, 'an untagged serve lost the first-serve usual')
})

check('another camera angle is another usual', () => {
  const side = spaced(around('kneeBend', 50, TWELVE(5)), 3)
  const behind = spaced(around('kneeBend', 90, TWELVE(5)).slice(0, 8), 3, { quality: { view: 'front-back' } } as Partial<Session>, 0.5 * HOUR)
  const all = [...side, ...behind]
  assert(playerBaseline(all)!.view === 'side', 'the commonest angle wasn’t chosen')
  assert(playerBaseline(all)!.rows.find((r) => r.metricId === 'kneeBend')!.typical === 50, 'two angles were pooled')
  const serve = stub(later(all), row('kneeBend', 90), { quality: { view: 'front-back' } } as Partial<Session>)
  assert(baselineFor(serve, all) === undefined, 'eight serves from behind made a usual for that angle')
  assert(againstUsual(serve, playerBaseline(all)!).length === 0, 'a serve from behind was read against side-on serves')
})

check('a serve is never read against a usual it helped set', () => {
  const history = spaced(around('kneeBend', 50, TWELVE(5)), 3)
  const outlier = stub(later(history), row('kneeBend', 95))
  const all = [...history, outlier]
  assert(againstUsual(outlier, playerBaseline(all)!).length === 0, 'a serve inside the baseline was read')
  assert(againstUsual(outlier, baselineFor(outlier, all)!).length === 1, 'baselineFor didn’t leave the serve out')
})

check('an old report reads as it would have on the day', () => {
  const before = spaced(around('kneeBend', 50, TWELVE(5)), 3)
  const serve = stub(later(before), row('kneeBend', 90))
  const after = spaced(around('kneeBend', 90, TWELVE(5)), 3, {}, later(before) + DAY)
  const base = baselineFor(serve, [...before, serve, ...after])!
  assert(base.rows.find((r) => r.metricId === 'kneeBend')!.typical === 50, 'later serves moved an old report\'s usual')
})

check('the usual follows the player: only the newest serves are in it', () => {
  const older = spaced(around('kneeBend', 40, [...TWELVE(1), ...TWELVE(1), ...TWELVE(1)]), 6)
  const newer = spaced(around('kneeBend', 60, [...TWELVE(1), ...TWELVE(1), ...TWELVE(1)]), 6, {}, later(older))
  const base = playerBaseline([...older, ...newer])!
  assert(base.serves === MAX_BASELINE_SERVES, `${base.serves} serves in the usual`)
  assert(base.rows.find((r) => r.metricId === 'kneeBend')!.typical === 60, 'a changed serve never became the usual')
})

check('a player who films twenty a trip still has a usual, and half a day isn’t a day', () => {
  // The newest thirty serves are two trips here, and two trips can never make a
  // usual. Reaching back a whole trip at a time keeps the rule and the player.
  const offsets = [...TWELVE(1), ...TWELVE(1), ...TWELVE(1), ...TWELVE(1), ...TWELVE(1)]
  const history = spaced(around('kneeBend', 50, offsets.slice(0, 60)), 3)
  const base = playerBaseline(history)
  assert(base?.trips === 3 && base.serves === 60, `${base?.serves} serves over ${base?.trips} trips`)
  const keen = spaced(around('kneeBend', 50, [...offsets, ...offsets].slice(0, 100)), 5)
  const newest = playerBaseline(keen)!
  assert(newest.trips === 3 && newest.serves === 60, `${newest.serves} serves over ${newest.trips} trips`)
})

heading('What is said about one serve')

check('a moved reading is found, with its direction, band, size and sentence', () => {
  const history = spaced(around('kneeBend', 25, TWELVE(1)), 3)
  const base = playerBaseline(history)!
  const reach = reachOf(base.rows.find((r) => r.metricId === 'kneeBend')!)
  const serve = stub(later(history), row('kneeBend', 25 + reach + 1))
  const [found, ...rest] = againstUsual(serve, base)
  assert(found !== undefined && rest.length === 0, `found ${rest.length + (found ? 1 : 0)}`)
  assert(found.metricId === 'kneeBend' && found.direction === 'higher' && found.band === 'towards', JSON.stringify(found))
  near(found.size, Number((reach + 1).toFixed(0)), 1e-9, 'the size in the row\'s unit')
  assert(found.unit === '°', `the unit was ${found.unit}`)
  assert(found.referenceReadout === 'Legs barely bent', found.referenceReadout)
  assert(found.line === 'I saw you **bend the knees further** than usual, closer to the target.', found.line)
  note(found.line)

  const below = stub(later(history), row('kneeBend', 25 - reach - 1))
  const [low] = againstUsual(below, base)
  assert(low.direction === 'lower' && low.band === 'away', JSON.stringify(low))
  assert(low.line === 'I saw you **bend the knees less** than usual, further from the target.', low.line)
})

check('a serve inside the band says so, and grades nothing', () => {
  const history = spaced(around('kneeBend', 45, TWELVE(1)), 3)
  const base = playerBaseline(history)!
  const serve = stub(later(history), row('kneeBend', 70))
  const [found] = againstUsual(serve, base)
  assert(found.band === 'level', `moved "${found.band}" with both inside the band`)
  assert(found.line === 'I saw you **bend the knees further** than usual, still on target.', found.line)
})

check('inside the reach says nothing, and the camera sets the floor', () => {
  // Dead steady: no spread at all, so only the camera stands behind the line.
  const history = spaced(around('kneeBend', 50, TWELVE(0)), 3)
  const base = playerBaseline(history)!
  const knee = base.rows.find((r) => r.metricId === 'kneeBend')!
  near(reachOf(knee), cameraMultiple(12) * CARD_NOISE_SD.kneeBend, 1e-9, 'the reach of a steady player')
  assert(againstUsual(stub(later(history), row('kneeBend', 50 + reachOf(knee) - 0.1)), base).length === 0, 'a move inside the camera was said')
  assert(againstUsual(stub(later(history), row('kneeBend', 50 + reachOf(knee) + 0.1)), base).length === 1, 'a move past the camera went unsaid')
})

check('a wide player needs a wider move than a steady one', () => {
  const steady = playerBaseline(spaced(around('kneeBend', 50, TWELVE(1)), 3))!.rows.find((r) => r.metricId === 'kneeBend')!
  const wide = playerBaseline(spaced(around('kneeBend', 50, TWELVE(5)), 3))!.rows.find((r) => r.metricId === 'kneeBend')!
  assert(reachOf(wide) > reachOf(steady), 'the player\'s own spread didn’t widen the line')
  near(reachOf(wide), spreadMultiple(12) * wide.spread, 1e-9, 'the reach of a wide player')
})

check('a reading the player has already reached is no departure, whatever the MAD says', () => {
  // A frame-counted row: most serves on one value, a tail the MAD cannot see.
  const offsets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -9, 0]
  const history = spaced(around('tossArmHold', 70, offsets), 3)
  const base = playerBaseline(history)!
  const hold = base.rows.find((r) => r.metricId === 'tossArmHold')!
  assert(hold.spread === 0 && reachOf(hold) < 9, 'the fixture lost its point')
  assert(againstUsual(stub(later(history), row('tossArmHold', 61)), base).length === 0, 'a value already in the baseline was a departure')
  assert(againstUsual(stub(later(history), row('tossArmHold', 60)), base).length === 1, 'a new low went unsaid')
})

check('a soft reading on the serve itself, a missing row and a refused clip say nothing', () => {
  const history = spaced(around('kneeBend', 50, TWELVE(1)), 3)
  const base = playerBaseline(history)!
  assert(againstUsual(stub(later(history), row('kneeBend', 95), {}, 0.3), base).length === 0, 'a soft reading was said')
  assert(againstUsual(stub(later(history), { contactHeight: 1.3 }), base).length === 0, 'a row this serve never read was said')
  assert(againstUsual(stub(later(history), row('kneeBend', 95), { triage: { status: 'rejected' } } as Partial<Session>), base).length === 0, 'a refused clip was read')
})

check('at most three readings, strongest first', () => {
  const history = spaced(TWELVE(0).map(() => row('kneeBend', middle('kneeBend'))), 3)
  const base = playerBaseline(history)!
  const everything = Object.fromEntries(ROWS.map((id, i) => [id, middle(id) + (i + 6) * CARD_NOISE_SD[id]]))
  const found = againstUsual(stub(later(history), everything), base)
  assert(found.length === MAX_READINGS, `${found.length} readings`)
  assert(found[0].strength >= found[1].strength && found[1].strength >= found[2].strength, 'not strongest first')
  assert(found[0].metricId === ROWS[ROWS.length - 1], `led with ${found[0].metricId}`)
})

heading('Pure noise, measured')

/**
 * How many serves in `runs` histories of pure noise carried a reading: each row
 * drawn from one normal, around the middle of its band, at `ratio` of the camera
 * noise. `dayShift` adds a shift per trip and per row, as a share of that spread.
 * The serve read is a fresh draw from a trip of its own, or from the last one.
 */
function falseRate(runs: number, serves: number, trips: number, ratio: number, dayShift = 0, seed = 1, sameTrip = false) {
  const { normal } = seeded(seed)
  let said = 0
  let spoken = 0
  for (let k = 0; k < runs; k++) {
    const shifts = ROWS.map(() => Array.from({ length: trips + 1 }, () => normal() * dayShift))
    const read = (trip: number) =>
      Object.fromEntries(
        ROWS.map((id, r) => [id, middle(id) + CARD_NOISE_SD[id] * ratio * (normal() + shifts[r][trip])]),
      )
    const perTrip = Math.ceil(serves / trips)
    const readings = Array.from({ length: serves }, (_, i) => read(Math.floor(i / perTrip)))
    const history = spaced(readings, trips)
    const serve = stub(later(history), read(sameTrip ? trips - 1 : trips))
    const base = baselineFor(serve, history)
    if (!base) continue
    spoken++
    if (againstUsual(serve, base).length) said++
  }
  return { rate: said / Math.max(spoken, 1), spoken }
}

const pct = (x: number) => `${(x * 100).toFixed(2)}%`

check('the multiple tracks the row-level tail it was fitted to', () => {
  // The statistic alone, with no camera in it: where a fresh serve's distance
  // from the median falls, in scaled MADs, at the row's share of the five per cent.
  const { normal } = seeded(3)
  const share = 1 - (1 - FALSE_READINGS_PER_SERVE) ** (1 / ROWS.length)
  for (const n of [12, 16, 20, 30]) {
    const draws = 60000
    const t = new Float64Array(draws)
    for (let k = 0; k < draws; k++) {
      const y = Array.from({ length: n }, () => normal())
      const m = median(y)
      t[k] = Math.abs(normal() - m) / (MAD_TO_SD * median(y.map((v) => Math.abs(v - m))))
    }
    const point = t.sort()[Math.floor((1 - share) * draws)]
    note(`${n} serves: measured ${point.toFixed(2)}, the multiple says ${spreadMultiple(n).toFixed(2)}`)
    near(spreadMultiple(n), point, 0.08 * point, `the multiple at ${n}`)
  }
})

check('the multiple holds the rate at every size, on a spread far wider than the camera', () => {
  const runs = 2000
  for (const [serves, trips] of [[12, 3], [16, 4], [20, 5], [30, 8]]) {
    const { rate, spoken } = falseRate(runs, serves, trips, 8, 0, serves)
    note(`${serves} serves over ${trips} trips, spread 8× the camera: ${pct(rate)} of serves said something false`)
    assert(spoken === runs, `${spoken} of ${runs} histories had a baseline`)
    assert(rate <= FALSE_READINGS_PER_SERVE + 0.012, `${pct(rate)} is past the stated ${pct(FALSE_READINGS_PER_SERVE)}`)
    assert(rate >= 0.015, `${pct(rate)}: the multiple is far wider than it needs to be`)
  }
})

check('the rate holds at the camera and under it', () => {
  for (const ratio of [1, 0.25]) {
    const { rate } = falseRate(2000, 24, 6, ratio, 0, 7)
    note(`24 serves over 6 trips, spread ${ratio}× the camera: ${pct(rate)}`)
    assert(rate <= FALSE_READINGS_PER_SERVE, `${pct(rate)} past the rate at ${ratio}× the camera`)
  }
})

/**
 * Twelve serves off one day, read the next, with no cap on what a trip counts
 * for: the case `SERVES_A_TRIP_COUNTS_FOR` refuses. Worked by hand, since the
 * baseline will not make one.
 */
function oneTripRate(runs: number, dayShift: number, seed: number) {
  const { normal } = seeded(seed)
  let said = 0
  for (let k = 0; k < runs; k++) {
    let any = false
    for (let r = 0; r < ROWS.length; r++) {
      const day = normal() * dayShift
      const y = Array.from({ length: 12 }, () => day + normal())
      const m = median(y)
      const s = MAD_TO_SD * median(y.map((v) => Math.abs(v - m)))
      if (Math.abs(normal() * dayShift + normal() - m) > spreadMultiple(12) * s) any = true
    }
    if (any) said++
  }
  return said / runs
}

check('a shift from day to day stays near the rate, which is what counting trips buys', () => {
  // What a trip shares: the phone's spot, the light. Half the player's spread.
  const worst = [[12, 3], [16, 4], [24, 6], [30, 3]]
    .map(([serves, trips]) => {
      const { rate } = falseRate(2000, serves, trips, 8, 0.5, serves + 1)
      note(`${serves} serves over ${trips} trips, a day shifting half a spread, read on a new trip: ${pct(rate)}`)
      return rate
    })
    .reduce((a, b) => Math.max(a, b))
  assert(worst <= 0.07, `${pct(worst)} of serves said something false on a day shift`)
  // And a serve read on the last trip shares that trip's shift.
  const { rate } = falseRate(2000, 24, 6, 8, 0.5, 3, true)
  note(`24 serves over 6 trips, the same shift, read on the last trip: ${pct(rate)}`)
  assert(rate <= FALSE_READINGS_PER_SERVE + 0.012, `${pct(rate)} on the last trip`)
  // The cap's counterfactual: what one trip would claim if it were let.
  const half = oneTripRate(4000, 0.5, 9)
  const whole = oneTripRate(4000, 1, 10)
  note(`twelve serves off one day, read the next, if they were let: ${pct(half)} on that shift, ${pct(whole)} on a whole spread`)
  assert(half > worst && whole > 2 * half, 'the cap on a trip no longer buys anything')
})

check('a stronger shift is reported, not hidden', () => {
  const { rate } = falseRate(2000, 24, 6, 8, 1, 5)
  note(`24 serves over 6 trips, a day shifting a whole spread: ${pct(rate)}. The stated rate doesn’t cover this.`)
  assert(rate <= 0.12, `${pct(rate)} on a shift as big as the spread`)
})

/** Takes of one serve through the real engine, with per-take dials from `dial`. */
function rigTakes(count: number, seedBase: number, noise: number, dial: (r: ReturnType<typeof seeded>) => Partial<ServeDials>): Session[] {
  const r = seeded(seedBase)
  return Array.from({ length: count }, (_, i) => {
    const { frames: _f, ...a } = sampleAnalysis({ ...LOADED, noise, seed: seedBase + i, ...dial(r) })
    void _f
    return { ...a, id: `rig-${seedBase}-${i}`, scoringVersion: VERSION } as Session
  })
}

/** Knees that bend, so the trophy is its own moment and every row is read. */
const LOADED: Partial<ServeDials> = { trophyKneeAngle: 133, contactHipHeight: 1.09 }

/** A player whose serve really moves from take to take, past the camera on several rows. */
const WANDERING = (r: ReturnType<typeof seeded>): Partial<ServeDials> => ({
  trophyKneeAngle: 133 + r.normal() * 7,
  contactHipHeight: 1.09 + r.normal() * 0.012,
  contactReach: 1.22 + r.normal() * 0.03,
  dropBelowShoulder: 0.08 + r.normal() * 0.05,
  shoulderTilt: 22 + r.normal() * 4,
  tossArmHold: 0.62 + r.normal() * 0.05,
  dropElbowLift: 0.4 + r.normal() * 0.15,
  motionSeconds: 1.45 + r.normal() * 0.06,
})

/** Draw histories at random from a pool of takes: `pool` costs the engine once. */
function poolRate(pool: Session[], runs: number, serves: number, trips: number, seed: number) {
  const { uniform } = seeded(seed)
  let said = 0
  const hits = new Map<string, number>()
  for (let k = 0; k < runs; k++) {
    const take = [...pool]
    for (let i = 0; i <= serves; i++) {
      const j = i + Math.floor(uniform() * (take.length - i))
      ;[take[i], take[j]] = [take[j], take[i]]
    }
    const perTrip = Math.ceil(serves / trips)
    const history = take.slice(0, serves).map((s, i) => ({
      ...s,
      id: `h${i}`,
      createdAt: Math.floor(i / perTrip) * 7 * DAY + (i % perTrip) * 0.1 * HOUR,
    }))
    const serve = { ...take[serves], id: 'now', createdAt: later(history) }
    const base = baselineFor(serve, history)
    if (!base) continue
    const found = againstUsual(serve, base)
    if (found.length) said++
    for (const f of found) hits.set(f.metricId, (hits.get(f.metricId) ?? 0) + 1)
  }
  return { rate: said / runs, hits }
}

const steadyPool = rigTakes(200, 1000, 0.004, () => ({}))
const wanderingPool = rigTakes(300, 5000, 0.006, WANDERING)

check('on the real engine, a steady serve filmed again and again says nothing', () => {
  const { rate, hits } = poolRate(steadyPool, 2000, 24, 6, 11)
  note(`the rig's tracker noise alone: ${pct(rate)} of serves said something false ${JSON.stringify([...hits])}`)
  assert(rate <= FALSE_READINGS_PER_SERVE, `${pct(rate)} past the stated rate`)
})

check('on the real engine, a serve that really wanders holds the rate too', () => {
  // Not a vacuous pass: this player's own spread has to clear the camera's.
  const wide = playerBaseline(wanderingPool.map((s, i) => ({ ...s, id: `p${i}`, createdAt: Math.floor(i / 5) * 7 * DAY + (i % 5) * 0.1 * HOUR })))!
  const past = wide.rows.filter((r) => r.spread > r.camera).map((r) => r.metricId)
  note(`rows past the camera: ${past.join(', ')}`)
  assert(past.length >= 4, `only ${past.length} rows wandered past the camera`)
  for (const [serves, trips] of [[12, 3], [24, 6], [30, 8]]) {
    const { rate, hits } = poolRate(wanderingPool, 2000, serves, trips, serves)
    note(`a wandering player, ${serves} serves over ${trips} trips: ${pct(rate)} ${JSON.stringify([...hits])}`)
    assert(rate <= FALSE_READINGS_PER_SERVE + 0.012, `${pct(rate)} past the stated rate`)
  }
})

heading('A real move, through the real engine')

/** A rig history over four trips, then one serve with its dials moved. */
function dialled(moved: Partial<ServeDials>, base: Partial<ServeDials> = {}) {
  const takes = rigTakes(20, 300, 0.004, () => base)
  const history = takes.map((s, i) => ({ ...s, id: `base-${i}`, createdAt: Math.floor(i / 5) * 7 * DAY + (i % 5) * 0.1 * HOUR }))
  const { frames: _f, ...a } = sampleAnalysis({ ...LOADED, ...base, noise: 0.004, seed: 999, ...moved })
  void _f
  const serve = { ...a, id: 'now', createdAt: later(history), scoringVersion: VERSION } as Session
  return { history, serve, base: baselineFor(serve, history) }
}

check('knees bent further are found, and said as a body position', () => {
  const { serve, base } = dialled({ trophyKneeAngle: 105 })
  assert(Boolean(base), 'no baseline on twenty rig serves')
  const found = againstUsual(serve, base!)
  note(found.map((f) => `${f.line} (${f.metricId}, ${f.size}${f.unit}, ${f.strength} noises)`).join(' · ') || 'nothing')
  const knee = found.find((f) => f.metricId === 'kneeBend')
  assert(knee?.direction === 'higher', `the deeper knees weren’t found: ${JSON.stringify(found.map((f) => f.metricId))}`)
  assert(knee!.size >= 14, `moved ${knee!.size}°`)
})

check('a contact struck lower is found, against the usual and the band', () => {
  const { serve, base } = dialled({ contactReach: 1.02 })
  const found = againstUsual(serve, base!)
  note(found.map((f) => `${f.line} (${f.metricId})`).join(' · ') || 'nothing')
  const contact = found.find((f) => f.metricId === 'contactHeight')
  assert(contact?.direction === 'lower' && contact.band === 'away', JSON.stringify(found))
  assert(contact!.line === 'I saw you **meet the ball lower** than usual, further from the target.', contact!.line)
})

check('the same dials as the usual say nothing', () => {
  const { serve, base } = dialled({})
  const found = againstUsual(serve, base!)
  assert(found.length === 0, `a clean take said: ${found.map((f) => f.line).join(' / ')}`)
})

heading('Against the best')

/** Twelve serves over three trips around `overall`, with one best among them. */
function withBest(bestValue: number, bestOverall: number, usual = 25) {
  const offsets = TWELVE(1)
  const readings = around('kneeBend', usual, offsets)
  const history = spaced(readings, 3).map((s, i) => ({ ...s, overall: 70 + offsets[i] }))
  const best = stub(5 * 7 * DAY, row('kneeBend', bestValue), { overall: bestOverall })
  return { history: [...history, best], best }
}

check('the best is the highest earlier serve of the same kind, and has to stand clear', () => {
  const { history, best } = withBest(50, 85)
  const serve = stub(later(history), row('kneeBend', 25))
  const base = baselineFor(serve, history)!
  assert(earlierBest(serve, history, base)?.id === best.id, 'the clear best wasn’t found')

  // Three points over the usual is the luckiest serve of a steady player.
  const { history: lucky } = withBest(50, 73)
  const steady = stub(later(lucky), row('kneeBend', 25))
  assert(earlierBest(steady, lucky, baselineFor(steady, lucky)!) === undefined, 'a best inside the noise was called a best')

  // A later serve, a kick and another angle are not this serve's best.
  const after = stub(later(history) + DAY, row('kneeBend', 60), { overall: 99 })
  const kick = stub(later(history) - DAY, row('kneeBend', 60), { overall: 98, serveType: 'kick' as ServeType })
  const behind = stub(later(history) - DAY, row('kneeBend', 60), { overall: 97, quality: { view: 'front-back' } } as Partial<Session>)
  assert(earlierBest(serve, [...history, after, kick, behind], base)?.id === best.id, 'a best from elsewhere was taken')
})

check('a second serve has its own best', () => {
  const { history, best } = withBest(50, 85)
  const second = stub(5 * 7 * DAY, row('kneeBend', 44), { overall: 88 })
  const seconds = around('kneeBend', 25, TWELVE(1)).map((r, i) => stub(i * 2.4 * DAY + HOUR, r))
  const tags: ServeTag[] = [...seconds, second].map((s) => ({ id: s.id, serveNumber: 2, taggedAt: 1 }))
  const all = [...history, ...seconds, second]
  const serve = stub(later(all), row('kneeBend', 25))
  const asFirst = earlierBest(serve, all, baselineFor(serve, all, tags)!, tags)
  assert(asFirst?.id === best.id, 'a tagged second took a first serve\'s best')
  const tagsNow = [...tags, { id: serve.id, serveNumber: 2 as const, taggedAt: 1 }]
  const asSecond = earlierBest(serve, all, baselineFor(serve, all, tagsNow)!, tagsNow)
  assert(asSecond?.id === second.id, 'a second serve took a first serve as its best')
})

check('differences from the best are held to two serves of noise, and said as such', () => {
  const { history, best } = withBest(50, 85)
  const serve = stub(later(history), row('kneeBend', 22))
  const base = baselineFor(serve, history)!
  const knee = base.rows.find((r) => r.metricId === 'kneeBend')!
  const [found] = againstBest(serve, best, base)
  assert(found?.metricId === 'kneeBend' && found.direction === 'lower' && found.band === 'away', JSON.stringify(found))
  assert(found.line === 'I saw you **bend the knees less** than on your earlier best, further from the target.', found.line)
  near(found.reference, 50, 1e-9, 'the best\'s own reading')
  const edge = 50 - Math.SQRT2 * reachOf(knee)
  assert(againstBest(stub(later(history), row('kneeBend', edge + 0.1)), best, base).length === 0, 'a gap inside two serves of noise was said')
  assert(againstBest(stub(later(history), row('kneeBend', edge - 0.1)), best, base).length === 1, 'a gap past it went unsaid')
})

check('nothing is said against a best that came later, or against the serve itself', () => {
  const { history, best } = withBest(50, 85)
  const serve = stub(later(history), row('kneeBend', 22))
  const base = baselineFor(serve, history)!
  assert(againstBest(serve, serve as Session, base).length === 0, 'a serve was set against itself')
  assert(againstBest(stub(best.createdAt - 1, row('kneeBend', 22)), best, base).length === 0, 'a serve was set against a later best')
  // Its own usual's noise cannot be the yardstick for it either.
  assert(againstBest(serve, best, playerBaseline([...history, serve])!).length === 0, 'a serve inside the baseline was set against the best')
})

check('on pure noise the best says nothing false, even picked for luck', () => {
  // Each serve's overall leans on its rows, so a best is picked on them, which
  // is the selection a real best carries.
  const { normal } = seeded(21)
  const runs = 2000
  let said = 0
  let bests = 0
  for (let k = 0; k < runs; k++) {
    const read = () => {
      const z = ROWS.map(() => normal())
      const values = Object.fromEntries(ROWS.map((id, r) => [id, middle(id) + 8 * CARD_NOISE_SD[id] * z[r]]))
      return { values, overall: 70 + (4 * z.reduce((a, b) => a + b, 0)) / Math.sqrt(ROWS.length) }
    }
    const draws = Array.from({ length: 24 }, read)
    const history = spaced(draws.map((d) => d.values), 6).map((s, i) => ({ ...s, overall: draws[i].overall }))
    const serve = stub(later(history), read().values)
    const base = baselineFor(serve, history)!
    const best = earlierBest(serve, history, base)
    if (!best) continue
    bests++
    if (againstBest(serve, best, base).length) said++
  }
  note(`a best stood clear in ${pct(bests / runs)} of noise histories; ${pct(said / runs)} of serves said something false against it`)
  assert(said / runs <= FALSE_READINGS_PER_SERVE, `${pct(said / runs)} past the rate`)
  assert(bests / runs < 0.5, `a best stood clear of pure noise in ${pct(bests / runs)} of histories`)
})

heading('The one-line reward')

check('reaching what made the best the best is said', () => {
  const { history, best } = withBest(50, 85)
  const serve = stub(later(history), row('kneeBend', 49))
  const base = baselineFor(serve, history)!
  const reached = closestToBest(serve, best, base)
  note(reached?.line ?? 'nothing')
  assert(reached?.metricId === 'kneeBend', JSON.stringify(reached))
  assert(reached!.line === 'I saw you match your earlier best on **knee bend at trophy**.', reached!.line)
})

check('no reward for a row the best didn’t stand out on, or a serve short of it', () => {
  const { history, best } = withBest(50, 85)
  const base = baselineFor(stub(later(history), row('kneeBend', 25)), history)!
  assert(closestToBest(stub(later(history), row('kneeBend', 26)), best, base) === undefined, 'the usual serve was rewarded')
  assert(closestToBest(stub(later(history), row('kneeBend', 40)), best, base) === undefined, 'a serve well short of the best was rewarded')
  // The usual already sits in the band, so the best being further up it is no gain.
  const { history: inBand, best: high } = withBest(75, 85, 50)
  const serve = stub(later(inBand), row('kneeBend', 75))
  assert(closestToBest(serve, high, baselineFor(serve, inBand)!) === undefined, 'a reward for a row already on target')
})

heading('The words')

check('every row can be said, every way, and every line passes the editor', () => {
  const directions: Direction[] = ['higher', 'lower']
  const bands: BandMove[] = ['towards', 'away', 'level']
  for (const id of ROWS) {
    assert(ROW_WORDS[id] !== undefined, `${id} has a measured noise and no words`)
    for (const direction of directions) {
      for (const band of bands) {
        for (const onTarget of [true, false]) {
          for (const against of ['usual', 'best'] as const) {
            const line = selfLine(id, direction, band, onTarget, against)
            const issues = cueIssues(line)
            assert(issues.length === 0, `${issues.join('; ')}\n        "${line}"`)
            assert(command(line) === line, `the filter changes "${line}" into "${command(line)}"`)
            assert(wordCount(line) <= MAX_WORDS, `${wordCount(line)} words: "${line}"`)
            assert(/^I saw you/.test(plain(line)), `not in the first person: "${line}"`)
            assert(!/\d/.test(line), `a figure in "${line}"`)
          }
        }
      }
    }
  }
})

check('every row\'s two directions say different things, and every label takes the reward line', () => {
  for (const id of ROWS) {
    assert(ROW_WORDS[id].more !== ROW_WORDS[id].less, `${id} says the same thing both ways`)
    const history = spaced(around(id, METRICS[id].ideal[0] - 40 * CARD_NOISE_SD[id], TWELVE(0)), 3)
    const best = stub(later(history), row(id, middle(id)), { overall: 95 })
    const serve = stub(later(history) + DAY, row(id, middle(id)))
    const reached = closestToBest(serve, best, baselineFor(serve, [...history])!)
    assert(reached !== undefined, `${id} earned no reward`)
    const issues = cueIssues(reached!.line)
    assert(issues.length === 0, `${issues.join('; ')}\n        "${reached!.line}"`)
  }
})

check('no line makes a medical claim or a promise', () => {
  for (const id of ROWS) {
    for (const words of Object.values(ROW_WORDS[id])) {
      assert(!/\b(injur|pain|strain|risk|hurt|medical|sore|safe)/i.test(words), `a medical claim: "${words}"`)
      assert(!/\b(better|worse|should|must)\b/i.test(words), `a row's words grade the move: "${words}"`)
    }
  }
})

report()
