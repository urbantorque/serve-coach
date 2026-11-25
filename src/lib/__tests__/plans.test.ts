/**
 * The one gate (N6.4). Every paid feature goes through `can`, so these are
 * every answer the app can give about what a player may open.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
import { FEATURES, FREE, can, hasPlus } from '../plans'
import { FEATURE_COPY, FREE_COPY } from '../planCopy'
import { cueIssues } from '../analysis/voice'
import { assert, check, heading, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as { readFileSync: (p: string, e: string) => string; readdirSync: (p: string) => string[] }
const NOW = Date.parse('2026-11-19T12:00:00Z')
const plus = { plan: 'plus' as const, until: NOW + 86_400_000 }
const lapsed = { plan: 'plus' as const, until: NOW - 1 }

heading('Free and Plus, through one gate')

check('with no paid plan on sale, everything is open to everyone', () => {
  for (const f of FEATURES) assert(can(f, { entitlement: FREE, gated: false, now: NOW }), `${f} closed with the gate off`)
})

check('on sale, free opens no paid feature, except the breakdown of a first serve', () => {
  for (const f of FEATURES) assert(!can(f, { entitlement: FREE, gated: true, now: NOW }), `${f} open to free`)
  assert(can('breakdown', { entitlement: FREE, gated: true, now: NOW, firstServe: true }), 'the first serve isn’t read in full')
  for (const f of FEATURES.filter((x) => x !== 'breakdown')) {
    assert(!can(f, { entitlement: FREE, gated: true, now: NOW, firstServe: true }), `a first serve opened ${f}`)
  }
})

check('Plus opens everything until it runs out, and not a moment after', () => {
  for (const f of FEATURES) assert(can(f, { entitlement: plus, gated: true, now: NOW }), `${f} closed to Plus`)
  for (const f of FEATURES) assert(!can(f, { entitlement: lapsed, gated: true, now: NOW }), `${f} open on a lapsed plan`)
  assert(hasPlus({ plan: 'plus' }, NOW), 'a plan with no end isn’t Plus')
  assert(!hasPlus(FREE, NOW), 'free counted as Plus')
})

check('every feature says what it is in the house voice, and so does free', () => {
  for (const f of FEATURES) {
    const issues = cueIssues(FEATURE_COPY[f].line)
    assert(issues.length === 0, `${f}: ${issues.join('; ')}`)
  }
  for (const line of FREE_COPY) assert(cueIssues(line).length === 0, `${line}: ${cueIssues(line).join('; ')}`)
})

check('every gate in the app goes through the hook, and every feature is gated somewhere', () => {
  const files = ['src/screens/Report.tsx', 'src/screens/Home.tsx', 'src/screens/Progress.tsx', 'src/screens/Session.tsx']
  const text = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n')
  for (const f of FEATURES) assert(text.includes(`allow('${f}'`) && text.includes(`feature="${f}"`) || (f === 'coachShare' && text.includes(`allow('coachShare')`)), `${f} is never gated or never shows a paywall`)
  assert(!/plan\s*===\s*'plus'/.test(text), 'a screen checks the plan itself instead of asking can()')
})

report()
