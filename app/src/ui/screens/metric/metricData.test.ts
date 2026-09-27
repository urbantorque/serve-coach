import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { METRIC_IDS } from '../../../analysis/types.ts'
import { lintCopy } from '../../copy/lint.ts'
import catalogue from './data/catalogue.json'
import validation from './data/validation.json'
import { LIMITS, METRIC_COPY, PREREQ_WORDS, STATUS_MEANING } from './metricCopy.ts'
// @ts-expect-error: plain ESM build script without type declarations
import { catalogueFrom, loadSmoke, validationFrom } from './tools/build-metric-data.mjs'

// Tests run from app/ (the vitest root).
const ROOT = resolve(process.cwd(), '..')

describe('Metric info data stays in step with its sources', () => {
  it('catalogue.json is the player-facing subset of docs/specs/metrics.json', () => {
    const metrics = JSON.parse(readFileSync(resolve(ROOT, 'docs/specs/metrics.json'), 'utf8'))
    expect(catalogueFrom(metrics)).toEqual(catalogue)
    expect(catalogue.metrics.map((m) => m.id)).toEqual([...METRIC_IDS])
  })

  const smoke = resolve(ROOT, 'validation/results/smoke')
  it.runIf(existsSync(resolve(smoke, 'SUMMARY.md')))('validation.json matches validation/results/smoke', () => {
    const { clips, generated } = loadSmoke(smoke)
    expect(validationFrom(clips, generated)).toEqual(validation)
  })

  it('validation numbers are internally consistent', () => {
    expect(validation.sideClips).toBeLessThanOrEqual(validation.clips)
    expect(validation.apexHeight.inRange).toBeLessThanOrEqual(validation.apexHeight.n)
    expect(validation.speed.covered).toBeLessThanOrEqual(validation.speed.ranges)
  })
})

describe('Metric info copy (DESIGN §11)', () => {
  const texts = [
    ...Object.values(METRIC_COPY).flatMap((c) => [c!.what, ...c!.how, c!.context ?? '']),
    ...Object.values(PREREQ_WORDS),
    ...Object.values(STATUS_MEANING),
    ...LIMITS.map((l) => l.text),
  ]
  it('passes the copy lint: no dashes, exclamation marks, emoji or never-say words', () => {
    for (const t of texts) expect(lintCopy(t), t).toEqual([])
  })

  it('never asks for more bend or a bigger jump, and never prescribes a toss height (D5)', () => {
    for (const t of texts) {
      expect(t.toLowerCase()).not.toMatch(/bend more|bend deeper|get lower|jump higher|push harder/)
      expect(t).not.toMatch(/\d\s*°/)
    }
  })

  it('every metric with a hero rank has plain-words copy', () => {
    for (const m of catalogue.metrics) {
      if (m.statusDefault !== 'unavailable' && ['toss', 'contact', 'rhythm', 'leg', 'landing'].some((p) => m.id.startsWith(p))) {
        expect(METRIC_COPY[m.id as keyof typeof METRIC_COPY], m.id).toBeTruthy()
      }
    }
  })
})
