/**
 * Replays the engine on the PRODUCTION pipeline's own input (dev only), and diffs that input against
 * the offline validation input of the same clip.
 *
 *   app/node_modules/.bin/tsx tools/validate/e2e-replay.ts --dump validation/results/e2e-final/runs/dist12-s1.json
 *       [--offline validation/results/metrics/pipeline/full/dist12-s1.json] [--json OUT.json]
 *
 * The dump is a perf-bench.mjs / e2e-accuracy.mjs run file (pipeline-e2e.ts ?dump=1): the poses the
 * pipeline passed to analyseSession, plus `input` (ball observations, tracks, per-window toss
 * entries, onsets, capture context) and `ballWindows` (each window's search configuration and every
 * ball candidate). The replay re-runs analyseSession in Node and checks it reproduces the stored
 * serves (the engine is deterministic), then prints per serve the contact methods, the fused-event
 * check (D2) and the contact-dependent metrics.
 *
 * With --offline (a smoke.mjs --full dump, the input metrics-eval.ts scores), it prints what differs:
 * pose frames and landmark distance on shared frames, ball candidates and tracks around contact,
 * the toss analysis, onsets and the capture context. This is how the 0.27 s early contact on
 * dist12-s1 / default75-s1 was traced to the pipeline's ball search (validation/results/e2e-final/SUMMARY.md).
 */
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyseSession, type EngineInput, type EngineOutput } from '../../app/src/analysis/engine.ts'
import type { BallTrack, Landmark, PoseFrame, VideoMeta } from '../../app/src/analysis/types.ts'
import { truthStaturePx, type SynthTruth } from '../../app/src/validation/truth.ts'
import { buildInput, readJson, type Dump, type Truth } from './metrics-eval.ts'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

type Packed = [number, number, number[][] | null][]
export interface ProdDump {
  clip: string
  dump: {
    meta: VideoMeta
    poses: Packed
    serves: EngineOutput['serves']
    input?: Omit<EngineInput, 'poses' | 'meta'>
    ballWindows?: { windowId: number; config: Record<string, unknown>; result: { candidates: { frameIndex: number; tReal: number; candidates: { x: number; y: number; radiusNorm: number; score: number }[] }[]; tracks: BallTrack[] } }[]
    sparsePoses?: Packed
  } | null
}

export function unpackPoses(p: Packed): PoseFrame[] {
  return p.map(([frameIndex, tReal, lms]) => ({
    frameIndex,
    tReal,
    landmarks: lms ? lms.map((r): Landmark => ({ x: r[0], y: r[1], z: r[2], visibility: r[3] })) : null,
    score: lms ? 1 : 0,
    source: 'mediapipe',
  }))
}

/** The engine input exactly as the production pipeline passed it. */
export function prodInput(run: ProdDump): EngineInput {
  const d = run.dump
  if (!d?.input) throw new Error(`${run.clip}: the dump has no engine input (re-run with the current pipeline-e2e.ts, ?dump=1)`)
  return { ...d.input, meta: d.meta, poses: unpackPoses(d.poses) }
}

const f3 = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? '–' : v.toFixed(3))

export function describeServes(out: EngineOutput): string[] {
  const lines: string[] = []
  for (const s of out.serves) {
    const c = s.events.contact
    lines.push(`serve ${s.index}: ${s.detection.kind}${s.exclusions.length ? ` (${s.exclusions.join(', ')})` : ''}; contact ${f3(c?.tReal)} s ± ${f3(c?.uncertaintyS)} (${c?.method ?? 'none'}, confidence ${f3(c?.confidence)})`)
    for (const id of ['toss-drop', 'rhythm-release-to-contact', 'leg-drive', 'contact-height-ratio', 'drive-time', 'loading-depth'] as const) {
      const m = s.metrics[id]
      if (m) lines.push(`    ${id}: ${m.status} ${m.value ?? ''}${m.reasonCode ? ` [${m.reasonCode}]` : ''}`)
    }
  }
  return lines
}

function landmarkDistanceBH(a: PoseFrame[], b: PoseFrame[], aspect: number, staturePx: number, heightPx: number): { shared: number; meanBH: number } {
  const byFrame = new Map(b.filter((p) => p.landmarks).map((p) => [p.frameIndex, p.landmarks!]))
  let n = 0
  let sum = 0
  for (const p of a) {
    const q = p.landmarks ? byFrame.get(p.frameIndex) : undefined
    if (!q || !p.landmarks) continue
    for (let k = 0; k < Math.min(p.landmarks.length, q.length); k++) {
      const dx = (p.landmarks[k].x - q[k].x) * aspect
      const dy = p.landmarks[k].y - q[k].y
      sum += Math.hypot(dx, dy)
      n++
    }
  }
  return { shared: new Set(a.map((p) => p.frameIndex)).size, meanBH: n ? (sum / n) * (heightPx / staturePx) : Number.NaN }
}

export function diffInputs(prod: EngineInput, offline: EngineInput, truth: Truth): string[] {
  const lines: string[] = []
  const aspect = prod.meta.width / prod.meta.height
  const heightPx = prod.meta.height
  const staturePx = truthStaturePx(truth as unknown as SynthTruth)
  lines.push(`poses: production ${prod.poses.length} frames (${prod.poses.filter((p) => p.landmarks).length} with a body), offline ${offline.poses.length} (${offline.poses.filter((p) => p.landmarks).length})`)
  const ld = landmarkDistanceBH(prod.poses, offline.poses, aspect, staturePx, heightPx)
  lines.push(`  mean landmark distance on ${ld.shared} shared frames: ${f3(ld.meanBH)} statures`)
  lines.push(`ball observations: production ${prod.ball.observations.length}, offline ${offline.ball.observations.length}`)
  const trackLine = (t: BallTrack) => `${t.kind} ${t.observations.length} obs ${f3(t.observations[0]?.tReal)}–${f3(t.observations.at(-1)?.tReal)} s`
  lines.push(`ball tracks: production [${prod.ball.tracks.map(trackLine).join('; ')}]`)
  lines.push(`             offline    [${offline.ball.tracks.map(trackLine).join('; ')}]`)
  const tossOf = (e: unknown) => {
    const o = e as { toss?: { release?: { tReal: number }; apex?: { tReal: number } }; release?: { tReal: number }; apex?: { tReal: number }; startReal?: number; endReal?: number }
    const t = o.toss ?? o
    return `release ${f3(t.release?.tReal)} apex ${f3(t.apex?.tReal)}${o.startReal !== undefined ? ` window ${f3(o.startReal)}–${f3(o.endReal)}` : ''}`
  }
  lines.push(`toss entries: production [${(prod.ball.toss ?? []).map(tossOf).join('; ')}]`)
  lines.push(`              offline    [${(offline.ball.toss ?? []).map(tossOf).join('; ')}]`)
  lines.push(`onsets: production ${prod.onsets.length}, offline ${offline.onsets.length}`)
  const cap = (c: EngineInput['capture']) => `${c?.source} view ${c?.declaredView} side ${c?.serveSide} hit-sound ${c?.hitSoundTiming ? 'on' : 'off'} orientation samples ${c?.orientationSamples?.length ?? 0}${c?.phoneMount ? ` mount ${c.phoneMount}` : ''}`
  lines.push(`capture: production ${cap(prod.capture)}`)
  lines.push(`         offline    ${cap(offline.capture)}`)
  return lines
}

function main(): void {
  const args = process.argv.slice(2)
  const opt = (name: string) => {
    const i = args.indexOf(`--${name}`)
    return i >= 0 ? args[i + 1] : undefined
  }
  const dumpPath = opt('dump')
  if (!dumpPath) throw new Error('--dump FILE is required')
  const run = readJson<ProdDump>(resolve(dumpPath))
  const input = prodInput(run)
  const out = analyseSession(input)
  const lines: string[] = [`clip ${run.clip}: replay of the production engine input`]
  const stored = run.dump!.serves
  // The dump rounds landmarks to 1e-5, so the replay matches to well under a millisecond, not exactly.
  const same = stored.length === out.serves.length && stored.every((s, k) => Math.abs((s.events.contact?.tReal ?? 0) - (out.serves[k].events.contact?.tReal ?? 0)) < 1e-3)
  lines.push(`reproduces the stored run (contact within 1 ms): ${same ? 'yes' : 'no (the engine changed since the run, or the input is incomplete)'}`)
  lines.push(...describeServes(out))
  const offlinePath = opt('offline') ?? join(repoRoot, 'validation/results/metrics/pipeline/full', `${run.clip}.json`)
  const truthPath = join(repoRoot, 'validation/synthetic/clips', run.clip, 'truth.json')
  if (existsSync(offlinePath) && existsSync(truthPath)) {
    const truth = readJson<Truth>(truthPath)
    const offline = buildInput(run.clip, readJson<Dump>(offlinePath), truth, 'default')
    lines.push('', `diff against the offline input (${offlinePath}):`)
    lines.push(...diffInputs(input, offline, truth))
    const offOut = analyseSession(offline)
    lines.push('', 'offline engine run:')
    lines.push(...describeServes(offOut))
  }
  console.log(lines.join('\n'))
  const json = opt('json')
  if (json) writeFileSync(json, JSON.stringify({ clip: run.clip, lines }, null, 1))
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) main()
