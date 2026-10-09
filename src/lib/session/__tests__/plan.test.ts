/**
 * Planning a practice session (L2.4): the route, the sample, the cost.
 */
import {
  FULL_READS,
  FULL_READ_SAMPLES,
  LIGHT_READ_SAMPLES,
  SESSION_SAMPLE,
  SESSION_SECONDS,
  guessServes,
  isSession,
  minutesOf,
  perSampleMs,
  sampleServes,
  sessionCost,
} from '../plan'
import { planScan } from '../../analysis/serves'
import { cueIssues } from '../../analysis/voice'
import { assert, check, heading, note, report } from '../../analysis/__tests__/harness'

heading('Which clips are sessions')

check('a basket stays a basket and a long clip is a session', () => {
  assert(!isSession(4), 'one serve was read as a session')
  assert(!isSession(SESSION_SECONDS), 'a clip on the line was read as a session')
  assert(isSession(SESSION_SECONDS + 1), 'a clip past the line was read as a basket')
  assert(isSession(30 * 60), 'half an hour was read as a basket')
  assert(!isSession(Number.NaN) && !isSession(Number.POSITIVE_INFINITY), 'a clip with no duration was read as a session')
})

heading('Which serves a sample reads')

check('a short session reads every serve', () => {
  assert(JSON.stringify(sampleServes(9)) === JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7, 8]), 'nine serves were sampled')
  assert(sampleServes(0).length === 0, 'a session with no serves read something')
})

check('a long session reads twelve, weighted to the start and the end', () => {
  for (const count of [13, 20, 50, 120]) {
    const picked = sampleServes(count)
    note(`${count} serves → ${picked.join(', ')}`)
    assert(picked.length === SESSION_SAMPLE, `${count} serves gave a sample of ${picked.length}`)
    assert(picked.every((i, k) => i >= 0 && i < count && (k === 0 || i > picked[k - 1])), 'the sample is not in order or not inside the session')
    // Five from each end, or the whole of an end that holds fewer.
    const firstThird = Array.from({ length: count }, (_, i) => i).filter((i) => i < count / 3).length
    const lastThird = Array.from({ length: count }, (_, i) => i).filter((i) => i >= (2 * count) / 3).length
    const first = picked.filter((i) => i < count / 3).length
    const last = picked.filter((i) => i >= (2 * count) / 3).length
    assert(
      first >= Math.min(5, firstThird) && last >= Math.min(5, lastThird),
      `${count} serves: ${first} from the first third, ${last} from the last`,
    )
  }
})

heading('What it costs')

check('the estimate is the scan, a light read per serve and the full reads', () => {
  const duration = 600
  const c = sessionCost({ duration, serves: 50, reading: 12, perSampleMs: 100 })
  assert(c.locate > planScan(duration).times.length, 'the scan cost left out the refinement')
  assert(c.read === 12 * LIGHT_READ_SAMPLES, `the reads cost ${c.read}`)
  assert(c.full === FULL_READS * FULL_READ_SAMPLES, `the full reads cost ${c.full}`)
  assert(Math.abs(c.seconds - ((c.locate + c.read + c.full) * 100) / 1000) < 1e-9, 'the seconds do not follow the seeks')
  const every = sessionCost({ duration, serves: 50, reading: 50, perSampleMs: 100 })
  assert(every.seconds > c.seconds, 'reading every serve did not cost more than a sample')
  const after = sessionCost({ duration, serves: 50, reading: 12, perSampleMs: 100, located: true })
  assert(after.locate === 0 && after.seconds < c.seconds, 'a scan already run was charged again')
  note(`ten minutes, 50 serves, 100 ms a seek: sample ${minutesOf(c.seconds)}, every serve ${minutesOf(every.seconds)}`)
})

check('a guess at the count before the scan is a practice pace, and never nothing', () => {
  assert(guessServes(600) === 50, `ten minutes guessed ${guessServes(600)} serves`)
  assert(guessServes(3) === 1, 'a very short clip guessed no serves')
})

check('one seek is timed on this file, ignoring the decoder starting up', () => {
  assert(perSampleMs([900, 60, 55, 70, 58, 61, 400, 59]) === 60, `read ${perSampleMs([900, 60, 55, 70, 58, 61, 400, 59])}`)
  assert(perSampleMs([900, 60]) === undefined, 'two timings were treated as enough')
})

check('the time is said in whole minutes a player can read', () => {
  for (const s of [5, 59, 61, 600, 3600]) {
    const line = `Reading every serve takes ${minutesOf(s)}.`
    assert(cueIssues(line).length === 0, `"${line}": ${cueIssues(line).join('; ')}`)
  }
  assert(minutesOf(20) === 'about a minute', minutesOf(20))
})

report()
