import { existsSync, readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'
// @ts-expect-error - a plain .mjs helper shared with the test runner
import { engineCacheName, engineManifest } from './scripts/engine-manifest.mjs'

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

export default defineConfig({
  base,
  // Every engine file and its size, read off `public/` now (L6.1): the one
  // download bar and the size the home screen states both come from this.
  define: {
    __ENGINE_MANIFEST__: JSON.stringify(engineManifest(fileURLToPath(new URL('.', import.meta.url)))),
    // The one name the worker's route and the readiness check share (L6.6).
    __ENGINE_CACHE__: JSON.stringify(engineCacheName(fileURLToPath(new URL('.', import.meta.url)))),
  },
  plugins: [
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
        orientation: 'portrait',
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
        globIgnores: ['**/models/**', '**/wasm/**', '**/ort/**'],
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
