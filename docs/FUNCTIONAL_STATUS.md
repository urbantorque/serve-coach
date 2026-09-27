# Functional status

**As of 27 September 2026** (commit `b576aaa` plus the current hardening round). This page says what actually works in the build today, with the honesty label the engine emits, and what is prototype-only or not built. It is derived from the engine's own tables, `app/src/analysis/metrics/catalogue.ts` and `app/src/analysis/metrics/validation-summary.json`, and from the latest results in `validation/results/{metrics,smoke,ui/integrated}`.

> **Changes in flight.** While this page was written, other owners were changing serve finding, decoding and pose performance, the metric-info and "How we measure" screens, and building a "Check this serve" annotation mode with radar entry (`app/src/validation/annotation`). Rows marked *not built* below may change when the integrator commits this round; re-derive this page from `catalogue.ts` and the latest results after that commit.

> **Read this first.** Every accuracy figure below comes from **synthetic video** (124 rendered clips with exact ground truth, `validation/synthetic`). No real footage, no real phone and no radar have been used yet. "Passed" means "passed on clean renders", not "accurate on your serve". See [LIMITATIONS.md](LIMITATIONS.md).

## 1. How the labels are set

| Label | What it means in this build | How a metric gets there |
|---|---|---|
| **Measured** | Validated against a reference on real footage | **No serve metric reaches it yet.** Needs validation level V2 or higher, which needs the real-footage study (METRICS §1.3). The only `measured` value the engine emits is `capture-quality`, which describes the recording (frame rate, size, light), not the serve. |
| **Estimated** (shown as ≈) | Passed its synthetic acceptance test (level V1) in the condition class | Status = the lower of the metric's target and its validation ceiling. V1 caps at `estimated`. |
| **Player-entered** ("You logged") | Typed or tapped by the player | Outcome tags, tallies, intended serve type and target, radar speed. |
| **Experimental** | Failed or not yet run its synthetic test (level V0), or a per-serve cap applies | Hidden unless the player turns on "Experimental metrics" in Profile. |
| **Unavailable** | Cannot be measured from this footage | Always shows the reason and an unlock hint (for example "Needs a view from behind"). Spin is always unavailable. |

**Per-serve caps** that lower an `estimated` value to `experimental` (engine `status.ts`):
- camera closer than 6 m to the server (heights read 4–7% low at 5 m on the corpus);
- 30 fps footage for rhythm (release timing error about 80 ms);
- phone tilt unknown, which is every import (`PITCH_UNKNOWN`). Absolute heights and positions drop to experimental, **spreads keep their status** (METRICS §1.1 item 3);
- night lights or flicker: every metric stays V0 until the night cells are validated.

## 2. Analysis pipeline (all on the device)

| Stage | Status | Evidence (synthetic) |
|---|---|---|
| Probe, time base and slow-motion check (gravity fit of the toss) | Functional | On 65 smoke clips the fitted time scale was within 1% of truth at the set medians (worst clip 7%), and it recovered 240 fps slow motion saved as 30 fps (factor 0.125) |
| Serve finding (Pass A: 4 Hz pose scan, 15 Hz fill) | Functional | 0 wrong counts on 95 side-view day clips. The in-app pipeline found **7 of 8** serves on the 8-serve session clip (one known miss, engine-pipeline report) |
| Pose (MediaPipe Pose Landmarker **full**, bundled, WebAssembly, in a worker) | Functional | Median error 2.7–3.6% of body height per smoke set (12 core joints) |
| Left/right mix-up fix (`serve/relabel.ts`) | Functional | Mirrored side-view frames 37% before, 0% after (worst 10% of clips still 11%) |
| Ball detection and toss tracking (worker) | Functional | Toss recall 98–100% across sets; apex timing error under 1 ms at 60 fps |
| Event timing: release, apex, lowest hip, contact, landing | Functional | Mean error at 60 fps (105 clips): release 13 ms, apex 0.7 ms, contact 2.3 ms (1.1 ms with hit sound), lowest hip 86 ms, landing 66 ms |
| Phone-tilt correction (rotation homography from motion sensors) | Functional in code | Tested on synthetic tilt only; sensor sign convention and accuracy on real iPhones **unverified** |
| View check (declared side view filmed from elsewhere) | Functional | 5 of 5 clips filmed from 45° in front flagged, no false alarms |
| Hit-sound contact timing (opt-in, imports only) | Functional | Racket pop labelled contact on 129 of 129 clips; footsteps never. Only timestamps are kept; samples are zeroed |
| Capture-quality checks | Functional | Emitted on every session (`measured`, see §1) |
| Key frames (480 px thumbnails, 720 px evidence crops) | Functional | 8-serve session: 56 thumbnails and 28 crops, 1.5 MB |
| Coaching decision after analysis (`decideFocus`) | Functional | Stored for every analysed session in the integrated flows |
| Resume after interruption | **Not built** | A resumed job re-runs from the start; nothing is half-saved |

Measured processing time (headless Edge on a shared Intel Core Ultra 5 laptop, not a phone): 1 serve in 16 s; 8 serves (73.5 s clip) in 97 s; a 16-serve import in 263–271 s end to end in the integrated flows. **No iPhone timing exists yet.**

## 3. Metrics: what the engine emits today

Status is for the D1 side-view set-up (portrait 7–8 m or landscape at the fence, 60 fps, daylight, tilt known from an in-app recording). "D1 result" is from 11 clips at those distances; "All day" is from 94–95 side-view daylight clips at 60 fps or more.

### 3.1 Estimated (passed synthetic V1)

| Metric | Player name | Status today | D1 result against threshold | Notes |
|---|---|---|---|---|
| `serve-count` | Serves | estimated | 0 wrong of 11 (≥ 99% needed) | See the 7-of-8 miss in §2 |
| `toss-apex-height` | Toss height | estimated | median error 0.011 × height, p95 0.027 (≤ 0.025 / 0.05) | All-day median 0.043 fails because 5 m clips read low, hence the 6 m cap. Absolute height reads 8–12 cm high for a toss 0.3 m nearer the camera (D1) |
| `toss-drop` | Ball drop before contact | estimated | MAE 0.5 cm (≤ 5 cm) | |
| `contact-height-ratio` | Contact height | estimated | MAE 0.007, p95 0.020 (≤ 0.03 / 0.05) | |
| `rhythm-release-to-contact` | Toss-to-hit time | estimated | MAE 11 ms (≤ 21.7 ms at 60 fps) | 30 fps capped to experimental |
| `leg-drive` | Leg drive (hip rise) | estimated | MAE 2.5% of height: **fails** at D1 (≤ 2%); passes on all day clips (1.9%) | Method error 0.7% with truth poses; MediaPipe's hip reads about 2% low, a persistent bias that cancels in the player's own comparisons. Shown as a player-relative band |
| `loading-depth` | Hip drop | estimated | MAE 0.4% of height (≤ 2%) | Descriptive only; never a "bend more" instruction (D5) |
| `toss-height-spread`, `toss-forward-spread`, `contact-height-spread`, `rhythm-spread` | Consistency (hero metrics) | estimated | One 8-serve clip: errors +0.8 cm, −2.2 cm, −1.9 cm, −5 ms | **Thinnest evidence of any estimated metric**: one multi-serve clip plus per-serve error analysis; the 20-serve variability clips are not rendered. Needs enough serves per stratum, otherwise `TOO_FEW_SERVES` |

### 3.2 Experimental (hidden unless the toggle is on)

| Metric | Why it is experimental |
|---|---|
| `toss-forward`, `contact-forward` | MAE 6.7 and 6.6 cm against 5 and 6 cm: MediaPipe's foot point sits about 2% of height behind the toe |
| `drive-time` | Flat hip minimum: MAE 64–75 ms against 50 ms |
| `landing-distance` | p95 24 cm against 15 cm at D1 (42 cm with added foot noise) |
| `shoulder-tilt-trophy` (band only, never degrees) | p95 5.3° against ±4° |
| `trophy-pause` | MAE 65–100 ms against 60 ms |
| `retoss-count` | No re-toss clips rendered |
| `deep-bend-flag`, `repeatability` | Experimental by design (METRICS target) |
| `fatigue-flag`, `load-flag` | No validation cell yet (V0) |
| Rear view only: `toss-lateral`, `toss-lateral-spread`, `knee-bend-band`, `shoulder-over-shoulder-contact` | Five rear clips plus one quick clip; not validated. Never shown on side-view reports (D1) |
| `speed-experimental` (side, range only) | Only when all D4 prerequisites hold (≥ 120 fps, clean post-contact detections, known scale, target tag). Smoke: 18 of 18 ranges held the true speed but were about 90 km/h wide, and 36 clips were refused. In the metric run it was shown on **0 of 129** serves. In practice it is almost always unavailable |

### 3.3 Player-entered

`serve-in-rate`, `first-serve-in-rate`, `second-serve-in-rate`, `double-faults`, `placement-zone` (target), `serve-type-mix`: from per-serve tags or a session tally. Rates show counts below 10 serves and a Wilson interval from 10. `speed-radar-entered` exists in the data model, but at `b576aaa` **there is no entry screen**; radar entry is part of the annotation work in progress this round.

### 3.4 Unavailable

- `spin`: always, with the reason (D4).
- `speed-average-rear`: needs the four-corner court tap, which is not built, so it is unavailable in every build.
- Anything from the wrong view: `NEEDS_SIDE_VIEW` or `NEEDS_REAR_VIEW`.
- Never computed at all (D5): racket drop, external rotation, pronation, racket-head speed, precise joint angles, a composite "serve score".

## 4. Statistics (pure functions in `app/src/analysis/stats` and the UI insight modules)

| Statistic | Status |
|---|---|
| Wilson intervals on every rate; "X of N measured" | Functional |
| Noise-corrected spreads with 95% intervals, "early read" when provisional | Functional |
| Matched comparisons (same view, camera side, serve side, 1st/2nd, type, hand) | Functional |
| "Did it work?" verdicts in words (METRICS §4.5: shrinkage, Pocock bounds, "about N more serves to confirm") | Functional. When the stored verdict is missing, the Compare screen computes it on the phone from session summaries (log-SD approximation, not the stratified bootstrap) and says so |
| Ins-and-misses contrast (Welch per metric, Holm across 7, smallest-worthwhile change, replication in a second matched session) | Functional; needs 10 serves in each group, so rarely shown on small sessions |
| Trends, personal "usual" range, player-relative bands | Functional; "usual" range needs 2+ matched sessions |
| Fatigue and load flags | Functional in code; experimental label |

## 5. Coaching engine (`app/src/coaching`)

Functional: pain safety gate and referral cards (COACHING §10), one focus per session with the D6 priority order, cue by level (analogy for UTR 1–3, outcome cue for UTR 4–7), drill with progressions, practice log, experiments with matched re-tests, "Why this focus?", "My coach's focus" pinning, match-day card. 63 engine tests cover the COACHING §15.1 list. **The referral copy has not had clinician review, which is a release blocker** (COACHING §10). The healthdirect number in the copy is marked "verify before release".

## 6. External services

| Item | At runtime | Notes |
|---|---|---|
| Analysis (pose, ball, metrics, statistics, coaching) | **None.** Runs in the browser or WKWebView on the device | |
| MediaPipe pose model and WebAssembly runtime | Bundled with the app, served from its own origin | Downloaded once at development time (`docs/MODELS.md`) |
| MediaPipe usage telemetry (`odml.pa.googleapis.com`) | **Blocked** | CSP `connect-src 'self' blob: data:` plus a fetch guard in the pose worker. Smoke run: 0 requests left the machine; 130 attempts stopped in the worker |
| Fonts, icons, maps, CDNs | None | Archivo is bundled through `@fontsource-variable` |
| Analytics, crash reporting, ads, attribution | None | No SDKs |
| Accounts, sync, backup | None | Not built (D8) |
| Cloud AI coaching phrasing | **Not built** | Optional future feature, off by default, consent-gated (D9, App Store 5.1.2(i), ARCHITECTURE §10) |
| Payments | None | The Plan screen takes no payment (§7) |

Development-time only: `npm install` (npm registry), the synthetic corpus generator (local headless Edge and ffmpeg), and on a Mac the Swift Package Manager fetch of `capacitor-swift-pm` from GitHub.

## 7. App features: functional, prototype-only, not built

"Functional" means it works end to end in headless Edge at 390 × 844, light and dark, with synthetic clips (`validation/results/ui/integrated`: 94 screenshots, 0 console errors, 0 flow failures). **None of it has run on a real phone.**

| Area | Status | Detail |
|---|---|---|
| Onboarding (9 steps, 18+ check, first-run redirect) | Functional | Under-18 answer stores nothing |
| Sample session | Functional | Built from real engine output on synthetic clips (`scripts/build-demo.mjs`) |
| Import a video | Functional | Probe summary, slow-motion question, size and length limits. No duplicate-import check |
| In-app recording (web) | **Prototype** | `getUserMedia` video-only, `MediaRecorder` in 1 s chunks held **in memory** (a crash loses the clip), 20-minute auto-stop. Frame rate, exposure, focus and lens cannot be locked. Tested only with a synthetic camera source (delivers about 32 fps) and on a desktop without sensors |
| Live framing checks (level, headroom 4.3/4.5 m, size, light) | Prototype | Side view only; tilt sign convention on iOS unverified; practice-toss ball check, flicker detection and storage check not built |
| Processing, cancel | Functional | Resume re-runs from the start |
| Session report, Serve detail (overlays, phases, compare, ghost), Tagging | Functional | |
| Focus, drill player, practice log, experiment loop, "Did it work?" | Functional | Integrated flow C: check-in → drill → two logs → re-test → verdict "Clearly better" (toss height spread ≈ 27.5 cm → ≈ 8.5 cm, 14 and 16 serves; synthetic) |
| Progress, Sessions, Metric info, How we measure | Functional | |
| Profile: your serve, comfort and body check, coach focus, appearance, about and licences | Functional | Full licence texts still need to ship with a release build |
| Coach share | Functional as export | One-page HTML or JSON through the share sheet or a download; no hosted link, no coach account |
| Storage and privacy: retention (keep, 7/30/90 days, delete after analysis), per-serve/session/all deletion, JSON and CSV export | Functional | Auto-delete runs only when the app is opened |
| Plan / paywall | **Prototype only** | Takes no payment. "Test Plus" writes a local flag; "Restore purchases" says there is nothing to restore; the free allowance is shown for information and not enforced (beta unlocks everything). Reachable only from Profile: the T1 "after the first Did it work?" trigger is **not wired** |
| Match log (M6) | Not built | Data model and deletion exist; no entry screen |
| Usage counts / instrumentation | Not built | The local `events` table exists but nothing writes to it, so activation and loop completion cannot yet be measured |
| Validation (annotation) mode | Not built at `b576aaa`; **in progress this round** | At `b576aaa` a hidden toggle in About did nothing. The "Check this serve" module (marks, blinded comparison, radar entry, pooled evaluation) is being built in `app/src/validation/annotation` |
| Rear-view capture, four-corner court tap, suggested outcome tags | Not built | Rear footage can be imported; outcomes stay player-entered |
| Notifications, reminders | Not built | Web push would need a server (D8); native local notifications come with the iOS shell |
| Installable offline PWA | Not built | No web app manifest or service worker (`vite-plugin-pwa` is installed but not configured); `navigator.storage.persist()` is never requested |
| Accounts, sync, backup | Not built (by decision, D8) | |
| iOS app | Scaffold only | `app/ios` generated on Windows; not built, signed or run. See [IOS_ROUTE.md](IOS_ROUTE.md) |

## 8. Test evidence

- Unit and component tests: 957 in the suite at `b576aaa`. The run during this round: 955 passed, 2 failed while other owners were editing in parallel (a timeout in `ball/speed.test.ts` under load and a catalogue drift check); both pass when re-run alone.
- `npm run build` (typecheck plus Vite build) passed early in this round. A later typecheck failed only in another owner's in-progress annotation file; the integrator's commit is the reference.
- Engine validation: `validation/results/metrics/SUMMARY.md` (122 clips, three variants), `validation/results/smoke/SUMMARY.md` (65 clips, privacy probe).
- End-to-end flows: `validation/results/ui/integrated/report.json` (flows A, B and C in light and dark).
