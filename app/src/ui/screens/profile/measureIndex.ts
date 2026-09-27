/**
 * "How we measure" index (PRODUCT §6.13 item 5, DESIGN §10.14): every metric with the highest data
 * state the engine can give it today (in daylight) and its validation state in words with the typical
 * error on simulated serves. Statuses and levels come from the engine catalogue
 * (analysis/metrics/catalogue.ts); the state and numbers from metrics.json and validation-summary.json
 * via ../metric/validationWords.ts. Never from this screen.
 */
import { METRIC_VIEWS, statusCeiling, type ValidationLevel } from '../../../analysis/metrics/catalogue.ts'
import { METRIC_IDS, type MetricId, type MetricStatus } from '../../../analysis/types.ts'
import { metricName } from '../../copy/metricNames.ts'
import { rowDetail, validationStateOf, type ValidationState } from '../metric/validationWords.ts'

export type MeasureGroupId = 'video' | 'experimental' | 'logged' | 'not-measurable'

export interface MeasureRow {
  id: MetricId
  name: string
  status: MetricStatus
  level: ValidationLevel
  views: string
  levelWords: string
  /** metrics.json validationState (docs/VALIDATION.md). */
  validationState: ValidationState
  /** "Checked on simulated serves. Typical error about 1% of your height." */
  validationWords: string
}

export const GROUP_TITLES: Record<MeasureGroupId, string> = {
  video: 'Measured or estimated from your video',
  experimental: 'Experimental (shown only when turned on)',
  logged: 'You log these',
  'not-measurable': 'Not measurable by phone',
}

export const GROUP_NOTES: Record<MeasureGroupId, string> = {
  video: 'An estimate uses your height, so it has a margin of error. Every value shows its label and how many serves it came from.',
  experimental: "Not accurate enough yet on simulated serves, or not checked yet. Shown only when you turn them on, and never used for your focus, verdicts or Progress.",
  logged: 'Serve outcomes, targets and serve types come from your tags or tally, so they carry the "You logged" label.',
  'not-measurable': 'We say so rather than guess.',
}

/** Short validation words for list rows (DESIGN §3.2; the Metric info page has the full sentence). */
export const LEVEL_SHORT: Record<ValidationLevel, string> = {
  V0: 'Not yet checked',
  V1: 'Checked on simulated serves',
  V2: 'Checked on real video',
  V3: 'Checked against a physical reference',
}

export function viewWords(views: readonly ('side' | 'rear')[]): string {
  if (views.length === 0) return 'No view'
  if (views.length === 2) return 'Either view'
  return views[0] === 'side' ? 'Side view' : 'View from behind'
}

export function measureRow(id: MetricId): MeasureRow {
  const { status, level } = statusCeiling(id, 'day')
  return {
    id,
    name: metricName(id),
    status,
    level,
    views: viewWords(METRIC_VIEWS[id]),
    levelWords: LEVEL_SHORT[level],
    validationState: validationStateOf(id),
    validationWords: rowDetail(id),
  }
}

export function groupOf(row: MeasureRow): MeasureGroupId {
  if (row.status === 'unavailable') return 'not-measurable'
  if (row.status === 'player-entered') return 'logged'
  if (row.status === 'experimental') return 'experimental'
  return 'video'
}

export function measureIndex(): { group: MeasureGroupId; rows: MeasureRow[] }[] {
  const order: MeasureGroupId[] = ['video', 'experimental', 'logged', 'not-measurable']
  const rows = METRIC_IDS.map(measureRow)
  return order.map((group) => ({ group, rows: rows.filter((r) => groupOf(r) === group) })).filter((g) => g.rows.length > 0)
}

/** PRODUCT §6.13 item 5 "What we can't measure". */
export const CANNOT_MEASURE = [
  'Spin, precise speed, grip and racquet path.',
  'From the side: toss left or right, knee bend, and shoulder tilt or lean at contact. A view from behind covers these.',
  'Speed from the sound of the bounce.',
] as const
