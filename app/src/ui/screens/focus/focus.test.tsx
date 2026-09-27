// Smoke and honesty tests for the focus, drill and practice-log screens (sample data).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { decideFocus, toCoachingRecord } from '../../../coaching/index.ts'
import { resetDbForTests } from '../../../data/db.ts'
import { loadDemoData } from '../../../data/demo.ts'
import { DEMO_FIXTURES } from '../../../data/fixtures.ts'
import { useSettingsStore } from '../../../data/stores/settings.ts'
import { lintCopy } from '../../copy/lint.ts'
import { paths } from '../../shell/paths.ts'
import { routes } from '../../shell/routes.ts'
import { ThemeProvider } from '../../theme/ThemeProvider.tsx'
import { toCoachingExperiment, toCoachingProfile, toCoachingSession, toPracticeSummary } from './adapter.ts'
import { useFocusStore } from './focusStore.ts'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  )
  return router
}

/** No number without its data state; copy passes the app lint. */
function honesty() {
  for (const el of document.querySelectorAll('[data-metric]')) expect(el.getAttribute('data-status'), el.getAttribute('data-metric') ?? '').toBeTruthy()
  expect(lintCopy(document.body.textContent ?? '')).toEqual([])
}

beforeEach(async () => {
  await resetDbForTests()
  useFocusStore.setState({ referral: undefined, bodyCheck: undefined, playingTonight: undefined, cueOverride: {} })
  useSettingsStore.setState({ experimentalMetrics: false })
})

describe('adapter over the sample fixtures', () => {
  it('turns the sample sessions into a focus that continues the toss experiment', () => {
    const sessions = DEMO_FIXTURES.sessions.map((s) =>
      toCoachingSession(s.session, s.serves.map((x) => ({ ...x, includedFlag: x.included ? (1 as const) : (0 as const) })), s.tags, s.tally, s.stats),
    )
    const profile = toCoachingProfile(DEMO_FIXTURES.profile, false)
    const current = sessions[2]
    const exp = toCoachingExperiment(DEMO_FIXTURES.experiment, sessions, profile, current.id)
    expect(exp?.itemId).toBe('toss-height-steady')
    expect(exp?.startedSessionId).toBe('demo-s1')
    const d = decideFocus({
      profile,
      session: current,
      history: sessions.slice(0, 2),
      activeExperiment: exp,
      practiceLogs: DEMO_FIXTURES.practiceLogs.map(toPracticeSummary),
      now: '2026-09-27T09:00:00+10:00',
    })
    expect(d.kind).toBe('focus')
    if (d.kind !== 'focus') return
    expect(d.itemId).toBe('toss-height-steady')
    expect(d.verdict?.metricId).toBe('toss-height-spread')
    expect(d.experiment?.status).toBe('continue')
    const rec = toCoachingRecord(d, { sessionId: current.id })
    expect(rec).toMatchObject({ sessionId: 'demo-s3', gate: 'ok', focus: { faultId: 'toss-height-inconsistent' }, cue: { style: 'external-target' } })
  })

  it('passes the same set-up key the screens match on, with the saved serving spot', () => {
    const s = DEMO_FIXTURES.sessions[2]
    const serves = s.serves.map((x) => ({ ...x, includedFlag: x.included ? (1 as const) : (0 as const) }))
    const plain = toCoachingSession(s.session, serves, s.tags, s.tally, s.stats)
    expect(plain.setupKey).toMatch(/^(portrait|landscape|unknown)\|/)
    const withSpot = toCoachingSession({ ...s.session, servingSpot: 'doubles' }, serves, s.tags, s.tally, s.stats)
    expect(withSpot.setupKey?.split('|')[2]).toBe('doubles')
  })
})

describe('focus screens', () => {
  it('shows the first-run empty state without data', async () => {
    renderAt(paths.focus())
    expect(await screen.findByText('Record your first serves')).toBeInTheDocument()
  })

  it('/focus renders the focus, its evidence with data states, the cue and the drill', async () => {
    await loadDemoData()
    const errors = vi.spyOn(console, 'error')
    renderAt(paths.focus())
    expect(await screen.findByRole('heading', { level: 2, name: 'Steady toss height' }, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByText('Sample data · synthetic player')).toBeInTheDocument()
    expect(screen.getByText(/Every toss peaks at the same spot/)).toBeInTheDocument()
    expect(screen.getByText(/Same-peak serves/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Start drill/ }).length).toBeGreaterThan(0)
    expect(document.querySelectorAll('[data-metric]').length).toBeGreaterThanOrEqual(2)
    honesty()
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('"Try the other cue" swaps the register', async () => {
    await loadDemoData()
    renderAt(paths.focus())
    await screen.findByText(/Every toss peaks at the same spot/, undefined, { timeout: 4000 })
    fireEvent.click(screen.getByRole('button', { name: /Try the other cue/ }))
    await waitFor(() => expect(screen.queryByText(/Every toss peaks at the same spot/)).not.toBeInTheDocument())
  })

  it('a red flag from the focus page shows Call 000, then pauses coaching with no cue or drill', async () => {
    await loadDemoData()
    renderAt(paths.focus())
    await screen.findByRole('heading', { level: 2, name: 'Steady toss height' }, { timeout: 4000 })
    fireEvent.click(screen.getAllByRole('button', { name: /Stop if anything hurts/ })[0])
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'It hurts' }))
    fireEvent.click(await within(dialog).findByText(/Chest pain or pressure/))
    fireEvent.click(within(dialog).getByRole('button', { name: 'One or more of these' }))
    const call = await screen.findAllByRole('link', { name: /Call 000/ })
    expect(call[0]).toHaveAttribute('href', 'tel:000')
    await waitFor(() => expect(screen.getByText('Coaching is paused. Your stats are safe.')).toBeInTheDocument())
    expect(screen.queryByText(/Every toss peaks at the same spot/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Start drill/ })).not.toBeInTheDocument()
    honesty()
  })

  it('match night shows the pre-match card with the current cue and no new focus', async () => {
    await loadDemoData()
    useFocusStore.getState().setPlayingTonight(true)
    renderAt(paths.focus())
    expect(await screen.findByText('Comp night tonight', undefined, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByText('No new changes today.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Start drill/ })).not.toBeInTheDocument()
    honesty()
  })

  it('/focus/drill runs the counter, the steps and the pain stop', async () => {
    await loadDemoData()
    renderAt(paths.drill())
    expect(await screen.findByRole('heading', { level: 1, name: 'Drill' }, { timeout: 4000 })).toBeInTheDocument()
    expect(await screen.findByText('Step 1 of 4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /One more/ }))
    expect(screen.getByLabelText(/: 1 of 20/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }))
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop: something hurts' })).toBeInTheDocument()
    honesty()
  })

  it('/focus/log saves a practice and offers a re-test day', async () => {
    await loadDemoData()
    renderAt(paths.practiceLog())
    expect(await screen.findByRole('heading', { level: 1, name: 'Log practice' }, { timeout: 4000 })).toBeInTheDocument()
    await screen.findByText('Did you meet the goal?')
    fireEvent.click(screen.getAllByRole('radio', { name: 'Yes' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Save log' }))
    expect(await screen.findByText('Plan your re-test', undefined, { timeout: 4000 })).toBeInTheDocument()
    honesty()
  })
})
