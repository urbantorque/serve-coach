// The serve list's toss strip: absolute peak heights when they are usable, otherwise each peak against
// the middle one (METRICS §1.1 item 3), never an empty chart while the relative values are reportable.
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { MetricValue } from '../../../../analysis/types.ts'
import type { ServeRow } from '../../progress/insights/serves.ts'
import { ServeList } from './ServeList.tsx'

const apex = (ratio: number, pitchUnknown: boolean): MetricValue => ({
  id: 'toss-apex-height',
  value: ratio,
  unit: 'ratio-of-height',
  status: pitchUnknown ? 'experimental' : 'estimated',
  ...(pitchUnknown ? { statusIfLevel: 'estimated' as const, reasonCode: 'PITCH_UNKNOWN' as const } : {}),
  confidence: 0.9,
  basis: 'test',
  secondary: { cm: Math.round(ratio * 180) },
})
const rows = (pitchUnknown: boolean): ServeRow[] =>
  [1.8, 1.85, 1.9, 1.78, 1.83].map((r, i) => ({
    id: `s1-${i + 1}`,
    index: i + 1,
    included: true,
    exclusions: [],
    kind: 'untagged',
    isLet: false,
    softFlag: false,
    metrics: { 'toss-apex-height': apex(r, pitchUnknown) },
  }))

const renderList = (pitchUnknown: boolean) =>
  render(
    <MemoryRouter>
      <ServeList sessionId="s1" rows={rows(pitchUnknown)} view="side" orientation="portrait" heightM={1.8} stratumLabel="Side view, deuce, first serves" />
    </MemoryRouter>,
  )

describe('ServeList toss strip', () => {
  it('draws absolute peak heights when they are usable', () => {
    renderList(false)
    expect(screen.getByRole('heading', { name: 'Toss height on each serve' })).toBeInTheDocument()
    expect(screen.queryByText('Not enough measured serves to draw this.')).not.toBeInTheDocument()
  })

  it('falls back to each peak against the middle one when absolute heights are experimental', () => {
    renderList(true)
    expect(screen.getByRole('heading', { name: 'Each toss peak against your middle one' })).toBeInTheDocument()
    expect(screen.queryByText('Not enough measured serves to draw this.')).not.toBeInTheDocument()
    // No absolute metres anywhere in the strip.
    expect(screen.queryByText(/\d\.\d\d m/)).not.toBeInTheDocument()
  })
})
