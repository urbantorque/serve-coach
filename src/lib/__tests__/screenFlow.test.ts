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

const APP = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8')

heading('Nowhere the player can get stuck')

check('every screen has a route back to home', () => {
  // The claim R7's hand-walk was making. On a phone there is no address bar to
  // retreat to, so a screen with no exit is the end of the session.
  const stuck = stranded()
  assert(stuck.length === 0, `these screens cannot reach home: ${stuck.join(', ')}`)
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
  // rather than asserting there are none, and a third appearing is worth a
  // second look rather than an automatic failure.
  const terminal = SCREENS.filter((s) => MOVES[s].every((m) => m.to === 'home'))
  note(`terminal screens: ${terminal.join(', ') || 'none'}`)
  assert(
    terminal.length === 2 && terminal.includes('saved') && terminal.includes('error'),
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
  assert(missing.length === 0, `App.tsx has screens the graph does not: ${missing.join(', ')}`)
  note(`${named.size} screen kinds found in App.tsx`)
})

check('the graph names no screen App.tsx does not have', () => {
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
      `${from} cannot reach the error screen directly, but run() sends it there`,
    )
  }
  // And the code still does it, checked rather than remembered: both refusals
  // set the view and return before the analysing screen is ever shown.
  const early = APP.slice(0, APP.indexOf("setView({ kind: 'analyzing'"))
  const refusals = [...early.matchAll(/kind: 'error'/g)].length
  assert(refusals >= 2, `expected run's two early refusals before 'analyzing', found ${refusals}`)
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

report()
