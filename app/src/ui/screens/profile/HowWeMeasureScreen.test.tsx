import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { METRIC_IDS } from '../../../analysis/types.ts'
import { resetDbForTests } from '../../../data/db.ts'
import { lintCopy } from '../../copy/lint.ts'
import { paths } from '../../shell/paths.ts'
import { renderAt } from '../progress/insights/testing.tsx'
import { measureIndex } from './measureIndex.ts'

beforeEach(async () => {
  await resetDbForTests()
})

describe('How we measure: validation layer', () => {
  it('every row carries its validation state in words and links to its info page', async () => {
    renderAt(paths.howWeMeasure())
    expect(await screen.findByRole('heading', { level: 1, name: 'How we measure' }, { timeout: 3000 })).toBeInTheDocument()
    const rows = [...document.querySelectorAll<HTMLElement>('[data-index-metric]')]
    expect(rows.length).toBe(METRIC_IDS.length)
    const byId = new Map(measureIndex().flatMap((g) => g.rows).map((r) => [r.id, r]))
    for (const row of rows) {
      const r = byId.get(row.dataset.indexMetric as never)!
      expect(row.textContent, r.id).toContain(r.validationWords)
      expect(row.querySelector('a')?.getAttribute('href')).toBe(paths.metricInfo(r.id))
    }
    expect(byId.get('toss-apex-height')?.validationWords).toBe('Checked on simulated serves. Typical error: about 1% of your height.')
    expect(byId.get('toss-forward')?.validationWords).toMatch(/^Simulated check not passed yet\./)
    expect(byId.get('first-serve-in-rate')?.validationWords).toBe('You log this.')
  })

  it('shows how far checks have gone, the validation results and known limits, and never claims real courts', async () => {
    renderAt(paths.howWeMeasure())
    expect(await screen.findByText('How far our checks have gone', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByText('Validation results')).toBeInTheDocument()
    expect(screen.getByText(/We ran 122 computer-generated serve clips/)).toBeInTheDocument()
    expect(screen.getByText(/11 measurements passed \(6 on limited evidence\)\. 7 haven.t passed yet and stay experimental\./)).toBeInTheDocument()
    expect(screen.getByText(/Not tested yet: real players, real phones and courts, real court lights/)).toBeInTheDocument()
    expect(screen.getByText('Results by measurement')).toBeInTheDocument()
    expect(document.querySelector('[data-result-metric="toss-forward"]')?.textContent).toMatch(/Not passed yet/)
    expect(document.querySelector('[data-result-metric="toss-apex-height"]')?.textContent).toMatch(/Passed\. Typical error: about 1% of your height/)
    expect(screen.getByText('Known limits')).toBeInTheDocument()
    expect(screen.getAllByText(/Every check so far used computer-generated serves/).length).toBeGreaterThan(0)
    const text = document.body.textContent ?? ''
    expect(lintCopy(text)).toEqual([])
    expect(text.replaceAll(/not yet checked on real/gi, '')).not.toMatch(/checked on real|validated on real|proven/i)
    expect(text).not.toMatch(/\d\s*°/)
  })
})
