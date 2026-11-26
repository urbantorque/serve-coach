/**
 * What makes each serve card on Today different from its neighbour (E2.3),
 * read off real engine output from the rig's serve.
 */
import { sampleAnalysis } from '../../dev/sampleAnalysis'
import type { Analysis } from '../analysis/types'
import { normalise, type Session } from '../storage/db'
import { faultMoment } from '../lookFor'
import { cardScents, vsUsual } from '../serveCardScent'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const DAY = 86_400_000
const T0 = new Date(2026, 9, 10, 10).getTime()

function stored(a: Analysis, id: string, createdAt: number): Session {
  const { frames: _f, ...rest } = a
  void _f
  return normalise({ ...rest, id, createdAt })!
}

heading('No two serve cards read the same (E2.3)')

check('a fault on serve after serve says again, then counts, oldest first', () => {
  const serves = [0, 1, 2].map((i) => stored(sampleAnalysis({ seed: 300 + i }), `s${i}`, T0 + i * 3 * DAY))
  const newestFirst = [...serves].reverse()
  const scents = cardScents(newestFirst, serves)
  const titles = scents.map((s) => s.story.title)
  note(titles.join(' | '))
  for (let i = 1; i < titles.length; i++) assert(titles[i] !== titles[i - 1], `neighbours read the same: "${titles[i]}"`)
  const fix = scents.filter((s) => s.story.kind === 'fix')
  if (fix.length === 3) {
    assert(titles[0].endsWith('3 in a row') && titles[1].endsWith('again'), `the run reads ${titles.join(' | ')}`)
    assert(fix.every((s) => s.paint !== undefined && s.moment === faultMoment(serves[0].fundamentals, s.story.flaw)), 'a card is not held at its fault, painted')
  }
})

check('the score against the usual is said only past the player’s own noise', () => {
  const steady = Array.from({ length: 14 }, (_, i) => stored(sampleAnalysis({ seed: 500 + i, noise: 0.004 }), `u${i}`, T0 + i * DAY))
  const same = stored(sampleAnalysis({ seed: 599, noise: 0.004 }), 'same', T0 + 20 * DAY)
  assert(vsUsual(same, [...steady, same]) === undefined, 'a serve like the usual was given a change')
  const better = { ...same, id: 'better', overall: same.overall + 12 } as Session
  const d = vsUsual(better, [...steady, better])
  note(`a serve 12 over: ${d}`)
  assert(d !== undefined && d > 0, 'a serve well over the usual said nothing')
})

report()
