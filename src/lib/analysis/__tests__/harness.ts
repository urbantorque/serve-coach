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

/**
 * Checks that have started and not finished — see `check` and `report`.
 *
 * A count rather than a list of promises, because nothing waits on them: the
 * point is only to know whether `report()` is being asked to print a tally that
 * is not final yet.
 */
let outstanding = 0

const pass = (name: string) => {
  passed++
  console.log(`  \x1b[32m✓\x1b[0m ${name}`)
}

const failed = (name: string, err: unknown) => {
  const message = (err as Error)?.message ?? String(err)
  failures.push(`${name}\n      ${message}`)
  console.log(`  \x1b[31m✗\x1b[0m ${name}\n      \x1b[31m${message}\x1b[0m`)
}

/**
 * One check, run now.
 *
 * ASYNC CALLBACKS ARE SUPPORTED AND MUST BE AWAITED, and until now neither half
 * of that was true. A failing assertion inside an `async` callback never reached
 * the `catch` here: it surfaced as an unhandled rejection, which kills the
 * process mid-file. The check was never tallied, every check after it in that
 * file never ran, and the output blamed whatever line the stack pointed at. The
 * suite exits non-zero either way, which is exactly why it went unnoticed for so
 * long — from CI a broken file and a failing check look identical, and to
 * whoever has to fix it they look nothing alike.
 *
 * Twenty checks across `backup.test.ts` and `useShareState.test.ts` were sitting
 * on that, all passing, none of them able to report a failure.
 *
 * So a returned promise is now handled: the tally waits for it, and the call
 * site is expected to `await check(...)`. Forgetting that is not silent either —
 * `report()` fails the run if anything is still outstanding when it prints,
 * because a tally that omits a check is the same lie in a quieter form.
 */
export function check(name: string, fn: () => void | Promise<void>): void | Promise<void> {
  let returned: unknown
  try {
    returned = fn()
  } catch (err) {
    failed(name, err)
    return
  }
  if (returned && typeof (returned as PromiseLike<unknown>).then === 'function') {
    outstanding++
    return (returned as Promise<void>).then(
      () => {
        outstanding--
        pass(name)
      },
      (err) => {
        outstanding--
        failed(name, err)
      },
    )
  }
  pass(name)
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
  // A tally printed while a check is still running is not a tally. Loud rather
  // than awaited, because the fix is one keyword at the call site and silently
  // waiting here would let a file's checks finish in an order nobody wrote.
  if (outstanding > 0) {
    failed(
      'the tally was printed before every check had finished',
      new Error(
        `${outstanding} async check${outstanding === 1 ? '' : 's'} still running — ` +
          'an async check must be awaited: `await check(...)`.',
      ),
    )
  }
  console.log(
    `\n${failures.length ? '\x1b[31m' : '\x1b[32m'}${passed} passed, ${failures.length} failed\x1b[0m\n`,
  )
  if (failures.length) {
    console.log('\x1b[31mFailures:\x1b[0m')
    for (const f of failures) console.log(`  · ${f}`)
    process.exit(1)
  }
}
