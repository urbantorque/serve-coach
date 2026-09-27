// One number per quantity (trust): the engine-built demo seed, derived and rendered through every
// place that shows a session value (report headline and tiles, Today, the focus card, Compare and
// the "Did it work?" card, Progress, Metric info), must print the same text for the same session,
// stratum and metric (ui/format/sessionValues.ts + METRICS §4.9 precision).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { MetricId, MetricValue } from '../../analysis/types.ts'
import { resetDbForTests } from '../../data/db.ts'
import { loadDemoData } from '../../data/demo.ts'
import { isSampleSeed, unpackTyped, type SampleSeed } from '../../data/sample.ts'
import { useSettingsStore } from '../../data/stores/settings.ts'
import { paths } from '../shell/paths.ts'
import { compareExperiment, comparisonSessionIds, type SessionData } from '../screens/progress/insights/compare.ts'
import { seriesFor, stratumOf, type SessionBundle } from '../screens/progress/insights/history.ts'
import { serveRows } from '../screens/progress/insights/serves.ts'
import { renderAt } from '../screens/progress/insights/testing.tsx'
import { formatMetric } from './metricFormat.ts'
import { decisionEvidence, headlineFor, sessionMetric } from './sessionValues.ts'

const raw: unknown = JSON.parse(readFileSync(resolve(process.cwd(), 'public/demo/seed@1.json'), 'utf8'))
if (!isSampleSeed(raw)) throw new Error('public/demo/seed@1.json is not a sample seed')
const seed: SampleSeed = unpackTyped(raw)
const bundles: SessionBundle[] = seed.sessions.map((s) => ({ session: s.session, stats: s.stats }))
const data: SessionData[] = seed.sessions.map((s) => ({ session: s.session, stats: s.stats, rows: serveRows(s.serves, s.tags) }))
const byId = (id: string) => data.find((d) => d.session.id === id)
const text = (id: string, v: MetricValue | undefined) => (v ? formatMetric(id, v).text : '(none)')
const HEROES: MetricId[] = ['toss-height-spread', 'toss-forward-spread', 'toss-apex-height', 'contact-height-ratio', 'rhythm-release-to-contact', 'rhythm-spread', 'leg-drive']
/** "toss height varied by about 9.5 cm" → "9.5". */
const headlineNumber = (h: string | null) => h?.match(/varied by (?:about|at least) ([\d.,]+) cm/)?.[1] ?? null

describe('demo seed: one value and one formatter per metric (derived)', () => {
  it('report tiles, Progress series and Metric info read the stored stratum value', () => {
    let checked = 0
    for (const b of bundles) {
      const strata = b.stats?.strata ?? []
      for (const st of strata) {
        // The report shows the stratum's metrics when there are several, else the session's.
        const shown = strata.length > 1 ? st.metrics : b.stats!.metrics
        for (const id of HEROES) {
          const canonical = sessionMetric(b.stats, id, st.key)
          expect(text(id, shown[id]), `${b.session.id} ${id} tile`).toBe(text(id, canonical))
          // Progress and Metric info: the same session through seriesFor (one session, this stratum).
          const point = seriesFor(id, [b], st.key)[0]
          if (point) expect(text(id, point.metric), `${b.session.id} ${id} series`).toBe(text(id, canonical))
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(20)
  })

  it('the headline sentence prints the same spread as the toss tile', () => {
    let headlines = 0
    for (const b of bundles) {
      const h = headlineFor(b.session, b.stats)
      const n = headlineNumber(h)
      if (!n) continue
      headlines++
      const tile = formatMetric('toss-height-spread', sessionMetric(b.stats, 'toss-height-spread', stratumOf(b))!)
      expect(n, `${b.session.id}: "${h}"`).toBe(tile.value)
    }
    expect(headlines).toBeGreaterThanOrEqual(2)
  })

  it('the focus card (Today and the report) shows the decision stratum values', () => {
    let stats = 0
    for (const d of seed.decisions) {
      const own = byId(d.sessionId)
      for (const e of decisionEvidence(d, own?.stats)) {
        const key = d.stratum ?? (own ? stratumOf(own) : undefined)
        expect(text(e.metricId, e.value), `${d.id} ${e.metricId}`).toBe(text(e.metricId, sessionMetric(own?.stats, e.metricId, key)))
        stats++
      }
    }
    expect(stats).toBeGreaterThan(0)
  })

  it('"Did it work?" shows each one-session side as that session\'s own value, the same as its report', () => {
    for (const exp of seed.experiments) {
      const baseline = comparisonSessionIds(exp, 'baseline').map(byId).filter((x): x is SessionData => !!x)
      const retests = comparisonSessionIds(exp, 'retest').map(byId).filter((x): x is SessionData => !!x)
      const m = compareExperiment(exp, baseline, retests)
      const id = exp.primaryMetricId
      const before = byId(exp.baselineSessionIds.at(-1)!)!
      const after = byId(exp.retestSessionIds.at(-1)!)!
      expect(text(id, m.beforeValue)).toBe(text(id, sessionMetric(before.stats, id, exp.stratum)))
      expect(text(id, m.afterValue)).toBe(text(id, sessionMetric(after.stats, id, exp.stratum)))
      // …and the re-test's headline says the same number.
      const n = headlineNumber(headlineFor(after.session, after.stats))
      if (n && id === 'toss-height-spread') expect(formatMetric(id, m.afterValue).value).toBe(n)
    }
  })
})

describe('demo seed: rendered screens agree', () => {
  beforeAll(async () => {
    // Key frames are empty stubs here; object URLs are not needed to read the numbers.
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:stub')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    await resetDbForTests()
    useSettingsStore.setState({ experimentalMetrics: false })
    // Numbers only: the tracks, key frames and videos are left out to keep the load light.
    const light: SampleSeed = { ...seed, sessions: seed.sessions.map((s) => ({ ...s, tracks: [], keyFrames: [], videos: [] })) }
    await loadDemoData(light, async () => new Blob([]))
  }, 30000)

  afterAll(() => vi.restoreAllMocks())

  const retestId = seed.experiments[0].retestSessionIds.at(-1)!
  const baselineId = seed.experiments[0].baselineSessionIds.at(-1)!
  const spreadText = (sessionId: string) => text('toss-height-spread', sessionMetric(byId(sessionId)!.stats, 'toss-height-spread', seed.experiments[0].stratum))

  it('re-test report: headline, toss tile and the "Did it work?" card print one number', async () => {
    renderAt(paths.sessionReport(retestId))
    const card = await screen.findByRole('heading', { name: 'Did it work?' }, { timeout: 15000 })
    const want = spreadText(retestId)
    const n = want.replace(/[^\d.]/g, '')
    expect(document.body.textContent).toMatch(new RegExp(`varied by about ${n.replace('.', '\\.')} cm`))
    const hero = document.querySelector<HTMLElement>('section[aria-labelledby="serve-today"]')
    expect(hero?.textContent).toContain(want)
    expect(card.closest('section')?.textContent).toContain(want)
  }, 30000)

  it('Compare: before and after are the baseline and re-test reports\' own values', async () => {
    renderAt(paths.compare(seed.experiments[0].id))
    const line = await screen.findByText(/Your toss height consistency (went from|stayed at)/, {}, { timeout: 15000 })
    const header = line.closest('header')?.textContent ?? line.textContent ?? ''
    expect(header).toContain(spreadText(baselineId))
    expect(header).toContain(spreadText(retestId))
  }, 30000)

  it('Today: the last session line says the same number as its report', async () => {
    renderAt(paths.today())
    await screen.findByText('Last session', {}, { timeout: 15000 })
    const n = spreadText(retestId).replace(/[^\d.]/g, '')
    expect(document.body.textContent).toMatch(new RegExp(`varied by about ${n.replace('.', '\\.')} cm`))
  }, 30000)
})
