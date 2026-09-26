# METRICS.md: metric and event catalogue (v1)

**Status:** v1 specification, 27 September 2026. **Owners:** analysis engine and validation.
**Scope:** how serves are found in a clip, how events and phases are detected, how every number shown to a player is calculated and labelled, the statistics rules behind summaries and "Did it work?", and the validation matrix.
**Machine-readable twin:** `docs/specs/metrics.json`. Code reads ids, names, units, statuses, prerequisites, reference ranges and thresholds from the JSON. This file is authoritative for algorithms. If the two disagree, fix both in the same change.

This spec follows `docs/DECISIONS.md` (D1–D10). Where it narrows a decision or disagrees with one, it says so in §7 instead of diverging silently.

**Tags.** [Established] = peer-reviewed finding. [Coaching interpretation] = expert practice, not directly proven. [Our inference] = our reasoning or arithmetic. Research is cited as (research NN [Sx]), meaning source x in `docs/research/NN-*.md`. Thresholds marked *initial* are starting values. They are tuned on synthetic data (§5) and then frozen before real-footage validation, so validation is not fitted to itself.

**Reading order.** Engine builders: §1, §2, §3. UI and content designers: §0, §1.3, each metric's *Question*, *Status rules* and *Unlock hints*, and §4.5 wording. Validation team: §3 *Validation* fields and §5.

---

## 0. Catalogue at a glance

"Today" is the highest status the engine may emit while a metric has only passed synthetic validation (validation level V1, §1.3). "Target" is the status after real-footage validation passes. The ids in the first block are the shared ids used by every spec; the second block lists ids this spec adds.

| id | Player-facing name | Views | Unit shown | Today | Target | Role |
|---|---|---|---|---|---|---|
| `serve-count` | Serves | side, rear | count | measured | measured | Always shown |
| `toss-apex-height` | Toss height | side, rear | × your height; cm | estimated | estimated | Supporting |
| `toss-forward` | Toss in front | side | cm | estimated | estimated | Supporting |
| `toss-drop` | Ball drop before contact | side, rear | cm; ms | estimated | measured | Supporting |
| `toss-height-spread` | Toss height consistency | side, rear | cm (SD) | estimated | measured | **Hero 1** (D5) |
| `toss-forward-spread` | Toss front–back consistency | side | cm (SD) | estimated | measured | **Hero 1** (D5) |
| `contact-height-ratio` | Contact height | side, rear | × your height; cm | estimated | estimated | **Hero 2** |
| `contact-forward` | Contact in front | side | cm | estimated | estimated | Supporting |
| `rhythm-release-to-contact` | Toss-to-hit time | side, rear | ms | estimated | measured | **Hero 3** |
| `rhythm-spread` | Rhythm consistency | side, rear | ms (SD) | estimated | measured | **Hero 3** |
| `trophy-pause` | Pause at the top | side, rear | ms | experimental | estimated | Detail |
| `knee-bend-band` | Knee bend (hip drop) | side, rear | band | estimated | estimated | Band + key frame (D5) |
| `trunk-tilt-band` | Trunk tilt at loading | side | band | estimated | estimated | Band + key frame (D5) |
| `landing-distance` | Landing distance | side | cm | estimated | estimated | **Hero 4** |
| `repeatability` | Serve shape repeatability | side, rear | index 0–100 | experimental | experimental | Detail |
| `serve-in-rate` | Serves in | side, rear | k of n; % | player-entered | player-entered (rear auto: experimental) | Outcome |
| `first-serve-in-rate` | First serves in | side, rear | k of n; % | player-entered | as above | Outcome |
| `double-faults` | Double faults | side, rear | count; per 10 points | player-entered | player-entered | Outcome |
| `placement-zone` | Where serves land | side, rear | T/body/wide counts | player-entered | player-entered (rear auto: experimental) | Outcome |
| `serve-type-mix` | Serve types | side, rear | flat/slice/kick counts | player-entered | player-entered | Context |
| `speed-experimental` | Speed (experimental) | side (method A); side, rear (method B) | km/h range | unavailable by default; experimental when prerequisites hold (D4) | experimental | Hidden unless the experimental toggle is on |
| `speed-radar-entered` | Radar speed (you logged) | any | km/h | player-entered | player-entered | Validation data |
| `spin` | Spin | none | none | unavailable | unavailable | One-line explanation |
| `capture-quality` | Capture quality | side, rear | Good / Fair / Limited | measured | measured | Under every session headline |
| *Added by this spec* | | | | | | |
| `retoss-count` | Re-tosses | side, rear | count | estimated | measured | Detail |
| `toss-lateral` | Toss left–right | rear | cm | experimental | estimated | Rear view only |
| `toss-lateral-spread` | Toss side-to-side consistency | rear | cm (SD) | experimental | measured | Rear view only |
| `contact-height-spread` | Contact height consistency | side, rear | cm (SD) | estimated | measured | Supporting |
| `second-serve-in-rate` | Second serves in | side, rear | k of n; % | player-entered | player-entered | Outcome |
| `fatigue-flag` | Fatigue check | side, rear | flag | estimated | estimated | Session flag |
| `load-flag` | Serving volume check | any | flag | measured | measured | Session flag |

---

## 1. Conventions

### 1.1 Coordinates, units and reference points

All engine types come from `app/src/analysis/types.ts`. Times are real seconds (`tReal`), after any slow-motion correction.

| Symbol | Definition |
|---|---|
| `(x, y)` | Normalised image coordinates in the displayed, rotation-corrected frame. Origin is top-left, x to the right, y down, both in [0, 1]. |
| HU | Frame-height units: `xHU = x · aspect`, `yHU = y`, with `aspect = width / height`. HU are isotropic, so every distance and angle is computed in HU (pose README). |
| `H_HU` | The player's standing height in HU for this serve. It comes from `estimateStandingBodyHeight` over upright frames in the serve's setup phase (knee flexion ≤ 25°, trunk lean ≤ 25°). If fewer than 5 upright frames exist, use the median `H_HU` of other serves in the same court-side cluster (§2.3.6), with confidence × 0.8. |
| BH | Body heights: HU ÷ `H_HU`. All pose thresholds are in BH, so they work at any zoom. |
| `H_m` | The player's entered standing height in metres, from the profile. Any value in cm, m or km/h needs `H_m` (reason `PLAYER_HEIGHT_MISSING` otherwise). Ratios and times do not. |
| `mPerHU` | `H_m / H_HU`: metres per HU at the player's depth. It is only valid at the player's depth (pose README). |
| Floor row `y_floor` | Per serve: the median, over `[motionStart − 0.5 s, tossRelease]`, of the lowest foot point. The lowest foot point is the larger y of heel (29/30) and foot index (31/32) for both feet, or ankle + 0.039 BH if both are missing (pose README). Needs visibility ≥ 0.5. |
| Front foot | The non-hitting side: left for a right-hander, right for a left-hander (`frontFootToe` convention, pose README). |
| **Start toe `S0`** | Per serve: the median image position of the front foot index (landmark 31 for right-handers, 32 for left-handers) over `[tossRelease − 0.10 s, tossRelease + 0.05 s]`. It is the origin for every forward and lateral distance. It matches the synthetic generator's `frontToeAtRelease`. Players start just behind the baseline, so S0 is a proxy for the baseline, not the baseline itself (§7 flag 4). |
| `netDir` (side view) | +1 if the net is to the right in the image, −1 if it is to the left. The prior comes from handedness and camera side. On the chest side, a right-hander has the net on the right, and a left-hander has it on the left. The data then verify it: the median sign of (landing toe x − S0 x) and of the outgoing-ball x velocity across serves. If ≥ 70% of serves disagree with the prior, use the data and raise `VIEW_MISMATCH` (info). |
| `hitDir` (rear view) | +1 if the hitting-arm side is to the right in the image, −1 otherwise. From behind, a right-hander's hitting side is on the right. |
| **Player-plane frame (PPF)** | Metres, on the vertical plane through S0 that faces the camera. `u` is horizontal. In the side view, u = forward towards the net, positive into the court: `u = netDir · (x − x_S0) · aspect · mPerHU`. In the rear view, u = lateral, positive towards the hitting-arm side: `u = hitDir · (x − x_S0) · aspect · mPerHU`. `v` is height above the floor: `v = (y_floor − y) · mPerHU`. |
| Height ratio | `v / H_m = (y_floor − y) / H_HU`. Ratios do not depend on the entered height; centimetres do. |
| Ball position | Ball centre (not the lowest point) from the toss track: `y(t) = a t² + b t + c` (`BallTrack.fit`, normalised y, real seconds) and the tracker's linear `x(t)`. |
| Durations | Milliseconds, from event `tReal` differences. |
| Angles | Degrees, measured in the image plane only, and never displayed as numbers (D5). |

**Level correction.** Every metric assumes a level camera: vertical lines stay vertical, and the horizon is the principal-point row `cy`.
- **Pitch and roll known** (from the capture session's motion sensor, or from court-line vanishing points): map every image point through the pure-rotation homography `H_lvl = K · R(pitch, roll) · K⁻¹` before computing anything.
  - `K` uses the native intrinsics when available.
  - Otherwise it assumes the 1x main lens: 26 mm equivalent, 67.3° horizontal field of view in landscape; 71.6° for 24 mm Pro lenses (research 06 §3.1). The focal-length σ is 5%.
- **Pitch unknown** (imported clips): assume level and add the tilt term to the uncertainty (σ_tilt = 2°).
- **Tilt size:** at typical side-view geometry, an uncorrected 5° pitch changes an apex-height ratio by about 2%, and 10° by about 4% [Our inference: our projection arithmetic].
- The 0.5x lens is not supported for metrics. Its distortion and small subject size are unmodelled (research 06 §3.5; the engine's `speed.ts` also assumes 1x).

**Camera distance.** `D = f_HU · H_m / H_HU`, where `f_HU` is the focal length in frame heights. D is used for perspective and sound-delay terms. With an assumed focal length, D carries about ±6% (1σ) [Our inference].

### 1.2 Error model shared by all metrics

Each per-serve value carries three separate 1σ error components. Keeping them apart is what makes spreads and within-player comparisons honest [Our inference].

| Component | Symbol | Examples | Behaviour |
|---|---|---|---|
| Random, per serve | `σ_r` | Ball-fit noise; event timing; unseen depth offset of the ball from the player plane; pose jitter at the event | Averages down across serves and inflates the observed spread |
| Session-shared | `σ_s` | Floor row; the per-session part of the body-height estimate; residual tilt; focal length | Identical for every serve in a session. Does not average down within a session; does not affect spreads; adds to cross-session comparisons |
| Player-persistent | `σ_p` | Anthropometric bias of the head-top estimate for this body shape and view; error in the entered height | Same across that player's sessions in the same view. Cancels in the player's own comparisons; matters only against published norms |

Default split for the body-height estimate [Our inference; to be replaced by test–retest data from §5.6]:
- The pose layer measured about 2% error for body height from setup frames (pose README).
- We model it as `σ_p = 1.8%` (persistent) plus `σ_s = 0.8%` (per session).
- An entered height adds `σ_p = 1.2%` (self-report, `ENTERED_HEIGHT_REL_SIGMA` in `ball/scale.ts`).

How the components are used:
- **Per-serve interval shown to the player:** `value ± 1.96·√(σ_r² + σ_s² + σ_p²)`.
- **Session-mean interval:** `√(SE_mean² + σ_s² + σ_p²)`. Only the random part averages down.
- **Spread noise correction:** uses `σ_r` only (§4.2).
- **Matched comparison of means between sessions:** `SE_Δ² = SE₁² + SE₂² + 2σ_s²`. `σ_p` cancels.

### 1.3 Honesty labels, validation levels and the status ceiling

Labels follow D2 and the `MetricStatus` definitions in `types.ts`: measured, estimated, player-entered, experimental, unavailable. Every value also has a *validation level*. The level caps its status, because `types.ts` defines `measured` as a *validated* method, and the brief says unvalidated metrics must be marked experimental.

| Level | Meaning | Status ceiling |
|---|---|---|
| V0 | Not yet validated anywhere | experimental |
| V1 | Passes the synthetic matrix (§5.4, §5.5) | estimated. **Exception:** `serve-count` → measured, because every detected serve is shown in the serve strip and the player can correct it |
| V2 | Passes real-footage annotation in the in-app annotation mode (§5.6). Checks detection and tracking on real footage | measured for relative and timing metrics; estimated for absolute spatial metrics |
| V3 | Passes a physical reference: calibration pole, tape-measured marks, radar or a second view | Target status as designed |

- **Emitted status** = min(the metric's target status, the ceiling for its current level), downgraded further by the per-value rules in §3.
- The validation level of each metric lives in `metrics.json` (`validationLevel`). CI sets it from the latest validation run.
- A metric that fails its thresholds drops a level automatically.
- The "How we measure" sheet shows the level in plain words, for example "Checked on simulated serves; real-court check in progress".

**Reason codes.** Every downgrade and every `unavailable` carries one code. The player-facing text below is the default unlock hint; `metrics.json` holds the canonical strings.

| Code | Meaning | Default unlock hint (player-facing) |
|---|---|---|
| `VIEW_NOT_SUPPORTED` | This view cannot see the quantity | "Film from the side, on your hitting-arm side, to see this." (Rear-only metrics: "Add a phone behind you to see this.") |
| `VIEW_MISMATCH` | The detected view differs from the declared view | "This clip doesn't look like the view you chose. Check where the phone is." |
| `FPS_TOO_LOW` | Below the metric's minimum real frame rate | "Record at 60 fps." (Speed: "Record at 120 fps or more.") |
| `TIME_BASE_UNKNOWN` | Possible rendered slow motion, and the gravity check could not fix it | "Import the original slow-motion file, or record in the app." |
| `FRAMES_DROPPED` | More than 10% of frames missing in the serve window | "Close other apps while recording." |
| `PLAYER_HEIGHT_MISSING` | A cm, m or km/h value needs `H_m` | "Add your height in Profile to see centimetres." |
| `BODY_NOT_UPRIGHT` | No standing frames to measure body height | "Stand tall for a second before each serve." |
| `FEET_NOT_VISIBLE` | Foot landmarks missing or cut off by the frame | "Keep your feet in the frame." |
| `POSE_LOW_QUALITY` | `trackingQuality` < 0.5 in the window the metric needs | "Make sure you're the only person near your serving spot, with the light behind the camera." |
| `OCCLUDED` | The needed landmark is hidden at the event (visibility < 0.5) | "Try the other side of the court so nothing blocks the view." |
| `BALL_NOT_TRACKED` | Toss track missing or fewer than 6 detections | "Toss against sky, a fence or a plain windbreak; avoid trees behind you." |
| `APEX_OUT_OF_FRAME` | Apex above the frame and not bracketed by detections | "Move the phone back a step or raise it a little so the whole toss fits." |
| `RELEASE_NOT_FOUND`, `CONTACT_NOT_FOUND`, `LANDING_NOT_FOUND` | The event was not found with confidence ≥ 0.5 | Generic: "We couldn't see this moment clearly on this serve." |
| `NO_CONTACT` | Swing and miss | "Swing and miss: not counted in contact stats." |
| `AUDIO_UNAVAILABLE` | No audio track, or audio unusable (for example rendered slow motion) | "Speed from sound needs the clip's audio." |
| `BOUNCE_NOT_HEARD` | No bounce onset in the expected window | "The bounce was too quiet to hear." |
| `NOT_ENTERED` | The player has not tagged outcomes | "Tag your serves (in, net, long, wide) in review." |
| `NEEDS_CALIBRATION` | Rear auto outcomes without the four-corner tap | "Tap the four corners of the service box." |
| `CAMERA_MOVED` | Background drift above the threshold (§3.25) | "Fix the phone firmly; it moved during recording." |
| `CAMERA_TILTED` | Pitch or roll above 10°, or unknown on a clip that needs it | "Keep the phone level; the guide turns green." |
| `SCALE_INCONSISTENT` | The gravity-based and body-based scales disagree by more than 15% | "Check your height in Profile. If this was slow motion, import the original." |
| `TOO_FEW_SERVES` | n is below the minimum for this aggregate (§4.1) | "Record at least {n} serves from one side." |
| `RANGE_TOO_WIDE` | Speed range wider than 35% of its midpoint | "This footage can't pin the speed down closely enough." |
| `METHODS_DISAGREE` | The two speed methods do not overlap | "Our two speed checks disagreed, so we're not showing either." |
| `EXPERIMENTAL_HIDDEN` | The experimental toggle is off | "Turn on experimental metrics in Profile to see this." |
| `VALIDATION_PENDING` | Status capped by the validation level | (No hint. Shown in "How we measure".) |
| `NOT_MEASURABLE` | Physically impossible with phone video | Spin text (§3.24) |
| `NOT_IMPLEMENTED` | Planned, not built in v1 | "Coming later." |
| `LOW_LIGHT`, `FLICKER`, `MOTION_BLUR` | Capture-quality downgrades | See §3.25 |
| `UNMATCHED` | A comparison is not like-for-like (§4.4) | "Compare sessions from the same side, view and serve." |

### 1.4 Contract extensions (add to `types.ts`; nothing is renamed)

```ts
// Optional fields to add to MetricValue
reasonCode?: ReasonCode                  // with every downgrade and every unavailable value
validationLevel?: 'V0' | 'V1' | 'V2' | 'V3'
band?: 'low' | 'typical' | 'high' | 'unclear'
bandProbabilities?: { low: number; typical: number; high: number }
secondary?: Record<string, number | string>  // e.g. { cm: 254 } beside a ratio, or { timeMs: 352 }
sigmaRandom?: number       // σ_r in the metric's unit (spread correction, §4.2)
sigmaShared?: number       // √(σ_s² + σ_p²)
quantity?: 'launch-speed' | 'average-speed'  // speed only (D4)

// Optional fields to add to ServeEvents
motionStart?: EventEstimate
setupStart?: EventEstimate

// New types
type StratumKey = string   // `${view}|${cameraSide}|${courtSide}|${serveNumber}|${intendedType}`
interface SessionMetric {
  id: string; stratum: StratumKey; status: MetricStatus; reasonCode?: ReasonCode
  n: number; nTotal: number                  // "n of nTotal serves measured"
  center: number | string | null
  centerKind: 'mean' | 'median' | 'rate' | 'count' | 'mode' | 'band'
  ci95?: [number, number]                    // interval for the centre
  spread?: number; spreadKind?: 'sd'; spreadCi95?: [number, number]
  noiseCorrected?: boolean; nearMeasurementLimit?: boolean
  provisional: boolean                       // §4.1
}
```

### 1.5 Inclusion rules and "X of N serves measured"

- A per-serve value enters an aggregate when all of these hold:
  - its status is measured or estimated;
  - its confidence is ≥ 0.5;
  - the serve is a `serve` (§2.3.4), not excluded by the player, and not flagged `NO_CONTACT` (contact metrics only).
- Experimental values are aggregated separately. They are shown only with the experimental toggle on (D2), never in headlines, and never in coaching text (research 09 §3.2).
- **N** is the number of serves detected in the stratum. **X** is the number with an included value. Every session metric shows "X of N serves measured" (D7).

### 1.6 Strata (matched groups)

`StratumKey` = view × camera side (chest or back) × court side (deuce or ad) × serve number (1st, 2nd or unknown) × intended type (flat, slice, kick or unknown).
- Toss position differs by serve type and target, so pooling inflates spreads (research 06 §7.2). Values also differ by court side (research 03 [S34]).
- Session summaries are computed per stratum. The session headline uses the stratum with the most included serves. Other strata are listed beneath it.
- Pooling across strata is allowed only for `serve-count`, `retoss-count`, `capture-quality`, `load-flag` and outcome tallies.
- Statistics are **never pooled across views** (D1).

---

## 2. Part A: finding serves, events and phases

### 2.1 Pipeline

1. **Probe and time base.** Build `VideoMeta`, `captureFps`, `timeScale` and the time-base assessment (video README).
2. **Audio.** Decode audio on the device and detect onsets. Keep **only onset timestamps and features**, never the audio samples (research 06 §11 on listening-device law; D8). If there is no audio or it is unusable (`assessAudioTiming`), every audio branch below is skipped.
3. **Coarse pass** over the whole clip:
   - Pose at about 15 fps (every k-th frame, k = round(captureFps / 15)) with the lite model, then `cleanPoseFrames`.
   - Compute the handedness check, the view check and `netDir`/`hitDir`.
   - Find serve anchors (§2.3).
4. **Fine pass** in each serve window: every frame, full pose model, ball detection with the pose-based toss region of interest (`tossRegionFromPose`) and an outgoing region, `trackBall`, `analyseToss`, then events (§2.4), phases (§2.6) and metrics (§3).
5. **Session.** Strata, aggregates (§4), capture quality (§3.25) and flags.

### 2.2 Signals

| Signal | Source | Used for |
|---|---|---|
| Hitting and tossing wrists (15/16), elbows, shoulders, hips, knees, ankles, heels, foot index, nose | Cleaned `PoseFrame` (One Euro, zero-phase) | Anchors, release (hand), trophy (hip drop), wrist apex, landing, recovery, bands |
| Toss parabola `y(t)` and linear `x(t)` | `trackBall` → `analyseToss` | Release, apex, drop, toss position, contact position, gravity check |
| Outgoing ball track | `trackBall` (outgoing) | Contact time (line meets parabola), speed method A |
| Audio onsets (`contact`, `bounce`, `unknown`; sharpness; SNR) | `detectOnsets` → `toAudioOnsets` | Contact time; speed method B |
| Wrist apex | Local maximum of hitting-wrist height | Serve anchor; contact fallback |

Heights in this section are **h_j(t) = (y_floor − y_j(t)) / H_HU**, in body heights above the floor.

### 2.3 Finding each serve in a multi-serve clip

**2.3.1 Anchors (coarse pass).** A serve anchor is a hitting-wrist local maximum at time `t_A` that meets all four conditions:
- `h_hit(t_A) ≥ 0.95`;
- `h_hit(t_A) ≥ h_nose(t_A) + 0.08`;
- prominence ≥ 0.30 BH over the preceding 1.5 s;
- the tossing wrist reached `h_toss ≥ 0.90` somewhere in `[t_A − 1.6 s, t_A − 0.15 s]`.

These are *initial* values. For scale: at contact the hitting wrist sits about 0.3–0.35 BH below the ball (racket and hand), and ball contact is about 1.4–1.5 × height (research 03 §5). The wrist is therefore about 1.0–1.15 BH [Our inference].

- Anchors less than 1.2 s apart are merged; keep the higher wrist.
- An audio `contact` onset with no pose anchor within ±0.3 s is ignored. It is usually a ball struck on the next court (research 05 [S40]).

**2.3.2 Windows.**
- A serve's window is `[t_A − 2.2 s, t_A + 2.0 s]`.
- Where neighbouring windows overlap, split at the midpoint between anchors.
- The window is widened to include `setupStart` and `recoveryEnd` once they are known (§2.4), but never past a neighbour's boundary.

**2.3.3 Toss-track validity.** Dribbles (pre-serve bounces) also produce parabolas. A toss track needs all four:
- apex height ≥ 1.35 BH;
- the first free-flight detection within 0.15 BH of the tossing wrist;
- release height ≥ 0.6 BH;
- at least 6 detections (`MIN_TOSS_DETECTIONS`).

Dribble parabolas peak below about 1 BH [Our inference].

**2.3.4 Classification** (fine pass):

| Class | Rule | Counted as |
|---|---|---|
| `serve` | Valid toss track, and a hitting-wrist apex within 1.2 s after the toss apex, and contact evidence: the ball leaves the parabola early (a fitted parabola residual jump > 4σ, or an outgoing track), or an audio contact onset (§2.4.4) | `serve-count` |
| `serve` + `NO_CONTACT` | As above, but the ball continues on the parabola to below 0.8 BH with no outgoing track and no contact onset (swing and miss) | `serve-count`; outcome auto-tagged "fault (missed)"; excluded from contact metrics |
| `retoss` | Valid toss track, the tossing arm up, no hitting-wrist apex ≥ 0.95 BH within 1.2 s after the toss apex; the ball returns to within 0.15 BH of either wrist (caught) or leaves the window | `retoss-count` |
| `shadow` | Anchor present, but no toss track and no contact onset | Neither (drill shadow swings) |
| `other` | Anchor present, but the tossing-arm condition fails after the fine pass | Excluded and logged |

**2.3.5 Serve number (1st or 2nd).** Priority order:
1. The player's per-serve tag.
2. The block type chosen at recording (for example "12 first serves").
3. The sequence rule, once outcomes are tagged: after a fault, the next serve within 25 s from the same court side is a 2nd serve. Otherwise it is a 1st serve.

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

If the evidence contradicts the declared view on ≥ 70% of serves, raise `VIEW_MISMATCH` and make every view-specific metric unavailable.

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

#### 2.4.1 `setupStart` and `motionStart` (helper events)

- **`motionStart`** is the start of the continuous toss movement. Step back from release to the last time the tossing-wrist speed stayed ≤ 0.25 BH/s for ≥ 0.2 s; `motionStart` is the end of that still stretch. Uncertainty: 50 ms. Confidence is 0.8 when a still stretch exists, else 0.4 (set to release − 0.8 s).
- **`setupStart`** is when the player settles at the serving spot. It is the last time before `motionStart` when either foot's horizontal speed was above 0.8 BH/s (walking), plus 0.2 s.
  - It is clamped to the range `[motionStart − 6 s, motionStart − 0.5 s]` and never earlier than the previous serve's `recoveryEnd`.
  - Dribbles belong to setup.

#### 2.4.2 `tossRelease`

- **Ball method** (`ball-release-fit`): `estimateRelease` fits the free-flight parabola plus a cubic departure term over the track and its lead-in (`ball/toss.ts`). σ comes from the fit, with the model floor. Quality `q` = `TossAnalysis.confidence`.
- **Hand method** (`pose-hand-separation`): the first time the ball-to-tossing-wrist distance exceeds 0.06 BH + ball radius and keeps growing for 3 frames, interpolated to where the distance crosses the threshold. σ = max(1 frame, 12 ms). q = the mean tossing-wrist visibility over ±3 frames, multiplied by 0.8.
- **Fusion:** the generic rule.
- **Fallback:** hand method only (confidence × 0.8). With no ball track at all, release is unavailable (`BALL_NOT_TRACKED`). A tossing-wrist deceleration peak alone is not accepted.
- Release timing is inherently less precise than apex timing, because the ball's departure from the hand grows only with the cube of time (`ball/toss.ts`).

#### 2.4.3 `tossApex`

- **Method** (`ball-apex-fit`): the parabola vertex `t* = −b / (2a)` from a fit to free-flight detections after release only, with sub-frame precision. The 1σ comes from the fit covariance (delta method). A drag-asymmetry correction of about +0.1% of the rise time (about 0.5 ms) is applied (`ball/toss.ts`).
- **Bracketing:**
  - Detections on both sides of the apex → full confidence.
  - Apex above the frame but detections on both sides → `aboveFrame: true`, σ multiplied by 2, confidence × 0.8.
  - Only one side observed → apex extrapolated, σ multiplied by 4, confidence × 0.5, and spatial toss metrics downgraded (`APEX_OUT_OF_FRAME`).
- **Gravity check:** `gravityTimeScaleCheck`. If it is implausible and the time base is not `proven`, apply §2.9.
- **Fallback:** none. The tossing hand cannot tell us when the ball peaks.

#### 2.4.4 `trophy` (maximum loading)

Defined as the lowest point of the mid-hip (pelvis) between `tossRelease` and `contact − 0.08 s`. The synthetic truth has the same definition: `trophyEndS`, where pelvis height is lowest.
- **Primary** (`pelvis-min`): smooth the mid-hip `y` with the cleaned series. Find the maximum of y (the lowest pelvis) in the window, and refine it with a 3-point parabolic interpolation.
  - Accept it if the drop from the setup hip height is ≥ 0.012 BH and the minimum is ≥ 0.004 BH deeper than both window edges.
  - σ = 25 ms + 0.5 frame. The minimum of a smooth curve is flat, so fps matters little.
  - q = mean hip visibility.
- **Fallback** (`toss-arm-apex`): if the pelvis minimum is too shallow (players who barely bend), use the time the tossing wrist is highest after release. σ = 60 ms, confidence × 0.6.
- **Cross-check:** if both exist and differ by more than 250 ms, keep the primary and multiply confidence by 0.8.

#### 2.4.5 `contact`

Contact is the most important timing event. It fuses up to four methods:

| Method | Rule | σ (1σ) | q |
|---|---|---|---|
| `audio-onset` | A `contact`-kind onset with sharpness ≥ 0.6 and SNR ≥ 10 dB, inside `[tossApex − 0.05 s, tossApex + 0.8 s]` and within ±0.12 s of the best video estimate. Correct for sound travel: `t = t_onset − D / c`, with c = 343 m/s (about 352 m/s at 35 °C; `speed.ts`). Then remove the clip's audio–video offset (below). | √(onset² + (σ_D / c)² + σ_AV²): about 3–6 ms without offset calibration, about 2 ms with it | Audio sharpness × min(1, SNR / 20 dB) |
| `ball-intersection` | Time at which the back-extrapolated outgoing-ball line (≥ 2 detections in the first 60 ms after the last on-parabola frame) comes closest to the toss parabola, minimising `‖p_toss(t) − p_out(t)‖` | From the fit: typically 0.3 frame | min(1, outgoing detections / 4) × fit quality |
| `ball-bracket` | Contact lies between the last frame whose ball is on the toss parabola (residual < 3σ) and the next frame (off it, or missing with the racket overlapping). t = the midpoint. | Frame period / √12 | 0.7 |
| `wrist-apex` | Hitting-wrist height maximum within ±0.15 s of the other estimates, plus a bias correction `β_w` calibrated on synthetic data (initial 0 ms) | 20 ms + 1 frame (blur and smoothing; pose README) | Wrist visibility × 0.6 |

- **Audio–video offset calibration:** with ≥ 3 serves that have both `audio-onset` and a `ball-intersection` at ≥ 120 fps, set σ_AV = the median absolute deviation of the pairs. The offset is the median of `t_audio − D / c − t_ball`. Otherwise the offset is 0 with σ_AV = 8 ms [Our inference: allowance for container and device audio–video skew].
- **Fusion:** the generic rule.
- **Fallbacks:**
  - Without audio: `ball-intersection` or `ball-bracket`.
  - Without a ball near contact (racket occlusion): `wrist-apex` alone, with confidence capped at 0.6. **Contact-position metrics then become unavailable** (`CONTACT_NOT_FOUND`), because the wrist cannot tell us where the ball was. Timing metrics may still use it.
- **Contact ball position:** the toss parabola `y(t_c)` and `x(t_c)` at the fused contact time. Extrapolation beyond the last on-parabola detection is allowed up to 0.10 s. Beyond that, the position is unavailable.

#### 2.4.6 `landing`

The first foot ground contact after contact.
- **Planted foot:** its lowest point `v_foot ≤ 0.03 BH` above the floor row, **and** its speed is ≤ 0.5 BH/s.
- **Airborne:** both feet unplanted and above 0.03 BH for ≥ 2 consecutive frames between trophy and contact + 0.3 s.
- **Rule** (`foot-contact`):
  - If the player was airborne: landing = the first unplanted→planted transition of either foot in `(contact, contact + 1.0 s]`. It is interpolated to the time the foot height crosses 0.03 BH on the way down.
  - If not airborne (no jump): landing = the first plant after contact of a foot whose toe has moved ≥ 0.10 BH forward since trophy.
  - If no foot moves that far: landing = contact, and `landing-distance` is reported from the front toe at that moment.
- **Landing foot:** the foot that satisfied the rule. It is usually the front foot. The metric records which foot it was.
- **Uncertainty:** σ = 0.7 frame + 6 ms. q = foot visibility.
- **Rear view:** the height above the floor is ambiguous from behind (forward motion also moves the foot up the image), so landing = the first time after contact that a foot becomes stationary (speed ≤ 0.3 BH/s for ≥ 3 frames) after moving. σ = 2 frames, confidence × 0.8.

#### 2.4.7 `recoveryEnd`

- The start of the first stable window after landing lasting ≥ 0.3 s, in which:
  - both feet are planted;
  - pelvis speed ≤ 0.3 BH/s;
  - trunk lean from vertical ≤ 20°.
- It is searched until landing + 2.5 s. If none is found (the player walks off to collect balls), recoveryEnd = landing + 1.5 s, with confidence 0.3 and method `timeout`.
- σ = 120 ms (the definition is the main source of uncertainty).
- There are no published norms for recovery; it serves the phase timeline and balance review only (research 03 §2).

### 2.5 Event confidence summary

The serve is **analysable** when release, apex and contact are all found (confidence ≥ 0.5). Serves without an apex keep their pose-only metrics (bands, landing) and lose toss metrics with `BALL_NOT_TRACKED`.

### 2.6 Phases (the seven product phases)

The phases follow the product mapping of the Kovacs and Ellenbecker stages in research 03 §2. They are contiguous and do not overlap. The toss apex is a *marker*, not a phase boundary, because it falls inside loading or drive depending on the player.

| Phase | Start → end | Key frame (for overlays and side-by-side) | Kovacs stage |
|---|---|---|---|
| `setup` | setupStart → motionStart | motionStart − 0.10 s (settled stance) | Start |
| `toss` | motionStart → tossRelease | tossRelease | Release |
| `loading` | tossRelease → trophy | trophy | Loading |
| `drive` | trophy → contact | The lowest hitting-wrist point between trophy and contact (racket-drop proxy) if its visibility is ≥ 0.5; otherwise the midpoint. From the chest side, the racket drop is often hidden behind the head and back (research 06 §2.2). | Cocking, acceleration |
| `contact` | contact − max(1 frame, 10 ms) → contact + max(1 frame, 10 ms) | The last frame at or before contact | Contact |
| `landing` | end of contact → landing + absorption. Absorption ends at the lowest pelvis within 0.4 s after landing, else at landing + 0.25 s | landing | Deceleration, finish |
| `recovery` | end of landing → recoveryEnd | recoveryEnd | Product-level phase |

- `PhaseSpan.confidence` = min(confidence of the start event, confidence of the end event).
- Overlays draw only at key frames whose confidence is ≥ 0.5.

### 2.7 Expected timing uncertainty by frame rate (1σ, before validation)

These are [Our inference] from the fit arithmetic and the pose README smoothing tests. §5 replaces them with measured values.

| Event | 30 fps (33 ms/frame) | 60 fps (17 ms) | 120 fps (8 ms) | 240 fps (4 ms) | Dominant term |
|---|---|---|---|---|---|
| tossRelease | 30 ms | 16 ms | 9 ms | 6 ms | Cubic departure from the hand |
| tossApex (bracketed) | 3 ms | 2 ms | 1.5 ms | 1 ms | Parabola fit. The ball is nearly still at the apex (research 03 §9) |
| trophy | 45 ms | 35 ms | 30 ms | 28 ms | Flat minimum of hip height |
| contact: audio + ball | 5 ms | 3 ms | 2 ms | 1.5 ms | Audio–video offset, sound path |
| contact: ball only | 10 ms | 5 ms | 3 ms | 1.5 ms | Frame bracket |
| contact: wrist only | 35 ms | 27 ms | 24 ms | 22 ms | Blur and smoothing |
| landing | 29 ms | 18 ms | 12 ms | 9 ms | Foot landmark noise |
| recoveryEnd | 120 ms | 120 ms | 120 ms | 120 ms | Definition |
| release→contact duration | 30 ms | 16 ms | 9 ms | 6 ms | Release |
| apex→contact duration | 6 ms | 4 ms | 2.5 ms | 2 ms | Contact |

Why fps matters for position:
- Near contact the ball falls at about 3.4 m/s (a 0.6 m drop) [Our inference: v = √(2gh)].
- So 5 ms of contact-time error is about 1.7 cm of contact height.
- Picking the nearest frame instead of fusing would cost ±2.8 cm at 60 fps (research 03 §9).

### 2.8 What changes in the rear view

| Item | Side view (primary) | Rear view (optional "outcomes view", D1) |
|---|---|---|
| Release, apex | As §2.4 | Same (vertical motion is in the image plane) |
| Trophy | Hip drop | Hip drop, plus the 2D knee angle (the knee bends roughly in the image plane from behind; research 03 §9, research 05 §6.5) |
| Contact | As §2.4 | The outgoing ball moves up and away and shrinks, so `ball-intersection` has lower q (× 0.7). The audio distance D is from the rear camera. |
| Landing | Foot height and plant | Stationarity rule (§2.4.6); σ 2 frames |
| Forward quantities (`toss-forward`, `contact-forward`, `landing-distance`) | Available | `VIEW_NOT_SUPPORTED`. Forward placement runs in depth from behind (research 06 §2.2). `landing-distance` from the rear needs the court homography and stays experimental. |
| Lateral quantities (`toss-lateral`, `toss-lateral-spread`) | `VIEW_NOT_SUPPORTED` (lateral is depth) | Available |
| Heights | Floor row at the player | Floor row at the player. The ball is 0.2–0.6 m in front of the feet, so further from the camera; perspective term in §3.2 |
| `trunk-tilt-band` | Lean at trophy (in plane) | `VIEW_NOT_SUPPORTED` in v1. The rear view sees a different quantity (lateral tilt at contact), which would need its own bands. |
| Outcomes and placement | Player-entered | Experimental automatic path after a four-corner tap (§3.18, §3.20) |

### 2.9 Slow motion and the time base

- If the time base is `proven` (video README), use it. `timeScaleRelSigma` = 0.003 (`speed.ts`).
- If the time base is `unknown` and ≥ 3 tosses are analysable: take the median `timeScaleFactor` from `gravityTimeScaleCheck`.
  - If it agrees with a standard ratio (1, 1/2, 1/4, 1/8, 1/16) within its 95% interval, apply that ratio (`fpsSource: 'physics'`).
  - All timing metrics are then capped at estimated. Relative time-base σ = the check's σ, with a floor of 2%.
  - Audio is unusable (`AUDIO_UNAVAILABLE`), because rendered slow-motion audio is stretched or muted (video README).
- If no standard ratio fits: every timing and speed metric is unavailable (`TIME_BASE_UNKNOWN`). Spatial metrics (heights, forward placement) remain available, because they do not depend on time.

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
- reference ranges;
- per-session aggregation;
- validation, with synthetic truth fields from `tools/synth` (`ServePlan`, `ServeTimes`, `ServeParams`) and real-footage methods.

Shared prerequisites, listed once here:
- a proven or physics-fixed time base for timing metrics;
- `view-match` (no `VIEW_MISMATCH`);
- per-serve `trackingQuality` ≥ 0.5 for pose-based metrics.

### 3.1 `serve-count` (and `retoss-count`)

- **Question:** "How many serves did I hit?" (and "How often did I catch a bad toss?")
- **Unit:** count, per stratum and in total. Re-tosses and shadow swings are shown separately.
- **Views:** side, rear.
- **Formula:** the number of §2.3.4 `serve` windows, including `NO_CONTACT`. `retoss-count` = the number of `retoss` windows.
- **Prerequisites:** pose coarse pass available; `captureFps` ≥ 25.
- **Status:** `serve-count` is measured at V1 (ceiling exception, §1.3). The player can delete a false serve or mark a missed one in the serve strip. Manual additions are `player-entered`. `retoss-count` is estimated at V1 and measured at V2, because telling a re-toss from a shadow swing is less certain.
- **Uncertainty:** none displayed. Detection error is reported through validation.
- **Reference:** none needed. Serve volume matters for load (research 03 [S43]; see `load-flag`).
- **Aggregation:** sum per stratum and per session.
- **Validation:**
  - Synthetic truth: `plans.length`, where each plan with a swing is a serve. Re-toss and shadow scenarios are in §5.3 S7.
  - Thresholds: precision ≥ 99% and recall ≥ 99% across all synthetic families; 100% on S0. Re-toss classification ≥ 95%.
  - Real: two annotators count serves on ≥ 300 real serves; precision and recall ≥ 98% (research 05 §10 row 1).

### 3.2 `toss-apex-height`

- **Question:** "How high do I toss?"
- **Unit:** value = ratio of apex height to standing height (for example 1.90 × your height). `secondary.cm` = ratio × H_m × 100. Displayed as "≈ 3.3 m (1.9 × your height)".
- **Views:** side (primary), rear.
- **Formula** (ball centre at apex):
  - `ratio = (y_floor − y_apex) / H_HU`, where `y_apex = c − b² / (4a)` from the free-flight fit, after level correction.
  - **Perspective bias correction, side view.** The toss usually sits towards the hitting-arm side, which is towards a chest-side camera. That magnifies heights about the horizon row.
    - Correction: `ratio_corr = ratio − (ratio − r_h) · δ̄ / D`, where `r_h = (y_floor − cy) / H_HU` is the camera-height ratio.
    - `δ̄` = +0.10 m (chest side) or −0.10 m (back side) [Our inference]. The synthetic intermediate profile uses a 0.12 m lateral apex offset; the coaching "1 o'clock" toss (research 03 [S1]) points the same way.
  - **Rear view:** δ̄ = −0.30 m (the toss is in front of the feet, away from the camera; research 04 F3 drill target 30–50 cm).
- **Prerequisites:** `tossApex` found and not extrapolated from one side only; `y_floor` found (`FEET_NOT_VISIBLE`); `H_HU` found (`BODY_NOT_UPRIGHT`); fps ≥ 30. The cm value also needs `H_m`.
- **Status rules:**
  - Target: estimated. Today: estimated at V1.
  - Apex above the frame but bracketed → estimated, with σ doubled.
  - One-sided apex → experimental with `APEX_OUT_OF_FRAME`.
  - Scale check > 15% off → cm value unavailable (`SCALE_INCONSISTENT`); the ratio is kept.
  - No toss track → unavailable (`BALL_NOT_TRACKED`).
- **Uncertainty** (1σ, in ratio units; × H_m for cm):
  - σ_r: fit `yUncertaintyNorm / H_HU`, plus depth leak `|ratio − r_h| · σ_δ / D`. σ_δ = 0.15 m, the unseen lateral toss scatter [Our inference]. Professional women's lateral toss SD is 6.6 cm (research 06 [S8]); recreational scatter is assumed larger.
  - σ_s: floor row 0.005; body-height session part 0.8% of the ratio; tilt 0.4% of the ratio per degree of uncorrected pitch (σ_tilt = 2° if unknown).
  - σ_p: body-height anthropometric bias 1.8%; entered height 1.2% (cm only).
  - Worked size: a 3.4 m apex, a phone 7 m away at 1.4 m, and 10 cm of unseen lateral offset shifts the apex by about 3 cm. The total 95% band is about ±15 cm, consistent with research 05's ±10–15 cm absolute estimate [Our inference].
- **Reference ranges:** no published values for recreational players (research 03 open question 1).
  - High-performance men (mean UTR about 10.7, n = 10): zenith 347.7 ± 24.0 cm (research 03 [S27]).
  - Nationally ranked junior men (n = 13, 181 cm): 3.40 ± 0.24 m, about 1.88 × height by our arithmetic (research 03 [S28]).
  - These are shown as context, never as targets (research 03 §1).
- **Aggregation:** median ratio and cm, with a bootstrap 95% CI (§4.3), n. The spread is its own metric.
- **Validation:**
  - Synthetic truth: `plan.apex[z] / heightM` (ball centre).
  - Thresholds (S0): |error| median ≤ 2.5% of standing height; p95 ≤ 5% of standing height.
  - Real: V2, annotated apex frame and ball centre (MAE ≤ 3% of height, which checks detection). V3, a 4 m calibration pole in the server's plane (research 06 §15.2), MAE ≤ 10 cm (research 05 §11.3).

### 3.3 `toss-forward`

- **Question:** "Is my toss in front of me?"
- **Unit:** cm, positive = into the court from the start toe. Displayed as "≈ 35 cm in front of your front toe".
- **Views:** side only.
- **Formula:**
  - `u_apex = netDir · (x_apex − x_S0) · aspect · mPerHU`, where `x_apex = x(t_apex)` comes from the linear x fit.
  - Perspective correction: `u_corr = u_apex − (u_apex − u_pp) · δ̄ / D`, where `u_pp` is the principal-point column in PPF metres and δ̄ is as in §3.2.
- **Prerequisites:** side view; apex found; S0 found (front-foot index visibility ≥ 0.5); `H_m`.
- **Status:** target and today estimated.
  - Rear view → `VIEW_NOT_SUPPORTED`.
  - Apex extrapolated → experimental.
  - Front foot occluded → unavailable (`FEET_NOT_VISIBLE`).
- **Uncertainty:**
  - σ_r: x-fit error; toe landmark jitter (0.01 BH); depth leak `|u_apex − u_pp| · σ_δ / D`.
  - σ_s: scale 0.8%; toe landmark bias 0.015 BH (the foot-index point is not the true toe tip).
  - σ_p: scale 1.8% and 1.2%.
  - Expected 95% band: about ±10 cm [Our inference; research 05 §6.3 estimates ±5–10 cm].
- **Reference ranges:** none measured for recreational players.
  - [Coaching interpretation]: toss "into the court", in front of the front toe. Research 04 F3's drill target is 30–50 cm in front of the front foot.
  - [Established] elite adolescents made contact about 17 cm further forward on flat serves than on kick serves (research 03 [S35]). Kick serves therefore sit further back, so strata must separate types.
  - `targetBand` 20–60 cm for flat and slice first serves (coach-recommended; not applied to kick).
- **Aggregation:** mean and SD (continuous and roughly symmetric), t-based 95% CI, n.
- **Validation:**
  - Synthetic truth: `plan.apex[x] − plan.frontToeAtRelease[x]` (m).
  - Thresholds: MAE ≤ 5 cm, p95 ≤ 10 cm.
  - Real: V2 annotated apex and toe; V3 two-view triangulation (research 05 §10 row 15), MAE ≤ 8 cm.

### 3.4 `toss-lateral` (rear view, added)

- **Question:** "Does my toss drift left or right?"
- **Unit:** cm, positive = towards the hitting-arm side of the start toe.
- **Views:** rear only.
- **Formula:** `u_lat = hitDir · (x_apex − x_S0) · aspect · mPerHU`. Perspective correction as §3.3, with rear δ̄.
- **Prerequisites:** rear view; apex found; S0 found; `H_m`.
- **Status:** experimental today (the rear pipeline is not yet run on synthetic data); target estimated. Side view → `VIEW_NOT_SUPPORTED`.
- **Uncertainty:** as §3.3, with rear D (4–6 m) and a forward-depth leak (σ_δ = 0.20 m).
- **Reference:** [Coaching interpretation] "1 o'clock" for a right-hander (research 03 [S1]). A toss directly overhead is flagged in coaching as a possible impingement concern (research 03 §5, [S1]).
- **Aggregation, validation:** as §3.3. Synthetic truth: `plan.apex` lateral offset from `frontToeAtRelease`, signed to the hitting side (the generator's `tossApexLateralM` convention).

### 3.5 `toss-drop`

- **Question:** "How far does the ball fall before I hit it?"
- **Unit:** value = cm. `secondary.timeMs` = apex→contact time. Displayed as "≈ 60 cm drop (0.35 s)".
- **Views:** side, rear.
- **Formula** (two independent estimates):
  - **Physics (primary):** `Δh_phys = ½ g Δt²`, with `Δt = t_contact − t_apex` and g = 9.81 m/s². This is scale-free and depth-free. Air drag on a ball falling at under 3.5 m/s changes the drop by less than 1% [Our inference: drag deceleration k·v² with k ≈ 0.02 m⁻¹].
  - **Image (cross-check):** `Δh_img = (y_contactBall − y_apex) · mPerHU`.
  - If `|Δh_img − Δh_phys| > max(6 cm, 20%)`, raise `SCALE_INCONSISTENT` (info). Possible causes: time base, height entry, or ball depth.
  - If the time base is `unknown` and not physics-fixed, use `Δh_img` with status estimated and the §3.2 uncertainty.
- **Prerequisites:** apex and contact found; contact not `NO_CONTACT`; ball position at contact available (§2.4.5); fps ≥ 30.
- **Status:** target measured (the physics path needs only timing, so §1.3 treats it as a timing metric). Today estimated (V1).
  - Contact from `wrist-apex` only → experimental.
  - No apex → unavailable (`BALL_NOT_TRACKED`).
- **Uncertainty:** `σ(Δh) = g·Δt·σ_Δt`, with σ_Δt from §2.7. For example, at 60 fps with audio and a 0.35 s fall, σ ≈ 9.81 × 0.35 × 0.004 ≈ 1.4 cm. The time-base relative σ adds `2·Δh·σ_ts`.
- **Reference ranges:** none for recreational players.
  - High-performance men: the ball fell about 0.56 m from zenith to contact (research 03 [S27]).
  - Junior men: 0.72 ± 0.19 m; successful and faulted serves had almost identical toss values (research 03 [S28]).
  - Physics: 0.34–0.38 s of fall (research 03 §5).
  - No direction is "better". [Our inference] coaching flag: a drop above 100 cm (about 0.45 s) lies beyond mean + 1.5 SD of the junior sample. It is offered to COACHING as the "toss too high, contact on the way down" signal (research 04 F4).
- **Aggregation:** median, bootstrap 95% CI, n.
- **Validation:**
  - Synthetic truth: `plan.apex[z] − plan.contact[z]` and `times.contactS − times.tossApexS`.
  - Thresholds: MAE ≤ 3 cm; time MAE ≤ 6 ms at 60 fps.
  - Real: V2 annotated apex and contact frames (time MAE ≤ 1 frame); V3 240 fps reference camera.

### 3.6 `toss-height-spread` (hero, D5)

- **Question:** "Is my toss becoming more consistent (height)?"
- **Unit:** cm. The SD of per-serve apex heights in the stratum, noise-corrected. Also stored as % of standing height.
- **Views:** side, rear (never pooled across views).
- **Formula:**
  - `SD_obs` = the sample SD of the included `toss-apex-height` cm values. In the ratio form, multiply by H_m.
  - Corrected: `SD = √max(SD_obs² − mean(σ_r²), 0)`.
  - `nearMeasurementLimit` is set when `mean(σ_r) ≥ 0.7·SD_obs`; the display then reads "≤ {SD_obs} cm".
- **Prerequisites:** n ≥ 8 included apexes in one stratum (provisional below 20, §4.1); fixed camera (no `CAMERA_MOVED` in the block); the same `H_HU` cluster.
- **Status:**
  - Target measured: shared errors cancel in a spread (research 05 §6.3), and σ_r is small.
  - Today estimated.
  - n < 8 → unavailable (`TOO_FEW_SERVES`).
  - `CAMERA_MOVED` → unavailable for that block.
  - More than 30% of apexes extrapolated → experimental.
- **Uncertainty:** a chi-square 95% CI on the SD (§4.3). At n = 8 the interval spans 0.66× to 2.04× the observed SD; at n = 20, 0.76× to 1.46× [Our inference: chi-square quantiles; research 06 §7.2].
- **Known limitation (side view):** unseen left–right scatter leaks into apparent height through perspective, by about `(ratio − r_h)·H / D` per metre of lateral scatter. That is about 0.3 cm per cm at 7 m with a 1.4 m phone [Our inference]. A player whose lateral toss wanders will show some extra height spread. The two-view mode removes this.
- **Reference ranges:** professional women, within-player SD at the zenith 6.0 cm vertical (n = 8 players × 5 serves). The authors judged a perfectly repeatable toss too strict a demand (research 06 [S8]). [Established] Experienced servers stabilise the vertical toss dimension most (research 03 [S29]). No recreational values exist.
- **Aggregation:** it is itself a session aggregate. For trends, one value per matched session.
- **Validation:**
  - Synthetic truth: the SD of realised `plan.apex[z]` over the *same* serves. Comparing against the population SD would add sampling error.
  - Thresholds: `|SD − SD_truth| ≤ max(1.5 cm, 15%)` in ≥ 90% of 20-serve blocks.
  - Monotonic response to `sdScale` ∈ {0.25, 0.5, 1, 2} (Spearman = 1 per profile).
  - Real: V2 test–retest, two 12-serve blocks in one session, with typical error reported. V3 two-view triangulated SD within 20%.

### 3.7 `toss-forward-spread` (hero, D5) and `toss-lateral-spread` (rear, added)

- **Question:** "Is my toss landing in the same place front-to-back?" (rear: "side to side?")
- **Unit:** cm SD, noise-corrected as in §3.6.
- **Views:** forward = side only; lateral = rear only.
- **Formula:** the SD of `toss-forward` (or `toss-lateral`) values in the stratum, corrected with σ_r.
- **Prerequisites, status and uncertainty:** as §3.6. `toss-lateral-spread` is experimental today.
- **Reference ranges:** professional women 7.2 cm forward–back and 6.6 cm lateral (research 06 [S8]). Experienced servers allow more side-to-side and forward–back variation than vertical variation (research 03 [S29]). Coaching should therefore weight vertical consistency more heavily [Our inference].
- **Validation:** as §3.6, against the SD of `plan.apex[x] − frontToeAtRelease[x]` (or the lateral offset). Threshold `max(2 cm, 20%)`.

### 3.8 `contact-height-ratio` (hero)

- **Question:** "How high do I make contact?"
- **Unit:** value = ratio of ball-centre contact height to standing height (for example 1.46×). `secondary.cm`. Displayed as "1.46 × your height (≈ 2.56 m)".
- **Views:** side, rear.
- **Formula:**
  - `ratio = (y_floor − y_ball(t_c)) / H_HU`, where `y_ball(t_c)` is the toss parabola at the fused contact time.
  - Perspective correction as §3.2, with the contact point's own offset: δ̄_c = +0.20 m towards a chest-side camera [Our inference: contact on the hitting-arm side; research 03 [S34] reports lateral impact offsets of 10–30 cm in elite juniors].
  - The value includes any jump. Contact height is the ball's height above the ground, as in the reference studies.
- **Prerequisites:** contact found with a ball position (not wrist-only); not `NO_CONTACT`; `y_floor`; `H_HU`. The cm value needs `H_m`.
- **Status:** target estimated (absolute, depends on the body-height estimate); today estimated.
  - Contact extrapolated more than 0.05 s beyond the last on-parabola detection → experimental.
  - Wrist-only contact → unavailable (`CONTACT_NOT_FOUND`).
- **Uncertainty:**
  - σ_r: ball-speed × contact σ (about 1.7 cm at 5 ms); fit; depth leak `|ratio − r_h| · σ_δc / D` with σ_δc = 0.15 m.
  - σ_s, σ_p: as §3.2.
  - The body-height bias dominates: 1.8% of 1.46 ≈ 0.026 ratio units (about 4.6 cm at 1.75 m) [Our inference].
  - Consequence: comparisons with *published* values are coarse, but the player's own session-to-session comparisons are sharper, because σ_p cancels (§1.2).
- **Reference ranges:**
  - Beginners 142.6% vs elite 149.2% of standing height (research 03 [S6]); 144–149% across levels (research 03 [S7]); a roughly constant 1:1.5 in experienced players (research 03 [S29]); about 148% in junior men (research 03 [S28], our arithmetic).
  - Recreational players contacted the ball 13 cm lower than competitive players in a weak case study (2 hobby players vs 8; research 05 [S47]).
  - [Established] Impact height correlates with serve speed (ρ = 0.75–0.78; ρ = 0.63 after normalising for height; research 03 [S28]).
  - `higherIsBetter`, shown as direction of travel, not a target.
- **Aggregation:** mean ratio (and cm), t-based CI including σ_s and σ_p (§1.2), n.
- **Validation:**
  - Synthetic truth: `plan.contact[z] / heightM`.
  - Thresholds: MAE ≤ 0.02 ratio (about 3.5 cm); p95 ≤ 0.04.
  - Real: V2 annotated contact frame and ball (MAE ≤ 0.025). V3 pole or 240 fps reference, MAE ≤ 10 cm (research 05 §11.3).

### 3.9 `contact-height-spread` (added)

- **Question:** "Do I hit the ball at the same height each time?"
- **Unit:** cm SD, noise-corrected (§3.6 method).
- **Views:** side, rear.
- **Prerequisites and status:** as §3.6, using included `contact-height-ratio` values. Estimated today; measured target.
- **Reference:** professional women: impact height was the most consistent dimension, SD 3.5 cm (research 06 [S8]). [Established] Lower impact-height variability strengthened the strength→speed link in juniors (research 03 [S28]).
- **Validation:** as §3.6, against the SD of `plan.contact[z]`. Threshold `max(1.2 cm, 15%)`.

### 3.10 `contact-forward`

- **Question:** "Am I hitting the ball out in front?"
- **Unit:** cm, positive = into the court from the start toe.
- **Views:** side only.
- **Formula:** `u_c = netDir · (x_ball(t_c) − x_S0) · aspect · mPerHU`, perspective-corrected with δ̄_c.
- **Prerequisites:** side view; contact with a ball position; S0; `H_m`.
- **Status:** estimated today and as target. Rear → `VIEW_NOT_SUPPORTED`. Wrist-only contact → unavailable.
- **Uncertainty:** as §3.3, plus the horizontal ball speed at contact × σ_tc. The toss drifts forward slowly (< 1 m/s), so this term is small.
- **Reference:** no numeric recreational or elite reference in our research. Flat contact is about 17 cm further forward than kick in elite adolescents (research 03 [S35]). [Coaching interpretation]: contact in front and into the court (research 04 F6, F11). Direction is none; coaching reads it together with `toss-forward`.
- **Aggregation:** mean, t-based CI, n.
- **Validation:** synthetic truth `plan.contact[x] − frontToeAtRelease[x]`; MAE ≤ 6 cm, p95 ≤ 12 cm. Real V3: two-view triangulation.

### 3.11 `rhythm-release-to-contact` (hero)

- **Question:** "How long from toss to hit?"
- **Unit:** ms. `secondary.loadingMs` = release→trophy; `secondary.driveMs` = trophy→contact.
- **Views:** side, rear.
- **Formula:** `T_rc = (t_contact − t_tossRelease) · 1000`.
- **Prerequisites:** release and contact found; fps ≥ 30; time base proven or physics-fixed.
- **Status:** target measured; today estimated.
  - 30 fps, or physics time base → estimated even after V2.
  - Contact wrist-only → experimental.
  - Time base unknown → unavailable.
- **Uncertainty:** `σ = √(σ_release² + σ_contact²)` from §2.7, for example about 16 ms at 60 fps. Time-base error adds `T_rc · σ_ts`.
- **Reference ranges:** release to impact 0.97 ± 0.10 s in 10 high-performance men (research 03 [S27]). No recreational values. There is no "correct" tempo; any ideal is [Coaching interpretation] (research 05 §6.2). No `higherIsBetter`.
- **Aggregation:** median, bootstrap CI, n.
- **Validation:**
  - Synthetic truth: `times.contactS − times.tossReleaseS`.
  - Thresholds: MAE ≤ 1 frame + 2 ms at each fps.
  - Real: V2 annotated frames, MAE ≤ 1 frame (research 05 §11.3).

### 3.12 `rhythm-spread` (hero)

- **Question:** "Is my rhythm the same every serve?"
- **Unit:** ms SD, noise-corrected with σ_r = the per-serve σ of `T_rc`. `secondary.cv` = SD ÷ median (%).
- **Views:** side, rear.
- **Prerequisites:** n ≥ 8 in the stratum; fps ≥ 60. At 30 fps the release σ (about 30 ms) is close to plausible spreads, so the value is estimated with `nearMeasurementLimit` [Our inference].
- **Status:** target measured; today estimated.
- **Reference:** no numeric values. [Established] Elite women showed a variable toss but very consistent serve timing (research 03 [S24]). Greater movement variability went with lower speed and accuracy (research 03 [S30]). Experts rate rhythm reliably from 2D video (research 03 [S33]). `higherIsBetter: false`.
- **Validation:** SD of the truth `T_rc` over the same serves; `|error| ≤ max(10 ms, 20%)` at 60 fps; monotonic in `sdScale`.

### 3.13 `trophy-pause`

- **Question:** "Do I pause at the top?"
- **Unit:** ms.
- **Views:** side, rear.
- **Formula:**
  - `T_pause` = the length of the longest interval `[t_a, t_b] ⊂ [tossRelease, contact − 0.08 s]` that contains or ends at the trophy time, in which all three hold:
    - pelvis vertical speed < 0.15 BH/s;
    - hitting-wrist speed < 0.6 BH/s;
    - tossing-wrist speed < 0.6 BH/s.
  - Speeds come from the cleaned pose.
  - The thresholds are *initial*; they are grid-searched on synthetic data against `trophyEndS − trophyStartS` and then frozen.
  - If the trophy frame itself fails the test, `T_pause = 0`.
- **Prerequisites:** trophy found by `pelvis-min` (not the fallback); fps ≥ 60; wrist visibility ≥ 0.5 over the interval.
- **Status:** experimental today (velocity thresholds on noisy real landmarks are untested); target estimated. Trophy found by fallback → unavailable (`POSE_LOW_QUALITY`).
- **Uncertainty:** ± (2 frames + 30 ms), shown only in "How we measure".
- **Reference:** none numeric.
  - [Established mechanism] Upper-arm internal-rotation speed was about 20% higher with no pause than after a 1.5 s pause (research 03 [S2]).
  - [Coaching interpretation] Only a short pause (research 03 §3). Applying this to a "trophy pause" is interpretation.
  - `higherIsBetter: false`. [Our inference] coaching flag at > 500 ms.
- **Aggregation:** median, IQR, n.
- **Validation:**
  - Synthetic truth: `times.trophyEndS − times.trophyStartS` (`trophyPauseActualS`).
  - Thresholds: MAE ≤ 60 ms; Spearman ≥ 0.8 across the beginner, intermediate and advanced profiles.
  - Real: V2 annotated trophy start and end frames by two annotators, reporting inter-rater agreement first.

### 3.14 `knee-bend-band`

- **Question:** "Am I using my legs?"
- **Unit:** band `low | typical | high` (the D5 enum). Suggested display labels: "Little bend", "Moderate bend", "Deep bend". Always shown with the trophy key frame beside setup, with a hip-height line overlay. No degrees are ever displayed (D5).
- **Views:** side (hip-drop method); rear (2D knee angle, with hip drop as a cross-check).
- **Why hip drop in the side view:**
  - From the chest side, the knees bend largely towards the camera, so a 2D knee angle is foreshortened (research 03 §9; research 05 §6.5).
  - Hip height is vertical, and vertical is in the image plane from any level horizontal view.
  - [Coaching interpretation] The coaching symptom of straight legs is "no down-then-up movement of the hips" (research 04 F9). Kovacs emphasises vertical hip displacement over depth (research 03 [S51]).
- **Formula (side):**
  - Standing leg length `L = y_floor − y_midhip,setup` (HU), from the median over upright setup frames.
  - Drop `Δ` = the largest hip drop `y_midhip(t) − y_midhip,setup` within `[tossRelease, contact − 0.08 s]`. This is the same window as the trophy search (§2.4.4), and it is used whether or not the trophy event fell back to the toss-arm method. Players who barely bend therefore still get a (low) band.
  - `ρ = Δ / L`.
  - The knee-flexion equivalent θ solves `ρ = ½[(1 − cos(kθ)) + (1 − cos((1−k)θ))]`, with k = 0.4 (the shank's share of the flexion; *initial*, fitted on synthetic data). This models equal shank and thigh lengths [Our inference].
  - **Bands on θ:** low < 25°, typical 25–55°, high > 55°. On ρ that is low < 0.025, typical 0.025–0.117, high > 0.117 [Our inference, from the formula].
  - Rationale for the cut points:
    - 25° is above the >15° front-knee recommendation (research 03 [S1], coaching) plus a margin for proxy error.
    - 55° sits near the lower edge of pooled national-to-professional trophy values (front knee 64.5 ± 9.7°; research 03 [S31]).
- **Formula (rear):**
  - θ = the 2D angle hip–knee–ankle at trophy (180° − interior angle, `kneeFlexionDeg`). Use the near-side (back) knee if its visibility is ≥ 0.6, else the front knee. Record which knee was used.
  - Bands as above.
  - Downgrade one level of confidence if the hip-drop band disagrees.
- **Band probability:** treat θ as normal with σ_θ. Side view: σ_ρ = √(2·(0.006 / L_BH)² + 0.010²) ≈ 0.02 for a leg length L_BH ≈ 0.5 BH (two hip readings at 0.006 BH each, plus 0.010 model error of the proxy), mapped through the formula. Rear view: σ_θ = 10° (research 05 [S16]).
  - `bandProbabilities` are the three band masses.
  - Report the argmax band if its probability is ≥ 0.7. Otherwise report `band: 'unclear'`, and the UI shows the two neighbouring bands ("between little and moderate").
- **Prerequisites:** release and contact found; upright setup frames; hips visible (≥ 0.5) through the window (side), or a visible knee at trophy (rear). No `H_m` needed.
- **Status:**
  - Estimated today and as target. It is a band, so it is never "measured" (D5).
  - Unclear on more than 50% of the stratum's serves → the session band is `unclear`.
  - A crouched start (no upright setup) → unavailable (`BODY_NOT_UPRIGHT`).
- **Reference:**
  - [Established] Restricting the knees to 10° cut ball speed by about 15–17% at every level (research 03 [S7]).
  - [Established, conflicting] Under about 10° of front-knee flexion went with higher shoulder and elbow loads at similar speed (research 03 [S3]), but not in another study (research 03 [S9]).
  - Pooled front knee 64.5 ± 9.7° (national to professional; research 03 [S31]).
  - Do not "correct" stance choice (research 03 §4).
  - `targetBand`: ≥ typical.
- **Aggregation:** the modal band over included serves, with the share in each band ("9 of 12 serves: moderate"). Underlying `θ` values are kept for comparisons (SWC §4.5) but never displayed.
- **Validation:**
  - Synthetic truth: band of `params.maxKneeFlexionDeg` (realised front-knee flexion from the truth skeleton at `trophyEndS`).
  - Thresholds: ≥ 90% agreement on serves whose truth is ≥ 5° from a cut point; zero low↔high swaps; `unclear` on ≤ 25% of serves.
  - Real: V2 two coaches label three levels blinded to the engine; agreement ≥ 80% (research 05 §11.3); Krippendorff's α ≥ 0.7 between coaches (research 03 §Implications 9).

### 3.15 `trunk-tilt-band`

- **Question:** "How much do I tilt back as I load?"
- **Unit:** band `low | typical | high`. Suggested labels: "Upright", "Tilted", "Big arch". Shown with the trophy key frame and a hip→shoulder line.
- **Views:** side only (v1).
- **Formula:**
  - At trophy: `φ = atan2(−netDir·(x_midShoulder − x_midHip)·aspect, (y_midHip − y_midShoulder))` in degrees, positive = shoulders behind the hips (leaning away from the net).
  - At trophy the chest faces a chest-side camera, so this lean is in the image plane (research 03 §9).
  - **Bands:** low < 10°, typical 10–35°, high > 35°. [Our inference] These are anchored on the pooled trunk inclination at trophy of 25.0 ± 7.1° (6 studies, national to professional; research 03 [S31]): 10° ≈ mean − 2 SD, 35° ≈ mean + 1.5 SD. Definitions vary between studies (research 03 [S31]), so treat this as context.
  - The band probability uses σ_φ = 6° [Our inference: two-landmark angle over a torso of about 0.3 BH; research 05 §6.6 gives ±5–10° in plane]. The same `unclear` rule applies as §3.14.
  - The contact-time lean (positive = towards the net) is stored as `secondary.contactLeanDeg`, for overlays only. It is not a player-facing metric in v1.
- **Prerequisites:** side view; trophy found; shoulders and hips visible (≥ 0.5).
- **Status:** estimated today and as target. Rear → `VIEW_NOT_SUPPORTED` (§2.8).
- **Reference:** [Established] Shoulder-over-shoulder tilt positions internal rotation (research 03 [S2]). [Established] Lumbar lateral-flexion loads are high in elite adolescent serves (research 03 [S36]). The "high" band feeds COACHING's back-comfort logic (research 04 F6), never a diagnosis. `targetBand`: typical.
- **Aggregation:** modal band plus shares.
- **Validation:**
  - Synthetic truth: the truth-skeleton mid-hip→mid-shoulder angle at `trophyEndS`, projected into the camera plane *and* in 3D. Report both, because the 2D projection is the method's own limit.
  - Thresholds: ≥ 85% band agreement on serves ≥ 4° from a cut point.
  - Real: coach three-level labels, ≥ 80% agreement.

### 3.16 `landing-distance` (hero)

- **Question:** "Am I driving into the court?"
- **Unit:** cm, positive = into the court from the start toe. Displayed as "You land ≈ 45 cm in front of where your front toe started".
  - Not "inside the baseline", unless a baseline tap exists. Then `secondary.fromBaselineCm` is also given.
- **Views:** side (rear: experimental with calibration only).
- **Formula:**
  - `u_land = netDir · (x_toe,landingFoot(t_land + 2 frames) − x_S0) · aspect · mPerHU`, using the foot-index landmark of the landing foot once planted.
  - The toe point is used, not the ankle. The ankle sits above the ground, which biases landing positions (research 05 §6.7).
- **Prerequisites:** side view; landing found (confidence ≥ 0.5); landing-foot index visible (≥ 0.5); S0; `H_m`.
- **Status:** estimated today and as target.
  - Research 05 §10 had proposed experimental until validated, because recreational norms are unverified. We keep estimated because the value is a within-plane displacement with no norm claim [Our inference], and D5 makes it a hero metric. It moves to experimental if V1 fails.
  - Rear view without calibration → `VIEW_NOT_SUPPORTED`.
- **Uncertainty:** σ_r: toe jitter 0.01 BH ×2 (two readings); landing-foot identification. σ_s: scale 0.8%. Expected 95% band about ±8–10 cm (research 05 §6.7 estimates ±10 cm).
- **Reference:** no established norms for recreational players (research 05 §6.7). [Coaching interpretation] Landing behind the baseline suggests no forward drive (research 04 F9). [Established] Foot-up stances produce larger braking forces at landing (research 03 [S1]). Direction is none; COACHING may flag ≤ 0 cm.
- **Aggregation:** mean, t-based CI, n.
- **Validation:**
  - Synthetic truth: landing-foot toe x at `times.landingS` minus `frontToeAtRelease[x]` (the generator's `landingDistanceM` is relative to the baseline, so recompute from truth). Landing time vs `times.landingS`.
  - Thresholds: distance MAE ≤ 8 cm, p95 ≤ 15 cm; time MAE ≤ 1 frame.
  - Real: V3 tape-measured chalk marks (research 05 §10 row 22).

### 3.17 `repeatability`

- **Question:** "How similar are my serves to each other?"
- **Unit:** index 0–100, higher = more repeatable.
- **Views:** side, rear (separate).
- **Formula** [Our inference]:
  1. For each serve, build a trajectory of 7 points:
     - hitting wrist, tossing wrist, hitting elbow, mid-shoulder, mid-hip, nose (PPF coordinates in BH relative to S0);
     - the ball (until contact).
  2. **Time normalisation, anchored on events:**
     - release→trophy: 20 samples;
     - trophy→contact: 20 samples;
     - contact→contact + 0.25 s: 10 samples.
     - Samples are piecewise-linear in time. Tempo is removed; `rhythm-spread` covers tempo.
     - Mask points with visibility < 0.5 or `interpolated`.
  3. **Reference:** the pointwise median trajectory across the stratum's serves.
  4. **Per-serve deviation:** `d_i` = RMS over valid (point, sample) pairs of the Euclidean distance to the reference, noise-corrected: `d_i,c = √max(d_i² − σ_n², 0)`. σ_n is the pose jitter RMS from the cleaning report, times √(1 + 1/n).
  5. **Index:** `R = 100 · exp(−median(d_i,c) / τ)`. τ = 0.06 BH is the *initial* value, calibrated so that the synthetic advanced profile scores about 80 and the beginner profile about 50. These targets are ours and only set the scale.
  6. **By-product:** the serve with the smallest `d_i` is the **representative (median) serve** used for key frames, as research 06 §7.3 recommends instead of the best serve.
- **Prerequisites:** n ≥ 5 serves with release, trophy and contact in the stratum; the same view and camera position.
- **Status:** experimental today and as target. It is our own composite; no external reference exists (research 05 §10 row 24).
- **Uncertainty:** bootstrap 95% CI over serves (§4.3).
- **Reference:** none. [Established] More variable movement went with lower speed and accuracy (research 03 [S30]). `higherIsBetter`.
- **Validation:** synthetic Spearman ρ ≥ 0.9 between R and `sdScale` ∈ {0.25, 0.5, 1, 1.5, 2} per profile; two seeds at the same `sdScale` differ by ≤ 5 points. Real: correlation with coach-rated consistency (research 05 §10 row 24) and test–retest.

### 3.18 `serve-in-rate`, `first-serve-in-rate`, `second-serve-in-rate` (added)

- **Questions:** "How many serves went in?"; "Am I getting more first serves in?"; "Is my second serve reliable?"
- **Unit:** k of n, and % when n ≥ 10.
- **Views:** any. Side = player-entered (D3). Rear = experimental automatic after calibration.
- **Formula:**
  - `k / n`. Outcomes are in / net / long / wide / fault (missed).
  - `let` and `unknown` are excluded from n. `NO_CONTACT` counts as a fault.
  - The first-serve and second-serve rates filter on serve number.
  - Session-tally entry gives k and n directly (D3).
- **Rear automatic path (experimental):**
  - Bounce from `detectBounce` → `mapBounceToCourt` through the four-corner homography → `classifyServeLanding`.
  - A bounce inside the box by more than 2σ of its uncertainty ellipse → in; outside by more than 2σ → out (long or wide from geometry); within 2σ → `close call`, not counted, and the player is asked.
  - Net: the track ends or reverses before the net plane (research 05 §5.3).
- **Prerequisites:** outcome tags for ≥ 1 serve (side); rear auto also needs the four-corner tap and ≥ 60 fps.
- **Status:**
  - Player-entered values are `player-entered`.
  - Rear auto is experimental, `NEEDS_CALIBRATION` without the tap, and never mixed with player-entered in one rate.
  - No tags → unavailable (`NOT_ENTERED`).
- **Uncertainty:** Wilson 95% interval (§4.3), for example 12 of 20 → 38.7–78.1% (research 09 §3.4).
- **Reference ranges** (vendor data, match play, NTRP 3.0–5.0, combined genders): first serve in 53.3–55.8%, second serve in 70.4–70.9% (research 01 [S7], Vendor claim). First-serve % barely moves with level, so it is a weak progress headline (research 09 §4.1). `higherIsBetter`.
- **Aggregation:** pooled k/n per serve number and per stratum. Rolling windows of about 100 serves for trends (research 06 §7.1).
- **Validation:** player-entered values need no validation. Rear auto: ≥ 95% correct for bounces more than 30 cm from lines; "close call" inside that (research 05 §11.3), against annotated video plus an on-court observer.

### 3.19 `double-faults`

- **Question:** "How many double faults?"
- **Unit:** count; and per 10 points when points are known.
- **Views:** any.
- **Formula:**
  - In point-play mode (serves tagged 1st/2nd in sequence), a double fault is a 2nd serve with a fault outcome.
  - Points = the number of 1st serves.
  - Rate = DF ÷ points × 10.
  - A session tally may enter the count directly.
- **Status:** player-entered. Without point-play or a tally → unavailable (`NOT_ENTERED`).
- **Uncertainty:** Wilson interval on DF ÷ points.
- **Reference:** 3.2–3.7 double faults per match, NTRP 3.0–5.0 (research 01 [S7], Vendor claim; match play, not practice). `higherIsBetter: false`.
- **Validation:** none needed (player-entered).

### 3.20 `placement-zone`

- **Question:** "Where are my serves landing?"
- **Unit:** counts per zone: T / body / wide, per court side. Each serve records the target zone and, optionally, the result zone.
- **Views:** any. Side = player-entered. Rear = experimental automatic.
- **Formula:**
  - Player tags: target (intent) and result (where it landed).
  - Hit-rate on target = matching result ÷ tagged results (Wilson).
  - Rear auto: the bounce point's lateral position in the service box, split into thirds of the 4.115 m box width, with the thirds nearest the centre line being T [Our inference; ITF dimensions via research 06 §6.1].
  - "Too close to call" when P(zone) < 0.8 under the bounce uncertainty ellipse. Lateral calls are much more precise than depth from behind (research 05 §5.2).
- **Status:** player-entered, or experimental (rear auto); `NEEDS_CALIBRATION`.
- **Reference:** no recreational reference. [Established] Placement relative to the returner and closeness to lines, together with speed, classified professional aces with 87% accuracy (research 03 [S21]).
- **Validation:** rear auto zone agreement ≥ 90% (research 05 §11.3).

### 3.21 `serve-type-mix`

- **Question:** "Which serves did I practise?"
- **Unit:** counts: flat / slice / kick / unknown.
- **Formula:** player-entered intended type per serve or per block (D4).
- **Status:** player-entered. An automatic "looks like slice" classifier is `NOT_IMPLEMENTED` in v1 and would be experimental later (research 05 §4).
- **Reference:** none. Type is a stratum key (§1.6).

### 3.22 `speed-experimental` (D4)

- **Question:** "Roughly how fast was that serve?"
- **Unit:** km/h range. Always named: "launch speed (just after contact)" or "average speed over the flight". Rounded outward to 5 km/h ("about 140–155 km/h"). Never a single number, never decimals (D4; research 05 §0).
- **Default:** unavailable (D4). Experimental when the prerequisites below hold **and** the experimental toggle is on (else `EXPERIMENTAL_HIDDEN`).

**Method A: side-view outgoing track** (`estimateServeSpeedFromTrack`, `ball/speed.ts`)
- **Prerequisites:**
  - side view;
  - real `captureFps` ≥ 120 with a proven or physics-fixed time base;
  - ≥ 3 clean outgoing detections (score ≥ 0.15) between 4 ms and 50 ms after contact, with a line-fit residual RMS ≤ 0.5 ball radius;
  - `H_m` entered (D4).
- **Formula:**
  - In-plane speed from a straight-line fit, scaled by `mPerHU` and corrected for the ball's depth offset (δ̄_c, σ 0.3 m; `CONTACT_DEPTH_SIGMA_M`).
  - Drag back-extrapolation to launch with a drag length of 36–55 m.
  - Divided by `cos ψ` for an out-of-plane angle ψ.
  - ψ ∈ [0°, 25°] by default. We propose [0°, 15°] when the zone is tagged and the camera yaw check passes [Our inference: side-camera geometry, lateral serve angles of at most about 12°].
- **Range:** the engine's 2σ interval, combining localisation, scale, time base and perspective, plus the cosine bound (`speed.ts`).
- **Quantity:** launch speed. It is comparable in kind to a radar peak, but not validated against one.

**Method B: audio flight time** (`speedFromFlightTime`)
- **Prerequisites:**
  - usable audio;
  - a contact onset, plus a bounce onset in `[t_c + 0.3 s, t_c + 1.2 s]` with SNR ≥ 10 dB;
  - the serve tagged "in" by the player (so the bounce is in a service box);
  - `H_m`, for the camera distance.
- **Formula:**
  - `T = (t_bounce − d_b/c) − (t_contact − d_c/c)`.
  - `d_c = D` ± 15%. `d_b` comes from court geometry, with the side camera on the baseline extension at lateral distance D: about 15–21 m, a 44–61 ms delay [Our inference].
  - Path length range 14–19 m (engine default: contact just inside the baseline, bounce anywhere in the back two-thirds of the box).
  - Average speed = path ÷ T. Launch speed = `L(exp(path/L) − 1)/T`.
- **Why the correction matters:** the bounce sound travels about 20–45 ms longer than the contact sound (contact 6–8 m away, 17–23 ms; bounce 44–61 ms). Uncorrected, that under-reads speed by several per cent (research 05 §3.5 computes about 9% for a rear camera).
- **Quantity:** average speed. It is shown first, because the path-length prior dominates the launch conversion.

**Both methods**
- **Display gate:** show a range only if (high − low) ÷ midpoint ≤ 0.35; else `RANGE_TOO_WIDE`. Method B's path prior alone is about ±15%, so B will often be suppressed [Our inference].
  - If A and B are both available and their ranges do not overlap → show neither (`METHODS_DISAGREE`).
  - If they overlap, show A (launch) and B (average) on separate labelled rows.
- **Other unavailable reasons:** `FPS_TOO_LOW` (A), `AUDIO_UNAVAILABLE`, `BOUNCE_NOT_HEARD`, `NOT_ENTERED` (B, untagged), `PLAYER_HEIGHT_MISSING`, `TIME_BASE_UNKNOWN`, `FLICKER` (A under 100 Hz flicker, research 05 §9.6), `MOTION_BLUR` (A: ball streak > 3 diameters).
- **Reference (context only, never mixed):**
  - SwingVision *average* first-serve speed, 96–120 km/h at NTRP 3.0–5.0 (research 01 [S7], Vendor claim). Average speed reads about 20% below radar (research 05 [S35]).
  - Laboratory radar flat first serves: beginners 107, intermediates 149 km/h (research 03 [S7]).
- **Aggregation:**
  - Per-serve ranges in the serve list.
  - Session "typical" = the median of per-serve midpoints. Its range combines the shared relative error (scale, perspective, drag assumptions: 2σ, not averaged) with the random part divided by √n.
  - Session "fastest" = the serve with the highest midpoint, shown with its own range.
  - No "Did it work?" verdicts on speed (§4.5).
- **Validation:**
  - Synthetic truth: `params.serveSpeedKmh` (launch) and the flight-average speed from `plan.flight`.
  - Thresholds: range coverage ≥ 90% of serves (target 95%, because the range is 2σ); median |midpoint error| ≤ 5%; unavailable at < 120 fps in 100% of cases (A).
  - Real (V3): Pocket-Radar-class device (±1 mph) behind the server, in line with the serve; 200+ serves; bias, 95% limits of agreement, coverage.
  - Before the experimental tag is removed: MAE ≤ 5%, LoA within ±10% (research 05 §11.3).

### 3.23 `speed-radar-entered`

- **Question:** "What did my radar say?"
- **Unit:** km/h; mph input is converted (× 1.609) and stored with the original.
- **Formula:** the player enters a per-serve reading (in review) or a session maximum, plus the device (Pocket Radar, other radar, other).
- **Status:** player-entered; never validated or edited by us.
- **Use:**
  - Shown as "You logged 142 km/h (radar)".
  - Pairs with `speed-experimental` become personal validation data. The "How accurate" sheet may say "our range contained your radar reading on 7 of 9 serves".
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
- **Checks.** These are computed per serve and aggregated. The list adapts research 06 §14, and thresholds are *initial*. "Block" = the metrics that depend on the check become unavailable for that serve with the listed code.

| id | Check | Pass | Warn | Block (affected metrics) |
|---|---|---|---|---|
| `fps` | Real capture fps | ≥ 60 | 30–59: timing σ doubles | < 25 (all timing) `FPS_TOO_LOW` |
| `time-base` | Proven, or gravity-consistent | proven | physics-fixed | unknown (timing, speed) `TIME_BASE_UNKNOWN` |
| `frame-gaps` | Missing frames in the serve window | ≤ 2% | 2–10% | > 10% (timing) `FRAMES_DROPPED` |
| `subject-size` | Standing height in pixels, scaled to a 1080-pixel frame height | ≥ 350 px | 250–349 | < 200 (pose metrics) `POSE_LOW_QUALITY` |
| `framing` | Full body inside a 3% margin from setup to landing | yes | feet cut at landing only | head or hitting arm out at contact (contact) |
| `toss-headroom` | Apex ≥ 3% below the frame top | yes | above frame but bracketed | one-sided (toss spatial) `APEX_OUT_OF_FRAME` |
| `ball-visibility` | Toss detections ÷ free-flight frames | ≥ 80% | 50–80% | < 50% or < 6 detections (toss) `BALL_NOT_TRACKED` |
| `exposure` | Clipped pixels in the subject box; subject vs background luminance | < 5% clipped | 5–15%, or backlit | > 15% (pose) `LOW_LIGHT` |
| `flicker` | FFT of mean frame luminance over 2 s: 100 Hz component at its alias (20 Hz at 60/120 fps, 100 Hz at 240 fps; research 05 §9.6) | < 3% | ≥ 3% | ≥ 3% blocks speed A (`FLICKER`) |
| `blur` | Ball streak length at contact ± 2 frames | ≤ 2 diameters | 2–3 | > 3 (speed A) `MOTION_BLUR` |
| `stability` | Background feature drift within a serve and across the block | ≤ 0.002 frame heights | ≤ 0.01 | > 0.01 (spreads, positions) `CAMERA_MOVED` |
| `level` | Pitch and roll (sensor or court lines) | ≤ 3° / 2° | ≤ 10° corrected, or unknown | > 10° uncorrectable (heights) `CAMERA_TILTED` |
| `people` | Another person overlapping the server's box | no | nearby | tracker lost the server (that serve) `POSE_LOW_QUALITY` |
| `pose` | `trackingQuality` (pose README) | ≥ 0.7 | 0.5–0.7 | < 0.5 (pose metrics) |
| `segmentation` | Serves with release, apex and contact found | ≥ 90% | 70–90% | — |
| `scale` | Gravity scale vs body scale | ≤ 8% apart | 8–15% | > 15% (cm values) `SCALE_INCONSISTENT` |
| `audio` | Audio usable | yes | none (info only) | — |
| `view` | Detected view = declared | yes | — | mismatch (view-specific) `VIEW_MISMATCH` |

- **Session overall:**
  - `good` if every serve passes, ignoring info-level items.
  - `usable` (Fair) if any warning occurs and ≥ 70% of serves are analysable.
  - `poor` (Limited) if a session-level block occurs (`view`, `time-base`, `fps`) or < 50% of serves are analysable.
  - An internal score of 0–100 (100 × product of per-check weights: pass 1, warn 0.9, block 0.5, averaged over serves) ranks sessions and picks the two headline reasons. It is never shown as a number.
- **Validation:** each flag must fire in its synthetic trigger scenario with ≥ 95% sensitivity and ≤ 5% false alarms on S0 (§5.4).

### 3.26 `fatigue-flag` and `load-flag` (session flags, added)

These are described in §4.8. They are listed in `metrics.json` as `kind: 'flag'`.

---

## 4. Part C: statistics rules

### 4.1 Minimum n and provisional labels

| Quantity | n < min | Provisional | Settled |
|---|---|---|---|
| Per-serve values | — | — | always shown with their own interval |
| Centre (mean or median) of a continuous metric | < 5: show the dots only, no summary (`TOO_FEW_SERVES`) | 5–11: "early read" | ≥ 12 |
| Spread (SD) | < 8: hidden | 8–19: "early read", with a chi-square CI | ≥ 20 (research 06 §7.3) |
| Rates | < 10: "7 of 9 in", with no % and no band | 10–29: % with a Wilson band | ≥ 30 |
| Bands (session) | < 5: per-serve bands only | 5–11 | ≥ 12 |
| Trend over sessions | < 2 matched sessions with ≥ 8 included serves each: "Building your baseline (1 of 2 sessions)" (research 09 §3.2) | 2 sessions: comparison only, no trend verdict | ≥ 3 sessions (research 06 §7.3) |
| "Did it work?" | < 8 included serves on either side → `not-comparable` | — | — |

Provisional values carry `provisional: true`. The UI marks them ("early read") and never uses them in headlines or coaching triggers.

### 4.2 Estimators

- **Centre:**
  - Mean for symmetric continuous metrics: `toss-forward`, `contact-height-ratio`, `contact-forward`, `landing-distance`.
  - Median for skew-prone ones: `toss-apex-height`, `toss-drop`, `rhythm-release-to-contact`, `trophy-pause`, `repeatability` deviations.
- **Spread:**
  - The sample SD over all included serves. Real wild tosses are *not* removed, because inconsistency is the signal.
  - A value is excluded as an outlier only if it is > 3.5 robust SD from the median (robust SD = 1.4826·MAD) **and** its confidence is < 0.6.
  - `1.4826·MAD` is stored as `secondary.robustSd` for diagnostics.
- **Noise correction:** `SD = √max(SD_obs² − mean(σ_r²), 0)`. Spreads are compared only after correction, so a 30 fps session is not penalised for its larger timing noise. Observed SD = √(true² + error²) (research 06 §7.2).

### 4.3 Intervals (all 95% unless stated)

- **Wilson score interval for rates** (research 06 [S32]; research 09 §3.4). With `p̂ = k/n` and z = 1.96:
  - `centre = (p̂ + z²/2n) / (1 + z²/n)`;
  - `half = z·√(p̂(1−p̂)/n + z²/4n²) / (1 + z²/n)`.
- **Difference of two rates:** Newcombe's hybrid score interval (method 10), built from the two Wilson intervals `(l₁,u₁)` and `(l₂,u₂)`:
  - `lower = δ − √((p₁−l₁)² + (u₂−p₂)²)`;
  - `upper = δ + √((u₁−p₁)² + (p₂−l₂)²)`.
- **Means:** `mean ± t₀.₉₇₅,n−1 · SD/√n`, widened to `√(SE² + σ_s² + σ_p²)` for absolute display (§1.2).
- **Medians and repeatability:** percentile bootstrap, B = 2,000 resamples of serves. The seed is a hash of the session id, so reruns are identical.
- **SD:** chi-square interval `[s·√((n−1)/χ²₀.₉₇₅), s·√((n−1)/χ²₀.₀₂₅)]` (research 06 [S31]). Use the bootstrap instead when |sample skewness| > 1.
- **Log-SD ratio** (spread comparisons): `ln(SD₂/SD₁)`, with `SE² ≈ 1/(2(n₁−1)) + 1/(2(n₂−1))` (research 06 §7.2, relative SE of an SD).

### 4.4 Matched comparisons

Two samples are **matched** when all of these are equal:
- view and camera side;
- court side;
- serve number;
- intended type ("unknown" matches only "unknown");
- handedness.

Otherwise the comparison is `UNMATCHED` (D7; research 09 §4.1).

**Soft factors** are allowed, but each widens or labels the comparison:
- **fps class** (30 vs ≥ 60): allowed, because noise correction and σ handle it.
- **Subject size** differs by more than 1.5×: allowed, with an info note.
- **Capture quality** `poor` on either side: not comparable.
- **Player height changed:** recompute all cm values from the stored ratios. Never compare cm values across height edits.

Comparisons of absolute values between sessions use `SE_Δ² = SE₁² + SE₂² + 2σ_s²` (§1.2).

### 4.5 "Did it work?" verdict algorithm

**Inputs:**
- the focus metric id (from COACHING's decision);
- the stratum;
- **baseline:** included serves from up to the 3 most recent matched sessions *before* the focus started, capped at 60 serves (most recent first);
- **follow-up:** included serves from matched sessions after the practice record, up to 3 sessions;
- the metric's direction (`higherIsBetter`, `lowerIsBetter` or `targetBand`);
- the SWC (smallest worthwhile change, table below);
- per-serve values with σ_r, and the σ_s of each session.

Verdicts are computed only for metrics whose emitted status is measured or estimated. There are never verdicts on experimental or player-entered speed.

**Goodness transform:** per serve, `g(x)` is:
- `x` for higher-is-better metrics;
- `−x` for lower-is-better metrics;
- `−dist(x, band)` for target-band metrics, where `dist` is 0 inside the band.

Spreads are compared on `−ln SD`. Rates are compared on the rate. Bands are compared on their underlying continuous proxy (θ or φ).

**Effect:** `Δ` = follow-up minus baseline in goodness units (positive = better), with SE:
- means: Welch SE plus `2σ_s²` (§1.2);
- rates: Newcombe;
- spreads: log-SD SE.

**Rules**, evaluated in order. CI95 = Δ ± 1.96·SE; CI80 = Δ ± 1.28·SE.

| Verdict id | Rule | Player-facing words |
|---|---|---|
| `not-comparable` | Either side has < 8 included serves, or the samples are `UNMATCHED`, or either session is `poor` | "Not comparable yet: {reason}" |
| `clearly-better` | CI95 lower > 0 **and** Δ ≥ SWC | "Clearly better" |
| `clearly-worse` | CI95 upper < 0 **and** Δ ≤ −SWC | "Clearly worse" |
| `no-clear-change` | CI95 lies entirely within (−SWC, +SWC) | "About the same" |
| `likely-better` | CI80 lower > 0, or CI95 lower > 0 but Δ < SWC ("small but real") | "Likely better. About {N} more serves to confirm" |
| `likely-worse` | CI80 upper < 0 (mirror) | "Likely worse. About {N} more serves to confirm" |
| `too-early` | Otherwise | "Too early to tell. About {N} more serves would settle it" |

**Wording and display rules:**
- Colour is never the only signal (research 09 §3.3).
- The effect is shown in plain units with its interval, for example "toss spread 14 → 9 cm".
- One *guard* metric is shown beneath: `serve-in-rate` for the stratum, or `toss-height-spread` if the focus is outcome-based. If the guard is `clearly-worse`, add "…but {guard} dropped; worth a look".

**"About N more serves":**
1. Target half-width:
   - if |Δ| ≥ SWC/2, `SE* = |Δ| / 1.96` (to confirm the direction);
   - else `SE* = (SWC − |Δ|) / 1.96` (to confirm "about the same").
2. Adding serves only to the follow-up side: `SE² = V₁/n₁ + V₂/n₂ (+ 2σ_s²)`, so `n₂* = V₂ / (SE*² − V₁/n₁ − 2σ_s²)`.
   - V is the per-serve variance of g: SD² for means, and p(1−p) with the pooled p for rates.
   - For spreads on the log scale, V/n is replaced by 1/(2(n−1)), which gives `n₂* = 1 + 1 / (2·(SE*² − 1/(2(n₁−1))))`.
3. If the denominator ≤ 0 (the baseline alone is too noisy), use equal additions to both sides: `n_eq = (V₁ + V₂) / (SE*² − 2σ_s²)`, and say "about {n_eq − n} more serves on each side".
4. N = ceil(n* − current n), rounded up to a multiple of 5.
   - If N > 150: "more than 150 serves; this difference is too small to confirm by counting. Watch toss spread and contact height instead." Process metrics lead (D7).
   - Worked example [Our inference]: an 8-point serve-in gain at p ≈ 0.55 needs about 300 serves per side, so rates will usually trigger this message. A 10-point gain needs about 190.

**SWC defaults** [Our inference]. These are set near a quarter of the published elite–beginner gap, or near the 60 fps measurement error, whichever is larger. They are to be replaced by test–retest typical error from V2 (research 09 §4.1, Hopkins approach).

| Metric | SWC |
|---|---|
| `toss-apex-height` | 5 cm (0.03 × height) |
| `toss-forward`, `contact-forward` | 5 cm |
| `toss-drop` | 6 cm |
| All spreads (`*-spread`) | 15% (ln ratio 0.16) |
| `contact-height-ratio` | 0.015 (about a quarter of the 0.066 beginner–elite gap, research 03 [S6]) |
| `rhythm-release-to-contact` | 30 ms |
| `trophy-pause` | 80 ms |
| `knee-bend-band` (θ proxy) | 8° |
| `trunk-tilt-band` (φ) | 4° |
| `landing-distance` | 8 cm |
| `repeatability` | 5 points |
| `serve-in-rate` (all variants) | 10 percentage points |
| `double-faults` | 1 per 10 points |

### 4.6 Trend verdict across sessions (Progress tab)

- **Scope:** matched sessions only, ≥ 3 sessions each with ≥ 8 included serves, over the last 8 weeks or the last 6 sessions.
- **Fit:** weighted least squares of session estimates on session order. Weights are 1/SE²; spreads use the log scale.
- **Classification:** the fitted change across the window (slope × span) with its CI is classified by the §4.5 rules and words. "Too early" becomes "Not a clear trend yet".
- **Chart:** the per-session estimate with its interval, a grey personal-range band, and the latest point labelled (research 09 §5).

### 4.7 Outcome-linked contrasts (the D3 signature insight)

Example: "Serves that went in had a toss about 12 cm further forward".
- **Groups:** within a stratum, player-tagged `in` vs `fault` serves, each with ≥ 6 included values.
- **Metrics tested:** a fixed family only: `toss-forward`, `toss-apex-height`, `toss-drop`, `contact-height-ratio`, `contact-forward`, `rhythm-release-to-contact`, `landing-distance`.
- **Surfacing rule:** show an insight only if the **99% CI** (z = 2.58) of the difference excludes 0 **and** |Δ| ≥ SWC. The stricter level controls false alarms across the seven-metric family [Our inference: Bonferroni-style correction].
- **Limit:** at most one contrast per session: the largest |Δ| ÷ SWC.
- **Wording:** association, never cause: "Your serves that went in tended to have…".
- **Context:** single-serve mechanics do not explain misses on their own. Net faults differ mainly in ball projection angle (research 03 [S23]).

### 4.8 Fatigue and load flags

- **`fatigue-flag`** (within a session):
  - Needs ≥ 16 included `contact-height-ratio` values in one stratum.
  - Theil–Sen slope of the ratio on serve order. The predicted drop across the session is `slope × (n − 1)`.
  - Flag when the drop is ≥ 0.025 of height (about 4.4 cm at 1.75 m) **and** the one-sided 90% bootstrap bound of the slope is < 0.
  - Anchor: after a 3-hour match, advanced players' impact height fell about 4 cm, from 2.65 to 2.61 m, and ball speed also dropped (research 03 [S14]; research 05 [S50]).
  - Corroboration raises the confidence from 0.6 to 0.8: `toss-height-spread` in the last third ≥ 1.5 × the first third.
  - Copy: "Your contact point dropped in the last part of the session, which can be a sign of tiring. A shorter block next time?" It is never a health statement.
- **`load-flag`** (across sessions):
  - Uses serve counts from `serve-count`, plus player-entered match serves if logged.
  - Flag when the acute:chronic ratio (last 7 days ÷ weekly mean of the last 28 days) is > 1.5 **and** the last 7 days hold ≥ 100 serves.
  - Anchor: a ratio above 1.5 went with a hazard ratio of about 2.8 for new injury in adult high-performance players; recreational transfer is [Our inference] (research 03 [S43]).
  - Copy points to a gradual ramp. Pain routing belongs to COACHING (D6, D8).

### 4.9 Display precision

| Value type | Rounding |
|---|---|
| Heights and distances | 1 cm per serve; session means 1 cm |
| Ratios | 2 decimals (1.46×) |
| Durations | 10 ms |
| Spreads | 0.5 cm, or 5 ms |
| Rates | Whole per cent |
| Speed | Outward to 5 km/h |
| Index | Integer |
| Bands | Words only |

Never show more precision than half the displayed 95% interval would support. If the interval half-width is ≥ 10 cm, round centimetres to 5.

---

## 5. Part D: validation

### 5.1 Principles

- **Accuracy is a product requirement.** Each metric's status is derived from its validation level (§1.3), not declared.
- **Report coverage alongside accuracy:** the share of serves that produced the metric, and silent failures (errors > 3× threshold). Silent drop-outs flatter accuracy (research 05 §11.3).
- **Freeze thresholds before running:** thresholds are tuned on a *development* seed set, then frozen and run on a disjoint *test* seed set. Real-footage thresholds are frozen before V2 data are collected.

### 5.2 Synthetic truth mapping (`tools/synth`)

| Metric or event | Truth field |
|---|---|
| Serve count | `plans.length` (a swing with a toss) |
| tossRelease, tossApex, contact, landing, recoveryEnd | `times.tossReleaseS`, `tossApexS`, `contactS`, `landingS`, `recoveryEndS` |
| trophy (max loading) | `times.trophyEndS` (lowest pelvis) |
| trophy-pause | `trophyEndS − trophyStartS` (`trophyPauseActualS`) |
| toss-apex-height | `plan.apex[z] / heightM` |
| toss-forward | `plan.apex[x] − plan.frontToeAtRelease[x]` |
| toss-lateral | Lateral apex offset from the front toe, signed to the hitting side |
| toss-drop | `plan.apex[z] − plan.contact[z]`; `contactS − tossApexS` |
| contact-height-ratio | `plan.contact[z] / heightM` |
| contact-forward | `plan.contact[x] − frontToeAtRelease[x]` |
| rhythm | `contactS − tossReleaseS` |
| knee band | Realised front-knee flexion at `trophyEndS` from the truth skeleton (the generator's target is `maxKneeFlexionDeg`) |
| trunk band | Truth mid-hip→mid-shoulder angle at `trophyEndS`, both 3D and projected into the camera plane |
| landing-distance | Landing-foot toe x at `landingS` − `frontToeAtRelease[x]` |
| Spreads | SD of the realised truth values over the same serves |
| repeatability | Ordering by `sdScale` |
| speed | `params.serveSpeedKmh` (launch); `plan.flight` average |
| Quality flags | Scenario tags (fps, flicker, shake, crf and so on) |

Truth heights are ball-centre heights, matching §1.1.

### 5.3 Scenario families (built with the synthetic generator's `Scenario`)

**S0 baseline:**
- side view, chest side, 7 m, camera 1.4 m high, level;
- 1080p60 landscape, bright light, crf 23;
- intermediate right-hander, 1.80 m, foot-back;
- 12 serves (6 deuce, 6 ad), directions T/wide/body;
- audio background −45 dBFS.

Twenty seeds per family cell. Split: development seeds 1–10, test seeds 11–20.

| Family | Variants |
|---|---|
| S1 fps | 30, 60, 120, 240 native; 240 captured and rendered at 30 (`mediaFps: 30`, iOS slow-motion export); variable frame rate with 3% dropped frames |
| S2 view | side back-side; rear 5 m @ 2.5 m (outcomes view); rear low 5 m @ 1.2 m; front45 (negative control) |
| S3 geometry | distance 5, 6, 8, 10 m; camera height 1.2, 1.6, 2.1 m; pitch 5° and 10° (known and unknown); roll 3°; lens k1 distortion |
| S4 light | overcast, dusk, night; night with 100 Hz flicker |
| S5 encoding | crf 18, 28, 33; 720p and 4K; VP9 WebM; portrait orientation |
| S6 player | height 1.55 / 1.95 m; beginner, advanced profiles; left-handed; foot-up; outfits |
| S7 behaviour | dribbles 3 and 6 per serve; a re-toss (caught toss); a shadow swing; a swing and miss; camera shake (small 0.2°, large 1.5°) |
| S8 audio | background −35 and −25 dBFS; no audio |
| S9 variability | `sdScale` 0.25, 0.5, 1, 1.5, 2 (20 serves each, one court side) |
| S10 serve type | flat, slice, kick blocks (strata and apex shifts) |

### 5.4 Validation matrix (metric × family)

Cell codes:
- **=** the S0 threshold holds;
- **×k** the threshold is relaxed by factor k;
- **U:code** must be unavailable with that reason code in 100% of serves;
- **F:code** that flag must fire (≥ 95%);
- **n/a** not tested.

Timing thresholds are in frames of the clip's own fps unless given in ms.

| Metric (S0 threshold) | S1 fps | S2 view | S3 geometry | S4 light | S5 encoding | S6 player | S7 behaviour | S8 audio | S9 / S10 |
|---|---|---|---|---|---|---|---|---|---|
| `serve-count` (P, R ≥ 99%; S0 100%) | = (slow motion included) | = ; front45 = | = | = | crf 33: P, R ≥ 97% | = | dribbles 0 false serves; re-toss ≥ 95% classified; shadow 0 counted; miss = serve + `NO_CONTACT` | = | = |
| `toss-apex-height` (median ≤ 2.5% H, p95 ≤ 5% H) | 30: = ; slow motion = after the gravity fix | rear ×1.2 ; front45 U:VIEW_NOT_SUPPORTED | 5 m, 10 m ×1.5 ; pitch known = ; unknown 5° ×1.5 ; 10° F:CAMERA_TILTED | dusk ×1.25 ; night ×1.5 | crf 33 ×1.5 or U:BALL_NOT_TRACKED ; 720p ×1.5 | = (ratio error independent of height and hand) | = | = | = |
| `toss-forward` (MAE ≤ 5 cm, p95 ≤ 10) | = | rear U:VIEW_NOT_SUPPORTED | 5/10 m ×1.5 | ×1.25 / ×1.5 | ×1.5 | left-handed = (netDir) | shake small ×1.2 | = | S10 strata separate |
| `toss-lateral` (MAE ≤ 5 cm) | = | side U:VIEW_NOT_SUPPORTED; rear = | n/a | ×1.5 | ×1.5 | = | = | = | = |
| `toss-drop` (MAE ≤ 3 cm; time ≤ 6 ms @60) | 30: time ≤ 10 ms ; 240 ≤ 3 ms ; slow motion = | rear = | = | ×1.25 | ×1.5 | = | miss U:NO_CONTACT | none: time ≤ 1 frame (ball-only) | = |
| `toss-height-spread` (≤ max(1.5 cm, 15%)) | 30 ×1.3 | rear = | shake large F:CAMERA_MOVED + U | ×1.3 | ×1.3 | = | = | = | S9 monotonic (ρ = 1) |
| `toss-forward-spread`, `toss-lateral-spread` (≤ max(2 cm, 20%)) | ×1.3 | view-specific U | as above | ×1.3 | ×1.3 | = | = | = | S9 monotonic |
| `contact-height-ratio` (MAE ≤ 0.02, p95 ≤ 0.04) | 30 ×1.5 ; 240 = | rear ×1.3 | 5/10 m ×1.5 | ×1.25 / ×1.5 | ×1.5 | = | miss U:NO_CONTACT | none ×1.2 | = |
| `contact-height-spread` (≤ max(1.2 cm, 15%)) | 30 ×1.5 | rear = | shake large U | ×1.3 | ×1.3 | = | = | = | S9 monotonic |
| `contact-forward` (MAE ≤ 6 cm, p95 ≤ 12) | 30 ×1.3 | rear U | ×1.5 | ×1.5 | ×1.5 | left-handed = | = | = | = |
| `rhythm-release-to-contact` (MAE ≤ 1 frame + 2 ms) | slow motion = ; VFR (3% dropped) = with the frame-gaps warning | rear = | = | = | = | = | = | none = | = |
| `rhythm-spread` (≤ max(10 ms, 20%) @60) | 30: `nearMeasurementLimit` flagged | = | = | = | = | = | = | = | S9 monotonic |
| `trophy-pause` (MAE ≤ 60 ms) | 30 U:FPS_TOO_LOW | rear = | = | ×1.5 | ×1.3 | profiles ρ ≥ 0.8 | = | = | = |
| `knee-bend-band` (≥ 90% agreement, 0 swaps) | 30 = | rear (knee angle) ≥ 85% | height 1.2–2.1 = | night ≥ 80% | = | beginner/advanced = ; foot-up = | = | = | = |
| `trunk-tilt-band` (≥ 85%) | = | rear U:VIEW_NOT_SUPPORTED | pitch unknown 10° ≥ 75% | ≥ 80% | = | = | = | = | = |
| `landing-distance` (MAE ≤ 8 cm, p95 ≤ 15; time ≤ 1 frame) | 30 time ≤ 1 frame | rear U (no calibration) | 5/10 m ×1.5 | ×1.5 | ×1.5 | left-handed = | = | = | = |
| `repeatability` (ρ ≥ 0.9 vs `sdScale`) | 30 ≥ 0.8 | per view | shake large U | ≥ 0.8 | ≥ 0.8 | = | = | = | S9 is the test |
| `speed-experimental` A (coverage ≥ 90%, median error ≤ 5%) | 30/60 U:FPS_TOO_LOW ; 120/240 = ; slow motion (physics time base) coverage ≥ 90% | rear U (method A) | 10 m ×1.3 | night + flicker U:FLICKER | crf 33 coverage ≥ 85% | = | = | n/a | = |
| `speed-experimental` B (coverage ≥ 90%) | slow motion U:AUDIO_UNAVAILABLE | rear = | = | = | = | = | untagged U:NOT_ENTERED | −25 dBFS F:BOUNCE_NOT_HEARD allowed ; none U:AUDIO_UNAVAILABLE | = |
| `capture-quality` flags | 30 F:fps warn ; VFR F:frame-gaps | front45 F:VIEW_MISMATCH | 10° F:level ; shake F:stability | night F:exposure ; flicker F:flicker | 720p at 10 m F:subject-size | = | = | none F:audio (info) | = |

**Time-base test (S1 slow motion):** `gravityTimeScaleCheck` must return a factor within ±10% of 0.125, consistent with the 8× standard, in ≥ 95% of clips with ≥ 3 analysable tosses. All timing metrics must then meet their S0 thresholds × 1.5.

### 5.5 Event-timing matrix (MAE / p95, in frames of the clip's fps)

| Event | 30 fps | 60 fps | 120 fps | 240 fps |
|---|---|---|---|---|
| tossRelease | ≤ 1.0 / 2.0 | ≤ 1.0 / 2.0 | ≤ 1.2 / 2.5 | ≤ 1.5 / 3.0 |
| tossApex | ≤ 0.15 / 0.4 | ≤ 0.25 / 0.5 | ≤ 0.3 / 0.7 | ≤ 0.4 / 1.0 |
| trophy | ≤ 50 ms / 100 ms at every fps |||| 
| contact (audio + ball) | ≤ 0.2 / 0.5 | ≤ 0.25 / 0.5 | ≤ 0.35 / 1.0 | ≤ 0.5 / 1.5 |
| contact (ball only) | ≤ 0.35 / 1.0 | ≤ 0.35 / 1.0 | ≤ 0.4 / 1.0 | ≤ 0.5 / 1.2 |
| contact (wrist only) | ≤ 1.5 / 3.0 | ≤ 1.5 / 3.0 | ≤ 2.5 / 5 | ≤ 4 / 8 |
| landing | ≤ 1.0 / 2.0 | ≤ 1.0 / 2.0 | ≤ 1.5 / 3.0 | ≤ 2.0 / 4.0 |
| recoveryEnd | ≤ 150 ms / 300 ms at every fps |||| 

Coverage targets on S0: release ≥ 95%, apex ≥ 98%, contact ≥ 98%, trophy ≥ 95%, landing ≥ 95%.

### 5.6 Real-footage validation protocol

No real serve footage may be downloaded (founder instruction). Real validation uses footage the team and volunteer players film themselves, with consent, and the in-app annotation mode. It is a documented next step, not a v1 claim.

**In-app annotation mode.** The UI is owned by ARCHITECTURE/DESIGN. It provides:
- frame stepping at native fps;
- marking of the 6 events plus motionStart;
- click points: ball centre at apex and at contact, front toe at release, landing toe, and the floor and head top in a standing frame;
- three-level band labels (knee, trunk);
- outcome and zone tags.

Annotations are stored locally and exported as JSON (D8). **Blinding:** the annotator does not see engine output until the serve is annotated.

**Levels:**
- **V2 (real-annotated)** checks detection and tracking on real images. Annotated points use the same image-scale assumptions as the engine, so V2 cannot validate scale or perspective.
  - Sample: ≥ 8 players (≥ 2 women, ≥ 1 left-hander, spanning UTR 1–7 where possible), ≥ 150 serves per metric, ≥ 3 conditions (sun behind the camera, overcast, night lighting if available), 60 fps plus a 120/240 fps subset.
  - Two independent annotators on ≥ 25% of serves. Inter-rater agreement is reported *before* engine agreement: event MAE in ms, and point agreement in cm.
- **V3 (physical reference)** checks absolute values. The long-term target is research 05's library: 30 players, about 1,500 serves.
  - **Heights:** a 4 m pole with 10 cm marks in the server's plane (research 06 §15.2); a 240 fps second camera.
  - **Forward and lateral positions:** two-view triangulation, with side and rear phones synchronised by the toss apex (research 06 §8.2).
  - **Landing:** chalk marks measured with a tape (research 05 §10 row 22).
  - **Speed:** a radar behind the server, in line with the serve, every serve logged, 200+ serves across speeds (research 05 §11.2).
  - **Bands:** two coaches, blinded, three levels.

**Statistics:**
- **Continuous metrics:**
  - bias and 95% limits of agreement (Bland–Altman), using the variant for repeated measurements per player, because serves are nested in players;
  - regress the difference on the mean to test proportional bias, and use the log (ratio) form if it is present;
  - MAE and ICC(2,1) (absolute agreement, single measure), with 95% CIs;
  - coverage.
- **Bands:** percentage agreement and weighted κ against each coach; Krippendorff's α between coaches (≥ 0.7 target, as in research 03 §Implications 9).
- **Rates and zones:** confusion matrices by distance from the nearest line.
- **Spreads:** test–retest typical error from two blocks in one session. That typical error becomes the SWC basis (§4.5) and σ_r check.
- **Speed:** coverage of the displayed range, MAE %, and LoA %.

**Acceptance** (from research 05 §11.3, unless stated):

| Metric | V2 (real-annotated) | V3 (reference) |
|---|---|---|
| Event timing | MAE ≤ 1 frame | — |
| Toss apex, contact height | MAE ≤ 3% of height vs annotation | MAE ≤ 10 cm; ICC(2,1) ≥ 0.75 [Our inference] |
| Forward positions, landing | MAE ≤ 6 cm vs annotation | MAE ≤ 10 cm [Our inference] |
| Spreads | Test–retest typical error ≤ 25% of the median spread [Our inference] | Within 20% of the triangulated SD |
| Knee and trunk bands | ≥ 80% agreement with coaches | — |
| In/out (rear auto) | — | ≥ 95% for bounces more than 30 cm from lines |
| Zone (rear auto) | — | ≥ 90% |
| Speed | — | MAE ≤ 5%; LoA within ±10%; coverage ≥ 90% |

A metric that passes V2 moves to its V2 ceiling automatically (§1.3). Failing any row keeps or drops the level. The "How accurate is this?" page (research 05 §11.4) is generated from the latest results. It shows bias, LoA, coverage, conditions tested and known failure cases per metric.

### 5.7 Where results live

- Synthetic runs write `validation/synthetic/<date>/<family>/<metric>.json`, with per-serve errors, summary statistics and pass/fail.
- Real runs write to `validation/real/<date>/`.
- CI runs S0–S2 per commit and the full matrix nightly. It updates `validationLevel` in `metrics.json` only through a reviewed change.

---

## 6. Known limitations (state them in "How we measure")

1. **Side view is 2D.**
   - The toss's left–right position is invisible, and it leaks into apparent height and forward position through perspective (about 0.3 cm per cm of lateral offset for the apex at 7 m).
   - The two-view mode removes this.
2. **The body-height estimate dominates absolute heights.**
   - About ±2% (pose README) gives about ±15 cm on toss height and about ±9 cm on contact height at 95% for a 1.75 m player.
   - Within-player comparisons are much sharper, because the persistent part cancels.
3. **Knee bend is inferred from hip drop in the side view.** It is a proxy with a modelled mapping. Bands only, and "unclear" when near a cut point.
4. **Trophy pause and repeatability depend on pose velocities and shapes** whose real-world noise is unknown. They stay experimental until V2.
5. **No real serve footage has been analysed** (pose README; video README). Every status above is capped at V1 until the §5.6 protocol runs.
6. **Speed:**
   - Method A needs ≥ 120 fps and height.
   - Method B's path-length prior is wide.
   - Both are experimental ranges, and the audio method is often suppressed.
   - Spin is never available.
7. **Recreational reference ranges barely exist.** Nearly all published values are elite, junior or high-performance. They are context, not targets (research 03 §1).

---

## 7. Decisions this spec narrows or questions (for the product lead)

1. **D1 distance and height, framing risk.** A level 1x phone at 6 m and 1.4 m sees up to about 3.65 m (26 mm lens) or 3.84 m (24 mm) [Our inference: FOV from research 06 §3.1].
   - Junior and high-performance toss zeniths average 3.40–3.48 m ± 0.24 m (research 03 [S27], [S28]), so a meaningful share of tosses would leave the frame at the near end of D1's range.
   - Research 06 §3.3 computes 7.4–8.8 m for a level phone at 1.2–1.5 m.
   - Recommendation: minimum 7.5 m at ≤ 1.6 m height, or allow ≤ 10° up-tilt with sensor-based correction.
   - The engine still fits bracketed apexes above the frame, but with doubled σ.
2. **D1/D5, knee bend from the side.** Research 03 §9 and research 05 §6.5 place in-plane knee flexion in the rear view. From the chest side the knee bends towards the camera.
   - This spec therefore defines `knee-bend-band` in the side view from **hip drop**, which is view-robust, and names it "Knee bend (hip drop)".
   - If the lead wants a literal knee angle, it needs the rear view.
3. **D2 and the meaning of `measured`.**
   - `types.ts` defines `measured` as a validated method, and the brief says unvalidated metrics are experimental.
   - This spec caps everything except the serve count at `estimated` until real-footage validation (V2) passes. That applies even to toss spread, which research 05 and 09 list as "Measured".
4. **D1 "no calibration beyond height" vs "landing inside the baseline".** Without a baseline reference, landing is measured from the start toe and labelled that way. An optional one-tap baseline mark would restore "inside the baseline".
5. **D4 method B and audio.**
   - From the side view the bounce depth is unknown (path ±15%), so audio speed ranges will often be too wide to show.
   - D8 does not mention audio. Research 06 §11 recommends no audio recording by default because of state listening-device laws.
   - This spec processes audio on the device and keeps only onset timestamps. The lead should confirm that audio is captured at all, and whether the player is told.

---

## 8. Research relied on

- Research 01 (competitors): SwingVision NTRP serve benchmarks [S7].
- Research 03 (biomechanics): phase model [S1]; contact height [S6, S7, S28, S29]; toss [S27, S28, S29, S24, S30]; knee [S3, S7, S9, S31]; trunk [S2, S31, S36]; fatigue [S14]; load [S43]; ace placement [S21]; net faults [S23]; expert 2D reliability [S33].
- Research 04 (coaching): fault library F3, F4, F6, F9, F11, F18.
- Research 05 (computer-vision feasibility): feasibility matrix, speed physics [S33, S35], audio [S40], spin [S43, S44], pose accuracy [S14–S17], validation thresholds §11.
- Research 06 (capture): field of view and distance §3; frame rates §4; toss SDs [S8]; Wilson and SD statistics [S31, S32]; quality checks §14.
- Research 09 (UX): data states §3.3; improvement language §4.2; Hopkins typical error §4.1.
- Engine READMEs: pose, video, ball modules (`app/src/analysis/*/README.md`, `ball/*.ts`).
