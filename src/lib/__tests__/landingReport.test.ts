/**
 * The landing's serve as a stored report (Mirror M0.1): real footage for the
 * screens a player's own clip appears on, which the rig cannot supply.
 *
 * `scripts/landing-serve.mjs` reads the licensed clip with the engine and
 * files the read as `saveSession` would, every time in it moved onto the
 * trimmed `serve.mp4`. This holds that it is a report the app can open, on
 * today's rubric, saying what its own card says, with its times inside the
 * clip it plays with.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
import { pickFocus } from '../analysis/analyze'
import { overallOf } from '../analysis/coaching'
import { rescoreStoredCard } from '../analysis/metrics'
import { SCORING_VERSION, rescorable } from '../analysis/types'
import { normalise } from '../storage/db'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as { readFileSync: (p: string, e?: 'utf8') => string & { length: number } }
const text = fs.readFileSync('public/landing/report.json', 'utf8')
const raw = JSON.parse(text) as Record<string, unknown>
const session = normalise(raw)

heading('The landing’s serve, as a report (Mirror M0.1)')

check('it is a stored report the app opens, small, with no frames', () => {
  assert(session !== undefined, 'normalise refuses it')
  assert(!('frames' in raw), 'it carries the frames a stored report drops')
  assert(session!.track !== undefined, 'no track, so no figure can be drawn from it')
  assert(session!.phases.every((p) => !p.thumbnail), 'it carries stills it doesn’t need')
  note(`${(text.length / 1024).toFixed(1)} kB, ${session!.overall}, “${session!.focus.title}”`)
  assert(text.length < 64 * 1024, `${text.length} bytes`)
})

check('on today’s rubric, saying what its own card says', () => {
  const s = session!
  const v = s.scoringVersion ?? 0
  assert(v === SCORING_VERSION || rescorable(v), `saved on ${v}, a measurement changed since: run node scripts/landing-serve.mjs`)
  const card = v === SCORING_VERSION ? s.fundamentals : rescoreStoredCard(s.fundamentals, s.serveType)
  assert(overallOf(card) === s.overall, `the card scores ${overallOf(card)}, the report says ${s.overall}`)
  assert(pickFocus(card).title === s.focus.title, `the card’s first fix is “${pickFocus(card).title}”`)
})

check('every time in it sits inside the clip it plays with', () => {
  const s = session!
  const end = s.video.durationMs / 1000
  assert(s.video.name === 'serve.mp4' && end > 1 && end < 4, `the clip is ${s.video.name}, ${end} s`)
  const ts = s.phases.map((p) => p.t)
  assert(ts.every((t) => t >= 0 && t <= end), `a moment outside the clip: ${ts.join(', ')}`)
  assert(ts.every((t, i) => i === 0 || t >= ts[i - 1]), `moments out of order: ${ts.join(', ')}`)
  assert(s.window.start >= 0 && s.window.end <= end + 1e-3 && s.window.start < s.window.end, `window ${s.window.start} to ${s.window.end}`)
  if (s.contact) assert(s.contact.t >= 0 && s.contact.t <= end, `contact at ${s.contact.t}`)
  const times = s.track!.times
  assert(times.every((t, i) => i === 0 || t > times[i - 1]), 'the track runs backwards')
  const contact = s.phases.find((p) => p.id === 'contact')!
  assert(contact.t >= times[0] && contact.t <= times[times.length - 1], 'contact is outside the track')
})

check('one serve in it: the copy is that serve’s window alone', () => {
  assert(session!.serves.count === 1 && session!.serves.index === 0, JSON.stringify(session!.serves))
})

check('the dev route opens it, as a reopened report and as the court screen', () => {
  const routes = fs.readFileSync('src/dev/demoRoutes.ts', 'utf8')
  assert(routes.includes('landing/report.json') && routes.includes('landing/serve.mp4'), 'the route doesn’t read the report and its clip')
  assert(/keepClip\(clipIdOf\(session\.id\)/.test(routes), 'the report isn’t opened with its clip kept, as a player’s is')
  const tour = fs.readFileSync('scripts/tour.mjs', 'utf8')
  assert(tour.includes("'/?demo=real'") && tour.includes("'/?demo=real&glance'"), 'the tour doesn’t shoot the real footage')
})

report()
