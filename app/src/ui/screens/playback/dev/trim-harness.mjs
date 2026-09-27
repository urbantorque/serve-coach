// Dev only. Trims full validation-harness dumps (real engine output: cleaned MediaPipe poses, ball
// tracks, toss analysis, audio onsets) into the compact fixtures the playback screens load in dev.
//
// The compact smoke results in validation/results/smoke/*.json carry no per-frame data, so the
// fixtures come from full dumps made with the same harness:
//   node tools/validate/smoke.mjs --clips baseline-s1,baseline-s2,fence9-s1 --full \
//     --full-dir validation/results/ui/ui-playback/harness/full --out validation/results/ui/ui-playback/harness --force
//   node app/src/ui/screens/playback/dev/trim-harness.mjs
//
// Nothing here ships: the fixtures are imported only behind `import.meta.env.DEV`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../../../../..')
const fullDir = join(repoRoot, 'validation/results/ui/ui-playback/harness/full')
const outDir = join(here, 'fixtures')
const clips = process.argv.slice(2).length ? process.argv.slice(2) : ['baseline-s1', 'baseline-s2', 'fence9-s1']

const r = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? Number(x.toFixed(d)) : null)
/** Body landmarks only (11..32): face landmarks are never drawn (DESIGN §2.7). */
const FIRST_BODY = 11

mkdirSync(outDir, { recursive: true })
for (const clip of clips) {
  const full = JSON.parse(readFileSync(join(fullDir, `${clip}.json`), 'utf8'))
  if (!full.ok) throw new Error(`${clip}: harness run failed`)
  const pass = full.ball.passes[full.ball.finalPass]
  const frames = full.pose.clean.frames.map((f) => {
    const flat = []
    if (f.landmarks) {
      for (let k = FIRST_BODY; k < 33; k++) {
        const l = f.landmarks[k]
        flat.push(r(l[0], 4), r(l[1], 4), r(l[3], 2))
      }
    }
    return [f.frameIndex, r(f.tReal, 5), f.landmarks ? flat : null]
  })
  const fixture = {
    format: 'playback-fixture/1',
    clip,
    clipUrl: full.clipUrl,
    source: `validation/results/ui/ui-playback/harness/full/${clip}.json (app/src/validation/harness.ts via tools/validate/smoke.mjs --full)`,
    inputs: full.inputs,
    meta: full.meta.final,
    pose: {
      firstLandmark: FIRST_BODY,
      bodyHeightHU: r(full.pose.clean.report.bodyHeightHU, 5),
      bodyHeightSource: full.pose.clean.report.bodyHeightSource,
      frames,
    },
    ball: {
      setup: pass.setup,
      contactFromAudioTReal: r(pass.contactFromAudioTReal, 5),
      tracks: pass.tracks.map((t) => ({
        id: t.id,
        kind: t.kind,
        fit: t.fit ?? null,
        obs: t.observations.map((o) => [o.frameIndex, r(o.tReal, 5), r(o.x, 5), r(o.y, 5), r(o.radius, 5), r(o.score, 3), o.source === 'predicted' ? 1 : 0]),
      })),
      toss: pass.toss,
      events: pass.events,
      metrics: pass.metrics,
    },
    audio: { usable: full.audio?.timing?.usable ?? false, onsets: full.audio?.onsets ?? [] },
  }
  const file = join(outDir, `${clip}.json`)
  writeFileSync(file, `${JSON.stringify(fixture)}\n`)
  console.log(`${clip}: ${frames.length} pose frames, ${fixture.ball.tracks.length} ball tracks -> ${file}`)
}
