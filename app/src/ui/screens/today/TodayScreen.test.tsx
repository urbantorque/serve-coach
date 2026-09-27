import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDbForTests } from '../../../data/db.ts'
import { loadDemoData } from '../../../data/demo.ts'
import { useSettingsStore } from '../../../data/stores/settings.ts'
import { paths } from '../../shell/paths.ts'
import { expectHonest, primaryCount, renderAt, seedPlayer } from '../progress/insights/testing.tsx'

beforeEach(async () => {
  await resetDbForTests()
  useSettingsStore.setState({ experimentalMetrics: false })
})

describe('Today', () => {
  it('empty: record your first serves, one primary', async () => {
    renderAt(paths.today())
    expect(await screen.findByText('Record your first serves', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'See a sample session' })).toBeInTheDocument()
    expect(primaryCount()).toBe(1)
  })

  it('sample: labelled, a preview of the sample focus without drill actions, and the set-up primary', async () => {
    await loadDemoData()
    const errors = vi.spyOn(console, 'error')
    renderAt(paths.today())
    expect(await screen.findByRole('heading', { name: 'Steady toss height' }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByText('Sample data · synthetic player')).toBeInTheDocument()
    expect(screen.getByText(/sample player's focus/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Start drill/ })).toBeNull()
    expect(primaryCount()).toBe(1)
    expectHonest()
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it("player: the focus card's one primary follows the experiment (re-test after practice), with the last session", async () => {
    await seedPlayer()
    renderAt(paths.today())
    expect(await screen.findByRole('heading', { name: 'Steady toss height' }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Record re-test/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /of your steady toss height experiment/ })).toBeInTheDocument()
    expect(screen.getByText('Last session')).toBeInTheDocument()
    expect(screen.queryByText('Sample data · synthetic player')).toBeNull()
    expect(primaryCount()).toBe(1)
    // Evidence stats carry their state (measured or estimated only).
    const evidence = [...document.querySelectorAll<HTMLElement>('[data-metric]')].map((e) => e.dataset.status)
    expect(evidence.length).toBeGreaterThan(0)
    expectHonest()
  })

  it('pain pause: no focus, cue, drill or re-test anywhere; stats and the last session stay', async () => {
    await seedPlayer({ painFlag: true })
    renderAt(paths.today())
    expect(await screen.findByText('Coaching is paused. Your stats are safe.', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Steady toss height' })).toBeNull()
    expect(screen.queryByText(/Every toss peaks/)).toBeNull()
    expect(screen.queryByText(/Re-test/)).toBeNull()
    expect(screen.getByText('Last session')).toBeInTheDocument()
    expect(primaryCount()).toBe(0)
  })
})
