# Validation harness (dev only)

Runs the app's own engine on one clip in the browser and, given the clip's synthetic truth,
scores every stage. It is the unit the end-to-end smoke validation (`tools/validate/smoke.mjs`)
is built on. Nothing here ships: `validation.html` is not a production build input, and the
synthetic corpus is served only by the dev server.

| File | What it does |
| --- | --- |
| `../../validation.html` | Page entry (same CSP as `index.html`). |
| `harness.ts` | Runs the pipeline and exposes `window.__harnessResult`; without `?clip=` it lists the corpus clips. |
| `result.ts` | Shape of `window.__harnessResult` (plain JSON). |
| `score.ts` | Scores a result against truth (pure; unit-tested in `score.test.ts`). |
| `truth.ts` | Reader for the `serve-synth-truth/1` format (tools/synth), stature in pixels, player-entered stand-ins. |
| `../../vite/syntheticCorpus.ts` | Dev-only Vite middleware: `../validation/synthetic` under `/__synthetic/` (byte ranges, no path traversal, video / JSON only). Nothing is copied into `public/`. |

## Use

```sh
npm run dev
# http://localhost:5173/validation.html                       -> list of corpus clips
# http://localhost:5173/validation.html?clip=/__synthetic/clips/baseline-s1/baseline-s1.mp4&truth=/__synthetic/clips/baseline-s1/truth.json
node ../tools/validate/smoke.mjs --clips baseline-s1           # headless Edge, writes ../validation/results/smoke/
```

Query parameters: `clip` (required), `truth`, and overrides for what the player would enter in the
app: `view` (side | rear | front45), `heightM`, `hand` (right | left), `tag` (T | body | wide),
`side` (deuce | ad). Without them the truth file supplies the stand-ins; `result.inputs.source`
records where each came from. Pose options: `model` (full | lite), `delegate` (auto | GPU | CPU),
`roi` (auto | off), `numPoses`, `worker` (auto | on | off). `maxFrames` limits the run for debugging.

## Pipeline (the order the app would run)

1. **Probe** (`probeVideo`): meta, frame table, time-base assessment. WebM skips the probe and goes
   to the media-element path.
2. **Decode path** (`openFrameSource`): WebCodecs when the codec is supported, else the media element.
3. **Audio** (`decodeAudioTrack` or `decodeAudioFileData`, then `detectOnsets`). Onsets go to the ball
   layer only when `assessAudioTiming` says the audio timing is usable.
4. **Pose** (`MediaPipePoseSource`, full model, ROI auto, VIDEO mode, numPoses 2, worker, GPU with
   CPU fallback) on full-resolution ImageBitmaps; then `cleanPoseFrames`. The source is disposed
   before the ball pass (that is also when tasks-vision tries to send its usage log; see Privacy).
5. **Ball**: `ballSetupFromPoses` (cleaned poses, entered height and hand), toss band until the
   strongest onset minus the sound delay, `createBallFrameDetector` on full-resolution RGBA frames,
   then `analyseBall` (tracking, toss events, gravity time-scale check, speed rules).
   `timeBaseKnown` is the probe's `status === 'proven'`, so 30/60 fps clips run with an unverified
   time base, as in the app.
6. **Slow-motion correction**: when the gravity check says `apply-correction`, the meta is replaced
   with `applyTimeScale(meta, nominalFps / s, s, 'physics')`, poses are re-timed and re-cleaned (not
   re-inferred), audio is dropped (time-scaled audio is not used for timing) and ball detection is
   re-run on the corrected timestamps. Both passes are kept in the result; `finalPass` is the one the
   app would report.
7. **Scoring** (with `?truth=`): frame counts, time base against truth, pose accuracy in statures
   (`scorePoseAccuracy`, raw and cleaned), ball detection with the ball layer's own scorer
   (`ball/eval/evalCore.ts`), toss / release / contact timing in real milliseconds, toss height,
   gravity factor against the expected one, speed range coverage, and audio onsets against the truth
   sound arrivals.

`window.__harnessResult` holds meta (probe and final, decode path and decoder stats), per-frame pose
landmarks with tracker decisions and ROI crops, cleaned landmarks, audio onsets, per-frame ball
candidates, tracks and the analysis of each ball pass, per-stage timings, scores and the
`securitypolicyviolation` events the page saw. `window.__harnessStatus` reports progress.

## Privacy

The page runs under the app's CSP (`connect-src 'self' blob: data:`). The pose worker is started
through a blob: bootstrap so it inherits that policy, and it also refuses cross-origin `fetch` itself
(`pose/workerNetworkGuard.ts`). `smoke.mjs` probes both the page and the running worker with a request
to MediaPipe's telemetry endpoint and records every request the browser makes; see
`../validation/results/smoke/SUMMARY.md`.

## Limits

- Player-entered values come from truth in the smoke run, so errors from a wrong entered height or
  view are not measured.
- The ball pass decodes the clip a second time (RGBA at full resolution) after the pose pass; decode
  and detection are serial on the main thread (see the stage times in SUMMARY.md).
- Slow-motion clips: poses are re-timed, not re-inferred, after the correction (MediaPipe VIDEO mode
  with numPoses 2 behaved like IMAGE mode in the pose layer's measurements, so timestamps should not
  change its output, but this is not re-measured here).
