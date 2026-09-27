# Limitations

**As of 28 September 2026, the hardening commit after `33ac31f`.** This page lists what Serve Coach cannot do yet, or cannot yet prove. Read it with:
- [FUNCTIONAL_STATUS.md](FUNCTIONAL_STATUS.md): what works;
- [VALIDATION.md](VALIDATION.md): the accuracy evidence;
- [NEXT_STEPS.md](NEXT_STEPS.md): how each gap closes.

## 1. Validation is synthetic only

- **Every accuracy figure comes from rendered video.** The corpus is 124 synthetic clips of a stylised 3D player with exact ground truth (`validation/synthetic`, `tools/synth`). The founder did not allow downloading real footage, so **no real serve has been analysed** and no real-footage level (V2 or V3) exists (METRICS §5.6, item 8 of §6).
- **No metric is "measured".** The best label a serve metric can reach today is `estimated` (≈), meaning it passed a synthetic test (FUNCTIONAL_STATUS §1).
- **Renders are kinder than courts.** Clean backgrounds, one player, perfect lighting models and a known camera. Real courts add fences, other players, wind, sun glare, cheap LED flicker and phone processing (HDR, stabilisation, compression) that the corpus only approximates.
- **Calibration may be optimistic.** Engine corrections (release +12.5 ms, contact bias terms, pause thresholds) were tuned on seeds 1–3; seeds 4–5 were **not held out** as a separate test (engine-core report).
- **Consistency spreads rest on the thinnest evidence**: one 8-serve clip plus per-serve error analysis. The 20-serve variability clips are not rendered (validation SUMMARY).
- **Nothing is validated under court lights.** Every metric is V0 in the night and flicker condition classes; the corpus has night renders at 240 fps only. The launch segment plays night comp (D11), so their comp-night recordings show at most "experimental".
- **Serve counting falls short end to end.**
  - The app's scan finds every serve on the synthetic multi-serve clips, but the engine leaves some uncounted when the ball track is weak: 24 of 27 serves counted (89%) against the 99% target; 40 of 43 (93%) with the 16-serve re-test clip, unchanged at integration.
  - Serve classification is only unit-tested: no re-toss, shadow-swing, miss or dribble clips have been rendered.
- **Contact can be placed early in the full app pipeline.** On 2 of 5 single-serve synthetic clips, contact came about 0.27 s early and the serve's toss drop, toss-to-hit time and leg drive were wrong but still labelled estimates (VALIDATION §3.3). The offline engine gets the same clips right.
- **Recreational reference ranges are thin**: two recreational women and no recreational men in the literature for toss heights and spreads (CAPTURE §14; gap study on reference ranges). Bands are therefore player-relative first.
- **Known biases carried into real use:**
  - toss height reads about 8–12 cm high when the toss is 0.3 m nearer the camera than the body (D1);
  - MediaPipe's hip point reads leg drive about 2% of height low (persistent, so it cancels in the player's own comparisons);
  - MediaPipe's foot point sits about 2% of height behind the toe, so forward positions read about 5–7 cm long (mean error 5.4 cm on all day clips, 6.7 cm at the D1 distances; experimental).
- **Speed is effectively never shown.** Its prerequisites (≥ 120 fps, clean post-contact detections, known scale, target tag) held on almost no clips, and the ranges that were produced were about 90 km/h wide. **No radar comparison has been made.** Spin is always unavailable (D4).
- **Coaching evidence is weaker than coaching folklore.** External-focus cue benefits may be near zero after bias correction (research 04 [S38][S39]); video feedback added nothing over coaching for intermediate servers in the one older RCT (research 04 [S57]); good and faulted serves can have near-identical toss values (research 03 [S23]), so the "ins versus misses" insight may often be null (research 10 §9 risk 4).

## 2. No real phone has run it

- **No iPhone timing, memory, battery or heat figures exist.** Every processing time is from headless Edge on a laptop: 25–35 ms of pose inference per frame, 77–83 s for 8 serves, and 147–155 s for a 16-serve import (this round's 90 s target for that clip was missed). ARCHITECTURE §5.11 *assumed* 25 ms per frame on an iPhone 15-class device to reach its 90 s budget; that assumption is untested.
- **Sensor behaviour is unverified:** the tilt sign convention on iOS, pitch accuracy against a spirit level (including camera-to-sensor misalignment), and the iOS motion-permission flow in Safari (CAPTURE §9.12, §13.2).
- **Capture behaviour is unverified:** the frame rate `getUserMedia` actually delivers, whether portrait frames arrive upright, what `MediaRecorder` writes (container, rotation, timestamps), the screen wake lock in a home-screen app, and whether the iOS photo picker transcodes imports.
- **The iOS app has never been built.** `app/ios` was generated on Windows; nothing is signed, compiled or installed ([IOS_ROUTE.md](IOS_ROUTE.md)).

## 3. Web prototype limits

| Area | Limit | Consequence |
|---|---|---|
| **WebCodecs** | Frame-accurate decode needs `VideoDecoder` (full support from Safari 26) and `AudioDecoder` (Safari 26) (research 05 §9.7). HEVC support varies by configuration (ARCHITECTURE §15.1) | Older iOS falls back to slow media-element decode; some iPhone HEVC files may fail until the native reader exists |
| **WKWebView** (Capacitor shell) | Unpublished WebContent memory limit; origin quota about 15% of disk; service workers need App-Bound Domains; open-ended byte ranges read whole files into memory (ARCHITECTURE §15.1) | Long clips can be killed; videos must move to native files; ranges must stay bounded |
| **In-app recording (`MediaRecorder`)** | Cannot lock frame rate, exposure, focus or lens; 120/240 fps only through import; chunks are held **in memory**, so a crash loses the clip; 20-minute cap | Blur and flicker are detected, not prevented; the synthetic dev camera delivered about 32 fps |
| **Motion sensors** | iOS Safari needs `DeviceMotionEvent.requestPermission()` from a tap; desktops have no sensors | Without tilt, absolute heights drop to experimental (`PITCH_UNKNOWN`). Imports carry no tilt reading; only a "level" mount answer can keep heights estimated (§4) |
| **Performance** | Analysis runs in the page and needs the app open; no resume (a resumed job restarts) | Long sessions take minutes; interruptions cost the whole run |
| **Storage** | IndexedDB only; `navigator.storage.persist()` is never requested; Safari may clear data of a web app that is not added to the Home Screen; there is no web manifest or service worker | History can disappear; the app does not reload offline. Export is the only backup |
| **Retention** | Auto-delete runs only when the app is opened (ARCHITECTURE §17 item 5) | "Delete after 30 days" can run late |
| **Night courts** | Every metric stays at V0 under lights until the night cells are validated; flicker detection is not built | Comp-night recordings are experimental |

## 4. Measurement scope

- **Side view blind spots** (D1): no knee-bend band, no shoulder-over-shoulder at contact, no forward lean at contact. These need the optional view from behind, which can only be imported today; live framing supports the side view only.
- **Experimental and hidden by default:** toss and contact forward position, drive time, landing distance, shoulder tilt band, trophy pause, re-toss count, repeatability, fatigue and load flags, all rear-view bands, and speed (FUNCTIONAL_STATUS §3.2).
- **Never measured** (D5): racket drop, external rotation, pronation, racket-head speed, precise joint angles, grip, swing path. Much of the second-serve fix (grip, path, spin) is invisible from the side (research 10 §3).
- **Outcomes are player-entered** in the side view (D3): in/net/long/wide depends on tagging.
- **Imports have no tilt reading.** The Import screen asks "How was the phone mounted?" for side views (METRICS §1.1.3a).
  - "Level mount" takes the phone as level within ±2°, "Roughly level" within ±4°. The engine widens each serve's range by that allowance and keeps toss and contact height at "estimated" only while the widened worst-case error still meets the threshold; otherwise they drop to experimental (`PITCH_UNKNOWN`).
  - "Tilted, or not sure" (the default) and every rear-view import leave absolute heights experimental.
  - The answer is the player's word: only roll can be cross-checked from the standing body, so a phone tipped up or down on a "level" mount goes unnoticed.
  - Spreads and timing are unaffected.
- **One label is stronger than its evidence.** `capture-quality` is emitted as `measured`, but metrics.json rates its checks V0 (inconclusive). It describes the recording, not the serve; the label still needs to be brought into line.

## 5. Product gaps

- **No accounts, sync or backup** (by decision, D8). Data lives on one device; uninstalling the app, clearing Safari data or losing the phone loses it unless the player exported it.
- **No instrumentation.** The usage-events table is never written, so activation, loop completion and retention cannot be measured yet; D8 also forbids upload (PRODUCT §9.4).
- **Paywall is a prototype.** No payment, no StoreKit, allowance not enforced, and the "after Did it work?" trigger is not wired.
- **The annotation mode has never met a real clip.** "Check this serve" (marks, blinded comparison, radar entry, JSON export) and the pooled evaluation tool landed in `33ac31f`, but they have only been run on synthetic clips. A radar reading is kept with the check as validation data; it does not yet fill the report's "Radar speed (you logged)" row.
- **Not built:**
  - match log entry (M6);
  - the four-corner court tap and rear speed;
  - suggested outcome tags;
  - the practice-toss ball check;
  - notifications and reminders;
  - a duplicate-import check.
- **Coach sharing is export-only**: a one-page HTML or JSON file; no hosted link, no coach account.
- **English (Australia) only.**

## 6. Safety, privacy and legal

- **Clinician review of the body-check, red-flag and referral copy has not happened.** It is a release blocker (COACHING §10). The healthdirect number needs verifying.
- **No legal review yet.** APP-entity status (the health-service question), the privacy policy, terms of use, beta consent form and the public-release age policy all need advice ([LAUNCH_AU.md](LAUNCH_AU.md) §3). The privacy policy and terms are not published.
- **Children's Online Privacy Code** commencement is not set (registration due by 10 December 2026). The closed beta is adults only until that is resolved (research 07 §3; research 10 §7.2).

## 7. Commercial evidence

- **Pricing is untested.** A$99.99 a year comes from comparables, not from Australian comp players (research 08 §2). No Van Westendorp or fake-door data exist yet.
- **Segment size rests on assumptions**: 40,000–60,000 adult comp players nationally and 10,000–20,000 in metro Melbourne, both built on stated assumptions (research 10 §5). How often comp players practise serves alone is unknown (research 10 §9 test 1).
- **No Australian Apple Ads benchmarks** could be verified (research 08 open question 1).
