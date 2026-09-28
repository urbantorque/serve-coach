// Honesty of the rendered report and Metric info on the engine-built sample seed (the sessions every
// new player can open): spin is never measurable, launch speed names its real blocker, capture quality
// is always shown and labelled experimental (DECISIONS D2 addendum), experimental-by-validation
// metrics never promise "more serves", and no unfilled {token} or "couldn't see this" sits beside a
// measured value.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, screen, within } from '@testing-library/react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDbForTests } from '../../../data/db.ts'
import { loadDemoData } from '../../../data/demo.ts'
import { isSampleSeed, unpackTyped, type SampleSeed } from '../../../data/sample.ts'
import { useSettingsStore } from '../../../data/stores/settings.ts'
import { statusCeiling } from '../../../analysis/metrics/catalogue.ts'
import { CAPTURE_EXPERIMENTAL, REASON_FALLBACK, UI } from '../../copy/strings.ts'
import { measureIndex } from '../profile/measureIndex.ts'
import { paths } from '../../shell/paths.ts'
import { renderAt } from '../progress/insights/testing.tsx'
import { emptyDraft, toAnnotation } from '../../../validation/annotation/marks.ts'
import { deleteCheck, saveCheck } from '../../../validation/annotation/store.ts'
import { lintCopy } from '../../copy/lint.ts'

const raw: unknown = JSON.parse(readFileSync(resolve(process.cwd(), 'public/demo/seed@1.json'), 'utf8'))
if (!isSampleSeed(raw)) throw new Error('public/demo/seed@1.json is not a sample seed')
const seed: SampleSeed = unpackTyped(raw)

vi.setConfig({ testTimeout: 30_000 })

beforeAll(async () => {
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:stub')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  await resetDbForTests()
  const light: SampleSeed = { ...seed, sessions: seed.sessions.map((s) => ({ ...s, tracks: [], keyFrames: [], videos: [] })) }
  await loadDemoData(light, async () => new Blob([]))
}, 30_000)

afterAll(() => vi.restoreAllMocks())

beforeEach(() => {
  useSettingsStore.setState({ experimentalMetrics: false })
})

/** The screen's own header (not the app bar, which holds the h1). */
const pageHeader = () => [...document.querySelectorAll<HTMLElement>('header')].find((h) => !h.querySelector('h1'))!

const ghostRow = (id: string) => document.querySelector<HTMLElement>(`#not-available ~ ul [data-metric="${id}"], section[aria-labelledby="not-available"] [data-metric="${id}"]`)

describe('sample report ghost rows (D4, D1)', () => {
  it.each(seed.sessions.map((s) => [s.session.id, s.stats?.strata.length ?? 0] as const))('%s (%i groups): spin is "Not measurable by phone" and speed never asks for a view from behind', async (id) => {
    renderAt(paths.sessionReport(id))
    await screen.findByText('Your serve today', {}, { timeout: 15_000 })
    const spin = ghostRow('spin')
    expect(spin?.textContent).toContain('Not measurable by phone')
    const speed = ghostRow('speed-experimental')
    // Every sample session is 60 fps: the blocker is the frame rate, whatever else went missing.
    expect(speed?.textContent).toContain('Needs 120 fps')
    // No unfilled {token} anywhere on the report (finding 46).
    expect(document.body.textContent ?? '').not.toMatch(/\{[a-z]+\}/i)
    const section = document.querySelector<HTMLElement>('section[aria-labelledby="not-available"]')!
    for (const row of within(section).getAllByRole('listitem')) {
      const metric = row.getAttribute('data-metric')
      if (metric === 'knee-bend-band' || metric === 'shoulder-over-shoulder-contact') continue
      expect(row.textContent, metric ?? '').not.toContain('Needs a view from behind')
    }
  })

  it('experimental-by-validation metrics (landing, shoulder tilt) are not promised with "more serves" while the toggle is off', async () => {
    renderAt(paths.sessionReport('sample-s1'))
    await screen.findByText('Your serve today', {}, { timeout: 15_000 })
    expect(ghostRow('landing-distance')).toBeNull()
    expect(ghostRow('shoulder-tilt-trophy')).toBeNull()
  })

  it('the multi-group report plots only the shown group\'s logged serves, and names the court', async () => {
    renderAt(paths.sessionReport('sample-s1'))
    await screen.findByText('Your serve today', {}, { timeout: 15_000 })
    const s1 = seed.sessions.find((s) => s.session.id === 'sample-s1')!
    const first = s1.stats!.strata[0].key.courtSide
    const logged = s1.tags.filter((t) => t.side === first && t.outcome && t.outcome !== 'let' && t.outcome !== 'unknown')
    if (!logged.some((t) => t.targetZone)) return // no zones logged: no placement chart to check
    const title = await screen.findByText(new RegExp(`of ${logged.length} tagged serves went in`), {}, { timeout: 5000 })
    expect(title.closest('figure')?.textContent).toContain(`${first === 'ad' ? 'Ad' : 'Deuce'} court`)
  })
})

describe('capture quality is always shown, labelled experimental (D2 addendum)', () => {
  it('on the report, with experimental metrics off', async () => {
    renderAt(paths.sessionReport('sample-s3'))
    await screen.findByText('Your serve today', {}, { timeout: 15_000 })
    const header = pageHeader()
    expect(header.textContent).toMatch(/Capture: \w+/)
    expect(header.textContent).toContain(CAPTURE_EXPERIMENTAL)
  })

  it('on Metric info: shown with the toggle off, with the Experimental chip, whatever the sample stored', async () => {
    renderAt(`${paths.metricInfo('capture-quality')}?session=sample-s3`)
    await screen.findByText('What it is', {}, { timeout: 15_000 })
    expect(screen.queryByText(/Experimental \(off\)/)).toBeNull()
    expect(screen.queryByText(/^Measured$/)).toBeNull()
    expect(screen.getAllByText('Experimental').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/only been tested on simulated footage/).length).toBeGreaterThan(0)
  })
})

describe('Metric info never shows a raw {token} or "couldn\'t see this" beside a measured value', () => {
  it('the serving volume check says it starts after four weeks, never "1 of 2 sessions"', async () => {
    for (const s of seed.sessions) {
      renderAt(`${paths.metricInfo('load-flag')}?session=${s.session.id}`)
      await screen.findByText('What it is', {}, { timeout: 15_000 })
      const header = pageHeader()
      expect(header.textContent, s.session.id).not.toMatch(/of 2 sessions/)
      expect(header.textContent, s.session.id).not.toContain('Building your usual range')
      expect(header.textContent, s.session.id).toContain('Starts after four weeks')
      expect(header.textContent, s.session.id).toContain('four weeks')
      cleanup()
    }
  })

  it.each(['leg-drive', 'toss-height-spread', 'rhythm-spread', 'contact-height-ratio', 'loading-depth', 'serve-count', 'load-flag', 'fatigue-flag'])('%s', async (id) => {
    for (const s of seed.sessions) {
      renderAt(`${paths.metricInfo(id)}?session=${s.session.id}`)
      await screen.findByText('What it is', {}, { timeout: 15_000 })
      const header = pageHeader()
      const text = document.body.textContent ?? ''
      expect(text, `${id} ${s.session.id}`).not.toMatch(/\{[a-z]+\}/i)
      if (header.querySelector('[data-status]')?.getAttribute('data-status') !== 'unavailable') expect(header.textContent, `${id} ${s.session.id}`).not.toContain(REASON_FALLBACK)
      cleanup()
    }
  })
})

describe('toss front-to-back: one status everywhere (finding 55)', () => {
  it('sample-s2 with the toggle off never shows the front-to-back readout beside "isn\'t reliable enough to show"', async () => {
    renderAt(paths.sessionReport('sample-s2'))
    await screen.findByText('Your serve today', {}, { timeout: 15_000 })
    const text = document.body.textContent ?? ''
    if (text.includes('Front-to-back spread')) expect(text).not.toContain(UI.tossHeightsOnly)
    expect(text).not.toMatch(/Shown as experimental while front-to-back/)
  })

  it('How we measure lists toss front-to-back consistency with the status the engine gives it', () => {
    const row = measureIndex()
      .flatMap((g) => g.rows.map((r) => ({ ...r, group: g.group })))
      .find((r) => r.id === 'toss-forward-spread')!
    expect(row.status).toBe(statusCeiling('toss-forward-spread', 'day').status)
    expect(row.group).toBe(row.status === 'experimental' ? 'experimental' : 'video')
  })
})

describe('session report: "Radar speed (you logged)" (U2)', () => {
  it('shows the reading logged in Check this serve, player-entered, with its source; no reading, no row', async () => {
    renderAt(paths.sessionReport('sample-s3'))
    await screen.findByText('Your serve today', {}, { timeout: 15_000 })
    expect(document.querySelector('[data-radar-speed]')).toBeNull()
    cleanup()

    const s3 = seed.sessions.find((s) => s.session.id === 'sample-s3')!
    const serve = s3.serves.find((s) => s.included) ?? s3.serves[0]
    const check = await saveCheck(
      toAnnotation({ ...emptyDraft(), radar: { value: 88, unit: 'mph', device: 'pocket-radar' } }, { serveId: serve.id, sessionId: 'sample-s3', videoId: serve.videoId, initials: '', role: 'player', captureFps: 60, now: '2026-09-27T09:00:00.000Z' }),
    )
    try {
      renderAt(paths.sessionReport('sample-s3'))
      await screen.findByText('Your serve today', {}, { timeout: 15_000 })
      const tile = await screen.findByText('Radar speed (you logged)', {}, { timeout: 5000 }).then((el) => el.closest<HTMLElement>('[data-radar-speed]')!)
      expect(tile).toHaveTextContent('142')
      expect(tile).toHaveTextContent('Pocket Radar, peak')
      expect(tile).toHaveTextContent(`Serve ${serve.index}, logged in Check this serve`)
      expect(tile).toHaveTextContent('You logged')
      expect(tile.querySelector('[data-metric="speed-radar-entered"]')?.getAttribute('data-status')).toBe('player-entered')
      expect(lintCopy(tile.textContent ?? '')).toEqual([])
    } finally {
      await deleteCheck(check.id)
      cleanup()
    }
  })
})
