/**
 * Walking the screen graph that `App.tsx` used to walk by hand.
 *
 * R7 kept the app's state machine implicit and wrote every legal transition as
 * a doc comment, on the strength of having "walked by hand for a screen it
 * could strand". Twenty-one `setView` call sites, one paragraph, and nothing
 * that ran. `screenFlow.ts` is that table as data; this walks it.
 *
 * Two of the checks below are graph properties — everything reachable, nothing
 * stranded — and they are the claim R7 actually made. The third is the one that
 * keeps the table honest over time: it reads `App.tsx` off disk and fails if a
 * screen exists there that is not in the graph. Without it the table is a
 * second thing to remember to update, which is what the comment already was.
 */
// No @types/node in this project — same trade `harness.ts` and `egress.test.ts`
// make; see either for why `@ts-expect-error` rather than a `declare module`.
declare const process: { cwd(): string }
// @ts-expect-error — no @types/node; see the comment above.
import fsUntyped from 'fs'
// @ts-expect-error — no @types/node; see the comment above.
import pathUntyped from 'path'
import { MOVES, SCREENS, reachableFrom, stranded, type Screen } from '../screenFlow'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const fs: { readFileSync: (path: string, encoding: 'utf8') => string } = fsUntyped
const path: { join: (...parts: string[]) => string } = pathUntyped

const read = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), 'src', ...p), 'utf8')
/**
 * The work of reading a clip, which moved out of `App.tsx` whole (L6.11):
 * every view it sets is a move on the screen graph as much as one in App.
 */
const RUN = read('components', 'useAnalysisRun.ts')
const APP = read('App.tsx') + '\n' + RUN
/**
 * Where a whole history is read. `App.tsx` and the hooks it hands its history
 * to (L6.11), and the progress screen, which took its selectors with it when it
 * stopped being a sheet over home.
 */
const HISTORY_READERS =
  APP +
  read('components', 'useSets.ts') +
  read('components', 'useHistoryLookups.ts') +
  read('screens', 'Progress.tsx')

heading('Nowhere the player can get stuck')

check('every screen has a route back to home', () => {
  // The claim R7's hand-walk was making. On a phone there is no address bar to
  // retreat to, so a screen with no exit is the end of the session.
  const stuck = stranded()
  assert(stuck.length === 0, `these screens can’t reach home: ${stuck.join(', ')}`)
})

check('every screen is reachable from home', () => {
  // The other direction, and it catches a different mistake: a screen built,
  // wired and never linked to. `glance` was nearly that — before R18 it was
  // reachable only from a route the prominent button did not take.
  const live = reachableFrom('home')
  const orphans = SCREENS.filter((s) => !live.has(s))
  assert(orphans.length === 0, `unreachable from home: ${orphans.join(', ')}`)
  note(`${live.size} of ${SCREENS.length} screens reachable from home`)
})

check('no screen can only be left by going home', () => {
  // Not a rule, a reading. `saved` and `error` are deliberately terminal — both
  // are "look at this, then start again" — so this states which those are
  // rather than asserting there are none, and a new one appearing is worth a
  // second look rather than an automatic failure. `progress` had that look
  // when it stopped being a sheet: it is read, then left. A saved report was
  // terminal too until it could open the glance (N1.8).
  const terminal = SCREENS.filter((s) => MOVES[s].every((m) => m.to === 'home'))
  note(`terminal screens: ${terminal.join(', ') || 'none'}`)
  assert(
    terminal.length === 2 && ['error', 'progress'].every((s) => terminal.includes(s as never)),
    `terminal screens changed: ${terminal.join(', ')}`,
  )
})

heading('The table against the code it describes')

check('every screen App.tsx names is in the graph', () => {
  // The check that stops this table drifting the way the comment did. A new
  // screen in the union, or a `setView` to a kind nobody added here, fails.
  const named = new Set<string>()
  for (const m of APP.matchAll(/\bkind: '([a-z-]+)'/g)) named.add(m[1])
  assert(named.size > 0, 'found no screen kinds in App.tsx at all — has the scan broken?')
  const missing = [...named].filter((k) => !(SCREENS as readonly string[]).includes(k))
  assert(missing.length === 0, `App.tsx has screens the graph doesn’t: ${missing.join(', ')}`)
  note(`${named.size} screen kinds found in App.tsx`)
})

check('the graph names no screen App.tsx doesn’t have', () => {
  // The opposite drift, and the one that was actually present: the prose listed
  // `analyzing` → `saved`, a move nothing in the file makes.
  const named = new Set<string>()
  for (const m of APP.matchAll(/\bkind: '([a-z-]+)'/g)) named.add(m[1])
  const invented = SCREENS.filter((s) => !named.has(s))
  assert(invented.length === 0, `the graph invents screens: ${invented.join(', ')}`)
})

check('every move lands on a screen that exists', () => {
  for (const from of SCREENS) {
    for (const move of MOVES[from]) {
      assert(
        (SCREENS as readonly string[]).includes(move.to),
        `${from} → ${move.to} (${move.via}) lands nowhere`,
      )
    }
  }
})

check('every move says what makes it', () => {
  // The `via` is the whole value of the table for a reader: a transition with
  // no named cause cannot be checked against the file, which is how the prose
  // came to claim one that does not exist.
  for (const from of SCREENS) {
    for (const move of MOVES[from]) {
      assert(move.via.trim().length > 0, `${from} → ${move.to} names nothing that performs it`)
    }
  }
})

heading('The two the prose had wrong')

check('the error screen is reachable without passing through analyzing', () => {
  // `run` refuses an oversized file and a non-video by declared type before it
  // ever sets `analyzing`, and returns straight after. The prose read as though
  // every error arrived by way of the analysing screen.
  for (const from of ['home', 'report'] as Screen[]) {
    assert(
      MOVES[from].some((m) => m.to === 'error'),
      `${from} can’t reach the error screen directly, but run() sends it there`,
    )
  }
  // And the code still does it, checked rather than remembered: both refusals
  // set the view and return before the analysing screen is ever shown.
  // What the two refusals say is tested as behaviour (`earlyRefusal`, M5.1);
  // here only that the hook asks it, and lands on the error screen, first.
  const early = RUN.slice(0, RUN.indexOf("setView({ kind: 'analyzing'"))
  assert(early.includes('earlyRefusal(file)') && /kind: 'error'/.test(early), "run no longer refuses a bad file before 'analyzing'")
})

check('nothing reaches the saved screen from analyzing', () => {
  // The prose listed it. `saved` is set by `showExample`, `openSaved` and the
  // dev demo branch, and the history sheet's opener is a prop only `Home` gets.
  assert(
    !MOVES.analyzing.some((m) => m.to === 'saved'),
    'the graph has inherited the prose’s phantom analyzing → saved move',
  )
  assert(
    MOVES.home.some((m) => m.to === 'saved'),
    'saved is unreachable from home, which is the only place that opens it',
  )
})

check('the fixture export is reachable without a dev build', () => {
  /*
   * R59 moved this path into the production bundle behind `?fixture`, and a dev
   * build cannot check that: `import.meta.env.DEV` is true here, so the flag is
   * masked and the button appears either way. What can be checked is the source,
   * which is the same disk-reading trade this file already makes for the screen
   * table and `framePair.test.ts` makes for a stylesheet.
   *
   * The regression this catches is one line: somebody tidying `FIXTURE_EXPORT`
   * back to `import.meta.env.DEV` alone, which would silently strand five
   * threads that are waiting on somebody with a phone — and would look like a
   * cleanup in the diff.
   */
  const gate = APP.match(/const FIXTURE_EXPORT =[\s\S]{0,200}/)?.[0] ?? ''
  assert(gate.length > 0, 'FIXTURE_EXPORT is gone from App.tsx entirely')
  assert(
    /has\('fixture'\)/.test(gate),
    `the fixture export no longer reads ?fixture, so it is dev-only again:\n      ${gate.slice(0, 120)}`,
  )
})


/* ------------------------------------------- what profiles would have to touch */

heading('Every place a history is read, which is what R55 has to get right')

/**
 * R55's spike. The round says "the migration is the hard part, not the feature",
 * and this is the migration measured rather than estimated.
 *
 * **THIRTEEN FUNCTIONS**, and the count is the finding. I enumerated them by
 * hand from a grep and got nine; this check found four more on its first run —
 * `streakLine`, `longestStreakLine`, `glanceStrain` and `clearedStrainOf`.
 * Every one silently assumes a single player, and every one is a place a
 * squad-mate's serves leak into somebody else's trend. If a careful count misses
 * a third of them, a careful patch will too.
 *
 * **SO THE FILTER GOES AT THE SOURCE, NOT THE CALL SITES.** One place to get
 * right rather than twelve, and a thirteenth consumer added later inherits it
 * instead of having to remember. This check counts them, so the day that number
 * grows without the filter moving, somebody finds out.
 *
 * **AND THE PROFILE CANNOT LIVE ON THE ROW**, which is the finding this spike
 * exists for. `saveSession(analysis)` takes an `Analysis` and nothing else, so a
 * `profileId` field is erased by every re-run — a handedness correction, a
 * serve-type change, flicking to another serve — exactly the defect R53·2a just
 * solved for tags, and for exactly the same reason. Either `saveSession` grows a
 * parameter, or whose-serve-this-is joins `serveTags`. That is a decision R55·1
 * has to make before a line of the feature is written, and it was invisible
 * until the two were put side by side.
 */
const HISTORY_CONSUMERS = [
  'bestTrip',
  // Bests as body positions (L3.8).
  'bodyBests',
  // The best earlier serve the ghost and the focus are set against (D4.5).
  'bestPriorTo',
  'buildConsistencyTrend',
  'buildProgress',
  // First and second serves apart, and the in-rate per serve type (D5.3).
  'byServeNumber',
  'clearedStrainOf',
  'faultMoveOnTrip',
  // Each named fault across the recent serves (D6.6).
  'faultTrends',
  'findPracticeFocus',
  'glanceStrain',
  'inRateByType',
  // A set's aim, from the player's own taps (L3.7).
  'inRateFor',
  'longestStreakLine',
  // What the misses share (N3.1). Refused serves are dropped at its first
  // filter, which is R55's.
  'missesInCommon',
  'recurringStrainOf',
  // Serve speed over time (N2.8): the record, the trend between trips, and
  // first serves against second. Refused reports are dropped in `readingOf`.
  'fastestServe',
  'speedByServeNumber',
  'speedTrend',
  // Every trip's typical first serve, the bars of the speed chart (C5).
  'speedByTrip',
  // A second serve swung slower than the first (L5.8).
  'secondServeSlower',
  'rotationMoveOnTrip',
  // The snapshot on offer, and the week's load (lift).
  'recoveryOffer',
  'serveLoad',
  // The player's own usual, and what their best serves share (lift).
  'playerBaseline',
  'serveLinks',
  // The serve path (L3.5).
  'servePath',
  'strainBehindOf',
  'streakLine',
  // The graduation card and what it is built from (L3.12).
  'graduation',
  'graduationCard',
  'tripsOf',
  'weekPlan',
]

check('every function that reads a whole history is on the list R55 must cover', () => {
  /*
   * Read off `App.tsx` rather than remembered, the same trade the screen table
   * above makes. A tenth consumer added without a profile filter is the failure
   * this counts — and it is a failure that shows up as one player's numbers on
   * another player's chart, which nothing else here would catch.
   */
  const found = new Set<string>()
  for (const m of HISTORY_READERS.matchAll(/\b([a-zA-Z]+)\(sessions\b/g)) found.add(m[1])
  const missing = [...found].filter((f) => !HISTORY_CONSUMERS.includes(f))
  assert(
    missing.length === 0,
    `${missing.length} function(s) read the whole history and aren’t on R55's list:\n` +
      missing.map((m) => `      ${m}(sessions…)`).join('\n') +
      '\n      Add them to HISTORY_CONSUMERS, and to whatever R55 filters.',
  )
  note(`  ${found.size} functions read the whole history in App.tsx`)
})

check('the list hasn’t gone stale in the other direction', () => {
  // The opposite failure, and the one `egress.test.ts` guards on its own allow
  // list: a consumer removed leaves a stale name here, and the next reader
  // trusts a list describing an app that no longer exists.
  const found = new Set<string>()
  for (const m of HISTORY_READERS.matchAll(/\b([a-zA-Z]+)\(sessions\b/g)) found.add(m[1])
  const gone = HISTORY_CONSUMERS.filter((f) => !found.has(f))
  assert(
    gone.length === 0,
    `${gone.length} name(s) on R55's list no longer read a history: ${gone.join(', ')}`,
  )
})

report()
