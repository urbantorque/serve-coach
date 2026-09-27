import { describe, expect, it } from 'vitest'
import { buildId, entryPath, route, type RouteRequest } from './routes.ts'

const ORIGIN = 'https://serve.example'
const PRECACHED = new Set(['/index.html', '/assets/main-abc.js', '/models/pose_landmarker_full.task', '/mediapipe/wasm/vision_wasm_module_internal.js'])
const req = (path: string, extra: Partial<RouteRequest> = {}): RouteRequest => ({
  url: path.startsWith('http') ? path : `${ORIGIN}${path}`,
  method: 'GET',
  mode: 'cors',
  range: null,
  ...extra,
})

describe('service worker routes', () => {
  it('never answers for another origin, and never for non-GET or ranged requests', () => {
    expect(route(req('https://odml.pa.googleapis.com/v1/logs'), ORIGIN, PRECACHED)).toEqual({ kind: 'pass' })
    expect(route(req('https://fonts.googleapis.com/css2?family=Archivo'), ORIGIN, PRECACHED)).toEqual({ kind: 'pass' })
    expect(route(req('https://serve.example.evil.com/assets/main-abc.js'), ORIGIN, PRECACHED)).toEqual({ kind: 'pass' })
    expect(route(req('/assets/main-abc.js', { method: 'POST' }), ORIGIN, PRECACHED)).toEqual({ kind: 'pass' })
    expect(route(req('/demo/sample-s1.mp4', { range: 'bytes=0-' }), ORIGIN, PRECACHED)).toEqual({ kind: 'pass' })
    expect(route(req('not a url'), ORIGIN, PRECACHED)).toEqual({ kind: 'pass' })
  })

  it('serves app routes from the shell, but not files opened directly', () => {
    expect(route(req('/sessions/abc', { mode: 'navigate' }), ORIGIN, PRECACHED)).toEqual({ kind: 'shell' })
    expect(route(req('/?dev-spot=off', { mode: 'navigate' }), ORIGIN, PRECACHED)).toEqual({ kind: 'shell' })
    expect(route(req('/index.html', { mode: 'navigate' }), ORIGIN, PRECACHED)).toEqual({ kind: 'shell' })
    expect(route(req('/demo/sample-s1.mp4', { mode: 'navigate' }), ORIGIN, PRECACHED)).toEqual({ kind: 'pass' })
  })

  it('looks precached files up by path, ignoring the loader query', () => {
    expect(route(req('/mediapipe/wasm/vision_wasm_module_internal.js?load=2'), ORIGIN, PRECACHED)).toEqual({
      kind: 'precache',
      path: '/mediapipe/wasm/vision_wasm_module_internal.js',
    })
    expect(route(req('/models/pose_landmarker_full.task'), ORIGIN, PRECACHED).kind).toBe('precache')
  })

  it('caches sample files and the wasm fallback on first use, and leaves the rest alone', () => {
    expect(route(req('/demo/seed@1.json'), ORIGIN, PRECACHED)).toEqual({ kind: 'runtime', cache: 'serve-coach-runtime-demo' })
    expect(route(req('/mediapipe/wasm/vision_wasm_internal.wasm'), ORIGIN, PRECACHED)).toEqual({ kind: 'runtime', cache: 'serve-coach-runtime-assets' })
    expect(route(req('/assets/archivo-vietnamese-wdth-normal-x.woff2'), ORIGIN, PRECACHED).kind).toBe('runtime')
    expect(route(req('/__synthetic/clips/baseline-s1/baseline-s1.mp4'), ORIGIN, PRECACHED)).toEqual({ kind: 'pass' })
    expect(route(req('/sw.js'), ORIGIN, PRECACHED)).toEqual({ kind: 'pass' })
    expect(route(req('/favicon.ico'), ORIGIN, PRECACHED)).toEqual({ kind: 'pass' })
  })
})

describe('precache names', () => {
  it('normalises manifest urls to paths', () => {
    expect(entryPath({ url: 'assets/x.js', revision: null })).toBe('/assets/x.js')
    expect(entryPath({ url: './index.html', revision: 'a' })).toBe('/index.html')
    expect(entryPath({ url: '/icons/a.png', revision: 'b' })).toBe('/icons/a.png')
  })

  it('names a build by its files and revisions, in any order', () => {
    const a = [
      { url: 'index.html', revision: '1' },
      { url: 'assets/x.js', revision: null },
    ]
    expect(buildId(a)).toBe(buildId([...a].reverse()))
    expect(buildId(a)).not.toBe(buildId([{ url: 'index.html', revision: '2' }, a[1]]))
  })
})
