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
import { CHECKED_EVENTS, type AppMechanics, type CheckAnnotation, type CheckedEvent, type CheckedMetricId, type MarkPoint } from './types.ts'

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
  // Lower body (METRICS §3.27 to §3.29): mid-hip heights as % of height, drive time from the lowest hip.
  if (standing !== null && floor) {
    const hip = (q: MarkPoint | undefined) => (q ? (floor.y - q.y) / standing : undefined)
    const low = hip(p.midHipLowest)
    const atContact = hip(p.midHipContact)
    const atRelease = hip(p.midHipRelease)
    if (low !== undefined && atContact !== undefined) out['leg-drive'] = 100 * (atContact - low)
    if (low !== undefined && atRelease !== undefined) out['loading-depth'] = 100 * (atRelease - low)
  }
  if (e.lowestHip && e.contact) out['drive-time'] = (e.contact.frameIndex - e.lowestHip.frameIndex) * msPerFrame(ctx.timing)
  const tilt = shoulderTiltDeg(p.shoulderFrontTrophy, p.shoulderBackTrophy, { aspect, handedness: ctx.handedness, standingNorm: standing })
  if (tilt !== null) out['shoulder-tilt-trophy'] = tilt
  return { standingNorm: standing, metrics: out, radarKmh: m.reference?.radarKmh ?? null }
}

/** Shoulder marks more than this many frames apart are not one trophy position. */
const SHOULDER_FRAME_TOLERANCE = 2
/** Shoulders closer than this (fraction of standing height across the frame) have no clear front (METRICS §3.15). */
const MIN_SHOULDER_SEPARATION = 0.05

/**
 * The 2D shoulder-line angle at trophy in degrees (METRICS §3.15): φ = atan2(y_B − y_F, netDir ·
 * (x_F − x_B) · aspect), positive when the front (tossing-side) shoulder is higher. Which mark is the
 * front shoulder is decided by geometry (nearer the net), as the engine does, not by its label. Null
 * when the marks are on different frames or too close together to tell front from back. Internal
 * validation data only: the app never shows this angle (D5).
 */
export function shoulderTiltDeg(
  a: MarkPoint | undefined,
  b: MarkPoint | undefined,
  opts: { aspect: number; handedness: Handedness; standingNorm: number | null },
): number | null {
  if (!a || !b || Math.abs(a.frameIndex - b.frameIndex) > SHOULDER_FRAME_TOLERANCE) return null
  const fwd = fwdSign(opts.handedness)
  const [F, B] = fwd * a.x >= fwd * b.x ? [a, b] : [b, a]
  const dx = fwd * (F.x - B.x) * opts.aspect
  if (dx <= 0) return null
  if (opts.standingNorm !== null && dx / opts.standingNorm < MIN_SHOULDER_SEPARATION) return null
  return (Math.atan2(B.y - F.y, dx) * 180) / Math.PI
}

// ---------- targets (METRICS §5.6 acceptance, V2) ----------

export interface Target {
  /** Largest acceptable difference, in `unit`. */
  max: number
  unit: 'frames' | '% of height' | 'cm'
  text: string
}

export const EVENT_TARGET: Target = { max: 1, unit: 'frames', text: '1-frame target' }

/**
 * Per-event targets. The trophy and lowest-hip frames have none of their own: the hips move slowly
 * at their lowest point, so that moment is judged through drive time (2 frames), and the engine's
 * trophy is its lowest-hip point, which a person's trophy position need not match.
 */
export const EVENT_TARGETS: Record<CheckedEvent, Target | null> = {
  tossRelease: EVENT_TARGET,
  tossApex: EVENT_TARGET,
  trophy: null,
  lowestHip: null,
  contact: EVENT_TARGET,
  landing: EVENT_TARGET,
}

/** metrics.json `validation.realThreshold` (V2, against hand marks), as docs/VALIDATION_PROTOCOL.md §10 lists them. */
export const METRIC_TARGET: Partial<Record<CheckedMetricId, Target>> = {
  'toss-apex-height': { max: 3, unit: '% of height', text: '3% of height target' },
  'contact-height-ratio': { max: 2.5, unit: '% of height', text: '2.5% of height target' },
  'rhythm-release-to-contact': { max: 1, unit: 'frames', text: '1-frame target' },
  'toss-forward': { max: 6, unit: 'cm', text: '6 cm target' },
  'contact-forward': { max: 6, unit: 'cm', text: '6 cm target' },
  'landing-distance': { max: 6, unit: 'cm', text: '6 cm target' },
  'leg-drive': { max: 2.5, unit: '% of height', text: '2.5% of height target' },
  'loading-depth': { max: 2.5, unit: '% of height', text: '2.5% of height target' },
  'drive-time': { max: 2, unit: 'frames', text: '2-frame target' },
}

/**
 * Shoulder tilt is a band judged by coaches (≥ 80% agreement, METRICS §5.6), so the marked line has
 * no target of its own. Words describe the difference; the synthetic 2D check used 4 degrees.
 */
export const SHOULDER_WORDS = { same: 2, small: 4 } as const

// ---------- per-serve comparison ----------

export type RowKind = 'timing' | 'height' | 'position' | 'body' | 'scale' | 'speed'

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
  /** App minus marks. `deg` (shoulder line) is validation data only and is never shown. */
  diff: { frames?: number; ms?: number; cm?: number; pctHeight?: number; deg?: number } | null
  target: Target | null
  /** Within the target on this serve; null when there is no target or no comparison. */
  within: boolean | null
  /** Plain-language result. */
  sentence: string
  /** Why a row has no target, or how it is judged instead. */
  note?: string
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
  /** The engine's unrounded leg-drive, loading, drive-time and shoulder values for this serve. */
  appMechanics?: AppMechanics | null
}

const EVENT_NAME: Record<CheckedEvent, string> = {
  tossRelease: 'Toss release',
  tossApex: 'Toss peak',
  trophy: 'Trophy position',
  lowestHip: 'Lowest hip',
  contact: 'Contact',
  landing: 'Front foot lands',
}

const EVENT_NOTE: Partial<Record<CheckedEvent, string>> = {
  trophy: "No target of its own: the app's trophy is its lowest hip point, which your trophy position need not match.",
  lowestHip: 'The hips move slowly at their lowest point, so this is judged through drive time.',
}

const METRIC_ROW: Record<CheckedMetricId, { label: string; kind: RowKind }> = {
  'rhythm-release-to-contact': { label: 'Toss-to-hit time', kind: 'timing' },
  'toss-apex-height': { label: 'Toss height', kind: 'height' },
  'contact-height-ratio': { label: 'Contact height', kind: 'height' },
  'toss-drop': { label: 'Ball drop before contact', kind: 'height' },
  'toss-forward': { label: 'Toss in front', kind: 'position' },
  'contact-forward': { label: 'Contact in front', kind: 'position' },
  'landing-distance': { label: 'Landing distance', kind: 'position' },
  'leg-drive': { label: 'Leg drive (hip rise)', kind: 'body' },
  'loading-depth': { label: 'Loading (hip dip)', kind: 'body' },
  'drive-time': { label: 'Drive time', kind: 'body' },
  'shoulder-tilt-trophy': { label: 'Shoulder tilt at the top', kind: 'body' },
}

const UNIT: Record<CheckedMetricId, string> = {
  'toss-apex-height': 'ratio-of-height',
  'contact-height-ratio': 'ratio-of-height',
  'toss-drop': 'cm',
  'rhythm-release-to-contact': 'ms',
  'toss-forward': 'cm',
  'contact-forward': 'cm',
  'landing-distance': 'cm',
  'leg-drive': '% of height',
  'loading-depth': '% of height',
  'drive-time': 'ms',
  'shoulder-tilt-trophy': 'band',
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
const r0 = (x: number) => Math.round(Math.abs(x))
const r1 = (x: number) => (Math.round(Math.abs(x) * 10) / 10).toFixed(1).replace(/\.0$/, '')
const usable = (v: MetricValue | undefined): v is MetricValue => Boolean(v && v.status !== 'unavailable' && typeof v.value === 'number' && Number.isFinite(v.value))
const finite = (x: number | undefined): x is number => typeof x === 'number' && Number.isFinite(x)

/**
 * The app's value for a checked metric in the metric's own unit: the engine's unrounded mechanics
 * where available (leg drive, loading, drive time, shoulder angle), else the stored value. Null when
 * the app has no usable value (unavailable, or a band without its angle).
 */
export function appValueFor(id: CheckedMetricId, metric: { status: string; value?: unknown } | undefined, mech: AppMechanics | null | undefined): number | null {
  if (!metric || metric.status === 'unavailable') return null
  if (id === 'shoulder-tilt-trophy') return finite(mech?.shoulderTiltDeg) ? mech.shoulderTiltDeg : null
  const raw = id === 'leg-drive' ? mech?.hipRisePctH : id === 'loading-depth' ? mech?.hipDropPctH : id === 'drive-time' ? mech?.driveTimeMs : undefined
  if (finite(raw)) return raw
  return typeof metric.value === 'number' && Number.isFinite(metric.value) ? metric.value : null
}

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

function hipSentence(pct: number, cm: number, what: 'rise' | 'dip'): string {
  if (Math.abs(cm) < 0.5) return 'Within half a centimetre of your marks.'
  return `The app reads ${r1(pct)}% of height ${pct > 0 ? 'more' : 'less'} hip ${what} than your marks (about ${r0(cm)} cm).`
}

function durationSentence(ms: number, frames: number): string {
  if (Math.abs(ms) < 0.5) return 'The same as your marks.'
  const f = Math.round(Math.abs(frames))
  return `The app reads ${r0(ms)} ms ${ms > 0 ? 'longer' : 'shorter'} (${f} ${plural(f, 'frame', 'frames')}).`
}

/** Shoulder line difference in words only (no degrees, D5). */
function shoulderSentence(deg: number): string {
  const a = Math.abs(deg)
  if (a < SHOULDER_WORDS.same) return "The app's shoulder line matches your marks."
  const size = a < SHOULDER_WORDS.small ? 'a little' : 'clearly'
  return `The app has the front shoulder ${size} ${deg > 0 ? 'higher' : 'lower'} than your marks.`
}

const METRIC_ORDER: CheckedMetricId[] = [
  'rhythm-release-to-contact',
  'toss-apex-height',
  'contact-height-ratio',
  'toss-drop',
  'toss-forward',
  'contact-forward',
  'landing-distance',
  'leg-drive',
  'loading-depth',
  'drive-time',
  'shoulder-tilt-trophy',
]

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
    const target = EVENT_TARGETS[key]
    const note = EVENT_NOTE[key]
    if (!app) {
      rows.push({ id: `event:${key}`, kind: 'timing', label: EVENT_NAME[key], youFrame: you.frameIndex, diff: null, target, within: null, sentence: 'The app did not find this moment on this serve.', ...(note ? { note } : {}), unsure: !you.sure })
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
      target,
      within: target ? Math.abs(frames) <= target.max : null,
      sentence: timingSentence(frames, ms),
      ...(note ? { note } : {}),
      unsure: !you.sure,
    })
  }

  for (const id of METRIC_ORDER) {
    const youV = derived.metrics[id]
    if (youV === undefined) continue
    const appMetric = metrics[id]
    const meta = METRIC_ROW[id]
    const target = METRIC_TARGET[id] ?? null
    // The shoulder angle is never shown (D5): no value cells, words only.
    const base = { id: `metric:${id}`, kind: meta.kind, label: meta.label, metricId: id, ...(id === 'shoulder-tilt-trophy' ? {} : { you: markedValue(id, youV) }), target }
    const appV = appValueFor(id, appMetric, input.appMechanics)
    if (appV === null) {
      rows.push({ ...base, diff: null, within: null, sentence: "The app has no value for this serve, so there's nothing to compare." })
      continue
    }
    const shown = usable(appMetric) ? { app: appMetric } : {}
    const d = appV - youV
    if (id === 'rhythm-release-to-contact') {
      const frames = d / mpf
      rows.push({ ...base, ...shown, diff: { ms: d, frames }, within: Math.abs(frames) <= 1 + 1e-6, sentence: Math.abs(d) < 0.5 ? 'The same as your marks.' : `The app reads ${r0(d)} ms ${d > 0 ? 'longer' : 'shorter'}.` })
    } else if (id === 'drive-time') {
      const frames = d / mpf
      rows.push({ ...base, ...shown, diff: { ms: d, frames }, within: Math.abs(frames) <= target!.max + 1e-6, sentence: durationSentence(d, frames) })
    } else if (id === 'toss-apex-height' || id === 'contact-height-ratio') {
      const pct = d * 100
      const cm = d * ctx.heightM * 100
      rows.push({ ...base, ...shown, diff: { pctHeight: pct, cm }, within: Math.abs(pct) <= target!.max, sentence: heightSentence(pct, cm) })
    } else if (id === 'leg-drive' || id === 'loading-depth') {
      const cm = (d / 100) * ctx.heightM * 100
      rows.push({ ...base, ...shown, diff: { pctHeight: d, cm }, within: Math.abs(d) <= target!.max, sentence: hipSentence(d, cm, id === 'leg-drive' ? 'rise' : 'dip') })
    } else if (id === 'shoulder-tilt-trophy') {
      rows.push({ ...base, diff: { deg: d }, within: null, sentence: shoulderSentence(d), note: 'Coaches check this as a band, so there is no target here. This checks the shoulder line the band is built on.' })
    } else if (id === 'toss-drop') {
      rows.push({ ...base, ...shown, diff: { cm: d, pctHeight: (d / (ctx.heightM * 100)) * 100 }, within: null, sentence: dropSentence(d) })
    } else {
      rows.push({ ...base, ...shown, diff: { cm: d, pctHeight: (d / (ctx.heightM * 100)) * 100 }, within: Math.abs(d) <= target!.max, sentence: positionSentence(d) })
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
    rows.push({
      id: 'speed:radar',
      kind: 'speed',
      label: 'Radar speed',
      you: markedValue('speed-radar-entered', derived.radarKmh),
      diff: null,
      target: null,
      within: null,
      sentence: 'Saved with this serve as validation data. It also shows in the serve\'s values as “Radar speed (you logged)”.',
    })
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

/** The event each marked point belongs to, used to draw both on the video. */
export const POINT_EVENT: Partial<Record<AnnotatedPoint, CheckedEvent>> = {
  ballAtApex: 'tossApex',
  ballAtContact: 'contact',
  frontToeLanding: 'landing',
  midHipRelease: 'tossRelease',
  midHipLowest: 'lowestHip',
  midHipContact: 'contact',
  shoulderFrontTrophy: 'trophy',
  shoulderBackTrophy: 'trophy',
}

/** The engine's unrounded mechanics for a serve (validation data; the shoulder angle is never shown). */
export function mechanicsOf(serve: { legDrive?: { hipRisePctH?: { value: number }; hipDropPctH?: { value: number }; driveTimeMs?: { value: number } } | null; shoulder?: { trophyTilt2DDeg?: { value: number } } | null }): AppMechanics {
  return {
    ...(finite(serve.legDrive?.hipRisePctH?.value) ? { hipRisePctH: serve.legDrive!.hipRisePctH!.value } : {}),
    ...(finite(serve.legDrive?.hipDropPctH?.value) ? { hipDropPctH: serve.legDrive!.hipDropPctH!.value } : {}),
    ...(finite(serve.legDrive?.driveTimeMs?.value) ? { driveTimeMs: serve.legDrive!.driveTimeMs!.value } : {}),
    ...(finite(serve.shoulder?.trophyTilt2DDeg?.value) ? { shoulderTiltDeg: serve.shoulder!.trophyTilt2DDeg!.value } : {}),
  }
}
