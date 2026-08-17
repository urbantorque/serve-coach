/**
 * Props a screen declares and nothing ever passes.
 *
 * WHY THIS FILE EXISTS. Round 41 went to add a tap beside an existing one and
 * found the existing one had never rendered: `onTagServe` shipped with its
 * markup, its pressed state and its argument for using no new styling, and
 * nothing ever passed it a handler. Three rounds invisible, and the block is
 * gated on the prop — `{onTagServe && ...}` — so an absent handler is not a
 * crash or a warning. It is a screen quietly missing a feature.
 *
 * Caught by hand, at a consolidation, which is not a thing anybody keeps doing:
 * the same sentence `jsxCopy.test.ts` opens with, about the same kind of gap.
 *
 * WHY IT IS THIS NARROW, AND THE WIDER VERSION WAS TRIED FIRST. The obvious
 * gate is "any export with no shipping caller". Built, run, and it flags 116 of
 * 483 exports — because this codebase deliberately exports constants so a test
 * can name them rather than copy the number, an argument written out in
 * `FINE_FPS`, `MAX_FINE_FRAMES`, `KEEP_STILLS` and a dozen more. A gate needing
 * a 116-row allow list is a list nobody prunes, which is the failure
 * `jsxCopy.test.ts` had to grow a second check to survive at four rows.
 *
 * So it is scoped to the shape the defect actually had. A prop is a contract
 * between two files: one declares it, another passes it, and there is no reason
 * for the first without the second. That is judgeable. "Exported and unused" is
 * not, in a repo where being nameable by a test is a reason to export.
 *
 * TEXT-MATCHED, NOT PARSED, and the ruling list is checked against the scan
 * rather than assumed correct — `jsxCopy.test.ts`'s trade, for its reason.
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
const path = pathUntyped as { join: (...p: string[]) => string }
declare const process: { cwd(): string }

/** Every `.tsx` under `src`, `__tests__` excluded — `jsxCopy.test.ts`'s walker. */
function componentFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name !== '__tests__') componentFiles(full, out)
    } else if (e.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

/**
 * One `name?: type` line inside a `Props` block.
 *
 * Optional props only, and that is the whole point rather than a simplification.
 * A required prop that nobody passes is a compile error and `tsc` already owns
 * it — this gate exists precisely because an optional one is legal, silent, and
 * renders as a missing feature. `onTagServe` was optional.
 */
const PROP = /^ {2}(\w+)\?:/gm

/** A prop the scan flagged, with a verdict. */
interface Ruling {
  prop: string
  why: string
}

/**
 * Optional props declared and never passed, each with a reason.
 *
 * The rule for adding a row: name the caller that is coming, or wire it up. A
 * row with a vague reason is how a dead feature gets a permanent home — which
 * is what happened to `onTagServe` for three rounds without even a row.
 */
const RULINGS: readonly Ruling[] = []

heading('Props a screen declares and nothing passes')

const root = path.join(process.cwd(), 'src')
const files = componentFiles(root)
const bodies = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]))

/**
 * The same file with its comments blanked out.
 *
 * CANARIED INTO EXISTENCE. Unwiring `onTagServe` — the defect this whole file
 * was written for — left the gate green, because the comment beside the wiring
 * says the words "nothing ever passed `onTagServe`". A search that counts prose
 * about a prop as a use of it cannot catch a prop that is only ever talked
 * about, which is precisely what a dead feature looks like in a codebase that
 * documents its intentions this heavily.
 *
 * Blanked rather than deleted so nothing shifts: `{ '/* … *\/': same length of
 * spaces }`, which keeps this cheap and keeps a stray brace inside a comment
 * from being counted by `propsBlock` either.
 */
const blankComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))

const code = new Map(files.map((f) => [f, blankComments(bodies.get(f)!)]))

/**
 * The `interface Props { ... }` block of one file, or nothing.
 *
 * Brace-counted from the declaration rather than regex-matched to the closing
 * brace, because these blocks are full of doc comments containing braces —
 * and a naive match would stop at the first `}` inside a comment and read half
 * the props.
 */
function propsBlock(body: string): string | undefined {
  const at = body.search(/^interface Props \{/m)
  if (at < 0) return undefined
  let depth = 0
  for (let i = body.indexOf('{', at); i < body.length; i++) {
    if (body[i] === '{') depth++
    else if (body[i] === '}' && --depth === 0) return body.slice(at, i)
  }
  return undefined
}

const declared: { prop: string; file: string }[] = []
for (const f of files) {
  const block = propsBlock(bodies.get(f)!)
  if (!block) continue
  for (const m of block.matchAll(PROP)) declared.push({ prop: m[1], file: f })
}

/*
 * Passed by somebody, in any file but the one that declares it.
 *
 * NOT `name={`, WHICH WAS THE FIRST VERSION AND WAS WRONG. It flagged
 * `leftIsBetter`, which `ConsistencyPanel` passes as a bare boolean shorthand —
 * `leftIsBetter` on its own line, no `=` at all. A gate whose first finding is
 * its own regex is a gate that would have taught everyone to ignore it.
 *
 * So it is the bare name, with type positions excluded so a re-declaration
 * elsewhere does not count as a use. That over-matches on a comment mentioning
 * the name and on a different component's prop of the same name — both in the
 * safe direction: this misses a dead prop rather than accusing a live one. A
 * gate that cries wolf grows an allow list the length of the codebase, which is
 * exactly how the wider version of this file died.
 */
const isPassed = (prop: string, declaredIn: string) => {
  const re = new RegExp(`\\b${prop}\\b(?!\\s*\\??:)`)
  return files.some((f) => f !== declaredIn && re.test(code.get(f)!))
}

const orphaned = declared.filter((d) => !isPassed(d.prop, d.file))
note(`${declared.length} optional props across ${files.length} components, ${orphaned.length} never passed`)

check('every optional prop a component declares is passed by somebody', () => {
  const ruled = new Set(RULINGS.map((r) => r.prop))
  const unruled = orphaned.filter((o) => !ruled.has(o.prop))
  assert(
    unruled.length === 0,
    `declared and never passed: ${unruled
      .map((u) => `${u.prop} (${u.file.slice(root.length + 1)})`)
      .join(', ')}. Wire it up, delete it, or add a ruling naming the caller that is coming.`,
  )
})

check('no ruling has outlived the prop it ruled on', () => {
  // The half `jsxCopy.test.ts` had to grow: a list nobody prunes becomes a list
  // of props that are fine now, and the next real one is added beside them
  // without anybody noticing the difference.
  const live = new Set(orphaned.map((o) => o.prop))
  const stale = RULINGS.filter((r) => !live.has(r.prop))
  assert(stale.length === 0, `passed now, so these rulings should go: ${stale.map((r) => r.prop).join(', ')}`)
})

/* ------------------------------------------- share entry points (R76) */

/**
 * A `share*` function exists to be pressed. One with no caller is a card
 * nobody can produce.
 *
 * THE CLASS THIS FILE MISSED. Round 42 refused the wide "any unused export"
 * gate at 116 of 483 and narrowed to props, which was right — and this slipped
 * between the two. `shareTripCard` and `renderTripCard` were built in R58·2,
 * checked down to "a trip nobody swept draws no repeatability row", and no
 * control in the app could produce one. Twenty rounds invisible, and unlike the
 * two props before it this was a whole user-facing artifact.
 *
 * Judgeable for the same reason props are: this is a contract between two files.
 * A render function may reasonably be internal — `renderTripCard` is called by
 * `shareTripCard` — but a `share*` is the entry point itself, and there is no
 * reason for one that nothing invokes.
 */
const SHARE = /^export async function (share\w+)/gm

check('every share entry point has a control that presses it', () => {
  const lib = path.join(root, 'lib')
  const sources = (dir: string, out: string[] = []): string[] => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name !== '__tests__') sources(full, out)
      } else if (e.name.endsWith('.ts')) out.push(full)
    }
    return out
  }
  const shareFns: { name: string; file: string }[] = []
  for (const f of sources(lib)) {
    const body = blankComments(fs.readFileSync(f, 'utf8'))
    for (const m of body.matchAll(SHARE)) shareFns.push({ name: m[1], file: f })
  }
  assert(shareFns.length >= 3, `only ${shareFns.length} share entry points found`)

  /*
   * IMPORTS STRIPPED, AND THE CANARY IS WHY. Unwiring the handler while leaving
   * `import { shareTripCard }` at the top of the file left this green — an
   * import names a function without pressing it, and a component that imports a
   * share and never calls it is exactly the state this check exists to catch.
   *
   * Same lesson as the comment blanking above, one line further down: a search
   * for a name finds every mention of it, and only some mentions are uses.
   */
  const withoutImports = (s: string) => s.replace(/^import[\s\S]*?from\s+'[^']+'/gm, '')
  const pressed = shareFns.filter((s) =>
    files.some((f) => new RegExp(`\\b${s.name}\\b`).test(withoutImports(code.get(f)!))),
  )
  const unpressed = shareFns.filter((s) => !pressed.includes(s))
  note(`${shareFns.length} share entry points, ${pressed.length} with a control`)
  assert(
    unpressed.length === 0,
    `built and never pressable: ${unpressed.map((u) => u.name).join(', ')}`,
  )
})

/* ------------------ every refusal, exercised at least once (F3) ------------ */

/**
 * A refusal nobody has ever made the app produce.
 *
 * AUDIT 1 ASKED FOR ONE "nobody has counted on real footage", and the real-footage
 * half stays blocked — `RECORDED` is 0 of 6, and it is not this loop's to unblock.
 * What is countable here is whether each refusal has been produced *at all*.
 *
 * It matters more than it sounds. A refusal is the app's most careful sentence:
 * it fires when the engine has decided it cannot stand behind a reading, and it
 * is the one path where being wrong is silent — a refusal that never fires looks
 * exactly like a refusal that is not needed. This repo has already shipped four
 * things that were never reached: a tap prop, a history filter, a share card, and
 * a tie-drop written as an exact float equality that could not fire at all.
 *
 * Twelve refusal values across four unions: the triage rejections, the pairing
 * refusals, the detector declines and the outbound ones. All twelve are produced
 * by at least one check today. This keeps that true.
 *
 * WHAT IT DOES NOT CLAIM. That the refusal is *right*, or that its copy is good —
 * `copy.test.ts` reads the triage refusals and nothing reads the rest, because
 * the rest carry no player-facing sentence yet. And not that any of them has ever
 * fired on a clip a camera actually took. That is audit 1's other half and it
 * stays open.
 */
const REFUSALS: readonly string[] = [
  // triage — the four the player can actually be shown today
  'body_not_visible',
  'too_few_frames',
  'too_blurry',
  'camera_unusable',
  // trackPair — the ghost's seven
  'no_track',
  'yaw_unmeasured',
  'camera_moved',
  'rubric_changed',
  'serve_type_changed',
  'no_contact',
  'no_scale',
  // the shared pixel pass, and the outbound detector
  'window_empty',
  'too_slow',
  'no_streaks',
  'disagreed',
  'too_few_streaks',
]

check('every refusal the app can produce is produced by at least one check', () => {
  const testFiles = (dir: string, out: string[] = []): string[] => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) testFiles(full, out)
      else if (e.name.endsWith('.test.ts')) out.push(full)
    }
    return out
  }
  const suite = testFiles(root).map((f) => blankComments(fs.readFileSync(f, 'utf8')))

  const unexercised = REFUSALS.filter((r) => !suite.some((body) => body.includes(r)))
  note(`${REFUSALS.length} refusal values, ${REFUSALS.length - unexercised.length} exercised`)
  assert(
    unexercised.length === 0,
    `never produced by any check: ${unexercised.join(', ')}. A refusal that never fires looks ` +
      'exactly like a refusal that is not needed.',
  )
})

check('the refusal list has not fallen behind the unions it tracks', () => {
  /*
   * The half every list in this repo has had to grow. A hand-written list of
   * enum values goes stale the first time somebody adds one — which is how
   * `too_few_frames` came to mean two different things in two unions, found by a
   * bundle probe rather than by anything watching.
   *
   * Counted against the source rather than trusted: every quoted lowercase
   * identifier in the four union declarations must be in the list above.
   */
  const sources = [
    'lib/analysis/triage.ts',
    'lib/trackPair.ts',
    'lib/vision/detector.ts',
    'lib/vision/outbound.ts',
  ].map((f) => fs.readFileSync(path.join(root, f), 'utf8'))

  const declared = new Set<string>()
  for (const src of sources) {
    // Line-based rather than one regex over the file: a union spans several
    // lines and the refusal values are the quoted snake_case tokens on lines
    // that name a refusal at all. Simpler to read, and it survived escaping,
    // which the regex version did not.
    for (const line of blankComments(src).split(String.fromCharCode(10))) {
      if (!/refusal|reason|REJECTIONS|^ {2}.[a-z_]+.,$/.test(line)) continue
      for (const q of line.match(/.([a-z][a-z_]{3,}).,?/g) ?? []) {
        const v = q.replace(/[^a-z_]/g, "")
        if (v.includes(String.fromCharCode(95))) declared.add(v)
      }
    }
  }
  /*
   * Snake_case tokens the scan picks up that are not refusals, each with a
   * reason — the trade `jsxCopy.test.ts` and `cardCopy.test.ts` both make:
   * over-match, and write down every match with a verdict, rather than tune a
   * regex until the output looks tidy. A tuned regex is a gate nobody can audit.
   */
  const NOT_REFUSALS = [
    // A triage field, not a reason to throw a clip out: the app still reports
    // the serve and adds a warning about a joint.
    'injury_risk',
    // How many faults the plan held back, which the report prints as a count.
    'suppressed_count',
    // The affirmative side of `yaw_unmeasured` — a field saying the angle WAS
    // recovered, sitting on the same line as the refusal that says it was not.
    'yaw_measured',
  ]
  const missing = [...declared].filter((d) => !REFUSALS.includes(d) && !NOT_REFUSALS.includes(d))
  note(`${declared.size} refusal values found in the unions`)
  assert(declared.size >= 10, `only ${declared.size} refusal values found — the scan may have broken`)
  assert(
    missing.length === 0,
    `these exist in the source and are not in this file's list: ${missing.join(', ')}`,
  )
  // And the exclusions must still be found, or they are three lines of prose
  // about tokens that are no longer there — the stale-ruling half every list in
  // this repo has had to grow.
  const goneExclusions = NOT_REFUSALS.filter((n) => !declared.has(n))
  assert(
    goneExclusions.length === 0,
    `these exclusions no longer match anything: ${goneExclusions.join(', ')}`,
  )
})

/* -------------------- series a test builds for itself (R84) --------------- */

/**
 * A test that builds one of the engine's series must use the engine's radius.
 *
 * WHY. R52·1 measured a posed hitch separating 28–34× from a flowing serve and
 * concluded the reading was worth building. R52·2 built it, and the separation
 * came out at 1.7× against a 2.8× confound — **the opposite conclusion**. The
 * difference was one argument: the checks called
 * `planarSpeedSeries(..., 2)` while the engine calls it with
 * `sampleRadius(t, CHAIN_WINDOW_SECONDS)`, which is wider, and a wider window
 * fills a trough in.
 *
 * Two rounds reasoned about a quantity the app does not compute, and a canary
 * that did not fire is what surfaced it. So: no hard-coded radius on a series
 * the engine also builds. Take the constant, not the number.
 *
 * Narrow on purpose, like the props scan beside it. This does not police every
 * literal in every test — it names the two series functions whose radius decides
 * a published reading, and requires their callers to derive it.
 */
const SERIES_CALL = /\b(planarSpeedSeries|riseSpeedSeries)\(([^)]*)\)/g

check('no test builds an engine series at a radius it made up', () => {
  const testFiles = (dir: string, out: string[] = []): string[] => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) testFiles(full, out)
      else if (e.name.endsWith('.test.ts')) out.push(full)
    }
    return out
  }

  const offenders: string[] = []
  let calls = 0
  for (const f of testFiles(root)) {
    const body = blankComments(fs.readFileSync(f, 'utf8'))
    for (const m of body.matchAll(SERIES_CALL)) {
      calls++
      const last = m[2].split(',').pop()!.trim()
      // A bare number is the defect. Anything derived — `sampleRadius(...)`, a
      // named constant, a variable read off the engine — is the fix.
      if (/^[0-9]+$/.test(last)) offenders.push(`${f.slice(root.length + 1)}: ${m[0]}`)
    }
  }
  assert(calls > 0, 'no series calls found in any test, so this scan proves nothing')
  note(`${calls} series calls across the suite, ${offenders.length} with a literal radius`)
  assert(
    offenders.length === 0,
    `these pick their own smoothing rather than the engine's: ${offenders.join('; ')}. ` +
      'R52·1 and R52·2 reached opposite conclusions from exactly this — use ' +
      'sampleRadius(timeline(frames), CHAIN_WINDOW_SECONDS).',
  )
})

check('the scan can still see a props block at all', () => {
  /*
   * The check that keeps the two above honest. A regex that stopped matching
   * reports zero orphans and passes everything, which is the failure mode of
   * every text-matched gate — and `tallies.test.ts` exists because this repo
   * has already shipped a suite that passed while proving nothing.
   */
  assert(declared.length > 40, `only ${declared.length} optional props found across ${files.length} files`)
  const withBlocks = files.filter((f) => propsBlock(bodies.get(f)!) !== undefined).length
  assert(withBlocks > 10, `only ${withBlocks} components had a readable Props block`)
  note(`${withBlocks} components with a Props block`)
})

report()
