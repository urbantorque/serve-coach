/**
 * A steady toss says which way it was seen (N2.10, the handover's finding 5).
 *
 * Side-on, the angle the filming guide asks for, a toss that wanders sideways
 * points into the lens: one 10 cm wobble reads 1 cm (F5 in `depth.test.ts`).
 * The card used to call that toss "straight up with almost no drift", a claim
 * about an axis the camera never saw. These hold the words to the geometry.
 */
import { sampleAnalysis } from '../../../dev/sampleAnalysis'
import { AXIS_COPY } from '../coaching'
import { cueIssues } from '../voice'
import type { Analysis, Metric } from '../types'
import { assert, check, heading, note, report } from './harness'

const toss = (a: Analysis): Metric | undefined => a.fundamentals.flatMap((f) => f.metrics).find((m) => m.id === 'tossPathWobble')

heading('A steady toss says which way it was seen')

check('side-on, a toss that wanders sideways isn’t called straight without saying so', () => {
  const m = toss(sampleAnalysis({ cameraYaw: 82, tossWobble: 0, tossWobbleLateral: 0.1 }))
  assert(m !== undefined, 'no toss path reading side-on')
  note(`82°, sideways wobble: ${m!.status}, "${m!.insight}"`)
  assert(m!.status !== 'work' || /sideways/.test(m!.insight), 'a fault was named on an axis the camera can’t see')
  assert(m!.status === 'work' || /can’t see/.test(m!.insight) && /sideways/.test(m!.insight), `a clean side-on toss didn’t say sideways is unseen: "${m!.insight}"`)
})

check('side-on, a clean toss says it was seen towards the net and back, and not sideways', () => {
  const m = toss(sampleAnalysis({ cameraYaw: 82, tossWobble: 0, tossWobbleLateral: 0 }))
  note(`82°, clean: ${m?.status}, "${m?.insight}"`)
  assert(m !== undefined && /net/.test(m.insight) && /can’t see/.test(m.insight), `"${m?.insight}"`)
})

check('from in front, the other half is the unseen one', () => {
  const clean = toss(sampleAnalysis({ cameraYaw: 15, tossWobble: 0, tossWobbleLateral: 0 }))
  note(`15°, clean: ${clean?.status}, "${clean?.insight}"`)
  assert(clean !== undefined && /across your body|sideways/.test(clean.insight) && /can’t see/.test(clean.insight) && /net/.test(clean.insight), `"${clean?.insight}"`)
  const wobbly = toss(sampleAnalysis({ cameraYaw: 15, tossWobble: 0, tossWobbleLateral: 0.1 }))
  note(`15°, sideways wobble: ${wobbly?.status}, "${wobbly?.insight}"`)
  assert(wobbly !== undefined && wobbly.status !== 'great' && /sideways/.test(wobbly.insight), 'from in front a sideways wobble went unseen')
})

check('every line is in the house voice', () => {
  for (const [axis, copy] of Object.entries(AXIS_COPY.tossPathWobble ?? {})) {
    for (const [band, line] of Object.entries(copy?.insight ?? {})) {
      const issues = cueIssues(line as string)
      assert(issues.length === 0, `${axis}.${band}: ${issues.join('; ')}`)
    }
  }
})

report()
