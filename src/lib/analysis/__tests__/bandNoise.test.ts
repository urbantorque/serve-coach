/**
 * No graded band narrower than the camera's noise on it (Q5).
 *
 * Q4 took the coil off the card because its band was about as wide as its
 * noise: a serve could move from inside to outside it with nothing changed but
 * the take. Nothing checked for that, so it sat graded for weeks. This does, for
 * every row the card scores.
 *
 * The rule: a serve held at the middle of a band reads inside it on 95% of
 * takes, which asks for a half-width of 1.96 noise deviations. The deviation is
 * `CARD_NOISE_SD`, the worst of the real serves and the rig's, so the rule is
 * judged on the hardest case the bench has.
 */
import { FUNDAMENTALS, METRICS } from '../coaching'
import { CARD_NOISE_SD } from '../cardNoise'
import { assert, check, heading, note, report } from './harness'

/** Two-sided 95%: the half-width a centred serve needs to stay inside. */
const Z95 = 1.96

/**
 * Graded rows that do not clear the rule yet, and why they stay graded. The
 * check below fails when one clears it, so the entry goes with it. None does
 * today: arm extension, the last, was 9.63° on its 35° band until it was read
 * off curves through the samples (`straightestArm`), and is 6.45° now.
 */
const KNOWN: Record<string, string> = {}

const graded = [...new Set(Object.values(FUNDAMENTALS).flatMap((f) => f.metrics))]

heading('No graded band narrower than its noise (Q5)')

check('a serve at the middle of every graded band reads inside it on 95% of takes', () => {
  const short: string[] = []
  const unmeasured: string[] = []
  for (const id of graded) {
    const sd = CARD_NOISE_SD[id]
    if (sd === undefined) {
      unmeasured.push(id)
      continue
    }
    const [lo, hi] = METRICS[id].ideal
    const need = Z95 * sd
    const half = (hi - lo) / 2
    note(`${id}: half-width ${+half.toFixed(4)} against ${+need.toFixed(4)} (${(need / half).toFixed(2)})`)
    if (half < need) short.push(id)
  }
  note(`no measured noise, so not judged: ${unmeasured.join(', ')}`)
  for (const id of short) assert(id in KNOWN, `${id}'s band is narrower than its noise asks for`)
  for (const id of Object.keys(KNOWN)) {
    assert(short.includes(id), `${id} now clears the rule: drop it from KNOWN`)
  }
})

check('only the ball readings go unjudged, because the bench has no ball', () => {
  const unmeasured = graded.filter((id) => CARD_NOISE_SD[id] === undefined)
  const ball = new Set(['tossPeakHeight', 'ballContactHeight', 'contactBelowPeak'])
  for (const id of unmeasured) assert(ball.has(id), `${id} is graded with no measured noise`)
})

check('every row the noise table names is still graded', () => {
  // A row that leaves the card (Q4's coil) and keeps its entry here is a
  // figure nothing reads, and a reason to believe a row is graded when it is not.
  for (const id of Object.keys(CARD_NOISE_SD)) assert(graded.includes(id), `${id} has a noise figure and no graded row`)
})

report()
