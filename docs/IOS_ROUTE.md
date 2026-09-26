# iOS route (stub)

v1 ships as a phone-first PWA built with Vite + React. The native iOS app wraps the same
`dist/` build with Capacitor; the analysis engine (`app/src/analysis`) is framework-free
TypeScript so it can run inside the WKWebView or be ported to Swift later.

Config: `app/capacitor.config.ts` (appId `au.com.servecoach.app`, appName `Serve Coach`, webDir `dist`).

## Not done yet (needs macOS + Xcode)

```sh
cd app
npm run build
npx cap add ios      # generates app/ios (Xcode project). Not run: requires macOS.
npx cap sync ios     # copies dist/ and plugins into the native project
npx cap open ios     # opens Xcode
```

## Open questions to resolve before the native build

- Camera capture: `<input type="file" accept="video/*" capture>` in WKWebView vs a native capture plugin for 120/240 fps slow-motion.
- Frame-accurate decode in WKWebView (WebCodecs availability on the target iOS version) vs a native AVFoundation bridge.
- MediaPipe wasm in WKWebView (SIMD support, memory) vs Apple Vision body pose (`PoseFrame.source = 'apple-vision'`).
- Model and wasm files are served from the app bundle, never a CDN.
