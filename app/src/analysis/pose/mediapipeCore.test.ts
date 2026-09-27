import { describe, expect, it } from 'vitest'
import { isTransientLoadError, LOAD_RETRY_DELAYS_MS } from './mediapipeCore.ts'

describe('isTransientLoadError: network failures while loading are retried, other failures are not', () => {
  it('treats fetch and network failures as transient (Chromium, Firefox, WebKit wording)', () => {
    expect(isTransientLoadError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isTransientLoadError(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(true)
    expect(isTransientLoadError(new TypeError('Load failed'))).toBe(true)
    expect(isTransientLoadError('net::ERR_CACHE_WRITE_FAILURE')).toBe(true)
  })

  it('does not retry the failures that need the other delegate or a different fix', () => {
    expect(isTransientLoadError(new Error('ModuleFactory not set.'))).toBe(false)
    expect(isTransientLoadError(new Error('Unable to create WebGL context'))).toBe(false)
    expect(isTransientLoadError(new Error('INVALID_ARGUMENT: model is not a valid .task file'))).toBe(false)
  })

  it('bounds the retries (a few seconds at most before falling back)', () => {
    expect(LOAD_RETRY_DELAYS_MS.length).toBeGreaterThan(0)
    expect(LOAD_RETRY_DELAYS_MS.reduce((s, v) => s + v, 0)).toBeLessThanOrEqual(3000)
  })
})
