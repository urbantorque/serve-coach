// One source of truth (the docs JSON) with a sync test, plus the COACHING §14 content lint.
import { describe, expect, it } from 'vitest'
import docsLibrary from '../../../docs/specs/coaching-library.json?raw'
import localLibrary from './library.json?raw'
import { FOCUS_ITEMS, getItem, LIBRARY, LIBRARY_VERSION, shapeErrors, type LibraryItem } from './library.ts'
import { lintItem, lintLibrary } from './lint.ts'

describe('coaching library', () => {
  it('src/coaching/library.json is byte-for-byte docs/specs/coaching-library.json (copy it over when the spec changes)', () => {
    expect(localLibrary.replace(/\r\n/g, '\n')).toBe(docsLibrary.replace(/\r\n/g, '\n'))
  })

  it('has 14 fault items, keep-going and the warm-up routine, with a stable version', () => {
    expect(FOCUS_ITEMS).toHaveLength(14)
    expect(getItem('keep-going')?.itemType).toBe('keep-going')
    expect(getItem('warm-up-routine')?.itemType).toBe('routine')
    expect(LIBRARY).toHaveLength(16)
    expect(LIBRARY_VERSION).toMatch(/^lib-[0-9a-f]{8}$/)
  })

  it('every item passes the shape check', () => {
    expect(LIBRARY.flatMap(shapeErrors)).toEqual([])
  })

  it('passes every COACHING §14 lint rule', () => {
    expect(lintLibrary(LIBRARY)).toEqual([])
  })

  it('the lint rejects trunk-tilt-band, a "sit" cue and a 6-rep toss drill', () => {
    const base = structuredClone(getItem('toss-height-steady')) as LibraryItem
    const trunk = { ...base, evidence: { ...base.evidence, statIds: ['trunk-tilt-band' as never] } }
    expect(lintItem(trunk).some((p) => p.includes('rule 5'))).toBe(true)
    const sit = { ...base, cues: { ...base.cues, analogy: 'Sit into your legs.' } }
    expect(lintItem(sit).some((p) => p.includes('rule 14') && p.includes('"sit"'))).toBe(true)
    const reps = { ...base, drill: { ...base.drill, tossOnlyReps: 6 } }
    expect(lintItem(reps).some((p) => p.includes('rule 12'))).toBe(true)
  })

  it('no side-view item reads the rear-only bands or the depth metrics (D1, D5, P11)', () => {
    for (const it of FOCUS_ITEMS) {
      const ids = [...it.detection.metricIds, ...it.evidence.statIds] as string[]
      expect(ids).not.toContain('knee-bend-band')
      expect(ids).not.toContain('shoulder-over-shoulder-contact')
      expect(ids).not.toContain('loading-depth')
      expect(ids).not.toContain('deep-bend-flag')
      expect(ids).not.toContain('spin')
      expect(ids.some((i) => i.startsWith('speed'))).toBe(false)
    }
  })
})
