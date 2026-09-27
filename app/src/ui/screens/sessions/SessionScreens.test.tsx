import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDbForTests } from '../../../data/db.ts'
import { loadDemoData } from '../../../data/demo.ts'
import { getDb } from '../../../data/db.ts'
import { setSetting } from '../../../data/repos/settings.ts'
import { useSettingsStore } from '../../../data/stores/settings.ts'
import { paths } from '../../shell/paths.ts'
import { expectHonest, primaryCount, renderAt } from '../progress/insights/testing.tsx'

// Screens load several stores from IndexedDB; under a full parallel run the default 5 s is tight.
vi.setConfig({ testTimeout: 15_000 })

beforeEach(async () => {
  await resetDbForTests()
  await loadDemoData()
  useSettingsStore.setState({ experimentalMetrics: false })
})

describe('Sessions list', () => {
  it('month groups, sample group last, view filter, re-test verdict chip', async () => {
    renderAt(paths.sessions())
    expect(await screen.findByText('Sample', {}, { timeout: 8000 })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Show sessions from' })).toBeInTheDocument()
    expect(screen.getByText('Likely better')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'From behind' }))
    expect(screen.queryByText('Sat 26 Sep')).toBeNull()
    expect(screen.getByText('Sat 19 Sep')).toBeInTheDocument()
  })

  it('empty state', async () => {
    await resetDbForTests()
    renderAt(paths.sessions())
    expect(await screen.findByText('No sessions yet', {}, { timeout: 8000 })).toBeInTheDocument()
  })
})

describe('Session report', () => {
  it('fixed order: headline, capture, focus, toss hero, stats, outcomes, all serves, ghosts, footer', async () => {
    const errors = vi.spyOn(console, 'error')
    renderAt(paths.sessionReport('demo-s1'))
    await screen.findByText('Your serve today', {}, { timeout: 8000 })
    const text = document.body.textContent ?? ''
    const order = ['serves measured', 'Capture: Good', 'Steady toss height', 'Your serve today', 'Outcomes', 'All serves', 'Not available from this session', 'How we measured']
    const idx = order.map((t) => text.indexOf(t))
    expect(idx.every((i) => i >= 0), JSON.stringify(idx)).toBe(true)
    expect([...idx].sort((a, b) => a - b)).toEqual(idx)
    // Hero toss map: a figure with state chip and a role=img plot summarising the data.
    expect(screen.getByRole('img', { name: /Toss map, 20 serves/ })).toBeInTheDocument()
    // Outcomes are player-entered with n and the likely range.
    expect(document.querySelector('[data-metric-tile="first-serve-in-rate"]')?.getAttribute('data-status')).toBe('player-entered')
    expect(screen.getAllByText(/likely 35% to 73%/).length).toBeGreaterThan(0)
    // Ins and misses waits for enough serves in each group.
    expect(screen.getByText(/needs 10 of each/)).toBeInTheDocument()
    expect(primaryCount()).toBe(1)
    expectHonest()
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('per-serve list links to Serve detail and keeps excluded serves with their reason', async () => {
    renderAt(paths.sessionReport('demo-s1'))
    const list = await screen.findByRole('list', { name: 'Serves' }, { timeout: 8000 })
    expect(within(list).getAllByRole('link')[0].getAttribute('href')).toBe(paths.serveDetail('demo-s1', 'demo-s1-serve-01'))
    fireEvent.click(screen.getByRole('button', { name: 'Show all 22 serves' }))
    expect(within(list).getAllByText(/Not measured/)).toHaveLength(2)
  })

  it('a re-test shows the experiment verdict card', async () => {
    renderAt(paths.sessionReport('demo-s3'))
    expect(await screen.findByRole('heading', { name: 'Did it work?' }, { timeout: 8000 })).toBeInTheDocument()
    expect(screen.getAllByText('Likely better').length).toBeGreaterThan(0)
    expect(screen.getByText('About 10 more serves to confirm.')).toBeInTheDocument()
  })

  it('rear view: no side-view metrics or experimental readouts with the toggle off (D1, D2)', async () => {
    renderAt(paths.sessionReport('demo-s2'))
    await screen.findByText('Your serve today', {}, { timeout: 8000 })
    expect(screen.queryByText('Left-right spread')).toBeNull()
    expect(document.querySelector('[data-metric-tile="leg-drive"]')).toBeNull()
    expect(document.querySelector('[data-metric="leg-drive"]')?.getAttribute('data-status')).toBe('unavailable')
    expectHonest()
  })

  it('the experimental group appears only with the toggle on', async () => {
    await setSetting('experimentalMetrics', true)
    useSettingsStore.setState({ experimentalMetrics: true })
    renderAt(paths.sessionReport('demo-s3'))
    await screen.findByText('Your serve today', {}, { timeout: 8000 })
    expect(screen.getByText('Not yet checked against a radar or measured marks. Not used for coaching.')).toBeInTheDocument()
    expect(document.querySelector('[data-metric="speed-experimental"]')?.textContent).toMatch(/about 130 to 145/)
    expectHonest({ experimentalAllowed: true })
  })

  it('untagged sessions offer tagging instead of outcome numbers', async () => {
    await getDb().tags.where('sessionId').equals('demo-s1').delete()
    const stats = await getDb().sessionStats.get('demo-s1')
    for (const id of ['first-serve-in-rate', 'serve-in-rate'] as const) delete stats!.metrics[id]
    await getDb().sessionStats.put(stats!)
    renderAt(paths.sessionReport('demo-s1'))
    expect(await screen.findByText('Tag your serves to see this', {}, { timeout: 8000 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tag serves' }).getAttribute('href')).toBe(paths.tagging('demo-s1'))
    expect(document.querySelector('[data-metric-tile="first-serve-in-rate"]')).toBeNull()
  })
})
