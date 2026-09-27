/**
 * Scores perf-bench.mjs runs against the synthetic truth (dev only), so a speed change can be checked
 * for accuracy on the production pipeline itself (not the single-serve smoke harness).
 *
 *   node_modules/.bin/tsx src/analysis/pipeline/e2e/perf-accuracy.mts [--dir DIR] [--out FILE.md] [--json FILE.json]
 *
 * Per run: serve count, event timing errors (release, apex, lowest hip, contact, landing) and metric
 * errors from tools/validate/metrics-eval.ts `compare` (the same scoring as the engine's validation),
 * and pose error in statures (cleaned poses the engine received vs the truth landmarks,
 * scorePoseAccuracy: strict labels, mirror-tolerant, and the hitting wrist within 0.1 s of contact).
 * Stage times come from the run's PipelineTimings.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compare, type Extra, type Truth } from '../../../../../tools/validate/metrics-eval.ts'
import type { EngineOutput } from '../../engine.ts'
import { scorePoseAccuracy } from '../../pose/poseAccuracy.ts'
import { LM } from '../../types.ts'
import { truthStaturePx, type SynthTruth } from '../../../validation/truth.ts'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../../../..')
const args = process.argv.slice(2)
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}
const dir = resolve(opt('dir', join(repoRoot, 'validation/results/ui/harden-performance/bench')))
const only = opt('filter', '')

interface Run {
  clip: string
  variant: string
  tag: string
  rep: number
  wallS: number
  console: string[]
  report: {
    state: string
    result?: { servesFound: number; timings: Record<string, number | string> }
    error?: unknown
    events: { t: number; overall: number; step: string }[]
  }
  dump: null | {
    meta: { width: number; height: number; captureFps: number }
    poses: [number, number, number[][] | null][]
    serves: EngineOutput['serves']
    stats: EngineOutput['stats']
    poseStats?: ({ inference?: { medianMs: number; count: number }; prepare?: { medianMs: number }; roundTrip?: { medianMs: number } } | null)[]
  }
}

const truthCache = new Map<string, { truth: Truth & SynthTruth; extra: Extra }>()
function truthFor(clip: string) {
  let t = truthCache.get(clip)
  if (!t) {
    const base = join(repoRoot, 'validation/synthetic/clips', clip)
    const truth = JSON.parse(readFileSync(join(base, 'truth.json'), 'utf8'))
    const extraPath = join(base, 'truth-extra.json')
    const extra = existsSync(extraPath) ? JSON.parse(readFileSync(extraPath, 'utf8')) : { serves: [] }
    t = { truth, extra }
    truthCache.set(clip, t)
  }
  return t
}

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : Number.NaN)
const mae = (v: number[]) => mean(v.map(Math.abs))

export interface Score {
  name: string
  clip: string
  variant: string
  tag: string
  state: string
  wallS: number
  timings: Record<string, number | string>
  servesFound: number
  servesTruth: number
  servesAnalysed: number
  consoleErrors: number
  events: Record<string, { n: number; maeMs: number; biasMs: number }>
  metrics: Record<string, { n: number; mae: number; bias: number; statuses: string }>
  pose: { frames: number; meanBH: number; tolerantBH: number; medianBH: number; wristBH: number | null; wristFrames: number }
  poseStats?: { inferenceMedianMs?: number; prepareMedianMs?: number; roundTripMedianMs?: number; count?: number }
}

function score(file: string): Score | null {
  const run = JSON.parse(readFileSync(file, 'utf8')) as Run
  const name = file.split(/[\\/]/).pop()!.replace(/\.json$/, '')
  const base = {
    name,
    clip: run.clip,
    variant: run.variant,
    tag: run.tag,
    state: run.report.state,
    wallS: run.wallS,
    timings: run.report.result?.timings ?? {},
    servesFound: run.report.result?.servesFound ?? 0,
    consoleErrors: run.console.length,
  }
  const { truth, extra } = truthFor(run.clip)
  if (!run.dump) return { ...base, servesTruth: truth.serves.length, servesAnalysed: 0, events: {}, metrics: {}, pose: { frames: 0, meanBH: NaN, tolerantBH: NaN, medianBH: NaN, wristBH: null, wristFrames: 0 } }
  const out = { serves: run.dump.serves, stats: run.dump.stats } as EngineOutput
  const { rows, events } = compare(run.clip, 'pipeline', out, extra, truth)
  const ev: Score['events'] = {}
  for (const label of ['tossRelease', 'tossApex', 'trophy (lowest hip)', 'contact', 'landing']) {
    const errs = events.filter((e) => e.event === label && e.errorMs !== null).map((e) => e.errorMs as number)
    ev[label] = { n: errs.length, maeMs: mae(errs), biasMs: mean(errs) }
  }
  const met: Score['metrics'] = {}
  for (const id of ['serve-count', 'toss-apex-height', 'contact-height-ratio', 'toss-drop', 'rhythm-release-to-contact', 'leg-drive', 'loading-depth', 'toss-forward', 'landing-distance', 'trophy-pause', 'drive-time']) {
    const rs = rows.filter((r) => r.metric === id)
    const errs = rs.filter((r) => typeof r.error === 'number').map((r) => r.error as number)
    const statuses: Record<string, number> = {}
    for (const r of rs) statuses[r.status] = (statuses[r.status] ?? 0) + 1
    met[id] = { n: errs.length, mae: mae(errs), bias: mean(errs), statuses: Object.entries(statuses).map(([k, v]) => `${k} ${v}`).join(', ') }
  }
  // Pose error on every frame the engine received a pose for.
  const staturePx = truthStaturePx(truth as SynthTruth)
  const predicted = run.dump.poses
    .filter((p) => p[2] !== null)
    .map((p) => ({ frameIndex: p[0], landmarks: p[2]!.map((r) => ({ x: r[0], y: r[1], z: r[2], visibility: r[3] })) }))
  const have = new Set(predicted.map((p) => p.frameIndex))
  const truthFrames = truth.frames.filter((f) => have.has(f.frameIndex)).map((f) => ({ frameIndex: f.frameIndex, tReal: f.tReal, landmarks: f.landmarks }))
  const wrist = truth.player.handedness === 'right' ? LM.RIGHT_WRIST : LM.LEFT_WRIST
  const acc = scorePoseAccuracy(predicted, truthFrames, { frameWidth: truth.video.width, frameHeight: truth.video.height, staturePx })
  // Hitting wrist within 0.1 s of each truth contact.
  const wristErrs: number[] = []
  let wristFrames = 0
  for (const s of truth.serves) {
    const c = s.events.contact?.tReal
    if (c === undefined) continue
    const around = truthFrames.filter((f) => Math.abs(f.tReal - c) <= 0.1)
    wristFrames += truth.frames.filter((f) => Math.abs(f.tReal - c) <= 0.1).length
    const a = scorePoseAccuracy(predicted, around, { frameWidth: truth.video.width, frameHeight: truth.video.height, staturePx, wristWindow: { wrist, startS: c - 0.1, endS: c + 0.1 } })
    if (a.wristWindowErrorBH !== null) for (let k = 0; k < a.wristWindowDetected; k++) wristErrs.push(a.wristWindowErrorBH)
  }
  const ps = run.dump.poseStats?.find((s) => s && s.inference)
  return {
    ...base,
    servesTruth: truth.serves.length,
    servesAnalysed: run.dump.serves.filter((s) => s.detection.kind === 'serve').length,
    events: ev,
    metrics: met,
    pose: { frames: acc.detected, meanBH: acc.meanErrorBH, tolerantBH: acc.meanErrorBHMirrorTolerant, medianBH: acc.medianErrorBH, wristBH: wristErrs.length ? mean(wristErrs) : null, wristFrames: wristErrs.length },
    poseStats: ps ? { inferenceMedianMs: ps.inference?.medianMs, prepareMedianMs: ps.prepare?.medianMs, roundTripMedianMs: ps.roundTrip?.medianMs, count: ps.inference?.count } : undefined,
  }
}

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.json') && (!only || f.includes(only)))
  .map((f) => join(dir, f))
const scores = files.map(score).filter((s): s is Score => s !== null)

const f1 = (v: number | undefined | null, d = 1) => (v === undefined || v === null || !Number.isFinite(v) ? '–' : v.toFixed(d))
const sec = (ms: number | string | undefined) => (typeof ms === 'number' ? (ms / 1000).toFixed(1) : '–')
const lines: string[] = []
lines.push('| run | state | total s | init | pass A | pass B | pose busy | ball busy | key frames | pose fr | ball fr | serves (truth) |')
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for (const s of scores) {
  const t = s.timings
  lines.push(`| ${s.name} | ${s.state} | ${sec(t.totalMs)} | ${sec(t.poseInitMs)} | ${sec(t.sparseMs)} | ${sec(t.denseMs)} | ${sec(t.densePoseMs)} | ${sec(t.denseBallMs)} | ${sec(t.keyFramesMs)} | ${t.poseFrames ?? '–'} | ${t.ballFrames ?? '–'} | ${s.servesAnalysed} of ${s.servesFound} (${s.servesTruth}) |`)
}
lines.push('')
lines.push('| run | release ms | apex ms | lowest hip ms | contact ms | landing ms | toss height (ratio) | contact height (ratio) | toss drop cm | rhythm ms | leg drive %H | loading %H | pose err BH (tolerant) | wrist ±0.1 s BH | inference ms |')
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for (const s of scores) {
  const e = (k: string) => (s.events[k] ? `${f1(s.events[k].maeMs)} (${s.events[k].n})` : '–')
  const m = (k: string, d = 3) => (s.metrics[k] ? `${f1(s.metrics[k].mae, d)} (${s.metrics[k].n})` : '–')
  lines.push(
    `| ${s.name} | ${e('tossRelease')} | ${e('tossApex')} | ${e('trophy (lowest hip)')} | ${e('contact')} | ${e('landing')} | ${m('toss-apex-height')} | ${m('contact-height-ratio')} | ${m('toss-drop', 1)} | ${m('rhythm-release-to-contact', 1)} | ${m('leg-drive', 2)} | ${m('loading-depth', 2)} | ${f1(s.pose.meanBH, 4)} (${f1(s.pose.tolerantBH, 4)}) | ${f1(s.pose.wristBH, 4)} | ${f1(s.poseStats?.inferenceMedianMs)} |`,
  )
}
const md = lines.join('\n')
console.log(md)
const outMd = opt('out', '')
if (outMd) writeFileSync(outMd, md + '\n')
const outJson = opt('json', '')
if (outJson) writeFileSync(outJson, JSON.stringify(scores, null, 1))
