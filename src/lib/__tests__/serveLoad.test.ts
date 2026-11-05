/**
 * Serve volume against the player's own usual, and at most one line of guidance:
 * a count said as a count, never a claim about a body.
 */
import { CHART_WEEKS, serveLoad } from '../serveLoad'
import { WEEK_MS, servesPerWeek, weekJumpLine, weekJumped } from '../progress'
import { INJURY_INPUTS } from '../analysis/faultOrder'
import { cueIssues } from '../analysis/voice'
import type { InjuryFlag } from '../analysis/triage'
import type { Session } from '../storage/db'
import { sampleHistory } from '../../dev/sampleAnalysis'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const NOW = new Date(2026, 10, 5, 12).getTime()

let n = 0
function serve(at: number, flags: InjuryFlag[] = []): Session {
  // Every signal each flag is read from, so a trip that raised nothing counts as having looked.
  const signals = Object.fromEntries(Object.values(INJURY_INPUTS).flat().map((s) => [s, 1]))
  return {
    id: `serve-l${n++}-0`,
    createdAt: at,
    overall: 70,
    serveType: 'flat',
    scoringVersion: 5,
    fundamentals: [],
    triage: { status: 'ok', injury_risk: flags.map((flag) => ({ flag, severity: 'medium' })) },
    diagnosis: { flaws: [], signals },
  } as unknown as Session
}

/** `counts` serves in each week back from this one, last entry this week. */
function season(counts: number[], flags: InjuryFlag[] = []): Session[] {
  const out: Session[] = []
  counts.forEach((c, i) => {
    const weeksBack = counts.length - 1 - i
    for (let k = 0; k < c; k++) out.push(serve(NOW - weeksBack * WEEK_MS - k * 60_000, flags))
  })
  return out
}

/** Nothing here may read as knowing about a body. */
const MEDICAL = /injur|risk|overuse|damage|pain|sore|hurt|ache|tired|fatigue|diagnos|medical|strain|rest\b|%|percent|chance/i

heading('A usual of the player\'s own')

check('an empty history is steady, with no usual and nothing to say', () => {
  const load = serveLoad([], NOW)
  assert(load.level === 'steady' && load.usual === undefined && load.line === undefined, JSON.stringify(load))
  assert(load.weeks.length === CHART_WEEKS && load.thisWeek === 0, `${load.weeks.length} weeks`)
})

check('usual is the mean of the last four weeks with serves, past any weeks off', () => {
  const load = serveLoad(season([100, 10, 0, 20, 0, 30, 0, 40, 25]), NOW)
  note(`usual ${load.usual}, this week ${load.thisWeek}, ${load.level}`)
  assert(load.usual === 25, `usual ${load.usual}`)
  assert(load.level === 'steady', load.level)
})

check('two weeks is too few to call usual', () => {
  const load = serveLoad(season([0, 0, 20, 20, 60]), NOW)
  assert(load.usual === undefined && load.level === 'steady' && load.line === undefined, JSON.stringify(load))
  assert(serveLoad(season([0, 20, 20, 20, 60]), NOW).level === 'jump', 'three weeks did not make a usual')
})

heading('The level')

check('a jump is the line weekJumpLine holds, and a busy week is not news', () => {
  assert(serveLoad(season([20, 22, 18, 20, 46]), NOW).level === 'jump', 'a doubling read steady')
  assert(serveLoad(season([2, 3, 2, 3, 8]), NOW).level === 'steady', 'three to eight was news')
  assert(weekJumped(30, 20) && !weekJumped(29, 20) && !weekJumped(19, 10), 'the jump line moved')
})

check('building sits below a jump, and needs five serves over', () => {
  const build = serveLoad(season([20, 20, 20, 20, 26]), NOW)
  note(`${build.level}: ${build.line}`)
  assert(build.level === 'building' && build.line !== undefined, JSON.stringify(build))
  assert(serveLoad(season([20, 20, 20, 20, 24]), NOW).level === 'steady', 'four over a usual twenty read as building')
  assert(serveLoad(season([8, 8, 8, 8, 12]), NOW).level === 'steady', 'four over a usual eight read as building')
})

check('wherever weekJumpLine speaks, this says jump on the same usual', () => {
  const ladders = [
    [20, 22, 18, 20, 46],
    [40, 40, 40, 40, 60],
    [10, 12, 9, 14, 40],
    [5, 30, 30, 30, 30, 50],
  ]
  for (const counts of ladders) {
    const sessions = season(counts)
    const weeks = servesPerWeek(sessions, NOW, counts.length)
    const line = weekJumpLine(weeks)
    assert(line !== undefined, `the fixture ${counts} meant a jump`)
    const load = serveLoad(sessions, NOW)
    assert(load.level === 'jump', `${counts}: ${load.level}`)
    assert(line!.includes(`about ${load.usual}`), `${counts}: "${line}" against a usual of ${load.usual}`)
  }
})

check('a fortnightly player gets a usual that weekJumpLine cannot', () => {
  const counts = [20, 0, 20, 0, 20, 0, 20, 0, 60]
  const sessions = season(counts)
  assert(weekJumpLine(servesPerWeek(sessions, NOW, counts.length)) === undefined, 'the older line was meant to be silent here')
  assert(serveLoad(sessions, NOW).level === 'jump', 'a tripled week read steady')
})

check('a practice session\'s serves count, read or not', () => {
  const sessions = season([20, 20, 20, 20, 2])
  const practice = [{ createdAt: NOW - 60_000, found: Array.from({ length: 40 }, (_, i) => i) }]
  const load = serveLoad(sessions, NOW, practice)
  assert(load.thisWeek === 42 && load.level === 'jump', `${load.thisWeek}, ${load.level}`)
})

check('the chart gets eight weeks oldest first, and a scale that holds the usual', () => {
  const load = serveLoad(season([9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 0]), NOW)
  assert(load.weeks.length === CHART_WEEKS && load.weeks[CHART_WEEKS - 1].serves === 0, load.weeks.map((w) => w.serves).join())
  assert(load.weeks.every((w, i) => i === 0 || w.start > load.weeks[i - 1].start), 'the weeks are out of order')
  assert(load.peak === 9, `peak ${load.peak}`)
  assert(serveLoad(season([9, 9, 9, 9, 1]), NOW).peak >= 9, 'the usual fell off the top of the chart')
})

heading('At most one line, and never a claim about a body')

check('a steady week says nothing, even with a flag coming up', () => {
  const load = serveLoad(season([5, 5, 5, 5, 5], ['lumbar_load_posture_collapse']), NOW)
  assert(load.strain.length === 1 && load.strain[0].flag === 'lumbar_load_posture_collapse', JSON.stringify(load.strain))
  assert(load.level === 'steady' && load.line === undefined, load.line ?? '')
})

check('the guidance names the joint when a flag keeps coming up, in one line', () => {
  const load = serveLoad(season([20, 20, 20, 20, 46], ['lumbar_load_posture_collapse']), NOW)
  note(load.line ?? '')
  assert(load.level === 'jump' && /your lower back/.test(load.line ?? ''), load.line ?? 'no line')
  assert(load.strain[0].trips >= 2, 'the fixture meant it to recur')
})

check('a flag this build has no words for falls back to the plain line', () => {
  const load = serveLoad(season([20, 20, 20, 20, 46]), NOW)
  assert(load.line === 'More serves filmed than usual this week. Build up over a few weeks.', load.line ?? 'no line')
})

check('every line passes the voice and claims nothing about a body', () => {
  const flags = [...(Object.keys(INJURY_INPUTS) as InjuryFlag[]).map((f) => [f]), []]
  const lines = new Set<string>()
  for (const f of flags) {
    for (const counts of [[20, 20, 20, 20, 46], [20, 20, 20, 20, 26]]) {
      const line = serveLoad(season(counts, f), NOW).line
      assert(line !== undefined, `no line for ${f} ${counts}`)
      lines.add(line!)
    }
  }
  for (const line of lines) {
    note(line)
    const issues = cueIssues(line)
    assert(issues.length === 0, `"${line}": ${issues.join('; ')}`)
    assert(!MEDICAL.test(line), `a claim about a body: "${line}"`)
    assert(!/—/.test(line), `an em dash in "${line}"`)
  }
  assert(lines.size === 8, `${lines.size} distinct lines`)
})

heading('On the demo season')

;(globalThis as { document?: unknown }).document = { createElement: () => ({ getContext: () => null }) }

check('the season reads as a small, steady load with a flag coming up', () => {
  const { sessions } = sampleHistory(NOW)
  const load = serveLoad(sessions, NOW)
  note(`${load.weeks.map((w) => w.serves).join(' ')}; usual ${load.usual}; this week ${load.thisWeek}; ${load.level}; ${load.line ?? 'no line'}`)
  note(`strain: ${load.strain.map((s) => `${s.flag} ${s.trips} of ${s.of}`).join(', ') || 'none'}`)
  assert(load.strain.some((s) => s.flag === 'lumbar_load_posture_collapse'), 'the seeded back did not come up')
})

report()
