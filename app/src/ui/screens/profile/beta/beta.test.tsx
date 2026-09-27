import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDbForTests } from '../../../../data/db.ts'
import { DEMO_FIXTURES, listEvents, recordEvent, saveProfile, setSetting, useToastStore, useUiStore, type RecordingSummary } from '../../../../data/index.ts'
import type { ExperimentRecord } from '../../../../data/records.ts'
import { usePwa } from '../../../../platform/pwa/register.ts'
import { UpdatePrompt } from '../../../../platform/ui/UpdatePrompt.tsx'
import { lintCopy } from '../../../copy/lint.ts'
import { paths } from '../../../shell/paths.ts'
import { routes } from '../../../shell/routes.ts'
import { ShellContext } from '../../../shell/shellContext.ts'
import { ThemeProvider } from '../../../theme/ThemeProvider.tsx'
import { eventLine, gateLines, valueWords } from './betaWords.ts'
import { VerdictBeta } from './VerdictBeta.tsx'

const recoverable: { list: RecordingSummary[] } = { list: [] }
vi.mock('../../../../data/repos/recordings.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../data/repos/recordings.ts')>()
  return { ...actual, sweepRecordings: vi.fn(async () => ({ recoverable: recoverable.list, removed: 0 })) }
})

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  )
  return router
}

const exp = (patch: Partial<ExperimentRecord> = {}): ExperimentRecord => ({ ...DEMO_FIXTURES.experiment, id: 'exp-1', isDemo: 0, ...patch })

beforeEach(async () => {
  await resetDbForTests()
  await setSetting('onboarding', { status: 'completed' })
  const { id: _id, createdAt: _c, updatedAt: _u, inSegment: _s, ...profile } = DEMO_FIXTURES.profile
  await saveProfile(profile)
  recoverable.list = []
  useToastStore.setState({ queue: [] })
})

afterEach(() => {
  vi.restoreAllMocks()
  usePwa.setState({ updateReady: false, updateDismissed: false })
  useUiStore.setState({ activeJob: null })
})

describe('Profile > Beta data', () => {
  it('shows the checks, the counts and what is never recorded, lint-clean', async () => {
    await recordEvent('app_first_opened', { display: 'browser', platform: 'pwa' })
    await recordEvent('analysis_completed', { serves: '15-24', capture: 'good', valid: true, view: 'side', source: 'recorded', retest: false, sinceBaseline: 'none' })
    await recordEvent('focus_opened')
    // A row an older build wrote for a pain referral: never shown, counted or reported (PRODUCT §9.4).
    const { getDb } = await import('../../../../data/db.ts')
    await getDb().events.add({ name: 'pain_referral_shown', at: '2026-09-01T00:00:00.000Z', props: {} })
    const errors = vi.spyOn(console, 'error')
    renderAt(paths.betaData())
    await screen.findByRole('heading', { level: 1, name: 'Beta data' }, { timeout: 3000 })
    await screen.findByText('Nothing is sent.')
    const checks = screen.getByRole('heading', { name: 'Beta checks' }).parentElement!
    expect(within(checks).getByText('First week').closest('li')).toHaveTextContent('Done')
    expect(document.querySelector('[data-count="analysis_completed"]')).toHaveTextContent('Session analysed1')
    expect(document.querySelector('[data-count="pain_referral_shown"]')).toBeNull()
    expect(document.body.textContent).not.toMatch(/referral card|pain_referral/i)
    expect(screen.getByText('No notes, heights, UTR, body-check answers or referrals.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export report' })).toBeInTheDocument()
    expect(lintCopy(document.body.textContent ?? '')).toEqual([])
    expect(errors).not.toHaveBeenCalled()
  })

  it('clears the counts after a confirmation', async () => {
    await recordEvent('drill_started')
    const user = userEvent.setup()
    renderAt(paths.betaData())
    await user.click(await screen.findByRole('button', { name: 'Clear usage counts' }, { timeout: 3000 }))
    await user.click(await screen.findByRole('button', { name: 'Clear counts' }))
    await waitFor(async () => expect((await listEvents()).filter((e) => e.name === 'drill_started')).toHaveLength(0))
  })

  it('is reachable from Profile', async () => {
    renderAt(paths.profile())
    const row = await screen.findByRole('link', { name: /Beta data/ }, { timeout: 3000 })
    expect(row).toHaveAttribute('href', paths.betaData())
  })

  it('words gates and events plainly', () => {
    const lines = gateLines(
      {
        firstOpenedAt: null,
        activation: { status: 'open', windowEndsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), validSessionAt: null, focusOpenedAt: null },
        loopCompletion: { loops: 0, firstAt: null },
        weekly: { weeks: [], activeWeeks: 1, afterActivation: [] },
        usefulness: { rated: 3, fourOrFive: 2, skipped: 1, byRating: { '1': 0, '2': 1, '3': 0, '4': 1, '5': 1 } },
        counts: {} as never,
      },
      new Date(),
    )
    expect(lines.map((l) => l.status)).toEqual(['Not yet', 'Not yet', '1 week', '2 of 3 rated 4 or 5'])
    expect(lines[0].detail).toContain('3 days left')
    expect(valueWords('serves', '15-24')).toBe('15 to 24')
    expect(valueWords('serves', '25+')).toBe('25 or more')
    expect(valueWords('length', '1-4-min')).toBe('1 to 4 min')
    expect(valueWords('trigger', 't1')).toBe('the card after your first loop')
    expect(eventLine({ name: 'practice_logged', at: '2026-09-28T09:00:00.000Z', props: { minutes: '10-14', success: 'unset' } }).detail).toBe('minutes 10 to 14, goal met not answered')
    expect(eventLine({ name: 'analysis_completed', at: '2026-09-28T09:00:00.000Z', props: { source: 'recorded', retest: false, sinceBaseline: 'none' } }).detail).toBe('recorded in the app, re-test no')
    expect(eventLine({ name: 'app_first_opened', at: '2026-09-28T09:00:00.000Z', props: { display: 'standalone', platform: 'pwa' } }).detail).toBe('opened from the Home Screen, web app')
    for (const l of lines) expect(lintCopy(`${l.title} ${l.status} ${l.detail}`)).toEqual([])
  })
})

describe('usefulness after a verdict', () => {
  const renderVerdict = (props: Partial<Parameters<typeof VerdictBeta>[0]> = {}) =>
    render(<VerdictBeta experiment={exp()} verdict="likely-better" sameSession={false} paused={false} {...props} />)

  it('asks once, records the rating and the verdict view', async () => {
    const user = userEvent.setup()
    const { unmount } = renderVerdict()
    await user.click(await screen.findByRole('button', { name: '4 of 5' }))
    await screen.findByText(/Your answer stays on this phone/)
    await waitFor(async () => expect((await listEvents()).map((e) => e.name).sort()).toEqual(['usefulness_rated', 'verdict_viewed']))
    unmount()
    renderVerdict()
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('How useful is this change for you?')).toBeNull()
  })

  it('can be skipped, and is never asked for the sample, a pain pause or "Not comparable yet"', async () => {
    const user = userEvent.setup()
    const first = renderVerdict()
    await user.click(await screen.findByRole('button', { name: 'Skip' }))
    expect(screen.queryByText('How useful is this change for you?')).toBeNull()
    first.unmount()
    for (const props of [{ experiment: exp({ id: 'demo', isDemo: 1 }) }, { experiment: exp({ id: 'p' }), paused: true }, { experiment: exp({ id: 'n' }), verdict: 'not-comparable' }]) {
      const r = renderVerdict(props)
      await new Promise((res) => setTimeout(res, 50))
      expect(screen.queryByText('How useful is this change for you?')).toBeNull()
      r.unmount()
    }
    expect((await listEvents()).some((e) => e.name === 'verdict_viewed' && e.props.verdict === 'clearly-better')).toBe(false)
  })
})

describe('update prompt', () => {
  const renderPrompt = (tabBar = true) =>
    render(
      <MemoryRouter>
        <ShellContext.Provider value={{ tabBar }}>
          <UpdatePrompt />
        </ShellContext.Provider>
      </MemoryRouter>,
    )

  it('waits for the player, and stays out of full-screen flows and running analyses', async () => {
    const apply = vi.fn()
    usePwa.setState({ updateReady: true, applyUpdate: apply })
    const user = userEvent.setup()
    const { unmount } = renderPrompt()
    expect(await screen.findByText('A new version is ready.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reload' }))
    expect(apply).toHaveBeenCalledOnce()
    unmount()

    renderPrompt(false)
    expect(screen.queryByText('A new version is ready.')).toBeNull()
  })

  it('hides for this launch on Later, and while an analysis runs', async () => {
    usePwa.setState({ updateReady: true })
    act(() => useUiStore.setState({ activeJob: { sessionId: 's' } as never }))
    const user = userEvent.setup()
    renderPrompt()
    expect(screen.queryByText('A new version is ready.')).toBeNull()
    act(() => useUiStore.setState({ activeJob: null }))
    await user.click(await screen.findByRole('button', { name: 'Later' }))
    await waitFor(() => expect(screen.queryByText('A new version is ready.')).toBeNull())
  })
})

describe('interrupted recording offer', () => {
  it('offers the clip on a tab screen with analyse, not now and a confirmed delete', async () => {
    recoverable.list = [
      { recordingId: 'rec-1', header: { mimeType: 'video/webm', startedAt: new Date(2026, 8, 26, 18, 40).getTime() }, chunks: 220, bytes: 9e7, seconds: 220, startedAt: new Date(2026, 8, 26, 18, 40).getTime(), lastWrittenAt: 0 },
    ]
    const user = userEvent.setup()
    renderAt(paths.today())
    const dialog = await screen.findByRole('dialog', { name: 'A recording was interrupted' }, { timeout: 4000 })
    expect(dialog).toHaveTextContent('We kept 3:40 of video from Sat 26 Sep at 6:40 pm.')
    expect(within(dialog).getByRole('button', { name: 'Analyse recording' })).toBeInTheDocument()
    expect(lintCopy(dialog.textContent ?? '')).toEqual([])
    await user.click(within(dialog).getByRole('button', { name: 'Delete recording' }))
    expect(await screen.findByRole('dialog', { name: 'Delete this recording?' })).toHaveTextContent("This can't be undone.")
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    await user.click(await screen.findByRole('button', { name: 'Not now' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'A recording was interrupted' })).toBeNull())
  })
})
