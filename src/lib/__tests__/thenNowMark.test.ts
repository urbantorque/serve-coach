/**
 * What then and now marks on the player's two bodies (E2.1), read off real
 * engine output from the rig's serve, dialled with and without the fault.
 */
import { DEMO_DIALS, sampleAnalysis } from '../../dev/sampleAnalysis'
import type { Analysis } from '../analysis/types'
import { normalise, type Session } from '../storage/db'
import { faultMoment } from '../lookFor'
import { thenNowLine, thenNowMark } from '../thenNowMark'
import { cueIssues } from '../analysis/voice'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const DAY = 86_400_000
const T0 = new Date(2026, 9, 10, 10).getTime()

function stored(a: Analysis, id: string, createdAt: number): Session {
  const { frames: _f, ...rest } = a
  void _f
  return normalise({ ...rest, id, createdAt })!
}

/** The rig's serve has the tossing arm coming down early; this dial holds it up. */
const ARM_UP = { tossArmHold: 0.72 }

heading('Then and now marks one change, only where it is graded (E2.1)')

check('a fault that went is the one marked, at its own moment, painted on the serve that had it', () => {
  const then = stored(sampleAnalysis(), 'then', T0)
  const now = stored(sampleAnalysis(ARM_UP), 'now', T0 + 40 * DAY)
  const mark = thenNowMark(then, now)
  assert(mark !== undefined, 'nothing marked between a serve with the fault and one without')
  note(`${mark!.name} at ${mark!.moment}: "${mark!.then.readout}" then "${mark!.now.readout}" now, ${mark!.change}`)
  assert(mark!.change === 'gone' && mark!.then.had && !mark!.now.had, `marked ${mark!.change}`)
  assert(mark!.moment === faultMoment(then.fundamentals, mark!.flaw), 'not held at the moment the fault is read at')
  const line = thenNowLine(mark!, 'Oct 10', 'Nov 19')
  note(line)
  assert(line.includes('has gone') && cueIssues(line).length === 0, `${line}: ${cueIssues(line).join(', ')}`)
})

check('the fault asked for comes before one merely still there', () => {
  const then = stored(sampleAnalysis(DEMO_DIALS.injury), 'then', T0)
  const now = stored(sampleAnalysis(DEMO_DIALS.injury), 'now', T0 + 40 * DAY)
  const any = thenNowMark(then, now)
  if (any && any.change === 'still') {
    const other = (now.diagnosis?.flaws ?? []).find((f) => f.detected && f.flaw !== any.flaw && thenNowMark(then, now, f.flaw)?.flaw === f.flaw)
    if (other) assert(thenNowMark(then, now, other.flaw)!.flaw === other.flaw, 'the preferred fault was passed over')
  }
})

check('with no graded reading on both serves, nothing is marked', () => {
  const then = stored(sampleAnalysis(), 'then', T0)
  const bare = { ...stored(sampleAnalysis(), 'now', T0 + 40 * DAY), fundamentals: [] } as Session
  assert(thenNowMark(then, bare) === undefined, 'a change was marked with no reading behind it')
})

report()
