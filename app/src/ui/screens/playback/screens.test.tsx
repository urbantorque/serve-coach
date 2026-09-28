import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDbForTests } from '../../../data/db.ts'
import { loadDemoData } from '../../../data/demo.ts'
import { addVideo, createSession, getTally, listKeyFramesForServe, listTags, putKeyFrames, putServesWithTracksAndFrames } from '../../../data/index.ts'
import type { KeyFrameRecord } from '../../../data/records.ts'
import { useSettingsStore } from '../../../data/stores/settings.ts'
import { lintCopy } from '../../copy/lint.ts'
import { paths } from '../../shell/paths.ts'
import { routes } from '../../shell/routes.ts'
import { ThemeProvider } from '../../theme/ThemeProvider.tsx'
import { fixtureServe, fixtureSession, fixtureVideo, type PlaybackFixture } from './dev/harnessFixture.ts'
import { VIDEO_MISSING_LINE } from './serveView.ts'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  )
  return router
}

/** Honesty and copy checks on whatever is rendered (DESIGN §3, §11; README rules 1 and 8). */
function assertHonestAndCalm() {
  for (const el of document.querySelectorAll('[data-metric]')) expect(el.getAttribute('data-status'), el.getAttribute('data-metric') ?? '').toBeTruthy()
  expect(lintCopy(document.body.textContent ?? '')).toEqual([])
}

/** A real engine run on a synthetic clip, stored like the analysis worker would, with the video deleted. */
async function seedFixture(sessionId: string, opts: { storage?: 'deleted' | 'idb'; keyFrames?: boolean } = {}) {
  const f = JSON.parse(readFileSync(join(process.cwd(), 'src/ui/screens/playback/dev/fixtures/baseline-s1.json'), 'utf8')) as PlaybackFixture
  const videoId = `${sessionId}-video`
  const { serve, track } = fixtureServe(f, { sessionId, index: 1, videoId, analysedAt: '2026-09-26T00:00:00Z' })
  await createSession(fixtureSession(f, { id: sessionId, startedAt: '2026-09-26T08:00:00+10:00', label: 'Fixture', videoIds: [videoId], serveIds: [serve.id] }))
  // storage 'idb' without a blob: the record says the clip is on the phone, but its file is missing
  // (imported today, so the 30-day retention sweep leaves the record alone).
  const importedAt = opts.storage === 'idb' ? new Date().toISOString() : '2026-08-20T08:00:00+10:00'
  await addVideo(fixtureVideo(f, { id: videoId, sessionId, importedAt, sizeBytes: 1, storage: opts.storage ?? 'deleted' }))
  if (opts.keyFrames === false) {
    await putServesWithTracksAndFrames([serve], [track])
    return serve
  }
  const frames: KeyFrameRecord[] = (['release', 'apex', 'contact'] as const).map((event) => {
    const e = serve.events[event === 'release' ? 'tossRelease' : event === 'apex' ? 'tossApex' : 'contact']!
    return {
      id: `${serve.id}:${event}:evidence-full`,
      serveId: serve.id,
      sessionId,
      event,
      role: 'evidence-full',
      frameIndex: e.frameIndex,
      tReal: e.tReal,
      width: 540,
      height: 960,
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      createdAt: '2026-09-26T00:00:00Z',
    }
  })
  await putServesWithTracksAndFrames([serve], [track])
  await putKeyFrames(frames)
  const stored = await listKeyFramesForServe(serve.id, 'evidence-full')
  if (stored.length !== 3) throw new Error('key frames not stored: ' + stored.length)
  return serve
}

let errors: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  await resetDbForTests()
  await loadDemoData()
  useSettingsStore.setState({ experimentalMetrics: false })
  errors = vi.spyOn(console, 'error')
})

afterEach(() => {
  expect(errors).not.toHaveBeenCalled()
  errors.mockRestore()
})

describe('Serve detail', () => {
  it('renders a sample serve without video: title, phases, values with data states, reasons for the missing video', async () => {
    renderAt(paths.serveDetail('demo-s1', 'demo-s1-serve-07'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Serve 7' }, { timeout: 5000 })).toBeInTheDocument()
    expect(await screen.findByText('Sample serves have no video. Phases and values are below.')).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Serve timeline' })).toHaveAttribute('aria-valuetext', expect.stringMatching(/frame \d+ of \d+/))
    // The focus is the toss, so playback opens on the peak.
    const values = screen.getByRole('list', { name: 'Values for this serve' })
    expect(within(values).getAllByText(/Estimate/).length).toBeGreaterThan(0)
    expect(screen.getByRole('note')).toHaveTextContent('Sample data')
    assertHonestAndCalm()
  })

  it('expanded, the drawer lists every value by phase, experimental hidden, rear-only slots as reasons', async () => {
    renderAt(paths.serveDetail('demo-s1', 'demo-s1-serve-07'))
    fireEvent.click(await screen.findByRole('button', { name: 'All values' }, { timeout: 5000 }))
    expect(await screen.findByRole('region', { name: 'Toss' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Experimental' })).not.toBeInTheDocument()
    const unavailable = screen.getByRole('region', { name: 'Not available from this session' })
    expect(within(unavailable).getByText('Knee bend')).toBeInTheDocument()
    expect(within(unavailable).getAllByText('Needs a view from behind').length).toBeGreaterThan(0)
    expect(within(unavailable).getByText('Spin')).toBeInTheDocument()
    assertHonestAndCalm()
  })

  it('steps through stored key frames with overlays when the video was deleted', async () => {
    const serve = await seedFixture('fixture-deleted')
    renderAt(paths.serveDetail('fixture-deleted', serve.id))
    expect(await screen.findByText('Video deleted after 30 days. Key frames kept.', undefined, { timeout: 5000 })).toBeInTheDocument()
    const slider = screen.getByRole('slider', { name: 'Serve timeline' })
    // No focus decision: opens on contact.
    expect(slider).toHaveAttribute('aria-valuenow', String(serve.events.contact!.frameIndex))
    fireEvent.click(screen.getByRole('button', { name: 'Previous key frame' }))
    expect(slider).toHaveAttribute('aria-valuenow', String(serve.events.tossApex!.frameIndex))
    // Overlay chips are a radio group, one at a time.
    const toss = screen.getByRole('radio', { name: 'Toss' })
    fireEvent.click(toss)
    expect(toss).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Body' })).toHaveAttribute('aria-checked', 'false')
    // Keyboard on the timeline: Home goes to the serve start.
    fireEvent.keyDown(slider, { key: 'Home' })
    expect(slider).toHaveAttribute('aria-valuenow', String(serve.window.startFrame))
    assertHonestAndCalm()
  })

  it('a stored clip whose file is missing says so, not a pose reason, and draws no overlay over the empty box', async () => {
    const serve = await seedFixture('fixture-missing', { storage: 'idb', keyFrames: false })
    renderAt(paths.serveDetail('fixture-missing', serve.id))
    expect(await screen.findByText(VIDEO_MISSING_LINE, undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByText("Couldn't see this clearly")).toBeNull()
    // Overlays need the video or its key frames under them (DESIGN §8.11): no chips, no canvas.
    expect(screen.queryByRole('radio', { name: 'Body' })).toBeNull()
    expect(document.querySelector('canvas')).toBeNull()
    // Nothing to play: no Play button, and the step buttons move between phases.
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull()
    assertHonestAndCalm()
  })

  it('tags the outcome from the video pill as a player-entered value', async () => {
    renderAt(paths.serveDetail('demo-s1', 'demo-s1-serve-01'))
    fireEvent.click(await screen.findByRole('button', { name: /Outcome: in, you logged/ }, { timeout: 5000 }))
    const dialog = await screen.findByRole('dialog', { name: 'Tag serve 1' })
    fireEvent.click(within(within(dialog).getByRole('group', { name: 'Outcome' })).getByRole('button', { name: 'Wide' }))
    await waitFor(async () => {
      const tag = (await listTags('demo-s1')).find((t) => t.serveId === 'demo-s1-serve-01')
      expect(tag?.outcome).toBe('wide')
      expect(tag?.outcomeSource).toBe('player')
      expect(tag?.via).toBe('serve-detail')
    })
  })
})

describe('Tagging', () => {
  it('renders the fixed pad in the thumb zone with every control named', async () => {
    renderAt(paths.tagging('demo-s1'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Tag serves' }, { timeout: 5000 })).toBeInTheDocument()
    const pad = await screen.findByRole('group', { name: 'Outcome' }, { timeout: 5000 })
    expect(within(pad).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['In', 'Net', 'Long', 'Wide'])
    expect(screen.getByRole('radiogroup', { name: 'Serve number' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Aimed at' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Type' })).toBeInTheDocument()
    assertHonestAndCalm()
  })

  it('saves each tap, advances, announces, and undoes', async () => {
    renderAt(paths.tagging('demo-s1'))
    const pad = await screen.findByRole('group', { name: 'Outcome' }, { timeout: 5000 })
    // Every sample serve is tagged, so tagging resumes at serve 1.
    await act(async () => {
      fireEvent.click(within(pad).getByRole('button', { name: 'Net' }))
    })
    await waitFor(async () => expect((await listTags('demo-s1')).find((t) => t.serveId === 'demo-s1-serve-01')?.outcome).toBe('net'))
    expect(await screen.findByText('Serve 1: net. Serve 2 of 22.')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    })
    await waitFor(async () => expect((await listTags('demo-s1')).find((t) => t.serveId === 'demo-s1-serve-01')?.outcome).toBe('in'))
    // Keyboard: N tags net.
    await act(async () => {
      fireEvent.keyDown(window, { key: 'l' })
    })
    await waitFor(async () => expect((await listTags('demo-s1')).find((t) => t.serveId === 'demo-s1-serve-01')?.outcome).toBe('long'))
  })

  it('offers a session tally instead, saved as player-entered counts', async () => {
    renderAt(paths.tagging('demo-s2'))
    fireEvent.click(await screen.findByRole('button', { name: 'Use a tally instead' }, { timeout: 5000 }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Session tally' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'One more in' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save tally' }))
    })
    await waitFor(async () => expect((await getTally('demo-s2'))?.firstServes).toBeDefined())
    assertHonestAndCalm()
  })
})
