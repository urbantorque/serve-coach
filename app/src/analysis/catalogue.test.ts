// Keeps the hand-written id unions in types.ts in step with docs/specs/metrics.json until
// scripts/sync-specs.mjs (ARCHITECTURE §3) generates them.
import { describe, expect, it } from 'vitest'
import catalogueJson from '../../../docs/specs/metrics.json?raw'
import {
  METRIC_IDS,
  REAR_ONLY_METRIC_IDS,
  REASON_CODES,
  REMOVED_METRIC_IDS,
  SIDE_ONLY_METRIC_IDS,
} from './types.ts'

interface CatalogueMetric {
  id: string
  views?: string[]
}
interface Catalogue {
  metrics: CatalogueMetric[]
  reasonCodes: Record<string, unknown>
  removedMetricIds: string[]
}

const catalogue = JSON.parse(catalogueJson) as Catalogue

describe('metric catalogue ids', () => {
  it('METRIC_IDS matches metrics.json in catalogue order', () => {
    expect([...METRIC_IDS]).toEqual(catalogue.metrics.map((m) => m.id))
  })

  it('contains the canonical ids and never the removed trunk-tilt-band', () => {
    for (const id of [
      'serve-count', 'toss-apex-height', 'toss-forward', 'toss-drop', 'toss-height-spread',
      'toss-forward-spread', 'contact-height-ratio', 'contact-forward', 'rhythm-release-to-contact',
      'rhythm-spread', 'trophy-pause', 'leg-drive', 'drive-time', 'loading-depth', 'deep-bend-flag',
      'shoulder-tilt-trophy', 'knee-bend-band', 'shoulder-over-shoulder-contact', 'landing-distance',
      'repeatability', 'serve-in-rate', 'first-serve-in-rate', 'double-faults', 'placement-zone',
      'serve-type-mix', 'speed-experimental', 'speed-average-rear', 'speed-radar-entered', 'spin',
      'capture-quality',
    ]) {
      expect(METRIC_IDS as readonly string[]).toContain(id)
    }
    expect(METRIC_IDS as readonly string[]).not.toContain('trunk-tilt-band')
    expect([...REMOVED_METRIC_IDS]).toEqual(catalogue.removedMetricIds)
  })

  it('view-only lists agree with the catalogue views', () => {
    const rearOnly = catalogue.metrics.filter((m) => m.views?.length === 1 && m.views[0] === 'rear').map((m) => m.id)
    const sideOnly = catalogue.metrics.filter((m) => m.views?.length === 1 && m.views[0] === 'side').map((m) => m.id)
    expect([...REAR_ONLY_METRIC_IDS].sort()).toEqual(rearOnly.sort())
    expect([...SIDE_ONLY_METRIC_IDS].sort()).toEqual(sideOnly.sort())
    // D1: the side view never measures knee bend or shoulder-over-shoulder.
    expect(REAR_ONLY_METRIC_IDS as readonly string[]).toContain('knee-bend-band')
    expect(REAR_ONLY_METRIC_IDS as readonly string[]).toContain('shoulder-over-shoulder-contact')
  })

  it('REASON_CODES covers every metrics.json reason code', () => {
    for (const code of Object.keys(catalogue.reasonCodes)) {
      expect(REASON_CODES as readonly string[]).toContain(code)
    }
  })
})
