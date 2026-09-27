/**
 * Synthetic serve corpus generator.
 *
 *   npx tsx tools/synth/src/cli.ts --quick                 3 short clips for CI
 *   npx tsx tools/synth/src/cli.ts --scenario baseline     one group, job or clip id (comma-separated list allowed)
 *   npx tsx tools/synth/src/cli.ts --all                   quick set + full corpus
 *   npx tsx tools/synth/src/cli.ts --list                  groups, jobs, clips and what exists on disk
 *
 * Options: --jobs N (parallel render jobs, default 2), --force (re-render existing clips),
 * --out DIR (default validation/synthetic), --channel msedge|chrome,
 * --truth-only (rewrite truth.json, truth-extra.json and the manifest for clips already on disk without rendering;
 * valid only while the motion, camera and render code are unchanged since the videos were encoded).
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { augmentCorpus } from './augmentTruth.ts'
import { clipFiles, jobComplete, rebuildTruth, runJob, type ClipRecord } from './generate.ts'
import { loadManifest, upsertManifest } from './manifest.ts'
import { RenderService } from './render/service.ts'
import { allJobs, corpus, GROUPS, quickSet, resolveJobs } from './scenarios.ts'
import { buildScenario, type Scenario } from './setup.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const TOOL = resolve(HERE, '..')
const REPO = resolve(TOOL, '..', '..')

interface Args {
  scenarios: string[]
  all: boolean
  quick: boolean
  list: boolean
  force: boolean
  jobs: number
  out: string
  channel: 'msedge' | 'chrome'
  truthOnly: boolean
}

function parseArgs(argv: string[]): Args {
  const a: Args = { scenarios: [], all: false, quick: false, list: false, force: false, jobs: 2, out: join(REPO, 'validation', 'synthetic'), channel: 'msedge', truthOnly: false }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    const next = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`${k} needs a value`)
      return v
    }
    if (k === '--scenario' || k === '-s') a.scenarios.push(...next().split(',').filter(Boolean))
    else if (k === '--all') a.all = true
    else if (k === '--quick') a.quick = true
    else if (k === '--list' || k === '--status') a.list = true
    else if (k === '--force') a.force = true
    else if (k === '--truth-only') a.truthOnly = true
    else if (k === '--jobs' || k === '-j') a.jobs = Math.max(1, Number(next()))
    else if (k === '--out') a.out = resolve(next())
    else if (k === '--channel') a.channel = next() as Args['channel']
    else throw new Error(`unknown argument ${k}`)
  }
  return a
}

function frameEstimate(sc: Scenario): number {
  return buildScenario(sc).frameCount
}

function listStatus(out: string): void {
  const jobs = allJobs()
  const m = loadManifest(out)
  const onDisk = new Set(m.clips.map((c) => c.id))
  console.log(`Output folder: ${out}`)
  let total = 0
  let present = 0
  for (const g of GROUPS) {
    const clips = jobs.flatMap((j) => j.outputs.filter((o) => o.tags.includes(g.id)).map((o) => o.id))
    const have = clips.filter((c) => onDisk.has(c) || (existsSync(clipFiles(out, c).mp4) && existsSync(clipFiles(out, c).truth)))
    console.log(`\n[${g.id}] ${g.description}\n  ${have.length}/${clips.length} on disk${clips.length ? ': ' : ''}${clips.map((c) => (have.includes(c) ? c : `(${c} missing)`)).join(' ')}`)
  }
  for (const j of jobs) for (const o of j.outputs) {
    total++
    if (onDisk.has(o.id)) present++
  }
  const bytes = m.clips.reduce((s, c) => s + c.bytes.mp4 + (c.bytes.webm ?? 0) + c.bytes.truth, 0)
  console.log(`\n${present}/${total} clips in the manifest, ${(bytes / 1e6).toFixed(1)} MB (video + truth)`)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.list) {
    listStatus(args.out)
    return
  }
  let jobs: Scenario[] = []
  if (args.quick) jobs.push(...quickSet())
  if (args.all) jobs.push(...quickSet(), ...corpus())
  if (args.scenarios.length) jobs.push(...resolveJobs(args.scenarios))
  const seen = new Set<string>()
  jobs = jobs.filter((j) => (seen.has(j.id) ? false : (seen.add(j.id), true)))
  if (jobs.length === 0) {
    console.log('Nothing to do. Use --quick, --all, --scenario <id> or --list.')
    return
  }
  const pkg = JSON.parse(readFileSync(join(TOOL, 'package.json'), 'utf8')) as { name: string; version: string }
  const generator = { name: pkg.name, version: pkg.version, node: process.version, command: `tsx tools/synth/src/cli.ts ${process.argv.slice(2).join(' ')}` }
  if (args.truthOnly) {
    const records: ClipRecord[] = []
    for (const sc of jobs) {
      try {
        records.push(...rebuildTruth(sc, { outRoot: args.out, tmpDir: '', log: (s) => console.log(s), generator }))
        console.log(`truth rebuilt: ${sc.outputs.map((o) => o.id).join(', ')}`)
      } catch (e) {
        console.log(`skipped ${sc.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    upsertManifest(args.out, records)
    augmentCorpus(args.out, { ids: records.map((x) => x.id), log: () => {} })
    listStatus(args.out)
    return
  }
  const todo = args.force ? jobs : jobs.filter((j) => !jobComplete(j, args.out))
  const skipped = jobs.length - todo.length
  const frames = todo.reduce((s, j) => s + frameEstimate(j), 0)
  console.log(`${todo.length} render job(s), ${frames} frames${skipped ? `; ${skipped} already on disk (use --force to redo)` : ''}; ${args.jobs} in parallel`)
  if (todo.length === 0) {
    upsertManifest(args.out, [])
    listStatus(args.out)
    return
  }

  const tmpDir = join(TOOL, '.cache', 'tmp')
  const svc = await RenderService.start({ channel: args.channel })
  const failures: { job: string; error: string }[] = []
  const rendered: string[] = []
  let manifestChain = Promise.resolve()
  const t0 = performance.now()
  try {
    let next = 0
    const worker = async () => {
      while (next < todo.length) {
        const sc = todo[next++]
        console.log(`[${next}/${todo.length}] ${sc.id}: ${sc.description}`)
        try {
          const records: ClipRecord[] = await runJob(svc, sc, { outRoot: args.out, tmpDir, log: (s) => console.log(s), generator })
          rendered.push(...records.map((x) => x.id))
          manifestChain = manifestChain.then(() => void upsertManifest(args.out, records))
          await manifestChain
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          failures.push({ job: sc.id, error: msg })
          console.error(`  FAILED ${sc.id}: ${msg}`)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(args.jobs, todo.length) }, worker))
  } finally {
    await svc.close()
  }
  if (rendered.length) {
    // Derived truth (truth-extra.json, truth-series.json) for the clips just written.
    const aug = augmentCorpus(args.out, { ids: rendered, log: () => {} })
    console.log(`truth-extra.json written for ${aug.written.length} clip(s)${aug.failed.length ? `; failed: ${aug.failed.map((f) => `${f.id} (${f.error})`).join(', ')}` : ''}`)
  }
  console.log(`\nFinished in ${((performance.now() - t0) / 60000).toFixed(1)} min with ${failures.length} failure(s).`)
  for (const f of failures) console.log(`  ${f.job}: ${f.error.split('\n')[0]}`)
  listStatus(args.out)
  if (failures.length) process.exitCode = 1
}

await main()
