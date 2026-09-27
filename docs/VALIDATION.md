# VALIDATION.md: how accurate Serve Coach is, and how we know (v1, synthetic)

**Status:** first accuracy report, 27 September 2026. **Audience:** the founder, and later App Store review, partners and due diligence. **Owner:** validation.
**One-line answer:** every figure below comes from computer-generated serves run through the app's real perception stack. No real serve footage has been analysed (founder instruction: no downloaded footage). Synthetic results are an **upper bound** on real-world accuracy, not a claim about it.

Sources of truth this report follows: `docs/DECISIONS.md` (D1, D2, D4, D5, D8, D11), `docs/specs/METRICS.md` (§1.3 levels and ceilings, §5 validation, §6 limits), `docs/specs/metrics.json` (now carries each metric's `validationLevel`, `validationState` and `validationNote`), `docs/specs/ARCHITECTURE.md` §12 to §14. Every number cites the results file it came from. Where a number is rounded in prose, the file has the exact value.

---

## 0. Bottom line

| | |
|---|---|
| What was tested | 122 rendered clips (129 serves) with exact ground truth, run through the app's own decoders, MediaPipe pose, ball tracker and engine in headless Edge; plus a pose crop study, a ball-layer study and 3 evaluation modes (§2). |
| Passed on simulated serves (V1, daylight) | **11 of 37 metric ids**: serve count, toss height, toss drop, contact height, rhythm, loading depth (clean passes); toss-height, toss-forward, contact-height and rhythm spreads, and leg drive (passes on limited evidence). These may show as **Estimate** in daylight. |
| Scored and not passed (stay experimental) | **7**: toss forward, contact forward, trophy pause, drive time, landing distance, shoulder tilt at the top, launch speed. |
| Scored but not settled | **3**: deep-bend flag, rear knee band, capture quality. |
| Not scored yet | **8**: re-toss count, toss left-right and its spread, shoulder over shoulder, repeatability, rear average speed, fatigue and load flags. |
| Nothing to validate for the camera | **8**: the 7 player-entered values and spin (never measured). |
| Under court lights | **Nothing is validated.** Every metric is V0 in the `night-lights` and `flicker` classes, so night sessions show at most Experimental. This matters: the launch segment plays night comp (D11). |
| Real players, phones, courts | **Not validated.** V2 (hand-marked real video) and V3 (physical references) have not started. |
| External services | **None in v1.** All analysis runs on the device; 0 requests left the machine across all 122 clip runs (§6). |

Typical errors at the recommended D1 set-ups (portrait 7 to 7.5 m, landscape at the fence 9 m; 11 clips, 11 serves; `app/src/analysis/metrics/validation-summary.json`): toss height 1.1% of height (about 2 cm for a 1.80 m player), contact height 0.7% of height, toss drop 0.5 cm, toss-to-hit time 11 ms, loading depth 0.4% of height, serve count exact. For each of the five measured values, the per-serve 95% range held the true value on 11 of 11 serves.

---

## 1. Definitions

**Status labels** (D2; METRICS §1.3): measured, estimated, player-entered, experimental, unavailable. Experimental values are hidden unless the player turns them on and never feed coaching; spin is always unavailable.

**Validation levels** cap the status, per condition class (`day`, `overcast`, `night-lights`, `flicker`): V0 not validated (ceiling experimental); V1 passes the synthetic matrix including the interval-coverage gate (ceiling estimated); V2 passes hand-marked real video (ceiling measured for timing metrics only); V3 passes a physical reference (the metric's target). Emitted status = min(target, ceiling), then the night cap, then per-value downgrades. The engine's table is `app/src/analysis/metrics/catalogue.ts` (`VALIDATION_LEVELS`, `statusCeiling`); `docs/specs/metrics.json` mirrors it and `app/src/ui/screens/metric/validationState.test.ts` fails if they drift.

**Validation state** (new field in `metrics.json`, defined in its `validationStates` block) says how a level was reached:

| State | Level | Meaning | Metrics |
|---|---|---|---|
| `V1-synthetic-pass` | V1 day, overcast | Passed the METRICS §5.4 S0 thresholds at the D1 set-ups | toss-apex-height, toss-drop, contact-height-ratio, rhythm-release-to-contact, loading-depth |
| `V1-synthetic-pass-limited` | V1 day, overcast | V1, but on thin or partial evidence (§3.3) | serve-count, toss-height-spread, toss-forward-spread, contact-height-spread, rhythm-spread, leg-drive |
| `V1-synthetic-fail` | V0 | Scored, failed at least one threshold | toss-forward, contact-forward, trophy-pause, drive-time, landing-distance, shoulder-tilt-trophy, speed-experimental |
| `V0-synthetic-inconclusive` | V0 | Scored, but the corpus cannot test what matters | deep-bend-flag, knee-bend-band, capture-quality |
| `V0-unvalidated` | V0 | Not scored against truth yet | retoss-count, toss-lateral, toss-lateral-spread, shoulder-over-shoulder-contact, repeatability, speed-average-rear, fatigue-flag, load-flag |
| `not-applicable` | V0 (no cap: status is player-entered or unavailable) | Player-entered, or never measured | serve-in-rate, first-serve-in-rate, second-serve-in-rate, double-faults, placement-zone, serve-type-mix, speed-radar-entered, spin |

**Error terms.** Error = engine value minus truth, per serve. **Bias** = mean error. **MAE** = mean absolute error (the "typical error" players see). **p95** = 95th percentile of the absolute error ("1 in 20 serves off by this much or more"). **Coverage** = share of truths inside the engine's own per-serve 95% interval; the V1 gate is 93% or more (METRICS §1.2, §5.1). **n** = serves scored. Height ratios are written as % of standing height (0.011 = 1.1%).

**Clip sets.** *D1 envelope* = the 11 clips filmed at the recommended set-ups: `default75-s1..3` (portrait, 7.5 m from the centre mark, level phone 1.4 m high), `fence9-s1..3` (landscape at the fence, 9 m, 1.6 m) and `dist7-s1..5` (portrait, 7 m from the front toe). *All side-view daylight clips at 60 fps or more* = 94 or 95 serves, including the 5 m reference clips, which are closer than D1 allows. Pass or fail for V1 is judged on the D1 envelope (`validation/results/metrics/SUMMARY.md`, "Acceptance").

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

**Reproducibility.** On 27 September 2026 at 10:52 UTC this report re-ran `metrics-eval.ts` against the current working tree (commit b576aaa), writing to a scratch folder: every accuracy table was identical to the committed `SUMMARY.md` (only the pose-noise lines differ, because they read `noise.json` from the output folder). Engine-core re-ran it at 10:58 UTC with the same tables.

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
| serve-count | D1 / All | 11 / 95 | 0 | 0 wrong | 0 | – | precision and recall ≥ 99% | PASS / PASS | Estimate; measured once the player confirms the strip (Experimental) |
| toss-apex-height | D1 | 11 | −0.9% | 1.1% (median 1.1%) | 2.7% | 100% | median ≤ 2.5%, p95 ≤ 5%, cov ≥ 93% | **PASS** | Estimate at ≥ 6 m; Experimental closer (Experimental) |
| | All | 94 | −3.6% | 3.9% (median 4.3%) | 6.9% | 100% | | FAIL | |
| toss-drop | D1 | 11 | +0.2 cm | 0.5 cm | 3.6 cm | 100% | MAE ≤ 5 cm, cov ≥ 93% | **PASS** | Estimate (Experimental) |
| | All | 94 | −0.4 cm | 0.7 cm | 3.6 cm | 99% | | PASS | |
| contact-height-ratio | D1 | 11 | −0.6% | 0.7% | 2.0% | 100% | MAE ≤ 3%, p95 ≤ 5%, cov ≥ 93% | **PASS** | Estimate at ≥ 6 m; Experimental closer (Experimental) |
| | All | 95 | −2.3% | 2.5% | 5.03% | 100% | | FAIL (p95) | |
| rhythm-release-to-contact | D1 | 11 | −3.9 | 11.0 | 27.5 | 100% | MAE ≤ 1 frame + 5 ms (21.7 ms at 60 fps), cov ≥ 93% | **PASS** | Estimate at ≥ 45 fps; Experimental at 30 fps (Experimental) |
| | All | 95 | +2.1 | 9.3 | 27.5 | 99% | | PASS | |
| loading-depth | D1 | 11 | −0.4% | 0.4% | 0.8% | 100% | MAE ≤ 2% | **PASS** | Estimate, descriptive only (Experimental) |
| | All | 95 | −0.3% | 0.4% | 1.1% | 100% | | PASS | |
| leg-drive | D1 | 11 | −2.5% | 2.5% | 3.1% | 100% | MAE ≤ 2%, cov ≥ 93% | FAIL | Estimate, player-relative band only (Experimental); see §3.3 |
| | All | 95 | −1.8% | 1.9% | 3.0% | 100% | | PASS | |
| toss-forward | D1 | 11 | +6.7 cm | 6.7 cm | 8.6 cm | 100% | MAE ≤ 5 cm, p95 ≤ 10, cov ≥ 93% | **FAIL** | Experimental |
| | All | 94 | +5.4 cm | 5.4 cm | 8.3 cm | 99% | | FAIL | |
| contact-forward | D1 | 11 | +6.6 cm | 6.6 cm | 8.5 cm | 100% | MAE ≤ 6 cm, p95 ≤ 12, cov ≥ 93% | **FAIL** | Experimental |
| | All | 95 | +5.1 cm | 5.1 cm | 8.5 cm | 98% | | PASS | |
| trophy-pause | D1 | 6 | −100 | 100 | 177 | 50% | MAE ≤ 60 ms | **FAIL** | Experimental |
| | All | 68 | −31 | 65 | 177 | 60% | | FAIL | |
| drive-time | D1 | 6 | −64 | 64 | 129 | 83% | MAE ≤ 50 ms, cov ≥ 93% | **FAIL** | Experimental |
| | All | 68 | −66 | 75 | 133 | 74% | | FAIL | |
| landing-distance | D1 | 11 | +1.4 cm | 6.0 cm | 24.1 cm | 91% | MAE ≤ 8 cm, p95 ≤ 15, cov ≥ 93% | **FAIL** | Experimental, trend only |
| | All | 95 | +3.1 cm | 3.8 cm | 7.4 cm | 99% | | PASS | |
| shoulder-tilt-trophy | D1 | 11 | +1.6° | 1.6° | 5.3° | – | rectified 2D within ±4° of 3D (p95) | **FAIL** | Experimental (degrees never shown) |
| | All | 95 | +0.8° | 2.3° | 8.3° | – | | FAIL | |
| deep-bend-flag | D1 / All | 11 / 94 | – | 0% / 6% two-level error | – | – | two-level error ≤ 15% | PASS / PASS, not counted (§3.3) | Experimental by design |
| speed-experimental | 120/240 fps | 0 shown of 129 | – | – | – | 7 of 7 ranges held the truth in the ball study; 18 of 18 in the pipeline run | coverage ≥ 90%, median error ≤ 5%, range ≤ 35% of midpoint | FAIL (ranges about 45% wide: `RANGE_TOO_WIDE` on 15 clips, `FPS_TOO_LOW` on 100) | Unavailable by default; never shown on the corpus |

The status distribution the engine actually emitted per metric over all 129 serves is in `SUMMARY.md` ("status distribution"); for example toss-apex-height was `estimated` on 21 serves, `experimental` (`VALIDATION_PENDING`, closer than 6 m) on 97 and `unavailable` on 11 (tilted 4 m clips, front-45 clips, one apex out of frame).

**Injected mode** (truth poses plus noise; same file): leg-drive MAE falls to 0.7% (bias −0.0), toss-forward to 2.6 cm (bias −2.5) and contact-forward to 3.0 cm (bias −3.0), which shows the forward and leg-drive failures are mostly MediaPipe's systematic offsets, not the method. Toss height gets worse with truth poses (MAE 6.3%), because MediaPipe reads raw heights about 3% high and partly cancels the depth-prior over-correction (§5). Trophy pause (MAE 152 ms, coverage 19%) and landing (MAE 6.3 cm, p95 15.6 cm) get worse with injected noise.

### 3.3 Metrics without a clean pass or fail

- **Spreads** (toss-height, toss-forward, contact-height, rhythm): rest on **one 8-serve multi-serve clip** plus per-serve error analysis; the S9 variability family (20-serve blocks at several `sdScale` values) is not rendered. Pooled corrected SDs (`validation/results/metrics/rows.json`, default mode): toss height 10.5 cm vs true 9.7 cm; toss forward 9.6 cm vs 11.8 cm; rhythm 42.7 ms vs 47.9 ms; all within threshold and inside their ranges. **Contact-height spread read 0 cm against a true 1.9 cm** with the hit sound off: at 60 fps a spread this small is below the measurement noise, so the value shows the "at the limit of what we can measure" case, not accuracy (with the hit sound on: 1.93 cm vs 1.91 cm). The per-stratum headline spreads were correctly `TOO_FEW_SERVES` (4 serves per side).
- **Leg drive**: V1 in the engine although the D1 envelope fails (MAE 2.5% against 2%). The error is a persistent 2% low read of the hip rise by MediaPipe (method MAE 0.7% with injected noise), so it cancels in the only comparison the product makes: against the player's own serves. The value's basis states it. Recorded as `V1-synthetic-pass-limited`.
- **Serve count**: exact on all 122 clips, and 8 of 8 in the session clip when the engine sees full-rate poses. In the production pipeline end-to-end run, whose serve scan samples at 4 to 15 Hz, it found **7 of 8** serves in that clip (`validation/results/ui/engine-pipeline/e2e-report.json`, 04:08 UTC). An engine change in progress today (`app/src/analysis/serve/windows.ts`, METRICS §2.3.1 "Sparse sampling") raises simulated Pass A recall to 100% on the corpus dumps; it has not been re-run end to end. No re-toss, shadow-swing, miss or dribble-heavy clips exist. Recorded as `V1-synthetic-pass-limited`.
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

---

## 4. Robustness by scenario

Default mode, from `SUMMARY.md` ("default: per metric × scenario"); MAE with bias in brackets; n serves. Heights in % of height. **Most scenario clips are at 5 m, closer than D1 allows, so their heights read low and are shown as experimental; compare within a column, not with the D1 rows of §3.2.**

| Scenario | Toss height | Contact height | Toss drop (cm) | Rhythm (ms) | Leg drive (% H) | Toss forward (cm) | Landing (cm) | What the product does |
|---|---|---|---|---|---|---|---|---|
| default75 (D1, 7.5 m portrait), n 3 | 0.7% (−0.7) | 0.3% (−0.2) | 0.2 | 10.1 | 2.8 (−2.8) | 6.3 (+6.3) | 4.3 | Heights estimated |
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
| dusk (1/60 s), n 5 | 4.1% | 1.5% | **4.0** (coverage 80%) | 7.7 | 1.6 | 4.8 | 2.7 | Drop least sure with heavy blur |
| night240 (100 Hz flicker), n 5 | 3.1% | 2.0% | 0.2 | 9.8 | 0.5 | 6.8 | 4.7 | Ball flicker compensation works (ball study); **every metric still V0 at night** |
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
3. **Depth offset of the toss against the body.** The side view cannot see how far the toss sits towards the camera. The engine applies the METRICS prior of 0.30 ± 0.15 m; the generator's tosses sit 0.09 to 0.21 m nearer the camera. At the D1 distances heights land within about ±2% of height; at 5 m they read 4 to 7% low (baseline 5.5% low), so heights filmed closer than 6 m are capped at experimental per serve (`MIN_VALIDATED_DISTANCE_M` in `catalogue.ts`). With truth poses the bias is larger (MediaPipe's own ~3% overread partly cancels it). Real tosses may sit anywhere from 0 to 0.4 m off the body; this prior is the single largest unvalidated assumption behind absolute toss height.
4. **Left/right mirroring before relabelling.** MediaPipe's labels are mirrored on 37% of side-view frames (43 to 75% in the ROI study, front-45 67%); after `relabel.ts`, 0% median but 11% at p90. Roles are geometric, so metrics do not depend on labels, but a clip in the worst 10% can still misassign a limb for part of a serve.
5. **30 fps release timing.** Toss-release MAE is about 80 ms at 30 fps (13 ms at 60 fps), so rhythm at 30 fps is capped at experimental (`FPS_TOO_LOW`) and rhythm-spread is flagged at the measurement limit.
6. **Flat lowest-hip minimum.** Loading depth on the corpus is only 1 to 3% of height, so the time of the lowest hip is poorly defined (MAE 73 to 87 ms at every frame rate); drive time and trophy pause fail for this reason.
7. **Landing tails.** Typical landing error is small, but 1 in 20 serves at D1 is off by 24 cm or more, worst at the 9 m fence set-up (MAE 10.3 cm, coverage 67%).
8. **Shoulder tilt.** The rectified 2D angle is within 1.6° typically but p95 5.3° at D1 and 8.5° under camera shake. The generator holds the trophy thorax posture constant (16.83° in every serve), so band and player-relative discrimination are untestable on this corpus.
9. **Speed.** Ranges contain the truth but are about 45% of their midpoint wide against the 35% display limit, so no speed is ever shown on the corpus. Side-view speed at 60 fps is always refused (the ball leaves a 5 m frame 1 to 2 frames after contact).
10. **Rear view.** One clip produced a false bounce 205 ms early (net occlusion at a 1.5 m camera height); refused by the off-court guard. The rear bounce and speed path is unvalidated on rendered video.
11. **Serve finding at low sampling rates** (§3.3): 1 of 8 serves missed in the production scan of the session clip; fix in progress, not re-verified end to end.
12. **Capture-quality status.** `engine.ts` emits `capture-quality` as `measured` directly, while the catalogue level (V0) caps it at experimental; "How we measure" therefore lists it as experimental. One of the two should change (engine-core decision).
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
| Cancel | settled 1.5 s after the last progress event, nothing half-saved | same |
| Engine compute only (`analyseSession`) | 122 clips × 3 modes in 73 to 103 s including JSON parsing (under 0.3 s per clip and mode) | `SUMMARY.md` header |
| Privacy | 0 requests to hosts other than the dev server across all 122 runs; MediaPipe's telemetry POST blocked by the CSP and the worker's fetch guard (244 attempts stopped) | `validation/results/metrics/pipeline/SUMMARY.md`, "Privacy (CSP)" |

A performance-hardening pass is running in parallel (`validation/results/ui/harden-performance/`); its numbers supersede these when published.

---

## 7. What is NOT validated

- **Real players.** One stylised synthetic body, one outfit, three skill profiles; no women's profile with a high toss, no foot-up variety beyond "advanced", no bystanders or players on the next court in the picture, no racket occlusion in truth visibility.
- **Real phones.** No iPhone or Android capture, no HEVC or rotation metadata, no variable frame rate or dropped frames, no rolling shutter, ISP sharpening, HDR or stabilisation crop, no 0.5x lens, no Safari/WKWebView decoder (the run used WebCodecs in Edge). Lens intrinsics were exact.
- **Phone tilt.** Pitch came from truth as a perfect sensor reading; the tilt family (3° and 5° measured with ±1° error, withheld pitch, 10° refusal), yaw and roll cells of METRICS §5.4 are not rendered. Unknown-pitch behaviour (`PITCH_UNKNOWN`) is unit-tested only.
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

1. **In-app annotation mode** (ARCHITECTURE §12): hidden validation mode (tap the version 7 times) with frame stepping, event marks, tap points (ball at apex and contact, toes, hips, head top and floor, net post), band labels, radar and tape references, blind second annotator, and `validation/compare.ts` reporting n, coverage, bias, MAE and 95% limits of agreement per metric, split by set-up and court side; exports `serve-coach-validation@1.json` without video.
2. **`docs/VALIDATION_PROTOCOL.md`** (being written in parallel): the recruitment, consent, filming and analysis protocol for V2 and V3. METRICS §5.6 sets the targets: at least 8 players (at least 3 women, a left-hander, 2 aged 40 or over, UTR 1 to 7), at least 150 serves per metric, both D1 set-ups, at least 3 conditions including **night-comp lighting on 2 lit courts (LED and metal halide)**, 60 fps plus a 120/240 fps subset, cross-day test-retest on 6 players, two annotators on a quarter of serves with inter-rater agreement reported first, and thresholds frozen before data collection.
3. **V3 references**: a 4 m pole with 10 cm marks for heights, two synchronised phones for forward positions and spreads, tape-measured landing marks, a radar behind the server for speed (200+ serves), coaches for bands.
4. **Device QA**: sensor pitch against a spirit level (CoreMotion and `DeviceOrientationEvent`), per-lens intrinsics, and timing and memory on iPhone 12, 15 and 17-class devices (ARCHITECTURE §14).
5. **Synthetic gaps to render next**: the D1 envelope family of ARCHITECTURE §13 (ad court, both hands, 4K fence, tilt family, doubles spot), S9 variability blocks, S7 behaviours, S11 mirrors, 60 fps night-comp lighting, a raised rear view, and a disjoint test seed set.

A metric moves to V2 only when it passes those rows in the condition classes tested; failing any row keeps or drops the level (METRICS §5.6).

---

## 9. What is functional, what uses external services, what is experimental

| Group | Metrics | How the player sees them |
|---|---|---|
| **Functional, from the camera (V1 in daylight)** | serve-count, toss-apex-height (≥ 6 m), toss-drop, toss-height-spread, toss-forward-spread, contact-height-ratio (≥ 6 m), contact-height-spread, rhythm-release-to-contact (≥ 45 fps), rhythm-spread, leg-drive (player-relative), loading-depth (descriptive) | Estimate with a range and n; "Checked on simulated serves in daylight. Not yet checked on real courts." Experimental at night |
| **Functional, player-entered** | serve-in-rate, first-serve-in-rate, second-serve-in-rate, double-faults, placement-zone, serve-type-mix, speed-radar-entered | You logged; Wilson intervals and counts are unit-tested |
| **Session line** | capture-quality | Shown as Good / Fair / Limited (see §5 item 12 on its status) |
| **Experimental (hidden unless the toggle is on)** | toss-forward, contact-forward, trophy-pause, drive-time, landing-distance, shoulder-tilt-trophy, deep-bend-flag, repeatability, speed-experimental, speed-average-rear, and the rear-view toss-lateral, toss-lateral-spread, knee-bend-band, shoulder-over-shoulder-contact | Flask chip, "about X to Y" ranges, never in headlines, focus, verdicts or Progress |
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
| `validation/results/smoke/SUMMARY.md` | Earlier 65-clip smoke run (superseded by `metrics/pipeline`) |
| `app/src/analysis/pose/README.md`, `app/src/analysis/ball/README.md` | Pose ROI study, ball study |
| `docs/specs/metrics.json` | `validationLevel`, `validationState`, `validationNote` per metric; `validationStates.lastRun` |

```sh
npx --prefix tools/synth tsx tools/synth/src/cli.ts --all          # render the corpus (~45-60 min)
node tools/validate/smoke.mjs --full                                # perception run, dumps per-frame data
app/node_modules/.bin/tsx tools/validate/metrics-eval.ts            # metric evaluation (~75-105 s)
cd app && node src/ui/screens/metric/tools/build-metric-data.mjs    # refresh the Metric info data files
cd app && npx vitest run src/ui/screens/metric                      # state agreement: catalogue.ts = metrics.json = results
```

In the app, **Profile → How we measure** shows every metric's state in words with its typical error, the three validation steps, the results by measurement and the known limits; each metric's page shows the pass mark, the test details for both clip sets and its limits. All of it says "simulated serves" and "not yet checked on real courts".
