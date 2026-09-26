import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2022',
    // Vite 8 (Rolldown) name for rollupOptions. validation.html is the dev harness page.
    rolldownOptions: {
      input: {
        main: fromRoot('./index.html'),
        validation: fromRoot('./validation.html'),
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
          include: ['src/**/*.test.{ts,tsx}'],
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
