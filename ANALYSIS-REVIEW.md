# ANALYSIS REVIEW — the engine, measured against the field

Written 2026-09-23. A deep read of the analysis pipeline — pose extraction,
keyframes, the twenty-one scored measurements, confidence, diagnosis, the ball
and racket passes, and the validation machinery — set against what published
biomechanics, current pose models and open datasets now make possible.

Everything proposed here is held to `LOOP.md`: nothing leaves the device, no
confident nonsense, forgiving to amateur footage without lowering a threshold,
a phone that is already warm. Licences are checked against primary sources and
tagged: **[V]** verified this session, **[S]** secondary source, **[U]** unclear.

---

## The verdict in one paragraph

The engine's *honesty* machinery is unusually good — per-measurement
confidence, refusals with escape hatches, noise floors, a causal fault graph —
and its *accuracy* has never been measured. Not one real clip has been
checked (`RECORDED = []`, need 6); 17 of 21 target bands cite no source; the
rest are anchored to a synthetic rig whose clean serve was dialled to sit
inside those same bands. Three structural limits cap how good it can get
regardless of tuning: **temporal resolution** at the only fast part of the
serve (the swing is 4–5 samples, no sub-frame refinement, slow-motion footage
mishandled), **depth** (the side-on camera the app asks for is exactly where
MediaPipe's inferred depth is worst, which silently disables one of the ten
faults), and **a contact instant taken from the wrist** rather than from the
racket or ball. The biggest gain available is not a bigger model; it is a
small, real, labelled validation set, followed by a handful of engine fixes it
will immediately justify, then a model upgrade confined to the swing window.

---

## 1 · How the engine works today

| Stage | What it does | Where |
| --- | --- | --- |
| Decode | One `seek` per sample, wait for `seeked` + up to 25 ms of `requestVideoFrameCallback`; no WebCodecs | `pose/extract.ts:245-270` |
| Sample | `min(32, 120/span)` fps; clips > 4.5 s scanned at 12 fps, then contact −1.9 s … +0.8 s read finely | `pose/rate.ts:31-46`, `extract.ts:19-73` |
| Pose | MediaPipe Pose Landmarker **full**, VIDEO mode, `numPoses: 1`, all confidences 0.5, GPU→CPU; native-resolution frames; image + world landmarks kept | `pose/poseEngine.ts:107-153` |
| Clean-up | Kalman bridges pose-less gaps ≤ 3 samples / 0.1 s; real detections are **not** smoothed for measurement; box smoothing (radius 1–2) on keyframe series | `analysis/kalman.ts`, `geometry.ts:149` |
| Camera | Roll from ankle→shoulder line at ready (±25°, corrected ≥ 4°); yaw = `acos(shoulder span / 0.21·height)`, sign-less; depth "unreliable" outside 18–78° | `analysis/spatial.ts` |
| Keyframes | contact = argmax racket-wrist height; toss = tossing-arm peak; trophy = world knee-angle minimum (arm fallback); drop = racket-wrist minimum; finish = contact + (contact − trophy) | `analysis/phases.ts:344-578` |
| Measure | 21 scored metrics (toss 5, loading 4, swing 4, contact 5, rhythm 3); world-landmark angles, image-plane heights scaled by standing height | `analysis/metrics.ts:299-529`, `coaching.ts` |
| Trust | Product of factors (framing, trophy source, swing samples, depth, handedness, axis split, visibility, blur, ball); soft below 0.55 | `analysis/confidence.ts:388-488` |
| Diagnose | 10 named flaws, one-hop cause graph, tiered bands one rung above the player, `HIERARCHY` picks 2–4 fixes | `flaws.ts`, `tiers.ts`, `triage.ts`, `verdict.ts` |
| Ball | Colour × frame-difference blobs at **256 px wide**, RANSAC free-fall arc, gravity assumes a 1.78 m player | `vision/ballTrack.ts`, `analyze.ts:608-663` |
| Racket | Wrist→knuckle ray (scored nothing); EfficientDet-Lite0 COCO box at 256 px (draw-only) | `analysis/racket.ts`, `vision/objectEngine.ts` |
| Validation | Parametric landmark rig with i.i.d. noise; 1,245 checks; fixture schema + replay tooling; **zero real fixtures** | `syntheticServe.ts`, `groundTruth.ts`, `__tests__/` |

---

## 2 · Findings, ranked by what they cost the player

### F1 · Nothing has been checked against reality — and the bands are circular

- `RECORDED: Fixture[] = []` against `MINIMUM_RECORDED = 6`
  (`__tests__/fixtures/index.ts:21,32`). No corpus has been ingested.
- **17 of the 21 card bands have no stated source.** The four that do are
  anchored to the rig (`handUnderElbow`), to the app's own earlier output
  (`tossPathWobble`), or to other bands (`contactAhead`, `tossPeakHeight`).
- The rig's `CLEAN_SERVE` (`syntheticServe.ts:491-500`) sits mid-band on every
  dial: knee 47°, tilt 24°, separation 26°, reach 1.38. So "the clean serve
  scores well" confirms only that the rig and the bands were written together.
- Every `NOISE_FLOOR` (`tiers.ts:237-338`), and so every UNDER_RESOLVED and
  UNCALIBRATED verdict, comes from a rig ensemble with "modelled MediaPipe
  depth error" whose source is not cited.
- The rig's noise is independent per landmark per frame. Real pose error is
  temporally correlated, biased under occlusion and blur, and occasionally
  swaps left and right — none of which the robustness suite can see. Its
  limits measure *consistency*, not *accuracy*.

### F2 · The swing is 4–5 samples, and slow motion makes it worse, not better

- Sampling is capped at 32 fps whatever the source. A 240 fps slow-motion
  file that plays in real time is read at 32 — **87% of the temporal
  information the README asks the player to capture is discarded.**
- A time-stretched slow-motion file (what most phones export) is measured in
  *file* seconds and nothing detects the stretch (`grep` finds no
  timescale/playbackRate handling). `dropToContact`'s 110–230 ms band reads
  a 4× clip as 4× slow; the 2.7 s located window covers 0.7 s of real motion.
  README §437-446 fixed this for one constant only.
- `pose/rate.ts:22-23` says sub-frame timing "is recovered analytically
  instead — see `refineExtremum` in phases.ts". **`refineExtremum` does not
  exist [V].** Keyframes are integer sample indices; the code itself admits
  ±30 ms of quantisation on a 120 ms-wide band (`analyze.ts:859-861`).
- A 30 fps source sampled at 32 fps re-reads ~2 frames a second, planting
  zero-velocity steps in every series (`rate.ts:19-20` acknowledges it).

### F3 · MediaPipe is run in VIDEO mode on invented timestamps

- `nextVideoTimestamp` adds 33 ms per call regardless of the real gap
  (`poseEngine.ts:210-214`) **[V]**, and one landmarker is shared by the
  preflight, the 12 fps scan and the fine pass. Frames seconds apart, or 83 ms
  apart during the scan, are stamped 33 ms apart.
- In VIDEO mode MediaPipe uses the previous frame's landmarks to crop the next
  region and applies its own temporal landmark filtering. With false
  timestamps that filter's velocity assumptions are wrong exactly where the
  wrist moves fastest. **Unmeasured, possibly significant:** attenuation of
  the wrist peak would bias contact height, drop depth and contact timing
  together. This is cheap to test and should be tested before anything else
  in §4 Tier 1.

### F4 · The recommended camera angle switches off one of the ten faults

- The app asks for dead side-on (~82–90° yaw). `DEPTH_YAW_RANGE = [18, 78]`
  (`spatial.ts:106`), so side-on is `depth_unreliable`.
- Hip–shoulder separation is "almost entirely world z"; its confidence is
  `visibility × DEPTH_COLLAPSED (0.35)` (`diagnose.ts:871-874`) — below
  `MIN_EVIDENCE = 0.45` **[V]**. So on recommended footage
  `early_shoulder_rotation` **can never fire**, and the arming→early-rotation
  attribution never links. Shoulder tilt is soft on every recommended clip.
- This is the honesty machinery doing its job; the cost is that a whole
  branch of the diagnosis is dormant on the footage the app asks for, and the
  player is never told.
- Knee, elbow and arm-extension angles also use MediaPipe world coordinates
  but carry **no** depth dependency, so they are never discounted for camera
  angle even though face-on their motion runs along the inferred axis.

### F5 · Several bands disagree with the literature or with each other

| Band | App | Published | Consequence |
| --- | --- | --- | --- |
| Knee bend at trophy (flexion, mean of both knees) | 35–62°, "high" gets the fix *Trim the bend* | Meta-analysis of 27 studies: front 64.5 ± 9.7°, back 67.4 ± 16.4° **[V]** | A textbook advanced load (~66°) is scored out of band and told to bend less |
| Sequencing (`arming_the_ball`, hip lead) | Penalises hips not leading shoulders | IMU study of pros: peak magnitudes rise proximal→distal, but pelvis often peaks *after* trunk and intersegmental timing is **not associated with ball speed** **[V]** | A strict pelvis-first rule coaches something that does not predict the outcome (already UNDER_RESOLVED; the rule, not only its noise, is suspect) |
| Shoulder external rotation | Measured, never graded | Single-camera shoulder-rotation RMSE ≈ 21° vs mocap **[V]**; definitions differ by 40° between studies (172° vs 130°) **[V]** | Current refusal is **correct** — keep it |
| Contact height | Wrist height 1.28–1.50 × standing height | Ball impact ≈ 1.48–1.5 × height in lab studies **[S]**, 1.62 in-match **[V]** — measured at the **ball**, not the wrist | The band mixes up two landmarks roughly a forearm-plus-racket apart; needs a stated definition before it is compared with anything |
| Leg drive | Card metric graded 0.10–0.24 | Its identical signal `leg_drive_rise_ratio` is filed UNCALIBRATED: "nothing knows what a club player rise should be" (`tiers.ts:628-637`) | The same number is graded on the card and ungraded in the diagnosis |
| Contact height, toss peak | Card bands | Diagnosis signal bands differ (1.28–1.5 vs ≥ 1.23; 1.38–1.72 vs 1.30–1.86) | Two judgement systems can disagree about one serve |
| Serve type | Card bands move for kick | Diagnosis and tier ladder ignore serve type (`diagnose.ts:336`) | A kick serve's lower contact can still become the primary flaw |

### F6 · The ball is scored, at 256 px, with no way to check it

- Two scored metrics (`tossPeakHeight` weight 1.2, `contactBelowPeak` 1.1) come
  from a colour × difference detector on frames **256 px wide**: the ball is
  8–9 px portrait, **~3 px landscape**.
- Clay, dusk, a yellow racket or kit, a handheld camera and a toss leaving the
  top of frame are all documented failure modes; all success rates are
  synthetic (`ball.test.ts`).
- The fixture format calls `measure()` **without a ball** (`groundTruth.ts:771`),
  so even the planned shoot could not validate these two metrics.

### F7 · Contact is the wrist's highest point

- Contact = argmax of a radius-2 box-smoothed racket-wrist height, sharpened to
  ±2 samples (`phases.ts:373, 202-208`). Neither racket nor ball participates.
- The wrist is the landmark MediaPipe tracks worst at that instant; the code
  says so (`kalman.ts:4-11`). Every contact-frame metric, the ball's
  `contactBelowPeak`, and every timing band hang off this one index.
- The racket box (EfficientDet-Lite0, weakest COCO variant, 256 px input, racket
  ~50 px, head ~15 px, motion-blurred) is draw-only and untested on footage.

### F8 · Smaller defects worth fixing on the way

- **Kalman gap-fill bias.** Missing slots are fed as a stale "measurement"
  at trust 0.05 rather than skipped (`kalman.ts:199-201`), dragging bridged
  points back along the motion.
- **Blur is averaged over the whole serve** (`triage.ts:277-278`): a smear
  confined to the 8 frames around contact barely moves it.
- **Roll vs lean.** A genuine forward trunk lean at ready is indistinguishable
  from phone roll (`spatial.ts:139-172`).
- **Yaw is sign-less** and ill-conditioned face-on; the view classifier uses a
  different formula (`analyze.ts:826-827`) and the two can disagree.
- **Serve location** uses an absolute 0.12-of-frame tolerance
  (`serves.ts:164`), not scaled to the player's size in frame.
- **Gravity assumes a 1.78 m player** for the toss arc (`analyze.ts:656`).
- **Hand keypoints** drive the wrist injury flag via the non-monotonic
  `pronation_deg` (reads 33° for a dialled 95°) with no noise floor.

---

## 3 · What the field offers now — and what the licences allow

### 3.1 Pose models

| Model | Licence | Fit | Verdict |
| --- | --- | --- | --- |
| **RTMPose-m** (13.6M params, 75.8 COCO AP; 26 ms on a Snapdragon 865 natively) | Apache-2.0 **[V]** | Top-down 256×192; runs in `onnxruntime-web` on WebGPU/WASM | **Best candidate** for the swing window. Training-data terms (AIC, CrowdPose, Halpe…) need a legal read **[U]**; no mobile-browser benchmark exists — must measure |
| RTMPose-t/s (3.3M / 5.5M) | Apache-2.0 **[V]** | Cheaper fallbacks | Candidates for the scan pass |
| RTMW / DWPose (133 whole-body pts) | Apache-2.0 **[V]** | Hands for grip/pronation | Hands on a blurred serving hand at 30–60 fps are unlikely to hold; racket-face orientation (below) is the better route |
| ViTPose(++) | Apache-2.0 **[V]** | Heavier than RTMPose for the same AP | Not first choice |
| MoveNet Thunder | Apache-2.0 **[S]** | 17 pts, weaker | No |
| Sapiens | CC BY-NC 4.0 **[V]** | Also far too large | **Excluded** |
| YOLO-pose | AGPL-3.0 | — | **Excluded** (already decided) |

### 3.2 Monocular 3D

Every commercially clean lifter carries weights trained on non-commercial data
(MotionBERT, PoseFormerV2, MotionAGFormer on Human3.6M/AMASS) **[V]**;
VideoPose3D is CC BY-NC **[V]**; MixSTE has no licence **[V]**; WHAM, TRAM,
HMR2.0 are MIT but require **SMPL**, which prohibits commercial use without a
Meshcapade licence **[V]**. **OpenCap Monocular** (2026) is PolyForm
Noncommercial and SMPL-based **[V]**. On tennis specifically, the CalTennis
benchmark (2026) found the best mesh method at 84 mm PA-MPJPE, with joint
angles "quite accurate" but depth and foot contact still poor **[V]**.

**Implication:** there is no drop-in 3D fix. The options are (a) keep angles
in-plane for side-on footage, as **Sports2D** (BSD-3 **[V]**) does and says
plainly is only valid for sagittal/frontal-plane motion; (b) train a small
lifter on data you own or license; (c) add a second camera.

### 3.3 Smartphone biomechanics tools

- **OpenCap** (Apache-2.0 **[V]**): two or more phones, cloud processing,
  4.5° mean joint-angle error — validated on walking, squats and jumps, not
  overhead sport. Upper-limb marker error 39 mm vs 27 mm lower limb **[V]**.
  The architecture (triangulate → marker augmenter → OpenSim inverse
  kinematics) is the reference for a future two-phone mode; the service
  itself breaks the nothing-leaves-the-device rule.
- **Pose2Sim** (BSD-3 **[S]**): multi-camera → OpenSim, 2–8° lower-limb RMSE,
  up to 11.6° for axial rotation **[S]**. Usable, on-device-portable in part.
- **Single-camera upper limb** vs mocap: elevation 8.5°, elbow 13.8°, shoulder
  rotation **21.2° RMSE** **[V]** — the empirical case for keeping external
  rotation refused.

### 3.4 Datasets

| Dataset | What it gives | Licence | Use here |
| --- | --- | --- | --- |
| **Tennis Player Actions** (2024): 2,000 smartphone images, **500 serves**, 18 COCO-style keypoints | Keypoint accuracy on real amateur-style serve frames | **CC BY [V]** | **Use now**: a real 2D keypoint benchmark for MediaPipe vs RTMPose on serve poses; fine-tuning set |
| **RacketVision** (2025): ball + **5 racket keypoints** (top, bottom, handle, left, right) across tennis/badminton/TT | Racket pose → face angle, head path, true contact | Code MIT **[V]**; video provenance unclear **[U]** | Method template for a racket-keypoint model; data use needs a provenance check |
| **CalTennis** (2026): 51 h, 40 players, 2–6 synced calibrated cameras | Multi-view tennis 3D ground truth | CC BY-NC 4.0 **[V]** | Research evaluation only; not for commercial training. Legal read before even internal benchmarking |
| **THETIS**: 1,980 clips incl. flat/kick/slice serves, beginners vs experts, Kinect skeletons | Beginner-vs-expert contrast | **No licence [V]** | Only with written permission |
| TrackNet tennis (broadcast ball) | Ball positions | No licence found **[U]** | Wrong camera angle; stress-test only |
| WASB (5-sport ball benchmark) | Ball detection baselines | Code MIT **[V]** | Method reference |
| Human3.6M, AMASS, 3DPW, AthletePose3D, Fit3D | 3D pose | Non-commercial **[S/V]** | Taint any weights trained on them |

### 3.5 Serve biomechanics to anchor bands (cite, don't guess)

- **Fleisig et al. 2003** (20 Olympians, 200 Hz 3D) **[V]**: max shoulder ER
  172°, elbow flexion 104°, trunk tilt at impact 48° above horizontal, arm
  abduction at impact 101°; peak angular velocities pelvis 440°/s → upper
  torso 870 → elbow extension 1,510 → wrist 1,950 → shoulder IR 2,420°/s
  (men).
- **Frontiers 2024 meta-analysis, 27 studies** **[V]**: trophy front knee
  64.5 ± 9.7°, back knee 67.4 ± 16.4°, trunk inclination 25.0 ± 7.1°; impact
  shoulder elevation 110.7 ± 16.9°, elbow flexion 30.1 ± 15.9°. **Knee flexion
  and trunk inclination had the lowest variability** — the most robust bands
  to coach against, and exactly the ones a side-on phone sees best.
- **Impact height** ≈ 1.5 × standing height (lab) **[S]**; 1.62 in match and
  *uncorrelated with serve speed* **[V]**.
- **Sequencing** (IMU, Dutch pros 2024) **[V]**: magnitudes rise proximal→
  distal; order of pelvis vs trunk peaks does not predict speed.
- **Top vs lower-ranked WTA, in match (2026)** **[V]**: lower-ranked players
  show *more* shoulder ER at maximum knee flexion (94.7° vs 38.3° — the arm
  cocks early) and roughly **double the trunk flexion and lateral-flexion
  range**. Two amateur fault signatures with published contrast.
- **Kovacs & Ellenbecker 2011** **[V]**: the 8-stage, 3-phase model — the
  vocabulary for keyframes and for procedure-aware segmentation.

### 3.6 Technique scoring (AQA)

FineDiving-style procedure-aware scoring and pairwise ranking need judge
scores per video; no scored serve corpus exists. **Pairwise ranking over a
player's own history** ("closer to your best serve than last week") needs no
external labels and fits the app's retention loop — but as a supplement to
explainable bands, never a replacement.

---

## 4 · The programme — what to do, in what order

Ordered so that each tier is measured by the one before it. Effort is for one
engineer familiar with the codebase.

### Tier 0 — Measure before changing anything (1–2 weeks, needs the owner's phone)

1. **A real validation set, designed for this engine.** Twelve serves,
   three players, recorded side-on **at 240 fps slow motion** alongside a
   normal 30/60 fps take. The slow-motion copy is the ground truth for
   contact, drop and toss-release frames (±4 ms) that no other source can
   give. Label: keyframe times, 15 ball centres per toss, racket head at
   trophy/drop/contact, and a wall mark for absolute toss height.
   *Extends `FIXTURE_PLAN` from 6 to 12 and adds ball + racket labels to the
   schema (`groundTruth.ts` currently cannot carry them).*
2. **A keypoint benchmark on real serve frames.** Run the 500 serve images of
   *Tennis Player Actions* (CC BY) through MediaPipe full and RTMPose-m;
   report PCK / normalised error per joint, wrist and elbow separately.
   This decides §Tier 2 on evidence, offline, in a dev route beside `?corpus`.
3. **The VIDEO-mode question (F3).** Same clip, same frames: VIDEO mode with
   today's fake clock, VIDEO mode with true timestamps, IMAGE mode. Diff
   wrist peak height and contact index. One afternoon; it may explain a bias
   in three metrics at once.
4. **Success metrics, written down before the fixes:** contact-time error
   (ms, vs 240 fps truth), keyframe error, per-metric error vs hand labels,
   ball apex error, false-refusal rate on the set, and test-retest spread
   across a basket.

### Tier 1 — Engine fixes the validation set will justify (2–3 weeks, no new model)

1. **Read the real frame rate and undo slow motion.** Detect capture rate and
   time-stretch (container metadata where available; otherwise
   `requestVideoFrameCallback`'s `mediaTime`/`presentedFrames` cadence on a
   short playback probe). Convert every timing to real seconds.
2. **Sample the swing at source rate.** Keep 32 fps for ready→trophy, but read
   trophy→contact+0.1 s at the native rate (60/120/240) — a few dozen extra
   frames, bounded by the existing frame budget. This is the single largest
   accuracy gain available: the swing goes from 4–5 samples to 20–40.
3. **Implement the sub-frame refinement the comments promise.** Parabolic
   (three-point) interpolation of every extremum-defined keyframe
   (contact, drop, toss, trophy) on the unsmoothed series. Delete the
   phantom `refineExtremum` reference or make it true.
4. **Fuse contact.** Take contact from the earliest of: wrist-height peak,
   ball trajectory break (the fitted arc stops predicting the ball), and
   racket-box/keypoint crossing the ball. Report which one decided, and let
   disagreement lower confidence rather than pick a winner silently.
5. **Re-crop instead of re-scale for the ball.** Run the ball detector on a
   native-resolution crop above the tossing shoulder instead of a 256-px
   whole frame — the ball goes from 3–9 px to 20–40 px for the same pixel
   budget. Gravity from the measured body height, not an assumed 1.78 m.
6. **A 2D trunk-rotation proxy for side-on footage (F4).** Side-on, the trunk
   turning toward the net *widens* the shoulder line and hip line in the
   image. The ratio of shoulder span to hip span over trophy→contact is an
   image-plane rotation signal that needs no inferred depth. Validate it on
   the Tier 0 set; if it holds, it revives `early_shoulder_rotation` on the
   recommended camera instead of leaving it dormant.
7. **Re-anchor the bands to citations**, one per band in `coaching.ts`, and
   fix the contradictions in F5: open the knee-bend band's upper side (do not
   tell a 66° load to bend less), state what `contactHeight` measures, grade
   `legDrive` only once it has a calibrated band, merge the card and signal
   bands so one serve cannot be judged twice, pass serve type into
   `diagnose`, and replace the strict pelvis-first rule with "trunk before
   arm" plus the published amateur signature (**early arm cocking at maximum
   knee bend**, readable side-on as racket-wrist height relative to the
   shoulder at the knee trough).
8. **Make the rig honest about real error.** Add temporally correlated noise
   (AR(1) per landmark), occlusion bias, blur-dependent wrist lag and
   occasional left/right swaps, with parameters fitted to the Tier 0
   residuals — so the noise floors stop being self-referential.
9. **The small defects in F8**: skip (don't fake) missing Kalman
   measurements; measure blur in a window around contact; scale the serve
   finder's tolerance to body height; give the view classifier and yaw one
   formula.

### Tier 2 — Model upgrades, confined to where they pay (3–5 weeks)

1. **RTMPose-m for the swing window only**, via `onnxruntime-web` on WebGPU
   with a WASM fallback: BlazePose keeps the scan and the ready→trophy pass
   (and supplies the crop box), RTMPose reads trophy→contact at the native
   rate. Adopt only if Tier 0 step 2 shows a real wrist/elbow gain on serve
   frames and the phone stays inside `LOOP.md`'s memory and heat budget. Legal
   read on training-data provenance first.
2. **A racket-keypoint model** (RacketVision's 5-point scheme on an RTMPose-t
   head, trained on your own labelled frames, plus RacketVision data if its
   provenance clears). Gives racket-face angle through contact — a far more
   robust pronation proxy than blurred hand keypoints — the racket path
   through the drop, and a true contact instant. Still draw-and-time only
   until validated; **never mph** from single-camera 30 fps.
3. **A small ball heatmap network** (TrackNet-style, a few million params, MIT
   baselines such as WASB for reference) on the Tier 1 crop, trained with
   BlurBall-style streak labels for the frames around contact. Replaces the
   colour heuristic only where it measurably beats it (clay, dusk, indoor).

### Tier 3 — Depth, properly (quarter-scale, optional)

1. **A "two-phone" capture mode.** Two phones, synced by a clap or a flash,
   triangulated on-device, joint angles by OpenSim-style inverse kinematics
   (Pose2Sim is BSD-3). This is how external rotation, hip–shoulder
   separation and trunk tilt become measurable — the ones the literature says
   matter most and a single phone cannot see. Premium, opt-in, still fully
   local.
2. **A commercially clean temporal lifter**, trained on synthetic serves
   generated from OpenSim musculoskeletal motion plus your own two-phone
   captures (no H36M, no AMASS, no SMPL). Worth it only after Tier 3.1 has
   produced the data to train and test it.

### Tier 4 — Smarter judgement (ongoing)

- **Personal baselines first.** A player's own best serves, from their own
  basket history, as the reference — deltas the app already computes for
  repeatability. Pairwise "closer to your best" ranking needs no external
  judge scores and fits the retention loop.
- **Show the evidence frame** for every fault, and say which camera would
  make a dormant fault readable ("film from the back fence to check your
  shoulder turn") instead of silently not detecting it.

---

## 5 · What not to do

- **No SMPL-based anything** (WHAM, TRAM, HMR2.0, OpenCap Monocular) without a
  commercial SMPL licence; **no Sapiens, VideoPose3D, MixSTE, YOLO-pose**.
- **No weights trained on Human3.6M / AMASS / 3DPW** in the shipped app without
  a legal decision.
- **No cloud inference**, however good — `LOOP.md` §7.
- **No external-rotation number from one camera** (~21° RMSE); the current
  refusal is right.
- **No speed in mph** from a 30 fps single camera; the R61 refusal is right.
- **No threshold lowered to admit clips** — the new frame-rate and crop work
  admits more footage honestly.
- **No bigger model before a validation set exists.** Without Tier 0, a model
  swap is another number nobody can check.

---

## 6 · Expected gain, stated honestly

| Change | What it should move | How we will know |
| --- | --- | --- |
| Tier 0 validation set | Nothing on screen — it makes every other claim checkable | It exists, and `RECORDED.length ≥ 12` |
| Native-rate swing + sub-frame keyframes | Contact/drop timing from ±30 ms toward ±5–10 ms on slow-motion clips | Contact error vs 240 fps truth |
| Slow-motion detection | Timing bands stop misreading stretched files by 4–8× | Same serve, stretched and real-time, same numbers |
| Contact fusion + ball crop | Contact-frame metrics and ball metrics stop inheriting wrist error | Ball apex and contact error on the set |
| Band re-anchoring | Stops coaching against textbook technique (knee bend) | Every band carries a citation; no band contradicts its source |
| 2D rotation proxy | Revives one dormant fault on recommended footage | Detection vs labelled early rotation on the set |
| RTMPose-m in the swing | Better wrist/elbow on fast, blurred frames — **size unknown until Tier 0.2** | PCK on the 500 serve images; metric error on the set |
| Two-phone mode | Makes ER, separation and tilt measurable at all | Agreement with a mocap session or a published protocol |

The honest summary: the largest improvements are **time resolution, contact
definition and validation**, not a larger network — and the one decision only
the owner can make is the afternoon of filming that turns every figure in this
document from an argument into a measurement.

---

## 7 · Measured: the pose benchmark (Tier 0.2, done without anyone filming)

`npm run setup:bench` fetches the *Tennis Player Actions* dataset (CC BY 4.0,
500 hand-labelled smartphone serve frames, 1280×720, rear three-quarter view,
player ~215 px tall, often a second player in shot). `/bench.html` on the dev
server runs each variant and scores it against the labels. Error is the
median distance as a percentage of the labelled player's height; PCK is the
share of joints within 5% of height. Timings are desktop Chrome with WebGPU —
relative, not a phone figure.

| Variant | Player missed | Wrong person | Wrists | Elbows | Shoulders | Knees | ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **mp-full** — the app today | **101** | 4 | 2.89 / 64% | 3.67 / 60% | 2.99 / 75% | 2.82 / 72% | 62 |
| mp-heavy (30 MB) | 73 | 11 | 2.10 / 70% | 2.59 / 68% | 2.64 / 76% | 2.65 / 74% | 73 |
| mp-full on its own crop | 124 | 2 | 1.90 / 83% | 2.27 / 80% | 1.96 / 93% | 2.22 / 90% | 51 |
| **det → mp-full crop** (no new model) | **8** | 3 | 2.02 / 81% | 2.35 / 78% | 2.01 / 93% | 2.20 / 92% | 127 |
| det → RTMPose-s (22 MB) | 0 | 10 | 1.72 / 86% | 1.59 / 90% | 1.70 / 94% | 1.83 / 98% | 67 |
| **det → RTMPose-m** (54 MB) | **0** | 10 | **1.44 / 90%** | **1.45 / 93%** | 1.62 / 95% | 1.73 / 99% | 160 |
| RTMPose-m on the labelled box (ceiling) | 0 | 2 | 1.52 / 90% | 1.50 / 93% | 1.69 / 96% | 1.85 / 99% | 162 |

`det` is the app's own EfficientDet-Lite0 taking the tallest COCO `person`.

**What it settles.**

1. **The app's first failure is not precision, it is finding the player.**
   MediaPipe's own person detector sees the whole frame at 224 px, where a
   distant server is ~37 px tall: one frame in five returns no pose at all.
   A crop from the detector the app already ships cuts that from 101 to 8,
   and cuts wrist and elbow error by roughly a third — with no new download.
2. **RTMPose roughly halves arm-joint error against today's pipeline** —
   elbows 3.67% → 1.45% of height, share within 5% from 60% to 93% — and,
   given a person box, never missed. RTMPose-s gets most of that at 40% of
   the size.
3. **MediaPipe heavy is not the answer**: fewer misses, but more wrong-person
   and left/right swaps (18) than any other variant.
4. The oracle row shows the detector's box is already as good as the labelled
   one for RTMPose; what remains is person *selection* (10 wrong-person frames
   out of 500), which temporal tracking in a real clip addresses.

Caveat, stated rather than hidden: hips differ by convention between
MediaPipe and COCO-style labels, so hip error favours RTMPose for a reason
that is not accuracy. The arm joints — the ones the serve is measured from —
share a convention, and that is where the gain is largest.
