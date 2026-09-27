# Engine smoke validation on the synthetic corpus

Generated 2026-09-27T00:28:17.124Z by `node tools/validate/smoke.mjs`. 65 clips: 65 ran to completion, 0 failed.

**Everything here is synthetic** (validation/synthetic, rendered by tools/synth). No real footage was used, so these numbers bound the engine on clean renders; they are not accuracy claims for real phones.

## Method

- Browser: msedge 154.0.4258.37 headless via Playwright (channel `msedge`), 8 logical CPUs, Intel(R) Core(TM) Ultra 5 226V. Clips run 2 at a time (stage times include contention). The machine was not otherwise idle, so stage times are indicative, not benchmarks.
- User agent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0`.
- Pipeline (app/src/validation/harness.ts, the app's own engine): probe -> audio decode + onsets -> WebCodecs (or media-element) decode -> MediaPipe Pose Landmarker full, ROI auto, VIDEO mode, numPoses 2, worker, GPU with CPU fallback -> cleanPoseFrames -> ball detection at full resolution (toss band until the audio contact onset) -> tracking, toss analysis and gravity time-scale check -> if the check says slow motion: applyTimeScale(..., 'physics'), poses re-timed and re-cleaned, ball detection re-run.
- `timeBaseKnown` is what the video layer proves: only 100 fps+ timestamps (or Android capture-fps metadata) count, so 30/60 fps clips run with an unverified time base, exactly as the app would.
- Player-entered inputs (camera view, height, handedness, target tag, court side) are taken from truth as stand-ins for what the player types in.
- Pose error: 12 core joints, strict MediaPipe left/right labels, in statures (the player's standing height in pixels). Mirror-tolerant error forgives a whole-body left/right mirror. Ball scoring uses the ball layer's own scorer (recall over visible free-flight frames; precision over all candidates; localisation error = nearest matching candidate on toss frames).
- Times are real (capture) milliseconds unless marked media. Audio onset error = detected onset minus the truth sound arrival at the phone (media time), so the sound travel time is not an error.

## Privacy (CSP)

- Probe of `https://odml.pa.googleapis.com/v1/log` (MediaPipe telemetry) during the warm-up run:
  - page: violation `connect-src https://odml.pa.googleapis.com/v1/log`, XHR network error, fetch rejected: Failed to fetch; blocked by the CSP: **yes**;
  - pose worker (`blob:http://127.0.0.1:60085/<uuid>`): violation `connect-src https://odml.pa.googleapis.com/v1/log`, XHR network error, fetch rejected: Blocked on-device: cross-origin request to https://odml.pa.googleapis.com/v1/log (privacy guard); blocked by the CSP: **yes** (XHR shows the CSP alone; fetch also meets the worker's same-origin guard);
  - requests that reached the network layer during the probe: 0.
- Requests to hosts other than the dev server during the whole run (warm-up included; the router aborts and records them): **0**.
- Requests Chromium reported but the CSP refused before the network stack (probe included): 2 (POST https://odml.pa.googleapis.com/v1/log (csp)).
- Telemetry attempts stopped inside the pose worker by its fetch guard (`[privacy]` console lines): 130.
- During the clip runs (after the probe), `securitypolicyviolation` events on the page: 0; CSP console messages from the page and workers: 0. (The worker's guard refuses the telemetry fetch before the CSP check runs, so none are expected.)
- Pose ran on 65 of 65 completed clips with the policy in force.

## Summary by scenario

Medians over the clips in each set (apex and onset errors: mean |error| / max |error|). The gravity column is the first-pass factor divided by the expected one (1 = the check recovered the true time scale; slow motion expects 0.125), median and range. Speed = experimental side-view ranges that contain the true speed / ranges produced (the rest were refused).

| set | clips | frames = truth | pose detected | pose median err (stature) | ball toss recall | ball precision | ball loc. err (px) | toss found | apex err mean / max (ms) | audio onset err mean / max (ms) | gravity factor ratio to expected | speed ranges | ms per frame (pose / ball) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| quick (CI, 540x960) | 3 | 3/3 | 100% | 0.032 | 100% | 41% | 0.27 | 3/3 | 1.67 / 4.25 | 0.07 / 0.08 | 0.998 (0.938-1.002) | 1/1 | 58 / 170 |
| baseline (side 5 m, 60 fps) | 5 | 5/5 | 100% | 0.034 | 100% | 57% | 0.32 | 5/5 | 0.22 / 0.30 | 0.07 / 0.08 | 0.992 (0.990-0.999) | 0/0 | 45 / 77 |
| fps sweep (30/120/240) | 15 | 15/15 | 100% | 0.034 | 100% | 56% | 0.37 | 15/15 | 0.23 / 0.39 | 0.07 / 0.08 | 0.995 (0.984-1.001) | 10/10 | 51 / 93 |
| view sweep (rear, front-45) | 10 | 10/10 | 100% | 0.035 | 100% | 26% | 0.21 | 10/10 | 4.58 / 4.94 | 0.07 / 0.08 | 0.994 (0.933-1.054) | 0/0 | 51 / 79 |
| distance sweep (4/7/12 m) | 15 | 15/15 | 100% | 0.035 | 100% | 55% | 0.36 | 15/15 | 0.23 / 0.45 | 0.08 / 0.19 | 1.007 (0.970-1.019) | 0/0 | 63 / 192 |
| dusk (60 fps) | 5 | 5/5 | 100% | 0.027 | 100% | 60% | 0.44 | 5/5 | 0.23 / 0.29 | 0.07 / 0.08 | 1.000 (0.993-1.008) | 0/0 | 46 / 68 |
| night 240 fps, 100 Hz flicker | 5 | 5/5 | 100% | 0.028 | 98% | 47% | 0.25 | 5/5 | 0.25 / 0.31 | 0.07 / 0.08 | 1.003 (0.997-1.009) | 5/5 | 75 / 104 |
| CRF 36 | 5 | 5/5 | 100% | 0.035 | 100% | 39% | 0.65 | 5/5 | 0.36 / 0.56 | 0.07 / 0.08 | 0.990 (0.988-0.999) | 0/0 | 51 / 82 |
| slow motion (240 as 30 fps) | 2 | 2/2 | 100% | 0.036 | 100% | 47% | 0.25 | 2/2 | 0.25 / 0.28 | 0.07 / 0.08 | 0.993 (0.988-0.998) | 2/2 | 77 / 85 |

## Computed flags

- Audio label of the onset at the racket pop: `unknown` 65 (of 65 clips); the pop was not the strongest non-bounce transient in 0.
- Toss release |error| > 50 ms: 5 (quick-rear30-lefty -53 ms, fps30-s2 +100 ms, fps30-s3 +112 ms, fps30-s4 +129 ms, fps30-s5 -135 ms).
- Toss apex outside 2 sigma of its reported uncertainty: 0. Toss apex height truth outside the reported range: 0.
- Speed-from-track (speed-experimental) refusals: "camera view 'rear': the ball travels mostly toward or away from the camera, so its image speed says little about its true speed" 6; "capture frame rate 60 fps is below 120 fps" 26; "the ball was not tracked after contact" 10; "camera view 'front45': the ball travels mostly toward or away from the camera, so its image speed says little about its true speed" 5.
- Pose frames where a whole-body left/right mirror fits better than MediaPipe's labels (median per view): rear 12%, side 36%, front45 67%.
- Outgoing tracks with detections off the ball: 5 (rear-s1 55% of 33, rear-s4 85% of 39, dusk-s2 50% of 2, dusk-s3 50% of 2, night240-s5 86% of 7).
- Rear view (6 clips; the harness has no four-corner court tap): bounce "located" 6, time error vs truth quick-rear30-lefty -18.8 ms, rear-s1 -208.8 ms, rear-s2 -0.1 ms, rear-s3 -4.9 ms, rear-s4 -0.2 ms, rear-s5 +0.7 ms; average speed "bounce not located in the video (a bounce sound alone does not say where the ball landed)" 6.

## Per clip: decode and time base

| clip | set | decode path | frames decoded / container / truth | timeline fps (truth) | time base | gravity factor [95%] (expected) | suggestion | final capture fps / time scale (truth) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| quick-rear30-lefty | quick | webcodecs | 141 / 141 / 141 | 30.00 (30) | unknown (normal) | 0.938 [0.891-0.988] (1.000) | consistent | 30.0 / 1 (30 / 1) |
| quick-side60 | quick | webcodecs | 290 / 290 / 290 | 60.00 (60) | unknown (normal) | 0.998 [0.948-1.050] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| quick-slomo | quick | webcodecs | 486 / 486 / 486 | 30.00 (30) | unknown (normal) | 0.125 [0.119-0.132] (0.125) | apply-correction x0.125 | 240.0 / 0.125 (240 / 0.125) |
| baseline-s1 | baseline | webcodecs | 290 / 290 / 290 | 60.00 (60) | unknown (normal) | 0.999 [0.949-1.052] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| baseline-s2 | baseline | webcodecs | 282 / 282 / 282 | 60.00 (60) | unknown (normal) | 0.990 [0.940-1.042] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| baseline-s3 | baseline | webcodecs | 278 / 278 / 278 | 60.00 (60) | unknown (normal) | 0.995 [0.945-1.048] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| baseline-s4 | baseline | webcodecs | 275 / 275 / 275 | 60.00 (60) | unknown (normal) | 0.990 [0.940-1.042] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| baseline-s5 | baseline | webcodecs | 276 / 276 / 276 | 60.00 (60) | unknown (normal) | 0.992 [0.942-1.044] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| fps30-s1 | fps-sweep | webcodecs | 145 / 145 / 145 | 30.00 (30) | unknown (normal) | 0.998 [0.948-1.051] (1.000) | consistent | 30.0 / 1 (30 / 1) |
| fps30-s2 | fps-sweep | webcodecs | 141 / 141 / 141 | 30.00 (30) | unknown (normal) | 0.984 [0.934-1.036] (1.000) | consistent | 30.0 / 1 (30 / 1) |
| fps30-s3 | fps-sweep | webcodecs | 139 / 139 / 139 | 30.00 (30) | unknown (normal) | 0.993 [0.943-1.045] (1.000) | consistent | 30.0 / 1 (30 / 1) |
| fps30-s4 | fps-sweep | webcodecs | 138 / 138 / 138 | 30.00 (30) | unknown (normal) | 0.992 [0.943-1.045] (1.000) | consistent | 30.0 / 1 (30 / 1) |
| fps30-s5 | fps-sweep | webcodecs | 138 / 138 / 138 | 30.00 (30) | unknown (normal) | 0.995 [0.945-1.047] (1.000) | consistent | 30.0 / 1 (30 / 1) |
| fps120-s1 | fps-sweep | webcodecs | 579 / 579 / 579 | 120.00 (120) | proven (native-high-fps) | 0.994 [0.944-1.047] (1.000) | consistent | 120.0 / 1 (120 / 1) |
| fps120-s2 | fps-sweep | webcodecs | 564 / 564 / 564 | 120.00 (120) | proven (native-high-fps) | 0.989 [0.939-1.041] (1.000) | consistent | 120.0 / 1 (120 / 1) |
| fps120-s3 | fps-sweep | webcodecs | 555 / 555 / 555 | 120.00 (120) | proven (native-high-fps) | 0.996 [0.946-1.049] (1.000) | consistent | 120.0 / 1 (120 / 1) |
| fps120-s4 | fps-sweep | webcodecs | 549 / 549 / 549 | 120.00 (120) | proven (native-high-fps) | 0.996 [0.946-1.049] (1.000) | consistent | 120.0 / 1 (120 / 1) |
| fps120-s5 | fps-sweep | webcodecs | 551 / 551 / 551 | 120.00 (120) | proven (native-high-fps) | 0.992 [0.942-1.044] (1.000) | consistent | 120.0 / 1 (120 / 1) |
| fps240-s1 | fps-sweep | webcodecs | 1158 / 1158 / 1158 | 240.00 (240) | proven (native-high-fps) | 0.996 [0.946-1.049] (1.000) | consistent | 240.0 / 1 (240 / 1) |
| fps240-s2 | fps-sweep | webcodecs | 1128 / 1128 / 1128 | 240.00 (240) | proven (native-high-fps) | 1.001 [0.951-1.054] (1.000) | consistent | 240.0 / 1 (240 / 1) |
| fps240-s3 | fps-sweep | webcodecs | 1109 / 1109 / 1109 | 240.00 (240) | proven (native-high-fps) | 0.995 [0.945-1.048] (1.000) | consistent | 240.0 / 1 (240 / 1) |
| fps240-s4 | fps-sweep | webcodecs | 1098 / 1098 / 1098 | 240.00 (240) | proven (native-high-fps) | 0.998 [0.948-1.051] (1.000) | consistent | 240.0 / 1 (240 / 1) |
| fps240-s5 | fps-sweep | webcodecs | 1101 / 1101 / 1101 | 240.00 (240) | proven (native-high-fps) | 0.991 [0.941-1.043] (1.000) | consistent | 240.0 / 1 (240 / 1) |
| front45-s1 | view-sweep | webcodecs | 290 / 290 / 290 | 60.00 (60) | unknown (normal) | 1.054 [1.001-1.109] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| front45-s2 | view-sweep | webcodecs | 282 / 282 / 282 | 60.00 (60) | unknown (normal) | 1.038 [0.986-1.093] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| front45-s3 | view-sweep | webcodecs | 278 / 278 / 278 | 60.00 (60) | unknown (normal) | 1.028 [0.976-1.082] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| front45-s4 | view-sweep | webcodecs | 275 / 275 / 275 | 60.00 (60) | unknown (normal) | 1.032 [0.980-1.086] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| front45-s5 | view-sweep | webcodecs | 276 / 276 / 276 | 60.00 (60) | unknown (normal) | 1.030 [0.978-1.084] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| rear-s1 | view-sweep | webcodecs | 290 / 290 / 290 | 60.00 (60) | unknown (normal) | 0.933 [0.886-0.982] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| rear-s2 | view-sweep | webcodecs | 282 / 282 / 282 | 60.00 (60) | unknown (normal) | 0.941 [0.894-0.990] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| rear-s3 | view-sweep | webcodecs | 278 / 278 / 278 | 60.00 (60) | unknown (normal) | 0.961 [0.913-1.012] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| rear-s4 | view-sweep | webcodecs | 275 / 275 / 275 | 60.00 (60) | unknown (normal) | 0.949 [0.901-0.999] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| rear-s5 | view-sweep | webcodecs | 276 / 276 / 276 | 60.00 (60) | unknown (normal) | 0.939 [0.892-0.988] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| dist4-s1 | distance-sweep | webcodecs | 290 / 290 / 290 | 60.00 (60) | unknown (normal) | 0.980 [0.931-1.032] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| dist4-s2 | distance-sweep | webcodecs | 282 / 282 / 282 | 60.00 (60) | unknown (normal) | 0.970 [0.921-1.021] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| dist4-s3 | distance-sweep | webcodecs | 278 / 278 / 278 | 60.00 (60) | unknown (normal) | 0.981 [0.932-1.033] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| dist4-s4 | distance-sweep | webcodecs | 275 / 275 / 275 | 60.00 (60) | unknown (normal) | 0.978 [0.929-1.029] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| dist4-s5 | distance-sweep | webcodecs | 276 / 276 / 276 | 60.00 (60) | unknown (normal) | 0.970 [0.921-1.021] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| dist7-s1 | distance-sweep | webcodecs | 290 / 290 / 290 | 60.00 (60) | unknown (normal) | 1.014 [0.963-1.067] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| dist7-s2 | distance-sweep | webcodecs | 282 / 282 / 282 | 60.00 (60) | unknown (normal) | 1.009 [0.958-1.062] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| dist7-s3 | distance-sweep | webcodecs | 278 / 278 / 278 | 60.00 (60) | unknown (normal) | 1.012 [0.961-1.065] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| dist7-s4 | distance-sweep | webcodecs | 275 / 275 / 275 | 60.00 (60) | unknown (normal) | 1.002 [0.951-1.055] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| dist7-s5 | distance-sweep | webcodecs | 276 / 276 / 276 | 60.00 (60) | unknown (normal) | 1.000 [0.949-1.052] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| dist12-s1 | distance-sweep | webcodecs | 290 / 290 / 290 | 60.00 (60) | unknown (normal) | 1.018 [0.967-1.072] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| dist12-s2 | distance-sweep | webcodecs | 282 / 282 / 282 | 60.00 (60) | unknown (normal) | 1.007 [0.957-1.061] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| dist12-s3 | distance-sweep | webcodecs | 278 / 278 / 278 | 60.00 (60) | unknown (normal) | 1.019 [0.968-1.072] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| dist12-s4 | distance-sweep | webcodecs | 275 / 275 / 275 | 60.00 (60) | unknown (normal) | 1.013 [0.963-1.067] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| dist12-s5 | distance-sweep | webcodecs | 276 / 276 / 276 | 60.00 (60) | unknown (normal) | 1.019 [0.967-1.072] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| dusk-s1 | dusk | webcodecs | 290 / 290 / 290 | 60.00 (60) | unknown (normal) | 1.005 [0.955-1.058] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| dusk-s2 | dusk | webcodecs | 282 / 282 / 282 | 60.00 (60) | unknown (normal) | 1.000 [0.950-1.053] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| dusk-s3 | dusk | webcodecs | 278 / 278 / 278 | 60.00 (60) | unknown (normal) | 1.008 [0.957-1.061] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| dusk-s4 | dusk | webcodecs | 275 / 275 / 275 | 60.00 (60) | unknown (normal) | 1.000 [0.949-1.052] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| dusk-s5 | dusk | webcodecs | 276 / 276 / 276 | 60.00 (60) | unknown (normal) | 0.993 [0.943-1.046] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| night240-s1 | night240 | webcodecs | 1158 / 1158 / 1158 | 240.00 (240) | proven (native-high-fps) | 1.009 [0.958-1.062] (1.000) | consistent | 240.0 / 1 (240 / 1) |
| night240-s2 | night240 | webcodecs | 1128 / 1128 / 1128 | 240.00 (240) | proven (native-high-fps) | 1.003 [0.953-1.056] (1.000) | consistent | 240.0 / 1 (240 / 1) |
| night240-s3 | night240 | webcodecs | 1109 / 1109 / 1109 | 240.00 (240) | proven (native-high-fps) | 1.006 [0.955-1.059] (1.000) | consistent | 240.0 / 1 (240 / 1) |
| night240-s4 | night240 | webcodecs | 1098 / 1098 / 1098 | 240.00 (240) | proven (native-high-fps) | 1.001 [0.950-1.054] (1.000) | consistent | 240.0 / 1 (240 / 1) |
| night240-s5 | night240 | webcodecs | 1101 / 1101 / 1101 | 240.00 (240) | proven (native-high-fps) | 0.997 [0.947-1.049] (1.000) | consistent | 240.0 / 1 (240 / 1) |
| crf36-s1 | crf36 | webcodecs | 290 / 290 / 290 | 60.00 (60) | unknown (normal) | 0.996 [0.946-1.048] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| crf36-s2 | crf36 | webcodecs | 282 / 282 / 282 | 60.00 (60) | unknown (normal) | 0.990 [0.940-1.042] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| crf36-s3 | crf36 | webcodecs | 278 / 278 / 278 | 60.00 (60) | unknown (normal) | 0.988 [0.938-1.040] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| crf36-s4 | crf36 | webcodecs | 275 / 275 / 275 | 60.00 (60) | unknown (normal) | 0.999 [0.948-1.051] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| crf36-s5 | crf36 | webcodecs | 276 / 276 / 276 | 60.00 (60) | unknown (normal) | 0.990 [0.941-1.043] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| slomo-s1 | slomo | webcodecs | 1158 / 1158 / 1158 | 30.00 (30) | unknown (normal) | 0.125 [0.118-0.131] (0.125) | apply-correction x0.125 | 240.0 / 0.125 (240 / 0.125) |
| slomo-s2 | slomo | webcodecs | 1128 / 1128 / 1128 | 30.00 (30) | unknown (normal) | 0.124 [0.117-0.130] (0.125) | apply-correction x0.125 | 240.0 / 0.125 (240 / 0.125) |

## Per clip: accuracy against truth

Pose columns are raw tracked MediaPipe output (before cleaning). Ball and toss columns are the final pass (after any time-scale correction).

| clip | pose detected | pose median / mean err (stature) | mirror-tol. mean | hitting wrist ±0.1 s | ball toss recall | ball precision (false / frame) | loc. err median / p95 (px) | toss track prec. / coverage | apex err (ms, z) | release err (ms) | apex height err (cm, in range) | audio contact onset err (ms, label) | ball layer contact from audio (ms) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| quick-rear30-lefty | 100% | 0.017 / 0.041 | 0.027 | 0.018 | 100% | 30% (1.89) | 0.19 / 0.61 | 100% / 100% | -4.25 (-0.3) | -53.4 | -21.6 (yes) | +0.07 (unknown) | +3.2 |
| quick-side60 | 100% | 0.032 / 0.102 | 0.026 | 0.110 | 100% | 48% (0.62) | 0.27 / 0.79 | 100% / 100% | +0.37 (0.4) | -11.7 | +2.8 (yes) | +0.08 (unknown) | +0.9 |
| quick-slomo | 100% | 0.038 / 0.112 | 0.036 | 0.066 | 100% | 41% (0.94) | 0.32 / 0.95 | 100% / 100% | +0.40 (0.6) | -22.5 | +5.9 (yes) | +0.07 (unknown) | – |
| baseline-s1 | 100% | 0.035 / 0.110 | 0.025 | 0.094 | 100% | 60% (0.38) | 0.22 / 0.92 | 100% / 100% | +0.25 (0.3) | -13.4 | +4.2 (yes) | +0.08 (unknown) | +0.8 |
| baseline-s2 | 100% | 0.034 / 0.106 | 0.025 | 0.033 | 100% | 54% (0.48) | 0.31 / 1.12 | 100% / 100% | +0.30 (0.4) | -27.6 | -1.0 (yes) | +0.08 (unknown) | +1.0 |
| baseline-s3 | 100% | 0.041 / 0.110 | 0.029 | 0.056 | 100% | 57% (0.42) | 0.32 / 1.64 | 100% / 100% | +0.27 (0.3) | -28.1 | +1.5 (yes) | +0.07 (unknown) | +0.8 |
| baseline-s4 | 100% | 0.031 / 0.099 | 0.026 | 0.137 | 98% | 54% (0.47) | 0.59 / 1.13 | 100% / 98% | +0.19 (0.2) | -28.3 | -0.4 (yes) | +0.06 (unknown) | +1.1 |
| baseline-s5 | 100% | 0.029 / 0.097 | 0.024 | 0.098 | 100% | 57% (0.42) | 0.56 / 0.93 | 100% / 100% | -0.11 (-0.1) | -28.4 | +0.9 (yes) | +0.08 (unknown) | +1.1 |
| fps30-s1 | 99% | 0.035 / 0.106 | 0.024 | 0.052 | 100% | 58% (0.43) | 0.22 / 0.83 | 100% / 100% | +0.25 (0.2) | -19.2 | +3.3 (yes) | +0.08 (unknown) | +0.9 |
| fps30-s2 | 100% | 0.036 / 0.113 | 0.027 | 0.084 | 96% | 59% (0.40) | 0.25 / 0.76 | 100% / 96% | +0.19 (0.1) | +99.9 | -2.8 (yes) | +0.08 (unknown) | +1.1 |
| fps30-s3 | 100% | 0.035 / 0.106 | 0.025 | 0.019 | 100% | 56% (0.45) | 0.31 / 1.99 | 100% / 100% | +0.23 (0.1) | +111.9 | +1.8 (yes) | +0.07 (unknown) | +0.8 |
| fps30-s4 | 100% | 0.032 / 0.101 | 0.027 | 0.107 | 100% | 55% (0.46) | 0.44 / 1.90 | 100% / 100% | +0.22 (0.1) | +129.2 | +3.6 (yes) | +0.06 (unknown) | +0.9 |
| fps30-s5 | 100% | 0.029 / 0.098 | 0.024 | 0.099 | 100% | 55% (0.45) | 0.47 / 1.02 | 100% / 100% | -0.26 (-0.2) | -135.1 | +1.9 (yes) | +0.08 (unknown) | +1.0 |
| fps120-s1 | 100% | 0.036 / 0.109 | 0.025 | 0.051 | 100% | 60% (0.38) | 0.27 / 0.87 | 100% / 100% | +0.22 (0.3) | -11.7 | +0.4 (yes) | +0.08 (unknown) | +1.0 |
| fps120-s2 | 100% | 0.034 / 0.106 | 0.026 | 0.041 | 100% | 55% (0.46) | 0.30 / 1.04 | 100% / 100% | +0.32 (0.4) | -26.3 | -1.6 (yes) | +0.08 (unknown) | +1.1 |
| fps120-s3 | 100% | 0.036 / 0.106 | 0.027 | 0.041 | 100% | 57% (0.43) | 0.37 / 1.45 | 100% / 100% | +0.30 (0.4) | +11.5 | +1.7 (yes) | +0.07 (unknown) | +0.8 |
| fps120-s4 | 100% | 0.032 / 0.100 | 0.026 | 0.092 | 100% | 56% (0.45) | 0.60 / 1.57 | 100% / 100% | +0.25 (0.3) | -27.1 | +3.4 (yes) | +0.06 (unknown) | +0.9 |
| fps120-s5 | 100% | 0.029 / 0.095 | 0.024 | 0.060 | 100% | 57% (0.42) | 0.48 / 0.97 | 100% / 100% | -0.06 (-0.1) | -27.6 | +1.1 (yes) | +0.08 (unknown) | +1.1 |
| fps240-s1 | 100% | 0.035 / 0.106 | 0.025 | 0.079 | 100% | 61% (0.38) | 0.23 / 0.95 | 100% / 100% | +0.24 (0.3) | -12.8 | +2.1 (yes) | +0.08 (unknown) | +0.9 |
| fps240-s2 | 100% | 0.034 / 0.107 | 0.025 | 0.045 | 100% | 56% (0.45) | 0.31 / 1.18 | 100% / 100% | +0.29 (0.4) | -26.1 | +6.2 (yes) | +0.08 (unknown) | +0.7 |
| fps240-s3 | 100% | 0.032 / 0.102 | 0.026 | 0.034 | 100% | 57% (0.43) | 0.41 / 1.45 | 100% / 100% | +0.39 (0.6) | +8.2 | +1.0 (yes) | +0.07 (unknown) | +0.9 |
| fps240-s4 | 100% | 0.031 / 0.097 | 0.026 | 0.079 | 100% | 54% (0.47) | 0.59 / 1.71 | 100% / 100% | +0.23 (0.3) | -25.8 | +4.3 (yes) | +0.06 (unknown) | +0.8 |
| fps240-s5 | 100% | 0.029 / 0.096 | 0.024 | 0.094 | 100% | 56% (0.44) | 0.50 / 1.17 | 100% / 100% | -0.01 (-0.0) | -27.2 | +0.0 (yes) | +0.08 (unknown) | +1.1 |
| front45-s1 | 100% | 0.109 / 0.127 | 0.033 | 0.204 | 100% | 19% (2.47) | 0.22 / 0.34 | 100% / 98% | +4.94 (0.2) | -20.1 | +33.0 (yes) | +0.08 (unknown) | -1.0 |
| front45-s2 | 100% | 0.112 / 0.128 | 0.030 | 0.166 | 100% | 17% (2.65) | 0.21 / 0.45 | 100% / 100% | +4.78 (0.2) | -30.9 | +22.7 (yes) | +0.08 (unknown) | -0.6 |
| front45-s3 | 100% | 0.116 / 0.129 | 0.029 | 0.172 | 100% | 17% (2.55) | 0.20 / 0.48 | 100% / 100% | +4.70 (0.3) | -48.9 | +18.5 (yes) | +0.07 (unknown) | -0.3 |
| front45-s4 | 100% | 0.081 / 0.102 | 0.032 | 0.184 | 100% | 15% (2.63) | 0.22 / 0.39 | 100% / 100% | +4.80 (0.3) | -50.0 | +19.3 (yes) | +0.08 (unknown) | -0.4 |
| front45-s5 | 100% | 0.052 / 0.090 | 0.033 | 0.179 | 100% | 15% (2.58) | 0.19 / 0.31 | 100% / 100% | +4.74 (0.3) | -25.1 | +17.4 (yes) | +0.08 (unknown) | -0.3 |
| rear-s1 | 100% | 0.017 / 0.040 | 0.027 | 0.017 | 100% | 37% (1.13) | 0.22 / 0.66 | 100% / 100% | -4.16 (-0.2) | +1.6 | -23.0 (yes) | +0.07 (unknown) | +3.3 |
| rear-s2 | 100% | 0.016 / 0.037 | 0.027 | 0.021 | 100% | 42% (1.28) | 0.19 / 0.98 | 100% / 100% | -4.25 (-0.3) | +8.3 | -17.9 (yes) | +0.07 (unknown) | +3.0 |
| rear-s3 | 100% | 0.017 / 0.038 | 0.025 | 0.033 | 100% | 43% (1.24) | 0.22 / 0.74 | 100% / 100% | -4.46 (-0.3) | -28.9 | -11.0 (yes) | +0.07 (unknown) | +2.4 |
| rear-s4 | 100% | 0.017 / 0.037 | 0.025 | 0.026 | 100% | 33% (1.32) | 0.20 / 0.86 | 100% / 100% | -4.52 (-0.3) | -30.0 | -15.7 (yes) | +0.07 (unknown) | +2.8 |
| rear-s5 | 100% | 0.015 / 0.037 | 0.026 | 0.022 | 100% | 42% (1.23) | 0.27 / 1.20 | 100% / 100% | -4.44 (-0.3) | -30.1 | -18.5 (yes) | +0.07 (unknown) | +3.1 |
| dist4-s1 | 100% | 0.029 / 0.095 | 0.027 | 0.052 | 100% | 56% (0.46) | 0.25 / 0.71 | 100% / 100% | +0.45 (0.5) | -18.4 | -3.2 (yes) | +0.08 (unknown) | +1.2 |
| dist4-s2 | 100% | 0.031 / 0.097 | 0.028 | 0.037 | 96% | 58% (0.40) | 0.24 / 0.67 | 100% / 96% | +0.36 (0.4) | -38.4 | -8.2 (yes) | +0.08 (unknown) | +1.3 |
| dist4-s3 | 100% | 0.030 / 0.095 | 0.027 | 0.040 | 100% | 56% (0.44) | 0.23 / 1.13 | 100% / 100% | +0.34 (0.4) | -29.7 | -2.9 (yes) | +0.07 (unknown) | +1.1 |
| dist4-s4 | 100% | 0.030 / 0.096 | 0.025 | 0.032 | 100% | 54% (0.48) | 0.22 / 1.06 | 100% / 100% | +0.25 (0.3) | -30.8 | -4.0 (yes) | +0.06 (unknown) | +1.2 |
| dist4-s5 | 99% | 0.033 / 0.099 | 0.027 | 0.060 | 100% | 56% (0.44) | 0.26 / 1.10 | 100% / 100% | -0.01 (-0.0) | -32.6 | -8.0 (yes) | +0.06 (unknown) | +1.4 |
| dist7-s1 | 100% | 0.030 / 0.097 | 0.024 | 0.070 | 100% | 57% (0.45) | 0.42 / 0.96 | 100% / 100% | +0.17 (0.2) | -20.9 | +9.3 (yes) | +0.07 (unknown) | +0.5 |
| dist7-s2 | 100% | 0.032 / 0.096 | 0.027 | 0.052 | 100% | 57% (0.43) | 0.47 / 0.68 | 100% / 100% | +0.10 (0.1) | -22.6 | +7.4 (yes) | +0.08 (unknown) | +0.6 |
| dist7-s3 | 100% | 0.035 / 0.105 | 0.029 | 0.034 | 100% | 54% (0.49) | 0.36 / 0.83 | 100% / 100% | +0.13 (0.2) | +9.4 | +7.6 (yes) | +0.07 (unknown) | +0.5 |
| dist7-s4 | 100% | 0.037 / 0.104 | 0.029 | 0.098 | 100% | 56% (0.45) | 0.59 / 0.96 | 100% / 100% | +0.35 (0.4) | -24.1 | +3.3 (yes) | +0.08 (unknown) | +0.9 |
| dist7-s5 | 100% | 0.035 / 0.103 | 0.029 | 0.082 | 100% | 55% (0.45) | 0.42 / 0.74 | 100% / 100% | +0.23 (0.3) | -26.8 | +2.3 (yes) | -0.19 (unknown) | +0.7 |
| dist12-s1 | 100% | 0.042 / 0.113 | 0.032 | 0.179 | 100% | 45% (0.72) | 0.33 / 0.70 | 100% / 100% | +0.07 (0.1) | -10.1 | +9.2 (yes) | +0.08 (unknown) | +0.4 |
| dist12-s2 | 100% | 0.037 / 0.101 | 0.036 | 0.017 | 100% | 46% (0.64) | 0.32 / 0.63 | 100% / 100% | +0.35 (0.4) | -20.9 | +3.8 (yes) | +0.07 (unknown) | +0.9 |
| dist12-s3 | 100% | 0.040 / 0.111 | 0.032 | 0.087 | 100% | 43% (0.75) | 0.43 / 0.66 | 100% / 100% | +0.05 (0.1) | +9.4 | +9.8 (yes) | +0.07 (unknown) | +0.3 |
| dist12-s4 | 100% | 0.040 / 0.112 | 0.031 | 0.072 | 100% | 42% (0.79) | 0.46 / 0.78 | 100% / 100% | +0.28 (0.3) | -23.3 | +7.3 (yes) | +0.07 (unknown) | +0.6 |
| dist12-s5 | 100% | 0.036 / 0.106 | 0.029 | 0.017 | 100% | 44% (0.72) | 0.49 / 1.13 | 100% / 100% | +0.23 (0.3) | -27.6 | +9.2 (yes) | +0.07 (unknown) | +0.5 |
| dusk-s1 | 100% | 0.027 / 0.077 | 0.029 | 0.174 | 100% | 60% (0.38) | 0.52 / 1.34 | 100% / 98% | +0.19 (0.2) | -13.4 | +8.3 (yes) | +0.08 (unknown) | +0.7 |
| dusk-s2 | 100% | 0.029 / 0.084 | 0.029 | 0.142 | 100% | 51% (0.54) | 0.44 / 1.53 | 100% / 100% | +0.17 (0.2) | -26.7 | +5.7 (yes) | +0.08 (unknown) | +0.7 |
| dusk-s3 | 100% | 0.031 / 0.089 | 0.029 | 0.164 | 100% | 49% (0.58) | 0.48 / 0.97 | 100% / 98% | +0.29 (0.3) | -29.7 | +10.2 (yes) | +0.07 (unknown) | +0.5 |
| dusk-s4 | 100% | 0.026 / 0.070 | 0.028 | 0.123 | 100% | 70% (0.23) | 0.37 / 1.72 | 100% / 100% | +0.29 (0.3) | -28.3 | +5.9 (yes) | +0.06 (unknown) | +0.8 |
| dusk-s5 | 100% | 0.024 / 0.058 | 0.032 | 0.128 | 100% | 72% (0.19) | 0.37 / 2.03 | 100% / 100% | +0.20 (0.2) | -30.1 | +2.7 (yes) | +0.08 (unknown) | +1.0 |
| night240-s1 | 100% | 0.028 / 0.099 | 0.023 | 0.050 | 98% | 50% (0.54) | 0.10 / 1.09 | 100% / 98% | +0.23 (0.3) | -13.8 | +9.9 (yes) | +0.08 (unknown) | +0.5 |
| night240-s2 | 100% | 0.031 / 0.102 | 0.024 | 0.020 | 96% | 45% (0.63) | 0.14 / 1.15 | 100% / 96% | +0.28 (0.4) | -23.2 | +7.0 (yes) | +0.08 (unknown) | +0.6 |
| night240-s3 | 100% | 0.030 / 0.097 | 0.025 | 0.022 | 99% | 46% (0.58) | 0.25 / 1.36 | 100% / 99% | +0.31 (0.5) | +6.9 | +7.2 (yes) | +0.07 (unknown) | +0.6 |
| night240-s4 | 100% | 0.027 / 0.093 | 0.023 | 0.026 | 99% | 47% (0.58) | 0.59 / 1.63 | 100% / 99% | +0.30 (0.4) | -24.6 | +5.2 (yes) | +0.06 (unknown) | +0.8 |
| night240-s5 | 100% | 0.027 / 0.091 | 0.025 | 0.025 | 95% | 48% (0.55) | 0.51 / 1.18 | 100% / 95% | -0.15 (-0.2) | -25.3 | +2.5 (yes) | +0.08 (unknown) | +1.0 |
| crf36-s1 | 100% | 0.035 / 0.105 | 0.026 | 0.153 | 100% | 43% (0.77) | 0.54 / 1.26 | 100% / 100% | +0.44 (0.5) | -12.6 | +2.2 (yes) | +0.08 (unknown) | +0.9 |
| crf36-s2 | 100% | 0.035 / 0.100 | 0.025 | 0.045 | 100% | 35% (1.04) | 0.56 / 1.87 | 100% / 100% | +0.56 (0.7) | -31.7 | -0.8 (yes) | +0.08 (unknown) | +1.0 |
| crf36-s3 | 100% | 0.040 / 0.103 | 0.030 | 0.088 | 100% | 38% (0.93) | 0.65 / 2.42 | 100% / 100% | +0.17 (0.2) | -28.1 | -3.4 (yes) | +0.07 (unknown) | +1.1 |
| crf36-s4 | 100% | 0.032 / 0.096 | 0.026 | 0.066 | 100% | 39% (0.86) | 1.03 / 2.27 | 100% / 100% | -0.28 (-0.3) | -27.5 | +3.5 (yes) | +0.06 (unknown) | +0.8 |
| crf36-s5 | 100% | 0.028 / 0.087 | 0.027 | 0.064 | 98% | 39% (0.86) | 0.93 / 1.69 | 100% / 98% | -0.35 (-0.4) | -27.6 | -0.5 (yes) | +0.08 (unknown) | +1.1 |
| slomo-s1 | 100% | 0.033 / 0.105 | 0.024 | 0.049 | 100% | 47% (0.65) | 0.22 / 0.88 | 100% / 100% | +0.21 (0.3) | -14.4 | +3.3 (yes) | +0.07 (unknown) | – |
| slomo-s2 | 100% | 0.039 / 0.114 | 0.027 | 0.045 | 100% | 46% (0.66) | 0.28 / 1.06 | 100% / 100% | +0.28 (0.4) | -26.1 | +0.0 (yes) | +0.08 (unknown) | – |

## Per clip: stage times (s)

Wall-clock seconds in the page. Pose pass includes decode (column "of which decode") and inference; ball pass includes RGBA decode and detection, summed over passes (2 passes after a slow-motion correction).

| clip | frames | fetch | probe | audio decode + onsets | pose init | pose pass (of which decode) | pose ms/frame | pose clean | ball pass (decode / detect) | ball ms/frame | ball analyse | total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| quick-rear30-lefty | 141 | 0.1 | 0.0 | 0.1 | 1.8 | 13.3 (0.3) | 95 | 0.1 | 23.9 (7.2 / 16.8) | 170 | 0.1 | 39.5 |
| quick-side60 | 290 | 0.0 | 0.0 | 0.1 | 1.6 | 16.9 (0.3) | 58 | 0.0 | 44.0 (9.7 / 34.3) | 152 | 0.3 | 63.1 |
| quick-slomo | 486 | 0.1 | 0.0 | 0.2 | 0.8 | 15.3 (0.3) | 32 | 0.0 | 166.5 (29.6 / 136.8) | 171 | 1.7 | 184.7 |
| baseline-s1 | 290 | 0.0 | 0.0 | 0.1 | 1.8 | 13.1 (0.2) | 45 | 0.0 | 18.7 (4.1 / 14.5) | 64 | 0.2 | 34.0 |
| baseline-s2 | 282 | 0.0 | 0.0 | 0.1 | 1.4 | 14.3 (0.2) | 51 | 0.0 | 21.6 (6.9 / 14.7) | 77 | 0.2 | 37.7 |
| baseline-s3 | 278 | 0.1 | 0.0 | 0.1 | 1.0 | 11.7 (0.2) | 42 | 0.0 | 22.2 (7.8 / 14.3) | 80 | 0.3 | 35.3 |
| baseline-s4 | 275 | 0.1 | 0.0 | 0.1 | 0.8 | 12.4 (0.2) | 45 | 0.0 | 21.2 (7.3 / 13.9) | 77 | 0.2 | 34.7 |
| baseline-s5 | 276 | 0.1 | 0.0 | 0.1 | 1.2 | 15.2 (0.2) | 55 | 0.1 | 29.4 (7.4 / 21.9) | 106 | 0.3 | 46.4 |
| fps30-s1 | 145 | 0.0 | 0.0 | 0.1 | 1.4 | 9.1 (0.2) | 63 | 0.0 | 10.3 (3.2 / 7.1) | 71 | 0.1 | 21.2 |
| fps30-s2 | 141 | 0.0 | 0.0 | 0.1 | 0.7 | 7.0 (0.1) | 50 | 0.0 | 12.8 (3.7 / 9.1) | 91 | 0.1 | 20.8 |
| fps30-s3 | 139 | 0.0 | 0.0 | 0.1 | 1.3 | 7.1 (0.1) | 51 | 0.0 | 14.6 (3.9 / 10.7) | 105 | 0.1 | 23.2 |
| fps30-s4 | 138 | 0.1 | 0.0 | 0.1 | 1.2 | 7.0 (0.1) | 51 | 0.0 | 12.6 (4.3 / 8.2) | 91 | 0.1 | 21.1 |
| fps30-s5 | 138 | 0.1 | 0.0 | 0.1 | 1.7 | 8.7 (0.2) | 63 | 0.0 | 14.4 (3.0 / 11.3) | 104 | 0.1 | 25.2 |
| fps120-s1 | 579 | 0.1 | 0.0 | 0.1 | 1.4 | 34.5 (0.5) | 60 | 0.1 | 58.5 (13.7 / 44.7) | 101 | 0.7 | 95.4 |
| fps120-s2 | 564 | 0.1 | 0.0 | 0.1 | 1.4 | 34.2 (0.5) | 61 | 0.0 | 40.1 (11.7 / 28.4) | 71 | 0.7 | 76.7 |
| fps120-s3 | 555 | 0.1 | 0.0 | 0.1 | 1.3 | 50.2 (0.7) | 91 | 0.1 | 55.0 (13.3 / 41.6) | 99 | 0.9 | 107.6 |
| fps120-s4 | 549 | 0.0 | 0.0 | 0.1 | 1.0 | 47.9 (0.7) | 87 | 0.1 | 36.6 (10.0 / 26.6) | 67 | 0.5 | 86.2 |
| fps120-s5 | 551 | 0.1 | 0.0 | 0.1 | 1.2 | 27.8 (0.4) | 51 | 0.1 | 55.7 (11.3 / 44.3) | 101 | 0.7 | 85.7 |
| fps240-s1 | 1158 | 0.1 | 0.0 | 0.1 | 1.3 | 55.9 (0.8) | 48 | 0.1 | 108.2 (24.8 / 83.1) | 93 | 2.3 | 168.1 |
| fps240-s2 | 1128 | 0.1 | 0.0 | 0.1 | 0.7 | 51.1 (0.7) | 45 | 0.1 | 92.2 (25.0 / 67.1) | 82 | 2.4 | 146.9 |
| fps240-s3 | 1109 | 0.1 | 0.0 | 0.1 | 1.7 | 55.7 (0.8) | 50 | 0.1 | 111.4 (25.2 / 86.2) | 100 | 2.3 | 171.6 |
| fps240-s4 | 1098 | 0.1 | 0.0 | 0.1 | 1.3 | 54.4 (0.7) | 50 | 0.1 | 74.2 (21.2 / 53.0) | 68 | 2.4 | 132.8 |
| fps240-s5 | 1101 | 0.1 | 0.0 | 0.1 | 0.7 | 65.9 (1.0) | 60 | 0.1 | 113.6 (27.0 / 86.5) | 103 | 2.2 | 182.9 |
| front45-s1 | 290 | 0.1 | 0.0 | 0.1 | 1.2 | 27.1 (0.4) | 93 | 0.0 | 20.3 (5.1 / 15.2) | 70 | 0.2 | 49.0 |
| front45-s2 | 282 | 0.0 | 0.0 | 0.1 | 1.3 | 17.5 (0.2) | 62 | 0.0 | 17.2 (4.1 / 13.1) | 61 | 0.2 | 36.4 |
| front45-s3 | 278 | 0.1 | 0.0 | 0.1 | 1.2 | 13.4 (0.2) | 48 | 0.0 | 19.9 (6.1 / 13.8) | 72 | 0.2 | 34.9 |
| front45-s4 | 275 | 0.0 | 0.0 | 0.1 | 0.7 | 14.6 (0.2) | 53 | 0.0 | 16.5 (4.1 / 12.3) | 60 | 0.2 | 32.3 |
| front45-s5 | 276 | 0.1 | 0.0 | 0.1 | 0.7 | 13.3 (0.2) | 48 | 0.0 | 24.2 (5.5 / 18.7) | 88 | 0.3 | 38.7 |
| rear-s1 | 290 | 0.0 | 0.0 | 0.1 | 0.8 | 13.8 (0.2) | 47 | 0.0 | 27.8 (7.9 / 19.9) | 96 | 0.4 | 43.0 |
| rear-s2 | 282 | 0.1 | 0.0 | 0.1 | 1.8 | 14.9 (0.2) | 53 | 0.0 | 26.2 (5.5 / 20.6) | 93 | 0.3 | 43.4 |
| rear-s3 | 278 | 0.0 | 0.0 | 0.1 | 0.7 | 12.9 (0.2) | 46 | 0.0 | 24.0 (6.7 / 17.2) | 86 | 0.3 | 38.1 |
| rear-s4 | 275 | 0.1 | 0.0 | 0.1 | 1.7 | 14.4 (0.2) | 53 | 0.0 | 26.1 (5.3 / 20.7) | 95 | 0.2 | 42.7 |
| rear-s5 | 276 | 0.0 | 0.0 | 0.1 | 0.9 | 13.7 (0.2) | 50 | 0.0 | 20.0 (5.0 / 15.0) | 73 | 0.2 | 35.1 |
| dist4-s1 | 290 | 0.0 | 0.0 | 0.1 | 0.7 | 20.2 (0.3) | 70 | 0.0 | 20.3 (4.8 / 15.4) | 70 | 0.3 | 41.8 |
| dist4-s2 | 282 | 0.1 | 0.0 | 0.1 | 1.4 | 20.2 (0.3) | 72 | 0.0 | 12.0 (3.2 / 8.7) | 42 | 0.2 | 33.9 |
| dist4-s3 | 278 | 0.1 | 0.0 | 0.1 | 1.6 | 26.4 (0.4) | 95 | 0.0 | 20.1 (5.4 / 14.6) | 72 | 0.3 | 48.6 |
| dist4-s4 | 275 | 0.1 | 0.0 | 0.1 | 1.8 | 23.9 (0.3) | 87 | 0.0 | 12.7 (3.5 / 9.2) | 46 | 0.2 | 38.8 |
| dist4-s5 | 276 | 0.1 | 0.0 | 0.1 | 0.7 | 17.4 (0.3) | 63 | 0.0 | 22.7 (7.6 / 15.0) | 82 | 0.3 | 41.4 |
| dist7-s1 | 290 | 0.1 | 0.0 | 0.1 | 1.2 | 18.8 (0.3) | 65 | 0.0 | 55.6 (14.8 / 40.7) | 192 | 0.3 | 76.2 |
| dist7-s2 | 282 | 0.1 | 0.0 | 0.1 | 1.7 | 13.5 (0.2) | 48 | 0.0 | 42.5 (11.8 / 30.7) | 151 | 0.3 | 58.2 |
| dist7-s3 | 278 | 0.1 | 0.0 | 0.1 | 1.7 | 13.4 (0.2) | 48 | 0.0 | 57.4 (16.7 / 40.7) | 207 | 0.3 | 73.0 |
| dist7-s4 | 275 | 0.1 | 0.0 | 0.1 | 1.2 | 12.5 (0.2) | 45 | 0.0 | 43.3 (15.9 / 27.4) | 157 | 0.2 | 57.5 |
| dist7-s5 | 276 | 0.0 | 0.0 | 0.1 | 1.8 | 26.1 (0.4) | 95 | 0.0 | 61.9 (18.2 / 43.7) | 224 | 0.4 | 90.4 |
| dist12-s1 | 290 | 0.0 | 0.0 | 0.1 | 1.4 | 26.4 (0.4) | 91 | 0.0 | 176.7 (50.3 / 126.3) | 609 | 0.4 | 205.1 |
| dist12-s2 | 282 | 0.0 | 0.0 | 0.1 | 1.3 | 12.5 (0.2) | 44 | 0.0 | 146.0 (44.1 / 101.8) | 518 | 0.4 | 160.3 |
| dist12-s3 | 278 | 0.1 | 0.0 | 0.1 | 1.2 | 11.8 (0.2) | 43 | 0.0 | 191.2 (54.5 / 136.6) | 688 | 0.4 | 204.9 |
| dist12-s4 | 275 | 0.1 | 0.0 | 0.1 | 1.6 | 12.5 (0.2) | 45 | 0.0 | 131.9 (30.1 / 101.6) | 479 | 0.3 | 146.4 |
| dist12-s5 | 276 | 0.1 | 0.0 | 0.1 | 0.7 | 13.8 (0.2) | 50 | 0.0 | 155.3 (16.7 / 138.6) | 563 | 0.3 | 170.4 |
| dusk-s1 | 290 | 0.1 | 0.0 | 0.1 | 1.2 | 15.1 (0.3) | 52 | 0.0 | 19.8 (5.9 / 13.9) | 68 | 0.1 | 36.6 |
| dusk-s2 | 282 | 0.1 | 0.0 | 0.1 | 0.6 | 10.6 (0.2) | 38 | 0.0 | 13.2 (3.7 / 9.5) | 47 | 0.2 | 24.8 |
| dusk-s3 | 278 | 0.1 | 0.0 | 0.1 | 1.0 | 13.2 (0.2) | 48 | 0.0 | 22.6 (8.8 / 13.8) | 81 | 0.2 | 37.3 |
| dusk-s4 | 275 | 0.1 | 0.0 | 0.1 | 1.2 | 12.8 (0.2) | 46 | 0.0 | 17.7 (5.2 / 12.5) | 64 | 0.2 | 32.1 |
| dusk-s5 | 276 | 0.1 | 0.0 | 0.1 | 0.7 | 12.8 (0.2) | 46 | 0.0 | 18.7 (3.6 / 15.0) | 68 | 0.3 | 32.8 |
| night240-s1 | 1158 | 0.1 | 0.0 | 0.1 | 0.6 | 106.9 (2.5) | 92 | 0.2 | 128.5 (20.6 / 107.7) | 111 | 2.4 | 238.9 |
| night240-s2 | 1128 | 0.2 | 0.0 | 0.1 | 1.5 | 96.6 (1.4) | 86 | 0.1 | 99.1 (17.9 / 81.1) | 88 | 2.1 | 199.7 |
| night240-s3 | 1109 | 0.3 | 0.0 | 0.1 | 1.5 | 83.6 (1.6) | 75 | 0.2 | 115.6 (19.6 / 95.8) | 104 | 2.5 | 204.0 |
| night240-s4 | 1098 | 0.3 | 0.0 | 0.1 | 1.6 | 77.2 (1.2) | 70 | 0.1 | 100.5 (16.6 / 83.8) | 92 | 2.1 | 182.2 |
| night240-s5 | 1101 | 0.2 | 0.0 | 0.1 | 1.3 | 78.4 (1.8) | 71 | 0.2 | 117.4 (17.2 / 99.9) | 107 | 2.3 | 200.0 |
| crf36-s1 | 290 | 0.1 | 0.0 | 0.1 | 1.3 | 22.2 (0.3) | 76 | 0.0 | 25.5 (5.4 / 20.1) | 88 | 0.3 | 49.6 |
| crf36-s2 | 282 | 0.1 | 0.0 | 0.1 | 1.5 | 20.9 (0.4) | 74 | 0.0 | 23.1 (3.6 / 19.4) | 82 | 0.3 | 46.1 |
| crf36-s3 | 278 | 0.0 | 0.0 | 0.1 | 1.2 | 14.1 (0.2) | 51 | 0.0 | 22.3 (3.5 / 18.8) | 80 | 0.3 | 38.1 |
| crf36-s4 | 275 | 0.1 | 0.0 | 0.1 | 1.2 | 12.6 (0.2) | 46 | 0.0 | 14.4 (3.4 / 11.0) | 52 | 0.2 | 28.6 |
| crf36-s5 | 276 | 0.0 | 0.0 | 0.1 | 1.1 | 13.7 (0.3) | 50 | 0.0 | 26.1 (4.4 / 21.7) | 95 | 0.4 | 41.5 |
| slomo-s1 | 1158 | 0.2 | 0.0 | 0.6 | 1.1 | 93.0 (1.6) | 80 | 0.1 | 208.2 (32.0 / 175.9) | 90 | 1.6 | 305.1 |
| slomo-s2 | 1128 | 0.2 | 0.0 | 0.8 | 1.6 | 82.3 (1.1) | 73 | 0.1 | 180.8 (29.6 / 151.1) | 80 | 1.7 | 267.8 |

## Harness notes

- quick-slomo: after the time-scale correction audio is not used: Timeline is time-scaled (x0.125); slow-motion audio is stretched or silent, so contact timing from audio is unreliable.
- quick-slomo: time base corrected by the gravity check: x0.125 (capture 240.0 fps); ball detection re-run on corrected timestamps; poses re-timed and re-cleaned, not re-inferred
- slomo-s1: after the time-scale correction audio is not used: Timeline is time-scaled (x0.125); slow-motion audio is stretched or silent, so contact timing from audio is unreliable.
- slomo-s1: time base corrected by the gravity check: x0.125 (capture 240.0 fps); ball detection re-run on corrected timestamps; poses re-timed and re-cleaned, not re-inferred
- slomo-s2: after the time-scale correction audio is not used: Timeline is time-scaled (x0.125); slow-motion audio is stretched or silent, so contact timing from audio is unreliable.
- slomo-s2: time base corrected by the gravity check: x0.125 (capture 240.0 fps); ball detection re-run on corrected timestamps; poses re-timed and re-cleaned, not re-inferred

