import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDbForTests } from '../../../data/db.ts'
import { addVideo, createSession, getSetting, putServesWithTracksAndFrames, setSetting, setTag } from '../../../data/index.ts'
import { useSettingsStore } from '../../../data/stores/settings.ts'
import { paths } from '../../shell/paths.ts'
import { routes } from '../../shell/routes.ts'
import { ThemeProvider } from '../../theme/ThemeProvider.tsx'
import { fixtureServe, fixtureSession, fixtureVideo, type PlaybackFixture } from './dev/harnessFixture.ts'

vi.setConfig({ testTimeout: 30_000 })

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  )
  return router
}

/** Two serves of the engine fixture in one of the player's sessions; serve 2 went in (the best serve). */
async function seed() {
  const f = JSON.parse(readFileSync(join(process.cwd(), 'src/ui/screens/playback/dev/fixtures/baseline-s1.json'), 'utf8')) as PlaybackFixture
  const sessionId = 'own'
  const videoId = 'own-video'
  const a = fixtureServe(f, { sessionId, index: 1, videoId, analysedAt: '2026-09-26T00:00:00Z' })
  const b = fixtureServe(f, { sessionId, index: 2, videoId, analysedAt: '2026-09-26T00:00:00Z' })
  await createSession({ ...fixtureSession(f, { id: sessionId, startedAt: '2026-09-26T19:00:00+10:00', label: 'Tuesday', videoIds: [videoId], serveIds: [a.serve.id, b.serve.id] }), isDemo: 0 })
  await addVideo({ ...fixtureVideo(f, { id: videoId, sessionId, importedAt: '2026-09-26T19:00:00+10:00', sizeBytes: 1, storage: 'deleted' }), isDemo: 0 })
  await putServesWithTracksAndFrames([a.serve, b.serve], [a.track, b.track])
  await setTag(b.serve.id, sessionId, { outcome: 'in' })
  return a.serve
}

beforeEach(async () => {
  await resetDbForTests()
  await setSetting('onboarding', { status: 'completed' })
  useSettingsStore.setState({ experimentalMetrics: false })
})

async function openCompare() {
  const serve = await seed()
  renderAt(paths.serveDetail('own', serve.id))
  fireEvent.click(await screen.findByRole('button', { name: 'More actions' }, { timeout: 10_000 }))
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Compare with your best' }, { timeout: 8000 }))
  const picker = await screen.findByRole('dialog', { name: 'Compare with' }, { timeout: 8000 })
  const best = await waitFor(() => {
    const b = within(picker).getAllByRole('button').find((x) => /Your best serve/.test(x.textContent ?? '') && x.getAttribute('aria-disabled') !== 'true')
    if (!b) throw new Error(`no best serve yet: ${picker.textContent}`)
    return b
  })
  fireEvent.click(best)
  return screen.findByRole('radiogroup', { name: 'Compare view' }, { timeout: 10_000 })
}

describe('T3: the ghost overlay is Plus; side by side stays free', () => {
  it('a free player sees "Ghost (Plus)" and gets the sheet naming it; the view stays side by side', async () => {
    const group = await openCompare()
    fireEvent.click(await within(group).findByRole('radio', { name: 'Ghost (Plus)' }))
    expect(await screen.findByRole('dialog', { name: 'Ghost overlay is part of Plus' }, { timeout: 8000 })).toBeInTheDocument()
    expect(within(group).getByRole('radio', { name: 'Side by side' })).toHaveAttribute('aria-checked', 'true')
    await waitFor(async () => expect((await getSetting('paywall')).log?.at(-1)).toMatchObject({ trigger: 't3', feature: 'ghost-compare' }))
  })

  it('with test Plus on, Ghost opens straight away', async () => {
    await setSetting('entitlement', { tier: 'plus', plan: 'monthly', source: 'prototype' })
    const group = await openCompare()
    fireEvent.click(await within(group).findByRole('radio', { name: 'Ghost' }))
    await waitFor(() => expect(within(screen.getByRole('radiogroup', { name: 'Compare view' })).getByRole('radio', { name: 'Ghost' })).toHaveAttribute('aria-checked', 'true'))
    expect(screen.queryByRole('dialog', { name: /part of Plus/ })).toBeNull()
  })
})
