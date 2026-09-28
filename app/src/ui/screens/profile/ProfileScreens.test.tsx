import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { METRIC_IDS } from '../../../analysis/types.ts'
import { resetDbForTests } from '../../../data/db.ts'
import { DEMO_FIXTURES, getProfile, getSetting, hasDemoData, listSessions, loadDemoData, saveProfile, setSetting, useSettingsStore } from '../../../data/index.ts'
import { lintCopy } from '../../copy/lint.ts'
import { useUiStore } from '../../../data/stores/ui.ts'
import { useFocusStore } from '../focus/focusStore.ts'
import { useRecordFlow } from '../record/flow/flowStore.ts'
import { hasHandle, startAnalysis, useJobs } from '../record/flow/jobs.ts'
import { useTodayStore } from '../today/todayStore.ts'
import { paths } from '../../shell/paths.ts'
import { routes } from '../../shell/routes.ts'
import { ThemeProvider } from '../../theme/ThemeProvider.tsx'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  )
  return router
}
const h1 = (name: string | RegExp) => screen.findByRole('heading', { level: 1, name }, { timeout: 3000 })

beforeEach(async () => {
  await resetDbForTests()
  await setSetting('onboarding', { status: 'completed' })
  const { id: _id, createdAt: _c, updatedAt: _u, inSegment: _s, ...profile } = DEMO_FIXTURES.profile
  await saveProfile(profile)
  useSettingsStore.setState({ experimentalMetrics: false })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const SCREENS: [string, string][] = [
  [paths.profile(), 'You'],
  [paths.yourServe(), 'Your serve'],
  [paths.comfort(), 'Comfort and body'],
  [paths.coachFocus(), "My coach's focus"],
  [paths.storage(), 'Storage and privacy'],
  [paths.howWeMeasure(), 'How we measure'],
  [paths.appearance(), 'Appearance'],
  [paths.about(), 'About and legal'],
]

describe('profile screens render (smoke)', () => {
  it.each(SCREENS)('%s renders "%s", lint-clean, with no console errors', async (path, title) => {
    await loadDemoData()
    const errors = vi.spyOn(console, 'error')
    renderAt(path)
    await h1(title)
    // Let live queries settle.
    await new Promise((r) => setTimeout(r, 30))
    expect(lintCopy(document.body.textContent ?? '')).toEqual([])
    for (const el of document.querySelectorAll<HTMLElement>('[data-metric]')) expect(el.dataset.status, el.dataset.metric).toBeTruthy()
    expect(errors).not.toHaveBeenCalled()
  })
})

describe('Profile', () => {
  it('shows the summary line, the sample banner with Remove, and the experimental switch', async () => {
    const user = userEvent.setup()
    await loadDemoData()
    renderAt(paths.profile())
    await h1('You')
    expect(await screen.findByText(/1\.78 m, right-handed, UTR 4\.5 \(you logged\)/)).toBeInTheDocument()
    const sw = screen.getByRole('switch', { name: 'Experimental metrics' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    await user.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'true')
    await waitFor(async () => expect(await getSetting('experimentalMetrics')).toBe(true))
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(async () => expect(await hasDemoData()).toBe(false))
    expect(await screen.findByText('See a sample session')).toBeInTheDocument()
  })

  it('has an entry to the match log that comes back to You (U3)', async () => {
    const user = userEvent.setup()
    const router = renderAt(paths.profile())
    await h1('You')
    const row = await screen.findByRole('link', { name: /Match log/ })
    expect(row).toHaveTextContent('Log a comp night in about 20 seconds')
    expect(row.getAttribute('href')).toBe(`/sessions/matches/new?from=${encodeURIComponent('/profile')}`)
    await user.click(row)
    await h1('Log a match')
    expect(router.state.location.pathname).toBe('/sessions/matches/new')
    expect(screen.getByRole('link', { name: /Back to You/ })).toHaveAttribute('href', '/profile')
  })
})

describe('Your serve', () => {
  it('edits the height and level and saves them', async () => {
    const user = userEvent.setup()
    const router = renderAt(paths.yourServe())
    await h1('Your serve')
    const height = await screen.findByLabelText('Your height')
    await user.clear(height)
    await user.type(height, '181')
    expect(await screen.findByText(/Centimetres will use your new height/)).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: "I don't have one" }))
    await user.click(screen.getByRole('radio', { name: 'I play competition or pennant' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/profile'))
    const p = await getProfile()
    expect(p?.heightM).toBe(1.81)
    expect(p?.utr).toBeUndefined()
    expect(p?.level).toBe('utr-4-5')
  })
})

describe('Your serve unsaved changes', () => {
  it('asks before leaving with unsaved edits, and stays when asked to keep editing', async () => {
    const user = userEvent.setup()
    const router = renderAt(paths.yourServe())
    await h1('Your serve')
    await user.click(await screen.findByRole('radio', { name: 'Left' }))
    await user.click(screen.getByRole('link', { name: 'Back to You' }))
    const dialog = await screen.findByRole('dialog', { name: 'Discard your changes?' })
    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    expect(router.state.location.pathname).toBe('/profile/your-serve')
    await user.click(screen.getByRole('link', { name: 'Back to You' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Discard your changes?' })).getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/profile'))
    expect((await getProfile())?.handedness).toBe('right')
  })
})

describe('Comfort and body', () => {
  it('needs consent before keeping areas, and deletes comfort notes on request', async () => {
    const user = userEvent.setup()
    renderAt(paths.comfort())
    await h1('Comfort and body')
    expect(await screen.findByText(/Turn on “Save comfort answers on this phone”/)).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'Save comfort answers on this phone' }))
    await waitFor(async () => expect((await getSetting('consents')).painNotes?.granted).toBe(true))
    await user.click(await screen.findByRole('checkbox', { name: 'Back' }))
    await waitFor(async () => expect((await getProfile())?.comfortRegions).toEqual(['back']))
    await user.click(screen.getByRole('button', { name: 'Delete comfort notes' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete comfort notes?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect((await getProfile())?.comfortRegions).toEqual([]))
  })
})

describe('My coach focus and sharing', () => {
  it('pins a focus from the library and shares a summary file without any network call', async () => {
    const user = userEvent.setup()
    await loadDemoData()
    const created: Blob[] = []
    const createObjectURL = vi.fn((b: Blob) => {
      created.push(b)
      return 'blob:test'
    })
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    renderAt(paths.coachFocus())
    await h1("My coach's focus")
    await user.click(await screen.findByRole('button', { name: 'Choose a focus' }))
    const sheet = await screen.findByRole('dialog', { name: "Your coach's focus" })
    await user.click(within(sheet).getByRole('radio', { name: /Contact in front/ }))
    await user.click(within(sheet).getByRole('button', { name: 'Pin focus' }))
    await waitFor(async () => expect((await getProfile())?.pinnedFocusItemId).toBe('contact-in-front'))

    await screen.findByText('What your coach will see')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Share summary' })).not.toHaveAttribute('aria-disabled'))
    await user.click(screen.getByRole('button', { name: 'Share summary' }))
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled())
    const html = await created[0].text()
    expect(html).toContain('Sample data · synthetic player')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('Storage and privacy', () => {
  it('lists sessions, changes retention, and "Delete everything" needs the typed word', async () => {
    const user = userEvent.setup()
    const { id: _id, createdAt: _c, updatedAt: _u, inSegment: _s, ...profile } = DEMO_FIXTURES.profile
    await saveProfile(profile)
    renderAt(paths.storage())
    await h1('Storage and privacy')
    expect(await screen.findByText(/On this phone:/)).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Keep' }))
    await waitFor(async () => expect((await getSetting('retention')).policy).toBe('keep'))

    await user.click(screen.getByRole('button', { name: 'Delete everything' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete everything?' })
    const confirm = within(dialog).getByRole('button', { name: 'Delete' })
    expect(confirm).toHaveAttribute('aria-disabled', 'true')
    await user.type(within(dialog).getByLabelText(/Type “delete” to confirm/), 'delete')
    expect(confirm).not.toHaveAttribute('aria-disabled')
    await user.click(confirm)
    expect(await screen.findByText('Everything is deleted')).toBeInTheDocument()
    expect(await getProfile()).toBeUndefined()
    expect(await listSessions()).toEqual([])
  })

  it('"Delete everything" leaves nothing in memory: jobs and their video, a referral, the re-test plan (finding 18)', async () => {
    const user = userEvent.setup()
    const clip = { title: 'Mon 28 Sep, 0:05', line: 'Side view, deuce, first serves', tech: '1080p, 60 fps', orientation: 'portrait' as const }
    void startAnalysis({
      sessionId: 'running',
      file: new Blob(['x']),
      clip,
      run: { profile: { heightM: 1.8, handedness: 'right' }, view: 'side', capture: {} as never },
      runner: (_f, o) =>
        new Promise((_r, reject) => {
          const stop = () => reject(new DOMException('stop', 'AbortError'))
          if (o.signal.aborted) stop()
          else o.signal.addEventListener('abort', stop)
        }),
    })
    useFocusStore.getState().setReferral('stop-and-book')
    useRecordFlow.getState().setPlan('retest')
    useTodayStore.getState().dismissMorningAfter('2026-09-27')
    renderAt(paths.storage())
    await h1('Storage and privacy')
    expect(await screen.findByText(/On this phone:/)).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Delete everything' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete everything?' })
    await user.type(within(dialog).getByLabelText(/Type “delete” to confirm/), 'delete')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Everything is deleted')).toBeInTheDocument()
    expect(useJobs.getState().jobs).toEqual({})
    expect(hasHandle('running')).toBe(false)
    expect(useUiStore.getState().activeJob).toBeNull()
    expect(useFocusStore.getState().referral).toBeUndefined()
    expect(useRecordFlow.getState().plan).toBe('check-in')
    expect(useTodayStore.getState().morningAfterDismissed).toBeUndefined()
  })
})

describe('How we measure', () => {
  it('lists every metric with its label and links to its info page', async () => {
    renderAt(paths.howWeMeasure())
    await h1('How we measure')
    const rows = document.querySelectorAll<HTMLElement>('[data-index-metric]')
    expect(rows.length).toBe(METRIC_IDS.length)
    for (const r of rows) expect(r.dataset.status).toBeTruthy()
    expect(screen.getByRole('link', { name: /Spin/ })).toHaveAttribute('href', '/metric/spin')
  })
})

describe('About', () => {
  it('names the MediaPipe and font licences', async () => {
    renderAt(paths.about())
    await h1('About and legal')
    expect(screen.getByText('MediaPipe Tasks Vision')).toBeInTheDocument()
    expect(screen.getAllByText('Apache-2.0').length).toBeGreaterThan(0)
    expect(screen.getByText('SIL Open Font Licence 1.1')).toBeInTheDocument()
  })
})
