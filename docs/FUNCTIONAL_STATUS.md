# Functional status

**As of 28 September 2026, the closure-round commit after `07e31a7`** (all 92 adversarial-review findings audited and closed, integrated and re-checked together: [REVIEW_CLOSURE.md](REVIEW_CLOSURE.md); engine, method and pipeline 1.1.1, coaching 1.1.1). This page lists what works in the build today, the honesty label the engine gives each number, what uses an external service (nothing), and what is experimental, prototype-only or not built.

It is derived from:
- the engine's own tables, `app/src/analysis/metrics/catalogue.ts` and `validation-summary.json`;
- the per-metric `validationState` in `docs/specs/metrics.json`;
- the latest results in `validation/results/{metrics,e2e-final,ui}`.

The full accuracy report is [VALIDATION.md](VALIDATION.md).

> **Read this first.** Every accuracy figure below comes from **synthetic video**: 122 rendered clips (129 serves) with exact ground truth offline, and 8 clips (45 serves) through the production build end to end. No real footage, real phone or radar has been used yet. "Passed" means "passed on clean renders", not "accurate on your serve". See [LIMITATIONS.md](LIMITATIONS.md).

> **Re-derive this page** from `catalogue.ts`, `metrics.json` and the latest results after each integration commit.

## 1. How the labels are set

| Label | What it means in this build | How a metric gets there |
|---|---|---|
| **Measured** | Validated against a reference on real footage | **Nothing reaches it.** It needs level V2 or higher, which needs the real-footage study (METRICS §1.3). |
| **Estimated** (shown as ≈) | Passed its synthetic test (level V1) for daylight | Status = the lower of the metric's target and its validation ceiling. V1 caps at `estimated`. |
| **Player-entered** ("You logged") | Typed or tapped by the player | Outcome tags, tallies, intended serve type and target, match logs, radar readings. |
| **Experimental** | Level V0 (failed, inconclusive or not yet scored), or a per-serve cap applies | Hidden unless the player turns on "Experimental metrics" in Profile. Never picks the focus, starts or interrupts an experiment or gives a verdict, even with the toggle on; with it on, an experimental check can be listed under "Also noticed", marked experimental (DECISIONS D2, COACHING §5.1). **Exception: capture quality** is always shown, labelled "Automatic check, experimental" (DECISIONS D2 addendum). |
| **Unavailable** | Cannot be measured from this footage | Always shows the reason and an unlock hint (for example "Add a phone behind you to see this"). Spin is always unavailable. |

**Per-serve caps** that lower an `estimated` value to `experimental` or withhold it (`metrics/perServe.ts`, `status.ts`):
- **Camera too close.** Closer than 6 m to the server: heights read 4–7% low at 5 m on the corpus.
- **30 fps rhythm.** Release timing error is about 80 ms at 30 fps.
- **Unknown phone tilt** (`PITCH_UNKNOWN`). Absolute heights and positions drop to experimental; **spreads keep their status** (METRICS §1.1 item 3). Imports carry no tilt reading.
  - The Import screen asks side-view imports "How was the phone mounted?" (METRICS §1.1.3a). "Level mount" is taken as level within ±2°, "Roughly level" within ±4°.
  - The engine widens each serve's height range by that allowance and keeps contact height at `estimated` only while √(p95² + (1.96σ)²) stays within 5% of height (`ASSUMED_LEVEL_HEIGHT_BUDGET`, p95 0.039: the larger of the app-pipeline and method-only results); otherwise it drops to experimental. Toss height is experimental whatever the mount (V0 since 28 September). A standing-body roll check over 3° also drops them.
  - "Tilted, or not sure" (the default) and all rear-view imports keep heights experimental. The hint now says to record in the app (which reads the tilt) or answer the mount question.
- **Contact signals disagree** (DECISIONS D2 addendum, METRICS §2.4.5). The ball, the hit sound (when on) and a swing peak found on its own are compared; a disagreement beyond 3 combined σ caps every contact-dependent value at experimental (a majority agrees, or the ball was seen leaving) or withholds it, with `CONTACT_NOT_FOUND`. Fired on 2 of 129 corpus serves (dusk), on 0 of 45 production-build serves.
- **Night lights, flicker or unknown light.** Every metric stays V0 until the night cells are validated. A clip with no light answer is class `unknown` (nothing validated). The pipeline also reads the light from the serve scan (`quality/light.ts`): mains flicker ≥ 3% makes the class `flicker` (launch speed blocked, `FLICKER`), and a near-black sky over a lit court turns a daylight answer into court lights, with a warning. Pixels never raise the class. Renders only: 5 of 5 flickering night renders caught, 0 false alarms on 119 others (VALIDATION §3.6).
- **Per-serve scale** (E1). The time base is a clip property; a serve whose toss falls more than 10% off the other serves' is flagged (`SCALE_INCONSISTENT` on its body-scaled values), never rescaled, and a serve with too few standing frames takes its standing height from serves at the same distance.

## 2. Analysis pipeline (all on the device)

| Stage | Status | Evidence (synthetic) |
|---|---|---|
| Probe, time base, slow-motion check (gravity fit of the toss) | Functional | 65 smoke clips: fitted time scale within 1% of truth at the set medians (worst clip 7%). It recovered 240 fps slow motion saved as 30 fps (factor 0.125, interval 0.117–0.132) |
| Serve finding (Pass A: 4 Hz pose scan, 15 Hz fill) and counting | Functional | Offline (full-rate poses, 122 clips): every serve counted. **Production build end to end: 45 of 45 true serves counted, 0 false serves** (session 8 of 8, check-in 16 of 16, re-test 16 of 16, five single-serve clips 1 of 1), no pre-serve dribble counted. Before the 28 September fixes it was 24 of 27. A caught toss is never counted: counting needs contact evidence (closure round; tests cover a ball lost 0.1 to 0.2 s before the hand). Re-toss, caught-toss, shadow-swing and miss behaviour is unit-tested only. Any serve left out stays in the list as "Excluded from your stats", with "Include again" |
| Pose (MediaPipe Pose Landmarker **full**, bundled WebAssembly, in a worker; two workers in Pass B on 8-thread devices) | Functional | Median error 2.7–3.6% of body height per smoke set (12 core joints). Model loading retries after a network failure (VALIDATION §6) |
| Left/right mix-up fix (`serve/relabel.ts`) | Functional | Mirrored side-view frames: 37% before, 0% after (worst 10% of clips still 11%) |
| Ball detection and toss tracking (2 workers) | Functional | Toss recall 98–100% across sets; apex timing error under 1 ms at 60 fps. The toss search band now reaches 0.45 statures towards the court and always covers the contact column |
| Event timing: release, apex, lowest hip, contact, landing | Functional; lowest hip and landing loose | Offline, mean error at 60 fps (105 clips): release 13 ms, apex 0.7 ms, contact 2.3 ms (1.1 ms with hit sound), lowest hip 86 ms, landing 66 ms. **Production build: contact mean absolute error 0.1 to 0.8 ms per clip** (was 270 ms early on 2 clips before the fix); landing 145–176 ms late on the single-serve clips; lowest hip 28–124 ms off |
| Fused-event check (D2 addendum) | Functional | See §1. Unit tests reproduce the old failure and every resolution |
| Session direction and view check (`netDirVote`, `sessionEvidence`) | Functional | One vote per counted serve, from its own outgoing ball and landing step. Needs ≥ 3 serves with evidence and ≥ 70% contradicting (or every serve in a shorter clip). Corpus replay (244 runs): no metric changed; front-45 clips still raise `VIEW_MISMATCH` 5 of 5; a wrong camera-side entry was corrected on 116 of 116 side clips |
| Phone-tilt correction from motion sensors | Functional in code | Synthetic tilt only. Sensor sign convention and accuracy on real iPhones **unverified**; the in-app sensor path has not been run end to end |
| Set-up key (orientation, distance class, serving spot) | Functional | Trends, usual ranges, re-tests and coaching strata only compare sessions from one set-up (`metrics/setup.ts`) |
| Hit-sound contact timing (opt-in, imports only) | Functional | Racquet pop labelled contact on 129 of 129 clips; footsteps never. Only timestamps are kept |
| Sound removed before a video is kept (`data/stripAudio.ts`) | Functional | Audio boxes and samples zeroed in place, no re-encode. Fragmented MP4 is refused and no copy is kept |
| Capture-quality checks | Functional, **experimental label** | Emitted every session as `experimental` (`VALIDATION_PENDING`, V0), basis "Automatic check, experimental (tested on simulated footage only)"; always shown. The view check flagged 5 of 5 front-45 clips; the tilt check refused 5 of 5 tilted 4 m clips |
| Key frames (480 px thumbnails, 720 px evidence crops) | Functional | Sample build: 97 key frames for 8 serves, 193 for 16 |
| Coaching decision after analysis (`decideFocus`) | Functional | Stored for every analysed session in the integrated flows |
| Resume after interruption | **Not built** | A resumed job re-runs from the start; nothing is half-saved. An in-app recording interrupted by a crash is kept and offered on the next launch (§7) |

**Processing time**, production build in headless Edge on a shared Intel Core Ultra 5 laptop, not a phone (`validation/results/e2e-final/SUMMARY.md`, closure integration run on engine 1.1.1, nothing else running):

| Clip | Time |
|---|---|
| 1 serve | 12.4 to 18.4 s (five single-serve clips, 60 and 240 fps, 5 to 12 m) |
| 8 serves (73.5 s clip) | 77.4 s |
| 16 serves (134.5 s clip, 1080 × 1920, 60 fps) | 147.3 to 148.0 s. The 90 s target is **missed**: the serve scan and the full-rate pass are bound by pose inference on this laptop |

**No iPhone timing exists yet.**

## 3. Metrics: what the engine emits today

"State" is the `validationState` in metrics.json. Status is for the D1 side-view set-up: portrait at 7–8 m or landscape at the fence, 60 fps, daylight, tilt known. The "D1 result" column comes from 11 clips at those distances (offline); "End to end" from the production build (8 clips, 45 serves; heights there were imported with no mount answer, so they are experimental).

**Counts across all 37 metric ids:**

| State | Count |
|---|---|
| Passed | 4 |
| Passed on limited evidence | 6 |
| Failed | 8 |
| Inconclusive (includes capture quality) | 3 |
| Not scored yet | 8 |
| Nothing to validate (player-entered or spin) | 8 |

### 3.1 Estimated in daylight (V1)

| Metric | Player name | State | D1 result against threshold | End to end (production build) | Notes |
|---|---|---|---|---|---|
| `toss-drop` | Ball drop before contact | pass | MAE 0.5 cm (≤ 5 cm) | 0.2 to 0.3 cm per clip | Contact-dependent (D2 rule) |
| `contact-height-ratio` | Contact height | pass | MAE 0.007, p95 0.020 (≤ 0.025 / 0.05; D2 addendum threshold 2.5%) | 0.005 to 0.043 × height per clip (experimental there) | |
| `rhythm-release-to-contact` | Toss-to-hit time | pass | MAE 11 ms (≤ 21.7 ms at 60 fps) | 0.3 to 11.0 ms per clip | Capped to experimental at 30 fps |
| `loading-depth` | Hip drop | pass | MAE 0.4% of height (≤ 2%) | 0.04 to 0.99% of height per clip | Descriptive only; never a "bend more" instruction (D5) |
| `serve-count` | Serves | pass, limited | 0 wrong of 11 offline (precision and recall ≥ 99% needed) | 45 of 45 true serves counted, 0 false serves | Re-toss, shadow-swing and miss clips are not rendered, so serve classification is unit-tested. Stays "estimated" until the player confirms the serve strip |
| `leg-drive` | Leg drive (hip rise) | pass, limited | MAE 2.5% of height: **fails** at D1 (≤ 2%); passes on all day clips (1.9%) | 1.45 to 3.12% of height per clip (reads low, as offline) | MediaPipe's hip reads about 2% low, a persistent bias that cancels in the player's own comparisons. Shown as a player-relative band |
| `toss-height-spread`, `toss-forward-spread`, `contact-height-spread`, `rhythm-spread` | Consistency (hero metrics) | pass, limited | One 8-serve clip: errors +0.8 cm, −2.2 cm, −1.9 cm, −5 ms | The sample's "Did it work?": toss height spread about 25 cm (26 cm, 95% interval 19 to 40) → about 9.5 cm (7 to 15), 16 and 16 serves, "Clearly better" | **Thinnest evidence of any estimated metric**. Needs enough serves per stratum, otherwise `TOO_FEW_SERVES`. An early read shows its interval in the headline ("early read, likely 20 to 45 cm") |

### 3.2 Experimental (hidden unless the toggle is on)

| Metric | State | Why |
|---|---|---|
| `toss-apex-height` (absolute; its spread and each toss against the middle one stay Estimate) | fail (method-only gate) | Through the app pipeline it passes at D1 (median 0.011 × height, p95 0.027), but with truth landmarks it fails (median 0.041, p95 0.056 against 0.025 / 0.05): the pass rests on MediaPipe's ~3% high head reading cancelling the depth prior. Experimental (`VALIDATION_PENDING`) until a real-footage check (VALIDATION §3.2) |
| `toss-forward`, `contact-forward` | fail | MAE 6.7 and 6.6 cm against 5 and 6 cm. MediaPipe's foot point sits about 2% of height behind the toe |
| `drive-time` | fail | The hip minimum is flat: MAE 64–75 ms against 50 ms |
| `landing-distance` | fail | p95 24 cm against 15 cm at D1; landing 145–176 ms late end to end |
| `shoulder-tilt-trophy` (band only, never degrees) | fail | p95 5.3° against ±4° |
| `trophy-pause` | fail | MAE 65–100 ms against 60 ms |
| `speed-experimental` (side, range only) | fail | Shown on **0 of 129** serves in the metric run (ranges about 45% wide, over the 35% display limit, or frame rate too low). Almost always unavailable in practice |
| `deep-bend-flag`, `knee-bend-band` (rear) | inconclusive | The corpus cannot test the failure that matters yet |
| `capture-quality` | inconclusive | Always shown (the one exception), labelled "Automatic check, experimental" |
| `retoss-count`, `toss-lateral`, `toss-lateral-spread`, `shoulder-over-shoulder-contact`, `repeatability`, `fatigue-flag`, `load-flag` | not scored | No renders or no truth yet. Rear-view metrics are never shown on side-view reports (D1) |

### 3.3 Player-entered

- **Outcome metrics** from per-serve tags or a session tally: `serve-in-rate`, `first-serve-in-rate`, `second-serve-in-rate`, `double-faults`, `placement-zone` (target) and `serve-type-mix`.
- **Rates** show counts below 10 serves and a Wilson interval from 10.
- **Match log** (comp nights): service games, double faults and, optionally, first serves in and hit. Progress shows double faults per service game and the first-serve rate with its Wilson interval, labelled "You logged", never pooled with practice and never used for a verdict.
- **Radar speed** (`speed-radar-entered`): a reading typed in "Check this serve" fills that serve's "Radar speed (you logged)" row in Serve detail, with its source, device and the unit originally entered, and the session report's "Radar speed (you logged)" tile (U2), labelled "You logged", with its source ("Pocket Radar, peak") and the serve it came from. The engine's session-level value stays "not entered": the reading lives with the check.

### 3.4 Unavailable

- `spin`: always, with the reason (D4).
- `speed-average-rear`: needs the four-corner court tap, which is not built.
- Anything from the wrong view: `NEEDS_SIDE_VIEW` or `NEEDS_REAR_VIEW`.
- Never computed at all (D5): racquet drop, external rotation, pronation, racquet-head speed, precise joint angles, a composite "serve score".

## 4. Statistics (pure functions in `app/src/analysis/stats` and the UI insight modules)

| Statistic | Status |
|---|---|
| Wilson intervals on every rate; "X of N measured" | Functional. The focus card and "Why this focus?" use the report's wording ("16 of 16 serves measured", plus "· this uses N" when a value used fewer) |
| Noise-corrected spreads with 95% intervals; "early read" when provisional | Functional. Headlines state an early read's interval, and a multi-side session names the headline group's serve count |
| One display-precision rule for every number (`metrics/precision.ts`, METRICS §4.9) and one headline sentence (`metrics/headline.ts`) | Functional |
| Matched comparisons (same set-up, view, camera side, serve side, 1st/2nd, type, hand) | Functional |
| "Did it work?" verdicts in words (METRICS §4.5: shrinkage, Pocock bounds, "about N more serves to confirm") | Functional. "At the limit of what we can measure" reaches coaching as "not comparable", with that reason |
| Re-test linking | Functional. On a later visit only its first recording in the stratum is the re-test; later recordings that day are "straight after practice" and never get a verdict. In a two-block recording only Block A counts (split at a 5-minute pause, or the first 15 serves) |
| Ins-and-misses contrast (Welch per metric, Holm across 7, smallest worthwhile change, replication) | Functional. Needs 10 serves in each group, so rarely shown on small sessions |
| Trends, personal "usual" range, player-relative bands | Functional; the usual range needs 2+ matched sessions |
| Fatigue and load flags | Functional in code; experimental label |
| Real-footage agreement statistics (Bland–Altman, MAE with a player-cluster bootstrap, ICC(2,1), interval coverage, inter-annotator agreement) | Functional in code (`app/src/validation/annotation`, `tools/validate/annotation-eval.ts`), now including leg drive, loading depth, drive time and the shoulder line; **never run on real data** |

## 5. Coaching engine (`app/src/coaching`)

**Functional:**
- pain safety gate and referral cards (COACHING §10). The newest practice log marked sore or "It hurts", from any drill, holds every drill's harder version until goal-met logs after it; "It hurts" today holds the day (closure round, finding 0). A referral answered this session pauses coaching everywhere at once (Today, Focus, Record's re-test pin, Compare's next step, Plus offers), even when the player does not save it; "It's settled" on Today runs the body check;
- one focus per session, in the D6 priority order, never picked by experimental data (finding 44);
- a cue by level: an analogy for UTR 1–3, an outcome cue for UTR 4–7;
- a drill with progressions, and the practice log;
- experiments with matched re-tests (one re-test per later visit, §4);
- "Why this focus?", "My coach's focus" pinning, and the match-day card. A coaching rule that is itself experimental (rhythm) says so on the focus card.

**Blockers and caveats:**
- **The referral copy has not had clinician review, which is a release blocker** (COACHING §10).
- The healthdirect number in the copy is marked "verify before release".
- Blocks are numbered per recording (schema v3, C1): a second recording on the same visit is its own block. A single recording holding both blocks still relies on the pause or the 15-serve cap.
- The keep-going card ("Nothing clear to change") does not show load notes, so a player back from a break with that decision sees neither "Welcome back" nor the ramp note.

## 6. External services

**None at runtime.** Integrated flows on the production build: 0 requests to any other host from the page, its workers or the service worker.

| Item | At runtime | Notes |
|---|---|---|
| Analysis (pose, ball, metrics, statistics, coaching) | **None.** Runs in the browser, or in WKWebView on the phone | |
| MediaPipe pose model and WebAssembly runtime | Bundled with the app, served from its own origin, stored by the service worker at install | Downloaded once at development time (`docs/MODELS.md`) |
| MediaPipe usage telemetry (`odml.pa.googleapis.com`) | **Blocked** | CSP `connect-src 'self' blob: data:` plus a fetch guard in the pose worker |
| Service worker | Own origin only | Never answers for or fetches another origin (`platform/sw/routes.test.ts`); not registered in the Capacitor shell |
| Fonts, icons, maps, CDNs | None | Archivo is bundled through `@fontsource-variable` |
| Analytics, crash reporting, ads, attribution | None | No SDKs. Beta usage counts stay on the phone (§7) |
| Accounts, sync, backup | None | Not built (D8) |
| Validation exports ("Check this serve") and the beta report | None | JSON files the person shares themselves. No video, images, names (initials only), ids or pain notes |
| Cloud AI coaching phrasing | **Not built** | Optional future feature: off by default and consent-gated (D9, App Store 5.1.2(i), ARCHITECTURE §10) |
| Payments | None | The Plan screen takes no payment (§7) |

**Development time only:**
- `npm install` (npm registry);
- the synthetic corpus generator (local headless Edge and ffmpeg);
- `npx cap doctor` (checks the npm registry for the latest Capacitor);
- on a Mac, the Swift Package Manager fetch of `capacitor-swift-pm` from GitHub.

## 7. App features: functional, prototype-only, not built

"Functional" means it works end to end in headless Edge at 390 × 844, light and dark, with synthetic clips, on the production build. The integrated flows (A: first run and the sample; B: an import with "When was it filmed?", tagging, "Check this serve" with hip, shoulder and radar marks, and the report's radar row; C: the player's own loop to "Did it work?" with the T1 card and its Plus preview; D: offline, the T2 preview, the morning-after card, match log and Profile's Match log row, the T3 previews over the open season view and ghost overlay, and the beta report) produced 178 screenshots over 74 steps in light and dark, with 0 failed steps, 0 console errors, 0 horizontal overflow, 0 unlabelled metrics (774 number elements checked across the screenshots) and 0 requests to any other host (`validation/results/ui/integrated/report.json`, closure round). In both schemes the imports counted 1 of 1 (baseline-s1), 16 of 16 (check-in) and 16 of 16 (re-test); every import was dated from the file's last change (27 September), and flow C moved the re-test to today in the date field, so the check-in and re-test are separate visits without touching the database; the own loop ended "Clearly better" (toss height spread 26 cm → 9.9 cm); T2 and both T3 previews appeared with the features open; the price answers (T2 yes, T3 no and maybe) reached the exported beta report, which held no ids or free text; Today, a report and Beta data reloaded offline from the service worker (167 cached entries). **None of it has run on a real phone.**

| Area | Status | Detail |
|---|---|---|
| Onboarding (18+ check, first-run redirect) | Functional | An under-18 answer stores nothing |
| Sample session | Functional | Built from real engine output on synthetic clips (`scripts/build-demo.mjs`), rebuilt by engine 1.1.1 in the closure round: 8 of 8, 16 of 16 and 16 of 16 serves counted, capture quality experimental, absolute toss height experimental (its spread Estimate), "Did it work?" "Clearly better". `sessions/seedCatalogue.test.ts` fails if any stored status or level is above what the catalogue allows. The Welcome strip is capped the same way (toss offsets from the middle toss, never metres) |
| Import a video | Functional | Probe summary, slow-motion question, mount question for side views with a "next time" hint for "Tilted, or not sure", optional serving spot, size and length limits, sound removed before keeping, and a light question (daylight or court lights) that must be answered. No duplicate-import check. **An import is dated by when it was filmed** (E2, 28 September): the recording time from the container (QuickTime creation date, the ©day atom, an mdta creation time, or the mvhd creation time), else the file's last change (not a copy made in the last 5 minutes), else the import; the "When was it filmed?" date field shows it and the player can change the day. Unit-tested with built containers; not yet tried on real iPhone or Android files |
| In-app recording (web) | **Prototype** | `getUserMedia` video only. Each 1 s chunk is written to IndexedDB as it arrives (a one-second key frame is requested so Chromium hands data over every second); after a crash the next launch offers "Analyse recording", "Not now" or "Delete recording". 20-minute auto-stop. Frame rate, exposure, focus and lens cannot be locked. Tested only with a synthetic camera (about 32 fps) in Edge; Safari's chunking after a crash is unverified |
| Live framing checks (level, headroom 4.3/4.5 m, size, light) | Prototype | Side view only; tilt sign on iOS unverified. Practice-toss ball check, live flicker detection and storage check not built (after recording, the analysis measures flicker and a dark sky on the serve scan) |
| Processing, cancel | Functional | Resume re-runs from the start |
| Session report; Serve detail (overlays, phases, compare, ghost, frame scrubber); Tagging | Functional | A video that is recorded as kept but will not load says "This video can't be found on this phone. Phases and values are below." Overlays show only over a video or key frames |
| **Check this serve** (annotation mode) | Functional | From Serve detail → More actions, or from an unusual value. The person marks standing height, release (with the hip centre), peak, the trophy (both shoulders), lowest hip, contact (ball and hip centre), landing and an optional radar reading, with the app's answers hidden until the marks are saved. "App vs you" compares toss height, contact height, toss drop, rhythm, toss and contact forward, landing distance, leg drive, loading depth and drive time; the shoulder line is in words only, and the trophy and lowest-hip frames have no target. Exports `serve-coach-validation@1` JSON (with the engine's unrounded leg values) for `tools/validate/annotation-eval.ts`. **Not yet used on a real clip** |
| Focus, drill player, practice log, experiment loop, "Did it work?" | Functional | Integrated flow C: check-in → drill → two logs → re-test → verdict, the same text on the report card, Compare and Progress |
| Progress, Sessions, Metric info (with "How sure are we?") | Functional | Progress has a separate "Comp nights" section |
| Match log (M6) | Functional | `/sessions/matches/new` from Progress: date, competition, service games, double faults, optional first serves in and hit (checked), the cue question during an experiment, a 140-character note that stays on the phone (stripped from exports). Unsaved changes ask before leaving; delete has Undo. Also reached from Profile → Match log ("1 comp night logged") and from Today's morning-after card, the day after one of the player's comp nights: "How did it go?" with "Log the match" (opens the log dated that night) and "Not now"; never for sample data or during a pain pause, gone once that night is logged (U3) |
| How we measure (with the synthetic validation results) | Functional | Says on screen that real players, phones, court lights and radar speed are not tested yet |
| Profile: your serve, comfort and body check, coach focus, appearance, about and licences | Functional | Full licence texts still need to ship with a release build |
| Coach share | Functional as export | One-page HTML or JSON through the share sheet or a download; no hosted link, no coach account |
| Storage and privacy | Functional | Retention (keep, 7/30/90 days, delete after analysis), deletion of a serve, a session or everything (including usage counts, unfinished recordings and cached sample files), JSON and CSV export, the browser's storage allowance, and "Ask to protect". "Delete everything" also stops and forgets any analysis still running, resets the Record flow and Today's dismissed cards (finding 18). The app asks the browser to keep its data when the first real session is handed to analysis, with one line saying why. Auto-delete runs only when the app is opened |
| Installable offline app (PWA) | Functional (Edge) | Manifest ("Serve Coach", standalone, en-AU, icons including maskable and a 180 px apple-touch-icon); hand-written service worker storing the app shell, both pose models and one wasm build (about 29.7 MB, 166 entries) at install, sample files on first use. Reloads offline; a clip analyses offline. A new version waits for "Reload". Not registered in the Capacitor shell. Home Screen install on iOS or Android not tested |
| Beta data (local usage counts) | Functional | Profile → Beta data: bucketed events only (no free text, ids, heights or body answers), the beta gates in words (activation, loop completion, active weeks, usefulness), "Export report" as JSON the tester chooses to send, "Clear usage counts". The Plus preview's price answers are kept as `plus_wtp_answered` (moment, answer, price). The usefulness question (1 to 5, skippable) appears once per experiment on "Did it work?". No upload |
| Plan / paywall | **Prototype only** | **Takes no payment.** **Everything is unlocked for beta testers** (product decision, 28 September; PRODUCT §5.3). The moments show a non-blocking "Plus preview" instead of an offer: "Beta: this is unlocked for you", what Plus will include, the proposed price (A$99.99 a year or A$14.99 a month) and one question, "Would you pay A$99.99 a year for this?" (Yes / Maybe / No, stored as `plus_wtp_answered`), then Continue. T1: a card below the first "Did it work?" verdict, once, with "What Plus adds". T2: past 2 analysed days a month after the free first loop, Processing shows a notice and the preview (every session is still analysed). T3: the ghost overlay or the season view opens and the preview appears over it, at most once a feature a day. Never for sample data, during a pain pause, for Plus players, or more than once a day outside T3. The Plan screen keeps "Test Plus" and a "Test the after-beta limits" switch that brings back the free plan's locks and the T3 offer on that phone |
| Season view (Plus) | Functional behind "Test Plus" | Practice (matched toss height spread) and comp nights as two rows on one week axis, never one combined series |
| Rear-view capture, four-corner court tap, suggested outcome tags | Not built | Rear footage can be imported; outcomes stay player-entered |
| Notifications, reminders | Not built | Web push would need a server (D8); native local notifications come with the iOS shell |
| Accounts, sync, backup | Not built (by decision, D8) | |
| iOS app | Scaffold only | `app/ios` was generated on Windows and has never been built, signed or run. `CI=1 npx cap sync ios` succeeds at this commit. See [IOS_ROUTE.md](IOS_ROUTE.md) |

## 8. Test evidence

- **Unit and component tests at this commit: 1,500 in 158 files, all passing** (1,332 at the final-round commit, 1,091 at the hardening commit). This includes the number-consistency tests that render screens from the engine-built sample seed (`ui/format/consistency.demo.test.tsx`, `sessions/honesty.seed.test.tsx`) and `sessions/seedCatalogue.test.ts`, which fails if any stored status or level in the seed is above what the catalogue allows, and a seed test that checks it was built by the current engine, pipeline and coaching versions.
- **Typecheck, lint (oxlint, deny warnings), `npm run build` and `CI=1 npx cap sync ios`: clean.**
- **Engine validation:**
  - `validation/results/metrics/SUMMARY.md`: 122 clips, three variants;
  - `validation/results/e2e-final/SUMMARY.md`: the production build end to end, 8 clips, 45 serves;
  - [VALIDATION.md](VALIDATION.md): the report that ties them together.
- **End-to-end flows:** `validation/results/ui/integrated/report.json` (flows A–D in light and dark).
- **Owner checks this round:** `validation/results/ui/closure-{engine,coaching-data,ui-copy}/` (final round: `final-*`). Where every review finding ended up: [REVIEW_CLOSURE.md](REVIEW_CLOSURE.md).
