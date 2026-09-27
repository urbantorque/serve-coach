import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDbForTests } from '../../../../data/db.ts'
import { addVideo, createSession, putServesWithTracksAndFrames } from '../../../../data/index.ts'
import { useSettingsStore } from '../../../../data/stores/settings.ts'
import { emptyDraft, setEvent, setPoint, stepById } from '../../../../validation/annotation/marks.ts'
import { listChecks } from '../../../../validation/annotation/store.ts'
import { lintCopy } from '../../../copy/lint.ts'
import { paths } from '../../../shell/paths.ts'
import { routes } from '../../../shell/routes.ts'
import { ThemeProvider } from '../../../theme/ThemeProvider.tsx'
import { fixtureServe, fixtureSession, fixtureVideo, type PlaybackFixture } from '../dev/harnessFixture.ts'
import { ChipRadios } from './ChipRadios.tsx'
import { checkScene } from './checkScene.ts'

// fake-indexeddb reads blobs back without their Blob type, so no object URL can be made in jsdom:
// a stored video gets a stand-in URL (nothing is decoded in these tests).
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

/** Real engine output on the synthetic clip baseline-s1, stored as a player's own session with its video. */
async function seed(sessionId: string) {
  const f = JSON.parse(readFileSync(join(process.cwd(), 'src/ui/screens/playback/dev/fixtures/baseline-s1.json'), 'utf8')) as PlaybackFixture
  const videoId = `${sessionId}-video`
  const { serve, track } = fixtureServe(f, { sessionId, index: 1, videoId, analysedAt: '2026-09-26T00:00:00Z' })
  await createSession({ ...fixtureSession(f, { id: sessionId, startedAt: '2026-09-26T19:00:00+10:00', label: 'Tuesday night', videoIds: [videoId], serveIds: [serve.id] }), isDemo: 0 })
  await addVideo({ ...fixtureVideo(f, { id: videoId, sessionId, importedAt: '2026-09-26T19:00:00+10:00', sizeBytes: 3, storage: 'idb' }), isDemo: 0 }, new Blob(['vid'], { type: 'video/mp4' }))
  await putServesWithTracksAndFrames([serve], [track])
  return serve
}

let errors: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  await resetDbForTests()
  useSettingsStore.setState({ experimentalMetrics: false })
  // jsdom has no media pipeline or object URLs.
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

// Seeding the engine fixture and loading Serve detail takes a few seconds in jsdom.
describe('Check this serve', { timeout: 30_000 }, () => {
  it('opens from More actions; while marking nothing of the app is shown', async () => {
    const serve = await seed('real')
    renderAt(paths.serveDetail('real', serve.id))
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }, { timeout: 5000 }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Check this serve' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Check serve 1' }, { timeout: 5000 })).toBeInTheDocument()
    expect(await screen.findByRole('navigation', { name: 'Marks' }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText("The app's answers stay hidden until you save.")).toBeInTheDocument()
    // Blinding: no values, no app frames, no phase names on the neutral scrubber.
    expect(document.querySelectorAll('[data-metric]')).toHaveLength(0)
    expect(document.body.textContent).not.toMatch(/App frame|your height|Drive|Loading/)
    expect(screen.getByRole('slider', { name: 'Frame' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save check' })).toHaveAttribute('aria-disabled', 'true')
    expect(lintCopy(document.body.textContent ?? '')).toEqual([])
  })

  it('marks a frame, saves blind, then compares with the app and records when it was shown', async () => {
    const serve = await seed('real')
    renderAt(`${paths.serveDetail('real', serve.id)}?mode=check`)
    await screen.findByRole('heading', { level: 1, name: 'Check serve 1' }, { timeout: 5000 })
    fireEvent.click(await screen.findByRole('button', { name: /^Release/ }, { timeout: 5000 }))
    // Step to the frame after the app's release (a person one frame late).
    const release = serve.events.tossRelease!.frameIndex
    const slider = screen.getByRole('slider', { name: 'Frame' })
    fireEvent.keyDown(slider, { key: 'Home' })
    const start = Number(slider.getAttribute('aria-valuenow'))
    for (let f = start; f < release + 1; f++) fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(slider).toHaveAttribute('aria-valuenow', String(release + 1))
    fireEvent.click(screen.getByRole('button', { name: `Mark frame ${release + 1}` }))
    expect(screen.getByText(/Marked on frame/)).toHaveTextContent(`Marked on frame ${release + 1}`)
    expect(screen.getByRole('button', { name: 'Save check' })).not.toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Save check' }))

    expect(await screen.findByRole('heading', { name: 'App vs you' })).toBeInTheDocument()
    const timing = screen.getByRole('region', { name: 'Timing' })
    expect(within(timing).getByText('Toss release')).toBeInTheDocument()
    expect(within(timing).getByText('The app is 1 frame earlier (17 ms).')).toBeInTheDocument()
    expect(within(timing).getByText('Within the 1-frame target')).toBeInTheDocument()
    expect(screen.getByText('On this serve the app was within target on 1 of 1 check.')).toBeInTheDocument()
    expect(screen.getByText("One serve can't show how accurate the app is. Exported checks from many serves and players are pooled to measure that.")).toBeInTheDocument()

    await waitFor(async () => {
      const [c] = await listChecks()
      expect(c.events.tossRelease).toEqual({ frameIndex: release + 1, sure: true })
      expect(c.blind).toBe(true)
      expect(c.annotatorRole).toBe('player')
      expect(c.revealedAt).toBeTruthy()
    })
    expect(lintCopy(document.body.textContent ?? '')).toEqual([])
  })

  it('a second person on the same phone starts blind, and the study code is saved with their check', async () => {
    const serve = await seed('real')
    renderAt(`${paths.serveDetail('real', serve.id)}?mode=check`)
    fireEvent.click(await screen.findByRole('button', { name: /^Release/ }, { timeout: 5000 }))
    fireEvent.click(screen.getByRole('button', { name: /^Mark frame/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save check' }))
    await screen.findByRole('heading', { name: 'App vs you' })

    // The first person reopens their marks, then hands the phone over.
    fireEvent.click(screen.getByRole('button', { name: 'Edit marks' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Change who is marking' }))
    const sheet = await screen.findByRole('dialog', { name: 'Who is marking?' })
    fireEvent.click(within(sheet).getByRole('radio', { name: 'A coach' }))
    fireEvent.change(within(sheet).getByLabelText('Initials (optional)'), { target: { value: 'cd' } })
    fireEvent.change(within(sheet).getByLabelText("Player's study code (optional)"), { target: { value: 'p07' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }))

    // Nothing of the first person's marks, and nothing of the app.
    expect(await screen.findByText('Marked by: A coach, CD · Player P07')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Release/ })).toHaveAccessibleName('Release, not marked')
    expect(screen.getByRole('button', { name: 'Save check' })).toHaveAttribute('aria-disabled', 'true')
    expect(document.querySelectorAll('[data-metric]')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: /^Contact/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Mark frame/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save check' }))
    await screen.findByRole('heading', { name: 'App vs you' })
    expect(screen.getByText('One other person has also checked this serve. Their marks stay hidden.')).toBeInTheDocument()
    await waitFor(async () => {
      const checks = await listChecks()
      expect(checks.map((c) => [c.annotator, c.annotatorRole, c.subjectCode ?? null])).toEqual([
        ['ANON', 'player', null],
        ['CD', 'coach', 'P07'],
      ])
      expect(checks[1].events).not.toHaveProperty('tossRelease')
      expect(checks[1].blind).toBe(true)
    })
  })

  it('explains why a serve without its video cannot be checked', async () => {
    const f = JSON.parse(readFileSync(join(process.cwd(), 'src/ui/screens/playback/dev/fixtures/baseline-s1.json'), 'utf8')) as PlaybackFixture
    const { serve, track } = fixtureServe(f, { sessionId: 'gone', index: 1, videoId: 'gone-video', analysedAt: '2026-09-26T00:00:00Z' })
    await createSession(fixtureSession(f, { id: 'gone', startedAt: '2026-08-20T08:00:00+10:00', label: 'Old', videoIds: ['gone-video'], serveIds: [serve.id] }))
    await addVideo(fixtureVideo(f, { id: 'gone-video', sessionId: 'gone', importedAt: '2026-08-20T08:00:00+10:00', sizeBytes: 1, storage: 'deleted' }))
    await putServesWithTracksAndFrames([serve], [track])
    renderAt(`${paths.serveDetail('gone', serve.id)}?mode=check`)
    expect(await screen.findByText('Checking needs the video', undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText(/isn't on this phone any more/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to serve' })).toHaveAttribute('href', paths.serveDetail('gone', serve.id))
  })
})

describe('check overlay', () => {
  const standing = stepById('standing')
  let d = setPoint(emptyDraft(), standing, 'headTopSetup', { frameIndex: 30, x: 0.43, y: 0.48 })
  d = setPoint(d, standing, 'floorSetup', { frameIndex: 30, x: 0.34, y: 0.75 })
  d = setPoint(d, stepById('apex'), 'ballAtApex', { frameIndex: 144, x: 0.64, y: 0.22 })
  d = setEvent(d, 'tossRelease', 108)
  const app = { ballAtApex: { frameIndex: 144, x: 0.639, y: 0.221 }, floorSetup: { frameIndex: 0, x: 0.4, y: 0.746 } }

  it('draws only the marks on the frame being viewed, never the app while marking', () => {
    const marking = checkScene({ frame: 144, draft: d, active: null, app: null })
    expect(marking.prims.map((p) => p.kind)).toEqual(['cross'])
    expect(checkScene({ frame: 30, draft: d, app: null }).prims.filter((p) => p.kind === 'cross')).toHaveLength(2)
    expect(checkScene({ frame: 30, draft: d, app: null }).prims.filter((p) => p.kind === 'segment')).toHaveLength(2)
    expect(checkScene({ frame: 100, draft: d, app: null }).prims).toEqual([])
    expect(marking.labels).toEqual([])
  })

  it('after saving, adds the app points under the marks (standing points on the frame the person used)', () => {
    const result = checkScene({ frame: 144, draft: d, app })
    expect(result.prims.map((p) => p.kind)).toEqual(['dot', 'cross'])
    const standingFrame = checkScene({ frame: 30, draft: d, app })
    expect(standingFrame.prims[0]).toMatchObject({ kind: 'tick', ink: 'optic' })
  })

  it('draws the point the next tap places a little larger', () => {
    const [big] = checkScene({ frame: 144, draft: d, active: 'ballAtApex' }).prims
    const [normal] = checkScene({ frame: 144, draft: d, active: null }).prims
    expect(big.kind === 'cross' && normal.kind === 'cross' && big.sizePx > normal.sizePx).toBe(true)
  })
})

describe('chip radios', () => {
  it('one tab stop; arrow keys and Home/End move and select', () => {
    const onSelect = vi.fn()
    render(
      <>
        <span id="lbl">Measured with</span>
        <ChipRadios labelId="lbl" value="b" onSelect={onSelect} options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }]} />
      </>,
    )
    const group = screen.getByRole('radiogroup', { name: 'Measured with' })
    const radios = within(group).getAllByRole('radio')
    expect(radios.map((r) => r.getAttribute('tabindex'))).toEqual(['-1', '0', '-1'])
    expect(radios[1]).toHaveAttribute('aria-checked', 'true')
    fireEvent.keyDown(radios[1], { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenLastCalledWith('c')
    fireEvent.keyDown(radios[1], { key: 'ArrowLeft' })
    expect(onSelect).toHaveBeenLastCalledWith('a')
    fireEvent.keyDown(radios[1], { key: 'End' })
    expect(onSelect).toHaveBeenLastCalledWith('c')
    fireEvent.click(radios[0])
    expect(onSelect).toHaveBeenLastCalledWith('a')
  })
})
