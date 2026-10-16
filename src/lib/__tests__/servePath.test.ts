/**
 * The serve path (L3.5): each part of the serve as not seen yet, working on,
 * holding or locked in, a headline in words, and a relapse said plainly.
 *
 * On seeded diagnoses first, where each state can be set exactly; then on the
 * rig, with the racket drop dialled on, off and on again, so the path is held
 * to what the engine actually names; then rendered.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { partLabel, servePath } from '../servePath'
import { CHECK_SERVES, progressionFor } from '../analysis/progressions'
import { sampleAnalysis } from '../../dev/sampleAnalysis'
import Progress from '../../screens/Progress'
import type { FlawId } from '../analysis/flaws'
import type { Session } from '../storage/db'
import type { ServeDials } from '../analysis/syntheticServe'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

let n = 0
/** A report naming `named` and judging `clean` clean; every other fault unjudged. */
function serve(at: number, named: FlawId[], clean: FlawId[] = []): Session {
  const finding = (flaw: FlawId, detected: boolean) => ({
    flaw,
    detected,
    signal: 's',
    value: 0.5,
    unit: 'ratio',
    miss: detected ? 0.2 : 0,
    target: [0.6, 1],
    target_tier: 4,
    severity: detected ? 'medium' : 'none',
    confidence: 0.9,
  })
  return {
    id: `serve-p${n++}-0`,
    createdAt: at,
    overall: 70,
    overallStatus: 'good',
    serveType: 'flat',
    scoringVersion: 5,
    fundamentals: [],
    phases: [],
    triage: named.length
      ? { status: 'ok', primary_flaw: { flaw: named[0], value: 0.5, target: [0.6, 1], signal: 's' } }
      : { status: 'ok' },
    diagnosis: { flaws: [...named.map((f) => finding(f, true)), ...clean.map((f) => finding(f, false))] },
  } as unknown as Session
}

const trip = (day: number, count: number, named: FlawId[], clean: FlawId[] = []) =>
  Array.from({ length: count }, (_, i) => serve(day * DAY + i * HOUR, named, clean))

const part = (path: ReturnType<typeof servePath>, group: string) => path!.parts.find((p) => p.group === group)!

heading('On seeded diagnoses')

check('a part never judged is not seen yet, and the headline counts the parts holding', () => {
  const sessions = [...trip(0, 3, [], ['toss_height', 'toss_drift']), ...trip(3, 3, [], ['toss_height', 'toss_drift'])]
  const path = servePath(sessions)!
  note(path.headline)
  assert(path.parts.length === 7, `${path.parts.length} parts`)
  assert(part(path, 'toss').state === 'holding', `the toss is ${part(path, 'toss').state}`)
  assert(part(path, 'legs').state === 'not_seen', 'a part nothing judged was given a state')
  assert(path.headline === '1 of 7 parts holding.', `headline "${path.headline}"`)
})

check('a part being worked on shows the ladder step the player is on', () => {
  const path = servePath(trip(0, 3, ['shallow_drop']), { shallow_drop: 2 })!
  const drop = part(path, 'drop')
  const of = progressionFor('shallow_drop')!.steps.length
  assert(drop.state === 'working' && drop.flaw === 'shallow_drop', `the drop is ${drop.state}`)
  assert(drop.step?.at === 3 && drop.step.of === of, `step ${JSON.stringify(drop.step)}`)
  assert(partLabel(drop) === `Working on, step 3 of ${of}`, partLabel(drop))
})

check('held across four more trips, a part is locked in', () => {
  const fixed = [...trip(0, 3, ['shallow_drop']), ...trip(3, 3, [], ['shallow_drop']), ...trip(6, 3, [], ['shallow_drop'])]
  assert(part(servePath(fixed), 'drop').state === 'holding', 'a freshly fixed part was not holding')
  const later = [...fixed, ...[9, 12, 15, 18].flatMap((d) => trip(d, 1, [], ['shallow_drop']))]
  const path = servePath(later)!
  assert(part(path, 'drop').state === 'locked', `four trips on, the drop is ${part(path, 'drop').state}`)
  assert(/1 of them locked in/.test(path.headline), path.headline)
})

check('a relapse moves the part back and says so plainly', () => {
  const sessions = [
    ...trip(0, 3, ['shallow_drop']),
    ...trip(3, 3, [], ['shallow_drop']),
    ...trip(6, 3, [], ['shallow_drop']),
    ...trip(9, 3, ['shallow_drop']),
  ]
  const drop = part(servePath(sessions), 'drop')
  note(drop.slipped ?? 'no line')
  assert(drop.state === 'working', `the relapsed drop is ${drop.state}`)
  assert(drop.slipped === 'The racket drop has slipped back: the fault came back on 3 of your last 6 serves.', `"${drop.slipped}"`)
})

check('a history with nothing judged has no path', () => {
  assert(servePath([]) === undefined, 'an empty history drew a path')
  assert(servePath([serve(0, [])]) === undefined, 'a report judging nothing drew a path')
})

heading('On the rig: the racket drop turned on, off, and on again')

/** Trips of the rig's serve, filed as stored reports. */
function rigTrip(day: number, dials: Partial<ServeDials>, count = 3): Session[] {
  return Array.from({ length: count }, (_, i) => {
    const { frames: _f, ...a } = sampleAnalysis({ ...dials, seed: day * 10 + i + 1 })
    void _f
    return { ...a, id: `serve-rig${day}x${i}-0`, createdAt: day * DAY + i * HOUR, scoringVersion: 5 } as Session
  })
}

const NO_DROP: Partial<ServeDials> = { dropBelowShoulder: -0.25 }
const on = rigTrip(0, NO_DROP)
const off = [...rigTrip(3, {}), ...rigTrip(6, {})]
const again = rigTrip(9, NO_DROP)

check('on, the racket drop is worked on', () => {
  const drop = part(servePath(on), 'drop')
  note(`after the fault: ${drop.state}`)
  assert(drop.state === 'working', `the rig's missing drop left the part ${drop.state}`)
})

check('off for two trips, it holds', () => {
  const path = servePath([...on, ...off])!
  note(path.parts.map((p) => `${p.group} ${p.state}`).join(', '))
  assert(part(path, 'drop').state === 'holding', `the drop is ${part(path, 'drop').state}`)
  // The sample serve's straight legs never drive, so that part never stopped being worked on.
  assert(part(path, 'legs').state === 'working', 'the legs, named throughout, stopped being worked on')
})

check('on again, it slips back and says so', () => {
  const drop = part(servePath([...on, ...off, ...again]), 'drop')
  note(drop.slipped ?? 'no line')
  assert(drop.state === 'working' && /slipped back/.test(drop.slipped ?? ''), `the drop is ${drop.state}`)
  assert(CHECK_SERVES === 6, 'the bar the lines count against moved')
})

heading('Drawn on the progress screen')

check('the path renders with its headline and a row per part', () => {
  const sessions = [...on, ...off].sort((a, b) => b.createdAt - a.createdAt)
  const html = renderToStaticMarkup(createElement(Progress, { sessions, onBack: () => {}, onLogDrill: () => {}, onUndoDrill: () => {}, seeded: false }))
  assert(html.includes('Your serve path'), 'the block did not render')
  assert(/\d of 7 parts holding/.test(html), 'the headline did not render')
  assert((html.match(/class="path-part /g) ?? []).length === 7, 'not one row per part')
  assert(html.includes('Holding') && html.includes('Working on'), 'the states were not said')
})

report()
