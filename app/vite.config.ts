import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'
import { syntheticCorpusPlugin } from './vite/syntheticCorpus.ts'

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/**
 * PWA (platform owner; src/platform/README.md). The service worker is hand-written
 * (src/platform/sw/sw.ts); vite-plugin-pwa builds it and injects the precache list. Precached: the app
 * shell, both pose models and only the MediaPipe wasm the pose worker loads (the module build). Not
 * precached: the sample-session files and the main-thread wasm fallback (cached on first use), the
 * Vietnamese font subset (DESIGN §4.1). Colours are DESIGN §2.2 Day tokens (the page's own theme-color
 * meta tags switch for Night).
 */
const pwa = VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src/platform/sw',
  filename: 'sw.ts',
  injectRegister: false,
  registerType: 'prompt',
  // Icons are listed in globPatterns; the plugin adds manifest.webmanifest itself.
  includeManifestIcons: false,
  manifest: {
    id: '/',
    name: 'Serve Coach',
    short_name: 'Serve Coach',
    description: 'A virtual serve coach for recreational tennis players. Analysis runs on your phone.',
    lang: 'en-AU',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // Portrait-first but not locked: the fence set-up films sideways (DESIGN §5.1).
    orientation: 'any',
    theme_color: '#f1f3ef',
    background_color: '#f1f3ef',
    categories: ['sports', 'health', 'fitness'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  },
  injectManifest: {
    globPatterns: [
      'index.html',
      'theme-init.js',
      'favicon.svg',
      'icons/*.png',
      'assets/**/*.{js,css,woff2}',
      'models/*.task',
      'mediapipe/wasm/vision_wasm_module_internal.{js,wasm}',
    ],
    globIgnores: ['**/*vietnamese*', '**/*.map', 'demo/**', 'sw.js'],
    // The largest precached file is the module wasm (about 11.8 MB).
    maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
    rollupFormat: 'iife',
  },
  devOptions: { enabled: false },
})

export default defineConfig({
  // syntheticCorpusPlugin is dev-only (apply: 'serve'): it serves ../validation/synthetic under
  // /__synthetic/ to the validation harness (validation.html) without copying it into public/.
  // The PWA plugin is left out of Vitest runs (it only matters for builds).
  plugins: [react(), tailwindcss(), syntheticCorpusPlugin(fromRoot('../validation/synthetic')), ...(process.env.VITEST ? [] : [pwa])],
  build: {
    target: 'es2022',
    // Vite 8 (Rolldown) name for rollupOptions. validation.html is a dev-only page (served by
    // `npm run dev`), so the production build contains the app only.
    rolldownOptions: {
      input: {
        main: fromRoot('./index.html'),
      },
      output: {
        // Long-lived vendor chunks (cached across app updates); screens are code-split by route.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'router', test: /node_modules[\\/]react-router[\\/]/ },
            { name: 'motion', test: /node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/ },
            { name: 'dexie', test: /node_modules[\\/](dexie|dexie-react-hooks)[\\/]/ },
          ],
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
  test: {
    // Engine code is framework-free and runs in Node. UI tests get jsdom.
    // A single file elsewhere can opt in with a `// @vitest-environment jsdom` docblock.
    projects: [
      {
        extends: true,
        test: {
          name: 'engine',
          environment: 'node',
          include: ['src/**/*.test.{ts,tsx}', 'vite/**/*.test.ts'],
          exclude: ['src/ui/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/ui/**/*.test.{ts,tsx}'],
          setupFiles: ['./src/test/setup-dom.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
      reportsDirectory: './coverage',
    },
  },
})
