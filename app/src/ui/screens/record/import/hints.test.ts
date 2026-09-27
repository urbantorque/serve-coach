import { describe, expect, it } from 'vitest'
import { lintCopy } from '../../../copy/lint.ts'
import { IMPORT_MOUNT_HINT, TILT_HINT, tiltHint } from './hints.ts'

describe('tilt hint copy', () => {
  it('replaces the stale "motion access" hint with the mount question and in-app recording', () => {
    const stale = 'Record in the app with motion access on, so we can level the picture.'
    expect(tiltHint(stale)).toBe(TILT_HINT)
    expect(TILT_HINT).toMatch(/How was the phone mounted\?/)
    expect(TILT_HINT).toMatch(/Record in the app, which reads the phone's tilt once you allow it/)
    expect(TILT_HINT).not.toMatch(/motion access/i)
  })

  it('leaves every other hint, and empty ones, alone', () => {
    expect(tiltHint('Keep the phone level; the guide turns green.')).toBe('Keep the phone level; the guide turns green.')
    expect(tiltHint(null)).toBeNull()
    expect(tiltHint(undefined)).toBeUndefined()
  })

  it('passes the copy lint and gives no degree numbers', () => {
    for (const t of [TILT_HINT, IMPORT_MOUNT_HINT]) {
      expect(lintCopy(t)).toEqual([])
      expect(t).not.toMatch(/\d\s*°/)
    }
  })
})
