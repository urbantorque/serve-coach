// The validation state is said in three places that must never disagree:
//   1. the engine catalogue (analysis/metrics/catalogue.ts): what the engine actually caps at runtime;
//   2. docs/specs/metrics.json `validationLevel` + `validationState` (the spec twin, METRICS §1.3, §5.7);
//   3. the synthetic results (analysis/metrics/validation-summary.json) behind docs/VALIDATION.md.
// And the words the player reads (validationWords.ts) must follow the state, never overclaim.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { STATUS_TARGET, statusCeiling, validationLevel, type ConditionClass } from '../../../analysis/metrics/catalogue.ts'
import summary from '../../../analysis/metrics/validation-summary.json'
import { METRIC_IDS, type MetricId, type MetricStatus } from '../../../analysis/types.ts'
import { lintCopy } from '../../copy/lint.ts'
import {
  detailRows,
  keyNumberLines,
  metricResult,
  NIGHT_WORDS,
  RELATIVE_ONLY,
  rowDetail,
  STATE_SHORT,
  STATE_WORDS,
  VALIDATION_LIMIT,
  VALIDATION_STATES,
  validationStateOf,
} from './validationWords.ts'

const ROOT = resolve(process.cwd(), '..')

interface JsonMetric {
  id: MetricId
  statusTarget: MetricStatus
  validationLevel: Record<ConditionClass, string>
  validationState: string
  validationNote: string
}
interface Json {
  enums: { conditionClass: ConditionClass[]; validationState: string[] }
  statusCeilingByValidationLevel: Record<string, unknown>
  validationStates: Record<string, unknown> & { lastRun: { clips: number; date: string } }
  metrics: JsonMetric[]
}
const json = JSON.parse(readFileSync(resolve(ROOT, 'docs/specs/metrics.json'), 'utf8')) as Json
const RANK: Record<MetricStatus, number> = { unavailable: 0, experimental: 1, estimated: 2, measured: 3, 'player-entered': 4 }

describe('validation state: engine catalogue, metrics.json and results agree', () => {
  it('metrics.json has a validation state for every metric, from its own enum', () => {
    expect(json.metrics.map((m) => m.id)).toEqual([...METRIC_IDS])
    expect(json.enums.validationState).toEqual([...VALIDATION_STATES])
    for (const m of json.metrics) {
      expect(json.enums.validationState, m.id).toContain(m.validationState)
      expect(m.validationNote.length, m.id).toBeGreaterThan(20)
      expect(json.validationStates[m.validationState], m.validationState).toBeTruthy()
    }
  })

  it('every per-condition validationLevel in metrics.json equals the engine catalogue', () => {
    for (const m of json.metrics) {
      for (const c of json.enums.conditionClass) {
        expect(m.validationLevel[c], `${m.id} ${c}`).toBe(validationLevel(m.id, c))
      }
    }
  })

  it('the state matches the level: only passes reach V1, and nothing is V1 under lights or flicker', () => {
    for (const m of json.metrics) {
      const v1 = m.validationState.startsWith('V1-synthetic-pass')
      expect(m.validationLevel.day === 'V1', m.id).toBe(v1)
      expect(m.validationLevel.overcast === 'V1', m.id).toBe(v1)
      expect(m.validationLevel['night-lights'], m.id).toBe('V0')
      expect(m.validationLevel.flicker, m.id).toBe('V0')
    }
  })

  it('"not-applicable" is only for logged values and spin, and they are all not-applicable', () => {
    for (const m of json.metrics) {
      const logged = STATUS_TARGET[m.id] === 'player-entered' || STATUS_TARGET[m.id] === 'unavailable'
      expect(m.validationState === 'not-applicable', m.id).toBe(logged)
    }
  })

  it('the status the engine caps at equals what metrics.json implies (min of target and level ceiling)', () => {
    const ceiling = (level: string): MetricStatus => (level === 'V1' ? 'estimated' : 'experimental')
    for (const m of json.metrics) {
      for (const c of json.enums.conditionClass) {
        const target = STATUS_TARGET[m.id]
        const expected =
          target === 'player-entered' || target === 'unavailable'
            ? target
            : RANK[target] < RANK[ceiling(m.validationLevel[c])]
              ? target
              : ceiling(m.validationLevel[c])
        expect(statusCeiling(m.id, c).status, `${m.id} ${c}`).toBe(expected)
      }
    }
  })

  it('passes and fails agree with the synthetic results file', () => {
    expect(json.validationStates.lastRun.clips).toBe(summary.clips)
    for (const m of json.metrics) {
      const r = metricResult(m.id)
      if (!r?.d1 || !r.all) continue
      if (m.validationState === 'V1-synthetic-pass') expect(r.d1.pass, `${m.id} passes at the D1 set-ups`).toBe(true)
      if (m.validationState === 'V1-synthetic-fail') expect(r.d1.pass && r.all.pass, `${m.id} fails somewhere`).toBe(false)
      if (m.validationState === 'V1-synthetic-pass-limited') expect(r.d1.pass || r.all.pass, `${m.id} passes somewhere`).toBe(true)
    }
    // Metrics the results file scores must not be left as "never checked".
    for (const id of Object.keys(summary.metrics) as MetricId[]) {
      expect(validationStateOf(id), id).not.toBe('V0-unvalidated')
    }
  })

  it('the UI reads the same state as metrics.json (via data/catalogue.json)', () => {
    for (const m of json.metrics) expect(validationStateOf(m.id), m.id).toBe(m.validationState)
  })
})

describe('validation words (DESIGN §3.2, §11; honesty rules)', () => {
  const all: string[] = [...Object.values(STATE_WORDS), ...Object.values(STATE_SHORT), NIGHT_WORDS, VALIDATION_LIMIT]
  for (const id of METRIC_IDS) {
    all.push(rowDetail(id), ...keyNumberLines(id), ...keyNumberLines(id, 1.8))
    for (const which of ['d1', 'all'] as const) for (const r of detailRows(id, which, 1.8)) all.push(r.label, r.value)
  }

  it('pass the copy lint, show no degrees and never claim real-court checks', () => {
    for (const t of all) {
      expect(lintCopy(t), t).toEqual([])
      expect(t, t).not.toMatch(/\d\s*°|degree/)
      const claims = t.toLowerCase().replaceAll(/not yet checked on real/g, '')
      expect(claims, t).not.toMatch(/checked on real|validated|proven|accurate to/)
      expect(t, t).not.toMatch(/NaN|undefined|null|Infinity/)
    }
  })

  it('V1 words say simulated and not yet on real courts; failures say experimental', () => {
    expect(STATE_WORDS['V1-synthetic-pass']).toMatch(/simulated/)
    expect(STATE_WORDS['V1-synthetic-pass']).toMatch(/Not yet checked on real courts/)
    expect(STATE_WORDS['V1-synthetic-fail']).toMatch(/experimental/)
    expect(NIGHT_WORDS).toMatch(/court lights/)
  })

  it('numbers come with the simulated-serve qualifier and the pass mark', () => {
    const lines = keyNumberLines('toss-apex-height', 1.8)
    expect(lines[0]).toMatch(/^At the recommended set-ups \(11 simulated serves/)
    expect(lines.join(' ')).toMatch(/Our pass mark is .* It passed\./)
    expect(keyNumberLines('toss-forward').join(' ')).toMatch(/It hasn't passed yet\./)
    expect(rowDetail('toss-apex-height')).toMatch(/^Checked on simulated serves\. Typical error: about 1% of your height\.$/)
    expect(rowDetail('toss-forward')).toMatch(/^Simulated check not passed yet\./)
    expect(rowDetail('serve-in-rate')).toBe('You log this.')
    expect(rowDetail('spin')).toMatch(/never estimate/)
  })
})

describe('leg drive: a relative-only pass is explained, not left as "It hasn\'t passed yet" beside an Estimate (finding 50)', () => {
  it('Metric info explains the steady low read and what the Estimate covers; How we measure agrees', () => {
    const lines = keyNumberLines('leg-drive').join(' ')
    expect(lines).not.toMatch(/It hasn't passed yet\./)
    expect(lines).toMatch(/As an absolute number it hasn't passed yet/)
    expect(lines).toMatch(/compare with your own serves/)
    expect(RELATIVE_ONLY['leg-drive']?.result).toMatch(/your own serves only/)
    expect(detailRows('leg-drive', 'd1').find((r) => r.label === 'Result')?.value).toMatch(/absolute/)
  })
})
