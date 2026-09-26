# Serve Coach

Virtual serve coach for recreational tennis players (UTR 1-7). Phone-first PWA in `app/`
(Vite + React + TypeScript) with a framework-free analysis engine in `app/src/analysis`,
and a Capacitor route to iOS (see `docs/IOS_ROUTE.md`).

```sh
cd app
npm install        # also copies the MediaPipe wasm runtime into public/
npm run dev        # http://localhost:5173 (validation harness: /validation.html)
npm run typecheck
npm test
npm run build
```
