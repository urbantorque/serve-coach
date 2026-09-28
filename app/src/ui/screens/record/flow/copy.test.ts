import { describe, expect, it } from 'vitest'
import { lintCopy } from '../../../copy/lint.ts'
import * as COPY from './copy.ts'
import { FPS_OPTIONS, PLANS, RETEST_PLAN } from './flowStore.ts'

/** Every string in a nested copy object. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings)
  return []
}

describe('Record flow copy (DESIGN §11)', () => {
  const all = [...strings(COPY), ...strings(FPS_OPTIONS), ...strings(PLANS), ...strings(RETEST_PLAN)]

  it('passes the copy lint: no dashes, exclamation marks, emoji or never-say words', () => {
    for (const s of all) expect(lintCopy(s), s).toEqual([])
  })

  it('writes ranges with "to", never a hyphen between numbers', () => {
    for (const s of all) expect(/\d\s*-\s*\d/.test(s), s).toBe(false)
  })

  it('never demands leg or posture changes (D5)', () => {
    for (const s of all) expect(/bend more|jump higher|get lower/i.test(s), s).toBe(false)
  })

  it('keeps the D1 numbers: 7 to 8 m upright, 8.5 to 9.5 m at the fence, 4.5 m of headroom', () => {
    const text = all.join(' ')
    expect(text).toContain('1.3 to 1.6 m')
    expect(text).toContain('1.4 to 1.8 m')
    expect(COPY.FRAMING_RULE.body).toContain('4.5 m')
  })
})

describe('fence set-up tilt copy (finding 66)', () => {
  it('says the tilt correction is untested on real phones, never that it is simply measured and removed', () => {
    expect(COPY.FENCE_CARD.body).not.toMatch(/take it out/)
    expect(COPY.FENCE_CARD.body).toContain("motion sensor")
    expect(COPY.FENCE_CARD.body).toMatch(/hasn't been checked on real phones yet/)
  })
})

describe('no live or set-up string promises the tilt is simply taken out (finding 66)', () => {
  it('the motion pre-alert, the live-check detail and every set-up string carry the caveat', async () => {
    const { MOTION_PREALERT } = await import('./copy.ts')
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    expect(MOTION_PREALERT).toMatch(/correct for it/)
    expect(MOTION_PREALERT).toMatch(/hasn't been checked on real phones yet/)
    const framing = readFileSync(join(process.cwd(), 'src/ui/screens/record/live/framing.ts'), 'utf8')
    for (const src of [framing, readFileSync(join(process.cwd(), 'src/ui/screens/record/flow/copy.ts'), 'utf8')]) {
      expect(src).not.toMatch(/take (it|the tilt) out/)
      for (const line of src.split('\n').filter((l) => /correct for it/.test(l) && /tilt/.test(l))) expect(line).toMatch(/real phones/)
    }
  })
})
