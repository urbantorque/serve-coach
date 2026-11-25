/**
 * Sets from the player's own taps (L3.7), on tag fixtures, and on the glance.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import {
  SET_SIZE,
  bestSet,
  finishedSet,
  inRateFor,
  setDoneLine,
  setRunningLine,
  setServes,
  setTarget,
  type SetResult,
} from '../sets'
import { portablePrefs, type BackupStore } from '../storage/backup'
import { importBackup } from '../storage/restore'
import { DEFAULTS, type Prefs } from '../storage/prefs'
import Glance from '../../screens/Glance'
import { sampleAnalysis } from '../../dev/sampleAnalysis'
import type { ServeOutcome, ServeTag, Session } from '../storage/db'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const MIN = 60 * 1000

/** A serve and the tap on it, a minute apart from the last. */
function tapped(i: number, outcome?: ServeOutcome, serveNumber?: 1 | 2): { s: Session; t?: ServeTag } {
  const s = { id: `serve-t${i}-0`, createdAt: i * MIN, overall: 70, fundamentals: [] } as unknown as Session
  const t = outcome || serveNumber ? ({ id: s.id, outcome, serveNumber, taggedAt: i * MIN + 1 } as ServeTag) : undefined
  return { s, t }
}
const history = (rows: ReturnType<typeof tapped>[]) => ({
  sessions: rows.map((r) => r.s),
  tags: rows.flatMap((r) => (r.t ? [r.t] : [])),
})

heading('The aim is the player\'s own rate, plus one')

check('six in of ten first serves aims for seven; too few taps aim for nothing', () => {
  const rows = Array.from({ length: 10 }, (_, i) => tapped(i, i < 6 ? 'in' : 'net', 1))
  const { sessions, tags } = history(rows)
  const rate = inRateFor(sessions, tags, 1)
  assert(rate?.inServes === 6 && rate.outcomes === 10, JSON.stringify(rate))
  assert(setTarget(rate) === 7, `aim ${setTarget(rate)}`)
  assert(setTarget(inRateFor(sessions, tags, 2)) === undefined, 'second serves had an aim with no taps')
  assert(setTarget({ inServes: 10, outcomes: 10 }) === SET_SIZE, 'the aim went past ten')
})

check('first and second serves are kept apart', () => {
  const rows = [
    ...Array.from({ length: 6 }, (_, i) => tapped(i, 'in', 1)),
    ...Array.from({ length: 6 }, (_, i) => tapped(10 + i, 'long', 2)),
  ]
  const { sessions, tags } = history(rows)
  assert(inRateFor(sessions, tags, 1)?.inServes === 6, 'second serves leaked into the first-serve rate')
  assert(inRateFor(sessions, tags, 2)?.inServes === 0, 'first serves leaked into the second-serve rate')
})

heading('A set counts ten tapped serves after it starts')

check('serves before the start, untapped ones and the other serve number don’t count', () => {
  const rows = [
    tapped(0, 'in', 1), // before the set
    tapped(2, 'in', 1),
    tapped(3), // nothing said: not counted
    tapped(4, 'net', 2), // a second serve during a first-serve set
    tapped(5, 'in'), // the landing alone: counted as the set's serve number
    ...Array.from({ length: 7 }, (_, i) => tapped(6 + i, i % 2 ? 'net' : 'in', 1)),
  ]
  const { sessions, tags } = history(rows)
  const active = { startedAt: 1 * MIN, serveNumber: 1 as const, target: 7 }
  const counted = setServes(active, sessions, tags)
  note(`${counted.length} counted, ${counted.filter((c) => c.isIn).length} in`)
  assert(counted.length === 9 && !counted.some((c) => c.id === 'serve-t0-0' || c.id === 'serve-t3-0' || c.id === 'serve-t4-0'), 'counted the wrong serves')
  assert(finishedSet(active, sessions, tags) === undefined, 'nine serves finished a set of ten')
  assert(setRunningLine(active, 9, 6) === 'Set of first serves: 6 in of 9. Aim: 7 of 10.', setRunningLine(active, 9, 6))
  assert(setRunningLine(active, 0, 0) === 'Set of first serves started: tap where each one lands. Aim: 7 of 10.', setRunningLine(active, 0, 0))
  const ten = history([...rows, tapped(20, 'in', 1)])
  const done = finishedSet(active, ten.sessions, ten.tags)
  assert(done?.inServes === 7 && done.endedAt === 20 * MIN, JSON.stringify(done))
})

heading('The best set is a record')

const result = (startedAt: number, inServes: number, serveNumber: 1 | 2 = 1, target?: number): SetResult => ({
  startedAt,
  endedAt: startedAt + 10 * MIN,
  serveNumber,
  inServes,
  target,
})

check('a set past every other of its serve number is the record; a second serve doesn’t compete', () => {
  const past = [result(0, 6), result(100, 9, 2)]
  const now = result(200, 8, 1, 7)
  const line = setDoneLine(now, [...past, now])
  note(line)
  assert(line === 'Set of 10 first serves: 8 in. You reached your aim of 7. Your best set of first serves yet.', `"${line}"`)
  assert(bestSet([...past, now], 1)?.inServes === 8 && bestSet([...past, now], 2)?.inServes === 9, 'the record crossed serve numbers')
  const short = setDoneLine(result(300, 5, 1, 7), [...past, now, result(300, 5, 1, 7)])
  assert(short === 'Set of 10 first serves: 5 in. Your aim was 7.', `"${short}"`)
  const first = setDoneLine(result(0, 6), [result(0, 6)])
  assert(first === 'Set of 10 first serves: 6 in. That’s your mark to beat next time.', `"${first}"`)
})

await check('the records travel in the backup, and merge with the phone\'s own', async () => {
  const here: Prefs = { ...DEFAULTS, sets: [result(0, 6)] }
  const file = JSON.stringify({
    format: 'serve-coach-backup',
    version: 1,
    exportedAt: 0,
    sessions: [],
    prefs: portablePrefs({ ...DEFAULTS, sets: [result(0, 6), result(500, 9)] }),
  })
  let written: Partial<Prefs> = {}
  const store = {
    listSessions: async () => [],
    saveSession: async () => {},
    listPracticeLogs: async () => [],
    logPractice: async () => {},
    listServeTags: async () => [],
    tagServe: async () => {},
    pruneSessions: async () => 0,
    readPrefs: () => here,
    writePrefs: (p: Partial<Prefs>) => {
      written = p
      return { ...here, ...p }
    },
  } as BackupStore
  await importBackup(file, store)
  assert(written.sets?.length === 2 && written.sets[1].inServes === 9, `merged ${JSON.stringify(written.sets)}`)
})

heading('On the glance')

check('the glance offers a set, runs one, and says how it finished', () => {
  const props = { analysis: sampleAnalysis(), onOpenReport: () => {}, onBack: () => {}, onTagOutcome: () => {} }
  const offer = renderToStaticMarkup(createElement(Glance, { ...props, onStartSet: () => {} }))
  assert(offer.includes('Start a set of 10') && offer.includes('First serves') && offer.includes('Second serves'), 'no offer')
  const running = renderToStaticMarkup(
    createElement(Glance, { ...props, onStartSet: () => {}, onStopSet: () => {}, set: { line: 'Set of first serves: 3 in of 4. Aim: 7 of 10.', running: true } }),
  )
  assert(running.includes('3 in of 4') && running.includes('Stop this set'), 'the running set wasn’t shown')
  assert(!running.includes('Start a set of 10'), 'a second set was offered while one runs')
  const done = renderToStaticMarkup(
    createElement(Glance, { ...props, onStartSet: () => {}, set: { line: 'Set of 10 first serves: 8 in.', running: false } }),
  )
  assert(done.includes('8 in.') && done.includes('Start a set of 10'), 'a finished set didn’t offer the next')
  const untagged = renderToStaticMarkup(createElement(Glance, { ...props, onTagOutcome: undefined, onStartSet: () => {} }))
  assert(!untagged.includes('Start a set'), 'a set was offered where landings can’t be tapped')
})

report()
