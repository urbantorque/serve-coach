/**
 * Run the engine over real serves filmed by virtual phones, and print what it
 * got right and wrong.
 *
 *   npm run setup:bench          # once: fetches the Bath serve set
 *   npm run bench:mocap          # every placement, 30 / 60 / 120 fps
 *   npm run bench:mocap -- --quick       # the guide's placement at 30 fps only
 *   npm run bench:mocap -- --fixture     # rewrite the committed test fixture
 *   npm run bench:mocap -- --chain       # the chain against 180 Hz truth, slow
 *   npm run bench:mocap -- --chain --place 0 --takes 8   # one placement of it
 *   npm run bench:mocap -- --serve-cues  # what could tell a first from a second
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

/** The number after a flag, or the fallback. */
const flag = (name, fallback) => {
  const at = process.argv.indexOf(name)
  return at < 0 ? fallback : Number(process.argv[at + 1])
}

if (process.argv.includes('--chain')) {
  // One placement at a time, by its index in `PLACEMENTS`, so the slow table
  // can be run in parallel; all of them in turn without `--place`.
  const only = flag('--place', -1)
  const takes = flag('--takes', 8)
  const places = only >= 0 ? [mocap.PLACEMENTS[only]] : mocap.PLACEMENTS
  console.log('Truth at 180 Hz, ms, first event to second:')
  for (const row of mocap.truthTable(serves)) {
    console.log(`  ${row.gap.padEnd(18)} ${row.mean.toFixed(0).padStart(5)} ± ${row.sd.toFixed(0).padStart(2)}  [${row.lo.toFixed(0)}, ${row.hi.toFixed(0)}]`)
  }
  for (const [method, name] of Object.entries(mocap.METHOD_NAMES)) console.log(`  ${method}: ${name}`)
  console.log('\nThe gap against how far the hips rose, rig, 30 fps, MediaPipe noise:\n' + mocap.formatRise(mocap.riseSweep()))
  for (const place of places) {
    console.log(mocap.formatChain(mocap.benchChain(serves, place, takes, (line) => console.error(line))))
    console.log('\n' + mocap.formatCalls(mocap.benchCalls(serves, place, [0, 0.05, 0.1, 0.13, 0.16, 0.2], Math.max(2, takes - 2))))
  }
  process.exit(0)
}

if (process.argv.includes('--serve-cues')) {
  const takes = flag('--takes', 6)
  const side = mocap.measureCues(serves, mocap.SIDE_PLACEMENT, takes)
  const behind = mocap.measureCues(serves, mocap.BEHIND_PLACEMENT, takes)
  const sideSpreads = mocap.cueSpreads(side)
  const behindSpreads = mocap.cueSpreads(behind)
  console.log('From the guide, 30 fps on the 32 Hz read, MediaPipe noise:\n' + mocap.formatCues(sideSpreads))
  console.log('\nFrom the back fence:\n' + mocap.formatCues(behindSpreads))
  console.log('\nA guess from one reading on the player own tags, by how much slower the second serves ran:')
  const cues = ['handPeak', 'elbowPeak', 'handLast120', 'dropToContact', 'motion', 'tossToContact']
  console.log(mocap.formatOwnTags(cues.flatMap((cue) => [6, 12].map((n) => mocap.ownTagGuess(side, cue, n)))))
  console.log('\nFlat against kick on published gaps:')
  console.log(mocap.formatTypes(mocap.typeTable([...sideSpreads, ...behindSpreads.filter((s) => s.cue === 'tossAcross')])))
  console.log('\nThe rig with those moves dialled in, 30 fps:\n' + mocap.formatRig(mocap.rigResponse()))
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
