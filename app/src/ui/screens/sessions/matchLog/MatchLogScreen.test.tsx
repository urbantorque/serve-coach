import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDbForTests } from '../../../../data/db.ts'
import { buildExportCSV, buildExportJSON, listMatchLogs, saveMatchLog, setSetting } from '../../../../data/index.ts'
import { useSettingsStore } from '../../../../data/stores/settings.ts'
import { paths } from '../../../shell/paths.ts'
import { expectHonest, primaryCount, renderAt, seedPlayer } from '../../progress/insights/testing.tsx'

vi.setConfig({ testTimeout: 20_000 })

beforeEach(async () => {
  await resetDbForTests()
  await setSetting('onboarding', { status: 'completed' })
  useSettingsStore.setState({ experimentalMetrics: false })
})

const more = (label: string, times = 1) => {
  for (let i = 0; i < times; i++) fireEvent.click(screen.getByRole('button', { name: `More: ${label}` }))
}

describe('Match log', () => {
  it('logs a comp night in a few taps: player-entered, never mixed with practice', async () => {
    const errors = vi.spyOn(console, 'error')
    renderAt(paths.matchLog())
    expect(await screen.findByRole('heading', { level: 1, name: 'Log a match' }, { timeout: 8000 })).toBeInTheDocument()
    expect(await screen.findByText(/never mixed with it/, {}, { timeout: 8000 })).toBeInTheDocument()
    expect(screen.getAllByText('You logged').length).toBeGreaterThan(0)
    expect(primaryCount()).toBe(1)
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-22' } })
    fireEvent.click(screen.getByRole('radio', { name: /Pennant/ }))
    more('Service games', 1)
    more('Double faults', 2)
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Did you count first serves?' })).getByRole('radio', { name: /Yes/ }))
    // Defaults to 10 of 20 once counting starts.
    more('First serves in', 7)
    expect(document.querySelector('[data-metric="first-serve-in-rate"]')?.getAttribute('data-status')).toBe('player-entered')
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'Windy, served into the wind in set two' } })
    expectHonest()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect(await listMatchLogs()).toHaveLength(1))
    const [m] = await listMatchLogs()
    expect(m).toMatchObject({ date: '2026-09-22', competition: 'pennant', serviceGames: 5, doubleFaults: 2, firstServesIn: 17, firstServesAttempted: 20, notes: 'Windy, served into the wind in set two' })
    // The note stays on the phone: never in the JSON or CSV export.
    const json = await buildExportJSON()
    expect(json.matchLogs[0]).not.toHaveProperty('notes')
    expect(json.matchLogs[0]).toMatchObject({ firstServesIn: 17, firstServesAttempted: 20 })
    const csv = (await buildExportCSV())['match_logs.csv']
    expect(csv).toContain('first_serves_in,first_serves_attempted')
    expect(csv).not.toContain('Windy')
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('refuses more first serves in than hit, and more double faults than missed first serves', async () => {
    renderAt(paths.matchLog())
    await screen.findByRole('radiogroup', { name: 'Did you count first serves?' }, { timeout: 8000 })
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Did you count first serves?' })).getByRole('radio', { name: /Yes/ }))
    more('First serves in', 11)
    expect(screen.getByText("First serves in can't be more than first serves hit.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Check the highlighted answers.')).toBeInTheDocument()
    expect(await listMatchLogs()).toHaveLength(0)
  })

  it('an entry opens pre-filled and can be deleted, with Undo', async () => {
    const row = await saveMatchLog({ date: '2026-09-15', competition: 'night-comp', serviceGames: 6, doubleFaults: 1 })
    const router = renderAt(`${paths.matchLog(row.id)}?from=${encodeURIComponent(paths.progress())}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Edit match' }, { timeout: 8000 })).toBeInTheDocument()
    expect(within(await screen.findByRole('group', { name: 'Service games' }, { timeout: 8000 })).getByText('6')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete entry' }))
    await waitFor(async () => expect(await listMatchLogs()).toHaveLength(0))
    await waitFor(() => expect(router.state.location.pathname).toBe(paths.progress()))
  })

  it('guards unsaved input when leaving, and focuses the first problem when a save is refused', async () => {
    const router = renderAt(paths.matchLog())
    await screen.findByRole('radiogroup', { name: 'Did you count first serves?' }, { timeout: 8000 })
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Did you count first serves?' })).getByRole('radio', { name: /Yes/ }))
    more('First serves in', 11)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(document.activeElement?.textContent).toBe("First serves in can't be more than first serves hit."))
    fireEvent.click(screen.getByRole('link', { name: 'Progress' }))
    const guard = await screen.findByRole('dialog', { name: 'Discard this match?' })
    fireEvent.click(within(guard).getByRole('button', { name: 'Keep editing' }))
    expect(router.state.location.pathname).toBe(paths.matchLog())
    fireEvent.click(screen.getByRole('link', { name: 'Progress' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Discard this match?' })).getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(paths.progress()))
    expect(await listMatchLogs()).toHaveLength(0)
  })

  it('asks about the cue only when an experiment is running', async () => {
    await seedPlayer()
    renderAt(paths.matchLog())
    await screen.findByRole('heading', { level: 1, name: 'Log a match' }, { timeout: 8000 })
    await waitFor(() => expect(screen.getByRole('radiogroup', { name: 'Did you use your practice cue?' })).toBeInTheDocument())
  })
})
