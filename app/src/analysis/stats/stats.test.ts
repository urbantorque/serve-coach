import { describe, expect, it } from 'vitest'
import {
  applyProvisionalBand,
  bandProbabilities,
  censoredMedian,
  chiSquareQuantile,
  classifyVerdict,
  coachingVerdict,
  didItWork,
  dropStatisticalOutliers,
  f12Trigger,
  f3Trigger,
  f4Trigger,
  fatigueFlag,
  goodness,
  holm,
  loadFlag,
  mad,
  matchComparison,
  mean,
  median,
  medianInterval,
  meanInterval,
  mulberry32,
  newcombe,
  normalQuantile,
  orderStatisticRank,
  playerReference,
  pooledWithinSessionSd,
  provisionalBandFor,
  quantile,
  replicatedContrast,
  robustSd,
  screenOutcomeContrasts,
  sd,
  servesToConfirm,
  sessionRelativeBand,
  sessionTrend,
  summariseBands,
  summariseCentre,
  summariseRate,
  summariseSpread,
  tQuantile,
  theilSen,
  welch,
  wilson,
  type MatchContext,
} from './index.ts'

function normalSample(n: number, mu: number, sigma: number, seed: number): number[] {
  const rng = mulberry32(seed)
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const u = Math.max(1e-12, rng())
    const v = rng()
    out.push(mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v))
  }
  return out
}

describe('descriptive and distributions', () => {
  it('computes robust and classical summaries', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(mad([1, 2, 3, 4, 100])).toBe(1)
    expect(robustSd([1, 2, 3, 4, 100])).toBeCloseTo(1.4826, 4)
    expect(quantile([1, 2, 3, 4, 5], 0.25)).toBe(2)
    expect(sd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3)
  })

  it('matches textbook quantiles', () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 5)
    expect(tQuantile(0.975, 10)).toBeCloseTo(2.228, 3)
    expect(tQuantile(0.975, 4)).toBeCloseTo(2.776, 3)
    expect(chiSquareQuantile(0.975, 10)).toBeCloseTo(20.483, 2)
    expect(chiSquareQuantile(0.025, 10)).toBeCloseTo(3.247, 2)
  })
})

describe('intervals', () => {
  it('Wilson reproduces the METRICS example (12 of 20 → 38.7–78.1%)', () => {
    const w = wilson(12, 20)
    expect(w.low).toBeCloseTo(0.387, 3)
    expect(w.high).toBeCloseTo(0.781, 3)
  })

  it('Newcombe difference brackets the point difference', () => {
    const d = newcombe(15, 20, 10, 20)
    expect(d.delta).toBeCloseTo(0.25, 6)
    expect(d.low).toBeLessThan(0.25)
    expect(d.high).toBeGreaterThan(0.25)
    expect(d.low).toBeCloseTo(-0.046, 2)
  })

  it('order-statistic ranks follow the METRICS §4.3 table', () => {
    expect(orderStatisticRank(4)).toBeNull()
    expect(orderStatisticRank(5)).toEqual({ j: 1, coverage: 0.938 })
    for (const n of [6, 7, 8]) expect(orderStatisticRank(n)!.j).toBe(1)
    for (const n of [9, 10, 11]) expect(orderStatisticRank(n)!.j).toBe(2)
    for (const n of [12, 13, 14]) expect(orderStatisticRank(n)!.j).toBe(3)
    for (const n of [15, 16]) expect(orderStatisticRank(n)!.j).toBe(4)
    for (const n of [17, 18, 19]) expect(orderStatisticRank(n)!.j).toBe(5)
    for (let n = 9; n < 20; n++) expect(orderStatisticRank(n)!.coverage).toBeGreaterThanOrEqual(0.95)
  })

  it('medians use order statistics below 20 and a seeded bootstrap from 20', () => {
    const small = normalSample(12, 10, 2, 1)
    const mi = medianInterval(small)
    expect(mi.method).toBe('order-statistic')
    const s = [...small].sort((a, b) => a - b)
    expect(mi.low).toBe(s[2])
    expect(mi.high).toBe(s[9])
    const big = normalSample(40, 10, 2, 2)
    const a = medianInterval(big, 0, { seed: 'session-1' })
    const b = medianInterval(big, 0, { seed: 'session-1' })
    expect(a.method).toBe('bootstrap')
    expect(a).toEqual(b)
  })

  it('shared error widens the mean interval in quadrature', () => {
    const xs = normalSample(15, 1.45, 0.02, 3)
    const plain = meanInterval(xs, 0)
    const wide = meanInterval(xs, 0.03)
    expect(wide.high - wide.low).toBeGreaterThan(plain.high - plain.low)
    expect((wide.high - wide.value) ** 2).toBeCloseTo((plain.high - plain.value) ** 2 + (1.959964 * 0.03) ** 2, 6)
  })
})

describe('aggregation', () => {
  it('hides centres below 5 and marks 5–11 provisional', () => {
    expect(summariseCentre([1, 2, 3, 4].map((value) => ({ value })), 'median').hidden).toBe(true)
    const c = summariseCentre([1, 2, 3, 4, 5, 6].map((value) => ({ value })), 'median')
    expect(c.hidden).toBe(false)
    expect(c.provisional).toBe(true)
    expect(c.value).toBe(3.5)
    expect(summariseCentre(normalSample(12, 0, 1, 4).map((value) => ({ value })), 'mean').provisional).toBe(false)
  })

  it('noise-corrects spreads with σ_r only and flags the measurement limit', () => {
    const xs = normalSample(20, 300, 10, 5)
    const s = summariseSpread(xs.map((value) => ({ value, sigmaRandom: 4, sigmaLeak: 5 })))
    const obs = sd(xs)
    expect(s.value).toBeCloseTo(Math.sqrt(obs * obs - 16), 6)
    expect(s.ci95![0]).toBeLessThan(s.value!)
    expect(s.ci95![1]).toBeGreaterThan(s.value!)
    expect(s.nearMeasurementLimit).toBe(false)
    expect(s.provisional).toBe(false)
    const limit = summariseSpread(normalSample(12, 0, 2, 6).map((value) => ({ value, sigmaRandom: 2 })))
    expect(limit.nearMeasurementLimit).toBe(true)
    expect(limit.mayHeadline).toBe(true)
    expect(summariseSpread(normalSample(7, 0, 2, 7).map((value) => ({ value }))).hidden).toBe(true)
  })

  it('reports "at least" when more than 10% of apexes are censored', () => {
    const s = summariseSpread(normalSample(18, 300, 10, 8).map((value) => ({ value })), { nCensored: 3 })
    expect(s.isLowerBound).toBe(true)
    expect(summariseSpread(normalSample(18, 300, 10, 8).map((value) => ({ value })), { nCensored: 1 }).isLowerBound).toBe(false)
  })

  it('treats censored apexes as larger than every uncensored value in the median', () => {
    expect(censoredMedian([1, 2, 3], 2)).toBe(3)
    expect(censoredMedian([1, 2, 3, 4], 1)).toBe(3)
    expect(censoredMedian([1, 2], 3)).toBeNaN()
  })

  it('pools within-session SDs rather than all serves', () => {
    const a = [1, 2, 3]
    const b = [11, 12, 13]
    const pooled = pooledWithinSessionSd([a, b])
    expect(pooled.sd).toBeCloseTo(1, 9)
    expect(pooled.df).toBe(4)
    expect(sd([...a, ...b])).toBeGreaterThan(5)
  })

  it('shows rates as "k of n" below 10 and with a Wilson band from 10', () => {
    expect(summariseRate(7, 9).showPercent).toBe(false)
    const r = summariseRate(12, 20)
    expect(r.showPercent).toBe(true)
    expect(r.provisional).toBe(true)
    expect(r.ci95![0]).toBeCloseTo(0.387, 3)
  })

  it('drops a statistical outlier only when it is far out AND low confidence', () => {
    const vals = [10, 11, 9, 10, 12, 10, 11, 60].map((value, i) => ({ value, confidence: i === 7 ? 0.9 : 0.9 }))
    expect(dropStatisticalOutliers(vals).dropped).toHaveLength(0)
    vals[7].confidence = 0.4
    expect(dropStatisticalOutliers(vals).dropped).toHaveLength(1)
  })

  it('computes band probabilities and the unclear rule', () => {
    const clear = bandProbabilities(30, 6.5, [20, 45])
    expect(clear.band).toBe('typical')
    expect(clear.probabilities.low + clear.probabilities.typical + clear.probabilities.high).toBeCloseTo(1, 9)
    expect(bandProbabilities(21, 6.5, [20, 45]).band).toBe('unclear')
    const s = summariseBands(['typical', 'typical', 'low', 'unclear', 'typical'])
    expect(s.mode).toBe('typical')
    expect(summariseBands(['unclear', 'unclear', 'unclear', 'low', 'typical']).mode).toBe('unclear')
  })

  it('Theil–Sen is robust to one wild point', () => {
    const x = [0, 1, 2, 3, 4, 5, 6]
    const y = [0, 1, 2, 3, 4, 5, 100]
    expect(theilSen(x, y)).toBe(1)
  })
})

describe('"Did it work?" verdicts', () => {
  const sessions = (values: number[][], sigmaShared = 0) => values.map((v, i) => ({ sessionId: `s${i}`, values: v, sigmaShared }))

  it('says clearly better for a large, well-measured gain and not comparable below the minimum n', () => {
    const base = sessions([normalSample(20, 1.4, 0.02, 11), normalSample(20, 1.4, 0.02, 12)])
    const follow = sessions([normalSample(20, 1.5, 0.02, 13), normalSample(20, 1.5, 0.02, 14)])
    const v = didItWork({ kind: 'centre', centre: 'mean', direction: 'higher', metricId: 'contact-height-ratio', swc: 0.015, tau: 0.01, baseline: base, followUp: follow })
    expect(v.verdict).toBe('clearly-better')
    expect(v.words).toBe('Clearly better')
    const small = didItWork({
      kind: 'centre',
      centre: 'mean',
      direction: 'higher',
      metricId: 'contact-height-ratio',
      swc: 0.015,
      tau: 0.01,
      baseline: sessions([[1.4, 1.41, 1.42]]),
      followUp: follow,
    })
    expect(small.verdict).toBe('not-comparable')
    expect(small.words).toMatch(/^Not comparable yet: /)
  })

  it('never says "clearly" within one session and adds the caveat', () => {
    const v = didItWork({
      kind: 'centre',
      centre: 'mean',
      direction: 'higher',
      metricId: 'contact-height-ratio',
      swc: 0.015,
      tau: 0.01,
      withinSession: true,
      baseline: sessions([normalSample(20, 1.4, 0.02, 21)]),
      followUp: sessions([normalSample(20, 1.5, 0.02, 22)]),
    })
    expect(v.verdict).toBe('likely-better')
    expect(v.caveats[0]).toMatch(/Same-session comparison/)
  })

  it('uses the goodness transform for lower-is-better and target bands', () => {
    expect(goodness(5, 'lower')).toBe(-5)
    expect(goodness(30, { band: [20, 60] })).toBe(0)
    expect(goodness(10, { band: [20, 60] })).toBe(-10)
    expect(goodness(70, { band: [20, 60] })).toBe(-10)
  })

  it('returns too-early with a serve count, or the > 150 message for small effects', () => {
    const v = didItWork({
      kind: 'centre',
      centre: 'mean',
      direction: 'higher',
      metricId: 'contact-height-ratio',
      swc: 0.015,
      tau: 0.01,
      baseline: sessions([normalSample(10, 1.45, 0.03, 31)]),
      followUp: sessions([normalSample(10, 1.46, 0.03, 32)]),
    })
    expect(['too-early', 'likely-better', 'likely-worse']).toContain(v.verdict)
    if (v.tooSmallToConfirm) expect(v.words).toMatch(/More than 150 serves/)
    else expect(v.words).toMatch(/About \d+ more serves/)
  })

  it('rates carry "(from your tags)" and use Newcombe', () => {
    const v = didItWork({
      kind: 'rate',
      direction: 'higher',
      metricId: 'first-serve-in-rate',
      swc: 0.1,
      tau: 0.05,
      baseline: { sessionIds: ['a'], k: 10, n: 20, entryMode: 'per-serve-tags' },
      followUp: { sessionIds: ['b'], k: 13, n: 20, entryMode: 'per-serve-tags' },
    })
    expect(v.words).toMatch(/\(from your tags\)$/)
    expect(v.tooSmallToConfirm || (v.moreServes ?? 0) > 0).toBe(true)
    const mixed = didItWork({
      kind: 'rate',
      direction: 'higher',
      metricId: 'first-serve-in-rate',
      swc: 0.1,
      tau: 0.05,
      baseline: { sessionIds: ['a'], k: 10, n: 20, entryMode: 'tally' },
      followUp: { sessionIds: ['b'], k: 13, n: 20, entryMode: 'per-serve-tags' },
    })
    expect(mixed.verdict).toBe('not-comparable')
  })

  it('spreads: bootstrap of corrected variances and the measurement-limit verdict', () => {
    const base = [{ sessionId: 'a', values: normalSample(20, 300, 20, 41), sigmaRandom: 3 }]
    const follow = [{ sessionId: 'b', values: normalSample(20, 300, 6, 42), sigmaRandom: 3 }]
    const v = didItWork({ kind: 'spread', metricId: 'toss-height-spread', swc: 0.15, tau: 0.15, baseline: base, followUp: follow, resamples: 400, seed: 'x' })
    expect(v.delta!).toBeGreaterThan(0.5)
    expect(['clearly-better', 'likely-better']).toContain(v.verdict)
    const lim = didItWork({
      kind: 'spread',
      metricId: 'toss-height-spread',
      swc: 0.15,
      tau: 0.15,
      baseline: [{ ...base[0], nearMeasurementLimit: true }],
      followUp: follow,
    })
    expect(lim.verdict).toBe('at-measurement-limit')
  })

  it('refuses unmatched, ineligible or over-looked comparisons', () => {
    const base = sessions([normalSample(20, 1, 0.1, 51)])
    const common = { kind: 'centre' as const, centre: 'mean' as const, direction: 'higher' as const, metricId: 'leg-drive', swc: 2, tau: 1.5, baseline: base, followUp: base }
    expect(didItWork({ ...common, matched: false, unmatchedReason: 'different set-up' }).words).toBe('Not comparable yet: different set-up')
    expect(didItWork({ ...common, eligible: false }).verdict).toBe('not-comparable')
    expect(didItWork({ ...common, look: 4 }).verdict).toBe('not-comparable')
    expect(didItWork({ ...common, baseline: [{ ...base[0], quality: 'poor' }] }).verdict).toBe('not-comparable')
  })

  it('classifies the rule table in order', () => {
    expect(classifyVerdict(0.5, [0.2, 0.8], [0.3, 0.7], 0.1)).toBe('clearly-better')
    expect(classifyVerdict(0.05, [0.01, 0.09], [0.02, 0.08], 0.1)).toBe('no-clear-change')
    expect(classifyVerdict(0.05, [0.01, 0.2], [0.02, 0.15], 0.1)).toBe('likely-better')
    expect(classifyVerdict(-0.5, [-0.8, -0.2], [-0.7, -0.3], 0.1)).toBe('clearly-worse')
    expect(classifyVerdict(0.0, [-0.3, 0.3], [-0.2, 0.2], 0.1)).toBe('too-early')
  })

  it('plans more serves with the sceptical-prior design effect', () => {
    const p = servesToConfirm({ delta: 0.02, se: 0.02, swc: 0.015, v1: 0.0009, n1: 12, v2: 0.0009, n2: 12, k1: 1, sharedVar: 0, tau: 0.01 })
    expect(p.tooSmall || (p.n! % 5 === 0 && p.n! >= 5)).toBe(true)
    const hopeless = servesToConfirm({ delta: 0.01, se: 0.05, swc: 0.1, v1: 0.25, n1: 20, v2: 0.25, n2: 20, k1: 1, sharedVar: 0, tau: 0.05 })
    expect(hopeless.tooSmall).toBe(true)
  })

  it('offers coaching a structural adapter', () => {
    const r = coachingVerdict({
      metricId: 'toss-height-spread',
      direction: 'decrease',
      baseline: { sessionIds: ['a'], values: normalSample(20, 300, 20, 61), kind: 'spread' },
      followUp: { sessionIds: ['b'], values: normalSample(20, 300, 5, 62), kind: 'spread' },
      sameSession: false,
    })
    expect(['clearly-better', 'likely-better']).toContain(r.verdict)
    expect(coachingVerdict({ metricId: 'spin', direction: 'increase', baseline: { sessionIds: [], values: [], kind: 'centre' }, followUp: { sessionIds: [], values: [], kind: 'centre' }, sameSession: false }).verdict).toBe(
      'not-comparable',
    )
  })
})

describe('matched comparisons and trends', () => {
  const ctx: MatchContext = {
    view: 'side',
    setupClass: 'portrait-near',
    cameraSide: 'chest',
    courtSide: 'deuce',
    serveNumber: 1,
    intendedType: 'unknown',
    handedness: 'right',
  }

  it('requires the hard keys and allows timing metrics across side set-ups', () => {
    expect(matchComparison('toss-apex-height', ctx, { ...ctx }).matched).toBe(true)
    expect(matchComparison('toss-apex-height', ctx, { ...ctx, setupClass: 'landscape-fence' }).matched).toBe(false)
    const timing = matchComparison('rhythm-release-to-contact', ctx, { ...ctx, setupClass: 'landscape-fence' })
    expect(timing.matched).toBe(true)
    expect(timing.notes).toContain('different set-up')
    expect(matchComparison('toss-apex-height', ctx, { ...ctx, view: 'rear' }).matched).toBe(false)
    expect(matchComparison('serve-in-rate', { ...ctx, entryMode: 'match-log' }, { ...ctx, entryMode: 'match-log' }).matched).toBe(false)
    expect(matchComparison('toss-apex-height', ctx, { ...ctx, conditionClass: 'night-lights' }).matched).toBe(true)
  })

  it('needs three sessions for a trend and uses neutral words when asked', () => {
    expect(sessionTrend([{ x: 0, value: 1, se: 0.1 }], { tau: 0.1, swc: 0.1 }).status).toBe('building')
    const t = sessionTrend(
      [
        { x: 0, value: 20, se: 1 },
        { x: 1, value: 30, se: 1 },
        { x: 2, value: 40, se: 1 },
        { x: 3, value: 50, se: 1 },
      ],
      { tau: 2, swc: 8, neutral: { up: 'further in', same: 'about the same', down: 'further back' } },
    )
    expect(t.status).toBe('trend')
    expect(t.neutralWords).toBe('further in')
  })
})

describe('outcome-linked contrasts', () => {
  it('Welch matches a hand calculation and Holm steps down', () => {
    const w = welch([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])!
    expect(w.diff).toBe(-3)
    expect(w.se).toBeCloseTo(Math.sqrt(2.5 / 5 + 10 / 5), 9)
    expect(w.df).toBeCloseTo(5.88, 2)
    expect(holm([0.01, 0.04, 0.03], 0.05)).toEqual([true, false, false])
    expect(holm([0.001, 0.02, 0.2], 0.05)).toEqual([true, true, false])
  })

  it('needs 10 per group, Holm and |Δ| ≥ SWC, then replication in a second session', () => {
    const inV = normalSample(12, 40, 8, 71)
    const faultV = normalSample(12, 10, 8, 72)
    const { checks, candidates } = screenOutcomeContrasts([
      { metricId: 'toss-forward', inValues: inV, faultValues: faultV, swc: 5 },
      { metricId: 'leg-drive', inValues: [1, 2, 3], faultValues: [1, 2, 3], swc: 2 },
    ])
    expect(checks.find((c) => c.metricId === 'leg-drive')!.reason).toBe('TOO_FEW_SERVES')
    expect(candidates.map((c) => c.metricId)).toEqual(['toss-forward'])
    expect(replicatedContrast(candidates, [])).toBeNull()
    const rep = replicatedContrast(candidates, [{ metricId: 'toss-forward', inValues: normalSample(12, 38, 8, 73), faultValues: normalSample(12, 15, 8, 74) }])
    expect(rep?.metricId).toBe('toss-forward')
    const opposite = replicatedContrast(candidates, [{ metricId: 'toss-forward', inValues: normalSample(12, 10, 8, 75), faultValues: normalSample(12, 40, 8, 76) }])
    expect(opposite).toBeNull()
  })
})

describe('flags', () => {
  it('fatigue fires on a clear late drop and not on a flat block', () => {
    const rng = mulberry32(81)
    const declining = Array.from({ length: 20 }, (_, i) => 1.5 - (i >= 12 ? 0.05 : 0) - 0.002 * i + 0.004 * (rng() - 0.5))
    const f = fatigueFlag({ contactRatios: declining, resamples: 300 })
    expect(f.flag).toBe(true)
    expect(f.copy).toMatch(/shorter block/)
    const flat = normalSample(20, 1.5, 0.01, 82)
    expect(fatigueFlag({ contactRatios: flat, resamples: 300 }).flag).toBe(false)
    expect(fatigueFlag({ contactRatios: flat.slice(0, 10) }).computed).toBe(false)
  })

  it('load flag needs 28 days and 3 sessions and uses the uncoupled chronic window', () => {
    expect(loadFlag([{ daysAgo: 1, serves: 200 }], 10).computed).toBe(false)
    const r = loadFlag(
      [
        { daysAgo: 1, serves: 120 },
        { daysAgo: 3, serves: 60 },
        { daysAgo: 10, serves: 50 },
        { daysAgo: 20, serves: 50 },
        { daysAgo: 30, serves: 50 },
      ],
      40,
    )
    expect(r.acute).toBe(180)
    expect(r.chronicWeeklyMean).toBe(37.5)
    expect(r.flag).toBe(true)
  })
})

describe('bands and triggers', () => {
  it('player-relative reference needs two matched sessions of 8+', () => {
    expect(playerReference([normalSample(10, 15, 5, 91)]).status).toBe('building')
    const ref = playerReference([normalSample(10, 15, 5, 91), normalSample(10, 15, 5, 92)])
    expect(ref.status).toBe('ready')
    expect(sessionRelativeBand(ref.mu!, 12, ref, { sessionHalfWidthMin: 5, hysteresis: 2 })).toBe('typical')
    expect(sessionRelativeBand(ref.mu! + 20, 12, ref, { sessionHalfWidthMin: 5, hysteresis: 2 })).toBe('high')
  })

  it('provisional bands keep their label inside the hysteresis margin', () => {
    const band = provisionalBandFor('toss-height-spread')!
    expect(applyProvisionalBand(band, 21)).toBe('high')
    expect(applyProvisionalBand(band, 21, 'typical')).toBe('typical')
    expect(applyProvisionalBand(band, 31, 'typical')).toBe('high')
    expect(provisionalBandFor('contact-height-ratio', { ageBand: '60+' })).toBeNull()
    expect(provisionalBandFor('contact-height-ratio', { intendedType: 'kick' })!.cuts[0]).toBe(1.35)
    expect(provisionalBandFor('landing-distance')).toBeNull()
  })

  it('F3/F4/F12 triggers follow their bound rules', () => {
    expect(f3Trigger({ sdObserved: 22, n: 20, meanSigmaRandom: 2, correctedSd: 21.9, detectedShare: 0.9, axis: 'height' }).likely).toBe(true)
    expect(f3Trigger({ sdObserved: 22, n: 8, meanSigmaRandom: 2, correctedSd: 21.9, detectedShare: 0.9, axis: 'height' }).possible).toBe(true)
    expect(f4Trigger({ medianDropCm: 130, sex: 'male' }).possible).toBe(false)
    expect(f4Trigger({ medianDropCm: 130, sex: 'male', releaseToContactMs: 1200 }).possible).toBe(true)
    expect(f4Trigger({ medianDropCm: 130, sex: 'male', releaseToContactMs: 1200, trophyPauseMs: 600 }).likely).toBe(true)
    expect(f12Trigger({ median: 1.33, n: 12, se: 0.005, sigmaShared: 0.03 }).likely).toBe(true)
    expect(f12Trigger({ median: 1.33, n: 12, se: 0.005, sigmaShared: 0.1 }).possible).toBe(true)
    expect(f12Trigger({ median: 1.33, n: 12, se: 0.005, sigmaShared: 0.03, ageBand: '60+' }).likely).toBe(false)
    expect(mean([1, 2])).toBe(1.5)
  })
})
