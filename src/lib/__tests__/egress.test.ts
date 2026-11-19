/**
 * Every network call the shipped app can make, enumerated and closed.
 *
 * `LOOP.md`'s constraint 7 states the policy in a comment: "no network call
 * after load, no analytics, no account, no remote logging... the one
 * load-time fetch is the pose model and the WASM runtime." That is an
 * assertion nobody had tested — a second `fetch` anywhere else in the tree,
 * a copy-pasted analytics snippet, a debug ping left behind a flag, would
 * have shipped silently. This scans the actual source for every syntactic
 * way a browser starts a request and asserts the result is exactly the
 * handful of call sites this file names and justifies. A player's video
 * never leaving their device is the whole promise this app makes; this is
 * what stands behind that promise instead of a comment.
 *
 * Text-matched rather than parsed, on purpose — a regex over source text
 * cannot be fooled by a network call built up from string concatenation to
 * dodge a literal `fetch(`, and neither can it be, in the far commoner
 * direction, since nobody writes evasive code by accident. What it can do
 * is over-match a comment or a string that merely mentions one of these
 * names; the allow list below is checked against what was actually found,
 * so a false match fails loud rather than passing silently.
 */
// No @types/node in this project — the same trade `harness.ts` makes for
// `process.exit`, extended here to `process.cwd` and the two Node builtins
// this file needs. Ambient declarations do not cross a module boundary, so
// each file that needs one writes its own rather than importing `harness.ts`'s.
// TypeScript's bundler resolution recognises `fs`/`path` as real, typeless
// modules, so a `declare module` for either is read as augmenting something
// that already (typelessly) exists rather than declaring it fresh —
// `@ts-expect-error` sidesteps that and leaves the imports as `any`, narrowed
// immediately below to exactly the calls this file makes.
declare const process: { cwd(): string }
// @ts-expect-error — no @types/node; see the comment above.
import fsUntyped from 'fs'
// @ts-expect-error — no @types/node; see the comment above.
import pathUntyped from 'path'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const fs: {
  readdirSync: (path: string, options: { withFileTypes: true }) => { name: string; isDirectory(): boolean }[]
  readFileSync: (path: string, encoding: 'utf8') => string
} = fsUntyped
const path: { join: (...parts: string[]) => string; relative: (from: string, to: string) => string } = pathUntyped

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'src')

/** Every `.ts`/`.tsx` file under `src`, tests excluded — this is a claim about the shipped app, not about the suite that checks it. */
function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue
      // The payment functions run on the host, never in the player's browser
      // (N6.5), and talk to Stripe about a payment and nothing else.
      // `serverBoundary.test.ts` holds that no module the app ships imports them.
      if (full === path.join(SRC, 'server')) continue
      out.push(...sourceFiles(full))
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

/** Every syntactic way this codebase could start a request or open a socket. */
const NETWORK_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'fetch', re: /\bfetch\s*\(/ },
  { name: 'XMLHttpRequest', re: /\bnew\s+XMLHttpRequest\b/ },
  { name: 'sendBeacon', re: /\bsendBeacon\s*\(/ },
  { name: 'WebSocket', re: /\bnew\s+WebSocket\b/ },
  { name: 'EventSource', re: /\bnew\s+EventSource\b/ },
  { name: 'Image()', re: /\bnew\s+Image\s*\(/ },
  // A remote voice sends the text it reads to a server, so speech is a request
  // like any other here (D6.2).
  { name: 'speechSynthesis', re: /\bspeechSynthesis\b|\bSpeechSynthesisUtterance\b/ },
]

interface Site {
  file: string
  pattern: string
}

/**
 * Every call site allowed to exist, and why — short enough to read in one
 * sitting, which is the point of keeping the list this small.
 */
const ALLOWED: (Site & { why: string })[] = [
  {
    file: 'lib/billing/client.ts',
    pattern: 'fetch',
    why:
      'Paying for Plus (N6.5), and only where the owner has switched payments on: the module ' +
      'is loaded by a dynamic import behind `PAYMENTS !== "off"`, so a build without payments ' +
      'never runs it. Every request goes to this site\x27s own `/api/`, and carries a checkout id ' +
      'coming back from Stripe or the signed pass, never anything about a serve.',
  },
  {
    file: 'lib/engineDownload.ts',
    pattern: 'fetch',
    why:
      "The engines' load-time downloads, and only those (L6.1). The pose model, the object " +
      'model that finds the racket and RTMPose-s for the swing are fetched through here, from ' +
      "this app's own origin (`BASE_URL`-relative, never a third-party host), once per session " +
      "behind each engine's singleton guard; the offline warm-up fetches the same files from " +
      "the build's own manifest so the service worker caches them. The WASM runtimes are " +
      "fetched the same way from inside MediaPipe's and ONNX Runtime's own code, against the " +
      'same same-origin paths, all vendored by `fetch-assets.mjs`.',
  },
  {
    file: 'lib/speech.ts',
    pattern: 'speechSynthesis',
    why:
      'The glance read aloud, opt-in. Speaks only through a voice that reports ' +
      '`localService` (it runs on the phone) and is silent otherwise, never falling back to ' +
      'the default voice, which can be a remote one that sends the text to a server.',
  },
  {
    file: 'dev/bench/main.ts',
    pattern: 'fetch',
    why:
      'The dev-only pose benchmark, reached through `bench.html`, which the production build ' +
      'never bundles (Vite builds `index.html` alone). Reads the labelled dataset from ' +
      '`bench-data/` on the dev server — same origin, fetched to disk beforehand by ' +
      '`npm run setup:bench`. Not part of the app a player downloads.',
  },
  {
    file: 'dev/footprint/main.ts',
    pattern: 'fetch',
    why:
      'The dev-only model footprint check (D6.7), reached through `footprint.html`, which the ' +
      'production build never bundles. Reads a refinement model from the dev server. Same origin.',
  },
  {
    file: 'dev/workerSpike/worker.ts',
    pattern: 'XMLHttpRequest',
    why:
      'The dev-only M1.2 spike, reached through `workerspike.html`, which the production build ' +
      'never bundles. Stands in for `importScripts`, which a module worker lacks, to load ' +
      "MediaPipe's own wasm glue from `/wasm/` on the dev server. Same origin.",
  },
  {
    file: 'lib/pose/pose.worker.ts',
    pattern: 'XMLHttpRequest',
    why:
      'The pose worker behind `?worker=1` (M1.2). Stands in for `importScripts`, which a module ' +
      "worker lacks, to load MediaPipe's own wasm glue from the app's `/wasm/`, the same files " +
      'the main thread loads. Same origin; the model itself is handed over by the page.',
  },
  {
    file: 'dev/bench/main.ts',
    pattern: 'Image()',
    why:
      'The same dev-only benchmark, decoding the dataset frames from the dev server. Same ' +
      'origin, never in the production bundle.',
  },
]

heading('Every request the running app can make')

const files = sourceFiles(SRC)
note(`${files.length} source files scanned under src/`)

const found: Site[] = []
for (const file of files) {
  const rel = path.relative(SRC, file).replace(/\\/g, '/')
  const text = fs.readFileSync(file, 'utf8')
  for (const { name, re } of NETWORK_PATTERNS) {
    if (re.test(text)) found.push({ file: rel, pattern: name })
  }
}

check('every network-capable call site in the app is a named, justified one', () => {
  const unlisted = found.filter(
    (f) => !ALLOWED.some((a) => a.file === f.file && a.pattern === f.pattern),
  )
  assert(
    unlisted.length === 0,
    `not on the allow list: ${unlisted.map((f) => `${f.pattern}() in ${f.file}`).join(', ')}`,
  )
})

check('speech goes only through a voice on the device', () => {
  // The allow list says why `lib/speech.ts` may speak; this says it still only
  // speaks the way that justification claims. A voice that is not filtered on
  // `localService`, or an utterance spoken without a voice chosen from that
  // filter, would be the browser's default voice — which can be remote.
  const speech = fs.readFileSync(path.join(SRC, 'lib', 'speech.ts'), 'utf8')
  assert(speech.includes('filter((v) => v.localService)'), 'speech.ts no longer keeps to local voices')
  assert(speech.includes('utterance.voice = voice'), 'an utterance is spoken without the chosen local voice')
  assert(speech.includes('if (!voice) return false'), 'speech.ts speaks with no local voice found')
})

check('every entry on the allow list is still real', () => {
  // The opposite failure: a call site removed or renamed leaves a stale
  // exception nobody would ever notice was doing nothing — the same "an
  // absent guard is not proof of absence" trap this codebase catches
  // elsewhere, pointed at itself.
  for (const a of ALLOWED) {
    const stillThere = found.some((f) => f.file === a.file && f.pattern === a.pattern)
    assert(stillThere, `${a.file} no longer calls ${a.pattern}(...) — the allow list is stale`)
  }
})

check('the document the app ships in names no third party', () => {
  // index.html loads before a byte of this app's own JS runs. A remote font,
  // an analytics tag or a CDN script tag here would be egress the source
  // scan above cannot see, since none of it is TypeScript.
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  assert(!/https?:\/\//i.test(html), `index.html references an external URL: ${html}`)
})

report()
