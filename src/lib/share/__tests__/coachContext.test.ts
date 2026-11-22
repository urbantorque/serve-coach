/**
 * What the coach's page adds to one serve: the player's record, what keeps coming
 * back, and what the camera cannot see, read from the same modules the player's
 * own screens use.
 */
import { sampleHistory } from '../../../dev/sampleAnalysis'
import { buildProgress, currentRubricEra } from '../../progress'
import { DEFAULTS } from '../../storage/prefs'
import { coachReportHtml } from '../coachReport'
import { CANNOT_SEE, coachContextOf } from '../coachContext'
import { assert, check, heading, note, report } from '../../analysis/__tests__/harness'

;(globalThis as { document?: unknown }).document = { createElement: () => ({ getContext: () => null }) }

const NOW = new Date(2026, 10, 5, 12).getTime()
const { sessions, tags } = sampleHistory(NOW)
const newest = [...sessions].sort((a, b) => b.createdAt - a.createdAt)[0]
const context = coachContextOf(newest, sessions, tags, DEFAULTS)

heading('This player so far')

check('how long, which way, and how fast', () => {
  note(context.record.join(' | '))
  assert(context.record.some((l) => /serves filmed over \d+ trips since/.test(l) && /Typical score \d+, now \d+\./.test(l)), 'no record')
  assert(context.record.some((l) => l.startsWith('Fastest serve about')), 'no speed, or one that is not said as about')
})

check('a score is never set against one scored under an older rubric', () => {
  // A scoring bump leaves older trips scored the old way. Set against a newer
  // trip, that is the recalibration and not the player (H44).
  const cut = newest.createdAt - 21 * 86400000
  const older = sessions.map((s) => (s.createdAt < cut ? { ...s, scoringVersion: (s.scoringVersion ?? 6) - 1 } : s))
  const mixed = coachContextOf(newest, older, tags, DEFAULTS)
  const line = mixed.record.find((l) => l.includes('serves filmed over')) ?? ''
  note(line)
  const form = buildProgress(older)!
  const era = currentRubricEra(form.trips)
  assert(era.length < form.trips.length, 'the history did not span two rubrics, so this checks nothing')
  const typical = /Typical score (\d+)/.exec(line)?.[1]
  if (era.length > 1) assert(typical === String(era[0].overall), `the typical score was ${typical}, not the first trip of this rubric's ${era[0].overall}`)
  else assert(typical === undefined, 'a score was set against a trip under another rubric')
})

check('what they are on, and what keeps coming back', () => {
  note(context.working.join(' | '))
  assert(context.working[0]?.startsWith('Working on: '), 'nothing says what they are working on')
  assert(context.working.some((l) => /named on \d+ of \d+ recent serves/.test(l)), 'no fault with its count')
})

check('a serve against its own usual says so, without the markup', () => {
  note(context.usual.join(' | '))
  assert(context.usual.length > 0 && !context.usual.join('').includes('**'), 'the usual is missing, or marked up')
})

check('a new player gives the coach nothing to read as a record', () => {
  const one = coachContextOf(newest, [newest], tags, DEFAULTS)
  assert(one.record.every((l) => !l.includes('trips since')), 'one serve claimed a record')
  assert(one.usual.length === 0, 'one serve claimed a usual')
})

heading('On the page')

const page = (c = context) => coachReportHtml(newest, [], [], c)

check('every line lands on the page, and the camera\'s limits with it', () => {
  const html = page()
  for (const l of [...context.record, ...context.working]) assert(html.includes(l.split("'").join('&#39;').split('"')[0].slice(0, 20)), `"${l}" is not on the page`)
  for (const l of CANNOT_SEE) assert(html.includes(l.slice(0, 18)), `"${l}" is not on the page`)
  assert(html.includes('What this cannot see'), 'the limits have no heading')
})

check('with nothing known, the sections are not there, and the limits still are', () => {
  const html = coachReportHtml(newest, [], [])
  assert(!html.includes('This player so far') && !html.includes('their own usual'), 'an empty section was drawn')
  assert(html.includes('What this cannot see'), 'the limits went with them')
})

check('a line is text, whatever it holds', () => {
  const html = page({ record: ['<img src=x onerror=alert(1)>'], working: [], usual: [], marks: ['<script>x</script>'] })
  assert(!html.includes('<img src=x') && !html.includes('<script>x'), 'a line reached the page as markup')
})

check('the marks drawn on the serve reach the coach, with their read-outs and moments (W6.2)', () => {
  const tag = { id: newest.id, taggedAt: 1, marks: [{ kind: 'line' as const, pts: [{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.9 }], t: 1.25 }] }
  const ctx = coachContextOf(newest, sessions, [tag], DEFAULTS)
  assert(ctx.marks.length === 1 && ctx.marks[0] === 'At 1.25 s, a line: 0° from upright, measured on the picture.', ctx.marks.join(' | '))
  const html = coachReportHtml(newest, [], [], ctx)
  assert(html.includes('What the player drew on it') && html.includes('0° from upright'), 'the marks are not on the page')
  const none = coachReportHtml(newest, [], [], coachContextOf(newest, sessions, [], DEFAULTS))
  assert(!none.includes('What the player drew'), 'an empty marks section was drawn')
})

report()
