# Next steps

**As of 28 September 2026, the final-round commit after `4478e16`.** The highest-value work, ranked by value for effort. Each step has one crisp success criterion. Dates line up with [LAUNCH_AU.md](LAUNCH_AU.md); the gaps they close are in [LIMITATIONS.md](LIMITATIONS.md).

| Rank | Step | Value | Effort | Target | Depends on |
|---|---|---|---|---|---|
| 1 | Clinician review of pain and referral copy | Release blocker | Low | 18 Dec 2026 | A booked clinician |
| 2 | Real-footage and radar validation sprint with "Check this serve" | Highest: turns synthetic claims into real ones | Medium | Dry run by 6 Nov 2026; study by 31 Mar 2027 | Consenting adult players; one radar |
| 3 | Device QA on real iPhones (web app and Capacitor shell) | High: the first real performance numbers | Low–medium | 30 Nov 2026 | A Mac and 3 iPhones |
| 4 | Product decision on Plus in the beta, and the beta report route | High: the beta gates need both | Low | 31 Oct 2026 | Product lead; D8 decision on upload |
| 5 | Native capture plugin (`ServeCapture`) | High: fixes blur, frame rate and tilt | Medium–high | 31 Jan 2027 | Step 3 |
| 6 | TestFlight closed beta with 20–30 Melbourne comp players | High: first retention and usefulness evidence | Medium | 1 Feb – mid-Mar 2027 | Steps 1, 4, 5 |
| 7 | Pricing tests: survey and fake-door cells | Medium: de-risks A$99.99 | Low | Survey Oct–Nov 2026; cells in the beta | Step 4 |
| 8 | Coach share v1.1 | Medium: coaches are the lead channel | Low–medium | Before the beta | — |

## 1. Clinician review of pain and referral copy

- **What:** an Australian sports physiotherapist or sports physician reviews the body check, red flags, the three referral cards and the pain-pause behaviour (COACHING §10), including the pause that now applies as soon as a referral is answered, even when the player does not save it. Verify the healthdirect number. Apply changes and update the coaching tests.
- **Why first:** it is cheap, it is a release blocker (PRODUCT §11 item 6), and it gates both the beta and the public launch. The segment skews to players with shoulder or elbow complaints (research 10 §2.2).
- **Success criterion:** written sign-off from the named clinician on the final copy, merged with all `src/coaching` safety tests passing.

## 2. Real-footage and radar validation sprint with "Check this serve"

- **What is built:**
  - "Check this serve" in Serve detail: frame stepping, event marks (release, peak, trophy, lowest hip, contact, landing), points for the ball, toe, head top, heel, hip centre (release, lowest, contact) and both shoulders at the trophy, and radar entry, with the app's answers hidden until the marks are saved. Exports `serve-coach-validation@1` JSON, now with the engine's unrounded leg values (`app.mechanics`).
  - `tools/validate/annotation-eval.ts`: inter-annotator agreement, Bland–Altman, MAE with a player-cluster bootstrap, ICC(2,1) and interval coverage, now including leg drive, loading depth and drive time (V2 targets) and the shoulder line (reported only).
  - It has only seen synthetic clips.
- **What to do:**
  1. **Dry run.** The team films itself and two annotators mark the same 20 serves. This exercises export, pooling and the report end to end, and gives the per-serve marking time.
  2. **Sprint.** Film consenting adults at Melbourne Serve Check nights and practice courts, with a radar behind the server for speed. Include level-mount imports and in-app recordings with a reference level, so the mount answer and the sensor path are tested.
  3. **Close the loop.** Bring the radar reading through to the session report and `speed-radar-entered`.
- **Why:** every accuracy claim is synthetic. This is the single step that moves metrics from ≈ to validated, updates "How we measure" and [VALIDATION.md](VALIDATION.md) with real numbers, and decides which metrics may be advertised (ACL, research 07 §12 item 13).
- **Sample (METRICS §5.6 V2):** at least 8 players, including 3+ women, 1+ left-hander and 2+ aged 40 or over; at least 150 serves per metric; portrait-near and landscape-fence set-ups; at least 3 conditions, including 2 lit courts (LED and metal halide); 60 fps plus a 120/240 fps subset; test–retest on 6+ players over sessions 2+ days apart; two annotators on at least 25% of serves; for speed (V3), 200+ radar-paired serves.
- **Success criteria:**
  - *Dry run:* `annotation-eval.ts` produces a complete report from two annotators' exports of the same 20 real serves, with inter-annotator limits of agreement for every checked metric.
  - *Sprint:* the METRICS §5.6 acceptance table is run on the full sample and published. The hero metrics (toss height and forward spreads, contact height, rhythm, leg drive) either pass V2 or are explicitly kept experimental in the catalogue and the app copy. Capture quality either passes its flag matrix or keeps its experimental label.

## 3. Device QA on real iPhones

- **What:** run the CAPTURE §13.2 checklist on an iPhone 16e or 17e, an iPhone 17 and a Pro model, in Safari (installed to the Home Screen) and in the Capacitor shell: analysis time and peak memory for the reference clip, `getUserMedia` frame rate and rotation, `MediaRecorder` output and crash recovery of its chunks, tilt sign and accuracy against a spirit level, WebCodecs HEVC support, wake lock, photo-picker transcoding, `persist()` for an installed app, offline reload, a 15-minute session in sun above 30 °C. Confirm which MediaPipe wasm build loads under `capacitor://`.
- **Why:** there are no phone numbers at all; ARCHITECTURE's 90 s budget rests on an assumed 25 ms pose frame.
- **Success criterion:** every CAPTURE §13.2 item has a recorded result, and the 12-serve reference clip analyses in ≤ 90 s on an iPhone 15-class device (≤ 180 s on iPhone 12-class) with no WebContent kill (ARCHITECTURE §5.11, §14), or the go-native trigger in ARCHITECTURE §15.3 is formally raised. If the pose worker loads the module build in the shell, drop `vision_wasm_internal` (11.8 MB).

## 4. Product decision on Plus in the beta, and the beta report route

- **What is built:** local usage counts (Profile → Beta data) with the beta gates computed on the phone, and a JSON report the tester exports and chooses to send; T1, T2 and T3 paywall moments; a "Test Plus" flag that unlocks the ghost overlay and the season view.
- **What to decide:**
  - Keep the ghost overlay and season view locked for free testers (as built), or unlock everything as PRODUCT §5.3 says. Then make the code, PRODUCT §5.3 and the Plan copy agree.
  - Whether to add the PRODUCT §9.4 opt-in, counters-only upload (needs a D8 amendment and changes the App Store privacy label), or run the beta on sent reports plus interviews.
  - Connect the paywall moments to the events repository, so Plus offers seen and plan taps come from one place.
- **Success criterion:** a written decision in DECISIONS.md, the code and PRODUCT §5.3 matching it, and a test session producing every gate-1 event in the exported report with no free text, video, pose or health data (PRODUCT §9.4).

## 5. Native capture plugin (`ServeCapture`)

- **What:** AVFoundation capture in the Capacitor shell (CAPTURE §10; Swift interface in [IOS_ROUTE.md](IOS_ROUTE.md)): fixed frame rate, custom exposure, focus and white balance locked after framing, 1x lens, stabilisation off, per-frame CoreMotion attitude, thermal events, video-only file.
- **Why:** the web recorder cannot lock frame rate or exposure, which drives blur, flicker and 30 fps timing; native capture also carries most of the App Store 4.2 argument (research 07 §9).
- **Success criterion:** a 15-minute 1080p60 block records at a locked 60 fps with ≤ 1% dropped frames and daylight exposure ≤ 1/1000 s, carries per-frame pitch, and the unchanged engine reports capture quality "Good" on it.

## 6. TestFlight closed beta with 20–30 Melbourne comp players

- **What:** adults only, screened with the in-segment definition (research 10 §2.1), recruited through coaches, associations and the Melbourne hitting-partner group, starting at the February association seasons and pennant pre-season. Grow to 50–100 if gate signals are healthy.
- **Why:** the first evidence of activation, loop completion, usefulness and willingness to pay from the target segment.
- **Success criterion:** research 08 gate 1 after 6 weeks: set-up success ≥ 80%, activation ≥ 50% of invitees, loop completion ≥ 40% of activated, usefulness ≥ 70%, PMF ≥ 30%, ≥ 60 consented annotated or radar-paired clips, 100% of pain flags showing referral guidance.

## 7. Pricing tests

- **What:** a Van Westendorp and Gabor–Granger survey (n ≥ 200 comp players who have seen the sample session) through associations and Facebook groups; randomised fake-door cells (A$79.99 / A$99.99 / A$129.99 a year, A$39.99 season pass) on the Plan screen in the beta ([MONETISATION.md](MONETISATION.md) §6, §8). The T1–T3 moments that lead there are built.
- **Why:** live price A/B tests need about 2,500 installs per arm, far beyond an Australian beta (research 08 §8.3).
- **Success criterion:** a Van Westendorp acceptable price range from n ≥ 200 respondents, stating whether it contains A$99.99, plus plan-tap rates per cell from at least 50 beta paywall views.

## 8. Coach share v1.1

- **What:** keep export-only (D8), but add a coach "focus code" the player imports, a multi-session progress summary, and a coach landing page explaining the free coach view and offer codes (research 08 §6 gap-fill; research 10 M8, M12).
- **Why:** coaches are the lead acquisition channel (research 10 §6), and "My coach's focus" reduces conflict with the player's coach.
- **Success criterion:** in the coach pilot, ≥ 30% of students invited by coaches activate (research 08 §7), with at least 5 coaches each sending the share export to 3 or more students.

## Also queued (lower rank)

- **Landing and lowest-hip timing.** Landing is 145–176 ms late on the single-serve clips and the lowest hip 28–124 ms off (engine rules; VALIDATION §3.3, `validation/results/e2e-final/SUMMARY.md`). Success: landing and lowest-hip MAE within 2 frames at 60 fps on the corpus, offline and end to end.
- **Serve-scan contact estimate.** Still more than 0.25 s off on about 2% of 15 Hz samplings on the corpus. Success: 0 of 590 samplings more than 0.25 s off, or the full-rate pose core widened to cover the miss.
- **Date imports by when they were filmed.** Read the clip's recording time (MP4 `mvhd`/QuickTime creation date, falling back to the file date) so visits, re-tests and the monthly allowance follow the filming day, not the import day. Success: a check-in and a re-test filmed on different days but imported together link as baseline and re-test, and the light question defaults from the recording time.
- **Record block numbers.** The record flow saves every session as block 0, so two-block recordings are split by a 5-minute pause or the first 15 serves. Success: Record stores the block number and the coaching engine uses it.
- **Richer synthetic evidence.** Render the 20-serve variability, re-toss, shadow-swing and miss clips, so spreads and serve classification have more than one synthetic block behind them, and run the in-app (sensor-levelled) path end to end.
- **Match log entry points and the second usefulness question.** Today's morning-after card and Profile → Comp nights; the usefulness question after the first practice log (PRODUCT §6.8.1).
- **Smaller gaps:** the practice-toss ball check; flicker detection; window-level resume; de-duplicating video records when a session is re-analysed; a session-report radar row.
- A privacy policy and terms of use drafted for legal review, including the automated-analysis section before 10 December 2026 ([LAUNCH_AU.md](LAUNCH_AU.md) §3).

**Done in the final round (28 September 2026):** serve count end to end (45 of 45 on the production build), contact timing end to end, a production-build benchmark mode, the capture-quality label, an installable offline PWA with storage protection, crash-safe recording chunks, local usage counts and a beta report, the match log, T1–T3 paywall moments, and hip and shoulder marks in "Check this serve".
