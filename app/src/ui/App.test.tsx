import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDbForTests } from '../data/db.ts'
import { loadDemoData } from '../data/demo.ts'
import { setSetting } from '../data/repos/settings.ts'
import { useSettingsStore } from '../data/stores/settings.ts'
import { lintCopy } from './copy/lint.ts'
import { paths } from './shell/paths.ts'
import { routes } from './shell/routes.ts'
import { ThemeProvider } from './theme/ThemeProvider.tsx'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  )
  return router
}

/** Every route and the title its h1 must show. */
const SCREENS: [string, string | RegExp][] = [
  [paths.today(), 'Today'],
  [paths.onboarding(), 'Welcome'],
  [paths.record(), 'Record'],
  [paths.setupChoice(), 'Where will your phone go?'],
  [paths.liveFraming(), 'Live framing'],
  [paths.importVideo(), 'Import a video'],
  [paths.processing('demo-s1'), 'Analysing'],
  [paths.sessions(), 'Sessions'],
  [paths.sessionReport('demo-s1'), 'Sat 12 Sep'],
  [paths.serveDetail('demo-s1', 'demo-s1-serve-07'), 'Serve 7'],
  [paths.tagging('demo-s1'), 'Tag serves'],
  [paths.focus(), 'Your focus'],
  [paths.drill(), 'Drill'],
  [paths.practiceLog(), 'Log practice'],
  [paths.progress(), 'Progress'],
  [paths.compare('demo-exp-toss-height'), 'Did it work?'],
  [paths.profile(), 'You'],
  [paths.yourServe(), 'Your serve'],
  [paths.comfort(), 'Comfort and body'],
  [paths.coachFocus(), "My coach's focus"],
  [paths.storage(), 'Storage and privacy'],
  [paths.howWeMeasure(), 'How we measure'],
  [paths.appearance(), 'Appearance'],
  [paths.about(), 'About and legal'],
  [paths.metricInfo('toss-height-spread'), 'Toss height consistency'],
  [paths.plan(), 'Plan'],
  [paths.devComponents(), 'Components'],
  ['/no-such-page', 'Not found'],
]

beforeEach(async () => {
  await resetDbForTests()
  await loadDemoData()
  useSettingsStore.setState({ experimentalMetrics: false })
})

describe('routes', () => {
  it.each(SCREENS)('%s renders its titled screen', async (path, title) => {
    const errors = vi.spyOn(console, 'error')
    renderAt(path)
    expect(await screen.findByRole('heading', { level: 1, name: title }, { timeout: 3000 })).toBeInTheDocument()
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('tab roots show the tab bar; full-screen flows hide it', async () => {
    renderAt(paths.sessions())
    await screen.findByRole('heading', { level: 1, name: 'Sessions' })
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('the tagging flow has no tab bar', async () => {
    renderAt(paths.tagging('demo-s1'))
    await screen.findByRole('heading', { level: 1, name: 'Tag serves' })
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })
})

describe('honesty on rendered screens (DESIGN §13.7 items 1, 4, 8)', () => {
  it('side-view report: no knee band or rear metrics except "Needs a view from behind" ghost rows, no degrees, no never-say words', async () => {
    renderAt(paths.sessionReport('demo-s1'))
    await screen.findByText('Your serve today')
    await screen.findAllByText('Needs a view from behind')
    const metrics = [...document.querySelectorAll<HTMLElement>('[data-metric]')]
    expect(metrics.length).toBeGreaterThan(5)
    for (const el of metrics) {
      expect(el.dataset.status, el.dataset.metric).toBeTruthy()
      if (['knee-bend-band', 'shoulder-over-shoulder-contact', 'speed-average-rear', 'trunk-tilt-band'].includes(el.dataset.metric ?? '')) {
        expect(el.dataset.status, el.dataset.metric).toBe('unavailable')
      }
    }
    expect(document.querySelector('[data-metric="knee-bend-band"]')?.textContent).toContain('Needs a view from behind')
    expect(document.querySelector('[data-metric="shoulder-over-shoulder-contact"]')?.textContent).toContain('Needs a view from behind')
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/\d\s*°/)
    expect(lintCopy(text)).toEqual([])
    // Sample data is always labelled (PRODUCT §4.4 rule 11).
    expect(screen.getByText('Sample data · synthetic player')).toBeInTheDocument()
  })

  it('experimental values stay hidden until the toggle is on', async () => {
    renderAt(paths.sessionReport('demo-s3'))
    await screen.findByText('Your serve today')
    expect(document.querySelector('[data-metric="speed-experimental"]')).toBeNull()
  })

  it('with the toggle on, experimental speed shows only as an "about" range with its quantity (D4)', async () => {
    await setSetting('experimentalMetrics', true)
    useSettingsStore.setState({ experimentalMetrics: true })
    renderAt(paths.sessionReport('demo-s3'))
    await screen.findByText('Your serve today')
    const speed = document.querySelector('[data-metric="speed-experimental"]')
    expect(speed?.getAttribute('data-status')).toBe('experimental')
    expect(speed?.textContent).toMatch(/about 130 to 145/)
  })

  it('the component gallery labels every number and passes the copy lint', async () => {
    renderAt(paths.devComponents())
    await screen.findByRole('heading', { level: 1, name: 'Components' })
    for (const el of document.querySelectorAll<HTMLElement>('[data-metric]')) {
      expect(el.dataset.status, el.dataset.metric).toBeTruthy()
    }
    expect(lintCopy(document.body.textContent ?? '')).toEqual([])
  })
})
