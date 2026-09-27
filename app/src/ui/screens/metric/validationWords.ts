/**
 * How sure we are, per metric (METRICS §1.3, §5; DESIGN §3.2, §10.14; PRODUCT §6.13 item 5, §6.14 item 4).
 *
 * - The validation STATE comes from docs/specs/metrics.json (`validationState`, via data/catalogue.json);
 *   validationState.test.ts keeps it equal to the engine catalogue (analysis/metrics/catalogue.ts).
 * - The NUMBERS come from the engine's synthetic run, app/src/analysis/metrics/validation-summary.json
 *   (written by tools/validate/metrics-eval.ts; ARCHITECTURE §13 says "How we measure" reads it), plus
 *   the pooled spread rows and building blocks in data/validation.json (tools/build-metric-data.mjs).
 * - Words only here: Australian English, second person, no dashes, no degrees (D5), never overclaim.
 *   Every figure is from computer-generated serves and says so.
 */
import summary from '../../../analysis/metrics/validation-summary.json'
import type { MetricId } from '../../../analysis/types.ts'
import { exportDate } from '../../format/dates.ts'
import catalogue from './data/catalogue.json'
import validation from './data/validation.json'

export const VALIDATION_STATES = [
  'V1-synthetic-pass',
  'V1-synthetic-pass-limited',
  'V1-synthetic-fail',
  'V0-synthetic-inconclusive',
  'V0-unvalidated',
  'not-applicable',
] as const
export type ValidationState = (typeof VALIDATION_STATES)[number]

export interface GroupResult {
  n: number
  bias: number
  mae: number
  p95: number
  coverage: number | null
  pass: boolean
}

export interface MetricResult {
  /** Recommended set-ups: D1 portrait 7 to 7.5 m and landscape at the fence, 9 m. */
  d1?: GroupResult
  /** Every side-view daylight clip at 60 fps or more (includes 5 m clips, closer than D1). */
  all?: GroupResult
}

type SummaryGroup = { pass: boolean; n: number; bias: number; mae: number; p95: number; coverage: number | null }
type SummaryMetric = Record<string, SummaryGroup | string>

const SUMMARY_METRICS = summary.metrics as unknown as Record<string, SummaryMetric>

function group(m: SummaryMetric | undefined, prefix: string): GroupResult | undefined {
  if (!m) return undefined
  const key = Object.keys(m).find((k) => k.toLowerCase().startsWith(prefix))
  const g = key ? m[key] : undefined
  if (!g || typeof g === 'string') return undefined
  return { n: g.n, bias: g.bias, mae: g.mae, p95: g.p95, coverage: g.coverage ?? null, pass: g.pass }
}

export function metricResult(id: MetricId): MetricResult | null {
  const m = SUMMARY_METRICS[id]
  if (!m) return null
  return { d1: group(m, 'd1'), all: group(m, 'all side-view') }
}

export function validationStateOf(id: MetricId): ValidationState {
  const entry = catalogue.metrics.find((m) => m.id === id)
  const s = entry?.validationState
  return (VALIDATION_STATES as readonly string[]).includes(s ?? '') ? (s as ValidationState) : 'V0-unvalidated'
}

/** The synthetic run the numbers come from: "27 Sep 2026", 122 clips. */
export const RUN = {
  clips: summary.clips,
  /** Local calendar date of the run (the ISO stamp is UTC; the run was on 27 Sep 2026 in Melbourne). */
  date: exportDate(new Date(summary.generated)),
}

// ---------------------------------------------------------------- words

/** Full sentence for Metric info "How sure we are" (DESIGN §3.2 wording, made specific per state). */
export const STATE_WORDS: Record<ValidationState, string> = {
  'V1-synthetic-pass': 'Checked on simulated serves in daylight. Not yet checked on real courts.',
  'V1-synthetic-pass-limited': 'Checked on simulated serves in daylight, on limited evidence so far. Not yet checked on real courts.',
  'V1-synthetic-fail': "Tested on simulated serves and not accurate enough yet, so it stays experimental. Not yet checked on real courts.",
  'V0-synthetic-inconclusive': "Tested on simulated serves, but those tests can't settle it yet, so it stays experimental.",
  'V0-unvalidated': 'Not yet checked, even on simulated serves.',
  'not-applicable': 'You log this, so the camera plays no part. We count what you enter.',
}

/** Spin is 'not-applicable' too, but nobody logs it: it is never measured (D4). */
export const SPIN_WORDS = "Phone video can't see spin, so there is nothing to check and it is never shown as a number."

/** Short form for list rows (How we measure). */
export const STATE_SHORT: Record<ValidationState, string> = {
  'V1-synthetic-pass': 'Checked on simulated serves.',
  'V1-synthetic-pass-limited': 'Checked on simulated serves, limited evidence.',
  'V1-synthetic-fail': 'Simulated check not passed yet.',
  'V0-synthetic-inconclusive': 'Simulated check not conclusive.',
  'V0-unvalidated': 'Not yet checked.',
  'not-applicable': 'You log this.',
}

/** Second line for V1 metrics: lights and real courts (METRICS §1.3 night cap, D11 comp nights). */
export const NIGHT_WORDS = 'Not yet checked under court lights, so at night it shows as experimental.'

type Unit = 'ratio' | 'cm' | 'ms' | 'pctH' | 'rate' | 'count' | 'angle'

const UNIT: Partial<Record<MetricId, Unit>> = {
  'toss-apex-height': 'ratio',
  'contact-height-ratio': 'ratio',
  'toss-forward': 'cm',
  'toss-drop': 'cm',
  'contact-forward': 'cm',
  'landing-distance': 'cm',
  'rhythm-release-to-contact': 'ms',
  'trophy-pause': 'ms',
  'drive-time': 'ms',
  'leg-drive': 'pctH',
  'loading-depth': 'pctH',
  'deep-bend-flag': 'rate',
  'serve-count': 'count',
  'shoulder-tilt-trophy': 'angle',
}

/** Pass marks from METRICS §5.4 (S0 thresholds), in player words. No degrees (D5). */
const PASS_MARK: Partial<Record<MetricId, string>> = {
  'toss-apex-height': 'a typical error within 2.5% of your height, and 1 in 20 serves within 5%',
  'contact-height-ratio': 'a typical error within 3% of your height, and 1 in 20 serves within 5%',
  'toss-forward': 'a typical error within 5 cm, and 1 in 20 serves within 10 cm',
  'toss-drop': 'a typical error within 5 cm',
  'contact-forward': 'a typical error within 6 cm, and 1 in 20 serves within 12 cm',
  'landing-distance': 'a typical error within 8 cm, and 1 in 20 serves within 15 cm',
  'rhythm-release-to-contact': 'a typical error within one frame plus 5 ms (about 22 ms at 60 fps)',
  'trophy-pause': 'a typical error within 60 ms',
  'drive-time': 'a typical error within 50 ms',
  'leg-drive': 'a typical error within 2% of your height',
  'loading-depth': 'a typical error within 2% of your height',
  'deep-bend-flag': 'agreement with the truth on at least 85 of 100 serves',
  'serve-count': 'at least 99 of 100 serves found, with no extras',
  'shoulder-tilt-trophy': 'close to the true tilt on 19 of 20 serves',
}

/** What can shift it: the conditions the synthetic run showed matter (DESIGN §10.14 "what can shift it"). */
const SHIFT: Partial<Record<MetricId, string>> = {
  'toss-apex-height': 'Filming closer than about 6 m made heights read low, so those serves are marked experimental. A tilted phone, or one whose tilt we could not read, does the same.',
  'contact-height-ratio': 'Filming closer than about 6 m made heights read low, so those serves are marked experimental.',
  'toss-drop': 'Very dim light and heavy motion blur made it less sure. 120 fps or the hit sound sharpens it.',
  'rhythm-release-to-contact': 'At 30 fps the toss release is hard to see, so 30 fps rhythm is marked experimental.',
  'rhythm-spread': 'At 30 fps the timing noise is close to the spread itself, so we say when it is at the limit.',
  'toss-forward': "Most of the error is a steady offset: the body tracker's toe point sits a little behind your real toe, so positions read a few centimetres long.",
  'contact-forward': "Most of the error is a steady offset: the body tracker's toe point sits a little behind your real toe, so positions read a few centimetres long.",
  'leg-drive': "Most of the error is a steady offset: the tracker reads your hip rise a little low on every serve, so comparisons with your own serves aren't affected.",
  'loading-depth': 'Very small dips are hard to tell apart from tracking noise.',
  'trophy-pause': 'The moment your hips are lowest is hard to pin down in time.',
  'drive-time': 'The moment your hips are lowest is hard to pin down in time.',
  'landing-distance': 'Most serves were close, but a few were well off, mostly with the phone sideways at the fence, 9 m away.',
  // validation/results/ui/harden-performance/bench/{session,sample-checkin}__default__before.json (27 Sep 2026):
  // the full app found all 8 and all 16 serves, but marked 1 and 2 of them unsure (BALL_NOT_TRACKED) and
  // counted 7 and 14. docs/VALIDATION.md §3.3.
  'serve-count':
    "Run through the full app, from video to report, two longer simulated sessions of 8 and 16 serves were harder: it found every serve but was unsure of 3 and left them out, so the count read 1 or 2 short. Those serves stay in your list, marked as excluded, and you can include them again.",
  'toss-height-spread': 'A toss that wanders left or right adds a little to the spread from the side.',
  'contact-height-spread': 'At 60 fps a very steady contact can be below what we can measure; we say so when it is.',
  'speed-experimental': 'It needs 120 fps or more, your height and the target you aimed at.',
  'deep-bend-flag': "Our simulated player bends the front knee almost across the picture, which is easier to read than a real knee pointing at the camera, so this pass doesn't count yet.",
  'knee-bend-band': 'Only 6 simulated serves were filmed from behind, too few to judge, and from lower than the recommended raised phone.',
  'shoulder-tilt-trophy': "Our simulated player holds the same shoulder tilt at the top of every swing, so we can't yet test whether it tells your usual serves apart.",
  'capture-quality': 'On simulated clips, the view check caught all 5 clips filmed from in front instead of the side, and the tilt check turned down all 5 clips with the phone tipped up. The other checks are only tested one by one.',
}

/** Why a metric has not been checked yet, for V0-unvalidated states (docs/VALIDATION.md §7). */
const NOT_YET: Partial<Record<MetricId, string>> = {
  'retoss-count': "We haven't made simulated serves with a caught toss yet.",
  'toss-lateral': "Only a handful of simulated serves were filmed from behind, and this wasn't scored against the truth.",
  'toss-lateral-spread': "Only a handful of simulated serves were filmed from behind, and this wasn't scored against the truth.",
  'shoulder-over-shoulder-contact': "Only a handful of simulated serves were filmed from behind, and this wasn't scored against the truth.",
  repeatability: "It needs sets of 20 simulated serves with known consistency, which we haven't made yet.",
  'speed-average-rear': "On the one simulated clip filmed from behind, we couldn't find the bounce reliably, so no speed was given.",
  'fatigue-flag': "We haven't made a simulated session where your contact height drops off as you tire.",
  'load-flag': "It is simple arithmetic on the serves you log. The sums are tested; the advice isn't.",
}

const r05 = (x: number) => Math.round(x * 2) / 2
const trim = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1))

/** "about 1% of your height", "under 1 cm", "about 11 ms". Height adds centimetres for ratios. */
export function errorWords(id: MetricId, value: number, heightM?: number): string | null {
  const v = Math.abs(value)
  switch (UNIT[id]) {
    case 'ratio': {
      const pct = v * 100
      const words = pct < 1 ? 'under 1% of your height' : `about ${trim(r05(pct))}% of your height`
      if (!heightM) return words
      const cm = Math.round(v * heightM * 100)
      return `${words} (${cm < 1 ? 'under 1 cm' : `about ${cm} cm`} for you)`
    }
    case 'pctH':
      return v < 1 ? 'under 1% of your height' : `about ${trim(r05(v))}% of your height`
    case 'cm':
      return v < 1 ? 'under 1 cm' : v < 3 ? `about ${trim(r05(v))} cm` : `about ${Math.round(v)} cm`
    case 'ms':
      return v < 20 ? `about ${Math.round(v)} ms` : `about ${Math.round(v / 5) * 5} ms`
    default:
      return null
  }
}

/** The one-line "typical error" for list rows and tables, or null when a number would mislead. */
export function typicalError(id: MetricId, heightM?: number): string | null {
  const r = metricResult(id)
  const g = r?.d1
  if (!g) return null
  if (UNIT[id] === 'count') return g.mae === 0 ? 'no serves missed or added' : null
  if (UNIT[id] === 'rate') return `off on ${Math.round(g.mae * g.n)} of ${g.n} serves`
  return errorWords(id, g.mae, heightM)
}

/** How we measure row detail: validation words plus the typical error when there is one. */
export function rowDetail(id: MetricId): string {
  if (id === 'spin') return "Phone video can't see spin, so we never estimate it."
  const state = validationStateOf(id)
  // Numbers only where they describe a real result: not for logged values, bands in degrees (D5),
  // counts, yes/no flags, or states whose test can't settle the question.
  const numeric = state.startsWith('V1') && UNIT[id] !== undefined && !['angle', 'count', 'rate'].includes(UNIT[id]!)
  const typ = numeric ? typicalError(id) : null
  return typ ? `${STATE_SHORT[state]} Typical error: ${typ}.` : STATE_SHORT[state]
}

const SPREADS = validation.spreads as Record<string, { n: number; value: number; truth: number; low: number; high: number; covered: boolean; unit: string } | undefined>

function spreadLine(id: MetricId): string | null {
  const s = SPREADS[id]
  if (!s) return null
  const u = s.unit === 'ms' ? ' ms' : ' cm'
  const f = (x: number) => (s.unit === 'ms' ? String(Math.round(x)) : x.toFixed(1))
  if (s.value === 0)
    return `On one simulated block of ${s.n} serves at 60 fps, the true spread was ${f(s.truth)}${u}, below what we can measure with the hit sound off, and we said so. Our range, 0 to ${f(s.high)}${u}, held it.`
  return `On one simulated block of ${s.n} serves, we read a spread of ${f(s.value)}${u} against a true ${f(s.truth)}${u}. A 20-serve check is still to come.`
}

/**
 * Metric info "How sure we are" sentences after the state line: key numbers at the recommended
 * set-ups, range coverage, the pass mark, and what can shift it. Every sentence names simulated serves.
 */
export function keyNumberLines(id: MetricId, heightM?: number): string[] {
  const out: string[] = []
  const state = validationStateOf(id)
  const r = metricResult(id)
  const g = r?.d1
  const unit = UNIT[id]
  if (g && state !== 'not-applicable') {
    const where = `At the recommended set-ups (${g.n} simulated serves filmed 7 to 9 m away)`
    if (unit === 'count') {
      const all = r?.all
      out.push(`${where}, every serve was found, with no extras${all ? `, and the same across ${all.n} simulated side-view clips` : ''}.`)
    } else if (unit === 'rate') {
      out.push(`${where}, it disagreed with the truth on ${Math.round(g.mae * g.n)} of ${g.n} serves${r?.all ? `, and on ${Math.round(r.all.mae * 100)} of 100 across ${r.all.n} side-view clips` : ''}.`)
    } else if (unit === 'angle') {
      out.push(`${where}, most readings were close, but more than 1 in 20 missed our limit.`)
    } else {
      const typ = errorWords(id, g.mae, heightM)
      const p95 = errorWords(id, g.p95, heightM)
      const tail = !p95 ? '' : p95.startsWith('under ') ? `, and even the worst 1 in 20 serves were within ${p95.slice(6)}` : `, and 1 in 20 serves was off by ${p95} or more`
      if (typ) out.push(`${where}, the typical error was ${typ}${tail}.`)
    }
    if (g.coverage !== null && unit !== 'count' && unit !== 'rate' && unit !== 'angle') {
      out.push(`Our stated range held the true value on ${Math.round(g.coverage * g.n)} of ${g.n} of those serves.`)
    }
    const mark = PASS_MARK[id]
    if (mark) out.push(`Our pass mark is ${mark}. ${g.pass ? 'It passed.' : "It hasn't passed yet."}`)
  }
  const spread = spreadLine(id)
  if (spread) out.push(spread)
  if (id === 'speed-experimental') {
    const s = validation.speed
    out.push(`On simulated clips at 120 fps or more, ${s.covered} of ${s.ranges} speed ranges held the true speed, but they were about ${s.medianWidthKmh} km/h wide, too wide to show.`)
  }
  const shift = SHIFT[id]
  if (shift && state !== 'not-applicable' && state !== 'V0-unvalidated') out.push(shift)
  const notYet = NOT_YET[id]
  if (notYet && state === 'V0-unvalidated') out.push(notYet)
  return out
}

/** Rows for the details expander and the How we measure results table. */
export interface ResultRow {
  label: string
  value: string
}

export function detailRows(id: MetricId, which: 'd1' | 'all', heightM?: number): ResultRow[] {
  const g = metricResult(id)?.[which]
  if (!g) return []
  const unit = UNIT[id]
  const rows: ResultRow[] = [{ label: 'Serves checked', value: String(g.n) }]
  if (unit === 'count') rows.push({ label: 'Serves missed or added', value: String(Math.round(g.mae * g.n)) })
  else if (unit === 'rate') rows.push({ label: 'Disagreed with the truth', value: `${Math.round(g.mae * g.n)} of ${g.n}` })
  else if (unit !== 'angle') {
    const typ = errorWords(id, g.mae, heightM)
    const p95 = errorWords(id, g.p95, heightM)
    const bias = errorWords(id, g.bias)
    if (typ) rows.push({ label: 'Typical error', value: typ })
    if (p95) rows.push({ label: '1 in 20 serves off by', value: p95.startsWith('under ') ? `less than ${p95.slice(6)}` : `${p95} or more` })
    if (bias) rows.push({ label: 'On average it reads', value: Math.abs(g.bias) < Math.abs(g.mae) / 4 ? 'close to the truth' : `${bias} ${biasDirection(id, g.bias)}` })
    if (g.coverage !== null) rows.push({ label: 'Range held the true value', value: `${Math.round(g.coverage * g.n)} of ${g.n}` })
  }
  rows.push({ label: 'Result', value: g.pass ? 'Passed' : 'Not passed yet' })
  return rows
}

function biasDirection(id: MetricId, bias: number): string {
  if (id === 'toss-forward' || id === 'contact-forward' || id === 'landing-distance') return bias > 0 ? 'too far forward' : 'too far back'
  if (UNIT[id] === 'ms') return bias > 0 ? 'long' : 'short'
  return bias > 0 ? 'high' : 'low'
}

export const PASS_MARK_WORDS = PASS_MARK

/** Counts for the How we measure summary: how many measurements sit in each state. */
export function stateCounts(): Record<ValidationState, MetricId[]> {
  const out = Object.fromEntries(VALIDATION_STATES.map((s) => [s, [] as MetricId[]])) as Record<ValidationState, MetricId[]>
  for (const m of catalogue.metrics) out[validationStateOf(m.id as MetricId)].push(m.id as MetricId)
  return out
}

/** Player-facing validation limits shown on every camera metric (METRICS §6 item 8). */
export const VALIDATION_LIMIT =
  'Every check so far used computer-generated serves: one simulated player on a rendered court, filmed by our own model of a phone camera. Real players, phones, courts and court lights may do worse.'
