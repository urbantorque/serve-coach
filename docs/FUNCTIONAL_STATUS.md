# Functional status

**As of 28 September 2026, the hardening commit after `33ac31f`** (consistency, annotation mode, validation report, performance, docs and launch plan, integrated and re-checked together). This page lists what works in the build today, the honesty label the engine gives each number, and what is prototype-only or not built.

It is derived from:
- the engine's own tables, `app/src/analysis/metrics/catalogue.ts` and `validation-summary.json`;
- the per-metric `validationState` in `docs/specs/metrics.json`;
- the latest results in `validation/results/{metrics,smoke,ui}`.

The full accuracy report is [VALIDATION.md](VALIDATION.md).

> **Read this first.** Every accuracy figure below comes from **synthetic video**: 122 rendered clips (129 serves) with exact ground truth, from a corpus of 124 (`validation/synthetic`). No real footage, real phone or radar has been used yet. "Passed" means "passed on clean renders", not "accurate on your serve". See [LIMITATIONS.md](LIMITATIONS.md).

> **Re-derive this page** from `catalogue.ts`, `metrics.json` and the latest results after each integration commit.

## 1. How the labels are set

| Label | What it means in this build | How a metric gets there |
|---|---|---|
| **Measured** | Validated against a reference on real footage | **No serve metric reaches it.** It needs level V2 or higher, which needs the real-footage study (METRICS §1.3). The only value emitted as `measured` is `capture-quality`, which describes the recording (frame rate, size, light, view), not the serve. metrics.json rates its checks as V0 *inconclusive*, so this label should drop to match (flagged for engine-core). |
| **Estimated** (shown as ≈) | Passed its synthetic test (level V1) for daylight | Status = the lower of the metric's target and its validation ceiling. V1 caps at `estimated`. |
| **Player-entered** ("You logged") | Typed or tapped by the player | Outcome tags, tallies, intended serve type and target. |
| **Experimental** | Level V0 (failed, inconclusive or not yet scored), or a per-serve cap applies | Hidden unless the player turns on "Experimental metrics" in Profile; never used for coaching. |
| **Unavailable** | Cannot be measured from this footage | Always shows the reason and an unlock hint (for example "Add a phone behind you to see this"). Spin is always unavailable. |

**Per-serve caps** that lower an `estimated` value to `experimental` (`metrics/perServe.ts`, `status.ts`):
- **Camera too close.** Closer than 6 m to the server: heights read 4–7% low at 5 m on the corpus.
- **30 fps rhythm.** Release timing error is about 80 ms at 30 fps.
- **Unknown phone tilt** (`PITCH_UNKNOWN`). Absolute heights and positions drop to experimental; **spreads keep their status** (METRICS §1.1 item 3). Imports carry no tilt reading.
  - The Import screen asks side-view imports "How was the phone mounted?" (METRICS §1.1.3a). "Level mount" is taken as level within ±2°, "Roughly level" within ±4°.
  - The engine widens each serve's height range by that allowance and keeps toss and contact height at `estimated` only while √(p95² + (1.96σ)²) stays within 5% of height (`ASSUMED_LEVEL_HEIGHT_BUDGET`); otherwise they drop to experimental. A standing-body roll check over 3° also drops them.
  - "Tilted, or not sure" (the default) and all rear-view imports keep heights experimental.
- **Night lights or flicker.** Every metric stays V0 until the night cells are validated.

## 2. Analysis pipeline (all on the device)

| Stage | Status | Evidence (synthetic) |
|---|---|---|
| Probe, time base, slow-motion check (gravity fit of the toss) | Functional | 65 smoke clips: fitted time scale within 1% of truth at the set medians (worst clip 7%). It recovered 240 fps slow motion saved as 30 fps (factor 0.125, interval 0.117–0.132) |
| Serve finding (Pass A: 4 Hz pose scan, 15 Hz fill) | Functional, **below target end to end** | The offline engine run (full-rate poses, 122 clips) counted every serve correctly. In the full app pipeline, the scan now finds every serve (8 of 8 on the session clip, 16 of 16 on `sample-checkin`). But the engine marked 3 of those 24 as uncertain (ball not tracked, scan contact 0.33–0.54 s early) and did not count them, so the serve count read 7 and 14. End-to-end recall: **24 of 27 serves (89%) against the 99% target**. Unchanged on the integrated build (the same serves on every repeat); with the 16-serve re-test clip (16 of 16) it is 40 of 43 (93%). An open issue for engine-core (metrics.json `validationNote`; VALIDATION §3.3). Uncounted serves stay in the list as "Excluded from your stats", with "Include again" |
| Pose (MediaPipe Pose Landmarker **full**, bundled WebAssembly, in a worker; two workers in Pass B on 8-thread devices) | Functional | Median error 2.7–3.6% of body height per smoke set (12 core joints). Fixed at integration: in production builds the two workers fetched the model at once, one fetch failed, and the check-in clip found 3 of 16 serves (7 runs). Model loading now retries after a network failure (VALIDATION §6) |
| Left/right mix-up fix (`serve/relabel.ts`) | Functional | Mirrored side-view frames: 37% before, 0% after (worst 10% of clips still 11%) |
| Ball detection and toss tracking (2 workers) | Functional | Toss recall 98–100% across sets; apex timing error under 1 ms at 60 fps |
| Event timing: release, apex, lowest hip, contact, landing | Functional, **contact unreliable on some clips end to end** | Offline, mean error at 60 fps (105 clips): release 13 ms, apex 0.7 ms, contact 2.3 ms (1.1 ms with hit sound), lowest hip 86 ms, landing 66 ms. In the full app pipeline, 2 of 5 single-serve benchmark clips had contact about 0.27 s early, which left wrong toss-drop, rhythm and leg-drive estimates in the stats (VALIDATION §3.3); open for engine-core |
| Phone-tilt correction from motion sensors | Functional in code | Synthetic tilt only. Sensor sign convention and accuracy on real iPhones **unverified** |
| View check (a declared side view filmed from elsewhere) | Functional | 5 of 5 clips filmed from 45° in front flagged; no false alarms |
| Set-up key (orientation, distance class, serving spot) | Functional | Trends, usual ranges, re-tests and coaching strata only compare sessions from one set-up (`metrics/setup.ts`). The serving spot is saved from Record and from Import (optional there); sessions without it read "unknown", which matches any spot |
| Hit-sound contact timing (opt-in, imports only) | Functional | Racket pop labelled contact on 129 of 129 clips; footsteps never. Only timestamps are kept |
| Sound removed before a video is kept (`data/stripAudio.ts`) | Functional | Audio boxes and samples zeroed in place, no re-encode. Fragmented MP4 is refused and no copy is kept |
| Capture-quality checks | Functional | Emitted every session (see §1 on its label) |
| Key frames (480 px thumbnails, 720 px evidence crops) | Functional | 8-serve session: 56 thumbnails and 28 crops, 1.5 MB |
| Coaching decision after analysis (`decideFocus`) | Functional | Stored for every analysed session in the integrated flows |
| Resume after interruption | **Not built** | A resumed job re-runs from the start; nothing is half-saved |

**Processing time**, measured in headless Edge on an Intel Core Ultra 5 laptop, not a phone (after the performance pass of this round; before it: 26 s, 139 s and 254 s):

| Clip | Time |
|---|---|
| 1 serve | 13–17 s |
| 8 serves (73.5 s clip) | 77–83 s |
| 16 serves (134.5 s clip, 1080 × 1920, 60 fps) | 147–155 s. The 90 s target is **missed**: Pass A (about 57 s) and Pass B (about 89 s) are bound by pose inference at 25–35 ms a frame on this laptop |

**No iPhone timing exists yet.**

## 3. Metrics: what the engine emits today

"State" is the `validationState` in metrics.json. Status is for the D1 side-view set-up: portrait at 7–8 m or landscape at the fence, 60 fps, daylight, tilt known from an in-app recording. The "D1 result" column comes from 11 clips at those distances.

**Counts across all 37 metric ids:**

| State | Count |
|---|---|
| Passed | 5 |
| Passed on limited evidence | 6 |
| Failed | 7 |
| Inconclusive | 3 |
| Not scored yet | 8 |
| Nothing to validate (player-entered or spin) | 8 |

### 3.1 Estimated in daylight (V1)

| Metric | Player name | State | D1 result against threshold | Notes |
|---|---|---|---|---|
| `toss-apex-height` | Toss height | pass | median error 0.011 × height, p95 0.027 (≤ 0.025 / 0.05) | Across all day clips the median error is 0.043, because 5 m clips read low; hence the 6 m cap. Absolute height reads 8–12 cm high for a toss 0.3 m nearer the camera (D1) |
| `toss-drop` | Ball drop before contact | pass | MAE 0.5 cm (≤ 5 cm) | |
| `contact-height-ratio` | Contact height | pass | MAE 0.007, p95 0.020 (≤ 0.03 / 0.05) | |
| `rhythm-release-to-contact` | Toss-to-hit time | pass | MAE 11 ms (≤ 21.7 ms at 60 fps) | Capped to experimental at 30 fps |
| `loading-depth` | Hip drop | pass | MAE 0.4% of height (≤ 2%) | Descriptive only; never a "bend more" instruction (D5) |
| `serve-count` | Serves | pass, limited | 0 wrong of 11 offline (precision and recall ≥ 99% needed) | **End to end in the app it misses 3 of 27 serves (89% recall; §2).** Re-toss, shadow-swing and miss clips are not rendered, so serve classification is only unit-tested. Stays "estimated" until the player confirms the serve strip |
| `leg-drive` | Leg drive (hip rise) | pass, limited | MAE 2.5% of height: **fails** at D1 (≤ 2%); passes on all day clips (1.9%) | Method error 0.6–0.7% with truth poses. MediaPipe's hip reads about 2% low, a persistent bias that cancels in the player's own comparisons. Shown as a player-relative band |
| `toss-height-spread`, `toss-forward-spread`, `contact-height-spread`, `rhythm-spread` | Consistency (hero metrics) | pass, limited | One 8-serve clip: errors +0.8 cm, −2.2 cm, −1.9 cm, −5 ms | **Thinnest evidence of any estimated metric**: one multi-serve clip plus per-serve error analysis. The 20-serve variability clips are not rendered. Needs enough serves per stratum, otherwise `TOO_FEW_SERVES` |

### 3.2 Experimental (hidden unless the toggle is on)

| Metric | State | Why |
|---|---|---|
| `toss-forward`, `contact-forward` | fail | MAE 6.7 and 6.6 cm against 5 and 6 cm. MediaPipe's foot point sits about 2% of height behind the toe |
| `drive-time` | fail | The hip minimum is flat: MAE 64–75 ms against 50 ms |
| `landing-distance` | fail | p95 24 cm against 15 cm at D1 (42 cm with added foot noise) |
| `shoulder-tilt-trophy` (band only, never degrees) | fail | p95 5.3° against ±4° |
| `trophy-pause` | fail | MAE 65–100 ms against 60 ms |
| `speed-experimental` (side, range only) | fail | Shown on **0 of 129** serves in the metric run (ranges about 45% wide, over the 35% display limit, or frame rate too low). Almost always unavailable in practice |
| `deep-bend-flag`, `knee-bend-band` (rear) | inconclusive | The corpus cannot test the failure that matters yet |
| `retoss-count`, `toss-lateral`, `toss-lateral-spread`, `shoulder-over-shoulder-contact`, `repeatability`, `fatigue-flag`, `load-flag` | not scored | No renders or no truth yet. Rear-view metrics are never shown on side-view reports (D1) |

### 3.3 Player-entered

- **Outcome metrics** from per-serve tags or a session tally: `serve-in-rate`, `first-serve-in-rate`, `second-serve-in-rate`, `double-faults`, `placement-zone` (target) and `serve-type-mix`.
- **Rates** show counts below 10 serves and a Wilson interval from 10.
- **Radar speed** (`speed-radar-entered`):
  - A radar reading can now be typed in "Check this serve" (§7). It is kept with that check as validation data and compared with the experimental speed range.
  - It does **not** yet fill the report's "Radar speed (you logged)" row, which still reads "not entered".

### 3.4 Unavailable

- `spin`: always, with the reason (D4).
- `speed-average-rear`: needs the four-corner court tap, which is not built.
- Anything from the wrong view: `NEEDS_SIDE_VIEW` or `NEEDS_REAR_VIEW`.
- Never computed at all (D5): racket drop, external rotation, pronation, racket-head speed, precise joint angles, a composite "serve score".

## 4. Statistics (pure functions in `app/src/analysis/stats` and the UI insight modules)

| Statistic | Status |
|---|---|
| Wilson intervals on every rate; "X of N measured" | Functional |
| Noise-corrected spreads with 95% intervals; "early read" when provisional | Functional |
| One display-precision rule for every number (`metrics/precision.ts`, METRICS §4.9) and one headline sentence (`metrics/headline.ts`) | Functional |
| Matched comparisons (same set-up, view, camera side, serve side, 1st/2nd, type, hand) | Functional |
| "Did it work?" verdicts in words (METRICS §4.5: shrinkage, Pocock bounds, "about N more serves to confirm") | Functional. "At the limit of what we can measure" (both spreads below the measurement noise) reaches coaching as "not comparable", with that reason |
| Ins-and-misses contrast (Welch per metric, Holm across 7, smallest worthwhile change, replication in a second matched session) | Functional. Needs 10 serves in each group, so rarely shown on small sessions |
| Trends, personal "usual" range, player-relative bands | Functional; the usual range needs 2+ matched sessions |
| Fatigue and load flags | Functional in code; experimental label |
| Real-footage agreement statistics (Bland–Altman, MAE with a player-cluster bootstrap, ICC(2,1), interval coverage, inter-annotator agreement) | Functional in code (`app/src/validation/annotation`, `tools/validate/annotation-eval.ts`); **never run on real data** |

## 5. Coaching engine (`app/src/coaching`)

**Functional:**
- pain safety gate and referral cards (COACHING §10);
- one focus per session, in the D6 priority order;
- a cue by level: an analogy for UTR 1–3, an outcome cue for UTR 4–7;
- a drill with progressions, and the practice log;
- experiments with matched re-tests;
- "Why this focus?", "My coach's focus" pinning, and the match-day card.

**Blockers and caveats:**
- **The referral copy has not had clinician review, which is a release blocker** (COACHING §10).
- The healthdirect number in the copy is marked "verify before release".

## 6. External services

| Item | At runtime | Notes |
|---|---|---|
| Analysis (pose, ball, metrics, statistics, coaching) | **None.** Runs in the browser, or in WKWebView on the phone | |
| MediaPipe pose model and WebAssembly runtime | Bundled with the app, served from its own origin | Downloaded once at development time (`docs/MODELS.md`) |
| MediaPipe usage telemetry (`odml.pa.googleapis.com`) | **Blocked** | CSP `connect-src 'self' blob: data:` plus a fetch guard in the pose worker. Smoke run: 0 requests left the machine; 130 attempts stopped in the worker |
| Fonts, icons, maps, CDNs | None | Archivo is bundled through `@fontsource-variable` |
| Analytics, crash reporting, ads, attribution | None | No SDKs |
| Accounts, sync, backup | None | Not built (D8) |
| Validation exports ("Check this serve") | None | A JSON file the person shares themselves. It contains no video, images, names (initials only) or pain notes |
| Cloud AI coaching phrasing | **Not built** | Optional future feature: off by default and consent-gated (D9, App Store 5.1.2(i), ARCHITECTURE §10) |
| Payments | None | The Plan screen takes no payment (§7) |

**Development time only:**
- `npm install` (npm registry);
- the synthetic corpus generator (local headless Edge and ffmpeg);
- `npx cap doctor` (checks the npm registry for the latest Capacitor);
- on a Mac, the Swift Package Manager fetch of `capacitor-swift-pm` from GitHub.

## 7. App features: functional, prototype-only, not built

"Functional" means it works end to end in headless Edge at 390 × 844, light and dark, with synthetic clips. The integrated flows on the production build produced 110 screenshots (flows A, B and C in light and dark), 0 console errors, 0 flow failures and no request to any other host (`validation/results/ui/integrated/report.json`). The first two runs at integration failed flow C: see §2 and VALIDATION §6 for the model-loading race that was fixed. **None of it has run on a real phone.**

| Area | Status | Detail |
|---|---|---|
| Onboarding (18+ check, first-run redirect) | Functional | An under-18 answer stores nothing |
| Sample session | Functional | Built from real engine output on synthetic clips (`scripts/build-demo.mjs`) |
| Import a video | Functional | Probe summary, slow-motion question, mount question for side views (§1), optional serving spot, size and length limits, sound removed before keeping. No duplicate-import check |
| In-app recording (web) | **Prototype** | `getUserMedia` video only, and `MediaRecorder` chunks held **in memory** (a crash loses the clip). 20-minute auto-stop. Frame rate, exposure, focus and lens cannot be locked. Tested only with a synthetic camera source (about 32 fps) and on a desktop without sensors |
| Live framing checks (level, headroom 4.3/4.5 m, size, light) | Prototype | Side view only; tilt sign on iOS unverified. Practice-toss ball check, flicker detection and storage check not built |
| Processing, cancel | Functional | Resume re-runs from the start |
| Session report; Serve detail (overlays, phases, compare, ghost, frame scrubber); Tagging | Functional | |
| **Check this serve** (annotation mode) | **Functional, new in `33ac31f`** | From Serve detail → More actions, or from an unusual value. The person marks release, peak, contact, landing, standing height and an optional radar reading, with the app's answers hidden until the marks are saved. "App vs you" then compares. Checks stay on the phone and export as `serve-coach-validation@1` JSON for `tools/validate/annotation-eval.ts`. It compares seven per-serve metrics: toss height, contact height, toss drop, rhythm, toss forward, contact forward and landing distance. Band labels and the hip and net-post taps from ARCHITECTURE §12 are not in it yet. Open to everyone; the "Validation mode" switch in About still changes nothing. A study code can be saved per check, exports drop free-text notes, and only unsaved marks carry over to a second annotator. Run end to end on the production build at integration (flow B, light and dark: an imported synthetic serve, peak and contact marked at the truth frames, "App vs you" on the same frame for both). **Not yet used on a real clip** |
| Focus, drill player, practice log, experiment loop, "Did it work?" | Functional | Integrated flow C (synthetic, 14 and 16 serves): check-in → drill → two logs → re-test → verdict "Clearly better", toss height spread ≈ 30 cm → ≈ 9.5 cm, the same text on the report card, Compare and Progress; the experiment is stored as completed |
| Progress, Sessions, Metric info (with "How sure are we?") | Functional | |
| How we measure (with the synthetic validation results) | Functional | Says on screen that real players, phones, court lights and radar speed are not tested yet |
| Profile: your serve, comfort and body check, coach focus, appearance, about and licences | Functional | Full licence texts still need to ship with a release build |
| Coach share | Functional as export | One-page HTML or JSON through the share sheet or a download; no hosted link, no coach account |
| Storage and privacy | Functional | Retention (keep, 7/30/90 days, delete after analysis), deletion of a serve, a session or everything, JSON and CSV export, and a storage estimate. Auto-delete runs only when the app is opened; persistent storage is never requested |
| Plan / paywall | **Prototype only** | **Takes no payment.** "Test Plus" writes a local flag. "Restore purchases" says there is nothing to restore. The free allowance is shown but not enforced (beta unlocks everything). Reachable only from Profile: the T1 trigger after the first "Did it work?" is **not wired** |
| Match log (M6) | Not built | Data model and deletion exist; no entry screen |
| Usage counts / instrumentation | Not built | The local `events` table exists but nothing writes to it, so activation and loop completion cannot be measured yet |
| Rear-view capture, four-corner court tap, suggested outcome tags | Not built | Rear footage can be imported; outcomes stay player-entered |
| Notifications, reminders | Not built | Web push would need a server (D8); native local notifications come with the iOS shell |
| Installable offline PWA | Not built | No web app manifest or service worker (`vite-plugin-pwa` is installed but not configured) |
| Accounts, sync, backup | Not built (by decision, D8) | |
| iOS app | Scaffold only | `app/ios` was generated on Windows and has never been built, signed or run. `npx cap sync ios` still succeeds at the hardening commit. See [IOS_ROUTE.md](IOS_ROUTE.md) |

## 8. Test evidence

- **Unit and component tests at the hardening commit: 1,091 in 115 files, all passing** on a quiet machine in about 70 s (957 at `b576aaa`). This includes a number-consistency test that renders every screen from the engine-built sample seed (`ui/format/consistency.demo.test.tsx`).
- **Typecheck, lint (oxlint, deny warnings) and `npm run build`: clean.**
- **Engine validation:**
  - `validation/results/metrics/SUMMARY.md`: 122 clips, three variants;
  - `validation/results/smoke/SUMMARY.md`: 65 clips, with the privacy probe;
  - [VALIDATION.md](VALIDATION.md): the report that ties them together.
- **End-to-end flows:** `validation/results/ui/integrated/report.json` (flows A, B and C in light and dark).
- **Performance benchmark:** `validation/results/ui/harden-performance/bench/`.
