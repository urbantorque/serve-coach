/**
 * Pooled evaluation of `serve-coach-validation@1` exports (docs/VALIDATION_PROTOCOL.md §9; METRICS
 * §5.6 "Statistics" and "Acceptance"). Pure: tools/validate/annotation-eval.ts reads the files and
 * writes the report this module renders.
 *
 * - Serves are clustered by player (the export's random subject key); repeated-measures Bland–Altman
 *   and cluster-bootstrap MAE intervals respect that.
 * - Agreement between annotators is reported before agreement with the app.
 * - With two or more annotators on a serve, the app is compared with their mean.
 * - Marks changed after the comparison was shown (not blind) and sample data are left out by default.
 * - Values are recomputed from the raw marks (agreement.ts), so a formula fix applies to old files.
 */
import type { AnnotatedPoint } from '../../data/domain.ts'
import { deriveFromMarks, EVENT_TARGET, METRIC_TARGET, msPerFrame, type MarkContext, type Target } from './agreement.ts'
import type { ValidationEntry, ValidationExport } from './export.ts'
import {
  blandAltman,
  coverage,
  HISTOGRAM_BINS,
  icc21,
  maeWithCi,
  mean,
  timingDistribution,
  type BlandAltman,
  type Icc,
  type TimingDistribution,
} from './stats.ts'
import { CHECKED_EVENTS, CHECKED_METRIC_IDS, type CheckedEvent, type CheckedMetricId } from './types.ts'

// ---------- inputs ----------

export interface Participant {
  sex?: string
  ageBand?: string
  utrBand?: string
}

/** The parts of docs/specs/metrics.json the report uses. */
export interface Catalogue {
  metrics: { id: string; statusTarget: string; validationLevel: Record<string, string> }[]
  timingMetricIds: string[]
}

export interface EvalOptions {
  includeSample?: boolean
  includeUnblinded?: boolean
  /** Subject key -> demographics from the consent sheet (never in the export itself). */
  participants?: Record<string, Participant>
  catalogue?: Catalogue
}

/** METRICS §5.6 (V2 sample) and research 05 §11.1 (library), as the protocol sets them. */
export const PROTOCOL_SAMPLE = {
  v2Players: 8,
  v2ServesPerMetric: 150,
  libraryPlayers: 30,
  libraryServes: 1500,
  doubleAnnotatedShare: 0.25,
  women: 12,
  leftHanders: 5,
  perAgeBand: 6,
  perUtrBand: 8,
  /** METRICS §5.6 V3 speed: 200+ radar serves across speeds. */
  speedServes: 200,
} as const

export const AGE_BANDS = ['18-29', '30-44', '45-65'] as const
export const UTR_BANDS = ['1-2.99', '3-4.99', '5-7'] as const

// ---------- results ----------

export interface MetricUnit {
  /** Unit the statistics are reported in. */
  unit: '% of height' | 'cm' | 'ms'
  /** Multiplier from the metric's stored unit to `unit`. */
  scale: number
}

export const METRIC_LABEL: Record<CheckedMetricId, string> = {
  'toss-apex-height': 'Toss height',
  'contact-height-ratio': 'Contact height',
  'toss-drop': 'Ball drop before contact',
  'rhythm-release-to-contact': 'Toss-to-hit time',
  'toss-forward': 'Toss in front',
  'contact-forward': 'Contact in front',
  'landing-distance': 'Landing distance',
}

export const METRIC_UNIT: Record<CheckedMetricId, MetricUnit> = {
  'toss-apex-height': { unit: '% of height', scale: 100 },
  'contact-height-ratio': { unit: '% of height', scale: 100 },
  'toss-drop': { unit: 'cm', scale: 1 },
  'rhythm-release-to-contact': { unit: 'ms', scale: 1 },
  'toss-forward': { unit: 'cm', scale: 1 },
  'contact-forward': { unit: 'cm', scale: 1 },
  'landing-distance': { unit: 'cm', scale: 1 },
}

const EVENT_LABEL: Record<CheckedEvent, string> = { tossRelease: 'Toss release', tossApex: 'Toss peak', contact: 'Contact', landing: 'Front-foot landing' }

export interface MetricResult {
  id: CheckedMetricId
  label: string
  unit: MetricUnit['unit']
  n: number
  players: number
  /** Serves with a marked value, and how many of them the app produced a value for (coverage of output). */
  produced: { k: number; n: number }
  ba: BlandAltman | null
  mae: { mae: number; ci: [number, number] } | null
  icc: Icc | null
  /** Marked values inside the app's stated interval. */
  intervalCoverage: { k: number; n: number; p: number; low: number; high: number } | null
  target: Target | null
  /** MAE in the target's unit (frames for toss-to-hit time). */
  maeInTargetUnit: number | null
  verdict: string
  byCondition: { cls: string; n: number; mae: number }[]
}

export interface EventResult {
  event: CheckedEvent
  label: string
  marked: number
  players: number
  dist: TimingDistribution | null
  baMs: BlandAltman | null
  verdict: string
}

export interface InterRater {
  serves: number
  events: { event: CheckedEvent; n: number; maeFrames: number; maeMs: number }[]
  points: { point: AnnotatedPoint; n: number; maeCm: number; maePct: number }[]
  metrics: { id: CheckedMetricId; n: number; mae: number; unit: string }[]
}

export interface SpeedResult {
  verdict: string
  radarLogged: number
  pairs: number
  maePct: number | null
  ba: BlandAltman | null
  coverage: { k: number; n: number; p: number; low: number; high: number } | null
}

export interface EvalResult {
  inputs: {
    files: number
    entriesRead: number
    duplicates: number
    leftOutSample: number
    leftOutUnblinded: number
    servesUsed: number
    players: number
    annotators: number
    doubleAnnotated: number
    byCondition: Record<string, number>
    byFps: Record<string, number>
    bySetup: Record<string, number>
    leftHandedPlayers: number
    engineVersions: string[]
  }
  sample: { requirement: string; target: string; now: string; met: boolean }[]
  interRater: InterRater
  events: EventResult[]
  metrics: MetricResult[]
  speed: SpeedResult
  status: { id: string; label: string; levels: string; ifPasses: string }[]
}

// ---------- grouping ----------

interface Group {
  key: string
  subject: string
  entries: ValidationEntry[]
  ctx: MarkContext
  mpf: number
  cls: string
  fps: string
  setup: string
}

const countBy = (xs: readonly string[]): Record<string, number> => xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {})

function conditionClass(e: ValidationEntry): string {
  for (const m of Object.values(e.app.metrics)) if (m.conditionClass) return m.conditionClass
  if (e.clip.light === 'lights') return 'night-lights'
  if (e.clip.light === 'day') return 'day'
  if (e.clip.light === 'indoor') return 'indoor'
  return 'unknown'
}

const fpsClass = (fps: number): string => (fps >= 100 ? '120+ fps' : fps >= 50 ? '60 fps' : '30 fps')

function ctxOf(e: ValidationEntry): MarkContext {
  return {
    clip: { width: e.clip.width, height: e.clip.height },
    timing: { nominalFps: e.clip.nominalFps, timeScale: e.clip.timeScale },
    handedness: e.subject.handedness,
    heightM: e.subject.heightM,
  }
}

function usableNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** Deduplicates and filters entries, then groups them by serve. */
function prepare(files: readonly ValidationExport[], opts: EvalOptions): { groups: Group[]; inputs: Omit<EvalResult['inputs'], 'servesUsed' | 'players' | 'annotators' | 'doubleAnnotated' | 'byCondition' | 'byFps' | 'bySetup' | 'leftHandedPlayers' | 'engineVersions'> } {
  const latest = new Map<string, ValidationEntry>()
  let read = 0
  for (const f of files) {
    for (const e of f.entries) {
      read++
      const k = `${e.subject.key}|${e.annotation.id}`
      const prev = latest.get(k)
      if (!prev || prev.annotation.updatedAt < e.annotation.updatedAt) latest.set(k, e)
    }
  }
  let sample = 0
  let unblinded = 0
  const kept: ValidationEntry[] = []
  for (const e of latest.values()) {
    if (e.sample && !opts.includeSample) {
      sample++
      continue
    }
    if (e.annotation.blind === false && !opts.includeUnblinded) {
      unblinded++
      continue
    }
    kept.push(e)
  }
  const byServe = new Map<string, ValidationEntry[]>()
  for (const e of kept) {
    const k = `${e.subject.key}|${e.clip.fingerprint ?? e.clip.videoId}|${e.serve.id}`
    const g = byServe.get(k)
    if (g) g.push(e)
    else byServe.set(k, [e])
  }
  const groups: Group[] = [...byServe.entries()].map(([key, entries]) => {
    entries.sort((a, b) => (a.annotation.createdAt < b.annotation.createdAt ? -1 : 1))
    const e = entries[0]
    const ctx = ctxOf(e)
    return { key, subject: e.subject.key, entries, ctx, mpf: msPerFrame(ctx.timing), cls: conditionClass(e), fps: fpsClass(e.clip.captureFps), setup: e.clip.setup ?? e.clip.orientation }
  })
  return { groups, inputs: { files: files.length, entriesRead: read, duplicates: read - latest.size, leftOutSample: sample, leftOutUnblinded: unblinded } }
}

// ---------- evaluation ----------

function verdictFor(target: Target | null, maeTU: number | null, n: number, players: number): string {
  if (!target) return 'Reported only (no V2 target)'
  if (maeTU === null || !Number.isFinite(maeTU)) return 'No pairs yet'
  const within = maeTU <= target.max
  if (n < PROTOCOL_SAMPLE.v2ServesPerMetric || players < PROTOCOL_SAMPLE.v2Players) {
    return `Too little data to judge (${n} of ${PROTOCOL_SAMPLE.v2ServesPerMetric} serves, ${players} of ${PROTOCOL_SAMPLE.v2Players} players); so far ${within ? 'within' : 'outside'} the target`
  }
  return within ? 'Meets the V2 target' : 'Misses the V2 target'
}

const distinct = (xs: readonly string[]) => new Set(xs).size

export function evaluate(files: readonly ValidationExport[], opts: EvalOptions = {}): EvalResult {
  const { groups, inputs } = prepare(files, opts)
  const derivedOf = new Map<ValidationEntry, ReturnType<typeof deriveFromMarks>>()
  for (const g of groups) for (const e of g.entries) derivedOf.set(e, deriveFromMarks(e.annotation, g.ctx))

  // ----- between annotators (first two by time) -----
  const doubles = groups.filter((g) => distinct(g.entries.map((e) => e.annotation.annotator)) >= 2)
  const inter: InterRater = { serves: doubles.length, events: [], points: [], metrics: [] }
  for (const ev of CHECKED_EVENTS) {
    const errs: { f: number; mpf: number }[] = []
    for (const g of doubles) {
      const [a, b] = g.entries
      const fa = a.annotation.events[ev]?.frameIndex
      const fb = b.annotation.events[ev]?.frameIndex
      if (usableNumber(fa) && usableNumber(fb)) errs.push({ f: fa - fb, mpf: g.mpf })
    }
    if (errs.length) inter.events.push({ event: ev, n: errs.length, maeFrames: mean(errs.map((x) => Math.abs(x.f))), maeMs: mean(errs.map((x) => Math.abs(x.f * x.mpf))) })
  }
  const POINTS: AnnotatedPoint[] = ['headTopSetup', 'floorSetup', 'frontToeSetup', 'ballAtApex', 'ballAtContact', 'frontToeLanding']
  for (const pt of POINTS) {
    const cm: number[] = []
    for (const g of doubles) {
      const [a, b] = g.entries
      const pa = a.annotation.points[pt]
      const pb = b.annotation.points[pt]
      const sa = derivedOf.get(a)?.standingNorm
      const sb = derivedOf.get(b)?.standingNorm
      const standing = sa && sb ? (sa + sb) / 2 : (sa ?? sb ?? a.app.standingNorm)
      if (!pa || !pb || !standing) continue
      const aspect = g.ctx.clip.width / g.ctx.clip.height
      cm.push((Math.hypot((pa.x - pb.x) * aspect, pa.y - pb.y) / standing) * g.ctx.heightM * 100)
    }
    if (cm.length) {
      const h = mean(doubles.map((g) => g.ctx.heightM * 100))
      inter.points.push({ point: pt, n: cm.length, maeCm: mean(cm), maePct: (mean(cm) / h) * 100 })
    }
  }
  for (const id of CHECKED_METRIC_IDS) {
    const d: number[] = []
    for (const g of doubles) {
      const [a, b] = g.entries
      const va = derivedOf.get(a)?.metrics[id]
      const vb = derivedOf.get(b)?.metrics[id]
      if (usableNumber(va) && usableNumber(vb)) d.push((va - vb) * METRIC_UNIT[id].scale)
    }
    if (d.length) inter.metrics.push({ id, n: d.length, mae: mean(d.map(Math.abs)), unit: METRIC_UNIT[id].unit })
  }

  // ----- app vs annotation (mean of annotators) -----
  const events: EventResult[] = CHECKED_EVENTS.map((ev) => {
    const errs: { frames: number; msPerFrame: number; subject: string; app: number; ref: number }[] = []
    let marked = 0
    const players = new Set<string>()
    for (const g of groups) {
      const frames = g.entries.map((e) => e.annotation.events[ev]?.frameIndex).filter(usableNumber)
      if (!frames.length) continue
      marked++
      const app = g.entries[0].app.events[ev]
      if (!app) continue
      const ref = mean(frames)
      players.add(g.subject)
      errs.push({ frames: app.frameIndex - ref, msPerFrame: g.mpf, subject: g.subject, app: app.frameIndex * g.mpf, ref: ref * g.mpf })
    }
    const dist = timingDistribution(errs)
    return {
      event: ev,
      label: EVENT_LABEL[ev],
      marked,
      players: players.size,
      dist,
      baMs: blandAltman(errs.map((x) => ({ app: x.app, ref: x.ref, subject: x.subject }))),
      verdict: verdictFor(EVENT_TARGET, dist?.maeFrames ?? null, errs.length, players.size),
    }
  })

  const metrics: MetricResult[] = CHECKED_METRIC_IDS.map((id) => {
    const u = METRIC_UNIT[id]
    const target = METRIC_TARGET[id] ?? null
    const pairs: { app: number; ref: number; subject: string; cls: string; tu: number; low?: number; high?: number }[] = []
    let marked = 0
    for (const g of groups) {
      const refs = g.entries.map((e) => derivedOf.get(e)?.metrics[id]).filter(usableNumber)
      if (!refs.length) continue
      marked++
      const m = g.entries[0].app.metrics[id]
      if (!m || m.status === 'unavailable' || !usableNumber(m.value)) continue
      const ref = mean(refs)
      const errNative = m.value - ref
      // Error in the target's unit: frames for toss-to-hit time, % of height for ratios, cm otherwise.
      const tu = id === 'rhythm-release-to-contact' ? errNative / g.mpf : errNative * u.scale
      const unc = m.uncertainty
      pairs.push({ app: m.value * u.scale, ref: ref * u.scale, subject: g.subject, cls: g.cls, tu, ...(unc ? { low: unc.low * u.scale, high: unc.high * u.scale } : {}) })
    }
    const players = distinct(pairs.map((p) => p.subject))
    const errs = pairs.map((p) => ({ e: p.app - p.ref, subject: p.subject }))
    const withInterval = pairs.filter((p) => usableNumber(p.low) && usableNumber(p.high)).map((p) => ({ ref: p.ref, low: p.low!, high: p.high! }))
    const maeTU = pairs.length ? mean(pairs.map((p) => Math.abs(p.tu))) : null
    const classes = [...new Set(pairs.map((p) => p.cls))].sort()
    return {
      id,
      label: METRIC_LABEL[id],
      unit: u.unit,
      n: pairs.length,
      players,
      produced: { k: pairs.length, n: marked },
      ba: blandAltman(pairs),
      mae: pairs.length ? maeWithCi(errs) : null,
      icc: icc21(pairs.map((p) => [p.app, p.ref])),
      intervalCoverage: withInterval.length ? coverage(withInterval) : null,
      target,
      maeInTargetUnit: maeTU,
      verdict: verdictFor(target, maeTU, pairs.length, players),
      byCondition: classes.map((cls) => {
        const ps = pairs.filter((p) => p.cls === cls)
        return { cls, n: ps.length, mae: mean(ps.map((p) => Math.abs(p.app - p.ref))) }
      }),
    }
  })

  // ----- speed: radar against the experimental range -----
  const radar: { radar: number; mid: number | null; low?: number; high?: number; subject: string }[] = []
  for (const g of groups) {
    const readings = g.entries.map((e) => e.annotation.reference?.radarKmh).filter(usableNumber)
    if (!readings.length) continue
    const s = g.entries[0].app.metrics['speed-experimental']
    const u = s && s.status !== 'unavailable' ? s.uncertainty : undefined
    const mid = s && usableNumber(s.value) ? s.value : u ? (u.low + u.high) / 2 : null
    radar.push({ radar: mean(readings), mid, ...(u ? { low: u.low, high: u.high } : {}), subject: g.subject })
  }
  const speedPairs = radar.filter((r) => r.mid !== null)
  const speedMae = speedPairs.length ? mean(speedPairs.map((r) => (Math.abs(r.mid! - r.radar) / r.radar) * 100)) : null
  const speedCov = speedPairs.some((r) => usableNumber(r.low)) ? coverage(speedPairs.filter((r) => usableNumber(r.low)).map((r) => ({ ref: r.radar, low: r.low!, high: r.high! }))) : null
  const speedBa = blandAltman(speedPairs.map((r) => ({ app: ((r.mid! - r.radar) / r.radar) * 100, ref: 0, subject: r.subject })))
  const speedMeets = speedMae !== null && speedMae <= 5 && Boolean(speedBa && speedBa.loa[0] >= -10 && speedBa.loa[1] <= 10) && Boolean(speedCov && speedCov.p >= 0.9)
  const speed: SpeedResult = {
    verdict:
      speedPairs.length < PROTOCOL_SAMPLE.speedServes
        ? `Too little data to judge (${speedPairs.length} of ${PROTOCOL_SAMPLE.speedServes} serves)`
        : speedMeets
          ? 'Meets the V3 target'
          : 'Misses the V3 target',
    radarLogged: radar.length,
    pairs: speedPairs.length,
    maePct: speedMae,
    ba: speedBa,
    coverage: speedCov,
  }

  // ----- inputs and sample -----
  const all = groups.flatMap((g) => g.entries)
  const subjects = [...new Set(groups.map((g) => g.subject))]
  const leftHanded = new Set(all.filter((e) => e.subject.handedness === 'left').map((e) => e.subject.key)).size
  const inputsOut: EvalResult['inputs'] = {
    ...inputs,
    servesUsed: groups.length,
    players: subjects.length,
    annotators: distinct(all.map((e) => e.annotation.annotator)),
    doubleAnnotated: doubles.length,
    byCondition: countBy(groups.map((g) => g.cls)),
    byFps: countBy(groups.map((g) => g.fps)),
    bySetup: countBy(groups.map((g) => g.setup)),
    leftHandedPlayers: leftHanded,
    engineVersions: [...new Set(all.map((e) => e.engine.engineVersion))].sort(),
  }

  const P = PROTOCOL_SAMPLE
  const sample: EvalResult['sample'] = [
    { requirement: 'Players (V2 stage)', target: `≥ ${P.v2Players}`, now: String(subjects.length), met: subjects.length >= P.v2Players },
    { requirement: 'Players (full library)', target: `≥ ${P.libraryPlayers}`, now: String(subjects.length), met: subjects.length >= P.libraryPlayers },
    { requirement: 'Serves checked (full library)', target: `≥ ${P.libraryServes.toLocaleString('en-AU')}`, now: groups.length.toLocaleString('en-AU'), met: groups.length >= P.libraryServes },
    {
      requirement: 'Serves marked by two annotators',
      target: `≥ ${Math.round(P.doubleAnnotatedShare * 100)}%`,
      now: groups.length ? `${Math.round((doubles.length / groups.length) * 100)}%` : '0%',
      met: groups.length > 0 && doubles.length / groups.length >= P.doubleAnnotatedShare,
    },
    { requirement: 'Left-handed players', target: `≥ ${P.leftHanders}`, now: String(leftHanded), met: leftHanded >= P.leftHanders },
    { requirement: 'Condition classes with serves', target: 'day and night-lights at least', now: Object.keys(inputsOut.byCondition).sort().join(', ') || 'none', met: Boolean(inputsOut.byCondition.day && inputsOut.byCondition['night-lights']) },
  ]
  if (opts.participants) {
    const ps = subjects.map((s) => opts.participants![s]).filter((p): p is Participant => Boolean(p))
    const women = ps.filter((p) => p.sex === 'female').length
    sample.push({ requirement: 'Women', target: `≥ ${P.women}`, now: String(women), met: women >= P.women })
    for (const band of AGE_BANDS) {
      const c = ps.filter((p) => p.ageBand === band).length
      sample.push({ requirement: `Age ${band}`, target: `≥ ${P.perAgeBand}`, now: String(c), met: c >= P.perAgeBand })
    }
    for (const band of UTR_BANDS) {
      const c = ps.filter((p) => p.utrBand === band).length
      sample.push({ requirement: `UTR ${band}`, target: `≥ ${P.perUtrBand}`, now: String(c), met: c >= P.perUtrBand })
    }
    sample.push({ requirement: 'Players with a consent-sheet record', target: 'all', now: `${ps.length} of ${subjects.length}`, met: ps.length === subjects.length })
  }

  // ----- what a pass would allow (METRICS §1.3) -----
  const status: EvalResult['status'] = []
  if (opts.catalogue) {
    const timing = new Set(opts.catalogue.timingMetricIds)
    for (const id of CHECKED_METRIC_IDS) {
      const m = opts.catalogue.metrics.find((x) => x.id === id)
      if (!m) continue
      const lv = m.validationLevel
      status.push({
        id,
        label: METRIC_LABEL[id],
        levels: ['day', 'overcast', 'night-lights', 'flicker'].map((c) => `${c} ${lv[c] ?? '?'}`).join(', '),
        ifPasses: timing.has(id)
          ? `V2 ceiling is measured (timing metric), in the condition classes tested`
          : `V2 ceiling is estimated (spatial)${m.statusTarget === 'measured' ? '; measured needs V3' : `; its designed status is ${m.statusTarget}, which V3 confirms`}`,
      })
    }
  }

  return { inputs: inputsOut, sample, interRater: inter, events, metrics, speed, status }
}

// ---------- report ----------

const noNegZero = (t: string) => (/^-0(\.0*)?$/.test(t) ? t.slice(1) : t)
const f1 = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? 'n/a' : noNegZero((Math.round(x * 10) / 10).toFixed(1)))
const f2 = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? 'n/a' : noNegZero(x.toFixed(2)))
const pct = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? 'n/a' : `${Math.round(x * 100)}%`)
const range = (a: [number, number] | undefined, f = f1) => (a ? `${f(a[0])} to ${f(a[1])}` : 'n/a')
/** "1 frame", "3% of height", "6 cm". */
export function targetText(t: Target): string {
  if (t.unit === 'frames') return `${t.max} ${t.max === 1 ? 'frame' : 'frames'}`
  return t.unit === 'cm' ? `${t.max} cm` : `${t.max}% of height`
}

const POINT_LABEL: Partial<Record<AnnotatedPoint, string>> = {
  headTopSetup: 'Top of head (standing)',
  floorSetup: 'Heel on the ground (standing)',
  frontToeSetup: 'Front toe (standing)',
  ballAtApex: 'Ball at the peak',
  ballAtContact: 'Ball at contact',
  frontToeLanding: 'Front toe at landing',
}

const counts = (m: Record<string, number>) =>
  Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(', ') || 'none'

export function renderReport(r: EvalResult, meta: { generatedAt: string; files: readonly string[] }): string {
  const L: string[] = []
  const i = r.inputs
  L.push('# Real-footage validation: app against hand marks', '')
  L.push(`Generated ${meta.generatedAt} from ${i.files} export file${i.files === 1 ? '' : 's'} (\`serve-coach-validation@1\`).`)
  L.push('Protocol: docs/VALIDATION_PROTOCOL.md. Acceptance thresholds: METRICS §5.6 and docs/specs/metrics.json.', '')
  L.push('> This report is evidence for a reviewed change to `metrics.json`. It changes no status by itself (METRICS §5.7).', '')

  L.push('## Data', '')
  L.push('| Item | Count |', '|---|---|')
  L.push(`| Serves used | ${i.servesUsed} |`, `| Players | ${i.players} (left-handed ${i.leftHandedPlayers}) |`, `| Annotators | ${i.annotators} |`)
  L.push(`| Serves marked by two annotators | ${i.doubleAnnotated} |`)
  L.push(`| Entries read | ${i.entriesRead} (duplicates dropped ${i.duplicates}) |`)
  L.push(`| Left out: sample data | ${i.leftOutSample} |`, `| Left out: marks changed after the comparison was shown | ${i.leftOutUnblinded} |`)
  L.push(`| Condition classes | ${counts(i.byCondition)} |`, `| Frame rates | ${counts(i.byFps)} |`, `| Set-ups | ${counts(i.bySetup)} |`)
  L.push(`| Engine versions | ${i.engineVersions.join(', ') || 'none'} |`, '')

  L.push('### Sample against the protocol', '')
  L.push('| Requirement | Target | Now | Met |', '|---|---|---|---|')
  for (const s of r.sample) L.push(`| ${s.requirement} | ${s.target} | ${s.now} | ${s.met ? 'yes' : 'not yet'} |`)
  L.push('')

  L.push('## Agreement between annotators', '')
  L.push('Reported before agreement with the app (METRICS §5.6): the app cannot be judged more precisely than two people agree.', '')
  if (!r.interRater.serves) L.push('No serve was marked by two annotators yet.', '')
  else {
    L.push(`${r.interRater.serves} serves marked by two annotators.`, '')
    L.push('| Event | Serves | MAE (frames) | MAE (ms) |', '|---|---|---|---|')
    for (const e of r.interRater.events) L.push(`| ${EVENT_LABEL[e.event]} | ${e.n} | ${f2(e.maeFrames)} | ${f1(e.maeMs)} |`)
    L.push('', '| Point | Serves | MAE (cm) | MAE (% of height) |', '|---|---|---|---|')
    for (const p of r.interRater.points) L.push(`| ${POINT_LABEL[p.point] ?? p.point} | ${p.n} | ${f1(p.maeCm)} | ${f2(p.maePct)} |`)
    L.push('', '| Metric from the marks | Serves | MAE | Unit |', '|---|---|---|---|')
    for (const m of r.interRater.metrics) L.push(`| ${METRIC_LABEL[m.id]} | ${m.n} | ${f2(m.mae)} | ${m.unit} |`)
    L.push('')
  }

  L.push('## Event timing: app against the marks', '')
  L.push('Error = app frame − marked frame (mean of annotators). Target: MAE ≤ 1 frame (METRICS §5.6).', '')
  L.push('| Event | Serves (players) | Bias (frames) | MAE (frames) | MAE (ms) | Median abs | 90th pct abs | Within 1 frame | App found it | Verdict |')
  L.push('|---|---|---|---|---|---|---|---|---|---|')
  for (const e of r.events) {
    const d = e.dist
    L.push(`| ${e.label} | ${d?.n ?? 0} (${e.players}) | ${f2(d?.biasFrames)} | ${f2(d?.maeFrames)} | ${f1(d?.maeMs)} | ${f1(d?.medianAbsFrames)} | ${f1(d?.p90AbsFrames)} | ${pct(d?.within[1])} | ${d?.n ?? 0} of ${e.marked} | ${e.verdict} |`)
  }
  L.push('', `| Event | ${HISTOGRAM_BINS.join(' | ')} |`, `|---|${HISTOGRAM_BINS.map(() => '---').join('|')}|`)
  for (const e of r.events) if (e.dist) L.push(`| ${e.label} | ${e.dist.histogram.join(' | ')} |`)
  L.push('', 'Bland–Altman on event times (ms):', '')
  L.push('| Event | Bias [95% CI] | 95% limits of agreement | Method |', '|---|---|---|---|')
  for (const e of r.events) if (e.baMs) L.push(`| ${e.label} | ${f1(e.baMs.bias)} [${range(e.baMs.biasCi)}] | ${range(e.baMs.loa)} | ${e.baMs.method === 'repeated' ? `repeated measures, ${e.baMs.subjects} players` : 'single'} |`)
  L.push('')

  L.push('## Metrics: app against the marks', '')
  L.push('Differences are app − marks. Heights are in % of the player\'s height; toss-to-hit time is judged in frames.', '')
  L.push('| Metric | Unit | Serves (players) | Bias [95% CI] | 95% LoA | MAE [95% CI] | ICC(2,1) [95% CI] | Proportional bias: slope [95% CI] | Marks inside the app\'s range | App produced a value | Target (now) | Verdict |')
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const m of r.metrics) {
    const ba = m.ba
    const prop = ba?.proportional ? `${f2(ba.proportional.slope)} [${range(ba.proportional.slopeCi, f2)}]` : 'n/a'
    const cov = m.intervalCoverage ? `${pct(m.intervalCoverage.p)} of ${m.intervalCoverage.n}` : 'n/a'
    const tgt = m.target ? `MAE ≤ ${targetText(m.target)} (${f2(m.maeInTargetUnit)})` : 'none'
    L.push(
      `| ${m.label} | ${m.unit} | ${m.n} (${m.players}) | ${ba ? `${f2(ba.bias)} [${range(ba.biasCi, f2)}]` : 'n/a'} | ${ba ? range(ba.loa, f2) : 'n/a'} | ${m.mae ? `${f2(m.mae.mae)} [${range(m.mae.ci, f2)}]` : 'n/a'} | ${m.icc ? `${f2(m.icc.icc)} [${range(m.icc.ci, f2)}]` : 'n/a'} | ${prop} | ${cov} | ${m.produced.k} of ${m.produced.n} | ${tgt} | ${m.verdict} |`,
    )
  }
  L.push('', '### By condition class (MAE, metric unit)', '')
  const classes = [...new Set(r.metrics.flatMap((m) => m.byCondition.map((c) => c.cls)))].sort()
  if (classes.length) {
    L.push(`| Metric | ${classes.join(' | ')} |`, `|---|${classes.map(() => '---').join('|')}|`)
    for (const m of r.metrics) L.push(`| ${m.label} | ${classes.map((c) => {
      const b = m.byCondition.find((x) => x.cls === c)
      return b ? `${f2(b.mae)} (n ${b.n})` : 'n/a'
    }).join(' | ')} |`)
  } else L.push('No pairs yet.')
  L.push('')

  L.push('## Speed: radar against the app\'s experimental range', '')
  const s = r.speed
  L.push(`Radar readings logged: ${s.radarLogged}. Serves where the app also gave an experimental range: ${s.pairs}.`, '')
  if (s.pairs) {
    L.push('| MAE (% of radar) | Bias (% of radar) | 95% LoA (%) | Radar inside the range | Target (METRICS §5.6, V3) | Verdict |', '|---|---|---|---|---|---|')
    L.push(`| ${f1(s.maePct)} | ${f1(s.ba?.bias)} | ${s.ba ? range(s.ba.loa) : 'n/a'} | ${s.coverage ? `${pct(s.coverage.p)} of ${s.coverage.n} (${pct(s.coverage.low)} to ${pct(s.coverage.high)})` : 'n/a'} | MAE ≤ 5%, LoA within ±10%, coverage ≥ 90% | ${s.verdict} |`)
  } else L.push('No pairs yet. The side view gives a range only at 120 fps or more with a target tag (D4).')
  L.push('')

  L.push('## What a pass would allow', '')
  if (r.status.length) {
    L.push('| Metric | Level now (per condition class) | If V2 passes (with cross-day test–retest) |', '|---|---|---|')
    for (const x of r.status) L.push(`| ${x.label} | ${x.levels} | ${x.ifPasses} |`)
    L.push('')
  }
  L.push('- V2 also needs the cross-day test–retest (sessions at least 2 days apart) in METRICS §1.3; this report does not cover it.')
  L.push('- Levels move per condition class. A class with too few serves keeps its level.')
  L.push('- Spreads (toss height consistency and the rest) stay estimated until V3: hand marks share the app\'s image geometry and cannot see sideways scatter.')
  L.push('- A failing row keeps or drops the level. Changes go through a reviewed edit of `metrics.json`, and "How we measure" is regenerated from it.', '')

  L.push('## Method', '')
  L.push('- Marked values use the engine\'s side-view image geometry: heights are (floor − point) ÷ standing height in the frame; forward distances use the front toe marked in the standing frame. Centimetres use the height the app used (entered, or its default).')
  L.push('- Bland–Altman: bias and 95% limits of agreement. With several serves per player, the Bland & Altman (2007) repeated-measures variance (between plus within players); the bias interval uses player means. Proportional bias: regression of the difference on the mean; a slope whose 95% interval excludes 0 suggests it (then use the ratio form, METRICS §5.6). With more noise in one method than the other the test leans towards a positive slope, so small slopes need care.')
  L.push('- MAE with a 95% percentile bootstrap that resamples players (1,000 resamples, fixed seed).')
  L.push('- ICC(2,1): two-way random effects, absolute agreement, single measure, with the McGraw & Wong (1996) interval. Serves are treated as targets; nesting in players is not modelled in the ICC.')
  L.push('- Interval coverage: share of marked values inside the app\'s stated interval for that serve (the app aims for 95%).')
  L.push('- Two annotators on a serve: agreement is reported first, then the app is compared with their mean.')
  L.push('', `Files: ${meta.files.map((x) => `\`${x}\``).join(', ') || 'none'}`, '')
  return L.join('\n')
}
