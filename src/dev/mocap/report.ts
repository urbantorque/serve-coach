/**
 * The mocap bench: real serves, filmed from where players stand their phones,
 * read by the engine, set against what the capture says happened.
 *
 * Pure — `scripts/bench-mocap.mjs` does the file reading and prints what this
 * returns. Run with `npm run bench:mocap` after `npm run setup:bench`.
 *
 * Three questions per phone position and frame rate:
 * 1. Timing: each keyframe against the same definition read in 3D at 180 Hz
 *    (what the phone costs), and against the event that definition stands in
 *    for (what the definition costs).
 * 2. Camera: the angle the engine thinks it was filmed from, and the view it
 *    files the clip under.
 * 3. Verdict: which faults are named on serves a real player hit, and how
 *    often. The serves are one player's; the readings are evidence about the
 *    engine, not a judgement of the player.
 */
import { filmMocap, mocapTruth, swingCompleted, type MocapServe, type VirtualPhone } from '../../lib/analysis/mocapServe'
import { runEngine } from './engine'

export interface Placement {
  name: string
  phone: Partial<VirtualPhone>
}

/** Where players actually put a phone, by `VirtualPhone.bearing`. */
export const PLACEMENTS: Placement[] = [
  { name: 'guide (left, on the baseline)', phone: { bearing: 90 } },
  { name: 'right, on the baseline', phone: { bearing: 270 } },
  { name: 'back fence', phone: { bearing: 180, distance: 6 } },
  { name: 'rear oblique left', phone: { bearing: 135 } },
  { name: 'rear oblique right', phone: { bearing: 225 } },
]

export const RATES = [30, 60, 120]

export interface BenchRow {
  placement: string
  fps: number
  serves: number
  refused: number
  /** Engine minus truth, ms: `phone` against the engine's own definition in 3D, `event` against the event. */
  timing: Record<string, { phone: number[]; event?: number[] }>
  yaw: number[]
  views: Record<string, number>
  flaws: Record<string, number>
  primary: Record<string, number>
  metrics: Record<string, number[]>
}

export function benchMocap(serves: MocapServe[], placements = PLACEMENTS, rates = RATES): BenchRow[] {
  const rows: BenchRow[] = []
  const complete = serves.filter(swingCompleted)
  for (const placement of placements) {
    for (const fps of rates) {
      const row: BenchRow = {
        placement: placement.name,
        fps,
        serves: complete.length,
        refused: 0,
        timing: {
          contact: { phone: [], event: [] },
          toss: { phone: [], event: [] },
          trophy: { phone: [] },
          drop: { phone: [], event: [] },
        },
        yaw: [],
        views: {},
        flaws: {},
        primary: {},
        metrics: {},
      }
      for (const serve of complete) {
        const phone = { ...placement.phone, fps }
        const frames = filmMocap(serve, phone)
        const lead = phone.lead ?? 0.5
        const result = runEngine(frames, fps)
        if (!result.ok) {
          row.refused++
          continue
        }
        const { skel, quality, resilience, fundamentals, diagnosis, verdict } = result.run
        const truth = mocapTruth(serve)
        const at = (k: 'toss' | 'trophy') => result.run.frames[skel.keys[k]].t - lead
        const ms = (a: number, b: number) => (a - b) * 1000
        row.timing.contact.phone.push(ms(skel.times.contact - lead, truth.wristTop))
        row.timing.contact.event!.push(ms(skel.times.contact - lead, truth.racketTop))
        row.timing.toss.phone.push(ms(at('toss'), truth.tossPosture))
        row.timing.toss.event!.push(ms(at('toss'), truth.tossTop))
        row.timing.trophy.phone.push(ms(at('trophy'), truth.kneeBottom))
        row.timing.drop.phone.push(ms(skel.times.drop - lead, truth.dropPosture))
        row.timing.drop.event!.push(ms(skel.times.drop - lead, truth.racketBottom))
        row.yaw.push(resilience.spatial.yaw_deg)
        row.views[quality.view] = (row.views[quality.view] ?? 0) + 1
        for (const f of diagnosis.flaws) if (f.detected) row.flaws[f.flaw] = (row.flaws[f.flaw] ?? 0) + 1
        const primary = verdict.primary_flaw?.flaw ?? (verdict.status === 'rejected' ? `refused: ${verdict.reason}` : 'none')
        row.primary[primary] = (row.primary[primary] ?? 0) + 1
        for (const f of fundamentals) for (const m of f.metrics) (row.metrics[m.id] ??= []).push(m.value)
      }
      rows.push(row)
    }
  }
  return rows
}

const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b)
const median = (xs: number[]) => (xs.length ? sorted(xs)[Math.floor(xs.length / 2)] : NaN)
const meanOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const rms = (xs: number[]) => Math.sqrt(meanOf(xs.map((x) => x * x)))

function summary(xs: number[]): string {
  if (!xs.length) return '—'
  const s = sorted(xs)
  return `${meanOf(xs).toFixed(0).padStart(4)} ±${rms(xs).toFixed(0).padStart(3)} rms  [${s[0].toFixed(0)}, ${s[s.length - 1].toFixed(0)}]`
}

const counts = (r: Record<string, number>) =>
  Object.entries(r)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(', ') || '—'

/** The rows as plain text, one block per placement and rate. */
export function formatBench(rows: BenchRow[]): string {
  const out: string[] = []
  for (const r of rows) {
    out.push(`\n${r.placement} · ${r.fps} fps · ${r.serves} serves, ${r.refused} refused`)
    out.push('  timing, engine minus truth (ms)       vs its own definition in 3D        vs the event it stands for')
    for (const [k, t] of Object.entries(r.timing)) {
      out.push(`    ${k.padEnd(8)} ${summary(t.phone).padEnd(34)} ${t.event ? summary(t.event) : ''}`)
    }
    out.push(`  camera: yaw ${median(r.yaw).toFixed(0)}° median [${sorted(r.yaw)[0] ?? '—'}, ${sorted(r.yaw).at(-1) ?? '—'}], filed as ${counts(r.views)}`)
    out.push(`  faults named: ${counts(r.flaws)}`)
    out.push(`  told to fix first: ${counts(r.primary)}`)
    const metrics = Object.entries(r.metrics)
      .map(([id, v]) => `${id} ${median(v).toFixed(2)}`)
      .join(' · ')
    out.push(`  medians: ${metrics}`)
  }
  return out.join('\n')
}
