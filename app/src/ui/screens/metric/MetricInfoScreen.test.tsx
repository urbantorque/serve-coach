import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTests } from '../../../data/db.ts'
import { loadDemoData } from '../../../data/demo.ts'
import { useSettingsStore } from '../../../data/stores/settings.ts'
import { paths } from '../../shell/paths.ts'
import { expectHonest, renderAt, seedPlayer } from '../progress/insights/testing.tsx'

beforeEach(async () => {
  await resetDbForTests()
  useSettingsStore.setState({ experimentalMetrics: false })
})

describe('Metric info', () => {
  it('this value with its state, what it is, trend, how we measure, needs, how sure, limits and context', async () => {
    await seedPlayer()
    renderAt(`${paths.metricInfo('toss-height-spread')}?session=own-s3`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Toss height consistency' }, { timeout: 3000 })).toBeInTheDocument()
    await screen.findByText('What it is', {}, { timeout: 3000 })
    expect(document.querySelector('[data-metric="toss-height-spread"]')?.getAttribute('data-status')).toBe('estimated')
    for (const s of ['What it is', 'Your trend', 'How we measure it', 'What it needs', 'How sure we are', 'Known limits', 'Typical for club players (provisional)', 'For context']) {
      expect(screen.getByText(s)).toBeInTheDocument()
    }
    expect(screen.getByText(/simulated side-view clips, the toss peak height was typically within/)).toBeInTheDocument()
    expect(screen.getByText(/Not a target/)).toBeInTheDocument()
    expect(screen.getByText(/Yours: /)).toBeInTheDocument()
    expectHonest()
  })

  it('bands and legs are compared only with your own serves (D5)', async () => {
    await seedPlayer()
    renderAt(paths.metricInfo('leg-drive'))
    expect(await screen.findByText('Compared with your own serves', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.queryByText('For context')).toBeNull()
    expect(screen.queryByText(/Typical for club players/)).toBeNull()
  })

  it('what the side view cannot see leads with the reason and the unlock (D1)', async () => {
    await loadDemoData()
    renderAt(`${paths.metricInfo('knee-bend-band')}?session=demo-s1`)
    expect(await screen.findByText('Needs a view from behind', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getAllByText(/your knees point at the camera/).length).toBeGreaterThan(0)
    expectHonest()
  })

  it('experimental speed stays hidden with the toggle off, and spin is never available', async () => {
    await loadDemoData()
    renderAt(`${paths.metricInfo('speed-experimental')}?session=demo-s3`)
    expect(await screen.findByText('Experimental (off)', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/130 to 145/)
  })

  it('unknown ids say so', async () => {
    renderAt(paths.metricInfo('trunk-tilt-band'))
    expect(await screen.findByText("We don't know this measurement", {}, { timeout: 3000 })).toBeInTheDocument()
  })
})
