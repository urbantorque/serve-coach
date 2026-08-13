/**
 * Re-run the engine over fixture JSON and print a field-by-field diff.
 *
 *   node scripts/replay-fixture.mjs src/lib/analysis/__tests__/fixtures/clip.fixture.json
 *   node scripts/replay-fixture.mjs src/lib/analysis/__tests__/fixtures/*.fixture.json
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
 * Given more than one file it also prints what one file cannot show. A single
 * clip says whether the engine agreed with one label; a band is a claim about
 * players, and no amount of staring at one diff settles one. The summary is
 * per measurement across every clip given: how many labels exist, where the
 * engine sat against them, and how much of the allowance the worst clip used.
 * That is the shape of the evidence `tiers.ts` is waiting for, and printing it
 * is as far as this tool goes — it reports a spread and never proposes a band.
 *
 * Every number printed comes from `validateFixture` in
 * `src/lib/analysis/groundTruth.ts`. Nothing here re-implements a comparison or
 * a tolerance: a replay that agreed with a fixture the suite rejects would be
 * worse than no tool at all.
 *
 * Exits non-zero when any fixture would fail the suite, so it can be used as a
 * pre-commit check on files that are not in `index.ts` yet.
 */
import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2).filter((a) => a !== '--json')
const asJson = process.argv.includes('--json')

if (args.length === 0) {
  console.error(
    'usage: node scripts/replay-fixture.mjs <fixture.json>... [--json]\n' +
      '\n' +
      '  Runs the analysis engine over each fixture and diffs what it produced\n' +
      "  against that fixture's `expect` block, field by field.\n" +
      '  Given several, also prints the spread per measurement across all of them.\n' +
      '  --json  machine-readable FixtureResult per file on stdout, for scripting.',
  )
  process.exit(2)
}

const fixtures = []
for (const arg of args) {
  const fixturePath = path.resolve(arg)
  if (!fs.existsSync(fixturePath)) {
    console.error(`No such fixture: ${fixturePath}`)
    process.exit(2)
  }
  try {
    fixtures.push({ path: fixturePath, fixture: JSON.parse(fs.readFileSync(fixturePath, 'utf8')) })
  } catch (err) {
    // Worth its own exit path: a fixture is hand-edited JSON, and a trailing
    // comma after deleting a metric is the single commonest thing to go wrong.
    console.error(`${path.basename(fixturePath)} is not valid JSON:\n  ${err.message}`)
    process.exit(2)
  }
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

const results = fixtures.map(({ path: p, fixture }) => ({
  path: p,
  fixture,
  result: validateFixture(fixture),
}))

if (asJson) {
  // One file keeps returning a bare FixtureResult, because everything already
  // scripted against this reads `.passed` off the top level.
  console.log(JSON.stringify(results.length === 1 ? results[0].result : results.map((r) => r.result), null, 2))
  process.exit(results.every((r) => r.result.passed) ? 0 : 1)
}

/* ------------------------------------------------------------------ report */

const dim = (s) => `\x1b[2m${s}\x1b[0m`
const bold = (s) => `\x1b[1m${s}\x1b[0m`
const red = (s) => `\x1b[31m${s}\x1b[0m`
const green = (s) => `\x1b[32m${s}\x1b[0m`
const yellow = (s) => `\x1b[33m${s}\x1b[0m`

for (const { path: fixturePath, fixture, result } of results) {
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
}

/* ------------------------------------------------------- across the clips */

/**
 * What one clip cannot show.
 *
 * A single diff answers "did the engine agree with this label". The questions
 * the fixture folder exists to answer are all plural — is the allowance on
 * contact height right, does the trophy land late on everybody or only on this
 * player, is a signal steady enough to grade at all — and each of them is a
 * distribution rather than a comparison.
 *
 * So: one row per measurement, over every clip that labelled it. `n` is the
 * thing to read first. Two clips is an anecdote with an average, and a row
 * saying `n=2` next to a tidy median is the single easiest way to talk yourself
 * into a band; the count is printed first so it is read before the numbers it
 * qualifies.
 *
 * Deliberately not a verdict. It prints where the engine sat and how much of the
 * allowance the worst clip needed, and stops there. A tool that proposed a band
 * from six clips would be inventing exactly the number `UNCALIBRATED` in
 * `tiers.ts` refuses to invent, and it would arrive wearing the authority of
 * having been computed.
 */
if (results.length > 1) {
  const byWhat = new Map()
  for (const { fixture, result } of results) {
    for (const c of result.checks) {
      if (c.error === undefined || c.tolerance === undefined) continue
      if (!byWhat.has(c.what)) byWhat.set(c.what, [])
      byWhat.get(c.what).push({ ...c, id: fixture.id })
    }
  }

  if (byWhat.size) {
    const median = (xs) => {
      const s = [...xs].sort((a, b) => a - b)
      const mid = s.length >> 1
      return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
    }
    const f3 = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(3)}`

    console.log(`${bold(`Across ${results.length} clips`)} ${dim('(engine minus label, in the measurement\'s own unit)')}`)

    const rows = [...byWhat.entries()].map(([what, cs]) => {
      const errors = cs.map((c) => c.error)
      const worst = cs.reduce((a, b) => (Math.abs(b.error) > Math.abs(a.error) ? b : a))
      const used = Math.round((Math.abs(worst.error) / worst.tolerance) * 100)
      return {
        what,
        n: cs.length,
        span: `${f3(Math.min(...errors))} … ${f3(Math.max(...errors))}`,
        mid: f3(median(errors)),
        worst: `${used}% of ±${worst.tolerance} on ${worst.id}`,
        failed: cs.filter((c) => !c.ok).length,
        used,
      }
    })

    const w = (pick) => Math.max(...rows.map((r) => String(pick(r)).length))
    const wWhat = w((r) => r.what)
    const wSpan = w((r) => r.span)
    const wMid = w((r) => r.mid)

    for (const r of rows) {
      const mark = r.failed ? red('✗') : r.used > 75 ? yellow('!') : green('✓')
      const line =
        `  ${mark} ${String(r.what).padEnd(wWhat)}  ${dim(`n=${r.n}`)}  ` +
        `${r.span.padStart(wSpan)}  ${dim('median')} ${r.mid.padStart(wMid)}  ${dim(r.worst)}`
      console.log(line)
    }

    const thin = rows.filter((r) => r.n < 3)
    if (thin.length) {
      console.log(
        dim(
          `\n  ${thin.length} of ${rows.length} rows rest on fewer than three labelled clips. ` +
            'A spread over two is two numbers.',
        ),
      )
    }
    console.log()
  }
}

process.exit(results.every((r) => r.result.passed) ? 0 : 1)
