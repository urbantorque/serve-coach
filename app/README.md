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
