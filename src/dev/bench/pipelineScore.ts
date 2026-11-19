/**
 * The pipeline bench's arithmetic (N2.8): one serve's readings from the real
 * pose models set against the same readings off the true markers, and the
 * whole run summed up per card reading.
 *
 * Pure, so the suite can hold it and `scripts/pipeline.mjs` can bundle it to
 * total the batches it ran in separate pages.
 */
import { CARD_NOISE_SD } from '../../lib/analysis/cardNoise'

/** What one read of a serve came to: the card's readings and the verdict around them. */
export interface PipelineReading {
  outcome: string
  overall?: number
  focus?: string
  flaws: string[]
  metrics: Record<string, number>
  units: Record<string, string>
  hand?: string
  view?: string
  swingSamples?: number
  /** Where each keyframe landed, seconds into the clip. */
  phases?: Record<string, number>
}

/**
 * A read other than the app's own, on the same picture: its outcome ('measured'
 * or the refusal), its card where it gave one, and that card against the truth.
 */
export interface ArmRead {
  outcome: string
  reading?: PipelineReading
  errors?: Record<string, number>
}

/** A read of the same picture by a path the app does not take, with what it saw of the body. */
export interface WhatIf extends ArmRead {
  /** Median image error per joint, share of body height. */
  joints?: Record<string, number>
  /** The racket wrist's worst image error within 0.1 s of the true contact, share of body height. */
  contactWrist?: number
}

export interface ServeRow {
  serve: string
  look: string
  /** What the app's framing check said, as shipped: 'passed', or its refusal. */
  framingCheck?: string
  /** Whether the rest of the row is the read as shipped ('on') or, where the framing check refused, one past it as a basket sweep reads ('off'). */
  gate: 'on' | 'off'
  /** measured: both reads gave a card; refused or failed: the pipeline gave none. */
  outcome: 'measured' | 'refused' | 'failed' | 'truth refused' | 'not a swing' | 'unreadable file'
  detail?: string
  /** Samples the pipeline's dense read asked for, and how many came back with a body. */
  frames: number
  found: number
  /** Of those, how many sat on the figure: every key joint within a fifth of a body height of the truth. */
  onFigure: number
  /** Of those, how many had either wrist past the visibility the framing check counts as seen. */
  wristSeen: number
  /** Frames RTMPose re-read (0 when the refine was not run or ran out of time). */
  refined: number
  /** Whether the pipeline levelled a camera it thought was rolled. */
  levelled?: boolean
  /** Median image error per joint, as a share of body height: MediaPipe as read, and after the app's refine. */
  joints?: Record<string, number>
  jointsFinal?: Record<string, number>
  /** The worst image error of the racket wrist within 0.1 s of the true contact, share of body height: MediaPipe as read. */
  contactWrist?: number
  /**
   * MediaPipe's joint angles minus the truth's, degrees, off its world
   * landmarks (knee bend, shoulder tilt and the elbow readings use these) and
   * flat off the picture: the elbow and the shoulder tilt as medians over the
   * frames, the knee at the deepest true load the read sampled
   * (`kneeTrueAtLoad` is the true angle there).
   */
  angles?: Record<string, number>
  /** Whether the pipeline's first keyframe search, on MediaPipe's frames alone, passed; a refusal after it came from a later search. */
  firstSearch?: 'passed' | 'refused'
  pipeline?: PipelineReading
  truth?: PipelineReading
  /** Pipeline minus truth, per card reading both reads gave. */
  errors?: Record<string, number>
  /**
   * The bench's copy of the engine's steps on MediaPipe's own frames: it must
   * come to the pipeline's outcome, or the truth read is not the app's engine.
   */
  tail?: string
  /** Reads the app does not make, by name. */
  whatIf?: Record<string, WhatIf>
  ms?: number
}

/** Pipeline minus truth for each card reading with a stated noise that both reads gave. */
export function compareReadings(pipeline: PipelineReading, truth: PipelineReading): Record<string, number> {
  const out: Record<string, number> = {}
  for (const id of Object.keys(CARD_NOISE_SD)) {
    const p = pipeline.metrics[id]
    const t = truth.metrics[id]
    if (Number.isFinite(p) && Number.isFinite(t)) out[id] = p - t
  }
  return out
}

export interface MetricSummary {
  id: string
  unit: string
  /** Serves both reads gave this reading on. */
  n: number
  /** Mean of pipeline minus truth. */
  bias: number
  rms: number
  medianAbs: number
  p90Abs: number
  /** The stated take-to-take noise (`CARD_NOISE_SD`). */
  noise: number
  /** RMS error in units of that noise. */
  rmsOverNoise: number
  /** Share of serves whose error is past twice the stated noise. */
  pastTwoNoise: number
}

/** One read's card against the truth's, over every serve both measured. */
export interface ArmSummary {
  /** Serves both this read and the truth measured. */
  measured: number
  outcomes: Record<string, number>
  /** Of those, how many named the same racket hand, view, faults and fix as the truth. */
  sameHand: number
  sameView: number
  sameFaults: number
  sameFocus: number
  overall?: { bias: number; rms: number }
  metrics: MetricSummary[]
}

export interface PipelineSummary {
  serves: number
  /** The framing check as shipped: 'passed' or each refusal, with how many serves. */
  framingCheck: Record<string, number>
  outcomes: Record<string, number>
  /** Per sample of the dense read. */
  frames: number
  found: number
  onFigure: number
  wristSeen: number
  /** Serves on which RTMPose's refine ran. */
  refinedServes: number
  /**
   * Serves where the bench's engine steps on MediaPipe's frames agreed with the
   * pipeline's first keyframe search (`tailAgrees`), of those where both are
   * known (`tailRun`): the same refusal word for word where it refused, no
   * keyframe refusal where it passed. Serves the first search passed and a
   * later one refused (`laterRefusals`) are the app's own refine or levelling.
   */
  tailAgrees: number
  tailRun: number
  laterRefusals: number
  /** The app's own read (past the framing check where it refused). */
  pipeline: ArmSummary
  /** Reads the app does not make, by name. */
  whatIf: Record<string, ArmSummary & { joints: Record<string, number>; contactWrist?: number }>
  /** Median of each serve's median joint error, share of body height. */
  joints: Record<string, number>
  jointsFinal: Record<string, number>
  /** Median over serves of the racket wrist's worst error around contact. */
  contactWrist?: number
  /** Median over serves of each joint angle's median error, degrees. */
  angles: Record<string, number>
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const rmsOf = (xs: number[]) => Math.sqrt(mean(xs.map((x) => x * x)))
export function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const at = (s.length - 1) * q
  const lo = Math.floor(at)
  const hi = Math.ceil(at)
  return s[lo] + (s[hi] - s[lo]) * (at - lo)
}
const round = (v: number, places = 4): number => (Number.isFinite(v) ? Math.round(v * 10 ** places) / 10 ** places : v)

function medianJoints(sets: (Record<string, number> | undefined)[]): Record<string, number> {
  const by: Record<string, number[]> = {}
  for (const set of sets) for (const [j, v] of Object.entries(set ?? {})) (by[j] ??= []).push(v)
  return Object.fromEntries(Object.entries(by).map(([j, v]) => [j, round(quantile(v, 0.5))]))
}

/** Error statistics per card reading, from each serve's read minus truth. */
export function metricSummaries(pairs: { errors: Record<string, number>; units: Record<string, string> }[]): MetricSummary[] {
  return Object.entries(CARD_NOISE_SD).map(([id, noise]) => {
    const errs = pairs.map((p) => p.errors[id]).filter((v): v is number => Number.isFinite(v))
    const abs = errs.map(Math.abs)
    const rms = rmsOf(errs)
    return {
      id,
      unit: pairs.find((p) => p.units[id])?.units[id] ?? '',
      n: errs.length,
      bias: round(mean(errs)),
      rms: round(rms),
      medianAbs: round(quantile(abs, 0.5)),
      p90Abs: round(quantile(abs, 0.9)),
      noise,
      rmsOverNoise: round(rms / noise, 2),
      pastTwoNoise: round(abs.filter((a) => a > 2 * noise).length / Math.max(1, abs.length), 2),
    }
  })
}

function armSummary(rows: ServeRow[], pick: (r: ServeRow) => ArmRead | undefined): ArmSummary {
  const outcomes: Record<string, number> = {}
  const both: { read: PipelineReading; truth: PipelineReading; errors: Record<string, number> }[] = []
  for (const r of rows) {
    const arm = pick(r)
    if (!arm) continue
    const key = arm.outcome.startsWith('refused') ? arm.outcome : arm.outcome === 'measured' ? 'measured' : arm.outcome
    outcomes[key] = (outcomes[key] ?? 0) + 1
    if (arm.reading && arm.errors && r.truth?.outcome === 'measured') both.push({ read: arm.reading, truth: r.truth, errors: arm.errors })
  }
  const overall = both.filter((b) => b.read.overall !== undefined && b.truth.overall !== undefined).map((b) => b.read.overall! - b.truth.overall!)
  const same = (f: (x: PipelineReading) => unknown) => both.filter((b) => f(b.read) === f(b.truth)).length
  return {
    measured: both.length,
    outcomes,
    sameHand: same((x) => x.hand),
    sameView: same((x) => x.view),
    sameFaults: same((x) => x.flaws.join()),
    sameFocus: same((x) => x.focus),
    ...(overall.length ? { overall: { bias: round(mean(overall), 1), rms: round(rmsOf(overall), 1) } } : {}),
    metrics: metricSummaries(both.map((b) => ({ errors: b.errors, units: b.truth.units }))),
  }
}

/** The app's own read as an arm: measured where the row was, refused or failed with its reason otherwise. */
const pipelineArm = (r: ServeRow): ArmRead | undefined =>
  r.outcome === 'not a swing' || r.outcome === 'unreadable file' || r.outcome === 'truth refused'
    ? undefined
    : {
        // A triage refusal's detail already says "refused: ...".
        outcome: r.outcome === 'measured' ? 'measured' : r.detail?.startsWith(r.outcome) ? r.detail : `${r.outcome}: ${r.detail ?? ''}`.trim(),
        reading: r.pipeline,
        errors: r.errors,
      }

export function summarise(rows: ServeRow[]): PipelineSummary {
  const outcomes: Record<string, number> = {}
  for (const r of rows) outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1
  const framingCheck: Record<string, number> = {}
  for (const r of rows) if (r.framingCheck) framingCheck[r.framingCheck] = (framingCheck[r.framingCheck] ?? 0) + 1
  const tails = rows.filter((r) => r.tail !== undefined && r.firstSearch !== undefined)
  // A keyframe search refuses by throwing; triage's refusals read "refused: ...".
  const searchPassed = (tail: string) => tail === 'measured' || tail.startsWith('refused:')
  const tailAgrees = (r: ServeRow) => (r.firstSearch === 'refused' ? r.tail === r.detail : searchPassed(r.tail!))
  const angleNames = [...new Set(rows.flatMap((r) => Object.keys(r.angles ?? {})))]
  const angles = Object.fromEntries(
    angleNames.map((a) => [a, round(quantile(rows.map((r) => r.angles?.[a]).filter((v): v is number => Number.isFinite(v)), 0.5), 1)]),
  )
  const contact = rows.map((r) => r.contactWrist).filter((v): v is number => Number.isFinite(v))
  const names = [...new Set(rows.flatMap((r) => Object.keys(r.whatIf ?? {})))]
  const whatIf = Object.fromEntries(
    names.map((name) => {
      const reads = rows.map((r) => r.whatIf?.[name])
      const near = reads.map((w) => w?.contactWrist).filter((v): v is number => Number.isFinite(v))
      return [
        name,
        {
          ...armSummary(rows, (r) => r.whatIf?.[name]),
          joints: medianJoints(reads.map((w) => w?.joints)),
          ...(near.length ? { contactWrist: round(quantile(near, 0.5)) } : {}),
        },
      ]
    }),
  )
  return {
    serves: rows.length,
    framingCheck,
    outcomes,
    frames: rows.reduce((s, r) => s + r.frames, 0),
    found: rows.reduce((s, r) => s + r.found, 0),
    onFigure: rows.reduce((s, r) => s + r.onFigure, 0),
    wristSeen: rows.reduce((s, r) => s + (r.wristSeen ?? 0), 0),
    refinedServes: rows.filter((r) => r.refined > 0).length,
    tailRun: tails.length,
    tailAgrees: tails.filter(tailAgrees).length,
    laterRefusals: rows.filter((r) => r.firstSearch === 'passed' && r.outcome === 'refused').length,
    angles,
    pipeline: armSummary(rows, pipelineArm),
    whatIf,
    joints: medianJoints(rows.map((r) => r.joints)),
    jointsFinal: medianJoints(rows.map((r) => r.jointsFinal)),
    ...(contact.length ? { contactWrist: round(quantile(contact, 0.5)) } : {}),
  }
}

function formatArm(name: string, a: ArmSummary): string[] {
  const lines = [`${name}: ${Object.entries(a.outcomes).map(([k, v]) => `${k} ${v}`).join('; ') || 'not run'}`]
  if (!a.measured) return lines
  lines.push(
    `  of ${a.measured} measured with the truth: same hand ${a.sameHand}, same view ${a.sameView}, same faults ${a.sameFaults}, same fix ${a.sameFocus}` +
      (a.overall ? `, score ${a.overall.bias >= 0 ? '+' : ''}${a.overall.bias} mean, ${a.overall.rms} rms` : ''),
  )
  lines.push('  reading            n     bias      rms   median      p90    noise  rms/noise  >2 noise')
  const f = (v: number) => (Math.abs(v) < 0.1 && v !== 0 ? v.toFixed(4) : v.toFixed(2)).padStart(8)
  for (const m of a.metrics) {
    if (!m.n) continue
    lines.push(
      `  ${m.id.padEnd(16)} ${String(m.n).padStart(3)} ${f(m.bias)} ${f(m.rms)} ${f(m.medianAbs)} ${f(m.p90Abs)} ${f(m.noise)} ${m.rmsOverNoise.toFixed(2).padStart(9)} ${m.pastTwoNoise.toFixed(2).padStart(9)}`,
    )
  }
  return lines
}

/** The summary as plain lines, for the runner's console. */
export function formatSummary(s: PipelineSummary): string {
  const pct = (a: number, b: number) => `${b ? Math.round((100 * a) / b) : 0}%`
  const joints = (o: Record<string, number>) => Object.entries(o).map(([j, v]) => `${j} ${v.toFixed(3)}`).join(', ')
  const lines = [
    `${s.serves} serves. The framing check, as shipped: ${Object.entries(s.framingCheck).map(([k, v]) => `${k} ${v}`).join('; ')}`,
    `the whole read (past the check where it refused): ${Object.entries(s.outcomes).map(([k, v]) => `${k} ${v}`).join(', ')}`,
    `frames with a body: ${s.found} of ${s.frames} (${pct(s.found, s.frames)}), on the figure ${s.onFigure} (${pct(s.onFigure, s.frames)}), a wrist seen ${s.wristSeen} (${pct(s.wristSeen, s.frames)})`,
    `the app's refine ran on ${s.refinedServes} measured serves; ${s.laterRefusals} refused after the first keyframe search had passed; the bench's engine steps agreed with that search on ${s.tailAgrees} of ${s.tailRun}`,
    ...formatArm('the app, past the framing check where it refused', s.pipeline),
  ]
  for (const [name, w] of Object.entries(s.whatIf)) {
    lines.push(...formatArm(`what if, not the app: ${name}`, w))
    if (Object.keys(w.joints).length)
      lines.push(`  joint error: ${joints(w.joints)}${w.contactWrist !== undefined ? `; racket wrist near contact ${w.contactWrist.toFixed(3)}` : ''}`)
  }
  if (Object.keys(s.joints).length) lines.push(`median joint error, share of height, MediaPipe: ${joints(s.joints)}`)
  if (Object.keys(s.jointsFinal).length) lines.push(`after the app's refine: ${joints(s.jointsFinal)}`)
  if (s.contactWrist !== undefined) lines.push(`racket wrist's worst error near contact, median over serves, MediaPipe: ${s.contactWrist.toFixed(3)}`)
  const angles = Object.entries(s.angles)
  if (angles.length) lines.push(`MediaPipe's joint angles minus the truth's, degrees, median: ${angles.map(([a, v]) => `${a} ${v >= 0 ? '+' : ''}${v.toFixed(1)}`).join(', ')}`)
  return lines.join('\n')
}
