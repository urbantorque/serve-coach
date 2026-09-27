/**
 * Display precision (METRICS §4.9; DESIGN §3.3 rule 9, §4.3). The ONE place that decides how many
 * digits a metric value shows. The engine uses it for the stored headline and `display` strings and
 * the UI's formatter (`ui/format/metricFormat.ts`) uses it for every tile, sentence and chart label,
 * so the same quantity reads the same everywhere (report headline, tiles, Today, focus card,
 * Compare, Progress, Metric info).
 *
 * Rules (METRICS §4.9):
 * - heights and distances: 1 cm (per serve and session means);
 * - spreads: 0.5 cm, or 5 ms;
 * - ratios: 2 decimals; % of height: whole per cent; durations: 10 ms; rates: whole per cent;
 * - "never show more precision than half the displayed 95% interval would support": when the
 *   interval half-width is 10 cm or more, centimetres round to 5.
 */
import type { MetricValue } from '../types.ts'

/** Centimetre quantities: heights and distances in cm, and cm spreads. */
const CM_SPREADS = new Set(['toss-height-spread', 'toss-forward-spread', 'toss-lateral-spread', 'contact-height-spread'])
const CM_POSITIONS = new Set(['toss-forward', 'contact-forward', 'landing-distance', 'toss-lateral', 'toss-drop'])
const DURATIONS = new Set(['rhythm-release-to-contact', 'drive-time', 'trophy-pause'])
const RATIOS = new Set(['contact-height-ratio', 'toss-apex-height'])
const SHARES = new Set(['leg-drive', 'loading-depth'])
const RATES = new Set(['serve-in-rate', 'first-serve-in-rate', 'second-serve-in-rate'])

/** Half-width of a 95% interval (cm) at which centimetres round to 5 (METRICS §4.9). */
export const WIDE_INTERVAL_HALF_WIDTH_CM = 10

export type PrecisionInput = Pick<MetricValue, 'uncertainty'> & { value?: MetricValue['value'] }

/** Half-width of the value's interval, in the value's own unit (asymmetric intervals: the larger side). */
export function halfWidth(v: PrecisionInput | undefined): number | undefined {
  const u = v?.uncertainty
  if (!u || !Number.isFinite(u.low) || !Number.isFinite(u.high)) return undefined
  const x = typeof v?.value === 'number' && Number.isFinite(v.value) ? v.value : (u.low + u.high) / 2
  if (u.kind === 'plusminus') return Math.max(Math.abs(u.low), Math.abs(u.high))
  return Math.max(Math.abs(x - u.low), Math.abs(u.high - x))
}

/** The rounding step for a metric's value, in the metric's stored unit. */
export function displayStep(metricId: string, v?: PrecisionInput): number {
  const wide = (halfWidth(v) ?? 0) >= WIDE_INTERVAL_HALF_WIDTH_CM
  if (CM_SPREADS.has(metricId)) return wide ? 5 : 0.5
  if (CM_POSITIONS.has(metricId)) return wide ? 5 : 1
  if (metricId === 'rhythm-spread') return 5
  if (DURATIONS.has(metricId)) return 10
  if (RATIOS.has(metricId)) return 0.01
  if (SHARES.has(metricId)) return 1
  if (RATES.has(metricId)) return 0.01
  return 1
}

const snap = (x: number, step: number) => {
  const r = Math.round(x / step) * step
  // Kill floating-point tails (0.30000000000000004) so equal numbers print equally.
  return Number(r.toFixed(step >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(step)) + 1)))
}

/** A value rounded to its display step (`v` supplies the interval that may widen the step). */
export function roundForDisplay(metricId: string, x: number, v?: PrecisionInput): number {
  return snap(x, displayStep(metricId, v))
}

/**
 * The number as the player reads it, without unit or "≈": "9.5", "30", "1.46", "0.92" (seconds for
 * durations), "12". Bounds of a range pass the value's own MetricValue so the whole range shares one
 * step. Negative positions keep their sign here; words for direction are the caller's job.
 */
export function formatNumber(metricId: string, x: number, v?: PrecisionInput): string {
  const step = displayStep(metricId, v)
  const r = snap(x, step)
  if (DURATIONS.has(metricId)) return (r / 1000).toFixed(2)
  if (RATIOS.has(metricId)) return r.toFixed(2)
  if (step === 0.5) return Number.isInteger(r) ? String(r) : r.toFixed(1)
  if (RATES.has(metricId)) return String(Math.round(r * 100))
  return Math.round(r).toLocaleString('en-AU')
}
