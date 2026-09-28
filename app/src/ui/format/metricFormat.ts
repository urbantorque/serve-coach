/**
 * Display-layer formatting for metric values (DESIGN §3.1, §3.3, §4.3; METRICS §4.9). The display
 * layer never adds digits: it rounds to the catalogue precision and writes ranges with "to".
 * Only `<MetricValue>` and the tiles call this; screens never format metric numbers themselves.
 */
import { formatNumber } from '../../analysis/metrics/precision.ts'
import type { MetricValue } from '../../analysis/types.ts'
import { metricName } from '../copy/metricNames.ts'
import { BAND_WORDS, CAPTURE_WORDS, reasonShortForm, STATUS_LABEL } from '../copy/strings.ts'

export interface FormattedMetric {
  /** Estimates carry "≈" before the value (DESIGN §3.1). */
  approx: boolean
  /** The value part ("0.92", "8", "Typical for you"). Empty when unavailable. */
  value: string
  /** Unit or tail after a thin space ("s", "× your height", "of 12 in", "of your height"). */
  unit: string
  /** Whole inline text, e.g. "≈ 2.56 m", "about 130 to 145 km/h", "Needs 120 fps". */
  text: string
  /** Second line: "likely 2.49 to 2.63 m", or the quantity for experimental speed. */
  detail?: string
  /** "(67%)" for rates from n >= 10. */
  percent?: string
  /** Value is words (bands, flags, capture quality) rather than a number. */
  words: boolean
  /** "12 of 14 serves" style line, when n is known. */
  nLine?: string
  /** Reason phrase when unavailable (never a dash or a number). */
  reason?: string
  /**
   * A caveat that belongs beside the number wherever it is shown (never a separate screen): leg drive's
   * absolute % reads about 2% of height low (VALIDATION §3.3), so it is only good against your own serves.
   */
  note?: string
  /** Full sentence for screen readers. */
  aria: string
}

const THIN = ' '

const DURATION_S = new Set(['rhythm-release-to-contact', 'drive-time', 'trophy-pause'])
const TIMING_SPREAD = new Set(['rhythm-spread'])
const SPREAD_CM = new Set(['toss-height-spread', 'toss-forward-spread', 'toss-lateral-spread', 'contact-height-spread'])
const POSITION_CM = new Set(['toss-forward', 'contact-forward', 'landing-distance', 'toss-lateral', 'toss-drop'])
const RATIO = new Set(['contact-height-ratio', 'toss-apex-height'])
const SHARE = new Set(['leg-drive', 'loading-depth'])
const RATE = new Set(['serve-in-rate', 'first-serve-in-rate', 'second-serve-in-rate'])
const BAND = new Set(['shoulder-tilt-trophy', 'knee-bend-band', 'shoulder-over-shoulder-contact'])
/**
 * Metrics that can never be below zero by construction: loading depth is the hip height at release
 * minus the lowest hip height after it (serve/events.ts detectTrophy), and leg drive is the hip height
 * at contact minus that same lowest point. A range below zero would be physically impossible, so the
 * display floors it and says "up to" (DESIGN §3.3 rule 11: no signs).
 */
export const FLOOR_ZERO = new Set(['loading-depth', 'leg-drive'])

/**
 * Leg drive failed its absolute pass mark on simulated serves (MAE 2.5% against 2%), almost all of it a
 * steady low read that cancels against the player's own serves (VALIDATION §3.2, §3.3; finding 50). So
 * wherever its % shows as an Estimate, this caveat sits beside it.
 */
export const RELATIVE_ONLY_NOTE: Readonly<Record<string, string>> = {
  'leg-drive': 'Reads about 2% of your height low on simulated serves, so compare it with your own serves only.',
}

/** A range bound for display: floored at zero where the quantity cannot be negative. */
export function displayBound(metricId: string, x: number | undefined): number | undefined {
  return x !== undefined && FLOOR_ZERO.has(metricId) ? Math.max(0, x) : x
}

const toNum = (v: MetricValue['value']): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const fmtInt = (x: number) => Math.round(x).toLocaleString('en-AU')

/** Rounds a speed range outward to 5 km/h (D4, METRICS §4.9). */
export function outwardTo5(low: number, high: number): [number, number] {
  return [Math.floor(low / 5) * 5, Math.ceil(high / 5) * 5]
}

function spokenUnit(unit: string): string {
  return unit
    .replace('× your height', 'times your height')
    .replace(/\bkm\/h\b/, 'kilometres per hour')
    .replace(/^ms$/, 'milliseconds')
    .replace(/^s$/, 'seconds')
    .replace(/^cm\b/, 'centimetres')
    .replace(/^m$/, 'metres')
    .replace('%', ' percent')
}

interface Parts {
  value: string
  unit: string
  low?: string
  high?: string
  words?: boolean
  percent?: string
  detail?: string
  /** The low bound sat at the quantity's floor (zero): write "up to {high}". */
  floor?: boolean
}

function numericParts(id: string, v: MetricValue): Parts | null {
  const raw = toNum(v.value)
  const n = raw !== null && FLOOR_ZERO.has(id) ? Math.max(0, raw) : raw
  const lo = displayBound(id, v.uncertainty?.low)
  const hi = v.uncertainty?.high
  const pair = (f: (x: number) => string) => (lo !== undefined && hi !== undefined ? { low: f(lo), high: f(hi) } : {})
  // METRICS §4.9 through the one precision rule the engine also uses (analysis/metrics/precision.ts):
  // the value and both bounds of its range share one step, widened to 5 cm for wide intervals.
  const num = (x: number) => formatNumber(id, x, v)

  if (DURATION_S.has(id) && n !== null) {
    return { value: num(n), unit: 's', ...pair(num) }
  }
  if (TIMING_SPREAD.has(id) && n !== null) {
    return { value: num(n), unit: 'ms', ...pair(num) }
  }
  if (SPREAD_CM.has(id) && n !== null) {
    if (v.nearMeasurementLimit) return { value: `≤${THIN}${formatNumber(id, Math.max(n, 4))}`, unit: 'cm' }
    return { value: num(n), unit: 'cm', ...pair(num) }
  }
  if (POSITION_CM.has(id) && n !== null) {
    // DESIGN §3.3 rule 11: negative positions are directions, not signs.
    const behind = n < 0 && id !== 'toss-drop'
    const unit = id === 'toss-lateral' ? 'cm' : behind ? 'cm behind' : 'cm'
    return { value: num(Math.abs(n)), unit, ...(n >= 0 || id === 'toss-drop' ? pair(num) : {}) }
  }
  if (RATIO.has(id) && n !== null) {
    return { value: num(n), unit: '× your height', ...pair(num) }
  }
  if (SHARE.has(id) && n !== null) {
    const f = (x: number) => `${num(x)}%`
    return { value: f(n), unit: 'of your height', ...pair(f), floor: FLOOR_ZERO.has(id) && lo !== undefined && lo <= 0 }
  }
  if (RATE.has(id) && n !== null) {
    const total = v.n ?? 0
    const k = typeof v.secondary?.k === 'number' ? v.secondary.k : Math.round(n * total)
    // METRICS §4.1: rates below 10 serves show counts only, no percentage and no band.
    const showPct = total >= 10
    const pct = (x: number) => `${Math.round(x * 100)}%`
    return {
      value: String(k),
      unit: `of ${total} in`,
      percent: showPct ? `(${pct(n)})` : undefined,
      ...(showPct && lo !== undefined && hi !== undefined ? { low: pct(lo), high: pct(hi) } : {}),
    }
  }
  if (id === 'serve-count' && n !== null) return { value: fmtInt(n), unit: n === 1 ? 'serve' : 'serves' }
  if (id === 'retoss-count' && n !== null) return { value: fmtInt(n), unit: n === 1 ? 'toss caught' : 'tosses caught' }
  if (id === 'double-faults' && n !== null) return { value: fmtInt(n), unit: n === 1 ? 'double fault' : 'double faults' }
  if (id === 'speed-radar-entered' && n !== null) return { value: fmtInt(n), unit: 'km/h', detail: 'from your radar' }
  if ((id === 'speed-experimental' || id === 'speed-average-rear') && lo !== undefined && hi !== undefined) {
    const [a, b] = outwardTo5(lo, hi)
    return {
      value: '',
      unit: 'km/h',
      low: String(a),
      high: String(b),
      detail: id === 'speed-experimental' ? 'speed just after contact' : 'average speed to the bounce',
    }
  }
  if (id === 'repeatability' && n !== null) return { value: fmtInt(n), unit: '', ...pair(fmtInt) }
  return null
}

function wordParts(id: string, v: MetricValue): Parts | null {
  if (BAND.has(id)) {
    const band = (v.band ?? v.value) as keyof typeof BAND_WORDS
    return { value: BAND_WORDS[band] ?? BAND_WORDS.unclear, unit: '', words: true }
  }
  if (id === 'deep-bend-flag') {
    const yes = v.flag ?? v.value === 'yes'
    return { value: yes ? 'Yes' : 'No', unit: '', words: true }
  }
  if (id === 'capture-quality') {
    const q = v.value as keyof typeof CAPTURE_WORDS
    return { value: CAPTURE_WORDS[q] ?? String(v.value), unit: '', words: true }
  }
  if (typeof v.value === 'string') return { value: v.value, unit: '', words: true }
  return null
}

function nLineFor(id: string, v: MetricValue): string | undefined {
  if (v.n === undefined) return undefined
  if (BAND.has(id) || id === 'deep-bend-flag') {
    const k = typeof v.secondary?.k === 'number' ? v.secondary.k : undefined
    return k !== undefined ? `${k} of ${v.n} serves` : `${v.n} serves`
  }
  if (RATE.has(id)) return v.provenance === 'from-your-tags' ? 'from your tags' : undefined
  if (id === 'serve-count') return undefined
  return v.nEligible !== undefined ? `${v.n} of ${v.nEligible} serves` : `${v.n} ${v.n === 1 ? 'serve' : 'serves'}`
}

/** Formats one value for display. Throws on a missing status in development (DESIGN §8.6). */
export function formatMetric(metricId: string, v: MetricValue): FormattedMetric {
  const name = metricName(metricId)
  if (v.status === 'unavailable') {
    const reason = reasonShortForm(v.reasonCode, metricId)
    return { approx: false, value: '', unit: '', text: reason, words: true, reason, aria: `${name}: ${STATUS_LABEL.unavailable}. ${reason}.` }
  }
  const parts = numericParts(metricId, v) ?? wordParts(metricId, v)
  if (!parts) {
    const text = v.display ?? String(v.value ?? '')
    return { approx: false, value: text, unit: v.unit, text, words: true, aria: `${name}, ${text}, ${STATUS_LABEL[v.status]}` }
  }
  const unitSep = parts.unit ? `${THIN}${parts.unit}` : ''
  const nLine = nLineFor(metricId, v)
  const hasRange = parts.low !== undefined && parts.high !== undefined
  const span = parts.floor ? `up to ${parts.high}` : `${parts.low} to ${parts.high}`
  const note = v.status === 'estimated' || v.status === 'measured' ? RELATIVE_ONLY_NOTE[metricId] : undefined
  let text: string
  let detail = parts.detail
  let approx = false

  if (v.status === 'experimental') {
    // D4 and DESIGN §3.1: experimental values are always a rounded range with "about", never one number.
    // "up to about 7%", never "about up to 7%".
    text = hasRange ? (parts.floor ? `up to about ${parts.high}${unitSep}` : `about ${span}${unitSep}`) : `about ${parts.value}${unitSep}`
    if (!hasRange && import.meta.env.DEV && !parts.words) {
      console.warn(`[MetricValue] experimental ${metricId} has no range; DESIGN §3.1 asks for one.`)
    }
    if (parts.words) text = parts.value
  } else if (v.status === 'estimated' && !parts.words) {
    approx = true
    text = `≈${THIN}${parts.value}${unitSep}`
    if (hasRange) detail = `likely ${span}${unitSep}`
  } else {
    text = parts.words ? parts.value : `${parts.value}${unitSep}`
    if (v.status === 'player-entered' && RATE.has(metricId) && hasRange) detail = `likely ${parts.low} to ${parts.high}`
  }

  const speak = (t: string) => t.replace('≈', '').replaceAll(THIN, ' ').replace(parts.unit, spokenUnit(parts.unit)).trim()
  const spokenValue = (approx ? 'about ' : '') + speak(text)
  const aria = [
    name,
    spokenValue + (parts.percent ? ` ${parts.percent.replace(/[()]/g, '').replace('%', ' percent')}` : ''),
    STATUS_LABEL[v.status],
    detail ? speak(detail) : undefined,
    nLine,
    note,
  ]
    .filter(Boolean)
    .join(', ')

  return {
    approx,
    value: parts.value,
    unit: parts.unit,
    text,
    detail,
    percent: parts.percent,
    words: parts.words ?? false,
    nLine,
    ...(note ? { note } : {}),
    aria,
  }
}
