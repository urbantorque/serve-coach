/**
 * Every suite's tally covers its own file.
 *
 * THE DEFECT THIS EXISTS FOR, WHICH WAS REAL AND WAS FOUND BY ACCIDENT.
 * `report()` prints the pass/fail count and calls `process.exit(1)` **only when
 * it has failures to print**. A check that fails *after* the tally therefore
 * prints its red cross into a file that still exits 0. The runner reports the
 * file as passing. Nothing anywhere says otherwise.
 *
 * `copy.test.ts` was in that state: the tally sat two thirds of the way up and
 * eight checks below it were decorative, including every check that the flaw
 * table, the drill table and the copy table agree with one another. `LOOP.md`
 * names that file as one of three critics this repo keeps in executable form.
 * Proved rather than reasoned about — a deliberate `assert(false)` in the dead
 * zone printed one cross and the file exited 0.
 *
 * THREE NEAR-MISSES IN THE FIFTEEN ROUNDS SINCE, none caught by a gate:
 * `axes.test.ts` lost its `report()` entirely to an edit and was saved only by
 * `tsc` flagging a now-unused import; `robustness.test.ts` had a second tally
 * inserted above its checks by a careless `sed`; and this file's own sibling
 * nearly repeated it. The hazard is not that anybody misunderstands the rule —
 * it is that `report()` is one line in a thousand-line file and every editing
 * tool treats it as ordinary text.
 *
 * IT FOUND A FOURTH ON ITS FIRST RUN, and that one predates this session:
 * `triage.test.ts` tallied at line 677 with a helpers section below it. Nothing
 * was broken — an interface is erased and four function declarations are hoisted
 * — so this was a true positive against the rule and a false one against the
 * defect. The tally moved to the end anyway, and the rule stays the strict one
 * rather than the precise one ("no `check(` after the tally") on purpose: a
 * helpers section under a tally is exactly the shape that invites somebody to
 * append a check into a dead zone, and "nothing goes after `report()`" is a rule
 * a person can follow without thinking about hoisting.
 *
 * WHY A SOURCE SCAN RATHER THAN A HARNESS CHANGE. Making `report()` idempotent,
 * or having it register an exit hook, would fix the symptom in a way nothing
 * could see: a file with a stray mid-file tally would go green and stay wrong.
 * The position **is** the invariant, so the position is what is checked. Text
 * over source, not parsed, for the reason `egress.test.ts` gives — and the same
 * obligation follows: the scan's own findings are checked against what it found
 * rather than assumed correct.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
// @ts-expect-error - node's path, same
import pathUntyped from 'path'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as {
  readdirSync: (p: string, o: unknown) => { name: string; isDirectory(): boolean }[]
  readFileSync: (p: string, e: 'utf8') => string
}
const path = pathUntyped as { join: (...p: string[]) => string; relative: (a: string, b: string) => string }
declare const process: { cwd(): string }

const ROOT = process.cwd()

/** Every test file the runner will execute, found the way the runner finds them. */
function suites(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) suites(full, out)
    else if (e.name.endsWith('.test.ts') || e.name.endsWith('.test.tsx')) out.push(full)
  }
  return out
}

/**
 * Where a file calls `report()` at the top level, by line.
 *
 * Anchored to the start of a line so a `report()` inside a callback, a comment
 * mentioning it, or the harness's own definition cannot be mistaken for a tally.
 * `harness.ts` is not a `.test.ts` and is never scanned.
 */
function tallyLines(source: string): number[] {
  const lines = source.split('\n')
  const at: number[] = []
  lines.forEach((l, i) => {
    if (/^report\(\)\s*$/.test(l)) at.push(i)
  })
  return at
}

/** The last line that could execute anything — comments and blanks do not count. */
function lastCodeLine(source: string): number {
  const lines = source.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim()
    if (!t) continue
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t === '*/') continue
    return i
  }
  return -1
}

heading('Every suite tallies its whole self')

const SUITES = suites(path.join(ROOT, 'src'))
note(`${SUITES.length} suites scanned`)

check('the scan found the suites, so the checks below mean something', () => {
  // A walk that matched nothing would pass every check here while proving
  // nothing — the same opening `egress.test.ts` and the component scanner make.
  assert(SUITES.length > 20, `only ${SUITES.length} suites found — has the walk broken?`)
})

check('every suite calls report() exactly once', () => {
  /*
   * Twice is the `sed` accident: a block inserted after an existing tally leaves
   * the first one mid-file, and everything below it stops counting. Never is the
   * edit-ate-it accident, and it is worse — a file that never tallies prints its
   * ticks and exits 0 whatever happened.
   */
  const wrong = SUITES.map((f) => ({ f, n: tallyLines(fs.readFileSync(f, 'utf8')).length })).filter(
    (s) => s.n !== 1,
  )
  assert(
    wrong.length === 0,
    `${wrong.length} suite(s) don’t tally exactly once:\n` +
      wrong
        .map((s) => `      ${path.relative(ROOT, s.f)} — ${s.n === 0 ? 'never calls report()' : `calls it ${s.n} times`}`)
        .join('\n'),
  )
})

check('nothing executes after the tally', () => {
  /*
   * THE CHECK THE DEFECT WAS. `report()` exits non-zero only when it has
   * failures to print, so a check below it prints its cross into a file that
   * still exits 0 — green suite, failing check, nothing says so.
   *
   * Compared against the last line that could execute rather than the last line
   * of the file, so a closing comment after the tally is fine and a check is
   * not. That distinction is the whole reason this reads lines instead of
   * looking at the tail.
   */
  const late = SUITES.map((f) => {
    const src = fs.readFileSync(f, 'utf8')
    const [tally] = tallyLines(src)
    return { f, tally, last: lastCodeLine(src) }
  }).filter((s) => s.tally !== undefined && s.tally < s.last)

  assert(
    late.length === 0,
    `${late.length} suite(s) have code after their tally, which can’t fail the run:\n` +
      late
        .map((s) => `      ${path.relative(ROOT, s.f)} — report() at line ${s.tally + 1}, code at ${s.last + 1}`)
        .join('\n'),
  )
})

check('this scan can actually see the thing it is looking for', () => {
  /*
   * The teeth, checked here rather than by hand. `egress.test.ts` makes the same
   * move for the same reason: a scan whose pattern silently stopped matching
   * would report every file clean and would be indistinguishable from a repo
   * with nothing wrong in it.
   *
   * Run against strings rather than against a file on disk, so proving the
   * pattern works costs nothing and leaves nothing behind.
   */
  assert(tallyLines('report()\n').length === 1, 'a bare tally wasn’t seen')
  assert(tallyLines('report()\nreport()\n').length === 2, 'two tallies were seen as one')
  assert(tallyLines('  report()\n').length === 0, 'an indented call was read as a top-level tally')
  assert(tallyLines('// report()\n').length === 0, 'a commented-out call was read as a tally')
  assert(tallyLines('await report()\n').length === 0, 'an awaited call was read as a bare tally')

  const dead = "check('x', () => {})\nreport()\ncheck('y', () => {})\n"
  const [t] = tallyLines(dead)
  assert(t < lastCodeLine(dead), 'a check after the tally wasn’t seen as late')

  const fine = 'report()\n\n/* a closing comment */\n'
  const [t2] = tallyLines(fine)
  assert(t2 >= lastCodeLine(fine), 'a comment after the tally was read as executable')
})

report()
