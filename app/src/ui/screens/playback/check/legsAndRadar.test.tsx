import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDbForTests } from '../../../../data/db.ts'
import { addVideo, createSession, putServesWithTracksAndFrames } from '../../../../data/index.ts'
import { useSettingsStore } from '../../../../data/stores/settings.ts'
import { emptyDraft, setPoint, stepById, toAnnotation } from '../../../../validation/annotation/marks.ts'
import { saveCheck } from '../../../../validation/annotation/store.ts'
import { lintCopy } from '../../../copy/lint.ts'
import { paths } from '../../../shell/paths.ts'
import { routes } from '../../../shell/routes.ts'
import { ThemeProvider } from '../../../theme/ThemeProvider.tsx'
import { fixtureServe, fixtureSession, fixtureVideo, type PlaybackFixture } from '../dev/harnessFixture.ts'
import { radarForSession, radarFromChecks } from '../serveView.ts'
import { checkScene } from './checkScene.ts'

vi.mock('../data.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data.ts')>()
  return {
    ...actual,
    useVideoUrl: (video: Parameters<typeof actual.useVideoUrl>[0]) => (video === undefined ? undefined : video?.storage === 'idb' ? 'blob:test-video' : null),
  }
})

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  )
  return router
}

async function seed(sessionId: string, withMechanics = false) {
  const f = JSON.parse(readFileSync(join(process.cwd(), 'src/ui/screens/playback/dev/fixtures/baseline-s1.json'), 'utf8')) as PlaybackFixture
  const videoId = `${sessionId}-video`
  const { serve, track } = fixtureServe(f, { sessionId, index: 1, videoId, analysedAt: '2026-09-26T00:00:00Z' })
  if (withMechanics) {
    // The dev fixture derives only the toss and contact values; add the engine's lower-body output.
    const at = (frameIndex: number) => ({ frameIndex, tReal: frameIndex / 60, uncertaintyS: 0.05, confidence: 0.8, method: 'pelvis-min' })
    const low = (serve.events.contact?.frameIndex ?? 150) - 21
    serve.events = { ...serve.events, trophy: at(low), lowestHip: at(low) }
    serve.legDrive = { lowestHip: at(low), hipRisePctH: { value: 12.4, sigma: 3 }, hipDropPctH: { value: 5.6, sigma: 2.8 }, driveTimeMs: { value: 350, sigma: 50 } }
    serve.shoulder = { trophyTilt2DDeg: { value: 18, sigma: 6 }, bandConfidence: 0 }
    const est = (id: string, value: number | null, unit: string) => ({ id, value, unit, status: 'estimated' as const, confidence: 0.8, basis: 'test' })
    serve.metrics = {
      ...serve.metrics,
      'leg-drive': est('leg-drive', 12, '% of height'),
      'loading-depth': est('loading-depth', 6, '% of height'),
      'drive-time': est('drive-time', 350, 'ms'),
      'shoulder-tilt-trophy': est('shoulder-tilt-trophy', null, 'band'),
    }
  }
  await createSession({ ...fixtureSession(f, { id: sessionId, startedAt: '2026-09-26T19:00:00+10:00', label: 'Tuesday night', videoIds: [videoId], serveIds: [serve.id] }), isDemo: 0 })
  await addVideo({ ...fixtureVideo(f, { id: videoId, sessionId, importedAt: '2026-09-26T19:00:00+10:00', sizeBytes: 3, storage: 'idb' }), isDemo: 0 }, new Blob(['vid'], { type: 'video/mp4' }))
  await putServesWithTracksAndFrames([serve], [track])
  return serve
}

let errors: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  await resetDbForTests()
  useSettingsStore.setState({ experimentalMetrics: false })
  URL.createObjectURL = vi.fn(() => 'blob:test-video')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
  try {
    localStorage.clear()
  } catch {
    // not available
  }
  errors = vi.spyOn(console, 'error')
})

afterEach(() => {
  expect(errors).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})

describe('Check this serve: hips, shoulders and the radar row', { timeout: 30_000 }, () => {
  it('compares leg drive and the shoulder line in words, never degrees, under "Legs and shoulders"', async () => {
    const serve = await seed('real', true)
    const e = serve.events
    const f = (x: { frameIndex: number } | undefined, fallback: number) => x?.frameIndex ?? fallback
    let d = emptyDraft()
    d = setPoint(d, stepById('standing'), 'headTopSetup', { frameIndex: 10, x: 0.45, y: 0.55 })
    d = setPoint(d, stepById('standing'), 'floorSetup', { frameIndex: 10, x: 0.44, y: 0.75 })
    d = setPoint(d, stepById('release'), 'midHipRelease', { frameIndex: f(e.tossRelease, 100), x: 0.45, y: 0.645 })
    d = setPoint(d, stepById('trophy'), 'shoulderFrontTrophy', { frameIndex: f(e.trophy, 125), x: 0.47, y: 0.6 })
    d = setPoint(d, stepById('trophy'), 'shoulderBackTrophy', { frameIndex: f(e.trophy, 125), x: 0.43, y: 0.61 })
    d = setPoint(d, stepById('hips'), 'midHipLowest', { frameIndex: f(e.lowestHip, 128), x: 0.45, y: 0.657 })
    d = setPoint(d, stepById('contact'), 'midHipContact', { frameIndex: f(e.contact, 150), x: 0.46, y: 0.633 })
    d = { ...d, radar: { value: 88, unit: 'mph', device: 'pocket-radar' } }
    await saveCheck(toAnnotation(d, { serveId: serve.id, sessionId: 'real', videoId: serve.videoId, initials: '', role: 'player', captureFps: 60, now: '2026-09-27T09:00:00.000Z' }))

    renderAt(`${paths.serveDetail('real', serve.id)}?mode=check`)
    expect(await screen.findByRole('heading', { name: 'App vs you' }, { timeout: 8000 })).toBeInTheDocument()
    const legs = screen.getByRole('region', { name: 'Legs and shoulders' })
    expect(within(legs).getByText('Shoulder tilt at the top')).toBeInTheDocument()
    expect(within(legs).getByText(/Coaches check this as a band/)).toBeInTheDocument()
    expect(within(legs).getByText('Leg drive (hip rise)')).toBeInTheDocument()
    expect(within(legs).getAllByText(/2\.5% of height target/).length).toBeGreaterThan(0)
    const timing = screen.getByRole('region', { name: 'Timing' })
    expect(within(timing).getByText('Trophy position')).toBeInTheDocument()
    expect(within(timing).getByText('Lowest hip')).toBeInTheDocument()
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/\d\s*°|degree/)
    expect(lintCopy(text)).toEqual([])
    for (const el of document.querySelectorAll<HTMLElement>('[data-metric]')) expect(el.dataset.status, el.dataset.metric).toBeTruthy()
  })

  it('a radar reading from Check this serve fills "Radar speed (you logged)" with its source', async () => {
    const serve = await seed('real')
    await saveCheck(
      toAnnotation({ ...emptyDraft(), radar: { value: 88, unit: 'mph', device: 'pocket-radar' } }, { serveId: serve.id, sessionId: 'real', videoId: serve.videoId, initials: 'RD', role: 'player', captureFps: 60, now: '2026-09-27T09:00:00.000Z' }),
    )
    renderAt(paths.serveDetail('real', serve.id))
    fireEvent.click(await screen.findByRole('button', { name: 'All values' }, { timeout: 8000 }))
    const row = await screen.findByText('Radar speed (you logged)', {}, { timeout: 8000 })
    const li = row.closest('li')!
    await waitFor(() => expect(li.querySelector('[data-metric="speed-radar-entered"]')?.getAttribute('data-status')).toBe('player-entered'))
    expect(li).toHaveTextContent('142')
    expect(li).toHaveTextContent('Peak speed from Pocket Radar, logged in Check this serve on Sun 27 Sep. You entered 88 mph.')
  })
})

describe('radar row and shoulder overlay (pure)', () => {
  it('takes the latest reading and says how many there were', () => {
    const r = radarFromChecks([
      { updatedAt: '2026-09-26T10:00:00.000Z', reference: { radarKmh: 150, radarDevice: 'other-radar', radarUnit: 'km/h', radarEntered: 150 } },
      { updatedAt: '2026-09-27T10:00:00.000Z', reference: { radarKmh: 141.6, radarDevice: 'pocket-radar', radarUnit: 'mph', radarEntered: 88 } },
      { updatedAt: '2026-09-28T10:00:00.000Z' },
    ])!
    expect(r.value).toMatchObject({ id: 'speed-radar-entered', value: 142, unit: 'km/h', status: 'player-entered' })
    expect(r.note).toMatch(/^Peak speed from Pocket Radar, logged in Check this serve on Sun 27 Sep\. You entered 88 mph\. Latest of 2 readings\.$/)
    expect(radarFromChecks([])).toBeNull()
    expect(radarFromChecks(undefined)).toBeNull()
  })

  it('the session row keeps the latest reading per serve, shows the fastest with its serve, and counts serves', () => {
    const idx = (id: string) => ({ a: 3, b: 7 } as Record<string, number>)[id]
    const r = radarForSession(
      [
        { serveId: 'a', updatedAt: '2026-09-26T10:00:00.000Z', reference: { radarKmh: 170, radarDevice: 'pocket-radar' } },
        { serveId: 'a', updatedAt: '2026-09-27T10:00:00.000Z', reference: { radarKmh: 140, radarDevice: 'pocket-radar' } },
        { serveId: 'b', updatedAt: '2026-09-27T11:00:00.000Z', reference: { radarKmh: 151.4, radarDevice: 'pocket-radar' } },
        { serveId: 'gone', updatedAt: '2026-09-27T11:00:00.000Z', reference: { radarKmh: 200 } },
      ],
      idx,
    )!
    expect(r.value).toMatchObject({ id: 'speed-radar-entered', value: 151, status: 'player-entered', n: 2 })
    expect(r.source).toBe('Pocket Radar, peak')
    expect(r.serveLine).toBe('Fastest of 2 serves you logged, serve 7')
    expect(radarForSession([], idx)).toBeNull()
  })

  it('joins the two shoulder marks on the trophy frame; the app line appears only after saving', () => {
    let d = setPoint(emptyDraft(), stepById('trophy'), 'shoulderFrontTrophy', { frameIndex: 120, x: 0.5, y: 0.4 })
    d = setPoint(d, stepById('trophy'), 'shoulderBackTrophy', { frameIndex: 120, x: 0.45, y: 0.42 })
    const marking = checkScene({ frame: 120, draft: d, app: null })
    expect(marking.prims.filter((p) => p.kind === 'segment')).toHaveLength(1)
    const app = { shoulderFrontTrophy: { frameIndex: 120, x: 0.51, y: 0.39 }, shoulderBackTrophy: { frameIndex: 120, x: 0.46, y: 0.42 } }
    const result = checkScene({ frame: 120, draft: d, app })
    expect(result.prims.filter((p) => p.kind === 'segment')).toHaveLength(2)
    expect(result.prims.filter((p) => p.kind === 'dot')).toHaveLength(2)
  })
})
