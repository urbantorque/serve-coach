import { existsSync, readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'
// @ts-expect-error - a plain .mjs helper shared with the test runner
import { engineCacheName, engineManifest } from './scripts/engine-manifest.mjs'
import { headersFor, parseHeaders } from './src/lib/hostHeaders'

/**
 * The wasm runtimes must match the JavaScript that drives them. That JS is
 * precached and updates with every deploy, while the engine cache below never
 * revalidates (CacheFirst) — so the cache is named by the MediaPipe and ONNX
 * Runtime versions (`engineCacheName`), and upgrading either makes existing
 * installs fetch a matching runtime instead of reviving a stale one. The app
 * reads the same name (`__ENGINE_CACHE__`) to check readiness and to delete
 * the caches older versions left (L6.6).
 */

/**
 * Where the app is served from.
 *
 * Defaults to the domain root, which is what a dedicated host gives you. Set
 * `BASE_PATH` to deploy under a subdirectory — a GitHub Pages project site, a
 * staging folder, a page inside a club's existing website:
 *
 *   BASE_PATH=/serve-coach/ npm run build
 *
 * Everything below derives from this rather than repeating it. The pose model and
 * the wasm runtime are fetched at runtime by `lib/pose/poseEngine.ts`, which
 * reads the same value back out of `import.meta.env.BASE_URL` — so a mismatch
 * here does not produce a wrong layout, it produces an app that cannot load its
 * model and therefore cannot do anything at all.
 */
const base = normaliseBase(process.env.BASE_PATH ?? '/')

function normaliseBase(raw: string): string {
  let value = raw.trim() || '/'
  if (!value.startsWith('/')) value = `/${value}`
  if (!value.endsWith('/')) value = `${value}/`
  return value
}

/** For building regexes out of a path that may contain regex metacharacters. */
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const enginePathPrefixes = [`${base}models/`, `${base}wasm/`, `${base}ort/`]

/*
 * The engine-asset route, as a RegExp rather than a predicate.
 *
 * This has to be a value Workbox can write into the generated worker. A
 * function passed as `urlPattern` is serialised with `toString()`, which keeps
 * the body and drops everything it closed over — so `({url}) => isEngineAsset(
 * url.pathname)` landed in dist/sw.js as a call to a name that was never
 * defined there. The callback threw ReferenceError on every request, the route
 * never matched, and the 9 MB model and 19 MB wasm runtime were re-downloaded
 * on every cold start. An app whose whole promise is that it works with the
 * network off did not.
 *
 * A RegExp is serialised as a literal, so it carries no closure to lose. It is
 * deliberately unanchored: Workbox tests it against the full href, and only
 * requires a match at index 0 for cross-origin requests. These are our own
 * assets on our own origin.
 */
const ENGINE_ASSET_RE = new RegExp(`${escapeRegExp(base)}(models|wasm|ort)/`)

// The pose model and wasm runtime are ~19 MB combined. Precaching them would
// block the install on a big silent download, so the shell is precached and the
// heavy assets are cached on first use (see lib/pose/poseEngine.ts, which warms
// them with a progress bar the user can watch).
/**
 * The two headers that make the page cross-origin isolated (M1.1).
 *
 * ONNX Runtime asks for threads, and threads need SharedArrayBuffer, which a
 * browser only hands to an isolated page. No build served these, so the swing
 * refine always ran on one thread. Every asset this app loads is its own, on
 * its own origin, so `require-corp` blocks nothing; `isolation.test.ts` holds
 * that. Not shipped to a static host yet: see the plugin list below.
 *
 * On the dev server and on `vite preview` both, ahead of every other
 * middleware, so the raw `ort/` files below get them too.
 */
export const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
} as const

function isolationHeaders(): Plugin {
  // Returns nothing on purpose: a function returned from `configureServer`
  // is run by Vite as a post hook, and `use` returns the app.
  const add = (server: { middlewares: { use: (fn: (req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => void) => unknown } }): void => {
    server.middlewares.use((_req, res, next) => {
      for (const [k, v] of Object.entries(ISOLATION_HEADERS)) res.setHeader(k, v)
      next()
    })
  }
  return {
    name: 'serve-coach:isolation',
    configureServer: add,
    configurePreviewServer: add,
  }
}

/**
 * Dev server only: hand `public/ort/` over untouched.
 *
 * ONNX Runtime loads its WASM glue with a dynamic `import()` of
 * `/ort/ort-wasm-simd-threaded.mjs`. Vite's dev server treats any import of a
 * file under `public/` as an error ("cannot be imported from JavaScript") and
 * the swing refinement silently never ran in development. A production build
 * serves `public/` as plain files and needs nothing — this middleware is
 * registered for `serve` only, and runs ahead of Vite's own.
 */
function serveOrtRaw(): Plugin {
  return {
    name: 'serve-coach:ort-raw',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? ''
        const m = /^\/ort\/([\w.-]+\.(mjs|wasm))$/.exec(path.startsWith(base) ? '/' + path.slice(base.length) : path)
        if (!m) return next()
        const file = new URL(`./public/ort/${m[1]}`, import.meta.url)
        if (!existsSync(file)) return next()
        res.setHeader('Content-Type', m[2] === 'wasm' ? 'application/wasm' : 'text/javascript')
        res.end(readFileSync(file))
      })
    },
  }
}

/**
 * `vite preview` answers with the static host's own headers (N6.2): the rules
 * in the built `_headers` (from `public/_headers`), content security policy
 * included, so a policy that would break the app on the host breaks it here
 * first. The dev server is left alone: Vite's own inline refresh script and
 * socket would be refused by the policy, and neither ships.
 */
function hostHeaders(): Plugin {
  return {
    name: 'serve-coach:host-headers',
    configurePreviewServer(server) {
      const file = new URL('./dist/_headers', import.meta.url)
      const rules = existsSync(file) ? parseHeaders(readFileSync(file, 'utf8')) : []
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '/').split('?')[0]
        const local = path.startsWith(base) ? '/' + path.slice(base.length) : path
        // An app address is answered with the page, and gets the page's rules.
        const asked = /\.[\w]+$/.test(local) ? local : '/index.html'
        for (const [k, v] of Object.entries(headersFor(rules, asked))) res.setHeader(k, v)
        next()
      })
    },
  }
}

/**
 * HTTPS for a phone on the same network, set only by `npm run preview:lan`
 * (`scripts/lan-preview.mjs`), which issues the certificate and says how the
 * phone comes to trust it. Without it a phone gets plain HTTP, and plain HTTP
 * off localhost has no camera preview, no service worker and no install.
 */
const lanTlsDir = process.env.LAN_TLS_DIR
const lanTls = lanTlsDir
  ? { key: readFileSync(`${lanTlsDir}/lan-key.pem`), cert: readFileSync(`${lanTlsDir}/lan-cert.pem`) }
  : undefined

export default defineConfig({
  base,
  ...(lanTls ? { server: { https: lanTls }, preview: { https: lanTls } } : {}),
  // Every engine file and its size, read off `public/` now (L6.1): the one
  // download bar and the size the home screen states both come from this.
  define: {
    __ENGINE_MANIFEST__: JSON.stringify(engineManifest(fileURLToPath(new URL('.', import.meta.url)))),
    // The one name the worker's route and the readiness check share (L6.6).
    __ENGINE_CACHE__: JSON.stringify(engineCacheName(fileURLToPath(new URL('.', import.meta.url)))),
  },
  plugins: [
    // Opt-in (`ISOLATE=1`) until a quiet machine settles M1.1: threads made
    // each RTMPose read 1.7x faster, but every isolated whole analysis timed
    // here abandoned the swing refine, and the one without isolation did not.
    ...(process.env.ISOLATE ? [isolationHeaders()] : []),
    hostHeaders(),
    serveOrtRaw(),
    react(),
    VitePWA({
      // 'prompt', not 'autoUpdate' — the app decides when to take a new
      // version, because 'whenever it lands' can be mid-sweep. The prompt is
      // never shown to anybody: `lib/updates.ts` applies it on the home screen.
      registerType: 'prompt',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Serve Coach — Tennis Serve Analysis',
        short_name: 'Serve Coach',
        description:
          'Frame-by-frame tennis serve analysis that runs entirely on your device. Your video never leaves your phone.',
        theme_color: '#0a0c10',
        background_color: '#0a0c10',
        display: 'standalone',
        // Not locked to portrait: the speed placement and the court mode turn
        // the phone on its side, and an installed app locked upright would
        // refuse to follow it there.
        orientation: 'any',
        // Both must respect the base, or an installed app launches at the wrong
        // URL and the service worker claims a scope it was not served from —
        // which on iOS is the difference between the history surviving and not,
        // since only an installed app is exempt from the seven-day clearance.
        start_url: base,
        scope: base,
        // A stable identity, so a future change to start_url is an update to
        // this install rather than a second app beside it.
        id: base,
        categories: ['sports', 'health', 'education'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // The real screens, from the production build (M4.2, `scripts/screenshots.mjs`).
        screenshots: [
          { src: 'screenshots/home.png', sizes: '1080x2340', type: 'image/png', form_factor: 'narrow', label: 'Film a serve, or pick one from your camera roll' },
          { src: 'screenshots/report.png', sizes: '1080x2340', type: 'image/png', form_factor: 'narrow', label: 'The fix that matters most, with its drill' },
          { src: 'screenshots/guide.png', sizes: '1080x2340', type: 'image/png', form_factor: 'narrow', label: 'Where to stand the phone' },
          { src: 'screenshots/wide.png', sizes: '2340x1080', type: 'image/png', form_factor: 'wide', label: 'Serve Coach on a wide screen' },
        ],
        // Long-press on the installed icon. Only destinations that need no
        // gesture to open: a file picker cannot be opened without a tap, so
        // "Analyse a serve" is not one of them. `?open=` is read in App.tsx.
        shortcuts: [
          { name: 'Your progress', short_name: 'Progress', url: `${base}?open=progress`, icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'How to film your serve', short_name: 'How to film', url: `${base}?open=guide`, icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // never precache the model or wasm — they are runtime-cached instead
        // The install-sheet screenshots (M4.2) are for the browser's install
        // prompt, not the app; precaching them would cost 1.3 MB of every install.
        globIgnores: ['**/models/**', '**/wasm/**', '**/ort/**', '**/screenshots/**'],
        navigateFallbackDenylist: enginePathPrefixes.map(
          (p) => new RegExp(`^${escapeRegExp(p)}`),
        ),
        runtimeCaching: [
          {
            urlPattern: ENGINE_ASSET_RE,
            handler: 'CacheFirst',
            options: {
              cacheName: engineCacheName(fileURLToPath(new URL('.', import.meta.url))),
              /*
               * No `maxAgeSeconds`. There was a one-year limit here, which
               * quietly un-installed offline support: an app opened regularly
               * but not re-fetching the engine within a year had the 9 MB model
               * and the 9 MB runtime evicted, and the only place that shows up
               * is a court with no signal. Staleness is already handled, and
               * handled better, by the cache being named for the library
               * version — upgrading the package makes existing installs fetch a
               * matching runtime rather than reviving a mismatched one. An age
               * limit on top of that expires assets that are still correct.
               */
              expiration: { maxEntries: 12 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
})
