# Ball layer

Tennis-ball detection and tracking for serve videos. It covers:
- the toss and the outgoing ball;
- toss events (release, apex) and a gravity check on the time base;
- EXPERIMENTAL serve speed ranges, under the revised D4 (2026-09-27);
- EXPERIMENTAL rear-view bounce, placement and court homography.

The code is pure TypeScript over `ImageDataLike`, with no DOM, so it runs in Node tests, a Web Worker or a WKWebView. The public API is in `index.ts`.

**Every accuracy figure below comes from synthetic ground truth.** No real serve footage was used. Before any number is shown to players as `measured`, it needs validation on real clips.

## Pipeline

```
DecodedFrame ─► createBallFrameDetector (per frame, stateful) ─► FrameCandidates[]
                   ▲ expected radius + toss band from ballSetupFromPoses(poses, player height)
                   ▲ toss band until the contact time (strongestTransient(onsets) − sound delay)
FrameCandidates[] ─► analyseBall
                    ├► trackBall ─► toss track (+ lead-in in the hand), outgoing track
                    ├► analyseToss ─► release, apex, heights, gravity time-scale check
                    ├► side view: estimateServeSpeedFromTrack (EXPERIMENTAL, needs a target tag)
                    └► rear view: detectBounce + mapBounceToCourt ─► speedFromFlightTime (EXPERIMENTAL)
analyseBall returns events, a time-base suggestion, the bounce and placement, and MetricValues
with canonical ids.
```

| File | What it does |
| --- | --- |
| `colour.ts` | Optic-yellow likelihood in HSV. A wide hue band (48-88°, with soft ramps) covers sun, shade, dusk and white-balance casts. Saturation, value and chroma ramps reject grey noise and dark pixels. |
| `detector.ts` | Box-downscales so the expected radius is about 3 cells. Likelihood is colour × motion. Motion is the difference from an exponential running background with a 0.4 s real-time constant, so a ball hanging at the apex at 240 fps is not absorbed. The background is first scaled by the frame's **illumination gain** (`illuminationGain`, the median brightness ratio), which cancels 100 Hz floodlight flicker at 120-240 fps. Moving pixels are colour-unmixed, which rescues translucent blur streaks, and ghosts where the ball has just left are suppressed. 8-connected blobs are then gated on size (log-normal around the expected radius), capsule fill and streak length (≤ 8 diameters). The best blobs get a full-resolution pass: a sub-pixel centroid, and support ratios, the share of the blob's footprint that is ball-coloured at full resolution, plain and un-mixed. An optional plain-support gate (see "False candidates") and an optional ROI. |
| `components.ts` | Connected components with moment accumulation. Radius comes from the minor axis, streak length from the major-minor difference. |
| `scale.ts` | Stature in frame from nose and heels (or ankles). Pixel-per-metre scale comes from the player's height (entered, or 1.75 m ± 5%). Also the expected ball radius (6.7 cm ball) and the toss band from pose. |
| `tracker.ts` | Toss: RANSAC over candidate triplets (an exact parabola in y, a line in x), MSAC support, then Tukey IRLS. Up to 6 sequential rounds. A refined arc is accepted only if it is physically a toss: it climbs at least 6 ball radii (about 0.2 m) to its apex, and, when the scale is known, it accelerates at 0.6-1.5 g at a plausible time scale (`gravityBands`). This rejects the ball lowered in the hand at the start of the motion, which fits a falling half-parabola at about 0.55 g. Stationary clutter is excluded, and only frames where the ball should be visible count for contiguity (an apex above the frame keeps both sides). Short gaps get `predicted` observations. Outgoing: lines after contact that meet the toss path within the contact slack, extended with a quadratic or alpha-beta predictor and one bounce hypothesis. In the side view the seed line must also be fast and level (`sideViewOutgoingLimits`: at least 17 m/s in the image plane at the player's scale, and within 30° of horizontal), which rejects colour seams on the swinging arm near the contact point. **Contact from the ball alone** (`contactFromTracks`) is where the outgoing path, extended back, meets the toss parabola. |
| `toss.ts` | Release by a hinge-model grid search (parabola plus a (t_r − t)³, ⁴ departure). Apex from the free-flight parabola with sub-frame time and delta-method uncertainty, plus drag asymmetry and extrapolation terms. Optional gravity prior for an unbracketed apex in a known time base. Gravity time-scale check (always data-only) and data-quality confidence. |
| `speed.ts` | EXPERIMENTAL speed, rounded ranges only. Side view: launch speed from the first 50 ms of the outgoing track, bounded by the target tag. Rear view: average speed from contact to a bounce located in video. |
| `bounce.ts`, `homography.ts` | EXPERIMENTAL bounce (sign change of the vertical image velocity, sub-frame line intersection), placement from the ball's lowest point (refused when it maps off the court), normalised DLT homography with reprojection error, ITF court keypoints, in/out classification. |
| `analyse.ts` | Entry points: `ballSetupFromPoses`, `createBallFrameDetector` (toss band and toss-phase gate until the contact time minus 20 ms; the broad size prior after contact outside the side view), `analyseBall`, `suggestTimeBase`, `gravityBands`, `sideViewOutgoingLimits`, `apexPerspectiveSigmaS`, `strongestTransient`, `soundDelayEstimateS` and the MetricValue adapters. |
| `eval/` | Evaluation on the rendered corpus in `validation/synthetic` (see "Evaluation on rendered clips"). |
| `testing/` | Test-only synthetic renderer, physics (gravity plus quadratic drag, smooth hand release) and poses. |

## Conventions

- Positions are normalised to [0, 1] of the displayed frame, origin top-left, y down. Radii and distances are in frame-height units; x is multiplied by the aspect ratio wherever distances are formed.
- Times are the frames' `tReal`. When the video layer could not prove the capture rate, call `analyseBall` with `timeBaseKnown: false`. The tracker then allows slow-motion toss durations (up to 8× slower), and `timeBase` says whether to rescale.
- `timeBase.status === 'apply-correction'` means: multiply timestamps by `timeScale` (e.g. with the video layer's `applyTimeScale(meta, captureFps, timeScale, 'physics')`) and re-run. Speed stays unavailable until then.
- Court frame (homography, bounce, rear speed): metres, x across the court (+ to the server's right), y along the court from the server's baseline.
- Audio is used only to time contact (D4). `analyseBall` takes the strongest transient 0.05-1.0 s after the apex that is not labelled a bounce, because the video layer's contact/bounce label is an unvalidated heuristic. On the rendered corpus it labelled the racket pop `unknown` and a footstep `contact`.

## Metrics produced here (canonical ids)

| id | Label | Notes |
| --- | --- | --- |
| `toss-apex-height` | `estimated`, ~95% range | Apex above the court. It rests on the player's height (entered or assumed) and on the ball staying near the player's plane: a toss nearer the camera reads high (D1 bias). The range combines the apex fit, the floor landmark, the scale and a 5% depth term. The basis says when the apex was above the frame and extrapolated. |
| `speed-experimental` | `experimental`, range only | Side view, launch (peak) speed just after contact. `value` is the display string, e.g. `"115–180"`; `uncertainty` holds the numbers, rounded outward to 5 km/h. There is no centre value. |
| `speed-average-rear` | `experimental`, range only | Rear view, average speed from contact to the bounce located in video. Same range-only format. |
| `spin` | always `unavailable` | One-line reason (D4). |

Events: `tossRelease` (`ball-hinge-fit`, `ball-before-first-detection` or `ball-first-detection`), `tossApex` (`ball-apex-fit`, or `ball-apex-fit+gravity-prior`) and `contact` (`ball-track-intersection`, only when both the toss and the outgoing ball were tracked). Each has `uncertaintyS` and `confidence`. In a rear or front view, the apex uncertainty also carries a perspective term (`apexPerspectiveSigmaS`): the toss moves along the camera axis there, which shifts the image apex by up to tens of ms.

This layer never emits `trunk-tilt-band`, `knee-bend-band` or any other body metric. Toss forward and drop, contact height and the rest are computed downstream from these events and tracks.

## Refusal conditions

Every refusal is `unavailable` with a `reason` and an `unlockHint`. No path returns a bare speed.

### Toss (`trackBall`, `analyseToss`)

| Condition | Result |
| --- | --- |
| Fewer than 3 non-stationary candidates, no RANSAC hypothesis in 6 rounds, fewer than 6 inliers after refinement, or a vertical range under 3 ball radii | `toss: null` |
| Arc rises less than 6 ball radii to its apex, or (scale known) its acceleration is outside 0.6-1.5 g at every allowed time scale (1 when the time base is known; 1, ½, ¼, ⅛ otherwise) | hypothesis rejected; the next round searches without its support |
| Apex far outside the tracked span (and not above the frame), or horizontal speed above vertical speed at the first detection | track `kind: 'unknown'` |
| Fewer than 6 non-predicted detections | `unavailable`, "only N ball detections in flight; need 6" |
| No frame period from the timestamps | `unavailable` |
| Robust quadratic not accelerating downward (a ≤ 0) | `unavailable`, "not a downward-accelerating free flight" |
| Hinge search impossible (fewer than 8 points, or fewer than 5 before the latest allowed release) | release `ball-first-detection`, sigma = 1 frame, confidence 0.4 |
| No significant departure from free flight (RSS gain < 9σ²) | release `ball-before-first-detection` |
| Apex not bracketed by ≥ 2 detections on each side | `bracketed: false`. In a known time base the curvature is pinned by gravity (confidence × 0.75). Otherwise confidence is halved and the apex sigma grows by 5% of the extrapolation interval. |

### Gravity time-scale check (`gravityTimeScaleCheck`)

| Condition | Result |
| --- | --- |
| No pixel-to-metre scale | `unavailable` |
| Fitted vertical acceleration not positive (image y down) | `unavailable` |
| Acceleration 1σ above 30% | `unavailable`, "need a longer, cleaner toss track" |
| Otherwise | `timeScaleFactor = sqrt(A / (g · unitsPerM))`, with 1σ = ½·hypot(accel rel σ, scale rel σ, 4% model) and a 95% interval. `plausible` if \|ln factor\| ≤ max(2σ, ln 1.12). `nearestStandard` is one of 1, ½, ¼, ⅛ or 1⁄16. `suggestTimeBase` maps this to `consistent`, `apply-correction` or `inconclusive`. |

### Side-view speed (`estimateServeSpeedFromTrack` → `speed-experimental`), EXPERIMENTAL

A range is returned only when **all** of these hold (D4, revised). The checks run in this order:

| Condition | Refusal |
| --- | --- |
| Camera view is not `'side'` (`rear` and `front45` give their own reason; `unknown` or none says "not confirmed as side-on") | `unavailable`, unlock: film side-on from the baseline extension |
| Capture frame rate below 120 fps | `unavailable`, unlock: record at 120/240 fps |
| No height scale (player not fully visible standing) | `unavailable` |
| No target tag (T / body / wide) | `unavailable`, "no target tag: without it the angle between the serve and the image plane is unbounded" |
| Fewer than 3 clean detections (source `detected`, score ≥ 0.15) between contact + 4 ms and contact + 50 ms | `unavailable` |
| With ≥ 4 detections, straight-line residual above 4× the assumed localisation σ | `unavailable`, "not on a straight line" |
| Combined 1σ relative error above 30% | `unavailable`, "too uncertain" |
| Via `analyseBall`: time base neither proven nor confirmed by the gravity check | `unavailable` (slow motion suspected) |
| Via `analyseBall`: no outgoing track (fewer than 2 post-contact detections on a line through the contact point that is at least 17 m/s in-plane and within 30° of horizontal) | `unavailable`, "the ball was not tracked after contact" |

**Target tag → out-of-plane angle band** (`TARGET_TAG_OUT_OF_PLANE_DEG`): T 0-13°, body 2-19°, wide 6-24°. The side camera looks along the baseline, so the angle is the serve's sideways direction. The bounds come from our own geometry:
- contact 0.3-1.0 m from the centre mark on the serving side, 0-0.6 m inside the baseline;
- landing in the tagged third of the diagonal box, widened by 0.3 m either side, 14-18.6 m from the baseline;
- camera aim within ±2°.

Geometry alone gives T 0-11.2°, body 4.2-16.7° and wide 8.4-21.9°. This is wider than the gap study's "about ±4°" (side-view-geometry-contradictions §7.1), which assumed a fixed contact point and the zone centre.

**Range.** The 2σ band of hypot(localisation, scale, time base, perspective) is widened for drag between contact and the window midpoint (drag length 36-55 m) and for the tag's cosine band; the cosine can only raise the true speed. It is then rounded outward to 5 km/h. Perspective uses the 1× main camera focal length (0.72 of the long side) unless `focalLengthFhu` is given.

### Rear-view average speed (`speedFromFlightTime` → `speed-average-rear`), EXPERIMENTAL

| Condition | Refusal |
| --- | --- |
| Camera view `'side'` | `unavailable`, "bounce not in view: from the side the bounce is outside the frame and its distance is unknown (about ±20% error), so flight time is never used" |
| Any other view but `'rear'` | `unavailable` |
| No bounce located in the video (a bounce sound alone is refused) | `unavailable`, "bounce not located in the video" |
| Contact or bounce time not finite | `unavailable` |
| Flight time ± 2σ outside 0.25-1.5 s | `unavailable` |
| Located bounce not 12-30 m from the server's baseline | `unavailable` |
| Range half-width above 25% | `unavailable`, "too uncertain" |
| Via `analyseBall`: time base unverified, no contact time, no outgoing track, no bounce seen, or no court calibration | `unavailable` |

- **Flight time:** bounce time minus contact time, ± 2σ of both.
- **Path:** from a contact region to the located bounce, ± 2σ of its court position, times an arc factor of 1.005-1.02. The contact region is 0.1-1.3 m from the centre mark on the served side, 0.3 m behind to 0.8 m inside the baseline, and 2.2-3.0 m high.
- **Result:** average speed, rounded outward to 5 km/h.
- **No side-view audio path.** The old sound-only flight-time path (contact pop to bounce sound, assumed 14-19 m path) has been removed.

### Bounce and court (EXPERIMENTAL, rear view only via `analyseBall`)

| Condition | Result |
| --- | --- |
| Camera view is not rear | `bounce` and `placement` `unavailable` |
| Fewer than 6 detections on the outgoing track | `unavailable` |
| No split with a clearly falling-then-rising image path (slopes beyond 2σ) whose intersection lies at the split | `unavailable`, "bounce not seen" |
| Ground point on or beyond the calibration horizon | `unavailable` |
| Ground point off the court (more than 2 m behind the baseline, 6 m past the far baseline, or 4 m outside the doubles lines) | `unavailable`, "bounce maps off the court" |
| `computeHomography` with fewer than 4 pairs, mismatched lengths, or degenerate geometry | `null` |

### Toss height (`tossHeightMetric` → `toss-apex-height`)

`unavailable` without an `ok` toss analysis, or without a scale and a floor reference from pose.

## False candidates: colour seams and flicker

Three effects produced most false candidates on the rendered corpus.

**Colour seams on the player.** Two mechanisms produce ball-coloured blobs on the player:
- **Box-averaging.** Tan skin averaged over green foliage or a green windscreen comes out yellow-green, and so does H.264 4:2:0 chroma at such an edge.
- **Un-mixing.** Skin moving over a red shirt looks exactly like a translucent yellow-green ball over red, because red and yellow-green blend to skin tone. This is a genuine per-pixel ambiguity with a blurred ball.

At full resolution these blobs contain almost no *plain* ball-coloured pixels. Plain support (the share of the footprint that is ball-coloured without un-mixing) had a median of 0.00 for false candidates, against at least 0.36 (5th percentile per clip) for the toss ball on all 20 clips.
- **Toss phase:** `createBallFrameDetector` applies `TOSS_PLAIN_SUPPORT_GATE` (ramp 0.05-0.2) inside the toss band.
- **After contact:** there is no gate. The outgoing ball can be translucent: plain support was 0.03-0.10 for some genuine outgoing detections, and 0.03-0.05 for the receding rear-view ball.
- The un-mixed support ratio did not separate the two (median about 0.5 for both), so it is diagnostic only.

**The broad size prior in the side view.** After contact the broad prior (down to 0.15× the expected radius) is for a ball receding from a rear camera. In the side view it only admitted one-cell seams from the swinging arm: 1.44 → 0.52 false candidates per frame on baseline-s1 once the side view kept the toss prior.

**Floodlight flicker.** On 50 Hz mains, floodlights flicker at 100 Hz. At 240 fps the frame brightness swings by up to ±30%, so every lit yellow-green surface reads as moving. Before compensation, night240 gave 3.3-3.6 false candidates per frame (12% precision). `illuminationGain` scales the background by the median brightness ratio before differencing. On the test renderer this took the rate from 3.65 to 0.41 per frame, with recall unchanged. On the rendered night240 clips it fell from 3.3-3.6 to 0.48-0.58, level with the daylight clips. Flicker from several lamps on different phases would need a spatially varying gain; that is untested.

## Evaluation on rendered clips (`eval/`)

```
npx tsx src/analysis/ball/eval/run-ball-eval.mjs [--clips baseline-s1,dusk-s2] [--out results.json] [--features]
```

The default set has 20 clips:
- baseline s1-s2;
- fps30 s1-s2, fps120 s1-s2 and fps240 s1;
- slomo s1-s2 (240 fps re-timed to 30 fps);
- dusk s1-s2 and night240 s1-s2 (100 Hz flicker);
- crf36 s1-s2, dist12 s1-s2 and apexout s1-s2 (apex above a landscape frame);
- rear s1.

It runs in about 10 minutes. `--features` keeps per-candidate support ratios in the JSON, for threshold studies.

`run-ball-eval.mjs` decodes each clip with `ffmpeg-static` into raw RGBA frames and mono 48 kHz audio, then runs `evalCore.ts`. That is the app pipeline: setup from pose, audio contact onset, `createBallFrameDetector` with the toss band, then `analyseBall`. Its output is scored against `truth.json`.

Inputs taken from truth rather than the app's own layers:
- the poses (truth landmarks);
- the player's height and target tag (they stand in for player entries);
- for the rear clip, the four-corner tap of the far service boxes (projected court corners with 1.5 px noise).

Slow-motion clips run with `timeBaseKnown: false` (the container says 30 fps). The suggested correction is then applied and the analysis re-run, with the candidates re-timed rather than re-detected.

Scoring:
- A candidate is on the ball if it is within max(2r, 4 px) + ½ streak length of the truth centre.
- Recall counts frames where the ball is in free flight, at least one radius inside the frame and not occluded.
- Precision counts candidates on any truth ball (a ball in the hand counts) over all candidates in all frames, including frames after the ball has left.
- Apex, release and contact errors are analysis minus truth, in real milliseconds.

**Final run: 20 clips, 2026-09-27.** The ball layer as it stands in this folder, 1080×1920 or 1920×1080 frames at full resolution, Node 24 on this PC. The rear-s1 row was re-run after the rear-view guards were added; the side-view code paths did not change, and baseline-s1 was re-checked identical.

Per scenario (recall pooled over frames; other columns are per-clip means):

| scenario | clips | toss recall | flight recall (frames) | precision: candidates / top-1 | loc. error median (px) | apex abs. error mean / max (ms) | release error mean (ms) | contact abs. error (ms) | gravity factor (expected) | apex height error mean (cm) | speed ranges covering truth |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | 2 | 100% | 100% (3) | 54% / 63% | 0.24 | 0.25 / 0.26 | -20.9 | – | 1.001, 0.995 (1.000) | 6.7 | refused |
| fps30 | 2 | 98% | 100% (2) | 56% / 62% | 0.25 | 0.24 / 0.27 | 32.9 | – | 1.001, 0.993 (1.000) | 6.7 | refused |
| fps120 | 2 | 100% | 100% (7) | 54% / 63% | 0.28 | 0.26 / 0.30 | -19.4 | 0.42, 0.06 | 1.001, 0.995 (1.000) | 6.7 | 2/2 |
| fps240 | 1 | 100% | 100% (7) | 58% / 64% | 0.23 | 0.23 / 0.23 | -13.8 | 0.13 | 1.001 (1.000) | 7.9 | 1/1 |
| slomo | 2 | 100% | 80% (15) | 64% / 76% | 0.27 | 0.24 / 0.25 | -19.8 | 0.13, 0.04 | 0.125, 0.124 (0.125) | 6.7 | 2/2 |
| dusk | 2 | 100% | 67% (3) | 54% / 78% | 0.49 | 0.20 / 0.21 | -20.5 | – | 1.001, 0.995 (1.000) | 6.7 | refused |
| night240 | 2 | 97% | 100% (15) | 47% / 65% | 0.14 | 0.26 / 0.26 | -19.0 | 0.04, 0.32 | 1.001, 0.995 (1.000) | 6.6 | 2/2 |
| crf36 | 2 | 100% | 100% (3) | 37% / 59% | 0.52 | 0.45 / 0.50 | -22.6 | – | 1.001, 0.996 (1.000) | 6.8 | refused |
| dist12 | 2 | 100% | 100% (12) | 43% / 62% | 0.34 | 0.22 / 0.34 | -13.4 | 0.11, 0.33 | 1.016, 1.011 (1.000) | 10.5 | refused |
| apexout | 2 | 98% | 100% (7) | 48% / 55% | 0.30 | 0.18 / 0.29 | -18.0 | 0.52, 0.04 | 1.011, 1.001 (1.000) | 9.1 | refused |
| rear | 1 | 100% | 91% (35) | 41% / 69% | 0.24 | 4.16 / 4.16 | 1.6 | 0.11 | 0.924 (1.000) | -24.3 | refused |

Per clip:

| clip | fps | toss recall (top-1) | flight recall (frames) | precision: candidates / top-1 | false / frame | loc. error median / p95 (px) | toss track precision / coverage | outgoing track (detections, on ball) | apex error ms (z) | release error (ms) | contact error (ms) | gravity factor (expected) | apex height error (cm) | speed (km/h) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline-s1 | 60 | 100% (100%) | 100% (1) | 58% / 64% | 0.38 | 0.21 / 0.91 | 100% / 100% | 2 det, 100% on ball | 0.26 (0.3) | -14.2 | – | 1.001 (1.000) | 7.9 | unavailable |
| baseline-s2 | 60 | 100% (100%) | 100% (2) | 51% / 61% | 0.48 | 0.27 / 1.03 | 100% / 100% | 2 det, 100% on ball | 0.24 (0.3) | -27.6 | – | 0.995 (1.000) | 5.6 | unavailable |
| fps30-s1 | 30 | 100% (100%) | 100% (1) | 56% / 63% | 0.40 | 0.22 / 0.81 | 100% / 100% | none | 0.27 (0.2) | -22.6 | – | 1.001 (1.000) | 7.9 | unavailable |
| fps30-s2 | 30 | 96% (96%) | 100% (1) | 56% / 62% | 0.39 | 0.27 / 0.80 | 100% / 96% | none | 0.21 (0.1) | 88.3 | – | 0.993 (1.000) | 5.4 | unavailable |
| fps120-s1 | 120 | 100% (100%) | 100% (3) | 57% / 64% | 0.40 | 0.26 / 0.78 | 100% / 100% | 4 det, 100% on ball | 0.23 (0.3) | -12.6 | 0.42 | 1.001 (1.000) | 7.9 | 110–175 (truth 140) |
| fps120-s2 | 120 | 100% (100%) | 100% (4) | 52% / 62% | 0.47 | 0.30 / 1.01 | 100% / 100% | 5 det, 100% on ball | 0.30 (0.4) | -26.3 | 0.06 | 0.995 (1.000) | 5.6 | 95–200 (truth 149) |
| fps240-s1 | 240 | 100% (100%) | 100% (7) | 58% / 64% | 0.37 | 0.23 / 0.97 | 100% / 100% | 8 det, 100% on ball | 0.23 (0.3) | -13.8 | 0.13 | 1.001 (1.000) | 7.9 | 110–175 (truth 140) |
| slomo-s1 | 240 as 30 | 100% (100%) | 71% (7) | 68% / 77% | 0.18 | 0.22 / 0.81 | 100% / 100% | 6 det, 100% on ball | 0.22 (0.3) | -13.6 | 0.13 | 0.125 (0.125) | 7.9 | 110–175 (truth 140) |
| slomo-s2 | 240 as 30 | 100% (100%) | 88% (8) | 61% / 75% | 0.25 | 0.32 / 0.96 | 100% / 100% | 8 det, 100% on ball | 0.25 (0.4) | -26.1 | 0.04 | 0.124 (0.125) | 5.6 | 95–200 (truth 149) |
| dusk-s1 | 60 | 100% (100%) | 100% (1) | 59% / 86% | 0.35 | 0.54 / 1.30 | 100% / 98% | 2 det, 100% on ball | 0.21 (0.3) | -14.2 | – | 1.001 (1.000) | 7.9 | unavailable |
| dusk-s2 | 60 | 100% (100%) | 50% (2) | 49% / 70% | 0.53 | 0.44 / 1.54 | 100% / 100% | 2 det, 50% on ball | 0.18 (0.2) | -26.7 | – | 0.995 (1.000) | 5.5 | unavailable |
| night240-s1 | 240 | 99% (99%) | 100% (7) | 50% / 67% | 0.48 | 0.12 / 1.12 | 100% / 98% | 8 det, 100% on ball | 0.25 (0.3) | -14.6 | 0.04 | 1.001 (1.000) | 7.8 | 110–175 (truth 140) |
| night240-s2 | 240 | 96% (96%) | 100% (8) | 44% / 64% | 0.58 | 0.16 / 1.04 | 100% / 96% | 8 det, 100% on ball | 0.26 (0.4) | -23.4 | -0.32 | 0.995 (1.000) | 5.5 | 95–195 (truth 149) |
| crf36-s1 | 60 | 100% (100%) | 100% (1) | 41% / 62% | 0.75 | 0.43 / 1.37 | 100% / 100% | 2 det, 100% on ball | 0.40 (0.5) | -13.4 | – | 1.001 (1.000) | 8.0 | unavailable |
| crf36-s2 | 60 | 100% (100%) | 100% (2) | 34% / 57% | 0.98 | 0.60 / 1.96 | 100% / 100% | 2 det, 100% on ball | 0.50 (0.6) | -31.7 | – | 0.996 (1.000) | 5.6 | unavailable |
| dist12-s1 | 60 | 100% (100%) | 100% (6) | 44% / 65% | 0.66 | 0.36 / 0.67 | 100% / 100% | 6 det, 100% on ball | 0.10 (0.1) | -5.9 | 0.11 | 1.016 (1.000) | 11.4 | unavailable |
| dist12-s2 | 60 | 100% (100%) | 100% (6) | 41% / 59% | 0.76 | 0.33 / 0.66 | 100% / 100% | 6 det, 100% on ball | 0.34 (0.4) | -20.9 | 0.33 | 1.011 (1.000) | 9.6 | unavailable |
| apexout-s1 | 60 | 100% (100%) | 100% (3) | 47% / 55% | 0.43 | 0.29 / 0.79 | 100% / 100% | 3 det, 100% on ball | -0.29 (-0.3) | -16.7 | -0.52 | 1.011 (1.000) | 10.9 | unavailable |
| apexout-s2 | 60 | 96% (96%) | 100% (4) | 48% / 55% | 0.43 | 0.32 / 1.60 | 100% / 96% | 4 det, 100% on ball | -0.07 (-0.1) | -19.2 | -0.04 | 1.001 (1.000) | 7.3 | unavailable |
| rear-s1 | 60 | 100% (100%) | 91% (35) | 41% / 69% | 0.91 | 0.24 / 0.65 | 100% / 100% | 30 det, 60% on ball | -4.16 (-0.2) | 1.6 | 0.11 | 0.924 (1.000) | -24.3 | rear average: unavailable |

What the numbers say (all synthetic):
- **Detection.** Toss recall is 96-100% on every clip, including dusk (1/60 s shutter), night 240 fps under 100 Hz flicker, CRF 36 and 12 m (4 px ball radius). Median localisation error is 0.12-0.60 px (p95 ≤ 2 px); the worst cases are CRF 36 and dusk. The misses are single frames as the ball leaves the hand.
- **Precision.** Candidate-level precision is 34-68% (0.2-1.0 false candidates per frame), and the top candidate is the ball in 55-86% of frames with any candidate. The false candidates are colour seams on the player after contact, which is by design (see above). Toss track precision is 100% on every clip. Outgoing tracks are 100% on the ball in the side view, except dusk-s2, where one of 2 detections was a seam at 60 fps.
- **Toss timing.** Apex error is ≤ 0.50 ms on every side-view clip, including apexout, where 38 frames around the apex are out of frame. Release is early by 6-32 ms (mean about −19 ms). The exception is fps30-s2 at +88 ms, where the first free-flight frame was missed; that error is 1.7σ of its reported 53 ms. Contact from the ball tracks agrees with the truth to within 0.52 ms wherever the outgoing ball gave 3 or more detections (120/240 fps, 12 m, apexout).
- **Gravity time-scale check.** 0.993-1.016 on real-time clips, all flagged `consistent`. On 240 fps re-timed to 30 fps it gave 0.125 and 0.124, with `apply-correction` to ⅛ both times. After the correction, apex errors were 0.22 and 0.25 ms.
- **Toss height** (`estimated`). The truth is inside the reported range on all 20 clips. Side-view values read 5-11 cm high: D1's known bias for a toss nearer the camera than the body (on these clips it is 0.09-0.15 m nearer). The 12 m and landscape (apexout) clips read highest.
- **Speed** (`experimental`, target tag from truth). 7 of 7 ranges at 120/240 fps (including slow motion after correction, and night under flicker) contain the truth. They are 110–175 km/h for a 140 km/h T serve and 95–200 km/h for a 149 km/h wide serve. At 30/60 fps speed is refused (below 120 fps).
- **Rear view (one clip).**
  - The toss is tracked and its apex error is −4.2 ms, inside the perspective term (z −0.2).
  - The camera is 1.5 m high, and the net hides the ball around the bounce.
  - The outgoing track, extended through the occlusion, picked up clutter (60% on the ball). `detectBounce` then reported a false bounce 205 ms early, which maps 118 m down the court.
  - The off-court guard now refuses that placement, so `speed-average-rear` is `unavailable`. **The rear bounce and average-speed path is therefore not validated on rendered video**, only on the unit-test flights.
- **Throughput** (detector only, 1080×1920): 21-35 ms per frame when the ball radius is about 10 px. At 12 m the 4 px ball forces a full-resolution grid, and it takes 190-220 ms per frame.

## Measured accuracy from the unit tests (synthetic only)

These come from the `[ball-accuracy]` lines printed by `npx vitest run src/analysis/ball --silent=false`.

**Detector on the test renderer (360×640).** Ball radius 6 px, 60 fps, 1/120 s exposure, 4:2:0 chroma and sensor noise.
- Across the backgrounds and lighting, top-1 recall and precision are both 1.000. Median localisation error is 0.13-0.23 px.
- Yellow distractors (spare ball, banner, dry patches, a moving yellow-green sleeve): top-1 recall 0.949, precision 0.691.
- Blur streaks of 0-6 diameters: recall 1.00, centre error ≤ 0.48 px.
- 100 Hz flicker (±30%) at 240 fps, fence and grass with static yellow distractors: recall 1.000 either way; false candidates per frame 3.65 without gain compensation and 0.41 with it.

**Tracker.** Candidates with 0.3-radius noise, 10% misses and about 1 false candidate per frame. At 30-240 fps, 20/20 tosses were found with track precision 1.000.
- **Hand-lowering decoy** (5 seeds, with and without gravity bands): the ball is held, lowered at 0.45 g for 36 frames, then tossed so high that only 24 frames are in view. The toss is found every time, and no track point comes from the lowering phase. Before the rise check and gravity bands, the rendered apexout clips locked onto exactly this decoy: apex error −1.7 s and gravity factor 0.73.

**Toss timing.** 30 clips per frame rate:

| fps | apex RMS | release RMS (bias) |
| --- | --- | --- |
| 30 | 1.22 ms | 18.8 ms (−8.2) |
| 60 | 1.00 ms | 15.5 ms (−10.7) |
| 120 | 0.95 ms | 12.9 ms (−9.9) |
| 240 | 0.71 ms | 13.6 ms (−11.7) |

With the apex above the frame and a one-sided toss, the apex error with the gravity prior is 9-17 ms RMS at 60-240 fps and 64 ms at 30 fps.

**Gravity time-scale check.**
- Real-time footage: factor mean 1.0042, maximum error 0.0091.
- 240 fps timestamped as 30 fps: mean 0.1255 against a truth of 0.125.

**Side-view speed with a target tag.** 8 serves per cell: 120/240 fps × 25/40/55 m/s, with true out-of-plane angles of 0°, 10° and 20° tagged T, T or body, and wide.
- Every range that was not refused contains the truth.
- Refusals: 5 of 192, all at 20° with the wide tag at 120 fps.
- Range high/low: 1.47-1.57 for T, 1.64-1.86 for body and 1.79-2.10 for wide. The untagged 0-25° band gave 1.74-2.20.

**Rear-view average speed from the located bounce.**
- Chain `detectBounce` → `mapBounceToCourt` → `speedFromFlightTime` at 60 fps: 20/20 ranges contain the path-average truth, median high/low 1.32.
- Direct cases: 25, 40 and 55 m/s serves (average 77, 122 and 167 km/h) give ranges of 70-90, 110-145 and 150-200 km/h.

**Bounce, rear view.** Median time error is 1.3, 0.9 and 0.7 ms and median landing error 13, 9 and 11 cm at 60, 120 and 240 fps. From raw candidates, 13, 14 and 15 of 15 bounces were found at 30, 60 and 120 fps.

## Known limitations

- Synthetic validation only. Two independent renderers (`testing/` and `tools/synth`) were used, but no real footage.
- **Outgoing ball in the side view at 5 m.** The rendered side clips sit 5 m from the centre mark, and the ball leaves the frame 1-2 frames after contact at 60 fps (4 at 120 fps, 8 at 240 fps). The near-contact speed therefore needs 240 fps, or the D1 default of 7-8 m, which keeps the ball in frame longer. See the evaluation.
- **Streaks longer than 8 diameters are rejected.** An example is the outgoing ball under a 1/60 s dusk shutter, which at α < 0.13 is too faint to un-mix anyway. The toss is unaffected.
- Release timing is biased early: 6-32 ms on the rendered corpus (one +88 ms outlier at 30 fps after a missed frame, 1.7σ) and 8-12 ms on the test renderer. The reported sigma (at least 25 ms) mostly covers it, but real hands will differ.
- A one-sided toss (apex and descent out of frame) is extrapolated, reported with lower confidence and labelled in the basis.
- Camera shake is tested only as integer-pixel translation.
- **Audio labels (video layer).** `video/audio.ts` labelled the racket pop `unknown` and a later footstep `contact` on every rendered clip checked. The ball layer therefore uses the strongest non-bounce transient after the apex, not the label. A pre-serve bounce close to the phone, or a neighbouring court's pop, could still be louder than the serve; this is untested.
- **Pre-serve ball bounces** (dribbling before the toss) are real free flights at g that do rise. Neither the rise check nor the gravity band rejects them; only RANSAC support and the apex-near-track test do. The multi-serve `session` clip was not part of this evaluation.
- The side-view follow-through still produces colour-seam candidates after contact (no plain-colour gate after contact, by design). Before `sideViewOutgoingLimits` existed, a seam line through the contact point became the "outgoing track" on fps30-s1 (2 detections, none on the ball). With the limits, one seam remains in an outgoing track on the corpus: dusk-s2 at 60 fps, 1 of 2 detections, where speed is refused anyway. A slow second serve under 17 m/s in-plane (about 60-70 km/h) would be refused as "not tracked after contact".
- Speed ranges stay wide (high/low about 1.5 for T, up to 2.1 for wide) because perspective and the out-of-plane angle cannot be observed from one side view. Lens focal-length metadata (`focalLengthFhu`) would narrow them.
- The rear clip in the corpus has the camera 1.5 m high, 5 m behind the baseline, and the net hides the ball around the bounce. The detector reported a false bounce there; it maps off the court and is refused, so the average speed is refused too. D1's rear view is a raised camera. The rear bounce and speed path has been validated only on unit-test flights, not on rendered video.
