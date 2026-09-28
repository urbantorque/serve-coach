# VALIDATION.md: how accurate Serve Coach is, and how we know (v1, synthetic)

**Status:** first accuracy report, 27 September 2026; integration re-checks added 28 September (end-to-end serve count, full-pipeline contact timing, performance, a production-build fix); engine-accuracy fixes and the scored production-build end-to-end set added 28 September (§3.3, `validation/results/e2e-final/SUMMARY.md`); final integration re-run on the final engine (engine and pipeline 1.1.0, coaching 1.1.0) added the same day (§3.3, §6); closure round the same day: V1 now also needs the method-only (truth-landmark) variant to pass, so toss height is experimental (§3.2), light is read from the pixels (§3.6), a serve needs contact evidence to be counted (§3.3), and one serve's heights no longer take another distance's scale (§3.3, E1); the closure integration re-ran the production-build set on the versioned engine (engine, method and pipeline 1.1.1, coaching 1.1.1) with the same results (§6). **Audience:** the founder, and later App Store review, partners and due diligence. **Owner:** validation.
**One-line answer:** every figure below comes from computer-generated serves run through the app's real perception stack. No real serve footage has been analysed (founder instruction: no downloaded footage). Synthetic results are an **upper bound** on real-world accuracy, not a claim about it.

Sources of truth this report follows: `docs/DECISIONS.md` (D1, D2, D4, D5, D8, D11), `docs/specs/METRICS.md` (§1.3 levels and ceilings, §5 validation, §6 limits), `docs/specs/metrics.json` (now carries each metric's `validationLevel`, `validationState` and `validationNote`), `docs/specs/ARCHITECTURE.md` §12 to §14. Every number cites the results file it came from. Where a number is rounded in prose, the file has the exact value.

---

## 0. Bottom line

| | |
|---|---|
| What was tested | 122 rendered clips (129 serves) with exact ground truth, run through the app's own decoders, MediaPipe pose, ball tracker and engine in headless Edge; plus a pose crop study, a ball-layer study and 3 evaluation modes (§2). |
| Passed on simulated serves (V1, daylight) | **10 of 37 metric ids**: toss drop, contact height, rhythm, loading depth (clean passes); serve count, toss-height, toss-forward, contact-height and rhythm spreads, and leg drive (passes on limited evidence). These may show as **Estimate** in daylight. V1 needs the app pipeline **and** the method-only variant (truth landmarks plus noise) to pass at D1 (§1, 28 September). |
| Scored and not passed (stay experimental) | **8**: toss height (passes through the app pipeline, fails with truth landmarks: the pass rests on two biases cancelling, §3.2), toss forward, contact forward, trophy pause, drive time, landing distance, shoulder tilt at the top, launch speed. |
| Scored but not settled | **3**: deep-bend flag, rear knee band, capture quality. |
| Not scored yet | **8**: re-toss count, toss left-right and its spread, shoulder over shoulder, repeatability, rear average speed, fatigue and load flags. |
| Nothing to validate for the camera | **8**: the 7 player-entered values and spin (never measured). |
| End to end in the full app | Scored on the **production build** (`vite build` + `vite preview`; `validation/results/e2e-final/SUMMARY.md`), 8 clips, 45 serves, two runs: **45 of 45 counted, no false serves** (27 of 27 on the five runs that read 24 of 27 before; 43 of 43 with the re-test clip). Contact within 0.1 to 0.8 ms per clip (was up to 270 ms early on 2 clips), and every serve has a toss height, contact height, toss drop, rhythm and leg-drive value (heights there are experimental: imported without a mount answer). The two causes were in the pipeline's ball search (§3.3). **Final integration re-run** on the final engine (engine and pipeline 1.1.0, one run per clip): again 45 of 45, 0 false serves, contact 0.1 to 0.8 ms, toss drop 0.2 to 0.3 cm, rhythm 0.3 to 11.0 ms. **Closure-round re-run** (the stricter serve rule, the light check, the E1 fix; repeated at integration on engine 1.1.1 with the same counts and height errors): 45 of 45, 0 false serves; the session clip's contact-height error fell from 0.057 to 0.033 of height (one serve no longer takes the other court side's scale, §3.3). Synthetic serves only. |
| Under court lights | **Nothing is validated.** Every metric is V0 in the `night-lights` and `flicker` classes, so night sessions show at most Experimental. This matters: the launch segment plays night comp (D11). A clip with no light answer is class `unknown` (nothing validated either), and the pipeline now reads the light from the pixels: mains flicker called on 5 of 5 flickering night renders and 0 of 119 others, a dark sky on 5 of 5 night renders and 0 of 119 daylight, overcast and dusk renders (§3.6; renders only, thresholds not calibrated on real courts). |
| Real players, phones, courts | **Not validated.** V2 (hand-marked real video) and V3 (physical references) have not started. |
| External services | **None in v1.** All analysis runs on the device; 0 requests left the machine across all 122 clip runs (§6). |

Typical errors at the recommended D1 set-ups (portrait 7 to 7.5 m, landscape at the fence 9 m; 11 clips, 11 serves; `app/src/analysis/metrics/validation-summary.json`): toss height 1.1% of height (about 2 cm for a 1.80 m player; but 4.1% median with truth landmarks, so it stays experimental), contact height 0.7% of height (2.5% with truth landmarks, still a pass), toss drop 0.5 cm, toss-to-hit time 11 ms, loading depth 0.4% of height, serve count exact. For each of the five measured values, the per-serve 95% range held the true value on 11 of 11 serves.

---

## 1. Definitions

**Status labels** (D2; METRICS §1.3): measured, estimated, player-entered, experimental, unavailable. Experimental values are hidden unless the player turns them on and never feed coaching; spin is always unavailable.

**Validation levels** cap the status, per condition class (`day`, `overcast`, `night-lights`, `flicker`): V0 not validated (ceiling experimental); V1 passes the synthetic matrix including the interval-coverage gate, both through the app pipeline and with truth landmarks plus noise (the method-only variant; added 28 September, finding 41, so that a pass resting on the pose model's bias cancelling the method's does not count) (ceiling estimated); V2 passes hand-marked real video (ceiling measured for timing metrics only); V3 passes a physical reference (the metric's target). Emitted status = min(target, ceiling), then the night cap, then per-value downgrades. The engine's table is `app/src/analysis/metrics/catalogue.ts` (`VALIDATION_LEVELS`, `statusCeiling`); `docs/specs/metrics.json` mirrors it and `app/src/ui/screens/metric/validationState.test.ts` fails if they drift.

**Validation state** (new field in `metrics.json`, defined in its `validationStates` block) says how a level was reached:

| State | Level | Meaning | Metrics |
|---|---|---|---|
| `V1-synthetic-pass` | V1 day, overcast | Passed the METRICS §5.4 S0 thresholds at the D1 set-ups, through the app pipeline and with truth landmarks | toss-drop, contact-height-ratio, rhythm-release-to-contact, loading-depth |
| `V1-synthetic-pass-limited` | V1 day, overcast | V1, but on thin or partial evidence (§3.3) | serve-count, toss-height-spread, toss-forward-spread, contact-height-spread, rhythm-spread, leg-drive |
| `V1-synthetic-fail` | V0 | Scored, failed at least one threshold | toss-apex-height (fails with truth landmarks), toss-forward, contact-forward, trophy-pause, drive-time, landing-distance, shoulder-tilt-trophy, speed-experimental |
| `V0-synthetic-inconclusive` | V0 | Scored, but the corpus cannot test what matters | deep-bend-flag, knee-bend-band, capture-quality |
| `V0-unvalidated` | V0 | Not scored against truth yet | retoss-count, toss-lateral, toss-lateral-spread, shoulder-over-shoulder-contact, repeatability, speed-average-rear, fatigue-flag, load-flag |
| `not-applicable` | V0 (no cap: status is player-entered or unavailable) | Player-entered, or never measured | serve-in-rate, first-serve-in-rate, second-serve-in-rate, double-faults, placement-zone, serve-type-mix, speed-radar-entered, spin |

**Error terms.** Error = engine value minus truth, per serve. **Bias** = mean error. **MAE** = mean absolute error (the "typical error" players see). **p95** = 95th percentile of the absolute error ("1 in 20 serves off by this much or more"). **Coverage** = share of truths inside the engine's own per-serve 95% interval; the V1 gate is 93% or more (METRICS §1.2, §5.1). **n** = serves scored. Height ratios are written as % of standing height (0.011 = 1.1%).

**Clip sets.** *D1 envelope* = the 11 clips filmed at the recommended set-ups: `default75-s1..3` (portrait, 7.5 m from the centre mark, level phone 1.4 m high), `fence9-s1..3` (landscape at the fence, 9 m, 1.6 m) and `dist7-s1..5` (portrait, 7 m from the front toe). *All side-view daylight clips at 60 fps or more* = 94 or 95 serves, including the 5 m reference clips, which are closer than D1 allows. Pass or fail for V1 is judged on the D1 envelope, for the app pipeline and for the method-only variant (`validation/results/metrics/SUMMARY.md`, "Acceptance", last column; `validation-summary.json` keeps both as `passAppPipeline` and `pass`).

---

## 2. What was validated and how

### 2.1 Synthetic ground-truth generator (`tools/synth`, see `tools/synth/README.md`)

- **Player model.** A 33-landmark skeleton in MediaPipe order with Drillis-Contini segment ratios scaled by height, driven by keyframed channels with monotone cubic interpolation (a keyed peak is the true peak), analytic two-bone IK, solved constraints (exact toss release height, gravity-only toss through the requested apex, string bed meets the ball at contact, exact knee flexion, trunk inclination, ballistic pelvis in the air, requested landing distance). Beginner, intermediate and advanced profiles with known serve-to-serve SDs; left-handers are exact mirrors.
- **Ball physics.** 57 g, 67 mm ball; quadratic drag (C_d 0.55) and Magnus lift for the outgoing flight, RK4 at 0.5 ms, bounce refined to 1e-12 s; the toss is an exact parabola (no drag).
- **Camera model.** Pinhole with the phone's 35 mm-equivalent focal length (26 mm on 1080×1920 gives fx 1442 px), stance or centre-mark anchors, portrait and landscape, optional per-frame shake (0.5° rotation, 1 cm translation, 0.3 to 6 Hz). Global shutter, no rolling shutter, no ISP, no rotation metadata, constant frame rate.
- **Renderer.** three.js in headless Edge (ANGLE/D3D11): stylised player, racket, ITF court, net, fences, trees, floodlight poles; ball motion blur from up to 48 sub-positions over the shutter; body blur from sub-frames; lighting presets bright (1/1000 s), overcast (1/250 s), dusk (1/60 s, heavy blur and noise), night floodlights (1/240 s, optional 100 Hz ±30% flicker); sensor model (gain, white balance, ACES tone curve, read and shot noise, 8-bit); libx264 High at the listed CRF (VP9 for two WebMs).
- **Audio.** 48 kHz mono, every sound emitted at a known time and place and delayed at 343 m/s: racket pop, bounces, dribbles, footsteps, background noise, floodlight hum at night, distant hits from other courts in the session clip.
- **Truth.** `truth.json` (per-frame 2D/3D landmarks, ball, events, metrics) and `truth-extra.json` (a canonical truth value per metric id, METRICS §5.2). `verify.ts` checks all files, sizes and frame counts.

**Scenario matrix in the metric run** (`validation/synthetic/manifest.json`; 122 clips, 129 serves; the two `app-sample` clips added later are not in the run):

| Group | Clips | Serves | What changes (one factor at a time unless stated) |
|---|---|---|---|
| baseline | 5 | 5 | Side view 5 m from the front toe, 60 fps, portrait 1080×1920, bright, 1.80 m right-handed intermediate (closer than D1) |
| default75 | 3 | 3 | **D1 default**: portrait, 7.5 m from the centre mark, level, 1.4 m high (deuce serves only) |
| fence9 | 3 | 3 | **D1 alternative**: landscape at the fence, 9 m, level, 1.6 m, 1080p (no 4K) |
| dist4, dist7, dist12 | 15 | 15 | Distance 4, 7, 12 m |
| fps30, fps120, fps240 | 15 | 15 | Frame rate (one 240 fps render decimated) |
| slomo, quick-slomo | 3 | 3 | 240 fps capture written as 30 fps media (iPhone slow-motion export) |
| crf18, crf28, crf36 | 15 | 15 | Encoder quality |
| overcast, dusk | 10 | 10 | Light; dusk at 1/60 s |
| night240 | 5 | 5 | Floodlights with 100 Hz flicker, 240 fps only |
| shake | 5 | 5 | Handheld phone |
| apexout | 5 | 5 | Landscape 4.5 m, low camera: toss apex leaves the frame |
| lefty | 5 | 5 | Left-handed player |
| h160, h195 | 10 | 10 | 1.60 m and 1.95 m players |
| beginner, advanced | 10 | 10 | Profiles (advanced: foot-up, deep knee bend, jump) |
| rear | 5 | 5 | View from behind, 5 m, camera 1.5 m high (not the raised D1 rear view) |
| front45 | 5 | 5 | Negative control: filmed from 45° in front |
| quick-side60, quick-rear30-lefty | 2 | 2 | 540×960 CI clips |
| session | 1 | 8 | 73 s, 8 serves alternating deuce/ad, bounces, pauses, walking, distant hits |
| **Total** | **122** | **129** | |

### 2.2 The real perception stack in headless Edge (`tools/validate/smoke.mjs --full`)

Each clip was run through the app's own pipeline code (`app/src/validation/harness.ts`) in headless Edge 154 via Playwright on a shared Windows laptop (Intel Core Ultra 5 226V, 8 logical CPUs): container probe, audio decode and onsets, WebCodecs decode, **MediaPipe Pose Landmarker (full model, ROI crop, VIDEO mode, 2 poses, worker, GPU)**, `cleanPoseFrames`, the ball detector at full resolution with the toss band, tracking, toss analysis and the gravity time-scale check (with re-timing and re-detection after a slow-motion correction). 122 of 122 clips ran to completion (`validation/results/metrics/pipeline/SUMMARY.md`).

Inputs the player would type (view, height, handedness, target tag, court side) came from truth. **The camera pitch was also taken from truth and passed as an in-app sensor reading**, so tilt measurement and its error were not exercised (§7).

Building-block results from that run (same file): pose detected on 100% of frames in every set; raw pose median joint error 0.027 to 0.036 of stature by set (strict MediaPipe labels); ball toss recall 98 to 100%; ball localisation error 0.21 to 0.65 px; apex timing error 0.22 to 0.36 ms mean in side sets (4.6 ms rear); audio contact onset error 0.07 ms mean (0.19 ms max); the racket pop labelled `contact` on 122 of 122 clips.

### 2.3 Pose crop (ROI) study (`app/src/analysis/pose/README.md`, "ROI evaluation")

Nine rendered clips (side, rear and front-45 views at 4, 7 and 12 m; 30 fps; CRF 18) run through `MediaPipePoseSource` with and without the ROI crop, scored on 12 core joints. Without the crop, detection at 7 to 12 m was 6 to 70% of frames; with it, 98 to 100%, and mirror-tolerant joint error fell from 0.2 to 1.6 to **0.024 to 0.036 of stature**. Strict error (MediaPipe's own left/right labels) stayed at 0.09 to 0.14 in side and front-45 views because a whole-body mirror fitted better than the labels on 43 to 75% of frames; rear views were 0.03 to 0.05 either way. The study clips were rendered from an earlier version of the generator, one player, one outfit, bright light, static camera, no bystanders; the 60 to 240 fps check covers only side view at 5 m.

### 2.4 Ball layer study (`app/src/analysis/ball/README.md`, "Evaluation on rendered clips")

20 clips (baseline, 30/120/240 fps, slow motion, dusk, night flicker, CRF 36, 12 m, apex above the frame, rear) with truth poses and player entries. Toss recall 96 to 100% on every clip (including dusk at 1/60 s, night at 240 fps under 100 Hz flicker, CRF 36 and a 4 px ball at 12 m); median localisation 0.12 to 0.60 px; toss track precision 100%; apex timing within 0.50 ms on every side clip, including when 38 frames around the apex were out of frame; release biased early by 6 to 32 ms before the engine's +12.5 ms correction; gravity time-scale factor 0.993 to 1.016 on real-time clips and 0.125 and 0.124 on 8× slow motion; speed ranges at 120/240 fps held the true speed 7 of 7 times but were 1.5 to 2.1 times wide (high/low). On the one rear clip the detector reported a false bounce 205 ms early that mapped 118 m down the court; it was refused, so **the rear bounce and average-speed path is validated only on unit-test flights**.

### 2.5 Metric evaluation, three modes (`tools/validate/metrics-eval.ts`; `validation/results/metrics/SUMMARY.md`)

The engine (`app/src/analysis/engine.ts`) is run offline on the pipeline's real per-frame outputs for each clip, and every metric and event is compared with `truth-extra.json`:

- **default**: hit sound off (the D1 default);
- **audio**: hit sound on (opt-in);
- **injected**: the clip's truth landmarks plus planning noise (0.02 of height), speed blur, left/right swaps and a persistent setup mirror, cleaned like the app, with the same ball data. This separates method error from MediaPipe error.

**Tuning caveat (honest).** Bias corrections (release +12.5 ms, contact terms) and the trophy-pause thresholds were calibrated on seeds s1 to s3; seeds s4 and s5 were **not** held out as a frozen test set as METRICS §5.1 requires. Some figures may therefore flatter the engine slightly. The next run must freeze thresholds and score a disjoint seed set.

**Reproducibility.** On 27 September 2026 at 10:52 UTC this report re-ran `metrics-eval.ts` against the current working tree (commit b576aaa), writing to a scratch folder: every accuracy table was identical to the committed `SUMMARY.md` (only the pose-noise lines differ, because they read `noise.json` from the output folder). Engine-core re-ran it at 10:58 UTC with the same tables, and it was run again at 11:40 UTC on the hardening-round tree (after commit 33ac31f): `validation-summary.json` changed only in its `generated` stamp.

---

## 3. Per-metric results

### 3.1 Method, prerequisites and truth reference

| Metric | Method (one line) | Prerequisites (`metrics.json`) | Synthetic reference (`truth-extra.json` canonical) |
|---|---|---|---|
| serve-count | Label-free anchors on the higher wrist plus a toss, merged within 1.2 s | fps ≥ 30 | serves whose contact lies in the clip |
| toss-apex-height | Gravity parabola fit to the rectified ball track; height above the floor row over standing height in pixels; depth prior for a toss nearer the camera | fps ≥ 30, apex seen, floor, body height, pitch | tossApexHeightM / height |
| toss-forward | Apex minus the start toe (S0), along the court, scaled by entered height | side view, apex, start toe, geometric roles, heights, pitch, yaw ≤ 15° | apex x minus front toe at release |
| toss-drop | Apex height minus ball height at contact (physics path) | fps ≥ 30, time base, apex, ball at contact | tossHeightAboveContactM |
| toss-height-spread | Noise-corrected SD of apex heights over ≥ 8 serves | n ≥ 8, stability, apex, floor, heights | SD of realised apex heights |
| toss-forward-spread | Noise-corrected SD of toss-forward | side view, n ≥ 8, start toe, height | SD of realised toss-forward |
| contact-height-ratio | Ball-centre height at contact (ball-intersection, ball-bracket or wrist fallback) over standing height | fps ≥ 30, ball at contact, floor, body height, pitch | contactHeightRatio |
| contact-height-spread | Noise-corrected SD of contact height | n ≥ 8, stability, ball at contact | SD over the same serves |
| contact-forward | Contact minus the start toe | as toss-forward | contact x minus front toe |
| rhythm-release-to-contact | Toss release (ball hinge fit, +12.5 ms) to contact | fps ≥ 30, time base, release, contact | releaseToContactS |
| rhythm-spread | Noise-corrected SD of rhythm | as rhythm, n ≥ 8 | SD over the same serves |
| trophy-pause | Still window of pelvis and wrists near the top | fps ≥ 60, time base, trophy, experimental toggle | trophyEnd minus trophyStart |
| leg-drive | Mid-hip rise from its lowest point to contact, % of height | side view, release, contact, body height, hips visible | legDrive.hipRisePctHeight |
| drive-time | Lowest hip to contact | side view, time base, lowest hip, contact | legDrive.driveTimeS |
| loading-depth | Mid-hip drop from release to its lowest point, % of height | side view, hips visible | legDrive.loadingDepthPctHeight |
| deep-bend-flag | Yes/no from hip drop and leg shape at the top | side view, trophy, front leg visible, pitch, experimental toggle | front-knee 3D flexion ≥ 45° |
| shoulder-tilt-trophy | Rectified 2D shoulder line at the top, as a band against the player's own range (degrees never shown) | side view, trophy, shoulders visible, pitch, 2 sessions | 3D shoulder-line angle |
| landing-distance | Front-foot landing point minus the start toe | side view, landing, start toe, heights, pitch, yaw ≤ 15° | landing.fromStartToeM |
| speed-experimental | Outgoing ball track at ≥ 120 fps, height scale and target tag bound the out-of-plane angle; range only | side view, fps ≥ 120, proven time base, height, target tag, toggle | ballSpeedAtContactKmh |

Rear-only metrics (toss-lateral, knee-bend-band, shoulder-over-shoulder-contact, speed-average-rear) and repeatability, re-toss, fatigue and load flags are described in METRICS §3 and are not scored (§3.3).

### 3.2 Numbers (default mode: MediaPipe poses, hit sound off)

From `app/src/analysis/metrics/validation-summary.json` and `validation/results/metrics/SUMMARY.md` ("Acceptance against the METRICS S0 thresholds"). D1 = D1 envelope; All = every side-view daylight clip at 60 fps or more. Heights in % of height; forward and landing in cm; times in ms.

| Metric | Set | n serves | Bias | MAE | p95 | Coverage | Threshold (METRICS §5.4) | Result | Product status in daylight (night) |
|---|---|---|---|---|---|---|---|---|---|
| serve-count | D1 / All | 11 / 95 | 0 | 0 wrong | 0 | – | precision and recall ≥ 99% | PASS / PASS offline; **end to end (production build) 45 of 45, 0 false**, §3.3 | Estimate; measured once the player confirms the strip (Experimental) |
| toss-apex-height | D1 | 11 | −0.9% | 1.1% (median 1.1%) | 2.7% | 100% | median ≤ 2.5%, p95 ≤ 5%, cov ≥ 93% | PASS (app pipeline) | Experimental (`VALIDATION_PENDING`); its spread keeps Estimate (Experimental) |
| | D1, truth landmarks | 11 | −4.0% | 4.0% (median 4.1%) | 5.6% | 100% | | **FAIL** (method-only gate) | |
| | All | 94 | −3.6% | 3.9% (median 4.3%) | 6.9% | 100% | | FAIL | |
| toss-drop | D1 | 11 | +0.2 cm | 0.5 cm | 3.6 cm | 100% | MAE ≤ 5 cm, cov ≥ 93% | **PASS** | Estimate (Experimental) |
| | All | 93 | −0.4 cm | 0.7 cm | 3.6 cm | 99% | | PASS | |
| contact-height-ratio | D1 | 11 | −0.6% | 0.7% | 2.0% | 100% | MAE ≤ 3%, p95 ≤ 5%, cov ≥ 93% | **PASS** | Estimate at ≥ 6 m; Experimental closer (Experimental) |
| | D1, truth landmarks | 11 | −2.5% | 2.5% | 3.9% | 100% | | PASS (method-only gate) | |
| | All | 94 | −2.3% | 2.5% | 5.03% | 100% | | FAIL (p95) | |
| rhythm-release-to-contact | D1 | 11 | −3.9 | 11.0 | 27.5 | 100% | MAE ≤ 1 frame + 5 ms (21.7 ms at 60 fps), cov ≥ 93% | **PASS** | Estimate at ≥ 45 fps; Experimental at 30 fps (Experimental) |
| | All | 94 | +2.1 | 9.4 | 27.5 | 99% | | PASS | |
| loading-depth | D1 | 11 | −0.4% | 0.4% | 0.8% | 100% | MAE ≤ 2% | **PASS** | Estimate, descriptive only (Experimental) |
| | All | 94 | −0.3% | 0.4% | 1.1% | 100% | | PASS | |
| leg-drive | D1 | 11 | −2.5% | 2.5% | 3.1% | 100% | MAE ≤ 2%, cov ≥ 93% | FAIL | Estimate as % of height with the caveat "reads about 2.5% of your height low, compare with your own serves only" everywhere it shows (DECISIONS D2 addendum; band words once METRICS emits the band); see §3.3 |
| | All | 94 | −1.8% | 1.9% | 3.0% | 100% | | PASS | |
| toss-forward | D1 | 11 | +6.7 cm | 6.7 cm | 8.6 cm | 100% | MAE ≤ 5 cm, p95 ≤ 10, cov ≥ 93% | **FAIL** | Experimental |
| | All | 94 | +5.4 cm | 5.4 cm | 8.3 cm | 99% | | FAIL | |
| contact-forward | D1 | 11 | +6.6 cm | 6.6 cm | 8.5 cm | 100% | MAE ≤ 6 cm, p95 ≤ 12, cov ≥ 93% | **FAIL** | Experimental |
| | All | 94 | +5.1 cm | 5.1 cm | 8.5 cm | 98% | | PASS | |
| trophy-pause | D1 | 6 | −100 | 100 | 177 | 50% | MAE ≤ 60 ms | **FAIL** | Experimental |
| | All | 67 | −30 | 65 | 177 | 60% | | FAIL | |
| drive-time | D1 | 6 | −64 | 64 | 129 | 83% | MAE ≤ 50 ms, cov ≥ 93% | **FAIL** | Experimental |
| | All | 67 | −66 | 75 | 133 | 73% | | FAIL | |
| landing-distance | D1 | 11 | +1.4 cm | 6.0 cm | 24.1 cm | 91% | MAE ≤ 8 cm, p95 ≤ 15, cov ≥ 93% | **FAIL** | Experimental, trend only |
| | All | 94 | +3.1 cm | 3.8 cm | 7.4 cm | 99% | | PASS | |
| shoulder-tilt-trophy | D1 | 11 | +1.6° | 1.6° | 5.3° | – | rectified 2D within ±4° of 3D (p95) | **FAIL** | Experimental (degrees never shown) |
| | All | 94 | +0.7° | 2.3° | 8.3° | – | | FAIL | |
| deep-bend-flag | D1 / All | 11 / 93 | – | 0% / 6% two-level error | – | – | two-level error ≤ 15% | PASS / PASS, not counted (§3.3); with truth landmarks FAIL (45%) | Experimental by design |
| speed-experimental | 120/240 fps | 0 shown of 129 | – | – | – | 7 of 7 ranges held the truth in the ball study; 18 of 18 in the pipeline run | coverage ≥ 90%, median error ≤ 5%, range ≤ 35% of midpoint | FAIL (ranges about 45% wide: `RANGE_TOO_WIDE` on 15 clips, `FPS_TOO_LOW` on 100) | Unavailable by default; never shown on the corpus |

The "All" rows lost one serve on 28 September: under the fused-event rule (DECISIONS D2 addendum; §3.3) the engine now withholds contact-timed values on `dusk-s3`, where MediaPipe missed the hitting arm at contact and the ball evidence alone was too weak (confidence below 0.5). The D1 rows are unchanged (`metrics-eval.ts` re-run, 28 September). The status distribution the engine actually emitted per metric over all 129 serves is in `SUMMARY.md` ("status distribution"); for example toss-apex-height is now `experimental` (`VALIDATION_PENDING`) on all 118 serves with a value (it was `estimated` on 21 before the method-only gate) and `unavailable` on 11 (tilted 4 m clips, front-45 clips, one apex out of frame), and contact-height-ratio is `estimated` on 21, `experimental` on 97 (91 closer than 6 m, 5 night renders, 1 disputed contact) and `unavailable` on 11 (metrics-eval re-run, closure round, 28 September: the D1 and All figures above are unchanged).

**Injected mode** (truth poses plus noise; same file): leg-drive MAE falls to 0.7% (bias −0.0), toss-forward to 2.6 cm (bias −2.5) and contact-forward to 3.0 cm (bias −3.0), which shows the forward and leg-drive failures are mostly MediaPipe's systematic offsets, not the method. Toss height gets worse with truth poses (MAE 6.3%), because MediaPipe reads raw heights about 3% high and partly cancels the depth-prior over-correction (§5). At D1 it fails the gate with truth poses (median 4.1%, p95 5.6%), so its app-pipeline pass rests on two biases cancelling that no real player has confirmed: since 28 September V1 needs both variants to pass, and toss height stays experimental until a V2 real-footage check (finding 41). Contact height passes both (method-only MAE 2.5%, p95 3.9%). Trophy pause (MAE 152 ms, coverage 19%) and landing (MAE 6.3 cm, p95 15.6 cm) get worse with injected noise.

### 3.3 Metrics without a clean pass or fail

- **Spreads** (toss-height, toss-forward, contact-height, rhythm): rest on **one 8-serve multi-serve clip** plus per-serve error analysis; the S9 variability family (20-serve blocks at several `sdScale` values) is not rendered. Pooled corrected SDs (`validation/results/metrics/rows.json`, default mode): toss height 10.5 cm vs true 9.7 cm; toss forward 9.6 cm vs 11.8 cm; rhythm 42.7 ms vs 47.9 ms; all within threshold and inside their ranges. **Contact-height spread read 0 cm against a true 1.9 cm** with the hit sound off: at 60 fps a spread this small is below the measurement noise, so the value shows the "at the limit of what we can measure" case, not accuracy (with the hit sound on: 1.93 cm vs 1.91 cm). The per-stratum headline spreads were correctly `TOO_FEW_SERVES` (4 serves per side).
- **Leg drive**: V1 in the engine although the D1 envelope fails (MAE 2.5% against 2%). The error is a persistent 2% low read of the hip rise by MediaPipe (method MAE 0.7% with injected noise), so it cancels in the only comparison the product makes: against the player's own serves. The value's basis states it. Recorded as `V1-synthetic-pass-limited`.
- **Serve count**: exact on all 122 clips, and 8 of 8 in the session clip when the engine sees full-rate poses (the offline metric run). The full app pipeline is a different story:
  - First end-to-end run (`validation/results/ui/engine-pipeline/e2e-report.json`, 04:08 UTC): the serve scan, which samples at 4 to 15 Hz, found **7 of 8** serves in the session clip.
  - After the sparse-sampling change (`app/src/analysis/serve/windows.ts`, METRICS §2.3.1), the performance owner's end-to-end runs (`validation/results/ui/harden-performance/bench/session__default__before.json`, 11:07 UTC; `sample-checkin__default__before.json`, 11:11 UTC) found a window around **every** serve: 8 of 8 and 16 of 16, each window holding the true contact. But the engine classified 1 and 2 of those serves `uncertain` (`BALL_NOT_TRACKED`; toss release and peak were found, contact fell back to the wrist estimate at confidence 0.4). Uncertain serves are not counted, so **`serve-count` read 7 (truth 8) and 14 (truth 16)**. In all three cases the scan's contact estimate was 0.33 to 0.54 s early. The single-serve runs (baseline, dist12, fps240) counted 1 of 1.
  - End-to-end recall on these five runs is therefore 24 of 27 serves (89%), against the METRICS §5.4 bar of 99%. The engine keeps `serve-count` at V1 on the offline evidence, so it is recorded as `V1-synthetic-pass-limited`, and the gap is flagged to engine-core. The uncounted serves stay in the player's list marked "Excluded from your stats" with "Include again", and the Metric info page says the count can read 1 or 2 short on longer sessions.
  - Re-checked on the integrated build (28 September), which includes the serve-scan change of this round (`serve/windows.ts`: 8 of 8 windows at every 15 Hz sampling phase in a Pass A simulation) and the faster pipeline: **unchanged**. The session clip counts 7 of 8 and the check-in 14 of 16, the same serves each time, over repeated runs in fresh browser contexts. The 16-serve re-test clip (`sample-retest`, not in the five runs above) counts 16 of 16. Across the six distinct clips run end to end: **40 of 43 serves counted (93%)**. The window-finding fix does not reach this: each uncounted serve has a window around it, but on each of them the scan's contact estimate was early and the ball was not tracked through contact.
  - **Resolved on the production build (engine-accuracy, 28 September; `validation/results/e2e-final/SUMMARY.md`).** Every uncounted serve had its toss track cut before the ball fell to contact, so the toss could not be fully analysed. Three causes, all in how the pipeline searched for the ball, none in the engine's maths: the scan's contact estimate took the tossing arm, still up at the top of the swing, for the hitting arm (it searched the last 0.6 s of the arm-up run; now the last 0.25 s, which cut contact estimates more than 0.25 s off from 8% to 2% of the corpus's 15 Hz samplings); the ball search switched from the toss band to the post-contact corridor too soon after that estimate (the band-plus-corridor phase now spans ±0.45 s); and when the setup pose gave no toss band, the band-plus-corridor phase searched the corridor alone and lost the ball at its peak (now the whole window crop). The engine also now counts a serve from the swing plus toss evidence even when the toss could not be fully analysed; its ball values then say why (`BALL_NOT_TRACKED`, `CONTACT_NOT_FOUND`). Production build, two runs per clip after the fixes, the same counts both times: **session 8 of 8, check-in 16 of 16, re-test 16 of 16, and 1 of 1 on baseline-s1, dist12-s1, default75-s1, fence9-s1 and fps240-s1: 45 of 45 counted, 0 false serves** (27 of 27 on the original five runs). The counting rule is unit-tested against a shadow swing (no ball, not counted) and a toss seen only rising (counted, ball values unavailable); the multi-serve clips' 1 to 3 dribbles before each serve were never counted.
  - **Final integration re-run** (28 September, 09:56 AEST; the final engine with the review fixes: one vote per serve for the session direction and view, one re-test per later visit; `validation/results/e2e-final/` overwritten): session 8 of 8, check-in 16 of 16, re-test 16 of 16, and 1 of 1 on each single-serve clip: **45 of 45, 0 false serves**, no contact withheld under the D2 rule, 0 console errors. Two per-serve differences from the engine-accuracy run, neither in counting or timing: `dist12-s1`'s leg drive and loading depth came out `experimental` (`POSE_LOW_QUALITY`, the 12 m clip's small player), and session serve 7's heights read about 11% high (contact height 1.71 against 1.54 before; its toss gravity fit gave a time-scale factor of 1.06 instead of 1.007, and the engine marked the serve's quality "usable"). Replaying the engine-accuracy run's own input with both the committed engine (`4478e16`) and the final engine gives 1.71 for that serve, so the change came from engine edits made after that run, not from the final-round review fixes; heights in these runs are `experimental` (`PITCH_UNKNOWN`) either way. Open for engine-core: a per-serve time-scale fit that departs from the clip's by 6% should not rescale that serve's heights.
  - **E1 resolved (closure round, 28 September).** The 1.06 was a symptom, not the cause: no per-serve fit rescales anything (the time base is a clip property: the container, else the median toss fall over the session, `engine.ts` `timeBaseOf`). Serve 7 had only 4 upright standing frames, so it took the session's standing height in the picture, a median over both court sides; it stood on the near side, where the player is about 20% taller in the picture, so every body-scaled value read about 11% high, and its toss's apparent gravity (which uses that scale) read 6% off. Now a serve with fewer than 5 upright frames takes its standing height from the serves at the same floor row (the same distance), else from a straight line through them (`sessionBodyHeight`), and a serve whose own toss falls more than 10% and 3σ away from the other serves' is flagged (`SCALE_INCONSISTENT` on its body-scaled values), never rescaled (`serveScaleOffsets`). Regression test on the stored production input (`validation/results/e2e-final/repro/session__default__e1-before.json`, `engine.test.ts`): serve 7's contact height 1.48 (truth 1.50; 1.71 before), toss 1.83 (truth 1.87), every serve's toss within 3% of the clip's time base. Production build re-run (closure round, `validation/results/e2e-final/SUMMARY.md` overwritten, one run per clip): **45 of 45 counted, 0 false serves**, 0 console errors; session contact-height MAE 0.033 (0.057 before), toss-height MAE 0.048 (0.073), serve 7's time-scale factor 0.987; the other seven clips unchanged.
  - No re-toss, shadow-swing or miss clips exist; those cases are covered by unit tests only. **Classification tightened (closure round, finding 23):** a `serve` now needs METRICS §2.3.4 contact evidence (an intersection, a bracket closed by an outgoing ball, a hit-sound onset, or the ball vanishing from its path above the head while the other arm is up), and the swing must come from the arm that did not toss, followed from the release by position (a relabelling pass without the "highest wrist at contact" cue, which a catching hand fools). A toss with no contact evidence is a re-toss when the ball comes back to a hand (tracked, or its path carried on up to 0.25 s past the last detection) or leaves the picture, and `other` (excluded, never counted) otherwise. Engine tests: a caught toss tracked into the hand, and caught tosses whose track is lost 0.10, 0.12, 0.15 and 0.20 s before the hand, with and without in-hand lead-in points, are all re-tosses (serve-count 0, re-toss count 1, no toss height in the session stats); a serve whose outgoing ball was not tracked and a swing and miss still count. Replayed on the stored production inputs of all 8 end-to-end clips, the counts are unchanged (45 of 45).
- **Session direction and view check** (review fix, 28 September; `engine.ts` `netDirVote`, `sessionEvidence`; METRICS §1.1, §2.3.7). Before, a single outgoing ball track could flip the net direction, or raise `VIEW_MISMATCH`, for a whole session. Now each counted serve casts one vote from its own matched outgoing ball and its landing step (no vote when they disagree; tracks outside every serve are ignored), and the player's entries are overturned only when at least 3 serves carry evidence and 70% of them contradict it, or, in a clip of fewer than 3 serves, every serve does. Replayed on the corpus (122 pipeline dumps, default and injected-pose variants, 244 runs): no metric value, warning or overall quality changed; the front-45 clips still raise `VIEW_MISMATCH` 5 of 5; a wrong camera-side entry ("back") was corrected on 116 of 116 side clips, including 8 of 8 serves in the session clip.
- **Contact timing in the full app pipeline** (found at integration, 28 September; scored with `perf-accuracy.mts`). On 2 of the 5 single-serve clips run end to end, the app placed contact about 0.27 s early: `dist12-s1` (270 ms, also at `b576aaa`, so not new this round) and `default75-s1` (268 ms; the same with the old GPU ball path and wide ball crop, so not caused by the performance changes). `baseline-s1`, `default75-s2` and `fps240-s1` were within 1.1 ms, and the multi-serve clips averaged about 1 ms. On `default75-s1` the "fused" contact landed 0.12 s after the toss peak: contact height was rejected as implausible, but the serve stayed in the stats with **toss drop 7 cm (truth 75 cm), toss-to-hit time 730 ms (truth about 1,000 ms) and leg drive off by about 11% of height, all labelled estimate**. The offline metric run gets this clip right (toss drop 75 cm), so the fault is in the pipeline's contact evidence, not the metric maths. Until engine-core fixes it, the end-to-end evidence for toss drop, rhythm and leg drive is weaker than §3.2 suggests.
  - **Root cause and fix (engine-accuracy, 28 September).** Replaying the engine on the production pipeline's own input (`tools/validate/e2e-replay.ts`) and diffing it against the offline input showed near-identical poses (0.014 statures apart) but a toss track that ended at 2.517 s against 2.783 s offline, with no outgoing ball: the toss had drifted forward past the edge of the pipeline's toss search band (x 0.559 of the frame width; the ball was at 0.561 to 0.566). The engine's `ball-bracket` method then placed contact where the ball vanished, and `wrist-apex`, searched only ±0.15 s around that estimate, agreed with it. The band now reaches 0.45 statures further towards the court and always covers the contact column. Production build afterwards: contact 0.1 ms (dist12-s1) and 0.2 ms (default75-s1) from the truth, toss drop 75 cm on both (truth 75), rhythm within 3.3 ms, leg drive within 1.5% and 3.1% of height; across all 8 clips contact MAE 0.1 to 0.8 ms.
  - **Fused-event rule (DECISIONS D2 addendum).** The engine now compares three independent contact signals: the ball, the hit sound and the hitting wrist's swing peak found on its own (not around the other estimates). When they disagree by more than 3 combined standard deviations, every value that depends on contact is capped at experimental (a majority of three, or a ball seen leaving on an outgoing track) or withheld (anything else, for example a ball that only vanished), with reason `CONTACT_NOT_FOUND` and the signals named in the value's basis. Replayed on the old production input, dist12-s1 and default75-s1 now withhold toss drop, rhythm, leg drive and contact height instead of reporting 7 cm and 730 ms as estimates. Over the 129 corpus serves the rule fires twice, both at dusk where MediaPipe missed the hitting arm: `dusk-s1` experimental, `dusk-s3` withheld (the ball evidence alone had confidence below 0.5); with the hit sound on, both are experimental. On the 45 production serves of the final run it never fires, and the swing peak is within 19 ms of contact at the 95th percentile (45 ms on the corpus). In the run before, it fired once, on session serve 3, where a mislocated wrist 0.38 s after contact passed for the swing peak; the ball had been seen leaving, so the values were kept but capped at experimental. The swing peak now ignores a lower arm-up blip after the swing.
- **Apex below contact** (plausibility, METRICS §4.2; closure round, finding 36): the rule "toss apex below contact height − 0.10 m rejects the apex" now runs only against a contact that is itself trusted (no D2 dispute, not wrist-only, the ball seen within 50 ms of it, the hitting arm in the picture, no dropped frames, and a contact value not withheld or capped for a contact reason). Before, a disputed or dropped-frame contact could remove a correct apex and add a hard reject that counts towards excluding the serve. Unit-tested; no corpus serve changed.
- **Deep-bend flag**: two-level error 0% (D1) and 6% (all), but the rendered front knee bends almost in the side-view image plane, which understates the knee-points-at-the-camera problem (`tools/synth/README.md`, "What the corpus shows"). The pass is not counted; experimental by design.
- **Rear knee band**: 6 of 6 rear serves banded correctly: too few, and the rear clips are filmed at 1.5 m, not from the raised rear set-up.
- **Capture quality**: the view check flagged all 5 front-45 clips (`VIEW_MISMATCH`) with no false alarms on side clips, and the tilt check refused all 5 dist4 clips (`CAMERA_TILTED`); the full flag matrix of METRICS §5.4 is not scored.
- **Not scored**: re-toss count (no renders), toss left-right and its spread and shoulder over shoulder (rear view; not scored against truth), repeatability (needs S9), rear average speed (§2.4), fatigue flag (no declining-contact scenario), load flag (arithmetic on logged volume; unit-tested only).

### 3.4 Event timing (`SUMMARY.md`, "event timing error", default mode; MAE / bias in ms)

| Event | 30 fps (6 clips) | 60 fps (105) | 120 fps (5) | 240 fps (13) |
|---|---|---|---|---|
| Toss release | 79.8 / +32.8 | 13.3 / −1.5 | 6.0 / −4.9 | 8.4 / +0.5 |
| Toss apex | 0.8 / −0.7 | 0.7 / 0.0 | 0.1 / 0.0 | 0.1 / 0.0 |
| Lowest hip (trophy) | 86.8 / +34.9 | 85.6 / +24.3 | 74.6 / +73.2 | 73.1 / +73.1 |
| Contact | 6.8 / −0.2 | 2.3 / −1.3 | 0.4 / −0.3 | 0.6 / −0.6 |
| Contact, hit sound on | 1.1 / +1.1 | 1.1 / −0.6 | 0.4 / −0.3 | 0.6 / −0.6 |
| Landing | 120.9 / +72.3 | 65.6 / +28.4 | 80.7 / +54.9 | 66.5 / +46.5 |
| Recovery end | 544.9 / −333.6 | 395.1 / −282.2 | 379.0 / −292.1 | 402.2 / −254.4 |
| Motion start | 55.6 / 0.0 | 124.3 / +65.0 | 34.5 / +27.8 | 100.3 / +90.1 |

Recovery end and motion start set phase boundaries only; no metric uses them.

### 3.5 Measured pose noise and left/right mirrors (`validation/results/metrics/noise.json`, 110 side-view clips)

Cleaned MediaPipe against truth, in body heights: mid-hip random SD 0.003 (p90 0.004), bias +0.007; lowest foot point random SD 0.003, bias −0.029; front toe x bias −0.020 (p90 −0.013); wrists random SD 0.019 to 0.037. The planning values of METRICS §1.2 (0.02 to 0.03) are 5 to 10 times the measured random noise, so detection thresholds use 3 × the measured noise per serve. A whole-body mirror fitted better than MediaPipe's labels on **37%** of side-view frames (median per clip, p90 44%); the engine's relabeller (`serve/relabel.ts`) brings that to **0%** (p90 11%).

### 3.6 Light from the pixels (`validation/results/light/SUMMARY.md`, `tools/validate/light-eval.ts`, 124 clips)

The condition class (METRICS §1.3) used to come only from the player's answer, and a clip with none was scored as daylight (finding 21). Now: no answer is class `unknown` (nothing validated, every value at most experimental), court lights and indoor courts are `night-lights`, and the pipeline measures the light on the serve scan (`app/src/analysis/quality/light.ts`: a 16 × 16 luma grid of every frame the scan decodes, the player's box left out). The pixels only ever lower the class: mains flicker of 3% or more makes it `flicker` (a `cq.flicker` warning; launch speed blocked, `FLICKER`, §3.25), and a near-black sky over a lit court (top band below 18 luma and below 0.2 of the court) turns a daylight answer into `night-lights`, with a warning that says so. On the renders, sampled like the scan (4 Hz plus a 15 Hz fill, so 100 Hz flicker shows at 5 Hz): flicker 11.1 to 11.7% on the 5 flickering night renders and at most 0.4% on the other 119; a dark sky on 5 of 5 night renders and on 0 of 119 daylight, overcast and dusk renders. Through the production build (`perf-bench.mjs`, closure round): `baseline-s1` sky 172 over a court at 94, flicker 0.2%, class `day`; `night240-s1` sky 1 over 157, flicker 10.1%, class `flicker`. A first rule (sky below 40, or below 0.35 of the court) called all 5 `apexout` daylight clips night (a fence filling the top of a low 4.5 m set-up: 29 over 94), so the rule needs both conditions at the lower thresholds. **Limits:** one synthetic night preset (240 fps, ±30% flicker), no flicker-free night render, no LED lights, no indoor hall, no auto-exposure hunting or rolling-shutter banding. The thresholds are initial values; on real courts a missed night leaves the class to the player's answer (the Record screen's Light chip now starts at court lights from 6 pm to 7 am, and imports must answer the light question).

---

## 4. Robustness by scenario

Default mode, from `SUMMARY.md` ("default: per metric × scenario"); MAE with bias in brackets; n serves. Heights in % of height. **Most scenario clips are at 5 m, closer than D1 allows, so their heights read low and are shown as experimental; compare within a column, not with the D1 rows of §3.2.**

| Scenario | Toss height | Contact height | Toss drop (cm) | Rhythm (ms) | Leg drive (% H) | Toss forward (cm) | Landing (cm) | What the product does |
|---|---|---|---|---|---|---|---|---|
| default75 (D1, 7.5 m portrait), n 3 | 0.7% (−0.7) | 0.3% (−0.2) | 0.2 | 10.1 | 2.8 (−2.8) | 6.3 (+6.3) | 4.3 | Contact height estimated; toss height experimental (method-only gate) |
| fence9 (D1, 9 m landscape), n 3 | 0.5% (+0.3) | 0.7% (−0.2) | 1.3 | 14.1 | 2.8 (−2.8) | 6.0 (+6.0) | 10.3, coverage 67% | Landing worst at the fence |
| dist7, n 5 | 1.7% (−1.7) | 1.0% (−1.0) | 0.2 | 9.7 | 2.2 | 7.4 | 4.4 | |
| dist12, n 5 | 1.5% (+0.7) | 0.9% (+0.5) | 0.2 | 11.5 | 1.7 | 8.2 | 6.5 | Pose needs the ROI crop here (§2.3) |
| baseline 5 m, n 5 | 5.5% (−5.5) | 3.7% (−3.7) | 0.2 | 5.2 | 2.3 | 5.2 | 4.3 | Heights capped experimental (< 6 m) |
| dist4, n 5 | unavailable (`CAMERA_TILTED`) | unavailable | 0.7 | 19.1 | 2.7 | unavailable | unavailable | Tilt check refuses heights and positions |
| fps30, n 5 | 5.5% | 3.6% | 1.9 | **83.2** (−48.1) | 2.4 | 5.8 | 5.7 | Rhythm experimental (`FPS_TOO_LOW`); trophy pause unavailable |
| fps120 / fps240, n 5 each | 5.3% / 4.9% | 3.6% / 3.4% | 0.2 / 0.2 | 6.0 / 9.9 | 2.5 / 2.4 | 4.6 / 5.6 | 3.1 / 3.7 | Contact timing 0.4 to 0.6 ms |
| slomo (240 as 30 fps), n 2 | 5.0% | 3.1% | 0.3 | 3.6 | 2.2 | 4.9 | 2.0 | Gravity check found ×0.125 (0.125 and 0.124) and re-timed; speed refused on a physics-only time base |
| crf18 / crf28 / crf36, n 5 each | 5.1 / 4.1 / 5.9% | 3.4 / 2.8 / 4.3% | 0.2 each | 5.4 / 6.3 / 7.0 | 2.4 / 2.3 / 2.6 | 5.2 / 5.0 / 4.6 | 4.3 / 4.1 / 2.7 | Compression barely matters on renders |
| overcast, n 5 | 4.1% | 3.0% | 0.2 | 4.6 | 1.9 | 5.6 | 3.4 | |
| dusk (1/60 s), n 5 | 4.1% | 1.8% (4 of 5) | **4.8** (4 of 5, coverage 75%) | 8.7 (4 of 5) | 1.5 (4 of 5) | 4.8 | 2.4 (4 of 5) | Drop least sure with heavy blur; contact-timed values withheld on dusk-s3 and experimental on dusk-s1 (fused-event rule, §3.3) |
| night240 (100 Hz flicker), n 5 | 3.1% | 2.0% | 0.2 | 9.8 | 0.5 | 6.8 | 4.7 | Ball flicker compensation works (ball study); the light check calls all 5 flicker (§3.6); **every metric still V0 at night** |
| shake, n 5 | 1.3% | 1.3% | 1.1 | 13.3 | 0.6 | 4.4 | 3.3 | Trophy pause and drive time unavailable (`POSE_LOW_QUALITY`); shoulder tilt 8.5° off |
| apexout, n 5 | 6.6% (4 of 5) | 4.2% | 0.2 | 12.0 | 2.1 | 5.3 | 3.5 | One apex refused (`APEX_OUT_OF_FRAME`); fitted apexes kept |
| lefty, n 5 | 6.7% | 5.0% | 0.7 | 6.9 | 0.9 | 2.4 | 1.8 | Trophy pause and drive time 1 of 5 measured, far off (142 ms, 128 ms) |
| h160 / h195, n 5 each | 1.7% / 3.9% | 0.6% / 2.5% | 0.7 / 0.5 | 4.6 / 5.4 | 1.9 / 1.5 | 4.7 / 6.7 | 2.9 / 4.5 | 1.60 m: trophy pause and drive time unavailable |
| beginner / advanced, n 5 each | 3.6% / 3.7% | 2.6% / 1.6% | 0.9 / 2.4 | 21.0 / 23.8 | 0.8 / 1.8 | 7.8 / 4.7 | 3.3 / 3.2 | Beginner: trophy pause unavailable; advanced rhythm coverage 80% |
| rear (5 m, 1.5 m high), n 5 | 6.1% | 3.5% | 0.9 | 12.2 | side only | side only | side only | Rear-only metrics scored on too few serves |
| front45 (wrong view), n 5 | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | `VIEW_MISMATCH` on 5 of 5; no false alarms on side clips |
| session (8 serves, 6 m), n 8 | 5.1% | 3.5% | 1.1 | 12.4 | 2.5 | 8.1 (coverage 75%) | 6.6 | See serve count, §3.3 |

The hit sound (audio mode) changes little except contact timing (2.3 → 1.1 ms at 60 fps) and toss drop (MAE 0.8 → 0.4 cm over all serves).

---

## 5. Failure cases and known biases

1. **MediaPipe's foot point sits about 2% of height behind the toe tip** (front toe x bias −0.020 of height, `noise.json`). Every forward position measured from the start toe therefore reads 4 to 5 cm long (toss-forward bias +6.7 cm and contact-forward +6.6 cm at D1). This is why both fail and stay experimental. Spreads are unaffected, because the offset is constant within a session.
2. **The hip rise reads about 2% of height low** (leg-drive bias −2.5% at D1, −1.8% overall; method bias −0.0% with injected noise). Persistent, so it cancels in player-relative bands; absolute leg-drive values must never be compared with published centre-of-mass rise (D5 already forbids this).
3. **Depth offset of the toss against the body.** The side view cannot see how far the toss sits towards the camera. The engine applies the METRICS prior of 0.30 ± 0.15 m; the generator's tosses sit 0.09 to 0.21 m nearer the camera. At the D1 distances heights land within about ±2% of height; at 5 m they read 4 to 7% low (baseline 5.5% low), so heights filmed closer than 6 m are capped at experimental per serve (`MIN_VALIDATED_DISTANCE_M` in `catalogue.ts`). With truth poses the bias is larger (MediaPipe's own ~3% overread partly cancels it): median 4.1% at D1, which fails the gate, so absolute toss height is experimental until real footage confirms the cancellation (§3.2). Real tosses may sit anywhere from 0 to 0.4 m off the body; this prior is the single largest unvalidated assumption behind absolute toss height.
4. **Left/right mirroring before relabelling.** MediaPipe's labels are mirrored on 37% of side-view frames (43 to 75% in the ROI study, front-45 67%); after `relabel.ts`, 0% median but 11% at p90. Roles are geometric, so metrics do not depend on labels, but a clip in the worst 10% can still misassign a limb for part of a serve.
5. **30 fps release timing.** Toss-release MAE is about 80 ms at 30 fps (13 ms at 60 fps), so rhythm at 30 fps is capped at experimental (`FPS_TOO_LOW`) and rhythm-spread is flagged at the measurement limit.
6. **Flat lowest-hip minimum.** Loading depth on the corpus is only 1 to 3% of height, so the time of the lowest hip is poorly defined (MAE 73 to 87 ms at every frame rate); drive time and trophy pause fail for this reason.
7. **Landing tails.** Typical landing error is small, but 1 in 20 serves at D1 is off by 24 cm or more, worst at the 9 m fence set-up (MAE 10.3 cm, coverage 67%).
8. **Shoulder tilt.** The rectified 2D angle is within 1.6° typically but p95 5.3° at D1 and 8.5° under camera shake. The generator holds the trophy thorax posture constant (16.83° in every serve), so band and player-relative discrimination are untestable on this corpus.
9. **Speed.** Ranges contain the truth but are about 45% of their midpoint wide against the 35% display limit, so no speed is ever shown on the corpus. Side-view speed at 60 fps is always refused (the ball leaves a 5 m frame 1 to 2 frames after contact).
10. **Rear view.** One clip produced a false bounce 205 ms early (net occlusion at a 1.5 m camera height); refused by the off-court guard. The rear bounce and speed path is unvalidated on rendered video.
11. **Serve counting in the full app** (§3.3): fixed on 28 September. The scan's contact estimate could be up to about half a second early and the ball search then cut the toss short, so 3 of 27 serves went uncounted. With the search fixes and the swing-plus-toss counting rule, the production build counts 45 of 45 with no false serves. The scan's contact estimate is still more than 0.25 s off on about 2% of 15 Hz samplings on the corpus (dusk footage, a late spurious arm), which the wider ball search absorbs; on real footage this is unmeasured.
12. **Capture-quality status** (resolved 28 September, DECISIONS D2 addendum): the engine now emits `capture-quality` through the catalogue like every value, so it is `experimental` (`VALIDATION_PENDING`, V0) with the basis "Automatic check, experimental (tested on simulated footage only)", matching "How we measure". It is a data-quality gate and stays on screen with experimental metrics off.
13. **Audio labels.** Footsteps are never labelled contact (52 `unknown`, 206 not detected); distractor hits on other courts are contact-like by design and ignored outside the serve's contact window (`SUMMARY.md`, "Audio labeller").

---

## 6. Timing, performance and privacy measured

All on one shared Windows laptop (Intel Core Ultra 5 226V, 8 logical CPUs, integrated GPU) in headless Edge 154. **No phone has been measured.** Other agents shared the machine, so times are indicative.

| Measurement | Result | Source |
|---|---|---|
| Pose inference (MediaPipe full, ROI, worker, GPU) | median 42 to 50 ms per frame (median of clip medians 50 ms); pose pass 58 ms per frame including decode (p10 44, p90 83) | `validation/results/metrics/pipeline/*.json` (`result.pose.stats`, `result.timings`) |
| Ball detection (harness, main thread) | 54 ms per frame median (p10 38, p90 129; the 12 m clips force a full-resolution grid, 190 to 220 ms per frame) | same; `ball/README.md` |
| Production pipeline, 1 serve (baseline-s1, 290 frames at 60 fps) | 16.2 s total: model start 3.7 s cold (0.6 s warm), Pass A 3.6 s, Pass B 7.8 s, key frames 0.4 s, measure 0.07 s | `validation/results/ui/engine-pipeline/e2e-report.json` |
| Production pipeline, session (8 serves, 73.5 s, 4,411 frames) | 97.4 s total: Pass A 33.2 s, Pass B 56.0 s, key frames 6.9 s; first ETA at 5.3 s. ARCHITECTURE §14 budgets 90 s for the reference case and 180 s on an iPhone 12; the laptop already exceeds the Pass B budget, because pose runs at about 60 ms per frame against the 25 ms iPhone assumption | same |
| Production pipeline, later runs (11:03 to 11:24 UTC, five owners sharing the laptop) | baseline-s1 25.8 s (37.9 s in a repeat at 11:24 with the machine busier: model start 9.2 s); dist12-s1 22.0 s; fps240-s1 (240 fps, 1 serve) 50.1 s; session 139.2 s (serve scan 41.3 s, full-rate pass 85.5 s, key frames 9.1 s); sample check-in (16 serves, 134.5 s of video) 254.0 s. Slower than the 04:08 run on the same clips, so contention dominates; **no conclusion about speed can be drawn from these** | `validation/results/ui/harden-performance/bench/*__default__*.json` (`report.result.timings`) |
| Cancel | settled 1.5 s after the last progress event, nothing half-saved | same |
| Production build, engine-accuracy runs (28 September, two runs per clip after the fixes, other owners sharing the laptop) | baseline-s1 18.3 to 19.1 s, dist12-s1 13.6 to 17.6 s, default75-s1 13.8 to 14.5 s, fence9-s1 16.0 to 29.7 s, fps240-s1 19.8 to 26.8 s, session 83.5 to 100.1 s, sample check-in 166.5 to 171.2 s, sample re-test 169.6 to 173.5 s (one re-test run was repeated after the browser closed mid-run). About 10% slower in total than the performance round (check-in 151.4 s); the wider ball search (§3.3) raised the check-in ball busy time from 47.3 s to 53.7 to 67.0 s, and the rest is within the shared laptop run-to-run spread. Not a speed conclusion | `validation/results/e2e-final/` as committed in `4478e16` (the final re-run below overwrote the run files) |
| Production build, final integration re-run (28 September, one run per clip, the machine otherwise idle apart from other owners' idle dev servers) | baseline-s1 20.1 s, dist12-s1 26.5 s, default75-s1 14.8 s, fence9-s1 27.5 s, fps240-s1 23.0 s, session 84.2 s (serve scan 33.7 s, full-rate pass 45.4 s), sample check-in 161.4 s (61.7 s, 91.1 s), sample re-test 163.1 s (63.3 s, 91.2 s). The 90 s target for a 16-serve clip is missed on this laptop | `validation/results/e2e-final/SUMMARY.md` |
| Production build, closure integration re-run (28 September, engine 1.1.1, one run per clip, nothing else running) | baseline-s1 17.1 s, dist12-s1 16.8 s, default75-s1 12.4 s, fence9-s1 16.2 s, fps240-s1 18.4 s, session 77.4 s (serve scan 29.4 s, full-rate pass 43.7 s), sample check-in 147.3 s (55.4 s, 84.9 s), sample re-test 148.0 s (55.4 s, 85.6 s). 45 of 45 counted, 0 false serves; the session clip's contact and toss height errors (0.033 and 0.048 of height) as in the closure-round run. The 90 s target for a 16-serve clip is still missed on this laptop | `validation/results/e2e-final/SUMMARY.md` |
| Sample-session build, engine 1.1.1 (closure integration; dev server, one page) | session 73.4 s, check-in 135.5 s, re-test 138.3 s; 8 of 8, 16 of 16 and 16 of 16 counted | `app/scripts/build-demo.mjs` log |
| Sample-session build, final engine (dev server, one page) | session 77.1 s, check-in 150.7 s, re-test 148.0 s; 8 of 8, 16 of 16 and 16 of 16 counted | `app/scripts/build-demo.mjs` log |
| Engine compute only (`analyseSession`) | 122 clips × 3 modes in 73 to 103 s including JSON parsing (under 0.3 s per clip and mode) | `SUMMARY.md` header |
| Privacy | 0 requests to hosts other than the dev server across all 122 runs; MediaPipe's telemetry POST blocked by the CSP and the worker's fetch guard (244 attempts stopped) | `validation/results/metrics/pipeline/SUMMARY.md`, "Privacy (CSP)" |

**After the performance-hardening pass** (published 28 September; `validation/results/ui/harden-performance/accuracy.md` and `bench/*__after.json`; before = `b576aaa`, after = `b576aaa` plus the pipeline, ball, video and pose changes, benchmarked on frozen snapshots on the same shared laptop, runs vary by about ±10%):

| Clip | Before | After | Main changes |
|---|---|---|---|
| baseline-s1 (1 serve) | 25.8 s | 14.8 s | |
| dist12-s1 (1 serve) | 22.0 s | 12.8 s | |
| fps240-s1 (1 serve, 240 fps) | 50.1 s | 16.8 s | Pass B 39.2 → 10.9 s |
| session (8 serves) | 139.2 s | 77.3 s | Pass A 41.3 → 29.7 s, Pass B 85.5 → 44.1 s, key frames 9.1 → 1.9 s |
| sample check-in (16 serves, 1080 × 1920, 60 fps) | 254.0 s | 151.4 s | Pass A 70.9 → 56.8 s, Pass B 161.1 → 88.6 s (ball busy time 132.7 → 47.3 s), key frames 18.1 → 3.7 s. **The 90 s target for this clip is missed.** |

- Serves found and counted were identical before and after on every clip (session 7 of 8, sample check-in 14 of 16, the single-serve clips 1 of 1). Event-timing errors moved by 1 ms or less (landing on fps240-s1: 3.4 ms smaller) and height-ratio errors by 0.001 or less, except contact height on the check-in (0.010 → 0.012) and pose error on fps240-s1 (0.093 → 0.098 of body height).
- Speed-ups measured but left off because they moved accuracy: one pose per frame in Pass B (lowest-hip timing 30–65 ms worse, loading depth 0.43 → 0.52–0.75 % of height), reusing Pass A poses, a 30 Hz slow core, seeding windows from Pass A.
- Cancel settles in 0.4–0.5 s during the probe, Pass A and Pass B; nothing is saved.

**Integrated build** (28 September, all five owners' changes together, the machine otherwise idle): the sample-session build (`app/scripts/build-demo.mjs`, dev server, one page) took 82.8 s for the session clip, 152.5 s for the check-in and 154.5 s for the re-test. Repeated analyses in fresh browser contexts (baseline-s1, sample check-in, sample re-test, each twice) gave the same serve counts every time (1, 14 of 16, 16 of 16) in 12.7–15.5 s, 146.6–152.8 s and 152.4–154.2 s.

**A production-only failure, found and fixed at integration.** All the timings above ran on the Vite dev server. The integrated flows run the production build (`vite preview`), and there the 16-serve check-in found **3 of 16 serves in 7 runs**, and the re-test 11 of 16 with 1 counted. Cause: Pass B's extra pose lane (new this round) starts loading while Pass A creates its ROI locator, both fetch the 9 MB pose model at once, and Chromium failed one request with `net::ERR_CACHE_WRITE_FAILURE`. A failed locator left Pass A on full frames for the whole clip; a failed extra lane fell back to the CPU delegate (the runs that "passed" were these). Model loading now retries the same delegate after a network failure, and a failed locator is retried on the next stream (`pose/mediapipeCore.ts`, `pose/README.md`). After the fix, 2 of 2 production runs of the check-in found 16 and counted 14 with every lane on the GPU, in 152.7–153.1 s, and the full integrated flows (production build, through the Import screen, light and dark) gave: baseline-s1 1 of 1 in 13.1–17.3 s, check-in 16 found and 14 counted in 151.0–155.0 s, re-test 16 of 16 in 153.5–153.7 s, no console errors and no request to any other host. **The dev-server benchmarks could not see this; performance changes need a production-build check.**

---

## 7. What is NOT validated

- **Real players.** One stylised synthetic body, one outfit, three skill profiles; no women's profile with a high toss, no foot-up variety beyond "advanced", no bystanders or players on the next court in the picture, no racket occlusion in truth visibility.
- **Real phones.** No iPhone or Android capture, no HEVC or rotation metadata, no variable frame rate or dropped frames, no rolling shutter, ISP sharpening, HDR or stabilisation crop, no 0.5x lens, no Safari/WKWebView decoder (the run used WebCodecs in Edge). Lens intrinsics were exact.
- **Phone tilt.** Pitch came from truth as a perfect sensor reading; the tilt family (3° and 5° measured with ±1° error, withheld pitch, 10° refusal), yaw and roll cells of METRICS §5.4 are not rendered. Unknown-pitch behaviour (`PITCH_UNKNOWN`) is unit-tested only. When the phone's level is only *assumed* from the player's mount answer, heights keep V1 only while the widened error, √(p95² + (1.96·σ_tilt)²), stays within the 5% p95 bar (`ASSUMED_LEVEL_HEIGHT_BUDGET` in `catalogue.ts`, using the D1 p95s of 2.7% and 2.0%). That rule is arithmetic on the synthetic p95, not a rendered test. One end-to-end check at integration (28 September, `default75-s1`, 7.5 m, imported with each answer): "Level mount" kept the serve's toss height at estimate (`TILT_UNKNOWN`); "Roughly level" and "Tilted, or not sure" made it experimental (`PITCH_UNKNOWN`), as the rule predicts for a 7.5 m set-up. Contact height on that serve was rejected as implausible under all three answers, so it says nothing about the rule.
- **Real lighting.** No night-comp lighting at 60 fps (night renders are 240 fps only), no LED or metal-halide colour, no uncontrolled auto-exposure, no multi-lamp flicker phases. Every metric is V0 at night.
- **Real courts.** One blue hard court with ITF lines; no synthetic grass (common at Australian clubs), no clay, no worn or other-colour lines, no busy fences or windbreaks behind the toss beyond the rendered ones.
- **Real audio.** Synthetic transients with no room reflections, wind or crowd; the hit-sound path is opt-in anyway.
- **Radar speed.** No radar reference exists; speed is experimental by design and never shown on the corpus.
- **Behaviours.** No re-toss, shadow swing, swing and miss, double knee bend, heavy dribbling, serve types beyond flat/slice/kick offsets, doubles serving spot, or second-serve blocks.
- **Variability and bands.** No 20-serve variability blocks (S9), so spreads, repeatability and band hysteresis rest on one 8-serve clip; provisional recreational bands are literature-based, not from players like ours.
- **Rear view as D1 specifies it** (raised 2.5 to 3 m, both service boxes, four-corner tap): not rendered.
- **Held-out test seeds** (§2.5) and the S11 injected-mirror family.

**Why synthetic results are an upper bound.** The renderer is cleaner than a phone (global shutter, no ISP, exact intrinsics, perfect pitch), the player is a smooth kinematic model that MediaPipe tracks easily (cartoon figures scored 0.018 to 0.027 of stature in the pose smoke tests), the ball is a perfect yellow sphere on uncluttered backgrounds, lighting is controlled, every clip has exactly one server, and the engine's bias terms were tuned on some of these same seeds. Every one of these can only add error on real courts. The synthetic figures tell us the method and the software are sound and where they break; they do not tell us real accuracy.

---

## 8. Closing the gap

1. **In-app annotation mode, "Check this serve"** (ARCHITECTURE §12; built in this hardening round). It is reached from Serve detail, More actions (`?mode=check`, `app/src/ui/screens/playback/check/`):
   - A person steps frame by frame and marks the toss release, the peak and contact frames with the ball's centre, the front-foot landing with the toe, and the standing height (head top and heel), plus an optional radar reading.
   - The app's own answers stay hidden until the marks are saved (blind marking). Then "App vs you" shows the per-serve comparison.
   - Checks stay on the phone and export as `serve-coach-validation@1` JSON with no video (`app/src/validation/annotation/`).
   - `tools/validate/annotation-eval.ts` pools the exports. It reports inter-annotator agreement first, then app against marks: Bland–Altman bias and 95% limits of agreement (repeated-measures variant), MAE with a player-cluster bootstrap, ICC(2,1), interval coverage, event-timing error distributions, and radar against the experimental speed range. It writes to `validation/real/<date>/` (METRICS §5.7).
   - The statistics are unit-tested (`agreement`, `evaluate`, `stats`, `store` tests; `tools/validate/annotation-eval.test.ts`). **No real clip has been marked yet.**
   - It compares seven per-serve metrics (`CHECKED_METRIC_IDS`): toss height, contact height, toss drop, rhythm, toss forward, contact forward and landing distance. Since 28 September it also takes the hip centre at release (optional), at its lowest and at contact, the trophy frame with both shoulders, and the lowest-hip frame, so it compares leg drive and loading depth (against 2.5% of height) and drive time (against 2 frames) using the engine's unrounded values (`app.mechanics` in the export), and reports the shoulder line at the trophy in words only, with no target. On a synthetic pooled test (10 players, 200 serves) an injected +1.2% leg-drive bias was measured at 0.8 to 1.6% and drive time stayed within 2 frames (`app/src/validation/annotation/legs.test.ts`); the integrated flow B marks all of these on an imported serve (`validation/results/ui/integrated/report.json`, `checkServe`). Not in it yet from the ARCHITECTURE §12 list: band labels (knee, shoulder) and net-post taps. Tape-landing and pole-height references have data fields but no marking step.
2. **[`docs/VALIDATION_PROTOCOL.md`](VALIDATION_PROTOCOL.md)** (v1, written in this round; a protocol, not a result): the recruitment, consent, filming and analysis protocol for V2 and V3. Its first V2 stage uses the METRICS §5.6 targets: at least 8 players (at least 3 women, a left-hander, 2 aged 40 or over, UTR 1 to 7), at least 150 serves per metric, both D1 set-ups, at least 3 conditions including **night-comp lighting on 2 lit courts (LED and metal halide)**, 60 fps plus a 120/240 fps subset, cross-day test-retest on 6 players, two blinded annotators on a quarter of serves with inter-rater agreement reported first, and thresholds frozen before data collection. The full library it plans is larger: 30 or more players (at least 12 women and 5 left-handers, three age bands), 1,500 or more checked serves, a high rear camera, a radar on 200 or more serves, sand-filled synthetic grass as well as acrylic courts, and HREC approval before anything is published. `annotation-eval.ts` prints the sample against those targets.
3. **V3 references**: a 4 m pole with 10 cm marks for heights, two synchronised phones for forward positions and spreads, tape-measured landing marks, a radar behind the server for speed (200+ serves), coaches for bands.
4. **Device QA**: sensor pitch against a spirit level (CoreMotion and `DeviceOrientationEvent`), per-lens intrinsics, and timing and memory on iPhone 12, 15 and 17-class devices (ARCHITECTURE §14).
5. **Synthetic gaps to render next**: the D1 envelope family of ARCHITECTURE §13 (ad court, both hands, 4K fence, tilt family, doubles spot), S9 variability blocks, S7 behaviours, S11 mirrors, 60 fps night-comp lighting, a raised rear view, and a disjoint test seed set.
6. **Score the full app, not only the engine.** Done for the synthetic corpus: `tools/validate/e2e-accuracy.mjs` builds the production bundle, runs the full pipeline on 8 clips (45 serves) and scores serve count, event timing and metrics against truth (`validation/results/e2e-final/`). Still open: only two runs per clip; heights there are imported without a mount answer, so they are `PITCH_UNKNOWN` and not corrected for camera pitch; and no real footage. The serve-count wording in `app/src/ui/screens/metric/validationWords.ts` and the `metrics.json` `validationNote` now say 45 of 45.

A metric moves to V2 only when it passes those rows in the condition classes tested; failing any row keeps or drops the level (METRICS §5.6).

---

## 9. What is functional, what uses external services, what is experimental

| Group | Metrics | How the player sees them |
|---|---|---|
| **Functional, from the camera (V1 in daylight)** | serve-count, toss-drop, toss-height-spread, toss-forward-spread, contact-height-ratio (≥ 6 m), contact-height-spread, rhythm-release-to-contact (≥ 45 fps), rhythm-spread, leg-drive (player-relative), loading-depth (descriptive) | Estimate with a range and n; "Checked on simulated serves in daylight. Not yet checked on real courts." Experimental at night |
| **Functional, player-entered** | serve-in-rate, first-serve-in-rate, second-serve-in-rate, double-faults, placement-zone, serve-type-mix, speed-radar-entered | You logged; Wilson intervals and counts are unit-tested |
| **Session line** | capture-quality | Shown as Good / Fair / Limited, always, labelled "Automatic check, experimental" (§5 item 12) |
| **Experimental (hidden unless the toggle is on)** | toss-apex-height as an absolute height (its spread and each toss against the player's own middle one stay Estimate), toss-forward, contact-forward, trophy-pause, drive-time, landing-distance, shoulder-tilt-trophy, deep-bend-flag, repeatability, speed-experimental, speed-average-rear, and the rear-view toss-lateral, toss-lateral-spread, knee-bend-band, shoulder-over-shoulder-contact | Flask chip, "about X to Y" ranges, never in headlines, focus, verdicts or Progress |
| **Not built or not yet computed** | retoss-count (classified, not validated), fatigue-flag (needs 16 serves in a block), load-flag (needs 28 days of history) | Unavailable with a reason until prerequisites hold |
| **Never available** | spin | "Not measurable by phone" |
| **External services** | **None.** No cloud AI, no analytics upload, no account. MediaPipe model and wasm are served from the app's own origin (`app/public/models`, `app/public/mediapipe`); the CSP allows `connect-src 'self' blob: data:` only (`app/index.html`). Optional cloud coaching phrasing (D9, ARCHITECTURE §10) is not in v1 | |

---

## 10. Where the numbers live and how to reproduce them

| File | What |
|---|---|
| `validation/synthetic/manifest.json`, `tools/synth/README.md` | Corpus and generator |
| `validation/results/metrics/pipeline/SUMMARY.md`, `pipeline/*.json` | The 122-clip perception run (per-clip scores, stage times, privacy) |
| `validation/results/metrics/SUMMARY.md`, `rows.json`, `<clip>.json` | Metric evaluation, 3 modes, acceptance table |
| `validation/results/metrics/noise.json` | Measured pose noise and mirror rates |
| `app/src/analysis/metrics/validation-summary.json` | Per-metric pass/fail figures; the app's "How we measure" reads it |
| `validation/results/ui/engine-pipeline/e2e-report.json` | Production pipeline end-to-end timings and serve finding |
| `validation/results/e2e-final/SUMMARY.md`, `accuracy.md`, `accuracy.json`, `counts.json`, `runs/` | Production-build end-to-end accuracy (8 clips, 45 serves): serve count, event timing, metric errors; each run keeps the engine's full input for `tools/validate/e2e-replay.ts` |
| `validation/results/ui/integrated/report.json` | Integrated flows A to D on the production build, light and dark: screenshots, console errors, requests to other hosts, the imports' serve counts, "Check this serve", PWA offline, paywall moments, match log and the beta report |
| `validation/results/smoke/SUMMARY.md` | Earlier 65-clip smoke run (superseded by `metrics/pipeline`) |
| `app/src/analysis/pose/README.md`, `app/src/analysis/ball/README.md` | Pose ROI study, ball study |
| `docs/specs/metrics.json` | `validationLevel`, `validationState`, `validationNote` per metric; `validationStates.lastRun` |

```sh
npx --prefix tools/synth tsx tools/synth/src/cli.ts --all          # render the corpus (~45-60 min)
node tools/validate/smoke.mjs --full                                # perception run, dumps per-frame data
app/node_modules/.bin/tsx tools/validate/metrics-eval.ts            # metric evaluation (~60-105 s)
node tools/validate/e2e-accuracy.mjs --port 5401                    # production build, full pipeline, 8 clips (~9 min)
cd app && npm run build && node scripts/integrated-flows.mjs --dark-c  # flows A-D, light and dark (~25 min)
cd app && node src/ui/screens/metric/tools/build-metric-data.mjs    # refresh the Metric info data files
cd app && npx vitest run src/ui/screens/metric                      # state agreement: catalogue.ts = metrics.json = results
```

In the app, **Profile → How we measure** shows every metric's state in words with its typical error, the three validation steps, the results by measurement and the known limits; each metric's page shows the pass mark, the test details for both clip sets and its limits. All of it says "simulated serves" and "not yet checked on real courts".
