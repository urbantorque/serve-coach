/**
 * The static host's headers (N6.2): what `public/_headers` sends, read through
 * the same parser `vite preview` applies, so the rules tested here are the
 * rules a preview of the build answers with.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
import { cspSources, headersFor, parseHeaders, patternMatches } from '../hostHeaders'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as { readFileSync: (p: string, enc: string) => string }
const rules = parseHeaders(fs.readFileSync('public/_headers', 'utf8'))
const page = headersFor(rules, '/index.html')
const csp = page['Content-Security-Policy'] ?? ''

heading('What the host answers with')

check('the parser reads paths, headers and comments the way the host does', () => {
  const r = parseHeaders('# a note\n/*\n  A: 1\n  # an aside\n/x/*\n  B: two: parts\n')
  assert(r.length === 2 && r[0].pattern === '/*' && r[0].headers[0][0] === 'A' && r[1].headers[0][1] === 'two: parts', JSON.stringify(r))
  assert(patternMatches('/assets/*', '/assets/a/b.js') && !patternMatches('/assets/*', '/models/a.task'), 'a splat matched the wrong path')
  assert(patternMatches('/index.html', '/index.html') && !patternMatches('/index.html', '/index.htm'), 'an exact path did not hold')
})

check('every page loads only from its own origin', () => {
  note(csp)
  assert(cspSources(csp, 'default-src')?.join(' ') === "'self'", 'the default is not the own origin')
  const script = cspSources(csp, 'script-src') ?? []
  assert(script.includes("'self'") && script.includes("'wasm-unsafe-eval'"), 'the pose models could not compile')
  assert(!script.includes("'unsafe-eval'") && !script.includes("'unsafe-inline'"), 'scripts may be evaluated or inlined')
  for (const d of ['connect-src', 'img-src', 'media-src', 'font-src', 'worker-src', 'style-src']) {
    const remote = (cspSources(csp, d) ?? []).filter((s) => /^(https?:|\*|\w+\.\w)/.test(s))
    assert(remote.length === 0, `${d} lets in ${remote.join(' ')}`)
  }
  assert(cspSources(csp, 'frame-ancestors')?.join(' ') === "'none'", 'the app could be framed')
  assert(cspSources(csp, 'object-src')?.join(' ') === "'none'", 'plugins are allowed')
})

check('the camera is the one device feature a page may ask for', () => {
  const policy = page['Permissions-Policy'] ?? ''
  assert(/camera=\(self\)/.test(policy) && /microphone=\(\)/.test(policy) && /geolocation=\(\)/.test(policy), policy)
})

check('hashed files are kept, the page and the service worker always asked for', () => {
  assert(/immutable/.test(headersFor(rules, '/assets/index-abc123.js')['Cache-Control'] ?? ''), 'built files are not kept')
  assert(headersFor(rules, '/index.html')['Cache-Control'] === 'no-cache', 'the page is kept, so an update never arrives')
  assert(headersFor(rules, '/sw.js')['Cache-Control'] === 'no-cache', 'the service worker is kept')
  assert(!/immutable/.test(headersFor(rules, '/models/pose_landmarker_full.task')['Cache-Control'] ?? ''), 'a model that keeps its name is kept forever')
})

check('every response carries the policy, not only the page', () => {
  for (const p of ['/assets/index-abc.js', '/models/x.task', '/ort/ort-wasm-simd-threaded.mjs', '/sw.js']) {
    assert(headersFor(rules, p)['Content-Security-Policy'] === csp, `${p} has no policy`)
    assert(headersFor(rules, p)['X-Content-Type-Options'] === 'nosniff', `${p} may be sniffed`)
  }
})

report()
