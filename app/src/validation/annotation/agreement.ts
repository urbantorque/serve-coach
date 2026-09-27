/**
 * "App vs you" for one checked serve: the values a person's marks imply, and how far the app's own
 * events and metrics are from them, in frames and milliseconds (timing) and in centimetres and % of
 * height (heights and positions). Pure and framework-free; the evaluation tool
 * (tools/validate/annotation-eval.ts) uses the same formulas for pooled statistics.
 *
 * Geometry is the engine's own side-view image geometry (METRICS §1.1): a height is (floor − point) ÷
 * standing height in the frame, a forward distance is Δx in frame heights ÷ standing height, both times
 * the player's height. Marked values therefore check detection and tracking on real images (V2), not
 * absolute scale or perspective (V3, docs/VALIDATION_PROTOCOL.md §8).
 */
import type { Handedness, MetricValue, ServeEvents } from '../../analysis/types.ts'
import type { AnnotatedPoint } from '../../data/domain.ts'
import { CHECKED_EVENTS, type CheckAnnotation, type CheckedEvent, type CheckedMetricId, type MarkPoint } from './types.ts'

export interface MarkContext {
  /** Displayed clip size in pixels. */
  clip: { width: number; height: number }
  /** Frame timing of the clip (real seconds per media second in timeScale). */
  timing: { nominalFps: number; timeScale: number }
  handedness: Handedness
  /** The player height the app used (entered or its default). */
  heightM: number
}

export type Marks = Pick<CheckAnnotation, 'events' | 'points' | 'reference'>

export interface DerivedValues {
  /** Standing height in the frame from the head-top and heel marks, as a fraction of frame height. */
  standingNorm: number | null
  /** Values in each metric's own unit (ratio, cm, ms). */
  metrics: Partial<Record<CheckedMetricId, number>>
  radarKmh: number | null
}

/** Real milliseconds per decoded frame. */
export const msPerFrame = (t: MarkContext['timing']): number => (1000 * t.timeScale) / t.nominalFps

const fwdSign = (h: Handedness): 1 | -1 => (h === 'right' ? 1 : -1)

/** Head top above the heel by at least 3% of the frame, else the standing marks are not usable. */
const MIN_STANDING_NORM = 0.03

export function deriveFromMarks(m: Marks, ctx: MarkContext): DerivedValues {
  const p = m.points
  const e = m.events
  const out: DerivedValues['metrics'] = {}
  const head = p.headTopSetup
  const floor = p.floorSetup
  const standing = head && floor && floor.y - head.y >= MIN_STANDING_NORM ? floor.y - head.y : null
  const aspect = ctx.clip.width / ctx.clip.height
  const cm = (standingHeights: number) => standingHeights * ctx.heightM * 100
  if (standing !== null && floor) {
    const heightOf = (q: MarkPoint | undefined) => (q ? (floor.y - q.y) / standing : undefined)
    const apex = heightOf(p.ballAtApex)
    const contact = heightOf(p.ballAtContact)
    if (apex !== undefined) out['toss-apex-height'] = apex
    if (contact !== undefined) out['contact-height-ratio'] = contact
    if (apex !== undefined && contact !== undefined) out['toss-drop'] = cm(apex - contact)
    const toe = p.frontToeSetup
    const forward = (q: MarkPoint | undefined) => (q && toe ? cm(((q.x - toe.x) * aspect * fwdSign(ctx.handedness)) / standing) : undefined)
    const tf = forward(p.ballAtApex)
    const cf = forward(p.ballAtContact)
    const ld = forward(p.frontToeLanding)
    if (tf !== undefined) out['toss-forward'] = tf
    if (cf !== undefined) out['contact-forward'] = cf
    if (ld !== undefined) out['landing-distance'] = ld
  }
  if (e.tossRelease && e.contact) out['rhythm-release-to-contact'] = (e.contact.frameIndex - e.tossRelease.frameIndex) * msPerFrame(ctx.timing)
  return { standingNorm: standing, metrics: out, radarKmh: m.reference?.radarKmh ?? null }
}

// ---------- targets (METRICS §5.6 acceptance, V2) ----------

export interface Target {
  /** Largest acceptable difference, in `unit`. */
  max: number
  unit: 'frames' | '% of height' | 'cm'
  text: string
}

export const EVENT_TARGET: Target = { max: 1, unit: 'frames', text: '1-frame target' }

export const METRIC_TARGET: Partial<Record<CheckedMetricId, Target>> = {
  'toss-apex-height': { max: 3, unit: '% of height', text: '3% of height target' },
  'contact-height-ratio': { max: 2.5, unit: '% of height', text: '2.5% of height target' },
  'rhythm-release-to-contact': { max: 1, unit: 'frames', text: '1-frame target' },
  'toss-forward': { max: 6, unit: 'cm', text: '6 cm target' },
  'contact-forward': { max: 6, unit: 'cm', text: '6 cm target' },
  'landing-distance': { max: 6, unit: 'cm', text: '6 cm target' },
}

// ---------- per-serve comparison ----------

export type RowKind = 'timing' | 'height' | 'position' | 'scale' | 'speed'

export interface AgreementRow {
  id: string
  kind: RowKind
  label: string
  metricId?: CheckedMetricId
  /** The app's stored value (rendered with its own data state). */
  app?: MetricValue
  /** The marked value, as a player-entered value in the metric's unit. */
  you?: MetricValue
  appFrame?: number
  youFrame?: number
  /** App minus marks. */
  diff: { frames?: number; ms?: number; cm?: number; pctHeight?: number } | null
  target: Target | null
  /** Within the target on this serve; null when there is no target or no comparison. */
  within: boolean | null
  /** Plain-language result. */
  sentence: string
  /** The marked frame was flagged "not sure". */
  unsure?: boolean
}

export interface Agreement {
  rows: AgreementRow[]
  derived: DerivedValues
  /** Rows with a target and a comparison, and how many were within it. */
  checked: number
  withinTarget: number
}

export interface AgreementInput {
  marks: Marks
  events: ServeEvents
  metrics: Partial<Record<string, MetricValue>>
  ctx: MarkContext
  /** The app's standing height in the frame (fraction of frame height), for the scale row. */
  appStandingNorm?: number | null
}

const EVENT_NAME: Record<CheckedEvent, string> = {
  tossRelease: 'Toss release',
  tossApex: 'Toss peak',
  contact: 'Contact',
  landing: 'Front foot lands',
}

const METRIC_ROW: Record<CheckedMetricId, { label: string; kind: RowKind }> = {
  'rhythm-release-to-contact': { label: 'Toss-to-hit time', kind: 'timing' },
  'toss-apex-height': { label: 'Toss height', kind: 'height' },
  'contact-height-ratio': { label: 'Contact height', kind: 'height' },
  'toss-drop': { label: 'Ball drop before contact', kind: 'height' },
  'toss-forward': { label: 'Toss in front', kind: 'position' },
  'contact-forward': { label: 'Contact in front', kind: 'position' },
  'landing-distance': { label: 'Landing distance', kind: 'position' },
}

const UNIT: Record<CheckedMetricId, string> = {
  'toss-apex-height': 'ratio-of-height',
  'contact-height-ratio': 'ratio-of-height',
  'toss-drop': 'cm',
  'rhythm-release-to-contact': 'ms',
  'toss-forward': 'cm',
  'contact-forward': 'cm',
  'landing-distance': 'cm',
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
const r0 = (x: number) => Math.round(Math.abs(x))
const r1 = (x: number) => (Math.round(Math.abs(x) * 10) / 10).toFixed(1).replace(/\.0$/, '')
const usable = (v: MetricValue | undefined): v is MetricValue => Boolean(v && v.status !== 'unavailable' && typeof v.value === 'number' && Number.isFinite(v.value))

/** A marked value as a player-entered MetricValue (so it renders with the "You logged" state). */
export function markedValue(id: CheckedMetricId | 'speed-radar-entered', value: number): MetricValue {
  return {
    id,
    value,
    unit: id === 'speed-radar-entered' ? 'km/h' : UNIT[id],
    status: 'player-entered',
    confidence: 1,
    basis: id === 'speed-radar-entered' ? 'Peak speed from your radar, as you entered it.' : 'From the frames and points marked in Check this serve.',
    provenance: 'confirmed-by-you',
  }
}

function timingSentence(frames: number, ms: number): string {
  if (frames === 0) return 'Same frame as your mark.'
  const n = Math.abs(frames)
  return `The app is ${n} ${plural(n, 'frame', 'frames')} ${frames > 0 ? 'later' : 'earlier'} (${r0(ms)} ms).`
}

function heightSentence(pct: number, cm: number): string {
  if (Math.abs(cm) < 0.5) return 'Within half a centimetre of your marks.'
  return `The app reads ${r0(cm)} cm ${cm > 0 ? 'higher' : 'lower'} (${r1(pct)}% of height).`
}

function dropSentence(cm: number): string {
  if (Math.abs(cm) < 0.5) return 'Within half a centimetre of your marks.'
  return `The app reads ${r0(cm)} cm ${cm > 0 ? 'more' : 'less'} drop.`
}

function positionSentence(cm: number): string {
  if (Math.abs(cm) < 0.5) return 'Within half a centimetre of your marks.'
  return `The app reads ${r0(cm)} cm ${cm > 0 ? 'further forward' : 'further back'}.`
}

/** Compares the app with one set of marks. Rows appear only where both sides have a value. */
export function compareWithMarks(input: AgreementInput): Agreement {
  const { marks, events, metrics, ctx } = input
  const derived = deriveFromMarks(marks, ctx)
  const rows: AgreementRow[] = []
  const mpf = msPerFrame(ctx.timing)

  for (const key of CHECKED_EVENTS) {
    const you = marks.events[key]
    if (!you) continue
    const app = events[key]
    if (!app) {
      rows.push({ id: `event:${key}`, kind: 'timing', label: EVENT_NAME[key], youFrame: you.frameIndex, diff: null, target: EVENT_TARGET, within: null, sentence: 'The app did not find this moment on this serve.', unsure: !you.sure })
      continue
    }
    const frames = app.frameIndex - you.frameIndex
    const ms = frames * mpf
    rows.push({
      id: `event:${key}`,
      kind: 'timing',
      label: EVENT_NAME[key],
      appFrame: app.frameIndex,
      youFrame: you.frameIndex,
      diff: { frames, ms },
      target: EVENT_TARGET,
      within: Math.abs(frames) <= EVENT_TARGET.max,
      sentence: timingSentence(frames, ms),
      unsure: !you.sure,
    })
  }

  const order: CheckedMetricId[] = ['rhythm-release-to-contact', 'toss-apex-height', 'contact-height-ratio', 'toss-drop', 'toss-forward', 'contact-forward', 'landing-distance']
  for (const id of order) {
    const youV = derived.metrics[id]
    if (youV === undefined) continue
    const appV = metrics[id]
    const meta = METRIC_ROW[id]
    const target = METRIC_TARGET[id] ?? null
    const base = { id: `metric:${id}`, kind: meta.kind, label: meta.label, metricId: id, you: markedValue(id, youV), target }
    if (!usable(appV)) {
      rows.push({ ...base, diff: null, within: null, sentence: "The app has no value for this serve, so there's nothing to compare." })
      continue
    }
    const d = (appV.value as number) - youV
    if (id === 'rhythm-release-to-contact') {
      const frames = d / mpf
      rows.push({ ...base, app: appV, diff: { ms: d, frames }, within: Math.abs(frames) <= 1 + 1e-6, sentence: Math.abs(d) < 0.5 ? 'The same as your marks.' : `The app reads ${r0(d)} ms ${d > 0 ? 'longer' : 'shorter'}.` })
    } else if (id === 'toss-apex-height' || id === 'contact-height-ratio') {
      const pct = d * 100
      const cm = d * ctx.heightM * 100
      rows.push({ ...base, app: appV, diff: { pctHeight: pct, cm }, within: Math.abs(pct) <= target!.max, sentence: heightSentence(pct, cm) })
    } else if (id === 'toss-drop') {
      rows.push({ ...base, app: appV, diff: { cm: d, pctHeight: (d / (ctx.heightM * 100)) * 100 }, within: null, sentence: dropSentence(d) })
    } else {
      rows.push({ ...base, app: appV, diff: { cm: d, pctHeight: (d / (ctx.heightM * 100)) * 100 }, within: Math.abs(d) <= target!.max, sentence: positionSentence(d) })
    }
  }

  if (derived.standingNorm !== null && input.appStandingNorm) {
    const pct = ((input.appStandingNorm - derived.standingNorm) / derived.standingNorm) * 100
    rows.push({
      id: 'scale:standing',
      kind: 'scale',
      label: 'Height in the picture',
      diff: { pctHeight: pct },
      target: null,
      within: null,
      sentence:
        Math.abs(pct) < 0.5
          ? 'The app sizes the player the same as your marks. Every height and distance scales with this.'
          : `The app sizes the player ${r1(pct)}% ${pct > 0 ? 'taller' : 'shorter'} than your marks. Every height and distance scales with this.`,
    })
  }

  if (derived.radarKmh !== null) {
    rows.push({ id: 'speed:radar', kind: 'speed', label: 'Radar speed', you: markedValue('speed-radar-entered', derived.radarKmh), diff: null, target: null, within: null, sentence: 'Saved with this serve as validation data.' })
  }

  const judged = rows.filter((r) => r.within !== null)
  return { rows, derived, checked: judged.length, withinTarget: judged.filter((r) => r.within).length }
}

/** Whether a radar reading falls inside the app's experimental speed range (D4), or null without one. */
export function radarInRange(radarKmh: number, speed: MetricValue | undefined): boolean | null {
  const u = speed?.uncertainty
  if (!speed || speed.status === 'unavailable' || !u) return null
  return radarKmh >= u.low && radarKmh <= u.high
}

/** The marked point for an app point id, used to draw both on the video. */
export const POINT_EVENT: Partial<Record<AnnotatedPoint, CheckedEvent>> = {
  ballAtApex: 'tossApex',
  ballAtContact: 'contact',
  frontToeLanding: 'landing',
}
