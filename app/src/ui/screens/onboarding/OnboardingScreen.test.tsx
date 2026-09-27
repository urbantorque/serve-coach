import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getProfile, getSetting, loadDemoData, setSetting } from '../../../data/index.ts'
import { resetDbForTests } from '../../../data/db.ts'
import { lintCopy } from '../../copy/lint.ts'
import { paths } from '../../shell/paths.ts'
import { routes } from '../../shell/routes.ts'
import { ThemeProvider } from '../../theme/ThemeProvider.tsx'
import { firstRunGateTesting } from './actions.ts'
import { useOnboardingDraft } from './draftStore.ts'
import { EMPTY_DRAFT, STEPS } from './model.ts'

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
  useOnboardingDraft.getState().reset()
  try {
    sessionStorage.clear()
  } catch {
    // ignore
  }
})

describe('first-run redirect', () => {
  beforeAll(() => {
    firstRunGateTesting.enabled = true
  })
  afterAll(() => {
    firstRunGateTesting.enabled = false
  })

  it('sends a brand-new player from Today to onboarding', async () => {
    const router = renderAt(paths.today())
    await h1('Welcome')
    expect(router.state.location.pathname).toBe('/onboarding')
  })

  it('never redirects a player who has sessions (sample data included)', async () => {
    await loadDemoData()
    const router = renderAt(paths.today())
    await h1('Today')
    await new Promise((r) => setTimeout(r, 50))
    expect(router.state.location.pathname).toBe('/')
  })

  it('never redirects after set-up was skipped', async () => {
    await setSetting('onboarding', { status: 'skipped', at: new Date().toISOString() })
    const router = renderAt(paths.today())
    await h1('Today')
    await new Promise((r) => setTimeout(r, 50))
    expect(router.state.location.pathname).toBe('/')
  })

  it('never redirects deep links', async () => {
    const router = renderAt(paths.sessions())
    await h1('Sessions')
    expect(router.state.location.pathname).toBe('/sessions')
  })
})

describe('onboarding screens render (smoke)', () => {
  it.each(STEPS.filter((s) => s !== 'welcome'))('%s renders a titled, lint-clean screen', async (step) => {
    useOnboardingDraft.setState({ draft: { ...EMPTY_DRAFT, adult: true } })
    const errors = vi.spyOn(console, 'error')
    renderAt(paths.onboarding(step))
    const heading = await screen.findByRole('heading', { level: 1 }, { timeout: 3000 })
    expect(heading.textContent).toBeTruthy()
    expect(lintCopy(document.body.textContent ?? '')).toEqual([])
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('questions after the age check need a yes first', async () => {
    const router = renderAt(paths.onboarding('goal'))
    await h1('Are you 18 or over?')
    expect(router.state.location.pathname).toBe('/onboarding/age')
  })
})

describe('onboarding flow', () => {
  it('walks O1 to O9 and saves the profile once, at the privacy step', async () => {
    const user = userEvent.setup()
    const router = renderAt(paths.onboarding())
    await h1('Welcome')
    expect(screen.getByText('Everything stays on this phone.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Get started' }))

    await h1('Are you 18 or over?')
    await user.click(screen.getByRole('radio', { name: 'Yes' }))

    await h1('How do you play?')
    const cont = () => screen.getByRole('button', { name: 'Continue' })
    expect(cont()).toHaveAttribute('aria-disabled', 'true')
    await user.click(screen.getByRole('checkbox', { name: 'Night comp or association' }))
    await user.click(screen.getByRole('checkbox', { name: 'Tuesday' }))
    await user.click(cont())

    await h1('What costs you points on serve?')
    await user.click(screen.getByRole('radio', { name: 'Double faults' }))
    await user.click(cont())

    await h1('About you')
    expect(screen.getByText('Add your height and serving hand to continue.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Your height'), '178')
    await user.click(screen.getByRole('radio', { name: 'Left' }))
    await user.click(cont())

    await h1('Do you have a UTR?')
    await user.type(screen.getByLabelText('Your UTR'), '4.5')
    await user.click(cont())

    await h1('Any areas to go easy on?')
    await user.click(screen.getByRole('checkbox', { name: 'Shoulder' }))
    expect(cont()).toHaveAttribute('aria-disabled', 'true')
    await user.click(screen.getByRole('radio', { name: 'Save on this phone' }))
    await user.click(cont())

    await h1('Your serve stays on your phone')
    expect(await getProfile()).toBeUndefined()
    await user.click(cont())

    await h1('Want to see how it works first?')
    const p = await getProfile()
    expect(p).toMatchObject({
      heightM: 1.78,
      handedness: 'left',
      utr: 4.5,
      level: 'utr-4-5',
      goal: 'second-serve-reliability',
      playStyle: ['night-comp'],
      matchNights: ['tue'],
      comfortRegions: ['shoulder'],
      ageBand: '18-plus',
      inSegment: 1,
    })
    expect(p?.comfort.painFlag).toBe(0)
    expect((await getSetting('consents')).painNotes?.granted).toBe(true)
    expect((await getSetting('onboarding')).status).toBe('completed')

    await user.click(screen.getByRole('button', { name: 'See a sample session' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/sessions/demo-s3'))
  })

  it('"Skip set-up" still asks the age question, then goes to Today without inventing a profile', async () => {
    const user = userEvent.setup()
    const router = renderAt(paths.onboarding())
    await h1('Welcome')
    await user.click(screen.getByRole('button', { name: 'Skip set-up' }))
    await h1('Are you 18 or over?')
    await user.click(screen.getByRole('radio', { name: 'Yes' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect((await getSetting('onboarding')).status).toBe('skipped')
    expect(await getProfile()).toBeUndefined()
  })

  it('under 18: shows the beta message and stores nothing', async () => {
    const user = userEvent.setup()
    renderAt(paths.onboarding('age'))
    await h1('Are you 18 or over?')
    await user.click(screen.getByRole('radio', { name: 'No' }))
    await h1("Serve Coach is for adults while we're in beta.")
    expect(await getProfile()).toBeUndefined()
    expect((await getSetting('onboarding')).status).toBe('not-started')
  })

  it('leaving set-up part-way keeps the answers so far and ends the redirect', async () => {
    const user = userEvent.setup()
    useOnboardingDraft.setState({ draft: { ...EMPTY_DRAFT, adult: true, playStyle: ['pennant'], goal: 'more-pace' } })
    const router = renderAt(paths.onboarding('you'))
    await h1('About you')
    await user.click(screen.getByRole('button', { name: 'Leave set-up for now' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(await getProfile()).toMatchObject({ playStyle: ['pennant'], goal: 'more-pace' })
    expect((await getProfile())?.heightM).toBeUndefined()
    expect((await getSetting('onboarding')).status).toBe('skipped')
  })

  it('the comfort step offers the referral path without storing answers', async () => {
    const user = userEvent.setup()
    useOnboardingDraft.setState({ draft: { ...EMPTY_DRAFT, adult: true } })
    renderAt(paths.onboarding('comfort'))
    await h1('Any areas to go easy on?')
    await user.click(screen.getByRole('button', { name: 'Something hurts right now?' }))
    expect(await screen.findByRole('dialog', { name: 'Do any of these apply right now?' })).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /Chest pain/ }))
    await user.click(screen.getByRole('button', { name: 'One or more of these' }))
    expect(await screen.findByRole('dialog', { name: 'Please stop and call 000 now.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Call 000' })).toHaveAttribute('href', 'tel:000')
    expect(await getProfile()).toBeUndefined()
  })
})
