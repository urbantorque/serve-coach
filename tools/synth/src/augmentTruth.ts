/**
 * Post-processing: derive the truth that truth.json lacks (leg drive, drive time, loading depth,
 * shoulder tilt at the trophy position, shoulder-over-shoulder at contact, knee bands, landing from
 * the start toe, outcomes, capture-quality inputs) and a canonical-metric-id map, and write
 * truth-extra.json next to each truth.json; also writes validation/synthetic/truth-series.json
 * (spreads across the serves of each clip series, e.g. baseline-s1..s5). Never touches videos,
 * truth.json or the manifest.
 *
 *   npx tsx tools/synth/src/augmentTruth.ts [--out DIR] [--frames-only] [clipId ...]
 *
 * --frames-only skips the continuous derivation (kinematic model rebuilt from the scenario).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildExtraTruth, mean, sampleSD, type TruthFile } from './extraTruth.ts'
import { allJobs } from './scenarios.ts'
import { buildScenario, type BuiltScenario, type Scenario } from './setup.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const TOOL = resolve(HERE, '..')
const REPO = resolve(TOOL, '..', '..')

interface ManifestLite {
  clips: { id: string; job: string; files: { truth: string } }[]
}

const r = (x: number | null, d: number): number | null => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d)

export function augmentCorpus(outRoot: string, opts: { ids?: string[]; framesOnly?: boolean; log?: (s: string) => void } = {}): { written: string[]; failed: { id: string; error: string }[] } {
  const log = opts.log ?? console.log
  const manifest = JSON.parse(readFileSync(join(outRoot, 'manifest.json'), 'utf8')) as ManifestLite
  const clips = manifest.clips.filter((c) => !opts.ids?.length || opts.ids.includes(c.id))
  const jobs = new Map<string, Scenario>(allJobs().map((j) => [j.id, j]))
  const built = new Map<string, BuiltScenario | null>()
  const pkg = JSON.parse(readFileSync(join(TOOL, 'package.json'), 'utf8')) as { name: string; version: string }
  const generator = { name: pkg.name, version: pkg.version, script: 'tools/synth/src/augmentTruth.ts', generatedAt: new Date().toISOString() }
  const written: string[] = []
  const failed: { id: string; error: string }[] = []
  for (const c of clips) {
    try {
      const truthPath = join(outRoot, c.files.truth)
      if (!existsSync(truthPath)) throw new Error(`missing ${c.files.truth}`)
      const truth = JSON.parse(readFileSync(truthPath, 'utf8')) as TruthFile
      let rebuilt: BuiltScenario | null = null
      if (!opts.framesOnly) {
        if (!built.has(c.job)) {
          const sc = jobs.get(c.job)
          built.set(c.job, sc ? buildScenario(sc) : null)
        }
        rebuilt = built.get(c.job) ?? null
      }
      const extra = buildExtraTruth(truth, { rebuilt, generator })
      writeFileSync(join(dirname(truthPath), 'truth-extra.json'), JSON.stringify(extra, null, 1))
      const d = extra.derivation as { continuousSkipped: string | null; rebuildMaxDeviationMm: number | null }
      log(`${c.id}: truth-extra.json (${d.continuousSkipped ? `frames only: ${d.continuousSkipped}` : `continuous, rebuild deviation ${d.rebuildMaxDeviationMm} mm`})`)
      written.push(c.id)
    } catch (e) {
      failed.push({ id: c.id, error: e instanceof Error ? e.message : String(e) })
      log(`${c.id}: FAILED ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  writeSeries(outRoot, manifest)
  return { written, failed }
}

/**
 * truth-series.json: per clip series (clip id without its -sN suffix), the serves in the series and
 * the sample SDs behind the spread metrics. Clips of one series share the player and serve seed, so
 * s1..s5 are five serves of one player. Series made from one render (fps/crf sweeps) repeat the
 * baseline serves; their spreads equal the baseline's.
 */
function writeSeries(outRoot: string, manifest: ManifestLite): void {
  interface Row {
    clip: string
    serve: number
    tossApexHeightM: number
    tossForwardM: number
    releaseToContactS: number
    contactHeightRatio: number
    hipRisePct: number
    driveTimeS: number
  }
  const bySeries = new Map<string, Row[]>()
  for (const c of manifest.clips) {
    const extraPath = join(outRoot, dirname(c.files.truth), 'truth-extra.json')
    if (!existsSync(extraPath)) continue
    const extra = JSON.parse(readFileSync(extraPath, 'utf8')) as {
      serves: { index: number; canonical: Record<string, { value: number | boolean | string | null; alt?: Record<string, number> }> }[]
    }
    const series = c.id.replace(/-s\d+$/, '')
    const rows = bySeries.get(series) ?? []
    for (const s of extra.serves) {
      const v = (k: string) => s.canonical[k].value as number
      rows.push({
        clip: c.id,
        serve: s.index,
        tossApexHeightM: (s.canonical['toss-apex-height'].alt as Record<string, number>).m,
        tossForwardM: v('toss-forward'),
        releaseToContactS: v('rhythm-release-to-contact'),
        contactHeightRatio: v('contact-height-ratio'),
        hipRisePct: v('leg-drive'),
        driveTimeS: v('drive-time'),
      })
    }
    bySeries.set(series, rows)
  }
  const series = [...bySeries.entries()].map(([id, rows]) => {
    const col = (k: keyof Row) => rows.map((x) => x[k] as number)
    const stat = (k: keyof Row, d: number) => ({ mean: r(mean(col(k)), d), sd: r(sampleSD(col(k)), d) })
    return {
      series: id,
      clips: [...new Set(rows.map((x) => x.clip))],
      n: rows.length,
      'toss-height-spread': { unit: 'm', ...stat('tossApexHeightM', 5) },
      'toss-forward-spread': { unit: 'm', ...stat('tossForwardM', 5) },
      'rhythm-spread': { unit: 's', ...stat('releaseToContactS', 6) },
      contactHeightRatio: stat('contactHeightRatio', 5),
      legDrivePctHeight: stat('hipRisePct', 3),
      driveTimeS: stat('driveTimeS', 6),
    }
  })
  writeFileSync(
    join(outRoot, 'truth-series.json'),
    JSON.stringify(
      {
        format: 'serve-synth-truth-series/1',
        note: 'Sample SD (n - 1) across all serves of a clip series (clip id without -sN). Truth for the spread metrics when a validation run pools a series; n < 8 is below the app minimum for spreads (METRICS.md 3.6). Written by tools/synth/src/augmentTruth.ts.',
        series,
      },
      null,
      1,
    ),
  )
}

function main(): void {
  const argv = process.argv.slice(2)
  let out = join(REPO, 'validation', 'synthetic')
  let framesOnly = false
  const ids: string[] = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out = resolve(argv[++i])
    else if (argv[i] === '--frames-only') framesOnly = true
    else ids.push(...argv[i].split(',').filter(Boolean))
  }
  const t0 = performance.now()
  const { written, failed } = augmentCorpus(out, { ids, framesOnly })
  console.log(`\n${written.length} truth-extra.json written, ${failed.length} failed, in ${((performance.now() - t0) / 1000).toFixed(1)} s; truth-series.json updated`)
  if (failed.length) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
