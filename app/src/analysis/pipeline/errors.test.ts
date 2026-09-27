import { describe, expect, it } from 'vitest'
import { ProbeError } from '../video/probe.ts'
import { lintCopy } from '../../ui/copy/lint.ts'
import { AnalysisError, isAbort, PLAYER_MESSAGES, throwIfAborted, toAnalysisError } from './errors.ts'

describe('toAnalysisError', () => {
  it('maps aborts, quota, probe failures and stage fallbacks to codes with player copy', () => {
    expect(toAnalysisError(new DOMException('stop', 'AbortError')).code).toBe('cancelled')
    expect(toAnalysisError(new DOMException('full', 'QuotaExceededError')).code).toBe('storage-full')
    // Dexie wraps the IndexedDB error.
    expect(toAnalysisError({ name: 'AbortError', inner: { name: 'QuotaExceededError' } }).code).toBe('storage-full')
    expect(toAnalysisError(new ProbeError('unsupported-container', 'x', 'unknown')).code).toBe('unsupported-codec')
    expect(toAnalysisError(new ProbeError('parse-failed', 'x', 'mp4')).code).toBe('probe-failed')
    expect(toAnalysisError(new Error('boom'), 'pose-init-failed').code).toBe('pose-init-failed')
    expect(toAnalysisError(new Error('WebGL context lost'), 'pose-init-failed').code).toBe('no-webgl')
    expect(toAnalysisError('weird').code).toBe('internal')
  })

  it('keeps technical detail out of the player message', () => {
    const e = toAnalysisError(new Error('VideoDecoder: avc1.64 config rejected at sample 12'), 'unsupported-codec')
    expect(e.playerMessage).toBe(PLAYER_MESSAGES['unsupported-codec'])
    expect(e.message).toBe(e.playerMessage)
    expect(e.detail).toContain('sample 12')
    expect(e.toPlayerFacing()).toEqual({ code: 'unsupported-codec', message: e.playerMessage, recoverable: false })
  })

  it('every code has calm Australian-English copy without jargon', () => {
    for (const [code, text] of Object.entries(PLAYER_MESSAGES)) {
      expect(text.length, code).toBeGreaterThan(10)
      expect(text).not.toMatch(/error|exception|undefined|null|codec string|WebGL context/i)
      expect(text).not.toMatch(/analyz|color|favorite/i)
      // The app-wide copy lint (DESIGN §11): no dashes, exclamation marks, arrows or never-say words.
      expect(lintCopy(text), code).toEqual([])
      expect(text, code).not.toMatch(/→/)
    }
  })

  it('isAbort and throwIfAborted', () => {
    const c = new AbortController()
    expect(() => throwIfAborted(c.signal)).not.toThrow()
    c.abort()
    expect(() => throwIfAborted(c.signal)).toThrow(AnalysisError)
    expect(isAbort(new AnalysisError('cancelled'))).toBe(true)
    expect(isAbort(new DOMException('x', 'AbortError'))).toBe(true)
    expect(isAbort(new Error('x'))).toBe(false)
  })
})
