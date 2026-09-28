# METRICS.md: metric and event catalogue (v1)

**Status:** v1 specification, revised 27 September 2026 (see the revision log at the end). **Owners:** analysis engine and validation.
**Scope:** how serves are found in a clip, how events and phases are detected, how every number shown to a player is calculated and labelled, the statistics rules behind summaries and "Did it work?", and the validation matrix.
**Machine-readable twin:** `docs/specs/metrics.json`. Code reads ids, names, units, statuses, prerequisites, reference ranges, plausibility bounds and thresholds from the JSON. This file is authoritative for algorithms. If the two disagree, fix both in the same change.

This spec follows `docs/DECISIONS.md` (D1–D11, with D1, D4 and D5 as revised on 27 September 2026). Where it narrows a decision or disagrees with one, it says so in §7 instead of diverging silently.

**Tags.** [Established] = peer-reviewed finding. [Coaching interpretation] = expert practice, not directly proven. [Our inference] = our reasoning or arithmetic. Research is cited as (research NN [Sx]), meaning source x in `docs/research/NN-*.md`. The 27 September gap studies are cited as (gap: geometry §x) for `research/gaps/side-view-geometry-contradictions.md`, (gap: ranges §x) for `research/gaps/recreational-reference-ranges.md`, (gap: segment §x) for `research/gaps/australian-segment-evidence.md` and (gap: coaches §x) for `research/gaps/intuitive-tennis-kovacs-primary-content.md`. Thresholds marked *initial* are starting values. They are tuned on synthetic data (§5) and then frozen before real-footage validation, so validation is not fitted to itself.

**Reading order.** Engine builders: §1, §2, §3. UI and content designers: §0, §1.3, each metric's *Question*, *Status rules* and *Unlock hints*, and §4.5 wording. Validation team: §3 *Validation* fields and §5.

---

## 0. Catalogue at a glance

"Today" is the highest status the engine may emit once a metric has passed synthetic validation (validation level V1, §1.3) in daylight. Every metric is V0 (experimental) until that run passes. "Target" is the status after real-footage validation passes. The first block holds the shared canonical ids used by every spec; the second lists ids this spec adds. Section numbers are kept stable for cross-references, so the new lower-body and rear-view entries sit at §3.27–§3.32.

| id | Player-facing name | Views | Unit shown | Today (V1) | Target | Role |
|---|---|---|---|---|---|---|
| `serve-count` | Serves | side, rear | count | estimated; measured once you confirm the serve strip | measured | Always shown |
| `toss-apex-height` | Toss height | side, rear | × your height; cm | estimated | estimated | Supporting |
| `toss-forward` | Toss in front | side | cm | estimated | estimated | Supporting |
| `toss-drop` | Ball drop before contact | side, rear | cm; ms | estimated | measured (only when σ_Δt ≤ 8 ms) | **Hero 1** (D5) |
| `toss-height-spread` | Toss height consistency | side, rear | cm (SD) | estimated | estimated (measured only after V3) | **Hero 1** (lead, D5) |
| `toss-forward-spread` | Toss front–back consistency | side | cm (SD) | estimated | estimated (measured only after V3) | **Hero 1** (D5) |
| `contact-height-ratio` | Contact height | side, rear | × your height; cm | estimated | estimated | **Hero 2** |
| `contact-forward` | Contact in front | side | cm | estimated | estimated | Supporting |
| `rhythm-release-to-contact` | Toss-to-hit time | side, rear | ms | estimated | measured | **Hero 3** |
| `rhythm-spread` | Rhythm consistency | side, rear | ms (SD) | estimated | measured | **Hero 3** |
| `trophy-pause` | Pause at the top | side, rear | ms | experimental | estimated | Detail |
| `leg-drive` | Leg drive (hip rise) | side | % of height; cm | estimated | estimated | **Hero 5** (D5) |
| `drive-time` | Drive time | side | ms | estimated | estimated | Beside leg drive (trend only) |
| `loading-depth` | Loading (hip dip) | side | description; % of height | estimated (descriptive) | estimated | Description only, never a target |
| `deep-bend-flag` | Deep bend (experimental) | side | yes / no | experimental | experimental | Hidden unless the experimental toggle is on |
| `shoulder-tilt-trophy` | Shoulder tilt at the top | side | band against your own range | estimated | estimated | Band + key frame (D5) |
| `knee-bend-band` | Knee bend | **rear only** | band | experimental | estimated | Rear view band + key frame (D1, D5) |
| `shoulder-over-shoulder-contact` | Shoulder over shoulder at contact | **rear only** | band against your own range | experimental | experimental | Rear view band |
| `landing-distance` | Landing distance | side | cm from your start toe | estimated (player-relative only, after V1 includes measured foot noise) | estimated | **Hero 4**; trend only, never a fault trigger |
| `repeatability` | Serve shape repeatability | side, rear | index 0–100 | experimental | experimental | Detail |
| `serve-in-rate` | Serves in | side, rear | k of n; % | player-entered | player-entered (rear auto: experimental) | Outcome |
| `first-serve-in-rate` | First serves in | side, rear | k of n; % | player-entered | as above | Outcome (D11 headline) |
| `double-faults` | Double faults | side, rear | count; per 10 second serves or per 10 points | player-entered | player-entered | Outcome (D11 headline) |
| `placement-zone` | Where serves land | side, rear | T/body/wide counts | player-entered | player-entered (rear auto: experimental) | Outcome |
| `serve-type-mix` | Serve types | side, rear | flat/slice/kick counts | player-entered | player-entered | Context |
| `speed-experimental` | Launch speed (experimental) | side only, ≥ 120 fps, target tag | km/h range | unavailable by default; experimental when prerequisites hold (D4) | experimental | Hidden unless the experimental toggle is on |
| `speed-average-rear` | Average speed to the bounce (experimental) | rear only | km/h range | unavailable by default; experimental when prerequisites hold (D4) | experimental | Hidden unless the experimental toggle is on |
| `speed-radar-entered` | Radar speed (you logged) | any | km/h | player-entered | player-entered | Validation data |
| `spin` | Spin | none | none | unavailable | unavailable | One-line explanation |
| `capture-quality` | Capture quality | side, rear | Good / Fair / Limited | measured | measured | Under every session headline |
| *Added by this spec* | | | | | | |
| `retoss-count` | Re-tosses | side, rear | count | estimated | measured | Detail |
| `toss-lateral` | Toss left–right | rear | cm | experimental | estimated | Rear view only |
| `toss-lateral-spread` | Toss side-to-side consistency | rear | cm (SD) | experimental | estimated (measured only after V3) | Rear view only |
| `contact-height-spread` | Contact height consistency | side, rear | cm (SD) | estimated | estimated (measured only after V3) | Supporting |
| `second-serve-in-rate` | Second serves in | side, rear | k of n; % | player-entered | player-entered | Outcome (D11) |
| `fatigue-flag` | Fatigue check | side, rear | flag | estimated (evidence tier experimental) | estimated | Block flag |
| `load-flag` | Serving volume check | any | flag | estimated (evidence tier coach-recommended) | estimated | Session flag |

**Removed:** `trunk-tilt-band` (replaced by `shoulder-tilt-trophy`, D5). **Changed:** `knee-bend-band` is rear view only (D1, D5); the side view never shows a knee band.

**Night cap (§1.3).** Under court lights, pose-derived metrics (`leg-drive`, `drive-time`, `loading-depth`, `deep-bend-flag`, `shoulder-tilt-trophy`, `landing-distance`, `trophy-pause`, `knee-bend-band`, `shoulder-over-shoulder-contact`, `repeatability`) are capped at experimental until the night and flicker cells of §5.4 pass.

---

## 1. Conventions

### 1.1 Coordinates, units, reference points and roles

All engine types come from `app/src/analysis/types.ts`. Times are real seconds (`tReal`), after any slow-motion correction.

**Rectification comes first.** Every keypoint and every ball centre is mapped through the rotation homography `H_lvl = K · R(pitch, roll) · K⁻¹` before any height, distance or angle is computed. Everything below is in rectified coordinates. The video itself is never re-rendered.

| Symbol | Definition |
|---|---|
| `(x, y)` | Normalised, rectified image coordinates in the displayed, rotation-corrected frame. Origin is top-left, x to the right, y down, both in [0, 1] before rectification. |
| HU | Frame-height units: `xHU = x · aspect`, `yHU = y`, with `aspect = width / height` of the *displayed* frame (portrait < 1, landscape > 1). HU are isotropic, so every distance and angle is computed in HU (pose README). |
| `H_HU` | The player's standing height in HU for this serve. It comes from `estimateStandingBodyHeight` over upright frames in the serve's setup phase. **Upright is judged from vertical extents, not the 2D knee angle**, because the side view foreshortens the knees (gap: geometry §3): a frame is upright when its mid-hip height is ≥ 0.97 × the highest setup mid-hip height of the clip's upright candidates and trunk lean ≤ 25°. If fewer than 5 upright frames exist, use the median `H_HU` of other serves in the same court-side cluster (§2.3.6), with confidence × 0.8. |
| BH | Body heights: HU ÷ `H_HU`. All pose thresholds are in BH, so they work at any zoom. |
| `H_m` | The player's entered standing height in metres, from the profile. Any value in cm, m or km/h needs `H_m` (reason `PLAYER_HEIGHT_MISSING` otherwise). Ratios and times do not. Plausibility: §4.2. |
| `mPerHU` | `H_m / H_HU`: metres per HU at the player's depth. It is only valid at the player's depth (pose README). |
| Floor row `y_floor` | Per serve: the median, over `[motionStart − 0.5 s, tossRelease]`, of the lowest foot point. The lowest foot point is the largest y among both heels (29/30) and both foot indexes (31/32), or ankle + 0.039 BH if all are missing (pose README). Needs visibility ≥ 0.5. Labels do not matter here because both feet are used. |
| **Roles are geometric, never MediaPipe's left/right labels.** | In side views a whole-body mirror fits better than MediaPipe's labels in 43–75% of frames, and `cleanPoseFrames` does not fix persistent mirrors (pose README, ROI evaluation). Every role below is assigned per serve (or per frame where stated) from geometry. The anatomical labels are used only to keep each limb's own chain together (hip–knee–ankle–heel–foot index of one leg; shoulder–elbow–wrist of one arm); a chain whose segment lengths differ from the standing frames by > 15% is treated as a mixed chain and dropped for that frame. |
| Front foot | Per frame: the foot index (31 or 32) with the larger `netDir · x`. In the S0 window the foot that is front on ≥ 70% of frames is the front foot; otherwise the serve's S0 is `ROLE_AMBIGUOUS` (unavailable for forward metrics). |
| **Start toe `S0`** | Per serve: the median rectified position of the front-foot index over `[tossRelease − 0.10 s, tossRelease + 0.05 s]`. It is the origin for every forward and lateral distance. It matches the synthetic generator's `frontToeAtRelease`. Players start just behind the baseline, so S0 is a proxy for the baseline, not the baseline itself (§7 flag 4). |
| Tossing wrist | The wrist nearest the ball track over the 0.15 s before `tossRelease` (the ball leaves this hand). |
| Hitting wrist | The wrist that is nearest the ball and highest within ±0.1 s of contact. Before contact is known (coarse pass), anchors use the **higher of the two wrists** (§2.3.1). |
| Front shoulder | At trophy: the shoulder with the larger `netDir · x` (nearer the net). The back shoulder is the other. |
| Rear view: nearer knee | The leg whose ankle sits lower in the rectified image at trophy (from a raised camera behind the server, the foot nearer the camera projects lower). If the two ankles differ by < 0.02 BH, the nearer knee is `ROLE_AMBIGUOUS` and knee bands return `unclear`; the front knee is never used as a fallback. |
| `netDir` (side view) | +1 if the net is to the right in the image, −1 if it is to the left. The prior comes from the entered handedness and camera side. On the chest side, a right-hander has the net on the right, and a left-hander has it on the left. The data then verify it: the median sign of (landing toe x − S0 x) and of the outgoing-ball x velocity across serves. If ≥ 70% of serves disagree with the prior, use the data and raise `VIEW_MISMATCH` (info). *Implementation (28 September 2026, `engine.ts` `netDirVote`, `sessionEvidence`):* one vote per counted serve, never per ball track; a serve votes only from its own matched outgoing ball (≥ 0.1 BH, mainly horizontal) and its landing step (≥ 0.08 BH), and casts no vote when the two disagree; tracks outside every serve are ignored. The prior is overturned only when at least 3 serves carry evidence and ≥ 70% of them contradict it, or, in a clip with fewer than 3 serves, when every serve does. Some but not enough contradicting evidence keeps the prior with an info warning. |
| `hitDir` (rear view) | +1 if the hitting-arm side is to the right in the image, −1 otherwise. From behind, a right-hander's hitting side is on the right. |
| Handedness | From the profile. `inferHandedness` (pose) is a cross-check only, because it relies on arm labels. |
| **Player-plane frame (PPF)** | Metres, on the vertical plane through S0 that faces the camera. `u` is horizontal. In the side view, u = forward towards the net, positive into the court: `u = netDir · (x − x_S0) · aspect · mPerHU`. In the rear view, u = lateral, positive towards the hitting-arm side: `u = hitDir · (x − x_S0) · aspect · mPerHU`. `v` is height above the floor: `v = (y_floor − y) · mPerHU`. |
| Height ratio | `v / H_m = (y_floor − y) / H_HU`. Ratios do not depend on the entered height; centimetres do. |
| Ball position | Ball centre (not the lowest point) from the toss track: `y(t) = a t² + b t + c` (`BallTrack.fit`, normalised y, real seconds) and the tracker's linear `x(t)`, both rectified. |
| Durations | Milliseconds, from event `tReal` differences. |
| Angles | Degrees, measured in the rectified image plane only, and never displayed as numbers (D5). |

**Intrinsics `K` (portrait default, D1).**
- Natively (Capacitor/AVFoundation), read the lens intrinsics and `videoFieldOfView` for the active format; these already include any stabilisation crop.
- Otherwise, the 1x main lens is assumed, defined on the **sensor's long axis**: 67.3° across the long side for 26 mm-equivalent lenses and 71.6° for 24 mm Pro lenses (16:9 video; gap: geometry §6.2). The focal length in long-side units is `f_long = 1 / (2·tan(FOV_long/2))` = 0.751 (26 mm) or 0.693 (24 mm).
- The long axis is then mapped to the **displayed** orientation after the clip's rotation metadata (`video/rotation.ts`): `f_HU = f_long × (long side ÷ displayed height)`. Portrait 1080×1920: `f_HU = f_long` (about 0.75). Landscape 1920×1080: `f_HU = f_long × 16/9` (about 1.34). Using a landscape horizontal FOV as if it were the vertical FOV mis-states `f_HU` by a factor of about 1.8, which corrupts every term that uses D.
- Focal-length σ: 5% (24 vs 26 mm, plus residual stabilisation crop). The 0.5x lens is not supported for metrics; its distortion and small subject size are unmodelled (research 06 §3.5; `speed.ts` assumes 1x).
- The engine constant `MAIN_CAMERA_FOCAL_LONG_SIDE` (0.72, `ball/speed.ts`) is the same convention; it should be replaced by the per-lens value when the lens is known.

**Pitch and roll (tilt).** D1 caps measured tilt at 5° and forbids uncorrected tilt.
1. **Sources, in order:**
   - native CoreMotion gravity logged at capture: σ = √(σ_sensor² + σ_mis²), with σ_sensor 0.5° and camera-to-IMU misalignment σ_mis 0.5° (planning values until device QA, §5.6);
   - PWA `DeviceOrientationEvent` logged at capture: σ 1° plus σ_mis;
   - vanishing point of vertical structures in the background (net posts, fence posts, light poles): at least two verticals spanning ≥ 0.3 of the frame width, σ from the fit (typically 1–2°);
   - roll only: the direction of image gravity from the toss parabolas (median over ≥ 5 clean tosses; CAPTURE `cq.camera-level`).
2. **Caps:** |pitch| ≤ 5° and |roll| ≤ 5° are rectified. The pitch cap rises to 8° only after gap test 3 (tilt rectification on keystoned renders, gap: geometry §9) passes in §5.4. Beyond the cap: `CAMERA_TILTED`, and absolute heights, forward positions and angles are unavailable for the clip.
3. **Pitch unknown** (an in-app clip where motion permission was denied, or an import, and no vanishing-point estimate): absolute toss and contact heights (ratio and cm), forward positions in cm, `landing-distance`, `shoulder-tilt-trophy` and `deep-bend-flag` become **experimental** with reason `PITCH_UNKNOWN`. Spreads, timing, `toss-drop` (physics path), `leg-drive` and `loading-depth` are unaffected to first order and keep their status [Our inference: vertical differences near the camera row; checked by the S3 tilt family]. An unknown pitch is never treated as level with a small σ: phones leaned on a bag or clipped to a fence are often 5–15° off.
   - **3a. Imports with a mount answer** (added 27 Sep 2026; `serve/geometry.ts`, `metrics/perServe.ts`, `quality/checks.ts`). An import has no sensor, so the import flow asks "How was the phone mounted?" for side views (the rear set-up is pitched down on purpose, so it is never asked there): *Level mount* (a fence clip or tripod checked with a level or a level app) means pitch and roll 0 ± 2° (1σ); *Roughly level* means 0 ± 4°; *Tilted, or not sure* leaves the pitch unknown, and item 3 applies unchanged. The answer is player-entered evidence, never a measurement: `tiltStatus` is `assumed-level` (`tiltSource` `mount-answer`), nothing is rectified, and the prior's error is carried into every height:
     - *Pitch.* With heights normalised by the standing body at the same depth, a pitch error δ moves a point at ratio r by `Δr = r·(1 − r)·(H_m / D)·δ` (δ in radians; first order, the camera height cancels; exact projection agrees within 2% up to 5°, unit-tested). It is zero at the floor and at head height. For a 1.8 m player: about 1.2 cm per degree at a 3.3 m toss peak from 7.5 m, 1.7 cm per degree for a 3.5 m peak from 6 m (the gap study's "about 1.8 cm per degree" is this close, high-toss end), and about 0.5 cm per degree at contact.
     - *Roll.* A point Δu to the side of the floor reference reads Δu·sin(roll) higher: `|Δu| / H_m` per radian, with Δu the ball's measured offset from S0 (0.5 m when it is not known).
     - Both terms are session-shared (σ_s): spreads, timing and `toss-drop` are unaffected; per-serve and session-centre intervals widen by `σ_tilt = √(pitch term² + roll term²)`.
     - *Status.* `toss-apex-height` and `contact-height-ratio` keep their validated status, capped at **estimated** (`TILT_UNKNOWN`), only while the widened worst-case error still meets their acceptance threshold (§3.2, §3.8): `√(p95_measured² + (1.96·σ_tilt)²) ≤ 0.05` of standing height, with p95_measured 0.027 and 0.020 (synthetic D1 set). Otherwise they, and forward positions, `landing-distance` and angles, are **experimental** with `PITCH_UNKNOWN`. At the D1 distance a level mount keeps both heights estimated; "roughly level" usually keeps contact height but not the toss peak.
     - *Roll cross-check.* A standing player is a plumb line: over the upright setup frames the line from the mid-ankle to the mid-shoulder (in HU, so the aspect ratio cancels) stays within a degree or two of the image vertical. If its median angle is more than 3°, the answer is not trusted: the pitch is unknown for the clip, `cq.camera-level` warns ("You look tilted in the picture while standing…", no angle shown) and heights are experimental. Pitch cannot be cross-checked this way (tipping the phone forward or back does not lean a vertical body), so it rests on the answer.
4. **Size of the error it prevents:** treating a tilted frame as level biases the toss peak by about −9 cm at 5° and −18 cm at 10°, and contact by about −3 and −6 cm (gap: geometry §6.6). A residual pitch error of 0.5–1° costs 0.3–1.6 cm on the toss peak above the feet.
5. **Yaw** cannot come from gravity. The capture guide asks for the baseline to run into the centre of the screen; the residual yaw is estimated from the baseline's vanishing point where the baseline is visible. Yaw above 10° mixes forward and sideways directions: `toss-forward`, `contact-forward` and `landing-distance` get a yaw term in σ_s, and above 15° they are experimental (`CAMERA_TILTED`).

**Camera distance.** `D = f_HU · H_m / H_HU`, computed in rectified coordinates. D is used for perspective, depth-offset and sound-delay terms. With an assumed focal length, D carries about ±6% (1σ) [Our inference]. §5.4 unit-tests D against rendered portrait and landscape clips.

**Set-up class.** Each clip is assigned a `setupClass` from its orientation and D (D1):
- `portrait-near`: portrait (the D1 default, 7–8 m from the centre mark);
- `landscape-fence`: landscape with D ≥ 8.0 m to the server (the D1 alternative at the side fence);
- `landscape-near`: landscape with D < 8.0 m (the D1 "closer, with measured tilt" case);
- `rear`: the rear outcomes view.

Set-ups differ in pixel density and in distance-dependent biases (a 0.3 m toss offset reads 11.6 cm high at 6 m but 8.6 cm at 8 m; sideways toss scatter adds 3.7 vs 2.8 cm of apparent height spread; gap: geometry §6.7), so `setupClass` is a matching key (§1.6, §4.4).

### 1.2 Error model shared by all metrics

Each per-serve value carries separate 1σ error components. Keeping them apart is what makes spreads and within-player comparisons honest [Our inference].

| Component | Symbol | Examples | Behaviour |
|---|---|---|---|
| Random measurement, per serve | `σ_r` | Ball-fit noise; event timing; pose keypoint noise at the event | Averages down across serves and inflates the observed spread. **This is the only term subtracted in spread noise correction.** |
| Depth leak, per serve | `σ_leak` | The unseen sideways (side view) or forward (rear view) position of the ball, which leaks into apparent height and forward position through perspective | Real 3D scatter, not measurement noise. Included in the per-serve interval; **never subtracted** from a spread. Stated as an inflation in the copy (§3.6) |
| Session-shared | `σ_s` | Floor row; the per-session part of the body-height estimate; residual tilt; yaw; focal length | Identical for every serve in a session. Does not average down within a session; does not affect spreads; adds to cross-session comparisons |
| Player-persistent | `σ_p` | Anthropometric bias of the head-top estimate for this body shape and view; error in the entered height; the prior on the toss's mean depth offset δ̄ (it is persistent per player and serve type); posture-dependent hip-keypoint bias | Same across that player's sessions in the same view and set-up. Cancels in the player's own comparisons; matters only against published norms |
| Between-session true variation | `τ` | Day-to-day change in the player's own serve (warm-up, wind, fatigue, light) | Not measurement error. Enters "Did it work?" and trends (§4.5) |

**Planning values until the ROI evaluation is re-scored** [Our inference; to be replaced by §5.5 measurements]. The earlier budgets assumed injected jitter of σ = 0.005 BH and body height "within 2%". The ROI evaluation on rendered serves measured a mean joint error of 0.024–0.036 BH (mirror-tolerant), about 5–7 times larger, and 0.05–0.15 BH on the hitting wrist near contact (pose README). Heels and foot indexes were never scored. Until §5.5 re-derives them:
- **Body height:** σ_p = 2.5% (persistent) plus σ_s = 1.5% (per session), about 3% in total. An entered height adds σ_p = 1.2% (self-report, `ENTERED_HEIGHT_REL_SIGMA` in `ball/scale.ts`).
- **Toe points (foot index):** 0.03 BH per frame reading. Over the S0 window the effective number of independent readings after cleaning is taken as 2, so S0 carries 0.021 BH (about 3.7 cm at 1.75 m), plus a session bias of 0.015 BH (the foot-index point is not the toe tip).
- **Hip points:** 0.03 BH per joint per frame; the mid-hip of two hips after cleaning is taken as 0.02 BH per reading. Around the trophy position the hips go from frontal to profile, which may shift the keypoint by a posture-dependent 0.01–0.02 BH (UNVERIFIED; treated as σ_p).
- **Shoulder points:** 0.02–0.03 BH per joint per frame. Over a shoulder width of about 0.22 BH the two-landmark shoulder-line angle then carries 7–11° per frame, and about 6° after the median over the key frame ± 2 frames (effective independent readings taken as 2–3).
- **Wrists near contact:** 0.10 BH (the middle of the measured 0.05–0.15 BH).

**Detection thresholds** are set at **≥ 3 × the measured cleaned noise of the quantity they test**, with hysteresis wherever a state can flip (plant/airborne, still/moving). The *initial* values in §2.4 follow this rule with the planning noise above and are re-derived with it.

How the components are used:
- **Per-serve interval shown to the player:** `value ± 1.96·√(σ_r² + σ_leak² + σ_s² + σ_p²)`.
- **Session-centre interval:** `√(SE_centre² + σ_s² + σ_p²)`. Only the random parts average down.
- **Spread noise correction:** uses `σ_r` only (§4.2). `σ_leak` is reported, not removed.
- **Matched comparison of means between sessions:** `SE_Δ² = V₁/n₁ + V₂/n₂ + 2σ_s² + τ²(1/k₁ + 1/k₂)` (§4.5). `σ_p` cancels.
- **Coverage gate:** at V1, per-serve 95% intervals must contain ≥ 93% of synthetic truths for every continuous metric (§5.4). Under-covering intervals block V1.

### 1.3 Honesty labels, validation levels, condition classes and the status ceiling

Labels follow D2 and the `MetricStatus` definitions in `types.ts`: measured, estimated, player-entered, experimental, unavailable. Every value also has a *validation level*, which caps its status, because `types.ts` defines `measured` as a *validated* method and unvalidated metrics must be marked experimental.

| Level | Meaning | Status ceiling |
|---|---|---|
| V0 | Not yet validated anywhere | experimental |
| V1 | Passes the synthetic matrix (§5.4, §5.5), including the interval-coverage gate | estimated |
| V2 | Passes real-footage annotation in the in-app annotation mode (§5.6), including test–retest across sessions at least 2 days apart | measured for timing metrics (`timingMetricIds` in the JSON); **estimated** for absolute spatial metrics, for all spatial spreads and for bands |
| V3 | Passes a physical reference: calibration pole, tape-measured marks, radar or a second view (two-view triangulated spreads within 20%) | Target status as designed |

- **Emitted status** = min(the metric's target status, the ceiling for its current level *in this session's condition class*), downgraded further by the per-value rules in §3.
- **`serve-count`** has no validation exception. It is estimated until V2. Once the player has confirmed the serve strip (deleting false serves, adding missed ones), the session's count is emitted as measured with provenance "confirmed by you".
- **Condition classes.** The validation level of each metric is stored per condition class in `metrics.json` (`validationLevel: { day, overcast, night-lights, flicker }`). CI sets each from the latest run of the matching §5.4 S4 cells.
  - A session's class comes from the capture checks: `flicker` when the flicker check warns; `night-lights` when the player tags "under lights" or the subject's median luminance is below the *initial* night threshold set on the S4 renders; `overcast` when the exposure check reports low contrast in daylight; otherwise `day`.
  - All pose evidence so far is one synthetic player and outfit in bright light, while D11's primary segment practises and plays under 250–350 lux court lighting with 100 Hz flicker (research 10 M11). **Until the S4 night and flicker cells pass, pose-derived metrics are capped at experimental in `night-lights` and `flicker` sessions** with reason `CONDITION_NOT_VALIDATED`. The list is in §0 and in the JSON (`poseDerivedIds`). Ball and timing metrics follow their own per-class levels.
- A metric that fails its thresholds drops a level automatically, in that condition class.
- The "How we measure" sheet shows the level in plain words, for example "Checked on simulated serves in daylight; not yet checked under court lights".

**Reason codes.** Every downgrade and every `unavailable` carries one code. The player-facing text below is the default unlock hint; `metrics.json` holds the canonical strings.

| Code | Meaning | Default unlock hint (player-facing) |
|---|---|---|
| `VIEW_NOT_SUPPORTED` | This view cannot see the quantity | "Film from the side, on your hitting-arm side, to see this." (Rear-only metrics: "Add a phone behind you to see this.") |
| `VIEW_MISMATCH` | The detected view differs from the declared view | "This clip doesn't look like the view you chose. Check where the phone is." |
| `FPS_TOO_LOW` | Below the metric's minimum real frame rate | "Record at 60 fps." (Speed: "Record at 120 fps or more.") |
| `TIME_BASE_UNKNOWN` | Possible rendered slow motion, and the gravity check could not fix it; or a metric that needs a proven time base only has a physics-fixed one | "Import the original slow-motion file, or record in the app." |
| `FRAMES_DROPPED` | More than 10% of frames missing in the serve window | "Close other apps while recording." |
| `PLAYER_HEIGHT_MISSING` | A cm, m or km/h value needs `H_m` | "Add your height in Profile to see centimetres." |
| `BODY_NOT_UPRIGHT` | No standing frames to measure body height | "Stand tall for a second before each serve." |
| `FEET_NOT_VISIBLE` | Foot landmarks missing or cut off by the frame | "Keep your feet in the frame." |
| `POSE_LOW_QUALITY` | `trackingQuality` < 0.5 in the window the metric needs | "Make sure you're the only person near your serving spot, with the light behind the camera." |
| `OCCLUDED` | The needed landmark is hidden at the event (visibility < 0.5) | "Try the other side of the court so nothing blocks the view." |
| `ROLE_AMBIGUOUS` | The geometric role (front foot, nearer knee, front shoulder) could not be assigned | "We couldn't tell your front foot from your back foot on this serve." |
| `BALL_NOT_TRACKED` | Toss track missing or fewer than 6 detections | "Toss against sky, a fence or a plain windbreak; avoid trees behind you." |
| `APEX_EXTRAPOLATED` | The apex was above the frame and was fitted with gravity from both branches (§2.4.3); value kept with a wider interval | "Your toss went above the picture, so its height is estimated. Move the phone back a step to see it all." |
| `APEX_OUT_OF_FRAME` | The apex left the frame and could not be fitted (one branch only, or out of the frame for more than 0.65 s) | "Move the phone back a step or raise it a little so the whole toss fits." |
| `RELEASE_NOT_FOUND`, `CONTACT_NOT_FOUND`, `LANDING_NOT_FOUND` | The event was not found with confidence ≥ 0.5. `CONTACT_NOT_FOUND` also covers independent contact signals that disagree (DECISIONS D2 addendum, §2.4.5 "Fused-event disagreement") | Generic: "We couldn't see this moment clearly on this serve." |
| `NO_CONTACT` | Swing and miss | "Swing and miss: not counted in contact stats." |
| `AUDIO_UNAVAILABLE` | Hit-sound timing is off (the default) or the audio is unusable; contact is timed from video | "Optional: turn on 'Use the hit sound for timing' for sharper contact timing." |
| `NOT_ENTERED` | The player has not tagged what this needs | "Tag your serves (in, net, long, wide) in review." |
| `TARGET_NOT_TAGGED` | Launch speed needs the aimed target to bound the ball's angle out of the picture (D4) | "Tag where you aimed: T, body or wide." |
| `BOUNCE_NOT_LOCATED` | Rear view: the bounce was not found in the video, or bounces were located on too few serves in the block | "Raise the rear phone so both service boxes are clear. 4K helps." |
| `NEEDS_CALIBRATION` | Rear auto outcomes or rear speed without the four-corner tap | "Tap the four corners of the service box." |
| `CAMERA_MOVED` | Background drift above the threshold (§3.25) | "Fix the phone firmly; it moved during recording." |
| `CAMERA_TILTED` | Measured pitch or roll above 5° (8° once the tilt test passes), or yaw above 15° | "Keep the phone level; the guide turns green." |
| `PITCH_UNKNOWN` | No pitch from sensors or background verticals | "Record in the app with motion access on, so we can level the picture." |
| `SCALE_INCONSISTENT` | The gravity-based and body-based scales disagree by more than 15%, or the estimated toss depth disagrees with its prior by more than 3σ | "Check your height in Profile. If this was slow motion, import the original." |
| `IMPLAUSIBLE_VALUE` | A hard plausibility bound failed (§4.2); the serve is excluded and counted as not measured | "This reading looked wrong, so we left it out." |
| `CHECK_THIS_SERVE` | A soft plausibility bound failed; the value is kept with lower confidence | "This one looks unusual. Check this serve?" |
| `TOO_FEW_SERVES` | n is below the minimum for this aggregate (§4.1) | "Record at least {n} serves from one side." |
| `BASELINE_BUILDING` | A player-relative band needs at least 2 matched sessions | "Building your range: {k} of 2 sessions from this set-up." |
| `RANGE_TOO_WIDE` | Speed range wider than 35% of its midpoint | "This footage can't pin the speed down closely enough." |
| `EXPERIMENTAL_HIDDEN` | The experimental toggle is off | "Turn on experimental metrics in Profile to see this." |
| `CONDITION_NOT_VALIDATED` | The metric is not yet validated for this light condition (§1.3) | "Checked in daylight only. Under lights this reading is experimental." |
| `VALIDATION_PENDING` | Status capped by the validation level | (No hint. Shown in "How we measure".) |
| `NOT_MEASURABLE` | Physically impossible with phone video | Spin text (§3.24) |
| `NOT_IMPLEMENTED` | Planned, not built in v1 | "Coming later." |
| `LOW_LIGHT`, `FLICKER`, `MOTION_BLUR` | Capture-quality downgrades | See §3.25 |
| `UNMATCHED` | A comparison is not like-for-like (§4.4) | "Compare sessions from the same side, view, set-up and serve." |

Removed on 27 September 2026: `METHODS_DISAGREE` and `BOUNCE_NOT_HEARD` (the side-view audio flight-time speed path no longer exists, D4).

### 1.4 Contract extensions (add to `types.ts`; nothing is renamed)

```ts
// Optional fields to add to MetricValue
reasonCode?: ReasonCode                  // with every downgrade and every unavailable value
validationLevel?: 'V0' | 'V1' | 'V2' | 'V3'
conditionClass?: 'day' | 'overcast' | 'night-lights' | 'flicker'
band?: 'low' | 'typical' | 'high' | 'unclear'
bandBasis?: 'population-provisional' | 'player-relative' | 'fixed-geometric'
bandProbabilities?: { low: number; typical: number; high: number }
flag?: boolean                            // deep-bend-flag
secondary?: Record<string, number | string>  // e.g. { cm: 254 } beside a ratio, or { timeMs: 352 }
sigmaRandom?: number       // σ_r in the metric's unit (spread correction, §4.2)
sigmaLeak?: number         // σ_leak (reported, never subtracted)
sigmaShared?: number       // √(σ_s² + σ_p²)
censored?: 'right'         // apex above the frame and not fitted (§2.4.3)
plausibility?: 'ok' | 'soft-flag' | 'hard-reject'
provenance?: 'engine' | 'confirmed-by-you' | 'from-your-tags' | 'match-log'
quantity?: 'launch-speed' | 'average-speed'  // speed only (D4)

// Optional fields to add to ServeEvents
motionStart?: EventEstimate
setupStart?: EventEstimate

// New types
type SetupClass = 'portrait-near' | 'landscape-fence' | 'landscape-near' | 'rear'
type StratumKey = string   // `${view}|${setupClass}|${cameraSide}|${courtSide}|${serveNumber}|${intendedType}`
interface SessionMetric {
  id: string; stratum: StratumKey; status: MetricStatus; reasonCode?: ReasonCode
  n: number; nTotal: number                  // "n of nTotal serves measured"
  nCensored?: number                         // apexes above the frame, not fitted
  center: number | string | null
  centerKind: 'mean' | 'median' | 'rate' | 'count' | 'mode' | 'band' | 'flag'
  ci95?: [number, number]                    // interval for the centre (order-statistic for medians at n < 20)
  spread?: number; spreadKind?: 'sd'; spreadCi95?: [number, number]
  spreadIsLowerBound?: boolean               // > 10% censored: "at least X cm"
  noiseCorrected?: boolean; nearMeasurementLimit?: boolean
  provisional: boolean                       // §4.1
}
```

The profile gains two optional fields that METRICS reads (flagged to PRODUCT and ARCHITECTURE, §7): `sex: 'female' | 'male' | 'not-given'` (default `not-given`; used only to choose the `toss-drop` band) and `ageBand: '18-39' | '40-59' | '60+'` (used only for the contact-height rule in §3.8).

### 1.5 Inclusion rules and "X of N serves measured"

- A per-serve value enters an aggregate when all of these hold:
  - its status is measured or estimated;
  - its confidence is ≥ 0.5;
  - it passes the hard plausibility bounds (§4.2);
  - the serve is a `serve` (§2.3.4), not excluded by the player, and not flagged `NO_CONTACT` (contact metrics only).
- Experimental values are aggregated separately. They are shown only with the experimental toggle on (D2), never in headlines, and never in coaching text (research 09 §3.2).
- **N** is the number of serves detected in the stratum. **X** is the number with an included value. Hard-rejected values count in N but not in X. Every session metric shows "X of N serves measured" (D7).

### 1.6 Strata (matched groups)

`StratumKey` = view × set-up class × camera side (chest or back) × court side (deuce or ad) × serve number (1st, 2nd or unknown) × intended type (flat, slice, kick or unknown).
- Toss position differs by serve type and target, so pooling inflates spreads (research 06 §7.2). Values also differ by court side (research 03 [S34]). Distance-dependent biases differ by set-up (§1.1).
- Session summaries are computed per stratum. All blocks of one stratum within a session are pooled. The session headline uses the stratum with the most included serves. Other strata are listed beneath it.
- Pooling across strata is allowed only for `serve-count`, `retoss-count`, `capture-quality`, `load-flag` and outcome tallies.
- Statistics are **never pooled across views** (D1). Timing metrics may be *compared* across set-up classes of the same view (§4.4).
- **Set-up key** (added 27 Sep 2026; `metrics/setup.ts`, `StratumKey.setup`). Within a set-up class, the camera distance and the serving spot still move the distance-dependent biases, so each stratum also carries `orientation | distance class | serving spot`: distance class from D (close < 6.75 m, standard 6.75–8.25 m, far ≥ 8.25 m; the edges sit about 1.7σ of D from 7.5 m) and the singles or doubles spot from the block card or the import question. Matching (§4.4), baselines, usual ranges, trends and "Did it work?" need the same key; an unknown serving spot matches either spot, and sessions analysed before the key existed match any key.

---

## 2. Part A: finding serves, events and phases

### 2.1 Pipeline

1. **Probe and time base.** Build `VideoMeta`, `captureFps`, `timeScale` and the time-base assessment (video README). Read orientation, intrinsics or `videoFieldOfView` where available, and the logged pitch and roll.
2. **Audio (opt-in).** Hit-sound timing is off by default (CAPTURE §7.2). When the player turns it on, or an imported clip has audio, decode it on the device and detect onsets. Keep **only onset timestamps and features**, never the audio samples (research 06 §11 on listening-device law; D4, D8). Audio times contact only; it is never used for speed from the side view (D4). If there is no audio or it is unusable (`assessAudioTiming`), every audio branch below is skipped.
3. **Coarse pass** over the whole clip:
   - Pose at about 15 fps (every k-th frame, k = round(captureFps / 15)) with the lite model, then `cleanPoseFrames`, then rectification (§1.1).
   - Compute the view check, `netDir`/`hitDir` and the set-up class.
   - Find serve anchors (§2.3).
4. **Fine pass** in each serve window: every frame, full pose model, rectification, geometric role assignment (§1.1), ball detection with the pose-based toss region of interest (`tossRegionFromPose`) and an outgoing region, `trackBall`, `analyseToss`, then events (§2.4), phases (§2.6), plausibility bounds (§4.2) and metrics (§3).
5. **Session.** Condition class, strata, aggregates (§4), capture quality (§3.25) and flags.

### 2.2 Signals

| Signal | Source | Used for |
|---|---|---|
| Wrists, elbows, shoulders, hips, knees, ankles, heels, foot indexes, nose, with **geometric roles** (§1.1) | Cleaned, rectified `PoseFrame` (One Euro, zero-phase) | Anchors, release (hand), trophy (hip minimum), wrist apex, landing, recovery, leg drive, bands |
| Toss parabola `y(t)` and linear `x(t)` | `trackBall` → `analyseToss` | Release, apex, drop, toss position, contact position, gravity check, ball-plane depth (§3.2) |
| Outgoing ball track | `trackBall` (outgoing) | Contact time (line meets parabola), `speed-experimental` (side), bounce (rear) |
| Audio onsets (`contact`, `unknown`; sharpness; SNR), opt-in | `detectOnsets` → `toAudioOnsets` | Contact time only; in the rear view also the bounce time of a bounce already located in video (§3.32) |
| Wrist apex | Local maximum of the higher wrist (coarse) or the hitting wrist (fine) | Serve anchor; contact fallback |

Heights in this section are **h_j(t) = (y_floor − y_j(t)) / H_HU**, in body heights above the floor.

### 2.3 Finding each serve in a multi-serve clip

**2.3.1 Anchors (coarse pass).** Arm labels are unreliable in the side view (§1.1), so anchors use the **higher of the two wrists**, `h_w(t) = max(h_left(t), h_right(t))`. A serve anchor is a local maximum of `h_w` at time `t_A` that meets all four conditions:
- `h_w(t_A) ≥ 0.95`;
- `h_w(t_A) ≥ h_nose(t_A) + 0.08`;
- prominence ≥ 0.30 BH over the preceding 1.5 s;
- the *other* wrist reached `h ≥ 0.90` somewhere in `[t_A − 1.6 s, t_A − 0.15 s]` (the toss). With a persistent arm mirror this is still true, because the condition does not name the arm.

These are *initial* values. For scale: at contact the hitting wrist sits about 0.3–0.35 BH below the ball (racket and hand), and ball contact is about 1.4–1.5 × height (research 03 §5). The wrist is therefore about 1.0–1.15 BH [Our inference]. With the measured wrist error near contact (0.05–0.15 BH), the 0.95 threshold has at least 0.05 BH of margin at the low end of that range; §5.4 S11 tests it under persistent mirrors.

- Anchors less than 1.2 s apart are merged; keep the higher wrist.
- An audio `contact` onset with no pose anchor within ±0.3 s is ignored. It is usually a ball struck on the next court (research 05 [S40]).
- **Sparse sampling (added 27 Sep 2026, engine `serve/windows.ts`).** The coarse pass samples at about 15 Hz, and the hitting wrist's peak can be short: on the 6 m ad-court serves of the synthetic session clip it tops out at 1.0–1.04 BH and stays above 0.95 BH for 67–100 ms, and MediaPipe often loses the blurred wrist on the frame nearest contact. So one serve of eight came and went with the sampling phase (truth contact 31.07 s). Three changes, all no-ops on dense poses:
  - the height and nose bars are lowered by the most the peak could have dropped over the gap to the nearest wrist sample, `K·(gap/2)²` with the measured peak curvature K = 50 BH/s², capped at 0.12 BH (0.003 BH at 60 fps, 0.056 BH at 15 Hz);
  - the toss condition uses `h ≥ 0.85` (the ad-court toss arm peaks at 0.90–0.93 BH; 0.85 BH is still above the shoulders);
  - a local maximum is judged within 0.03 BH (the cleaned wrist noise), so the falling toss arm cannot mask the first hitting-wrist sample.

  Pass A simulation on the 122 corpus dumps (raw poses subsampled like the pipeline, then cleaned): recall 98.0% → 100% at uniform 15 Hz (every phase), 98.2% → 100% for the 4 Hz + 15 Hz two-level pass, dense 100% unchanged; no extra windows before or after.

**2.3.2 Windows.**
- A serve's window is `[t_A − 2.2 s, t_A + 2.0 s]`.
- Where neighbouring windows overlap, split at the midpoint between anchors.
- The window is widened to include `setupStart` and `recoveryEnd` once they are known (§2.4), but never past a neighbour's boundary.

**2.3.3 Toss-track validity.** Dribbles (pre-serve bounces) also produce parabolas. A toss track needs all four:
- apex height ≥ 1.35 BH (or the apex is above the frame, §2.4.3);
- the first free-flight detection within 0.15 BH of *a* wrist, which then becomes the tossing wrist (§1.1);
- release height ≥ 0.6 BH;
- at least 6 detections (`MIN_TOSS_DETECTIONS`).

Dribble parabolas peak below about 1 BH [Our inference]. A dribble parabola accepted as a toss is caught by the plausibility bounds (§4.2).

**2.3.4 Classification** (fine pass):

| Class | Rule | Counted as |
|---|---|---|
| `serve` | Valid toss track, and a hitting-wrist apex within 1.2 s after the toss apex, and contact evidence: the ball leaves the parabola early (a fitted parabola residual jump > 4σ, or an outgoing track), or an audio contact onset (§2.4.5) | `serve-count` |
| `serve` + `NO_CONTACT` | As above, but the ball continues on the parabola to below 0.8 BH with no outgoing track and no contact onset (swing and miss) | `serve-count`; outcome auto-tagged "fault (missed)"; excluded from contact metrics |
| `retoss` | Valid toss track, the tossing arm up, no wrist apex ≥ 0.95 BH within 1.2 s after the toss apex; the ball returns to within 0.15 BH of either wrist (caught) or leaves the window | `retoss-count`. Shown as "tosses caught"; excluded from contact and drop metrics; its apex enters a separate "caught tosses" figure, never `toss-height-spread` (gap: ranges §8) |
| `shadow` | Anchor present, but no toss track and no contact onset | Neither (drill shadow swings) |
| `other` | Anchor present, but the toss condition fails after the fine pass | Excluded and logged |

**2.3.5 Serve number (1st or 2nd).** Priority order:
1. The player's per-serve tag.
2. The block type chosen at recording (for example "12 first serves" or the Second-serve check-in).
3. The sequence rule, only in the optional point-play mode, once outcomes are tagged: after a fault, the next serve within 25 s from the same court side is a 2nd serve. Otherwise it is a 1st serve. **In a block declared as second serves, the sequence rule is off**: every serve is a 2nd serve.

Otherwise the value is `unknown`.

**2.3.6 Court side (deuce or ad).** Priority order:
1. The player's tag.
2. The block type.
3. Side view only, inference: cluster the per-serve `H_HU` values into two groups (k-means, k = 2). Accept two groups if their medians differ by ≥ 6% and each holds ≥ 3 serves.
   - The larger `H_HU` is nearer the camera.
   - With the camera on the hitting-arm side (D1), the nearer court is the deuce court for right-handers and the ad court for left-handers [Our inference: court geometry].
   - Confidence is 0.9 when the medians differ by ≥ 10%, and 0.7 at 6–10%.
   - With one group, use the session's declared side.

**2.3.7 View check.** Compare the declared view with the evidence:
- **Side:** the outgoing ball and the landing step move mainly horizontally, with `|Δx| > 2|Δy|` in HU. `estimateFacingSide` shows square-on shoulders at trophy (chest or back) and profile at contact.
- **Rear:** the landing step and outgoing ball move mainly upwards in the image, and the body shrinks after contact.

If the evidence contradicts the declared view on ≥ 70% of serves, raise `VIEW_MISMATCH` and make every view-specific metric unavailable. *As built (28 September 2026):* the same one-vote-per-serve evidence rule as `netDir` (§1.1): at least 3 serves with evidence, or every serve in a clip of fewer than 3; some but not enough contradicting evidence passes the check with an info message that states the share.

### 2.4 Events

All event outputs are `EventEstimate` values: `frameIndex` (the nearest frame), `tReal`, `uncertaintyS` (1σ), `confidence` and `method`.

**Generic fusion rule** [Our inference], used wherever several methods estimate one event:
1. Each method m gives a time `t_m`, a 1σ `σ_m` and an intrinsic quality `q_m` in [0, 1].
2. **Gate:** drop m if `|t_m − median(t)| > 3·√(σ_m² + σ_med²)`, where σ_med is the σ of the method that supplied the median.
3. **Fuse:** `t = Σ w_m t_m / Σ w_m`, with `w_m = q_m / σ_m²`.
   - `σ = √(1 / Σ(q_m / σ_m²))`, multiplied by `√(χ²/dof)` when χ²/dof > 1.
   - `method = 'fused'` when two or more methods survive the gate.
4. **Confidence** = `1 − Π(1 − q_m)` over the surviving methods, multiplied by 0.8 if only one method survived.
5. An event is **found** when confidence ≥ 0.5, and **reliable** when confidence ≥ 0.7.

**Speed thresholds** below are applied to velocities from a local quadratic fit over 7–9 frames of the cleaned series, never to frame-to-frame differences. With 0.02–0.03 BH per reading, a frame difference at 60 fps carries about 2 BH/s of noise, which would swamp every stillness test [Our inference].

#### 2.4.1 `setupStart` and `motionStart` (helper events)

- **`motionStart`** is the start of the continuous toss movement. Step back from release to the last time the tossing-wrist speed stayed ≤ max(0.25 BH/s, 3 × its measured smoothed-speed noise) for ≥ 0.2 s; `motionStart` is the end of that still stretch. Uncertainty: 60 ms. Confidence is 0.8 when a still stretch exists, else 0.4 (set to release − 0.8 s).
- **`setupStart`** is when the player settles at the serving spot. It is the last time before `motionStart` when either foot's horizontal speed was above 0.8 BH/s (walking), plus 0.2 s.
  - It is clamped to the range `[motionStart − 6 s, motionStart − 0.5 s]` and never earlier than the previous serve's `recoveryEnd`.
  - Dribbles belong to setup.

#### 2.4.2 `tossRelease`

- **Ball method** (`ball-release-fit`): `estimateRelease` fits the free-flight parabola plus a cubic departure term over the track and its lead-in (`ball/toss.ts`). σ comes from the fit, with the model floor. Quality `q` = `TossAnalysis.confidence`.
- **Hand method** (`pose-hand-separation`): the first time the ball-to-tossing-wrist distance (the tossing wrist is the wrist nearest the ball track, §1.1) exceeds 0.06 BH + ball radius and keeps growing for 3 frames, interpolated to where the distance crosses the threshold. σ = max(1 frame, 20 ms). q = the mean wrist visibility over ±3 frames, multiplied by 0.7.
- **Fusion:** the generic rule.
- **Fallback:** hand method only (confidence × 0.8). With no ball track at all, release is unavailable (`BALL_NOT_TRACKED`). A wrist deceleration peak alone is not accepted.
- Release timing is inherently less precise than apex timing, because the ball's departure from the hand grows only with the cube of time (`ball/toss.ts`).

#### 2.4.3 `tossApex`: the single rule for apexes above the frame

This is the one rule for a toss peak that leaves the frame. ARCHITECTURE (`tossApex` row) and CAPTURE (`cq.toss-headroom`) reference it rather than restating it.

- **Method** (`ball-apex-fit`): the parabola vertex `t* = −b / (2a)` from a fit to free-flight detections after release only, with sub-frame precision. The 1σ comes from the fit covariance (delta method). A drag-asymmetry correction of about +0.1% of the rise time (about 0.5 ms) is applied (`ball/toss.ts`).
- **Cases:**

| Case | Rule | Status and handling |
|---|---|---|
| **Bracketed** | Detections on both sides of the apex inside the frame | Normal |
| **Above the frame, fitted** | The ball leaves through the top edge while rising and re-enters while falling, with ≥ 3 detections on each branch, and the exit-to-re-entry gap is ≤ 0.65 s (an apex up to about 0.5 m above the frame top) | Fit one parabola to both branches with its curvature fixed to gravity (`a` from g, the stature scale and the time base, weighting points within 3 m/s of the apex, where drag is < 2% of g). The apex is **kept**, `estimated`, reason `APEX_EXTRAPOLATED`, with σ inflated to the fit σ plus a ±1-frame gap term: about ±2 cm at 60 fps (±4 cm at 30 fps) up to 0.3 m above the frame, ±2.6 cm (±5 cm) at 0.5 m, before scale error (gap: ranges §6.4). It **counts toward `toss-height-spread`** and its σ enters σ_r |
| **Right-censored** | The ball left through the top and the fit is not possible: < 3 detections on one branch, a gap > 0.65 s, or the time base is not proven or physics-fixed | The apex value is `unavailable` (`APEX_OUT_OF_FRAME`), but the serve is recorded as **censored at the frame top** in the ball's plane: its apex is known to be at least that high. It is never silently dropped (§3.6 handles censoring in the median and spread) |
| **Too few samples** | < 3 detections on *both* sides of the apex region | `unavailable` (`BALL_NOT_TRACKED`); not counted as censored |

- Dropping the highest tosses would censor the upper tail and bias both the median apex and the spread low, precisely for high or scattered tossers (the lead hero metric). That is why fitted apexes are kept and unfittable ones are carried as censored.
- **Gravity check:** `gravityTimeScaleCheck`. If it is implausible and the time base is not `proven`, apply §2.9. The fitted g is also a plausibility bound (§4.2).
- **Fallback:** none. The tossing hand cannot tell us when the ball peaks.

#### 2.4.4 `trophy` (maximum loading)

Defined as the lowest point of the mid-hip (pelvis) between `tossRelease` and `contact − 0.08 s`. The synthetic truth has the same definition: `trophyEndS`, where pelvis height is lowest, and `legDrive` in the extra truth.
- **Primary** (`pelvis-min`): smooth the mid-hip `y` with the cleaned series. Find the maximum of y (the lowest pelvis) in the window, and refine it with a local quadratic fit over ±0.1 s.
  - Accept it if the drop from the mid-hip height at release is ≥ 3 × the measured cleaned mid-hip noise (*initial* 0.03 BH) and the minimum is at least that much deeper than both window edges. The earlier values (0.012 and 0.004 BH) sat at or below the per-frame noise.
  - σ = 45 ms (*initial*; flat minimum; re-derived from the §5.5 evaluation). The minimum of a smooth curve is flat, so fps matters little.
  - q = mean hip visibility.
- **Fallback** (`toss-arm-apex`): if the pelvis minimum is too shallow (players who barely bend), use the time the tossing wrist is highest after release. σ = 70 ms, confidence × 0.6. `drive-time` is unavailable on this fallback; `leg-drive` and `loading-depth` still use the raw hip minimum (§3.27, §3.29).
- **Cross-check:** if both exist and differ by more than 250 ms, keep the primary and multiply confidence by 0.8.

#### 2.4.5 `contact`

Contact is the most important timing event. It fuses up to four methods. **Default capture has audio off** (CAPTURE §7.2), so the video methods carry the default budget.

| Method | Rule | σ (1σ) | q |
|---|---|---|---|
| `ball-intersection` | Time at which the back-extrapolated outgoing-ball line (≥ 2 detections in the first 60 ms after the last on-parabola frame) comes closest to the toss parabola, minimising `‖p_toss(t) − p_out(t)‖` | From the fit: typically 0.3 frame | min(1, outgoing detections / 4) × fit quality |
| `ball-bracket` | Contact lies in the gap between the last frame whose ball is on the toss parabola (residual < 3σ) and the first frame with off-parabola evidence (an outgoing detection, or a parabola residual jump). t = the midpoint of the gap, plus a bias correction β_occ calibrated on synthetic occlusion scenarios (initial 0) | **Per serve:** `gap · √(1/12 + 1/16)`, where `gap` is the measured gap in seconds. The second term is the occlusion-bias allowance: from the side, the racket and arm hide the ball for 1–3 frames before contact, so contact is not uniformly placed in the gap. At 60 fps a 2-frame gap gives about 13 ms | 0.7 × (1 frame ÷ gap in frames), capped at 0.7 |
| `audio-onset` (opt-in) | A `contact`-kind onset with sharpness ≥ 0.6 and SNR ≥ 10 dB, inside `[tossApex − 0.05 s, tossApex + 0.8 s]` and within ±0.12 s of the best video estimate. Correct for sound travel: `t = t_onset − D / c`, with c = 343 m/s (about 352 m/s at 35 °C; `speed.ts`). Then remove the clip's audio–video offset (below) | √(onset² + (σ_D / c)² + σ_AV²): about 3–6 ms without offset calibration, about 2 ms with it | Audio sharpness × min(1, SNR / 20 dB) |
| `wrist-apex` | Hitting-wrist height maximum within ±0.15 s of the other estimates, plus a bias correction `β_w` calibrated on synthetic data (initial 0 ms) | 30 ms + 1 frame (blur, smoothing and the measured 0.05–0.15 BH wrist error near contact) | Wrist visibility × 0.5 |

- **Audio–video offset calibration:** with ≥ 3 serves that have both `audio-onset` and a `ball-intersection` at ≥ 120 fps, set σ_AV = the median absolute deviation of the pairs. The offset is the median of `t_audio − D / c − t_ball`. Otherwise the offset is 0 with σ_AV = 8 ms [Our inference: allowance for container and device audio–video skew].
- **Outgoing ball at 60 fps.** The web recorder cannot shorten exposure, so at 45 m/s the outgoing ball is a 20–40 cm streak (exposures of 1/250–1/120 s). "≥ 2 detections within 60 ms" (about 3 frames) will often fail. `ball-intersection` coverage at 60 fps is therefore an open validation item (§5.4 S1 shutter cell), and the default budget assumes `ball-bracket`.
- **Fusion:** the generic rule.
- **Fallbacks:**
  - Without audio (the default): `ball-intersection` or `ball-bracket`.
  - Without a ball near contact (racket occlusion): `wrist-apex` alone, with confidence capped at 0.6. **Contact-position metrics then become unavailable** (`CONTACT_NOT_FOUND`), because the wrist cannot tell us where the ball was. Timing metrics may still use it, as experimental.
- **Fused-event disagreement (DECISIONS D2 addendum; built 28 September 2026, `serve/analyse.ts` `checkContactSignals`, `metrics/perServe.ts` `CONTACT_DEPENDENT_IDS`).** Three independent signals are compared: the ball (`ball-intersection` or `ball-bracket`), the hit sound (when on) and a **swing peak found on its own** (the hitting wrist's highest point in the swing, searched without the other estimates, ignoring left/right labels and a lower arm-up blip after the swing). This is separate from `wrist-apex` above, which is still searched only within ±0.15 s of the other estimates. Any pair more than 3 combined σ apart is a disagreement. Resolution:

  | Evidence | Contact-dependent values (`CONTACT_DEPENDENT_IDS`: toss-drop, contact-height-ratio, contact-forward, rhythm-release-to-contact, leg-drive, drive-time, loading-depth, deep-bend-flag, shoulder-tilt-trophy, knee-bend-band, shoulder-over-shoulder-contact, trophy-pause, landing-distance, speed-experimental) |
  |---|---|
  | A majority of three signals agree, or the ball was seen leaving on an outgoing track | Kept, capped at `experimental`, reason `CONTACT_NOT_FOUND`, the signals named in the basis |
  | Anything else (for example a ball that only vanished, with the swing peak disagreeing) | Withheld (`unavailable`, `CONTACT_NOT_FOUND`) |

  A single wrong event never produces a confident `estimated` value.
- **Contact ball position:** the toss parabola `y(t_c)` and `x(t_c)` at the fused contact time. Extrapolation beyond the last on-parabola detection is allowed up to 0.10 s. Beyond that, the position is unavailable.

#### 2.4.6 `landing`

The first foot ground contact after contact. Feet are tracked by geometry and continuity (the front foot at S0 is followed frame to frame by nearest position), not by labels.
- **Plant state with hysteresis** (thresholds ≥ 3 × the planning toe noise, §1.2): a foot becomes **planted** when its lowest point is < 0.03 BH above the floor row and its smoothed speed is ≤ 0.5 BH/s, both held for 3 consecutive frames; it becomes **unplanted** only when its lowest point rises > 0.06 BH above the floor row. Between the two thresholds the previous state holds, so the state cannot chatter.
- **Airborne:** both feet unplanted for ≥ 2 consecutive frames between trophy and contact + 0.3 s.
- **Rule** (`foot-contact`):
  - If the player was airborne: landing = the first unplanted→planted transition of either foot in `(contact, contact + 1.0 s]`, interpolated to the time the foot height crosses 0.045 BH on the way down (the midpoint of the hysteresis band).
  - If not airborne (no jump): landing = the first plant after contact of a foot whose toe has moved ≥ 0.10 BH forward since trophy.
  - If no foot moves that far: landing = contact, and `landing-distance` is reported from the front toe at that moment.
- **Landing foot:** the foot that satisfied the rule, identified geometrically. It is usually the front foot. The metric records which foot it was (front or back at S0).
- **Uncertainty:** σ = 1.5 frames + 10 ms (*initial*, raised from 0.7 frame + 6 ms for the measured noise; re-derived in §5.5). q = foot visibility.
- **Rear view:** the height above the floor is ambiguous from behind (forward motion also moves the foot up the image), so landing = the first time after contact that a foot becomes stationary (smoothed speed ≤ 0.3 BH/s for ≥ 3 frames) after moving. σ = 2 frames + 10 ms, confidence × 0.8.

#### 2.4.7 `recoveryEnd`

- The start of the first stable window after landing lasting ≥ 0.3 s, in which:
  - both feet are planted (hysteresis as §2.4.6);
  - smoothed pelvis speed ≤ max(0.3 BH/s, 3 × its measured noise);
  - trunk lean from vertical ≤ 20°.
- It is searched until landing + 2.5 s. If none is found (the player walks off to collect balls), recoveryEnd = landing + 1.5 s, with confidence 0.3 and method `timeout`.
- σ = 120 ms (the definition is the main source of uncertainty).
- There are no published norms for recovery; it serves the phase timeline and balance review only (research 03 §2).

### 2.5 Event confidence summary

The serve is **analysable** when release, apex (bracketed, fitted or censored) and contact are all found (confidence ≥ 0.5). Serves without an apex keep their pose-only metrics (leg drive, bands, landing) and lose toss metrics with `BALL_NOT_TRACKED`.

### 2.6 Phases (the seven product phases)

The phases follow the product mapping of the Kovacs and Ellenbecker stages in research 03 §2. They are contiguous and do not overlap. The toss apex is a *marker*, not a phase boundary, because it falls inside loading or drive depending on the player.

| Phase | Start → end | Key frame (for overlays and side-by-side) | Kovacs stage |
|---|---|---|---|
| `setup` | setupStart → motionStart | motionStart − 0.10 s (settled stance) | Start |
| `toss` | motionStart → tossRelease | tossRelease | Release |
| `loading` | tossRelease → trophy | trophy (the key frame for `shoulder-tilt-trophy`, `loading-depth` and, in the rear view, `knee-bend-band`) | Loading |
| `drive` | trophy → contact | The lowest hitting-wrist point between trophy and contact (racket-drop proxy) if its visibility is ≥ 0.5; otherwise the midpoint. From the chest side, the racket drop is often hidden behind the head and back (research 06 §2.2). | Cocking, acceleration |
| `contact` | contact − max(1 frame, 10 ms) → contact + max(1 frame, 10 ms) | The last frame at or before contact (the key frame for `shoulder-over-shoulder-contact` in the rear view) | Contact |
| `landing` | end of contact → landing + absorption. Absorption ends at the lowest pelvis within 0.4 s after landing, else at landing + 0.25 s | landing | Deceleration, finish |
| `recovery` | end of landing → recoveryEnd | recoveryEnd | Product-level phase |

- `PhaseSpan.confidence` = min(confidence of the start event, confidence of the end event).
- Overlays draw only at key frames whose confidence is ≥ 0.5.

### 2.7 Expected timing uncertainty by frame rate (1σ, before validation)

These are [Our inference] from the fit arithmetic, the pose README smoothing tests and the ROI evaluation's measured noise. **The defaults assume audio off** (CAPTURE §7.2). §5.5 replaces them with measured values.

| Event | 30 fps (33 ms/frame) | 60 fps (17 ms) | 120 fps (8 ms) | 240 fps (4 ms) | Dominant term |
|---|---|---|---|---|---|
| tossRelease | 30 ms | 16 ms | 9 ms | 6 ms | Cubic departure from the hand |
| tossApex (bracketed) | 3 ms | 2 ms | 1.5 ms | 1 ms | Parabola fit. The ball is nearly still at the apex (research 03 §9) |
| tossApex (above the frame, fitted) | 12 ms | 7 ms | 4 ms | 2 ms | Exit and re-entry frames |
| trophy | 55 ms | 45 ms | 40 ms | 38 ms | Flat minimum of a noisy hip height |
| contact: ball-bracket, typical 2-frame gap (**default**) | 25 ms | 13 ms | 6 ms | 3 ms | The gap and racket occlusion (per serve: `gap · 0.38`) |
| contact: ball-intersection, when available | 12 ms | 5 ms | 3 ms | 1.5 ms | Outgoing-line fit; coverage uncertain at ≤ 60 fps |
| contact: audio + ball (opt-in) | 5 ms | 3 ms | 2 ms | 1.5 ms | Audio–video offset, sound path |
| contact: wrist only | 45 ms | 35 ms | 30 ms | 28 ms | Blur, smoothing, wrist error |
| landing | 60 ms | 35 ms | 22 ms | 16 ms | Foot landmark noise, hysteresis |
| recoveryEnd | 120 ms | 120 ms | 120 ms | 120 ms | Definition |
| release→contact duration (default) | 39 ms | 21 ms | 11 ms | 7 ms | Release and contact |
| apex→contact duration (default) | 25 ms | 13 ms | 7 ms | 3.5 ms | Contact |
| trophy→contact (`drive-time`, default) | 60 ms | 47 ms | 40 ms | 38 ms | Trophy |

Why this matters for position:
- Near contact the ball falls at about 3.4 m/s (a 0.6 m drop) [Our inference: v = √(2gh)].
- So 13 ms of contact-time error (60 fps, audio off) is about 4.4 cm of contact height, and gives about 4–5 cm of toss-drop error for a 0.35–0.40 s fall. The earlier 1.4–1.7 cm figures assumed audio on and a one-frame gap.
- Picking the nearest frame instead of fusing would cost ±2.8 cm at 60 fps (research 03 §9).

### 2.8 What changes in the rear view

| Item | Side view (primary) | Rear view (optional "outcomes view", D1) |
|---|---|---|
| Rectification | Pitch ≤ 5° (level default for portrait) | The rear camera is raised and tilted down about 8–18°; this is rectified from the logged pitch (the 5° cap does not apply to a *measured* rear pitch, because the rear metrics are angles and lateral positions whose tests run on tilted renders, §5.4 S2) |
| Release, apex | As §2.4 | Same (vertical motion is in the image plane after rectification) |
| Trophy | Hip minimum | Hip minimum, plus the 2D **nearer (back) knee** angle (the back knee is within about 0–20° of the rear image plane; gap: geometry §2.2, §3) |
| Contact | As §2.4 | The outgoing ball moves up and away and shrinks, so `ball-intersection` has lower q (× 0.7). The audio distance D is from the rear camera. The hitting shoulder is the shoulder on the hitting wrist's side at contact |
| Landing | Foot height and plant | Stationarity rule (§2.4.6); σ 2 frames + 10 ms |
| Forward quantities (`toss-forward`, `contact-forward`, `landing-distance`) | Available | `VIEW_NOT_SUPPORTED`. Forward placement runs in depth from behind (research 06 §2.2). `landing-distance` from the rear needs the court homography and is not implemented in v1 |
| Lateral quantities (`toss-lateral`, `toss-lateral-spread`) | `VIEW_NOT_SUPPORTED` (lateral is depth) | Available |
| Heights | Floor row at the player | Floor row at the player. The ball is 0.2–0.6 m in front of the feet, so further from the camera; perspective term in §3.2 |
| Lower body (`leg-drive`, `drive-time`, `loading-depth`, `deep-bend-flag`) | Available | `VIEW_NOT_SUPPORTED`: from a raised rear camera the hips move up the image as the player drives forward, so hip rise and forward travel are confounded |
| `knee-bend-band` | **`VIEW_NOT_SUPPORTED`**: the knees point at the camera at trophy; a raw 2D knee angle puts 47–80% of serves in the wrong band (gap: geometry §3.3) | Available, experimental (nearer knee only) |
| `shoulder-tilt-trophy` | Available (the shoulder line is 16–31° from the image plane at trophy) | `VIEW_NOT_SUPPORTED` (the shoulder line is 59–90° out of the rear plane at trophy) |
| `shoulder-over-shoulder-contact` | **`VIEW_NOT_SUPPORTED`**: at contact the shoulder line is 65–84° out of the side plane, so a true 48° reads 69–84° (gap: geometry §4.2). Forward lean at contact is also not shown from the side | Available, experimental |
| Outcomes and placement | Player-entered | Experimental automatic path after a four-corner tap (§3.18, §3.20) |
| Speed | `speed-experimental` (≥ 120 fps, target tag) | `speed-average-rear` (bounce located in video) |

### 2.9 Slow motion and the time base

- If the time base is `proven` (video README), use it. `timeScaleRelSigma` = 0.003 (`speed.ts`).
- If the time base is `unknown` and ≥ 3 tosses are analysable: take the median `timeScaleFactor` from `gravityTimeScaleCheck`.
  - If it agrees with a standard ratio (1, 1/2, 1/4, 1/8, 1/16) within its 95% interval, apply that ratio (`fpsSource: 'physics'`).
  - All timing metrics are then capped at estimated. Relative time-base σ = the check's σ, with a floor of 2%.
  - **Speed is never computed on a physics-fixed time base** (CAPTURE §11.3): both speed metrics need a proven time base (`TIME_BASE_UNKNOWN`).
  - Audio is unusable (`AUDIO_UNAVAILABLE`), because rendered slow-motion audio is stretched or muted (video README).
  - The per-session ball-plane depth estimate from toss gravity (§3.2) is not used, because the time base was itself fixed with gravity.
- If no standard ratio fits: every timing and speed metric is unavailable (`TIME_BASE_UNKNOWN`). Spatial metrics (heights, forward placement) remain available, because they do not depend on time; apexes above the frame become censored (§2.4.3).

---

## 3. Part B: metric catalogue

**Entry template.** Each entry lists:
- id, name and question;
- unit and display;
- views;
- formula;
- prerequisites;
- status rules (today, target, downgrades, unavailable with reason codes);
- uncertainty model;
- reference ranges, provisional recreational bands (§4.10) and plausibility bounds (§4.2);
- per-session aggregation;
- validation, with synthetic truth fields from `tools/synth` (`ServePlan`, `ServeTimes`, `ServeParams`, and the canonical per-id truth in the extra truth file, `extraTruth.ts` `CANONICAL`) and real-footage methods.

**Order.** §3.1–§3.13 toss, contact and rhythm; §3.14–§3.15 bands; §3.16–§3.26 landing, outcomes, speed, quality and flags; §3.27–§3.32 the lower-body, rear-view and rear-speed entries added on 27 September 2026.

Shared prerequisites, listed once here:
- rectified coordinates with a known or estimated pitch (§1.1), otherwise the `PITCH_UNKNOWN` downgrades apply;
- a proven or physics-fixed time base for timing metrics (proven only, for speed);
- `view-match` (no `VIEW_MISMATCH`);
- per-serve `trackingQuality` ≥ 0.5 for pose-based metrics;
- geometric roles assigned (no `ROLE_AMBIGUOUS`) for metrics that use a role.

### 3.1 `serve-count` (and `retoss-count`)

- **Question:** "How many serves did I hit?" (and "How often did I catch a bad toss?")
- **Unit:** count, per stratum and in total. Re-tosses and shadow swings are shown separately.
- **Views:** side, rear.
- **Formula:** the number of §2.3.4 `serve` windows, including `NO_CONTACT`. `retoss-count` = the number of `retoss` windows.
- **Prerequisites:** pose coarse pass available; `captureFps` ≥ 30 (the single fps floor, §4.1).
- **Status:**
  - `serve-count` is **estimated** until V2 passes. Uncorrected strips are raw detections from wrist anchors, which are sensitive to arm mirroring, dribbles and players on the next court, and have no real-footage validation yet.
  - Once the player has confirmed the serve strip (deleting false serves, adding missed ones), the session count is emitted as **measured** with provenance "confirmed by you". Manual additions are counted and marked `player-entered` individually.
  - `retoss-count` is estimated at V1 and measured at V2, because telling a re-toss from a shadow swing is less certain.
- **Uncertainty:** none displayed. Detection error is reported through validation.
- **Reference:** none needed. Serve volume matters for load (research 03 [S43]; see `load-flag`).
- **Aggregation:** sum per stratum and per session.
- **Validation:**
  - Synthetic truth: `canonical['serve-count']` (serves whose contact instant lies inside the clip). Re-toss and shadow scenarios are in §5.3 S7; arm-mirror scenarios in S11.
  - Thresholds: precision ≥ 99% and recall ≥ 99% across all synthetic families, including S11 persistent mirrors; 100% on S0. Re-toss classification ≥ 95%.
  - Real: two annotators count serves on ≥ 300 real serves; precision and recall ≥ 98% (research 05 §10 row 1).

### 3.2 `toss-apex-height`

- **Question:** "How high do I toss?"
- **Unit:** value = ratio of apex height to standing height (for example 1.90 × your height). `secondary.cm` = ratio × H_m × 100. Displayed as "≈ 3.3 m (1.9 × your height)".
- **Views:** side (primary), rear.
- **Formula** (ball centre at apex, rectified):
  - `ratio = (y_floor − y_apex) / H_HU`, where `y_apex = c − b² / (4a)` from the free-flight fit (or the gravity-constrained fit for an apex above the frame, §2.4.3).
  - **Depth-offset correction.** The body sets the scale, but the toss is not in the body's plane. A ball δ nearer the camera reads `(z − h)·δ/(D − δ)` too high (research 06 §3.7; gap: geometry §6.7). With `r_h = (y_floor − cy) / H_HU`, the camera-height ratio on the rectified horizon row:
    - `ratio_corr = r_h + (ratio − r_h) · (1 − δ̂ / D)`.
  - **Prior for δ̂, side view, chest-side camera** [Our inference from gap: geometry §6; gap: ranges §6.2; kick offsets from [N14] via gap: ranges §2.2]:
    - flat and slice: **δ̄ = +0.30 ± 0.15 m** towards the camera (a 0.3 m offset reads about 8–12 cm high at 6–8 m);
    - kick: **δ̄ = +0.10 ± 0.20 m** (the kick toss sits 18–21 cm further to the non-hitting side, away from the camera);
    - intended type unknown: +0.25 ± 0.20 m.
    - Back-side camera: the signs flip.
  - **Rear view:** δ̄ = −0.30 ± 0.20 m (the toss is in front of the feet, away from the camera; research 04 F3 drill target 30–50 cm).
  - **Per-session estimate from toss gravity** (side view, time base *proven*, ≥ 5 bracketed tosses in the stratum): the fitted curvature gives the ball plane's own scale. With `s_body = H_HU / H_m` (HU per metre at the body) and `s_grav = 2·median(a) / g` (HU per metre at the ball, near-apex window), `δ_grav = D · (1 − s_body / s_grav)`. Its σ combines the per-toss scatter of `a` (÷ √n) with the body-scale error (σ_s and σ_p of body height, times D). δ̂ is the inverse-variance combination of `δ_grav` and the prior. If they differ by more than 3σ, keep the prior and raise `SCALE_INCONSISTENT` (info), because the likely cause is an entered height or time-base error.
  - The mean offset is persistent per player and serve type, so its uncertainty sits in **σ_p** (it does not average down). The serve-to-serve sideways scatter sits in **σ_leak**.
- **Prerequisites:** `tossApex` bracketed or fitted above the frame (§2.4.3); `y_floor` found (`FEET_NOT_VISIBLE`); `H_HU` found (`BODY_NOT_UPRIGHT`); fps ≥ 30; pitch known or estimated. The cm value also needs `H_m`.
- **Status rules:**
  - Target: estimated. Today: estimated at V1.
  - Apex above the frame and fitted → estimated, `APEX_EXTRAPOLATED`, σ inflated (§2.4.3).
  - Apex censored → per-serve value unavailable (`APEX_OUT_OF_FRAME`), carried as censored in the aggregate (§3.6).
  - Pitch unknown → experimental (`PITCH_UNKNOWN`).
  - Scale check > 15% off → cm value unavailable (`SCALE_INCONSISTENT`); the ratio is kept.
  - No toss track → unavailable (`BALL_NOT_TRACKED`).
  - Hard plausibility failure → excluded (`IMPLAUSIBLE_VALUE`).
- **Uncertainty** (1σ, in ratio units; × H_m for cm):
  - σ_r: fit `yUncertaintyNorm / H_HU` (plus the extrapolation term when fitted above the frame).
  - σ_leak: `|ratio − r_h| · σ_lat / D`, σ_lat = 0.15 m of unseen sideways toss scatter [Our inference]. Professional women's lateral toss SD is 6.6 cm (research 06 [S8]); recreational scatter is assumed larger.
  - σ_s: floor row 0.005; body-height session part 1.5% of the ratio; residual pitch 0.5% of the ratio per degree of pitch σ; focal length (through D in the correction).
  - σ_p: body-height anthropometric bias 2.5%; entered height 1.2% (cm only); the δ̄ prior `|ratio − r_h| · σ_δ̄ / D`.
  - Worked size [Our inference]: a 3.4 m apex, phone 1.4 m high and 6.75 m from the server. The correction removes about 9 cm. The prior adds about 4 cm (σ_p), sideways scatter about 4 cm (σ_leak), body height about 9 cm (σ_p) and 5 cm (σ_s). The 95% band is about ±23 cm against published norms, but the player's own session-to-session comparisons lose the σ_p terms.
- **Reference ranges:** (gap: ranges §2.2)
  - High-performance men (mean UTR about 10.7, n = 10): zenith 347.7 ± 24.0 cm (research 03 [S27]).
  - Nationally ranked junior men (n = 13, 181 cm): 3.40 ± 0.24 m, about 1.88 × height (research 03 [S28]).
  - Competitive women: 357.2 ± 21.6 cm (about 2.1 × height); two recreational women 339 and 382 cm [N1]. Experienced club men 298 cm (about 1.68 ×) (research 03 [S29]).
  - Recreational players are not systematically lower than elite players, and women toss higher relative to stature. These are context, never targets (research 03 §1).
- **Plausibility** (§4.2): hard reject below contact height − 0.10 m or above 5.5 m; soft flag below 2.4 m or above 4.6 m (or below 1.45× / above 2.6× stature).
- **Aggregation:** median ratio and cm, with an order-statistic CI at n < 20 and a bootstrap CI above (§4.3), n, censored count. The spread is its own metric.
- **Validation:**
  - Synthetic truth: `canonical['toss-apex-height']` (`metrics.tossApexHeightM / player.heightM`, ball centre).
  - Synthetic toss offsets are rendered at 0–0.4 m, **both signs**, and per serve type (§5.3), so the δ̄ prior and the gravity estimate are actually tested. The old fixed 0.12 m offset could not detect a wrong prior.
  - Thresholds (S0): |error| median ≤ 2.5% of standing height; p95 ≤ 5% of standing height; 95% interval coverage ≥ 93%.
  - Real: V2, annotated apex frame and ball centre (MAE ≤ 3% of height, which checks detection). V3, a 4 m calibration pole in the server's plane (research 06 §15.2), MAE ≤ 10 cm (research 05 §11.3).

### 3.3 `toss-forward`

- **Question:** "Is my toss in front of me?"
- **Unit:** cm, positive = into the court from the start toe. Displayed as "≈ 35 cm in front of your front toe".
- **Views:** side only.
- **Formula:**
  - `u_apex = netDir · (x_apex − x_S0) · aspect · mPerHU`, where `x_apex = x(t_apex)` comes from the linear x fit, and S0 is the geometric front toe (§1.1).
  - Depth-offset correction: `u_corr = u_pp + (u_apex − u_pp) · (1 − δ̂ / D)`, where `u_pp` is the principal-point column in PPF metres and δ̂ is as in §3.2.
- **Prerequisites:** side view; apex bracketed or fitted; S0 found (front-foot index visibility ≥ 0.5, role not ambiguous); `H_m`; pitch known or estimated; yaw ≤ 15°.
- **Status:** target and today estimated.
  - Rear view → `VIEW_NOT_SUPPORTED`.
  - Apex censored → unavailable (`APEX_OUT_OF_FRAME`).
  - Front foot occluded → unavailable (`FEET_NOT_VISIBLE`); front foot ambiguous → unavailable (`ROLE_AMBIGUOUS`).
  - Pitch unknown → experimental (`PITCH_UNKNOWN`).
- **Uncertainty:**
  - σ_r: x-fit error; S0 toe reading 0.021 BH (§1.2).
  - σ_leak: `|u_apex − u_pp| · σ_lat / D`.
  - σ_s: scale 1.5%; toe landmark bias 0.015 BH (the foot-index point is not the true toe tip); yaw (when estimated).
  - σ_p: scale 2.5% and 1.2%; the δ̄ prior.
  - Expected 95% band: about ±12 cm [Our inference; research 05 §6.3 estimated ±5–10 cm under a lower noise model].
- **Reference ranges:** (gap: ranges §3)
  - Toss apex forward of the front toe: recreational women 3–4 cm; competitive women 37 ± 11 cm [N1]; professional women 49 ± 4 cm [N4]. Recreational players toss much closer to the baseline, often almost above the front toe, so forward placement separates levels better than height does.
  - [Coaching interpretation]: toss "into the court", in front of the front toe. Research 04 F3's drill target is 30–50 cm in front of the front foot.
  - [Established] elite adolescents made contact about 17 cm further forward on flat serves than on kick serves (research 03 [S35]). Kick serves therefore sit further back, so strata must separate types.
  - `targetBand` 20–60 cm for flat and slice first serves (coach-recommended; not applied to kick).
- **Plausibility** (§4.2): hard reject below −0.8 m or above 2.0 m; soft flag below −0.3 m or above 1.2 m (the contact-forward bounds, applied to the toss) [Our inference].
- **Aggregation:** mean and SD (continuous and roughly symmetric), t-based 95% CI, n.
- **Validation:**
  - Synthetic truth: `canonical['toss-forward']` (`plan.apex[x] − plan.frontToeAtRelease[x]`, m).
  - Thresholds: MAE ≤ 5 cm, p95 ≤ 10 cm, 95% interval coverage ≥ 93%; S11 whole-clip and leg-only mirrors must hold the S0 thresholds (a leg swap would otherwise move S0 by the ~0.26 m stance).
  - Real: V2 annotated apex and toe; V3 two-view triangulation (research 05 §10 row 15), MAE ≤ 8 cm.

### 3.4 `toss-lateral` (rear view, added)

- **Question:** "Does my toss drift left or right?"
- **Unit:** cm, positive = towards the hitting-arm side of the start toe.
- **Views:** rear only.
- **Formula:** `u_lat = hitDir · (x_apex − x_S0) · aspect · mPerHU`, rectified from the rear camera's measured pitch. Depth-offset correction as §3.3, with the rear δ̄. In the rear view S0 is the foot index of the foot further from the camera at release (the front foot).
- **Prerequisites:** rear view; apex bracketed or fitted; S0 found; `H_m`; rear pitch known.
- **Status:** experimental today (the rear pipeline is not yet run on synthetic data); target estimated. Side view → `VIEW_NOT_SUPPORTED`.
- **Uncertainty:** as §3.3, with rear D (4–6 m) and a forward-depth leak (σ_leak with 0.20 m).
- **Reference:** [Coaching interpretation] "1 o'clock" for a right-hander (research 03 [S1]). A toss directly overhead is flagged in coaching as a possible impingement concern (research 03 §5, [S1]).
- **Aggregation, validation:** as §3.3. Synthetic truth: the lateral apex offset from `frontToeAtRelease`, signed to the hitting side (the generator's `tossApexLateralM` convention).

### 3.5 `toss-drop` (hero 1, D5)

- **Question:** "How far does the ball fall before I hit it?"
- **Unit:** value = cm. `secondary.timeMs` = apex→contact time. Displayed as "≈ 60 cm drop (0.35 s)".
- **Views:** side, rear.
- **Formula** (two independent estimates):
  - **Physics (primary):** `Δh_phys = ½ g Δt²`, with `Δt = t_contact − t_apex` and g = 9.81 m/s². This is scale-free and depth-free. Air drag on a ball falling at under 5 m/s changes the drop by about 1% [Our inference: drag deceleration k·v² with k ≈ 0.02 m⁻¹].
  - **Image (cross-check):** `Δh_img = (y_contactBall − y_apex) · mPerHU`, depth-corrected as §3.2.
  - If `|Δh_img − Δh_phys| > max(6 cm, 20%)`, raise `SCALE_INCONSISTENT` (info). Possible causes: time base, height entry, or ball depth.
  - If the time base is `unknown` and not physics-fixed, use `Δh_img` with status estimated and the §3.2 uncertainty.
- **Prerequisites:** apex (bracketed or fitted) and contact found; contact not `NO_CONTACT`; ball position at contact available (§2.4.5); fps ≥ 30.
- **Status:**
  - Today estimated (V1). Target measured (the physics path needs only timing, so §1.3 treats it as a timing metric), **but only for serves whose `σ_Δt` ≤ 8 ms** (for example 120 fps, opt-in audio, or a successful `ball-intersection`). At 60 fps with audio off (σ_Δt ≈ 13 ms) the value stays estimated at every level.
  - Contact from `wrist-apex` only → experimental.
  - Apex fitted above the frame → estimated, `APEX_EXTRAPOLATED`.
  - No apex → unavailable (`BALL_NOT_TRACKED`); censored apex → unavailable (`APEX_OUT_OF_FRAME`).
- **Uncertainty:** `σ(Δh) = g·Δt·σ_Δt`, with the **per-serve** σ_Δt (§2.4.5, §2.7). At 60 fps, audio off, a 2-frame bracket gap and a 0.40 s fall: σ ≈ 9.81 × 0.40 × 0.013 ≈ 5 cm. With opt-in audio at 60 fps, about 1.4 cm. The time-base relative σ adds `2·Δh·σ_ts`.
- **Reference ranges** (show both populations; gap: ranges §2.3):
  - Men: high-performance 0.56 m (research 03 [S27]); junior 0.72 ± 0.19 m (research 03 [S28]); experienced club 0.37 m (research 03 [S29]).
  - Women: professional 0.82 m [N4]; elite junior 0.94 m [N5]; competitive 1.14 ± 0.18 m; two recreational women 0.82 and 1.41 m [N1].
  - In two samples the drop did not differ between serves that went in and faults (research 03 [S28]; [N2]).
  - Physics: 0.34–0.38 s of fall for 0.56–0.72 m (research 03 §5).
  - No direction is "better". The drop is **sex-dependent even at elite level**, so a single threshold would flag most competent women.
- **Provisional bands and the F4 statistic** (gap: ranges §7.2; adopted, §4.10): men low < 0.30 m, typical 0.30–1.00 m, high > 1.00 m; women low < 0.40 m, typical 0.40–1.25 m, high > 1.25 m; sex not given low < 0.30 m, typical 0.30–1.25 m, high > 1.25 m; ±0.15 m on each edge. The band is chosen from the optional profile `sex` (§1.4). METRICS offers COACHING:
  - `f4Possible`: median drop in the high band **and** at least one co-signal: release→contact > 1.15 s; hitting-wrist high point to contact > 0.55 s (experimental proxy) or `trophy-pause` > 500 ms; contact-height ratio > 0.04 below the player's own best matched median;
  - `f4Likely`: drop > 1.20 m (men) or > 1.45 m (women and not given) with two co-signals.
  - Never on the drop alone. The earlier single "above 100 cm" flag (junior men's mean + 1.5 SD) is withdrawn.
  - Observations, not faults: "contact on the rise" (contact before the fitted apex) and "very low toss" (drop < 0.10 m).
- **Plausibility** (§4.2): drop hard reject > 2.2 m, soft flag < 0.03 m or > 1.6 m; apex→contact signed time hard reject < −0.15 s or > 0.70 s, soft flag < 0 s or > 0.57 s.
- **Aggregation:** median, order-statistic or bootstrap 95% CI, n.
- **Validation:**
  - Synthetic truth: `canonical['toss-drop']` (`metrics.tossHeightAboveContactM`; `alt.timeS`).
  - Thresholds: MAE ≤ 5 cm at 60 fps (audio off), ≤ 3 cm at ≥ 120 fps; time MAE ≤ 13 ms at 60 fps; 95% interval coverage ≥ 93%.
  - Real: V2 annotated apex and contact frames (time MAE ≤ 1 frame); V3 240 fps reference camera.

### 3.6 `toss-height-spread` (hero 1, the lead metric, D5)

- **Question:** "Is my toss becoming more consistent (height)?"
- **Unit:** cm. The SD of per-serve apex heights in the stratum, noise-corrected. Also stored as % of standing height.
- **Views:** side, rear (never pooled across views).
- **Formula:**
  - `SD_obs` = the sample SD of the included `toss-apex-height` cm values (bracketed and fitted apexes). In the ratio form, multiply by H_m.
  - Corrected: `SD = √max(SD_obs² − mean(σ_r²), 0)`, with **σ_r = tracking and timing noise only** (fit, extrapolation). The depth leak σ_leak is **not** subtracted: it is real sideways scatter projected into height, not measurement noise, and subtracting an assumed value would make the spread wrong by several cm for players whose sideways toss wanders more or less than assumed.
  - `nearMeasurementLimit` is set when `mean(σ_r) ≥ 0.7·SD_obs`; the display then reads "≤ {SD_obs} cm".
  - **Censoring** (apexes above the frame that could not be fitted, §2.4.3): with c = the censored share of the stratum's analysable tosses,
    - c ≤ 10%: the spread is computed on the uncensored values and reported normally, with "{k} tosses went above the picture";
    - c > 10%: the spread is shown as **"at least X cm"** (`spreadIsLowerBound: true`), because clipping the upper tail lowers an SD, and the median apex (§3.2) is marked provisional; the median itself treats censored values as larger than every uncensored one;
    - c > 50%: the median is unavailable (`APEX_OUT_OF_FRAME`).
- **Prerequisites:** n ≥ 8 included apexes in one stratum; fixed camera (no `CAMERA_MOVED` in the block); the same `H_HU` cluster.
- **Status:**
  - Today estimated. Target **estimated until V3** (two-view triangulated SD within 20%), then measured. V2 annotation shares the engine's image geometry, so it cannot detect sideways scatter leaking into height spread (2.4–3.7 cm per 10 cm of scatter; gap: geometry §6.7).
  - n < 8 → unavailable (`TOO_FEW_SERVES`).
  - `CAMERA_MOVED` → unavailable for that block.
  - Within-player SD above the hard bound (§4.2) → unavailable (`IMPLAUSIBLE_VALUE`; suggests mixed strata, re-tosses or tracking swaps).
- **Copy (side view, required by D1):** the consistency text and the "How we measure" sheet say the spread "includes a small side-to-side component unless you add the rear view".
- **Uncertainty:** chi-square 95% CI on the observed SD (§4.3), transformed to the corrected SD: `[√max(L² − (1.2·σ̄_r)², 0), √max(U² − (0.8·σ̄_r)², 0)]`, where L and U are the observed-SD bounds and the 0.8–1.2 factors propagate a ±20% uncertainty in σ_r. At n = 8 the observed interval spans 0.66× to 2.04× the SD; at n = 20, 0.76× to 1.46× (research 06 §7.2).
- **Reference ranges:** professional women, within-player SD at the zenith 6.0 cm vertical (n = 8 players × 5 serves). The authors judged a perfectly repeatable toss too strict a demand (research 06 [S8]). [Established] Experienced servers stabilise the vertical toss dimension most (research 03 [S29]). No within-player recreational values exist (gap: ranges §2.4).
- **Provisional bands and the F3 statistic** (gap: ranges §7.1; adopted, §4.10): tight < 8 cm, typical 8–20 cm, scattered > 20 cm, ±50% on each edge. METRICS offers COACHING:
  - `f3Likely`: the one-sided 90% lower bound of the corrected SD ≥ 15 cm, with n ≥ 12 in one stratum and ≥ 80% of serves detected (about an observed 19 cm at n = 12, 18 cm at n = 20);
  - `f3Possible`: the point estimate is in the scattered band but the bound is not met;
  - `f3PlayerRelative`: a rise of ≥ 50% against the player's best matched session at n ≥ 20 (research 06 §7.2).
- **Plausibility** (§4.2): within-player SD hard reject > 0.60 m; soft flag > 0.35 m.
- **Aggregation:** it is itself a session aggregate. For trends, one value per matched session.
- **Validation:**
  - Synthetic truth: `canonical['toss-height-spread']`, the SD of realised apex heights over the *same* serves. Comparing against the population SD would add sampling error.
  - Thresholds: `|SD − SD_truth| ≤ max(1.5 cm, 15%)` in ≥ 90% of 20-serve blocks with the sideways leak included in the truth comparison as a stated inflation (report the leak separately from S3 sideways-scatter renders); monotonic response to `sdScale` ∈ {0.25, 0.5, 1, 2} (Spearman = 1 per profile); S12 above-frame apexes: fitted apexes within ±3 cm and the censoring rule reproduces "at least" on > 10% censored blocks.
  - Real: V2 test–retest across two sessions ≥ 2 days apart (12-serve blocks), with typical error reported. V3 two-view triangulated SD within 20%.

### 3.7 `toss-forward-spread` (hero 1, D5) and `toss-lateral-spread` (rear, added)

- **Question:** "Is my toss landing in the same place front-to-back?" (rear: "side to side?")
- **Unit:** cm SD, noise-corrected as in §3.6 (σ_r only).
- **Views:** forward = side only; lateral = rear only.
- **Formula:** the SD of `toss-forward` (or `toss-lateral`) values in the stratum, corrected with σ_r (x-fit and the S0 reading). The leak terms are not subtracted: in the side view, residual camera yaw leaks sideways scatter into forward spread; in the rear view, forward scatter leaks into lateral spread through perspective.
- **Prerequisites, status and uncertainty:** as §3.6. Both are capped at estimated until V3. `toss-lateral-spread` is experimental today.
- **Reference ranges:** professional women 7.2 cm forward–back and 6.6 cm lateral (research 06 [S8]). Experienced servers allow more side-to-side and forward–back variation than vertical variation (research 03 [S29]). Coaching should therefore weight vertical consistency more heavily [Our inference]. Contact-forward within-player SDs of 12–13 cm in hobby men and a median of 8 cm in competitive men (research 05 [S47]; gap: ranges §2.4).
- **Provisional bands** (forward, gap: ranges §7.1): tight < 10 cm, typical 10–25 cm, scattered > 25 cm (±50%). `f3Likely` for forward uses a lower bound ≥ 18 cm.
- **Validation:** as §3.6, against `canonical['toss-forward-spread']` (or the SD of the lateral offset). Threshold `max(2 cm, 20%)`; S11 mirrors must not change the spread by more than the threshold.

### 3.8 `contact-height-ratio` (hero 2)

- **Question:** "How high do I make contact?"
- **Unit:** value = ratio of ball-centre contact height to standing height (for example 1.46×). `secondary.cm`. Displayed as "1.46 × your height (≈ 2.56 m)".
- **Views:** side, rear.
- **Formula:**
  - `ratio = (y_floor − y_ball(t_c)) / H_HU`, where `y_ball(t_c)` is the toss parabola at the fused contact time.
  - Depth-offset correction as §3.2, with the contact point's own prior: flat and slice **δ̄_c = +0.30 ± 0.15 m** towards a chest-side camera; kick **0.00 ± 0.20 m** (kick contact is 30–35 cm further to the side than flat and slice, [N14] via gap: ranges §2.2; research 03 [S34] reports lateral impact offsets of 10–30 cm in elite juniors). A 0.3 m offset biases contact height by +2 to +7 cm (gap: geometry §6.7).
  - The value includes any jump. Contact height is the ball's height above the ground, as in the reference studies.
- **Prerequisites:** contact found with a ball position (not wrist-only); not `NO_CONTACT`; `y_floor`; `H_HU`; pitch known or estimated. The cm value needs `H_m`.
- **Status:** target estimated (absolute, depends on the body-height estimate); today estimated.
  - Contact extrapolated more than 0.05 s beyond the last on-parabola detection → experimental.
  - Wrist-only contact → unavailable (`CONTACT_NOT_FOUND`).
  - Pitch unknown → experimental (`PITCH_UNKNOWN`).
- **Uncertainty:**
  - σ_r: ball speed × per-serve contact σ (about 4.4 cm at 60 fps, audio off; 1.0 cm with opt-in audio); fit.
  - σ_leak: `|ratio − r_h| · 0.15 / D`.
  - σ_s, σ_p: as §3.2, with the δ̄_c prior in σ_p.
  - The body-height bias dominates: 2.5% of 1.46 ≈ 0.037 ratio units (about 6.4 cm at 1.75 m) [Our inference].
  - Consequence: comparisons with *published* values are coarse, but the player's own session-to-session comparisons are sharper, because σ_p cancels (§1.2).
- **Reference ranges** (gap: ranges §3):
  - Beginners 142.6% vs elite 149.2% of standing height (research 03 [S6]); 145.9% (ITN 9), 148.4% (ITN 5), 147.5% (ITN 2) (research 03 [S7]); experienced men 147.8% (players 141–154%) (research 03 [S29]).
  - Women: recreational 139–156% (n = 2), competitive 144% [N1]; national, provincial and professional 150–155% [N4][N8]. Female ratios are not lower than male ratios.
  - [Established] Impact height correlates with serve speed (ρ = 0.75–0.78; ρ = 0.63 after normalising for height; research 03 [S28]).
  - Between-player SD within a level (5–7 percentage points) is as large as the gap between levels, so absolute bands are weak.
  - `higherIsBetter`, shown as direction of travel, not a target.
- **Provisional bands and the F12 statistic** (gap: ranges §7.3; adopted, §4.10): low < 1.38, typical 1.38–1.54, high > 1.54 (±0.03). **For kick serves and second serves the low edge is 1.35.** **For players aged 60 or over (profile `ageBand`), or with overhead shoulder discomfort noted, no absolute band is used: player-relative change only.** METRICS offers COACHING:
  - `f12Likely`: median < 1.38 (1.35 kick and second serves) **and** the one-sided 90% upper bound, including σ_s and σ_p, < 1.42, with ≥ 8 serves;
  - `f12Possible`: median below the low edge without that bound;
  - `f12PlayerRelative`: a fall of ≥ 0.04 against the player's best matched median.
- **Plausibility** (§4.2): hard reject < 1.10 or > 1.75; soft flag < 1.30 or > 1.62 (above 1.62, ask the player to confirm the entered height).
- **Aggregation:** mean ratio (and cm), t-based CI including σ_s and σ_p (§1.2), n.
- **Validation:**
  - Synthetic truth: `canonical['contact-height-ratio']` (`metrics.contactHeightRatio`).
  - Thresholds: MAE ≤ 0.03 ratio at 60 fps audio off (about 5 cm), ≤ 0.02 at ≥ 120 fps; p95 ≤ 0.05; 95% interval coverage ≥ 93%.
  - Real: V2 annotated contact frame and ball (MAE ≤ 0.025). V3 pole or 240 fps reference, MAE ≤ 10 cm (research 05 §11.3).

### 3.9 `contact-height-spread` (added)

- **Question:** "Do I hit the ball at the same height each time?"
- **Unit:** cm SD, noise-corrected (§3.6 method, σ_r only).
- **Views:** side, rear.
- **Prerequisites and status:** as §3.6, using included `contact-height-ratio` values. Estimated today; estimated until V3, then measured. At 60 fps with audio off, σ_r (about 4.4 cm) is close to plausible spreads (3–4 cm in every sample that reports it), so the value will often be `nearMeasurementLimit`; it is most useful at ≥ 120 fps or with opt-in audio.
- **Reference:** professional women: impact height was the most consistent dimension, SD 3.5 cm (research 06 [S8]); hobby men 2.9–3.6 cm, competitive men median 4.1 cm (research 05 [S47]; gap: ranges §2.4). [Established] Lower impact-height variability strengthened the strength→speed link in juniors (research 03 [S28]).
- **Validation:** as §3.6, against the SD of `canonical['contact-height-ratio']` × height. Threshold `max(1.2 cm, 15%)` at ≥ 120 fps; at 60 fps audio off, `nearMeasurementLimit` must be flagged whenever the truth SD < 1.4 × σ_r.

### 3.10 `contact-forward`

- **Question:** "Am I hitting the ball out in front?"
- **Unit:** cm, positive = into the court from the start toe.
- **Views:** side only.
- **Formula:** `u_c = netDir · (x_ball(t_c) − x_S0) · aspect · mPerHU`, depth-corrected with δ̂_c.
- **Prerequisites:** side view; contact with a ball position; S0 (geometric front toe); `H_m`; yaw ≤ 15°.
- **Status:** estimated today and as target. Rear → `VIEW_NOT_SUPPORTED`. Wrist-only contact → unavailable. Pitch unknown → experimental.
- **Uncertainty:** as §3.3, plus the horizontal ball speed at contact × σ_tc. The toss drifts forward slowly (< 1 m/s), so this term is small.
- **Reference:** (gap: ranges §3) amateurs 18 cm in front of the front toe (research 03 [S61]); recreational women 9–11 cm and competitive women 54 ± 13 cm [N1]; hobby men 24 and 68 cm, competitive men 62 cm (research 05 [S47]); experienced men 50 ± 15 cm (research 03 [S29]); professional women and men 61 and 78 cm [N4]. Flat contact is about 17 cm further forward than kick in elite adolescents (research 03 [S35]). [Coaching interpretation]: contact in front and into the court (research 04 F6, F11). Direction is none; coaching reads it together with `toss-forward`.
- **Provisional band** (descriptive only, a D3 outcome-linking feature, gap: ranges §7.6): short < 15 cm, typical 15–70 cm, long > 70 cm; for kick, shift 15 cm back.
- **Plausibility** (§4.2): hard reject < −0.8 m or > 2.0 m; soft flag < −0.3 m or > 1.2 m.
- **Aggregation:** mean, t-based CI, n.
- **Validation:** synthetic truth `canonical['contact-forward']`; MAE ≤ 6 cm, p95 ≤ 12 cm, coverage ≥ 93%, S11 mirrors hold. Real V3: two-view triangulation.

### 3.11 `rhythm-release-to-contact` (hero 3)

- **Question:** "How long from toss to hit?"
- **Unit:** ms. `secondary.loadingMs` = release→trophy; `secondary.driveMs` = the `drive-time` value (§3.28).
- **Views:** side, rear.
- **Formula:** `T_rc = (t_contact − t_tossRelease) · 1000`.
- **Prerequisites:** release and contact found; fps ≥ 30; time base proven or physics-fixed.
- **Status:** target measured; today estimated.
  - 30 fps, or physics time base → estimated even after V2.
  - Contact wrist-only → experimental.
  - Time base unknown → unavailable.
- **Uncertainty:** `σ = √(σ_release² + σ_contact²)` from §2.7, for example about 21 ms at 60 fps with audio off. Time-base error adds `T_rc · σ_ts`.
- **Reference ranges:** release to impact 0.97 ± 0.10 s in 10 high-performance men (research 03 [S27]); about 0.97 s (young adults) and 0.91 s (adults over 60) in recreational players [N3] (gap: ranges §4.1). Toss physics predicts 0.77–1.21 s across non-elite toss geometries. There is no "correct" tempo; any ideal is [Coaching interpretation] (research 05 §6.2). No `higherIsBetter`.
- **Provisional band** (descriptive, evidence tier experimental; gap: ranges §7.4): quick < 0.80 s, typical 0.80–1.20 s, unhurried > 1.20 s (±0.05 s). Used as an F4 co-signal (§3.5).
- **Plausibility** (§4.2): hard reject < 0.40 s or > 1.60 s; soft flag < 0.60 s or > 1.35 s. Release to apex: hard < 0.25 s or > 0.85 s; soft < 0.38 s or > 0.72 s.
- **Aggregation:** median, order-statistic or bootstrap CI, n.
- **Validation:**
  - Synthetic truth: `canonical['rhythm-release-to-contact']` (`metrics.releaseToContactS`).
  - Thresholds: MAE ≤ 1 frame + 5 ms at each fps (audio off); coverage ≥ 93%.
  - Real: V2 annotated frames, MAE ≤ 1 frame (research 05 §11.3).

### 3.12 `rhythm-spread` (hero 3)

- **Question:** "Is my rhythm the same every serve?"
- **Unit:** ms SD, noise-corrected with σ_r = the per-serve σ of `T_rc`. `secondary.cv` = SD ÷ median (%).
- **Views:** side, rear.
- **Prerequisites:** n ≥ 8 in the stratum; **fps ≥ 30** (the single floor). At 30–59 fps the release σ (about 30 ms) and the contact σ (about 25 ms) are close to plausible spreads (45–55 ms), so the value is flagged `nearMeasurementLimit` and is never emitted as measured [Our inference].
- **Status:** target measured (≥ 60 fps); today estimated.
- **Reference:** within-player SD about 45–55 ms (CV 5–6%) in recreational players, derived from [N3] (gap: ranges §4.1). [Established] Elite women showed a variable toss but very consistent serve timing (research 03 [S24]). Greater movement variability went with lower speed and accuracy (research 03 [S30]). Experts rate rhythm reliably from 2D video (research 03 [S33]). `higherIsBetter: false`.
- **Provisional band** (gap: ranges §7.4): tight < 40 ms, typical 40–90 ms, variable > 90 ms (±15 ms).
- **Plausibility** (§4.2): hard reject > 0.30 s; soft flag > 0.15 s.
- **Validation:** SD of `canonical['rhythm-release-to-contact']` over the same serves; `|error| ≤ max(10 ms, 20%)` at 60 fps; `nearMeasurementLimit` flagged at 30 fps; monotonic in `sdScale`.

### 3.13 `trophy-pause`

- **Question:** "Do I pause at the top?"
- **Unit:** ms.
- **Views:** side, rear.
- **Formula:**
  - `T_pause` = the length of the longest interval `[t_a, t_b] ⊂ [tossRelease, contact − 0.08 s]` that contains or ends at the trophy time, in which all three hold (smoothed velocities, §2.4):
    - pelvis vertical speed < max(0.15 BH/s, 3 × its measured smoothed-speed noise);
    - hitting-wrist speed < max(0.6 BH/s, 3 × its measured noise);
    - tossing-wrist speed < max(0.6 BH/s, 3 × its measured noise).
  - Wrists are the geometric roles of §1.1.
  - The thresholds are *initial*; they are grid-searched on synthetic data (with the §1.2 noise injected) against `trophyEndS − trophyStartS` and then frozen.
  - If the trophy frame itself fails the test, `T_pause = 0`.
- **Prerequisites:** trophy found by `pelvis-min` (not the fallback); fps ≥ 60; wrist visibility ≥ 0.5 over the interval.
- **Status:** experimental today (velocity thresholds on noisy real landmarks are untested; with 0.02–0.03 BH per reading even a 9-frame fit carries about 0.25 BH/s of speed noise, above the 0.15 BH/s pelvis threshold); target estimated. Trophy found by fallback → unavailable (`POSE_LOW_QUALITY`). Night cap applies (§1.3).
- **Uncertainty:** ± (2 frames + 40 ms), shown only in "How we measure".
- **Reference:** none numeric. No direct measurement of a trophy pause in recreational adults exists (gap: ranges §4.1).
  - [Established mechanism] Upper-arm internal-rotation speed was about 20% higher with no pause than after a 1.5 s pause (research 03 [S2]).
  - [Coaching interpretation] Only a short pause (research 03 §3). Applying this to a "trophy pause" is interpretation.
  - `higherIsBetter: false`. [Our inference] coaching co-signal at > 500 ms.
- **Aggregation:** median, IQR, n.
- **Validation:**
  - Synthetic truth: `canonical['trophy-pause']` (`times.trophyEndS − times.trophyStartS`).
  - Thresholds: MAE ≤ 60 ms; Spearman ≥ 0.8 across the beginner, intermediate and advanced profiles.
  - Real: V2 annotated trophy start and end frames by two annotators, reporting inter-rater agreement first.

### 3.14 `knee-bend-band` (rear view only)

- **Question:** "How much do my knees bend at the top?"
- **Unit:** band `low | typical | high` (the D5 enum), displayed as "Little bend", "Moderate bend", "Deep bend", or "Between two bands". Always shown with the rear trophy key frame and the knee drawn. No degrees are ever displayed (D5). `bandBasis: 'fixed-geometric'`.
- **Views:** **rear only** (D1, D5). Side view → `VIEW_NOT_SUPPORTED`, hint "Add a phone behind you to see this."
- **Why not the side view:** at the trophy position the pelvis faces the side camera and the knees point at it, 50–90° out of the image plane. A raw 2D knee angle from D1 reads 17–36° too low and puts 47–80% of serves in the wrong band; de-projection does not rescue it (gap: geometry §3.3). The earlier hip-drop-to-knee-angle mapping is withdrawn: it was exactly the side-view knee claim D5 forbids, and its σ assumed 0.006 BH per hip reading against a measured 0.03 BH.
- **Formula (rear):**
  - At trophy (§2.4.4, the lowest mid-hip, in coordinates rectified from the rear camera's measured pitch): `θ = 180° − interior angle hip–knee–ankle` (`kneeFlexionDeg`) of the **nearer knee**, identified geometrically (§1.1: the leg whose ankle sits lower in the image). Take the median over the trophy frame ± 2 frames.
  - The nearer (back) knee is within about 0–20° of the rear image plane; the front knee is partly hidden and 15–40° out of it (gap: geometry §2.2).
  - **Never fall back to the front knee** (its SD is 10–15°). If the nearer knee is ambiguous (`ROLE_AMBIGUOUS`) or its hip, knee or ankle visibility is < 0.6 (`OCCLUDED`), the band is `unclear`.
  - **Bands on θ:** little < 20°, moderate 20–45°, deep ≥ 45° (research 05 §6.5; gap: geometry §3.2).
- **Band probability:** treat θ as normal with σ_θ = 6.5° (the simulated rear back-knee SD of 5–7°, gap: geometry §3.3; to be re-simulated with the measured ROI noise before V1). `bandProbabilities` are the three band masses. Report the argmax band if its probability is ≥ 0.7; otherwise `band: 'unclear'`, and the UI shows the two neighbouring bands ("between little and moderate"). Expected: 11–13% of serves in the wrong band and no little↔deep confusions under the gap's noise model; 21% with doubled noise.
- **Prerequisites:** rear view; trophy found; rear pitch known; the nearer-knee chain visible (≥ 0.6); fps ≥ 30. No `H_m` needed.
- **Status:**
  - Experimental today (the rear pipeline has not yet run on synthetic data). Target estimated, only after V2 coach agreement.
  - Unclear on more than 50% of the stratum's serves → the session band is `unclear`.
  - Night cap applies (§1.3).
- **Use:** descriptive. There is **no `targetBand`** and no "bend more" direction. COACHING may use a "little" band only as supporting evidence beside `leg-drive`, never as a trigger on its own (gap: coaches §5, T1: depth is not the goal).
- **Reference:**
  - [Established] Restricting the knees to 10° cut ball speed by about 15–17% at every level (research 03 [S7]).
  - [Established, conflicting] Under about 10° of front-knee flexion went with higher shoulder and elbow loads at similar speed (research 03 [S3]), but not in another study (research 03 [S9]).
  - The pooled front-knee 64.5 ± 9.7° (national to professional; research 03 [S31]) is **not** used: it is a different knee, measured in 3D.
  - Do not "correct" stance choice (research 03 §4).
- **Aggregation:** the modal band over included serves, with the share in each band ("9 of 12 serves: moderate"). θ values are kept internally but never displayed, and there are no "Did it work?" verdicts on this band.
- **Validation:**
  - Synthetic truth: `canonical['knee-bend-band']`, the band of the back knee's 3D flexion at the trophy (`alt.backKneeAtTrophy3DDeg`).
  - Thresholds: ≥ 85% agreement on serves whose truth is ≥ 5° from a cut point; zero little↔deep swaps; `unclear` on ≤ 25% of serves; platform-stance renders with ankles level must return `unclear`, never a front-knee band. Failure case to keep: a side-view clip must never produce a knee band (gap test 1).
  - Real: V2 two coaches label three levels on rear clips, blinded to the engine; agreement ≥ 80% (research 05 §11.3); Krippendorff's α ≥ 0.7 between coaches (research 03 §Implications 9).

### 3.15 `shoulder-tilt-trophy` (replaces `trunk-tilt-band`)

- **Question:** "How much do my shoulders tilt at the top?"
- **Unit:** band `low | typical | high` **against the player's own range** (`bandBasis: 'player-relative'`), displayed as "Less tilt than your usual", "Your usual tilt", "More tilt than your usual", or "Building your range (1 of 2 sessions)". Shown with the trophy key frame and the shoulder line drawn. No degrees are displayed (D5).
- **Views:** side only. Rear → `VIEW_NOT_SUPPORTED` (at trophy the shoulder line is 59–90° out of the rear plane).
- **Why this and not trunk tilt:** at the trophy position the shoulder line is 16–31° from the D1 image plane, so its 2D tilt is within +1 to +4° of 3D (gap: geometry §4.2). The removed `trunk-tilt-band` (mid-hip to mid-shoulder against vertical) matched no published definition and was banded on the pooled 25 ± 7.1°, which is mostly thorax-relative-to-pelvis side bend (gap: geometry §4.1). No 2D band is compared with published trunk angles (D5).
- **Formula:**
  - At trophy, on **rectified** keypoints (§1.1): F = the front shoulder (larger `netDir · x`), B = the back shoulder.
  - `φ = atan2(y_B − y_F, netDir · (x_F − x_B) · aspect)` in degrees; positive = front (tossing-side) shoulder higher. Median over the trophy frame ± 2 frames.
  - `secondary.sideBendTrophy` (experimental, never displayed): the 2D angle between the shoulder line and the hip line, the only D1 angle that corresponds to the pooled side-bend definitions (gap: geometry §4.3).
- **Player-relative band** [Our inference]:
  - **Reference:** μ_p = the median of session medians over **≥ 2 matched sessions** (same stratum, including set-up class and court side), each with ≥ 8 included serves; s_p = the pooled within-session SD (§4.3).
  - Before the reference exists: `BASELINE_BUILDING`, key frame only.
  - **Session band:** "your usual" when |session median − μ_p| ≤ max(5°, 2·SE), with SE = 1.25·s_p/√n; "less" or "more" beyond. **Hysteresis:** a session label moves off "your usual" only when the median passes the edge by a further 2°, and returns only when it is back inside by 2°.
  - **Per-serve band:** "your usual" when |φ − μ_p| ≤ max(8°, 1.5·s_p); `unclear` if no band has probability ≥ 0.7 under σ_φ.
  - The reference is refreshed as a rolling median of the last 6 matched sessions.
- **Uncertainty:** σ_φ = 6° per serve (planning value; the gap's keypoint model gives ±3–5°, and the measured ROI joint error suggests more). If the §5.5 re-derivation gives more than 8°, the metric stays experimental. Projection (+1 to +4°) and a possible upward shift of the front-shoulder keypoint from the raised tossing arm (UNVERIFIED) are persistent per player, court side and set-up, so they cancel in the player-relative band.
- **Prerequisites:** side view; trophy found; both shoulders visible (≥ 0.5); front shoulder unambiguous (`|x_F − x_B|` ≥ 0.05 BH); pitch known or estimated (angles are computed only on rectified keypoints).
- **Status:** estimated today (V1) and as target. Pitch unknown → experimental (`PITCH_UNKNOWN`). Night cap applies.
- **Reference:** [Coaching interpretation] Kovacs' "shoulder and pelvis lateral rear tilt" during loading (research 03 [S1]; gap: geometry §4.1). [Established] Shoulder-over-shoulder tilt positions the arm for internal rotation (research 03 [S2]). No population degrees are shown or used. There is no `targetBand`, and COACHING must not infer back load from this band (no absolute "big arch" reading exists any more).
- **Aggregation:** the session band plus per-serve shares. φ is kept internally, never displayed; no "Did it work?" verdicts on the band.
- **Validation:**
  - Synthetic truth: `canonical['shoulder-tilt-trophy']` (3D elevation of the hitting→tossing shoulder line at the lowest mid-hip; `alt.deg2D`, `alt.deg2DLevel`).
  - Thresholds: rectified 2D within ±4° of 3D on S0 (gap test 4); within 1° of the level render across the S3 tilt family (gap test 3); player-relative band agreement ≥ 85% on synthetic session pairs with injected shifts of ±10°; S11 mirrors must not flip the sign.
  - Real: V2 two coaches label "less / usual / more" against the player's own earlier clips, blinded; agreement ≥ 80%.

### 3.16 `landing-distance` (hero 4; trend only)

- **Question:** "Am I driving into the court?"
- **Unit:** cm, positive = into the court from the start toe. Displayed as "You land ≈ 45 cm in front of where your front toe started". `secondary.pctHeight` = the distance as % of standing height.
  - Not "inside the baseline", unless a baseline tap exists. Then `secondary.fromBaselineCm` is also given.
- **Views:** side only (a rear-view landing needs the court homography and is not implemented in v1).
- **Formula:**
  - `u_land = netDir · (x_toe,landingFoot(t_land + 2 frames) − x_S0) · aspect · mPerHU`, using the median of 3 frames of the landing foot's foot index once planted. The landing foot is identified geometrically (§2.4.6); S0 is the geometric front toe (§1.1).
  - The toe point is used, not the ankle. The ankle sits above the ground, which biases landing positions (research 05 §6.7).
- **Prerequisites:** side view; landing found (confidence ≥ 0.5); landing-foot index visible (≥ 0.5); S0; `H_m`; yaw ≤ 15°.
- **Status:**
  - **Experimental until V1 passes with measured foot-point noise and geometric foot identification** (§5.4 rows incl. S11). Heels and foot indexes were never scored in the ROI evaluation, and a leg-label swap would move S0 to the back foot. D5 making it a hero metric is not evidence. Research 05 §6.7 and gap: ranges §7.5 both require experimental until validated.
  - After that V1 pass: estimated, **for the player-relative displacement from S0 only**. No population bands are shown until the reference set of gap: ranges §9 exists (the gap's provisional landing bands are **rejected** for display, §4.10).
  - **Trend only; not a fault trigger.** COACHING may not flag "≤ 0 cm" or use it for F18 (gap: ranges §7.5). Landing is feedback, not the cue (gap: coaches §5 T1).
  - Pitch unknown → experimental. Night cap applies. Rear view → `VIEW_NOT_SUPPORTED`.
- **Uncertainty:** σ_r: two toe readings (S0 at 0.021 BH and the landing toe at about 0.021 BH) plus landing-foot identification; σ_s: scale 1.5%, yaw. Expected 95% band about ±12 cm under the planning noise (research 05 §6.7 estimated ±10 cm).
- **Reference:** no norms for any population (gap: ranges §5). [Coaching interpretation] Landing behind the baseline suggests no forward drive (research 04 F9). [Established] Foot-up stances produce larger braking forces at landing (research 03 [S1]). Direction is none.
- **Plausibility** (§4.2): hard reject < −0.8 m or > 2.5 m; soft flag < −0.3 m or > 1.5 m.
- **Aggregation:** mean, t-based CI, n. Trends use direction-neutral words ("further in", "about the same", "further back") (§4.6).
- **Validation:**
  - Synthetic truth: `canonical['landing-distance']` (`landing.fromStartToeM`: the tossing-side toe x at landing minus the same toe x at toss release; `alt.fromBaselineM`). Landing time vs `times.landingS`.
  - Thresholds, with the §1.2 foot noise injected: distance MAE ≤ 8 cm, p95 ≤ 15 cm, 95% coverage ≥ 93%; time MAE ≤ 1.5 frames; S11 leg-only and whole-clip mirrors hold the same thresholds.
  - Real: V2 heel and toe annotation at release and landing (scores the foot-point noise); V3 tape-measured chalk marks (research 05 §10 row 22).

### 3.17 `repeatability`

- **Question:** "How similar are my serves to each other?"
- **Unit:** index 0–100, higher = more repeatable.
- **Views:** side, rear (separate).
- **Formula** [Our inference]:
  1. For each serve, build a trajectory of 7 points, using geometric roles (§1.1):
     - hitting wrist, tossing wrist, hitting elbow, mid-shoulder, mid-hip, nose (PPF coordinates in BH relative to S0);
     - the ball (until contact).
  2. **Time normalisation, anchored on events:**
     - release→trophy: 20 samples;
     - trophy→contact: 20 samples;
     - contact→contact + 0.25 s: 10 samples.
     - Samples are piecewise-linear in time. Tempo is removed; `rhythm-spread` covers tempo.
     - Mask points with visibility < 0.5 or `interpolated`.
  3. **Reference:** the pointwise median trajectory across the stratum's serves.
  4. **Per-serve deviation:** `d_i` = RMS over valid (point, sample) pairs of the Euclidean distance to the reference, noise-corrected: `d_i,c = √max(d_i² − σ_n², 0)`. σ_n is the **measured** cleaned pose noise (§1.2, re-derived in §5.5), times √(1 + 1/n).
  5. **Index:** `R = 100 · exp(−median(d_i,c) / τ)`. τ = 0.06 BH is the *initial* value, calibrated so that the synthetic advanced profile scores about 80 and the beginner profile about 50. These targets are ours and only set the scale.
  6. **By-product:** the serve with the smallest `d_i` is the **representative (median) serve** used for key frames, as research 06 §7.3 recommends instead of the best serve.
- **Prerequisites:** n ≥ 5 serves with release, trophy and contact in the stratum; the same view, set-up and camera position.
- **Status:** experimental today and as target. It is our own composite; no external reference exists (research 05 §10 row 24). Night cap applies.
- **Uncertainty:** bootstrap 95% CI over serves (§4.3).
- **Reference:** none. [Established] More variable movement went with lower speed and accuracy (research 03 [S30]). `higherIsBetter`.
- **Validation:** synthetic Spearman ρ ≥ 0.9 between R and `sdScale` ∈ {0.25, 0.5, 1, 1.5, 2} per profile, with the §1.2 noise injected; two seeds at the same `sdScale` differ by ≤ 5 points; S11 mirrors change R by ≤ 5 points. Real: correlation with coach-rated consistency (research 05 §10 row 24) and test–retest.

### 3.18 `serve-in-rate`, `first-serve-in-rate`, `second-serve-in-rate` (added)

- **Questions:** "How many serves went in?"; "Am I getting more first serves in?"; "Is my second serve reliable?" The last two are the D11 segment's headline outcomes.
- **Unit:** k of n, and % when n ≥ 10.
- **Views:** any. Side = player-entered (D3). Rear = experimental automatic after calibration.
- **Entry modes** (recorded with every value as `entryMode`; never pooled with each other):
  - `per-serve-tags`: outcomes tagged serve by serve in review;
  - `tally`: session totals entered directly (D3);
  - `match-log`: the D11 match log (research 10 M6), entered after comp night: a rough first-serve % and a double-fault count. Match-log values are plotted by season week beside practice and are **never pooled** with practice statistics, and never used in "Did it work?" (transfer to matches is the player's story, not a verdict).
- **Formula:**
  - `k / n`. Outcomes are in / net / long / wide / fault (missed).
  - `let` and `unknown` are excluded from n. `NO_CONTACT` counts as a fault.
  - The first-serve and second-serve rates filter on serve number.
- **Rear automatic path (experimental):**
  - Bounce from `detectBounce` → `mapBounceToCourt` through the four-corner homography → `classifyServeLanding`.
  - A bounce inside the box by more than 2σ of its uncertainty ellipse → in; outside by more than 2σ → out (long or wide from geometry); within 2σ → `close call`, not counted, and the player is asked.
  - Net: the track ends or reverses before the net plane (research 05 §5.3).
- **Prerequisites:** outcome tags for ≥ 1 serve (side); rear auto also needs the four-corner tap and ≥ 60 fps.
- **Status:**
  - Player-entered values are `player-entered`, provenance "from your tags" (or "match log").
  - Rear auto is experimental, `NEEDS_CALIBRATION` without the tap, and never mixed with player-entered in one rate.
  - No tags → unavailable (`NOT_ENTERED`).
- **Uncertainty:** Wilson 95% interval (§4.3), for example 12 of 20 → 38.7–78.1% (research 09 §3.4).
- **Reference ranges** (vendor data, match play, NTRP 3.0–5.0, combined genders): first serve in 53.3–55.8%, second serve in 70.4–70.9% (research 01 [S7], Vendor claim). First-serve % barely moves with level, so it is a weak progress headline (research 09 §4.1). `higherIsBetter`.
- **"Did it work?"** Player-entered practice rates **are eligible** for Newcombe verdicts, labelled "from your tags", when both sides use the same entry mode (per-serve tags vs tally) and the same serve number (§4.5). Experimental rear auto-outcomes and the match log are not.
- **Aggregation:** pooled k/n per serve number and per stratum. Rolling windows of about 100 serves for trends (research 06 §7.1).
- **Validation:** player-entered values need no validation. Rear auto: ≥ 95% correct for bounces more than 30 cm from lines; "close call" inside that (research 05 §11.3), against annotated video plus an on-court observer.

### 3.19 `double-faults`

- **Question:** "How many double faults?" (the D11 segment's headline pain)
- **Unit:** count; and a rate per 10 second serves (practice) or per 10 points (point play).
- **Views:** any.
- **Formula, by source:**
  - **Second-serve block** (the Second-serve check-in, or any block declared as second serves; the default v1 path): every serve is a 2nd serve (§2.3.5, sequence rule off), so a double fault is **a faulted second serve**. DF = the number of faulted second serves (per-serve tags, or the tally's second-serve faults); rate = DF ÷ second serves × 10. **No point-play mode is needed.** In a tally, the count is derived from the second-serve fault count if no separate double-fault counter was used.
  - **Point-play mode (optional; deferred in v1, PRODUCT §5.4):** serves tagged 1st/2nd in sequence; a double fault is a 2nd serve with a fault outcome; points = the number of 1st serves; rate = DF ÷ points × 10.
  - **Match log (D11):** the player's per-match count, provenance "match log", plotted by season week, never pooled with practice.
- **Status:** player-entered. Without a second-serve block, point play, a tally or a match-log entry → unavailable (`NOT_ENTERED`).
- **Uncertainty:** Wilson interval on DF ÷ second serves (or ÷ points).
- **Reference:** 3.2–3.7 double faults per match, NTRP 3.0–5.0 (research 01 [S7], Vendor claim; match play, not practice). `higherIsBetter: false`.
- **"Did it work?":** eligible "from your tags" on the practice rate per second serve (the complement of `second-serve-in-rate` in a second-serve block), same entry mode both sides.
- **Validation:** none needed (player-entered).

### 3.20 `placement-zone`

- **Question:** "Where are my serves landing?"
- **Unit:** counts per zone: T / body / wide, per court side. Each serve records the target zone and, optionally, the result zone.
- **Views:** any. Side = player-entered. Rear = experimental automatic.
- **Formula:**
  - Player tags: target (intent) and result (where it landed). **The target tag is also the prerequisite `entry:targetZone` for `speed-experimental`** (D4).
  - Hit-rate on target = matching result ÷ tagged results (Wilson).
  - Rear auto: the bounce point's lateral position in the service box, split into thirds of the 4.115 m box width, with the thirds nearest the centre line being T [Our inference; ITF dimensions via research 06 §6.1].
  - "Too close to call" when P(zone) < 0.8 under the bounce uncertainty ellipse. Lateral calls are much more precise than depth from behind (research 05 §5.2).
- **Status:** player-entered, or experimental (rear auto); `NEEDS_CALIBRATION`.
- **Reference:** no recreational reference. [Established] Placement relative to the returner and closeness to lines, together with speed, classified professional aces with 87% accuracy (research 03 [S21]).
- **Validation:** rear auto zone agreement ≥ 90% (research 05 §11.3), against `canonical['placement-zone']` (`alt.actual`).

### 3.21 `serve-type-mix`

- **Question:** "Which serves did I practise?"
- **Unit:** counts: flat / slice / kick / unknown.
- **Formula:** player-entered intended type per serve or per block (D4).
- **Status:** player-entered. An automatic "looks like slice" classifier is `NOT_IMPLEMENTED` in v1 and would be experimental later (research 05 §4).
- **Reference:** none. Type is a stratum key (§1.6) and selects the depth-offset prior (§3.2).

### 3.22 `speed-experimental` (D4): side-view launch speed

- **Question:** "Roughly how fast was that serve off the racket?"
- **Unit:** km/h range, always named "launch speed (just after contact)". Rounded outward to 5 km/h ("about 140–155 km/h"). Never a single number, never decimals (D4; research 05 §0).
- **Views:** **side only.** The only path is the near-contact ball track (`estimateServeSpeedFromTrack`, `ball/speed.ts`). **There is no audio flight-time path**: from the side the bounce is 47–68° off the camera axis and never in frame, so its distance is unknown and errors are about 10% at the median and 20% at the 90th percentile even with a target tag (gap: geometry §7). Audio, when on, only times contact. The rear-view path is its own metric, `speed-average-rear` (§3.32), and the two are never combined (D1).
- **Default:** unavailable (D4). Experimental when every prerequisite below holds **and** the experimental toggle is on (else `EXPERIMENTAL_HIDDEN`).
- **Prerequisites:**
  - side view;
  - real `captureFps` ≥ 120 with a **proven** time base (CAPTURE §11.3; a physics-fixed time base is refused, `TIME_BASE_UNKNOWN`);
  - ≥ 3 clean outgoing detections (score ≥ 0.15) between 4 ms and 50 ms after contact, with a straight-line residual within the engine's gate;
  - `H_m` entered (D4);
  - **`entry:targetZone`**: the serve's aimed target tagged T, body or wide (D4). "Mixed", "unknown" or no tag → unavailable, **`TARGET_NOT_TAGGED`** ("Tag where you aimed: T, body or wide").
- **Formula:**
  - In-plane speed from a straight-line fit, scaled by `mPerHU`, with the contact point's depth offset (σ 0.3 m; `CONTACT_DEPTH_SIGMA_M`).
  - **Out-of-plane angle ψ bounded per tag and court side.** The engine's `TARGET_TAG_OUT_OF_PLANE_DEG` gives T 0–13°, body 2–19°, wide 6–24°. These contain the gap study's zone-centre values (about 2, 9 and 15° ± 4°, gap: geometry §7.1) widened for stance, landing spread within the zone and ±2° of camera aim (the yaw allowance). When the baseline's vanishing point gives a measured yaw, the band shifts by it and narrows by up to 2°.
  - **Depth change along the track.** Leaving at ψ, the ball moves `sin ψ` (0.04–0.27 m) further from or nearer the camera per metre travelled. With a chest-side camera it moves **away** when serving from the court half nearer the camera (deuce for a right-hander) and **towards** it from the far half (ad); a back-side camera flips the signs. The apparent image speed scales by `D / (D + Δd(t))`, so the correction uses the signed depth change at the window's mid-time over the tag's ψ band, and the band's width enters the range. It is not modelled as a static offset. [Flag to the engine owner: `speed.ts` currently treats this term symmetrically; it should take the sign from court side and camera side.]
  - Drag back-extrapolation to launch with a drag length of 36–55 m.
  - Divided by `cos ψ` over the tag's band (the cosine error can only raise the true speed).
- **Range:** the engine's 2σ interval, combining localisation, scale, time base, perspective, the signed depth change and the cosine bound (`speed.ts`).
- **Display gate:** show a range only if (high − low) ÷ midpoint ≤ 0.35; else `RANGE_TOO_WIDE`.
- **Quantity:** launch speed. It is comparable in kind to a radar peak, but not validated against one.
- **Other unavailable reasons:** `FPS_TOO_LOW`, `PLAYER_HEIGHT_MISSING`, `FLICKER` (under 100 Hz flicker, research 05 §9.6), `MOTION_BLUR` (ball streak > 3 diameters), `VIEW_NOT_SUPPORTED` (rear).
- **Reference (context only, never mixed):**
  - SwingVision *average* first-serve speed, 96–120 km/h at NTRP 3.0–5.0 (research 01 [S7], Vendor claim). Average speed reads about 20% below radar (research 05 [S35]).
  - Laboratory radar flat first serves: beginners 107, intermediates 149 km/h (research 03 [S7]).
- **Aggregation:**
  - Per-serve ranges in the serve list.
  - Session "typical" = the median of per-serve midpoints. Its range combines the shared relative error (scale, perspective, drag assumptions: 2σ, not averaged) with the random part divided by √n. Deuce and ad are separate strata.
  - Session "fastest" = the serve with the highest midpoint, shown with its own range.
  - No "Did it work?" verdicts on speed (§4.5).
- **Validation:**
  - Synthetic truth: `canonical['speed-experimental']` (`metrics.ballSpeedAtContactKmh`, `alt.targetTag`).
  - Thresholds: range coverage ≥ 90% of serves (target 95%, because the range is 2σ), **separately on deuce and ad** (the depth-change sign); median |midpoint error| ≤ 5%; unavailable in 100% of serves below 120 fps, untagged, or on a physics-fixed time base.
  - Real (V3): Pocket-Radar-class device (±1 mph) behind the server, in line with the serve; 200+ serves; bias, 95% limits of agreement, coverage.
  - Before the experimental tag is removed: MAE ≤ 5%, LoA within ±10% (research 05 §11.3).

### 3.23 `speed-radar-entered`

- **Question:** "What did my radar say?"
- **Unit:** km/h; mph input is converted (× 1.609) and stored with the original.
- **Formula:** the player enters a per-serve reading (in review) or a session maximum, plus the device (Pocket Radar, other radar, other).
- **Status:** player-entered; never validated or edited by us.
- **Use:**
  - Shown as "You logged 142 km/h (radar)".
  - Pairs with `speed-experimental` (launch vs radar peak) become personal validation data. The "How accurate" sheet may say "our range contained your radar reading on 7 of 9 serves". Pairs with `speed-average-rear` are shown as "average vs peak" and are not a containment check.
  - With consent (D9), pairs may later feed the V3 dataset.

### 3.24 `spin`

- **Status:** always unavailable (`NOT_MEASURABLE`), D4.
- **One-line explanation:** "Spin needs cameras shooting about 1,000 frames a second or a radar tracker; phone video can't measure it. Log the serve type you meant instead."
- **Basis:**
  - Serve spin is about 1,000–5,000 rpm (research 05 [S43]).
  - At 240 fps the ball turns 75–125° between frames while only a few pixels wide (research 05 §4).
  - Even Hawk-Eye spin estimates had an error SD of about 540 rpm (research 05 [S44]).

### 3.25 `capture-quality`

- **Question:** "Can I trust this session's numbers?"
- **Unit:** `good | usable | poor` (`QualityReport.overall`), displayed as **Good / Fair / Limited** with up to two plain reasons (research 09 §3.3).
- **Status:** measured (a diagnostic, not a claim about the serve).
- **Checks.** These are computed per serve and aggregated. The list adapts research 06 §14, and thresholds are *initial*. "Block" = the metrics that depend on the check become unavailable for that serve with the listed code. CAPTURE §8 owns how each check is computed live; this table owns the status mapping.

| id | Check | Pass | Warn | Block (affected metrics) |
|---|---|---|---|---|
| `fps` | Real capture fps | ≥ 60 | 30–59: timing σ doubles | < 30 (all timing) `FPS_TOO_LOW` |
| `time-base` | Proven, or gravity-consistent | proven | physics-fixed (speed blocked) | unknown (timing, speed) `TIME_BASE_UNKNOWN` |
| `frame-gaps` | Missing frames in the serve window | ≤ 2% | 2–10% | > 10% (timing) `FRAMES_DROPPED` |
| `subject-size` | Standing height in pixels, at 1080p-equivalent resolution (short side 1080) | ≥ 300 px | 250–299: info, suggest 4K; 150–249: warn, pose metrics downgraded one level | < 150 (pose metrics) `POSE_LOW_QUALITY` |
| `framing` | Full body inside a 3% margin from setup to landing, with ≥ 0.1 m of ground below the feet | yes | feet cut at landing only | head or hitting arm out at contact (contact) |
| `toss-headroom` | Live: frame top in the ball's plane (after a 0.3·tan(vFOV/2) toss-offset allowance, about 0.12 m); recorded: the §2.4.3 apex case | live ≥ 4.5 m; apex bracketed | live 4.3–4.5 m (info); apex fitted (`APEX_EXTRAPOLATED`) or censored; session > 10% censored → spread "at least" | live < 4.3 m blocks recording (D1); per serve: too few samples (toss spatial) |
| `ball-visibility` | Toss detections ÷ free-flight frames | ≥ 80% | 50–80% | < 50% or < 6 detections (toss) `BALL_NOT_TRACKED` |
| `exposure` | Clipped pixels in the subject box; subject vs background luminance | < 5% clipped | 5–15%, or backlit | > 15% (pose) `LOW_LIGHT` |
| `flicker` | FFT of mean frame luminance over 2 s: 100 Hz component at its alias (20 Hz at 60/120 fps, 100 Hz at 240 fps; research 05 §9.6) | < 3% | ≥ 3%: condition class `flicker` | ≥ 3% blocks `speed-experimental` (`FLICKER`) |
| `condition` | Light condition class (§1.3) | day | overcast (info); night-lights or flicker: pose-derived metrics capped at experimental until validated (`CONDITION_NOT_VALIDATED`) | — |
| `blur` | Ball streak length at contact ± 2 frames | ≤ 2 diameters | 2–3 | > 3 (`speed-experimental`) `MOTION_BLUR` |
| `stability` | Background feature drift within a serve and across the block | ≤ 0.002 frame heights | ≤ 0.01 | > 0.01 (spreads, positions) `CAMERA_MOVED` |
| `level` | Pitch and roll (§1.1) | measured, ≤ 5°, rectified | estimated from background verticals (info); unknown: absolute heights, cm positions and angles experimental (`PITCH_UNKNOWN`) | > 5° (8° after the tilt test), or yaw > 15° (heights, positions, angles) `CAMERA_TILTED` |
| `roles` | Serves with a geometric role unassigned (`ROLE_AMBIGUOUS`) | ≤ 10% | 10–30% | — |
| `people` | Another person overlapping the server's box | no | nearby | tracker lost the server (that serve) `POSE_LOW_QUALITY` |
| `pose` | `trackingQuality` (pose README) | ≥ 0.7 | 0.5–0.7 | < 0.5 (pose metrics) |
| `segmentation` | Serves with release, apex and contact found | ≥ 90% | 70–90% | — |
| `scale` | Gravity scale vs body scale | ≤ 8% apart | 8–15% | > 15% (cm values) `SCALE_INCONSISTENT` |
| `plausibility` | Serves with a hard plausibility reject (§4.2) | 0 | 1–2 per block (each shown as "not measured") | > 20% of the block: the block's statistics are unavailable (`IMPLAUSIBLE_VALUE`) |
| `audio` | Audio usable (off by default) | on and usable, or off (info only) | — | — |
| `view` | Detected view = declared | yes | — | mismatch (view-specific) `VIEW_MISMATCH` |

- **Session overall:**
  - `good` if every serve passes, ignoring info-level items.
  - `usable` (Fair) if any warning occurs and ≥ 70% of serves are analysable.
  - `poor` (Limited) if a session-level block occurs (`view`, `time-base`, `fps`) or < 50% of serves are analysable.
  - An internal score of 0–100 (100 × product of per-check weights: pass 1, warn 0.9, block 0.5, averaged over serves) ranks sessions and picks the two headline reasons. It is never shown as a number.
- **Validation:** each flag must fire in its synthetic trigger scenario with ≥ 95% sensitivity and ≤ 5% false alarms on S0 (§5.4).

### 3.26 `fatigue-flag` and `load-flag` (session flags, added)

These are described in §4.8. They are listed in `metrics.json` as `kind: 'flag'`.

### 3.27 `leg-drive` (hero 5, D5)

- **Question:** "Am I using my legs?"
- **Unit:** value = hip rise as % of standing height; `secondary.cm`. Displayed as "Your hips rose about 12% of your height (≈ 21 cm) from your lowest point to contact". A player-relative band (`bandBasis: 'player-relative'`) is shown beside it once the reference exists: "Less drive than your usual", "Your usual drive", "More drive than your usual".
- **Views:** side only. Rear → `VIEW_NOT_SUPPORTED` (§2.8).
- **Formula** (gap: geometry §5):
  - `h_mid(t) = (y_floor − y_midhip(t)) / H_HU` on rectified coordinates. The mid-hip is the midpoint of the two hip keypoints, so pelvis turn and tilt largely cancel and left/right labels do not matter.
  - `t_low` = the time of the lowest `h_mid` in `[tossRelease, contact − 0.08 s]`: the same window as the trophy (§2.4.4). The raw minimum is used even when the trophy event fell back to the toss-arm method, so players who barely bend still get a value.
  - **`leg-drive = 100 × (h_mid(t_contact) − h_mid(t_low))`**, in % of standing height.
  - `secondary.airborneAtContact` (reliable yes/no): both feet unplanted at the contact frame (§2.4.6).
  - `secondary.peakHipSpeedMps` (**experimental**, never in headlines): the peak upward mid-hip speed between `t_low` and contact, from a local quadratic fit over 7–9 frames. This is the candidate "leg-drive speed" (Kovacs' back-hip rise speed; gap: coaches §4.3; about ±10% at 60 fps under the gap's noise model).
- **Prerequisites:** side view; release and contact found; `H_HU`; hips visible (≥ 0.5) through the window; fps ≥ 30. The cm value needs `H_m`. Pitch is not required: vertical differences at hip height are unaffected to first order (§1.1).
- **Status:** estimated today (V1) and as target. Night cap applies. Contact wrist-only → experimental (the contact time is uncertain).
- **Uncertainty:**
  - Per serve: `σ_r = √(2·σ_hip² + (v_hip · σ_tc)²)`, with σ_hip = 0.02 BH per mid-hip reading (§1.2) and `v_hip` the upward hip speed at contact (about 0.5–1.5 m/s, so ≤ 1% of height at σ_tc = 13 ms). That is about 3% of height.
  - σ_p: a posture-dependent keypoint shift, because the hips go from frontal at trophy to profile at contact (1–2% of height, UNVERIFIED). It is persistent, so it cancels in player-relative comparisons.
  - Total per serve about 3–4% of height; the session median at n = 12 has a random part of about 1%. The gap's ±1.5–2% assumed 2 cm of keypoint noise; the planning value stays larger until §5.5 scores the hips.
- **Player-relative band:** as §3.15, with the reference over ≥ 2 matched sessions and a "your usual" half-width of max(2% of height, 2·SE). `BASELINE_BUILDING` before. **No population thresholds.**
- **Reference:** the professional **centre-of-mass** rise of 15.8 ± 3.4% of height (22 professionals; r = 0.87 with impact height) [G8] and 15–17.5% in national and provincial women [G9] are CoM rises, not mid-hip rises (the CoM also rises as the arms go up). They are **never** used as a band, a target or a comparison; "How we measure" names them only as a different quantity. Recreational hip rise is UNVERIFIED (gap: geometry §11).
- **Direction:** higher is better as a direction of travel (`higherIsBetter`), never a target. Coaching must describe a quick, single rise, never "jump" or "bend more" (gap: coaches §5 T1; Intuitive Tennis' passive leg drive).
- **Plausibility** (§4.2) [Our inference]: hard reject < −5% or > 40% of height; soft flag < 0% or > 30%.
- **Aggregation:** median, order-statistic CI (n < 20), n ≥ 8 for the session value.
- **Validation:**
  - Synthetic truth: `canonical['leg-drive']` (`legDrive.hipRisePctHeight`).
  - Thresholds (gap test 5): per-serve MAE ≤ 2% of height at 60 fps with the §1.2 hip noise injected; 95% coverage ≥ 93%; `peakHipSpeedMps` within ±0.25 m/s at 60 fps; S11 mirrors leave it unchanged.
  - Real: V2 annotated hip centres at the lowest and contact frames (MAE ≤ 2.5% of height); V3 two synchronised phones or IMUs (gap: geometry §9 item 7).

### 3.28 `drive-time`

- **Question:** "How quickly do I drive up to the ball?"
- **Unit:** ms. Displayed as "0.38 s from your lowest point to contact". It is also `rhythm-release-to-contact.secondary.driveMs`.
- **Views:** side only.
- **Formula:** `drive-time = (t_contact − t_trophy) · 1000`, where `t_trophy` is the `pelvis-min` trophy (§2.4.4), the lowest mid-hip.
- **Prerequisites:** trophy found by `pelvis-min` (not the fallback: `POSE_LOW_QUALITY`); contact found; fps ≥ 30; time base proven or physics-fixed.
- **Status:** estimated today and as target. **Trend only**: it has no direction, so there are no "Did it work?" verdicts; trend classification uses an SWC of 60 ms. Night cap applies.
- **Uncertainty:** `√(σ_trophy² + σ_contact²)`, about 47 ms at 60 fps (the flat hip minimum dominates; gap: geometry §5 gives ±35–50 ms).
- **Reference (context):** acceleration phase 0.40 ± 0.07 s in professionals [G8]; CoM lowest 0.38 ± 0.08 s before impact and leg-drive duration 0.26 ± 0.07 s in ITN 3 players [G7]. Different event definitions; never a target.
- **Plausibility** (§4.2) [Our inference]: hard reject < 0.05 s or > 1.2 s; soft flag < 0.15 s or > 0.8 s.
- **Aggregation:** median, order-statistic CI, n.
- **Validation:** `canonical['drive-time']` (`legDrive.driveTimeS`); MAE ≤ 50 ms at 60 fps; coverage ≥ 93%.

### 3.29 `loading-depth` (descriptive only)

- **Question:** "How far do my hips dip as I load?"
- **Unit:** a description, with the value as % of standing height (`secondary.cm`). At most **two levels**, "small dip" (< 3% of height) and "clear dip" (≥ 3%), reported on the session median only and only when the level has probability ≥ 0.7; otherwise the value is described without a level. These describe; they never rank.
- **Views:** side only.
- **Formula:** `loading-depth = 100 × (h_mid(t_tossRelease) − h_mid(t_low))`, with `t_low` as in §3.27.
  - `secondary.hipDipCount` (**experimental**): the number of mid-hip local minima in `[motionStart, contact − 0.08 s]` with prominence ≥ 3 × the measured cleaned mid-hip noise (*initial* 0.03 BH) and at least 0.25 s apart. Two dips is the "double knee bend" pattern (gap: coaches §2.4; research 04 F10).
- **Never a coaching trigger for "bend more".** It has no direction, no `targetBand`, no SWC, no verdict and no population band. In professionals the CoM drop was 5.5 ± 2.3% of height with a between-player CV of 42%, and was not related to racket speed or impact height [G8]; depth is not the goal (gap: coaches §5 T1).
- **Prerequisites:** as §3.27.
- **Status:** estimated (descriptive) today and as target. Night cap applies.
- **Uncertainty:** about 3% of height per serve (two mid-hip readings, §1.2), about 1% for a session median at n = 12.
- **Plausibility** (§4.2) [Our inference]: hard reject < −5% or > 30% of height; soft flag > 20%.
- **Validation:** `canonical['loading-depth']` (`legDrive.loadingDepthPctHeight`); MAE ≤ 2% of height; two-level agreement ≥ 85% on session medians at least 1% of height from the cut; `hipDipCount` exact on ≥ 90% of synthetic double-dip renders.

### 3.30 `deep-bend-flag` (experimental)

- **Question:** "Did I bend deeply at the top?"
- **Unit:** yes/no, displayed only as "Deep bend: yes (experimental)". "No" displays nothing. It never says "little bend" or "no bend" (the side view cannot separate little from moderate).
- **Views:** side only.
- **Formula** (estimator E4, gap: geometry §3.2): the side view foreshortens the knee angle, but vertical extents are always in plane.
  - From ≥ 5 upright setup frames, the front leg's thigh length `L_t` (hip→knee) and shank length `L_s` (knee→ankle), in metres at the ankle's depth (±1%). The front leg is the chain of the geometric front foot (§1.1).
  - At trophy (± 2 frames): the vertical extents `e_t`, `e_s` of the same segments; inclinations `β_t = acos(min(1, e_t / L_t))`, `β_s = acos(min(1, e_s / L_s))`; `θ_E4 = β_t + β_s`.
  - **Flag yes** when `θ_E4 ≥ 45°` with probability ≥ 0.7 under σ_θ = 11.5°.
- **Error:** under the gap's noise model the two-level call is wrong on about 14% of serves whatever the knee direction; E4 cannot tell under 20° from 20–45° (57% wrong at a true 10°), which is why only "deep: yes" is offered.
- **Before V1:** re-simulate with the **measured** ROI noise (§1.2). If the two-level error exceeds 15%, the flag is not built (`NOT_IMPLEMENTED`).
- **Prerequisites:** side view; trophy found; front-leg hip, knee and ankle visible (≥ 0.5); standing segment lengths; pitch known or estimated; experimental toggle.
- **Status:** experimental today and as target; evidence tier experimental. Night cap applies.
- **Use:** never "bend more". COACHING may mention it only as an observation next to `leg-drive` (for example "deep bend, slow rise": the "stuck at the bottom" pattern, gap: coaches §4.3).
- **Validation:** `canonical['deep-bend-flag']` (front-knee 3D flexion at trophy ≥ 45°; `alt.frontKneeAtTrophy3DDeg`); two-level error ≤ 15% (gap test 1); false "yes" ≤ 10% on truths below 35°.

### 3.31 `shoulder-over-shoulder-contact` (rear view only, experimental)

- **Question:** "Do my shoulders tilt up into the hit?"
- **Unit:** band against the player's own range (`bandBasis: 'player-relative'`), displayed as "Less tilt than your usual", "Your usual tilt", "More tilt than your usual". No degrees (D5); never compared with the published 48°, whose definition is unresolved (gap: geometry §4.1).
- **Views:** **rear only.** Side → `VIEW_NOT_SUPPORTED`: at contact the shoulder line is 65–84° out of the side plane, so a true 48° reads 69–84° (gap: geometry §4.2).
- **Formula:** at contact (± 1 frame), on coordinates rectified from the rear camera's measured pitch: S_h = the shoulder on the hitting wrist's side (geometric hitting wrist, §1.1), S_t = the other. `φ_c = atan2(y_t − y_h, hitDir · (x_h − x_t) · aspect)` in degrees; positive = hitting shoulder higher. The shoulder line is within 6–25° of the rear plane at contact, so projection adds 1–3°.
- **Band rule:** as §3.15 (≥ 2 matched rear sessions; hysteresis; `BASELINE_BUILDING`). σ_φ = 6° per serve (planning).
- **Prerequisites:** rear view; contact found; both shoulders visible (≥ 0.5); rear pitch known.
- **Status:** experimental today and as target (until a V3 two-view check). Night cap applies.
- **Reference:** [Coaching interpretation] Kovacs' shoulder-over-shoulder (research 03 [S1]); absolute shoulder-line side tilt at impact 41.7 ± 7.8° flat and 33.4 ± 10.2° kick in 3D (Reid et al., gap: geometry §4.1) is context only, never compared.
- **Validation:** `canonical['shoulder-over-shoulder-contact']` (`alt.deg2DLevel` vs the 3D value); rectified 2D within ±4° of 3D (gap test 4); band agreement ≥ 85% on injected ±10° shifts.

### 3.32 `speed-average-rear` (D4): average speed to a bounce located in video

- **Question:** "Roughly how fast was that serve over its flight?"
- **Unit:** km/h range, always named "average speed over the flight to the bounce", rounded outward to 5 km/h. Never a single number.
- **Views:** **rear only** (the optional outcomes view). Never mixed with `speed-experimental` (a different view and a different quantity, D1).
- **Default:** unavailable (D4). Experimental when every prerequisite holds and the experimental toggle is on.
- **Prerequisites:**
  - rear view;
  - the four-corner court tap (`calibration:court-4pt`; else `NEEDS_CALIBRATION`);
  - contact found;
  - **the bounce located in video** (`detectBounce` → `mapBounceToCourt` through the homography); a bounce sound alone is never enough (`BOUNCE_NOT_LOCATED`);
  - a proven time base; fps ≥ 60.
- **Formula** (`speedFromFlightTime`, `ball/speed.ts`):
  - Flight time T = bounce time − contact time, both from video. **Audio may refine both times only**: an onset within ±2σ of the video time is used after removing its own sound delay (contact: the rear camera's distance to the server; bounce: the distance from the camera to the *located* bounce, via the homography).
  - Path = the chord from the contact region (the server's feet through the homography, plus the contact-height ratio × `H_m` when available; otherwise the engine's default region) to the located bounce ± 2σ of its court position, times an arc factor of 1.005–1.02.
  - Range = [path_low ÷ T_high, path_high ÷ T_low].
- **Error budget:** about 2.6% at the median and 6.1% at the 90th percentile with the bounce located to ±0.3 m and 5 ms onset timing (gap: geometry §7.3).
- **Coverage gate:** the ball is only about 4 px (1080p) to 7 px (4K) across at the far service line, below the 8 px detection threshold (CAPTURE §6.2), so bounce location is marginal. **4K is recommended for the rear view.** Per session and stratum, if bounces are located on fewer than 50% of the serves that went in, the session "typical" is unavailable (`BOUNCE_NOT_LOCATED`), because the located subset is biased towards easy-to-see bounces. Per-serve ranges remain.
- **Display gate:** (high − low) ÷ midpoint ≤ 0.35, else `RANGE_TOO_WIDE` (the engine itself refuses at ±25% half-width).
- **Quantity:** average speed. It reads about 20% below a radar peak (research 05 [S35]).
- **Aggregation:** as §3.22, per stratum. No "Did it work?" verdicts.
- **Validation:**
  - Synthetic truth: `canonical['speed-average-rear']` (`metrics.avgSpeedContactToBouncePathKmh`).
  - Thresholds: coverage ≥ 90%; median |midpoint error| ≤ 4%; the located-bounce rate reported at 1080p and 4K; unavailable in 100% of side-view clips.
  - Real (V3): a synchronised 240 fps second camera for contact and bounce times, with radar logged for context.

---

## 4. Part C: statistics rules

### 4.1 Minimum n, frame-rate floor and provisional labels

**One frame-rate floor:** 30 fps for every metric (CAPTURE's 24 fps floor should align). Metrics with their own higher floor say so (for example `trophy-pause` 60 fps, speed 120 fps).

| Quantity | n < min | Provisional ("early read") | Settled |
|---|---|---|---|
| Per-serve values | — | — | always shown with their own interval |
| Centre (mean or median) of a continuous metric | < 5: show the dots only, no summary (`TOO_FEW_SERVES`) | 5–11 | ≥ 12 |
| Spread (SD) | < 8: hidden | 8–19, with its corrected chi-square CI | ≥ 20 (research 06 §7.3) |
| Rates | < 10: "7 of 9 in", with no % and no band | 10–29: % with a Wilson band | ≥ 30 |
| Bands (session) | < 5: per-serve bands only | 5–11 | ≥ 12 |
| Player-relative band reference | < 2 matched sessions with ≥ 8 included serves each: `BASELINE_BUILDING` | — | ≥ 2 sessions |
| Trend over sessions | < 2 matched sessions with ≥ 8 included serves each: "Building your baseline (1 of 2 sessions)" (research 09 §3.2) | 2 sessions: comparison only, no trend verdict | ≥ 3 sessions (research 06 §7.3) |
| "Did it work?" | Centres: < 8 included serves on either side. Spreads: < 12 on either side. Rates: < 10 on either side. → `not-comparable` | — | — |

- Blocks of the same stratum within one session are pooled (§1.6), so two standard 15-serve blocks from one side give about 24 included serves.
- Provisional values carry `provisional: true` and the UI marks them "early read".
- **Headline rule:** a provisional *centre* never headlines. A provisional *spread* with n ≥ 12 may headline, labelled "early read" and shown with its interval. A standard 15-serve block yields about 12 measured serves, and the lead hero metric must be able to headline from a standard session.
- **Coaching triggers** never use provisional values, except the F3, F4 and F12 statistics (§4.10), whose bound rules already account for n (F3 needs n ≥ 12).

### 4.2 Estimators, plausibility bounds and outliers

**Order of operations per serve:** rectify → events → metric values → **plausibility bounds** → inclusion rules (§1.5) → aggregation.

**Plausibility bounds** (adopted from gap: ranges §8, with our additions marked). They are applied **before aggregation and regardless of confidence**: a confidently wrong value (a swapped wrist, a dribble parabola accepted as a toss, a wrong contact frame, a wrong slow-motion factor) otherwise inflates the hero spread and "Did it work?".
- **Hard reject:** an almost-certain detection, time-base or calibration error. The value is excluded, the serve keeps a "not measured" chip, reason `IMPLAUSIBLE_VALUE`, and it counts in N but not in X ("X of N measured").
- **Soft flag:** physically possible but outside every published human value. The value is kept, its confidence is multiplied by 0.7, and review offers "Check this serve?" (`CHECK_THIS_SERVE`).

| Quantity | Hard reject | Soft flag | Basis |
|---|---|---|---|
| Entered standing height | < 1.30 or > 2.20 m | < 1.45 or > 2.05 m | Adult range; ABS means 175.6 and 161.8 cm [N20] |
| Release height | < 0.45× or > 1.50× stature | < 0.65× or > 1.25× | Published means 0.93–1.02× |
| Release to apex | < 0.25 s or > 0.85 s | < 0.38 s or > 0.72 s | Rise 0.3 m ↔ 0.25 s; 3.55 m ↔ 0.85 s |
| Apex height | Below contact height − 0.10 m, or > 5.5 m | < 2.4 m or > 4.6 m (or < 1.45× / > 2.6× stature) | An apex cannot be below a later point on the same flight |
| Apex to contact (signed time) | < −0.15 s or > 0.70 s | < 0 s (contact on the rise) or > 0.57 s | 0.57 s ↔ a 1.6 m drop |
| Drop from apex to contact | > 2.2 m | < 0.03 m or > 1.6 m | Largest per-player mean 1.41 m [N1] |
| Release to contact | < 0.40 s or > 1.60 s | < 0.60 s or > 1.35 s | Physics 0.49–1.40 s |
| Contact height ratio | < 1.10 or > 1.75 | < 1.30 or > 1.62 (confirm entered height) | Published extremes 1.36–1.56 |
| Contact forward of the front toe (side) | < −0.8 m or > 2.0 m | < −0.3 m or > 1.2 m | Published means 0.1–0.8 m |
| Toss forward of the front toe (side) | < −0.8 m or > 2.0 m | < −0.3 m or > 1.2 m | [Our inference: contact bounds applied to the toss] |
| Within-player apex SD (vertical, session) | > 0.60 m | > 0.35 m | Mixed strata, re-tosses or tracking swaps |
| Within-player release-to-contact SD (session) | > 0.30 s | > 0.15 s | About 3× the typical upper edge |
| Landing distance | < −0.8 m or > 2.5 m | < −0.3 m or > 1.5 m | Physics (gap: ranges §7.5) |
| Fitted gravity on a toss (near-apex window, stature scale and time base) | Outside 7.0–13.0 m/s² | Outside 8.8–10.8 m/s² | A wrong slow-motion time base or a wrong entered height. A hard failure excludes that toss's timing and cm values; a session median outside the hard range triggers §2.9 or `SCALE_INCONSISTENT` |
| Leg drive (hip rise) | < −5% or > 40% of height | < 0% or > 30% | [Our inference: CoM rises 15.8 ± 3.4% in professionals, G8] |
| Drive time | < 0.05 s or > 1.2 s | < 0.15 s or > 0.8 s | [Our inference: 0.26–0.40 s published, G7, G8] |
| Loading depth | < −5% or > 30% of height | > 20% | [Our inference: CoM drop 5.5 ± 2.3%, G8] |
| Launch speed midpoint (`speed-experimental`) | < 40 or > 240 km/h | < 60 or > 200 km/h | [Our inference] |
| Average speed midpoint (`speed-average-rear`) | < 30 or > 200 km/h | < 50 or > 170 km/h | [Our inference] |

**Caught tosses** (no contact within 1.6 s of release, the §2.3.4 `retoss` class) are "toss only": counted as "tosses caught", excluded from contact and drop metrics, and shown in apex spread only as a separate figure, because they are the tosses players judged bad (gap: ranges §8).

**Centre:**
- Mean for symmetric continuous metrics: `toss-forward`, `contact-height-ratio`, `contact-forward`, `landing-distance`.
- Median for skew-prone ones: `toss-apex-height`, `toss-drop`, `rhythm-release-to-contact`, `trophy-pause`, `leg-drive`, `drive-time`, `loading-depth`, `repeatability` deviations.

**Spread:**
- The sample SD over all included serves. Real wild tosses are *not* removed, because inconsistency is the signal.
- After the plausibility bounds, a value is excluded as a statistical outlier only if it is > 3.5 robust SD from the median (robust SD = 1.4826·MAD) **and** its confidence is < 0.6.
- `1.4826·MAD` is stored as `secondary.robustSd` for diagnostics.

**Noise correction:** `SD = √max(SD_obs² − mean(σ_r²), 0)`, with σ_r the tracking and timing noise only; `σ_leak` is never subtracted (§1.2). Spreads are compared only after correction, so a 30 fps session is not penalised for its larger timing noise. Observed SD = √(true² + error²) (research 06 §7.2).

**Multi-session baselines:** use the **pooled within-session SD**, `s_pool² = Σ(n_i − 1)·s_i² ÷ Σ(n_i − 1)` with `Σ(n_i − 1)` degrees of freedom, then correct it. Pooling the serves of several sessions into one SD would add between-session mean shifts (wind, the per-session scale) to the baseline spread and bias every follow-up towards "better".

### 4.3 Intervals (all 95% unless stated)

- **Wilson score interval for rates** (research 06 [S32]; research 09 §3.4). With `p̂ = k/n` and z = 1.96:
  - `centre = (p̂ + z²/2n) / (1 + z²/n)`;
  - `half = z·√(p̂(1−p̂)/n + z²/4n²) / (1 + z²/n)`.
- **Difference of two rates:** Newcombe's hybrid score interval (method 10), built from the two Wilson intervals `(l₁,u₁)` and `(l₂,u₂)`:
  - `lower = δ − √((p₁−l₁)² + (u₂−p₂)²)`;
  - `upper = δ + √((u₁−p₁)² + (p₂−l₂)²)`.
- **Means:** `mean ± t₀.₉₇₅,n−1 · SD/√n`, widened to `√(SE² + σ_s² + σ_p²)` for absolute display (§1.2).
- **Medians, n < 20: order-statistic (binomial) interval.** Use the tightest symmetric pair `[x₍ⱼ₎, x₍ₙ₊₁₋ⱼ₎]` with coverage ≥ 95% [our computation of binomial coverage]:

| n | Interval | Coverage |
|---|---|---|
| 5 | [x₁, x₅] | 93.8% (labelled "94%") |
| 6–8 | [x₁, xₙ] | 96.9–99.2% |
| 9–11 | [x₂, xₙ₋₁] | 96.1–98.8% |
| 12–14 | [x₃, xₙ₋₂] | 96.1–98.7% |
| 15–16 | [x₄, xₙ₋₃] | 96.5–97.9% |
| 17–19 | [x₅, xₙ₋₄] | 95.1–98.1% |

  For absolute display each half-width is combined in quadrature with `1.96·√(σ_s² + σ_p²)`. The percentile bootstrap is discrete and poorly calibrated at n = 5–11, so it is used only from n = 20.
- **Medians n ≥ 20, and repeatability:** percentile bootstrap, B = 2,000 resamples of serves. The seed is a hash of the session id, so reruns are identical.
- **SD:** chi-square interval on the *observed* SD, `[s·√((n−1)/χ²₀.₉₇₅), s·√((n−1)/χ²₀.₀₂₅)]` (research 06 [S31]), transformed to the corrected SD as in §3.6 (with ±20% on σ_r). Use the bootstrap instead when |sample skewness| > 1. For a pooled baseline use `Σ(n_i − 1)` degrees of freedom.
- **Log-SD ratio:** `ln(SD₂/SD₁)` with `SE² ≈ 1/(2(n₁−1)) + 1/(2(n₂−1))` (research 06 §7.2) is kept for *planning* only (§4.5 step 2); spread verdicts use the bootstrap of corrected variances.

### 4.4 Matched comparisons

Two samples are **matched** when all of these are equal:
- view and camera side;
- **set-up class** (`portrait-near`, `landscape-fence`, `landscape-near`, `rear`) for absolute spatial metrics, spreads and pose-derived metrics. The two side set-ups have different distance-dependent biases (toss offset 11.6 vs 8.6 cm at 6 vs 8 m; sideways leak into spread 3.7 vs 2.8 cm) and different noise, so switching set-ups would otherwise show up as a change in toss height, contact height or spread. **Timing metrics** (`rhythm-release-to-contact`, `rhythm-spread`, `toss-drop` on its physics path, `trophy-pause`, `drive-time`) may be compared across side set-up classes, with the note "different set-up";
- court side;
- serve number;
- intended type ("unknown" matches only "unknown");
- handedness;
- for rates, the entry mode (per-serve tags vs tally).

Otherwise the comparison is `UNMATCHED` (D7; research 09 §4.1).

**Soft factors** are allowed, but each widens or labels the comparison:
- **fps class** (30 vs ≥ 60): allowed, because noise correction and σ handle it.
- **Subject size** differs by more than 1.5×: allowed, with an info note.
- **Condition class** differs (for example day vs night-lights): allowed with the label "different light", provided both sides are eligible in their own class (§1.3).
- **Capture quality** `poor` on either side: not comparable.
- **Player height changed:** recompute all cm values from the stored ratios. Never compare cm values across height edits.

### 4.5 "Did it work?" verdict algorithm

**Inputs:**
- the focus metric id (from COACHING's decision);
- the stratum;
- **baseline:** included serves from up to the 3 most recent matched sessions *before* the focus started, capped at 60 serves (most recent first); spreads use the pooled within-session SD (§4.2);
- **follow-up:** included serves from matched sessions after the practice record, up to 3 sessions, read only at the pre-planned looks below;
- the metric's direction (`higherIsBetter`, `lowerIsBetter` or `targetBand`);
- the SWC and the between-session SD τ (table below);
- per-serve values with σ_r, and the σ_s of each session.

**Eligibility.** Verdicts are computed only when the metric has a direction and:
- its emitted status is measured or estimated on both sides, in each side's condition class; **or**
- it is a **player-entered practice outcome rate** (`serve-in-rate`, `first-serve-in-rate`, `second-serve-in-rate`, `double-faults` per second serve), labelled **"from your tags"**, with the same entry mode (per-serve tags vs tally) and the same serve number on both sides. D11's primary segment is defined by first-serve % and double faults, so the engine must be able to give a verdict on them.

Never: experimental values; speed; bands (`knee-bend-band`, `shoulder-tilt-trophy`, `shoulder-over-shoulder-contact`); `loading-depth`; `deep-bend-flag`; `drive-time` and `landing-distance` (trend only, §4.6); rear auto-outcomes; the match log.

**Goodness transform:** per serve, `g(x)` is:
- `x` for higher-is-better metrics;
- `−x` for lower-is-better metrics;
- `−dist(x, band)` for target-band metrics, where `dist` is 0 inside the band.

**Effect and SE:**
- **Centres:** `Δ` = follow-up minus baseline in goodness units (positive = better), with
  `SE² = V₁/n₁ + V₂/n₂ + 2σ_s² + τ²·(1/k₁ + 1/k₂)`,
  where V is the per-serve variance of g, k is the number of sessions contributing to each side, and τ is the between-session SD of the player's true session value. Serves within a session are clustered (warm-up, wind, light, fatigue), so without τ one good follow-up session could produce "clearly better". For medians, `V/n` is replaced by the bootstrap (n ≥ 20) or order-statistic-derived variance of the median. τ starts at the prior in the table below (to be replaced by multi-day V2 test–retest, §5.6) and is updated from the player's own history once ≥ 4 matched sessions exist: the empirical-Bayes combination of the prior and the between-session variance of the player's session values, net of their within-session SE².
- **Rates ("from your tags"):** Newcombe's interval, with each bound widened in quadrature by `z·τ_rate·√(1/k₁ + 1/k₂)` (τ_rate prior 5 percentage points).
- **Spreads:** a stratified bootstrap (B = 2,000; serves resampled within each session; σ_r scaled by a factor drawn uniformly from 0.8–1.2 in each replicate). Each replicate computes the corrected variances `V_c = max(s_pool² − mean(σ_r²), 0)` for both sides and the relative change `Δ_rel = 1 − √(V_c,follow ÷ V_c,base)` (positive = tighter; at most 1). The CI is the replicate percentile interval, widened on the log scale by `τ_spread·√(1/k₁ + 1/k₂)`. This avoids −ln of a corrected SD, which goes to infinity near the measurement limit.
- **Measurement limit:** if `nearMeasurementLimit` holds on either side, the verdict is **`at-measurement-limit`**, "At the limit of what we can measure", with no direction.

**Pre-planned looks.** Players will re-check after every session against the same baseline, and repeated checks inflate false "likely better" verdicts. So each experiment (a focus with its baseline) has **at most 3 looks**: after follow-up sessions 1, 2 and 3 (or earlier, when the planned N from step 4 below is reached; the third look is final). Boundaries use Pocock constants for 3 equally spaced looks [our computation: two-sided α 0.05 → 2.29; α 0.20 → 1.65]. Opening the card between looks shows the last verdict. The "How we measure" sheet shows "check {k} of 3". A new focus, or a reset baseline, starts a new count.

**Rules**, evaluated in order. CI95* = Δ ± 2.29·SE; CI80* = Δ ± 1.65·SE (percentile equivalents for the spread bootstrap).

| Verdict id | Rule | Player-facing words |
|---|---|---|
| `not-comparable` | Below the §4.1 minimum on either side, or `UNMATCHED`, or either session is `poor`, or not eligible | "Not comparable yet: {reason}" |
| `at-measurement-limit` | `nearMeasurementLimit` on either side (spreads) | "At the limit of what we can measure" |
| `clearly-better` | CI95* lower > 0 **and** Δ ≥ SWC | "Clearly better" |
| `clearly-worse` | CI95* upper < 0 **and** Δ ≤ −SWC | "Clearly worse" |
| `no-clear-change` | CI95* lies entirely within (−SWC, +SWC) | "About the same" |
| `likely-better` | CI80* lower > 0, or CI95* lower > 0 but Δ < SWC ("small but real") | "Likely better. About {N} more serves to confirm" |
| `likely-worse` | CI80* upper < 0 (mirror) | "Likely worse. About {N} more serves to confirm" |
| `too-early` | Otherwise | "Too early to tell. About {N} more serves would settle it" |

Rates add "(from your tags)" after the verdict words.

**Within-session mode** (CAPTURE §5.5 "Experiment": block A vs block B in one session):
- Same stratum; the §4.1 minimums apply per block.
- `SE² = V₁/n₁ + V₂/n₂` (no σ_s and no τ: the session is shared).
- One look only, at the end of the session.
- The strongest verdicts are "likely better" and "likely worse"; **never "clearly"**.
- Always shown with the caveat "Same-session comparison: warm-up and tiredness can explain part of the difference."

**Wording and display rules:**
- Colour is never the only signal (research 09 §3.3).
- The effect is shown in plain units with its interval, for example "toss spread 14 → 9 cm".
- One *guard* metric is shown beneath: `serve-in-rate` for the stratum ("from your tags"), or `toss-height-spread` if the focus is outcome-based. If the guard is `clearly-worse`, add "…but {guard} dropped; worth a look".

**"About N more serves":**
1. **Design effect.** `Δ_shrunk = Δ × 4·SWC² ÷ (4·SWC² + SE²)`, the posterior mean under a sceptical prior N(0, (2·SWC)²); the observed Δ is inflated by selection. `Δ_design = max(SWC, |Δ_shrunk|)`.
2. **Target SE.** To confirm a direction with 80% power at the final look: `SE* = Δ_design ÷ (2.29 + 0.84)`. To confirm "about the same" (when |Δ_shrunk| < SWC/2): `SE* = (SWC − |Δ_shrunk|) ÷ 2.29`. (Planning with `SE* = |Δ|/1.96` gave only a 50% chance of confirming a true effect of that size and understated N by about 2×.) For spreads, plan on the log scale with `SE²_log ≈ 1/(2(n₁−1)) + 1/(2(n₂−1)) + τ_spread²(1/k₁ + 1/k₂)`.
3. **Adding serves to the follow-up side** over the planned k₂ = 3 sessions: `n₂* = V₂ ÷ (SE*² − V₁/n₁ − 2σ_s² − τ²(1/k₁ + 1/k₂))`. V is SD² of g for centres, and p(1−p) with the pooled p for rates.
   - If the denominator ≤ 0, use equal additions to both sides with k₁ = k₂ = 3: `n_eq = (V₁ + V₂) ÷ (SE*² − 2σ_s² − τ²·(2/3))`, and say "about {n_eq − n} more serves on each side".
   - If that denominator is also ≤ 0, no number of serves will settle it at this τ: use the > 150 message.
4. **N** = ceil(n* − current n), rounded up to a multiple of 5.
   - If N > 150: "More than 150 serves; this difference is too small to confirm by counting. Watch toss spread and contact height instead." Process metrics lead (D7).
   - Worked example [Our inference]: an 8-point serve-in gain at p ≈ 0.55 needs about 750 serves per side at 80% power; a 10-point gain about 480. Rates will almost always trigger the message, which is why process metrics lead.

**SWC and τ defaults** [Our inference]. SWCs are set near a quarter of the published elite–beginner gap, or near the 60 fps measurement error, whichever is larger. τ priors are placeholders. Both are replaced by multi-day V2 test–retest (typical error; research 09 §4.1, Hopkins approach).

| Metric | SWC | τ prior (between-session SD) | Verdict use |
|---|---|---|---|
| `toss-apex-height` | 5 cm (0.03 × height) | 4 cm | Did it work? |
| `toss-forward`, `contact-forward` | 5 cm | 5 cm | Did it work? |
| `toss-drop` | 6 cm | 5 cm | Did it work? (only with a `targetBand` from COACHING) |
| All spreads (`*-spread`) | 15% (relative) | 0.15 on the log scale | Did it work? |
| `contact-height-ratio` | 0.015 (about a quarter of the 0.066 beginner–elite gap, research 03 [S6]) | 0.010 | Did it work? |
| `rhythm-release-to-contact` | 30 ms | 30 ms | Did it work? (only with a `targetBand`) |
| `leg-drive` | 2% of height | 1.5% of height | Did it work? |
| `drive-time` | 60 ms | 30 ms | Trend classification only |
| `landing-distance` | 8 cm | 8 cm | Trend classification only |
| `trophy-pause` | 80 ms | 60 ms | None while experimental |
| `repeatability` | 5 points | 5 points | None while experimental |
| `serve-in-rate` (all variants) | 10 percentage points | 5 percentage points | Did it work? (from your tags) |
| `double-faults` (practice, per 10 second serves) | 1 per 10 second serves | 0.5 per 10 | Did it work? (from your tags) |

The θ (knee) and φ (trunk) SWCs are withdrawn with the side-view knee band and `trunk-tilt-band`.

### 4.6 Trend verdict across sessions (Progress tab)

- **Scope:** matched sessions only, ≥ 3 sessions each with ≥ 8 included serves (≥ 12 for spreads), over the last 8 weeks or the last 6 sessions.
- **Fit:** weighted least squares of session estimates on session order. Weights are `1/(SE² + τ²)`; spreads use the log of the corrected SD, and sessions at the measurement limit are shown as "≤" and left out of the fit.
- **Classification:** the fitted change across the window (slope × span) with its CI is classified by the §4.5 rules and boundaries. "Too early" becomes "Not a clear trend yet".
- **Direction-neutral metrics** (`landing-distance`, `drive-time`) use neutral words: "further in / about the same / further back" and "quicker / about the same / slower", with their SWC; never better or worse.
- **Chart:** the per-session estimate with its interval, a grey personal-range band, and the latest point labelled (research 09 §5). Match-log values (D11) may be drawn on a separate row by season week, never on the practice series.

### 4.7 Outcome-linked contrasts (the D3 signature insight)

Example: "Serves that went in had a toss about 12 cm further forward".
- **Groups:** within a stratum, player-tagged `in` vs `fault` serves, **each with ≥ 10 included values**.
- **Metrics tested:** a fixed family of 7: `toss-forward`, `toss-apex-height`, `toss-drop`, `contact-height-ratio`, `contact-forward`, `rhythm-release-to-contact`, `leg-drive`. (`landing-distance` left the family: it is trend only.)
- **Test:** Welch's t-test per metric (n is 10–20 per group, so t, not z), with **Holm's step-down correction across the 7 at a family-wise α of 0.05**, and |Δ| ≥ SWC.
- **Replication before display:** a candidate is held, not shown, until a **second matched session** shows the same sign with a one-sided Welch p < 0.10 for that single metric. Only then is the insight shown, with the data of both sessions. Picking the largest of 7 metrics across strata and sessions would otherwise produce false signature insights.
- **Limit:** at most one contrast per session: the replicated contrast with the largest |Δ| ÷ SWC.
- **"No clear difference" is a valid output** and is shown when a session has enough faults but nothing passes (research 03 [S28] found near-identical toss values for good and faulted serves; research 10 M5).
- **Wording:** association, never cause: "Your serves that went in tended to have…".
- **Context:** single-serve mechanics do not explain misses on their own. Net faults differ mainly in ball projection angle (research 03 [S23]).

### 4.8 Fatigue and load flags

- **`fatigue-flag`** (within a block):
  - Computed **per block, never across a drill or template-block boundary** (a mid-session drill, such as the CAPTURE Experiment template, would otherwise read as a decline).
  - Needs ≥ 16 included `contact-height-ratio` values in one stratum within the block.
  - Theil–Sen slope of the ratio on serve order. The predicted drop across the block is `slope × (n − 1)`.
  - Flag when the drop is ≥ 0.025 of height (about 4.4 cm at 1.75 m) **and** the **one-sided 95%** bootstrap bound of the slope is < 0 (the earlier 90% bound gave about 10% false alarms per stratum-session, against the ≤ 5% target).
  - Anchor (context): after a 3-hour match, advanced players' impact height fell about 4 cm, from 2.65 to 2.61 m, and ball speed also dropped (research 03 [S14]; research 05 [S50]). A practice block is not a 3-hour match.
  - Corroboration raises the confidence from 0.6 to 0.8: `toss-height-spread` in the last third ≥ 1.5 × the first third.
  - Status estimated; **evidence tier experimental**.
  - Copy: "Your contact point dropped in the last part of this block, which can be a sign of tiring. A shorter block next time?" It is never a health statement.
- **`load-flag`** (across sessions):
  - **Status estimated**, with the copy "based on the serves you filmed and logged". The D11 segment's serving load is mostly unfilmed comp matches, so the filmed count is a partial measure.
  - Counts: `serve-count` per session, plus player-entered match serves from the match log. In a week with a logged comp match and no match serve count, the app asks for one (a rough number is fine).
  - **Requires ≥ 28 days of history and ≥ 3 sessions**; before that it is not computed (the chronic window would be near zero and the ratio would blow up in weeks 1–4).
  - **Uncoupled ratio:** acute = serves in the last 7 days; chronic = the weekly mean over **days 8–35** (the acute week excluded).
  - Flag when the ratio is > 1.5 **and** the last 7 days hold ≥ 100 serves.
  - Anchor: a ratio above 1.5 went with a hazard ratio of about 2.8 for new injury in adult high-performance players (research 03 [S43]). The coupled acute:chronic ratio is contested and its anchor is elite adults, so the **evidence tier is coach-recommended**; transfer to recreational players is [Our inference].
  - Copy points to a gradual ramp. Pain routing belongs to COACHING (D6, D8).

### 4.9 Display precision

| Value type | Rounding |
|---|---|
| Heights and distances | 1 cm per serve; session means 1 cm |
| Ratios | 2 decimals (1.46×) |
| % of height (leg drive, loading depth) | Whole per cent |
| Durations | 10 ms |
| Spreads | 0.5 cm, or 5 ms |
| Rates | Whole per cent |
| Speed | Outward to 5 km/h |
| Index | Integer |
| Bands and flags | Words only |

Never show more precision than half the displayed 95% interval would support. If the interval half-width is ≥ 10 cm, round centimetres to 5.

### 4.10 Provisional recreational bands and trigger statistics (adoption decisions)

Gap: ranges §7 proposes provisional UTR 1–7 bands and fault-trigger rules. This spec adopts or rejects each explicitly. Every adopted band is [Our inference], evidence tier `experimental`, versioned (`bands_v1_provisional`, stored with each session so historical verdicts stay reproducible) and replaced by the empirical bands of the gap: ranges §9 reference set when its cells fill.

| Metric | Provisional band (low / typical / high) | Edge uncertainty | Decision |
|---|---|---|---|
| `toss-height-spread` | < 8 / 8–20 / > 20 cm ("tight / typical / scattered") | ±50% | **Adopted**, descriptive; F3 statistic (§3.6) |
| `toss-forward-spread` | < 10 / 10–25 / > 25 cm | ±50% | **Adopted**, descriptive; F3 forward statistic (lower bound ≥ 18 cm) |
| `toss-drop` | Men < 0.30 / 0.30–1.00 / > 1.00 m; women < 0.40 / 0.40–1.25 / > 1.25 m; sex not given < 0.30 / 0.30–1.25 / > 1.25 m | ±0.15 m | **Adopted** with sex-specific edges; F4 statistic needs co-signals (§3.5). Replaces the single 100 cm flag |
| `contact-height-ratio` | < 1.38 / 1.38–1.54 / > 1.54; kick and second serves low edge 1.35; ages 60+ or overhead discomfort: player-relative only | ±0.03 | **Adopted**; F12 statistic (§3.8) |
| `rhythm-release-to-contact` | < 0.80 / 0.80–1.20 / > 1.20 s ("quick / typical / unhurried") | ±0.05 s | **Adopted**, descriptive only (no correct tempo); an F4 co-signal |
| `rhythm-spread` | < 40 / 40–90 / > 90 ms ("tight / typical / variable") | ±15 ms | **Adopted**, descriptive |
| `contact-forward` | < 15 / 15–70 / > 70 cm; kick 15 cm further back | — | **Adopted** as a descriptive D3 feature only; no standalone fault |
| `landing-distance` | < 0.15 / 0.15–0.90 / > 0.90 m | ±0.25 m | **Rejected** for display: no literature for any population (gap: ranges §5). Trend only |

**Rules common to every adopted band** (gap: ranges §7):
- Stratify by view, set-up, serve number, intended type, court side and, for the drop, sex.
- Compute on the player's session median (or corrected SD) over ≥ 8 included serves in one stratum (≥ 12 for spreads in F3).
- **Hysteresis:** a player's band label changes only when the estimate crosses the edge by more than the stated uncertainty margin.
- **Wording:** "tight / typical / scattered" and similar, never "good / bad", because no band has been validated against outcomes.
- **Player-relative first:** triggers prefer change against the player's own best matched session; absolute bands only gate "possible" vs "likely" wording.

**Trigger statistics** (`f3Likely`, `f3Possible`, `f3PlayerRelative`, `f4Possible`, `f4Likely`, `f12Likely`, `f12Possible`, `f12PlayerRelative`) are computed by the engine and exposed to COACHING, which owns whether a fault is selected (D6). **COACHING and `coaching-library.json` should align to them.** For example, the library's `toss-height-steady` thresholds (20 cm at UTR 1–3, 14 cm at UTR 4–7) differ from the adopted F3 statistic (a 90% lower bound ≥ 15 cm at n ≥ 12) (§7).

---

## 5. Part D: validation

### 5.1 Principles

- **Accuracy is a product requirement.** Each metric's status is derived from its validation level (§1.3), per condition class, not declared.
- **Report coverage alongside accuracy:** the share of serves that produced the metric, and silent failures (errors > 3× threshold). Silent drop-outs flatter accuracy (research 05 §11.3).
- **Intervals must be honest:** for every continuous metric, per-serve 95% intervals must contain ≥ 93% of synthetic truths (V1 gate). A metric that under-covers does not reach V1, however small its MAE.
- **Noise is measured, not assumed:** synthetic tests inject the pose noise measured in §5.5 (or the §1.2 planning values until then), including MediaPipe-style persistent left/right mirrors (S11). Tests that inject only the old 0.005 BH jitter do not count towards V1.
- **Freeze thresholds before running:** thresholds are tuned on a *development* seed set, then frozen and run on a disjoint *test* seed set. Real-footage thresholds are frozen before V2 data are collected.

### 5.2 Synthetic truth mapping (`tools/synth`)

The generator's extra truth file carries one canonical truth value per id (`extraTruth.ts`, `CANONICAL`; `canonical[id].value` with `alt` fields). The table names the fields.

| Metric or event | Truth field |
|---|---|
| Serve count | `canonical['serve-count']` (serves whose contact lies in the clip) |
| tossRelease, tossApex, contact, landing, recoveryEnd | `times.tossReleaseS`, `tossApexS`, `contactS`, `landingS`, `recoveryEndS` |
| trophy (max loading) | `times.trophyEndS` (lowest pelvis); the lowest mid-hip of `legDrive` |
| trophy-pause | `canonical['trophy-pause']` (`trophyEndS − trophyStartS`) |
| toss-apex-height | `canonical['toss-apex-height']` (`metrics.tossApexHeightM / player.heightM`) |
| toss-forward | `canonical['toss-forward']` (`plan.apex[x] − plan.frontToeAtRelease[x]`) |
| toss-lateral | Lateral apex offset from the front toe, signed to the hitting side |
| toss-drop | `canonical['toss-drop']` (`metrics.tossHeightAboveContactM`; `alt.timeS`) |
| contact-height-ratio | `canonical['contact-height-ratio']` |
| contact-forward | `canonical['contact-forward']` |
| rhythm | `canonical['rhythm-release-to-contact']` (`metrics.releaseToContactS`) |
| leg-drive | `canonical['leg-drive']` (`legDrive.hipRisePctHeight`; `alt.m`) |
| drive-time | `canonical['drive-time']` (`legDrive.driveTimeS`) |
| loading-depth | `canonical['loading-depth']` (`legDrive.loadingDepthPctHeight`) |
| deep-bend-flag | `canonical['deep-bend-flag']` (front-knee 3D flexion at the trophy ≥ 45°; `alt.frontKneeAtTrophy3DDeg`) |
| shoulder-tilt-trophy | `canonical['shoulder-tilt-trophy']` (3D; `alt.deg2D`, `alt.deg2DLevel`) |
| knee-bend-band (rear) | `canonical['knee-bend-band']` (band of the back knee's 3D flexion at the trophy; `alt.backKneeAtTrophy3DDeg`) |
| shoulder-over-shoulder-contact (rear) | `canonical['shoulder-over-shoulder-contact']` (3D; `alt.deg2DLevel`) |
| landing-distance | `canonical['landing-distance']` (`landing.fromStartToeM`; `alt.fromBaselineM`) |
| Spreads | SD of the realised truth values over the same serves (`toss-height-spread`, `toss-forward-spread`, `rhythm-spread` clip-level canonical values) |
| repeatability | Ordering by `sdScale` |
| speed-experimental | `canonical['speed-experimental']` (`metrics.ballSpeedAtContactKmh`; `alt.targetTag`) |
| speed-average-rear | `canonical['speed-average-rear']` (`metrics.avgSpeedContactToBouncePathKmh`) |
| Pitch and roll | `pitchRollDeg` of the camera pose (extra truth) |
| Quality flags | The extra truth's `captureQuality` block and scenario tags (fps, flicker, shake, crf and so on) |

Truth heights are ball-centre heights, matching §1.1.

### 5.3 Scenario families (built with the synthetic generator's `Scenario`)

**S0 baseline (the D1 default set-up):**
- side view, chest side, **portrait 1080×1920**, camera **7.5 m from the centre mark** (about 6.75 m to the server on the deuce court and 8.25 m on the ad court), 1.4 m high, level, 26 mm-equivalent lens;
- 60 fps, bright light, crf 23;
- intermediate right-hander, 1.80 m, foot-back;
- 12 serves, **6 deuce and 6 ad**, directions T/wide/body; flat and slice, with per-serve toss offsets drawn from 0.1–0.4 m towards the camera;
- audio off (the default);
- where the pose layer is injected rather than run, the §1.2 planning noise (or the §5.5 measured noise) with the measured mirror rate.

Twenty seeds per family cell. Split: development seeds 1–10, test seeds 11–20.

| Family | Variants |
|---|---|
| S1 fps | 30, 60, 120, 240 native; 240 captured and rendered at 30 (`mediaFps: 30`, iOS slow-motion export); variable frame rate with 3% dropped frames; **realistic web-recorder exposure at 60 fps (1/120 and 1/250 s motion blur)** to measure `ball-intersection` coverage |
| S2 view | side back-side; rear 5 m @ 2.5 m, tilted down 15° with the pitch logged (outcomes view); rear low 5 m @ 1.2 m; front45 (negative control) |
| S3 geometry | **landscape at the side fence, 9 m, 1.6 m, level, 1080p and 4K** (the D1 alternative); landscape-near 7.3 m with a measured 5° up-tilt; portrait 7 and 8 m; phone height 1.2, 1.6, 1.8 m; **tilt family: 3° and 5° measured, with ±1° sensor error**; 5° with the pitch withheld (with and without background verticals); 10° (must be refused, `CAMERA_TILTED`); roll 3°; yaw 5° and 12°; lens k1 distortion; **doubles serving position** (server 2.5 m towards the camera); **toss offsets 0, 0.2 and 0.4 m, both signs**, and kick offsets; unit tests of D and the frame top against rendered portrait and landscape clips (D within 3%; frame top within ±5 cm, gap test 2) |
| S4 light | overcast; dusk; **night-comp lighting** (about 250 lux court lighting, uncontrolled auto-exposure, LED and metal-halide colour); night with 100 Hz flicker. These cells set the `night-lights` and `flicker` validation levels |
| S5 encoding | crf 18, 28, 33; 720p and 4K; VP9 WebM |
| S6 player | height 1.55 / 1.95 m; beginner, advanced profiles; left-handed; foot-up; outfits; a female profile with a high toss (drop 1.2–1.4 m) |
| S7 behaviour | dribbles 3 and 6 per serve; a re-toss (caught toss); a shadow swing; a swing and miss; camera shake (small 0.2°, large 1.5°); a double knee bend (two hip dips) |
| S8 audio | off (default); opt-in audio with background −45, −35 and −25 dBFS |
| S9 variability | `sdScale` 0.25, 0.5, 1, 1.5, 2 (20 serves each, one court side), with and without sideways toss scatter (to measure the leak into height spread separately) |
| S10 serve type | flat, slice, kick blocks (strata and apex shifts); a second-serve block |
| **S11 label mirrors** | Injected into the pose layer: a persistent whole-clip left/right mirror; a leg-only mirror; an arm-only mirror; intermittent mirrors on 43–75% of frames (the measured side-view rate). Forward metrics must hold their S0 thresholds under all of them |
| **S12 above-frame apexes** | `tossApexHeightM` 4.3–4.8 m with a 4.3 m frame top; exit-to-re-entry gaps 0.3–0.8 s; one-branch-only tracks |

### 5.4 Validation matrix (metric × family)

Cell codes:
- **=** the S0 threshold holds;
- **×k** the threshold is relaxed by factor k;
- **U:code** must be unavailable with that reason code in 100% of serves;
- **E:code** must be experimental with that reason code;
- **F:code** that flag must fire (≥ 95%);
- **n/a** not tested.

Timing thresholds are in frames of the clip's own fps unless given in ms. Every continuous row also carries the 93% interval-coverage gate.

| Metric (S0 threshold) | S1 fps | S2 view | S3 geometry | S4 light | S5 encoding | S6 player | S7 behaviour | S8 audio | S9–S12 |
|---|---|---|---|---|---|---|---|---|---|
| `serve-count` (P, R ≥ 99%; S0 100%) | = (slow motion included) | = ; front45 = | = ; doubles = | = | crf 33: P, R ≥ 97% | = | dribbles 0 false serves; re-toss ≥ 95% classified; shadow 0 counted; miss = serve + `NO_CONTACT` | = | S11 = |
| `toss-apex-height` (median ≤ 2.5% H, p95 ≤ 5% H) | 30: = ; slow motion = after the gravity fix | rear ×1.2 ; front45 U:VIEW_NOT_SUPPORTED | fence 1080p ×1.3, 4K = ; tilt 3°/5° measured ±1° = ; 5° withheld E:PITCH_UNKNOWN (or = with verticals) ; 10° U:CAMERA_TILTED ; offsets 0–0.4 m both signs = | dusk ×1.25 ; night ×1.5 | crf 33 ×1.5 or U:BALL_NOT_TRACKED ; 720p ×1.5 | = | = | = | S12: fitted ≤ ±3 cm to 0.3 m above the frame; gap > 0.65 s → censored |
| `toss-forward` (MAE ≤ 5 cm, p95 ≤ 10) | = | rear U:VIEW_NOT_SUPPORTED | fence ×1.3 ; yaw 5° ×1.3, 12° ×1.5 ; tilt = | ×1.25 / ×1.5 | ×1.5 | left-handed = (netDir) | shake small ×1.2 | = | S10 strata separate ; **S11 all mirrors =** |
| `toss-lateral` (MAE ≤ 5 cm) | = | side U:VIEW_NOT_SUPPORTED; rear = | n/a | ×1.5 | ×1.5 | = | = | = | = |
| `toss-drop` (MAE ≤ 5 cm @60 audio off; time ≤ 13 ms) | 30: time ≤ 25 ms ; 120/240 MAE ≤ 3 cm ; slow motion = | rear = | = | ×1.25 | ×1.5 | = | miss U:NO_CONTACT | opt-in audio: time ≤ 5 ms | S12 fitted apexes ×1.3 |
| `toss-height-spread` (≤ max(1.5 cm, 15%)) | 30 ×1.3 | rear = | shake large F:CAMERA_MOVED + U ; fence and near compared separately | ×1.3 | ×1.3 | = | = | = | S9 monotonic (ρ = 1); leak reported ; S12 "at least" on > 10% censored |
| `toss-forward-spread`, `toss-lateral-spread` (≤ max(2 cm, 20%)) | ×1.3 | view-specific U | as above ; yaw 12° ×1.5 | ×1.3 | ×1.3 | = | = | = | S9 monotonic ; S11 = |
| `contact-height-ratio` (MAE ≤ 0.03 @60, p95 ≤ 0.05) | 30 ×1.5 ; 120/240 MAE ≤ 0.02 ; exposure blur: report `ball-intersection` coverage | rear ×1.3 | fence ×1.3 ; tilt = ; 5° withheld E:PITCH_UNKNOWN | ×1.25 / ×1.5 | ×1.5 | = | miss U:NO_CONTACT | opt-in audio ×0.7 | = |
| `contact-height-spread` (≤ max(1.2 cm, 15%) at ≥ 120 fps) | 60: `nearMeasurementLimit` when truth SD < 1.4σ_r | rear = | shake large U | ×1.3 | ×1.3 | = | = | = | S9 monotonic |
| `contact-forward` (MAE ≤ 6 cm, p95 ≤ 12) | 30 ×1.3 | rear U | ×1.5 | ×1.5 | ×1.5 | left-handed = | = | = | S11 all mirrors = |
| `rhythm-release-to-contact` (MAE ≤ 1 frame + 5 ms) | slow motion = ; VFR (3% dropped) = with the frame-gaps warning | rear = | fence and near = (cross-set-up comparable) | = | = | = | = | = | S11 = |
| `rhythm-spread` (≤ max(10 ms, 20%) @60) | 30: `nearMeasurementLimit` flagged | = | = | = | = | = | = | = | S9 monotonic |
| `trophy-pause` (MAE ≤ 60 ms) | 30 U:FPS_TOO_LOW | rear = | = | night E:CONDITION_NOT_VALIDATED until passed | ×1.3 | profiles ρ ≥ 0.8 | = | = | = |
| `leg-drive` (MAE ≤ 2% H; coverage ≥ 93%) | 30 ×1.3 ; 120 `peakHipSpeedMps` ≤ ±0.15 m/s | rear U:VIEW_NOT_SUPPORTED | fence ×1.3 ; tilt = ; 5° withheld = | night ×1.5, else E:CONDITION_NOT_VALIDATED | 720p ×1.3 | beginner/advanced = ; foot-up = | double dip = | = | S11 = |
| `drive-time` (MAE ≤ 50 ms @60) | 30 ×1.3 | rear U | = | as leg-drive | ×1.3 | = | = | = | S11 = |
| `loading-depth` (MAE ≤ 2% H; level agreement ≥ 85%) | = | rear U | = | as leg-drive | = | = | double dip: `hipDipCount` = 2 on ≥ 90% | = | = |
| `deep-bend-flag` (two-level error ≤ 15%; false yes ≤ 10% below 35°) | = | rear U | knee azimuth 0–60° (gap test 1) = ; 5° withheld E:PITCH_UNKNOWN | as leg-drive | = | beginner/advanced = | = | = | S11 leg-only mirror = |
| `shoulder-tilt-trophy` (2D within ±4° of 3D; band ≥ 85%) | = | rear U:VIEW_NOT_SUPPORTED | tilt family within 1° of level (gap test 3) ; 5° withheld E:PITCH_UNKNOWN | as leg-drive | = | left-handed = | = | = | S11 arm and whole mirrors: sign unchanged |
| `knee-bend-band` (rear: ≥ 85%, 0 little↔deep swaps, unclear ≤ 25%) | 30 = | **side U:VIEW_NOT_SUPPORTED (must never band)** ; rear = ; rear low ×1.1 | = | night ≥ 75% | = | foot-up = ; platform stance → unclear, never front knee | = | = | S11 leg-only mirror = (nearer knee by geometry) |
| `shoulder-over-shoulder-contact` (rear: 2D within ±4° of 3D; band ≥ 85%) | = | side U:VIEW_NOT_SUPPORTED ; rear = | n/a | as leg-drive | = | left-handed = | = | = | S11 = |
| `landing-distance` (MAE ≤ 8 cm, p95 ≤ 15; time ≤ 1.5 frames) | 30 time ≤ 1.5 frames | rear U (not implemented) | fence ×1.3 ; yaw 12° ×1.5 | ×1.5 | ×1.5 | left-handed = | = | = | **S11 whole and leg-only mirrors =** |
| `repeatability` (ρ ≥ 0.9 vs `sdScale`) | 30 ≥ 0.8 | per view | shake large U | ≥ 0.8 | ≥ 0.8 | = | = | = | S9 is the test ; S11 ≤ 5 points |
| `speed-experimental` (coverage ≥ 90% deuce and ad separately, median error ≤ 5%) | 30/60 U:FPS_TOO_LOW ; 120/240 = ; slow motion (physics time base) U:TIME_BASE_UNKNOWN | rear U:VIEW_NOT_SUPPORTED | fence ×1.3 ; yaw 5° = | night + flicker U:FLICKER | crf 33 coverage ≥ 85% | = | untagged U:TARGET_NOT_TAGGED | none: = (no audio in the path) | = |
| `speed-average-rear` (coverage ≥ 90%, median error ≤ 4%) | < 60 U:FPS_TOO_LOW ; slow motion U:TIME_BASE_UNKNOWN | side U:VIEW_NOT_SUPPORTED ; rear 1080p and 4K: report located-bounce rate | no tap U:NEEDS_CALIBRATION | night ×1.3 | 720p located-bounce rate reported | = | = | opt-in audio: bounce time only | = |
| `capture-quality` flags | 30 F:fps warn ; VFR F:frame-gaps | front45 F:VIEW_MISMATCH | 10° F:level ; shake F:stability ; 5° withheld F:level (PITCH_UNKNOWN) ; fence 1080p far court F:subject-size info | night F:condition ; flicker F:flicker | 720p at 10 m F:subject-size | = | = | none F:audio (info) | S11 F:roles when > 10% ambiguous |

**Time-base test (S1 slow motion):** `gravityTimeScaleCheck` must return a factor within ±10% of 0.125, consistent with the 8× standard, in ≥ 95% of clips with ≥ 3 analysable tosses. All timing metrics must then meet their S0 thresholds × 1.5, and both speed metrics must be unavailable.

### 5.5 Event-timing matrix and measured noise

**Event timing (MAE / p95, in frames of the clip's fps; audio off unless stated):**

| Event | 30 fps | 60 fps | 120 fps | 240 fps |
|---|---|---|---|---|
| tossRelease | ≤ 1.0 / 2.0 | ≤ 1.0 / 2.0 | ≤ 1.2 / 2.5 | ≤ 1.5 / 3.0 |
| tossApex (bracketed) | ≤ 0.15 / 0.4 | ≤ 0.25 / 0.5 | ≤ 0.3 / 0.7 | ≤ 0.4 / 1.0 |
| tossApex (fitted above the frame) | ≤ 0.4 / 1.0 | ≤ 0.5 / 1.2 | ≤ 0.6 / 1.5 | ≤ 0.8 / 2.0 |
| trophy | ≤ 60 ms / 120 ms at every fps |||| 
| contact (ball-bracket, default) | ≤ 0.7 / 1.5 | ≤ 0.7 / 1.5 | ≤ 0.8 / 1.8 | ≤ 1.0 / 2.0 |
| contact (ball-intersection) | ≤ 0.35 / 1.0 | ≤ 0.35 / 1.0 | ≤ 0.4 / 1.0 | ≤ 0.5 / 1.2 |
| contact (opt-in audio + ball) | ≤ 0.2 / 0.5 | ≤ 0.25 / 0.5 | ≤ 0.35 / 1.0 | ≤ 0.5 / 1.5 |
| contact (wrist only) | ≤ 1.5 / 3.0 | ≤ 2.0 / 4.0 | ≤ 3.0 / 6 | ≤ 5 / 10 |
| landing | ≤ 1.5 / 3.0 | ≤ 1.5 / 3.0 | ≤ 2.0 / 4.0 | ≤ 3.0 / 6.0 |
| recoveryEnd | ≤ 150 ms / 300 ms at every fps |||| 

Coverage targets on S0: release ≥ 95%, apex ≥ 98% (bracketed or fitted), contact ≥ 98%, trophy ≥ 95%, landing ≥ 95%. `ball-intersection` coverage at 60 fps under realistic exposure is **reported**, not assumed.

**Measured noise (replaces the §1.2 planning values).** Before any metric is promoted to V1, re-score the ROI evaluation clips (pose README, `smoke/run-roi-eval.mjs`) and the S0/S3/S4 renders to measure:
- `H_HU` error against truth stature (sets σ_s and σ_p for body height);
- heel and foot-index error (never scored so far), at release and at landing;
- hip, mid-hip and shoulder error, by phase (trophy vs contact) to size the posture-dependent bias;
- the temporal autocorrelation of MediaPipe error **after** `cleanPoseFrames` (sets n_eff for averaged readings) and the noise of smoothed speeds (sets the stillness thresholds);
- the frequency and persistence of left/right mirrors;
- each of the above per condition class once S4 renders exist.

Results are written to `validation/synthetic/<date>/noise.json`; the engine's σ constants and ≥ 3× thresholds are regenerated from it through a reviewed change.

### 5.6 Real-footage validation protocol

No real serve footage may be downloaded (founder instruction). Real validation uses footage the team and volunteer players film themselves, with consent, and the in-app annotation mode. It is a documented next step, not a v1 claim.

**In-app annotation mode.** The UI is owned by ARCHITECTURE/DESIGN. It provides:
- frame stepping at native fps;
- marking of the 6 events plus motionStart and the lowest hip frame;
- click points: ball centre at apex and at contact; **heel and toe of both feet** at release and at landing; hip centres at the lowest and contact frames; both shoulders at trophy (side) and contact (rear); the floor and head top in a standing frame;
- band labels: knee (**rear clips only**, three levels), shoulder tilt at the top (**relative to the player's own earlier clips**: less / usual / more), shoulder over shoulder at contact (rear);
- outcome and zone tags.

Annotations are stored locally and exported as JSON (D8). **Blinding:** the annotator does not see engine output until the serve is annotated.

**Levels:**
- **V2 (real-annotated)** checks detection and tracking on real images. Annotated points use the same image-scale assumptions as the engine, so V2 cannot validate scale, perspective or the sideways leak into spreads (hence spreads stay estimated until V3).
  - Sample: ≥ 8 players (≥ 3 women, ≥ 1 left-hander, ≥ 2 players aged 40 or over, spanning UTR 1–7 where possible), ≥ 150 serves per metric, both side set-ups (portrait-near and landscape-fence), ≥ 3 conditions including **night-comp lighting on at least 2 lit courts (LED and metal halide)**, 60 fps plus a 120/240 fps subset.
  - **Test–retest across sessions at least 2 days apart** (not two blocks in one session), on ≥ 6 players with ≥ 3 sessions each: sets the typical error (SWC basis) and the τ priors of §4.5.
  - Two independent annotators on ≥ 25% of serves. Inter-rater agreement is reported *before* engine agreement: event MAE in ms, and point agreement in cm.
- **V3 (physical reference)** checks absolute values. The long-term target is research 05's library: 30 players, about 1,500 serves.
  - **Heights:** a 4 m pole with 10 cm marks in the server's plane (research 06 §15.2); a 240 fps second camera.
  - **Forward and lateral positions, spreads:** two-view triangulation, with side and rear phones synchronised by the toss apex (research 06 §8.2); spreads pass V3 when the side-view corrected SD is within 20% of the triangulated SD.
  - **Landing:** chalk marks measured with a tape (research 05 §10 row 22).
  - **Speed:** a radar behind the server, in line with the serve, every serve logged, 200+ serves across speeds (research 05 §11.2); a 240 fps second camera for the rear flight time.
  - **Knee and trunk:** two synchronised phones triangulated, or IMUs (gap: geometry §9 item 7).
  - **Bands:** two coaches, blinded, three levels.

**Device QA (manual, real phones):** sensor pitch against a spirit level for CoreMotion and `DeviceOrientationEvent`, including camera-to-IMU misalignment (sets σ_sensor and σ_mis in §1.1); `videoFieldOfView` and intrinsics per lens and orientation.

**Statistics:**
- **Continuous metrics:**
  - bias and 95% limits of agreement (Bland–Altman), using the variant for repeated measurements per player, because serves are nested in players;
  - regress the difference on the mean to test proportional bias, and use the log (ratio) form if it is present;
  - MAE and ICC(2,1) (absolute agreement, single measure), with 95% CIs;
  - interval coverage.
- **Bands:** percentage agreement and weighted κ against each coach; Krippendorff's α between coaches (≥ 0.7 target, as in research 03 §Implications 9).
- **Rates and zones:** confusion matrices by distance from the nearest line.
- **Spreads:** test–retest typical error across days. That typical error becomes the SWC basis (§4.5) and the σ_r check.
- **Speed:** coverage of the displayed range, MAE %, and LoA %.

**Acceptance** (from research 05 §11.3, unless stated):

| Metric | V2 (real-annotated) | V3 (reference) |
|---|---|---|
| Event timing | MAE ≤ 1 frame | — |
| Toss apex, contact height | MAE ≤ 3% of height vs annotation | MAE ≤ 10 cm; ICC(2,1) ≥ 0.75 [Our inference] |
| Forward positions, landing | MAE ≤ 6 cm vs annotation (heel/toe annotated) | MAE ≤ 10 cm [Our inference] |
| Leg drive, loading depth | MAE ≤ 2.5% of height vs annotated hip centres | Two-view or IMU hip rise within 2% of height |
| Spreads | Cross-day test–retest typical error ≤ 25% of the median spread [Our inference] | Within 20% of the triangulated SD |
| Knee band (rear), shoulder bands | ≥ 80% agreement with coaches | — |
| In/out (rear auto) | — | ≥ 95% for bounces more than 30 cm from lines |
| Zone (rear auto) | — | ≥ 90% |
| Speed | — | MAE ≤ 5%; LoA within ±10%; coverage ≥ 90% |

A metric that passes V2 moves to its V2 ceiling automatically (§1.3), in the condition classes tested. Failing any row keeps or drops the level. The "How accurate is this?" page (research 05 §11.4) is generated from the latest results. It shows bias, LoA, coverage, conditions tested and known failure cases per metric.

### 5.7 Where results live

- Synthetic runs write `validation/synthetic/<date>/<family>/<metric>.json`, with per-serve errors, interval coverage, summary statistics and pass/fail; measured noise goes to `validation/synthetic/<date>/noise.json`.
- Real runs write to `validation/real/<date>/`.
- CI runs S0–S2 and S11 per commit and the full matrix nightly. It updates the per-condition `validationLevel` in `metrics.json` only through a reviewed change.

---

## 6. Known limitations (state them in "How we measure")

1. **The side view is 2D.**
   - The toss's left–right position is invisible. A toss about 0.3 m nearer the camera than the body reads about 8–12 cm high; we correct it with a prior (and, with a proven time base, with the toss's own gravity), but the correction is uncertain.
   - Sideways toss scatter adds 2–4 cm of apparent height spread per 10 cm of scatter. It is reported, not removed: the copy says the spread "includes a small side-to-side component unless you add the rear view".
2. **The body-height estimate dominates absolute heights.** About ±3% (planning value) gives about ±23 cm on toss height and about ±11 cm on contact height at 95% for a 1.75 m player against published norms. Within-player comparisons are much sharper, because the persistent part cancels.
3. **The side view does not measure knee bend.** At the top of the swing the knees point at the camera, so a 2D knee angle would be wrong for most serves. From the side we show leg drive (hip rise to contact), drive time and loading depth as a description, plus an experimental "deep bend: yes". A knee-bend band needs the rear view, where the knee nearer the camera is in profile.
4. **Shoulder tilt at the top is compared only with your own range**, not with published trunk angles, whose definitions differ. Shoulder over shoulder at contact and forward lean at contact need the rear view.
5. **Pose noise is larger than first modelled, and left/right labels flip.** Measured keypoint error is about 5–7 times the earlier model, and in side views MediaPipe mirrors the body in 43–75% of frames. Roles are assigned by geometry; uncertainty budgets are planning values until re-measured (§5.5).
6. **Contact timing at 60 fps with the hit sound off** is about ±13 ms, which is about ±4–5 cm on contact height and ball drop per serve. 120 fps or the optional hit sound sharpens it.
7. **Under court lights**, pose-based readings are experimental until the night checks pass.
8. **No real serve footage has been analysed** (pose README; video README). Every status is capped at V1 until the §5.6 protocol runs.
9. **Speed:** from the side, launch speed needs ≥ 120 fps, your height and where you aimed; from behind, average speed needs the court-corner tap and a bounce seen in the video. The hit sound never gives speed from the side. Both are experimental ranges; spin is never available.
10. **Recreational reference ranges barely exist.** Nearly all published values are elite, junior or high-performance, and landing distance has no published values at all. Our bands are provisional, descriptive and replaced as our own reference set grows.

---

## 7. Decisions this spec narrows or questions (for the product lead)

1. **D1 subject size in portrait.** D1 quotes "roughly 450 px of player height at 1080p" for portrait at 7–8 m. Our arithmetic gives about 345–375 px for a 1.75 m player 6.75 m from a 24–26 mm lens in portrait 1080×1920, and about 280–305 px on the ad court (8.25 m) [Our inference: long-side FOV 67.3–71.6°]. The ROI evaluation measured 372 px at 7 m. The `subject-size` thresholds (§3.25) use our figures; the D1 wording may need correcting. The conclusion (portrait gives more pixels than landscape at the fence, about 290 px) is unchanged.
2. **D1/D5, knee bend.** Resolved by the revised D1 and D5: the side view shows no knee band; `knee-bend-band` is rear-only on the nearer knee; the side view offers `leg-drive`, `drive-time`, `loading-depth` (descriptive) and the experimental `deep-bend-flag`. No open question.
3. **D2 and the meaning of `measured`.**
   - `types.ts` defines `measured` as a validated method, and the brief says unvalidated metrics are experimental.
   - This spec caps everything at `estimated` until real-footage validation (V2) passes, including `serve-count` (measured only once the player confirms the strip). **Spatial spreads, including the lead toss-spread hero, stay estimated until V3** (two-view triangulation), because V2 cannot see the sideways leak. Research 05 and 09 list toss spread as "Measured"; D5 calls it the lead metric. Please confirm that "estimated" is acceptable for the lead metric in v1 copy.
4. **D1 "no calibration beyond height" vs "landing inside the baseline".** Without a baseline reference, landing is measured from the start toe and labelled that way. An optional one-tap baseline mark would restore "inside the baseline".
5. **D5 landing distance as a hero.** Landing distance is experimental until the V1 matrix passes with measured foot-point noise and geometric foot identification, and it is trend-only afterwards. Until then the hero card is visible only with the experimental toggle. Please confirm, or promote `leg-drive` into the visible hero slot meanwhile.
6. **D8 and audio.** D4 now uses audio only to time contact. CAPTURE sets audio off by default with an opt-in; D8 still does not mention audio. The lead should confirm the opt-in and how the player is told.
7. **Profile fields.** The sex-specific `toss-drop` bands and the contact-height rule for players aged 60+ need two optional profile fields (`sex`, `ageBand`; §1.4). PRODUCT and ARCHITECTURE own the profile; "not given" must remain the default.
8. **The D3 signature insight becomes rarer.** ≥ 10 serves per group, Holm across 7 metrics and replication in a second session (§4.7) mean fewer insights than research 10 M5 and its test 4 (≥ 6 misses) assume. The thresholds of test 4 should be recalculated.
9. **COACHING alignment.** The adopted F3/F4/F12 statistics (§4.10) differ from the current `coaching-library.json` thresholds (for example `toss-height-steady` 20/14 cm by UTR band). COACHING owns the decision and should align or state why not.
10. **Double faults without point play.** v1 counts double faults as faulted second serves in a second-serve block (§3.19). DESIGN's Second-serve check-in must not auto-switch serves back to "1st", and the tally needs a double-fault counter or must derive it from second-serve faults.

---

## 8. Research relied on

- DECISIONS D1, D4, D5 and D11 as revised on 27 September 2026.
- Gap studies (27 September 2026): side-view geometry (framing rule, tilt rectification, knee and trunk projection, leg-drive proxies, audio speed removal); recreational reference ranges (provisional bands, plausibility bounds, capture envelope, apex fallback); Australian segment evidence (match log, night comp); Intuitive Tennis and Kovacs primary content (passive vs active leg drive, double knee bend, toss height).
- Research 01 (competitors): SwingVision NTRP serve benchmarks [S7].
- Research 03 (biomechanics): phase model [S1]; contact height [S6, S7, S28, S29]; toss [S27, S28, S29, S24, S30]; knee [S3, S7, S9, S31]; trunk [S2, S31, S36]; fatigue [S14]; load [S43]; ace placement [S21]; net faults [S23]; expert 2D reliability [S33].
- Research 04 (coaching): fault library F3, F4, F6, F9, F10, F11, F12, F18.
- Research 05 (computer-vision feasibility): feasibility matrix, speed physics [S33, S35], audio [S40], spin [S43, S44], pose accuracy [S14–S17], validation thresholds §11.
- Research 06 (capture): field of view and distance §3; frame rates §4; toss SDs [S8]; Wilson and SD statistics [S31, S32]; quality checks §14.
- Research 09 (UX): data states §3.3; improvement language §4.2; Hopkins typical error §4.1.
- Research 10 (segment): M5 signature insight, M6 match log, M11 night capture.
- Engine: pose README (ROI evaluation, mirrors), video README, `ball/speed.ts` (`TARGET_TAG_OUT_OF_PLANE_DEG`, `speedFromFlightTime`), `ball/scale.ts`, `ball/toss.ts`; synthetic generator `tools/synth` (`extraTruth.ts` `CANONICAL`).

---

## Revision log (2026-09-27)

**Decision-driven changes (DECISIONS D1, D4, D5, D11 revised today)**
- **D1 framing and orientation:** portrait default; intrinsics defined on the sensor long axis and mapped to the displayed orientation (§1.1); `setupClass` (portrait-near, landscape-fence, landscape-near, rear) added to strata and matching (§1.1, §1.6, §4.4); live headroom block below 4.3 m (§3.25); S0 moved to portrait 7.5 m with a landscape-at-fence family (§5.3).
- **D1 tilt:** rectification of every keypoint and ball centre with K·R·K⁻¹; 5° cap (8° after the tilt test); pitch from sensors or background verticals; `PITCH_UNKNOWN` instead of "assume level" (§1.1).
- **D1/D5 what the side view cannot measure:** `knee-bend-band` is rear-only on the nearer knee with 20°/45° bands (§3.14); `trunk-tilt-band` removed and replaced by `shoulder-tilt-trophy` (§3.15); `shoulder-over-shoulder-contact` added as a rear band (§3.31); no 2D band compared with published trunk angles.
- **D5 leg drive:** `leg-drive`, `drive-time`, `loading-depth` (descriptive, never "bend more") and the experimental `deep-bend-flag` added (§3.27–§3.30); `toss-drop` joins hero 1.
- **D4 speed:** the side-view audio flight-time method removed with `METHODS_DISAGREE` and `BOUNCE_NOT_HEARD`; `speed-experimental` is side-only, needs a target tag (`TARGET_NOT_TAGGED`) and a proven time base, and models the signed depth change along the track (§3.22); `speed-average-rear` added (§3.32).
- **D11 comp-night regulars:** night and flicker condition classes cap pose metrics (§1.3); the match log is a separate, never-pooled source (§3.18, §3.19); double faults work in second-serve blocks without point play (§3.19); player-entered rates are eligible for verdicts "from your tags" (§4.5).

**Reviewer issues** (A = accepted and applied; R = rejected)
1. A. Side-view knee band and trunk tilt: knee band rear-only (nearer knee, geometric, no front-knee fallback, 20/45° bands, σ 6.5°, 64.5° reference deleted); `trunk-tilt-band` deleted everywhere and replaced; §6 item 3 and §7 flag 2 rewritten.
2. A. Seven missing canonical ids: full §3 entries and JSON twins for `leg-drive`, `drive-time`, `loading-depth`, `deep-bend-flag`, `shoulder-tilt-trophy`, `shoulder-over-shoulder-contact`, `speed-average-rear`; the 15.8% CoM figure is never a band.
3. A. Speed method B: removed from the side view; `METHODS_DISAGREE` deleted; `speed-average-rear` with located bounce, coverage gate and audio only for times; method A needs a target tag, a proven time base and the signed depth change.
4. A. Label-based roles: all roles geometric (front foot, tossing and hitting wrists, anchors on the higher wrist, front shoulder, nearer knee); S11 mirror family added.
5. A. Tilt: 5° cap, vanishing-point pitch, `PITCH_UNKNOWN`, rectification before any angle or height, sensor QA and IMU misalignment σ.
6. A. Portrait geometry: K from the long-axis FOV mapped to orientation; portrait S0; fence, tilt, doubles and night cells; the 10° pass removed; D unit-tested on renders.
7. A. Noise budgets: planning values from the ROI evaluation (3% body height, 0.03 BH toes and hips); thresholds ≥ 3× noise with plant/unplant hysteresis; smoothed speeds; 93% coverage gate; measured-noise step in §5.5.
8. A. Contact timing: per-serve ball-bracket σ from the measured gap plus an occlusion term; audio-off defaults in §2.7; exposure-blur S1 cell; `toss-drop` measured only when σ_Δt ≤ 8 ms.
9. A. Toss depth offset: δ̄ 0.30 ± 0.15 m (flat/slice) and a separate kick prior, prior σ in σ_p; per-session gravity estimate of the ball plane; synthetic offsets 0–0.4 m both signs.
10. A. Spreads at V2: spatial spreads capped at estimated until V3; only tracking and timing noise subtracted; the sideways component stated in copy.
11. A. Set-up switching: `setupClass` in matching keys for spatial metrics, spreads and pose metrics; timing comparable across side set-ups.
12. A. Spread verdict maths: pooled within-session SD; corrected-SD CIs from transformed chi-square bounds; bootstrap of corrected variances; `at-measurement-limit` verdict.
13. A. Clustering and day-to-day variation: τ² term with priors and per-player updating; cross-day test–retest; within-session mode that never says "clearly".
14. A. N planning and optional stopping: SE* from Δ_design with 80% power and a sceptical-prior shrinkage; 3 pre-planned looks with Pocock boundaries; look count in "How we measure".
15. A. Player-entered rates: Newcombe verdicts "from your tags" with matched entry mode and serve number; rear auto excluded; > 150 message kept.
16. A. Above-frame apexes: gravity-constrained fit kept as estimated; unfittable apexes right-censored; > 10% censored gives "at least X cm".
17. A. Plausibility bounds: gap §8 table adopted in §4.2 and the JSON, applied before aggregation regardless of confidence.
18. A. Toss-drop flag: sex-specific bands, co-signals required, both reference populations shown; optional profile `sex`.
19. A. Validation per condition: per-condition `validationLevel`; pose-derived metrics capped at experimental under lights and flicker until S4 passes.
20. A. Landing distance: experimental until V1 with measured foot noise and geometric foot identification; then estimated for player-relative displacement only; no population bands.
21. A. Load and fatigue flags: `load-flag` estimated, ≥ 28 days and ≥ 3 sessions, uncoupled days 8–35, match-serve prompt, coach-recommended; `fatigue-flag` 95% bound, per block, experimental tier.
22. A. Minimum n and fps: one fps floor (30); "Did it work?" 12 per side for spreads, 8 for centres; rhythm-spread rule matches the text; provisional spreads (n ≥ 12) may headline as "early read".
23. A. Small-sample intervals: order-statistic median CIs for n < 20; contrasts use Welch t, Holm across 7, ≥ 10 per group and replication.
24. A. `serve-count`: estimated until V2; measured with provenance "confirmed by you" once the strip is confirmed.
25. A. Duplicate of issues 1–2: θ and φ SWCs and the "targetBand ≥ typical" rule dropped; synthetic truth and matrix rows updated.
26. A. Toss-drop flag, landing and contact-height notes: gap §7.2 bands; landing "trend only; not a fault trigger"; contact low edge 1.35 for kick and second serves; player-relative only for ages 60+ or shoulder discomfort (optional profile `ageBand`).
27. A. Duplicate of issues 1–2 (JSON side): entries, prerequisites, reason codes, SWC and truth added; `trunk-tilt-band` deleted; `knee-bend-band` views `["rear"]`, no `targetBand`.
28. A. Duplicate of issue 3: method B deleted with its audio reasons; `audio` remains only as a contact-timing input.
29. A (METRICS part). Target tag: `entry:targetZone` prerequisite and `TARGET_NOT_TAGGED` added; the PRODUCT and DESIGN unlock copy ("Aiming at" is needed for speed) belongs to those revisers.
30. A (METRICS part). Apex status conflict: one rule in §2.4.3 (fitted = estimated with `APEX_EXTRAPOLATED` and counted in the spread; unfittable = censored; too few samples = unavailable); ARCHITECTURE and CAPTURE should reference it.
31. A (METRICS part). Double faults: counted as faulted second serves in second-serve blocks, no point play needed, point play optional; DESIGN tally and auto-switch changes and PRODUCT §5.4 belong to those revisers (§7 flag 10).
32. A. Plausibility (duplicate of 17) plus explicit adoption: per-metric `plausibility` fields, `IMPLAUSIBLE_VALUE` and `CHECK_THIS_SERVE`, toss-only handling; provisional bands and trigger rules adopted or rejected in §4.10 (landing bands rejected); coaching-library alignment flagged to COACHING.

No issue was rejected outright. Two were narrowed: for issue 11 we chose matching on `setupClass` rather than a modelled cross-set-up bias term, and for issue 14 we chose pre-planned looks with Pocock boundaries rather than a fully Bayesian verdict.

**Consistency round (27 Sep 2026, later)**
- **One number per quantity (§4.9).** Display precision lives in one function (`metrics/precision.ts`) used by the engine's stored headline and by the UI's formatter, including the "half-width ≥ 10 cm rounds to 5" rule, so the report headline, tiles, Today, the focus card, Compare, Progress and Metric info print the same number. Screens read the stored stratum summary (never a recomputation); a one-session "Did it work?" side shows that session's own value. The cause of the mismatches seen in integrated screenshots: the verdict's side values were recomputed with the coaching library's 4 cm noise default instead of the engine's per-serve σ_r, a 1-serve session was pooled into a spread baseline, and derived values without an interval rounded to 0.5 cm while the stored ones rounded to 5 cm.
- **Spread baselines (§4.2).** A session with a single value in the stratum adds no within-session variance and is left out of a spread comparison instead of inflating n.
- **§1.1 item 3a** (imports with a mount answer: pitch and roll priors, their propagation into height ranges, the p95 status rule and the standing-body roll check) and the **§1.6 set-up key** (distance class and serving spot) added.
- **§2.3.1 sparse sampling** (serve windows at 15 Hz) added; Pass A recall 98.0% → 100% on the corpus simulation, dense recall and every metric unchanged (`metrics-eval`).
