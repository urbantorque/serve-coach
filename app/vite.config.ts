import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { syntheticCorpusPlugin } from './vite/syntheticCorpus.ts'

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  // syntheticCorpusPlugin is dev-only (apply: 'serve'): it serves ../validation/synthetic under
  // /__synthetic/ to the validation harness (validation.html) without copying it into public/.
  plugins: [react(), tailwindcss(), syntheticCorpusPlugin(fromRoot('../validation/synthetic'))],
  build: {
    target: 'es2022',
    // Vite 8 (Rolldown) name for rollupOptions. validation.html is a dev-only page (served by
    // `npm run dev`), so the production build contains the app only.
    rolldownOptions: {
      input: {
        main: fromRoot('./index.html'),
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
