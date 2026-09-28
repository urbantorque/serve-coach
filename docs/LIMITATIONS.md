# Limitations

**As of 28 September 2026, the final-round commit after `4478e16`** (accuracy fixes, PWA, product gaps and review fixes, integrated and re-checked together). This page lists what Serve Coach cannot do yet, or cannot yet prove. Read it with:
- [FUNCTIONAL_STATUS.md](FUNCTIONAL_STATUS.md): what works;
- [VALIDATION.md](VALIDATION.md): the accuracy evidence;
- [NEXT_STEPS.md](NEXT_STEPS.md): how each gap closes.

## 1. Validation is synthetic only

- **Every accuracy figure comes from rendered video.** The corpus is 124 synthetic clips of a stylised 3D player with exact ground truth (`validation/synthetic`, `tools/synth`). The founder did not allow downloading real footage, so **no real serve has been analysed** and no real-footage level (V2 or V3) exists (METRICS §5.6, item 8 of §6).
- **No metric is "measured".** The best label a serve metric can reach today is `estimated` (≈), meaning it passed a synthetic test (FUNCTIONAL_STATUS §1). Capture quality, the session's data-quality check, carries the `experimental` label ("Automatic check, experimental") and is always shown (DECISIONS D2 addendum).
- **Renders are kinder than courts.** Clean backgrounds, one player, perfect lighting models and a known camera. Real courts add fences, other players, wind, sun glare, cheap LED flicker and phone processing (HDR, stabilisation, compression) that the corpus only approximates.
- **Calibration may be optimistic.** Engine corrections (release +12.5 ms, contact bias terms, pause thresholds) were tuned on seeds 1–3; seeds 4–5 were **not held out** as a separate test.
- **Consistency spreads rest on the thinnest evidence**: one 8-serve clip plus per-serve error analysis offline, and the two 16-serve sample clips end to end. The 20-serve variability clips are not rendered.
- **Nothing is validated under court lights.** Every metric is V0 in the night and flicker condition classes; the corpus has night renders at 240 fps only. The launch segment plays night comp (D11), so their comp-night recordings show at most "experimental".
- **Serve counting is proven on few behaviours.** The production build counts 45 of 45 serves with no false serves on 8 synthetic clips, and never counted any of the 38 pre-serve dribbles (VALIDATION §3.3). But no re-toss, shadow-swing or swing-and-miss clip has been rendered, so those counting rules are unit-tested only.
- **Contact timing depends on the ball search.** Two clips had contact about 0.27 s early end to end until 28 September (fixed: the pipeline's toss search band now covers the contact column). When contact signals still disagree, the fused-event rule (D2 addendum) caps or withholds every contact-dependent value, so a single wrong event cannot produce an `estimated` value. That rule's thresholds rest on synthetic error levels (swing peak within 45 ms at the 95th percentile on the corpus). The serve scan's contact estimate is still more than 0.25 s off on about 2% of 15 Hz samplings on the corpus; the wider ball search absorbs that there, but on real footage it is unmeasured.
- **Two event times are loose end to end.** Landing is 145–176 ms late on the single-serve clips (both offline and in the app; landing distance stays experimental), and the lowest-hip time is 28–124 ms off (drive time and trophy pause stay experimental).
- **End-to-end heights are uncorrected for camera pitch.** The end-to-end accuracy runs import clips without a mount answer, so their toss and contact heights are `PITCH_UNKNOWN` (experimental). The sensor-levelled in-app recording path has not been run end to end.
- **Recreational reference ranges are thin**: two recreational women and no recreational men in the literature for toss heights and spreads (CAPTURE §14). Bands are therefore player-relative first.
- **Known biases carried into real use:**
  - toss height reads about 8–12 cm high when the toss is 0.3 m nearer the camera than the body (D1);
  - MediaPipe's hip point reads leg drive about 2% of height low (persistent, so it cancels in the player's own comparisons; 1.5–3.1% low end to end);
  - MediaPipe's foot point sits about 2% of height behind the toe, so forward positions read about 5–7 cm long (experimental).
- **Speed is effectively never shown.** Its prerequisites (≥ 120 fps, clean post-contact detections, known scale, target tag) held on almost no clips, and the ranges produced were about 45% of their midpoint wide. **No radar comparison has been made.** Spin is always unavailable (D4).
- **Coaching evidence is weaker than coaching folklore.** External-focus cue benefits may be near zero after bias correction (research 04 [S38][S39]); video feedback added nothing over coaching for intermediate servers in the one older RCT (research 04 [S57]); good and faulted serves can have near-identical toss values (research 03 [S23]), so the "ins versus misses" insight may often be null (research 10 §9 risk 4).

## 2. No real phone has run it

- **No iPhone timing, memory, battery or heat figures exist.** Every processing time is from headless Edge on a shared laptop, production build: about 15–27 s for one serve, about 100 s for 8 serves and about 170 s for a 16-serve import (VALIDATION §6). ARCHITECTURE §5.11 *assumed* 25 ms per pose frame on an iPhone 15-class device to reach its 90 s budget; that assumption is untested, and the laptop misses the 90 s target for the 16-serve clip.
- **Sensor behaviour is unverified:** the tilt sign convention on iOS, pitch accuracy against a spirit level (including camera-to-sensor misalignment), and the iOS motion-permission flow in Safari (CAPTURE §9.12, §13.2).
- **Capture behaviour is unverified:** the frame rate `getUserMedia` actually delivers, whether portrait frames arrive upright, what `MediaRecorder` writes on Safari (container, rotation, timestamps, and whether its MP4 chunks survive a crash), the screen wake lock in a home-screen app, and whether the iOS photo picker transcodes imports.
- **The iOS app has never been built.** `app/ios` was generated on Windows; nothing is signed, compiled or installed ([IOS_ROUTE.md](IOS_ROUTE.md)). `npx cap sync ios` passes.

## 3. Web prototype limits

| Area | Limit | Consequence |
|---|---|---|
| **WebCodecs** | Frame-accurate decode needs `VideoDecoder` (full support from Safari 26) and `AudioDecoder` (Safari 26) (research 05 §9.7). HEVC support varies by configuration (ARCHITECTURE §15.1) | Older iOS falls back to slow media-element decode; some iPhone HEVC files may fail until the native reader exists |
| **WKWebView** (Capacitor shell) | Unpublished WebContent memory limit; origin quota about 15% of disk; service workers need App-Bound Domains (the service worker is not registered in the shell); open-ended byte ranges read whole files into memory (ARCHITECTURE §15.1) | Long clips can be killed; videos must move to native files; ranges must stay bounded |
| **In-app recording (`MediaRecorder`)** | Cannot lock frame rate, exposure, focus or lens; 120/240 fps only through import; 20-minute cap. Each 1 s chunk is written to IndexedDB as it arrives; a one-second key frame is requested so Chromium hands over data every second (Chromium only) | Blur and flicker are detected, not prevented. A crash keeps what was written (checked in Edge with a forced renderer crash); Safari is unverified. The synthetic dev camera delivered about 32 fps |
| **Motion sensors** | iOS Safari needs `DeviceMotionEvent.requestPermission()` from a tap; desktops have no sensors | Without tilt, absolute heights drop to experimental (`PITCH_UNKNOWN`). Imports carry no tilt reading; only a "level" mount answer can keep heights estimated (§4) |
| **Performance** | Analysis runs in the page and needs the app open; no resume (a resumed job restarts) | Long sessions take minutes; interruptions cost the whole run |
| **Storage and offline** | IndexedDB only. The app asks the browser to keep its data (`navigator.storage.persist()`) when the first real session is handed to analysis; a fresh headless Edge profile said no, and installed Home Screen behaviour on iOS or Android is unmeasured. The service worker stores the app shell, both pose models and one wasm build (about 29.6 MB) | The app installs and reloads offline in Edge; history can still disappear if the browser clears it. Export is the only backup. A second tab on the old build can miss a code chunk after an update |
| **Bundle** | `dist/` is 73 MB; the main-thread MediaPipe fallback (11.8 MB) ships because the pose worker's behaviour under `capacitor://` is untested | Larger install than needed if the worker path proves reliable |
| **Retention** | Auto-delete runs only when the app is opened (ARCHITECTURE §17 item 5) | "Delete after 30 days" can run late |
| **Night courts** | Every metric stays at V0 under lights until the night cells are validated; flicker detection is not built | Comp-night recordings are experimental |

## 4. Measurement scope

- **Side view blind spots** (D1): no knee-bend band, no shoulder-over-shoulder at contact, no forward lean at contact. These need the optional view from behind, which can only be imported today; live framing supports the side view only.
- **Experimental and hidden by default:** toss and contact forward position, drive time, landing distance, shoulder tilt band, trophy pause, re-toss count, repeatability, fatigue and load flags, all rear-view bands, and speed (FUNCTIONAL_STATUS §3.2).
- **Never measured** (D5): racket drop, external rotation, pronation, racket-head speed, precise joint angles, grip, swing path. Much of the second-serve fix (grip, path, spin) is invisible from the side (research 10 §3).
- **Outcomes are player-entered** in the side view (D3): in/net/long/wide depends on tagging.
- **Imports have no tilt reading.** The Import screen asks "How was the phone mounted?" for side views (METRICS §1.1.3a).
  - "Level mount" takes the phone as level within ±2°, "Roughly level" within ±4°. The engine widens each serve's range by that allowance and keeps toss and contact height at "estimated" only while the widened worst-case error still meets the threshold; otherwise they drop to experimental (`PITCH_UNKNOWN`).
  - "Tilted, or not sure" (the default) and every rear-view import leave absolute heights experimental. The hint says so and points to in-app recording or the mount answer.
  - The answer is the player's word: only roll can be cross-checked from the standing body, so a phone tipped up or down on a "level" mount goes unnoticed.
  - Spreads and timing are unaffected.
- **Session direction and view are decided from per-serve evidence.** One serve's ball or landing step casts one vote; the player's entries are overturned only when at least 3 serves (or every serve of a shorter clip) carry evidence and 70% contradict them. In a one-serve clip that serve's own evidence decides.

## 5. Product gaps

- **No accounts, sync or backup** (by decision, D8). Data lives on one device; uninstalling the app, clearing browser data or losing the phone loses it unless the player exported it.
- **Usage counts are local only.** Profile → Beta data keeps bucketed counts (no free text, ids, heights or body answers) and computes the beta gates; a tester exports a JSON report and chooses whether to send it. There is no upload (D8), so the gates depend on testers sending reports. Plus offers are counted from the paywall setting log, not from the events repository.
- **Paywall is a prototype.** No payment and no StoreKit. T1 (a card below the first "Did it work?" verdict), T2 (a notice on Processing past 2 analysed days a month after the free first loop) and T3 (a sheet when a Plus feature is tapped) are wired. T2 only notifies: every session is still analysed. **Pending a product decision:** the ghost overlay and the season view are locked for free players until "Test Plus" is switched on, which departs from PRODUCT §5.3 ("everything is unlocked" in the beta). The other Plus features have ids but nothing checks them.
- **Match log** is built as a full screen reached from Progress only. Today's morning-after card and Profile → Comp nights are not built, and the Sessions tab is highlighted on the match screens.
- **The annotation mode has never met a real clip.** "Check this serve" now also takes hip centres (release, lowest, contact), the trophy shoulders and the lowest-hip frame, so it compares leg drive, loading depth and drive time as well as the original seven metrics. The shoulder line is reported in words only. A radar reading fills that serve's "Radar speed (you logged)" row, but not the session report, and `speed-radar-entered` stays "not entered" at session level.
- **Imports are dated at import time.** The video probe does not read the clip's recording time, so a check-in filmed on Tuesday and imported on Thursday together with Thursday's re-test counts as one visit, and the re-test is then treated as "straight after practice" with no verdict. The integrated flow works around this by dating its imported check-in a day back.
- **Block numbers are not recorded.** Every session is saved with block 0, so splitting a recording that holds both blocks relies on a pause of 5 minutes or more between serves, or the first 15 serves; a session tally covering both blocks cannot be split.
- **Not built:**
  - the four-corner court tap and rear speed;
  - suggested outcome tags;
  - the practice-toss ball check;
  - notifications and reminders;
  - a duplicate-import check;
  - the usefulness question after the first practice log (it is asked after a verdict only).
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
