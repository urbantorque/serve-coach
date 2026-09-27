import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDbForTests } from '../../../data/db.ts'
import { getSetting, setSetting } from '../../../data/index.ts'
import { lintCopy } from '../../copy/lint.ts'
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

beforeEach(async () => {
  await resetDbForTests()
  await setSetting('onboarding', { status: 'completed' })
})

describe('Plan (prototype paywall)', () => {
  it('shows the plans equally, nothing preselected, clearly labelled as a prototype', async () => {
    const errors = vi.spyOn(console, 'error')
    renderAt(paths.plan())
    await screen.findByRole('heading', { level: 1, name: 'Plan' }, { timeout: 3000 })
    expect(await screen.findByText(/Prototype: no payment is taken/)).toBeInTheDocument()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(3)
    for (const r of radios) expect(r).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('A$99.99')).toBeInTheDocument()
    expect(screen.getByText('A$14.99')).toBeInTheDocument()
    expect(screen.getByText('A$39.99')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose a plan' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('link', { name: 'Not now' })).toHaveAttribute('href', '/profile')
    expect(lintCopy(document.body.textContent ?? '')).toEqual([])
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('a plan button only switches the local test flag and says no payment was taken', async () => {
    const user = userEvent.setup()
    renderAt(paths.plan())
    await user.click(await screen.findByRole('radio', { name: /Yearly/ }))
    expect(screen.getByText(/Free for 7 days, then A\$99\.99 a year/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start 7-day trial' }))
    expect(await screen.findByRole('dialog', { name: "Plus isn't on sale yet" })).toBeInTheDocument()
    const e = await getSetting('entitlement')
    expect(e).toMatchObject({ tier: 'plus', plan: 'annual', source: 'prototype' })
    expect(Object.keys(e).sort()).toEqual(['at', 'plan', 'source', 'tier', 'trialEndsAt'])
  })

  it('test Plus can be switched off again', async () => {
    const user = userEvent.setup()
    await setSetting('entitlement', { tier: 'plus', plan: 'monthly', source: 'prototype', at: new Date().toISOString() })
    renderAt(paths.plan())
    await user.click(await screen.findByRole('button', { name: 'Switch off test Plus' }))
    await waitFor(async () => expect((await getSetting('entitlement')).tier).toBe('free'))
  })
})
