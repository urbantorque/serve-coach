// The toss hero's fallbacks: side view without usable front-to-back positions shows a heights strip,
// and an unknown phone tilt shows each peak against the middle one (METRICS §1.1 item 3).
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { MetricValue } from '../../../../analysis/types.ts'
import type { SessionRecord } from '../../../../data/records.ts'
import type { ServeRow } from '../../progress/insights/serves.ts'
import { TossHero } from './TossHero.tsx'

const session = { id: 's1', view: 'side', orientation: 'portrait' } as SessionRecord
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
  [1.8, 1.85, 1.9, 1.78, 1.83, 1.88].map((r, i) => ({
    id: `s1-${i + 1}`,
    index: i + 1,
    included: true,
    exclusions: [],
    kind: 'untagged',
    isLet: false,
    softFlag: false,
    metrics: { 'toss-apex-height': apex(r, pitchUnknown) },
  }))
const spread: MetricValue = { id: 'toss-height-spread', value: 8, unit: 'cm', status: 'estimated', confidence: 0.8, basis: 'test', n: 6 }

const renderHero = (pitchUnknown: boolean) =>
  render(
    <MemoryRouter>
      <TossHero session={session} metrics={{ 'toss-height-spread': spread }} rows={rows(pitchUnknown)} heightM={1.8} previous={[]} usualSpread={null} stratumLabel="Side view, deuce, first serves" experimentalOn={false} />
    </MemoryRouter>,
  )

describe('TossHero fallbacks', () => {
  it('shows peak heights when front-to-back positions cannot be drawn', () => {
    renderHero(false)
    expect(screen.getByRole('heading', { name: 'How high your toss peaked on each serve' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Peak height of each serve, 6 serves/ })).toBeInTheDocument()
  })
  it('shows each peak against the middle one when the phone tilt is unknown', () => {
    renderHero(true)
    expect(screen.getByRole('heading', { name: 'How far each toss peak sat from your middle one' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /above or below the middle one, 6 serves/ })).toBeInTheDocument()
    expect(screen.getByText(/tilt wasn't recorded/)).toBeInTheDocument()
    // Absolute heights stay out of the chart with the experimental toggle off.
    expect(screen.queryByText(/middle 3\.\d\d m/)).toBeNull()
  })
})
