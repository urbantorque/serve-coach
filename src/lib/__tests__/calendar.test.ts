/**
 * The week plan as a calendar file, held to RFC 5545 (M3.1).
 */
import { escapeText, fold, sessionDates, weekCalendar } from '../calendar'
import type { WeekPlan } from '../weekPlan'
import { assert, check, heading, report } from '../analysis/__tests__/harness'

const week = {
  from: {},
  items: [
    { title: 'Toss', flaw: 'toss_height', drill: { name: 'Toss and point, then catch', how: 'x', reps: '15 tosses; rest' }, check: 'Twelve of fifteen.' },
    { title: 'Legs', drill: { name: 'Back-leg serves', how: 'x', reps: '15 serves' }, check: 'x' },
  ],
  graduated: [],
} as unknown as WeekPlan
const now = new Date(2026, 9, 22, 9, 30, 0)
const ics = weekCalendar(week, { now, cadence: 'weekly', minutes: 45 })
const enc = new TextEncoder()

heading('A calendar file a phone will take')

check('every line ends in CRLF and none passes 75 octets', () => {
  assert(ics.endsWith('\r\n'), 'the file does not end in CRLF')
  assert(!/[^\r]\n/.test(ics), 'a bare LF line ending')
  for (const line of ics.split('\r\n')) assert(enc.encode(line).length <= 75, `a line of ${enc.encode(line).length} octets: ${line.slice(0, 40)}`)
})

check('folding is undone by a reader, and splits no character', () => {
  const long = 'DESCRIPTION:' + 'Toss and point — '.repeat(12)
  assert(fold(long).replace(/\r\n /g, '') === long, 'unfolding did not give the line back')
})

check('text values escape what RFC 5545 reserves', () => {
  assert(escapeText('a;b,c\\d\ne') === 'a\\;b\\,c\\\\d\\ne', escapeText('a;b,c\\d\ne'))
  assert(ics.replace(/\r\n /g, '').includes('Toss and point\\, then catch'), 'a comma in a drill name went unescaped')
})

check('three sessions a cadence apart, each with a start, an end, an alarm an hour before, and a stable UID', () => {
  const events = ics.split('BEGIN:VEVENT').slice(1)
  assert(events.length === 3, `${events.length} events`)
  for (const e of events) {
    assert(/DTSTART:\d{8}T180000/.test(e), 'a session not at six in the evening')
    assert(/DTEND:\d{8}T184500/.test(e), 'a session not 45 minutes long')
    assert(/BEGIN:VALARM[\s\S]*TRIGGER:-PT1H[\s\S]*END:VALARM/.test(e), 'no alarm an hour before')
    assert(/DTSTAMP:\d{8}T\d{6}Z/.test(e), 'no UTC DTSTAMP')
  }
  const again = weekCalendar(week, { now: new Date(2026, 9, 22, 20, 0, 0), cadence: 'weekly', minutes: 45 })
  const uids = (s: string) => [...s.matchAll(/UID:(\S+)/g)].map((m) => m[1])
  assert(uids(again).join() === uids(ics).join(), 'exporting again later the same day changed the UIDs, so events would duplicate')
  const [a, b] = sessionDates(now, 'fortnightly')
  assert(Math.round((b.getTime() - a.getTime()) / 86_400_000) === 14, 'fortnightly sessions were not two weeks apart')
})

check("today's plan is in the notes", () => {
  const unfolded = ics.replace(/\r\n /g, '')
  assert(unfolded.includes('min: Toss and point\\, then catch: 15 tosses\\; rest\\, then repeat.'), 'the drills are not in the notes')
})

report()
