/**
 * The handover, held to what is actually on disk.
 *
 * WHY THIS FILE EXISTS. `PROGRESS.md` ends with a section called "Resuming this
 * loop" — the thing a cold session reads first to find out where the work is.
 * Round 75 found it **36 rounds stale**: it named the next round as 39, the last
 * tag as `loop-green-8`, and the check count as 1152, against a real 76,
 * `loop-green-14` and 1221.
 *
 * That is the defect this session found four other times, in four other places:
 * a 315 ms figure nobody could reproduce, a landing floor 29% out, a tempo
 * confound measured at the wrong smoothing radius, and a register deviation 47%
 * off. **A recorded statement that quietly stopped being true.** The handover is
 * the worst place for it, because it is read by somebody with no context at all
 * — they cannot spot that it is wrong, which is the whole reason they are
 * reading it.
 *
 * So the two facts a resuming session acts on are checked: the tag it should
 * compare against, and the size of the suite it should expect green. Both are
 * read from the file and compared to the world.
 *
 * WHAT IT DOES NOT CHECK. The prose. Whether the next-round pointer is right,
 * whether the standing hazards are still hazards, whether the open items listed
 * are the open ones — none of that is mechanically decidable, and a gate that
 * implied it read the whole handover would be worse than one that reads two
 * lines. Those two lines are the ones a stale value actively misleads on.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
// @ts-expect-error - node's path, same
import pathUntyped from 'path'
// @ts-expect-error - node's child_process, for the one fact only git holds
import cpUntyped from 'child_process'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as { readFileSync: (p: string, e: 'utf8') => string; readdirSync: (p: string, o: unknown) => { name: string; isDirectory(): boolean }[] }
const path = pathUntyped as { join: (...p: string[]) => string }
const cp = cpUntyped as { execSync: (c: string, o: unknown) => string }
declare const process: { cwd(): string }

const root = process.cwd()
const progress = fs.readFileSync(path.join(root, 'PROGRESS.md'), 'utf8')
const handover = progress.slice(progress.lastIndexOf('## Resuming this loop'))

heading('The handover a cold session reads first')

assert(handover.length > 500, 'PROGRESS.md has no "Resuming this loop" section to check')

check('the tag it tells you to compare against is the newest one', () => {
  const claimed = /`(loop-green-\d+)`/.exec(handover)?.[1]
  assert(claimed !== undefined, 'the handover names no tag to compare against')

  /*
   * Sorted numerically rather than lexically, because `loop-green-14` sorts
   * before `loop-green-8` as a string — and the failure would be a handover
   * that looks checked while pointing six gates back.
   */
  const tags = cp
    .execSync('git tag --list "loop-green-*"', { cwd: root, encoding: 'utf8' })
    .split('\n')
    .map((t: string) => t.trim())
    .filter(Boolean)
  assert(tags.length > 0, 'no loop-green tags exist, so this check proves nothing')
  const newest = tags.reduce((a: string, b: string) =>
    Number(b.split('-').pop()) > Number(a.split('-').pop()) ? b : a,
  )
  note(`handover says ${claimed}, newest is ${newest} of ${tags.length}`)
  assert(
    claimed === newest,
    `the handover points at ${claimed} and the newest tag is ${newest} — a resuming session ` +
      'would number-diff against the wrong baseline and read the difference as drift',
  )
})

check('the check count it promises is the count the suite has', () => {
  /*
   * Counted the same way the gate counts it — one `✓` per passing check — rather
   * than by a second mechanism that could agree with neither. The number matters
   * because it is what a resuming session compares its first run against: too
   * low and they think they broke something, too high and they think a suite
   * silently stopped running, which this repo has actually shipped.
   */
  const claimed = /\*\*(\d[\d,]*) checks\*\*/.exec(handover)?.[1]?.replace(/,/g, '')
  assert(claimed !== undefined, 'the handover promises no check count')

  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full, out)
      else if (e.name.endsWith('.test.ts')) out.push(full)
    }
    return out
  }
  const files = walk(path.join(root, 'src'))
  let checks = 0
  for (const f of files) {
    const body = fs
      .readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ')
    checks += (body.match(/(?:^|\s)(?:await )?check\(/g) ?? []).length
  }
  note(`handover promises ${claimed}, ${files.length} suites declare ${checks}`)
  assert(checks > 100, `only ${checks} check() calls found, so this scan is broken rather than strict`)

  /*
   * Within a few, not exact. A `check` inside a loop runs many times and this
   * counts the call site once — so the declared count is a floor on the run
   * count, and the handover carries the run count. The band is what makes this
   * a staleness check rather than a second, wrong tally: 36 rounds of drift was
   * 69 checks, and anything that far out is the thing being caught.
   */
  const drift = Math.abs(checks - Number(claimed)) / Number(claimed)
  assert(
    drift < 0.15,
    `the handover promises ${claimed} checks and the suites declare ${checks} — ${(drift * 100).toFixed(0)}% out. ` +
      'A resuming session compares its first run against this number.',
  )
})

report()
