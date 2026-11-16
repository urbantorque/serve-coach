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
  *Since D7.6 the same noise also runs on real serve motion (the Bath set), and
  every floor has to cover both; five rose (§9, "Noise floors on real
  motion"). The camera noise is still modelled.*
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
   residuals — so the noise floors stop being self-referential. *Done
   (2026-10-17): fitted on the bench, with a swap guard; see "Noise that
   behaves like a tracker" in §9.*
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
- **No speed from the body.** A serve speed is read off the ball, with the
  toss as its ruler, and said only with the range it is good to (N2.7, which
  replaced the old "no speed in mph" rule on the owner's call, 2026-10-22).
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

### A second set, from every side: COCO tennis (2026-10-07)

The table above is one camera: rear three-quarter, the player about 215 px
tall. `npm run setup:bench` now also builds `bench-data/coco-tennis` from
COCO 2017. Annotations are **CC BY 4.0 [V]**. Images are kept only where the
photograph's own Flickr licence allows commercial use; that leaves out about
two thirds of the candidates, on purpose.

The selection rule is in `scripts/fetch-bench.mjs`: a racket in the image, a
labelled player at least 120 px tall, and a wrist raised above the shoulders
with a racket beside them. That gives **146 overhead tennis frames**. Most are
serves; a few are smashes and high forehand finishes. `bench.html?set=coco-tennis`
runs them. Each frame is also filed by the view its *labels* show (`viewOf`:
shoulder span over torso length). That gives 36 edge-on, 100 oblique and
10 square frames. Desktop Chrome, WebGPU, as before.

| Variant | All 146: wrists | elbows | Edge-on 36: wrists | elbows | L/R swaps | ms |
| --- | --- | --- | --- | --- | --- | --- |
| det → mp-full crop (the app's MediaPipe path) | 1.60 / 85% | 1.79 / 87% | 1.53 / 84% | **2.37** / 84% | 3 | 86 |
| mp-heavy | 1.34 / 92% | 1.32 / 93% | 1.55 / 88% | 1.48 / 92% | 1 | 35 |
| **det → RTMPose-s** (what re-reads the swing today) | 1.17 / 95% | 0.91 / 97% | 1.24 / 87% | 1.07 / 94% | 0 | 34 |
| **det → RTMPose-m** | **0.86 / 99%** | **0.78 / 99%** | **1.02 / 96%** | **0.84 / 95%** | 0 | 51 |
| RTMPose-m on the labelled box (ceiling) | 0.82 / 98% | 0.82 / 100% | 1.05 / 96% | 0.79 / 99% | 0 | 51 |

Median error is % of player height; PCK is the share within 5%.

**What it adds to the table above.**

1. **The ranking holds on a second set and from other angles.** RTMPose-m,
   then RTMPose-s, then MediaPipe on the arm joints, everywhere. Neither
   RTMPose model swapped left and right once.
2. **Edge-on is where MediaPipe's elbow is weakest**, at 2.37% of height. That
   is the view in which one shoulder hides the other. RTMPose-s more than
   halves it, which is the swing re-read E7 already ships.
3. **RTMPose-m beats RTMPose-s on wrists here too:** −26% over all frames and
   −18% edge-on. On Tennis Player Actions it was −16%. The wrist is the contact
   landmark, so this is evidence for D6.7 from a second, independent set. It
   costs 54 MB against 22 MB and about 1.5× the time, and still needs the
   memory-footprint check.
4. Errors are lower across the board than on Tennis Player Actions. COCO's
   players are larger and its photographs sharper than phone video frames, so
   compare the two sets by ranking, not by number.

---

## 8 · What was executed, with no footage from the owner

Every change below is measured against open data or the rig, carried by a
check that fails if it regresses, and committed on `roadmap/market-ready`.

| Change | Evidence | Where |
| --- | --- | --- |
| **Object detector on CPU.** On the GPU delegate EfficientDet-Lite0 loaded and returned *nothing*, every frame, so racket boxes were always empty on a phone with a GPU | 8 people on CPU, 0 on GPU, same frame | `vision/objectEngine.ts` |
| **Player crop.** The pose model reads a square round the server instead of the whole frame | Benchmark: frames with no pose 101 → 8 of 500; wrist error 2.89% → 2.02%, elbow 3.67% → 2.35% of height | `pose/playerCrop.ts` |
| **Sub-frame timing** (`refineExtremum`, tent fit). A parabola was tried first and was worse | Rig, 16 noisy seeds: drop→contact bias at 30 fps +31 → +10 ms, RMS 35 → 14 ms; at 24 fps +45 → +15 | `analysis/phases.ts` |
| **Real timestamps** to MediaPipe's VIDEO mode, with a clean break between passes | Unit checks; on real clips same keyframes, knee reading moved 2.8° on one | `pose/poseEngine.ts` |
| **Knee band re-anchored** 35–62° → 35–80° to the 27-study meta-analysis | A textbook ~66° load is no longer told to bend less | `analysis/coaching.ts` |
| **RTMPose-s re-reads the swing**, joint by joint above a measured score of 0.5, all-or-nothing in a 6 s budget | Benchmark on the same crop: elbows 2.35% → 1.59%, wrists 2.02% → 1.72%; score threshold measured on 1,019 labelled joints | `pose/rtmpose.ts`, `pose/refineEngine.ts` |
| **Slow motion hedged**, detected from the motion itself | Rig: clean and genuinely slow serves untouched, 3× stretch caught; ratios stay scored | `analysis/phases.ts`, `confidence.ts` |
| **Ball read in a column** above the tossing hand at native resolution | Pixel test: a distant player's ball placed within 0.5 px, against 3.5 px from the 256-px frame | `vision/ballTrack.ts` |
| **Coach-jargon lint** and four live violations fixed; every runtime headline linted | Copy suite | `analysis/voice.ts` |

**Still open, and why.** Reading the file's real frame rate and sampling the
swing at the source rate (E8) — the tent fit took most of the timing error
out at 30 fps, and the rest needs container parsing tested on real phone
files. Rescaling slow motion rather than hedging it needs a stretch factor
that can be measured, not assumed. Twenty card bands still want a citation or
a derivation; contact height needs a definition first (it reads the wrist,
the literature reads the ball). And the one thing no open dataset replaces:
a labelled clip from the side-on angle the app actually asks for.

---

## 9 · Measured: real serve motion through a virtual phone (2026-10-07)

The rig can only show that the engine agrees with the rig. Section 8 ended on
the one thing no open dataset seemed to replace: a labelled serve from the
angle the app asks for. Marker motion capture of real serves gets close, with
no filming and a clean licence.

**The data.** The Bath serve set (Durlind, Martinez-Hernandez & Assaf 2025,
doi:10.15125/BATH-01454, **CC BY 4.0 [V]**): 42 serves, 75 markers at 180 Hz,
eight Qualisys cameras, with each serve's outcome (in, out or net). The files
carry no marker names. The layout was worked out from the data (rigid
distances, sides of the trunk and pelvis) and is written down in
`src/dev/mocap/bath.ts`. It is one right-handed player throughout. Forty serves
finish their swing; two stop before the racket comes over.

**The method.** `mocapServe.ts` turns the joint paths into exactly what the
engine reads off a video: MediaPipe-shaped image and world landmarks, from a
level pinhole phone (65° vertical field of view, upright, 1 m up, 4.5 m away)
standing where players prop one. `src/dev/mocap/engine.ts` then runs the same
pure steps `runAnalysis` takes. No pose model runs and the landmarks are where
the joints were, so **every disagreement below is the engine's rules, bands or
camera model, not MediaPipe**. Truth comes from the same joints in 3D at
180 Hz, in two kinds: each keyframe under the engine's own definition (what
the phone costs), and the event that definition stands in for (what the
definition costs). `npm run setup:bench`, then `npm run bench:mocap`. Six serves
ride in the suite as `fixtures/bath-serves.json` (`mocap.test.ts`).

### What the engine gets right on real motion

| Keyframe, engine minus truth | 30 fps | 60 fps | 120 fps |
| --- | --- | --- | --- |
| Contact (wrist top), guide placement | +5 ± 9 ms rms, [−9, +18] | −5 ± 7 | −5 ± 6, [−11, +1] |
| Trophy (deepest knee bend) | −17 ± 20, [−41, +3] | −10 ± 12 | −9 ± 10 |
| Drop (wrist lowest against the shoulder) | +6 ± 11, [−8, +20] | +3 ± 6 | +2 ± 3 |

- **The tent fit holds on real swings.** Contact sits within 18 ms at 30 fps
  from every placement. Higher frame rates tighten everything, as section 2
  predicted.
- Knee bend reads 70.7° (median), against 72° in 3D. That is inside the
  re-anchored band (E6) from every angle.
- No serve was refused, and none was triaged out.

### What it gets wrong, from every placement and every frame rate

1. **Every real serve is told its racket drop is shallow.** `shallow_drop` is
   detected on 40 of 40 serves and is the first fix on all 40, from all five
   placements at 30, 60 and 120 fps. At the racket's low point this player's
   hand is 3–8 cm *above* the shoulder, while the racket head is 35–44 cm below
   it. The racket drops; the hand does not. That is the published geometry of
   maximum external rotation: upper arm at about shoulder height, forearm laid
   back (Fleisig 2003: 101° abduction, 104° elbow flexion). `dropDepth` reads
   −0.03, while `drop_depth_ratio` wants the hand 0.08–0.52 body heights below
   the shoulder and the card band wants 0.16–0.34. Those bands describe the
   "back scratch" coaching image, which the rig was posed to (dial
   `dropBelowShoulder: 0.45` m). **This explains the open item in §8 and in the
   roadmap's findings**: the rear-oblique Commons clips read −0.05/−0.06
   because real drops read about zero, not because the wrist was misplaced.
   The elbow at the low point reads 52–54° interior, between the WTA top-40
   (67°) and lower-ranked (52°) means (Gao 2026). By the literature this is a
   real drop.
2. **The camera model is turned 90° from a real stance.** A textbook server
   points the shoulder line at the net. From the baseline, where
   `FilmingGuide.tsx` puts the phone, the shoulders are spread across the
   picture. `estimateYaw` reads 22–36°, and `assessQuality` files every clip as
   **angled**. From the back fence it reads 61–74° and files it as **side**. The
   rig poses the opposite: a player square to the net, edge-on to a baseline
   phone (`shoulderYaw` 82–86° at ready). The consequences:
   - `contactAhead`, the one reading the guide says only a side view can see,
     is never reported from the guide's placement. From the back fence it is
     reported, and there image x is lateral, not net-ward (it reads −0.03).
   - Every reading routed by `axes.ts` and `DEPTH_YAW_RANGE` is routed on the
     wrong premise for real footage.
3. **The toss keyframe comes after the ball has gone.** `phases.ts` takes the
   toss as the tossing wrist highest *above its own shoulder*. The trunk keeps
   tilting after the hand peaks, so that lands 90–210 ms after the hand's
   highest point (+144 ms mean, guide placement, 30 fps). The keyframe's
   caption says "ball released". Release height, toss-arm extension,
   sync-at-release and every toss-anchored timing read a later instant than
   they name. Even against its own definition the peak is a broad plateau:
   ±64 ms rms.
4. **Contact height depends on where the phone stands.** The same serves read
   1.14 (guide), 1.23 (the other side of the baseline), 1.13 (back fence) and
   1.11 (rear oblique) body heights. Perspective puts ±5% on a band 0.22 wide.
   In 3D the wrist peaks at 2.16 m and the racket head at 2.62 m. Against an
   estimated 1.80 m stature (headband plus 7–8 cm), that is 1.20 and 1.46. The
   racket head sits between the published beginner (1.43) and elite (1.49)
   impact heights, which is an ordinary club contact. In the engine's own units
   the wrist is 1.24, below the band's 1.28 floor. `low_contact` fires on 26 of
   40 from the guide, 1 of 40 from the other side and 37 of 40 from the back
   fence. Whether the fault is named depends on where the phone stood.
5. **The wrist peaks 15–31 ms before the racket head does.** The engine's
   contact is the wrist top. Without a ball marker this set cannot say whether
   impact is nearer the wrist top or the racket's top. It does bound the
   question: the definition costs −17 to −31 ms against the racket's highest
   point, depending on placement.
6. **A clip that stops before contact is called left-handed.** The two
   unfinished Bath captures are refused with "This looks like a left-handed
   serve." That is a refusal with the wrong reason.

### What it settles, and what it does not

It settles that items 1, 2 and 4 are not pose-model error: they appear with
exact landmarks. It does not settle anything about MediaPipe, which never runs
here. It speaks for one player, so a band is never re-derived from this set
alone. Every change above should be anchored to the literature cited in
`.scratch/research-biomech.md`, with this set as the check that real motion
passes. Each of the first three is pinned in `mocap.test.ts` as a **KNOWN**
check, so the change that fixes it goes red and has to say so.

### Fixed, with leniency for real footage (2026-10-07, scoring version 4)

The owner asked for these to be applied, and for grading that copes with
imperfect clips from different angles. The approach throughout is the one
`LOOP.md` asks for: no threshold is lowered just to admit clips. Each band moves
to what the evidence supports, and where the phone's position alone can move a
reading, that spread is measured and allowed for.

- **The racket drop.** `drop_depth_ratio` and the `dropDepth` card now take a
  hand near the shoulder as a full drop. Only a hand left well above it is
  flagged: about 18 cm, the forearm still upright. The floor is the same at
  every level, because depth does not separate levels. A racket that never
  falls is still named structurally (`racketNeverFell`), and the card now says
  so too: on a collapsed drop it is scored at the curve's floor and reads out
  "Racket never falls", where before it only agreed by accident of the old
  band. The readouts describe the hand, which is what is measured. The "Show
  me" demonstration of a shallow drop is withdrawn: the stick figure draws no
  racket, and the hand differs from the fix by nothing at the judged moment.
- **Contact height.** Re-anchored to published impact heights (Girard 2005)
  less the racket head's height above the wrist (0.26 statures on the Bath
  serves): a club wrist sits at about 1.20–1.27 in the engine's units, so the
  card's old 1.28 floor was above the elite mean. A new `CAMERA_ALLOWANCE`
  (0.06, half the 0.12 spread the same serves show between phone positions)
  must be cleared before `low_contact` is named. The kick serve's lower band is
  gone, since published kick and flat impact heights are within a centimetre.
- **The rating.** Contact height had become the only signal rating a player.
  The phone's position moves it across four rungs, so the same serve was set
  different targets from the two sides of the baseline. 36 of 40 were told
  their shoulders opened early from one side and 5 of 40 from the other. By
  `inferTier`'s own rule a signal whose spread is wider than a rung does not
  vote, so with no voter left the rating is the stated default until the player
  moves it. The report already says the rating is a mark the player can change.
- **Arm extension.** It was read at the contact sample with its neighbours
  averaged in, ±33 ms through impact at 30 fps. The same real serve read a
  median 6.8° (up to 16°) apart at 30 and 60 fps, on a band 20° wide. It is now
  the straightest the arm gets within ±50 ms of contact: 2.1° apart (worst
  5.7°), and within 2.1° of the same quantity in 3D.
- **Found on the way:**
  - The rig could not pose a contact below about 1.14. Its follow-through was a
    fixed height, so a low reach peaked after contact. That is fixed, and the
    default serve is bit-identical.
  - A stored report with a malformed focus crashed the report screen instead of
    being repaired on load (`usableFocus`). This was hidden while every stored
    serve also named a fault.

**After the fixes, on the 40 Bath serves.** From every placement and frame rate,
37–40 of 40 are given no named fault. The exception is a handful of
`low_contact` from the rear-oblique left placement, where contact reads lowest.
`shallow_drop` and `early_shoulder_rotation` are named on none. Before, every
serve was given a fault to fix first.

- **A clip that stops before contact.** It was refused as left-handed. In
  `runAnalysis` the retry against the other hand then "found" a serve with
  every keyframe on one sample, which triage refused as too few frames. It is
  now refused as ending before the racket reaches the ball (D7.5).

**Not fixed yet, and why.**
- **The toss keyframe (D7.3).** Fixed later the same day, without re-posing
  the rig's arm. The rig's tossing hand does keep rising after the toss, as
  the body lifts a held arm. So the release is the *first* top of the hand's
  lift after its fastest rise, not its highest point (`findRelease`). It is
  read as the hand over the hips from the world landmarks plus the hips' rise
  and fall from the picture: picture height alone read 40 ms late from the
  guide's placement, because the hand moves towards that camera after
  release. On the Bath serves it now lands a median 4–7 ms from the hand's
  peak at every placement and frame rate, and within ±50 ms (p10–p90) with
  tracker noise. It was 90–210 ms late.
- **The camera model (D7.2).** Done in part; see the next section.

### The camera read against the court, on a rig that stands like a real server (2026-10-07, scoring version 5)

**What changed.** The synthetic rig's stance, trunk turn and arms were
re-posed on the Bath serves. The shoulder line sits at 165° (court frame) at
the ready, 159° at the trophy, 195° at the drop and 260° at contact, with the
hips at 245°. The racket hand is well back on the backswing, behind the head at
the trophy and the drop, and 0.29 m in front of the hips at contact. The elbow
is solved onto the shoulder–hand segment with both arm lengths held. The
camera's view is now read against the court (`Spatial.court_yaw_deg`, 90 minus
the shoulder reading) for the side/end call, the `axes.ts` routing and the
framing advice. The shoulder reading (`yaw_deg`) still decides
`depth_unreliable` and the comparison gate.

**On the Bath serves.** The guide's placement is filed side-on on all 40
serves at 30, 60 and 120 fps, and `contactAhead` is reported from it (median
17–21%). The back fence is filed front-back. No serve is refused, and no fault
is named except a handful of `low_contact` from the rear-oblique left
placement. The KNOWN check in `mocap.test.ts` flipped to a positive one.

**Fixed on the way.**
- **The drop at 30 fps and below.** A real drop is shallow and the climb out
  of it is steep, so a five-sample smooth (167 ms at 30 fps, 417 ms at 12)
  dragged it early. At 30 fps it landed 54 ms early; at 12 fps the minimum
  vanished. The posture smooth is now capped at about 100 ms of serve. The
  drop is 37 ms early at 30 fps, it spreads 26 ms across 30/50/120 fps (was
  43), and 12 fps finds it. Nothing changes from 45 fps up.
- **The trophy on stiff legs.** The racket's low point was looked for anywhere
  after the toss. On real motion the hand on the backswing sits as low as at
  the drop, so it is now looked for only in the 0.3 s before contact.
- **The no-drop injury rule.** `shoulder_load_no_drop` still used the old
  drop band. It reads the band's floor now.
- **Hand under the elbow.** Its 20% floor was anchored to the old rig, whose
  hand went down the back (28.6% clean). Real drops read 10.5–17.6% (medians
  from three placements), so the floor is 4%: under every real drop's lowest
  tenth and over every serve with none.
- **The invariance harness.** Its tilted-phone transform rolled the 3D pose
  twice, and its reader skipped the levelling pass `runAnalysis` runs. The
  three "known roll gaps" were measuring that residue. `levelFrames` has
  rotated the world landmarks since before the harness existed. With one roll
  in and the real correction applied, nothing drifts. The gaps are deleted,
  and a check holds the transform to one roll.
- **Two bounds now take the larger measurement.** Spine lean moves the
  external-rotation reading 0.5° per degree on the old arm and 0.2° on the
  Bath-shaped one. The bound keeps 0.5. The chain ratio's tempo term doubled
  to 0.0223 per second, and the bound takes it.
- **The fault demonstrations.** The collapsed elbow is now the back scratch:
  hand down the back, elbow fallen under it. The posture-collapse demo is
  withdrawn. By contact the hips face the net, so a sideways bend runs along
  the baseline the guide's camera looks down, and the two figures differ by
  0.035 body heights.

**What the realistic rig surfaced, pinned as KNOWN.** The engine read the old
rig well because the rig stood the way the camera model assumed. Real
servers do not, and it shows in five places.
1. **The guide's camera sees the shoulders square at the ready.** The shoulder
   reading saturates there, so `depth_unreliable` is set at the guide's own
   placement and the coil is hedged. The old rig hedged it there too, from
   the other end of the range. How wide a pose model's shoulders are decides
   whether real footage saturates. COCO's hand-labelled shoulders, on 822
   upright, front-facing people, have a median width of 0.229 of height. The
   rig's is 0.221 and `SHOULDER_SPAN_RATIO` is 0.21. The Bath joint centres,
   which are marker-derived and narrower, give 0.194, which is why the bench
   reads 25° from the guide where the rig reads 0°.
2. **Shoulder span cannot say which side.** A real stance holds the shoulders
   15° past the net axis, so a true 45° corner and a 75° near-side camera give
   the same reading. A corner reads 66°, outside R80b's band, and a sideways
   toss is named and drilled as forwards-and-back at a real corner again
   (`depth.test.ts`). *Closed by reading the court angle from the swing (next
   section).*
3. **The comparison gate near the guide's placement.** At the guide's own dial
   the reading is pinned at zero and every pair agrees. Either side of the
   pinned range, a sixth of same-spot pairs land outside the 5° gate; at a
   true corner it is a quarter (`axes.test.ts`).
4. **Just under the depth floor.** A camera that reads 13° clean is read as
   readable on 22 of 100 poor-light takes. The old check never tested this:
   its 14° dial read 0° on the old rig (`robustness.test.ts`).
5. **Sideways motion is along the baseline once the body faces the net.** A
   sideways landing reads at a quarter of its size from the guide's placement
   (0.020 against 0.062 from behind). The landing is ungraded, so no verdict
   moves (`depth.test.ts`).

Items 2–4 rest on one shoulder span at the ready. Item 2 is fixed by a second
reading, from the swing (next section). Items 3 and 4 are about the shoulders
themselves and stay open (ROADMAP D7.2).

**Rig limits found, not fixed.** The rig's feet turn with its hips; the Bath
servers' feet stay apart along the net axis. The rig also under-turns the hand
through contact: its pronation reads 20–39° where the Bath serves read a median
of 93°. Separately, R60·2 refused reading the stance because the rig stood its
feet along the guide camera's line of sight. A real front foot is ahead
towards the net (0.17 m on the Bath serves), and the rebuilt rig reads the
stance at 18 times its noise from the guide's placement. That refusal is
reopened.

### The court angle from the swing (2026-10-07, still scoring version 5)

**The reading.** After a capture, the camera's angle to the court now comes
from the swing (`courtYawFromSwing`). The hitting hand's path from the drop to
contact, in the world landmarks, has a direction against the lens. MediaPipe
reports those in the camera's frame, x across the picture and z away from it.
The net direction is that path turned back by `SWING_OFF_NET_DEG`: on the Bath
serves the hand travels 0.60 m towards the net and 0.21 m towards the hitting
side, which is 19°. It is an angle from a vector rather than an inverse cosine
of a length, so it does not saturate square-on and does not confuse the two
sides. The stance reading is kept as the fallback when the swing travels under
0.2 m, and for the live preview, which has no swing.

**Measured before it shipped.** The Bath serves were filmed from 24 placements
round the player, with depth jittered four times as hard as the picture and a
shared per-frame depth offset:

| Error against the true angle | median | p90 | worst |
| --- | --- | --- | --- |
| Stance (shoulder span at the ready) | 20° | 28° | 37° |
| Swing direction | 2.9° | 7.8° | 12° |

On the bench, all 40 serves from both baseline placements read 88° and are
filed side-on. The back fence reads 2–4° (front-back), and both rear corners
read 43–48° and are filed as angled. Before, one corner was filed end-on and
the other side-on. Item 2 above is closed: at a real corner, a sideways toss is
no longer named and drilled as forwards-and-back.

**The constant is one player's.** A swing that veers further, such as a kick
serve brushed up and across, moves the reading by the same number of degrees.
It does not flip it. No other open data measures this.

**Kept on the stance, on purpose.**
- **The comparison gate (item 3).** The swing varies from serve to serve at a
  fixed camera: on the Bath serves without noise, 81–90° at the guide's
  placement and 37–54° at a corner. That is wider than the 5° gate, so it
  would refuse more pairs than the stance does.
- **The depth hedge (item 4).** It asks whether the shoulders' turn is seen or
  inferred, which is a question about the shoulders.
- **The viewfinder.** It has no swing to read.

**The rig's world landmarks now turn with the camera.** They were built in the
court's frame and handed over in it. As a result, the 3D pose looked the same
from every camera, and the modelled depth noise sat on the court's sideways
axis wherever the phone stood. At the guide's placement the two frames nearly
coincide, which is why nothing noticed. Two recorded findings were artefacts of
it and are corrected:
- **The trunk lead moves with the camera after all.** R50c's "exactly
  invariant" becomes 78 ms from behind, 77 from a corner and 103 from the
  guide's placement, where its deviation nearly doubles (21 → 39 ms). A
  same-spot gate would matter, though the per-serve noise still blocks R50c
  first.
- **Knee extension moves 3.5° across camera angle.** That is a little over
  half its own deviation.

**A caution about this set's elbow angles.** The elbow centres are averages of
skin markers on the back of the joint. Swapping between the candidate centres
moves an angle ±3–4°, but a shared offset of 3 cm would read a straight arm
about 12° bent. The tossing arm reads 146° and the hitting arm about 135° at
contact, against published 150–166°. These are not used to judge any
elbow-angle band. Only relative findings, such as frame-rate agreement, are
drawn from them.

### Noise floors on real motion (2026-10-08, still scoring version 5)

**The question.** Every `NOISE_FLOOR` came from one ensemble: the rig's serve
filmed many times with modelled tracker noise. The rig was written beside the
bands, so a floor derived from it could only show the engine agreeing with
itself (F1). `realiseReal` now runs the same noise on the Bath serves, each one
filmed sixty times from the guide's placement at 50 fps. The jitter is scaled
to the player's size in the picture, because the pose model reads a crop
around the player. The floor is the camera's spread within one serve, pooled
across serves. It never includes the spread from one serve to the next.

| Signal | Rig sd | Real sd | Floor was | Floor now |
| --- | --- | --- | --- | --- |
| `pronation_deg` | 18.3° | 50.1° | 31 | 76 (not named, as before) |
| `palm_to_sky_deg` | 4.2° | 11.7° | 11 | 18 |
| `separation_deg` | — | 8.8° | 9 | 30 (`UNDER_RESOLVED`) |
| `spine_lean_deg` | 4.0° | 6.6° | 7 | 10 |
| `elbow_lift_ratio` | 0.006 | 0.011 | 0.012 | 0.017 |
| `hip_lead_ms` | 37 ms | 42 ms | 76 | 76 |
| picture-plane ratios | — | as steady or steadier | — | unchanged |

The six fixture serves and all forty agree to within a rounding step. Real
motion is noisier wherever the reading is taken from depth, or at a moment the
body moves fast through. A real hand turns fast through contact, so a keyframe
one sample either side reads a different forearm.

**What the old floors were doing on real serves.** Naming rates on the forty
serves, 2,400 takes. Not one serve is named without noise, so every naming is
the camera's:

| Fault | At the old floor | At the new floor | Rig fault, old → new |
| --- | --- | --- | --- |
| `early_shoulder_rotation` | 27.8%, all 40 serves flicker | 0.0% | open chest 100% → 85%; level trunk 63% → 0% |
| `posture_collapse` | 3.8%, 37 flicker | 1.3%, 22 flicker | 30° lean 78% → 50% |
| `waiters_tray` | 0.2% | 0.0% | demo tray 97% → 93% |
| `collapsed_elbow` | 0.0% | 0.0% | back scratch 100% → 100% |

**The coil is under-resolved on real motion.** Its deviation asks for a 14°
floor against a 12° serious miss. It is kept at 30, the first floor that names
no real serve, for the reason `hip_lead_ms` stopped at 76: the engine may miss
a fault and may not invent one. What it now names is a chest already open at
the trophy, shoulders past the hips. A level trunk is no longer named. The
rig's default camera never read the coil at all, so the old floor of 9 had
never been held to anything.

**The lean's tail is long.** A floor of 16 still names 0.2% of real takes, so
the floor stops at 10, where its own rule puts it. It is level with the
serious miss, not over it. Every named collapse is now 'high' severity.

**Still a model of the camera.** The motion is real; the noise is the same
modelled MediaPipe error as before. These figures move again the moment there
is footage through this app.

### Hand under the elbow, without perspective (2026-10-08, still scoring version 5)

The share of the swing the racket hand spends under its elbow was read from the
vertical order of the two in the picture. From the guide's placement, a lens at
waist height looks up at a hand and an elbow a few centimetres apart in height,
and whichever is nearer the lens rises. Two of the forty Bath serves read 0% at
30 fps and were told their hand "never gets under your elbow". The medians ran
from 8% at the guide's placement to 15% from the far baseline.

The order is now read from the world landmarks: metric, levelled with the
picture, and free of perspective. Neither half of it is depth. The forty serves
read 6.5–8.9% at the lowest and 12–13% at the median from all five placements
at 30, 60 and 120 fps, so the 4% floor sits under every real drop. The rig
films without perspective and reads identically either way.

### A phone on its side is told so (2026-10-08)

A clip rolled 89–110° was refused as "The clip ends before the racket reaches
the ball", because the keyframes found in a sideways picture put contact on the
toss; past 110° it was "not a serve". The roll is now read before a serve is
looked for, from the ankles-to-shoulders direction averaged round the circle
over the whole clip (`turnedPicture`). On level clips that stays within 5.3° of
upright, on the forty Bath serves from seven placements and on the rig. Past
30° the clip is refused as tilted, on its side or upside down.

The sweep found a second gap. `estimateRoll` levels up to 25° and stops, so a
clip rolled 40° was levelled by 25, measured with 15° still in it, and passed.
It is now refused for the tilt; under 30° at most five degrees stay unlevelled.

### Contact from the hand and the ball (2026-10-09, still scoring version 5)

F7 asked for contact from the earliest of three cues, with disagreement
lowering confidence rather than a winner picked silently. Two cues are used.
The racket box is drawn, never tested on footage, and does not vote.

**The ball's moment** is half a sample after the last time the tracked ball was
on its arc. It counts only when the ball was then within a racket's reach above
the hand (0–0.45 body heights; the racket head sits 0.26 above the wrist on the
Bath serves). A ball lost higher up was lost, not hit.

**The hand still decides on a well-read clip.** Its peak comes 5–45 ms before
the racket head's highest point on real serves, and every band is defined on
it, so the ball sits a little after the hand by design. The ball takes over
only when the hand's peak came at least 100 ms (or two samples) after the ball
had left its arc. A tracker can put the hand late; the ball cannot meet a
racket that has not arrived. The keyframes are then found again from the ball's
moment (`detectServe`'s `contactBy`).

**Disagreement hedges.** Past a real serve's lag (60 ms) or a sample the other
way, every reading taken at contact loses confidence, down to half, and a soft
one says the hand and the ball disagreed. The report keeps which cue decided.

**Then the bench caught it the other way (2026-10-09).** The Commons
table-tennis clip, refused as "not a serve" in every earlier run, came back
"The video is upside down". Its tracked "shoulders" sit below its "hips" in
every frame, steady to an R of 0.997, at visibility under a half in three frames
of four. The roll is now read only from frames where the shoulders and the feet
or hips were seen, and gives no verdict when fewer than half the clip qualifies,
so that clip is "not a serve" again. Real serves keep R at 0.98 or above from
every placement, so a seen body that reads turned is a turned picture.

### Contact height without perspective (2026-10-09, still scoring version 5)

Read straight off the picture, the hand's height at contact is scaled by its
distance from the lens. At contact the hand is well off the body's plane, so
from the guide's side it reads short and from the other side tall. The forty
Bath serves' medians ran from 1.112 to 1.267 across the five placements: four
rungs of the old ladder, set by where the phone stood.

No camera model is needed to take that out. The hips sit in the body's plane,
so their height stays a picture reading. The hand's height above them comes
from the world skeleton, which is metric and has no perspective, divided by
the stature that skeleton gives. The medians now run from 1.211 to 1.234,
within the noise floor of their midpoint, and every serve reads 1.174–1.246
from every place. The rig is drawn without perspective, so its picture and
its skeleton already agreed, and it moves by at most 0.013.

The camera allowance this signal carried (0.06) re-derives the same way to
0.012, its own noise floor, so it no longer widens anything. The known
exception that held hand height outside its band on real serves from the
guide's placement flipped and is gone.

### Noise that behaves like a tracker (2026-10-17, still scoring version 5)

This closes Tier 1.8. Every noise floor came from a jitter the suite chose:
0.45% of standing height per axis, independent from frame to frame, never
swapping a left for a right. The 500 bench frames turn out to be consecutive
frames of real serves, about a tenth of a second apart. So the tracker's error
can be measured with a history as well as a size.

**Measured.** A model's residual against the labels mixes the model's error
with the labeller's. MediaPipe and RTMPose on the same frames give three
pairwise differences, which split three ways. Per axis, in standing heights,
about each sequence's own mean:

| Part | MediaPipe | RTMPose-s | Labeller | MediaPipe swaps |
| --- | --- | --- | --- | --- |
| Shoulders | 0.87% | 0.71% | 1.44% | 1.2% of frames |
| Elbows | 2.05% | 0.73% | 1.59% | 1.0% |
| Wrists | 1.74% | 1.40% | 1.70% | 1.4% |
| Hips | 1.07% | 0.80% | 1.60% | 1.2% |
| Knees | 1.37% | 0.60% | 1.20% | 1.6% |
| Ankles | 1.24% | 0.87% | 1.05% | 3.7% |

- MediaPipe's error is two to four times the jitter the floors were set on,
  and a floor on it, since what the two models get wrong together lands in the
  labeller's column.
- MediaPipe in VIDEO mode on the app's fixed crop (`bench.html?video=1`) reads
  the same, to a few hundredths.
- Frame to frame the error is correlated 0.0–0.4 at the bench's spacing, which
  is 0.4–0.85 at 50 fps.

**What it does to the floors.** `trackerNoise.ts` films the six Bath serves
under the fitted model. Every floor holds against the old jitter. Under the
fitted noise, several ask for more:
- contact-ahead asks for 6–7 against 3;
- palm-to-sky for 29–34 against 18;
- elbow lift for 0.029–0.052 against 0.017;
- toss drift for 0.39–0.42 against 0.22.

**What it does to the faults, which is what a floor is for.** At today's floors
under the fitted MediaPipe noise, the skilled Bath serves were named:
- a toss drift on 5.3% of takes, on every serve;
- contact behind on 1.9%;
- a shallow drop on 1.4%;
- posture and the chest on 0.8% each.

Without the swaps the toss drift went to zero and the rest below 1%. A
left/right swap at contact reads the racket wrist off the tossing hand.

**So the swaps were fixed, not the floors raised.** `swapGuard.ts` puts a pair
back when both landmarks jump to where the other was headed, and the limb is
seen coming back within three frames.
- It touches no clean clip: the rig and the Bath serves from eight sides at
  30–120 fps.
- From the side it puts back every arm swap, and 65–85% of the leg and hip
  swaps, where side-on the pair nearly overlaps.
- The app runs it on every read and the suite's ensembles run it too.

With it, the only fault named on a skilled serve is contact behind:
- 1.1–1.4% under MediaPipe's noise;
- none under RTMPose's, which is the model the app re-reads the swing with.

**The floors stay.** They are the camera-only floors on the modelled jitter, and
the false-naming gate in `trackerNoise.test.ts` now holds them to the measured
tracker: no fault on more than 1% of skilled takes under RTMPose's noise, none
on more than 2.5% under MediaPipe's, and no toss drift at all.

**Still a model.** The spacing is inferred from the wrist's travel, and
carrying the correlation to 50 fps assumes it decays exponentially. Everything
here moves again with labelled footage at a phone's frame rate.

## Speed from the sound of the bounce (N2.10, 2026-10-22) — not adopted

The question: could the time from the strike's sound to the bounce's give a
serve speed without slow motion? Simulated with drag and gravity, launches of
30–55 m/s from 2.6 m, 2–10° down, keeping only serves that land in the box
(12.5–18.3 m out). The phone stands by the server, so the bounce is heard
x/343 s late. The estimator cannot know the bounce depth, so it assumes the
middle of the box (15.4 m).

| | |
|---|---|
| Serves in the box | 16 |
| Median error against launch speed | 20% |
| Worst | 38% |
| Mean | −20% (always slow: drag takes a fifth of the speed by the bounce) |

Even against the flight's own average speed the error runs from −25% to +10%,
from the unknown bounce depth alone. The bar was 10%, so this does not ship,
not even as a cross-check on the ball reading (N2.7).


## Serve speed, against the market (N2.7, N2.11–N2.13, 2026-10-22)

**What the leading products do** (V = vendor claim, I = independent):

| Product | Method | Accuracy |
|---|---|---|
| Pocket Radar, Bushnell, Stalker | Doppler radar, in line with the ball | ±1 mph (V); reads v·cosθ, so a wide serve reads low |
| SwingVision | Ball tracked through the whole flight from behind the baseline | Reports the flight's *average*, about 10% under radar (V); I: up to 11 km/h off radar on fast serves |
| Athla Velocity | One phone about 20 ft to the side | ±0.3 mph of a Stalker (V); I: ICC 0.970, 67 players |
| ServeSpeed (iOS) | Player marks contact and bounce | "Verified at the Australian Open" (V, no figure) |
| Zepp, Babolat, Sony sensors | Racket speed × about 1.4 | Fit for one player's trend only (I) |
| Kelley et al. 2010 | One high-speed camera, automatic | 4.5% against light gates (I) |

**What this app does.** It reads the launch speed, which a radar reads, off
the struck ball's own positions, with the toss's gravity as the ruler (no
height entered, no court lines), the depth motion fitted, drag taken out, and
a range sized by the clip's own fit. On the simulated launches with decoys:

| Clip | Read | Range holds the truth | p95 error | Worst |
|---|---|---|---|---|
| Slow motion, 120/240 fps, guide placement | 83 of 240 (65% landscape) | 98.8% | 4.5% | 8.6% |
| 30/60 fps, speed placement | 37% at 30, 75% at 60 (landscape) | 98.8% | 4.5% | 8.3% |
| 30 fps, guide placement | 2 of 60 | all | — | — |

That puts it beside Kelley's single high-speed camera on error, ahead of a
whole-flight average on what it measures, and alone in stating how far each
reading can be trusted. What it is not yet: checked against a radar on real
serves. Until one is filmed the speed stays `UNCALIBRATED`, said as a range,
and never graded.

**Placement matters more than any fit.** From the guide's placement, centred
at four to six metres, the ball leaves the picture within two frames at 30
fps. Six to seven metres back with the net side of the picture open:

| Placement | 30 fps | 60 fps | 120 fps |
|---|---|---|---|
| Guide, 4–6 m, centred | 3% | 19% | 56% |
| 5–6 m, looking 1.5 m netwards | 39% | 69% | 85% |
| 6–7 m, looking 1.5 m netwards (`SPEED_PLACEMENT`) | 44% | 79% | 83% |
| 6–7 m, looking 2.5 m netwards | 49% | 93% | 81% |
| 8–9 m, looking 2.5 m netwards | 35% | 93% | 78% |

One and a half metres rather than two and a half: the wider lead read more at
60 fps but held the truth only 94% of the time at 30, and it pushes the player
towards the edge of the picture. Not adopted: speed from the bounce's sound
(N2.10, 20% median error), from the wrist (11% average error on the Bath
serves, blind to racket speed), and from blur length (needs an exposure time
the video does not record).

## The chain against 180 Hz truth (2026-11-05, still scoring version 5)

**The question.** D3.8 reads the order the body fires in only at 60 fps and
above, because a 33 ms sample is wider than its 15 ms slack. That gate was
reasoned and never measured, and it reaches further than it says. `pose/rate.ts`
reads a real-time clip at 32 samples a second whatever rate it was shot at, so
only slow motion ever clears it. The forty Bath serves give 180 Hz truth for
every link, and the virtual phone gives what a clip sees of it. Everything below
is `npm run bench:mocap -- --chain` (`src/dev/mocap/chain.ts`).

**Truth, in ms before the wrist's top, the engine's contact.**

| Link | At its peak | Before contact |
| --- | --- | --- |
| Legs | Hips rising fastest | 167 ± 9 |
| Shoulder joint | 3D speed | 88 ± 7 |
| Elbow | 3D speed | 80 ± 6 |
| Hand | 3D speed | 28 ± 3 |
| Trunk | Shoulder line turning fastest | 22 ± 6 |
| Hips | Pelvis turning fastest | 46 ± 41, from −52 to 129 |

Between them, legs to elbow is 86 ± 11, elbow to hand 52 ± 5, legs to hand
138 ± 10, and shoulder to elbow 8 ± 7. The pelvis has no peak to time: it turns
at a plateau, and truth itself moves ±41 ms. The trunk peaks with the hand, not
before the arm, which agrees with D3.8's reason for leaving it out of the check
and with van Trigt 2024: professionals do not fire strictly from the ground up.

**A take.** Every take here starts on a sampling phase of its own. The older
ensembles hold one phase per serve, and at 30 fps where the frames fall moves a
peak as far as the tracker does. Noise is the tracker fit (§ "Noise that behaves
like a tracker"), through the swap guard. "Read at 32" is the app's own read of a
file (`onReadingGrid`): `seekTo` files a sample under the time it asked for, so a
30 fps file has about one frame in sixteen read twice and its stamps slide up to
a frame out of step.

**The methods, in ms rms against truth, from the guide's placement.** Current is
the chain as it stands. Spline is sub-frame interpolation through every sample.
Parabola is a curve fitted over ±100 ms of the same smoothed speed. Cubic is a
local cubic slid along the path, which keeps a peak's shape.

| Legs to elbow | Clean, 30 | MediaPipe, 30 | Read at 32 | 60 | 120 |
| --- | --- | --- | --- | --- | --- |
| Current | 9 | **14** | **19** | **16** | **13** |
| Spline | 9 | 39 | 37 | 45 | 131 |
| Parabola | 9 | 14 | 20 | 15 | 13 |
| Cubic ±100 ms | 6 | 33 | 30 | 32 | 21 |
| Cubic ±130 ms | 11 | 26 | 25 | 24 | 17 |

| Elbow to hand | Clean, 30 | MediaPipe, 30 | Read at 32 | 60 | 120 |
| --- | --- | --- | --- | --- | --- |
| Current | 12 | **14** | **14** | 37, 20% lost | 35, 10% lost |
| Spline | 9 | 33 | 30 | 41 | 167 |
| Parabola | 15 | 16 | 15 | 32, 20% lost | 28, 10% lost |
| Cubic ±100 ms | 11 | 26 | 26 | **22** | **26** |
| Cubic ±130 ms | 17 | 31 | 22 | 26 | 25, 16% lost |

- **The sharper methods win on clean landmarks and lose under a tracker.** At
  60 fps clean, the cubic reads legs to elbow within 4 ms and the hand within 6
  ms. Under MediaPipe's fit it reads them within 32 and 14. A tracker's error is
  mostly fresh each frame, and a peak is where a curve is flattest, so an
  estimator that keeps the shape keeps the noise.
- **A wide smooth is the right tool at 30 fps,** by a factor of two, and that was
  not expected. The fitted parabola adds nothing to it.
- **Past 30 fps the tracker sets the limit, not the clock.** Legs to elbow reads
  14 ms at 30 fps and 13 at 120.
- **An interval beats its two ends.** Each link is timed against one contact, and
  that contact's error cancels in the gap. On the six fixture serves under
  RTMPose's noise at 30 fps the links move 10–11 ms between takes and the gap 5–6.

**What can be claimed, from the side.**

| Claim | Gap in 3D | 30 fps, and the app's read of a 30 or 60 fps file | 60, 120 fps |
| --- | --- | --- | --- |
| Legs before contact | 167 | Yes, 12–15 ms rms | Yes, 12–16 |
| Legs before the elbow | 86 | Yes, 14–19 | Yes, 13–16 |
| Elbow before the hand | 52 | Measured, 11–14, with no fault to prove it on | No: the hand is misread |
| Shoulder before the elbow | 8 | No: reversed on 12–14% of takes | No |
| Hips or trunk, any order | | No: 51–207 ms, 13–36% lost | No: 50–169, 8–14% lost |

From the far baseline it matches, with legs to elbow at 10–20 ms. From behind only
the first row stands. The legs are read from image y and hold at 10–18 ms from
every side, but the elbow's speed in the picture peaks about 90 ms early, and
legs to elbow reads the wrong way round on 59–92% of takes.

**What changed.**

- **The firing order is read side-on only.** From the back fence at 60 and 120
  fps with noise, it told these skilled serves their legs came late on 16% and
  19% of takes, and now on none. A corner the swing files as side-on does it on
  0.6% at the worst. The check on real serves had only ever filmed the guide's
  placement.
- **`Diagnosis.legLead`** differences the chain's own legs and elbow, so it adds
  no series. It is data only, from the side, in ms, with an order: `legs_first`
  past +35 ms, `arm_first` past −35, otherwise `level`, which is a limit of the
  camera and not a verdict. `CHAIN_NOISE_SD` carries its noise, 17 ms at the
  worst real serve, and the call stands off zero by twice that. Ungraded, in
  `UNCALIBRATED`. The nearest published figures are other quantities on other
  players. `legLeadLine` says it in words.
- **It stops when the hips barely rise.** Swept on the rig under the same noise,
  the gap's spread is about 2.2 / rise ms: ±19 at a rise of 0.115, ±33 at 0.056,
  ±83 at 0.024. Under 0.05 it is not read. That is where the leg rise reaches its
  own zero, 0.0457.

**The call on the forty serves, from both baseline placements.** 240 takes a
cell, under MediaPipe's noise, the legs and hips planted late by `lateLegs`.

| Legs to elbow in 3D | Read at 30 fps or on the app's read | At 60 and 120 fps |
| --- | --- | --- |
| +86, as played | 100% `legs_first` | 99–100%, the rest unread |
| +36 | 13–67% `legs_first`, the rest `level` | 20–67% `legs_first`, the rest `level` |
| −14 | 89–99% `level`, 0–11% `arm_first`, at most 1.3% `legs_first` | 63–98% `level`, 1–37% `arm_first` |
| −44 | 45–87% `arm_first`, the rest `level` | 71–96% `arm_first`, the rest `level` |
| −74 | 88–99% `arm_first`, the rest `level` or unread | 95–99% `arm_first` |
| −114 | 14–31% `arm_first`, the rest unread | 55–64% `arm_first`, the rest unread |

Past about 200 ms late the legs' peak leaves the search window, so the link is
dropped rather than guessed. `legLead` never reads `legs_first` past −44. On the
rig's own dial it reads 92, 21, −11 and −46 ms at 30 fps.

**Found, and left.**

1. **The chain's hand is misread at 60 fps and above.** After contact the arm has
   a second speed peak, 8.5 m/s at about +100 ms against 10.7 before contact, and
   a ±90 ms smooth runs the two together. It reads about 30 ms late, after
   contact on half of takes, and from the guide's placement lands on the window's
   edge and is dropped on 20% at 60 fps and 10% at 120. That is why the firing
   order is absent from up to a fifth of side-on reads, and why its
   elbow-to-hand half can never fire. Only slow motion reaches it. A ±100 ms
   cubic reads the hand within 14–19 ms with 2% lost, but it would move
   `chain_span_ms` and the timeline at a boundary, which is a decision for the
   screen that draws it.
2. **The read at 32 moves the gap by 17 ms.** A 30 fps file's stamps pull legs
   to elbow from +3 ms of bias to −14. `requestVideoFrameCallback`'s `mediaTime`
   would stamp the frame's own time. It needs a browser and real files to prove,
   so it was not touched.
3. **`ORDER_SLACK` was derived on the old jitter,** the legs at 7.5 ms. Under the
   fitted tracker they move 12–15. Side-on it names nothing false, so it stands.

**Still a model.** The motion is real and one skilled player's. The tracker is
fitted to frames a tenth of a second apart, carried to other rates as an
exponential. Motion blur and a tracker's lag on a fast limb are not in it. A club
player's gap has not been seen by anything here, which is one more reason the
reading is an order and not a band.

## First or second, flat or kick (2026-11-05)

**The question.** Can the app work out a serve's number or type, so the player
need not say? There are no labelled clips. The Bath set is one player with
outcomes and no type or number, so nothing can be learned from it about either.
What it gives is the side of the sum a phone controls: how far each reading moves
from serve to serve and take to take on real motion. The other side is published.
`npm run bench:mocap -- --serve-cues` (`src/dev/mocap/serveCues.ts`) prints it, at
30 fps on the app's read, under MediaPipe's noise.

| Reading | Serve to serve | Take to take | First against second, published | Verdict |
| --- | --- | --- | --- | --- |
| Ball speed | about 5% (the wrist's, Bath) | 2.3%, range ±5–7% | 17%, 24% (van Trigt 2024, Chow 2003) | **Adopted** |
| Elbow speed | 4% | 2.4% | Upper arm 15%, trunk 6%, pelvis 8% (van Trigt 2024) | Not adopted |
| Hand speed | 5% | 2% | Racket head: no difference found (Chow 2003) | Not adopted |
| Drop to contact | 11 ms | 34 ms | Segment timing 125 against 127 ms (van Trigt 2024) | Not adopted |
| Toss to contact | 41 ms | 44 ms | None found | Not adopted |
| Whole motion | 35 ms | 17 ms | None found | Not adopted |
| Contact ahead | 4.0% of height | 5.5 | 4–7 cm, 2–4% (Chen 2024) | Not adopted |
| Toss ahead, from the hand | 2.3% | 3.9 | Closer in on a second (Chow 2003) | Not adopted |
| Contact height | 0.02 | 0.02 | 303.4 against 303.3 cm (Baiget 2023) | Not adopted |

**Adopted: `guessServeNumber`, from the player's own record.** It speaks only
where that player's tags have already shown the pattern, and it never stores
anything.

*What came before.* After a fault a second, after a second or a made first a new
point. That is the rules of tennis and it is not a basket of first serves, so each
pattern is held to the player's own consecutive tagged serves, with a 95% lower
bound on the rate: 60% to speak, 75% to say likely. Consecutive means the serve
before it in one file within a minute, or two clips recorded in the app within two
minutes. `createdAt` is when a report was made, so a clip from the camera roll has
no order to read. Simulated over five sittings of 12–20 serves, 120 players a row:

| Practice | 80% tagged: speaks on, wrong on | With 5% mis-taps | 50% tagged |
| --- | --- | --- | --- |
| Match flow | 37%, 0% | 25%, 0.8% | 1–2%, 0–3.8% |
| First serves only | 26%, 0% | 21%, 0% | 1–2%, 0% |
| Second serves only | 0% | 0% | 0% |
| First then second, whatever happened | 31%, 0% | 21%, 3.7% | 4–8%, 0–2.1% |
| Half match, half first serves | 26%, 0.6% | 20%, 0.5% | 0.5–0.9%, 0–4% |

That cannot show the rule fits real players. It shows the gate works: a guess
speaks only on a habit the tags show, and a player who practises another way is
left alone. Half-tagged players hear almost nothing, because a case needs both
serves' numbers and the first one's outcome.

*How fast the ball left.* Used when the tagged sides sit apart by the reader's own
ranges, at least five a side, and this serve's whole range falls on one side of
the middle. The reading's noise is `ServeSpeed`'s own.

| First to second | Spread 5%: speaks on, wrong on | Spread 8% |
| --- | --- | --- |
| None | 0%, – | 0–0.1% |
| 5% | 0.3–0.4% | 0.9% |
| 10%, which nothing publishes | 7–12%, 2–6% | 6–11%, 14–21% |
| 17%, van Trigt 2024 | 61–73%, 0.6–1.2% | 34–63%, 5–7% |
| 24%, Chow 2003 | 91–92%, 0–0.1% | 78–84%, 1.4% |

It reaches few clips: 37% of landscape clips at 30 fps from the speed placement,
and almost none from the guide's. When the two kinds of evidence disagree it says
nothing.

**Not adopted, from the pose.** The best a guess could do from one reading and the
player's own tags, six and twelve a side, gated as `secondServeSlower` is with a
held-out check, with second serves planted by running a real swing slower:

| Reading | No gap | 10% slower | 15% slower | 25% slower |
| --- | --- | --- | --- | --- |
| Hand speed | 0–0.5%, chance | 1–5%, wrong 24% | 0.5–3%, wrong 32% | 9–16%, wrong 13–16% |
| Elbow speed | 0–0.6%, chance | 19–25%, wrong 9–11% | 62–65%, wrong 3–4% | 76–79%, wrong 2–3% |
| Drop to contact | 0–0.1% | 3–6%, wrong 17–19% | 14–17%, wrong 8–9% | 16–21%, wrong 8–11% |
| Whole motion | 0–0.4% | 26–32%, wrong 7–9% | 80–83%, wrong 3% | 97%, wrong 0.5% |

- **Whole motion is reading the plant.** A slower swing is a longer swing here, and
  published second serves keep their timing. Nothing says a real second serve
  takes longer from the ready.
- **Hand speed barely moves at 30 fps.** Run 15% slower it reads 3% lower: the
  reading stops at contact and its peak sits on a sample boundary. The time left
  in the swing, drop to contact, carries 34 ms of noise on 156.
- **Elbow speed is the one to try again.** It tracks a real slowdown at about
  three quarters, and it is silent on a null. But it is side-on only, it changes
  with the read's rate, and nothing says what a club player's second serve does to
  it. A rule built on it would be a claim with no evidence behind it. That
  needs labelled clips.

**Not adopted: serve type.** The player's remembered choice stays. What the
literature gives, flat to kick:

| Published gap | Reading | With the player's own history | With none | Beats the remembered choice only if they switch type on |
| --- | --- | --- | --- | --- |
| Contact 5 cm nearer, professional men (Vacek 2023) | Contact ahead | 58% | 55% | 42% of serves |
| 17 cm, elite adolescent boys (Connolly 2021) | Contact ahead | 75% | 66% | 25% |
| 24 cm, junior boys (Vacek 2023) | Contact ahead | 83% | 72% | 17% |
| 18–21 cm sideways at the toss's top (Carboch 2018) | Toss across, from behind | 91% | not known | 9% |

Those are ceilings: the best any rule could do from that reading, with both types
equally likely. Campbell 2013 finds no flat and kick difference at all. The one
large gap is sideways, which is depth from the guide's placement. Reading it from
behind needs the serve's type to learn from, and `Session.serveType` is the
remembered choice, not a label. Slice has no published position of its own: its
difference is the racket's path (Sheets 2011), and the racket's path is what D3.7
already found a side-on camera cannot see. Peak back extension does not separate
the three (Abrams 2014), so the trunk gives nothing to hold a rule to either. On
the rig the readings track their dials, so this is not the camera failing. The gap
is not there to read.

**What would change this.** Labelled clips of a club player's first and second
serves. Nothing else can say what the elbow's speed does, and nothing here stands
in for them.
