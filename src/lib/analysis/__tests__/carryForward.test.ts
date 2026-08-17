/**
 * Did the last serve's fault move, and can the app tell?
 *
 * Every check here is about a *refusal* or about the noise floor, because those
 * are the two ways this feature can lie. Reporting "closer this time" off two
 * readings that differ by less than the tracker's own wobble would be the same
 * failure the whole codebase is arranged against — a confident sentence about
 * something nobody measured — and it would land on the one screen with no room
 * for a caveat, between two serves, while somebody is deciding what to do next.
 *
 * `NOISE_FLOOR` is the threshold under test throughout rather than a number
 * invented here. If those figures are ever re-derived from real footage, these
 * checks follow them automatically, which is the whole point of not writing a
 * second threshold beside them.
 */
import { faultMove, previousOnTrip, type ComparableServe } from '../carryForward'
import { faultMoveLine } from '../verdict'
import { MIN_EVIDENCE, type FlawFinding, type FlawId } from '../flaws'
import { NOISE_FLOOR } from '../tiers'
import type { Diagnosis } from '../diagnose'
import type { Triage } from '../triage'
import { assert, check, heading, note, report } from './harness'

const DAY = 24 * 60 * 60 * 1000

/** The flaw every check below uses, and its measured noise floor. */
const FLAW: FlawId = 'shallow_drop'
const SIGNAL = 'drop_depth_ratio'
const FLOOR = NOISE_FLOOR[SIGNAL]

function finding(over: Partial<FlawFinding> = {}): FlawFinding {
  return {
    flaw: FLAW,
    detected: true,
    signal: SIGNAL,
    value: 0.05,
    unit: 'ratio',
    miss: 0.1,
    target: [0.08, 0.3],
    target_tier: 4,
    severity: 'medium',
    confidence: 0.9,
    ...over,
  }
}

/** A report, thin but shaped like the real thing, carrying one finding. */
function serve(
  createdAt: number,
  id: string,
  opts: {
    miss?: number
    detected?: boolean
    confidence?: number
    tier?: number
    named?: boolean
    status?: Triage['status']
    serveType?: ComparableServe['serveType']
    flaws?: FlawFinding[]
  } = {},
): ComparableServe {
  const f = finding({
    miss: opts.miss ?? 0.1,
    detected: opts.detected ?? true,
    confidence: opts.confidence ?? 0.9,
    target_tier: opts.tier ?? 4,
  })
  const triage = {
    schema: 1,
    status: opts.status ?? 'ok',
    quality: {
      confidence: 0.9,
      blur: 0,
      roll_deg: 0,
      yaw_deg: 90,
      yaw_measured: true,
      swing_samples: 8,
      depth_unreliable: false,
    },
    injury_risk: [],
    suppressed_count: 0,
    ...(opts.named === false
      ? {}
      : {
          primary_flaw: {
            flaw: FLAW,
            group: 'drop',
            signal: SIGNAL,
            value: f.value,
            unit: 'ratio' as const,
            target: f.target,
            target_tier: f.target_tier,
            severity: f.severity,
          },
        }),
  } as Triage
  return {
    id,
    createdAt,
    serveType: opts.serveType ?? 'flat',
    triage,
    diagnosis: { flaws: opts.flaws ?? [f] } as Diagnosis,
  }
}

heading('Which serve the comparison is against')

check('the most recent earlier serve on the trip wins, not the newest in the list', () => {
  const now = serve(3 * 60 * 60 * 1000, 'now')
  const history = [
    serve(0, 'a'),
    serve(60 * 60 * 1000, 'b'),
    serve(2 * 60 * 60 * 1000, 'c'),
    now,
  ]
  const prev = previousOnTrip(history, now, (x, y) => Math.abs(x.createdAt - y.createdAt) < DAY)
  assert(prev?.id === 'c', `picked ${prev?.id ?? 'nothing'} instead of the serve just before`)
})

check('the serve being asked about is never compared against itself', () => {
  // `trySave` writes the report and refreshes the list before the glance
  // renders, so the current serve is normally already in the history handed in.
  const now = serve(DAY, 'now')
  const prev = previousOnTrip([now], now, () => true)
  assert(prev === undefined, 'a serve was compared against itself')
})

check('a serve on an earlier trip is not a comparison', () => {
  const now = serve(3 * DAY, 'now')
  const prev = previousOnTrip(
    [serve(0, 'old'), now],
    now,
    (x, y) => Math.abs(x.createdAt - y.createdAt) < DAY,
  )
  assert(prev === undefined, 'reached back past the trip boundary')
})

check('a serve filed after this one is not a "previous"', () => {
  const now = serve(0, 'now')
  const prev = previousOnTrip([serve(60_000, 'later')], now, () => true)
  assert(prev === undefined, 'a later serve was treated as the earlier one')
})

heading('The noise floor decides what counts as a move')

check('a move smaller than the signal can resolve reads as no change', () => {
  const before = serve(0, 'a', { miss: 0.1 })
  // Half the floor better. A real improvement in arithmetic and not one this
  // camera can tell from filming the same serve twice.
  const after = serve(60_000, 'b', { miss: 0.1 - FLOOR * 0.5 })
  const move = faultMove(before, after)
  note(`floor ${FLOOR}, moved ${(FLOOR * 0.5).toFixed(4)}`)
  assert(move?.verdict === 'same', `called it "${move?.verdict}" inside its own noise floor`)
})

check('a move past the floor is reported, and in the right direction', () => {
  const before = serve(0, 'a', { miss: 0.1 })
  const after = serve(60_000, 'b', { miss: 0.1 - FLOOR * 1.5 })
  assert(faultMove(before, after)?.verdict === 'closer', 'a real improvement was not reported')
})

check('a fault that got worse is reported as plainly as one that improved', () => {
  const before = serve(0, 'a', { miss: 0.1 })
  const after = serve(60_000, 'b', { miss: 0.1 + FLOOR * 1.5 })
  assert(faultMove(before, after)?.verdict === 'wider', 'a regression was softened or dropped')
})

check('the engine clearing the fault beats any arithmetic on the miss', () => {
  // `evaluateFlaws` has a structural override — a racket that never fell — that
  // no subtraction of two misses can see, so `detected` is asked rather than
  // re-derived. Here the miss is unchanged and only `detected` moved.
  const before = serve(0, 'a', { miss: 0.1 })
  const after = serve(60_000, 'b', { miss: 0.1, detected: false })
  assert(faultMove(before, after)?.verdict === 'cleared', 'the engine said gone and this disagreed')
})

check('every graded signal has a floor for this to rest on', () => {
  // The check that would fail if a flaw were added with no measured
  // repeatability behind it — in which case `?? 0` would silently make every
  // wobble a result.
  assert(typeof FLOOR === 'number' && FLOOR > 0, `${SIGNAL} has no noise floor`)
})

heading('What it refuses, and refuses silently')

check('a serve type switch is not a comparison', () => {
  const before = serve(0, 'a', { serveType: 'flat' })
  const after = serve(60_000, 'b', { serveType: 'kick', miss: 0.01 })
  assert(faultMove(before, after) === undefined, 'compared across two different target bands')
})

check('a target tier that moved between the two serves is not a comparison', () => {
  const before = serve(0, 'a', { tier: 4 })
  const after = serve(60_000, 'b', { tier: 5, miss: 0.3 })
  assert(
    faultMove(before, after) === undefined,
    'a player who raised their own level was told their serve got worse',
  )
})

check('a reading under the evidence bar on either serve is not a comparison', () => {
  const weakBefore = faultMove(
    serve(0, 'a', { confidence: MIN_EVIDENCE - 0.01 }),
    serve(60_000, 'b'),
  )
  const weakAfter = faultMove(
    serve(0, 'a'),
    serve(60_000, 'b', { confidence: MIN_EVIDENCE - 0.01 }),
  )
  assert(weakBefore === undefined, 'built a result on a reading the earlier clip could not take')
  assert(weakAfter === undefined, 'built a result on a reading this clip could not take')
})

check('a fault the later clip could not measure at all is not a comparison', () => {
  const before = serve(0, 'a')
  const after = serve(60_000, 'b', { flaws: [] })
  assert(faultMove(before, after) === undefined, 'an absent reading was read as an improvement')
})

check('an earlier serve that named nothing has nothing to have moved', () => {
  assert(
    faultMove(serve(0, 'a', { named: false }), serve(60_000, 'b')) === undefined,
    'invented a fault for the earlier serve to have had',
  )
})

check('a clip the engine rejected is never half of a comparison', () => {
  const rejected = serve(60_000, 'b', { status: 'rejected' })
  assert(faultMove(serve(0, 'a'), rejected) === undefined, 'compared against a refused clip')
  assert(
    faultMove(serve(0, 'a', { status: 'rejected' }), serve(60_000, 'b')) === undefined,
    'compared from a refused clip',
  )
})

heading('The sentence it becomes')

check('naming the fault again is dropped when the heading above already carries it', () => {
  const move = faultMove(serve(0, 'a', { miss: 0.1 }), serve(60_000, 'b', { miss: 0.1 }))!
  const fresh = faultMoveLine(move, false)!
  const again = faultMoveLine(move, true)!
  note(`fresh: "${fresh}" · again: "${again}"`)
  assert(fresh.length > again.length, 'the repeat form was not shorter than the full one')
  assert(!again.startsWith('Last serve'), 'repeated the fault under a heading that already says it')
  assert(again.toLowerCase().includes('last serve'), 'the repeat form lost what it compares against')
})

check('the four verdicts read as four different pieces of news', () => {
  const lines = (['cleared', 'closer', 'same', 'wider'] as const).map(
    (verdict) =>
      faultMoveLine({ flaw: FLAW, signal: SIGNAL, before: 1, after: 0, floor: FLOOR, verdict })!,
  )
  assert(new Set(lines).size === 4, `two verdicts produced the same sentence: ${lines.join(' | ')}`)
  for (const l of lines) assert(l.trim().length > 0, 'a verdict produced an empty line')
})

report()
