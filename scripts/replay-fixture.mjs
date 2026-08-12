/**
 * Re-run the engine over one fixture JSON and print a field-by-field diff.
 *
 *   node scripts/replay-fixture.mjs src/lib/analysis/__tests__/fixtures/clip.fixture.json
 *
 * This is the tool that makes hand-labelling practical. Labelling a clip is a
 * loop — scrub, write a time, check it — and without this the only way round
 * that loop is to add the file to `index.ts`, run the whole suite, and read a
 * pass/fail. That is a minute per correction and it tells you the fixture
 * failed, not that contact is 40 ms early and everything else is inside half its
 * allowance. It also means a half-labelled file has to be committed to the
 * suite's own import list to be looked at, which is exactly how an unlabelled
 * draft ends up in RECORDED.
 *
 * Every number printed comes from `validateFixture` in
 * `src/lib/analysis/groundTruth.ts`. Nothing here re-implements a comparison or
 * a tolerance: a replay that agreed with a fixture the suite rejects would be
 * worse than no tool at all.
 *
 * Exits non-zero when the fixture would fail the suite, so it can be used as a
 * pre-commit check on a fixture that is not in `index.ts` yet.
 */
import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2).filter((a) => a !== '--json')
const asJson = process.argv.includes('--json')

if (args.length !== 1) {
  console.error(
    'usage: node scripts/replay-fixture.mjs <fixture.json> [--json]\n' +
      '\n' +
      '  Runs the analysis engine over one fixture and diffs what it produced\n' +
      "  against the fixture's `expect` block, field by field.\n" +
      '  --json  machine-readable FixtureResult on stdout, for scripting.',
  )
  process.exit(2)
}

const fixturePath = path.resolve(args[0])
if (!fs.existsSync(fixturePath)) {
  console.error(`No such fixture: ${fixturePath}`)
  process.exit(2)
}

let fixture
try {
  fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
} catch (err) {
  // Worth its own exit path: a fixture is hand-edited JSON, and a trailing
  // comma after deleting a metric is the single commonest thing to go wrong.
  console.error(`${path.basename(fixturePath)} is not valid JSON:\n  ${err.message}`)
  process.exit(2)
}

/**
 * The engine is TypeScript; Node is not. Bundle it the same way the test runner
 * does, into the same overridable cache directory and for the same reason —
 * the path is shared state, and two agents or two terminals writing one file
 * while the other reads it produces an intermittent failure that vanishes on a
 * re-run. See scripts/run-tests.mjs.
 */
const cache = process.env.SERVE_COACH_TEST_CACHE
  ? path.resolve(process.env.SERVE_COACH_TEST_CACHE)
  : path.join(root, 'node_modules', '.cache')
fs.mkdirSync(cache, { recursive: true })

const bundle = path.join(cache, 'serve-coach-groundTruth.mjs')

await build({
  entryPoints: [path.join(root, 'src', 'lib', 'analysis', 'groundTruth.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: bundle,
  logLevel: 'warning',
})

const { validateFixture } = await import(pathToFileURL(bundle).href)

const result = validateFixture(fixture)

if (asJson) {
  console.log(JSON.stringify(result, null, 2))
  process.exit(result.passed ? 0 : 1)
}

/* ------------------------------------------------------------------ report */

const dim = (s) => `\x1b[2m${s}\x1b[0m`
const bold = (s) => `\x1b[1m${s}\x1b[0m`
const red = (s) => `\x1b[31m${s}\x1b[0m`
const green = (s) => `\x1b[32m${s}\x1b[0m`
const yellow = (s) => `\x1b[33m${s}\x1b[0m`

console.log(`\n${bold(fixture.id ?? path.basename(fixturePath))} ${dim(fixture.label ?? '')}`)
console.log(dim(`  ${fixture.frames?.count ?? '?'} frames at ${fixture.fps ?? '?'} fps`))

if (result.schema.length) {
  console.log(`\n${bold('Schema')}`)
  for (const s of result.schema) {
    console.log(`  ${red('✗')} ${s.where || '(fixture)'} ${dim('—')} ${s.problem}`)
  }
}

// Only when the engine itself refused the clip. A structurally broken file also
// sets `error`, but it sets it to the fatal schema faults already printed above,
// and repeating them under a heading saying "Engine" invites the reader to go
// looking for an engine bug that is really a bad file.
if (result.error && !result.schema.some((s) => s.fatal)) {
  // The engine refused a clip the fixture says is a serve. That is a real
  // finding and the reason to record the clip in the first place.
  console.log(`\n${bold('Engine')}\n  ${red(result.error)}`)
}

if (result.checks.length) {
  console.log(`\n${bold('Comparisons')} ${dim('(expected = your label, actual = what the engine produced)')}`)

  // Column widths from the data, so the arrows line up whatever the metric ids
  // are. A ragged table is where an eye slides past the one row that is out.
  const w = (pick) => Math.max(...result.checks.map((c) => String(pick(c)).length))
  const wWhat = w((c) => c.what)
  const wExp = w((c) => c.expected)
  const wAct = w((c) => c.actual)

  for (const c of result.checks) {
    const mark = c.ok ? green('✓') : red('✗')
    const what = String(c.what).padEnd(wWhat)
    const exp = String(c.expected).padStart(wExp)
    const act = String(c.actual).padStart(wAct)
    let margin = ''
    if (c.error !== undefined && c.tolerance !== undefined) {
      // The headroom, not just the error. A fixture sitting at 95% of every
      // allowance is one that goes red on a change that broke nothing, and that
      // is invisible from a column of ticks.
      const used = Math.round((Math.abs(c.error) / c.tolerance) * 100)
      const text = `${c.error >= 0 ? '+' : ''}${c.error.toFixed(3)} of ±${c.tolerance} (${used}%)`
      margin = used > 75 && c.ok ? yellow(text) : dim(text)
    }
    console.log(`  ${mark} ${what}  ${exp} ${dim('→')} ${act}  ${margin}`.trimEnd())
  }
} else if (!result.error) {
  console.log(`\n  ${yellow('No comparisons were made — this fixture cannot fail.')}`)
}

/**
 * Three outcomes, said as three different things.
 *
 * The one worth separating is a schema-invalid file whose every comparison
 * passed — an unlabelled export does exactly that, because its `expect` block is
 * the engine's own output. Calling that "disagrees with the engine" would be
 * false, and a labeller who read it would go hunting a disagreement that is not
 * there instead of doing the labelling.
 */
if (result.schema.length) {
  const agreed = result.checks.length > 0 && result.checks.every((c) => c.ok)
  console.log(
    `\n${red('Not a valid fixture yet.')} ${dim(
      agreed
        ? 'Everything above agrees because these are still the engine\'s own answers. See __tests__/fixtures/README.md.'
        : 'Fix the schema faults above. See __tests__/fixtures/README.md.',
    )}\n`,
  )
} else if (result.passed) {
  console.log(`\n${green('Fixture agrees with the engine.')}\n`)
} else {
  console.log(
    `\n${red('Fixture disagrees with the engine.')} ${dim(
      'A disagreement is a finding, not a bug to tune away: check the label first, then the engine.',
    )}\n`,
  )
}

process.exit(result.passed ? 0 : 1)
