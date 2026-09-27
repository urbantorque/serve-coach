import { describe, expect, it } from 'vitest'
import { installSameOriginFetchGuard, isAllowedUrl, type FetchGuardScope } from './workerNetworkGuard.ts'

function fakeScope(origin = 'http://127.0.0.1:5173'): FetchGuardScope & { calls: string[] } {
  const calls: string[] = []
  const scope = {
    calls,
    location: { href: `${origin}/src/analysis/pose/pose.worker.ts`, origin },
    fetch: async (input: RequestInfo | URL) => {
      calls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      return new Response('ok')
    },
  }
  return scope
}

describe('workerNetworkGuard', () => {
  it('allows same-origin, relative, blob: and data: URLs', () => {
    const location = { href: 'http://127.0.0.1:5173/w.js', origin: 'http://127.0.0.1:5173' }
    expect(isAllowedUrl('/models/pose_landmarker_full.task', location)).toBe(true)
    expect(isAllowedUrl('http://127.0.0.1:5173/mediapipe/wasm/vision_wasm_internal.wasm', location)).toBe(true)
    expect(isAllowedUrl('blob:http://127.0.0.1:5173/0b6e', location)).toBe(true)
    expect(isAllowedUrl('data:application/octet-stream;base64,AA==', location)).toBe(true)
    // Capacitor's custom scheme has an opaque URL origin; scheme + host still match.
    expect(isAllowedUrl('capacitor://localhost/models/x.task', { href: 'capacitor://localhost/w.js', origin: 'capacitor://localhost' })).toBe(true)
    expect(isAllowedUrl('https://odml.pa.googleapis.com/v1/log', { href: 'capacitor://localhost/w.js', origin: 'capacitor://localhost' })).toBe(false)
  })

  it('treats a blob: worker as its creator origin, including relative URLs', () => {
    const location = { href: 'blob:http://127.0.0.1:5173/6f1c2e4a-0000-4000-8000-000000000000', origin: 'http://127.0.0.1:5173' }
    expect(isAllowedUrl('/models/pose_landmarker_full.task', location)).toBe(true)
    expect(isAllowedUrl('http://127.0.0.1:5173/mediapipe/wasm/x.js', location)).toBe(true)
    expect(isAllowedUrl('https://odml.pa.googleapis.com/v1/log', location)).toBe(false)
  })

  it('refuses other origins, including another port on the same host', () => {
    const location = { href: 'http://127.0.0.1:5173/w.js', origin: 'http://127.0.0.1:5173' }
    expect(isAllowedUrl('https://odml.pa.googleapis.com/v1/log', location)).toBe(false)
    expect(isAllowedUrl('http://127.0.0.1:9999/x', location)).toBe(false)
    expect(isAllowedUrl('https://storage.googleapis.com/mediapipe-models/x.task', location)).toBe(false)
  })

  it('blocks the MediaPipe telemetry POST without calling the network and reports it', async () => {
    const scope = fakeScope()
    const blocked: string[] = []
    const restore = installSameOriginFetchGuard(scope, { onBlocked: (url) => blocked.push(url) })
    await expect(scope.fetch('https://odml.pa.googleapis.com/v1/log?key=abc', { method: 'POST', body: 'x' })).rejects.toThrow(TypeError)
    await expect(scope.fetch(new Request('https://odml.pa.googleapis.com/v1/log'))).rejects.toThrow(/privacy guard/)
    expect(scope.calls).toEqual([])
    expect(blocked).toEqual(['https://odml.pa.googleapis.com/v1/log', 'https://odml.pa.googleapis.com/v1/log'])
    await expect(scope.fetch('/models/pose_landmarker_full.task')).resolves.toBeInstanceOf(Response)
    await expect(scope.fetch(new URL('http://127.0.0.1:5173/mediapipe/wasm/a.wasm'))).resolves.toBeInstanceOf(Response)
    expect(scope.calls).toEqual(['/models/pose_landmarker_full.task', 'http://127.0.0.1:5173/mediapipe/wasm/a.wasm'])
    restore()
    await scope.fetch('https://odml.pa.googleapis.com/v1/log')
    expect(scope.calls).toHaveLength(3)
  })
})
