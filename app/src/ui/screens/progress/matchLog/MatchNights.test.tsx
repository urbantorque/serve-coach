import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDbForTests } from '../../../../data/db.ts'
import { getSetting, listMatchLogs, saveMatchLog, setSetting } from '../../../../data/index.ts'
import { loadDemoData } from '../../../../data/demo.ts'
import { useSettingsStore } from '../../../../data/stores/settings.ts'
import { paths } from '../../../shell/paths.ts'
import { expectHonest, primaryCount, renderAt, seedPlayer } from '../insights/testing.tsx'

vi.setConfig({ testTimeout: 20_000 })

beforeEach(async () => {
  await resetDbForTests()
  await setSetting('onboarding', { status: 'completed' })
  useSettingsStore.setState({ experimentalMetrics: false })
})

async function twoMatches() {
  await saveMatchLog({ date: '2026-09-15', competition: 'night-comp', serviceGames: 5, doubleFaults: 3, firstServesIn: 14, firstServesAttempted: 26 })
  await saveMatchLog({ date: '2026-09-22', competition: 'night-comp', serviceGames: 6, doubleFaults: 1, firstServesIn: 19, firstServesAttempted: 30 })
}

describe('Comp nights on Progress', () => {
  it('shows the match log as its own player-entered series, beside practice and never pooled with it', async () => {
    await seedPlayer()
    await twoMatches()
    const errors = vi.spyOn(console, 'error')
    renderAt(paths.progress())
    const section = await screen.findByRole('region', { name: 'Comp nights' }, { timeout: 8000 })
    await within(section).findByText(/From your match log, 2 comp nights/, {}, { timeout: 8000 })
    expect(within(section).getByText(/in 11 service games, last 2 comp nights/)).toBeInTheDocument()
    expect(within(section).getByText(/last 2 comp nights you counted/)).toBeInTheDocument()
    for (const el of section.querySelectorAll<HTMLElement>('[data-metric]')) expect(el.dataset.status).toBe('player-entered')
    expect(within(section).getByText(/no verdict here, and comp nights never mix with practice/)).toBeInTheDocument()
    expect(within(section).getByRole('list', { name: 'Recent comp nights' })).toHaveTextContent('Tue 22 Sep, night comp')
    // The practice tiles above are unchanged by the match log: the toss tile still reads its sessions.
    expect(screen.getByRole('heading', { name: 'Is my toss becoming more consistent?' })).toBeInTheDocument()
    expect(primaryCount()).toBe(0)
    expectHonest()
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('beta: the season view opens, with the calm Plus preview once that day (PRODUCT §5.3)', async () => {
    await seedPlayer()
    await twoMatches()
    renderAt(paths.progress())
    const section = await screen.findByRole('region', { name: 'Comp nights' }, { timeout: 8000 })
    fireEvent.click(await within(section).findByRole('button', { name: 'Season view' }))
    expect(await screen.findByRole('heading', { name: 'Practice and comp nights, week by week' }, { timeout: 8000 })).toBeInTheDocument()
    const sheet = await screen.findByRole('dialog', { name: 'Season view is part of Plus' }, { timeout: 8000 })
    expect(within(sheet).getByText(/Beta: this is unlocked for you/)).toBeInTheDocument()
    expect(sheet.querySelector('[data-preview-price]')?.textContent).toMatch(/A\$99\.99 a year/)
    expect(within(sheet).queryByRole('link', { name: 'See Plus' })).toBeNull()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(async () => expect((await getSetting('paywall')).log?.at(-1)).toMatchObject({ trigger: 't3', feature: 'season-view' }))
    // Closing and opening again the same day: no second preview.
    fireEvent.click(within(section).getByRole('button', { name: 'Hide season view' }))
    fireEvent.click(within(section).getByRole('button', { name: 'Season view' }))
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('after the beta (the Plan screen test): free players get the calm sheet naming it, test Plus opens it', async () => {
    await seedPlayer()
    await twoMatches()
    await setSetting('entitlement', { tier: 'free', source: 'prototype', afterBetaTest: true })
    renderAt(paths.progress())
    const section = await screen.findByRole('region', { name: 'Comp nights' }, { timeout: 8000 })
    // Once the plan is read, the button carries its Plus badge (after the beta, a free player).
    fireEvent.click(await within(section).findByRole('button', { name: /Season view.*Plus/ }, { timeout: 8000 }))
    const sheet = await screen.findByRole('dialog', { name: 'Season view is part of Plus' }, { timeout: 8000 })
    expect(within(sheet).getByText(/free and no payment is taken/)).toBeInTheDocument()
    expect(within(sheet).getByText(/Always free: the body check and pain advice, every label, export and deletion/)).toBeInTheDocument()
    const see = within(sheet).getByRole('link', { name: 'See Plus' })
    expect(see.getAttribute('href')).toBe(`/plan?via=t3&feature=season-view&from=${encodeURIComponent('/progress')}`)
    expect(within(sheet).getByRole('button', { name: 'Not now' })).toBeInTheDocument()
    await waitFor(async () => expect((await getSetting('paywall')).log?.at(-1)).toMatchObject({ trigger: 't3', feature: 'season-view' }))
    expect(document.querySelector('[data-season-view]')).toBeNull()
  })

  it('with test Plus on, the season view shows practice and comp nights in separate rows', async () => {
    await seedPlayer()
    await twoMatches()
    await setSetting('entitlement', { tier: 'plus', plan: 'monthly', source: 'prototype' })
    renderAt(paths.progress())
    const section = await screen.findByRole('region', { name: 'Comp nights' }, { timeout: 8000 })
    fireEvent.click(await within(section).findByRole('button', { name: 'Season view' }))
    expect(await screen.findByRole('heading', { name: 'Practice and comp nights, week by week' }, { timeout: 8000 })).toBeInTheDocument()
    expect(screen.getByText('Comp nights are your own log. We show them next to practice, not combined.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('before any practice session, comp nights can still be logged; sample matches never show', async () => {
    await loadDemoData()
    renderAt(paths.progress())
    expect(await screen.findByText('Nothing to show yet', {}, { timeout: 8000 })).toBeInTheDocument()
    const section = await screen.findByRole('region', { name: 'Comp nights' })
    expect(within(section).getByRole('link', { name: 'Log a match' }).getAttribute('href')).toBe(`/sessions/matches/new?from=${encodeURIComponent('/progress')}`)
    expect((await listMatchLogs()).some((m) => m.isDemo === 1)).toBe(true)
    expect(within(section).queryByText(/From your match log/)).toBeNull()
  })
})
