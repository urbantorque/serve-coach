import { describe, expect, it } from 'vitest'
import { evaluate, renderReport } from './evaluate.ts'
import { isValidationExport } from './export.ts'
import { syntheticExport } from './synthetic.ts'

describe('pooled evaluation of synthetic annotations', () => {
  const file = syntheticExport({ seed: 11, players: 10, servesPerPlayer: 20, bias: { apexPct: 1.2 }, sampleEntries: 3, unblindedEntries: 2 })
  const r = evaluate([file])

  it('reads the export format and leaves out sample and non-blind entries', () => {
    expect(isValidationExport(file)).toBe(true)
    expect(r.inputs.leftOutSample).toBe(3)
    expect(r.inputs.leftOutUnblinded).toBe(2)
    expect(r.inputs.servesUsed).toBe(200)
    expect(r.inputs.players).toBe(10)
    expect(r.inputs.annotators).toBe(2)
    expect(r.inputs.doubleAnnotated).toBeGreaterThan(30)
    expect(r.inputs.byCondition['night-lights']).toBeGreaterThan(0)
  })

  it('recovers the injected toss-height bias, with repeated-measures limits and a high ICC', () => {
    const toss = r.metrics.find((m) => m.id === 'toss-apex-height')!
    expect(toss.unit).toBe('% of height')
    expect(toss.n).toBe(200)
    expect(toss.ba!.method).toBe('repeated')
    expect(toss.ba!.bias).toBeGreaterThan(0.8)
    expect(toss.ba!.bias).toBeLessThan(1.6)
    expect(toss.ba!.biasCi[0]).toBeLessThan(toss.ba!.bias)
    expect(toss.icc!.icc).toBeGreaterThan(0.7)
    expect(toss.icc!.ci[0]).toBeLessThan(toss.icc!.icc)
    expect(toss.maeInTargetUnit!).toBeLessThan(3)
    expect(toss.verdict).toBe('Meets the V2 target')
    // Unbiased contact height: bias near 0.
    const contact = r.metrics.find((m) => m.id === 'contact-height-ratio')!
    expect(Math.abs(contact.ba!.bias)).toBeLessThan(0.4)
    expect(contact.intervalCoverage!.n).toBe(200)
  })

  it('event timing: small errors, most within 1 frame; a rhythm target in frames', () => {
    for (const e of r.events) {
      expect(e.dist!.n).toBe(200)
      expect(e.dist!.within[1]).toBeGreaterThan(0.8)
      expect(e.dist!.histogram.reduce((a, b) => a + b, 0)).toBe(200)
    }
    const rhythm = r.metrics.find((m) => m.id === 'rhythm-release-to-contact')!
    expect(rhythm.target!.unit).toBe('frames')
    expect(rhythm.maeInTargetUnit!).toBeLessThan(1.5)
  })

  it('agreement between annotators comes from the double-marked serves', () => {
    expect(r.interRater.serves).toBe(r.inputs.doubleAnnotated)
    const apex = r.interRater.points.find((p) => p.point === 'ballAtApex')!
    expect(apex.maeCm).toBeGreaterThan(0)
    expect(apex.maeCm).toBeLessThan(5)
    expect(r.interRater.events.every((e) => e.maeFrames < 1)).toBe(true)
  })

  it('speed pairs radar with the experimental range at 120 fps', () => {
    expect(r.speed.radarLogged).toBe(40)
    expect(r.speed.pairs).toBeGreaterThan(0)
    expect(r.speed.coverage!.n).toBe(r.speed.pairs)
  })

  it('too little data is said plainly; duplicates across files count once', () => {
    const small = evaluate([syntheticExport({ seed: 3, players: 3, servesPerPlayer: 5 })])
    expect(small.metrics[0].verdict).toMatch(/^Too little data to judge \(15 of 150 serves, 3 of 8 players\)/)
    const twice = evaluate([file, file])
    expect(twice.inputs.servesUsed).toBe(200)
    expect(twice.inputs.duplicates).toBe(file.entries.length)
  })

  it('renders a markdown report with every section and no missing numbers', () => {
    const md = renderReport(r, { generatedAt: '2026-09-27', files: ['synthetic.json'] })
    for (const h of ['## Data', '### Sample against the protocol', '## Agreement between annotators', '## Event timing: app against the marks', '## Metrics: app against the marks', '## Speed: radar against', '## What a pass would allow', '## Method']) {
      expect(md).toContain(h)
    }
    expect(md).not.toMatch(/NaN|undefined/)
    expect(md).toContain('| Toss height | % of height | 200 (10) |')
  })
})
