import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, resetDbForTests } from '../../../data/db.ts'
import { loadDemoData } from '../../../data/demo.ts'
import { DEMO_FIXTURES } from '../../../data/fixtures.ts'
import { useSettingsStore } from '../../../data/stores/settings.ts'
import { paths } from '../../shell/paths.ts'
import { useFocusStore } from '../focus/focusStore.ts'
import { expectHonest, primaryCount, renderAt, seedPlayer } from '../progress/insights/testing.tsx'

// Screens load several stores from IndexedDB; under a full parallel run the default 5 s is tight.
vi.setConfig({ testTimeout: 15_000 })

beforeEach(async () => {
  await resetDbForTests()
  useSettingsStore.setState({ experimentalMetrics: false })
})

describe('Today', () => {
  it('empty: record your first serves, one primary', async () => {
    renderAt(paths.today())
    expect(await screen.findByText('Record your first serves', {}, { timeout: 8000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'See a sample session' })).toBeInTheDocument()
    expect(primaryCount()).toBe(1)
  })

  it('sample: labelled, a preview of the sample focus without drill actions, and the set-up primary', async () => {
    await loadDemoData()
    const errors = vi.spyOn(console, 'error')
    renderAt(paths.today())
    expect(await screen.findByRole('heading', { name: 'Steady toss height' }, { timeout: 8000 })).toBeInTheDocument()
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
    expect(await screen.findByRole('heading', { name: 'Steady toss height' }, { timeout: 8000 })).toBeInTheDocument()
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

  describe('a referral answered this session without consent to save it (COACHING §7.9, §10.3; D8)', () => {
    // A comp night every day, at 3 pm local time: only Date is faked, so IndexedDB and waits run.
    beforeEach(async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 8, 27, 15, 0))
      await seedPlayer()
      await getDb().profile.update(DEMO_FIXTURES.profile.id, { matchNights: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] })
    })
    afterEach(() => {
      useFocusStore.setState({ referral: undefined })
      vi.useRealTimers()
    })

    it('without it, the comp-night card and the focus show (control)', async () => {
      renderAt(paths.today())
      expect(await screen.findByText('Comp night tonight', {}, { timeout: 8000 })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Steady toss height' })).toBeInTheDocument()
    })

    it('"It hurts" on Record: the pause card only; no cue, drill, re-test or comp-night card', async () => {
      useFocusStore.setState({ referral: 'stop-and-book' })
      renderAt(paths.today())
      expect(await screen.findByText('Coaching is paused. Your stats are safe.', {}, { timeout: 8000 })).toBeInTheDocument()
      expect((await getDb().profile.get(DEMO_FIXTURES.profile.id))?.comfort.painFlag).toBe(0)
      expect(screen.queryByText('Comp night tonight')).toBeNull()
      expect(screen.queryByText(/Warm up with your cue/)).toBeNull()
      expect(screen.queryByRole('heading', { name: 'Steady toss height' })).toBeNull()
      expect(screen.queryByText(/Every toss peaks/)).toBeNull()
      expect(screen.queryByRole('link', { name: /Start drill|Record re-test/ })).toBeNull()
      expect(screen.queryByText(/Re-test/)).toBeNull()
      expect(screen.getByText('Last session')).toBeInTheDocument()
      expect(primaryCount()).toBe(0)
      // "It's settled" runs the body check (DESIGN §8.8), which knows about an unsaved referral;
      // Comfort only shows a saved pause.
      expect(screen.getByRole('link', { name: "It's settled" })).toHaveAttribute('href', '/focus?body=settle')
    })

    it('a red flag leads with its own instruction', async () => {
      useFocusStore.setState({ referral: 'today' })
      renderAt(paths.today())
      expect(await screen.findByText('Please stop serving and see a doctor today.', {}, { timeout: 8000 })).toBeInTheDocument()
      expect(screen.queryByText('Comp night tonight')).toBeNull()
    })
  })

  it('pain pause: no focus, cue, drill or re-test anywhere; stats and the last session stay', async () => {
    await seedPlayer({ painFlag: true })
    renderAt(paths.today())
    expect(await screen.findByText('Coaching is paused. Your stats are safe.', {}, { timeout: 8000 })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Steady toss height' })).toBeNull()
    expect(screen.queryByText(/Every toss peaks/)).toBeNull()
    expect(screen.queryByText(/Re-test/)).toBeNull()
    expect(screen.getByText('Last session')).toBeInTheDocument()
    expect(primaryCount()).toBe(0)
  })
})
