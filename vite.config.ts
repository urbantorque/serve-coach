import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * The wasm runtime must match the @mediapipe/tasks-vision JS that drives it.
 * That JS is precached and updates with every deploy, while the runtime cache
 * below holds entries for up to a year and CacheFirst never revalidates — so
 * the cache is named by the library version, and upgrading the package makes
 * existing installs fetch a matching runtime instead of reviving a stale one.
 */
const engineVersion: string = JSON.parse(
  readFileSync(new URL('./node_modules/@mediapipe/tasks-vision/package.json', import.meta.url), 'utf8'),
).version

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

const enginePathPrefixes = [`${base}models/`, `${base}wasm/`]
const isEngineAsset = (pathname: string) => enginePathPrefixes.some((p) => pathname.startsWith(p))

// The pose model and wasm runtime are ~19 MB combined. Precaching them would
// block the install on a big silent download, so the shell is precached and the
// heavy assets are cached on first use (see lib/pose/poseEngine.ts, which warms
// them with a progress bar the user can watch).
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
        categories: ['sports', 'health', 'education'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // never precache the model or wasm — they are runtime-cached instead
        globIgnores: ['**/models/**', '**/wasm/**'],
        navigateFallbackDenylist: enginePathPrefixes.map(
          (p) => new RegExp(`^${escapeRegExp(p)}`),
        ),
        runtimeCaching: [
          {
            urlPattern: ({ url }) => isEngineAsset(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: `serve-coach-pose-engine-${engineVersion}`,
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 365 },
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
