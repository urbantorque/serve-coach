/**
 * Serve speeds in a practice session, as an opt-in on its plan (N2.8): priced
 * before the player chooses, kept through a reload, stored on each serve's
 * line, and summed up on the dashboard as the fastest serve and the typical one.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import Session from '../../screens/Session'
import SessionDashboard from '../SessionDashboard'
import { sampleAnalysis } from '../../dev/sampleAnalysis'
import { lineOf } from '../../lib/session/line'
import { normalisePracticeSession, type PracticeSession } from '../../lib/session/session'
import { LIGHT_READ_SAMPLES, SPEED_READ_SAMPLES, costLeft, planChoices, sessionCost, speedCostLine } from '../../lib/session/plan'
import { SPEED_PLACEMENT } from '../../lib/placement'
import { sessionSpeeds } from '../../lib/speedTrend'
import { NO_SESSION_SPEED } from '../../lib/speedCopy'
import { driveSession } from '../../lib/session/drive'
import type { SessionVideo } from '../../lib/session/video'
import { assert, check, heading, note, report } from '../../lib/analysis/__tests__/harness'

const noop = () => {}
const withSpeed = sampleAnalysis({ seed: 9101 })
const { speed: _s, ...noSpeedAnalysis } = withSpeed
void _s

const found = Array.from({ length: 8 }, (_, i) => 6 + i * 12)
const session: PracticeSession = {
  id: 'practice-speed',
  createdAt: Date.UTC(2026, 9, 22),
  updatedAt: Date.UTC(2026, 9, 22),
  fileName: 'Thursday basket.mov',
  duration: 120,
  serveType: 'flat',
  handedness: 'right',
  mode: 'every',
  found,
  chosen: found.map((_, i) => i),
  lines: found.map((t, i) => lineOf(withSpeed, i + 1, t)),
  phase: 'done',
  scoringVersion: 5,
}

heading('Priced before the player chooses')

check('a speed adds its seeks to every serve read, and nothing when not asked for', () => {
  const base = { duration: 600, serves: 40, reading: 12, perSampleMs: 100 }
  const plain = sessionCost(base)
  const sped = sessionCost({ ...base, withSpeed: true })
  assert(plain.speed === 0 && sped.speed === 12 * SPEED_READ_SAMPLES, `speed seeks ${plain.speed} / ${sped.speed}`)
  assert(Math.abs(sped.seconds - plain.seconds - (12 * SPEED_READ_SAMPLES * 100) / 1000) < 1e-9, 'the seconds don’t carry the speed seeks')
  note(`a speed adds ${SPEED_READ_SAMPLES} seeks to a light read of ${LIGHT_READ_SAMPLES}: ${Math.round((SPEED_READ_SAMPLES / LIGHT_READ_SAMPLES) * 100)}% more a serve`)
})

check('each choice carries its price with speeds, and the line says the extra for each', () => {
  const choices = planChoices({ duration: 600, serves: 40, perSampleMs: 120 })
  assert(choices.every((c) => c.speedSeconds! > c.seconds!), 'a choice is no dearer with speeds')
  const line = speedCostLine(choices)
  assert(/^Speeds add about (a minute|\d+ minutes) to the sample and about (a minute|\d+ minutes) to every serve\./.test(line), line)
  // The extra is the gap between the two rounded times the sheet shows beside it.
  const shown = (sec: number) => Math.max(1, Math.round(sec / 60))
  const gaps = choices.map((c) => shown(c.speedSeconds!) - shown(c.seconds!))
  const said = [...line.matchAll(/about (a|\d+) minutes?/g)].map((m) => (m[1] === 'a' ? 1 : Number(m[1])))
  assert(said.join() === gaps.join(), `said ${said.join()} more, the times differ by ${gaps.join()}`)
  assert(line.includes(SPEED_PLACEMENT.distance), 'the line doesn’t say where to film from')
  const untimed = speedCostLine(planChoices({ duration: 600, serves: 40 }))
  assert(!/\d/.test(untimed.split('.')[0]), `an untimed file was given a figure: ${untimed}`)
})

check('a stopped session prices what is left with speeds if it chose them', () => {
  const stopped = { duration: 600, found: Array.from({ length: 20 }, (_, i) => i * 25), chosen: [0, 1, 2, 3], lines: [{ number: 1 }] }
  const plain = costLeft(stopped, 100)!
  const sped = costLeft({ ...stopped, withSpeed: true }, 100)!
  assert(Math.abs(sped - plain - (3 * SPEED_READ_SAMPLES * 100) / 1000) < 1e-9, `${plain} → ${sped}`)
})

check('the plan sheet offers speeds, off until chosen, with their price', () => {
  const html = renderToStaticMarkup(
    createElement(Session, {
      session: { ...session, found: undefined, chosen: undefined, lines: [], phase: 'locating', duration: 600 },
      stage: { state: 'planning', timed: true, perSampleMs: 120 },
      canRead: true,
      onStart: noop,
      onStop: noop,
      onPickAgain: noop,
      onLeave: noop,
    }),
  )
  assert(/aria-label="Serve speeds"/.test(html), 'no speed choice on the plan')
  assert(/aria-pressed="true"[^>]*>Without speeds</.test(html), 'speeds aren’t off by default')
  assert(html.includes('Speeds add about'), 'the price of speeds isn’t said')
})

heading('Kept, and stored on each serve')

check('the choice survives a reload, and a broken stored speed is dropped, not shown', () => {
  const back = normalisePracticeSession({ ...session, withSpeed: true })!
  assert(back.withSpeed === true, 'the speed choice was lost on reload')
  assert(normalisePracticeSession(session)!.withSpeed === undefined, 'a session that didn’t choose speeds came back with them')
  const broken = normalisePracticeSession({ ...session, lines: [{ ...session.lines[0], speed: { ms: 40, low: 45, high: 50 } }] })!
  assert(broken.lines[0].speed === undefined && broken.lines[0].status === 'read', 'a speed out of order was kept, or took its line with it')
})

check('a serve read with a speed keeps it on its line, and one without has none', () => {
  const line = lineOf(withSpeed, 1, 6)
  assert(line.speed !== undefined && Math.abs(line.speed.ms - 36.1) < 1e-3, JSON.stringify(line.speed))
  assert(lineOf(noSpeedAnalysis, 1, 6).speed === undefined, 'a serve without a speed was given one')
})

heading('On the dashboard')

check('the fastest is the serve surest to be fast; the typical needs two', () => {
  const lines = [
    { speed: { ms: 40, low: 34, high: 46 } },
    { speed: { ms: 39, low: 37, high: 41 } },
    {},
    { speed: { ms: 35, low: 33, high: 37 } },
  ]
  const s = sessionSpeeds(lines)!
  assert(s.read === 3 && s.fastest.ms === 39, `fastest ${s.fastest.ms} of ${s.read}`)
  assert(s.typical?.ms === 39 && s.typical.low === 34 && s.typical.high === 41, JSON.stringify(s.typical))
  assert(sessionSpeeds([{ speed: { ms: 40, low: 38, high: 42 } }])?.typical === undefined, 'one serve made a typical')
  assert(sessionSpeeds([{}, {}]) === undefined, 'no readings made a summary')
})

check('a session with speeds says them; one read for speeds with none says how; one without says nothing', () => {
  const read = renderToStaticMarkup(createElement(SessionDashboard, { session }))
  assert(read.includes('id="session-speed"') && /(Fastest serve|Your serves were all) about/.test(read) && /across 8 serves/.test(read), 'the speeds aren’t said')
  const none = { ...session, withSpeed: true, lines: found.map((t, i) => lineOf(noSpeedAnalysis, i + 1, t)) }
  assert(renderToStaticMarkup(createElement(SessionDashboard, { session: none })).includes(NO_SESSION_SPEED), 'no word on a speed session that read none')
  const plain = { ...session, lines: none.lines }
  assert(!renderToStaticMarkup(createElement(SessionDashboard, { session: plain })).includes('session-speed'), 'a speed section on a session that never asked')
})

heading('Read with the ball and the speed when chosen')

await check('the driver asks every read for speeds when the session chose them, and not otherwise', async () => {
  const asked: (boolean | undefined)[] = []
  const reader: SessionVideo = {
    calibrate: async () => [],
    locate: async () => ({ found: [5, 20, 35], unsure: [] }),
    read: async (_i, _f, opts) => {
      asked.push(opts.withSpeed)
      return withSpeed
    },
    still: async () => '',
    close: noop,
  }
  const run = (start: PracticeSession) =>
    driveSession({
      start,
      reader,
      signal: new AbortController().signal,
      show: noop,
      save: async () => {},
      stopReason: () => 'player',
      current: () => true,
    })
  const fresh = { ...session, found: undefined, chosen: undefined, lines: [], phase: 'locating' as const }
  await run({ ...fresh, withSpeed: true })
  assert(asked.length === 3 && asked.every((a) => a === true), `reads asked ${JSON.stringify(asked)}`)
  asked.length = 0
  await run(fresh)
  assert(asked.length === 3 && asked.every((a) => !a), `reads asked ${JSON.stringify(asked)}`)
})

report()
