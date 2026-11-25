/**
 * Cross-origin isolation, ready and switched off (M1.1).
 *
 * ONNX Runtime's swing refine asks for threads, and a browser gives threads
 * (SharedArrayBuffer) only to an isolated page. `vite.config.ts` can send the
 * two headers on the dev server and on `vite preview`, behind `ISOLATE=1`.
 *
 * Off by default, on measurement: four threads made each RTMPose read 1.7x
 * faster (`footprint.html?threads=`), but every isolated whole analysis timed
 * on a loaded machine abandoned the swing refine, and the one without did not.
 * Until a quiet machine settles it, nothing ships isolated. This holds both
 * halves: the headers are right when asked for, and they are not sent unasked.
 *
 * `require-corp` would block any cross-origin subresource. None exists: the
 * egress scan holds every `fetch(` to this origin, and this checks the markup.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
import { assert, check, heading, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as { readFileSync: (p: string, enc: string) => string; existsSync: (p: string) => boolean }

heading('Cross-origin isolation, ready and switched off')

check('asked for, the dev server and vite preview send the two headers, ahead of the raw ort/ files', () => {
  const config = fs.readFileSync('vite.config.ts', 'utf8')
  assert(config.includes("'Cross-Origin-Opener-Policy': 'same-origin'"), 'COOP isn’t same-origin')
  assert(config.includes("'Cross-Origin-Embedder-Policy': 'require-corp'"), 'COEP isn’t require-corp')
  assert(/configureServer:\s*add/.test(config) && /configurePreviewServer:\s*add/.test(config), 'the headers aren’t on both servers')
  const plugins = config.slice(config.indexOf('plugins: ['))
  const at = plugins.indexOf('[isolationHeaders()]')
  assert(at >= 0 && at < plugins.indexOf('serveOrtRaw(),'), 'the headers plugin isn’t ahead of the raw ort/ files')
})

check('unasked, nothing is isolated: not the dev server, not a static host', () => {
  const config = fs.readFileSync('vite.config.ts', 'utf8')
  assert(config.includes('process.env.ISOLATE ? [isolationHeaders()] : []'), 'the headers are on by default')
  // The host's header file exists since N6.2, for its policy and caching. It
  // carries the two isolation lines switched off, word for word what the dev
  // server sends when asked, so switching on is removing a comment mark.
  const host = fs.readFileSync('public/_headers', 'utf8')
  const live = host.split(/\r?\n/).filter((l) => !l.trim().startsWith('#'))
  assert(!live.some((l) => /Cross-Origin-(Opener|Embedder)-Policy/i.test(l)), 'public/_headers isolates every static host')
  assert(/^#\s+Cross-Origin-Opener-Policy: same-origin$/m.test(host), 'the opener line isn’t ready in public/_headers')
  assert(/^#\s+Cross-Origin-Embedder-Policy: require-corp$/m.test(host), 'the embedder line isn’t ready in public/_headers')
})

check('the shell loads nothing from another origin, which require-corp would block', () => {
  for (const page of ['index.html', 'bench.html', 'clipbench.html', 'retest.html', 'pipeline.html', 'footprint.html']) {
    const html = fs.readFileSync(page, 'utf8')
    const foreign = html.match(/(?:src|href)=["'](?:https?:)?\/\/[^"']+/g)
    assert(!foreign, `${page} loads ${foreign?.join(', ')}`)
  }
})

report()
