// Copy lint (DESIGN §13.7 item 4) and metric-name sync with docs/specs/metrics.json.
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lintCopy } from './lint.ts'
import { METRIC_NAMES } from './metricNames.ts'
import * as strings from './strings.ts'
import { NEVER_SAY, reasonShortForm, verdictDisplayId } from './strings.ts'

const catalogueJson = readFileSync(resolve(process.cwd(), '../docs/specs/metrics.json'), 'utf8')
const catalogue = JSON.parse(catalogueJson) as { metrics: { id: string; name: string }[] }

/** Collects every string value in a module's exports. */
function collect(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) value.forEach((v) => collect(v, out))
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collect(v, out))
  return out
}

describe('metric names', () => {
  it('match metrics.json exactly (names come from the catalogue, not from DESIGN)', () => {
    const fromCatalogue = Object.fromEntries(catalogue.metrics.map((m) => [m.id, m.name]))
    expect(METRIC_NAMES).toEqual(fromCatalogue)
  })
})

describe('copy lint', () => {
  it('UI strings and metric names have no dashes, exclamation marks, emoji or never-say words', () => {
    const texts = [...collect(strings), ...Object.values(METRIC_NAMES)].filter((t) => !NEVER_SAY.includes(t as never))
    const failures = texts.map((t) => [t, lintCopy(t)] as const).filter(([, p]) => p.length)
    expect(failures).toEqual([])
  })

  it('the lint catches what it should', () => {
    expect(lintCopy('Bend more at the knees')).toContain('never-say "bend more"')
    expect(lintCopy('Great session!')).toContain('exclamation mark')
    expect(lintCopy('12–15 cm')).toContain('en or em dash')
  })
})

describe('reason short forms (DESIGN §3.1)', () => {
  it('are short (DESIGN §3.1 table: five words at most) and resolve by metric where needed', () => {
    expect(reasonShortForm('FPS_TOO_LOW', 'rhythm-spread')).toBe('Needs 60 fps')
    expect(reasonShortForm('FPS_TOO_LOW', 'speed-experimental')).toBe('Needs 120 fps')
    expect(reasonShortForm('TOO_FEW_SERVES', 'toss-height-spread', { minServes: 8 })).toBe('Needs 8 serves')
    expect(reasonShortForm('TARGET_NOT_TAGGED')).toBe('Tag your target')
    expect(reasonShortForm('NOT_MEASURABLE', 'spin')).toBe('Not measurable by phone')
    expect(reasonShortForm('ROLE_AMBIGUOUS')).toBe("Couldn't see this clearly")
    for (const code of ['NEEDS_REAR_VIEW', 'APEX_OUT_OF_FRAME', 'NEEDS_CALIBRATION', 'BOUNCE_NOT_LOCATED', 'TILT_UNKNOWN'] as const) {
      expect(reasonShortForm(code).split(' ').length).toBeLessThanOrEqual(5)
    }
  })

  it('maps every spec spelling of a verdict to one display id (DESIGN §15 flag 2)', () => {
    expect(verdictDisplayId('clear-improvement')).toBe('clearly-better')
    expect(verdictDisplayId('clear-decline')).toBe('clearly-worse')
    expect(verdictDisplayId('too-early-to-tell')).toBe('too-early')
    expect(verdictDisplayId('no-clear-change')).toBe('about-the-same')
  })
})
