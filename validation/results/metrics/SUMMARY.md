# Metric validation on the synthetic corpus (engine-core)

Generated 2026-09-27T10:58:41.123Z by `tools/validate/metrics-eval.ts` in 103 s over 122 clips.

Inputs are the app pipeline's REAL outputs for each rendered clip (cleaned MediaPipe poses, ball candidates, tracks and toss analysis, audio onsets; `smoke.mjs --full`), with the truth camera pitch passed as an in-app sensor reading. Truth is the generator's `truth.json` and `truth-extra.json` (`canonical`). No real footage is involved; every figure is synthetic (METRICS §6 item 8).

Variants: **default** (hit sound off), **audio** (hit sound on), **injected** (truth landmarks + planning noise 0.02 BH, speed blur, swaps and a persistent setup mirror, cleaned like the app; same ball data). Coverage = share of truths inside the per-serve 95% interval (V1 gate ≥ 93%).

## Findings and engine decisions

- **Measured pose noise (METRICS §5.5; `validation/results/metrics/noise.json`, `tools/validate/metrics-eval.noise.ts`).** Cleaned MediaPipe vs truth, side view, in body heights (BH): mid-hip random SD 0.003 (p90 0.004), bias 0.007 (p90 0.010); lowest foot point in stance random SD 0.003 (p90 0.007), bias -0.029 (p90 -0.025); front toe x bias -0.020 (p90 -0.013); wrists random SD 0.037 (p90 0.048). The planning values of §1.2 (0.02–0.03 BH) are about 5–10× the measured random noise, so detection thresholds use max(floor, 3 × measured noise per serve).
- **Left/right mirror fix.** A whole-body mirror fit MediaPipe better than its own labels in 37% of side-view frames (median per clip; the brief quoted 36%), typically one persistent mirrored stretch before release. `serve/relabel.ts` (two-state Viterbi: limb continuity + tossing hand near the ball, highest wrist at contact, front foot towards the net) brings it to 0% (p90 11%). Roles used by metrics stay geometric (§1.1).
- **Audio labeller (`video/audio.ts`).** The earlier score labelled the racket pop `unknown` and footsteps `contact` on every clip. Now (onsets matched to the rendered sounds within 5 ms): bounce → bounce 129; bounce-secondary → (no onset) 71; bounce-secondary → bounce 64; contact → contact 129; distractor → (no onset) 1; distractor → contact 7; dribble → bounce 17; footstep → (no onset) 206; footstep → unknown 52. Distractor hits on another court are `contact`-like by design and are ignored unless they fall in the serve's contact window.
- **Release (hero 3 timing).** The ball hinge fit reads the release ~12 ms early at ≥ 60 fps on development seeds s1–s3 (test seeds ~21 ms): corrected by +12.5 ms, σ floor 25 ms kept. The pose hand-separation method lags by ~60 ms (the separation threshold is crossed after the hand decelerates) and is used only as a lag-corrected fallback. At 30 fps the hinge fit is unreliable (MAE ~80 ms): σ ≥ 100 ms and rhythm capped at experimental (FPS_TOO_LOW).
- **Contact.** `ball-intersection` (outgoing line meets the toss parabola) MAE ≈ 1 ms at ≥ 60 fps; `ball-bracket` bias +3.9 ms (β_occ −4 ms), wrist apex bias −7.4 ms (β_w +7.4 ms), all calibrated on s1–s3.
- **Depth prior (§3.2).** The generator renders tosses 0.09–0.21 m nearer the camera than the body; the spec prior is 0.30 ± 0.15 m (flat/slice). It is kept (real-world evidence, σ in σ_p). At the D1 distances (7–9 m) corrected heights are within ±2% of height; at 5 m they read 4–7% low, so heights nearer than 6 m are capped at experimental (VALIDATION_PENDING). With truth landmarks (injected) the bias is larger (MediaPipe reads raw heights ~3% high, partly cancelling).
- **Leg drive.** Method error with injected noise: MAE ≈ 0.6% of height. MediaPipe's hip landmark reads the rise ~2% of height low (posture-dependent, persistent, §1.2 σ_p): it cancels in the player-relative band and is stated in the basis.
- **Trophy (lowest hip).** The minimum is flat (loading depth 1–3% of height on the corpus): timing MAE ≈ 75–90 ms, so `drive-time` fails its 50 ms threshold and stays experimental; σ now grows with the flatness (45–150 ms). Acceptance depth uses 3 × measured hip noise (floor 0.01 BH) instead of the planning 0.03 BH.
- **Landing.** Each foot is measured against its own standing level (the far foot projects higher); small recreational jumps (2–5 cm) are found by the foot coming back down through 35% of its lift. `landing-distance` stays experimental (p95 fails on the D1 set and with injected foot noise).
- **Start toe S0.** MediaPipe's foot point jumps back by up to 0.1 BH for a few frames as the tossing arm passes at release, so S0 is the median over the planted stance up to release (not only release ± 0.1 s). The foot point still sits ~0.02 BH behind the toe tip: forward positions read ~4–5 cm long and fail MAE ≤ 5 cm narrowly (V0); their spreads are unaffected.
- **View check.** Declared side but filmed at 45° in front: the served ball rises in the picture (< −1 BH/s) → VIEW_MISMATCH on all 5 front45 clips; no false alarms on side clips.
- **Spreads.** The corpus has one multi-serve clip (8 serves, 4 per court side, so the per-stratum spreads are correctly TOO_FEW_SERVES); pooled over all 8 the corrected SDs are within threshold (toss height +0.8 cm, forward −2.2 cm, rhythm −5 ms). The S9 variability family (20-serve blocks, sdScale) is not rendered yet, so spread V1 rests on this block plus per-serve error analysis.
- **Trophy pause** thresholds were grid-searched on development seeds (`tools/validate/metrics-eval.grid.ts`: pelvis 0.02 BH/s, wrists 0.2 BH/s); MAE ~65 ms stays above 60 ms, so it stays experimental.

## default: per metric (all clips)

| metric | unit | n measured | bias | MAE | p95 | max | coverage | status distribution |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| serve-count | count | 122 of 122 | 0.0 | 0.0 | 0.0 | 0.0 | – | estimated 117, experimental 5 |
| toss-apex-height | ratio | 118 of 129 | -0.039 | 0.041 | 0.073 | 0.091 | 100% (118) | experimental:VALIDATION_PENDING 97, unavailable:APEX_OUT_OF_FRAME 1, estimated 21, unavailable:CAMERA_TILTED 5, unavailable:VIEW_MISMATCH 5 |
| toss-forward | cm | 112 of 129 | 5.7 | 5.7 | 8.7 | 11.9 | 97% (112) | experimental:VALIDATION_PENDING 112, unavailable:APEX_OUT_OF_FRAME 1, unavailable:CAMERA_TILTED 5, unavailable:VIEW_MISMATCH 5, unavailable:NEEDS_SIDE_VIEW 6 |
| toss-lateral | cm | 0 of 129 | – | – | – | – | – | unavailable:NEEDS_REAR_VIEW 123, experimental:VALIDATION_PENDING 6 |
| toss-drop | cm | 123 of 129 | -0.3 | 0.8 | 3.6 | 9.4 | 99% (123) | estimated 118, unavailable:APEX_OUT_OF_FRAME 1, unavailable:VIEW_MISMATCH 5, experimental:VALIDATION_PENDING 5 |
| contact-height-ratio | ratio | 119 of 129 | -0.025 | 0.027 | 0.054 | 0.076 | 100% (119) | experimental:VALIDATION_PENDING 98, estimated 21, unavailable:CAMERA_TILTED 5, unavailable:VIEW_MISMATCH 5 |
| contact-forward | cm | 113 of 129 | 5.4 | 5.4 | 8.8 | 11.7 | 96% (113) | experimental:VALIDATION_PENDING 113, unavailable:CAMERA_TILTED 5, unavailable:VIEW_MISMATCH 5, unavailable:NEEDS_SIDE_VIEW 6 |
| rhythm-release-to-contact | ms | 124 of 129 | 0.6 | 13.3 | 38.8 | 134.8 | 99% (124) | estimated 113, experimental:FPS_TOO_LOW 6, unavailable:VIEW_MISMATCH 5, experimental:VALIDATION_PENDING 5 |
| trophy-pause | ms | 82 of 129 | -38.2 | 69.7 | 177.4 | 219.3 | 59% (82) | experimental:VALIDATION_PENDING 77, unavailable:POSE_LOW_QUALITY 36, unavailable:FPS_TOO_LOW 6, unavailable:VIEW_MISMATCH 5, experimental:CONDITION_NOT_VALIDATED 5 |
| leg-drive | % H | 118 of 129 | -1.9 | 2.0 | 3.1 | 3.6 | 100% (118) | estimated 113, unavailable:VIEW_MISMATCH 5, experimental:CONDITION_NOT_VALIDATED 5, unavailable:NEEDS_SIDE_VIEW 6 |
| drive-time | ms | 82 of 129 | -65.7 | 74.7 | 131.9 | 144.8 | 74% (82) | experimental:VALIDATION_PENDING 77, unavailable:POSE_LOW_QUALITY 36, unavailable:VIEW_MISMATCH 5, experimental:CONDITION_NOT_VALIDATED 5, unavailable:NEEDS_SIDE_VIEW 6 |
| loading-depth | % H | 118 of 129 | -0.3 | 0.4 | 1.1 | 1.6 | 100% (118) | estimated 113, unavailable:VIEW_MISMATCH 5, experimental:CONDITION_NOT_VALIDATED 5, unavailable:NEEDS_SIDE_VIEW 6 |
| landing-distance | cm | 113 of 129 | 3.6 | 4.1 | 7.9 | 24.1 | 99% (113) | experimental:VALIDATION_PENDING 108, unavailable:CAMERA_TILTED 5, unavailable:VIEW_MISMATCH 5, experimental:CONDITION_NOT_VALIDATED 5, unavailable:NEEDS_SIDE_VIEW 6 |
| shoulder-tilt-trophy (2D level, deg) | deg | 113 of 129 | -0.7 | 1.5 | 5.3 | 11.2 | – | experimental:VALIDATION_PENDING 108, unavailable:CAMERA_TILTED 5, unavailable:VIEW_MISMATCH 5, experimental:CONDITION_NOT_VALIDATED 5, unavailable:NEEDS_SIDE_VIEW 6 |
| shoulder-tilt-trophy (3D, deg) | deg | 113 of 129 | 0.9 | 2.2 | 8.1 | 9.9 | – | experimental 113, unavailable:undefined 16 |
| deep-bend-flag |  | 112 of 129 | 0.1 | 0.1 | 1.0 | 1.0 | – | experimental:VALIDATION_PENDING 107, unavailable:CAMERA_TILTED 5, unavailable:VIEW_MISMATCH 5, experimental:CONDITION_NOT_VALIDATED 5, unavailable:NEEDS_SIDE_VIEW 6, unavailable:OCCLUDED 1 |
| knee-bend-band |  | 6 of 129 | 0.0 | 0.0 | 0.0 | 0.0 | – | unavailable:NEEDS_REAR_VIEW 123, experimental:VALIDATION_PENDING 6 |
| speed-experimental |  | 0 of 129 | – | – | – | – | – | unavailable:FPS_TOO_LOW 100, unavailable:RANGE_TOO_WIDE 15, unavailable:VIEW_MISMATCH 5, unavailable:NEEDS_SIDE_VIEW 6, unavailable:TIME_BASE_UNKNOWN 3 |
| toss-height-spread (pooled) |  | 1 of 1 | 0.8 | 0.8 | 0.8 | 0.8 | 100% (1) | pooled 1 |
| toss-forward-spread (pooled) |  | 1 of 1 | -2.2 | 2.2 | 2.2 | 2.2 | 100% (1) | pooled 1 |
| contact-height-spread (pooled) |  | 1 of 1 | -1.9 | 1.9 | 1.9 | 1.9 | 100% (1) | pooled 1 |
| rhythm-spread (pooled) |  | 1 of 1 | -5.3 | 5.3 | 5.3 | 5.3 | 100% (1) | pooled 1 |
| toss-height-spread (session headline stratum) |  | 0 of 1 | – | – | – | – | – | unavailable:TOO_FEW_SERVES 1 |
| toss-forward-spread (session headline stratum) |  | 0 of 1 | – | – | – | – | – | unavailable:TOO_FEW_SERVES 1 |
| contact-height-spread (session headline stratum) |  | 0 of 1 | – | – | – | – | – | unavailable:TOO_FEW_SERVES 1 |
| rhythm-spread (session headline stratum) |  | 0 of 1 | – | – | – | – | – | unavailable:TOO_FEW_SERVES 1 |

### default: per metric × scenario (MAE / bias / coverage / measured)

| scenario | toss-apex-height | toss-drop | contact-height-ratio | toss-forward | contact-forward | rhythm-release-to-contact | leg-drive | drive-time | loading-depth | landing-distance | trophy-pause | shoulder-tilt-trophy (2D level, deg) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| advanced | 0.037 / -0.037 / 100% / 5/5 | 2.4 / -2.3 / 100% / 5/5 | 0.016 / -0.012 / 100% / 5/5 | 4.7 / 4.7 / 100% / 5/5 | 4.5 / 4.5 / 100% / 5/5 | 23.8 / 20.6 / 80% / 5/5 | 1.8 / -1.8 / 100% / 5/5 | 56.8 / 56.8 / 100% / 5/5 | 0.6 / -0.6 / 100% / 5/5 | 3.2 / 3.2 / 100% / 5/5 | 65.7 / 29.2 / 80% / 5/5 | 0.7 / -0.7 / – / 5/5 |
| apexout | 0.066 / -0.066 / 100% / 4/5 | 0.2 / -0.0 / 100% / 4/5 | 0.042 / -0.042 / 100% / 5/5 | 5.3 / 5.3 / 100% / 4/5 | 4.6 / 4.6 / 100% / 5/5 | 12.0 / -4.9 / 100% / 5/5 | 2.1 / -2.1 / 100% / 5/5 | 108.8 / -108.8 / 33% / 3/5 | 0.3 / -0.3 / 100% / 5/5 | 3.5 / 3.5 / 100% / 5/5 | 48.7 / -0.9 / 67% / 3/5 | 1.0 / -1.0 / – / 5/5 |
| baseline | 0.055 / -0.055 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.037 / -0.037 / 100% / 5/5 | 5.2 / 5.2 / 100% / 5/5 | 5.0 / 5.0 / 100% / 5/5 | 5.2 / 4.9 / 100% / 5/5 | 2.3 / -2.3 / 100% / 5/5 | 59.5 / -59.5 / 100% / 5/5 | 0.1 / 0.0 / 100% / 5/5 | 4.3 / 4.3 / 100% / 5/5 | 108.6 / -59.9 / 20% / 5/5 | 1.7 / -1.1 / – / 5/5 |
| beginner | 0.036 / -0.024 / 100% / 5/5 | 0.9 / 0.3 / 100% / 5/5 | 0.026 / -0.016 / 100% / 5/5 | 7.8 / 7.8 / 80% / 5/5 | 7.7 / 7.7 / 60% / 5/5 | 21.0 / -11.8 / 100% / 5/5 | 0.8 / 0.6 / 100% / 5/5 | – (0/5: POSE_LOW_QUALITY) | 0.1 / -0.0 / 100% / 5/5 | 3.3 / 3.2 / 100% / 5/5 | – (0/5: POSE_LOW_QUALITY) | 3.5 / 1.3 / – / 5/5 |
| crf18 | 0.051 / -0.051 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.034 / -0.034 / 100% / 5/5 | 5.2 / 5.2 / 100% / 5/5 | 5.0 / 5.0 / 100% / 5/5 | 5.4 / 4.7 / 100% / 5/5 | 2.4 / -2.4 / 100% / 5/5 | 77.5 / -77.5 / 60% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 4.3 / 4.3 / 100% / 5/5 | 51.9 / 26.1 / 80% / 5/5 | 0.5 / -0.4 / – / 5/5 |
| crf28 | 0.041 / -0.041 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.028 / -0.028 / 100% / 5/5 | 5.0 / 5.0 / 100% / 5/5 | 5.0 / 5.0 / 100% / 5/5 | 6.3 / 6.3 / 100% / 5/5 | 2.3 / -2.3 / 100% / 5/5 | 71.3 / -62.2 / 80% / 5/5 | 0.2 / -0.1 / 100% / 5/5 | 4.1 / 4.1 / 100% / 5/5 | 37.7 / -7.9 / 80% / 5/5 | 1.3 / -0.8 / – / 5/5 |
| crf36 | 0.059 / -0.059 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.043 / -0.043 / 100% / 5/5 | 4.6 / 4.6 / 100% / 5/5 | 4.2 / 4.2 / 100% / 5/5 | 7.0 / 6.3 / 100% / 5/5 | 2.6 / -2.6 / 100% / 5/5 | 59.4 / -59.4 / 80% / 5/5 | 0.2 / -0.2 / 100% / 5/5 | 2.7 / 2.5 / 100% / 5/5 | 57.9 / -57.9 / 80% / 5/5 | 1.6 / 1.1 / – / 5/5 |
| default75 | 0.007 / -0.007 / 100% / 3/3 | 0.2 / -0.2 / 100% / 3/3 | 0.003 / -0.002 / 100% / 3/3 | 6.3 / 6.3 / 100% / 3/3 | 5.9 / 5.9 / 100% / 3/3 | 10.1 / -8.1 / 100% / 3/3 | 2.8 / -2.8 / 100% / 3/3 | 38.4 / -38.4 / 100% / 2/3 | 0.5 / -0.5 / 100% / 3/3 | 4.3 / 4.3 / 100% / 3/3 | 73.3 / -73.3 / 50% / 2/3 | 0.4 / 0.1 / – / 3/3 |
| dist12 | 0.015 / 0.007 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.009 / 0.005 / 100% / 5/5 | 8.2 / 8.2 / 100% / 5/5 | 8.2 / 8.2 / 100% / 5/5 | 11.5 / 1.7 / 100% / 5/5 | 1.7 / -1.7 / 100% / 5/5 | 99.3 / -99.3 / 40% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 6.5 / 6.5 / 100% / 5/5 | 117.9 / -117.9 / 20% / 5/5 | 1.2 / 0.1 / – / 5/5 |
| dist4 | – (0/5: CAMERA_TILTED) | 0.7 / 0.6 / 100% / 5/5 | – (0/5: CAMERA_TILTED) | – (0/5: CAMERA_TILTED) | – (0/5: CAMERA_TILTED) | 19.1 / 19.1 / 100% / 5/5 | 2.7 / -2.7 / 100% / 5/5 | 87.1 / -87.1 / 67% / 3/5 | 0.4 / -0.4 / 100% / 5/5 | – (0/5: CAMERA_TILTED) | 32.1 / -17.6 / 100% / 3/5 | – (0/5: CAMERA_TILTED) |
| dist7 | 0.017 / -0.017 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.010 / -0.010 / 100% / 5/5 | 7.4 / 7.4 / 100% / 5/5 | 7.2 / 7.2 / 100% / 5/5 | 9.7 / -1.3 / 100% / 5/5 | 2.2 / -2.2 / 100% / 5/5 | 86.8 / -86.8 / 67% / 3/5 | 0.3 / -0.3 / 100% / 5/5 | 4.4 / 3.9 / 100% / 5/5 | 128.1 / -128.1 / 33% / 3/5 | 1.2 / 0.5 / – / 5/5 |
| dusk | 0.041 / -0.041 / 100% / 5/5 | 4.0 / -4.0 / 80% / 5/5 | 0.015 / -0.005 / 100% / 5/5 | 4.8 / 4.8 / 100% / 5/5 | 4.2 / 4.2 / 100% / 5/5 | 7.7 / -5.3 / 100% / 5/5 | 1.6 / -1.6 / 100% / 5/5 | 67.2 / -67.2 / 100% / 5/5 | 0.2 / -0.1 / 100% / 5/5 | 2.7 / 2.7 / 100% / 5/5 | 52.5 / -15.9 / 60% / 5/5 | 0.4 / 0.1 / – / 5/5 |
| fence9 | 0.005 / 0.003 / 100% / 3/3 | 1.3 / 1.1 / 100% / 3/3 | 0.007 / -0.002 / 100% / 3/3 | 6.0 / 6.0 / 100% / 3/3 | 6.2 / 6.2 / 100% / 3/3 | 14.1 / -4.1 / 100% / 3/3 | 2.8 / -2.8 / 100% / 3/3 | 45.5 / -45.5 / 100% / 1/3 | 0.5 / -0.5 / 100% / 3/3 | 10.3 / -5.7 / 67% / 3/3 | 68.5 / -68.5 / 100% / 1/3 | 0.3 / -0.1 / – / 3/3 |
| fps120 | 0.053 / -0.053 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.036 / -0.036 / 100% / 5/5 | 4.6 / 4.6 / 100% / 5/5 | 4.0 / 4.0 / 100% / 5/5 | 6.0 / 4.7 / 100% / 5/5 | 2.5 / -2.5 / 100% / 5/5 | 74.6 / -73.5 / 80% / 5/5 | 0.2 / -0.1 / 100% / 5/5 | 3.1 / 3.1 / 100% / 5/5 | 56.3 / -25.9 / 40% / 5/5 | 0.5 / -0.3 / – / 5/5 |
| fps240 | 0.049 / -0.049 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.034 / -0.034 / 100% / 5/5 | 5.6 / 5.6 / 100% / 5/5 | 5.0 / 5.0 / 100% / 5/5 | 9.9 / -0.3 / 100% / 5/5 | 2.4 / -2.4 / 100% / 5/5 | 77.9 / -77.9 / 60% / 5/5 | 0.2 / -0.1 / 100% / 5/5 | 3.7 / 3.7 / 100% / 5/5 | 48.5 / -47.9 / 60% / 5/5 | 0.8 / -0.6 / – / 5/5 |
| fps30 | 0.055 / -0.055 / 100% / 5/5 | 1.9 / -0.4 / 100% / 5/5 | 0.036 / -0.036 / 100% / 5/5 | 5.8 / 5.8 / 100% / 5/5 | 5.4 / 5.4 / 100% / 5/5 | 83.2 / -48.1 / 100% / 5/5 | 2.4 / -2.4 / 100% / 5/5 | 74.7 / -74.7 / 80% / 5/5 | 0.2 / -0.2 / 100% / 5/5 | 5.7 / 5.7 / 100% / 5/5 | – (0/5: FPS_TOO_LOW) | 0.7 / -0.4 / – / 5/5 |
| front45 | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) |
| h160 | 0.017 / -0.017 / 100% / 5/5 | 0.7 / -0.6 / 100% / 5/5 | 0.006 / -0.006 / 100% / 5/5 | 4.7 / 4.7 / 100% / 5/5 | 4.4 / 4.4 / 100% / 5/5 | 4.6 / 4.0 / 100% / 5/5 | 1.9 / -1.9 / 100% / 5/5 | – (0/5: POSE_LOW_QUALITY) | 0.9 / -0.9 / 100% / 5/5 | 2.9 / 2.0 / 100% / 5/5 | – (0/5: POSE_LOW_QUALITY) | 1.4 / -1.0 / – / 5/5 |
| h195 | 0.039 / -0.039 / 100% / 5/5 | 0.5 / -0.4 / 100% / 5/5 | 0.025 / -0.025 / 100% / 5/5 | 6.7 / 6.7 / 100% / 5/5 | 6.6 / 6.6 / 100% / 5/5 | 5.4 / 4.7 / 100% / 5/5 | 1.5 / -1.5 / 100% / 5/5 | 81.6 / -81.6 / 60% / 5/5 | 0.2 / -0.2 / 100% / 5/5 | 4.5 / 4.4 / 100% / 5/5 | 54.5 / -17.9 / 60% / 5/5 | 0.9 / -0.9 / – / 5/5 |
| lefty | 0.067 / -0.067 / 100% / 5/5 | 0.7 / 0.4 / 100% / 5/5 | 0.050 / -0.050 / 100% / 5/5 | 2.4 / 2.4 / 100% / 5/5 | 2.3 / 2.2 / 100% / 5/5 | 6.9 / 6.3 / 100% / 5/5 | 0.9 / -0.9 / 100% / 5/5 | 127.9 / -127.9 / 0% / 1/5 | 0.8 / -0.8 / 100% / 5/5 | 1.8 / 1.1 / 100% / 5/5 | 141.7 / 141.7 / 0% / 1/5 | 1.5 / -1.1 / – / 5/5 |
| night240 | 0.031 / -0.031 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.020 / -0.020 / 100% / 5/5 | 6.8 / 6.8 / 100% / 5/5 | 6.6 / 6.6 / 100% / 5/5 | 9.8 / -3.5 / 100% / 5/5 | 0.5 / -0.5 / 100% / 5/5 | 67.3 / -67.3 / 80% / 5/5 | 0.1 / 0.1 / 100% / 5/5 | 4.7 / 4.7 / 100% / 5/5 | 103.2 / -85.9 / 40% / 5/5 | 1.3 / -1.3 / – / 5/5 |
| overcast | 0.041 / -0.041 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.030 / -0.030 / 100% / 5/5 | 5.6 / 5.6 / 100% / 5/5 | 5.2 / 5.2 / 100% / 5/5 | 4.6 / 3.7 / 100% / 5/5 | 1.9 / -1.9 / 100% / 5/5 | 68.5 / -68.5 / 80% / 5/5 | 0.2 / -0.2 / 100% / 5/5 | 3.4 / 2.1 / 100% / 5/5 | 22.8 / -11.9 / 100% / 5/5 | 1.7 / -1.7 / – / 5/5 |
| quick-rear30-lefty | 0.089 / -0.089 / 100% / 1/1 | 4.6 / 4.6 / 100% / 1/1 | 0.076 / -0.076 / 100% / 1/1 | – (0/1: NEEDS_SIDE_VIEW) | – (0/1: NEEDS_SIDE_VIEW) | 44.0 / 44.0 / 100% / 1/1 | – (0/1: NEEDS_SIDE_VIEW) | – (0/1: NEEDS_SIDE_VIEW) | – (0/1: NEEDS_SIDE_VIEW) | – (0/1: NEEDS_SIDE_VIEW) | – (0/1: FPS_TOO_LOW) | – (0/1: NEEDS_SIDE_VIEW) |
| quick-side60 | 0.050 / -0.050 / 100% / 1/1 | 0.2 / -0.2 / 100% / 1/1 | 0.029 / -0.029 / 100% / 1/1 | 4.7 / 4.7 / 100% / 1/1 | 5.0 / 5.0 / 100% / 1/1 | 2.7 / -2.7 / 100% / 1/1 | 2.4 / -2.4 / 100% / 1/1 | 76.2 / -76.2 / 100% / 1/1 | 0.1 / 0.1 / 100% / 1/1 | 5.5 / 5.5 / 100% / 1/1 | 58.3 / -58.3 / 100% / 1/1 | 0.8 / -0.8 / – / 1/1 |
| quick-slomo | 0.013 / -0.013 / 100% / 1/1 | 0.0 / -0.0 / 100% / 1/1 | 0.005 / -0.005 / 100% / 1/1 | 5.1 / 5.1 / 100% / 1/1 | 4.9 / 4.9 / 100% / 1/1 | 1.5 / -1.5 / 100% / 1/1 | 2.9 / -2.9 / 100% / 1/1 | – (0/1: POSE_LOW_QUALITY) | 0.2 / -0.2 / 100% / 1/1 | 0.1 / -0.1 / 100% / 1/1 | – (0/1: POSE_LOW_QUALITY) | 2.1 / 2.1 / – / 1/1 |
| rear | 0.061 / -0.061 / 100% / 5/5 | 0.9 / 0.8 / 100% / 5/5 | 0.035 / -0.035 / 100% / 5/5 | – (0/5: NEEDS_SIDE_VIEW) | – (0/5: NEEDS_SIDE_VIEW) | 12.2 / 5.1 / 100% / 5/5 | – (0/5: NEEDS_SIDE_VIEW) | – (0/5: NEEDS_SIDE_VIEW) | – (0/5: NEEDS_SIDE_VIEW) | – (0/5: NEEDS_SIDE_VIEW) | 123.9 / -123.9 / 20% / 5/5 | – (0/5: NEEDS_SIDE_VIEW) |
| session | 0.051 / -0.051 / 100% / 8/8 | 1.1 / -0.7 / 100% / 8/8 | 0.035 / -0.033 / 100% / 8/8 | 8.1 / 8.1 / 75% / 8/8 | 7.9 / 7.9 / 75% / 8/8 | 12.4 / -4.0 / 100% / 8/8 | 2.5 / -2.5 / 100% / 8/8 | 58.9 / 58.9 / 100% / 1/8 | 0.5 / -0.5 / 100% / 8/8 | 6.6 / 6.6 / 100% / 8/8 | 57.0 / 57.0 / 100% / 1/8 | 0.7 / 0.5 / – / 8/8 |
| shake | 0.013 / -0.013 / 100% / 5/5 | 1.1 / -1.0 / 100% / 5/5 | 0.013 / -0.004 / 100% / 5/5 | 4.4 / 4.4 / 100% / 5/5 | 2.6 / 2.6 / 100% / 5/5 | 13.3 / 3.1 / 100% / 5/5 | 0.6 / 0.3 / 100% / 5/5 | – (0/5: POSE_LOW_QUALITY) | 1.4 / -1.4 / 100% / 5/5 | 3.3 / 3.3 / 100% / 5/5 | – (0/5: POSE_LOW_QUALITY) | 8.5 / -8.2 / – / 5/5 |
| slomo | 0.050 / -0.050 / 100% / 2/2 | 0.3 / -0.3 / 100% / 2/2 | 0.031 / -0.031 / 100% / 2/2 | 4.9 / 4.9 / 100% / 2/2 | 4.9 / 4.9 / 100% / 2/2 | 3.6 / 3.6 / 100% / 2/2 | 2.2 / -2.2 / 100% / 2/2 | 105.3 / -105.3 / 50% / 2/2 | 0.3 / 0.1 / 100% / 2/2 | 2.0 / 2.0 / 100% / 2/2 | 55.1 / -13.4 / 50% / 2/2 | 0.7 / -0.1 / – / 2/2 |

### default: event timing error (ms; MAE / bias / n found of clips), by capture fps

| event | 30 fps | 60 fps | 120 fps | 240 fps |
| --- | --- | --- | --- | --- |
| tossRelease | 79.8 / 32.8 / 6/6 | 13.3 / -1.5 / 105/105 | 6.0 / -4.9 / 5/5 | 8.4 / 0.5 / 13/13 |
| tossApex | 0.8 / -0.7 / 6/6 | 0.7 / 0.0 / 105/105 | 0.1 / 0.0 / 5/5 | 0.1 / 0.0 / 13/13 |
| trophy (lowest hip) | 86.8 / 34.9 / 6/6 | 85.6 / 24.3 / 105/105 | 74.6 / 73.2 / 5/5 | 73.1 / 73.1 / 13/13 |
| contact | 6.8 / -0.2 / 6/6 | 2.3 / -1.3 / 105/105 | 0.4 / -0.3 / 5/5 | 0.6 / -0.6 / 13/13 |
| landing | 120.9 / 72.3 / 6/6 | 65.6 / 28.4 / 105/105 | 80.7 / 54.9 / 5/5 | 66.5 / 46.5 / 13/13 |
| recoveryEnd | 544.9 / -333.6 / 6/6 | 395.1 / -282.2 / 105/105 | 379.0 / -292.1 / 5/5 | 402.2 / -254.4 / 13/13 |
| motionStart | 55.6 / -0.0 / 6/6 | 124.3 / 65.0 / 105/105 | 34.5 / 27.8 / 5/5 | 100.3 / 90.1 / 13/13 |

## audio: per metric (all clips)

| metric | unit | n measured | bias | MAE | p95 | max | coverage | status distribution |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| serve-count | count | 122 of 122 | 0.0 | 0.0 | 0.0 | 0.0 | – | estimated 117, experimental 5 |
| toss-apex-height | ratio | 118 of 129 | -0.039 | 0.041 | 0.073 | 0.091 | 100% (118) | experimental:VALIDATION_PENDING 97, unavailable:APEX_OUT_OF_FRAME 1, estimated 21, unavailable:CAMERA_TILTED 5, unavailable:VIEW_MISMATCH 5 |
| toss-forward | cm | 112 of 129 | 5.7 | 5.7 | 8.7 | 11.9 | 97% (112) | experimental:VALIDATION_PENDING 112, unavailable:APEX_OUT_OF_FRAME 1, unavailable:CAMERA_TILTED 5, unavailable:VIEW_MISMATCH 5, unavailable:NEEDS_SIDE_VIEW 6 |
| toss-lateral | cm | 0 of 129 | – | – | – | – | – | unavailable:NEEDS_REAR_VIEW 123, experimental:VALIDATION_PENDING 6 |
| toss-drop | cm | 123 of 129 | -0.1 | 0.4 | 1.4 | 8.4 | 99% (123) | estimated 118, unavailable:APEX_OUT_OF_FRAME 1, unavailable:VIEW_MISMATCH 5, experimental:VALIDATION_PENDING 5 |
| contact-height-ratio | ratio | 119 of 129 | -0.026 | 0.028 | 0.052 | 0.070 | 100% (119) | experimental:VALIDATION_PENDING 98, estimated 21, unavailable:CAMERA_TILTED 5, unavailable:VIEW_MISMATCH 5 |
| contact-forward | cm | 113 of 129 | 5.4 | 5.4 | 8.8 | 11.7 | 96% (113) | experimental:VALIDATION_PENDING 113, unavailable:CAMERA_TILTED 5, unavailable:VIEW_MISMATCH 5, unavailable:NEEDS_SIDE_VIEW 6 |
| rhythm-release-to-contact | ms | 124 of 129 | 1.3 | 13.6 | 38.8 | 130.8 | 99% (124) | estimated 113, experimental:FPS_TOO_LOW 6, unavailable:VIEW_MISMATCH 5, experimental:VALIDATION_PENDING 5 |
| trophy-pause | ms | 82 of 129 | -38.2 | 69.7 | 177.4 | 219.3 | 59% (82) | experimental:VALIDATION_PENDING 77, unavailable:POSE_LOW_QUALITY 36, unavailable:FPS_TOO_LOW 6, unavailable:VIEW_MISMATCH 5, experimental:CONDITION_NOT_VALIDATED 5 |
| leg-drive | % H | 118 of 129 | -1.9 | 2.0 | 3.0 | 3.6 | 100% (118) | estimated 113, unavailable:VIEW_MISMATCH 5, experimental:CONDITION_NOT_VALIDATED 5, unavailable:NEEDS_SIDE_VIEW 6 |
| drive-time | ms | 82 of 129 | -65.1 | 74.9 | 131.9 | 144.8 | 73% (82) | experimental:VALIDATION_PENDING 77, unavailable:POSE_LOW_QUALITY 36, unavailable:VIEW_MISMATCH 5, experimental:CONDITION_NOT_VALIDATED 5, unavailable:NEEDS_SIDE_VIEW 6 |
| loading-depth | % H | 118 of 129 | -0.3 | 0.4 | 1.1 | 1.6 | 100% (118) | estimated 113, unavailable:VIEW_MISMATCH 5, experimental:CONDITION_NOT_VALIDATED 5, unavailable:NEEDS_SIDE_VIEW 6 |
| landing-distance | cm | 113 of 129 | 3.6 | 4.1 | 7.9 | 24.1 | 99% (113) | experimental:VALIDATION_PENDING 108, unavailable:CAMERA_TILTED 5, unavailable:VIEW_MISMATCH 5, experimental:CONDITION_NOT_VALIDATED 5, unavailable:NEEDS_SIDE_VIEW 6 |
| shoulder-tilt-trophy (2D level, deg) | deg | 113 of 129 | -0.7 | 1.5 | 5.3 | 11.2 | – | experimental:VALIDATION_PENDING 108, unavailable:CAMERA_TILTED 5, unavailable:VIEW_MISMATCH 5, experimental:CONDITION_NOT_VALIDATED 5, unavailable:NEEDS_SIDE_VIEW 6 |
| shoulder-tilt-trophy (3D, deg) | deg | 113 of 129 | 0.9 | 2.2 | 8.1 | 9.9 | – | experimental 113, unavailable:undefined 16 |
| deep-bend-flag |  | 112 of 129 | 0.1 | 0.1 | 1.0 | 1.0 | – | experimental:VALIDATION_PENDING 107, unavailable:CAMERA_TILTED 5, unavailable:VIEW_MISMATCH 5, experimental:CONDITION_NOT_VALIDATED 5, unavailable:NEEDS_SIDE_VIEW 6, unavailable:OCCLUDED 1 |
| knee-bend-band |  | 6 of 129 | 0.0 | 0.0 | 0.0 | 0.0 | – | unavailable:NEEDS_REAR_VIEW 123, experimental:VALIDATION_PENDING 6 |
| speed-experimental |  | 0 of 129 | – | – | – | – | – | unavailable:FPS_TOO_LOW 100, unavailable:RANGE_TOO_WIDE 15, unavailable:VIEW_MISMATCH 5, unavailable:NEEDS_SIDE_VIEW 6, unavailable:TIME_BASE_UNKNOWN 3 |
| toss-height-spread (pooled) |  | 1 of 1 | 0.8 | 0.8 | 0.8 | 0.8 | 100% (1) | pooled 1 |
| toss-forward-spread (pooled) |  | 1 of 1 | -2.2 | 2.2 | 2.2 | 2.2 | 100% (1) | pooled 1 |
| contact-height-spread (pooled) |  | 1 of 1 | 0.0 | 0.0 | 0.0 | 0.0 | 100% (1) | pooled 1 |
| rhythm-spread (pooled) |  | 1 of 1 | -4.5 | 4.5 | 4.5 | 4.5 | 100% (1) | pooled 1 |
| toss-height-spread (session headline stratum) |  | 0 of 1 | – | – | – | – | – | unavailable:TOO_FEW_SERVES 1 |
| toss-forward-spread (session headline stratum) |  | 0 of 1 | – | – | – | – | – | unavailable:TOO_FEW_SERVES 1 |
| contact-height-spread (session headline stratum) |  | 0 of 1 | – | – | – | – | – | unavailable:TOO_FEW_SERVES 1 |
| rhythm-spread (session headline stratum) |  | 0 of 1 | – | – | – | – | – | unavailable:TOO_FEW_SERVES 1 |

### audio: per metric × scenario (MAE / bias / coverage / measured)

| scenario | toss-apex-height | toss-drop | contact-height-ratio | toss-forward | contact-forward | rhythm-release-to-contact | leg-drive | drive-time | loading-depth | landing-distance | trophy-pause | shoulder-tilt-trophy (2D level, deg) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| advanced | 0.037 / -0.037 / 100% / 5/5 | 0.4 / -0.3 / 100% / 5/5 | 0.023 / -0.023 / 100% / 5/5 | 4.7 / 4.7 / 100% / 5/5 | 4.5 / 4.5 / 100% / 5/5 | 27.2 / 27.2 / 80% / 5/5 | 1.9 / -1.9 / 100% / 5/5 | 63.5 / 63.5 / 100% / 5/5 | 0.6 / -0.6 / 100% / 5/5 | 3.2 / 3.2 / 100% / 5/5 | 65.7 / 29.2 / 80% / 5/5 | 0.7 / -0.7 / – / 5/5 |
| apexout | 0.066 / -0.066 / 100% / 4/5 | 0.2 / -0.0 / 100% / 4/5 | 0.042 / -0.042 / 100% / 5/5 | 5.3 / 5.3 / 100% / 4/5 | 4.6 / 4.6 / 100% / 5/5 | 12.0 / -4.9 / 100% / 5/5 | 2.1 / -2.1 / 100% / 5/5 | 108.8 / -108.8 / 33% / 3/5 | 0.3 / -0.3 / 100% / 5/5 | 3.5 / 3.5 / 100% / 5/5 | 48.7 / -0.9 / 67% / 3/5 | 1.0 / -1.0 / – / 5/5 |
| baseline | 0.055 / -0.055 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.037 / -0.037 / 100% / 5/5 | 5.2 / 5.2 / 100% / 5/5 | 5.0 / 5.0 / 100% / 5/5 | 5.2 / 4.9 / 100% / 5/5 | 2.3 / -2.3 / 100% / 5/5 | 59.5 / -59.5 / 100% / 5/5 | 0.1 / 0.0 / 100% / 5/5 | 4.3 / 4.3 / 100% / 5/5 | 108.6 / -59.9 / 20% / 5/5 | 1.7 / -1.1 / – / 5/5 |
| beginner | 0.036 / -0.024 / 100% / 5/5 | 0.9 / 0.3 / 100% / 5/5 | 0.026 / -0.016 / 100% / 5/5 | 7.8 / 7.8 / 80% / 5/5 | 7.7 / 7.7 / 60% / 5/5 | 21.0 / -11.8 / 100% / 5/5 | 0.8 / 0.6 / 100% / 5/5 | – (0/5: POSE_LOW_QUALITY) | 0.1 / -0.0 / 100% / 5/5 | 3.3 / 3.2 / 100% / 5/5 | – (0/5: POSE_LOW_QUALITY) | 3.5 / 1.3 / – / 5/5 |
| crf18 | 0.051 / -0.051 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.034 / -0.034 / 100% / 5/5 | 5.2 / 5.2 / 100% / 5/5 | 5.0 / 5.0 / 100% / 5/5 | 5.6 / 4.9 / 100% / 5/5 | 2.5 / -2.5 / 100% / 5/5 | 77.4 / -77.4 / 60% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 4.3 / 4.3 / 100% / 5/5 | 51.9 / 26.1 / 80% / 5/5 | 0.5 / -0.4 / – / 5/5 |
| crf28 | 0.041 / -0.041 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.029 / -0.029 / 100% / 5/5 | 5.0 / 5.0 / 100% / 5/5 | 5.0 / 5.0 / 100% / 5/5 | 6.3 / 6.3 / 100% / 5/5 | 2.3 / -2.3 / 100% / 5/5 | 71.2 / -62.1 / 80% / 5/5 | 0.2 / -0.1 / 100% / 5/5 | 4.1 / 4.1 / 100% / 5/5 | 37.7 / -7.9 / 80% / 5/5 | 1.3 / -0.8 / – / 5/5 |
| crf36 | 0.059 / -0.059 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.043 / -0.043 / 100% / 5/5 | 4.6 / 4.6 / 100% / 5/5 | 4.2 / 4.2 / 100% / 5/5 | 7.2 / 6.5 / 100% / 5/5 | 2.6 / -2.6 / 100% / 5/5 | 59.4 / -59.4 / 80% / 5/5 | 0.2 / -0.2 / 100% / 5/5 | 2.7 / 2.5 / 100% / 5/5 | 57.9 / -57.9 / 80% / 5/5 | 1.6 / 1.1 / – / 5/5 |
| default75 | 0.007 / -0.007 / 100% / 3/3 | 0.2 / -0.2 / 100% / 3/3 | 0.003 / -0.002 / 100% / 3/3 | 6.3 / 6.3 / 100% / 3/3 | 5.9 / 5.9 / 100% / 3/3 | 10.1 / -8.1 / 100% / 3/3 | 2.8 / -2.8 / 100% / 3/3 | 38.3 / -38.3 / 100% / 2/3 | 0.5 / -0.5 / 100% / 3/3 | 4.3 / 4.3 / 100% / 3/3 | 73.3 / -73.3 / 50% / 2/3 | 0.4 / 0.1 / – / 3/3 |
| dist12 | 0.015 / 0.007 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.009 / 0.005 / 100% / 5/5 | 8.2 / 8.2 / 100% / 5/5 | 8.2 / 8.2 / 100% / 5/5 | 11.5 / 1.7 / 100% / 5/5 | 1.7 / -1.7 / 100% / 5/5 | 99.3 / -99.3 / 40% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 6.5 / 6.5 / 100% / 5/5 | 117.9 / -117.9 / 20% / 5/5 | 1.2 / 0.1 / – / 5/5 |
| dist4 | – (0/5: CAMERA_TILTED) | 0.4 / 0.4 / 100% / 5/5 | – (0/5: CAMERA_TILTED) | – (0/5: CAMERA_TILTED) | – (0/5: CAMERA_TILTED) | 18.5 / 18.5 / 100% / 5/5 | 2.7 / -2.7 / 100% / 5/5 | 89.3 / -89.3 / 67% / 3/5 | 0.4 / -0.4 / 100% / 5/5 | – (0/5: CAMERA_TILTED) | 32.1 / -17.6 / 100% / 3/5 | – (0/5: CAMERA_TILTED) |
| dist7 | 0.017 / -0.017 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.010 / -0.010 / 100% / 5/5 | 7.4 / 7.4 / 100% / 5/5 | 7.2 / 7.2 / 100% / 5/5 | 9.7 / -1.3 / 100% / 5/5 | 2.2 / -2.2 / 100% / 5/5 | 86.8 / -86.8 / 67% / 3/5 | 0.3 / -0.3 / 100% / 5/5 | 4.4 / 3.9 / 100% / 5/5 | 128.1 / -128.1 / 33% / 3/5 | 1.2 / 0.5 / – / 5/5 |
| dusk | 0.041 / -0.041 / 100% / 5/5 | 2.6 / -2.6 / 80% / 5/5 | 0.020 / -0.013 / 100% / 5/5 | 4.8 / 4.8 / 100% / 5/5 | 4.2 / 4.2 / 100% / 5/5 | 10.0 / -1.1 / 100% / 5/5 | 1.6 / -1.6 / 100% / 5/5 | 62.6 / -62.6 / 100% / 5/5 | 0.2 / -0.1 / 100% / 5/5 | 2.7 / 2.7 / 100% / 5/5 | 52.5 / -15.9 / 60% / 5/5 | 0.4 / 0.1 / – / 5/5 |
| fence9 | 0.005 / 0.003 / 100% / 3/3 | 0.2 / -0.2 / 100% / 3/3 | 0.005 / 0.005 / 100% / 3/3 | 6.0 / 6.0 / 100% / 3/3 | 5.9 / 5.9 / 100% / 3/3 | 10.4 / -7.7 / 100% / 3/3 | 2.7 / -2.7 / 100% / 3/3 | 56.2 / -56.2 / 100% / 1/3 | 0.5 / -0.5 / 100% / 3/3 | 10.3 / -5.7 / 67% / 3/3 | 68.5 / -68.5 / 100% / 1/3 | 0.3 / -0.1 / – / 3/3 |
| fps120 | 0.053 / -0.053 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.037 / -0.037 / 100% / 5/5 | 4.6 / 4.6 / 100% / 5/5 | 4.0 / 4.0 / 100% / 5/5 | 6.0 / 4.7 / 100% / 5/5 | 2.5 / -2.5 / 100% / 5/5 | 74.6 / -73.5 / 80% / 5/5 | 0.2 / -0.1 / 100% / 5/5 | 3.1 / 3.1 / 100% / 5/5 | 56.3 / -25.9 / 40% / 5/5 | 0.5 / -0.3 / – / 5/5 |
| fps240 | 0.049 / -0.049 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.034 / -0.034 / 100% / 5/5 | 5.6 / 5.6 / 100% / 5/5 | 5.0 / 5.0 / 100% / 5/5 | 9.9 / -0.3 / 100% / 5/5 | 2.4 / -2.4 / 100% / 5/5 | 77.9 / -77.9 / 60% / 5/5 | 0.2 / -0.1 / 100% / 5/5 | 3.7 / 3.7 / 100% / 5/5 | 48.5 / -47.9 / 60% / 5/5 | 0.8 / -0.6 / – / 5/5 |
| fps30 | 0.055 / -0.055 / 100% / 5/5 | 0.2 / 0.2 / 100% / 5/5 | 0.039 / -0.039 / 100% / 5/5 | 5.8 / 5.8 / 100% / 5/5 | 5.4 / 5.4 / 100% / 5/5 | 88.0 / -46.1 / 100% / 5/5 | 2.4 / -2.4 / 100% / 5/5 | 72.5 / -72.5 / 60% / 5/5 | 0.2 / -0.2 / 100% / 5/5 | 5.7 / 5.7 / 100% / 5/5 | – (0/5: FPS_TOO_LOW) | 0.7 / -0.4 / – / 5/5 |
| front45 | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) |
| h160 | 0.017 / -0.017 / 100% / 5/5 | 0.3 / -0.2 / 100% / 5/5 | 0.008 / -0.008 / 100% / 5/5 | 4.7 / 4.7 / 100% / 5/5 | 4.4 / 4.4 / 100% / 5/5 | 6.0 / 5.4 / 100% / 5/5 | 1.9 / -1.9 / 100% / 5/5 | – (0/5: POSE_LOW_QUALITY) | 0.9 / -0.9 / 100% / 5/5 | 2.9 / 2.0 / 100% / 5/5 | – (0/5: POSE_LOW_QUALITY) | 1.4 / -1.0 / – / 5/5 |
| h195 | 0.039 / -0.039 / 100% / 5/5 | 0.3 / -0.2 / 100% / 5/5 | 0.025 / -0.025 / 100% / 5/5 | 6.7 / 6.7 / 100% / 5/5 | 6.6 / 6.6 / 100% / 5/5 | 5.6 / 4.9 / 100% / 5/5 | 1.5 / -1.5 / 100% / 5/5 | 81.5 / -81.5 / 60% / 5/5 | 0.2 / -0.2 / 100% / 5/5 | 4.5 / 4.4 / 100% / 5/5 | 54.5 / -17.9 / 60% / 5/5 | 0.9 / -0.9 / – / 5/5 |
| lefty | 0.067 / -0.067 / 100% / 5/5 | 0.5 / 0.2 / 100% / 5/5 | 0.049 / -0.049 / 100% / 5/5 | 2.4 / 2.4 / 100% / 5/5 | 2.3 / 2.2 / 100% / 5/5 | 6.3 / 5.7 / 100% / 5/5 | 0.9 / -0.9 / 100% / 5/5 | 130.7 / -130.7 / 0% / 1/5 | 0.8 / -0.8 / 100% / 5/5 | 1.8 / 1.1 / 100% / 5/5 | 141.7 / 141.7 / 0% / 1/5 | 1.5 / -1.1 / – / 5/5 |
| night240 | 0.031 / -0.031 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.020 / -0.020 / 100% / 5/5 | 6.8 / 6.8 / 100% / 5/5 | 6.6 / 6.6 / 100% / 5/5 | 9.8 / -3.5 / 100% / 5/5 | 0.5 / -0.5 / 100% / 5/5 | 67.3 / -67.3 / 80% / 5/5 | 0.1 / 0.1 / 100% / 5/5 | 4.7 / 4.7 / 100% / 5/5 | 103.2 / -85.9 / 40% / 5/5 | 1.3 / -1.3 / – / 5/5 |
| overcast | 0.041 / -0.041 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.030 / -0.030 / 100% / 5/5 | 5.6 / 5.6 / 100% / 5/5 | 5.2 / 5.2 / 100% / 5/5 | 4.6 / 3.7 / 100% / 5/5 | 1.9 / -1.9 / 100% / 5/5 | 68.4 / -68.4 / 80% / 5/5 | 0.2 / -0.2 / 100% / 5/5 | 3.4 / 2.1 / 100% / 5/5 | 22.8 / -11.9 / 100% / 5/5 | 1.7 / -1.7 / – / 5/5 |
| quick-rear30-lefty | 0.089 / -0.089 / 100% / 1/1 | 2.6 / 2.6 / 100% / 1/1 | 0.070 / -0.070 / 100% / 1/1 | – (0/1: NEEDS_SIDE_VIEW) | – (0/1: NEEDS_SIDE_VIEW) | 41.0 / 41.0 / 100% / 1/1 | – (0/1: NEEDS_SIDE_VIEW) | – (0/1: NEEDS_SIDE_VIEW) | – (0/1: NEEDS_SIDE_VIEW) | – (0/1: NEEDS_SIDE_VIEW) | – (0/1: FPS_TOO_LOW) | – (0/1: NEEDS_SIDE_VIEW) |
| quick-side60 | 0.050 / -0.050 / 100% / 1/1 | 0.2 / -0.2 / 100% / 1/1 | 0.029 / -0.029 / 100% / 1/1 | 4.7 / 4.7 / 100% / 1/1 | 5.0 / 5.0 / 100% / 1/1 | 2.7 / -2.7 / 100% / 1/1 | 2.4 / -2.4 / 100% / 1/1 | 76.1 / -76.1 / 100% / 1/1 | 0.1 / 0.1 / 100% / 1/1 | 5.5 / 5.5 / 100% / 1/1 | 58.3 / -58.3 / 100% / 1/1 | 0.8 / -0.8 / – / 1/1 |
| quick-slomo | 0.013 / -0.013 / 100% / 1/1 | 0.0 / -0.0 / 100% / 1/1 | 0.005 / -0.005 / 100% / 1/1 | 5.1 / 5.1 / 100% / 1/1 | 4.9 / 4.9 / 100% / 1/1 | 1.5 / -1.5 / 100% / 1/1 | 2.9 / -2.9 / 100% / 1/1 | – (0/1: POSE_LOW_QUALITY) | 0.2 / -0.2 / 100% / 1/1 | 0.1 / -0.1 / 100% / 1/1 | – (0/1: POSE_LOW_QUALITY) | 2.1 / 2.1 / – / 1/1 |
| rear | 0.061 / -0.061 / 100% / 5/5 | 0.8 / 0.8 / 100% / 5/5 | 0.037 / -0.037 / 100% / 5/5 | – (0/5: NEEDS_SIDE_VIEW) | – (0/5: NEEDS_SIDE_VIEW) | 12.2 / 5.9 / 100% / 5/5 | – (0/5: NEEDS_SIDE_VIEW) | – (0/5: NEEDS_SIDE_VIEW) | – (0/5: NEEDS_SIDE_VIEW) | – (0/5: NEEDS_SIDE_VIEW) | 123.9 / -123.9 / 20% / 5/5 | – (0/5: NEEDS_SIDE_VIEW) |
| session | 0.051 / -0.051 / 100% / 8/8 | 0.2 / -0.1 / 100% / 8/8 | 0.037 / -0.037 / 100% / 8/8 | 8.1 / 8.1 / 75% / 8/8 | 7.9 / 7.9 / 75% / 8/8 | 11.2 / -1.6 / 100% / 8/8 | 2.5 / -2.5 / 100% / 8/8 | 58.9 / 58.9 / 100% / 1/8 | 0.5 / -0.5 / 100% / 8/8 | 6.6 / 6.6 / 100% / 8/8 | 57.0 / 57.0 / 100% / 1/8 | 0.7 / 0.5 / – / 8/8 |
| shake | 0.013 / -0.013 / 100% / 5/5 | 0.9 / -0.8 / 100% / 5/5 | 0.014 / -0.005 / 100% / 5/5 | 4.4 / 4.4 / 100% / 5/5 | 2.6 / 2.6 / 100% / 5/5 | 14.1 / 3.9 / 100% / 5/5 | 0.6 / 0.3 / 100% / 5/5 | – (0/5: POSE_LOW_QUALITY) | 1.4 / -1.4 / 100% / 5/5 | 3.3 / 3.3 / 100% / 5/5 | – (0/5: POSE_LOW_QUALITY) | 8.5 / -8.2 / – / 5/5 |
| slomo | 0.050 / -0.050 / 100% / 2/2 | 0.3 / -0.3 / 100% / 2/2 | 0.031 / -0.031 / 100% / 2/2 | 4.9 / 4.9 / 100% / 2/2 | 4.9 / 4.9 / 100% / 2/2 | 3.6 / 3.6 / 100% / 2/2 | 2.2 / -2.2 / 100% / 2/2 | 105.3 / -105.3 / 50% / 2/2 | 0.3 / 0.1 / 100% / 2/2 | 2.0 / 2.0 / 100% / 2/2 | 55.1 / -13.4 / 50% / 2/2 | 0.7 / -0.1 / – / 2/2 |

### audio: event timing error (ms; MAE / bias / n found of clips), by capture fps

| event | 30 fps | 60 fps | 120 fps | 240 fps |
| --- | --- | --- | --- | --- |
| tossRelease | 79.8 / 32.8 / 6/6 | 13.3 / -1.5 / 105/105 | 6.0 / -4.9 / 5/5 | 8.4 / 0.5 / 13/13 |
| tossApex | 0.8 / -0.7 / 6/6 | 0.7 / 0.0 / 105/105 | 0.1 / 0.0 / 5/5 | 0.1 / 0.0 / 13/13 |
| trophy (lowest hip) | 86.8 / 34.9 / 6/6 | 85.6 / 24.3 / 105/105 | 74.6 / 73.2 / 5/5 | 73.1 / 73.1 / 13/13 |
| contact | 1.1 / 1.1 / 6/6 | 1.1 / -0.6 / 105/105 | 0.4 / -0.3 / 5/5 | 0.6 / -0.6 / 13/13 |
| landing | 120.9 / 72.3 / 6/6 | 65.6 / 28.4 / 105/105 | 80.7 / 54.9 / 5/5 | 66.5 / 46.5 / 13/13 |
| recoveryEnd | 544.9 / -333.6 / 6/6 | 395.1 / -282.2 / 105/105 | 379.0 / -292.1 / 5/5 | 402.2 / -254.4 / 13/13 |
| motionStart | 55.6 / -0.0 / 6/6 | 124.3 / 65.0 / 105/105 | 34.5 / 27.8 / 5/5 | 100.3 / 90.1 / 13/13 |

## injected: per metric (all clips)

| metric | unit | n measured | bias | MAE | p95 | max | coverage | status distribution |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| serve-count | count | 122 of 122 | 0.0 | 0.0 | 0.0 | 0.0 | – | estimated 117, experimental 5 |
| toss-apex-height | ratio | 118 of 129 | -0.063 | 0.063 | 0.089 | 0.121 | 100% (118) | experimental:VALIDATION_PENDING 97, unavailable:APEX_OUT_OF_FRAME 1, estimated 21, unavailable:CAMERA_TILTED 5, unavailable:VIEW_MISMATCH 5 |
| toss-forward | cm | 112 of 129 | -2.5 | 2.6 | 4.4 | 6.3 | 100% (112) | experimental:VALIDATION_PENDING 112, unavailable:APEX_OUT_OF_FRAME 1, unavailable:CAMERA_TILTED 5, unavailable:VIEW_MISMATCH 5, unavailable:NEEDS_SIDE_VIEW 6 |
| toss-lateral | cm | 0 of 129 | – | – | – | – | – | unavailable:NEEDS_REAR_VIEW 123, experimental:VALIDATION_PENDING 6 |
| toss-drop | cm | 123 of 129 | -0.3 | 0.8 | 3.6 | 9.4 | 99% (123) | estimated 118, unavailable:APEX_OUT_OF_FRAME 1, unavailable:VIEW_MISMATCH 5, experimental:VALIDATION_PENDING 5 |
| contact-height-ratio | ratio | 119 of 129 | -0.038 | 0.039 | 0.064 | 0.073 | 100% (119) | experimental:VALIDATION_PENDING 98, estimated 21, unavailable:CAMERA_TILTED 5, unavailable:VIEW_MISMATCH 5 |
| contact-forward | cm | 113 of 129 | -3.0 | 3.0 | 5.1 | 9.0 | 100% (113) | experimental:VALIDATION_PENDING 113, unavailable:CAMERA_TILTED 5, unavailable:VIEW_MISMATCH 5, unavailable:NEEDS_SIDE_VIEW 6 |
| rhythm-release-to-contact | ms | 124 of 129 | 0.7 | 13.3 | 38.8 | 135.8 | 99% (124) | estimated 113, experimental:FPS_TOO_LOW 6, unavailable:VIEW_MISMATCH 5, experimental:VALIDATION_PENDING 5 |
| trophy-pause | ms | 59 of 129 | 102.3 | 152.3 | 348.1 | 417.9 | 19% (59) | experimental:VALIDATION_PENDING 55, unavailable:POSE_LOW_QUALITY 59, unavailable:FPS_TOO_LOW 6, unavailable:VIEW_MISMATCH 5, experimental:CONDITION_NOT_VALIDATED 4 |
| leg-drive | % H | 118 of 129 | -0.0 | 0.7 | 1.8 | 2.7 | 100% (118) | estimated 113, unavailable:VIEW_MISMATCH 5, experimental:CONDITION_NOT_VALIDATED 5, unavailable:NEEDS_SIDE_VIEW 6 |
| drive-time | ms | 60 of 129 | -14.2 | 80.2 | 160.0 | 212.6 | 80% (60) | experimental:VALIDATION_PENDING 56, unavailable:POSE_LOW_QUALITY 58, unavailable:VIEW_MISMATCH 5, experimental:CONDITION_NOT_VALIDATED 4, unavailable:NEEDS_SIDE_VIEW 6 |
| loading-depth | % H | 118 of 129 | 0.3 | 0.6 | 1.6 | 2.6 | 100% (118) | estimated 113, unavailable:VIEW_MISMATCH 5, experimental:CONDITION_NOT_VALIDATED 5, unavailable:NEEDS_SIDE_VIEW 6 |
| landing-distance | cm | 110 of 129 | -6.2 | 6.3 | 15.6 | 22.5 | 89% (110) | experimental:VALIDATION_PENDING 105, unavailable:LANDING_NOT_FOUND 3, unavailable:CAMERA_TILTED 5, unavailable:VIEW_MISMATCH 5, experimental:CONDITION_NOT_VALIDATED 5, unavailable:NEEDS_SIDE_VIEW 6 |
| shoulder-tilt-trophy (2D level, deg) | deg | 113 of 129 | -0.5 | 3.2 | 10.3 | 15.2 | – | experimental:VALIDATION_PENDING 108, unavailable:CAMERA_TILTED 5, unavailable:VIEW_MISMATCH 5, experimental:CONDITION_NOT_VALIDATED 5, unavailable:NEEDS_SIDE_VIEW 6 |
| shoulder-tilt-trophy (3D, deg) | deg | 113 of 129 | 1.1 | 3.4 | 9.7 | 12.5 | – | experimental 113, unavailable:undefined 16 |
| deep-bend-flag |  | 112 of 129 | 0.4 | 0.4 | 1.0 | 1.0 | – | experimental:VALIDATION_PENDING 107, unavailable:CAMERA_TILTED 5, unavailable:VIEW_MISMATCH 5, experimental:CONDITION_NOT_VALIDATED 5, unavailable:NEEDS_SIDE_VIEW 6, unavailable:OCCLUDED 1 |
| knee-bend-band |  | 6 of 129 | 0.0 | 0.0 | 0.0 | 0.0 | – | unavailable:NEEDS_REAR_VIEW 123, experimental:VALIDATION_PENDING 6 |
| speed-experimental |  | 0 of 129 | – | – | – | – | – | unavailable:FPS_TOO_LOW 100, unavailable:RANGE_TOO_WIDE 15, unavailable:VIEW_MISMATCH 5, unavailable:NEEDS_SIDE_VIEW 6, unavailable:TIME_BASE_UNKNOWN 3 |
| toss-height-spread (pooled) |  | 1 of 1 | -1.3 | 1.3 | 1.3 | 1.3 | 100% (1) | pooled 1 |
| toss-forward-spread (pooled) |  | 1 of 1 | -1.0 | 1.0 | 1.0 | 1.0 | 100% (1) | pooled 1 |
| contact-height-spread (pooled) |  | 1 of 1 | -1.9 | 1.9 | 1.9 | 1.9 | 100% (1) | pooled 1 |
| rhythm-spread (pooled) |  | 1 of 1 | -5.8 | 5.8 | 5.8 | 5.8 | 100% (1) | pooled 1 |
| toss-height-spread (session headline stratum) |  | 0 of 1 | – | – | – | – | – | unavailable:TOO_FEW_SERVES 1 |
| toss-forward-spread (session headline stratum) |  | 0 of 1 | – | – | – | – | – | unavailable:TOO_FEW_SERVES 1 |
| contact-height-spread (session headline stratum) |  | 0 of 1 | – | – | – | – | – | unavailable:TOO_FEW_SERVES 1 |
| rhythm-spread (session headline stratum) |  | 0 of 1 | – | – | – | – | – | unavailable:TOO_FEW_SERVES 1 |

### injected: per metric × scenario (MAE / bias / coverage / measured)

| scenario | toss-apex-height | toss-drop | contact-height-ratio | toss-forward | contact-forward | rhythm-release-to-contact | leg-drive | drive-time | loading-depth | landing-distance | trophy-pause | shoulder-tilt-trophy (2D level, deg) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| advanced | 0.073 / -0.073 / 100% / 5/5 | 2.4 / -2.3 / 100% / 5/5 | 0.038 / -0.038 / 100% / 5/5 | 2.9 / -2.9 / 100% / 5/5 | 3.3 / -3.3 / 100% / 5/5 | 24.0 / 20.8 / 80% / 5/5 | 0.4 / -0.1 / 100% / 5/5 | 58.2 / 58.2 / 100% / 5/5 | 0.3 / 0.3 / 100% / 5/5 | 8.0 / -8.0 / 100% / 5/5 | 167.5 / 147.2 / 40% / 5/5 | 2.4 / -0.1 / – / 5/5 |
| apexout | 0.084 / -0.084 / 100% / 4/5 | 0.2 / -0.0 / 100% / 4/5 | 0.055 / -0.055 / 100% / 5/5 | 3.0 / -3.0 / 100% / 4/5 | 3.4 / -3.4 / 100% / 5/5 | 12.0 / -4.9 / 100% / 5/5 | 0.5 / -0.2 / 100% / 5/5 | 67.2 / -28.4 / 67% / 3/5 | 0.7 / 0.2 / 100% / 5/5 | 4.2 / -4.2 / 100% / 4/5 | 168.6 / 168.6 / 0% / 3/5 | 2.0 / 0.9 / – / 5/5 |
| baseline | 0.073 / -0.073 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.046 / -0.046 / 100% / 5/5 | 3.2 / -3.2 / 100% / 5/5 | 3.6 / -3.6 / 100% / 5/5 | 5.2 / 4.9 / 100% / 5/5 | 0.5 / -0.0 / 100% / 5/5 | 80.2 / -54.4 / 75% / 4/5 | 0.9 / 0.7 / 100% / 5/5 | 5.1 / -5.1 / 100% / 5/5 | 169.7 / 169.7 / 25% / 4/5 | 2.2 / -2.1 / – / 5/5 |
| beginner | 0.072 / -0.072 / 100% / 5/5 | 0.9 / 0.3 / 100% / 5/5 | 0.044 / -0.044 / 100% / 5/5 | 1.5 / -0.6 / 100% / 5/5 | 2.1 / -0.7 / 100% / 5/5 | 21.0 / -11.8 / 100% / 5/5 | 0.9 / 0.9 / 100% / 5/5 | – (0/5: POSE_LOW_QUALITY) | 0.6 / 0.6 / 100% / 5/5 | 8.6 / -8.6 / 60% / 5/5 | – (0/5: POSE_LOW_QUALITY) | 7.2 / 5.8 / – / 5/5 |
| crf18 | 0.069 / -0.069 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.042 / -0.042 / 100% / 5/5 | 3.0 / -3.0 / 100% / 5/5 | 3.6 / -3.6 / 100% / 5/5 | 5.4 / 4.7 / 100% / 5/5 | 0.9 / -0.2 / 100% / 5/5 | 64.6 / 25.4 / 100% / 2/5 | 0.6 / 0.6 / 100% / 5/5 | 3.9 / -3.9 / 100% / 5/5 | 95.6 / -62.7 / 50% / 2/5 | 3.4 / -3.4 / – / 5/5 |
| crf28 | 0.073 / -0.073 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.049 / -0.049 / 100% / 5/5 | 3.0 / -3.0 / 100% / 5/5 | 3.4 / -3.4 / 100% / 5/5 | 6.3 / 6.3 / 100% / 5/5 | 0.9 / -0.4 / 100% / 5/5 | 110.9 / -110.9 / 100% / 2/5 | 0.4 / 0.3 / 100% / 5/5 | 4.1 / -4.1 / 100% / 5/5 | 102.2 / 102.2 / 0% / 2/5 | 3.7 / 3.0 / – / 5/5 |
| crf36 | 0.075 / -0.075 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.049 / -0.049 / 100% / 5/5 | 2.8 / -2.8 / 100% / 5/5 | 3.2 / -3.2 / 100% / 5/5 | 7.0 / 6.3 / 100% / 5/5 | 0.8 / -0.8 / 100% / 5/5 | – (0/5: POSE_LOW_QUALITY) | 0.3 / -0.2 / 100% / 5/5 | 9.3 / -9.3 / 80% / 5/5 | – (0/5: POSE_LOW_QUALITY) | 2.0 / 1.0 / – / 5/5 |
| default75 | 0.044 / -0.044 / 100% / 3/3 | 0.2 / -0.2 / 100% / 3/3 | 0.024 / -0.024 / 100% / 3/3 | 1.4 / -1.4 / 100% / 3/3 | 1.5 / -1.5 / 100% / 3/3 | 10.1 / -8.1 / 100% / 3/3 | 0.7 / -0.1 / 100% / 3/3 | 72.6 / 49.3 / 50% / 2/3 | 0.2 / 0.2 / 100% / 3/3 | 5.0 / -4.4 / 100% / 3/3 | 209.9 / 71.5 / 0% / 2/3 | 2.6 / 0.5 / – / 3/3 |
| dist12 | 0.023 / -0.023 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.011 / -0.011 / 100% / 5/5 | 0.9 / -0.8 / 100% / 5/5 | 0.8 / -0.8 / 100% / 5/5 | 11.5 / 1.7 / 100% / 5/5 | 1.1 / 0.4 / 100% / 5/5 | 47.4 / 47.4 / 100% / 2/5 | 0.8 / 0.3 / 100% / 5/5 | 5.7 / -5.7 / 100% / 5/5 | 166.7 / 166.7 / 50% / 2/5 | 2.7 / -2.1 / – / 5/5 |
| dist4 | – (0/5: CAMERA_TILTED) | 0.7 / 0.6 / 100% / 5/5 | – (0/5: CAMERA_TILTED) | – (0/5: CAMERA_TILTED) | – (0/5: CAMERA_TILTED) | 19.1 / 19.1 / 100% / 5/5 | 0.9 / -0.6 / 100% / 5/5 | 84.4 / -15.3 / 100% / 4/5 | 0.5 / 0.3 / 100% / 5/5 | – (0/5: CAMERA_TILTED) | 206.9 / 24.7 / 0% / 4/5 | – (0/5: CAMERA_TILTED) |
| dist7 | 0.043 / -0.043 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.028 / -0.028 / 100% / 5/5 | 1.8 / -1.8 / 100% / 5/5 | 2.2 / -2.2 / 100% / 5/5 | 9.7 / -1.3 / 100% / 5/5 | 0.6 / 0.0 / 100% / 5/5 | 101.1 / -101.1 / 50% / 2/5 | 0.7 / 0.5 / 100% / 5/5 | 8.1 / -8.1 / 75% / 4/5 | 47.1 / 47.1 / 100% / 2/5 | 1.6 / -1.5 / – / 5/5 |
| dusk | 0.065 / -0.065 / 100% / 5/5 | 4.2 / -3.0 / 80% / 5/5 | 0.029 / -0.027 / 100% / 5/5 | 2.6 / -2.6 / 100% / 5/5 | 3.2 / -3.2 / 100% / 5/5 | 10.1 / -2.9 / 100% / 5/5 | 0.7 / -0.3 / 100% / 5/5 | 78.9 / 50.5 / 100% / 3/5 | 0.6 / 0.6 / 100% / 5/5 | 4.5 / -4.5 / 100% / 5/5 | 182.3 / 182.3 / 0% / 3/5 | 2.9 / -1.3 / – / 5/5 |
| fence9 | 0.031 / -0.031 / 100% / 3/3 | 1.3 / 1.1 / 100% / 3/3 | 0.022 / -0.022 / 100% / 3/3 | 1.4 / -1.4 / 100% / 3/3 | 1.8 / -1.8 / 100% / 3/3 | 13.7 / -4.4 / 100% / 3/3 | 0.8 / -0.2 / 100% / 3/3 | 135.1 / 135.1 / 100% / 1/3 | 0.8 / 0.2 / 100% / 3/3 | 5.7 / -5.4 / 67% / 3/3 | 21.7 / 21.7 / 100% / 1/3 | 3.7 / -3.5 / – / 3/3 |
| fps120 | 0.073 / -0.073 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.048 / -0.048 / 100% / 5/5 | 2.8 / -2.8 / 100% / 5/5 | 3.0 / -3.0 / 100% / 5/5 | 6.0 / 4.7 / 100% / 5/5 | 0.7 / -0.4 / 100% / 5/5 | 118.3 / -118.3 / 50% / 4/5 | 0.8 / 0.6 / 100% / 5/5 | 8.5 / -8.5 / 100% / 5/5 | 150.9 / 62.2 / 0% / 4/5 | 3.9 / 2.3 / – / 5/5 |
| fps240 | 0.069 / -0.069 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.046 / -0.046 / 100% / 5/5 | 3.0 / -3.0 / 100% / 5/5 | 3.4 / -3.4 / 100% / 5/5 | 9.9 / -0.3 / 100% / 5/5 | 0.2 / -0.1 / 100% / 5/5 | 92.1 / 6.5 / 60% / 5/5 | 0.5 / 0.5 / 100% / 5/5 | 9.7 / -9.7 / 60% / 5/5 | 111.6 / 10.1 / 40% / 5/5 | 1.9 / -1.7 / – / 5/5 |
| fps30 | 0.071 / -0.071 / 100% / 5/5 | 2.3 / -0.4 / 100% / 5/5 | 0.043 / -0.043 / 100% / 5/5 | 3.1 / -2.6 / 100% / 5/5 | 3.4 / -3.0 / 100% / 5/5 | 83.6 / -48.9 / 100% / 5/5 | 0.4 / 0.3 / 100% / 5/5 | 85.0 / -85.0 / 50% / 2/5 | 0.7 / 0.3 / 100% / 5/5 | 3.3 / -3.3 / 100% / 5/5 | – (0/5: FPS_TOO_LOW) | 3.3 / -2.3 / – / 5/5 |
| front45 | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) | – (0/5: VIEW_MISMATCH) |
| h160 | 0.069 / -0.069 / 100% / 5/5 | 0.7 / -0.6 / 100% / 5/5 | 0.041 / -0.041 / 100% / 5/5 | 2.7 / -2.7 / 100% / 5/5 | 3.2 / -3.2 / 100% / 5/5 | 4.6 / 4.0 / 100% / 5/5 | 0.5 / -0.2 / 100% / 5/5 | 60.5 / -54.9 / 100% / 3/5 | 0.7 / 0.6 / 100% / 5/5 | 6.8 / -6.8 / 100% / 5/5 | 103.8 / 44.9 / 0% / 3/5 | 4.0 / -1.3 / – / 5/5 |
| h195 | 0.069 / -0.069 / 100% / 5/5 | 0.3 / -0.2 / 100% / 5/5 | 0.047 / -0.047 / 100% / 5/5 | 2.7 / -2.7 / 100% / 5/5 | 3.2 / -3.2 / 100% / 5/5 | 5.4 / 4.7 / 100% / 5/5 | 1.0 / 0.4 / 100% / 5/5 | 66.9 / 66.9 / 67% / 3/5 | 0.7 / 0.5 / 100% / 5/5 | 6.1 / -6.1 / 100% / 4/5 | 241.9 / 241.9 / 0% / 3/5 | 3.5 / -0.4 / – / 5/5 |
| lefty | 0.067 / -0.067 / 100% / 5/5 | 0.7 / 0.4 / 100% / 5/5 | 0.046 / -0.046 / 100% / 5/5 | 2.4 / -2.4 / 100% / 5/5 | 3.2 / -3.2 / 100% / 5/5 | 6.9 / 6.3 / 100% / 5/5 | 0.9 / -0.6 / 100% / 5/5 | 37.4 / 37.4 / 100% / 2/5 | 0.8 / -0.1 / 100% / 5/5 | 4.7 / -4.7 / 100% / 5/5 | 132.3 / 132.3 / 0% / 2/5 | 2.8 / 1.1 / – / 5/5 |
| night240 | 0.071 / -0.071 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.047 / -0.047 / 100% / 5/5 | 2.4 / -2.4 / 100% / 5/5 | 3.2 / -3.2 / 100% / 5/5 | 9.8 / -3.5 / 100% / 5/5 | 0.4 / -0.2 / 100% / 5/5 | 52.2 / -52.2 / 100% / 4/5 | 0.2 / 0.0 / 100% / 5/5 | 8.1 / -8.1 / 80% / 5/5 | 104.8 / 61.9 / 25% / 4/5 | 1.0 / 0.5 / – / 5/5 |
| overcast | 0.073 / -0.073 / 100% / 5/5 | 0.2 / -0.0 / 100% / 5/5 | 0.047 / -0.047 / 100% / 5/5 | 2.4 / -2.4 / 100% / 5/5 | 2.6 / -2.6 / 100% / 5/5 | 4.6 / 3.7 / 100% / 5/5 | 0.6 / -0.4 / 100% / 5/5 | – (0/5: POSE_LOW_QUALITY) | 0.4 / -0.2 / 100% / 5/5 | 4.5 / -4.5 / 100% / 5/5 | – (0/5: POSE_LOW_QUALITY) | 2.4 / 0.8 / – / 5/5 |
| quick-rear30-lefty | 0.089 / -0.089 / 100% / 1/1 | 4.6 / 4.6 / 100% / 1/1 | 0.067 / -0.067 / 100% / 1/1 | – (0/1: NEEDS_SIDE_VIEW) | – (0/1: NEEDS_SIDE_VIEW) | 44.0 / 44.0 / 100% / 1/1 | – (0/1: NEEDS_SIDE_VIEW) | – (0/1: NEEDS_SIDE_VIEW) | – (0/1: NEEDS_SIDE_VIEW) | – (0/1: NEEDS_SIDE_VIEW) | – (0/1: FPS_TOO_LOW) | – (0/1: NEEDS_SIDE_VIEW) |
| quick-side60 | 0.071 / -0.071 / 100% / 1/1 | 0.2 / -0.2 / 100% / 1/1 | 0.039 / -0.039 / 100% / 1/1 | 3.3 / -3.3 / 100% / 1/1 | 3.0 / -3.0 / 100% / 1/1 | 3.7 / -3.7 / 100% / 1/1 | 0.5 / -0.5 / 100% / 1/1 | 169.2 / -169.2 / 0% / 1/1 | 0.5 / 0.5 / 100% / 1/1 | 2.5 / -2.5 / 100% / 1/1 | 158.3 / -158.3 / 0% / 1/1 | 0.4 / 0.4 / – / 1/1 |
| quick-slomo | 0.003 / -0.003 / 100% / 1/1 | 0.0 / -0.0 / 100% / 1/1 | 0.011 / 0.011 / 100% / 1/1 | 0.9 / -0.9 / 100% / 1/1 | 1.1 / -1.1 / 100% / 1/1 | 1.5 / -1.5 / 100% / 1/1 | 0.6 / -0.6 / 100% / 1/1 | – (0/1: POSE_LOW_QUALITY) | 0.3 / 0.3 / 100% / 1/1 | 6.1 / -6.1 / 100% / 1/1 | – (0/1: POSE_LOW_QUALITY) | 1.4 / -1.4 / – / 1/1 |
| rear | 0.083 / -0.083 / 100% / 5/5 | 0.5 / 0.4 / 100% / 5/5 | 0.045 / -0.045 / 100% / 5/5 | – (0/5: NEEDS_SIDE_VIEW) | – (0/5: NEEDS_SIDE_VIEW) | 11.4 / 4.3 / 100% / 5/5 | – (0/5: NEEDS_SIDE_VIEW) | – (0/5: NEEDS_SIDE_VIEW) | – (0/5: NEEDS_SIDE_VIEW) | – (0/5: NEEDS_SIDE_VIEW) | 161.6 / 161.6 / 0% / 1/5 | – (0/5: NEEDS_SIDE_VIEW) |
| session | 0.018 / -0.017 / 100% / 8/8 | 1.0 / -0.6 / 100% / 8/8 | 0.011 / -0.002 / 100% / 8/8 | 1.6 / -1.6 / 100% / 8/8 | 1.9 / -1.9 / 100% / 8/8 | 11.6 / -3.2 / 100% / 8/8 | 0.7 / 0.5 / 100% / 8/8 | 99.7 / 9.3 / 80% / 5/8 | 0.8 / 0.5 / 100% / 8/8 | 5.8 / -5.7 / 75% / 8/8 | 180.3 / 180.3 / 0% / 5/8 | 2.3 / 1.2 / – / 8/8 |
| shake | 0.073 / -0.073 / 100% / 5/5 | 1.1 / -1.0 / 100% / 5/5 | 0.045 / -0.045 / 100% / 5/5 | 5.8 / -5.8 / 100% / 5/5 | 7.6 / -7.6 / 100% / 5/5 | 13.3 / 3.1 / 100% / 5/5 | 1.6 / 1.6 / 100% / 5/5 | – (0/5: POSE_LOW_QUALITY) | 1.1 / -1.0 / 100% / 5/5 | 5.7 / -5.7 / 100% / 5/5 | – (0/5: POSE_LOW_QUALITY) | 10.8 / -10.3 / – / 5/5 |
| slomo | 0.070 / -0.070 / 100% / 2/2 | 0.3 / -0.3 / 100% / 2/2 | 0.041 / -0.041 / 100% / 2/2 | 3.1 / -3.1 / 100% / 2/2 | 3.1 / -3.1 / 100% / 2/2 | 3.6 / 3.6 / 100% / 2/2 | 0.4 / -0.4 / 100% / 2/2 | 56.3 / -56.3 / 100% / 1/2 | 0.4 / 0.1 / 100% / 2/2 | 14.5 / -14.5 / 0% / 2/2 | 221.7 / 221.7 / 0% / 1/2 | 0.7 / 0.5 / – / 2/2 |

### injected: event timing error (ms; MAE / bias / n found of clips), by capture fps

| event | 30 fps | 60 fps | 120 fps | 240 fps |
| --- | --- | --- | --- | --- |
| tossRelease | 79.8 / 32.8 / 6/6 | 13.3 / -1.5 / 105/105 | 6.0 / -4.9 / 5/5 | 8.4 / 0.5 / 13/13 |
| tossApex | 0.8 / -0.7 / 6/6 | 0.7 / 0.0 / 105/105 | 0.1 / 0.0 / 5/5 | 0.1 / 0.0 / 13/13 |
| trophy (lowest hip) | 105.1 / -17.1 / 6/6 | 101.2 / -15.5 / 105/105 | 108.4 / 80.5 / 5/5 | 68.7 / 24.1 / 13/13 |
| contact | 6.9 / -0.7 / 6/6 | 2.1 / -1.2 / 105/105 | 0.4 / -0.3 / 5/5 | 0.6 / -0.6 / 13/13 |
| landing | 118.2 / 77.9 / 6/6 | 72.9 / 0.8 / 105/105 | 86.3 / 20.7 / 5/5 | 75.0 / 27.6 / 13/13 |
| recoveryEnd | 609.2 / -350.3 / 6/6 | 426.4 / -163.3 / 105/105 | 298.7 / 54.5 / 5/5 | 398.0 / 292.2 / 13/13 |
| motionStart | 50.0 / 27.8 / 6/6 | 154.5 / 140.2 / 105/105 | 58.3 / 51.7 / 5/5 | 114.0 / 85.8 / 13/13 |

## Acceptance against the METRICS S0 thresholds (default variant)

Pass/fail per metric on the D1 envelope and on all side-view day clips at 60 fps or more (5 m clips of the older base240 family included). Coverage = per-serve 95% interval coverage. Metrics that fail stay at V0 (experimental) in the engine; see `app/src/analysis/metrics/catalogue.ts`.

| metric | threshold | D1 envelope (portrait 7–7.5 m, landscape fence 9 m) | all side-view day clips ≥ 60 fps |
| --- | --- | --- | --- |
| toss-apex-height | median |e| ≤ 0.025, p95 ≤ 0.05, cov ≥ 93% | PASS: median 0.011, p95 0.027, cov 100% (n 11) | FAIL: median 0.043, p95 0.069, cov 100% (n 94) |
| toss-forward | MAE ≤ 5 cm, p95 ≤ 10, cov ≥ 93% | FAIL: MAE 6.7, p95 8.6, cov 100% (n 11) | FAIL: MAE 5.4, p95 8.3, cov 99% (n 94) |
| toss-drop | MAE ≤ 5 cm, cov ≥ 93% | PASS: MAE 0.5, cov 100% (n 11) | PASS: MAE 0.7, cov 99% (n 94) |
| contact-height-ratio | MAE ≤ 0.03, p95 ≤ 0.05, cov ≥ 93% | PASS: MAE 0.007, p95 0.020, cov 100% (n 11) | FAIL: MAE 0.025, p95 0.050, cov 100% (n 95) |
| contact-forward | MAE ≤ 6 cm, p95 ≤ 12, cov ≥ 93% | FAIL: MAE 6.6, p95 8.5, cov 100% (n 11) | PASS: MAE 5.1, p95 8.5, cov 98% (n 95) |
| rhythm-release-to-contact | MAE ≤ 1 frame + 5 ms (21.7 ms at 60), cov ≥ 93% | PASS: MAE 11.0, cov 100% (n 11) | PASS: MAE 9.3, cov 99% (n 95) |
| trophy-pause | MAE ≤ 60 ms | FAIL: MAE 99.9 (n 6) | FAIL: MAE 65.1 (n 68) |
| leg-drive | MAE ≤ 2% H, cov ≥ 93% | FAIL: MAE 2.5, bias -2.5, cov 100% (n 11) | PASS: MAE 1.9, bias -1.8, cov 100% (n 95) |
| drive-time | MAE ≤ 50 ms, cov ≥ 93% | FAIL: MAE 63.8, cov 83% (n 6) | FAIL: MAE 74.9, cov 74% (n 68) |
| loading-depth | MAE ≤ 2% H | PASS: MAE 0.4 (n 11) | PASS: MAE 0.4 (n 95) |
| landing-distance | MAE ≤ 8 cm, p95 ≤ 15, cov ≥ 93% | FAIL: MAE 6.0, p95 24.1, cov 91% (n 11) | PASS: MAE 3.8, p95 7.4, cov 99% (n 95) |
| shoulder-tilt-trophy (3D, deg) | rectified 2D within ±4° of 3D (p95) | FAIL: MAE 1.6, p95 5.3 (n 11) | FAIL: MAE 2.3, p95 8.3 (n 95) |
| deep-bend-flag | two-level error ≤ 15% | PASS: error 0% (n 11) | PASS: error 6% (n 94) |
| serve-count | precision and recall ≥ 99% | PASS: 0 wrong of 11 (n 11) | PASS: 0 wrong of 95 (n 95) |
