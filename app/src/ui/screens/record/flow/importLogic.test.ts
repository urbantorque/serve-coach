import { describe, expect, it } from 'vitest'
import {
  clock,
  fpsOverrideFor,
  heightsNote,
  importGuard,
  MOUNT_OPTIONS,
  mountContext,
  needsSlowMotionQuestion,
  resolutionLabel,
  slowMotionContext,
  speedTargetNote,
  summariseClip,
  viewFor,
} from './importLogic.ts'
import { importCapture, lightFromTimestamp, playerFacts, sessionFor } from './sessionFactory.ts'

describe('clip summary', () => {
  it('formats length, size, rate and orientation (CAPTURE §11.2)', () => {
    expect(clock(4.77)).toBe('0:05')
    expect(clock(252)).toBe('4:12')
    expect(resolutionLabel(1080, 1920)).toBe('1080p')
    expect(resolutionLabel(3840, 2160)).toBe('4K')
    const s = summariseClip({ durationMediaS: 252, width: 1080, height: 1920, captureFps: 59.94 }, { make: 'Apple' })
    expect(s.line).toBe('4:12 · 1080p · 60 fps · iPhone · upright')
    expect(summariseClip({ durationMediaS: 10, width: 1920, height: 1080, captureFps: 30 }).orientation).toBe('sideways')
  })
})

describe('import guards (ARCHITECTURE §5.1)', () => {
  const meta = { durationMediaS: 120, captureFps: 60, timeScale: 1 }
  it('passes an ordinary clip', () => expect(importGuard(meta, 200e6)).toBeNull())
  it('refuses files over 2 GB', () => expect(importGuard(meta, 2.5 * 1024 ** 3)).toMatch(/2 GB/))
  it('refuses 60 fps clips over 10 minutes', () => expect(importGuard({ ...meta, durationMediaS: 11 * 60 }, 1e6)).toMatch(/10 minutes/))
  it('limits slow motion to a minute of real time', () => {
    expect(importGuard({ durationMediaS: 50, captureFps: 240, timeScale: 1 }, 1e6)).toBeNull()
    expect(importGuard({ durationMediaS: 90, captureFps: 240, timeScale: 1 }, 1e6)).toMatch(/1 minute/)
    // A rendered 8x slow-motion copy: 480 media seconds are 60 real seconds.
    expect(importGuard({ durationMediaS: 480, captureFps: 240, timeScale: 0.125 }, 1e6)).toBeNull()
  })
})

describe('slow-motion question (CAPTURE §11.3)', () => {
  it('asks for an Apple clip with an unknown time base, or a possible rendered slow-motion export', () => {
    expect(needsSlowMotionQuestion({ kind: 'normal', status: 'unknown', captureFps: 30, device: { make: 'Apple' } })).toBe(true)
    expect(needsSlowMotionQuestion({ kind: 'possible-rendered-slomo', status: 'unknown', captureFps: 30 })).toBe(true)
  })
  it('does not ask when the timestamps prove the rate, or for other devices', () => {
    expect(needsSlowMotionQuestion({ kind: 'native-high-fps', status: 'proven', captureFps: 240, device: { make: 'Apple' } })).toBe(false)
    expect(needsSlowMotionQuestion({ kind: 'normal', status: 'unknown', captureFps: 60 })).toBe(false)
    expect(needsSlowMotionQuestion(null)).toBe(false)
  })
  it('maps answers to the capture context and the fps override', () => {
    expect(slowMotionContext('normal', null)).toBe('normal')
    expect(slowMotionContext('slow', 240)).toBe('slomo-240')
    expect(slowMotionContext('slow', 'not-sure')).toBe('slomo-unknown')
    expect(slowMotionContext('not-sure', null)).toBe('not-sure')
    expect(slowMotionContext(null, null)).toBeUndefined()
    expect(fpsOverrideFor('slow', 120)).toBe(120)
    expect(fpsOverrideFor('slow', 'not-sure')).toBeUndefined()
    expect(fpsOverrideFor('normal', null)).toBeUndefined()
  })
})

describe('camera position and speed (D1, D4)', () => {
  it('keeps views apart: rear is its own mode', () => {
    expect(viewFor('side-chest')).toEqual({ view: 'side', cameraSide: 'chest', mode: 'technique' })
    expect(viewFor('rear')).toEqual({ view: 'rear', mode: 'outcomes' })
    expect(viewFor('other').view).toBe('unknown')
  })
  it('only mentions speed with the experimental toggle, and needs 120 fps and one target', () => {
    expect(speedTargetNote({ experimental: false, captureFps: 240, view: 'side', target: null })).toBeNull()
    expect(speedTargetNote({ experimental: true, captureFps: 60, view: 'side', target: 'T' })).toMatch(/120 fps/)
    expect(speedTargetNote({ experimental: true, captureFps: 240, view: 'side', target: 'mixed' })).toMatch(/pick one target/)
    expect(speedTargetNote({ experimental: true, captureFps: 240, view: 'side', target: 'wide' })).toBeNull()
    expect(speedTargetNote({ experimental: true, captureFps: 240, view: 'rear', target: null })).toBeNull()
  })
})

describe('"How was the phone mounted?" (METRICS §1.1.3a)', () => {
  it('side views carry the answer; other views never assume level', () => {
    expect(mountContext('side', 'level-mount')).toBe('level-mount')
    expect(mountContext('side', 'tilted-or-unsure')).toBe('tilted-or-unsure')
    expect(mountContext('rear', 'level-mount')).toBeUndefined()
    expect(MOUNT_OPTIONS.map((o) => o.value)).toEqual(['level-mount', 'roughly-level', 'tilted-or-unsure'])
  })

  it('the heights note never promises more than METRICS allows, and names no degrees', () => {
    expect(heightsNote('side', 'tilted-or-unsure')).toMatch(/experimental/)
    expect(heightsNote('side', 'level-mount')).toMatch(/contact height can stay an estimate/)
    expect(heightsNote('side', 'level-mount')).toMatch(/Toss height stays experimental/)
    expect(heightsNote('side', 'roughly-level')).toMatch(/may stay experimental/)
    expect(heightsNote('rear', 'level-mount')).toMatch(/experimental/)
    for (const a of ['level-mount', 'roughly-level', 'tilted-or-unsure'] as const) expect(heightsNote('side', a)).not.toMatch(/\d\s*°/)
  })

  it('the answer and the serving spot reach the capture context and the session record', () => {
    const player = playerFacts({ heightM: 1.8, handedness: 'right' })
    const meta = { width: 1080, height: 1920, captureFps: 60, mimeType: 'video/mp4' }
    const capture = importCapture(player, { view: 'side', cameraSide: 'chest', side: 'deuce', serveNumber: 1, hitSoundTiming: false, mount: 'level-mount', servingSpot: 'doubles' }, meta)
    expect(capture.mount).toBe('level-mount')
    expect(capture.servingSpot).toBe('doubles')
    const rec = sessionFor({ capture, view: 'side', cameraSide: 'chest', mode: 'technique', template: 'import', startedAt: '2026-09-27T08:00:00+10:00', block: { side: 'deuce', serveNumber: 1, servingSpot: 'doubles' } })
    expect(rec.servingSpot).toBe('doubles')
    expect(rec.phoneMount).toBe('level-mount')
    const none = importCapture(player, { view: 'side', side: 'deuce', serveNumber: 1, hitSoundTiming: false }, meta)
    expect(none.mount).toBeUndefined()
    expect(none.servingSpot).toBeUndefined()
  })

  it('the light answer sets the condition: only "Daylight" is day; lights, not sure or no answer take the night path', () => {
    const player = playerFacts({ heightM: 1.8, handedness: 'right' })
    const meta = { width: 1080, height: 1920, captureFps: 60, mimeType: 'video/mp4' }
    const base = { view: 'side' as const, side: 'deuce' as const, serveNumber: 1 as const, hitSoundTiming: false }
    expect(importCapture(player, { ...base, light: 'day' }, meta).conditions?.light).toBe('day')
    expect(importCapture(player, { ...base, light: 'lights' }, meta).conditions?.light).toBe('lights')
    expect(importCapture(player, { ...base, light: 'unsure' }, meta).conditions?.light).toBe('lights')
    expect(importCapture(player, base, meta).conditions?.light).toBe('lights')
    // An evening timestamp starts the answer at court lights; daytime leaves it for the player.
    const at = (h: number) => new Date(2026, 8, 12, h, 30).toISOString()
    expect(lightFromTimestamp(at(19))).toBe('lights')
    expect(lightFromTimestamp(at(6))).toBe('lights')
    expect(lightFromTimestamp(at(11))).toBeNull()
    expect(lightFromTimestamp(undefined)).toBeNull()
  })
})
