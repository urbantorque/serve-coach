import { describe, expect, it, vi } from 'vitest'
import type { CaptureContext } from '../types.ts'
import { contactOnsets } from './audio.ts'

const capture: CaptureContext = {
  source: 'import',
  declaredView: 'side',
  serveSide: 'both',
  serveNumber: 'mixed',
  handedness: 'right',
  playerHeightM: 1.8,
  playerHeightSource: 'entered',
  hitSoundTiming: true,
}
const file = new Blob([new Uint8Array(8)])

/** A 48 kHz clip with one sharp click at 1.0 s. */
function clickAudio() {
  const sampleRate = 48000
  const samples = new Float32Array(sampleRate * 2)
  for (let i = 0; i < 200; i++) samples[sampleRate + i] = Math.exp(-i / 40) * (i % 2 ? 0.9 : -0.9)
  return { samples, sampleRate, startTimeS: 0, method: 'decodeAudioData' as const, notes: [] }
}

describe('contactOnsets', () => {
  it('does nothing unless hit-sound timing is on (D4)', async () => {
    const decoder = vi.fn()
    const r = await contactOnsets({ file, meta: { hasAudio: true, timeScale: 1 }, capture, hitSoundTiming: false }, decoder)
    expect(r.status).toBe('off')
    expect(decoder).not.toHaveBeenCalled()
  })

  it('refuses time-scaled audio and uses live onsets as timestamps', async () => {
    expect((await contactOnsets({ file, meta: { hasAudio: true, timeScale: 0.125 }, capture, hitSoundTiming: true })).status).toBe('unusable')
    const live = await contactOnsets({
      file,
      meta: { hasAudio: false, timeScale: 1 },
      capture: { ...capture, liveOnsets: [{ tMs: 2200, strength: 20, sharpness: 0.8 }] },
      hitSoundTiming: true,
    })
    expect(live).toMatchObject({ status: 'live', onsets: [{ tReal: 2.2, kind: 'contact' }] })
  })

  it('keeps only onset timestamps and zeroes the decoded samples', async () => {
    const audio = clickAudio()
    const r = await contactOnsets({ file, meta: { hasAudio: true, timeScale: 1 }, capture, hitSoundTiming: true }, async () => audio)
    expect(r.status).toBe('decoded')
    expect(r.onsets.some((o) => Math.abs(o.tReal - 1) < 0.01)).toBe(true)
    expect(Object.keys(r.onsets[0]).sort()).toEqual(['kind', 'sharpness', 'strength', 'tReal'])
    expect(audio.samples.every((v) => v === 0)).toBe(true)
  })

  it('reports a decoding failure without throwing', async () => {
    const r = await contactOnsets({ file, meta: { hasAudio: true, timeScale: 1 }, capture, hitSoundTiming: true }, async () => {
      throw new Error('no decoder')
    })
    expect(r).toMatchObject({ status: 'failed', onsets: [] })
  })
})
