# 05 · Computer-vision feasibility: which serve metrics can be measured credibly from phone video

*Research date: 27 September 2026. Scope: what a single iPhone (or two) can measure about a recreational player's serve (UTR 1–7), what extra setup each metric needs, and the status each metric should carry in the product. Written in Australian English. Evidence labels: [Established], [Coaching interpretation], [Vendor claim], [Market data], [Regulation], [Our inference]. Error figures marked "our estimate" are engineering estimates from geometry and physics. They are not validated results, and each is paired with a test in section 11.*

---

## 0. Bottom line

1. **Timing and consistency metrics are the strongest candidates for the first version.** A fixed phone at 60 fps can reliably find each serve, time-stamp its phases (toss release, toss apex, peak knee bend, contact, landing) to within ±1 frame (±17 ms), and measure how much the toss and contact point vary from serve to serve. Most systematic errors (scale, perspective, lens) are identical from serve to serve, so they cancel when we measure spread rather than absolute position [Our inference].
2. **Absolute body angles from one 2D view are estimates, not measurements.** Even under good conditions, single-camera 2D pose gets within about 2–5° of motion capture for in-plane sagittal joints such as the knee and hip [S12][S14][S15]. For fast sporting movements, MAE is about 9–10° [S16]. When the camera is 45° off the movement plane, RMSE is 15–37° [S17]. Present knee flexion and trunk tilt as bands or categories with a confidence flag, never as exact degrees [Established → Our inference for the serve].
3. **Serve outcome and placement are feasible from a raised camera behind the server, and much better sideways than in depth.** With the phone 2 m high and 6 m behind the baseline, one 1080p pixel at the far service line covers about 2 cm sideways but about 21 cm in depth (4K: about 1 cm and 10 cm). Calls of wide versus T are therefore sound, while "long by a ball-width" is not [Our inference, section 6].
4. **Serve speed can only be an estimate with a stated error band.** Physics fixes the ratio of average flight speed to speed off the racket at about 0.83 [S33]. SwingVision says its figure is an average speed about 20% below TV radar and accurate to within 10% at 60 fps [S35, Vendor claim]. The two independent studies of that app are small. One found only "good" speed validity (ICC 0.76–0.80) in 5 junior players [S36]. The other found agreement was much closer from an optimal than from a sub-optimal camera angle; its abstract does not say which variables differed significantly (UNVERIFIED; full text not accessed) [S37]. We should show "estimated speed, ±X km/h", label it Experimental until our own radar comparison passes, and never show decimals.
5. **Spin rate is not available from phone video.** Serve spin runs 1,000–5,000 rpm [S43]. Hawk-Eye's own spin estimate had an error SD of about 540 rpm (about 220 rpm with an improved trajectory model on the same tracking data), and neither was consistently accurate above 4,500 rpm [S44]. A 240 fps phone sees the ball turn 75–125° between frames while it is only 4–15 px wide. **Serve type (flat, slice or kick)** should come from the player's stated intent, with an Experimental "trajectory looks like…" check.
6. **Audio is a useful timing aid but not a speed method on its own.** Racket-impact sounds were detected in 81–96% of cases and bounce sounds in only 71–86% on court, with a timing agreement of about 9 ms against 240 fps video [S40] (pilot study, 10 players, groundstrokes only; serve timing was not assessed). Sound travel time must be corrected, because the bounce is about 17 m further from a phone behind the server than the contact point is, a delay of about 50 ms. Left uncorrected, that alone understates speed by about 9% [Our inference].
7. **iPhone capture choices matter more than model choice.** Use our own capture session rather than the Camera app. We can cap the shutter at 1/1000 s or shorter in daylight, read the true frame timestamps, and attach the camera intrinsic matrix to every frame [S60][S61]. At night under 50 Hz-powered lights (Australian mains is 230 V/50 Hz [S66]), lamps can flicker at 100 Hz. With a short shutter this shows up as a 20 Hz brightness beat at both 120 fps and 60 fps, so dropping to 60 fps does not remove it. The app should detect flicker and prefer a frame rate that divides evenly into 100 Hz (25, 50 or 100 fps, where the device allows it), so every frame samples the same flicker phase [Our inference; corrected in fact-check].

---

## 1. Pose estimation: options, speed and accuracy

### 1.1 Candidate models

| Option | Keypoints | Runs where | Published speed / accuracy | Notes relevant to the serve |
|---|---|---|---|---|
| **Apple Vision 2D** `VNDetectHumanBodyPoseRequest` | 19 (eyes, ears, nose, neck, shoulders, elbows, wrists, hips, root, knees, ankles). **No heels, toes or hands** | iOS/iPadOS 14+, macOS 11+, on-device [S2] | Apple publishes no accuracy or latency figures [S2] | Apple says the subject should ideally be at least one-third of the image height. It warns that flowing or robe-like clothing and crowds reduce accuracy, and says points with confidence 0 should be discarded [S1]. Free, no model to ship. |
| **Apple Vision 3D** `VNDetectHumanBodyPose3DRequest` | 17 joints in metres, relative to a root joint between the hips | iOS 17+/macOS 14+ [S3] | No accuracy figures | Detects only the most prominent person. Returns all 17 joints or none. Without LiDAR depth, body height defaults to 1.8 m, so the metric scale is a guess [S3]. Useful for a 3D-looking overlay. **Not suitable for metric measurement from ordinary video.** |
| **MediaPipe Pose Landmarker** (BlazePose GHUM; lite/full/heavy) | 33, including heel, foot-index and three hand points | iOS, Android, web (`@mediapipe/tasks-vision`), Python. IMAGE/VIDEO/LIVE_STREAM modes. 256×256 landmark input; optional segmentation mask and "world" landmarks [S4] | Model card: lite about 44 fps on CPU and 49 fps on GPU on a Pixel 3; full about 18 and 40; heavy about 4 and 19. PDJ (PCK@0.2 of torso) across regions: 87.0% (lite), 91.8% (full), 94.2% (heavy) [S5] | The model card lists people **further than about 4 m from the camera** and applications needing metric-accurate depth as **out of scope**. It gives entertainment as the primary intended use, and says quality degrades with poor light, noise and motion [S5]. The "correct" threshold (20% of torso diameter, roughly 8–10 cm) is loose for biomechanics. |
| **MoveNet** Lightning/Thunder | 17 (COCO) | TF.js/TFLite | TF.js on iPhone 12 (WebGL): Lightning 51 fps, Thunder 43 fps [S7] | Trained on COCO plus Google's "Active" set of yoga, fitness and dance footage [S7]. In a gait study, Thunder was close to OpenPose at the hip (4.6 ± 1.8° vs 3.7 ± 1.3°) [S12]. |
| **RTMPose** (t/s/m/l) | 17 (body) | ONNX, ncnn, TensorRT, OpenVINO and CoreML export; Apache-2.0 [S9] | RTMPose-m: 75.8% COCO AP, 90+ fps on an i7-11700 CPU. RTMPose-s: 72.2% AP, 70+ fps on a Snapdragon 865 [S8] | Stronger top-down accuracy than the mobile-first models, and can be deployed to iOS through CoreML. Needs a separate person detector. |
| **RTMW** | 133 whole-body points (including hands and feet) | Server/GPU; possibly mobile after distillation | RTMW-l: 70.1 mAP on COCO-WholeBody per README [S9][S10] | Hand points may help estimate racket-hand orientation. Heavier than we need on-device. |
| **ViTPose** | 17 (COCO) | Server/GPU | 80.9 AP on COCO test-dev with the largest backbone [S11] | Best-in-class accuracy but large. Suitable only for an optional cloud "HD re-analysis". |

**Recommendation** [Our inference]:
- **Native iOS v1:** use Apple Vision 2D as the default path (no model shipping, runs on the Neural Engine). Run MediaPipe Pose (full or heavy) or an RTMPose-s/m CoreML build as a candidate and benchmark all of them on our own labelled serve clips. Apple Vision has no heel or toe points, which hurts landing-position and foot-up/foot-back metrics (see 7.8). MediaPipe has them.
- **Web prototype:** use MediaPipe `tasks-vision` in VIDEO mode with the full or heavy model. Feed it frames decoded with WebCodecs (section 9.7).
- **Optional server path:** RTMPose-l or ViTPose for a slower, higher-accuracy re-analysis. Add this only if on-device results fail validation.

### 1.2 How accurate is markerless pose against marker-based motion capture?

| Study | Movement / setup | Result | What it means for the serve |
|---|---|---|---|
| Washabaugh et al. 2022 [S12] | Walking gait, 32 participants, 2D sagittal video; OpenPose, MoveNet Lightning/Thunder and DeepLabCut vs marker-based mocap | Mean error across the gait cycle: hip 3.7 ± 1.3° (OpenPose), 4.6 ± 1.8° (MoveNet Thunder); knee 5.1 ± 2.5° (OpenPose) | Best case: slow, in-plane, well-lit movement [Established] |
| Wade et al. 2023 [S14] | Walking, OpenPose 2D, sagittal and frontal views vs 15-camera Qualisys | Sagittal knee bias 1.5 ± 4.1° on the camera side, 1.6 ± 6.9° on the far (occluded) side; ankle −8.4 ± 5.2°; frontal ankle ±12° | **The limb further from the camera is noisier.** Ankle and foot angles are unreliable [Established] |
| Barzyk et al. 2024 [S15] | Countermovement jump, **iPhone X, 4K 60 fps**, commercial CNN vs Vicon | MAE hip 2.6°, knee 2.1°, ankle 4.5° (r = 0.96/0.99/0.87); n = 11 | A phone can match mocap closely for simple flexion–extension [Established] |
| Fukushima et al. 2024 [S16] | 8 athletic and 9 sport-specific movements, 5 participants, pose vs infrared mocap | MAE 9.7 ± 4.7° (athletic movements), 9.0 ± 3.3° (sport movements). Elbow worst | **Expect about 10° for serve-like movements** [Established] |
| Baldinger, Reimer & Senner 2025 [S17] | Lunges, OpenPose on iPad (about 43 fps) from four 45° oblique views | RMSE knee 15.5–29.4°, hip 15.2–25.3°, elbow 29.4–37.1°, shoulder 23.6–36.5°. Rear views best | **Perspective (projection) error dominates when the camera is off-plane.** Shoulder angles are poor [Established] |
| Menychtas et al. 2023 [S18] | Gait: OpenPose, MediaPipe, Kinovea vs Vicon | MediaPipe had the widest confidence intervals and frequent **left/right swaps** | Needs left/right consistency checks [Established] |
| Emmerson et al. 2025 [S19] | 16 players; serves, forehands and backhands; multi-camera HRNet/OpenPose vs markers | External work bias ≤ 4%; internal work random error ±8–21% from **high-frequency artefacts** | Markerless serve kinematics are jittery. Smoothing is essential but blunts peaks [Established] |
| Boey et al. 2026 [S20] | 6 elite men, 25 flat serves each; 8-camera markerless system vs 10-camera Vicon | Mean per-joint position error 42 mm, **48 mm at trophy position**; largest at the hips | Even an 8-camera professional rig has about 4–5 cm joint error in the serve [Established] (the paper exists, but these figures came from a search snippet; the fact-check could not retrieve the abstract or full text, so the specific numbers are UNVERIFIED) |
| AthletePose3D (Yeung et al. 2025) [S21] | Fast athletic movements | Generic 3D models: MPJPE about 214 mm, falling to about 65 mm after sport-specific fine-tuning | **Models trained on everyday poses under-perform on fast sport.** Fine-tuning on serve footage is likely to pay off [Established] |
| Ozan et al. 2025 [S22] | Monte Carlo analysis of *marker-based* serve mocap | Joint-angle 95% CIs of 5.1–30.8° from marker placement and soft-tissue error | The "gold standard" is itself uncertain for the serve. Validation targets must be realistic [Established] |
| Wade et al. 2022 review [S13] | Markerless methods overview | Training datasets were labelled by non-experts, with occluded joints often placed at biomechanically wrong points. Multi-camera joint-centre differences of about 10–50 mm, worse for fast movements | Keypoints are not anatomical joint centres [Established] |

### 1.3 Failure modes specific to the serve

- **Hitting-arm motion blur.** The wrist, elbow and racket move fastest from racket drop to contact. Broadcast footage at 30 fps produces partial-body blur that measurably degrades pose models in baseball pitching, which is a close analogue [S23]. Frame rate does not remove blur; **exposure time** does (section 9.4) [Established → Our inference].
- **Self-occlusion.** From behind, the tossing arm hides the head at trophy, and the far-side hip and knee are partly hidden. Error is larger on the occluded side [S14].
- **Left/right swaps** when the body is side-on [S18]. Fix: enforce temporal and anatomical consistency, and use the player-declared handedness.
- **No racket.** None of the general models tracks the racket. Racket drop, racket-face angle and pronation are not observable from generic keypoints [Our inference].
- **Clothing and subject size.** Loose clothing and a subject smaller than one-third of the frame reduce accuracy [S1]. MediaPipe treats subjects more than about 4 m away as out of scope [S5], although we can mitigate this by cropping a high-resolution frame around the player [Our inference].
- **Neighbouring courts.** Multiple people in frame. Apple 3D and MediaPipe track a single, most prominent person [S3][S5]. Lock onto the server using the first frames and court position.
- **Jitter and smoothing.** Low-pass filtering removes the high-frequency artefacts [S19] but also flattens and delays peaks. Detect contact time from the ball and audio, not from pose [Our inference].

---

## 2. Tennis-ball detection and tracking

### 2.1 Methods

| Method | Evidence | Fit for our clips |
|---|---|---|
| **Classical:** background subtraction or frame differencing, plus yellow-green colour and circularity filters | A monocular line-calling pipeline using background subtraction plus colour filtering reported 99.4% accuracy on 394 tagged samples. Its bounce-point test had only 11 samples (81.8%) [S29] | Good for the **toss**: slow, isolated, often against sky or fence. Fragile with a moving camera, balls in the hopper, or balls on neighbouring courts [Our inference] |
| **Apple `VNDetectTrajectoriesRequest`** | Detects parabolic trajectories from a **stationary** camera, returns equation coefficients, and takes minimum and maximum object-radius parameters. It reports every concurrent trajectory, so the app must filter them [S27]. Apple's Action & Vision sample computes throw speed from trajectory length over duration, using a board of known size as scale [S28] | Very well suited to the toss (a near-perfect parabola) and possibly the pre-bounce flight. Free and on-device [Our inference] |
| **TrackNet (v1)** heatmap CNN over consecutive frames | Broadcast tennis at 640×360: precision 99.7%, recall 97.3% on the training-match test; **95.3% precision, 75.7% recall** under 10-fold cross-validation on other videos. Handles blurred and "afterimage" balls [S24] | Strong baseline for serve flight. Trained on broadcast views, so **domain shift to a phone behind the baseline is untested** |
| **TrackNetV2/V3** | On shuttlecock data: V2 94.98% accuracy, V3 97.51% (recall 99.33%), about 25–28 fps on a GPU [S25] | V3's background-estimation and trajectory-repair ideas transfer. Needs retraining on tennis serves |
| **TrackNetV4** | Adds motion-attention maps from frame differencing. Reported gains over V2/V3 on tennis and shuttlecock datasets (numbers not in abstract) [S26] | Same caveat |
| **YOLO-style detectors** | No tennis-serve validation found (UNVERIFIED) | A ball 4–8 px wide at the far service line (section 6) is at the edge of generic small-object detection. Needs temporal context such as TrackNet [Our inference] |

### 2.2 Ball travel per frame and blur

Physics check: 1 km/h = 0.278 m/s. Ball diameter is about 6.7 cm.

| Serve speed | m/s | Ball travel per frame at 30 / 60 / 120 / 240 fps | Blur streak at 1/60 s · 1/240 s · 1/1000 s · 1/4000 s exposure |
|---|---|---|---|
| 100 km/h | 27.8 | 0.93 / 0.46 / 0.23 / 0.12 m | 46 cm · 12 cm · 2.8 cm · 0.7 cm |
| 130 km/h | 36.1 | 1.20 / 0.60 / 0.30 / 0.15 m | 60 cm · 15 cm · 3.6 cm · 0.9 cm |
| 160 km/h | 44.4 | 1.48 / 0.74 / 0.37 / 0.19 m | 74 cm · 19 cm · 4.4 cm · 1.1 cm |
| 200 km/h | 55.6 | 1.85 / 0.93 / 0.46 / 0.23 m | 93 cm · 23 cm · 5.6 cm · 1.4 cm |

[Our inference, arithmetic.] Implications:
- **At 30 fps a 160 km/h serve jumps about 1.5 m between frames.** Tracking it is a gap-filling problem, bounce timing is ±33 ms, and the bounce may fall between frames.
- **60 fps is the minimum for serve flight. 120–240 fps is better for timing,** but only if exposure is short. At 240 fps the maximum exposure is 1/240 s, so the ball is still a 19 cm streak at 160 km/h unless the shutter is capped lower.
- **The toss is easy at any frame rate.** A toss rising 1–1.5 m above the hand leaves at about 4.4–5.4 m/s (v = √(2gh)) and is nearly stationary at the apex.

---

## 3. Serve speed from video (and audio)

### 3.1 Physics that constrains every method

- Air drag is large for tennis balls. Rod Cross gives Cd ≈ 0.55 for a new ball, and at 60 m/s the drag force is 7.3 times the ball's weight. A served ball lands at about **74–75% of its initial speed, whatever that speed is** [S33][S34, Established].
- From Cross's closed-form solution, the flight from 40 cm inside the baseline to the far service line (17.9 m) takes **t ≈ 21.5 / v₀** seconds. That is 0.48 s at 160 km/h [S33].
- Average flight speed is therefore 17.9/21.5 ≈ **0.83 × the speed off the racket** [Our inference from S33]. That matches SwingVision's statement that its average speed reads about 20% below TV radar, which reports peak speed just after impact [S35, Vendor claim]. A radar-equivalent figure can be back-calculated (average ÷ ≈0.83). Uncertainty in Cd from ball wear and spin [S33] adds roughly ±2–3% to that conversion [Our inference].

### 3.2 Flight time and frame-rate error budget (contact → far service line)

| Speed off racket | Flight time | Frames in flight at 30 / 60 / 120 / 240 fps | Worst-case ±1-frame timing error as % of flight time |
|---|---|---|---|
| 100 km/h | 0.77 s | 23 / 46 / 93 / 186 | 4.3% / 2.2% / 1.1% / 0.5% |
| 130 km/h | 0.60 s | 18 / 36 / 71 / 143 | 5.6% / 2.8% / 1.4% / 0.7% |
| 160 km/h | 0.48 s | 15 / 29 / 58 / 116 | 6.9% / 3.4% / 1.7% / 0.9% |
| 200 km/h | 0.39 s | 12 / 23 / 46 / 93 | 8.6% / 4.3% / 2.2% / 1.1% |

[Our inference.] Sub-frame interpolation from a fitted trajectory can roughly halve these figures.

### 3.3 Candidate methods

**A. Endpoints plus flight time (recommended for v1; one camera behind the server).**
- 3D contact point: court homography plus camera intrinsics give the server's foot position on the ground plane. Contact height comes from the vertical plane through that point (sections 6 and 7).
- 3D bounce point: bounce pixel mapped through the ground-plane homography.
- Flight time: from the contact frame (ball-velocity discontinuity plus audio onset) to the bounce frame (trajectory kink plus audio).
- Result: path length ÷ time = average speed, which is converted to an estimated speed off the racket.
- Error budget at 60 fps, our estimate: timing ±2–3%, path length ±1–3% (bounce depth ±20–40 cm over about 17–18 m), and conversion ±2–3%. That gives a **combined RMS of about ±4–5%, with worst cases around ±8–10%** (about ±6–8 km/h typical at 150 km/h). This is comparable to SwingVision's ±10% claim [S35, Vendor claim].

**B. 3D trajectory fit through all tracked flight points with a drag-and-gravity model.** This is more robust to one bad endpoint. From a single camera behind the server, most of the ball's motion is along the optical axis, so depth comes almost entirely from the physics prior and the bounce constraint. It needs a second view to be well posed [Our inference].

**C. Side view at 240 fps near contact (Experimental).** Measure ball displacement over the first 3–6 frames after impact, perpendicular to the camera. Scale comes from court features or player height in the same plane.
- Errors: out-of-plane direction (a 10–15° angle towards T or wide gives a 1.5–3.4% cosine under-read, correctable once placement is known) and depth mismatch between the ball and the scale plane (about ±5% at 8 m).
- The prize is a near-peak speed that is directly comparable to radar [Our inference].

**D. Audio timing plus video placement.** See 3.5.

### 3.4 What exists commercially and how well it is validated

| Product | Method | Stated accuracy | Independent evidence |
|---|---|---|---|
| **SwingVision** (tennis/pickleball, iOS) | Single phone, AI ball tracking, **average** speed | "Within 10%" with its recommended setup at 60 fps; average speed about 20% below TV radar; line calls 97% accurate within 10 cm of a line [S35, Vendor claim]. Serve spin is categorised only as flat/slice/kick, with no rpm field in the web app code [S35] | **Bilić et al. 2023**: 5 elite junior males; serve speed ICC 0.76–0.80 ("good"); placement ICC 0.83–0.87 [S36]. **Choe et al. 2023**: 6 college players, 4 matches, 1,065 strokes filmed from an optimal and a sub-optimal position; high proportional similarity and agreement for most variables, and **much closer agreement from the optimal angle** than the sub-optimal one [S37]. The abstract does not name which variables differed; an earlier draft's claim of significant differences for bounce zone, spin and speed could not be confirmed (UNVERIFIED; full text paywalled). SwingVision says it was approved by the ITF for line calling at sanctioned tournaments in March 2026 [S35, Vendor claim; not independently confirmed, because the ITF's technology pages could not be read] |
| **Fulltrack AI** (cricket, iOS) | Single phone on a tripod 1.66 m high, 4 m behind the stumps, calibrated by aligning both sets of stumps in on-screen boxes [S38][S39] (setup geometry not in either abstract; UNVERIFIED) | — | **Shorter et al. 2024**: 1,081 deliveries vs a Stalker Pro IIs radar. Pace bowling ICC 0.87–0.90, CV 2.6–3.1%, bias +0.72–0.77 m/s (overestimates). Limits of agreement **exceeded the 3% maximum allowable difference** [S38]. Line and length vs 3D mocap (836 deliveries): ICC > 0.96, SEM 0.05 m (line) and 0.47 m (length) [S39] |
| **Tennis Serve Speed Tracker** (iOS/Android, indie) | Sound of racket hit and bounce, plus video. User marks four service-box corners. Phone near the net facing the target box [S41][S42] | "Calibrated against a real radar gun", but no numbers published [S41][S42, Vendor claim] | None found. 2 ratings on the US App Store and too few to display on the Australian store. Premium unlock is US$9.99, or A$14.99 on the Australian store [S41][S71, Market data] |

**Reading of the evidence** [Our inference]: the best-validated phone speed system, Fulltrack in cricket, gets high reliability (ICC about 0.9) with a small systematic bias. Even so, it misses a strict 3% agreement standard, and it works from a fixed, well-defined calibration geometry (stumps). Tennis apps have weaker independent validation, from small samples. A **±5–10% band** is therefore honest for phone speed at 60 fps. Individual-serve readings are useful for trends (for example, "your second serve got faster") but not as radar-grade numbers.

### 3.5 Audio onset timing: does it work?

- **Evidence.** Caprioli et al. 2025 used a GoPro stereo microphone at 48 kHz with 240 fps video. Racket impacts were detected 81–96% of the time and bounces 71–86%. The acoustic interval between bounce and impact agreed with high-speed video to about 9 ms, with no significant difference. Bounce sounds were often below ambient noise, and **neighbouring courts hurt more than wind or traffic** [S40, Established, pilot study of 10 players]. The study measured groundstroke timing, not serve speed; the authors did not assess serve timing.
- **Sound travel correction (critical)** [Our inference]. With the phone 6 m behind the baseline, the contact sound travels about 6.3 m (about 18 ms at 343 m/s) and the bounce sound about 23 m (about 67 ms). The recorded interval is therefore about 49 ms too long. On a 0.48 s flight that under-reads speed by about 9%. The correction needs the bounce position, which only video provides, so audio complements video rather than replacing it.
- **Verdict.** Use the audio onset to refine **contact time**, where the impact is loud and precise to within milliseconds, and as a secondary bounce cue. Do not ship audio-only speed.
- *Correction (gap study, 27 Sep 2026; `gaps/side-view-geometry-contradictions.md` §7).*
  - **Caprioli's set-up.** The microphone was 5 m to the side of the player, with fed forehands bouncing a few metres away on clay. There is no published evidence for serve bounces 15–25 m from a phone.
  - **Side-view camera (DECISIONS D1).** The target box is 47–68° off the camera axis, beyond the 34–36° half-angle of the 1x lens. The bounce's distance, and hence the sound-delay correction and path length, cannot be measured. Simulated error is about 10% at the median and 20% at the 90th percentile, even with a target tag.
  - **Behind-the-server view.** With the bounce located in video, the simulated error falls to about 3% at the median and 6% at the 90th percentile.

---

## 4. Spin rate and serve type

- **What serve spin looks like.** High-speed cameras at 1,000–3,000 fps, used on 8 top-50 men in 2009, found **1,000–3,500 rpm on first serves and 3,000–5,000 rpm on second serves** [S43, Established]. The same authors note that a 1,200 fps consumer camera sees 15° of rotation per frame at 3,000 rpm but at very low resolution [S43].
- **The best systems still struggle.** Against high-speed video, Hawk-Eye's spin estimate showed a bias of −100 ± 542 rpm. A trajectory-model method improved this to 3 ± 223 rpm, but **neither was reliable above 4,500 rpm** [S44, Established]. TrackMan's spin rates agreed well with computer vision, but its **spin axis was unstable** below 3,000 rpm. Even above 3,000 rpm, the SD of its axis error was larger than the average axis difference between slice and kick serves [S45, Established].
- **Phone arithmetic** [Our inference]. At 240 fps, 3,000 rpm is 50 rev/s, or **75° of rotation per frame**. At 5,000 rpm it is 125° per frame, beyond unambiguous sampling of any seam pattern. The ball is only 4–15 px wide and motion-blurred. **Spin rate is Unavailable** and should be stated as such.
- **Serve type from the trajectory** [Our inference, grounded in S34]. Spin shows up through lift (Magnus) forces that curve the path: topspin dips, sidespin curves sideways, and a kick serve bounces up and sideways. Cross and Lindsey show that trajectory shape is governed mainly by the lift coefficient, which rises roughly linearly with spin [S34]. From behind, lateral curve and post-bounce direction and height are visible, so a coarse **flat / slice / kick-like** classifier is plausible. It is confounded by perspective, serve direction and pace.
- **Toss cues.** Professional kick serves showed a toss apex shifted sideways compared with slice serves, and contact points differing by about 30 cm as seen from the receiver's side [S46, Established, n = 10 professionals]. Recreational players are less consistent, so toss-based inference is weaker [Our inference].
- **Existing validation.** SwingVision labels serves flat/slice/kick [S35]. An independent test in 5 junior players found only "good" (ICC 0.76) agreement for shot rotation [S36]. A second study found agreement depended on camera angle; whether spin differed significantly is UNVERIFIED from its abstract [S37].
- **Recommendation.** **Player-entered intent** (flat / slice / kick) on each serve or block is the primary record. An **Experimental** classifier then shows "looks like slice (low confidence)". Never display rpm.

---

## 5. Placement, serve-in rate and court calibration

### 5.1 Calibration

- **Automatic court detection.** An open-source 14-keypoint court detector reaches 0.963 precision and a 1.83 px median error on broadcast images, with homography post-processing to fix occluded points [S30]. Classical line-model fitting (Hough lines plus combinatorial matching to the court model) dates from 2003 [S31]. A 2024 method adds shadow removal for dirty amateur courts [S32]. **None of these is validated on a phone behind the baseline at an Australian club court.** Worn synthetic-grass lines and shadows are likely failure cases (UNVERIFIED) [Our inference].
- **Recommended approach** [Our inference]: auto-detect, then have the player confirm or drag the four corners of the target service box, plus the centre mark. This is the same minimal four-point homography used by Tennis Serve Speed Tracker [S42]. Store the calibration per session and re-check it every clip for camera bumps using feature tracking.
- **Camera intrinsics.** iOS can attach the camera intrinsic matrix to every frame when we run our own capture session [S61]. Combined with the ground-plane homography, that recovers the full camera pose. This lets us map image rays to court coordinates and treat the vertical plane at the server as a measuring surface [Our inference].

### 5.2 Resolution geometry (one camera behind the server)

Assumptions: 16:9 landscape, horizontal field of view about 70° (vertical about 43°; the exact figure is UNVERIFIED and should be read from the intrinsics), camera 6 m behind the baseline and centred. The far service line is then about 24.3 m away.

| Camera height | Depth covered by 1 px at far service line, 1080p / 4K | Width covered by 1 px, 1080p / 4K | Ball size there, 1080p / 4K |
|---|---|---|---|
| 1.5 m | 29 cm / 14 cm | 1.8 cm / 0.9 cm | 3.8 px / 7.5 px |
| 2.0 m | 21 cm / 10 cm | 1.8 cm / 0.9 cm | 3.8 px / 7.5 px |
| 3.0 m | 14 cm / 7 cm | 1.8 cm / 0.9 cm | 3.8 px / 7.5 px |

Depth per pixel is (D² + h²)/h multiplied by the angle per pixel [Our inference]. Consequences:
- **Lateral placement (T / body / wide) is precise. Depth ("long?") is 10–20 times coarser.** Raising the phone to fence height helps, which is why SwingVision sells fence mounts and a raised "Swing Stick" [S35].
- **Prefer 4K for placement.** At 1080p the far ball is under 4 px. The iPhone 17 records 4K at 24/25/30/60 fps [S51], so **4K60 is the default "stats" mode**.
- At the server (6 m), 1 px at 1080p is about 0.4 cm. The player, 1.8 m tall, fills about 38% of the frame height, which meets Apple's one-third guidance [S1].

### 5.3 Bounce and outcome

- **Bounce detection:** find the vertical-velocity sign change or kink in the fitted track, then intersect the pre-bounce and post-bounce fits. The audio bounce cue helps but is often missed [S40].
- **In or out:** decide from the bounce point relative to the service-box polygon, with an uncertainty ellipse from 5.2. Show "too close to call" when the ellipse crosses a line.
- **Faults into the net:** the track ends or reverses before the net plane. This is easy to detect [Our inference].
- **Expected accuracy (our estimate, to validate):** at least 95% correct in/out calls for bounces more than 30 cm from a line, 90% or better agreement on zone, and no automatic verdict inside about ±20–30 cm of the long line at 2 m height.

---

## 6. Serve mechanics: metric-by-metric method, prerequisites, error and confounds

The reference values below come from advanced or elite players and should be read as context, not targets:
- Front-knee flexion at loading: 54.1 ± 11.7° (foot-up) and 65.5 ± 12.6° (foot-back) [S49, Established, as compiled by Kovacs & Ellenbecker].
- Trunk tilt at contact: about 48 ± 7° above horizontal; shoulder abduction about 100° [S49].
- Impact height: 2.65 ± 0.08 m in 8 advanced male players (ITN 3–4), falling to 2.61 ± 0.06 m after 3 hours of play [S50, Established]. The same study says higher impact increases the margin for error over the net [S50].
- Recreational players, filmed with 2D high-speed video (200 Hz, side view), contacted the ball **13 cm lower** than competitive players [S47, Established but weak: a case study of only 2 hobby and 8 competitive men]. *Corrected 2026-09-27 after reading the full text:*
  - The two "hobby" men were former junior team players, 180 cm tall, serving at 127–142 km/h.
  - Relative to standing height, their contact was about 145–148% vs 149%, not a large gap.
  - The paper's text says their toss varied more, but its tables report only contact points. Within-player contact-height SDs were about 3 cm in both groups.
  - A 2025 companion study of women found recreational players contacting 8.8 cm *higher* than competitive players.

  See `gaps/recreational-reference-ranges.md` §2–3.
- Greater movement variability was associated with lower serve speed and accuracy [S48, Established; correlational, 17 male players × 20 serves, hand motion by 3D tracking].

### 6.1 Serve segmentation and phase timing

- **Method:** detect the start from pose (tossing hand rising) and ball release (the ball separates from the hand keypoint), then find the toss apex (parabola fit), peak knee flexion (pose), contact (ball-velocity discontinuity plus audio onset) and landing (ankle or heel ground contact from vertical velocity).
- **Prerequisites:** fixed camera, full body and toss in frame, 60 fps or more.
- **Error, our estimate:** event times ±1 frame (±17 ms at 60 fps), and contact better than ±5 ms with audio.
- **Confounds:** ball-bounce pre-serve routines, and balls on other courts.
- **Status:** Measured.

### 6.2 Rhythm and tempo

- **What we report:** toss release → contact duration, release → peak knee bend → contact ratios, and their spread across serves.
- **Method:** differences between event times.
- **Error:** ±2 frames on a duration.
- **Status:** Measured. Values are for the player's own trend; we do not claim a "correct" tempo. Any ideal is [Coaching interpretation].

### 6.3 Toss metrics

| Metric | Method | Prerequisites | Expected error (our estimate) | Confounds |
|---|---|---|---|---|
| Apex height (m) | Parabola fit to the ball track. Pixels are converted to metres on the vertical plane through the server's front foot (homography plus intrinsics), or by player height | Toss fully in frame; calibration or player height entered | ±3 cm precision; ±10–15 cm absolute (plane-depth assumption: the ball is often 0.2–0.6 m in front of the feet) | Camera tilt, lens distortion (0.5× lens), ball leaving the frame |
| Apex above contact (cm) | Apex minus contact height | As above | ±5 cm (shared scale error mostly cancels) | Wrongly detected contact frame |
| Lateral position vs body | Apex x relative to the front-foot or mid-hip keypoint, **behind view** | Behind view | ±5 cm | Body rotation and occlusion by the arm |
| Forward position (into court) | Apex relative to the baseline or front foot, **side view** (or estimated from behind using the bounce-plane geometry) | Side view for Estimated status | ±5–10 cm side; ±20 cm+ behind | Perspective |
| **Toss consistency** | Spread (SD or 95% ellipse) of apex position across serves, normalised by player height | Fixed camera for the whole block | Robust: constant biases cancel | Camera bump mid-session (detect it) |

Status: consistency is **Measured** (relative units). Absolute heights and offsets are **Estimated**.

### 6.4 Contact height and position

- **Method:** the ball centroid in the last pre-contact frame, where the ball is almost stationary at the top of the toss, interpolated to the audio contact time. The wrist keypoint is a secondary cue, since it is often blurred.
- **Outputs:** height in metres and as a percentage of the entered standing height. From behind: lateral offset from the body. From the side: forward offset from the baseline and front foot.
- **Error, our estimate:** ±5–10 cm absolute; ±3 cm serve to serve.
- **Confounds:** racket occluding the ball, wrong contact frame on mishits, and jumps where the player leaves the ground.
- **Status:** Estimated (absolute), Measured (consistency).

### 6.5 Knee flexion (loading)

- **Method:** 2D angle between the hip→knee and knee→ankle segments at the frame of minimum hip height or maximum flexion.
- **View:** for a right-hander standing side-on, the camera behind the server sees the loading phase roughly side-on (the player's right side), so the knee bend is largely in the image plane. The side-fence camera sees the chest and foreshortens the knee [Our inference from court geometry].
- **Expected error:** ±5–10° in the best in-plane case [S14][S15]. **±10–20° when the knee points diagonally** [S16][S17].
- **Product:** report a band (for example "little bend (<20°) / moderate / deep (>45°)") plus a trend. Show degrees only with a "±" and confidence.
- **Confounds:** foot-up versus foot-back stance, loose shorts or skirts, the far-side knee hidden.
- **Status:** Estimated, with category-level claims only.
- *Confirmed and quantified (gap study, 27 Sep 2026; `gaps/side-view-geometry-contradictions.md` §2–3).*
  - **Geometry.** Measured front-foot angles are 31–40° to the baseline, and the shoulders turn 106–121° from square at maximum preparation. At the trophy position the knees therefore sit about 50–90° out of the side-fence image plane and 0–40° out of the rear plane.
  - **Simulated three-level band.** From the side fence the raw 2D angle reads 17–36° low on average, with 47–80% of serves in the wrong band. From the raised rear view, the nearer (back) knee has 11–13% in the wrong band. The front knee, partly hidden behind it, has 20–39%.
  - **Side-view alternative.** A view-independent estimate from the vertical heights of the thigh and shank supports only a two-level "deep bend: yes/no" (about 14% wrong).

### 6.6 Trunk inclination and shoulder tilt

- **At contact:** lateral trunk tilt (behind view, where contact is roughly seen from the back) and forward lean into the court (side view). Both come from the mid-hip → mid-shoulder vector against vertical.
- **At trophy:** shoulder-line tilt is best from the side-fence view, which faces the chest.
- **Error:** ±5–10° in plane; shoulder keypoints are the least reliable [S17].
- *Correction (gap study, 27 Sep 2026; `gaps/side-view-geometry-contradictions.md` §4).*
  - **Forward lean at contact is contaminated in the side view.** At contact the shoulder line sits 6–25° past square [Fett et al. 2021]. On the court half nearer the camera (deuce for a right-hander), a 30–48° shoulder-over-shoulder tilt leaks into the side-view reading, so a true 20° forward lean reads 2–8°. On the far half the reading is within about 3°.
  - **Shoulder-over-shoulder at contact is rear-view only.** The side view reads a true 48° as 69–84°.
  - **No reference value matches the 2D angle.** The mid-hip → mid-shoulder angle against vertical is an absolute angle. The pooled "trunk inclination" of 25 ± 7° is side bend relative to the pelvis, and the definition of Fleisig's 48° is unresolved.
- **Status:** Estimated.

### 6.7 Landing distance and pattern

- **Method:** landing-foot ground contact projected to court coordinates.
- **Critical detail** [Our inference]: projecting the **ankle** keypoint, which sits about 8 cm above the ground, from a camera 2 m high and 6–7 m away shifts the landing point about 25–30 cm too far into the court. We must use heel or toe points (MediaPipe has them; Apple Vision 2D does not [S1][S4]) or apply a fixed correction.
- **Depth resolution** near the camera is good: about 2 cm per px at 1080p.
- **Error:** ±10 cm with heel points.
- **Status:** Estimated. Labelled Experimental until validated, because the norms for recreational players are UNVERIFIED.

### 6.8 Stance type (foot-up / foot-back) and landing foot

Classified from ankle and heel trajectories before take-off. Expected to be reliable from either view (our estimate, ≥90% agreement to validate). Status: Estimated → Measured after validation.

### 6.9 Racket-arm mechanics

Racket drop depth, shoulder external rotation (172 ± 12° in elite players [S49]), forearm pronation and racket-head speed are all out of reach:
- They are mostly rotations about the arm's long axis, which cannot be seen in 2D.
- The racket is not a keypoint.
- The arm blurs at the critical moments [S23].
- Even marker-based systems have wide uncertainty for these angles [S22].

Status: **Unavailable** (qualitative coach review of key frames only).

---

## 7. One camera or two

### 7.1 Recommended single view: behind the server, raised

- **Setup:** phone on a tripod or fence clip about 5–6 m behind the baseline, centred behind the server, lens 1.5–3 m high (higher is better), landscape, 1× lens, level.
- **Coverage:** in the geometry above, it frames the server from feet to about 4.3 m and the whole far court.
- **What this view gives:**
  - serve outcome and placement (lateral precise, depth coarse)
  - toss lateral position and toss consistency
  - contact height and lateral position
  - loading knee bend (roughly in-plane)
  - rhythm and timing
  - landing position
  - estimated average speed
- **Why this view:** it is the only single view that delivers both the statistics (outcome, placement, speed) and useful mechanics. That fits the brief's requirement that statistics are central to the first experience [Our inference].
- **Left-handers:** everything mirrors automatically once handedness is entered.

### 7.2 What a second, side view unlocks

- A **side view** from the side fence, level with the baseline, about 1.2–1.5 m high, facing the server's chest adds:
  - toss forward/back position and contact point in front of the baseline, both key coaching variables that the behind view cannot see well
  - forward trunk lean at contact
  - shoulder tilt at trophy
  - landing distance measured directly
  - Experimental near-contact speed at 240 fps (3.3C)
  - a clearer racket-drop silhouette for qualitative review
- **Two synchronised views** allow **triangulation**, which removes the plane assumptions from toss and contact positions. Error drops from about ±10–15 cm to about ±3–5 cm (our estimate) and a 3D ball trajectory becomes well posed.
- **Sync** from the shared contact sound: each audio stream timestamps the impact to within about 1 ms after correcting for known distances [Our inference].
- **Cost:** a second phone and more setup friction.
- **Product stance:** one view by default; a second view is optional (a friend's phone or an old phone).

---

## 8. Recording guidance the product should enforce

| Guidance | Setting | Why |
|---|---|---|
| Mode | Our own capture session (not Camera app slo-mo) | Control of exposure, true timestamps and intrinsics [S59][S60][S61] |
| Resolution / fps | **Stats mode: 4K60.** **Timing mode: 1080p120** (240 when speed or near-contact detail matters, in daylight) | Far-court ball size vs timing precision (sections 2.2, 3.2, 5.2) |
| Shutter | Daylight: cap at 1/1000 s or shorter via custom exposure. Night: shortest exposure that keeps the image usable, run the flicker check (9.6), and warn | Ball blur 4 cm at 1/1000 s vs 74 cm at 1/60 s (160 km/h) |
| Position | 5–6 m behind baseline, centred, 1.5–3 m high, level; sun behind the camera if possible | Sections 5.2 and 7.1. Apple's one-third subject-height guidance [S1] |
| Framing check | Live overlay: feet to above toss visible, both far service boxes visible, calibration corners found | Enforces prerequisites before recording |
| Serves per block | Our suggestion: at least 10 serves per condition (for example 10 first serves to the deuce court) for consistency and serve-in estimates; 20 or more for trend claims | A serve-in % from 10 serves has a 95% CI of about ±30 points; from 30 serves about ±17 points (binomial) [Our inference] |
| Environment | No other players in frame if possible; avoid a busy adjacent court for audio | Pose locks onto one person [S3][S5]; audio confounds [S40] |

---

## 9. iPhone capture realities

### 9.1 Formats and frame rates

- **iPhone 17:** 4K at 24/25/30/60 fps, 1080p at 25/30/60 fps, **slo-mo 1080p at 120 or 240 fps**, HEVC or H.264 [S51].
- **Current Pro model:** as of 27 September 2026, Apple Australia's line-up lists the iPhone 18 Pro (the iPhone 17 Pro page now redirects), alongside iPhone 17, iPhone 17e, iPhone Air and iPhone Duo. The iPhone 18 Pro records 4K Dolby Vision at up to 100 or 120 fps and slo-mo at 1080p up to 240 fps, but only on the main (Fusion Main) camera [S52].
- **In our own capture session:** high-frame-rate formats are chosen by searching `videoSupportedFrameRateRanges`, then setting `activeFormat` and the min/max frame duration [S59].

### 9.2 Slo-mo files from the Photos library

- **How to recognise them.** Slo-mo assets carry `PHAssetMediaSubtype.videoHighFrameRate` [S53].
- **How they are delivered.** `PHImageManager.requestAVAsset` returns an `AVAsset`, possibly with an audio mix [S55]. Developers widely report that for slo-mo this is an **`AVComposition`** whose track segments **time-map** the slowed section, i.e. source and target time ranges differ [S56]. This is the mechanism behind the slow-motion playback ramp. (That slo-mo specifically comes back as an `AVComposition` is UNVERIFIED in Apple's docs; test it on devices.)
- **Get the unadjusted asset.** Request `PHVideoRequestOptions.version = .original` [S54]. In `PHPicker`, set `preferredAssetRepresentationMode = .current` to avoid transcoding; `.compatible` may transcode [S57].
- **Read the true capture rate from timestamps.** `nominalFrameRate` is only nominal, and the synchronous property is deprecated in favour of async `load(.nominalFrameRate)` [S58]. Always compute the true rate from per-sample presentation timestamps (the median of the differences) and handle **variable frame rate**, where iPhone auto-exposure can lower the frame rate in low light (UNVERIFIED on current models; test).
- **Never compute speed from a clip that has been rendered at playback speed.** Reject assets whose timestamp rate does not match the metadata.

### 9.3 Exposure control

- **What we can set.** `setExposureModeCustom(duration:iso:)` fixes shutter time and ISO within the active format's limits. Exposure changes can alter the permitted frame durations [S60].
- **Daylight:** 1/1000–1/4000 s is achievable at modest ISO in Australian sun [Our inference].
- **Night courts:** lighting forces longer exposures or higher ISO, which means more noise, and pose confidence drops [S5]. Show a quality badge and widen the uncertainty bands at night.

### 9.4 Motion blur

See the streak table in 2.2.
- **Ball:** detection tolerates streaks (TrackNet was designed for blurred, "afterimage" balls [S24]), but position error grows with streak length unless the streak's centre line is fitted.
- **Hitting arm:** at wrist speeds of roughly 10 m/s or more near contact (UNVERIFIED for recreational players), a 1/60 s exposure smears the wrist over about 15 cm or more. Keypoints then jump to the blur centroid [S23] [Our inference].

### 9.5 Rolling shutter

- **Mechanism.** CMOS phone sensors read rows sequentially, so fast objects skew and timing varies by image row [S68].
- **At 240 fps** the readout must fit within about 4.2 ms, which bounds the row-to-row timing error.
- **At 30 fps** the readout may take much longer (UNVERIFIED per model).
- **Impact on speed.** Contact (upper image) and bounce (mid-image) are sampled at different effective times. The bias is a few milliseconds, well under 1% of flight time at 120 fps or more. It is small but systematic, so correct with a row-time model once readout time is measured by filming a flicker source or a known rotating target [Our inference].

### 9.6 100 Hz flicker under Australian lighting

- **The cause.** Australia's mains is 230 V / 50 Hz [S66]. Many lamps modulate light output as the AC waveform swings, which gives light pulses at twice the mains frequency (100 Hz). The amount depends on the lamp and LED driver design [S67] [Established physics; stated for Australia as Our inference].
- **At 30, 60, 120 or 240 fps with a short shutter,** successive frames sample different phases of the 100 Hz cycle, so brightness pulses and rolling-shutter banding appear. Frame rates that divide evenly into 100 Hz (25/50/100 fps) sample the same phase every frame [Our inference].
- **Anti-flicker exposures** that are multiples of 10 ms (1/100 s) remove pulsing but produce 44 cm streaks at 160 km/h.
- **Product response:** measure mean frame brightness over about 1 s, run an FFT, and flag the 100 Hz component. It aliases to 20 Hz at 60 or 120 fps and to 10 Hz at 30 fps, and appears un-aliased at 100 Hz at 240 fps. (An earlier draft said "40 Hz at 240 fps"; that was an arithmetic error.) If flicker is present, switch to a frame rate that divides evenly into 100 Hz (25, 50 or 100 fps, where the device format allows it), keep the shortest usable exposure, and widen the ball-detection threshold. **Falling back to 60 fps does not remove the flicker** [Our inference, corrected in fact-check].
- Modern flicker-free LED sports lighting will not show this. Club lighting stock is UNVERIFIED.

### 9.7 HEVC decoding and the web prototype

- **Browser support:**
  - WebCodecs `VideoDecoder` has shipped in Safari since 16.4 (partial) and is fully supported from Safari 26 on macOS and iOS [S62][S63].
  - `AudioDecoder` arrived in Safari 26 [S64].
  - `requestVideoFrameCallback`, which gives per-frame media time during playback, is in Safari 15.4+ [S65].
  - Chrome supports `VideoDecoder` from version 94 [S63].
- **Frame-accurate pipeline for the prototype:** demux the MP4 or MOV in JavaScript (for example mp4box.js), feed encoded chunks to `VideoDecoder`, and use each `VideoFrame.timestamp` as ground truth. Probe HEVC support per device with `VideoDecoder.isConfigSupported` (HEVC in WebCodecs on each Safari and Chrome version is UNVERIFIED). Fall back to H.264 capture or server-side decoding.
- **Avoid:** seeking `video.currentTime` frame by frame, which is inexact, and treating `requestVideoFrameCallback` during 1× playback as complete, since it can skip frames.
- **Uploads from iOS Safari's file picker** may be re-encoded to a "compatible" format (UNVERIFIED). Detect it from the timestamp analysis in 9.2.

---

## 10. Feasibility matrix

Status key:
- **Measured:** directly computed from the footage, validated error small relative to the decision it drives.
- **Estimated:** model-based, with a displayed ± band.
- **Player-entered:** comes from the user.
- **Experimental:** shown only with an "experimental" tag until the validation in section 11 passes.
- **Unavailable:** not shown.

Accuracy figures are **our estimates** unless a source is cited.

| # | Metric | Method | Prerequisites | Expected accuracy | Product status (v1) | Validation approach |
|---|---|---|---|---|---|---|
| 1 | Serve detected / count | Pose (toss-arm rise) + ball release + audio impact | Fixed camera; server in frame | ≥98% detection | **Measured** | Manual count on 300+ serves; precision/recall |
| 2 | Phase timestamps (release, apex, peak knee bend, contact, landing) | Ball track + pose + audio onset | ≥60 fps; full body and toss in frame | ±1 frame (±17 ms at 60 fps); contact ±5 ms with audio | **Measured** | Two annotators mark key frames on 240 fps reference; Bland–Altman in ms |
| 3 | Rhythm (release→contact; phase ratios; variability) | Differences of #2 | As #2 | ±2 frames | **Measured** | As #2 |
| 4 | Outcome: net / long / wide / in | Ball track vs calibrated service box; ends of track | Behind view, raised; box corners calibrated; ≥60 fps (4K preferred) | ≥95% for bounces >30 cm from lines; "too close to call" inside the uncertainty ellipse | **Measured** (clear cases) · **Player-entered** fallback | Annotated video from a second high camera plus on-court observer; confusion matrix by distance from line |
| 5 | First-serve-in % / second-serve-in % | Aggregate of #4 plus first/second tag (sequence rule or player tag) | As #4 | Exact when #4 is correct; show n and CI | **Measured** (with n) | As #4 |
| 6 | Placement zone (T / body / wide; deuce/ad) | Bounce x in court coordinates | As #4 | ≥90% zone agreement | **Estimated** | Observer and annotated ground truth |
| 7 | Bounce coordinates / depth | Homography of fitted bounce point | As #4; camera ≥2 m high helps | Lateral ±5–10 cm; depth ±20–40 cm (1080p, 2 m height) | **Estimated** (error ellipse) · **Experimental** for depth | Chalk or clay marks or targets measured with tape; compare |
| 8 | Average ball speed (contact→bounce) | 3D contact and bounce endpoints ÷ flight time | Calibrated court; ≥60 fps; contact and bounce both seen | RMS about ±4–5%, worst about ±8–10% | **Experimental → Estimated** after validation | Radar placed behind the server in line with the serve (±1 mph device [S69]); 200+ serves across speeds; bias and 95% LoA; also compare against published SwingVision-style average |
| 9 | Estimated speed off racket (radar-equivalent) | #8 ÷ 0.83 (drag model [S33]) | As #8 | Adds ±2–3% | **Experimental** (always shown as a range) | Same radar data; check ratio stability |
| 10 | Near-contact speed (side, 240 fps) | Ball displacement over first 3–6 frames, in-plane scale | Side view; 240 fps; daylight; short exposure | ±5–8% | **Experimental** | Radar as #8 |
| 11 | Spin rate (rpm) | Not feasible (needs ≥1,000 fps with a marked ball, or Hawk-Eye/TrackMan) [S43][S44][S45] | — | — | **Unavailable** | — |
| 12 | Serve type (flat / slice / kick) | Player intent; optional trajectory classifier (lateral curve, bounce kick) | Behind view | Unknown; likely coarse | **Player-entered** · classifier **Experimental** | Player intent vs coach label vs classifier; kappa |
| 13 | Net clearance | 3D trajectory model through contact and bounce, crossing net plane | Behind view calibration; better with side view | ±15–30 cm (1 view) | **Experimental** | Side camera at net post as reference |
| 14 | Toss apex height | Parabola fit; vertical-plane scale from calibration or player height | Toss in frame; height entered | ±3 cm precision; ±10–15 cm absolute | **Estimated** | 3 m calibration pole beside the server; side-view reference |
| 15 | Toss lateral / forward offset | Apex vs body or baseline | Behind (lateral), side (forward) | ±5 cm lateral; forward ±5–10 cm (side) / ±20 cm+ (behind only) | **Estimated** (forward = **Experimental** from behind view) | Two-view triangulation as reference |
| 16 | **Toss consistency** | SD or ellipse of apex across serves, normalised | Fixed camera for block; ≥8 serves | Robust (bias cancels); precision about ±1–2 cm | **Measured** (relative units) | Test–retest on same player; synthetic perturbation of camera position |
| 17 | Contact height (m, % of stature) | Ball at contact frame, vertical-plane scale | Height entered; calibration | ±5–10 cm absolute | **Estimated** | Pole or triangulation; compare to 200 Hz side reference |
| 18 | Contact position (lateral / in front) | Ball vs body keypoints or baseline | Behind (lateral), side (forward) | ±5–10 cm | **Estimated** | As #15 |
| 19 | Contact consistency | Spread of #17–18 across serves | Fixed camera | Robust | **Measured** (relative) | Test–retest |
| 20 | Peak front-knee flexion | 2D joint angle at max flexion | Behind view (roughly in-plane); full legs visible | ±10–15° typical; up to ±20° off-plane [S16][S17] | **Estimated** (category bands) | Compare with two-view triangulated angle and with IMU or mocap in a lab subsample |
| 21 | Trunk tilt / lean at contact; shoulder tilt at trophy | 2D segment angles | Behind (lateral tilt), side (forward lean, shoulder tilt) | ±5–10° | **Estimated** | As #20 |
| 22 | Landing distance / position | Heel or toe ground contact → court coordinates | Calibration; heel points (MediaPipe) or ankle correction | ±10 cm | **Estimated → Experimental** until validated | Tape-measured landing marks |
| 23 | Stance (foot-up / foot-back) | Classifier on foot trajectories | Either view | ≥90% (to validate) | **Estimated** | Coach labels |
| 24 | Serve repeatability index | Composite of #3, #16, #19 variability | As components | Relative only | **Measured** (relative) | Correlation with coach-rated consistency |
| 25 | Racket drop, shoulder external rotation, pronation, racket-head speed | Not observable in 2D; racket not tracked | — | — | **Unavailable** (qualitative key-frame review only) | — |
| 26 | Serve outcome in match context (points won) | Not in scope for solo practice | — | — | **Player-entered** | — |
| 27 | Pain / discomfort | Never inferred from video | — | — | **Player-entered** → referral message | — |

---

## 11. Validation plan (accuracy as a product requirement)

### 11.1 Sample and conditions

**Clip library.** At least 30 players across UTR 1–7, men and women, including at least 5 left-handers. At least 20 serves per player per condition. This gives about 1,500 or more serves.

**Test matrix:**
- frame rate (30/60/120/240) × resolution (1080p/4K)
- camera height (1.2 / 2 / 3 m) × distance (4 / 6 m) × view (behind / side / both)
- lighting: sun behind camera, sun into lens, overcast, night under LED and older lights
- surface: hard court, synthetic grass (common at Australian clubs; UNVERIFIED), clay if available
- clothing: fitted vs loose
- adjacent-court activity

### 11.2 References

| Metric group | Reference |
|---|---|
| Speed | Radar or Pocket-Radar-class device (±1 mph spec [S69]) placed directly behind the server in line with the serve to minimise cosine error. Log every serve |
| Placement and outcome | High second camera (fence or ladder at 3–4 m) plus a line judge. Chalk marks or clay imprints measured with tape for a subset |
| Toss and contact | Calibrated vertical poles in the frame. 240 fps side and behind cameras triangulated |
| Joint angles | Two-view triangulation for all clips. For a subset of 8–10 players, a lab session with marker-based or IMU capture, remembering that the reference itself has serve-specific uncertainty [S22] |
| Events | Two independent annotators on 240 fps footage, with inter-rater agreement reported |

### 11.3 Statistics and acceptance thresholds (proposed)

**Statistics to report:**
- bias and 95% limits of agreement (Bland–Altman)
- MAE and ICC(2,1)
- detection precision and recall
- **coverage**: the percentage of serves for which a metric is produced, because silent drop-outs flatter accuracy

**Acceptance thresholds before a metric loses its "Experimental" tag:**

| Metric | Threshold |
|---|---|
| Speed | MAE ≤5% and 95% LoA within ±10% at 60 fps. Fulltrack's cricket result [S38] suggests this is attainable but not assured |
| In/out | ≥95% correct for bounces more than 30 cm from lines |
| Zone | ≥90% agreement |
| Toss apex | MAE ≤10 cm |
| Contact height | MAE ≤10 cm |
| Knee band | ≥80% agreement with the three-level category |
| Event timing | ≤1 frame MAE |

### 11.4 Honest reporting

- Publish a plain-English "How accurate is this?" page per metric, with error bands and failure cases.
- Show per-clip quality flags: low light, flicker, subject too small, calibration drift, occlusion.
- Suppress a metric rather than show a guess when prerequisites fail.

---

## Implications for the product

In priority order:

1. **Lead the first experience with timing and consistency.** Toss consistency, contact consistency, rhythm and serve count are Measured, robust and coachable. Pair them with clear-case serve-in % from the behind view.
2. **Make the behind-the-server, raised, 4K60 view the default,** with a live framing checklist (feet to above the toss, both far service boxes, corners found). It is the one view that powers stats and mechanics together.
3. **Build a native capture session in the iOS app** rather than relying on Camera-app footage:
   - custom exposure capped at 1/1000 s or shorter in daylight
   - true timestamps
   - per-frame intrinsics
   - flicker detection at night, with a fallback to a 100 Hz-compatible frame rate (25/50/100 fps), since 60 fps still beats against 100 Hz flicker

   In the web prototype, decode with WebCodecs and read frame timestamps. Never use playback time.
4. **Ship speed as "estimated average speed ± band" with an Experimental tag.**
   - Correct audio for sound travel time.
   - Show an estimated radar-equivalent figure only as a range.
   - Run the radar validation before removing the tag.
   - Never show decimals or rpm.
5. **Record serve type as player-entered intent.** Offer the trajectory-based "looks like slice or kick" as Experimental. Mark spin rate Unavailable in the UI and explain why in one line.
6. **Show placement with an uncertainty ellipse.** Report zone (T / body / wide) confidently and depth cautiously, and render "too close to call" instead of a verdict near lines.
7. **Present body angles (knee bend, trunk tilt) as bands and trends, with key-frame overlays as evidence,** not as precise degrees. Keep racket-arm rotations out of automated claims.
8. **Choose the pose engine by benchmark.** Start with Apple Vision 2D. Evaluate MediaPipe (it has heel and toe points, which landing metrics need) and RTMPose-CoreML on our own labelled serve clips, and budget for fine-tuning on serve footage [S21].
9. **Offer the second (side) view as an optional "Pro setup".** It unlocks toss forward position, contact in front, forward lean, landing distance directly, and Experimental near-contact speed. Sync the two views from the contact sound.
10. **Treat validation as a launch gate:** the 30-player, roughly 1,500-serve library, radar, and a published accuracy page. Keep per-metric coverage and quality flags in the data model from day one.

## Open questions

1. How does TrackNet-class ball tracking perform on amateur behind-baseline phone footage? Every published figure is from broadcast views. We need our own labelled set.
2. What is the real horizontal field of view, readout time and flicker behaviour of the iPhone main and ultra-wide cameras in 4K60 and 1080p240 modes? All three need measuring per model; the stabilisation crop changes the field of view.
3. Do Apple Vision 2D keypoints outperform MediaPipe or RTMPose on blurred serve frames, and by how much? Apple publishes no accuracy data.
4. Is the average-to-initial speed ratio (about 0.83) stable enough across recreational serves, whose spin and trajectories differ from the model's assumptions, to justify a radar-equivalent display?
5. How often can recreational players realistically mount a phone 2–3 m high at Australian club courts (fence height, clip availability, club rules)? What is the accuracy penalty at 1.2 m on a ground tripod? SwingVision's April 2026 "Ground Mode" suggests low mounts are commercially important [S35].
6. How common are worn lines on synthetic-grass courts, and 50 Hz-modulated night lighting, at Australian clubs? Both affect calibration and high-fps capture (UNVERIFIED).
7. Can a trajectory-based serve-type classifier reach useful agreement (κ ≥ 0.6) with coach labels for UTR 1–7 players, whose kick serves may carry little spin?
8. For iOS slo-mo library imports, is `.original` plus `.current` enough to always recover the native 240 fps frames on current iOS? Does the iOS Safari file picker transcode? Both need device tests.

---

## Sources

All accessed 2026-09-27 unless noted.

- **[S1]** Apple Inc. *Detecting Human Body Poses in Images* (Vision documentation). 2020–2026. https://developer.apple.com/documentation/vision/detecting-human-body-poses-in-images (read via Apple's JSON documentation endpoint).
- **[S2]** Apple Inc. *VNDetectHumanBodyPoseRequest*. https://developer.apple.com/documentation/vision/vndetecthumanbodyposerequest
- **[S3]** Apple Inc. *Identifying 3D human body poses in images* / *VNDetectHumanBodyPose3DRequest*. 2023–2026. https://developer.apple.com/documentation/vision/identifying-3d-human-body-poses-in-images
- **[S4]** Google AI Edge. *Pose landmark detection guide (MediaPipe Pose Landmarker)*. https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker
- **[S5]** Google. *Model Card: BlazePose GHUM 3D* (PDF). https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf
- **[S6]** Bazarevsky V. et al. *BlazePose: On-device Real-time Body Pose Tracking*. arXiv:2006.10204, 2020. https://arxiv.org/abs/2006.10204
- **[S7]** TensorFlow Blog. *Next-Generation Pose Detection with MoveNet and TensorFlow.js*. May 2021. https://blog.tensorflow.org/2021/05/next-generation-pose-detection-with-movenet-and-tensorflowjs.html
- **[S8]** Jiang T. et al. *RTMPose: Real-Time Multi-Person Pose Estimation based on MMPose*. arXiv:2303.07399, 2023. https://arxiv.org/abs/2303.07399
- **[S9]** OpenMMLab. *RTMPose project README* (mmpose). https://github.com/open-mmlab/mmpose/tree/main/projects/rtmpose
- **[S10]** Jiang T. et al. *RTMW: Real-Time Multi-Person 2D and 3D Whole-body Pose Estimation*. arXiv:2407.08634, 2024. https://arxiv.org/abs/2407.08634 (abstract via search listing)
- **[S11]** Xu Y. et al. *ViTPose: Simple Vision Transformer Baselines for Human Pose Estimation*. arXiv:2204.12484, 2022. https://arxiv.org/abs/2204.12484 (abstract via search listing)
- **[S12]** Washabaugh E.P. et al. *Comparing the accuracy of open-source pose estimation methods for measuring gait kinematics*. Gait & Posture 97:188–195, 2022. https://doi.org/10.1016/j.gaitpost.2022.08.008 (abstract figures re-checked against PubMed PMID 35988434 in the fact-check; full text not accessed)
- **[S13]** Wade L., Needham L., McGuigan P., Bilzon J. *Applications and limitations of current markerless motion capture methods for clinical gait biomechanics*. PeerJ 10:e12995, 2022. https://pmc.ncbi.nlm.nih.gov/articles/PMC8884063/
- **[S14]** Wade L. et al. *Examination of 2D frontal and sagittal markerless motion capture: Implications for markerless applications*. PLoS One, 2023. https://pmc.ncbi.nlm.nih.gov/articles/PMC10635560/
- **[S15]** Barzyk P. et al. *AI-smartphone markerless motion capturing of hip, knee, and ankle joint kinematics during countermovement jumps*. European Journal of Sport Science, 2024. https://pmc.ncbi.nlm.nih.gov/articles/PMC11451555/
- **[S16]** Fukushima T., Blauberger P., Guedes Russomanno T., Lames M. *The potential of human pose estimation for motion capture in sports: a validation study*. Sports Engineering 27, 2024. https://doi.org/10.1007/s12283-024-00460-w (abstract via OpenAlex; full text paywalled)
- **[S17]** Baldinger M., Reimer L.M., Senner V. *Influence of the Camera Viewing Angle on OpenPose Validity in Motion Analysis*. Sensors 25(3):799, 2025. https://pmc.ncbi.nlm.nih.gov/articles/PMC11819822/
- **[S18]** Menychtas D. et al. *Gait analysis comparison between manual marking, 2D pose estimation algorithms, and 3D marker-based system*. Frontiers in Rehabilitation Sciences, 2023. https://www.frontiersin.org/journals/rehabilitation-sciences/articles/10.3389/fresc.2023.1238134/full
- **[S19]** Emmerson J., Needham L., Williams S., Colyer S. *Evaluation of a markerless motion capture system for measuring mechanical work during tennis strokes*. Journal of Sports Sciences, 2025. https://researchportal.bath.ac.uk/en/publications/evaluation-of-a-markerless-motion-capture-system-for-measuring-me/
- **[S20]** Boey D., Girard O., Lee M., Elliott B., Reid M. *Accuracy of a video-based markerless motion capture system for in-competition analysis of lower-limb serve kinematics in Grand Slam tennis*. Journal of Biomechanics Open 1(3), 2026. https://doi.org/10.1016/j.jbmo.2026.100024 (bibliographic details confirmed via Crossref; the abstract is absent from Crossref, OpenAlex and Semantic Scholar, so the cited figures are UNVERIFIED)
- **[S21]** Yeung C. et al. *AthletePose3D: A Benchmark Dataset for 3D Human Pose Estimation and Kinematic Validation in Athletic Movements*. CVPR Workshops (CVSports), 2025. https://arxiv.org/abs/2503.07499 (abstract via search listing)
- **[S22]** Ozan S., Fourel L., Touzard P., Kulpa R., Martin C. *Uncertainty estimation in marker-based motion capture of the tennis serve*. Journal of Biomechanics 195:113119, 2025. https://doi.org/10.1016/j.jbiomech.2025.113119 (abstract via OpenAlex)
- **[S23]** Bright J., Chen Y., Zelek J. *Mitigating Motion Blur for Robust 3D Baseball Player Pose Modeling for Pitch Analysis*. arXiv:2309.01010, 2023. https://arxiv.org/abs/2309.01010
- **[S24]** Huang Y.-C., Liao I-N., Chen C.-H., İk T.-U., Peng W.-C. *TrackNet: A Deep Learning Network for Tracking High-speed and Tiny Objects in Sports Applications*. arXiv:1907.03698, 2019. https://arxiv.org/abs/1907.03698
- **[S25]** Chen Y.-J., Wang Y.-S. *TrackNetV3: Enhancing ShuttleCock Tracking with Augmentations and Trajectory Rectification* (ACM MM Asia 2023), official code and results table. https://github.com/qaz812345/TrackNetV3
- **[S26]** Raj A., Wang L., Gedeon T. *TrackNetV4: Enhancing Fast Sports Object Tracking with Motion Attention Maps*. arXiv:2409.14543, 2024. https://arxiv.org/abs/2409.14543
- **[S27]** Apple Inc. *VNDetectTrajectoriesRequest*. https://developer.apple.com/documentation/vision/vndetecttrajectoriesrequest
- **[S28]** Apple Inc. *Building a feature-rich app for sports analysis* (Action & Vision sample). https://developer.apple.com/documentation/vision/building-a-feature-rich-app-for-sports-analysis
- **[S29]** Chen Y., Cai S., Wang Y., Yan J. *Monocular Visual Analysis for Electronic Line Calling of Tennis Games*. arXiv:2107.09255, 2021. https://arxiv.org/abs/2107.09255
- **[S30]** yastrebksv. *TennisCourtDetector* (GitHub README). https://github.com/yastrebksv/TennisCourtDetector
- **[S31]** Farin D., Krabbe S., de With P.H.N., Effelsberg W. *Robust camera calibration for sport videos using court models*. Proc. SPIE 5307, 2003/2004. https://dirk-farin.net/publications/data/Farin2004b.pdf (details via search listing)
- **[S32]** Agrawal S., Sundararajan R., Sagar V. *Accurate Tennis Court Line Detection on Amateur Recorded Matches*. arXiv:2404.06977, 2024. https://arxiv.org/abs/2404.06977
- **[S33]** Cross R. *Ball Trajectories: Factors Influencing the Flight of the Ball* (book chapter 42, University of Sydney physics site; year not stated in PDF, UNVERIFIED). https://physics.usyd.edu.au/~cross/TRAJECTORIES/42.%20Ball%20Trajectories.pdf
- **[S34]** Cross R., Lindsey C. *Tennis Ball Trajectories: The Role of Aerodynamic Drag and Lift in Tennis Shots*. Tennis Warehouse University. https://twu.tennis-warehouse.com/learning_center/aerodynamics2.php
- **[S35]** SwingVision Inc. *Website FAQ, homepage accuracy statements, newsletters (ITF approval 15 Mar 2026; Ground Mode 15 Apr 2026) and web-app shot filters*, text extracted from the site's published JavaScript bundle. https://swing.vision/faq and https://swing.vision/
- **[S36]** Bilić Z., Dukarić V., Šanjug S., Barbaros P., Knjaz D. *The Concurrent Validity of Mobile Application for Tracking Tennis Performance*. Applied Sciences 13(10):6195, 2023. https://www.mdpi.com/2076-3417/13/10/6195 (abstract via Semantic Scholar API; MDPI page returned 403)
- **[S37]** Choe J.-P., Hwang I.-W., Park J.-H., Amo C., Lee J.-M. *How valid is the commercially available tennis match analysis mobile application? Is it good enough?* International Journal of Performance Analysis in Sport 24(1), 2023. https://doi.org/10.1080/24748668.2023.2268475 (abstract via Semantic Scholar and OpenAlex APIs; the abstract does not report which variables differed significantly; publisher page returned 403)
- **[S38]** Shorter K., Tissera K., Huynh M., Benson A. *A comparison of Fulltrack AI application as an alternative to radar gun measured cricket ball delivery speed*. International Journal of Sports Science & Coaching 20:255–263, 2025 (online 1 Oct 2024). https://journals.sagepub.com/doi/10.1177/17479541241284714 (abstract via Semantic Scholar API; the tripod geometry cited in 3.4 is not in the abstract and is UNVERIFIED)
- **[S39]** Tissera K., Shorter K., Huynh M., Benson A. *Reliability and validity of the Fulltrack AI application to determine cricket bowling line and length compared to 3D motion capture*. Sports Biomechanics, 2024. https://doi.org/10.1080/14763141.2024.2381108 (abstract via Semantic Scholar API)
- **[S40]** Caprioli L. et al. *Tennis Timing Assessment by a Machine Learning-Based Acoustic Detection System: A Pilot Study*. Journal of Functional Morphology and Kinesiology 10(1):47, 2025. https://pmc.ncbi.nlm.nih.gov/articles/PMC11843912/
- **[S41]** Zenner A. *Tennis Serve Speed Tracker* (US App Store listing, v12.3, released 28 Aug 2026 per the iTunes Lookup API; app first released 10 Jun 2025). https://apps.apple.com/us/app/tennis-serve-speed-tracker/id6741385759 ; https://itunes.apple.com/lookup?id=6741385759
- **[S42]** Tennis Serve Speed Tracker. *App page*. https://www.tennis-serve.com/app
- **[S43]** Muramatsu T., Ikeda R., Takahashi H., Michikami S., Iwashima T., Umebayashi K. *Ball spin of the serve of world top-50 tennis players at an international tournament* (in Japanese, English abstract). Sports Performance Research 2:220–232, 2010. https://sports-performance.jp/paper/1018/1018.pdf
- **[S44]** Cant O., Kovalchik S., Cross R., Reid M. *Validation of ball spin estimates in tennis from multi-camera tracking data*. Journal of Sports Sciences 38(3), 2020 (online 2019). https://doi.org/10.1080/02640414.2019.1697189 (abstract via Semantic Scholar API)
- **[S45]** Murata M., Takahashi H. *Verification of the accuracy and reliability of the TrackMan tennis radar*. Proc IMechE Part P, 2020/2021. https://journals.sagepub.com/doi/10.1177/1754337120953005 (abstract via Semantic Scholar API)
- **[S46]** Carboch J., Süss V. *Toss differences between the slice serve and the kick serve in tennis*. Acta Gymnica, 2015. https://doi.org/10.5507/ag.2015.012 (abstract via Semantic Scholar API)
- **[S47]** Carboch J., Hrychová D. *Flat serve success in the relationship to the serve toss and racket-ball impact of competitive and hobby tennis players: A case study*. International Journal of Sport, Exercise and Health Research, 2022. https://doi.org/10.31254/sportmed.6208 (abstract via Semantic Scholar API)
- **[S48]** Menayo Antúnez R. et al. *Relationship Between Motor Variability, Accuracy, and Ball Speed in the Tennis Serve*. Journal of Human Kinetics, 2012. https://doi.org/10.2478/v10078-012-0043-3 (abstract via Semantic Scholar API)
- **[S49]** Kovacs M., Ellenbecker T. *An 8-Stage Model for Evaluating the Tennis Serve*. Sports Health 3(6), 2011. https://pmc.ncbi.nlm.nih.gov/articles/PMC3445225/
- **[S50]** Martin C. et al. *Influence of a Prolonged Tennis Match Play on Serve Biomechanics*. PLoS ONE, 2016. https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0159979
- **[S51]** Apple Inc. *iPhone 17 – Technical Specifications (Australia)*. 2025. https://www.apple.com/au/iphone-17/specs/
- **[S52]** Apple Inc. *iPhone 18 Pro and 18 Pro Max – Technical Specifications (Australia)*. 2026. https://www.apple.com/au/iphone-18-pro/specs/ (replaces the original iPhone 17 Pro link, which now redirects to https://www.apple.com/au/iphone/)
- **[S53]** Apple Inc. *PHAssetMediaSubtype.videoHighFrameRate*. https://developer.apple.com/documentation/photos/phassetmediasubtype/videohighframerate
- **[S54]** Apple Inc. *PHVideoRequestOptionsVersion*. https://developer.apple.com/documentation/photos/phvideorequestoptionsversion
- **[S55]** Apple Inc. *PHImageManager.requestAVAsset(forVideo:options:resultHandler:)*. https://developer.apple.com/documentation/photos/phimagemanager/requestavasset(forvideo:options:resulthandler:)
- **[S56]** Apple Inc. *AVComposition*. https://developer.apple.com/documentation/avfoundation/avcomposition
- **[S57]** Apple Inc. *PHPickerConfiguration.AssetRepresentationMode*. https://developer.apple.com/documentation/photosui/phpickerconfigurationassetrepresentationmode
- **[S58]** Apple Inc. *AVAssetTrack.nominalFrameRate*. https://developer.apple.com/documentation/avfoundation/avassettrack/nominalframerate
- **[S59]** Apple Inc. *AVCaptureDevice.Format.videoSupportedFrameRateRanges*. https://developer.apple.com/documentation/avfoundation/avcapturedevice/format/videosupportedframerateranges
- **[S60]** Apple Inc. *AVCaptureDevice.setExposureModeCustom(duration:iso:completionHandler:)*. https://developer.apple.com/documentation/avfoundation/avcapturedevice/setexposuremodecustom(duration:iso:completionhandler:)
- **[S61]** Apple Inc. *AVCaptureConnection.isCameraIntrinsicMatrixDeliveryEnabled*. https://developer.apple.com/documentation/avfoundation/avcaptureconnection/iscameraintrinsicmatrixdeliveryenabled
- **[S62]** Can I use. *WebCodecs API*. https://caniuse.com/webcodecs
- **[S63]** MDN browser-compat-data. *api/VideoDecoder.json*. https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/VideoDecoder.json
- **[S64]** MDN browser-compat-data. *api/AudioDecoder.json*. https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/AudioDecoder.json
- **[S65]** MDN browser-compat-data. *api/HTMLVideoElement.json* (requestVideoFrameCallback). https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/HTMLVideoElement.json
- **[S66]** Wikipedia. *Mains electricity by country* (Australia: 230/400 V, 50 Hz, AS/NZS 3112). https://en.wikipedia.org/wiki/Mains_electricity_by_country
- **[S67]** Wikipedia. *Flicker (light)* and *Utility frequency*. https://en.wikipedia.org/wiki/Flicker_(light) ; https://en.wikipedia.org/wiki/Utility_frequency (the 100 Hz doubling is standard electrical physics and not stated verbatim on these pages)
- **[S68]** Wikipedia. *Rolling shutter*. https://en.wikipedia.org/wiki/Rolling_shutter
- **[S69]** Pocket Radar Inc. *Smart Coach Radar (SR1100) product page*: ±1 mph, 25–130 mph, US$399.99 (about A$569 at the ECB reference rate of US$1 = A$1.4224 on 25 Sep 2026 [S70]; the earlier figure of A$610 used an outdated rate; this is a conversion, not an Australian retail price). https://www.pocketradar.com/products/smart-coach-radar
- **[S70]** Frankfurter API (European Central Bank reference rates). *USD→AUD, 2026-09-25: 1.4224*. https://api.frankfurter.dev/v1/latest?base=USD&symbols=AUD
- **[S71]** Zenner A. *Tennis Serve Speed Tracker* (Australian App Store listing; in-app purchase "Unlock Premium Features" A$14.99). https://apps.apple.com/au/app/tennis-serve-speed-tracker/id6741385759

---

## Verification log (fact-check 2026-09-27)

An independent fact-check re-verified the claims below against primary sources: publisher and PMC/Europe PMC full text, PubMed, Semantic Scholar, OpenAlex and Crossref APIs, Apple's documentation JSON, Apple AU spec pages, vendor pages and published JavaScript, the iTunes Lookup API, MDN browser-compat-data and caniuse data. WebSearch was unavailable (session quota exhausted), so every check fetched a source directly.

| # | Claim (as originally written) | Verdict | Source used / note |
|---|---|---|---|
| 1 | SwingVision: speed "within 10%" with its ideal setup at 60 fps; average speed about 20% below TV radar; line calls 97% accurate within 10 cm of a line | Confirmed (vendor claim, correctly tagged) | swing.vision published JS bundle (FAQ and homepage strings). The vendor also claims over 99% overall line-call accuracy [S35] |
| 2 | SwingVision ITF approval for line calling (15 Mar 2026) and Ground Mode (15 Apr 2026) | Confirmed as vendor statements; ITF approval **unverified independently** | SwingVision newsletter metadata in the JS bundle. ITF approved-product pages are script-rendered and returned no content |
| 3 | SwingVision categorises serve spin as flat/slice/kick, with no rpm field | Confirmed | The JS bundle has a spin enum of flat, kick, slice and topspin; no rpm or spin-rate field was found |
| 4 | Bilić et al. 2023: 5 elite junior males; speed ICC 0.76–0.80; placement ICC 0.83–0.87; rotation ICC 0.76 | Confirmed | Semantic Scholar abstract, DOI 10.3390/app13106195 |
| 5 | Choe et al. 2023: 6 college players, 4 matches, about 1,065 strokes; "significant differences for bounce zone, spin and speed" | **Corrected** (text rewritten in sections 0, 3.4 and 4) | Semantic Scholar and OpenAlex abstracts confirm the sample and that the optimal angle beat the sub-optimal angle, but neither abstract names which variables differed significantly. That part is now UNVERIFIED |
| 6 | Shorter et al. (Fulltrack): 1,081 deliveries vs Stalker Pro IIs; pace ICC 0.87–0.90, CV 2.6–3.1%, overestimate 0.72–0.77 m/s; LoA exceeded the 3% allowable difference | Confirmed. Citation details added (vol. 20, pp. 255–263, 2025) | Semantic Scholar abstract, DOI 10.1177/17479541241284714. The tripod geometry (1.66 m, 4 m) is not in the abstract and is marked UNVERIFIED |
| 7 | Tissera et al.: 836 deliveries vs 3D mocap; ICC > 0.96; SEM 0.05 m (line), 0.47 m (length) | Confirmed | Semantic Scholar abstract, DOI 10.1080/14763141.2024.2381108 |
| 8 | Caprioli et al. 2025: impact detection 81–96%, bounce detection 71–86%, about 9 ms agreement vs 240 fps video; neighbouring courts are the worst noise | Confirmed, with context added (n = 10; groundstrokes only; serve timing not assessed) | PMC11843912 full text |
| 9 | Muramatsu et al. 2010: 8 top-50 men (2009); 1,000–3,500 rpm first serves, 3,000–5,000 rpm second serves; 1,200 fps camera sees 15°/frame at 3,000 rpm | Confirmed | Original PDF (English abstract and Japanese body text, including the EX-F1 1,200 fps passage) |
| 10 | Cant et al. 2020: Hawk-Eye spin bias −100 ± 542 rpm; model 3 ± 223 rpm; neither reliable above 4,500 rpm | Confirmed. Summary wording in section 0 tightened (the ±220 rpm figure is the model method, not Hawk-Eye itself) | Semantic Scholar abstract, DOI 10.1080/02640414.2019.1697189 |
| 11 | Murata & Takahashi: TrackMan spin axis unreliable below 3,000 rpm; axis error larger than the slice–kick difference | **Corrected** (nuance) | The abstract says the axis SD exceeded the slice–kick difference *even above* 3,000 rpm |
| 12 | Kovacs & Ellenbecker 2011: front knee 54.1 ± 11.7° (foot-up) / 65.5 ± 12.6° (foot-back); trunk 48 ± 7°; abduction about 100°; ER 172 ± 12° | Confirmed (values compiled from earlier studies, as the text says) | PMC3445225 |
| 13 | Martin et al. 2016: impact height 2.65 ± 0.08 m, falling to 2.61 m after 3 h | Confirmed; n = 8 (ITN 3–4) and the post-match SD added | PLoS ONE full text |
| 14 | Carboch & Hrychová 2022: recreational players contact 13 cm lower, with greater toss variability; n = 10 | Numbers confirmed; **evidence strength downgraded** (only 2 hobby players vs 8 competitive). *Follow-up 2026-09-27 (full text via the Internet Archive):* the tables report contact points only. The "greater toss variability" claim is not backed by tabulated toss data, and the relative contact height is 145–148% vs 149%. The §6 wording is corrected | Semantic Scholar abstract, DOI 10.31254/sportmed.6208; archived full text http://web.archive.org/web/20250103212816/https://www.sportscienceresearch.com/IJSEHR_202262_08.pdf |
| 15 | Carboch & Süss 2015: kick toss apex shifted sideways vs slice; contact about 30 cm apart; 10 professionals | Confirmed (200 Hz, receiver's view) | Semantic Scholar abstract, DOI 10.5507/ag.2015.012 |
| 16 | Menayo et al. 2012: more movement variability goes with lower speed and accuracy | Confirmed; n = 17 and the correlational design added | PubMed PMID 23486998 |
| 17 | Barzyk et al. 2024: iPhone X 4K60; MAE hip 2.6°, knee 2.1°, ankle 4.5°; r = 0.96/0.99/0.87; n = 11 | Confirmed | Europe PMC full text (Table 1), PMC11451555 |
| 18 | Fukushima et al. 2024: MAE 9.7 ± 4.7° (athletic), 9.0 ± 3.3° (sport); elbow worst; 5 participants | Confirmed; movement count corrected to "8 athletic and 9 sport-specific" | OpenAlex abstract, DOI 10.1007/s12283-024-00460-w |
| 19 | Baldinger et al. 2025: lunges, iPad about 43 fps, four 45° views; RMSE knee 15.5–29.4°, hip 15.2–25.3°, elbow 29.4–37.1°, shoulder 23.6–36.5°; rear views best | Confirmed | Europe PMC full text, PMC11819822 |
| 20 | Wade et al. 2023: sagittal knee bias 1.5 ± 4.1° (camera side), 1.6 ± 6.9° (far side); ankle −8.4 ± 5.2°; frontal ankle ±12° | Confirmed (15 participants, 15-camera Qualisys) | Europe PMC full text, PMC10635560 |
| 21 | Washabaugh et al. 2022: "treadmill gait"; hip 3.7 ± 1.3° (OpenPose), 4.6 ± 1.8° (MoveNet Thunder); knee 5.1 ± 2.5° | Numbers confirmed; **"treadmill" corrected** to walking (the abstract does not specify a treadmill); n = 32 added | PubMed PMID 35988434 |
| 22 | Boey et al. 2026: 6 elite men, 25 serves each; 42 mm mean joint error, 48 mm at trophy | **Unverified** (the paper exists; the figures could not be retrieved) | Crossref confirms authors, journal and 1(3) 2026. No abstract in Crossref, OpenAlex or Semantic Scholar |
| 23 | Emmerson et al. 2025: 16 players; external work bias ≤ 4%; internal work random error ±8–21% from high-frequency artefacts | Confirmed (±8–13% HRNet, ±12–21% OpenPose) | University of Bath research portal abstract |
| 24 | AthletePose3D: MPJPE 214 mm falling to 65 mm after fine-tuning | Confirmed | Semantic Scholar record, arXiv 2503.07499 (CVPRW 2025) |
| 25 | Ozan et al. 2025: marker-based serve joint-angle 95% CIs of 5.1–30.8° | Confirmed | OpenAlex, DOI 10.1016/j.jbiomech.2025.113119 |
| 26 | MediaPipe BlazePose model card: lite/full/heavy speeds on a Pixel 3; PDJ 87.0/91.8/94.2%; people beyond about 4 m and metric depth out of scope; entertainment as primary use | Confirmed | Model card PDF text |
| 27 | Apple Vision 2D: subject ideally ≥ 1/3 of image height; robe-like clothing hurts accuracy; ignore confidence-0 points. Vision 3D: 17 joints or none; most prominent person; 1.8 m reference height without LiDAR | Confirmed | Apple documentation JSON for both articles |
| 28 | MoveNet on iPhone 12 (TF.js WebGL): Lightning 51 fps, Thunder 43 fps; trained on COCO plus Active | Confirmed | TensorFlow blog, May 2021 |
| 29 | RTMPose-m 75.8% AP, 90+ fps on an i7-11700; RTMPose-s 72.2% AP, 70+ fps on a Snapdragon 865 | Confirmed | arXiv 2303.07399 abstract |
| 30 | TrackNet: 99.7% precision / 97.3% recall; 95.3% / 75.7% under 10-fold cross-validation; 640×360 | Confirmed | arXiv 1907.03698 abstract |
| 31 | Cross: Cd ≈ 0.55; drag 7.3 × weight at 60 m/s; lands at about 75% of serve speed; t ≈ 21.5/v₀ from 40 cm in front of the baseline to the far service line | Confirmed | Cross chapter 42 PDF text (eq. 42.a6) |
| 32 | iPhone 17: 4K at 24/25/30/60 fps; 1080p at 25/30/60; slo-mo 1080p at 120/240 fps | Confirmed | apple.com/au/iphone-17/specs |
| 33 | "Current Pro models: 4K at 120 fps" citing the iPhone 17 Pro page | **Corrected / updated** | The iPhone 17 Pro URL now redirects. The iPhone 18 Pro specs list 4K at 100/120 fps and 1080p slo-mo up to 240 fps on Fusion Main only. S52 replaced |
| 34 | WebCodecs VideoDecoder in Safari 16.4 (partial) and fully from Safari 26; AudioDecoder in Safari 26; Chrome 94 | Confirmed ("partial" means video-only) | caniuse data (webcodecs.json); MDN browser-compat-data |
| 35 | Pocket Radar Smart Coach: ±1 mph, 25–130 mph, US$399.99, "about A$610" | Spec and price confirmed; **A$ conversion corrected** to about A$569 | Pocket Radar product page; ECB rate via Frankfurter (US$1 = A$1.4224 on 25 Sep 2026) [S70] |
| 36 | Tennis Serve Speed Tracker: v12.3 dated 28 Aug 2025; 2 ratings; US$9.99 unlock | **Corrected**: v12.3 was released on 28 Aug 2026. A$14.99 on the AU store added | iTunes Lookup API (US and AU); AU App Store listing [S71] |
| 37 | Flicker: "100 Hz alias … 40 Hz at 240 fps"; "fall back to 60 fps" | **Corrected** (arithmetic and recommendation) | Sampling arithmetic: 100 Hz appears un-aliased at 240 fps (Nyquist 120 Hz) and aliases to 20 Hz at both 60 and 120 fps, so 60 fps does not escape it. The recommendation is now 25/50/100 fps. The iPhone 18 Pro's 4K100 mode [S52] shows such rates exist |

**Tag honesty.** The vendor claims (SwingVision, Tennis Serve Speed Tracker) were already labelled [Vendor claim]. Evidence labels were softened for the n = 2 recreational-player case study (S47) and marked as pilot for the n = 10 acoustic study (S40). The Boey et al. figures are now UNVERIFIED. Geometry, resolution, blur, flight-time, sound-delay, binomial CI and spin-per-frame arithmetic were spot-checked and hold within rounding. One exception: the 1.5 m row of the resolution table (5.2) computes to about 29 cm per pixel at 1080p, not 27 cm, and has been corrected. The change does not affect the conclusions.

**Could not verify.** The Fulltrack tripod geometry; the Boey et al. error figures; ITF confirmation of SwingVision's approval; and which variables differed significantly in Choe et al.

**Gap-study corrections (27 Sep 2026; `gaps/side-view-geometry-contradictions.md`).**
- §3.5: added that the bounce is outside a side-view frame, and a simulated error budget.
- §6.5: the knee assignment to the rear view was confirmed and quantified with measured foot and shoulder-turn data.
- §6.6: added that forward lean at contact is contaminated by shoulder-over-shoulder tilt on the camera-side court, and that shoulder-over-shoulder at contact is rear-view only.

No study values were changed.
