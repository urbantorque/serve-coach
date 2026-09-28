// Finding 55: How we measure never lets a side-view synthetic error read as valid from behind.
import { describe, expect, it } from 'vitest'
import { METRIC_VIEWS, statusCeiling } from '../../../analysis/metrics/catalogue.ts'
import { METRIC_IDS } from '../../../analysis/types.ts'
import { groupOf, measureIndex, measureRow, viewWords } from './measureIndex.ts'

describe('How we measure: views and groups (finding 55)', () => {
  it('every two-view row that quotes a typical error says it was scored or checked from the side only', () => {
    for (const id of METRIC_IDS) {
      const row = measureRow(id)
      if (METRIC_VIEWS[id].length !== 2 || !row.validationWords.includes('Typical error')) continue
      expect(row.views, id).toMatch(/^Either view, (checked|scored) from the side only$/)
    }
    // Toss height and trophy pause (V0, side-view scores only) no longer read as plain "Either view".
    expect(measureRow('toss-apex-height').views).toBe(statusCeiling('toss-apex-height', 'day').level === 'V0' ? 'Either view, scored from the side only' : 'Either view, checked from the side only')
    expect(measureRow('trophy-pause').views).toBe('Either view, scored from the side only')
    expect(measureRow('toss-drop').views).toBe('Either view, checked from the side only')
  })

  it('rows with no score keep the plain view words', () => {
    expect(viewWords(['side', 'rear'], 'V0')).toBe('Either view')
    expect(viewWords(['side', 'rear'], 'V0', true)).toBe('Either view, scored from the side only')
    expect(viewWords(['side'], 'V1', true)).toBe('Side view')
    expect(measureRow('serve-in-rate').views).toBe('Either view')
  })

  it('rows sit in the group of the status the engine emits (toss front-back spread under Estimate, positions experimental)', () => {
    for (const g of measureIndex()) for (const r of g.rows) expect(groupOf(r)).toBe(g.group)
    expect(groupOf(measureRow('toss-forward-spread'))).toBe(statusCeiling('toss-forward-spread', 'day').status === 'experimental' ? 'experimental' : 'video')
    expect(groupOf(measureRow('toss-forward'))).toBe('experimental')
  })
})
