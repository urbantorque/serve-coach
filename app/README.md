# Serve Coach app

Vite + React 19 + TypeScript (strict) + Tailwind CSS v4. Engine code under `src/analysis` must stay
free of React and DOM-only globals so it runs in Node (Vitest), Web Workers and a WKWebView.

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (`/` app, `/validation.html` harness) |
| `npm run build` | `tsc -b` then `vite build` into `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` / `npm run test:watch` | Vitest: `engine` project in Node, `ui` project (`src/ui/**`) in jsdom |
| `npm run test:coverage` | Vitest with V8 coverage into `coverage/` |
| `npm run typecheck` | `tsc -b` over the project references (no emit) |
| `npm run lint` | oxlint |
| `npm run copy:mediapipe` | Copy MediaPipe wasm into `public/mediapipe/wasm` (runs on postinstall) |

Pose models live in `public/models/` (see `../docs/MODELS.md`).

**UI.** Tokens, base components, the app shell with a route for every screen, and the data layer are in
`src/ui` and `src/data`; conventions for screen builders are in `src/ui/README.md`, and `/dev/components`
is a live gallery. `node scripts/ui-screenshots.mjs` (with `vite preview` on port 4173) screenshots the
gallery and key screens at 390 × 844 in Day and Night with headless Edge and reports console errors,
horizontal overflow and small tap targets into `../validation/results/ui-foundation/`.

**Privacy.** `index.html` (and the dev-only `validation.html`) carry the app's Content-Security-Policy as the
first `<head>` element: `connect-src 'self' blob: data:` keeps every request on the device, including
MediaPipe's usage telemetry. Workers must be started from a `blob:` bootstrap so they inherit it (see
`src/analysis/pose/README.md`, Privacy).

**Validation.** `validation.html` (dev server only, not in the production build) runs the engine on one
clip; `node ../tools/validate/smoke.mjs` runs it over the synthetic corpus in headless Edge and writes
`../validation/results/smoke/SUMMARY.md`. See `src/validation/README.md`.
