import { describe, expect, it } from 'vitest'
import { lintCopy } from '../../../copy/lint.ts'
import { spotStateFor } from './cues.ts'
import { evaluateLive, frameTopMinM, framingGeometry, readyCount, rectifyY, type LiveInputs, type PoseSnapshot } from './framing.ts'

/** A 1.75 m player standing at 7 m in a level portrait frame: frame top about 5 m. */
const standing: PoseSnapshot = { headTopY: 0.52, floorY: 0.78, frontToeX: 0.45, inFrame: true, others: 0 }

const base: LiveInputs = {
  setupOrientation: 'portrait',
  orientation: 'portrait',
  frameHeightPx: 1920,
  aspect: 1080 / 1920,
  playerHeightM: 1.75,
  tilt: { pitchDeg: 0.5, rollDeg: 0.3 },
  motion: 'granted',
  pose: standing,
  steady: true,
  light: 'good',
  fps: 60,
  netOnRight: true,
}

const check = (e: ReturnType<typeof evaluateLive>, id: string) => e.checks.find((c) => c.id === id)!

describe('framing geometry (CAPTURE §9.4)', () => {
  it('rectifying a level frame changes nothing', () => {
    expect(rectifyY(0.3, 0, 0.66)).toBeCloseTo(0.3, 9)
  })
  it('needs 4.5 m, more for tall players', () => {
    expect(frameTopMinM(1.75)).toBe(4.5)
    expect(frameTopMinM(2.0)).toBeCloseTo(1.54 * 2 + 1.25 + 0.35, 6)
  })
  it('works out the frame top, phone height, pixels and room ahead from the standing player', () => {
    const g = framingGeometry(standing, { orientation: 'portrait', frameHeightPx: 1920, aspect: 0.5625, playerHeightM: 1.75, tilt: null, netOnRight: true })!
    expect(g.frameTopM).toBeCloseTo(0.78 / (0.26 / 1.75) - 0.3 * Math.tan((67.3 / 2) * (Math.PI / 180)), 6)
    expect(g.bodyPx).toBeCloseTo(0.26 * 1920, 6)
    expect(g.cameraHeightM).toBeCloseTo(0.28 / (0.26 / 1.75), 6)
    expect(g.roomAheadM).toBeGreaterThan(1.8)
    expect(g.tiltMeasured).toBe(false)
  })
  it('a measured upward tilt moves the frame top up', () => {
    const level = framingGeometry(standing, { orientation: 'portrait', frameHeightPx: 1920, aspect: 0.5625, playerHeightM: 1.75, tilt: { pitchDeg: 0, rollDeg: 0 }, netOnRight: true })!
    const up = framingGeometry(standing, { orientation: 'portrait', frameHeightPx: 1920, aspect: 0.5625, playerHeightM: 1.75, tilt: { pitchDeg: 4, rollDeg: 0 }, netOnRight: true })!
    expect(up.frameTopM).toBeGreaterThan(level.frameTopM)
  })
})

describe('the Ready gate (CAPTURE §9.8, D1)', () => {
  it('is Ready when every core check passes', () => {
    const e = evaluateLive(base)
    expect(e.ready).toBe(true)
    expect(e.instruction).toBeNull()
    expect(e.recordAnyway).toBe('not-offered')
    expect(readyCount(e.checks)).toEqual({ done: 8, total: 9 })
  })

  it('blocks a measured frame top under 4.3 m and offers only "Record without toss height"', () => {
    const e = evaluateLive({ ...base, pose: { ...standing, headTopY: 0.55, floorY: 0.95 } })
    expect(check(e, 'room-above').state).toBe('block')
    expect(e.ready).toBe(false)
    expect(e.instruction?.checkId).toBe('room-above')
    expect(e.instruction?.text).toMatch(/^Phone back \d steps?$|^Raise the phone a little$/)
    expect(e.recordAnyway).toBe('without-toss-height')
    expect(e.failingCaptureIds).toContain('cq.toss-headroom')
  })

  it('accepts 4.3 to 4.5 m with a note', () => {
    const e = evaluateLive({ ...base, pose: { ...standing, headTopY: 0.45, floorY: 0.72 } })
    expect(check(e, 'room-above').state).toBe('warn')
    expect(check(e, 'room-above').value).toMatch(/Very high tosses will be estimated/)
    expect(e.ready).toBe(true)
  })

  it('never offers Record anyway over a measured tilt beyond 5 degrees', () => {
    const e = evaluateLive({ ...base, tilt: { pitchDeg: 7, rollDeg: 0 } })
    expect(check(e, 'level').state).toBe('block')
    expect(e.recordAnyway).toBe('not-offered')
    expect(e.instruction?.checkId).toBe('level')
  })

  it('withholds Ready while the tilt is unknown, and asks for motion access on iOS', () => {
    const denied = evaluateLive({ ...base, tilt: null, motion: 'unsupported' })
    expect(denied.ready).toBe(false)
    expect(check(denied, 'level').value).toBe('Level by eye')
    expect(denied.instruction?.text).toBe('Level the phone by eye')
    expect(denied.recordAnyway).toBe('offered')
    const prompt = evaluateLive({ ...base, tilt: null, motion: 'prompt' })
    expect(check(prompt, 'level').state).toBe('pending')
    expect(prompt.instruction?.text).toBe('Allow motion access')
  })

  it('says "Step into the picture" only when nobody is found; a settling player gets "Stand tall"', () => {
    const empty = evaluateLive({ ...base, pose: null })
    expect(empty.instruction?.text).toBe('Step into the picture')
    const settling = evaluateLive({ ...base, pose: null, personSeen: true })
    expect(check(settling, 'in-frame').state).toBe('pending')
    expect(settling.instruction?.text).toBe('Stand tall at your spot')
  })

  it('reports when the body check cannot run in this browser, and still allows Record anyway', () => {
    const e = evaluateLive({ ...base, pose: 'unavailable' })
    expect(check(e, 'in-frame').value).toBe("Can't check on this browser")
    expect(e.ready).toBe(false)
    expect(e.recordAnyway).toBe('offered')
  })

  it('orders the one instruction: hold still before level before headroom', () => {
    const e = evaluateLive({ ...base, steady: false, tilt: { pitchDeg: 4, rollDeg: 0 }, pose: { ...standing, headTopY: 0.55, floorY: 0.95 } })
    expect(e.instruction?.text).toBe('Hold still')
  })

  it('warns at 30 fps and blocks under 24', () => {
    expect(check(evaluateLive({ ...base, fps: 30 }), 'fps').state).toBe('warn')
    expect(evaluateLive({ ...base, fps: 30 }).ready).toBe(true)
    expect(evaluateLive({ ...base, fps: 15 }).ready).toBe(false)
  })

  it('every instruction and value passes the copy lint', () => {
    const cases: Partial<LiveInputs>[] = [{}, { pose: null }, { tilt: null, motion: 'unsupported' }, { tilt: { pitchDeg: 7, rollDeg: 0 } }, { steady: false }, { fps: 15 }, { pose: 'unavailable' }]
    for (const c of cases) {
      const e = evaluateLive({ ...base, ...c })
      for (const text of [e.instruction?.text, e.instruction?.detail, ...e.checks.map((x) => x.value)]) if (text) expect(lintCopy(text), text).toEqual([])
    }
  })
})

describe('serving-spot states (DESIGN §10.3 R4)', () => {
  it('maps the instruction to one word readable from the spot', () => {
    expect(spotStateFor({ ready: true, instruction: null })).toEqual({ kind: 'ready', word: 'Ready', line: 'Walk back and tap Record' })
    expect(spotStateFor({ ready: false, instruction: { checkId: 'room-above', text: 'Phone back 2 steps' } }).word).toBe('Back')
    expect(spotStateFor({ ready: false, instruction: { checkId: 'room-above', text: 'Raise the phone a little' } }).word).toBe('Higher')
    expect(spotStateFor({ ready: false, instruction: { checkId: 'size', text: 'Phone closer 1 step' } }).word).toBe('Closer')
    expect(spotStateFor({ ready: false, instruction: { checkId: 'steady', text: 'Hold still' } }).word).toBe('Still')
    expect(spotStateFor({ ready: false, instruction: { checkId: 'in-frame', text: 'Step into the picture' } }).word).toBe('Step in')
  })
})
