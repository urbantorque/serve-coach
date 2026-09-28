#!/usr/bin/env node
/**
 * End-to-end accuracy run of the PRODUCTION pipeline on the synthetic corpus (dev only).
 *
 *   node tools/validate/e2e-accuracy.mjs [--port 5401] [--server prod|dev|external]
 *        [--clips baseline-s1,dist12-s1,...] [--out validation/results/e2e-final] [--skip-run]
 *
 * 1. perf-bench.mjs runs pipeline-e2e.html once per clip in headless Edge, each in a fresh browser
 *    context. The default server is the PRODUCTION build (vite build + vite preview, e2e/server.mjs):
 *    the bundles, workers and asset paths a phone gets. Every run file keeps the engine's full input
 *    (?dump=1), so tools/validate/e2e-replay.ts can replay and diff it offline.
 * 2. perf-accuracy.mts scores the runs against the generator's truth (serve count, event timing,
 *    metric errors with the metrics-eval.ts scoring, pose error).
 * 3. Serve counting: per clip, serves found (windows), counted (kind 'serve'), counted serves whose
 *    window holds a true contact (hits) and counted serves without one (false serves).
 *
 * Writes <out>/runs/*.json, <out>/accuracy.md, <out>/accuracy.json, <out>/counts.json and <out>/SUMMARY.md
 * (generated tables; the causes and fixes are written up in docs/VALIDATION.md §3.3).
 * Default clips: the five single-serve side clips and the three multi-serve clips.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const appRoot = join(repoRoot, 'app')
const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}
const DEFAULT_CLIPS = ['baseline-s1', 'dist12-s1', 'default75-s1', 'fence9-s1', 'fps240-s1', 'session', 'sample-checkin', 'sample-retest']
const clips = arg('clips', DEFAULT_CLIPS.join(',')).split(',').filter(Boolean)
const port = arg('port', '5401')
const server = arg('server', 'prod')
const out = resolve(arg('out', join(repoRoot, 'validation/results/e2e-final')))
const runs = join(out, 'runs')
mkdirSync(runs, { recursive: true })

if (!args.includes('--skip-run')) {
  const bench = spawnSync(
    process.execPath,
    [join(appRoot, 'src/analysis/pipeline/e2e/perf-bench.mjs'), '--port', port, '--server', server, '--clips', clips.join(','), '--out', runs],
    { cwd: appRoot, stdio: 'inherit' },
  )
  if (bench.status !== 0) throw new Error(`perf-bench.mjs exited with ${bench.status}`)
}

// tsx's CLI through this Node (no shell, so no platform-specific .cmd wrapper).
const tsxCli = join(appRoot, 'node_modules/tsx/dist/cli.mjs')
const scored = spawnSync(process.execPath, [tsxCli, join(appRoot, 'src/analysis/pipeline/e2e/perf-accuracy.mts'), '--dir', runs, '--out', join(out, 'accuracy.md'), '--json', join(out, 'accuracy.json')], {
  cwd: appRoot,
  stdio: 'inherit',
})
if (scored.status !== 0) throw new Error(`perf-accuracy.mts exited with ${scored.status}`)

// Serve counting against the truth contacts.
const counts = []
for (const file of readdirSync(runs).filter((f) => f.endsWith('.json'))) {
  const run = JSON.parse(readFileSync(join(runs, file), 'utf8'))
  if (!clips.includes(run.clip)) continue
  const truthPath = join(repoRoot, 'validation/synthetic/clips', run.clip, 'truth.json')
  if (!existsSync(truthPath)) continue
  const truth = JSON.parse(readFileSync(truthPath, 'utf8'))
  const contacts = truth.serves.map((s) => s.events.contact?.tReal).filter((t) => t !== undefined)
  const serves = run.dump?.serves ?? []
  const counted = serves.filter((s) => s.detection.kind === 'serve')
  const inWindow = (s, t) => t >= s.window.tStartReal && t <= s.window.tEndReal
  const hits = counted.filter((s) => contacts.some((t) => inWindow(s, t)))
  const missed = contacts.filter((t) => !counted.some((s) => inWindow(s, t)))
  counts.push({
    clip: run.clip,
    server: run.server ?? 'dev',
    state: run.report?.state,
    truth: contacts.length,
    found: run.report?.result?.servesFound ?? 0,
    counted: counted.length,
    hits: hits.length,
    falseServes: counted.length - hits.length,
    missedContacts: missed.map((t) => Math.round(t * 100) / 100),
    uncounted: serves.filter((s) => s.detection.kind !== 'serve').map((s) => ({ index: s.index, kind: s.detection.kind, exclusions: s.exclusions })),
    disputes: serves.filter((s) => s.events.contact?.method === 'disputed').map((s) => s.index),
    wallS: run.wallS,
    consoleErrors: run.console?.length ?? 0,
  })
}
writeFileSync(join(out, 'counts.json'), JSON.stringify(counts, null, 1))
const total = counts.reduce((a, c) => ({ truth: a.truth + c.truth, hits: a.hits + c.hits, falseServes: a.falseServes + c.falseServes }), { truth: 0, hits: 0, falseServes: 0 })
for (const c of counts) console.log(`${c.clip}: counted ${c.counted} of ${c.truth} true serves (found ${c.found}; hits ${c.hits}; false ${c.falseServes})${c.uncounted.length ? `; uncounted ${JSON.stringify(c.uncounted)}` : ''}`)
console.log(`total: ${total.hits} of ${total.truth} true serves counted, ${total.falseServes} false serves`)

// ---------- SUMMARY.md (generated; the analysis of causes and fixes lives in docs/VALIDATION.md §3.3) ----------
const scores = JSON.parse(readFileSync(join(out, 'accuracy.json'), 'utf8')).filter((s) => clips.includes(s.clip))
const f = (v, d = 1) => (v === undefined || v === null || !Number.isFinite(v) ? '–' : v.toFixed(d))
const statusIds = ['serve-count', 'toss-apex-height', 'contact-height-ratio', 'toss-drop', 'rhythm-release-to-contact', 'leg-drive', 'loading-depth']
const lines = []
lines.push('# End-to-end accuracy of the production pipeline (synthetic corpus)')
lines.push('')
lines.push(`Generated ${new Date().toISOString()} by \`tools/validate/e2e-accuracy.mjs\` (server: ${[...new Set(counts.map((c) => c.server))].join(', ')}; ${counts.length} clips). **Synthetic serves only; no real footage.** One run per clip in headless Edge on a shared laptop, so times are indicative.`)
lines.push('')
lines.push('The full pipeline (`runAnalysis`: serve scan, per-serve pose, ball search in workers, engine, key frames, storage) runs on each clip as the app would, from the production build (`vite build` + `vite preview`, `app/src/analysis/pipeline/e2e/server.mjs`) unless another server was chosen. Runs are scored against the generator\'s truth with `perf-accuracy.mts` (the scoring of `tools/validate/metrics-eval.ts`). Every run file in `runs/` keeps the engine\'s full input, so `tools/validate/e2e-replay.ts` can replay the engine offline and diff its input against the offline validation input. Causes, fixes and the fused-event rule: `docs/VALIDATION.md` §3.3. Production runs from before the 28 September fixes, with replay diffs: `repro/`.')
lines.push('')
lines.push('## Serve counting')
lines.push('')
lines.push('| Clip | True serves | Found (windows) | Counted | Counted with a true contact | False serves | Contacts not counted | Contact withheld (D2) | Console errors | Wall s |')
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for (const c of counts) lines.push(`| ${c.clip} | ${c.truth} | ${c.found} | ${c.counted} | ${c.hits} | ${c.falseServes} | ${c.missedContacts.length ? c.missedContacts.join(', ') : 'none'} | ${c.disputes.length ? c.disputes.join(', ') : 'none'} | ${c.consoleErrors} | ${f(c.wallS)} |`)
lines.push(`| **Total** | **${total.truth}** | ${counts.reduce((a, c) => a + c.found, 0)} | ${counts.reduce((a, c) => a + c.counted, 0)} | **${total.hits}** | **${total.falseServes}** | | | ${counts.reduce((a, c) => a + c.consoleErrors, 0)} | |`)
lines.push('')
lines.push(`Recall ${total.hits} of ${total.truth} (${f((100 * total.hits) / Math.max(1, total.truth), 0)}%); ${total.falseServes} false serves. METRICS §5.4 bar: precision and recall ≥ 99%.`)
lines.push('')
lines.push('## Event timing and metric errors')
lines.push('')
lines.push('Mean absolute error (n serves scored). Heights as a ratio of standing height; leg drive and loading in % of height.')
lines.push('')
lines.push('| Clip | Contact ms | Release ms | Apex ms | Lowest hip ms | Landing ms | Toss drop cm | Rhythm ms | Contact height | Toss height | Leg drive | Loading |')
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
const e = (s, k) => (s.events[k] ? `${f(s.events[k].maeMs)} (${s.events[k].n})` : '–')
const m = (s, k, d) => (s.metrics[k] ? `${f(s.metrics[k].mae, d)} (${s.metrics[k].n})` : '–')
for (const s of scores) lines.push(`| ${s.clip} | ${e(s, 'contact')} | ${e(s, 'tossRelease')} | ${e(s, 'tossApex')} | ${e(s, 'trophy (lowest hip)')} | ${e(s, 'landing')} | ${m(s, 'toss-drop', 1)} | ${m(s, 'rhythm-release-to-contact', 1)} | ${m(s, 'contact-height-ratio', 3)} | ${m(s, 'toss-apex-height', 3)} | ${m(s, 'leg-drive', 2)} | ${m(s, 'loading-depth', 2)} |`)
lines.push('')
lines.push('## Statuses the engine emitted')
lines.push('')
lines.push(`| Clip | ${statusIds.join(' | ')} |`)
lines.push(`| --- | ${statusIds.map(() => '---').join(' | ')} |`)
for (const s of scores) lines.push(`| ${s.clip} | ${statusIds.map((id) => s.metrics[id]?.statuses || '–').join(' | ')} |`)
lines.push('')
lines.push("The test page imports each clip as daylight (the renders are) with no mount answer, so contact height is `experimental` (`PITCH_UNKNOWN`) and is not corrected for camera pitch; clips filmed closer than 6 m are capped at experimental as well. Toss height is experimental everywhere: its V1 pass through the app pipeline fails with truth landmarks (the method-only gate, 28 September), so it waits for a real-footage check. The pipeline also measures the light on the serve scan (`quality/light.ts`); none of these daylight renders is taken for court lights.")
lines.push('')
lines.push('## Stage times (s)')
lines.push('')
lines.push('| Clip | Total | Model start | Serve scan (pass A) | Full-rate pass (pass B) | Pose busy | Ball busy | Key frames |')
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
const sec = (v) => (typeof v === 'number' ? (v / 1000).toFixed(1) : '–')
for (const s of scores) lines.push(`| ${s.clip} | ${sec(s.timings.totalMs)} | ${sec(s.timings.poseInitMs)} | ${sec(s.timings.sparseMs)} | ${sec(s.timings.denseMs)} | ${sec(s.timings.densePoseMs)} | ${sec(s.timings.denseBallMs)} | ${sec(s.timings.keyFramesMs)} |`)
lines.push('')
lines.push('## Reproduce')
lines.push('')
lines.push('```sh')
lines.push('node tools/validate/e2e-accuracy.mjs --port 5401        # build, preview, run, score, write this file')
lines.push('node tools/validate/e2e-accuracy.mjs --skip-run         # re-score runs/ and rewrite this file')
lines.push('app/node_modules/.bin/tsx tools/validate/e2e-replay.ts --dump validation/results/e2e-final/runs/<clip>__default.json')
lines.push('```')
writeFileSync(join(out, 'SUMMARY.md'), lines.join('\n') + '\n')
console.log(`wrote ${join(out, 'SUMMARY.md')}`)
