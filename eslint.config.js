import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

/**
 * Lint rules, chosen for what they actually catch in this codebase.
 *
 * The valuable rule here is `react-hooks/exhaustive-deps`. Every dependency array
 * in the player and the app shell is hand-maintained, and a missing entry does not
 * fail to compile — it produces a closure holding a stale value, which shows up as
 * an overlay drawn for a frame the video has already moved past. That is the exact
 * class of bug this project cannot see any other way: the type checker is happy,
 * and the engine tests run in Node with no React in them at all.
 *
 * Deliberately not enabled: stylistic rules. The codebase is internally consistent
 * and a formatter argument produces churn without finding anything.
 */
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'public', 'dev-dist'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.es2022 },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // A dependency array that lies is the one mistake here that neither the
      // type checker nor the Node test suite can see.
      'react-hooks/exhaustive-deps': 'error',

      // Every fast-refresh boundary in this app is a component file; a stray
      // export from one silently turns hot reload into a full page reload, which
      // during development means losing the analysis you just waited for.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // `_frames` and `_t` are used deliberately when destructuring a field away
      // — see the `saveSession` and `stripStills` paths.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],

      // Empty catch blocks are load-bearing in the storage and preference layers:
      // a browser that refuses `localStorage` must not take the app down, and the
      // comment inside each one says so.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // The test suites and build scripts run in Node, not a browser.
    files: ['**/__tests__/**/*.ts', 'scripts/**/*.mjs', 'eslint.config.js', 'vite.config.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Test rigs legitimately reach past the public shape of a type to build a
      // fixture that is deliberately malformed.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
