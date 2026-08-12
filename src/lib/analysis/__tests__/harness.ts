/**
 * The three-function test harness the engine tests run on.
 *
 * Shared so that a second suite does not have to reimplement the reporting and
 * exit code — the runner treats a non-zero exit as a failed file, and two files
 * disagreeing about what that means is the kind of thing that quietly stops a
 * suite from ever failing.
 */

// Declared rather than pulling in @types/node for one call.
declare const process: { exit(code: number): never }

let passed = 0
const failures: string[] = []

export function check(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`  \x1b[32m✓\x1b[0m ${name}`)
  } catch (err) {
    failures.push(`${name}\n      ${(err as Error).message}`)
    console.log(`  \x1b[31m✗\x1b[0m ${name}\n      \x1b[31m${(err as Error).message}\x1b[0m`)
  }
}

/**
 * Fail without having a function to run.
 *
 * For conditions decided before any test executes — a fixture that will not
 * parse, a coverage gate — where `check(name, () => assert(false, …))` is a
 * throw wrapped in a closure to satisfy the shape. Routed through the same
 * tally so it reaches the same non-zero exit; a gate that printed its own red
 * text and let the process exit 0 is exactly the kind of thing that quietly
 * stops a suite from ever failing.
 */
export function fail(name: string, msg: string) {
  failures.push(`${name}\n      ${msg}`)
  console.log(`  \x1b[31m✗\x1b[0m ${name}\n      \x1b[31m${msg}\x1b[0m`)
}

/**
 * Say something is wrong without failing.
 *
 * Reserved for the state where the repo is already honest about the gap — see
 * `fixtureGate` — so the suite has nothing to catch, only something to say.
 * Yellow rather than red, and it never touches the exit code.
 */
export function warn(lines: string[]) {
  for (const [i, line] of lines.entries()) {
    console.log(i === 0 ? `\n  \x1b[33m⚠ ${line}\x1b[0m` : `  \x1b[2m${line}\x1b[0m`)
  }
}

export function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

export function near(actual: number, expected: number, tol: number, what: string) {
  assert(
    Math.abs(actual - expected) <= tol,
    `${what}: expected ~${expected} (±${tol}), got ${actual.toFixed(2)}`,
  )
}

export function within(actual: number, lo: number, hi: number, what: string) {
  assert(actual >= lo && actual <= hi, `${what}: expected ${lo}–${hi}, got ${actual.toFixed(2)}`)
}

export function heading(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`)
}

export function note(line: string) {
  console.log(`  \x1b[2m${line}\x1b[0m`)
}

/** Print the tally and exit non-zero if anything failed. Call once, at the end. */
export function report() {
  console.log(
    `\n${failures.length ? '\x1b[31m' : '\x1b[32m'}${passed} passed, ${failures.length} failed\x1b[0m\n`,
  )
  if (failures.length) {
    console.log('\x1b[31mFailures:\x1b[0m')
    for (const f of failures) console.log(`  · ${f}`)
    process.exit(1)
  }
}
