/**
 * Your best serve as the model (D4.5): which earlier serve is "best", and the
 * one line that sets the focus fault against it.
 */
import { bestPriorTo, focusAgainstBest } from '../bestServe'
import { sampleAnalysis } from '../../dev/sampleAnalysis'
import { SCORING_VERSION, type Analysis } from '../analysis/types'
import type { Session } from '../storage/db'
import type { ServeType } from '../storage/prefs'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const BASE = sampleAnalysis()

function serve(
  id: string,
  createdAt: number,
  overall: number,
  extra: Partial<Session> & { serveType?: ServeType } = {},
): Session {
  const { frames: _f, ...rest } = BASE as Analysis
  void _f
  return { ...rest, id, createdAt, overall, scoringVersion: SCORING_VERSION, ...extra } as Session
}

heading('Which earlier serve is the best one')

check('the best is the highest score of the same type and rubric, and nothing else', () => {
  const history: Session[] = [
    serve('flat-70', 1, 70),
    serve('flat-85-shaky', 2, 85, { consistency: { ...(BASE.consistency ?? {}), score: 40 } as Session['consistency'] }),
    serve('kick-95', 3, 95, { serveType: 'kick' }),
    serve('flat-85-steady', 4, 85, { consistency: { ...(BASE.consistency ?? {}), score: 90 } as Session['consistency'] }),
    serve('flat-99-refused', 5, 99, { triage: { ...BASE.triage!, status: 'rejected', reason: 'too_blurry' } }),
    serve('flat-97-old-rubric', 6, 97, { scoringVersion: SCORING_VERSION - 1 }),
    serve('flat-88-later', 9, 88),
  ]
  const best = bestPriorTo(history, 8, 'flat', SCORING_VERSION)
  note(`best before t=8: ${best?.id}`)
  assert(best?.id === 'flat-85-steady', `picked ${best?.id}: a tie on score goes to the steadier basket`)
  assert(bestPriorTo(history, 2, 'flat', SCORING_VERSION)?.id === 'flat-70', 'only serves before this one count')
  assert(bestPriorTo(history, 8, 'kick', SCORING_VERSION)?.id === 'kick-95', 'a kick report found no kick')
  assert(bestPriorTo(history, 3, 'kick', SCORING_VERSION) === undefined, 'a kick was compared with flat serves')
  assert(bestPriorTo(history, 1, 'flat', SCORING_VERSION) === undefined, 'the first serve had a best before it')
})

heading('The focus set against the best')

check('the focus fault is set against the best serve on its own card row', () => {
  // A toss that drifts against a best serve whose toss held still.
  const best = { ...serve('best', 1, 90) }
  const drifting = sampleAnalysis({ tossWobble: 0.09 })
  const now = { ...drifting, id: 'now' }
  const line = focusAgainstBest('toss_drift', now, best)
  note(line ?? 'nothing')
  const bestRow = best.fundamentals.flatMap((f) => f.metrics).find((m) => m.id === 'tossPathWobble')
  const nowRow = now.fundamentals.flatMap((f) => f.metrics).find((m) => m.id === 'tossPathWobble')
  if (bestRow && nowRow && nowRow.score < bestRow.score) {
    // In the card's own readouts since L1.5, never the engine's figure.
    const said = (m: { readout: string }) => m.readout.charAt(0).toLowerCase() + m.readout.slice(1)
    assert(Boolean(line?.includes(said(bestRow))), 'the line doesn’t read the best serve out as its card did')
    assert(Boolean(line?.includes(said(nowRow))), 'the line doesn’t read this serve out as its card did')
    assert(!line?.includes(bestRow.display) && !line?.includes(nowRow.display), 'a raw figure reached the line')
    // Against a last serve that drifted further, this one is closer.
    const worse = { ...sampleAnalysis({ tossWobble: 0.14 }), id: 'last' }
    assert(Boolean(focusAgainstBest('toss_drift', now, best, worse)?.includes('Closer')), 'a toss closer to the best wasn’t said to be')
  } else {
    assert(line === 'This reading is as good as your best serve.', `the line read "${line}"`)
  }
})

check('a fault with no row, or a best that is this serve, says nothing', () => {
  const best = serve('best', 1, 90)
  assert(focusAgainstBest('waiters_tray', { ...BASE, id: 'now' }, best) === undefined, 'a fault with no card row borrowed one')
  assert(focusAgainstBest('toss_drift', best, best) === undefined, 'a serve was set against itself')
  assert(focusAgainstBest(undefined, { ...BASE, id: 'now' }, best) === undefined, 'a focus with no fault was set against the best')
})

report()
