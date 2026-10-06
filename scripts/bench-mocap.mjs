/**
 * Run the engine over real serves filmed by virtual phones, and print what it
 * got right and wrong.
 *
 *   npm run setup:bench          # once: fetches the Bath serve set
 *   npm run bench:mocap          # every placement, 30 / 60 / 120 fps
 *   npm run bench:mocap -- --quick       # the guide's placement at 30 fps only
 *   npm run bench:mocap -- --fixture     # rewrite the committed test fixture
 *
 * The analysis is `src/dev/mocap/report.ts`; this script only reads files.
 * Bundled with esbuild into the same overridable cache the test runner uses,
 * for the reason `replay-fixture.mjs` gives.
 */
import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = path.join(root, 'bench-data', 'bath-serve')
const FIXTURE = path.join(root, 'src', 'lib', 'analysis', '__tests__', 'fixtures', 'bath-serves.json')

/**
 * The serves the test suite carries: two of each outcome, chosen for spread
 * rather than for looking good — the shallowest knee bend in the set (1) and
 * the deepest (57), the lowest contact (6) and the highest (39).
 */
const FIXTURE_SERVES = [1, 6, 39, 57, 63, 112]

if (!fs.existsSync(DATA)) {
  console.error('No Bath serve data. Run `npm run setup:bench` first.')
  process.exit(2)
}

const cache = process.env.SERVE_COACH_TEST_CACHE
  ? path.resolve(process.env.SERVE_COACH_TEST_CACHE)
  : path.join(root, 'node_modules', '.cache')
fs.mkdirSync(cache, { recursive: true })
const bundle = path.join(cache, 'serve-coach-mocap.mjs')
await build({
  entryPoints: [path.join(root, 'src', 'dev', 'mocap', 'index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: bundle,
  logLevel: 'warning',
})
const mocap = await import(pathToFileURL(bundle).href)

const shared = [...fs.readFileSync(path.join(DATA, 'sharedStrings.xml'), 'utf8').matchAll(/<si>(.*?)<\/si>/gs)].map((m) =>
  m[1].replace(/<[^>]+>/g, ''),
)
const outcomes = mocap.parseOutcomes(fs.readFileSync(path.join(DATA, 'sheet1.xml'), 'utf8'), shared)

const serves = fs
  .readdirSync(DATA)
  .filter((f) => f.endsWith('.mat'))
  .map((f) => Number(/(\d+)\.mat$/.exec(f)[1]))
  .sort((a, b) => a - b)
  .map((n) => {
    const [array] = mocap.readMat(fs.readFileSync(path.join(DATA, `4D_${n}.mat`)), (b) => zlib.inflateSync(b))
    return mocap.bathServe(array.data, { id: `bath-${n}`, outcome: outcomes.get(n) })
  })

if (process.argv.includes('--fixture')) {
  const chosen = FIXTURE_SERVES.map((n) => serves.find((s) => s.id === `bath-${n}`))
  const fixture = {
    source: mocap.BATH_ATTRIBUTION,
    serves: chosen.map((s) => mocap.packMocap(s, (b) => Buffer.from(b).toString('base64'))),
  }
  fs.writeFileSync(FIXTURE, JSON.stringify(fixture, null, 1) + '\n')
  console.log(`Wrote ${chosen.length} serves to ${path.relative(root, FIXTURE)} (${(fs.statSync(FIXTURE).size / 1024).toFixed(0)} kB)`)
  process.exit(0)
}

const quick = process.argv.includes('--quick')
const complete = serves.filter(mocap.swingCompleted)
const tally = (o) => complete.filter((s) => s.outcome === o).length
console.log(
  `Bath serve set: ${serves.length} serves, ${complete.length} with a finished swing ` +
    `(${tally('in')} in, ${tally('out')} out, ${tally('net')} net). One right-handed player.`,
)
const rows = mocap.benchMocap(serves, quick ? mocap.PLACEMENTS.slice(0, 1) : mocap.PLACEMENTS, quick ? [30] : mocap.RATES)
console.log(mocap.formatBench(rows))
