import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, resetDbForTests } from '../../../data/db.ts'
import { loadDemoData } from '../../../data/demo.ts'
import { createSession, getSetting, setSetting } from '../../../data/index.ts'
import type { SessionRecord } from '../../../data/records.ts'
import { useSettingsStore } from '../../../data/stores/settings.ts'
import { lintCopy } from '../../copy/lint.ts'
import { paths } from '../../shell/paths.ts'
import { ThemeProvider } from '../../theme/ThemeProvider.tsx'
import { expectHonest, primaryCount, renderAt, seedPlayer } from '../progress/insights/testing.tsx'
import { AllowanceNotice } from './AllowanceNotice.tsx'

vi.setConfig({ testTimeout: 20_000 })

beforeEach(async () => {
  await resetDbForTests()
  await setSetting('onboarding', { status: 'completed' })
  useSettingsStore.setState({ experimentalMetrics: false })
})

describe('T1: after the first "Did it work?" verdict', () => {
  it('an inline card below the verdict and next step, once; the verdict stays free', async () => {
    await seedPlayer()
    renderAt(paths.compare('own-exp-toss-height'))
    expect(await screen.findByText('Likely better', {}, { timeout: 8000 })).toBeInTheDocument()
    const card = await screen.findByRole('region', { name: 'That was your first experiment' }, { timeout: 8000 })
    expect(within(card).getByText(/Your verdict and next focus stay free/)).toBeInTheDocument()
    // The screen keeps its single primary (the next step); the card offers no second one.
    expect(primaryCount()).toBe(1)
    fireEvent.click(within(card).getByRole('button', { name: 'What Plus adds' }))
    const sheet = await screen.findByRole('dialog', { name: 'That was your first experiment' }, { timeout: 8000 })
    expect(within(sheet).getByRole('list', { name: 'What Plus adds' })).toHaveTextContent('Unlimited analysed sessions')
    expect(within(sheet).getByRole('link', { name: 'See Plus' }).getAttribute('href')).toBe(`/plan?via=t1&from=${encodeURIComponent('/progress/compare/own-exp-toss-height')}`)
    expect(lintCopy(document.body.textContent ?? '')).toEqual([])
    await waitFor(async () => expect((await getSetting('paywall')).t1ExperimentId).toBe('own-exp-toss-height'))
    expectHonest()
  })

  it('not on a later day, not for Plus, not during a pain pause, never for sample data', async () => {
    await seedPlayer()
    await setSetting('paywall', { t1ShownAt: '2026-09-01T09:00:00.000Z', t1ExperimentId: 'own-exp-toss-height', lastShownDay: '2026-09-01' })
    renderAt(paths.compare('own-exp-toss-height'))
    await screen.findByText('Likely better', {}, { timeout: 8000 })
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.queryByRole('region', { name: 'That was your first experiment' })).toBeNull()
  })

  it('Plus switched on: no card', async () => {
    await seedPlayer()
    await setSetting('entitlement', { tier: 'plus', plan: 'annual', source: 'prototype' })
    renderAt(paths.compare('own-exp-toss-height'))
    await screen.findByText('Likely better', {}, { timeout: 8000 })
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.queryByRole('region', { name: 'That was your first experiment' })).toBeNull()
  })

  it('pain pause: no card', async () => {
    await seedPlayer({ painFlag: true })
    renderAt(paths.compare('own-exp-toss-height'))
    await screen.findByText('Likely better', {}, { timeout: 8000 })
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.queryByRole('region', { name: 'That was your first experiment' })).toBeNull()
  })

  it('sample experiment: no card', async () => {
    await loadDemoData()
    renderAt(paths.compare('demo-exp-toss-height'))
    await screen.findByText('Sample data · synthetic player', {}, { timeout: 8000 })
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.queryByRole('region', { name: 'That was your first experiment' })).toBeNull()
  })
})

describe('T3 arriving at the Plan screen', () => {
  it('names the feature, returns where the player came from, and records the fake-door intent', async () => {
    const router = renderAt(`${paths.plan()}?via=t3&feature=ghost-compare&from=${encodeURIComponent('/sessions/s1/serves/v1')}`)
    expect(await screen.findByRole('heading', { name: 'Ghost overlay is part of Plus' }, { timeout: 8000 })).toBeInTheDocument()
    expect(screen.getByText(/Plus also gives you unlimited analysed sessions/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Not now' })).toHaveAttribute('href', '/sessions/s1/serves/v1')
    fireEvent.click(screen.getByRole('radio', { name: /Monthly/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose monthly' }))
    const done = await screen.findByRole('dialog', { name: "Plus isn't on sale yet" })
    expect(within(done).getByText(/so ghost overlay is open\. No payment was taken/)).toBeInTheDocument()
    expect(await getSetting('entitlement')).toMatchObject({ tier: 'plus', plan: 'monthly', via: 't3', feature: 'ghost-compare' })
    fireEvent.click(within(done).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/sessions/s1/serves/v1'))
  })

  it('ignores a return path to another site', async () => {
    renderAt(`${paths.plan()}?from=${encodeURIComponent('//evil.example/x')}`)
    expect(await screen.findByRole('link', { name: 'Not now' }, { timeout: 8000 })).toHaveAttribute('href', '/profile')
  })
})

describe('T2: past this month\'s free analyses', () => {
  const day = (id: string, visitId: string, status: SessionRecord['status'] = 'ready'): SessionRecord => ({
    id,
    createdAt: `${visitId}T08:00:00.000Z`,
    startedAt: `${visitId}T08:00:00.000Z`,
    visitId,
    status,
    mode: 'technique',
    view: 'side',
    isRetest: 0,
    isDemo: 0,
  })

  it('a calm notice and sheet while the analysis carries on; once a month', async () => {
    const month = new Date().toISOString().slice(0, 7)
    // First loop on days 1 and 2 (free), then two counted days, then a third counted day analysing now.
    for (const [id, d] of [['b1', '01'], ['r1', '02'], ['p1', '03'], ['p2', '04']] as const) await createSession(day(id, `${month}-${d}`))
    await createSession(day('now', `${month}-05`, 'analysing'))
    await getDb().experiments.put({
      id: 'x', createdAt: `${month}-01T09:00:00.000Z`, status: 'completed', decisionId: 'd', faultId: 'f', cueId: 'c', drillId: 'dr', primaryMetricId: 'toss-height-spread', secondaryMetricIds: [], direction: 'decrease',
      stratum: { view: 'side', courtSide: 'deuce', serveNumber: 1, serveType: 'unknown', fpsClass: '60' } as never, baselineSessionIds: ['b1'], retestSessionIds: ['r1'], isDemo: 0,
    })
    const router = createMemoryRouter([{ path: '/processing/:id', element: <AllowanceNotice sessionId="now" /> }, { path: '/plan', element: <p>plan</p> }], { initialEntries: ['/processing/now'] })
    render(
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>,
    )
    const sheet = await screen.findByRole('dialog', { name: "Past this month's free analyses" }, { timeout: 8000 })
    expect(within(sheet).getByText(/During the beta nothing waits: this one is being analysed now/)).toBeInTheDocument()
    expect(screen.getByText(/goes past the free plan's 2 analysed practice days this month/)).toBeInTheDocument()
    await waitFor(async () => expect((await getSetting('paywall')).t2Months).toEqual([month]))
  })
})
