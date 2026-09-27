# Next steps

**As of 28 September 2026, the hardening commit after `33ac31f`.** The highest-value work, ranked by value for effort. Each step has one crisp success criterion. Dates line up with [LAUNCH_AU.md](LAUNCH_AU.md); the gaps they close are in [LIMITATIONS.md](LIMITATIONS.md).

| Rank | Step | Value | Effort | Target | Depends on |
|---|---|---|---|---|---|
| 1 | Clinician review of pain and referral copy | Release blocker | Low | 18 Dec 2026 | A booked clinician |
| 2 | Real-footage and radar validation sprint with "Check this serve" | Highest: turns synthetic claims into real ones | Medium | Dry run by 6 Nov 2026; study by 31 Mar 2027 | Consenting adult players; one radar |
| 3 | Device QA on real iPhones (web app and Capacitor shell) | High: the first real performance numbers | Low–medium | 30 Nov 2026 | A Mac and 3 iPhones |
| 4 | On-device usage counts and a consented beta report | High: without it no gate can be measured | Low | 15 Jan 2027 | D8 decision on upload |
| 5 | Native capture plugin (`ServeCapture`) | High: fixes blur, frame rate and tilt | Medium–high | 31 Jan 2027 | Step 3 |
| 6 | TestFlight closed beta with 20–30 Melbourne comp players | High: first retention and usefulness evidence | Medium | 1 Feb – mid-Mar 2027 | Steps 1, 4, 5 |
| 7 | Pricing tests: survey, paywall triggers, fake-door cells | Medium: de-risks A$99.99 | Low | Survey Oct–Nov 2026; cells in the beta | Step 4 for the cells |
| 8 | Coach share v1.1 | Medium: coaches are the lead channel | Low–medium | Before the beta | — |

## 1. Clinician review of pain and referral copy

- **What:** an Australian sports physiotherapist or sports physician reviews the body check, red flags, the three referral cards and the pain-pause behaviour (COACHING §10). Verify the healthdirect number. Apply changes and update the coaching tests.
- **Why first:** it is cheap, it is a release blocker (PRODUCT §11 item 6), and it gates both the beta and the public launch. The segment skews to players with shoulder or elbow complaints (research 10 §2.2).
- **Success criterion:** written sign-off from the named clinician on the final copy, merged with all `src/coaching` safety tests passing.

## 2. Real-footage and radar validation sprint with "Check this serve"

- **What is built:** the annotation tooling landed in `33ac31f`.
  - "Check this serve" in Serve detail: frame stepping, event marks, points for the ball, toe, head top and heel, and radar entry, with the app's answers hidden until the marks are saved. Exports `serve-coach-validation@1` JSON.
  - `tools/validate/annotation-eval.ts`: inter-annotator agreement, Bland–Altman, MAE with a player-cluster bootstrap, ICC(2,1) and interval coverage.
  - It has only seen synthetic clips.
- **What to do:**
  1. **Fill the marking gaps.** Check this serve compares seven metrics today. Leg drive, a hero metric, needs the hip taps from ARCHITECTURE §12, and the knee and shoulder bands need band labels. Add both before the sprint.
  2. **Dry run.** The team films itself and two annotators mark the same 20 serves. This exercises export, pooling and the report end to end, and gives the per-serve marking time.
  3. **Sprint.** Film consenting adults at Melbourne Serve Check nights and practice courts, with a radar behind the server for speed.
  4. **Close the loop.** Bring the radar reading through to the report's "Radar speed (you logged)" row.
- **Why:** every accuracy claim is synthetic. This is the single step that:
  - moves metrics from ≈ to validated;
  - updates "How we measure" and [VALIDATION.md](VALIDATION.md) with real numbers;
  - decides which metrics may be advertised (ACL, research 07 §12 item 13).
- **Sample (METRICS §5.6 V2):**
  - at least 8 players, including 3+ women, 1+ left-hander and 2+ aged 40 or over;
  - at least 150 serves per metric;
  - portrait-near and landscape-fence set-ups;
  - at least 3 conditions, including 2 lit courts (LED and metal halide);
  - 60 fps plus a 120/240 fps subset;
  - test–retest on 6+ players over sessions 2+ days apart;
  - two annotators on at least 25% of serves;
  - for speed (V3), 200+ radar-paired serves.
- **Success criteria:**
  - *Dry run:* `annotation-eval.ts` produces a complete report from two annotators' exports of the same 20 real serves, with inter-annotator limits of agreement for every checked metric.
  - *Sprint:* the METRICS §5.6 acceptance table is run on the full sample and published. The hero metrics (toss height and forward spreads, contact height, rhythm, leg drive) either pass V2 or are explicitly kept experimental in the catalogue and the app copy.

## 3. Device QA on real iPhones

- **What:** run the CAPTURE §13.2 checklist on an iPhone 16e or 17e, an iPhone 17 and a Pro model, in Safari and in the Capacitor shell: analysis time and peak memory for the reference clip, `getUserMedia` frame rate and rotation, `MediaRecorder` output, tilt sign and accuracy against a spirit level, WebCodecs HEVC support, wake lock, photo-picker transcoding, a 15-minute session in sun above 30 °C.
- **Why:** there are no phone numbers at all; ARCHITECTURE's 90 s budget rests on an assumed 25 ms pose frame.
- **Success criterion:** every CAPTURE §13.2 item has a recorded result, and the 12-serve reference clip analyses in ≤ 90 s on an iPhone 15-class device (≤ 180 s on iPhone 12-class) with no WebContent kill (ARCHITECTURE §5.11, §14), or the go-native trigger in ARCHITECTURE §15.3 is formally raised.

## 4. On-device usage counts and a consented beta report

- **What:** write the PRODUCT §9.3 events to the local `events` table (it exists; nothing writes to it), show them under Storage and privacy, and add "Send my beta report" through the share sheet. Decide on the PRODUCT §9.4 opt-in counters-only upload (it needs a D8 amendment and changes the App Store privacy label).
- **Why:** activation, loop completion, W4 retention, usefulness and paywall intent are the beta gates (research 08 §8.4); today none can be measured.
- **Success criterion:** a test session produces every event needed for gate 1 in the local table, with no free text, video, pose or health data in any event (PRODUCT §9.4), and a beta report exports in one tap.

## 5. Native capture plugin (`ServeCapture`)

- **What:** AVFoundation capture in the Capacitor shell (CAPTURE §10; Swift interface in [IOS_ROUTE.md](IOS_ROUTE.md)): fixed frame rate, custom exposure, focus and white balance locked after framing, 1x lens, stabilisation off, per-frame CoreMotion attitude, thermal events, video-only file.
- **Why:** the web recorder cannot lock frame rate or exposure, which drives blur, flicker and 30 fps timing; native capture also carries most of the App Store 4.2 argument (research 07 §9).
- **Success criterion:** a 15-minute 1080p60 block records at a locked 60 fps with ≤ 1% dropped frames and daylight exposure ≤ 1/1000 s, carries per-frame pitch, and the unchanged engine reports capture quality "Good" on it.

## 6. TestFlight closed beta with 20–30 Melbourne comp players

- **What:** adults only, screened with the in-segment definition (research 10 §2.1), recruited through coaches, associations and the Melbourne hitting-partner group, starting at the February association seasons and pennant pre-season. Grow to 50–100 if gate signals are healthy.
- **Why:** the first evidence of activation, loop completion, usefulness and willingness to pay from the target segment.
- **Success criterion:** research 08 gate 1 after 6 weeks: set-up success ≥ 80%, activation ≥ 50% of invitees, loop completion ≥ 40% of activated, usefulness ≥ 70%, PMF ≥ 30%, ≥ 60 consented annotated or radar-paired clips, 100% of pain flags showing referral guidance.

## 7. Pricing tests

- **What:** a Van Westendorp and Gabor–Granger survey (n ≥ 200 comp players who have seen the sample session) through associations and Facebook groups; wire the T1 paywall card after the first "Did it work?" verdict and T2/T3; randomised fake-door cells (A$79.99 / A$99.99 / A$129.99 a year, A$39.99 season pass) in the beta ([MONETISATION.md](MONETISATION.md) §6, §8).
- **Why:** live price A/B tests need about 2,500 installs per arm, far beyond an Australian beta (research 08 §8.3).
- **Success criterion:** a Van Westendorp acceptable price range from n ≥ 200 respondents, stating whether it contains A$99.99, plus plan-tap rates per cell from at least 50 beta paywall views.

## 8. Coach share v1.1

- **What:** keep export-only (D8), but add a coach "focus code" the player imports, a multi-session progress summary, and a coach landing page explaining the free coach view and offer codes (research 08 §6 gap-fill; research 10 M8, M12).
- **Why:** coaches are the lead acquisition channel (research 10 §6), and "My coach's focus" reduces conflict with the player's coach.
- **Success criterion:** in the coach pilot, ≥ 30% of students invited by coaches activate (research 08 §7), with at least 5 coaches each sending the share export to 3 or more students.

## Also queued (lower rank)

- **Serve count end to end.** Stop the engine dropping found serves when the ball track is weak (engine-core). Success: 27 of 27 serves counted on the synthetic benchmark clips in the full app pipeline, against 24 of 27 today.
- **Contact timing end to end.** On `dist12-s1` and `default75-s1` the full pipeline places contact about 0.27 s early and still reports toss drop, rhythm and leg drive as estimates (VALIDATION §3.3). Success: contact within 1 frame on every benchmark clip in the full pipeline, or the serve's contact-based metrics drop to experimental when contact evidence is weak.
- **Benchmark the production build.** This round's speed work was measured on the dev server only, and a model-loading race that broke serve finding appeared only in the production build (VALIDATION §6; fixed). Success: `perf-bench.mjs` gains a production-build mode, and every pipeline change reports serve counts from it on the five benchmark clips.
- **Mount answer on real phones.** The Import mount question and the assumed-level rule (METRICS §1.1.3a) are built and checked on synthetic clips only. Success: in the validation sprint, level-mount imports meet the toss-height and contact-height thresholds of METRICS §5.6, with the phone's real tilt read from a reference device.
- **Label fix.** Bring the `capture-quality` label into line with its V0 validation state. It describes the recording, not the serve, and the report's capture line and the analysis gates read it, so the product lead should choose: an "experimental" label that stays visible, or a status exemption written into METRICS §1.3.
- **Offline web beta.** Request `navigator.storage.persist()` and add a web manifest and service-worker precache, or state clearly that the web build is not an offline app.
- **Smaller gaps:**
  - match log entry (M6);
  - the practice-toss ball check;
  - flicker detection;
  - window-level resume;
  - de-duplicating video records when a session is re-analysed.
- **Richer synthetic evidence.** Render the 20-serve variability, re-toss and miss clips, so spreads and serve classification have more than one synthetic block behind them.
- A privacy policy and terms of use drafted for legal review, including the automated-analysis section before 10 December 2026 ([LAUNCH_AU.md](LAUNCH_AU.md) §3).
