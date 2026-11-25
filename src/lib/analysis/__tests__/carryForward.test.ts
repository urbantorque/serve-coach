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
import { faultMove, previousOnTrip, rotationMove, type ComparableServe } from '../carryForward'
import { faultMoveLine } from '../verdict'
import { FLAWS } from '../flaws'
import type { FaultMove } from '../carryForward'
import { cueIssues, wordCount } from '../voice'
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

check('a serve on an earlier trip isn’t a comparison', () => {
  const now = serve(3 * DAY, 'now')
  const prev = previousOnTrip(
    [serve(0, 'old'), now],
    now,
    (x, y) => Math.abs(x.createdAt - y.createdAt) < DAY,
  )
  assert(prev === undefined, 'reached back past the trip boundary')
})

check('a serve filed after this one isn’t a "previous"', () => {
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
  assert(faultMove(before, after)?.verdict === 'closer', 'a real improvement wasn’t reported')
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

check('a serve type switch isn’t a comparison', () => {
  const before = serve(0, 'a', { serveType: 'flat' })
  const after = serve(60_000, 'b', { serveType: 'kick', miss: 0.01 })
  assert(faultMove(before, after) === undefined, 'compared across two different target bands')
})

check('a target tier that moved between the two serves isn’t a comparison', () => {
  const before = serve(0, 'a', { tier: 4 })
  const after = serve(60_000, 'b', { tier: 5, miss: 0.3 })
  assert(
    faultMove(before, after) === undefined,
    'a player who raised their own level was told their serve got worse',
  )
})

check('a reading under the evidence bar on either serve isn’t a comparison', () => {
  const weakBefore = faultMove(
    serve(0, 'a', { confidence: MIN_EVIDENCE - 0.01 }),
    serve(60_000, 'b'),
  )
  const weakAfter = faultMove(
    serve(0, 'a'),
    serve(60_000, 'b', { confidence: MIN_EVIDENCE - 0.01 }),
  )
  assert(weakBefore === undefined, 'built a result on a reading the earlier clip couldn’t take')
  assert(weakAfter === undefined, 'built a result on a reading this clip couldn’t take')
})

check('a fault the later clip couldn’t measure at all isn’t a comparison', () => {
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
  assert(fresh.length > again.length, 'the repeat form wasn’t shorter than the full one')
  assert(!again.startsWith('Last serve'), 'repeated the fault under a heading that already says it')
  assert(again.toLowerCase().includes('last serve'), 'the repeat form lost what it compares against')
})

/*
 * N0.1. The glance sets the repeat form directly under the score's change, so a
 * line with no subject is read as being about the score: "No change from your
 * last serve" under "▲ 9 vs your last serve" told the player two opposite
 * things. Every repeat form has to say it is about the fault.
 */
check('the repeat form says it is about the fault, so it is never read as the score', () => {
  for (const verdict of ['cleared', 'closer', 'same', 'wider'] as const) {
    const line = faultMoveLine({ flaw: FLAW, signal: SIGNAL, before: 1, after: 0, floor: FLOOR, verdict }, true)!
    assert(/\bfault\b/i.test(line), `"${line}" doesn’t say what it is about`)
    assert(!/^no change\b/i.test(line), `"${line}" reads as a verdict on the score`)
  }
})

check('the four verdicts read as four different pieces of news', () => {
  const lines = (['cleared', 'closer', 'same', 'wider'] as const).map(
    (verdict) =>
      faultMoveLine({ flaw: FLAW, signal: SIGNAL, before: 1, after: 0, floor: FLOOR, verdict })!,
  )
  assert(new Set(lines).size === 4, `two verdicts produced the same sentence: ${lines.join(' | ')}`)
  for (const l of lines) assert(l.trim().length > 0, 'a verdict produced an empty line')
})


/* ----------------------------------------- the racket, between two serves --- */

heading('Whether the racket laid back further than last time')

/**
 * R50b. The same reading `Consistency.uncalibrated` reports across a basket,
 * on the surface where a player can still act on it — between serves, on court.
 *
 * The floor is the point of these checks. Two readings differ with their
 * deviations in quadrature, so it is `√2 × 11.8` ≈ **16.7°**, and that refuses
 * most comparisons. R50b said so in advance and said it must not be softened;
 * these hold it there.
 */
function rotServe(opts: {
  deg?: number | null
  lean?: number | null
  type?: 'flat' | 'kick'
  status?: 'ok' | 'rejected'
}): ComparableServe {
  return {
    id: `r-${opts.deg}-${opts.lean}`,
    createdAt: 1,
    serveType: opts.type ?? 'flat',
    triage: { schema: 1, status: opts.status ?? 'ok' } as unknown as ComparableServe['triage'],
    diagnosis: {
      externalRotation: { deg: opts.deg ?? null, confidence: 0.9, lever: 0.8 },
      signals: opts.lean === null || opts.lean === undefined ? {} : { spine_lean_deg: opts.lean },
    } as unknown as Diagnosis,
  }
}

check('a change past the floor is reported, with the floor it cleared', () => {
  // 20° apart at equal lean, against a ~16.7° floor.
  const m = rotationMove(rotServe({ deg: 40, lean: 10 }), rotServe({ deg: 60, lean: 10 }))
  assert(!!m, 'a 20° change at equal posture wasn’t reported')
  assert(Math.abs(m!.delta - 20) < 1e-9, `reported a delta of ${m!.delta}`)
  assert(
    Math.abs(m!.bound - Math.SQRT2 * 11.8) < 1e-6,
    `reported a bound of ${m!.bound?.toFixed(2)}, not √2 × 11.8`,
  )
})

check('most comparisons are refused, and that is the reading rather than a fault', () => {
  // 12° is a real change to a coach's eye and is inside this reading's own noise.
  assert(
    !rotationMove(rotServe({ deg: 40, lean: 10 }), rotServe({ deg: 52, lean: 10 })),
    'a change inside the floor was reported',
  )
})

check('it reports less lay-back as readily as more', () => {
  /*
   * The direction has to survive. A screen that only ever said "further" would
   * be a milestone that speaks on good news, which is the shape this codebase
   * has rejected twice.
   */
  const m = rotationMove(rotServe({ deg: 60, lean: 10 }), rotServe({ deg: 40, lean: 10 }))
  assert(!!m && m.delta < 0, `a 20° reduction came back as ${m?.delta}`)
})

check('a posture change big enough to explain it is refused', () => {
  // 20° of lay-back against 40° of lean difference: the lean alone buys 20°.
  assert(
    !rotationMove(rotServe({ deg: 40, lean: 5 }), rotServe({ deg: 60, lean: 45 })),
    'a change a lean could account for was reported anyway',
  )
})

check('an arm too folded to read drops out rather than reading as no change', () => {
  // `readExternalRotation` returns null below MIN_ROTATION_LEVER. A null read as
  // zero would report a 40° collapse on a serve nobody measured.
  assert(
    !rotationMove(rotServe({ deg: null, lean: 10 }), rotServe({ deg: 40, lean: 10 })),
    'an unreadable trophy arm was compared anyway',
  )
})

check('without both leans there is no bound, so there is no comparison', () => {
  assert(
    !rotationMove(rotServe({ deg: 40, lean: 10 }), rotServe({ deg: 70, lean: null })),
    'a delta was reported with nothing to bound it',
  )
})

check('a kick against a flat isn’t a comparison, on this surface either', () => {
  assert(
    !rotationMove(rotServe({ deg: 40, lean: 10, type: 'flat' }), rotServe({ deg: 70, lean: 10, type: 'kick' })),
    'two different serves were compared',
  )
})

check('a clip the engine rejected has nothing to compare', () => {
  assert(
    !rotationMove(rotServe({ deg: 40, lean: 10 }), rotServe({ deg: 70, lean: 10, status: 'rejected' })),
    'a rejected clip was compared',
  )
})

/* ============= the third producer C5 found and did not read (R83) ========= */

/**
 * `faultMoveLine`, through the editor, for every flaw and every verdict.
 *
 * C5's audit named three functions that assemble a player-facing sentence at
 * runtime and are therefore in no table for `copy.test.ts` and no component for
 * `jsxCopy.test.ts`. It linted two of them and found three shipped defects,
 * including a line that ran 27 words against a 25 cap whenever a six-word metric
 * label was interpolated into it.
 *
 * **This is the third, and it has the same shape.** The fresh form is
 * `Last serve: ${lowerFirst(title)}. ${MOVE_COPY[verdict]}` — a flaw title
 * interpolated into a fixed frame — and the longest flaw title in `FLAW_COPY` is
 * nine words. It is checked here for structure (fresh longer than repeat, the
 * repeat still says what it compares against) and has never been read.
 *
 * Driven across every flaw × every verdict × both forms, off `FLAWS` rather than
 * a pasted list, because a pasted short one is exactly what hid C5's defect.
 */
const MOVE_VERDICTS = ['cleared', 'closer', 'same', 'wider'] as const

check('every fault-move sentence answers to the editor, for every flaw', () => {
  const lines: { text: string; flaw: string; verdict: string; form: string }[] = []
  for (const spec of FLAWS) {
    for (const verdict of MOVE_VERDICTS) {
      for (const again of [false, true]) {
        const text = faultMoveLine({ flaw: spec.flaw, verdict, miss: 0.1, signal: spec.signal, before: 1, after: 1, floor: 0 } as FaultMove, again)
        if (text) lines.push({ text, flaw: spec.flaw, verdict, form: again ? 'repeat' : 'fresh' })
      }
    }
  }
  assert(lines.length >= FLAWS.length * 4, `built only ${lines.length} sentences from ${FLAWS.length} flaws`)

  for (const l of lines) {
    const issues = cueIssues(l.text)
    assert(
      issues.length === 0,
      `${l.flaw}/${l.verdict}/${l.form}: "${l.text}" fails the editor: ${issues.join('; ')}`,
    )
  }
  const longest = lines.reduce((a, b) => (wordCount(b.text) > wordCount(a.text) ? b : a))
  note(`${lines.length} sentences, longest ${wordCount(longest.text)} words: "${longest.text}"`)
  assert(
    wordCount(longest.text) <= 25,
    `"${longest.text}" is ${wordCount(longest.text)} words, over the cap — and it is assembled, ` +
      'so no table and no component gate could ever have seen it',
  )
})

report()
