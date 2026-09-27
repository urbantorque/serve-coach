# Engine smoke validation on the synthetic corpus

Generated 2026-09-27T02:50:00.728Z by `node tools/validate/smoke.mjs`. 1 clips: 1 ran to completion, 0 failed.

**Everything here is synthetic** (validation/synthetic, rendered by tools/synth). No real footage was used, so these numbers bound the engine on clean renders; they are not accuracy claims for real phones.

## Method

- Browser: msedge 154.0.4258.37 headless via Playwright (channel `msedge`), 8 logical CPUs, Intel(R) Core(TM) Ultra 5 226V. Clips run one at a time. The machine was not otherwise idle, so stage times are indicative, not benchmarks.
- User agent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0`.
- Pipeline (app/src/validation/harness.ts, the app's own engine): probe -> audio decode + onsets -> WebCodecs (or media-element) decode -> MediaPipe Pose Landmarker full, ROI auto, VIDEO mode, numPoses 2, worker, GPU with CPU fallback -> cleanPoseFrames -> ball detection at full resolution (toss band until the audio contact onset) -> tracking, toss analysis and gravity time-scale check -> if the check says slow motion: applyTimeScale(..., 'physics'), poses re-timed and re-cleaned, ball detection re-run.
- `timeBaseKnown` is what the video layer proves: only 100 fps+ timestamps (or Android capture-fps metadata) count, so 30/60 fps clips run with an unverified time base, exactly as the app would.
- Player-entered inputs (camera view, height, handedness, target tag, court side) are taken from truth as stand-ins for what the player types in.
- Pose error: 12 core joints, strict MediaPipe left/right labels, in statures (the player's standing height in pixels). Mirror-tolerant error forgives a whole-body left/right mirror. Ball scoring uses the ball layer's own scorer (recall over visible free-flight frames; precision over all candidates; localisation error = nearest matching candidate on toss frames).
- Times are real (capture) milliseconds unless marked media. Audio onset error = detected onset minus the truth sound arrival at the phone (media time), so the sound travel time is not an error.

## Privacy (CSP)

- Probe of `https://odml.pa.googleapis.com/v1/log` (MediaPipe telemetry) during the warm-up run:
  - page: violation `connect-src https://odml.pa.googleapis.com/v1/log`, XHR network error, fetch rejected: Failed to fetch; blocked by the CSP: **yes**;
  - pose worker (`blob:http://127.0.0.1:52856/<uuid>`): violation `connect-src https://odml.pa.googleapis.com/v1/log`, XHR network error, fetch rejected: Blocked on-device: cross-origin request to https://odml.pa.googleapis.com/v1/log (privacy guard); blocked by the CSP: **yes** (XHR shows the CSP alone; fetch also meets the worker's same-origin guard);
  - requests that reached the network layer during the probe: 0.
- Requests to hosts other than the dev server during the whole run (warm-up included; the router aborts and records them): **0**.
- Requests Chromium reported but the CSP refused before the network stack (probe included): 2 (POST https://odml.pa.googleapis.com/v1/log (csp)).
- Telemetry attempts stopped inside the pose worker by its fetch guard (`[privacy]` console lines): 2.
- During the clip runs (after the probe), `securitypolicyviolation` events on the page: 0; CSP console messages from the page and workers: 0. (The worker's guard refuses the telemetry fetch before the CSP check runs, so none are expected.)
- Pose ran on 1 of 1 completed clips with the policy in force.

## Summary by scenario

Medians over the clips in each set (apex and onset errors: mean |error| / max |error|). The gravity column is the first-pass factor divided by the expected one (1 = the check recovered the true time scale; slow motion expects 0.125), median and range. Speed = experimental side-view ranges that contain the true speed / ranges produced (the rest were refused).

| set | clips | frames = truth | pose detected | pose median err (stature) | ball toss recall | ball precision | ball loc. err (px) | toss found | apex err mean / max (ms) | audio onset err mean / max (ms) | gravity factor ratio to expected | speed ranges | ms per frame (pose / ball) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline (side 5 m, 60 fps) | 1 | 1/1 | 100% | 0.034 | 100% | 54% | 0.31 | 1/1 | 0.30 / 0.30 | 0.08 / 0.08 | 0.990 (0.990-0.990) | 0/0 | 46 / 39 |

## Computed flags

- Audio label of the onset at the racket pop: `contact` 1 (of 1 clips); the pop was not the strongest non-bounce transient in 0.
- Toss release |error| > 50 ms: 0.
- Toss apex outside 2 sigma of its reported uncertainty: 0. Toss apex height truth outside the reported range: 0.
- Speed-from-track (speed-experimental) refusals: "capture frame rate 60 fps is below 120 fps" 1.
- Pose frames where a whole-body left/right mirror fits better than MediaPipe's labels (median per view): side 38%.
- Outgoing tracks with detections off the ball: 0.

## Per clip: decode and time base

| clip | set | decode path | frames decoded / container / truth | timeline fps (truth) | time base | gravity factor [95%] (expected) | suggestion | final capture fps / time scale (truth) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline-s2 | baseline | webcodecs | 282 / 282 / 282 | 60.00 (60) | unknown (normal) | 0.990 [0.940-1.042] (1.000) | consistent | 60.0 / 1 (60 / 1) |

## Per clip: accuracy against truth

Pose columns are raw tracked MediaPipe output (before cleaning). Ball and toss columns are the final pass (after any time-scale correction).

| clip | pose detected | pose median / mean err (stature) | mirror-tol. mean | hitting wrist ±0.1 s | ball toss recall | ball precision (false / frame) | loc. err median / p95 (px) | toss track prec. / coverage | apex err (ms, z) | release err (ms) | apex height err (cm, in range) | audio contact onset err (ms, label) | ball layer contact from audio (ms) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline-s2 | 100% | 0.034 / 0.106 | 0.025 | 0.033 | 100% | 54% (0.48) | 0.31 / 1.12 | 100% / 100% | +0.30 (0.4) | -27.6 | -1.0 (yes) | +0.08 (contact) | +1.0 |

## Per clip: stage times (s)

Wall-clock seconds in the page. Pose pass includes decode (column "of which decode") and inference; ball pass includes RGBA decode and detection, summed over passes (2 passes after a slow-motion correction).

| clip | frames | fetch | probe | audio decode + onsets | pose init | pose pass (of which decode) | pose ms/frame | pose clean | ball pass (decode / detect) | ball ms/frame | ball analyse | total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline-s2 | 282 | 0.0 | 0.0 | 0.1 | 0.8 | 13.1 (0.2) | 46 | 0.0 | 11.1 (3.2 / 7.8) | 39 | 0.2 | 25.3 |

