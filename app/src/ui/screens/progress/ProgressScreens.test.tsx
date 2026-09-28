import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDbForTests } from '../../../data/db.ts'
import { loadDemoData } from '../../../data/demo.ts'
import { useSettingsStore } from '../../../data/stores/settings.ts'
import { paths } from '../../shell/paths.ts'
import { expectHonest, primaryCount, renderAt, seedPlayer } from './insights/testing.tsx'

// Screens load several stores from IndexedDB; under a full parallel run the default 5 s is tight.
vi.setConfig({ testTimeout: 15_000 })

beforeEach(async () => {
  await resetDbForTests()
  useSettingsStore.setState({ experimentalMetrics: false })
})

describe('Progress', () => {
  it('sample data never enters Progress', async () => {
    await loadDemoData()
    renderAt(paths.progress())
    expect(await screen.findByText('Nothing to show yet', {}, { timeout: 8000 })).toBeInTheDocument()
    expect(screen.queryByText('Sample data · synthetic player')).toBeNull()
  })

  it('question tiles over matched sessions, with the usual band, n and the experiments list', async () => {
    await seedPlayer()
    const errors = vi.spyOn(console, 'error')
    renderAt(paths.progress())
    expect(await screen.findByRole('heading', { name: 'Is my toss becoming more consistent?' }, { timeout: 8000 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Am I getting more first serves in?' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Is my rhythm steady?' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Am I using my legs?' })).toBeInTheDocument()
    // Toss tile: latest value below the usual range from the two earlier sessions.
    expect(screen.getAllByText(/usual 18 to 19.5 cm/).length).toBeGreaterThan(0)
    // An interactive plot (arrow keys move between sessions) is role="application" with its key help (PlotSurface).
    expect(screen.getByRole('application', { name: /Is my toss becoming more consistent\? 4 matched sessions/ })).toBeInTheDocument()
    // Rates: counts and the honest "too small to confirm by counting" message.
    expect(screen.getByText(/more than 150 serves to confirm/)).toBeInTheDocument()
    // Experiments with their verdict words.
    expect(screen.getByRole('list', { name: 'Experiments' })).toHaveTextContent('Likely better')
    // Set-up filter: side and rear are never pooled (D1).
    expect(screen.getByRole('radiogroup', { name: 'Set-up shown' })).toBeInTheDocument()
    expect(primaryCount()).toBe(0)
    expectHonest()
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })
})

describe('Compare ("Did it work?")', () => {
  it('verdict words first, the effect with n, before/after intervals and the next step', async () => {
    await seedPlayer()
    renderAt(paths.compare('own-exp-toss-height'))
    expect(await screen.findByText('Likely better', {}, { timeout: 8000 })).toBeInTheDocument()
    expect(screen.getByText(/Your toss height consistency went from/)).toBeInTheDocument()
    expect(screen.getByText('About 10 more serves to confirm.')).toBeInTheDocument()
    expect(screen.getByRole('application', { name: /^Before .* after / })).toBeInTheDocument()
    expect(screen.getByRole('application', { name: /Before: 20 serves; after: 21 serves/ })).toBeInTheDocument()
    expect(screen.getByText(/First serves in:/)).toBeInTheDocument()
    expect(screen.getByText('You practised twice (18 minutes).')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Record re-test' })).toBeInTheDocument()
    expect(primaryCount()).toBe(1)
    expectHonest()
  })

  it('without an experiment: nothing to compare yet', async () => {
    renderAt(paths.compare())
    expect(await screen.findByText('Nothing to compare yet', {}, { timeout: 8000 })).toBeInTheDocument()
  })

  it('sample experiment is labelled and never offers a re-test for the sample player', async () => {
    await loadDemoData()
    renderAt(paths.compare('demo-exp-toss-height'))
    expect(await screen.findByText('Sample data · synthetic player', {}, { timeout: 8000 })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Record re-test' })).toBeNull()
  })
})
