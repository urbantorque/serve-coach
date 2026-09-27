import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync, existsSync } from 'node:fs'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDbForTests } from '../../../data/db.ts'
import { loadDemoData } from '../../../data/demo.ts'
import { useSettingsStore } from '../../../data/index.ts'
import { lintCopy } from '../../copy/lint.ts'
import { paths } from '../../shell/paths.ts'
import { routes } from '../../shell/routes.ts'
import { ThemeProvider } from '../../theme/ThemeProvider.tsx'
import { setRunAnalysisForTests, type RunAnalysis } from './flow/analysisAdapter.ts'
import { useRecordFlow } from './flow/flowStore.ts'
import { resetJobsForTests, startAnalysis } from './flow/jobs.ts'

/** Screens are lazy route chunks; under a full parallel test run the first load can take seconds. */
const LOAD = { timeout: 8000 }
vi.setConfig({ testTimeout: 30_000 })

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  )
  return router
}

/** Every visible string on the page passes the copy lint (DESIGN §11, §13.7). */
function expectCleanCopy() {
  const text = document.body.textContent ?? ''
  expect(lintCopy(text)).toEqual([])
}

beforeEach(async () => {
  await resetDbForTests()
  await loadDemoData()
  resetJobsForTests()
  useSettingsStore.setState({ experimentalMetrics: false })
  useRecordFlow.setState({ bodyCheckedAt: null, setup: 'portrait', plan: 'check-in' })
  try {
    localStorage.clear()
  } catch {
    // no storage in this environment
  }
})
afterEach(() => setRunAnalysisForTests(undefined))

describe('Record tab', () => {
  it('shows plans, the block card and the three ways in; Set up camera runs the body check first', async () => {
    const user = userEvent.setup()
    const errors = vi.spyOn(console, 'error')
    const router = renderAt(paths.record())
    expect(await screen.findByRole('heading', { level: 1, name: 'Record' }, LOAD)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Check-in/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radiogroup', { name: 'Side' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Set-up guide/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Import a video/ })).toBeInTheDocument()
    expectCleanCopy()

    await user.click(screen.getByRole('button', { name: 'Set up camera' }))
    const dialog = await screen.findByRole('dialog', { name: 'Quick body check' })
    await user.click(within(dialog).getByRole('button', { name: 'All good' }))
    // First time: "Filming at the courts", then the set-up choice.
    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    expect(router.state.location.pathname).toBe(paths.setupChoice())
    expect(useRecordFlow.getState().bodyCheckedAt).not.toBeNull()
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('"It hurts" leads to the red-flag questions and a referral, and no recording', async () => {
    const user = userEvent.setup()
    renderAt(paths.record())
    await user.click(await screen.findByRole('button', { name: 'Set up camera' }, LOAD))
    await user.click(await screen.findByRole('button', { name: 'It hurts' }))
    await user.click(await screen.findByRole('checkbox', { name: /Chest pain/ }))
    await user.click(screen.getByRole('button', { name: 'One or more of these' }))
    expect(await screen.findByRole('link', { name: 'Call 000' })).toHaveAttribute('href', 'tel:000')
    await user.click(screen.getByRole('button', { name: 'OK' }))
    expect(useRecordFlow.getState().bodyCheckedAt).toBeNull()
  })
})

describe('Set-up choice and guide', () => {
  it('preselects upright, switches to the fence, and draws the diagrams as labelled images', async () => {
    const user = userEvent.setup()
    renderAt(paths.setupChoice())
    expect(await screen.findByRole('heading', { level: 1, name: 'Where will your phone go?' }, LOAD)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Upright beside the court/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getAllByRole('img', { name: /plan view/ }).length).toBeGreaterThanOrEqual(3)
    expect(screen.getByRole('img', { name: /side view/ })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /Sideways at the fence/ }))
    expect(useRecordFlow.getState().setup).toBe('fence')
    expect(screen.getByText('Hot day?')).toBeInTheDocument()
    expectCleanCopy()
  })
})

describe('Live framing', () => {
  it('asks the body check, then the pre-alert, then explains a missing camera and offers import', async () => {
    const user = userEvent.setup()
    renderAt(paths.liveFraming())
    expect(await screen.findByRole('heading', { level: 1, name: 'Live framing' }, LOAD)).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'All good' }))
    expect(await screen.findByRole('heading', { name: 'Camera and level' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    // jsdom has no camera: the page says what is missing instead of hanging.
    expect(await screen.findByRole('link', { name: /Import a video/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/camera/i)
    expectCleanCopy()
  })
})

describe('Import', () => {
  it('reads a real clip, asks the questions and needs a height before Analyse', async () => {
    const clip = new URL('../../../../../validation/synthetic/clips/crf36-s3/crf36-s3.mp4', import.meta.url)
    const user = userEvent.setup()
    renderAt(paths.importVideo())
    expect(await screen.findByRole('heading', { level: 1, name: 'Import a video' }, LOAD)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose a video' })).toBeInTheDocument()
    expectCleanCopy()
    if (!existsSync(clip)) return
    const file = new File([readFileSync(clip)], 'crf36-s3.mp4', { type: 'video/mp4' })
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    await act(async () => {
      await user.upload(input, file)
    })
    expect(await screen.findByText(/0:05 · 1080p · 60 fps · upright/, undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Side, my hitting-arm side/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Add your height and serving hand to continue.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Analyse' })).toHaveAttribute('aria-disabled', 'true')
    expectCleanCopy()
  })

  it('explains an unreadable file', async () => {
    const user = userEvent.setup()
    renderAt(paths.importVideo())
    await screen.findByRole('button', { name: 'Choose a video' }, LOAD)
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    await act(async () => {
      await user.upload(input, new File([new Uint8Array(64)], 'notes.mp4', { type: 'video/mp4' }))
    })
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't read this video")
  })
})

describe('Processing', () => {
  it('shows staged progress and Cancel while a job runs, then opens the report', async () => {
    let finish: () => void = () => undefined
    const runner: RunAnalysis = (_f, o) =>
      new Promise((resolve) => {
        o.onProgress({ type: 'progress', progress: { stage: 'dense', label: 'Tracking the toss (serve 2 of 9)', overall: 0.5, servesFound: 9, servesDone: 1 } })
        finish = () => resolve({ sessionId: 'demo-s1' })
      })
    void startAnalysis({
      sessionId: 'demo-s1',
      file: new Blob(['x']),
      run: { profile: { handedness: 'right' }, view: 'side', capture: {} as never },
      clip: { title: 'Sat 12 Sep, 5:12', line: 'Side view, deuce, first serves', tech: '1080p, 60 fps', orientation: 'portrait' },
      runner,
    })
    const router = renderAt(paths.processing('demo-s1'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Analysing' }, LOAD)).toBeInTheDocument()
    expect(await screen.findByText('serve 2 of 9')).toBeInTheDocument()
    expect(screen.getByText('9 found')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getByText(/You can leave this screen/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel analysis' })).toBeInTheDocument()
    expectCleanCopy()
    await act(async () => finish())
    await vi.waitFor(() => expect(router.state.location.pathname).toBe(paths.sessionReport('demo-s1')), { timeout: 2000 })
  })

  it('without a running job: an analysed session links to its report; an unknown one says so', async () => {
    renderAt(paths.processing('demo-s1'))
    expect(await screen.findByText('This session is analysed', undefined, LOAD)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Report ready' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open report' })).toHaveAttribute('href', paths.sessionReport('demo-s1'))
  })

  it('an unknown session says so', async () => {
    renderAt(paths.processing('no-such-session'))
    expect(await screen.findByText("We couldn't find this session", undefined, LOAD)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Session not found' })).toBeInTheDocument()
  })
})
