/**
 * Grid search of the trophy-pause stillness floors on DEVELOPMENT seeds (s1–s3) only (METRICS
 * §3.13: thresholds are grid-searched on synthetic data, then frozen). Prints MAE per setting.
 *   app/node_modules/.bin/tsx tools/validate/metrics-eval.grid.ts
 */
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyseSession } from '../../app/src/analysis/engine.ts'
import { PAUSE_THRESHOLDS } from '../../app/src/analysis/metrics/perServe.ts'
import { buildInput, readJson, type Dump, type Extra, type Truth } from './metrics-eval.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const dump = join(root, 'validation/results/metrics/pipeline/full')
const clips = readdirSync(dump).map((f) => f.replace('.json', '')).filter((c) => /-s[123]$/.test(c) && !/front45|rear|slomo/.test(c))
const data = clips
  .filter((c) => existsSync(join(root, 'validation/synthetic/clips', c, 'truth-extra.json')))
  .map((c) => ({ c, d: readJson<Dump>(join(dump, `${c}.json`)), t: readJson<Truth>(join(root, 'validation/synthetic/clips', c, 'truth.json')), e: readJson<Extra>(join(root, 'validation/synthetic/clips', c, 'truth-extra.json')) }))
  .filter((x) => x.t.video.captureFps >= 60)
const results: string[] = []
for (const hip of [0.02, 0.05, 0.1, 0.15]) {
  for (const wrist of [0.1, 0.2, 0.3, 0.45, 0.6]) {
    PAUSE_THRESHOLDS.hipFloor = hip
    PAUSE_THRESHOLDS.wristFloor = wrist
    const errs: number[] = []
    for (const x of data) {
      const out = analyseSession(buildInput(x.c, x.d, x.t, 'default'))
      const m = out.serves[0]?.metrics['trophy-pause']
      const truth = x.e.serves[0]?.canonical['trophy-pause']?.value
      if (m && typeof m.value === 'number' && typeof truth === 'number') errs.push(m.value - truth * 1000)
    }
    const mae = errs.reduce((a, b) => a + Math.abs(b), 0) / Math.max(1, errs.length)
    const bias = errs.reduce((a, b) => a + b, 0) / Math.max(1, errs.length)
    results.push(`hip ${hip} wrist ${wrist}: n ${errs.length} MAE ${mae.toFixed(0)} bias ${bias.toFixed(0)}`)
    console.log(results[results.length - 1])
  }
}
