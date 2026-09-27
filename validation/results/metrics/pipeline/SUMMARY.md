# Engine smoke validation on the synthetic corpus

Generated 2026-09-27T03:47:37.859Z by `node tools/validate/smoke.mjs`. 122 clips: 122 ran to completion, 0 failed.

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
  - pose worker (`blob:http://127.0.0.1:61546/<uuid>`): violation `connect-src https://odml.pa.googleapis.com/v1/log`, XHR network error, fetch rejected: Blocked on-device: cross-origin request to https://odml.pa.googleapis.com/v1/log (privacy guard); blocked by the CSP: **yes** (XHR shows the CSP alone; fetch also meets the worker's same-origin guard);
  - requests that reached the network layer during the probe: 0.
- Requests to hosts other than the dev server during the whole run (warm-up included; the router aborts and records them): **0**.
- Requests Chromium reported but the CSP refused before the network stack (probe included): 2 (POST https://odml.pa.googleapis.com/v1/log (csp)).
- Telemetry attempts stopped inside the pose worker by its fetch guard (`[privacy]` console lines): 244.
- During the clip runs (after the probe), `securitypolicyviolation` events on the page: 0; CSP console messages from the page and workers: 0. (The worker's guard refuses the telemetry fetch before the CSP check runs, so none are expected.)
- Pose ran on 122 of 122 completed clips with the policy in force.

## Summary by scenario

Medians over the clips in each set (apex and onset errors: mean |error| / max |error|). The gravity column is the first-pass factor divided by the expected one (1 = the check recovered the true time scale; slow motion expects 0.125), median and range. Speed = experimental side-view ranges that contain the true speed / ranges produced (the rest were refused).

| set | clips | frames = truth | pose detected | pose median err (stature) | ball toss recall | ball precision | ball loc. err (px) | toss found | apex err mean / max (ms) | audio onset err mean / max (ms) | gravity factor ratio to expected | speed ranges | ms per frame (pose / ball) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| quick (CI, 540x960) | 3 | 3/3 | 100% | 0.032 | 100% | 41% | 0.27 | 3/3 | 1.67 / 4.25 | 0.07 / 0.08 | 0.998 (0.938-1.002) | 1/1 | 54 / 72 |
| baseline (side 5 m, 60 fps) | 5 | 5/5 | 100% | 0.034 | 100% | 57% | 0.32 | 5/5 | 0.22 / 0.30 | 0.07 / 0.08 | 0.992 (0.990-0.999) | 0/0 | 65 / 50 |
| fps sweep (30/120/240) | 15 | 15/15 | 100% | 0.034 | 100% | 56% | 0.37 | 15/15 | 0.23 / 0.39 | 0.07 / 0.08 | 0.995 (0.984-1.001) | 10/10 | 46 / 39 |
| view sweep (rear, front-45) | 10 | 10/10 | 100% | 0.035 | 100% | 26% | 0.21 | 10/10 | 4.58 / 4.94 | 0.07 / 0.08 | 0.994 (0.933-1.054) | 0/0 | 55 / 42 |
| distance sweep (4/7/12 m) | 15 | 15/15 | 100% | 0.035 | 100% | 55% | 0.36 | 15/15 | 0.23 / 0.45 | 0.08 / 0.19 | 1.007 (0.970-1.019) | 0/0 | 47 / 67 |
| dusk (60 fps) | 5 | 5/5 | 100% | 0.027 | 100% | 60% | 0.44 | 5/5 | 0.23 / 0.29 | 0.07 / 0.08 | 1.000 (0.993-1.008) | 0/0 | 72 / 64 |
| night 240 fps, 100 Hz flicker | 5 | 5/5 | 100% | 0.028 | 98% | 47% | 0.25 | 5/5 | 0.25 / 0.31 | 0.07 / 0.08 | 1.003 (0.997-1.009) | 5/5 | 64 / 55 |
| CRF 36 | 5 | 5/5 | 100% | 0.035 | 100% | 39% | 0.65 | 5/5 | 0.36 / 0.56 | 0.07 / 0.08 | 0.990 (0.988-0.999) | 0/0 | 66 / 59 |
| slow motion (240 as 30 fps) | 2 | 2/2 | 100% | 0.036 | 100% | 47% | 0.25 | 2/2 | 0.25 / 0.28 | 0.07 / 0.08 | 0.993 (0.988-0.998) | 2/2 | 48 / 53 |

## Computed flags

- Audio label of the onset at the racket pop: `contact` 122 (of 122 clips); the pop was not the strongest non-bounce transient in 1 (session).
- Toss release |error| > 50 ms: 6 (fps30-s2 +100 ms, fps30-s3 +112 ms, fps30-s4 +129 ms, fps30-s5 -135 ms, quick-rear30-lefty -53 ms, beginner-s1 -51 ms).
- Toss apex outside 2 sigma of its reported uncertainty: 3 (beginner-s3 z -8.0, shake-s1 z 4.0, shake-s2 z 2.8). Toss apex height truth outside the reported range: 0.
- Speed-from-track (speed-experimental) refusals: "capture frame rate 60 fps is below 120 fps" 77; "the ball was not tracked after contact" 15; "camera view 'rear': the ball travels mostly toward or away from the camera, so its image speed says little about its true speed" 6; "camera view 'front45': the ball travels mostly toward or away from the camera, so its image speed says little about its true speed" 5; "the time base is not verified (possible slow motion) and the toss check could not confirm real time" 1.
- Pose frames where a whole-body left/right mirror fits better than MediaPipe's labels (median per view): side 37%, rear 12%, front45 67%.
- Outgoing tracks with detections off the ball: 7 (rear-s1 55% of 33, rear-s4 85% of 39, h195-s3 67% of 3, dusk-s2 50% of 2, dusk-s3 50% of 2, night240-s5 86% of 7, shake-s5 11% of 9).
- Rear view (6 clips; the harness has no four-corner court tap): bounce "located" 6, time error vs truth rear-s1 -208.8 ms, rear-s2 -0.1 ms, rear-s3 -4.9 ms, rear-s4 -0.2 ms, rear-s5 +0.7 ms, quick-rear30-lefty -18.8 ms; average speed "bounce not located in the video (a bounce sound alone does not say where the ball landed)" 6.

## Per clip: decode and time base

| clip | set | decode path | frames decoded / container / truth | timeline fps (truth) | time base | gravity factor [95%] (expected) | suggestion | final capture fps / time scale (truth) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| default75-s1 | other | webcodecs | 290 / 290 / 290 | 60.00 (60) | unknown (normal) | 1.034 [0.982-1.088] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| default75-s2 | other | webcodecs | 282 / 282 / 282 | 60.00 (60) | unknown (normal) | 1.028 [0.976-1.082] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| default75-s3 | other | webcodecs | 278 / 278 / 278 | 60.00 (60) | unknown (normal) | 1.031 [0.979-1.085] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| baseline-s1 | baseline | webcodecs | 290 / 290 / 290 | 60.00 (60) | unknown (normal) | 0.999 [0.949-1.052] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| baseline-s2 | baseline | webcodecs | 282 / 282 / 282 | 60.00 (60) | unknown (normal) | 0.990 [0.940-1.042] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| baseline-s3 | baseline | webcodecs | 278 / 278 / 278 | 60.00 (60) | unknown (normal) | 0.995 [0.945-1.048] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| baseline-s4 | baseline | webcodecs | 275 / 275 / 275 | 60.00 (60) | unknown (normal) | 0.990 [0.940-1.042] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| baseline-s5 | baseline | webcodecs | 276 / 276 / 276 | 60.00 (60) | unknown (normal) | 0.992 [0.942-1.044] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| fence9-s1 | other | webcodecs | 290 / 290 / 290 | 60.00 (60) | unknown (normal) | 1.028 [0.976-1.082] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| fence9-s2 | other | webcodecs | 282 / 282 / 282 | 60.00 (60) | unknown (normal) | 1.029 [0.978-1.084] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| fence9-s3 | other | webcodecs | 278 / 278 / 278 | 60.00 (60) | unknown (normal) | 1.028 [0.976-1.082] (1.000) | consistent | 60.0 / 1 (60 / 1) |
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
| rear-s1 | view-sweep | webcodecs | 290 / 290 / 290 | 60.00 (60) | unknown (normal) | 0.933 [0.886-0.982] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| rear-s2 | view-sweep | webcodecs | 282 / 282 / 282 | 60.00 (60) | unknown (normal) | 0.941 [0.894-0.990] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| rear-s3 | view-sweep | webcodecs | 278 / 278 / 278 | 60.00 (60) | unknown (normal) | 0.961 [0.913-1.012] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| rear-s4 | view-sweep | webcodecs | 275 / 275 / 275 | 60.00 (60) | unknown (normal) | 0.949 [0.901-0.999] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| rear-s5 | view-sweep | webcodecs | 276 / 276 / 276 | 60.00 (60) | unknown (normal) | 0.939 [0.892-0.988] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| front45-s1 | view-sweep | webcodecs | 290 / 290 / 290 | 60.00 (60) | unknown (normal) | 1.054 [1.001-1.109] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| front45-s2 | view-sweep | webcodecs | 282 / 282 / 282 | 60.00 (60) | unknown (normal) | 1.038 [0.986-1.093] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| front45-s3 | view-sweep | webcodecs | 278 / 278 / 278 | 60.00 (60) | unknown (normal) | 1.028 [0.976-1.082] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| front45-s4 | view-sweep | webcodecs | 275 / 275 / 275 | 60.00 (60) | unknown (normal) | 1.032 [0.980-1.086] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| front45-s5 | view-sweep | webcodecs | 276 / 276 / 276 | 60.00 (60) | unknown (normal) | 1.030 [0.978-1.084] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| lefty-s1 | other | webcodecs | 290 / 290 / 290 | 60.00 (60) | unknown (normal) | 0.993 [0.942-1.045] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| lefty-s2 | other | webcodecs | 282 / 282 / 282 | 60.00 (60) | unknown (normal) | 0.986 [0.936-1.038] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| lefty-s3 | other | webcodecs | 278 / 278 / 278 | 60.00 (60) | unknown (normal) | 0.991 [0.941-1.043] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| lefty-s4 | other | webcodecs | 275 / 275 / 275 | 60.00 (60) | unknown (normal) | 0.995 [0.945-1.048] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| lefty-s5 | other | webcodecs | 276 / 276 / 276 | 60.00 (60) | unknown (normal) | 0.991 [0.941-1.043] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| quick-rear30-lefty | quick | webcodecs | 141 / 141 / 141 | 30.00 (30) | unknown (normal) | 0.938 [0.891-0.988] (1.000) | consistent | 30.0 / 1 (30 / 1) |
| quick-side60 | quick | webcodecs | 290 / 290 / 290 | 60.00 (60) | unknown (normal) | 0.998 [0.948-1.050] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| quick-slomo | quick | webcodecs | 486 / 486 / 486 | 30.00 (30) | unknown (normal) | 0.125 [0.119-0.132] (0.125) | apply-correction x0.125 | 240.0 / 0.125 (240 / 0.125) |
| slomo-s1 | slomo | webcodecs | 1158 / 1158 / 1158 | 30.00 (30) | unknown (normal) | 0.125 [0.118-0.131] (0.125) | apply-correction x0.125 | 240.0 / 0.125 (240 / 0.125) |
| slomo-s2 | slomo | webcodecs | 1128 / 1128 / 1128 | 30.00 (30) | unknown (normal) | 0.124 [0.117-0.130] (0.125) | apply-correction x0.125 | 240.0 / 0.125 (240 / 0.125) |
| apexout-s1 | other | webcodecs | 290 / 290 / 290 | 60.00 (60) | unknown (normal) | 1.011 [0.960-1.064] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| apexout-s2 | other | webcodecs | 282 / 282 / 282 | 60.00 (60) | unknown (normal) | 0.999 [0.949-1.052] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| apexout-s3 | other | webcodecs | 278 / 278 / 278 | 60.00 (60) | unknown (normal) | 1.004 [0.954-1.057] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| apexout-s4 | other | webcodecs | 275 / 275 / 275 | 60.00 (60) | unknown (normal) | 0.996 [0.946-1.049] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| apexout-s5 | other | webcodecs | 276 / 276 / 276 | 60.00 (60) | unknown (normal) | 0.992 [0.942-1.044] (1.000) | consistent | 60.0 / 1 (60 / 1) |
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
| advanced-s1 | other | webcodecs | 286 / 286 / 286 | 60.00 (60) | unknown (normal) | 0.994 [0.944-1.047] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| advanced-s2 | other | webcodecs | 283 / 283 / 283 | 60.00 (60) | unknown (normal) | 0.996 [0.945-1.049] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| advanced-s3 | other | webcodecs | 281 / 281 / 281 | 60.00 (60) | unknown (normal) | 0.999 [0.949-1.052] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| advanced-s4 | other | webcodecs | 280 / 280 / 280 | 60.00 (60) | unknown (normal) | 1.008 [0.957-1.061] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| advanced-s5 | other | webcodecs | 284 / 284 / 284 | 60.00 (60) | unknown (normal) | 1.005 [0.954-1.059] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| beginner-s1 | other | webcodecs | 288 / 288 / 288 | 60.00 (60) | unknown (normal) | 0.991 [0.941-1.043] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| beginner-s2 | other | webcodecs | 282 / 282 / 282 | 60.00 (60) | unknown (normal) | 1.002 [0.952-1.055] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| beginner-s3 | other | webcodecs | 269 / 269 / 269 | 60.00 (60) | unknown (normal) | 1.007 [0.957-1.061] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| beginner-s4 | other | webcodecs | 280 / 280 / 280 | 60.00 (60) | unknown (normal) | 1.029 [0.978-1.084] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| beginner-s5 | other | webcodecs | 290 / 290 / 290 | 60.00 (60) | unknown (normal) | 0.995 [0.945-1.047] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| h160-s1 | other | webcodecs | 287 / 287 / 287 | 60.00 (60) | unknown (normal) | 1.013 [0.962-1.066] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| h160-s2 | other | webcodecs | 279 / 279 / 279 | 60.00 (60) | unknown (normal) | 1.007 [0.957-1.060] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| h160-s3 | other | webcodecs | 274 / 274 / 274 | 60.00 (60) | unknown (normal) | 1.013 [0.962-1.067] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| h160-s4 | other | webcodecs | 271 / 271 / 271 | 60.00 (60) | unknown (normal) | 1.011 [0.960-1.064] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| h160-s5 | other | webcodecs | 272 / 272 / 272 | 60.00 (60) | unknown (normal) | 1.001 [0.951-1.054] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| h195-s1 | other | webcodecs | 294 / 294 / 294 | 60.00 (60) | unknown (normal) | 1.011 [0.961-1.065] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| h195-s2 | other | webcodecs | 285 / 285 / 285 | 60.00 (60) | unknown (normal) | 1.002 [0.952-1.055] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| h195-s3 | other | webcodecs | 280 / 280 / 280 | 60.00 (60) | unknown (normal) | 1.008 [0.958-1.062] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| h195-s4 | other | webcodecs | 278 / 278 / 278 | 60.00 (60) | unknown (normal) | 0.991 [0.941-1.043] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| h195-s5 | other | webcodecs | 278 / 278 / 278 | 60.00 (60) | unknown (normal) | 0.988 [0.938-1.040] (1.000) | consistent | 60.0 / 1 (60 / 1) |
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
| overcast-s1 | other | webcodecs | 290 / 290 / 290 | 60.00 (60) | unknown (normal) | 1.007 [0.956-1.060] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| overcast-s2 | other | webcodecs | 282 / 282 / 282 | 60.00 (60) | unknown (normal) | 1.002 [0.950-1.057] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| overcast-s3 | other | webcodecs | 278 / 278 / 278 | 60.00 (60) | unknown (normal) | 0.996 [0.947-1.049] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| overcast-s4 | other | webcodecs | 275 / 275 / 275 | 60.00 (60) | unknown (normal) | 1.001 [0.950-1.054] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| overcast-s5 | other | webcodecs | 276 / 276 / 276 | 60.00 (60) | unknown (normal) | 0.989 [0.940-1.041] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| shake-s1 | other | webcodecs | 290 / 290 / 290 | 60.00 (60) | unknown (normal) | 1.000 [0.949-1.053] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| shake-s2 | other | webcodecs | 282 / 282 / 282 | 60.00 (60) | unknown (normal) | 1.004 [0.953-1.058] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| shake-s3 | other | webcodecs | 278 / 278 / 278 | 60.00 (60) | unknown (normal) | 1.021 [0.969-1.076] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| shake-s4 | other | webcodecs | 275 / 275 / 275 | 60.00 (60) | unknown (normal) | 1.022 [0.971-1.077] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| shake-s5 | other | webcodecs | 276 / 276 / 276 | 60.00 (60) | unknown (normal) | 1.022 [0.970-1.077] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| crf36-s1 | crf36 | webcodecs | 290 / 290 / 290 | 60.00 (60) | unknown (normal) | 0.996 [0.946-1.048] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| crf36-s2 | crf36 | webcodecs | 282 / 282 / 282 | 60.00 (60) | unknown (normal) | 0.990 [0.940-1.042] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| crf36-s3 | crf36 | webcodecs | 278 / 278 / 278 | 60.00 (60) | unknown (normal) | 0.988 [0.938-1.040] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| crf36-s4 | crf36 | webcodecs | 275 / 275 / 275 | 60.00 (60) | unknown (normal) | 0.999 [0.948-1.051] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| crf36-s5 | crf36 | webcodecs | 276 / 276 / 276 | 60.00 (60) | unknown (normal) | 0.990 [0.941-1.043] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| crf28-s1 | other | webcodecs | 290 / 290 / 290 | 60.00 (60) | unknown (normal) | 1.001 [0.951-1.054] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| crf28-s2 | other | webcodecs | 282 / 282 / 282 | 60.00 (60) | unknown (normal) | 0.997 [0.947-1.049] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| crf28-s3 | other | webcodecs | 278 / 278 / 278 | 60.00 (60) | unknown (normal) | 0.999 [0.949-1.051] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| crf28-s4 | other | webcodecs | 275 / 275 / 275 | 60.00 (60) | unknown (normal) | 0.996 [0.946-1.048] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| crf28-s5 | other | webcodecs | 276 / 276 / 276 | 60.00 (60) | unknown (normal) | 0.995 [0.945-1.047] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| crf18-s1 | other | webcodecs | 290 / 290 / 290 | 60.00 (60) | unknown (normal) | 0.997 [0.947-1.049] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| crf18-s2 | other | webcodecs | 282 / 282 / 282 | 60.00 (60) | unknown (normal) | 0.991 [0.942-1.044] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| crf18-s3 | other | webcodecs | 278 / 278 / 278 | 60.00 (60) | unknown (normal) | 0.995 [0.945-1.047] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| crf18-s4 | other | webcodecs | 275 / 275 / 275 | 60.00 (60) | unknown (normal) | 0.998 [0.948-1.050] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| crf18-s5 | other | webcodecs | 276 / 276 / 276 | 60.00 (60) | unknown (normal) | 0.994 [0.944-1.046] (1.000) | consistent | 60.0 / 1 (60 / 1) |
| session | other | webcodecs | 4411 / 4411 / 4411 | 60.00 (60) | unknown (normal) | – (no toss track found) | inconclusive | 60.0 / 1 (60 / 1) |

## Per clip: accuracy against truth

Pose columns are raw tracked MediaPipe output (before cleaning). Ball and toss columns are the final pass (after any time-scale correction).

| clip | pose detected | pose median / mean err (stature) | mirror-tol. mean | hitting wrist ±0.1 s | ball toss recall | ball precision (false / frame) | loc. err median / p95 (px) | toss track prec. / coverage | apex err (ms, z) | release err (ms) | apex height err (cm, in range) | audio contact onset err (ms, label) | ball layer contact from audio (ms) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| default75-s1 | 100% | 0.038 / 0.116 | 0.027 | 0.101 | 100% | 58% (0.42) | 0.39 / 0.92 | 100% / 100% | -0.14 (-0.2) | -11.7 | +16.4 (yes) | +0.08 (contact) | +0.0 |
| default75-s2 | 100% | 0.034 / 0.106 | 0.028 | 0.061 | 100% | 59% (0.40) | 0.46 / 0.74 | 100% / 100% | +0.08 (0.1) | -16.7 | +13.6 (yes) | +0.08 (contact) | +0.2 |
| default75-s3 | 100% | 0.038 / 0.114 | 0.029 | 0.070 | 100% | 58% (0.42) | 0.49 / 0.82 | 100% / 100% | -0.02 (-0.0) | +12.8 | +13.2 (yes) | +0.07 (contact) | +0.1 |
| baseline-s1 | 100% | 0.035 / 0.110 | 0.025 | 0.094 | 100% | 60% (0.38) | 0.22 / 0.92 | 100% / 100% | +0.25 (0.3) | -13.4 | +4.2 (yes) | +0.08 (contact) | +0.8 |
| baseline-s2 | 100% | 0.034 / 0.106 | 0.025 | 0.033 | 100% | 54% (0.48) | 0.31 / 1.12 | 100% / 100% | +0.30 (0.4) | -27.6 | -1.0 (yes) | +0.08 (contact) | +1.0 |
| baseline-s3 | 100% | 0.041 / 0.110 | 0.029 | 0.056 | 100% | 57% (0.42) | 0.32 / 1.64 | 100% / 100% | +0.27 (0.3) | -28.1 | +1.5 (yes) | +0.07 (contact) | +0.8 |
| baseline-s4 | 100% | 0.031 / 0.099 | 0.026 | 0.137 | 98% | 54% (0.47) | 0.59 / 1.13 | 100% / 98% | +0.19 (0.2) | -28.3 | -0.4 (yes) | +0.06 (contact) | +1.1 |
| baseline-s5 | 100% | 0.029 / 0.097 | 0.024 | 0.098 | 100% | 57% (0.42) | 0.56 / 0.93 | 100% / 100% | -0.11 (-0.1) | -28.4 | +0.9 (yes) | +0.08 (contact) | +1.1 |
| fence9-s1 | 100% | 0.040 / 0.116 | 0.029 | 0.132 | 100% | 59% (0.41) | 0.40 / 0.68 | 100% / 100% | -0.13 (-0.2) | -10.9 | +12.6 (yes) | +0.07 (contact) | +0.0 |
| fence9-s2 | 100% | 0.038 / 0.117 | 0.027 | 0.064 | 100% | 55% (0.48) | 0.41 / 0.80 | 100% / 100% | -0.01 (-0.0) | -16.7 | +14.0 (yes) | +0.07 (contact) | -0.1 |
| fence9-s3 | 100% | 0.040 / 0.110 | 0.031 | 0.079 | 100% | 53% (0.51) | 0.36 / 0.66 | 100% / 100% | +0.10 (0.1) | +11.9 | +12.0 (yes) | +0.07 (contact) | -0.0 |
| fps30-s1 | 99% | 0.035 / 0.106 | 0.024 | 0.052 | 100% | 58% (0.43) | 0.22 / 0.83 | 100% / 100% | +0.25 (0.2) | -19.2 | +3.3 (yes) | +0.08 (contact) | +0.9 |
| fps30-s2 | 100% | 0.036 / 0.113 | 0.027 | 0.084 | 96% | 59% (0.40) | 0.25 / 0.76 | 100% / 96% | +0.19 (0.1) | +99.9 | -2.8 (yes) | +0.08 (contact) | +1.1 |
| fps30-s3 | 100% | 0.035 / 0.106 | 0.025 | 0.019 | 100% | 56% (0.45) | 0.31 / 1.99 | 100% / 100% | +0.23 (0.1) | +111.9 | +1.8 (yes) | +0.07 (contact) | +0.8 |
| fps30-s4 | 100% | 0.032 / 0.101 | 0.027 | 0.107 | 100% | 55% (0.46) | 0.44 / 1.90 | 100% / 100% | +0.22 (0.1) | +129.2 | +3.6 (yes) | +0.06 (contact) | +0.9 |
| fps30-s5 | 100% | 0.029 / 0.098 | 0.024 | 0.099 | 100% | 55% (0.45) | 0.47 / 1.02 | 100% / 100% | -0.26 (-0.2) | -135.1 | +1.9 (yes) | +0.08 (contact) | +1.0 |
| fps120-s1 | 100% | 0.036 / 0.109 | 0.025 | 0.051 | 100% | 60% (0.38) | 0.27 / 0.87 | 100% / 100% | +0.22 (0.3) | -11.7 | +0.4 (yes) | +0.08 (contact) | +1.0 |
| fps120-s2 | 100% | 0.034 / 0.106 | 0.026 | 0.041 | 100% | 55% (0.46) | 0.30 / 1.04 | 100% / 100% | +0.32 (0.4) | -26.3 | -1.6 (yes) | +0.08 (contact) | +1.1 |
| fps120-s3 | 100% | 0.036 / 0.106 | 0.027 | 0.041 | 100% | 57% (0.43) | 0.37 / 1.45 | 100% / 100% | +0.30 (0.4) | +11.5 | +1.7 (yes) | +0.07 (contact) | +0.8 |
| fps120-s4 | 100% | 0.032 / 0.100 | 0.026 | 0.092 | 100% | 56% (0.45) | 0.60 / 1.57 | 100% / 100% | +0.25 (0.3) | -27.1 | +3.4 (yes) | +0.06 (contact) | +0.9 |
| fps120-s5 | 100% | 0.029 / 0.095 | 0.024 | 0.060 | 100% | 57% (0.42) | 0.48 / 0.97 | 100% / 100% | -0.06 (-0.1) | -27.6 | +1.1 (yes) | +0.08 (contact) | +1.1 |
| fps240-s1 | 100% | 0.035 / 0.106 | 0.025 | 0.079 | 100% | 61% (0.38) | 0.23 / 0.95 | 100% / 100% | +0.24 (0.3) | -12.8 | +2.1 (yes) | +0.08 (contact) | +0.9 |
| fps240-s2 | 100% | 0.034 / 0.107 | 0.025 | 0.045 | 100% | 56% (0.45) | 0.31 / 1.18 | 100% / 100% | +0.29 (0.4) | -26.1 | +6.2 (yes) | +0.08 (contact) | +0.7 |
| fps240-s3 | 100% | 0.032 / 0.102 | 0.026 | 0.034 | 100% | 57% (0.43) | 0.41 / 1.45 | 100% / 100% | +0.39 (0.6) | +8.2 | +1.0 (yes) | +0.07 (contact) | +0.9 |
| fps240-s4 | 100% | 0.031 / 0.097 | 0.026 | 0.079 | 100% | 54% (0.47) | 0.59 / 1.71 | 100% / 100% | +0.23 (0.3) | -25.8 | +4.3 (yes) | +0.06 (contact) | +0.8 |
| fps240-s5 | 100% | 0.029 / 0.096 | 0.024 | 0.094 | 100% | 56% (0.44) | 0.50 / 1.17 | 100% / 100% | -0.01 (-0.0) | -27.2 | +0.0 (yes) | +0.08 (contact) | +1.1 |
| rear-s1 | 100% | 0.017 / 0.040 | 0.027 | 0.017 | 100% | 37% (1.13) | 0.22 / 0.66 | 100% / 100% | -4.16 (-0.2) | +1.6 | -23.0 (yes) | +0.07 (contact) | +3.3 |
| rear-s2 | 100% | 0.016 / 0.037 | 0.027 | 0.021 | 100% | 42% (1.28) | 0.19 / 0.98 | 100% / 100% | -4.25 (-0.3) | +8.3 | -17.9 (yes) | +0.07 (contact) | +3.0 |
| rear-s3 | 100% | 0.017 / 0.038 | 0.025 | 0.033 | 100% | 43% (1.24) | 0.22 / 0.74 | 100% / 100% | -4.46 (-0.3) | -28.9 | -11.0 (yes) | +0.07 (contact) | +2.4 |
| rear-s4 | 100% | 0.017 / 0.037 | 0.025 | 0.026 | 100% | 33% (1.32) | 0.20 / 0.86 | 100% / 100% | -4.52 (-0.3) | -30.0 | -15.7 (yes) | +0.07 (contact) | +2.8 |
| rear-s5 | 100% | 0.015 / 0.037 | 0.026 | 0.022 | 100% | 42% (1.23) | 0.27 / 1.20 | 100% / 100% | -4.44 (-0.3) | -30.1 | -18.5 (yes) | +0.07 (contact) | +3.1 |
| front45-s1 | 100% | 0.109 / 0.127 | 0.033 | 0.204 | 100% | 19% (2.47) | 0.22 / 0.34 | 100% / 98% | +4.94 (0.2) | -20.1 | +33.0 (yes) | +0.08 (contact) | -1.0 |
| front45-s2 | 100% | 0.112 / 0.128 | 0.030 | 0.166 | 100% | 17% (2.65) | 0.21 / 0.45 | 100% / 100% | +4.78 (0.2) | -30.9 | +22.7 (yes) | +0.08 (contact) | -0.6 |
| front45-s3 | 100% | 0.116 / 0.129 | 0.029 | 0.172 | 100% | 17% (2.55) | 0.20 / 0.48 | 100% / 100% | +4.70 (0.3) | -48.9 | +18.5 (yes) | +0.07 (contact) | -0.3 |
| front45-s4 | 100% | 0.081 / 0.102 | 0.032 | 0.184 | 100% | 15% (2.63) | 0.22 / 0.39 | 100% / 100% | +4.80 (0.3) | -50.0 | +19.3 (yes) | +0.08 (contact) | -0.4 |
| front45-s5 | 100% | 0.052 / 0.090 | 0.033 | 0.179 | 100% | 15% (2.58) | 0.19 / 0.31 | 100% / 100% | +4.74 (0.3) | -25.1 | +17.4 (yes) | +0.08 (contact) | -0.3 |
| lefty-s1 | 100% | 0.024 / 0.055 | 0.034 | 0.034 | 100% | 49% (0.61) | 0.16 / 1.35 | 100% / 100% | +0.17 (0.2) | -15.9 | -1.3 (yes) | +0.08 (contact) | +1.1 |
| lefty-s2 | 100% | 0.022 / 0.054 | 0.028 | 0.110 | 100% | 47% (0.64) | 0.21 / 0.66 | 100% / 100% | +0.23 (0.3) | -27.6 | -4.5 (yes) | +0.08 (contact) | +1.2 |
| lefty-s3 | 100% | 0.025 / 0.062 | 0.035 | 0.114 | 100% | 47% (0.63) | 0.50 / 1.32 | 100% / 100% | +0.14 (0.2) | -22.2 | -1.7 (yes) | +0.07 (contact) | +1.0 |
| lefty-s4 | 98% | 0.034 / 0.088 | 0.041 | 0.074 | 100% | 47% (0.64) | 0.28 / 1.70 | 100% / 100% | -0.05 (-0.1) | -27.5 | +1.0 (yes) | +0.06 (contact) | +1.0 |
| lefty-s5 | 95% | 0.030 / 0.087 | 0.034 | 0.102 | 100% | 45% (0.67) | 0.22 / 0.94 | 100% / 100% | +0.02 (0.0) | -29.3 | -0.9 (yes) | +0.08 (contact) | +1.1 |
| quick-rear30-lefty | 100% | 0.017 / 0.041 | 0.027 | 0.018 | 100% | 30% (1.89) | 0.19 / 0.61 | 100% / 100% | -4.25 (-0.3) | -53.4 | -21.6 (yes) | +0.07 (contact) | +3.2 |
| quick-side60 | 100% | 0.032 / 0.102 | 0.026 | 0.110 | 100% | 48% (0.62) | 0.27 / 0.79 | 100% / 100% | +0.37 (0.4) | -11.7 | +2.8 (yes) | +0.08 (contact) | +0.9 |
| quick-slomo | 100% | 0.038 / 0.112 | 0.036 | 0.066 | 100% | 41% (0.94) | 0.32 / 0.95 | 100% / 100% | +0.40 (0.6) | -22.5 | +5.9 (yes) | +0.07 (contact) | – |
| slomo-s1 | 100% | 0.033 / 0.105 | 0.024 | 0.049 | 100% | 47% (0.65) | 0.22 / 0.88 | 100% / 100% | +0.21 (0.3) | -14.4 | +3.3 (yes) | +0.07 (contact) | – |
| slomo-s2 | 100% | 0.039 / 0.114 | 0.027 | 0.045 | 100% | 46% (0.66) | 0.28 / 1.06 | 100% / 100% | +0.28 (0.4) | -26.1 | +0.0 (yes) | +0.08 (contact) | – |
| apexout-s1 | 100% | 0.037 / 0.109 | 0.029 | 0.071 | 100% | 52% (0.43) | 0.34 / 0.96 | 100% / 100% | -0.34 (-0.4) | -13.4 | +8.0 (yes) | +0.07 (contact) | +0.9 |
| apexout-s2 | 100% | 0.034 / 0.102 | 0.028 | 0.060 | 91% | 49% (0.43) | 0.36 / 1.27 | 100% / 92% | -0.06 (-0.1) | -18.4 | +3.3 (yes) | +0.08 (contact) | +1.1 |
| apexout-s3 | 99% | 0.033 / 0.099 | 0.029 | 0.028 | 100% | 54% (0.36) | 0.63 / 1.87 | 100% / 100% | -0.31 (-0.4) | +1.9 | +3.5 (yes) | +0.06 (contact) | +1.0 |
| apexout-s4 | 100% | 0.030 / 0.093 | 0.028 | 0.045 | 92% | 49% (0.47) | 0.59 / 0.88 | 97% / 92% | +0.06 (0.1) | -20.0 | +2.3 (yes) | +0.08 (contact) | +1.1 |
| apexout-s5 | 100% | 0.032 / 0.096 | 0.029 | 0.020 | 93% | 53% (0.42) | 0.45 / 0.99 | 100% / 94% | -0.03 (-0.0) | -21.8 | +0.6 (yes) | +0.06 (contact) | +1.2 |
| dist4-s1 | 100% | 0.029 / 0.095 | 0.027 | 0.052 | 100% | 56% (0.46) | 0.25 / 0.71 | 100% / 100% | +0.45 (0.5) | -18.4 | -3.2 (yes) | +0.08 (contact) | +1.2 |
| dist4-s2 | 100% | 0.031 / 0.097 | 0.028 | 0.037 | 96% | 58% (0.40) | 0.24 / 0.67 | 100% / 96% | +0.36 (0.4) | -38.4 | -8.2 (yes) | +0.08 (contact) | +1.3 |
| dist4-s3 | 100% | 0.030 / 0.095 | 0.027 | 0.040 | 100% | 56% (0.44) | 0.23 / 1.13 | 100% / 100% | +0.34 (0.4) | -29.7 | -2.9 (yes) | +0.07 (contact) | +1.1 |
| dist4-s4 | 100% | 0.030 / 0.096 | 0.025 | 0.032 | 100% | 54% (0.48) | 0.22 / 1.06 | 100% / 100% | +0.25 (0.3) | -30.8 | -4.0 (yes) | +0.06 (contact) | +1.2 |
| dist4-s5 | 99% | 0.033 / 0.099 | 0.027 | 0.060 | 100% | 56% (0.44) | 0.26 / 1.10 | 100% / 100% | -0.01 (-0.0) | -32.6 | -8.0 (yes) | +0.06 (contact) | +1.4 |
| dist7-s1 | 100% | 0.030 / 0.097 | 0.024 | 0.070 | 100% | 57% (0.45) | 0.42 / 0.96 | 100% / 100% | +0.17 (0.2) | -20.9 | +9.3 (yes) | +0.07 (contact) | +0.5 |
| dist7-s2 | 100% | 0.032 / 0.096 | 0.027 | 0.052 | 100% | 57% (0.43) | 0.47 / 0.68 | 100% / 100% | +0.10 (0.1) | -22.6 | +7.4 (yes) | +0.08 (contact) | +0.6 |
| dist7-s3 | 100% | 0.035 / 0.105 | 0.029 | 0.034 | 100% | 54% (0.49) | 0.36 / 0.83 | 100% / 100% | +0.13 (0.2) | +9.4 | +7.6 (yes) | +0.07 (contact) | +0.5 |
| dist7-s4 | 100% | 0.037 / 0.104 | 0.029 | 0.098 | 100% | 56% (0.45) | 0.59 / 0.96 | 100% / 100% | +0.35 (0.4) | -24.1 | +3.3 (yes) | +0.08 (contact) | +0.9 |
| dist7-s5 | 100% | 0.035 / 0.103 | 0.029 | 0.082 | 100% | 55% (0.45) | 0.42 / 0.74 | 100% / 100% | +0.23 (0.3) | -26.8 | +2.3 (yes) | -0.19 (contact) | +0.7 |
| dist12-s1 | 100% | 0.042 / 0.113 | 0.032 | 0.179 | 100% | 45% (0.72) | 0.33 / 0.70 | 100% / 100% | +0.07 (0.1) | -10.1 | +9.2 (yes) | +0.08 (contact) | +0.4 |
| dist12-s2 | 100% | 0.037 / 0.101 | 0.036 | 0.017 | 100% | 46% (0.64) | 0.32 / 0.63 | 100% / 100% | +0.35 (0.4) | -20.9 | +3.8 (yes) | +0.07 (contact) | +0.9 |
| dist12-s3 | 100% | 0.040 / 0.111 | 0.032 | 0.087 | 100% | 43% (0.75) | 0.43 / 0.66 | 100% / 100% | +0.05 (0.1) | +9.4 | +9.8 (yes) | +0.07 (contact) | +0.3 |
| dist12-s4 | 100% | 0.040 / 0.112 | 0.031 | 0.072 | 100% | 42% (0.79) | 0.46 / 0.78 | 100% / 100% | +0.28 (0.3) | -23.3 | +7.3 (yes) | +0.07 (contact) | +0.6 |
| dist12-s5 | 100% | 0.036 / 0.106 | 0.029 | 0.017 | 100% | 44% (0.72) | 0.49 / 1.13 | 100% / 100% | +0.23 (0.3) | -27.6 | +9.2 (yes) | +0.07 (contact) | +0.5 |
| advanced-s1 | 100% | 0.028 / 0.081 | 0.026 | 0.025 | 96% | 62% (0.33) | 0.25 / 1.00 | 100% / 96% | -0.02 (-0.0) | -27.6 | +2.2 (yes) | +0.08 (contact) | +1.1 |
| advanced-s2 | 100% | 0.028 / 0.085 | 0.028 | 0.026 | 98% | 61% (0.35) | 0.22 / 1.09 | 100% / 98% | +0.24 (0.3) | -29.3 | +2.1 (yes) | +0.07 (contact) | +1.0 |
| advanced-s3 | 100% | 0.029 / 0.088 | 0.029 | 0.022 | 98% | 64% (0.30) | 0.25 / 0.86 | 100% / 98% | +0.05 (0.1) | -29.8 | +4.5 (yes) | +0.06 (contact) | +1.0 |
| advanced-s4 | 100% | 0.025 / 0.074 | 0.027 | 0.020 | 98% | 61% (0.35) | 0.31 / 1.03 | 100% / 98% | -0.12 (-0.1) | -28.6 | +9.2 (yes) | +0.06 (contact) | +0.7 |
| advanced-s5 | 100% | 0.026 / 0.079 | 0.027 | 0.030 | 100% | 60% (0.36) | 0.29 / 1.41 | 100% / 100% | -0.05 (-0.1) | -30.1 | +6.9 (yes) | +0.06 (contact) | +0.8 |
| beginner-s1 | 100% | 0.041 / 0.109 | 0.026 | 0.032 | 96% | 89% (0.06) | 0.21 / 0.95 | 100% / 96% | +0.16 (0.2) | -50.5 | +2.0 (yes) | +0.07 (contact) | +0.9 |
| beginner-s2 | 100% | 0.032 / 0.102 | 0.023 | 0.014 | 100% | 89% (0.07) | 0.42 / 1.04 | 100% / 100% | +0.44 (0.5) | -39.4 | +7.7 (yes) | +0.07 (contact) | +0.5 |
| beginner-s3 | 100% | 0.034 / 0.103 | 0.027 | 0.013 | 100% | 78% (0.16) | 0.23 / 1.38 | 100% / 100% | -6.65 (-8.0) | -24.0 | +7.5 (yes) | +0.08 (contact) | +0.9 |
| beginner-s4 | 100% | 0.031 / 0.095 | 0.026 | 0.012 | 100% | 78% (0.16) | 0.40 / 1.42 | 100% / 100% | +0.51 (0.6) | +24.5 | +19.8 (yes) | +0.08 (contact) | -0.3 |
| beginner-s5 | 100% | 0.033 / 0.105 | 0.023 | 0.019 | 100% | 88% (0.08) | 0.32 / 1.62 | 100% / 100% | +0.57 (0.7) | -9.5 | +2.7 (yes) | +0.06 (contact) | +0.8 |
| h160-s1 | 98% | 0.049 / 0.120 | 0.026 | 0.111 | 100% | 68% (0.28) | 0.44 / 1.10 | 100% / 100% | +0.22 (0.3) | -2.6 | +9.7 (yes) | +0.08 (contact) | +0.3 |
| h160-s2 | 100% | 0.045 / 0.115 | 0.025 | 0.031 | 98% | 70% (0.24) | 0.50 / 0.77 | 100% / 98% | +0.28 (0.3) | -26.7 | +8.6 (yes) | +0.07 (contact) | +0.5 |
| h160-s3 | 100% | 0.038 / 0.111 | 0.027 | 0.020 | 100% | 67% (0.27) | 0.44 / 0.79 | 100% / 98% | +0.14 (0.2) | -25.6 | +9.9 (yes) | +0.07 (contact) | +0.3 |
| h160-s4 | 100% | 0.043 / 0.116 | 0.027 | 0.017 | 100% | 74% (0.20) | 0.30 / 1.06 | 100% / 100% | +0.13 (0.2) | -26.6 | +8.9 (yes) | +0.08 (contact) | +0.4 |
| h160-s5 | 100% | 0.052 / 0.120 | 0.029 | 0.029 | 100% | 71% (0.23) | 0.46 / 0.91 | 100% / 100% | +0.21 (0.3) | -28.4 | +4.3 (yes) | +0.07 (contact) | +0.7 |
| h195-s1 | 100% | 0.029 / 0.097 | 0.026 | 0.046 | 100% | 75% (0.19) | 0.22 / 0.67 | 100% / 100% | +0.18 (0.2) | -20.9 | +13.0 (yes) | +0.07 (contact) | +0.6 |
| h195-s2 | 100% | 0.030 / 0.093 | 0.028 | 0.022 | 98% | 76% (0.18) | 0.22 / 0.96 | 100% / 98% | +0.28 (0.3) | -27.6 | +8.1 (yes) | +0.08 (contact) | +0.8 |
| h195-s3 | 100% | 0.032 / 0.097 | 0.029 | 0.034 | 100% | 70% (0.24) | 0.23 / 1.04 | 100% / 100% | +0.26 (0.3) | -20.6 | +10.4 (yes) | +0.08 (contact) | +0.6 |
| h195-s4 | 100% | 0.032 / 0.101 | 0.027 | 0.041 | 98% | 75% (0.18) | 0.28 / 1.47 | 100% / 98% | +0.22 (0.3) | -29.1 | +1.2 (yes) | +0.08 (contact) | +1.2 |
| h195-s5 | 100% | 0.032 / 0.097 | 0.027 | 0.037 | 98% | 71% (0.23) | 0.30 / 1.18 | 100% / 98% | +0.07 (0.1) | -29.3 | +0.2 (yes) | +0.08 (contact) | +1.3 |
| dusk-s1 | 100% | 0.027 / 0.077 | 0.029 | 0.174 | 100% | 60% (0.38) | 0.52 / 1.34 | 100% / 98% | +0.19 (0.2) | -13.4 | +8.3 (yes) | +0.08 (contact) | +0.7 |
| dusk-s2 | 100% | 0.029 / 0.084 | 0.029 | 0.142 | 100% | 51% (0.54) | 0.44 / 1.53 | 100% / 100% | +0.17 (0.2) | -26.7 | +5.7 (yes) | +0.08 (contact) | +0.7 |
| dusk-s3 | 100% | 0.031 / 0.089 | 0.029 | 0.164 | 100% | 49% (0.58) | 0.48 / 0.97 | 100% / 98% | +0.29 (0.3) | -29.7 | +10.2 (yes) | +0.07 (contact) | +0.5 |
| dusk-s4 | 100% | 0.026 / 0.070 | 0.028 | 0.123 | 100% | 70% (0.23) | 0.37 / 1.72 | 100% / 100% | +0.29 (0.3) | -28.3 | +5.9 (yes) | +0.06 (contact) | +0.8 |
| dusk-s5 | 100% | 0.024 / 0.058 | 0.032 | 0.128 | 100% | 72% (0.19) | 0.37 / 2.03 | 100% / 100% | +0.20 (0.2) | -30.1 | +2.7 (yes) | +0.08 (contact) | +1.0 |
| night240-s1 | 100% | 0.028 / 0.099 | 0.023 | 0.050 | 98% | 50% (0.54) | 0.10 / 1.09 | 100% / 98% | +0.23 (0.3) | -13.8 | +9.9 (yes) | +0.08 (contact) | +0.5 |
| night240-s2 | 100% | 0.031 / 0.102 | 0.024 | 0.020 | 96% | 45% (0.63) | 0.14 / 1.15 | 100% / 96% | +0.28 (0.4) | -23.2 | +7.0 (yes) | +0.08 (contact) | +0.6 |
| night240-s3 | 100% | 0.030 / 0.097 | 0.025 | 0.022 | 99% | 46% (0.58) | 0.25 / 1.36 | 100% / 99% | +0.31 (0.5) | +6.9 | +7.2 (yes) | +0.07 (contact) | +0.6 |
| night240-s4 | 100% | 0.027 / 0.093 | 0.023 | 0.026 | 99% | 47% (0.58) | 0.59 / 1.63 | 100% / 99% | +0.30 (0.4) | -24.6 | +5.2 (yes) | +0.06 (contact) | +0.8 |
| night240-s5 | 100% | 0.027 / 0.091 | 0.025 | 0.025 | 95% | 48% (0.55) | 0.51 / 1.18 | 100% / 95% | -0.15 (-0.2) | -25.3 | +2.5 (yes) | +0.08 (contact) | +1.0 |
| overcast-s1 | 100% | 0.023 / 0.082 | 0.024 | 0.044 | 100% | 50% (0.58) | 0.15 / 0.61 | 100% / 100% | +0.23 (0.3) | -13.4 | +7.6 (yes) | +0.08 (contact) | +0.6 |
| overcast-s2 | 100% | 0.025 / 0.081 | 0.025 | 0.018 | 100% | 48% (0.60) | 0.16 / 1.12 | 100% / 100% | +0.31 (0.4) | -27.6 | +5.2 (yes) | +0.08 (contact) | +0.7 |
| overcast-s3 | 100% | 0.026 / 0.084 | 0.024 | 0.027 | 100% | 51% (0.53) | 0.17 / 1.15 | 100% / 100% | +0.20 (0.2) | -28.9 | +2.6 (yes) | +0.07 (contact) | +0.8 |
| overcast-s4 | 100% | 0.026 / 0.081 | 0.027 | 0.038 | 100% | 50% (0.55) | 0.28 / 1.27 | 100% / 100% | +0.10 (0.1) | -28.3 | +3.5 (yes) | +0.06 (contact) | +0.8 |
| overcast-s5 | 99% | 0.022 / 0.072 | 0.024 | 0.035 | 100% | 51% (0.52) | 0.17 / 0.56 | 100% / 100% | -0.05 (-0.1) | -29.3 | -0.9 (yes) | +0.08 (contact) | +1.1 |
| shake-s1 | 100% | 0.038 / 0.111 | 0.027 | 0.166 | 100% | 21% (2.23) | 0.20 / 0.34 | 100% / 100% | +4.55 (4.0) | -25.9 | +12.6 (yes) | +0.10 (contact) | +0.8 |
| shake-s2 | 100% | 0.038 / 0.112 | 0.028 | 0.091 | 100% | 21% (2.15) | 0.18 / 0.46 | 100% / 100% | +3.76 (2.8) | -24.2 | +8.6 (yes) | +0.10 (contact) | +0.9 |
| shake-s3 | 100% | 0.039 / 0.111 | 0.030 | 0.104 | 100% | 20% (2.26) | 0.30 / 1.01 | 100% / 100% | +0.48 (0.4) | +1.9 | +10.9 (yes) | +0.09 (contact) | +0.8 |
| shake-s4 | 100% | 0.033 / 0.104 | 0.026 | 0.151 | 100% | 21% (2.15) | 0.15 / 0.79 | 100% / 100% | -0.05 (-0.1) | -37.5 | +11.2 (yes) | +0.10 (contact) | +0.9 |
| shake-s5 | 100% | 0.034 / 0.104 | 0.026 | 0.119 | 100% | 19% (2.37) | 0.11 / 0.34 | 100% / 100% | -2.23 (-2.0) | -32.6 | +9.6 (yes) | +0.09 (contact) | +1.0 |
| crf36-s1 | 100% | 0.035 / 0.105 | 0.026 | 0.153 | 100% | 43% (0.77) | 0.54 / 1.26 | 100% / 100% | +0.44 (0.5) | -12.6 | +2.2 (yes) | +0.08 (contact) | +0.9 |
| crf36-s2 | 100% | 0.035 / 0.100 | 0.025 | 0.045 | 100% | 35% (1.04) | 0.56 / 1.87 | 100% / 100% | +0.56 (0.7) | -31.7 | -0.8 (yes) | +0.08 (contact) | +1.0 |
| crf36-s3 | 100% | 0.040 / 0.103 | 0.030 | 0.088 | 100% | 38% (0.93) | 0.65 / 2.42 | 100% / 100% | +0.17 (0.2) | -28.1 | -3.4 (yes) | +0.07 (contact) | +1.1 |
| crf36-s4 | 100% | 0.032 / 0.096 | 0.026 | 0.066 | 100% | 39% (0.86) | 1.03 / 2.27 | 100% / 100% | -0.28 (-0.3) | -27.5 | +3.5 (yes) | +0.06 (contact) | +0.8 |
| crf36-s5 | 100% | 0.028 / 0.087 | 0.027 | 0.064 | 98% | 39% (0.86) | 0.93 / 1.69 | 100% / 98% | -0.35 (-0.4) | -27.6 | -0.5 (yes) | +0.08 (contact) | +1.1 |
| crf28-s1 | 100% | 0.038 / 0.107 | 0.026 | 0.059 | 100% | 52% (0.53) | 0.30 / 0.93 | 100% / 100% | +0.32 (0.4) | -11.7 | +5.5 (yes) | +0.08 (contact) | +0.8 |
| crf28-s2 | 100% | 0.034 / 0.107 | 0.025 | 0.023 | 98% | 47% (0.63) | 0.42 / 1.42 | 100% / 98% | +0.41 (0.5) | -26.7 | +3.9 (yes) | +0.08 (contact) | +0.8 |
| crf28-s3 | 100% | 0.036 / 0.105 | 0.026 | 0.051 | 100% | 52% (0.51) | 0.52 / 1.79 | 100% / 100% | +0.20 (0.2) | -26.4 | +3.0 (yes) | +0.07 (contact) | +0.8 |
| crf28-s4 | 100% | 0.030 / 0.096 | 0.024 | 0.099 | 100% | 51% (0.54) | 0.60 / 1.49 | 100% / 100% | +0.33 (0.4) | -28.3 | +2.9 (yes) | +0.06 (contact) | +0.9 |
| crf28-s5 | 100% | 0.028 / 0.092 | 0.024 | 0.097 | 100% | 50% (0.56) | 0.67 / 1.44 | 100% / 100% | -0.48 (-0.6) | -30.1 | +2.4 (yes) | +0.08 (contact) | +1.0 |
| crf18-s1 | 100% | 0.037 / 0.109 | 0.026 | 0.043 | 100% | 58% (0.41) | 0.23 / 0.75 | 100% / 100% | +0.32 (0.4) | -12.6 | +2.2 (yes) | +0.08 (contact) | +0.9 |
| crf18-s2 | 99% | 0.034 / 0.107 | 0.024 | 0.029 | 100% | 56% (0.44) | 0.26 / 1.13 | 100% / 100% | +0.31 (0.4) | -27.6 | +0.3 (yes) | +0.08 (contact) | +1.0 |
| crf18-s3 | 100% | 0.035 / 0.105 | 0.026 | 0.060 | 100% | 58% (0.41) | 0.28 / 1.49 | 100% / 100% | +0.27 (0.3) | -27.2 | +1.0 (yes) | +0.07 (contact) | +0.9 |
| crf18-s4 | 100% | 0.030 / 0.097 | 0.026 | 0.085 | 100% | 57% (0.42) | 0.56 / 1.11 | 100% / 100% | +0.28 (0.3) | -28.3 | +4.3 (yes) | +0.06 (contact) | +0.8 |
| crf18-s5 | 100% | 0.029 / 0.095 | 0.026 | 0.094 | 100% | 58% (0.41) | 0.45 / 0.93 | 100% / 100% | -0.15 (-0.2) | -28.4 | +1.8 (yes) | +0.08 (contact) | +1.0 |
| session | 100% | 0.038 / 0.097 | 0.030 | 0.078 | 100% | 72% (0.31) | 0.23 / 0.82 | – / 0% | – (no track) | – | – | +0.19 (contact, not strongest) | – |

## Per clip: stage times (s)

Wall-clock seconds in the page. Pose pass includes decode (column "of which decode") and inference; ball pass includes RGBA decode and detection, summed over passes (2 passes after a slow-motion correction).

| clip | frames | fetch | probe | audio decode + onsets | pose init | pose pass (of which decode) | pose ms/frame | pose clean | ball pass (decode / detect) | ball ms/frame | ball analyse | total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| default75-s1 | 290 | 0.0 | 0.0 | 0.1 | 0.8 | 14.8 (0.2) | 51 | 0.0 | 29.8 (4.5 / 25.2) | 103 | 0.2 | 45.8 |
| default75-s2 | 282 | 0.1 | 0.0 | 0.1 | 1.4 | 19.7 (0.2) | 70 | 0.0 | 28.4 (4.3 / 24.1) | 101 | 0.2 | 49.9 |
| default75-s3 | 278 | 0.1 | 0.0 | 0.1 | 1.0 | 17.4 (0.2) | 63 | 0.0 | 26.3 (4.2 / 22.1) | 95 | 0.2 | 45.1 |
| baseline-s1 | 290 | 0.0 | 0.0 | 0.1 | 1.1 | 18.8 (0.2) | 65 | 0.0 | 17.8 (4.5 / 13.2) | 61 | 0.2 | 38.2 |
| baseline-s2 | 282 | 0.0 | 0.0 | 0.1 | 1.4 | 19.8 (0.2) | 70 | 0.0 | 16.7 (4.4 / 12.2) | 59 | 0.2 | 38.3 |
| baseline-s3 | 278 | 0.0 | 0.0 | 0.1 | 1.5 | 21.0 (0.3) | 76 | 0.0 | 14.0 (4.2 / 9.8) | 50 | 0.2 | 37.1 |
| baseline-s4 | 275 | 0.0 | 0.0 | 0.1 | 0.8 | 17.3 (0.2) | 63 | 0.0 | 10.7 (3.7 / 7.0) | 39 | 0.2 | 29.1 |
| baseline-s5 | 276 | 0.0 | 0.0 | 0.1 | 1.0 | 17.8 (0.3) | 65 | 0.0 | 12.8 (3.9 / 8.8) | 46 | 0.2 | 32.0 |
| fence9-s1 | 290 | 0.0 | 0.0 | 0.0 | 1.3 | 17.1 (0.2) | 59 | 0.0 | 70.9 (3.6 / 67.3) | 245 | 0.2 | 89.7 |
| fence9-s2 | 282 | 0.0 | 0.0 | 0.1 | 1.1 | 11.4 (0.2) | 41 | 0.0 | 59.8 (3.1 / 56.6) | 212 | 0.2 | 72.7 |
| fence9-s3 | 278 | 0.0 | 0.0 | 0.0 | 0.7 | 10.2 (0.2) | 37 | 0.0 | 53.6 (3.4 / 50.2) | 193 | 0.2 | 64.8 |
| fps30-s1 | 145 | 0.0 | 0.0 | 0.1 | 0.8 | 6.2 (0.1) | 43 | 0.0 | 5.2 (1.6 / 3.6) | 36 | 0.1 | 12.5 |
| fps30-s2 | 141 | 0.0 | 0.0 | 0.1 | 0.6 | 5.4 (0.1) | 38 | 0.0 | 5.3 (1.5 / 3.8) | 37 | 0.1 | 11.5 |
| fps30-s3 | 139 | 0.0 | 0.0 | 0.1 | 0.7 | 6.4 (0.1) | 46 | 0.0 | 5.2 (1.5 / 3.7) | 38 | 0.1 | 12.5 |
| fps30-s4 | 138 | 0.0 | 0.0 | 0.1 | 0.6 | 5.6 (0.1) | 41 | 0.0 | 5.0 (1.5 / 3.5) | 36 | 0.1 | 11.4 |
| fps30-s5 | 138 | 0.0 | 0.0 | 0.0 | 0.8 | 9.1 (0.1) | 66 | 0.0 | 5.9 (2.1 / 3.8) | 43 | 0.1 | 16.1 |
| fps120-s1 | 579 | 0.0 | 0.0 | 0.1 | 0.7 | 32.8 (0.5) | 57 | 0.0 | 29.0 (9.8 / 19.2) | 50 | 0.4 | 63.1 |
| fps120-s2 | 564 | 0.0 | 0.0 | 0.1 | 1.0 | 31.3 (0.4) | 56 | 0.0 | 24.8 (7.8 / 16.9) | 44 | 0.3 | 57.7 |
| fps120-s3 | 555 | 0.1 | 0.0 | 0.1 | 0.8 | 27.9 (0.4) | 50 | 0.0 | 21.8 (7.1 / 14.7) | 39 | 0.3 | 51.1 |
| fps120-s4 | 549 | 0.0 | 0.0 | 0.1 | 1.1 | 27.7 (0.4) | 50 | 0.0 | 20.3 (6.4 / 13.9) | 37 | 0.3 | 49.6 |
| fps120-s5 | 551 | 0.0 | 0.0 | 0.0 | 0.7 | 27.0 (0.4) | 49 | 0.0 | 22.5 (8.3 / 14.2) | 41 | 0.3 | 50.7 |
| fps240-s1 | 1158 | 0.1 | 0.0 | 0.1 | 1.1 | 56.4 (0.8) | 49 | 0.1 | 45.3 (16.7 / 28.5) | 39 | 1.1 | 104.2 |
| fps240-s2 | 1128 | 0.1 | 0.0 | 0.1 | 1.3 | 50.1 (0.6) | 44 | 0.1 | 44.7 (15.1 / 29.5) | 40 | 1.0 | 97.5 |
| fps240-s3 | 1109 | 0.1 | 0.0 | 0.1 | 0.7 | 48.2 (0.7) | 43 | 0.1 | 44.5 (16.4 / 28.0) | 40 | 0.9 | 94.6 |
| fps240-s4 | 1098 | 0.1 | 0.0 | 0.1 | 1.1 | 49.3 (0.6) | 45 | 0.1 | 42.0 (14.9 / 27.1) | 38 | 0.8 | 93.6 |
| fps240-s5 | 1101 | 0.1 | 0.0 | 0.0 | 0.7 | 50.4 (1.5) | 46 | 0.1 | 51.3 (15.9 / 35.4) | 47 | 1.2 | 103.9 |
| rear-s1 | 290 | 0.0 | 0.0 | 0.1 | 1.1 | 17.9 (0.2) | 62 | 0.0 | 12.9 (3.6 / 9.3) | 44 | 0.3 | 32.4 |
| rear-s2 | 282 | 0.0 | 0.0 | 0.1 | 1.0 | 15.2 (0.2) | 54 | 0.0 | 10.9 (3.2 / 7.7) | 39 | 0.2 | 27.5 |
| rear-s3 | 278 | 0.1 | 0.0 | 0.1 | 0.9 | 15.0 (0.3) | 54 | 0.0 | 14.2 (4.9 / 9.3) | 51 | 0.2 | 30.5 |
| rear-s4 | 275 | 0.0 | 0.0 | 0.1 | 1.4 | 16.2 (0.2) | 59 | 0.0 | 11.2 (3.6 / 7.6) | 41 | 0.2 | 29.2 |
| rear-s5 | 276 | 0.0 | 0.0 | 0.0 | 0.8 | 14.6 (0.2) | 53 | 0.0 | 11.6 (4.4 / 7.2) | 42 | 0.2 | 27.4 |
| front45-s1 | 290 | 0.0 | 0.0 | 0.1 | 1.1 | 16.1 (0.2) | 55 | 0.0 | 12.0 (3.9 / 8.1) | 41 | 0.2 | 29.6 |
| front45-s2 | 282 | 0.0 | 0.0 | 0.1 | 0.8 | 14.7 (0.2) | 52 | 0.0 | 12.1 (4.6 / 7.5) | 43 | 0.2 | 27.9 |
| front45-s3 | 278 | 0.0 | 0.0 | 0.1 | 1.4 | 15.7 (0.2) | 57 | 0.0 | 11.1 (3.8 / 7.3) | 40 | 0.2 | 28.6 |
| front45-s4 | 275 | 0.0 | 0.0 | 0.1 | 0.8 | 13.9 (0.3) | 51 | 0.0 | 12.3 (4.9 / 7.4) | 45 | 0.2 | 27.4 |
| front45-s5 | 276 | 0.0 | 0.0 | 0.0 | 1.2 | 16.0 (0.2) | 58 | 0.0 | 10.4 (3.6 / 6.8) | 38 | 0.2 | 28.1 |
| lefty-s1 | 290 | 0.0 | 0.0 | 0.1 | 0.7 | 12.3 (0.2) | 42 | 0.0 | 13.0 (4.7 / 8.3) | 45 | 0.2 | 26.4 |
| lefty-s2 | 282 | 0.0 | 0.0 | 0.1 | 1.1 | 13.6 (0.2) | 48 | 0.0 | 13.2 (4.0 / 9.1) | 47 | 0.3 | 28.4 |
| lefty-s3 | 278 | 0.0 | 0.0 | 0.0 | 0.8 | 13.1 (0.2) | 47 | 0.0 | 12.8 (4.4 / 8.4) | 46 | 0.2 | 27.1 |
| lefty-s4 | 275 | 0.0 | 0.0 | 0.1 | 0.8 | 13.5 (0.2) | 49 | 0.0 | 14.8 (4.6 / 10.2) | 54 | 0.2 | 29.6 |
| lefty-s5 | 276 | 0.0 | 0.0 | 0.1 | 0.9 | 15.2 (0.2) | 55 | 0.1 | 13.8 (4.2 / 9.6) | 50 | 0.3 | 30.4 |
| quick-rear30-lefty | 141 | 0.0 | 0.0 | 0.1 | 0.9 | 7.2 (0.1) | 51 | 0.0 | 10.2 (1.0 / 9.2) | 72 | 0.1 | 18.7 |
| quick-side60 | 290 | 0.0 | 0.0 | 0.1 | 0.9 | 18.6 (0.3) | 64 | 0.0 | 20.9 (2.5 / 18.3) | 72 | 0.2 | 40.9 |
| quick-slomo | 486 | 0.0 | 0.0 | 0.2 | 1.3 | 26.1 (0.4) | 54 | 0.0 | 79.0 (9.4 / 69.5) | 81 | 0.9 | 107.7 |
| slomo-s1 | 1158 | 0.1 | 0.0 | 0.4 | 0.9 | 52.8 (0.9) | 46 | 0.1 | 149.0 (37.1 / 111.8) | 64 | 0.8 | 204.2 |
| slomo-s2 | 1128 | 0.1 | 0.0 | 0.4 | 0.8 | 56.2 (0.8) | 50 | 0.1 | 95.0 (29.0 / 65.9) | 42 | 1.0 | 153.8 |
| apexout-s1 | 290 | 0.0 | 0.0 | 0.1 | 0.8 | 14.0 (0.2) | 48 | 0.0 | 11.5 (3.5 / 8.0) | 40 | 0.2 | 26.6 |
| apexout-s2 | 282 | 0.0 | 0.0 | 0.0 | 0.8 | 14.9 (0.3) | 53 | 0.0 | 11.8 (4.3 / 7.5) | 42 | 0.2 | 27.8 |
| apexout-s3 | 278 | 0.0 | 0.0 | 0.1 | 1.3 | 15.6 (0.2) | 56 | 0.0 | 9.8 (3.3 / 6.5) | 35 | 0.2 | 27.0 |
| apexout-s4 | 275 | 0.0 | 0.0 | 0.1 | 0.7 | 13.8 (0.2) | 50 | 0.0 | 11.6 (4.3 / 7.3) | 42 | 0.2 | 26.5 |
| apexout-s5 | 276 | 0.0 | 0.0 | 0.1 | 1.2 | 15.2 (0.2) | 55 | 0.0 | 10.9 (3.6 / 7.2) | 39 | 0.2 | 27.6 |
| dist4-s1 | 290 | 0.0 | 0.0 | 0.1 | 0.7 | 15.1 (0.2) | 52 | 0.0 | 10.5 (4.6 / 5.8) | 36 | 0.2 | 26.7 |
| dist4-s2 | 282 | 0.0 | 0.0 | 0.1 | 1.3 | 15.9 (0.2) | 56 | 0.0 | 10.0 (3.9 / 6.1) | 35 | 0.2 | 27.5 |
| dist4-s3 | 278 | 0.0 | 0.0 | 0.1 | 0.9 | 15.8 (0.3) | 57 | 0.0 | 10.3 (4.6 / 5.6) | 37 | 0.1 | 27.3 |
| dist4-s4 | 275 | 0.0 | 0.0 | 0.1 | 1.2 | 16.6 (0.2) | 61 | 0.0 | 9.2 (3.7 / 5.4) | 33 | 0.2 | 27.4 |
| dist4-s5 | 276 | 0.0 | 0.0 | 0.1 | 0.8 | 15.0 (0.3) | 54 | 0.0 | 9.7 (4.2 / 5.4) | 35 | 0.1 | 25.8 |
| dist7-s1 | 290 | 0.0 | 0.0 | 0.0 | 1.2 | 16.3 (0.2) | 56 | 0.0 | 19.2 (3.8 / 15.3) | 66 | 0.2 | 37.0 |
| dist7-s2 | 282 | 0.0 | 0.0 | 0.1 | 0.7 | 11.3 (0.2) | 40 | 0.0 | 18.9 (3.6 / 15.2) | 67 | 0.2 | 31.2 |
| dist7-s3 | 278 | 0.0 | 0.0 | 0.1 | 0.7 | 11.6 (0.2) | 42 | 0.0 | 21.2 (3.7 / 17.5) | 76 | 0.2 | 33.9 |
| dist7-s4 | 275 | 0.0 | 0.0 | 0.1 | 0.8 | 12.8 (0.2) | 47 | 0.0 | 17.5 (3.4 / 14.1) | 64 | 0.2 | 31.6 |
| dist7-s5 | 276 | 0.0 | 0.0 | 0.0 | 0.7 | 10.4 (0.2) | 38 | 0.0 | 24.8 (4.8 / 20.0) | 90 | 0.4 | 36.4 |
| dist12-s1 | 290 | 0.0 | 0.0 | 0.1 | 0.8 | 12.7 (0.2) | 44 | 0.0 | 67.5 (3.6 / 63.8) | 233 | 0.6 | 81.8 |
| dist12-s2 | 282 | 0.0 | 0.0 | 0.0 | 0.8 | 11.1 (0.2) | 39 | 0.0 | 55.7 (3.1 / 52.5) | 198 | 0.2 | 68.0 |
| dist12-s3 | 278 | 0.0 | 0.0 | 0.1 | 0.9 | 11.5 (0.2) | 41 | 0.0 | 105.6 (6.6 / 98.9) | 380 | 0.2 | 118.4 |
| dist12-s4 | 275 | 0.0 | 0.0 | 0.1 | 0.7 | 10.6 (0.2) | 38 | 0.0 | 78.5 (4.6 / 73.8) | 286 | 0.2 | 90.2 |
| dist12-s5 | 276 | 0.0 | 0.0 | 0.1 | 4.2 | 13.2 (0.2) | 48 | 0.0 | 60.6 (4.7 / 55.8) | 220 | 0.3 | 78.5 |
| advanced-s1 | 286 | 0.0 | 0.0 | 0.1 | 1.2 | 14.6 (0.2) | 51 | 0.0 | 11.8 (3.9 / 7.9) | 41 | 0.2 | 28.0 |
| advanced-s2 | 283 | 0.0 | 0.0 | 0.1 | 0.8 | 13.2 (0.2) | 47 | 0.0 | 10.8 (3.6 / 7.1) | 38 | 0.1 | 25.0 |
| advanced-s3 | 281 | 0.0 | 0.0 | 0.0 | 0.7 | 14.2 (0.2) | 51 | 0.0 | 13.6 (6.1 / 7.5) | 48 | 0.2 | 28.8 |
| advanced-s4 | 280 | 0.0 | 0.0 | 0.1 | 1.2 | 16.7 (0.2) | 60 | 0.0 | 13.5 (5.4 / 8.0) | 48 | 0.2 | 31.8 |
| advanced-s5 | 284 | 0.0 | 0.0 | 0.1 | 0.9 | 18.1 (0.4) | 64 | 0.2 | 23.2 (9.4 / 13.8) | 82 | 0.2 | 42.8 |
| beginner-s1 | 288 | 0.0 | 0.0 | 0.1 | 1.4 | 20.6 (0.2) | 71 | 0.0 | 16.9 (5.9 / 11.0) | 59 | 0.9 | 40.0 |
| beginner-s2 | 282 | 0.1 | 0.0 | 0.1 | 1.2 | 23.0 (0.3) | 82 | 0.0 | 13.5 (5.2 / 8.2) | 48 | 0.2 | 38.1 |
| beginner-s3 | 269 | 0.0 | 0.0 | 0.1 | 1.6 | 18.7 (0.3) | 70 | 0.0 | 11.5 (3.9 / 7.6) | 43 | 0.1 | 32.1 |
| beginner-s4 | 280 | 0.0 | 0.0 | 0.1 | 0.8 | 30.0 (0.4) | 107 | 0.0 | 21.2 (7.6 / 13.6) | 76 | 0.5 | 52.7 |
| beginner-s5 | 290 | 0.0 | 0.0 | 0.1 | 1.9 | 27.6 (0.3) | 95 | 0.0 | 15.0 (5.7 / 9.3) | 52 | 0.3 | 45.1 |
| h160-s1 | 287 | 0.1 | 0.0 | 0.1 | 1.7 | 68.0 (1.3) | 237 | 0.0 | 17.4 (6.6 / 10.7) | 61 | 0.3 | 87.5 |
| h160-s2 | 279 | 0.1 | 0.0 | 0.1 | 1.6 | 28.0 (0.3) | 100 | 0.0 | 19.6 (6.7 / 12.9) | 70 | 0.3 | 49.8 |
| h160-s3 | 274 | 0.1 | 0.0 | 0.1 | 7.0 | 22.6 (0.3) | 83 | 0.0 | 22.8 (5.7 / 17.1) | 83 | 0.6 | 53.3 |
| h160-s4 | 271 | 0.1 | 0.0 | 0.1 | 1.2 | 29.2 (0.4) | 108 | 0.0 | 23.6 (7.3 / 16.3) | 87 | 0.8 | 55.1 |
| h160-s5 | 272 | 0.1 | 0.0 | 0.1 | 2.5 | 24.1 (0.3) | 89 | 0.0 | 14.8 (4.9 / 9.9) | 54 | 0.5 | 42.2 |
| h195-s1 | 294 | 0.0 | 0.0 | 0.1 | 1.1 | 33.1 (0.6) | 113 | 0.0 | 28.5 (6.7 / 21.7) | 97 | 0.4 | 63.3 |
| h195-s2 | 285 | 0.1 | 0.0 | 0.1 | 1.8 | 26.6 (0.3) | 93 | 0.0 | 13.6 (3.9 / 9.7) | 48 | 0.2 | 42.4 |
| h195-s3 | 280 | 0.1 | 0.0 | 0.1 | 1.2 | 17.0 (0.3) | 61 | 0.7 | 26.0 (7.2 / 18.9) | 93 | 0.3 | 45.7 |
| h195-s4 | 278 | 0.1 | 0.0 | 0.1 | 1.7 | 17.7 (0.2) | 64 | 0.0 | 13.3 (3.7 / 9.5) | 48 | 0.2 | 33.2 |
| h195-s5 | 278 | 0.0 | 0.0 | 0.1 | 1.0 | 22.6 (0.3) | 81 | 0.0 | 22.0 (5.8 / 16.1) | 79 | 0.2 | 45.9 |
| dusk-s1 | 290 | 0.1 | 0.0 | 0.1 | 1.3 | 22.5 (0.3) | 77 | 0.0 | 14.7 (4.0 / 10.7) | 51 | 0.2 | 39.0 |
| dusk-s2 | 282 | 0.1 | 0.0 | 0.1 | 1.0 | 54.0 (4.7) | 191 | 0.3 | 20.6 (6.9 / 13.5) | 73 | 0.2 | 76.4 |
| dusk-s3 | 278 | 0.2 | 0.0 | 0.1 | 1.5 | 20.1 (0.3) | 72 | 0.0 | 15.6 (5.0 / 10.6) | 56 | 0.3 | 38.0 |
| dusk-s4 | 275 | 0.3 | 0.0 | 0.1 | 8.8 | 19.9 (0.3) | 72 | 0.0 | 17.7 (4.9 / 12.7) | 64 | 0.2 | 47.2 |
| dusk-s5 | 276 | 0.1 | 0.0 | 0.1 | 1.0 | 16.6 (0.3) | 60 | 0.3 | 27.5 (8.9 / 18.5) | 100 | 2.1 | 47.7 |
| night240-s1 | 1158 | 0.2 | 0.0 | 0.1 | 1.3 | 92.9 (1.6) | 80 | 0.1 | 75.2 (20.1 / 54.8) | 65 | 2.3 | 172.2 |
| night240-s2 | 1128 | 0.2 | 0.0 | 0.1 | 1.6 | 72.5 (1.0) | 64 | 0.1 | 51.6 (14.0 / 37.5) | 46 | 1.4 | 127.6 |
| night240-s3 | 1109 | 0.1 | 0.0 | 0.1 | 0.8 | 125.2 (2.2) | 113 | 0.1 | 75.0 (25.6 / 49.1) | 68 | 1.4 | 202.9 |
| night240-s4 | 1098 | 0.1 | 0.0 | 0.1 | 1.1 | 60.8 (0.9) | 55 | 0.1 | 54.7 (16.2 / 38.5) | 50 | 1.0 | 118.1 |
| night240-s5 | 1101 | 0.1 | 0.0 | 0.1 | 4.7 | 51.0 (0.8) | 46 | 0.1 | 60.5 (17.1 / 43.4) | 55 | 1.8 | 118.4 |
| overcast-s1 | 290 | 0.1 | 0.0 | 0.1 | 1.3 | 17.0 (0.2) | 59 | 0.0 | 13.0 (3.8 / 9.2) | 45 | 0.2 | 31.8 |
| overcast-s2 | 282 | 0.0 | 0.0 | 0.1 | 1.0 | 22.1 (0.5) | 78 | 0.1 | 49.4 (9.1 / 40.3) | 175 | 0.2 | 72.9 |
| overcast-s3 | 278 | 0.0 | 0.0 | 0.1 | 1.6 | 19.6 (0.2) | 71 | 0.0 | 14.6 (3.9 / 10.7) | 52 | 0.3 | 36.3 |
| overcast-s4 | 275 | 0.1 | 0.0 | 0.1 | 7.3 | 17.3 (0.2) | 63 | 0.1 | 16.7 (5.6 / 11.2) | 61 | 0.2 | 41.9 |
| overcast-s5 | 276 | 0.0 | 0.0 | 0.1 | 1.0 | 15.9 (0.2) | 58 | 0.0 | 14.4 (4.9 / 9.5) | 52 | 0.3 | 31.8 |
| shake-s1 | 290 | 0.0 | 0.0 | 0.1 | 0.9 | 19.5 (0.7) | 67 | 0.1 | 22.5 (5.8 / 16.7) | 77 | 0.7 | 43.8 |
| shake-s2 | 282 | 0.1 | 0.0 | 0.1 | 1.3 | 17.8 (0.3) | 63 | 0.0 | 18.9 (4.3 / 14.7) | 67 | 1.1 | 39.5 |
| shake-s3 | 278 | 0.1 | 0.0 | 0.1 | 1.3 | 21.9 (0.3) | 79 | 0.2 | 43.3 (13.9 / 29.3) | 156 | 0.5 | 67.5 |
| shake-s4 | 275 | 0.1 | 0.0 | 0.1 | 1.9 | 17.2 (0.2) | 63 | 0.0 | 15.6 (3.7 / 11.8) | 57 | 0.3 | 35.3 |
| shake-s5 | 276 | 0.1 | 0.0 | 0.1 | 1.5 | 18.4 (0.3) | 67 | 0.1 | 38.5 (7.6 / 30.7) | 140 | 0.9 | 59.5 |
| crf36-s1 | 290 | 0.1 | 0.0 | 0.1 | 1.8 | 17.5 (0.2) | 61 | 0.0 | 14.3 (4.1 / 10.2) | 49 | 0.3 | 34.2 |
| crf36-s2 | 282 | 0.0 | 0.0 | 0.1 | 1.4 | 21.2 (0.4) | 75 | 0.1 | 18.9 (5.6 / 13.3) | 67 | 0.2 | 42.0 |
| crf36-s3 | 278 | 0.1 | 0.0 | 0.1 | 1.7 | 18.3 (0.2) | 66 | 0.0 | 16.4 (4.5 / 11.9) | 59 | 0.6 | 37.2 |
| crf36-s4 | 275 | 0.0 | 0.0 | 0.1 | 1.1 | 25.2 (0.6) | 92 | 0.1 | 23.3 (5.5 / 17.8) | 85 | 0.4 | 50.5 |
| crf36-s5 | 276 | 0.0 | 0.0 | 0.1 | 1.9 | 18.4 (0.3) | 66 | 0.0 | 13.4 (3.7 / 9.7) | 49 | 0.2 | 34.2 |
| crf28-s1 | 290 | 0.0 | 0.0 | 0.1 | 1.1 | 59.2 (1.4) | 204 | 0.1 | 46.0 (10.7 / 35.3) | 159 | 0.3 | 107.0 |
| crf28-s2 | 282 | 0.0 | 0.0 | 0.1 | 1.6 | 23.4 (0.3) | 83 | 0.0 | 15.1 (4.7 / 10.4) | 54 | 0.3 | 40.6 |
| crf28-s3 | 278 | 0.1 | 0.0 | 0.1 | 1.6 | 17.9 (0.2) | 64 | 0.0 | 14.0 (4.3 / 9.7) | 51 | 0.2 | 34.1 |
| crf28-s4 | 275 | 0.1 | 0.0 | 0.1 | 1.8 | 16.6 (0.2) | 61 | 0.0 | 20.8 (5.6 / 15.1) | 76 | 0.6 | 40.1 |
| crf28-s5 | 276 | 0.0 | 0.0 | 0.1 | 1.0 | 15.0 (0.2) | 54 | 0.0 | 22.3 (5.0 / 17.2) | 81 | 0.3 | 38.9 |
| crf18-s1 | 290 | 0.5 | 0.0 | 0.3 | 2.4 | 17.1 (0.3) | 59 | 0.1 | 20.8 (6.3 / 14.4) | 72 | 0.4 | 41.6 |
| crf18-s2 | 282 | 0.0 | 0.0 | 0.1 | 1.3 | 16.9 (0.2) | 60 | 0.0 | 20.8 (5.3 / 15.4) | 74 | 0.3 | 39.5 |
| crf18-s3 | 278 | 0.1 | 0.0 | 0.1 | 1.2 | 16.2 (0.2) | 58 | 0.0 | 16.9 (6.0 / 10.8) | 61 | 0.3 | 34.8 |
| crf18-s4 | 275 | 0.0 | 0.0 | 0.1 | 1.5 | 16.3 (0.2) | 59 | 0.0 | 27.0 (6.9 / 20.1) | 98 | 0.3 | 45.3 |
| crf18-s5 | 276 | 0.0 | 0.0 | 0.1 | 1.3 | 16.2 (0.3) | 59 | 0.0 | 18.4 (4.4 / 14.0) | 67 | 0.3 | 36.4 |
| session | 4411 | 0.3 | 0.0 | 5.8 | 1.1 | 221.0 (3.0) | 50 | 0.4 | 297.0 (54.7 / 241.8) | 67 | 0.7 | 526.7 |

## Harness notes

- quick-slomo: after the time-scale correction audio is not used: Timeline is time-scaled (x0.125); slow-motion audio is stretched or silent, so contact timing from audio is unreliable.
- quick-slomo: time base corrected by the gravity check: x0.125 (capture 240.0 fps); ball detection re-run on corrected timestamps; poses re-timed and re-cleaned, not re-inferred
- slomo-s1: after the time-scale correction audio is not used: Timeline is time-scaled (x0.125); slow-motion audio is stretched or silent, so contact timing from audio is unreliable.
- slomo-s1: time base corrected by the gravity check: x0.125 (capture 240.0 fps); ball detection re-run on corrected timestamps; poses re-timed and re-cleaned, not re-inferred
- slomo-s2: after the time-scale correction audio is not used: Timeline is time-scaled (x0.125); slow-motion audio is stretched or silent, so contact timing from audio is unreliable.
- slomo-s2: time base corrected by the gravity check: x0.125 (capture 240.0 fps); ball detection re-run on corrected timestamps; poses re-timed and re-cleaned, not re-inferred

