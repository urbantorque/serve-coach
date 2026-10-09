/**
 * Putting the swing and the sound together (L2.9): the offset between them
 * learned on the clip, not assumed, and a peak heard only where its impact is.
 */
import { HEARD_WINDOW, MIN_PAIRS, PAIR_WINDOW, hearPeaks } from '../fuse'
import { assert, check, heading, near, report } from '../../analysis/__tests__/harness'

const peaks = Array.from({ length: 12 }, (_, i) => 5 + i * 11.3)
/** Each impact 40 ms after its reach peak, give or take a few milliseconds. */
const impacts = peaks.map((p, i) => p + 0.04 + ((i * 7) % 5) * 0.002 - 0.004)
/** A ball bounced before each toss, and one landing after; a partner's rally between. */
const distractors = [...peaks.map((p) => p - 3.1), ...peaks.map((p) => p + 1.2), 61.4, 62.9, 64.1]

heading('The offset, learned')

check('the offset between the reach and the impact is learned from the clip', () => {
  const h = hearPeaks(peaks, [...impacts, ...distractors])!
  near(h.offset, 0.04, 0.005, 'learned offset')
  assert(h.pairs === peaks.length, `paired ${h.pairs}`)
  assert(h.heard.every(Boolean), 'a serve with its impact was not heard')
})

check('a peak with no impact near its moment is not heard, even with sounds around it', () => {
  const quiet = new Set([2, 7])
  const h = hearPeaks(peaks, [...impacts.filter((_, i) => !quiet.has(i)), ...distractors])!
  assert(JSON.stringify([...quiet].map((i) => h.heard[i])) === '[false,false]', 'a silent swing was heard')
  assert(h.heard.filter(Boolean).length === peaks.length - quiet.size, 'a heard serve was lost')
})

check('an impact past the window around its moment does not count', () => {
  // Most impacts where they should be, so the offset is theirs; the last three
  // a beat late, as a partner's shot landing just after the swing would be.
  const late = peaks.map((p) => p + 0.04 + HEARD_WINDOW * 1.5)
  const h = hearPeaks(peaks, [...impacts.slice(0, 9), ...late.slice(9)])!
  near(h.offset, 0.04, 0.005, 'learned offset')
  assert(h.heard.slice(9).every((x) => !x), 'an impact a beat late was taken as the serve')
  assert(h.heard.slice(0, 9).every(Boolean), 'a serve heard on time was lost')
})

check('too few pairs to learn from is no hearing at all', () => {
  assert(hearPeaks(peaks, impacts.slice(0, MIN_PAIRS - 1)) === undefined, 'two pairs taught an offset')
  assert(hearPeaks(peaks, peaks.map((p) => p + PAIR_WINDOW * 2)) === undefined, 'impacts nowhere near a peak paired up')
  assert(hearPeaks([], impacts) === undefined && hearPeaks(peaks, []) === undefined, 'nothing heard from nothing')
})

report()
