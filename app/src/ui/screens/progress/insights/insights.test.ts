import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MetricValue } from '../../../../analysis/types.ts'
import { DEMO_FIXTURES } from '../../../../data/fixtures.ts'
import type { ExperimentRecord } from '../../../../data/records.ts'
import { experimentResult } from '../../../../integration/verdict.ts'
import { barSpec, compareExperiment, deviations, localRequest, sameZone, type SessionData } from './compare.ts'
import {
  againstUsual,
  baselineProgress,
  baselineWords,
  matched,
  seriesFor,
  stratumOf,
  stratumWords,
  trendState,
  usualRange,
  type SessionBundle,
} from './history.ts'
import { METRIC_CONFIG } from './metricConfig.ts'
import { linkCandidates, outcomeLinkState, pooledRate, rateCounts, replicates } from './outcomes.ts'
import { apexCm, outcomeCounts, outcomeKind, perServe, serveRows, tossData, usableNumber, type ServeRow } from './serves.ts'
import { formatRange, shortText } from './values.ts'

const FX = DEMO_FIXTURES
const bundle = (i: number): SessionBundle => ({ session: FX.sessions[i].session, stats: FX.sessions[i].stats })
const data = (i: number): SessionData => ({ ...bundle(i), rows: serveRows(FX.sessions[i].serves, FX.sessions[i].tags) })

/** A copy of session 0 with a new id, date and toss spread, for trend tests. */
function variant(id: string, date: string, spread: number, n = 20): SessionBundle {
  const b = structuredClone(bundle(0))
  b.session = { ...b.session, id, visitId: date, startedAt: `${date}T08:00:00+10:00` }
  const m = b.stats!.metrics['toss-height-spread']!
  m.value = spread
  m.n = n
  m.provisional = false
  m.uncertainty = { kind: 'ci95', low: spread * 0.8, high: spread * 1.3 }
  return b
}

describe('metric config matches metrics.json (swc, tau, direction)', () => {
  // Tests run from app/ (vitest root); the spec lives in ../docs.
  const catalogue = JSON.parse(readFileSync(resolve(process.cwd(), '../docs/specs/metrics.json'), 'utf8')) as {
    metrics: { id: string; swc?: { value: number }; tau?: { value: number }; higherIsBetter?: boolean }[]
  }
  for (const [id, cfg] of Object.entries(METRIC_CONFIG)) {
    it(id, () => {
      const m = catalogue.metrics.find((x) => x.id === id)!
      expect(m, id).toBeTruthy()
      const scale = cfg!.kind === 'rate' ? 100 : 1
      expect(cfg!.swc * scale).toBeCloseTo(m.swc!.value)
      expect(cfg!.tau * scale).toBeCloseTo(m.tau!.value)
      if (m.higherIsBetter === true) expect(cfg!.direction).toBe('higher')
      if (m.higherIsBetter === false) expect(cfg!.direction).toBe('lower')
    })
  }
})

describe('serve rows', () => {
  const rows = serveRows(FX.sessions[0].serves, FX.sessions[0].tags)
  it('maps tags to the outcome vocabulary and keeps excluded serves', () => {
    expect(outcomeKind('let')).toBe('untagged')
    expect(outcomeKind(undefined)).toBe('untagged')
    expect(rows).toHaveLength(22)
    expect(rows.filter((r) => !r.included)).toHaveLength(2)
    const c = outcomeCounts(rows)
    expect(c.tagged).toBe(22)
    expect(c.in + c.net + c.long + c.wide).toBe(22)
  })

  it('reads only measured or estimated numbers, never experimental ones', () => {
    const r = rows.find((x) => x.included)!
    expect(usableNumber(r.metrics['trophy-pause'])).toBeNull()
    expect(usableNumber(r.metrics['toss-forward'])).not.toBeNull()
    expect(perServe(rows, 'trophy-pause')).toHaveLength(0)
    expect(perServe(rows, 'toss-forward')).toHaveLength(20)
  })

  it('toss map points use the apex in cm and count peaks above the picture', () => {
    const t = tossData(rows, 1.78)
    expect(t.points).toHaveLength(20)
    expect(t.extrapolated).toBe(1)
    for (const p of t.points) expect(p.yCm).toBeGreaterThan(250)
    expect(apexCm(rows[0], undefined)).toBe(rows[0].metrics['toss-apex-height']!.secondary!.cm)
  })

  it('rear-view rows have no forward position, so nothing is placed on a side map', () => {
    expect(tossData(serveRows(FX.sessions[1].serves, []), 1.78).points).toHaveLength(0)
  })
})

describe('matched history (METRICS §4.4, §4.6; DESIGN §9.2)', () => {
  it('side and rear sessions are never matched (D1)', () => {
    expect(matched(bundle(0), bundle(2))).toBe(true)
    expect(matched(bundle(0), bundle(1))).toBe(false)
    expect(stratumWords(stratumOf(bundle(0)))).toBe('Side view, deuce, first serves')
    expect(stratumWords(stratumOf(bundle(1)))).toBe('View from behind, deuce, first serves')
  })

  it('experimental and too-small sessions never enter a series', () => {
    expect(seriesFor('trophy-pause', [bundle(0), bundle(2)])).toHaveLength(0)
    expect(seriesFor('toss-height-spread', [variant('a', '2026-09-01', 15, 6)])).toHaveLength(0)
  })

  it('usual range needs 2 earlier non-provisional sessions and excludes the latest', () => {
    const s = seriesFor('toss-height-spread', [variant('a', '2026-09-01', 15), variant('b', '2026-09-08', 13), variant('c', '2026-09-15', 9)])
    expect(s.map((p) => p.value)).toEqual([15, 13, 9])
    expect(usualRange(s)).toEqual([13, 15])
    expect(usualRange(s.slice(0, 2))).toBeNull()
    expect(againstUsual(9, [13, 15])).toBe('below')
    expect(againstUsual(14, [13, 15])).toBe('inside')
    expect(againstUsual(14, null)).toBeNull()
  })

  it('baseline, comparison, then a trend with a verdict', () => {
    const one = seriesFor('toss-height-spread', [variant('a', '2026-09-01', 15)])
    expect(trendState('toss-height-spread', one)).toEqual({ kind: 'baseline', have: 1, need: 2 })
    const two = seriesFor('toss-height-spread', [variant('a', '2026-09-01', 15), variant('b', '2026-09-08', 12)])
    expect(trendState('toss-height-spread', two).kind).toBe('comparison')
    const four = seriesFor('toss-height-spread', [20, 16, 12, 9].map((v, i) => variant(`s${i}`, `2026-09-0${i + 1}`, v, 40)))
    const t = trendState('toss-height-spread', four)
    expect(t.kind).toBe('trend')
    if (t.kind === 'trend') expect(['likely-better', 'clearly-better']).toContain(t.result.verdict)
  })
})

describe('Building your baseline (METRICS §4.1)', () => {
  it('counts matched sessions with 8 or more measured serves, and says why a short one does not count', () => {
    const b = bundle(0)
    const short = structuredClone(bundle(0))
    short.session = { ...short.session, id: 'short', startedAt: '2026-09-26T08:00:00+10:00' }
    short.stats!.strata = short.stats!.strata.map((s) => ({ ...s, n: 1, nTotal: 1 }))
    const p = baselineProgress([short], short)
    expect(p).toMatchObject({ have: 0, need: 2, latestServes: 1, latestCounts: false })
    expect(baselineWords(p).body).toMatch(/at least 8 serves.*In your latest, 1 was/)
    expect(baselineProgress([b, short], short).have).toBe(1)
    expect(baselineProgress([b, bundle(2)], bundle(2)).have).toBe(2)
  })

  it('sessions from different set-ups (distance class) never count together', () => {
    const near = structuredClone(bundle(0))
    near.session = { ...near.session, id: 'near' }
    near.stats!.setupKey = 'portrait|close|singles'
    const std = structuredClone(bundle(2))
    std.stats!.setupKey = 'portrait|standard|singles'
    expect(matched(near, std)).toBe(false)
    expect(matched(near, std, 'rhythm-spread')).toBe(true)
    expect(baselineProgress([near, std], std).have).toBe(1)
  })
})

describe('outcomes', () => {
  it('pooled rate: counts, Wilson interval, and the > 150 serves message for a 10-point change', () => {
    expect(rateCounts(FX.sessions[0].stats.metrics['first-serve-in-rate'])).toEqual({ k: 12, n: 22 })
    const p = pooledRate([
      { sessionId: 'a', visitId: '2026-09-01', k: 12, n: 22 },
      { sessionId: 'b', visitId: '2026-09-08', k: 15, n: 22 },
    ])!
    expect(p.k).toBe(27)
    expect(p.n).toBe(44)
    expect(p.ci95[0]).toBeLessThan(p.rate)
    expect(p.ci95[1]).toBeGreaterThan(p.rate)
    expect(p.moreServes).toBe(Number.POSITIVE_INFINITY)
    expect(pooledRate([])).toBeNull()
  })

  it('the ins-and-misses insight waits for 10 of each (METRICS §4.7)', () => {
    const rows = serveRows(FX.sessions[0].serves, FX.sessions[0].tags)
    expect(outcomeLinkState({ engineLink: null, rows, earlier: [] })).toEqual({ kind: 'too-few', nIn: 12, nFault: 8 })
    expect(outcomeLinkState({ engineLink: null, rows: serveRows(FX.sessions[0].serves, []), earlier: [] }).kind).toBe('needs-tags')
  })

  /** 24 serves: ins with the toss about 20 cm further forward than faults. */
  function synthetic(shift: number, seed = 1): ServeRow[] {
    let s = seed
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 6
    return Array.from({ length: 24 }, (_, i) => {
      const kind = i % 2 ? 'in' : 'net'
      const v = (kind === 'in' ? 30 + shift : 30) + rnd()
      const metric: MetricValue = { id: 'toss-forward', value: v, unit: 'cm', status: 'estimated', confidence: 1, basis: '' }
      return { id: `s${i}`, index: i + 1, included: true, exclusions: [], kind, isLet: false, softFlag: false, metrics: { 'toss-forward': metric } } as ServeRow
    })
  }

  it('a contrast is held until a second matched session agrees, then shown', () => {
    const now = synthetic(20)
    const cands = linkCandidates(now)
    expect(cands[0]?.metricId).toBe('toss-forward')
    expect(cands[0]?.diff).toBeGreaterThan(15)
    expect(outcomeLinkState({ engineLink: null, rows: now, earlier: [] }).kind).toBe('held')
    expect(replicates(cands[0], synthetic(-20, 7))).toBe(false)
    const shown = outcomeLinkState({ engineLink: null, rows: now, earlier: [{ sessionId: 'prev', rows: synthetic(15, 3) }] })
    expect(shown.kind).toBe('shown')
  })

  it('no clear difference is a valid answer', () => {
    expect(outcomeLinkState({ engineLink: null, rows: synthetic(0), earlier: [] }).kind).toBe('none')
  })
})

describe('did it work? (METRICS §4.5)', () => {
  const exp = FX.experiment as ExperimentRecord
  it('uses the engine result when stored', () => {
    const m = compareExperiment(exp, [data(0)], [data(2)])
    expect(m.fromEngine).toBe(true)
    expect(m.verdict).toBe('likely-better')
    expect(m.moreServes).toBe(10)
  })

  it('computes locally without a result, and is not comparable without a re-test or baseline', () => {
    const local = { ...exp, result: undefined }
    const m = compareExperiment(local, [data(0)], [data(2)])
    expect(m.fromEngine).toBe(false)
    expect(m.verdict).not.toBe('not-comparable')
    expect(m.before.value).toBeGreaterThan(m.after.value)
    expect(compareExperiment(local, [data(0)], []).verdict).toBe('not-comparable')
    expect(compareExperiment({ ...local, baselineDeleted: true }, [data(0)], [data(2)]).reason).toMatch(/deleted/)
  })

  it('never "clearly" within one session', () => {
    const local = { ...exp, result: undefined, retestSessionIds: [exp.baselineSessionIds[0]] }
    const m = compareExperiment(local, [data(0)], [data(0)])
    expect(m.withinSession).toBe(true)
    expect(m.verdict).not.toMatch(/^clearly/)
  })

  it('chart inputs: nested intervals and the about-the-same zone', () => {
    const m = compareExperiment(exp, [data(0)], [data(2)])
    const b = barSpec('toss-height-spread', m.before)
    expect(b.ci80[0]).toBeGreaterThanOrEqual(b.ci95[0])
    expect(b.ci80[1]).toBeLessThanOrEqual(b.ci95[1])
    const z = sameZone('toss-height-spread', 20)!
    expect(z[0]).toBeCloseTo(17)
    expect(z[1]).toBeCloseTo(23.53, 1)
    const d = deviations('toss-height-spread', [data(0)], 1.78)
    expect(d).toHaveLength(20)
  })

  it('the phone-side fallback IS the stored-result function (one verdict implementation, METRICS §4.5)', () => {
    const local = { ...exp, result: undefined }
    const m = compareExperiment(local, [data(0)], [data(2)], 1.78)
    const stored = experimentResult(localRequest(local, [data(0)], [data(2)], 1.78), local.stratum)
    expect(m.verdict).toBe(stored.verdict)
    // A one-session side shows that session's own stored value, the number its report shows.
    expect(m.beforeValue).toBe(data(0).stats!.metrics['toss-height-spread'])
    expect(m.afterValue).toBe(data(2).stats!.metrics['toss-height-spread'])
    expect(m.before.value).toBe(data(0).stats!.metrics['toss-height-spread']!.value)
    if (m.moreServes !== undefined && Number.isFinite(m.moreServes)) expect(m.moreServes % 5).toBe(0)
  })

  it('a spread baseline session with a single value adds nothing, so it is left out (METRICS §4.2)', () => {
    const one = structuredClone(data(2))
    one.session = { ...one.session, id: 'one-serve' }
    let kept = 0
    one.rows = one.rows.map((r) => (r.included && kept++ === 0 ? r : { ...r, included: false }))
    const req = localRequest({ ...exp, result: undefined }, [data(0), one], [data(2)], 1.78)
    expect(req.baseline.sessionIds).toEqual([data(0).session.id])
  })
})

describe('display helpers', () => {
  it('usual ranges use "to" and collapse equal ends to "about"', () => {
    expect(formatRange('toss-height-spread', [12, 15])).toBe('12 to 15 cm')
    expect(formatRange('rhythm-release-to-contact', [970, 970])).toMatch(/^about 0\.97/)
    expect(formatRange('toss-height-spread', [12, 15])).not.toMatch(/[–—-]/)
  })

  it('compact chart labels drop "× your height"', () => {
    const v = FX.sessions[0].stats.metrics['contact-height-ratio']!
    expect(shortText('contact-height-ratio', v)).toMatch(/×$/)
  })
})
