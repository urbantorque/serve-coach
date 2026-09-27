// The engine's runtime copy of metrics.json values must not drift from the spec twin.
import { describe, expect, it } from 'vitest'
import catalogueJson from '../../../../docs/specs/metrics.json?raw'
import { METRIC_IDS, type MetricId } from '../types.ts'
import { METRIC_VIEWS, PLAUSIBILITY, POSE_DERIVED_IDS, SPATIAL_SPREAD_IDS, STATUS_TARGET, TIMING_METRIC_IDS, UNLOCK_HINTS, VALIDATION_LEVELS, statusCeiling } from './catalogue.ts'

interface Json {
  metrics: { id: string; views: string[]; statusTarget: string }[]
  reasonCodes: Record<string, { unlockHint?: string }>
  timingMetricIds: string[]
  spatialSpreadIds: string[]
  poseDerivedIds: string[]
  plausibility: Record<string, { hardReject?: unknown; softFlag?: unknown }>
}
const json = JSON.parse(catalogueJson) as Json

describe('engine catalogue vs metrics.json', () => {
  it('has a target status and views for every id, matching the JSON', () => {
    for (const m of json.metrics) {
      expect(STATUS_TARGET[m.id as MetricId], m.id).toBe(m.statusTarget)
      expect([...METRIC_VIEWS[m.id as MetricId]].sort(), m.id).toEqual([...m.views].sort())
    }
    expect(Object.keys(STATUS_TARGET).sort()).toEqual([...METRIC_IDS].sort())
  })

  it('uses the JSON id groups', () => {
    expect([...TIMING_METRIC_IDS]).toEqual(json.timingMetricIds)
    expect([...SPATIAL_SPREAD_IDS]).toEqual(json.spatialSpreadIds)
    expect([...POSE_DERIVED_IDS]).toEqual(json.poseDerivedIds)
  })

  it('copies every unlock hint verbatim', () => {
    for (const [code, v] of Object.entries(json.reasonCodes)) {
      expect(UNLOCK_HINTS[code as keyof typeof UNLOCK_HINTS], code).toBe(v.unlockHint ?? '')
    }
  })

  it('copies the plausibility bounds', () => {
    const j = json.plausibility
    expect(PLAUSIBILITY.releaseToContactS.hard).toEqual(j.releaseToContactS.hardReject)
    expect(PLAUSIBILITY.releaseToContactS.soft).toEqual(j.releaseToContactS.softFlag)
    expect(PLAUSIBILITY.contactHeightRatio.hard).toEqual(j.contactHeightRatio.hardReject)
    expect(PLAUSIBILITY.landingM.hard).toEqual(j.landingM.hardReject)
    expect(PLAUSIBILITY.legDrivePctHeight.soft).toEqual(j.legDrivePctHeight.softFlag)
    expect(PLAUSIBILITY.fittedGravityMps2.hard).toEqual(j.fittedGravityMps2.hardReject)
  })

  it('caps V0 metrics at experimental and never lifts a target', () => {
    expect(statusCeiling('trophy-pause', 'day').status).toBe('experimental')
    expect(statusCeiling('spin', 'day').status).toBe('unavailable')
    expect(statusCeiling('serve-in-rate', 'day').status).toBe('player-entered')
    for (const [id, levels] of Object.entries(VALIDATION_LEVELS)) {
      for (const c of Object.keys(levels ?? {})) {
        const { status } = statusCeiling(id as MetricId, c as 'day')
        expect(['estimated', 'experimental', 'player-entered']).toContain(status)
      }
    }
  })

  it('never validates pose-derived metrics under lights or flicker (night cap)', () => {
    for (const id of POSE_DERIVED_IDS) {
      expect(VALIDATION_LEVELS[id]?.['night-lights'] ?? 'V0').toBe('V0')
      expect(VALIDATION_LEVELS[id]?.flicker ?? 'V0').toBe('V0')
    }
  })
})
