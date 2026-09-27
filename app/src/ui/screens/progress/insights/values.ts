/**
 * Small helpers that turn derived numbers (a comparison side, a usual range, a pooled rate) into
 * `MetricValue` objects, so they reach the screen through `<MetricValue>` with their data state
 * (README honesty rule 1). PURE.
 */
import type { MetricStatus, MetricValue } from '../../../../analysis/types.ts'
import { formatMetric } from '../../../format/metricFormat.ts'

export function derived(
  id: string,
  status: Exclude<MetricStatus, 'unavailable'>,
  value: number | string | null,
  extra: Partial<MetricValue> = {},
): MetricValue {
  return { id, value, unit: '', status, confidence: 1, basis: 'Derived on this phone from stored session statistics.', ...extra }
}

/** The value of a stored metric with a new number (keeps its status, unit and flags). */
export function withValue(base: MetricValue, value: number, extra: Partial<MetricValue> = {}): MetricValue {
  return { ...base, value, uncertainty: undefined, provisional: false, ...extra }
}

/**
 * "12 to 15 cm" for a usual range, formatted by the display layer (METRICS §4.9 rounding, "to"
 * ranges, DESIGN §4.3). Used for MetricTile's `usual` and chart subtitles.
 */
export function formatRange(metricId: string, range: [number, number]): string {
  const f = (v: number) => formatMetric(metricId, derived(metricId, 'measured', v, { n: undefined }))
  const a = f(range[0])
  const b = f(range[1])
  if (!a.value || !b.value) return ''
  if (a.text === b.text) return `about ${a.value}${a.unit ? ` ${a.unit}` : ''}`
  return a.unit === b.unit ? `${a.value} to ${b.value}${a.unit ? ` ${a.unit}` : ''}` : `${a.text} to ${b.text}`
}

/** Display text of one value without the "≈" (for chart callouts and direct labels). */
export function plainText(metricId: string, v: MetricValue): string {
  return formatMetric(metricId, v).text
}

/** Compact direct label for charts: "≈ 1.47×", "≈ 9%" (the full wording stays in the callout and table). */
export function shortText(metricId: string, v: MetricValue): string {
  return formatMetric(metricId, v).text.replace(/\s*× your height/, '×').replace(/\s*of your height/, '')
}
