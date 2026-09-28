# platform/

Browser and device services that are not the analysis engine and not a screen (ARCHITECTURE §3):
the PWA (manifest, service worker, update prompt), persistent storage, the in-app recorder's chunk
store and recovery, and the local beta usage counts. Nothing here sends anything off the phone (D8).

| Path | What |
| --- | --- |
| `ids.ts` | ULIDs, local dates, `randomRef()` (the beta report reference) |
| `pwa/register.ts` | Service worker registration (production builds, never in the Capacitor shell) and the `usePwa` update state |
| `pwa/cacheNames.ts` | Cache Storage names shared by the worker and "Delete everything" (`clearRuntimeCaches`) |
| `sw/sw.ts`, `sw/routes.ts` | The hand-written service worker and its pure request routing |
| `storage.ts` | `navigator.storage.persist()` at the first saved session, status and the estimate line |
| `beta.ts` | Turns app state into local usage events (buckets only) |
| `ui/PlatformLayer.tsx` | Mounted once by the app shell: registration, update prompt, recording recovery, event observers |
| `ui/UpdatePrompt.tsx`, `ui/StorageProtection.tsx` | The calm update prompt; the Storage and privacy additions |
| `icons/icon.mjs`, `icons/render-icons.mjs` | The app icon source and its PNG renderer (Playwright, headless Edge) |
| `pwa/pwa-check.mjs` | End-to-end checks on the production build (offline, recording crash, requests, CSP) |

Related, outside this folder: `data/repos/events.ts` and `data/betaReport.ts` (events table and report),
`data/repos/recordings.ts` (chunk store and clean-up rules), `ui/screens/record/live/recorder.ts`,
`recovery.ts`, `recoverActions.ts`, `RecordingRecovery.tsx` (recorder persistence and the launch
offer), `ui/screens/profile/beta/` (Profile > Beta data and the usefulness question),
`scripts/copy-mediapipe.mjs` (which wasm variants ship), `vite.config.ts` (the PWA plugin).

## PWA

- **Manifest** (`vite.config.ts`): "Serve Coach", `display: standalone`, `orientation: any` (portrait
  first, not locked: the fence set-up films sideways, DESIGN §5.1), theme and background `#f1f3ef`
  (Day `--bg`; the page's two `theme-color` meta tags switch for Night), `lang: en-AU`. Icons: 192 and
  512 "any" (rounded tile), 192 and 512 maskable (full bleed, everything inside the 40% safe circle), the
  SVG, and a 180 px `apple-touch-icon` linked from `index.html`.
- **Icon** (`icons/icon.mjs`): an optic ball at the peak of a dotted toss path over a chalk baseline, with
  a small bracket beside the peak for "how steady is your toss" (the D5 hero metric). DESIGN tokens only:
  graphite tile `--surface-inverse`, `--optic`, chalk `--bg`. Re-render with
  `node src/platform/icons/render-icons.mjs --preview <dir>`.
- **Service worker** (`sw/sw.ts`, built by vite-plugin-pwa `injectManifest`, no Workbox runtime):
  - Precache: the app shell (HTML, JS, CSS, latin and latin-ext fonts, icons, manifest), both pose models
    (full for analysis, lite for live framing) and only `vision_wasm_module_internal.{js,wasm}`.
    About 29.6 MB, 162 entries. Unchanged files are copied from the previous build's cache on update.
  - On first use: sample-session files (`/demo/`), the main-thread wasm fallback, the Vietnamese font
    subset. These runtime caches are dropped when a new build activates and by "Delete everything".
  - Navigations get the precached `index.html`. Ranged requests, other origins, non-GET requests,
    `/__*` dev routes and `sw.js` itself are never answered by the worker, and the worker never fetches
    another origin (`routes.test.ts`). The page CSP is unchanged: `worker-src 'self'` already allows it.
  - Updates wait. `UpdatePrompt` offers "Reload" above the tab bar; it never shows over a full-screen
    flow, during an analysis or over a toast, and "Later" hides it until the next launch. Only the
    player's tap sends `SKIP_WAITING`; the page reloads once the new worker takes control.
  - Not in dev (`npm run dev`) and not in the Capacitor shell (its bundle is local; ARCHITECTURE §15.1).
  - Known limit: a second tab still running the old build can miss a lazy chunk after the update.

## MediaPipe wasm variants

`FilesetResolver.forVisionTasks(base, useModule)` picks `vision_wasm{_module}{_nosimd}_internal`: the
module build when the loader runs in a module worker, otherwise the SIMD or no-SIMD build after a
WebAssembly SIMD probe. See "Measured" below for what the loader actually requested.

| Variant | Loaded by | Ships | Precached |
| --- | --- | --- | --- |
| `vision_wasm_module_internal` (11.8 MB) | the pose worker (analysis and live framing) in Chromium/Edge; Safari 17+ and WKWebView when the worker starts | yes | yes |
| `vision_wasm_internal` (11.8 MB) | the main-thread fallback when the pose worker cannot start (any engine with WebAssembly SIMD: Safari 16.4+, all current engines) | yes | no, cached on first use |
| `vision_wasm_nosimd_internal` (11.3 MB) | engines without WebAssembly SIMD only (Safari before 16.4, Chrome before 91) | **no** | no |

iOS Safari and WKWebView (not measured: no Mac or iPhone in this round): Safari 17+ has
`OffscreenCanvas` WebGL in workers, so the pose worker loads the module build like Edge. If a module
worker cannot start there (the blob bootstrap under `capacitor://` is untested), the source falls back to
the main thread and loads `vision_wasm_internal`, so that variant stays in the bundle. Once the Mac sprint
confirms the worker path on iOS (IOS_ROUTE §8), dropping it saves another 11.8 MB.

## Persistent storage

`persistAtFirstSession()` runs when the first real session is handed to analysis: a toast says "We asked
this browser to keep your sessions, so it doesn't clear them to free up space." and then asks. It asks
once (a denial is not repeated automatically), says nothing if the site is already persisted, and stores
the answer in settings `storagePersisted` (`true`, `'denied'`, or `false` = never asked). Storage and
privacy shows the browser's estimate ("This browser lets Serve Coach use up to about 60 GB. In use:
1.2 GB (2%).") and, while not protected, "Ask to protect".

## In-app recording robustness

- The recorder writes each 1 s `MediaRecorder` chunk to IndexedDB (`videoChunks`) as it arrives and drops
  it from memory once written, so a 20-minute clip never sits in memory, and a crash, a killed tab or a
  flat battery loses about a second. Row seq -1 is the header: facts known at start (set-up, delivered
  size and rate, framing, block card, plan), the tilt log and length at stop, and the session that took
  the clip.
- If storage is unavailable the recorder keeps chunks in memory as before. If the phone runs out of space
  mid-recording it stops, marks the clip interrupted ("storage-full") and keeps what was written.
- Record again or closing the camera deletes the chunks. Saving the session "claims" them; they are
  deleted once that session has its video record (60 s after its analysis ends, or at the next launch).
- On the next launch (tab-bar screens only, after 1.2 s) an unfinished clip is offered: "Analyse
  recording", "Not now" or "Delete recording" (confirmed). Analysing rebuilds the capture context from
  the header; the probe's size and frame rate win. After a crash there is no tilt log, so heights follow
  the engine's "tilt unknown" rules, like an import. A clip whose session was saved before the crash
  reuses that session.
- Clean-up rules (`sweepRecordings`): claimed and settled: delete; under 5 s or empty: delete; older than
  7 days: delete; more than 2 unfinished: keep the newest 2; anything written in the last 15 s (another
  tab may be recording) and any recorder running in this page: leave alone. Deletions write a
  `deletionLog` row with counts only.
- Unverified: whether Safari's `timeslice` MP4 chunks form a readable file when the recorder never
  finalised (ARCHITECTURE §7.2). The probe and pipeline already tolerate a truncated last fragment on
  Chromium WebM; a device test is still needed.

## Beta usage counts (local only)

Events are written only through `recordEvent()` (`data/repos/events.ts`), which checks every property
against a catalogue of enums, buckets and yes/no values, rounds the time down to the hour and drops
anything else (counted, never stored). No free text, ids, heights, UTR values, body-check answers or
location, and no pain or referral event at all, not even a count (PRODUCT §9.4: health information stays
out of analytics; rows an older build wrote are skipped by `listEvents` and removed by the retention sweep
and the report). Kept 180 days; cleared by "Clear usage counts" (Beta data) and by
"Delete everything". A one-way hash (`onceKey`) makes some events count once per experiment or session;
it is never exported.

| Event | Where it is recorded | Props |
| --- | --- | --- |
| `app_first_opened` | PlatformLayer, first launch | display, platform |
| `analysis_completed` | PlatformLayer (job done), never the sample | serves bucket, capture good/fair/limited, valid (10+ serves and Fair or Good), view, source, retest, days since baseline bucket |
| `focus_opened`, `drill_started` | PlatformLayer (route), only with an own session | none |
| `drill_completed` | PlatformLayer (the drill player's hand-off to the practice log) | minutes bucket |
| `practice_logged` | `focus/actions.ts` `savePracticeLog` | minutes bucket, goal met, feel, cue helpful |
| `verdict_viewed` | Compare ("Did it work?"), once per experiment and verdict | verdict, re-test within 14 days, same session |
| `usefulness_rated` / `usefulness_skipped` | Compare, once per experiment, skippable | rating 1 to 5 |
| `paywall_viewed` | PlatformLayer (the Plan screen) | trigger (plan, t1, t2, t3) |
| `plus_wtp_answered` | the beta Plus preview sheet (`entitlement/beta.ts` `recordWtpAnswer`) | trigger (t1, t2, t3), answer (yes, maybe, no), price asked |
| `recording_recovered` | the launch offer | choice, length bucket |
| `storage_persist_requested` | `storage.ts` | result, from |

Gates (`data/betaReport.ts`, docs/MONETISATION.md §8, PRODUCT §9.1): **activation** = a valid analysed
session and then Focus and drill (or its drill) opened, both within 7 days of the first open; **loop
completion** = a verdict other than "Not comparable yet" for a re-test within 14 days of its baseline;
**active week** = at least one analysed session or logged practice; **usefulness** = share of 4 and 5
ratings. Profile > Beta data shows them in words, the counts, what is never recorded, the latest events,
and "Export report" (JSON through the share sheet or a download; the tester chooses whether to send it).

## Checks

- Unit: `npx vitest run src/platform src/data src/ui/screens/profile/beta`.
- Production build: `npx vite build`, `node node_modules/vite/bin/vite.js preview --port 5402 --strictPort`,
  then `node src/platform/pwa/pwa-check.mjs` (writes `validation/results/ui/final-platform/summary.json`).

## Measured (headless Edge 154, production build, 390 x 844, 2026-09-28)

Files: `validation/results/ui/final-platform/summary.json`, `summary-recording.json`, `ui-summary.json`,
screenshots beside them.

- **Precache:** 163 cache entries (162 files plus the revision list), about 29.6 MB; the service worker
  controlled the page after the first load. `dist/` went from 83 MB to 73 MB with the no-SIMD wasm left out.
- **Wasm and models requested** (page, workers and service worker together):
  - analysis (online, offline, and a recovered clip): `vision_wasm_module_internal.{js,wasm}` and
    `pose_landmarker_full.task` only;
  - live framing: `vision_wasm_module_internal.{js,wasm}` and `pose_landmarker_lite.task` only;
  - `vision_wasm_internal` and `vision_wasm_nosimd_internal` were never requested.
- **Offline:** reload from the service worker, Today, Sessions, Beta data and Storage and privacy opened;
  a 1-serve clip imported and analysed offline in 11 to 19 s over three runs (the pose worker's model and wasm came from the
  precache); the sample session, removed and loaded again offline, came from the runtime cache (487 files).
- **Requests:** 926 to 928 recorded per run; none left `localhost:5402` (page, workers or service worker); the service
  worker only fetched its own origin; 0 CSP violations; 0 console errors.
- **Update:** a changed `sw.js` installed and waited; the prompt appeared; Reload activated it and the page
  reloaded once; nothing was left waiting.
- **Recording:** with a key frame every second, 9 s of fake-camera recording gave 9 media chunks
  (271 to 276 KB over two runs) in IndexedDB before Stop; before that setting, Edge's MP4 recorder gave one 762-byte chunk (the
  file header) in 9 s. After a hard renderer crash (CDP `Page.crash`), the next launch offered "We kept 0:09
  of video", and "Analyse recording" opened the unfinished MP4 (probed as 480p, 21 fps) and ran the
  pipeline to its normal "We couldn't find a serve" (the fake camera shows no player).
- **Storage:** `persisted()` false in a fresh headless profile (expected: Chromium grants by engagement or
  install); estimate quota 10.8 GB.
- **Screens:** no horizontal overflow and no tap target under 44 x 44 on Profile, Beta data, Storage and
  privacy, and "Did it work?" with the usefulness question, light and dark.

Not measured: iOS Safari, WKWebView and Android (no devices this round); `persist()` on an installed
Home Screen app; Safari's MediaRecorder chunking after a crash.
