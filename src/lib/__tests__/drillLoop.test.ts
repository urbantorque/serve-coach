/**
 * The check that closes the loop (C1.4): a serve filmed after a drill block is
 * read against that drill's fault, and called a change only past the player's
 * own spread.
 */
import { drillLoop, flawOfDrill, rowOf, type LoopOutcome } from '../drillLoop'
import { METRICS } from '../analysis/coaching'
import { CARD_NOISE_SD } from '../analysis/cardNoise'
import { progressionFor } from '../analysis/progressions'
import { cueIssues } from '../analysis/voice'
import type { FlawId } from '../analysis/flaws'
import type { PracticeLog, Session } from '../storage/db'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const ROWS = Object.keys(CARD_NOISE_SD)
const middle = (id: string) => (METRICS[id].ideal[0] + METRICS[id].ideal[1]) / 2
const FLAW: FlawId = 'no_leg_drive'
const ROW = 'legDrive'
let ids = 0

function stub(at: number, value: number, verdict: 'c' | 'n' | 'u' = 'n', flaw: FlawId = FLAW): Session {
  const values: Record<string, number> = { ...Object.fromEntries(ROWS.map((r) => [r, middle(r)])), [ROW]: value }
  const metrics = Object.entries(values).map(([id, v]) => ({
    id, label: METRICS[id].label, value: v, unit: METRICS[id].unit, decimals: METRICS[id].decimals, ideal: METRICS[id].ideal, confidence: 1, score: 70,
  }))
  return {
    id: `serve-loop${ids++}-0`,
    createdAt: at,
    overall: 70,
    serveType: 'flat',
    scoringVersion: 5,
    triage: { status: 'ok' },
    quality: { view: 'side' },
    fundamentals: [{ id: 'toss', score: 70, metrics }],
    diagnosis: { flaws: [{ flaw, detected: verdict === 'n', confidence: verdict === 'u' ? 0.1 : 0.9 }] },
  } as unknown as Session
}

const [lo, hi] = METRICS[ROW].ideal
const step = (hi - lo) / 20
/** Twelve serves over three trips, wandering a little below the band. */
const usual = lo - 6 * step
const history = [-3, -2, -1, -1, 0, 0, 0, 0, 1, 1, 2, 3].map((k, i) => stub(Math.floor(i / 4) * 7 * DAY + (i % 4) * 0.1 * HOUR, usual + k * step * 0.5))
const lastAt = Math.max(...history.map((s) => s.createdAt))
const drill = progressionFor(FLAW)!.steps[0].name
const log = (doneAt: number, name = drill): PracticeLog => ({ id: `log-${doneAt}`, metricId: ROW, drill: name, assignedAt: doneAt - DAY, doneAt })
const after = (value: number, verdict: 'c' | 'n' | 'u' = 'n') => stub(lastAt + 7 * DAY, value, verdict)
const read = (s: Session, logs: PracticeLog[] = [log(lastAt + 6 * DAY)]) => drillLoop(s, [...history, s], logs)

heading('Which drill, and which fault')

check('a ladder step names its fault, and so does the row a drill was logged against', () => {
  assert(flawOfDrill({ drill, metricId: 'x' }) === FLAW, 'the ladder step did not name its fault')
  assert(flawOfDrill({ drill: 'Something else', metricId: ROW }) === FLAW, 'the row did not name its fault')
  assert(flawOfDrill({ drill: 'Something else', metricId: 'nothing' }) === undefined, 'named a fault from nothing')
  assert(rowOf('waiters_tray') === undefined && rowOf(FLAW) === ROW, 'the fault-to-row map is off')
})

check('no drill since the last serve, no loop', () => {
  assert(read(after(usual), []) === undefined, 'a loop with no drill done')
  assert(read(after(usual), [log(lastAt - DAY)]) === undefined, 'a drill done before the last serve counted')
})

heading('Past the player’s own spread, or not')

const cases: [string, Session, LoopOutcome][] = [
  ['well into the band', after(middle(ROW), 'c'), 'towards'],
  ['where it usually is', after(usual + step * 0.25), 'within'],
  ['far further off', after(usual - 12 * step), 'away'],
  ['not readable for the fault', after(usual, 'u'), 'unread'],
]
for (const [name, serve, want] of cases) {
  check(`${name}: ${want}`, () => {
    const loop = read(serve)
    assert(loop?.outcome === want, `${name}: ${loop?.outcome}`)
    assert(cueIssues(loop!.line).length === 0, `${loop!.line}: ${cueIssues(loop!.line).join(', ')}`)
    note(loop!.line)
  })
}

check('with no history to know the spread, one serve is said as one serve', () => {
  const s = stub(DAY, usual, 'c')
  const loop = drillLoop(s, [s], [log(DAY - HOUR)])
  assert(loop?.outcome === 'no_usual_clean', `${loop?.outcome}`)
  assert(/one serve/.test(loop!.line), loop!.line)
  assert(cueIssues(loop!.line).length === 0, cueIssues(loop!.line).join(', '))
})

check('a fault with no card row is never called a change', () => {
  const s = stub(lastAt + 7 * DAY, usual, 'n', 'waiters_tray')
  const tray = progressionFor('waiters_tray')!.steps[0].name
  const loop = drillLoop(s, [...history, s], [log(lastAt + 6 * DAY, tray)])
  assert(loop?.outcome === 'no_usual_named', `${loop?.outcome}`)
  assert(cueIssues(loop!.line).length === 0, cueIssues(loop!.line).join(', '))
})

report()
