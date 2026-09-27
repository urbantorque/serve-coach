# Pose layer (`src/analysis/pose`)

2D pose for the serve analyser: MediaPipe Pose Landmarker (or injected ground truth) in,
one cleaned `PoseFrame` per video frame out, plus the body geometry that metrics need.
Framework-free TypeScript. Everything except `mediapipeSource.ts`, `mediapipeCore.ts`,
`pose.worker.ts` and `smoke/` runs in Node and is unit-tested there.

```
frames ──> PoseSource.estimate() ──> PoseFrame[] (raw) ──> cleanPoseFrames() ──> PoseFrame[] (clean)
           MediaPipePoseSource          one person,            swaps, outliers,        body.ts helpers:
           (ROI crop per frame,         chosen by tracking.ts  gaps, One Euro          height, scale, handedness,
            worker or main thread,      (full-frame coords)                            facing side, angles, feet,
            GPU -> CPU fallback)                                                       tracking quality
           InjectedPoseSource
           (truth + noise model)
```

## Files

| File | What it does |
| --- | --- |
| `poseSource.ts` | `PoseSource` interface, `PoseInputFrame`, `PoseImage`, `collectPoseFrames`, `imageSize` |
| `mediapipeSource.ts` | `MediaPipePoseSource`: worker/main-thread backends, pipelining, tracking, stats |
| `mediapipeCore.ts` | `LandmarkerHandle`: tasks-vision creation, GPU->CPU fallback, warm-up, timestamp guard |
| `pose.worker.ts`, `workerProtocol.ts` | Dedicated module worker (started via a blob: bootstrap so the page CSP applies) and its message types |
| `workerNetworkGuard.ts` | Same-origin `fetch` guard installed in the worker (blocks MediaPipe telemetry even without CSP) |
| `tracking.ts` | `ServerTracker` / `trackServer`: pick and follow the server among up to 2 people; `peek()` |
| `roi.ts` | ROI cropping (pure): crop -> frame landmark mapping, square crops, localisation tiles, `RoiController` |
| `localise.ts` | `localisePeople`: full frame, then tiles, then a verification crop per candidate |
| `poseAccuracy.ts` | `scorePoseAccuracy`: detection, error in statures, PCK, mirrors (validation against truth) |
| `smoothing.ts` | `cleanPoseFrames`: swap correction, outlier rejection, gap interpolation, One Euro |
| `body.ts` | Body height, metres scale, handedness, facing side, joint angles, feet, tracking quality |
| `injected.ts` | `InjectedPoseSource`, `applyPoseNoise`, `parseTruthPoseFrames` (truth.json reader) |
| `landmarks.ts`, `rng.ts` | Topology (L/R pairs, groups), HU geometry, seeded RNG |
| `servePoseFixture.ts` | Exact kinematic serve pose used by unit tests (not the product's truth generator) |
| `smoke/` | Browser smoke test (`pose-smoke.html`, `run-smoke.mjs`) and ROI evaluation (`roi-eval.html`, `run-roi-eval.mjs`), dev only |

## Units and conventions

- Landmarks are normalised to the displayed frame (`x / width`, `y / height`, origin top-left).
- Distances and angles use **frame-height units (HU)**: `xHU = x * frameAspect`, `yHU = y`,
  with `frameAspect = width / height`. Every geometry function takes `frameAspect`; without
  it a portrait clip would distort angles by up to 1.8x.
- Thresholds are in **body heights (BH)**, the player's standing height in HU, so the same
  parameters work at any zoom level. All timing uses `tReal` (capture seconds), never frame
  counts, so 30 and 240 fps clips behave the same.
- `interpolated: true` landmarks have `visibility: 0`. They fill short gaps for continuity and
  are **not measurements**: metrics should not report a value computed from them as `measured`.

## Usage

```ts
import { MediaPipePoseSource, cleanPoseFrames, collectPoseFrames, inferHandedness } from './analysis/pose'

const source = new MediaPipePoseSource({ model: 'full' }) // ROI crop, VIDEO mode, numPoses 2, GPU->CPU, worker
// new MediaPipePoseSource({ roi: 'off' })                    // full frames (the old behaviour)
// new MediaPipePoseSource({ numPoses: 1 })                   // ~25% faster; MediaPipe tracks and smooths itself
// new MediaPipePoseSource({ roiOptions: { headroom: 0.7 } }) // crop geometry, see DEFAULT_ROI_OPTIONS
const raw = await collectPoseFrames(source.estimate(decodedFrames)) // AsyncIterable<{frameIndex, tReal, image}>
console.log(source.stats()) // backend, delegate, init/warm-up ms, per-frame inference ms, lost frames
await source.dispose()

const frameAspect = meta.width / meta.height
const { frames, report } = cleanPoseFrames(raw, { frameAspect })
const hand = inferHandedness(frames, { frameAspect, contactFrameIndex })
```

Stress-testing metrics without images:

```ts
const truth = parseTruthPoseFrames(JSON.parse(truthJson))
const source = new InjectedPoseSource(truth, { frameAspect, noise: { seed: 7, swapProb: 0.01 } })
const noisy = await collectPoseFrames(source.replay()) // or source.estimate(frames) to align by frameIndex
source.noiseEvents // every injected dropout / swap, for checking what cleaning caught
```

## MediaPipePoseSource

- **Assets:** models from `/models/pose_landmarker_{lite,full}.task` and wasm from
  `/mediapipe/wasm` (both in `public/`, no CDN). Relative URLs are resolved against the page,
  so they work under `capacitor://localhost` too.
- **Worker:** used when `Worker`, `OffscreenCanvas` and `createImageBitmap` exist (Chromium,
  Safari 17+). Input images are copied to an `ImageBitmap` and transferred; the caller keeps
  its image and may release it as soon as the next frame is requested
  (`transferInputBitmaps: true` transfers caller bitmaps instead of copying). If the worker
  fails to start, the source falls back to the main thread; `stats().workerError` says why.
  The worker loads the ES-module build of the wasm loader (`useModule`), because
  `importScripts` does not exist in module workers.
- **Delegate:** `'auto'` creates a GPU landmarker and runs one warm-up inference. If creation
  or warm-up fails, it closes it and uses CPU; `stats().init.gpuError` keeps the reason.
  tasks-vision uploads every frame through WebGL even with the CPU delegate, so WebGL is
  always required. A GPU failure mid-clip is **not** retried on CPU: those frames come back
  empty and are listed in `stats().detectErrors`.
- **VIDEO mode** (default) needs strictly increasing timestamps. They come from `tReal`
  (ms), are forced at least 1 ms apart, and a new clip starts 1 s after the previous one. At
  the start of each `estimate()` call the graph is rebuilt (`setOptions`) so MediaPipe's
  tracking state does not leak between clips. ROI localisation never uses the VIDEO
  landmarker (see below), so its timestamps and tracking state only ever see the clip's frames.
- **What VIDEO mode actually does (measured, tasks-vision 1.0.1, 9 rendered clips):**
  - With `numPoses: 2` the output was **identical to IMAGE mode** (same output checksum) on 7 of
    9 ROI clips, so no temporal smoothing is applied. The other two differ in the side-view
    follow-through, where the detector misses: VIDEO mode carries on from the previous
    landmarks and IMAGE mode returns nothing (100% vs 87% of frames at 7 m and 12 m).
  - With `numPoses: 1` MediaPipe tracks from the previous landmarks without re-running the
    detector, and applies its own causal smoothing. Around contact the hitting wrist then sat
    slightly further back along its path than with `numPoses: 2`: in 11 of 14 clips, by a
    median of 0.008 statures (range -0.064 to +0.043; 5-44 fast frames per clip). The effect
    is small but in the direction `cleanPoseFrames`' zero-phase filter is built to avoid.
- **numPoses = 2** (default) so a second person is detected as a separate pose and
  `ServerTracker` keeps the server. Cost: MediaPipe then runs its person detector on every
  frame (about 10 ms per frame on this machine). `numPoses: 1` with VIDEO mode is the fast
  option (see the ROI section).
- **Throughput (measured 2026-09-28, `smoke/run-throughput.mjs`, Arc 130V, 120 pre-cropped frames):**
  the WebGL path costs a nearly fixed 15-28 ms a frame whatever the model (lite 13-26 ms, full
  15-28 ms; numPoses 2 adds the detector, about 10 ms). A second landmarker in another worker adds
  about 10% (the GPU process is shared); the CPU delegate takes 33 ms a frame with numPoses 1 and
  91 ms with 2, per worker. `maxInFlight` changes results, not only speed: the ROI crop for the
  next frame is chosen from the observations so far, so a deeper pipeline crops from older ones.
- **Stream settings (`configure`):** `numPoses`, `roiMaxSidePx` and a `seed` (the server's pose
  just before the stream, which starts the ROI and the tracker without a localisation) apply from
  the next `estimate()` call.
- **Score:** tasks-vision exposes no per-pose score, so `PoseFrame.score` is the mean
  visibility of the 12 core joints.
- **Privacy:** tasks-vision 1.0.1 POSTs usage telemetry (task type, timings, no image data)
  to `https://odml.pa.googleapis.com/v1/log` with `fetch`, from the thread the landmarker runs
  on (the worker), when a landmarker closes and every 60 s. There is no option to disable it.
  - **A page CSP alone did not stop it.** A worker started from a same-origin URL takes its CSP
    from its own HTTP response (none on the dev server or a static host), so with only the
    `index.html` meta policy the worker's POST reached the network (headless Edge 154,
    2026-09-27, `tools/validate/smoke.mjs`; the runner's router aborted it).
  - **Fix:** `createPoseWorker()` starts `pose.worker.ts` through a one-line `blob:` module that
    imports it. A blob: worker inherits the page's policy, so `connect-src 'self'` applies inside
    the worker too (the page CSP needs `worker-src 'self' blob:`). Verified: an XHR to the
    telemetry host from inside the running worker raises a `connect-src` violation and never
    reaches the network.
  - **Defence in depth:** `pose.worker.ts` installs `installSameOriginFetchGuard`
    (`workerNetworkGuard.ts`), which refuses any cross-origin `fetch` in the worker and logs
    `[privacy] pose worker: blocked a cross-origin request to ...`. It covers browsers that do not
    pass the policy on to blob workers (WebKit / WKWebView behaviour is unverified). It compares
    scheme and host, so `capacitor://localhost` works although its URL origin is opaque.
  - Blocking the telemetry does not affect inference.

## Tracking the server (`tracking.ts`)

- **Acquisition:** people under half the size of the largest (far court, spectators) are
  ignored. Of the rest, the one whose feet are nearest the baseline-centre hint is taken:
  `baselineCentre` (normalised), which defaults to the frame's horizontal centre.
- **Continuation:** candidates are gated on torso-centre speed (3 box-heights/s plus slack)
  and a size change of at most 1.6x. The cheapest one wins on centroid jump + (1 − IoU) +
  |log size ratio|. The box excludes arms and hands, so the serve's arm swing does not move it.
- **Losing the server:** when no candidate passes the gate, the frame is `null` and the
  track never switches. After `reacquireAfterS` (0.5 s) it re-acquires only someone within
  0.75 box-heights of the last position. After `forgetAfterS` (3 s) it starts over from the
  baseline hint. `source.trackDecisions()` gives the per-frame reason and confidence.

## ROI cropping (`roi.ts`, `localise.ts`; `roi: 'auto'` by default)

MediaPipe's person detector sees the whole input squeezed to 224×224. In a portrait
1080×1920 frame a player 7-12 m away is 210-400 px tall, which is 25-46 px at detector
resolution. In the clips below, full-frame detection found the server in 6-70% of frames at
those distances, and many of those "detections" were wrong (1.5 statures off at 12 m). So
`MediaPipePoseSource` finds the server once, then runs the model on a square crop around
them in every frame.

1. **Localisation** (`localisePeople`), whenever no ROI is active: on the first frame, after the
   server has been missing for 0.4 s, and while nobody is found (every 0.25 s, backing off to
   1 s).
   - Level 0 is the full frame. Level 1 is squares of the short side along the long axis
     (3 × 1080 px for 9:16). Level 2 is squares of half the short side (15 × 540 px). Levels 0
     and 1 always run, so a large bystander cannot hide a small server; level 2 runs only while
     nobody is verified. A 12 m player needed level 2 (20-21 detector runs); 4-7 m needed 5-6.
   - Candidates (mean core-joint visibility ≥ 0.5) are mapped to the frame and de-duplicated
     (arm-free box IoU ≥ 0.3). The best 3 are **verified**: the model runs again on the crop each
     one implies, and only a pose found again there (overlapping) counts. The verified pose,
     not the coarse one, is kept. This rejects the spurious small detections seen in full frames.
   - The server is chosen with `ServerTracker.peek()`: the tracker's own rules (ignore anyone
     under half the size of the largest, nearest the baseline centre, or near the last known
     position after a loss), without changing its state.
   - Localisation runs on a separate **IMAGE-mode locator** landmarker (numPoses ≥ 2), created
     on first use, so the VIDEO-mode landmarker's timestamps and tracking state only ever see
     the clip's own crops. In IMAGE mode with numPoses ≥ 2 the main landmarker is reused.
2. **Per-frame crop** (`RoiController`), from the server pose of earlier frames:
   - A square from 0.1 statures below the soles to 0.6 above a standing head (1.7 statures: the
     raised hitting arm at contact, the jump, part of the racket). It is at least as wide as the
     arm-free body plus 0.35 statures each side, and at least max(160 px, 0.2 × short side).
   - The stature is a 0.3 s rolling median of max(head-to-floor, torso / 0.29). It is
     remembered, relaxing over 1.5 s, so a crouch does not shrink the crop before the hitting
     arm goes up.
   - Anti-jitter: the side grows once the target exceeds it by 4%, and shrinks (0.8 s time
     constant) only when the target is 15% smaller. The centre moves only when the body is more
     than 6% of a side off-centre, then glides (0.08 s). A containment check overrides both, so
     the arm-free body plus half the margins stays inside. The crop changed on 2-11 of 120
     frames per clip. With 0.01-stature landmark jitter it did not move at all while the player
     stood still (unit test).
   - With 2 frames in flight, frame n's crop comes from frames up to n − 2; the margins cover
     that (unit test: every landmark, raised hand included, stays inside at 0.15-0.4 frame
     heights, side and rear, and for a player walking at ~1.6 m/s).
   - Clamped by moving, never shrinking; a side larger than the frame becomes a rectangle
     (MediaPipe letterboxes). If the server is missing, the crop grows 1.5×/s, and after 0.4 s it
     is dropped and localisation runs again.
3. **Cropping** uses `createImageBitmap(source, x, y, w, h)` with integer rectangles, which
   replaces the full-frame copy the worker path already made (5.8-8.6 ms per frame against
   11.9-14.1 ms for the full copy; see timings). ImageBitmap, VideoFrame, canvas and ImageData
   inputs all work. At 4 m the square is wider than the portrait frame, so it is clamped to a
   1080 px wide rectangle.
4. **Mapping back** is exact: `x = (cropX + x' · cropW) / frameW`, `y = (cropY + y' · cropH) /
   frameH`, `z = z' · cropW / frameW` (MediaPipe's z uses the input width's scale). World
   landmarks are unchanged. Unit tests cover random crops in portrait, landscape and square
   frames, round trips to 1e-12, pixel distances in both axes, and joint angles computed after
   mapping. The tracker, cleaning and metrics only ever see full-frame coordinates.

`stats().roi` reports frames cropped or skipped, localisations (found / attempted), detector
runs, localisation time and the locator set-up time. `stats().prepare` is the crop (or copy)
time per frame, and `roiTrace()` gives the rectangle used for every frame.

### ROI evaluation (rendered clips with exact truth)

The clips are rendered by `smoke/render-roi-clips.mjs` using the `tools/synth` modules: the
feasibility-probe scenario (intermediate right-hander, 1.8 m, red outfit, bright hard court),
portrait 1080×1920 at 30 fps, H.264 CRF 18, 120 frames (4 s: setup to recovery), camera 1.2 m
high. `smoke/run-roi-eval.mjs` decodes each clip with the app's video layer (WebCodecs,
full-resolution ImageBitmaps) and runs `MediaPipePoseSource` (full model, GPU, worker) in
headless Edge 153 on an Intel Arc 130V. It scores the 12 core joints against truth, in
statures (BH = standing height in px). "On target" means at least half the joints are within
0.1 BH. "Strict" uses MediaPipe's left/right labels as given; "mirror-tolerant" forgives a
whole-body left/right mirror, like the feasibility study. Repeated runs (2-6 per configuration)
gave the same output checksums, except one numPoses 1 clip whose accuracy still matched to 3
decimals.

| Clip | Stature | Full frame: detected / on target | error strict / mirror-tolerant (BH) | PCK@0.1 | ROI: detected / on target | error strict / mirror-tolerant (BH) | PCK@0.1 | Hitting wrist ±0.1 s, full → ROI (BH) |
|---|---|---|---|---|---|---|---|---|
| side 4 m | 660 px | 100% / 53% | 0.135 / 0.041 | 0.52 | 100% / 52% | 0.137 / 0.040 | 0.51 | 0.153 → 0.083 |
| side 7 m | 372 px | 42% / 11% | 0.284 / 0.262 | 0.10 | 100% / 60% | 0.116 / 0.036 | 0.56 | 0.394 → 0.120 |
| side 12 m | 216 px | 21% / 0% | 1.605 / 1.602 | 0.00 | 100% / 57% | 0.117 / 0.030 | 0.57 | none detected → 0.065 |
| rear 4 m | 736 px | 100% / 99% | 0.039 / 0.028 | 0.92 | 100% / 100% | 0.035 / 0.028 | 0.93 | 0.015 → 0.012 |
| rear 7 m | 395 px | 70% / 10% | 0.230 / 0.200 | 0.17 | 100% / 100% | 0.032 / 0.024 | 0.94 | 0.011 → 0.011 |
| rear 12 m | 224 px | 6% / 0% | 0.666 / 0.628 | 0.00 | 100% / 99% | 0.046 / 0.029 | 0.91 | 0.031 (1 of 6 frames) → 0.096 |
| front45 4 m | 620 px | 95% / 51% | 0.105 / 0.039 | 0.54 | 100% / 57% | 0.094 / 0.032 | 0.62 | 0.042 → 0.044 |
| front45 7 m | 359 px | 39% / 13% | 0.158 / 0.087 | 0.17 | 98% / 33% | 0.136 / 0.029 | 0.40 | 0.428 (3 of 6 frames) → 0.157 |
| front45 12 m | 212 px | 57% / 0% | 1.515 / 1.512 | 0.00 | 100% / 31% | 0.143 / 0.029 | 0.36 | none detected → 0.076 |

Both columns use VIDEO mode, numPoses 2 (the defaults); the error columns average over
detected frames only, and PCK@0.1 counts undetected frames as misses.

- **ROI turns 7-12 m from unusable into usable:** detection 6-70% → 98-100%, and
  mirror-tolerant error 0.2-1.6 → 0.024-0.036 BH, matching the feasibility study's oracle
  crops (~0.03). At 4 m, where full frames already work, it is neutral on the whole pose
  and better on the hitting wrist at contact on side (0.153 → 0.083), neutral elsewhere.
- **Left/right labels are MediaPipe's weak point, not the crop's:** in side and front-45 views
  a whole-body mirror fits better than MediaPipe's labels in 43-75% of frames (with ROI; rear
  view 8-16%), and the same happens on full frames. That is why strict error (0.09-0.14 BH) is
  much larger than mirror-tolerant error (~0.03) there, while the rear view is 0.03-0.05 BH
  either way. Overlays of two side-view frames confirmed the truth labels (the racket arm is
  the right arm) and showed MediaPipe swapping the arms while labelling the legs correctly.
  `cleanPoseFrames` fixes short flips but not ones that persist, so handedness and per-side
  metrics from side / front-45 footage need a different cue (see known limitations).

**Running mode with ROI** (means over the three views; the brief asked to decide by measurement):

| Distance | Mode | Detected | Error strict / mirror-tolerant (BH) | PCK@0.1 all frames | Hitting wrist ±0.1 s (BH) |
|---|---|---|---|---|---|
| 4 m | VIDEO, numPoses 2 (default) | 100% | 0.089 / 0.033 | 0.68 | 0.047 |
| 4 m | IMAGE, numPoses 2 | 100% | 0.089 / 0.033 | 0.68 | 0.047 |
| 4 m | VIDEO, numPoses 1 | 100% | 0.081 / 0.031 | 0.72 | 0.070 |
| 7 m | VIDEO, numPoses 2 (default) | 99% | 0.094 / 0.030 | 0.63 | 0.096 |
| 7 m | IMAGE, numPoses 2 | 95% | 0.102 / 0.033 | 0.59 | 0.096 |
| 7 m | VIDEO, numPoses 1 | 100% | 0.090 / 0.028 | 0.66 | 0.029 |
| 12 m | VIDEO, numPoses 2 (default) | 100% | 0.102 / 0.029 | 0.62 | 0.079 |
| 12 m | IMAGE, numPoses 2 | 96% | 0.112 / 0.034 | 0.57 | 0.079 |
| 12 m | VIDEO, numPoses 1 | 100% | 0.097 / 0.030 | 0.64 | 0.045 |

- **VIDEO, numPoses 2 is the default.** It matches IMAGE mode wherever the detector finds the
  player (no MediaPipe smoothing, so `cleanPoseFrames` gets unfiltered landmarks), and it keeps
  tracking where the detector misses. In the side-view follow-through, IMAGE mode detected only
  87% of frames at 7 and 12 m. It also keeps bystander protection. Changing crops did not upset
  MediaPipe's tracking: 98-100% of frames were detected.
- **VIDEO, numPoses 1** is 7-28% faster per frame (typically about 25%; below), slightly more
  accurate on average and better on the hitting wrist at 7-12 m in these clips. The costs: MediaPipe smooths internally (the
  wrist trailed `numPoses: 2` slightly in 11 of 14 clips, median 0.008 BH), and only one person
  is detected inside the crop. It is a candidate default for phones if throughput is short,
  once it has been tested with bystanders.

**Supplementary check on the current `tools/synth` corpus** (`validation/synthetic`, generated
after the clips above; side view at 5 m, 524 px stature, the same serve at 30-240 fps, and CRF 36):

| Clip | Full frame: detected / error strict / mirror-tolerant (BH) | ROI (default) | Hitting wrist ±0.1 s, full → ROI (BH) | ms/frame, full → ROI → ROI numPoses 1 |
|---|---|---|---|---|
| 30 fps (fps30-s1) | 99% / 0.105 / 0.028 | 99% / 0.106 / 0.024 | 0.102 → 0.052 | 63 → 56 → 41 |
| 60 fps (baseline-s1) | 100% / 0.101 / 0.027 | 100% / 0.110 / 0.025 | 0.130 → 0.094 | 58 → 52 → 38 |
| 120 fps (fps120-s1) | 100% / 0.104 / 0.027 | 100% / 0.109 / 0.025 | 0.132 → 0.051 | 57 → 49 → 37 |
| 240 fps (fps240-s1) | 99% / 0.102 / 0.026 | 100% / 0.106 / 0.025 | 0.108 → 0.079 | 59 → 54 → 39 |
| 60 fps, CRF 36 (crf36-s1) | 100% / 0.101 / 0.027 | 100% / 0.105 / 0.026 | 0.197 → 0.153 | 67 → 57 → 41 |

At 5 m, where full frames already work, ROI is neutral on the whole pose (strict error +0.001
to +0.009 BH, mirror-tolerant -0.001 to -0.004 BH). It reduced the hitting-wrist error at
contact in all five clips and was faster per frame in all five (the machine was busier than
for the timing table below).

**Time per frame** (medians of 3 runs; wall time includes WebCodecs decode at 5-7 ms/frame;
the machine was shared with other agents):

| Clip | Full frame (old default) | ROI (new default) | ROI, VIDEO numPoses 1 | Crop vs full copy (prepare) | Localisation, once per clip |
|---|---|---|---|---|---|
| side 4 m | 41.8 ms | 39.1 ms | 34.9 ms | 8.6 vs 12.3 ms | 285 ms (6 runs) |
| rear 7 m | 40.3 ms | 35.0 ms | 25.6 ms | 5.8 vs 11.9 ms | 253 ms (6 runs) |
| front45 12 m | 42.8 ms | 44.6 ms | 41.3 ms | 5.9 vs 14.1 ms | 597 ms (21 runs) |

The per-frame cost is **about the same or lower** with ROI. The crop is cheaper to prepare (see
the table) and median inference was lower on the crop (34.0 / 29.9 / 35.8 ms against 39.5 /
37.7 / 41.5 ms), even though the landmark model now runs on every frame. At 12 m, full-frame
mode mostly found nobody and so skipped the landmark model. The added cost
is one-off: localisation of 0.25-0.6 s at the start of a clip (and after a loss), plus about
0.55 s to create the IMAGE-mode locator the first time in VIDEO mode. With nobody in view,
localisation backs off to once a second (19 detector runs each).

## Cleaning (`smoothing.ts`, `cleanPoseFrames`)

1. **Left/right swaps.** For each limb group (face, arms, legs), the relation of each frame
   to the previous one (KEEP / FLIP / UNKNOWN) is decided from raw data, using a
   constant-velocity prediction. Frames linked by known relations form components. Within a
   component the minority parity is relabelled, but only if each of its runs is at most
   0.5 s. A single spurious flip between two long runs therefore changes nothing and lands
   in `report.swapsUnresolved` instead. An earlier frame-by-frame design let one wrong
   decision flip the rest of the clip (up to 0.78 BH error in tests); this design fixes
   that. Persistent mislabelling for the whole clip, which is possible from behind, cannot
   be detected by continuity.
2. **Outliers.** An excursion is a run of 1-5 samples that deviates from the chord between
   its neighbours by more than
   `max(0.06 BH, ½·300 BH/s²·(t−t₀)(t₁−t)) + 0.02 s × chord speed`. The middle term is the
   largest deviation constant acceleration can produce, and 300 BH/s² is about twice the
   wrist's peak in a serve. The speed term keeps motion-blur-scale error on the hitting
   hand: rejecting it and interpolating biased the wrist apex by about 5 ms.
3. **Gaps.** Gaps whose bracketing observations are ≤ 0.1 s apart are filled with a cubic
   Hermite (finite-difference tangents; `method: 'linear'` is available). A frame the
   detector missed is emitted only if every landmark can be filled.
4. **One Euro** filter (Casiez et al. 2012) with the cutoff driven by **2D speed** in BH/s.
   A per-axis filter drops y's cutoff to the minimum exactly at the wrist apex (vertical
   speed ≈ 0) and flattens it. `preservePeaks: true` (default) runs the filter forwards and
   backwards and averages them (zero phase, offline only).

### Smoothing parameters (`SPORTS_ONE_EURO = {minCutoffHz: 0.8, beta: 8, dCutoffHz: 3}`)

Parameters were chosen by a sweep on the kinematic fixture. Noise was jitter σ = 0.005 BH
plus speed jitter of 0.004 s × speed, over 30 seeds. Apex bias and MAE are the timing
error of the right-wrist maximum in ms; RMS values are in body heights.

| fps | raw apex bias / MAE | clean (zero-phase) bias / MAE | causal bias | RMS at rest raw → clean | RMS swing raw → clean | RMS all raw → clean |
| --- | --- | --- | --- | --- | --- | --- |
| 30 | 2.2 / 2.2 | 1.1 / 1.1 | 5.6 | 0.0071 → 0.0031 | 0.0217 → 0.0215 | 0.0083 → 0.0054 |
| 60 | 0.6 / 7.2 | 2.8 / 6.1 | 6.1 | 0.0071 → 0.0024 | 0.0229 → 0.0194 | 0.0084 → 0.0046 |
| 120 | 0.8 / 10.3 | 2.2 / 8.9 | 6.9 | 0.0071 → 0.0019 | 0.0232 → 0.0173 | 0.0084 → 0.0039 |
| 240 | 1.9 / 10.8 | 1.8 / 9.6 | 3.8 | 0.0071 → 0.0015 | 0.0234 → 0.0147 | 0.0084 → 0.0033 |

The standard One Euro setting (1 Hz / β 2 / dCutoff 1 Hz) lagged the apex by 14-33 ms at
30-60 fps even in zero-phase mode, so dCutoff is 3 Hz. On noise-free data the pipeline
flags nothing, keeps the apex exact, and distorts landmarks by under 0.003 BH.
**These parameters are tuned on injected noise, not real MediaPipe output.** MediaPipe
VIDEO-mode error is temporally correlated because MediaPipe already smooths, so re-tune on
the validation set.

Other measurements on the fixture:

- **Swap correction.** Full default noise with `swapProb` 0.03, 20 seeds, side and rear
  views, both hands, 30/60/240 fps:
  - False swaps: 0 in every case.
  - Side view: every injected arm swap was fixed wherever the wrists were more than 0.1 BH
    apart; misses happen only where left and right overlap (harmless).
  - Rear view: 100% fixed.
  - RMS error, raw to clean: 0.027-0.042 → 0.003-0.007 BH.
- **Outliers.** No false rejections on noise-free clips at 30-240 fps. With jitter and blur
  noise: none at 30/60 fps, 2 samples at 120 fps and 19 at 240 fps, over 40 clips.
- **Gap filling** error for one 33 ms gap:
  - At rest: < 0.0002 BH.
  - 50 ms before contact (the whip): 0.037 BH RMS (max 0.12) at 30 fps; 0.021 (max 0.067)
    at 60 fps; 0.013 (max 0.051) at 240 fps.
  - Cubic beat linear in every case.
- **Body height** from setup frames: within 1.5% of truth noise-free (side and rear), and
  within 2% with jitter.

## Body geometry (`body.ts`)

- **`estimateStandingBodyHeight`**: median over upright setup frames (knee flexion ≤ 25°,
  trunk lean ≤ 25°) of floor minus top of head.
  - Floor is the lower of heel / foot-index, or the ankle plus 0.039 H.
  - Top of head is placed above the eyes, ears and nose by anthropometric offsets (Drillis &
    Contini), scaled by a shoulder scale: the larger of the 2D shoulder width and
    0.76 × torso length. Shoulders overlap in a side view, so the 2D width alone would fail.
  - With no upright frames it falls back to the 90th percentile (confidence 0.25).
  - Expect about ±2% error from the head-top step alone.
- **Scale:** `metresPerHeightUnit` / `metresPerPixel` from the player's entered height. The
  result is always *estimated*, and only valid at the player's depth. The ball after
  contact, the net and the far court are at other depths.
- **`inferHandedness`**: the wrist that goes highest within ±0.15 s of the contact
  candidate (or of the highest wrist in the clip). Confidence reaches 1 at a 0.15 BH margin.
  It relies on MediaPipe's anatomical L/R labels, so run swap correction first.
- **`estimateFacingSide`**: the horizontal shoulder separation relative to torso length
  separates profile from square-on views.
  - Square-on: the left/right shoulder order gives front or back. A nose visibility above
    0.9 overrides it to front; below 0.1, to back.
  - Profile: the near side is the one with smaller MediaPipe z, or failing that, higher
    visibility.
- **Angles:** `kneeFlexionDeg`, `elbowFlexionDeg` (180 − interior angle), `trunkInclinationDeg`
  (hip-mid → shoulder-mid from vertical, signed) and `segmentElevationDeg`.
  **2D caveat:** these equal the 3D angles only when the limb moves parallel to the image
  plane. A 45° knee bend seen from directly behind measures ~0° (this is in the tests).
- **Feet:** `footPoints`; `frontFootToe` uses the stance convention that the front foot is on
  the non-hitting side.
- **`trackingQuality`** (experimental heuristic): √(core visibility) × core coverage ×
  in-frame fraction × torso-size consistency × (1 − ½ × interpolated fraction).

## Injected noise model (`applyPoseNoise`, defaults in `DEFAULT_POSE_NOISE`)

All magnitudes are in body heights and every event is logged in `events`.

| Term | Default |
| --- | --- |
| Gaussian jitter σ | 0.005 BH |
| Motion-blur jitter on elbows, wrists and hand points | 0.004 s × 2D speed (BH/s) |
| Frame dropout bursts (the detector loses the person) | probability 0.01, mean 1.5 frames |
| Visibility drops (occlusion) | probability 0.01; visibility becomes U(0, 0.2), extra σ 0.03 BH |
| Left/right swaps (arms, legs, or the whole body) | probability 0.005, mean 3 frames |

`parseTruthPoseFrames` reads:

- an array of frames, or `{frames: [...]}`, with optional `width` and `height` (top level
  or under `video` / `meta`) to normalise pixel coordinates;
- per frame: `frameIndex` | `index` | `frame`, and `tReal` | `t` | `time` | `timeS`;
- landmarks under `landmarks` | `landmarks2d` | `pose2d` | `keypoints2d` | `pose`, as
  33 `{x, y, z?, visibility?}` objects or `[x, y, z?]` tuples.

## Tests

```sh
npx vitest run src/analysis/pose          # 107 unit tests (Node)
node src/analysis/pose/smoke/run-smoke.mjs --frames 60           # browser smoke, dev server
node src/analysis/pose/smoke/run-smoke.mjs --prod                # same against a production build
node src/analysis/pose/smoke/run-smoke.mjs --block-telemetry     # with the telemetry host blocked

# ROI evaluation on rendered clips (about 12 s per clip to render, 5 s per clip x config to run)
cd ../tools/synth && npx tsx ../../app/src/analysis/pose/smoke/render-roi-clips.mjs && cd ../../app
node src/analysis/pose/smoke/run-roi-eval.mjs [--configs off-VIDEO,auto-VIDEO,auto-IMAGE,auto-VIDEO-n1]
        [--clips side-12m-30fps,...] [--repeat 3] [--dump-frames 10,77] [--out result.json]
node src/analysis/pose/smoke/run-roi-eval.mjs --clips-dir ../validation/synthetic/clips --clips fps30-s1,baseline-s1
```

Unit tests for ROI (`roi.test.ts`, `localise.test.ts`, `poseAccuracy.test.ts`, and `peek` in
`tracking.test.ts`) cover:

- the crop -> frame mapping: exact values, random round trips, pixel distances, angles;
- square crops, clamping and tile plans;
- the controller: containment of every landmark with a 2-frame lag, jitter, a walking player,
  loss / re-localisation / backoff, minimum size;
- the localiser: tiles, verification rejecting a spurious detection, de-duplication, level 2,
  two people, all with a fake detector;
- the accuracy scorer.

The browser smoke test now runs every configuration with ROI (the default), plus rows for
`roi: 'off'` and for VIDEO mode, whose locator is a second landmarker (worker and main thread).

`run-roi-eval.mjs` serves clips to `smoke/roi-eval.html` under `/__roi-eval/`, blocks
MediaPipe telemetry, and runs Vite without HMR or file watching, because an edit elsewhere in
`src` would otherwise reload the page mid-run. It reads both the `render-roi-clips.mjs` truth
format and the `tools/synth` corpus format (`serve-synth-truth/1`). Configurations are
`{off,auto}-{VIDEO,IMAGE}` (numPoses 2) and the same with `-n1` (numPoses 1).

The smoke runner starts Vite, drives headless Edge through Playwright, and exits 1 if any
configuration fails or a person-free frame yields a pose. It covers:

- lite and full models, GPU and CPU delegates, worker and main thread;
- `ImageBitmap`, `ImageData` and canvas input;
- `numPoses` 1 and 2, and IMAGE mode;
- a flat cartoon figure drawn from the fixture, which checks wiring (coordinates, aspect,
  left/right labels) through the worker. It is not an accuracy measurement.

### Smoke results (2026-09-27)

Setup: Edge 153 headless on an Intel Arc 130V (ANGLE / D3D11, real GPU by default), 1280×720,
VIDEO mode, median inference inside PoseLandmarker, 30-60 frames per run. Ranges cover four
runs; other agents were loading the machine at the same time.

| Scene | Config | Median inference per frame |
| --- | --- | --- |
| No person (detector only; lite = full here) | GPU | 9-17 ms |
| No person | CPU | 17-33 ms |
| Cartoon figure (detector + landmarks), worker | lite GPU, numPoses 2 | 25-34 ms |
| | full GPU, numPoses 2 | 28-31 ms |
| | lite CPU, numPoses 2 | 40-61 ms |
| | full CPU, numPoses 2 | 49-55 ms |
| | lite GPU, numPoses 1 | 15-22 ms |
| | full GPU, numPoses 1 | 17-19 ms |
| | full GPU, IMAGE mode | 29 ms |

- **Initialisation:** 120-700 ms to create the landmarker, plus a 100-800 ms warm-up. The
  first GPU start in a fresh browser needs 3.3-4.9 s of warm-up (shader compile).
- **Worker round trip** (copy, transfer, pipeline queue) was about 2x the inference time.
  Throughput stays close to the inference time because two frames are kept in flight.
- **All frames without a person** returned no pose and no errors.
- **Cartoon figure:** detected in 100% of frames; median joint error 0.018-0.027 BH;
  left/right labels 99-100% correct.
- **The production build (`--prod`)** passed the same matrix; the worker is emitted as its
  own chunk.
- **After ROI (same day):** all 20 configurations passed on the dev server and on `--prod`.
  Person-free frames still gave no pose; localisation found nobody and backed off. The cartoon
  figure's median joint error with ROI was 0.019-0.025 BH, against 0.024 with `roi: 'off'`.
  The table above predates ROI; ROI timings are in the ROI section.
- **Fixed on the way:** in a module worker tasks-vision loads its wasm loader with `import()`,
  and a second import of the same URL is served from the module cache without re-running, so
  any second landmarker in the worker failed with "ModuleFactory not set". That broke the ROI
  locator and, silently, the GPU -> CPU retry inside the worker. `mediapipeCore.ts` now gives
  every load after the first a unique query string.
- **Fixed at integration (2026-09-28): concurrent model fetches in production builds.** Pass B's
  extra pose lane starts loading while Pass A runs, at the same moment Pass A's worker creates
  its ROI locator. Both fetch the 9 MB `pose_landmarker_full.task`, and on a static host
  (`vite preview`) Chromium failed one of them with `net::ERR_CACHE_WRITE_FAILURE` ("Failed to
  fetch"). The dev server never showed it. When the locator lost, Pass A ran on full frames for
  the whole clip and found 3 of 16 serves on `sample-checkin` (7 production runs); when the
  extra lane lost, it fell back to the CPU delegate (91 ms a frame). `LandmarkerHandle.create`
  now retries the same delegate after a network failure (`isTransientLoadError`, 0.25 s then
  1 s), and a failed locator is not kept, so the next stream tries again. After the fix:
  16 found, 14 counted, all lanes on the GPU, in 2 of 2 production runs.

## Known limitations

- No real serve footage has been run through MediaPipe. Pose accuracy on real players, and
  the smoothing and outlier parameters, must be validated against ground truth.
- Timings come from a Windows laptop GPU, not an iPhone. WKWebView performance is unknown.
- MediaPipe's own smoothing is only active in VIDEO mode with `numPoses: 1`; the default
  (numPoses 2) showed none. How much it trails at contact is small and noisy in these clips
  (median 0.008 statures) and unmeasured on real motion blur.
- ROI results come from one synthetic player model, one outfit, bright light, no bystanders and
  a static camera; the distance / view matrix is at 30 fps only (the 60-240 fps check is side
  view at 5 m). Unmeasured so far: real footage, other outfits and lighting, people walking
  through the crop, handheld shake, and several serves in one clip. Localising a 12 m player needs level 2 (about 0.6 s once per clip on this GPU;
  the phone is unknown).
- The ROI evaluation clips were rendered from the `tools/synth` code as of 05:10 on
  2026-09-27. The synth motion and skeleton have changed since, so re-rendering gives slightly
  different clips. Re-run the evaluation on `validation/synthetic` when the corpus includes
  7-12 m and rear / front-45 views (at the time of writing it had only side view at 5 m).
- In side and front-45 views MediaPipe often mirrors the arms (43-75% of frames in the
  synthetic clips, with or without ROI). Handedness and per-side metrics from those views
  need a cue other than MediaPipe's labels (the hand holding the racket, the ball toss, or the
  player's entered handedness).
- tasks-vision logs "Using NORM_RECT without IMAGE_DIMENSIONS is only supported for the square
  ROI" on non-square inputs (full portrait frames). Its effect on accuracy is not isolated;
  square crops are the normal case with ROI.
- Persistent left/right mislabelling (for example the whole clip from behind) cannot be
  fixed by continuity. `estimateFacingSide` has a nose-visibility check, but it is
  unvalidated.
- Interpolated hand landmarks within ~50 ms of contact can be off by 5-12% of body height
  at 30-60 fps.
