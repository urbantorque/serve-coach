# Ball layer

Tennis-ball detection and tracking for serve videos: toss and outgoing ball, toss events (release, apex), a gravity check on the time base, EXPERIMENTAL serve speed and bounce placement, and court homography. The code is pure TypeScript over `ImageDataLike`, with no DOM, so it runs in Node tests, a Web Worker or a WKWebView. The public API is in `index.ts`.

**All accuracy figures below come from synthetic ground truth.** No real serve footage was used. Before any number is shown to players as `measured`, it needs validation on real clips.

## Pipeline

```
DecodedFrame ─► BallDetector (per frame, stateful) ─► FrameCandidates[]
                   ▲ expected radius + toss band from ballSetupFromPoses(poses)
FrameCandidates[] ─► trackBall ─► toss track (+ lead-in in the hand), outgoing track
                    └► analyseToss ─► release, apex, heights, gravity time-scale check
                    └► estimateServeSpeedFromTrack / speedFromFlightTime (EXPERIMENTAL)
                    └► detectBounce + mapBounceToCourt (EXPERIMENTAL)
analyseBall(...) wraps the batch part and returns events, a time-base suggestion and MetricValues.
```

| File | What it does |
| --- | --- |
| `colour.ts` | Optic-yellow likelihood in HSV. Wide hue band (48-88°, with soft ramps) for sun, shade, dusk and white-balance casts. Saturation, value and chroma ramps reject grey noise and dark pixels. |
| `detector.ts` | Box-downscales so the expected radius is about 3 cells (`cellsPerRadius`; 2 is about 3× faster but gives more false candidates in clutter). Colour likelihood × motion likelihood, where motion is the difference from an exponential running background with a 0.4 s real-time constant, so a ball hanging at the apex at 240 fps is not absorbed. Moving pixels are colour-unmixed, which rescues translucent blur streaks. Ghosts where the ball has just left are suppressed. Then 8-connected blobs, gated on size (log-normal around the expected radius; `DEFAULT_SIZE_PRIOR` for the toss, `BROAD_SIZE_PRIOR` down to 0.15× for a receding outgoing ball), capsule fill and streak length (≤ 8 diameters). Each candidate reports streak length and direction and a sub-pixel full-resolution centroid. Optional ROI. |
| `components.ts` | Connected components with moment accumulation. Radius comes from the minor axis, streak length from the major-minor difference. |
| `scale.ts` | Stature in frame from nose and heels (or ankles), pixel-per-metre scale from the player's height (entered, or 1.75 m ± 5%), expected ball radius (6.7 cm ball), toss band from pose. |
| `tracker.ts` | Toss: RANSAC over triplets (exact parabola in y, line in x), MSAC support, refined with Tukey IRLS. Contiguity is checked only over frames where the ball should be visible, so a toss whose apex leaves the top of the frame keeps both sides. Stray segments of fewer than 2 detections beyond an out-of-frame gap are dropped. Stationary clutter (same spot in ≥ 60% of frames over ± ¼ of the maximum toss duration) never enters the search. Sequential RANSAC runs up to 3 rounds. Short gaps are filled with `predicted` observations, only where the ball would be in frame. Outgoing: pairs after contact whose line meets the toss path (or a given contact point) within ±max(3 frames, 30 ms) of the given contact time, and that the toss parabola does not explain. The given time may be off by a sound delay or fusion error. **Contact from the ball alone** (`contactFromTracks`): the time where the outgoing path (quadratic from its first 4-5 detections), extended back, meets the toss parabola. Sigma is the back-projected position error over the closing speed, plus 2 ms for the string dwell. The track is extended by predicting from a quadratic through the last 3-4 points (a ball receding from a rear camera loses ~40% of its image speed per frame at 30 fps), or from an alpha-beta velocity for longer gaps. A one-time bounce hypothesis (vertical image velocity reversed) lets the track continue past the bounce. |
| `toss.ts` | Release by a hinge-model grid search: parabola plus (t_r − t)³ and ⁴ departure, trimmed for outliers, rejecting hand accelerations above 8 g. Apex from the parabola with delta-method uncertainty, plus the air-drag asymmetry, plus an acceleration-model term when the apex is extrapolated. An optional gravity prior on the curvature (`gravityAccelerationPrior`, g × pixels per metre ± hypot(scale σ, 4%)) is used only for an unbracketed apex, and only when the data-only gravity check does not contradict it. Gravity time-scale check, always data-only. |
| `speed.ts` | EXPERIMENTAL speed from the outgoing track, and average speed from the contact-to-bounce sound interval. |
| `bounce.ts`, `homography.ts` | EXPERIMENTAL bounce (sign change of the image vertical velocity, sub-frame line intersection), placement from the ball's lowest point, normalised DLT homography with reprojection error, ITF court keypoints, in/out classification. |
| `analyse.ts` | Entry points: `ballSetupFromPoses`, `createBallFrameDetector` (toss band before `tossRoiUntilTReal`; broad size prior from then on), `analyseBall`, `suggestTimeBase` and the MetricValue adapters. |
| `testing/` | Test-only synthetic renderer (4:2:0 chroma, noise, lighting casts, exposure-integrated blur, distractors), physics (gravity + quadratic drag, smooth hand release) and poses. |

## Conventions

- Positions are normalised to [0, 1] of the displayed frame, origin top-left, y down. Radii and distances are in frame-height units; x is multiplied by the aspect ratio wherever distances are formed.
- Times are the frames' `tReal`. When the video layer could not prove the capture rate, call `analyseBall` with `timeBaseKnown: false`. The tracker then allows slow-motion toss durations (up to 8× slower), and `timeBase` says whether to rescale.
- `timeBase.status === 'apply-correction'` means: multiply timestamps by `timeScale` (e.g. via the video layer's `applyTimeScale(meta, captureFps, timeScale, 'physics')`) and re-run. Speed stays unavailable until then.

## Honesty labels produced here

| Output | Label | Why |
| --- | --- | --- |
| `events.tossRelease`, `events.tossApex`, `events.contact` | event estimates with `uncertaintyS` and `confidence` | Fusion input for serve segmentation. Apex is `ball-apex-fit`, or `ball-apex-fit+gravity-prior` when `analyseBall` pinned an extrapolated apex in a known time base. Release is `ball-hinge-fit`, `ball-before-first-detection` or `ball-first-detection`; it marks the start of free flight, and may precede the fingers opening. Contact is `ball-track-intersection`, only when both the toss and the outgoing ball were tracked. |
| `ball.tossApexHeightM`, `ball.tossApexAboveHeadM` | `estimated`, ~95% range | Rests on the player's height (entered or assumed) and the ball staying near the player's plane. The range combines the apex fit, the head or floor landmark, the scale and a 5% depth term. |
| `ball.serveSpeedKmh` | `experimental`, range only | Launch speed from the outgoing track. |
| `ball.serveSpeedAverageAudioKmh` | `experimental`, range only | Average speed over the flight from sound timing and an assumed path length. |
| bounce time and court position | `experimental` | Validated only on simulated rear-view flights. |

No path returns a bare speed. Every speed result has `low`/`high` or is `unavailable` with a `reason` and an `unlockHint`.

## Refusal conditions

### Toss (`trackBall`, `analyseToss`)

| Condition | Result |
| --- | --- |
| Fewer than 3 non-stationary candidates, no RANSAC hypothesis in 3 rounds, fewer than 6 inliers after refinement, or a vertical range under 3 ball radii | `toss: null` |
| Apex far outside the tracked span (and not above the frame), or horizontal speed above vertical speed at the first detection | track `kind: 'unknown'` |
| Fewer than 6 non-predicted detections | `status: 'unavailable'`, "only N ball detections in flight; need 6" |
| No frame period from the timestamps | `unavailable` |
| Robust quadratic not accelerating downward (a ≤ 0) | `unavailable`, "not a downward-accelerating free flight" |
| Hinge search impossible: fewer than 8 points, or fewer than 5 before the latest allowed release, which is min(initial apex − 0.12 s, the time that leaves max(6, 35%) of the points as a free-flight tail) | release `method: 'first-detection'`, sigma = 1 frame, confidence 0.4 |
| No significant departure from free flight (RSS gain < 9σ²) | release `method: 'before-first-detection'` |
| Apex not bracketed by ≥ 2 detections on each side | `bracketed: false`. With an acceleration prior (`analyseBall` with `timeBaseKnown`): curvature pinned by gravity, confidence × 0.75, `gravityPrior: true`. Without one: confidence halved, apex sigma grows by 5% of the extrapolation interval. |

### Gravity time-scale check (`gravityTimeScaleCheck`)

| Condition | Result |
| --- | --- |
| No pixel-to-metre scale | `unavailable` |
| Fitted vertical acceleration not positive (image y down) | `unavailable` |
| Acceleration 1-sigma above 30% | `unavailable`, "need a longer, cleaner toss track" |
| Otherwise | `timeScaleFactor = sqrt(A / (g · unitsPerM))`, 1σ = ½·hypot(accel rel σ, scale rel σ, 4% model), 95% interval, `captureFpsFactor = 1 / factor`. `plausible` if \|ln factor\| ≤ max(2σ, ln 1.12). `nearestStandard` is one of 1, ½, ¼, ⅛, 1⁄16, marked consistent under the same rule. |

### Speed from the outgoing track (`estimateServeSpeedFromTrack`), EXPERIMENTAL

| Condition | Result |
| --- | --- |
| Capture fps below 120 | `unavailable`, unlock: record at 120/240 fps |
| No scale (player not fully visible standing) | `unavailable` |
| Camera view `rear` or `front45` | `unavailable`, unlock: film side-on |
| Fewer than 3 clean detections (source `detected`, score ≥ 0.15) between contact + 4 ms and contact + 50 ms | `unavailable` |
| With ≥ 4 detections, straight-line residual above 4× the assumed localisation σ | `unavailable`, "not on a straight line" |
| Combined 1σ relative error above 30% (±60% at 95%) | `unavailable`, "too uncertain" |
| Via `analyseBall`: time base neither proven nor confirmed by the gravity check | `unavailable` (slow motion suspected) |
| Via `analyseBall`: no outgoing track | `unavailable` |

The range is 2σ of hypot(localisation, scale, time base, perspective). It is then widened for drag between contact and the window midpoint (drag length 36-55 m), and for the cosine band of the assumed out-of-plane angle: 0-25° side view, 0-35° unknown view. The cosine can only raise the true speed. Perspective uses the 1× main camera focal length (0.72 of the long side) unless `focalLengthFhu` is given. It is usually the largest term (10-16% at 25-55 m/s).

### Average speed from sound (`speedFromFlightTime`), EXPERIMENTAL

| Condition | Result |
| --- | --- |
| Contact or bounce onset missing or not finite | `unavailable` |
| Worst-case flight time outside 0.2-2.0 s | `unavailable`, "probably not contact and bounce" |
| Via `analyseBall`: no `contact` onset within 1.0 s after the apex, or no `bounce` onset 0.2-2.0 s after it | `unavailable` |
| Via `analyseBall`: time base unverified | `unavailable` |

Flight time is the heard interval corrected for sound travel. The camera-to-contact distance range is 1-10 m and camera-to-bounce is 10-28 m, at 343 m/s, with ±2√2 onset σ (3 ms). Average speed uses a path length of 14-19 m. The launch speed assumes quadratic drag, v0 = L(e^(D/L) − 1)/T.

### Bounce and court (EXPERIMENTAL)

| Condition | Result |
| --- | --- |
| Fewer than 6 detections on the outgoing track | `unavailable` |
| No split with a clearly falling-then-rising image path (slopes beyond 2σ) whose intersection lies at the split | `unavailable`, "bounce not seen" |
| Ground point on or beyond the calibration horizon | `unavailable` |
| `computeHomography` with fewer than 4 pairs, mismatched lengths, or degenerate geometry (second-smallest eigenvalue ≤ 1e-10 × largest) | `null` |

### Toss heights (`tossHeightMetric`)

`unavailable` without an `ok` toss analysis, or without a scale and head or floor references from pose.

## Measured accuracy (synthetic only)

From the `[ball-accuracy]` lines printed by `npx vitest run src/analysis/ball --silent=false`.

**Detector on rendered 360×640 clips.** Ball radius 6 px, 60 fps, 1/120 s exposure, 4:2:0 chroma and sensor noise; 59 scored frames each.

- **Backgrounds and lighting:** grass + sky in sun and in cool white balance; blue hard court + windscreen in sun, in shade and in warm white balance; clay + dusk sky at dusk. Top-1 recall 1.000 and precision 1.000 in every case. Median localisation error 0.13-0.23 px, p95 0.29-0.49 px.
- **Small ball (3 px radius):** recall 1.000, median error 0.19 px.
- **Apex hover at 240 fps:** recall 1.000.
- **Yellow distractors** (spare ball, banner, dry patches, a moving yellow-green sleeve): top-1 recall 0.949, precision 0.691 (0.42 false candidates per frame); the tracker removes these.
- **Blur streaks of 0-6 diameters:** recall 1.00, centre error ≤ 0.48 px, direction error ≤ 1.1°.
- **Throughput:** 5-15 ms per frame in Node on this PC at 720p-1080p when the ball radius is 7-15 px (grid factor 2-5), about 40% less with the toss ROI. A ball under 6 px radius forces a full-resolution grid: 35-55 ms per frame at 540×960. With `cellsPerRadius: 2` that falls to 14-16 ms, at the cost of more false candidates (0.42 → 0.80 per frame in the distractor scene; about 1.5 → 3.9 per frame with shake plus distractors).
- **Out of sample** (another agent's renderer in `validation/synthetic`, H.264 decoded with ffmpeg, truth landmarks used for the setup): see the report for per-clip numbers. The harness was a scratch script and is not in the repo.

**Tracker.** Candidates with 0.3-radius noise, 10% misses, about 1 false candidate per frame plus a static spare ball. At 30, 60, 120 and 240 fps: 20/20 tosses found, track precision 1.000, free-flight coverage 1.000. The outgoing ball at 240 fps gives an initial image speed error of 3.8%.

**Toss timing.** 30 clips per frame rate, same noise.

| fps | apex RMS error | apex median \|z\| | release RMS (bias) | release within 2σ | gravity factor mean ± sd |
| --- | --- | --- | --- | --- | --- |
| 30 | 1.22 ms | 0.51 | 18.8 ms (−8.2) | 29/30 | 1.0033 ± 0.0042 |
| 60 | 1.00 ms | 0.59 | 15.5 ms (−10.7) | 29/30 | 1.0029 ± 0.0041 |
| 120 | 0.95 ms | 0.53 | 12.9 ms (−9.9) | 30/30 | 1.0024 ± 0.0025 |
| 240 | 0.71 ms | 0.76 | 13.6 ms (−11.7) | 29/30 | 1.0029 ± 0.0021 |

- **Apex above the frame** (stature at 60% of frame height; 18 of 20 apexes out of frame): all 20 tosses found at every frame rate. Two-sided apex RMS error is 1.55, 1.11, 1.10 and 0.65 ms at 30, 60, 120 and 240 fps. One-sided tosses (6-8 of 20), where the ball never returns into view before contact, have an apex RMS error of 116, 100, 31.6 and 29.4 ms data-only, falling to 64.0, 8.9, 12.3 and 17.0 ms with the gravity prior. Max |z| is 2.9 either way.
- **Rendered end to end** (render → detect → track → analyse): at 60 fps (4 clips) apex errors are 0.1-0.2 ms and release errors −7 to −9 ms. 240 fps (2 clips) gives the same, and the gravity factor is 1.002. With yellow distractors plus 2 px camera shake (3 clips, about 1.5 candidates per frame), apex errors are 0.04-0.26 ms.

**Gravity time-scale check.**

- **Real-time footage** (60 fps, 20 clips): factor mean 1.0042, max error 0.0091, all flagged plausible.
- **240 fps timestamped as 30 fps** (10 clips): factor mean 0.1255 (truth 0.125), max relative error 0.9%, nearest standard ratio 1/8 every time.
- **Assumed height** (1.75 m vs a true 1.95 m, one clip): the factor falls between 0.90 and 0.99 (the test bound; the scale error alone predicts about 0.95), is still flagged plausible, and has an interval wider than 0.08.

**Speed from the track** (8 clips per cell: 120/240 fps × 25/40/55 m/s × 0/10/20° out of plane, side view): truth inside the range in every clip that was not refused (2 refusals at 120 fps, 55 m/s, 20°). Centre error −3.3% to +5.9%; range width high/low 1.74-2.20.

**Speed from sound** (simulated 25/40/55 m/s serves with drag): the flight time, average-speed and launch-speed ranges all contain the truth. Average-speed range widths are 16.8-25.8, 25.8-42.4 and 34.0-60.2 m/s.

**Bounce, rear view** (25 serves per frame rate; observations with localisation noise only, no misses or clutter): all found. Median time error 1.3, 0.9 and 0.7 ms at 60, 120 and 240 fps. Median landing error 13, 9 and 11 cm (p90 27, 20 and 22 cm), using a 6-tap homography with 1 px tap noise.

**Bounce from raw candidates** (`trackBall` → `detectBounce`; 15 serves per frame rate, noise, 5% misses, 0.5 false candidates per frame): found 13, 14 and 15 of 15 at 30, 60 and 120 fps. Median time error 5.2, 3.2 and 1.1 ms; median detections after the bounce 7, 15 and 28.

**Homography.** A noiseless round trip gives 7e-14 m maximum error. Six taps with 0.5 px noise give a far-box point error of median 4.8 cm, p95 16 cm.

## Known limitations

- Synthetic validation only. The colour model, detector thresholds and hand-release model were all tuned or checked against the renderer and physics in `testing/`.
- Release timing is biased early by about 8-12 ms on the synthetic hand model. The reported sigma covers it, but real hands will differ.
- A one-sided toss (apex and the whole descent out of frame) is extrapolated. Without a known time base its sigma can reach hundreds of ms at 30 fps, reported with low confidence. With the gravity prior the error is about 10-20 ms at 60-240 fps but still 64 ms RMS at 30 fps, where only a few free-flight frames are seen before the ball leaves the frame.
- Camera shake is tested only as integer-pixel translation. Rotation, rolling-shutter wobble and zoom changes are untested.
- Track speed ranges are wide (about ×1.7-2.2) because perspective and out-of-plane angle cannot be observed from one side view. Lens focal length metadata (`focalLengthFhu`) and a camera placed square to the serve direction are the levers to narrow them.
- `ballSetupFromPoses` uses its own nose-to-heel stature. A stature from the pose layer can be passed in as `bodyHeightNorm`.
