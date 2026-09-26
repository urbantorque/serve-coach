# Side-view geometry: what the primary camera can honestly measure

*Gap study, 27 September 2026. It resolves the camera-geometry contradictions under DECISIONS D1 (primary camera), D4 (speed) and D5 (knee, trunk and leg-drive bands). The contradictions sit between research 03 §9, research 05 §3.5 and §6.5–6.7, and research 06 §2.2, §3.3 and §3.7.*

*Labels: [Established] means peer-reviewed data or standard geometry. [Coaching interpretation] means expert practice. [Our inference] means our reasoning or calculation. Every number tagged [Our inference] with a section reference comes from `side-view-geometry-calc.mjs` in this folder. It is seeded, so `node side-view-geometry-calc.mjs [1|1b|2|3|4|4b|5|6]` reproduces each figure. New sources are numbered [G1]–[G22]; sources already in the research files are cited as (research 03 [S12]). Coordinates throughout: x runs along the baseline towards the hitting-arm sideline (the D1 camera side), y runs towards the net, z is up, and the origin is the centre mark.*

---

## 0. Bottom line

1. **The files contradict each other because the body turns about 130° between the trophy position and contact** [G1]. At the trophy position a right-hander's pelvis and chest face the hitting-arm side fence. The D1 camera therefore sees the body from the *front*: tilts in the body's frontal plane (shoulder tilt, side bend, hip drop) lie in the image plane, while knee flexion sits 50–90° out of it. By contact the shoulders have turned 6–25° past square to the net [G1], so the same camera now sees the body from the *side*. Forward lean is then in the image plane, but the shoulder-over-shoulder tilt is 65–84° out of it. The rear camera is the mirror image of this. Research 03 and 05 were right about the knee. Research 06 was right about forward lean at contact, and wrong about knee flexion and "trunk inclination" at the trophy position. [Our inference from [G1], [G7]; §2]
2. **Drop the knee-bend band from the side view.** In simulation, the raw 2D knee angle from D1 reads 17–36° too low on average, and a three-level band (little / moderate / deep) puts 47–80% of serves in the wrong band (§3). A view-independent estimate built from segment heights still gets about 28% wrong on three levels and about 14% wrong on two levels (deep vs not deep), and it cannot detect "little bend". From an elevated rear camera the nearer (back) knee is almost in the image plane, and 11–13% of serves land in the wrong band. [Our inference, §3]
3. **None of the trunk numbers we cite can be compared with a 2D mid-hip to mid-shoulder angle.**
   - The 25 ± 7° figure pools 15 data sets that use different definitions, mostly side bend of the thorax *relative to the pelvis* [G2].
   - The 48° figure comes from an abstract, and we could not retrieve the definition from its methods section [G3].
   - Kovacs' "shoulder-over-shoulder" is a qualitative description of shoulder-line tilt [G4].

   D1 can measure shoulder-line tilt at the trophy position, and it can approximate the trophy side bend as the angle between the shoulder line and the hip line. It cannot measure shoulder-over-shoulder at contact. Its reading of forward lean at contact is also contaminated on the court half nearer the camera. [§4]
4. **Leg drive has good in-plane proxies, and they have published reference values.**
   - Hip rise from the lowest point to contact, as a % of height. In 22 professionals the centre of mass (CoM) rose 15.8 ± 3.4% of body height, and this rise correlated r = 0.87 with impact height [G8].
   - Peak upward hip speed: 2.22 ± 0.27 m/s at the back hip in ITN 3 players [G7].
   - Drive time, being airborne at contact, and contact height.

   Loading depth (how far the hips drop) varies a lot between players and was not related to performance in professionals [G8]. [§5]
5. **D1's short, low corner cannot frame the toss.** Take a level phone 1.2 m high and 6 m from the centre mark, with a right-hander serving on the deuce court. The top of the frame in the ball's plane is then only 3.0–3.3 m above the court. That is below published mean toss peaks (3.40–3.48 m) and below the peaks of 3.4–4.0 m seen in recreational players [G16].

   We adopt the envelope set by the parallel gap study `recreational-reference-ranges.md` §6.1: frame top at least 4.5 m, 4.3 m acceptable with peak extrapolation, 4.7 m as the target. Two ways to reach it:
   - Stand level at the side fence: at least 8.4–8.9 m from the centre mark on a 24 mm lens, or 9.0–9.6 m on a 26 mm lens, at 1.6–1.4 m high.
   - Allow a measured upward tilt that the app removes in software. This brings the minimum distance down to about 6.8 m (24 mm) or 7.3 m (26 mm).

   A pitch error of up to 1° costs at most 1.6 cm on heights measured from the feet. [§6]
6. **Drop the audio flight-time speed path from the side view.** The bounce is 47–68° off the camera axis, while the lens covers only 34–36° either side of it, so the bounce is never in frame. With the bounce depth unknown, simulated error is 10% at the median and 20% at the 90th percentile, even with the player's target tag. When the bounce is located in rear-view video, the error falls to about 3% (median) and 6% (90th percentile). How often a phone can hear bounces 15–25 m away is unknown. Keep audio only to time the contact, process it on the device and discard the raw audio. [§7]

---

## 1. Decision table

"In-plane" means the movement's plane lies within about 20° of the camera's image plane at the moment the metric is taken. D1 is the side view on the hitting-arm side; "rear" is the optional raised outcomes view. Error figures are [Our inference] from the sections cited, and assume our keypoint-noise model (§3.2) until they are validated.

| Metric (moment) | View that measures it in-plane | Expected 2D error | Band feasible? | Recommended wording change |
|---|---|---|---|---|
| Toss peak height and spread | D1 (vertical is always in-plane for a level or rectified camera) | About ±3 cm precision. Absolute bias of +6 to +12 cm when the ball is 0.3 m nearer the camera than the body. A 10 cm serve-to-serve sideways toss spread adds 2–4 cm of false height spread (§6.7) | Yes (value, not band) | D1: replace the fixed 6–8 m / 1.2–1.6 m / level rule with the framing rule in §8 |
| Toss forward placement, contact height (% of height), contact forward position | D1 | Contact height bias +2 to +7 cm for a 0.3 m offset, about ±3 cm serve to serve (§6.7); forward placement ±5–10 cm (research 05 §6.3) | Yes (values) | None |
| Knee flexion at trophy, 2D angle | Rear (back knee within 0–20° of the plane). **Not D1** (50–90° off) | D1: bias −17 to −36°, SD 15–21°. Rear, back knee: bias about 0, SD 5–7°. Rear, front knee: SD 10–15° (partly hidden) (§3) | **D1: no** (47–80% wrong band). **Rear: yes**, experimental (back knee 11–13% wrong) | D5: knee band only when the rear view is recorded |
| Knee flexion, view-independent estimate from segment heights (§3.4) | Any level view (uses vertical extents only) | SD about 11.5°; cannot tell under 20° from 20–45° (57% wrong at a true 10°) | Two levels only ("deep ≥45°: yes/no", 14% wrong), experimental | D5: optional experimental "deep bend" flag in D1; never "little bend" |
| Loading depth: hip drop from ball release to lowest point (% of height) | D1 | About ±1–1.5% of height | Yes, descriptive and player-relative (two levels) | D5: show as description; never coach "bend more" from it alone |
| **Leg drive: hip rise** from lowest point to contact (% of height) | D1 | About ±1.5–2% of height, against a professional CoM rise of 15.8 ± 3.4% | **Yes**: three levels, player-relative first; population thresholds experimental | D5: "leg-drive band = hip rise" |
| Peak upward hip speed | D1 | ±0.15–0.25 m/s at 60 fps (about ±10%); better at 120 fps | Yes, experimental | D5: supporting metric |
| Drive time (lowest hip to contact) | D1 | ±2–3 frames (±35–50 ms at 60 fps) | Player-relative trend only | None |
| Airborne at contact (both feet off the ground) | D1 | Yes/no, reliable | Yes | None |
| **Shoulder tilt at trophy** (front shoulder up) | D1 (shoulder line 16–31° from the plane) | Projection +1 to +4°; keypoint noise ±3–5°; possible upward bias from the raised tossing arm (UNVERIFIED) | **Yes**, player-relative | D5: replaces "trunk tilt" in the side view |
| Trophy side bend: 2D angle between shoulder line and hip line (closest to the pooled 25 ± 7°) | D1 | Projection +1 to +4°; keypoint noise ±5–8° (hip keypoints are noisy) | Experimental only | D5 footnote |
| Trunk long axis vs vertical at trophy | D1 | Close to the absolute side lean away from the net, but ±5–9° contamination from back arch | No: matches no reference and duplicates the shoulder-tilt band | D5: do not show |
| Forward lean at contact | D1, contaminated | On the camera-side court (deuce for a right-hander) a 30–48° shoulder-over-shoulder tilt makes a true 20° lean read 2–8°. The far court is within about 3° | **No** in D1 | D1/D5: remove "trunk tilt at contact" from the side view |
| Shoulder-over-shoulder at contact (Kovacs; probably Fleisig's 48°) | Rear (shoulder line within 6–25° of the plane) | Projection within 1–3°, plus keypoint noise. D1 reads a true 48° as 69–84° | Rear: yes, experimental. **D1: no** | D5 and the D1 second-angle list |
| Speed from audio flight time (contact sound to bounce sound) | Neither view as audio alone. Rear view if the bounce is located in video | D1: median error 10%, 90th percentile 20%, even with a target tag. Rear with the bounce located in video: 3% and 6% | **D1: no**. Rear: experimental range | D4: remove the audio path from the side view (§8) |
| Speed from the ball track just after contact (D1, 120 fps or more) | D1 for the first few frames | The ball leaves the image plane at 2–15°, depending on target, and moves 0.04–0.27 m further from the camera per metre travelled (§7.1) | Experimental range (unchanged) | D4: require a target tag to bound the out-of-plane angle |

---

## 2. Body orientation at the trophy position and at contact

### 2.1 What the literature reports

| Quantity | Value | Source | Tag |
|---|---|---|---|
| Front-foot angle to the baseline at the start (0° = parallel; foot axis from heel to mid-forefoot) | Deuce 39.7 ± 17.6°, ad 31.1 ± 17.4°. 14 elite junior men (6 foot-up, 8 foot-back), 300 Hz Vicon | [G1] | [Established] |
| Upper-torso (shoulder-line) angle to the baseline | Start −60.9 / −69.6°. Maximum turn during preparation −105.6 ± 9.5° (deuce) / −120.5 ± 10.3° (ad), i.e. 16–31° *past* side-on. At impact +24.9 ± 16.5° / +6.2 ± 16.6° past square. Range of motion to impact 130.5 / 126.7° | [G1] | [Established] |
| Front-knee flexion at impact | 29.1 ± 10.3° (deuce), 26.2 ± 10.4° (ad) | [G1] | [Established] |
| Peak trunk–pelvis turn separation | 20.6 ± 11.3° and 19.0 ± 9.1° (two sessions; 13 ITN 3 players) | [G7] | [Established] |
| Feet at maximum knee flexion | 263 ± 138 mm apart in the net direction, 180 ± 82 mm along the baseline | [G7] | [Established] |
| Pelvis orientation at the trophy position | **Not reported** in any study found. The meta-analysis notes pelvis axial rotation was reported in only two studies and not at the trophy position [G2] | — | UNVERIFIED |
| Back-foot angle | **Not reported** in any study found | — | UNVERIFIED |
| Stance as coaches describe it | Front toes towards the net post on the hitting side ("1–2 o'clock"); back foot parallel to the baseline [G20][G21] | [G20][G21] | [Coaching interpretation] |
| Expert rating of knee position at maximum bend from two oblique 2D views (OTSA) | κ = 0.43 (moderate). Views: anterior, 6.1 m from the T at 20°; posterolateral, 4.3 m at 45° | [G15] | [Established] |

Two further points:
- **The coaching cue and the measurement disagree.** From the deuce T area, the right net post lies about 65° from the baseline (atan(11.9/5.6)). The measured front-foot angle is 31–40°, so the front foot points much more towards the side fence than the cue suggests. [Our inference]
- **Pelvis at the trophy position.** The shoulder line turns 106–121° from square, and the thorax leads the pelvis by about 20°. The pelvis is therefore within about ±15° of side-on, facing the hitting-arm side fence. [Our inference from [G1], [G7]]

### 2.2 Geometry: where each camera's image plane sits

- **D1 image plane.** D1 looks along the baseline (the −x direction), so its image plane is the vertical plane that contains the net direction (y–z).
- **Rear image plane.** The rear camera looks towards the net, so its image plane is the vertical plane along the baseline (x–z), tipped by the camera's downward tilt of about 8–18° when it is fence-mounted.
- **Knee flexion plane.** Knee flexion happens in the vertical plane that contains the direction the knee points. If that direction is at azimuth α from the baseline (towards the net), the flexion plane is ψ = 90° − α away from the D1 image plane and ψ = α away from a level rear image plane. [Established geometry]

| Segment at the trophy position | Likely azimuth α from the baseline | ψ from D1 image plane | ψ from rear image plane |
|---|---|---|---|
| Front knee (between pelvis at about 0–15° and front foot at 31–40°) | About 15–40° | 50–75° | 15–40° |
| Back knee (foot about parallel to the baseline) | About 0–20° | 70–90° | 0–20° |
| Hip line and shoulder line | Turned 0–31° past side-on | 0–31° | 59–90° |

[Our inference: the knee azimuths are bounded by [G1] and [G7] but not measured]

**How much a tilted plane shrinks a knee angle.** Suppose the thigh and shank lie in a vertical plane at ψ to the image plane, with inclinations β1 and β2 from vertical (flexion φ = β1 + β2). Under near-orthographic viewing (the camera is 7–9 m from a 0.9 m leg), the image shows

> φ′ = atan(tan β1 · cos ψ) + atan(tan β2 · cos ψ)

For φ = 60° split evenly, φ′ is 53° at ψ = 30°, 44° at 45°, 32° at 60°, 17° at 75° and 0° at 90°. The knee pointing at the camera, the case for D1 at the trophy position, is exactly where the image loses the bend. [Established geometry; values are our calculation]

**At contact the relationship flips.** The shoulder line is at +6° to +25° to the baseline, so it is 65–84° out of the D1 plane and 6–25° out of the rear plane. The chest faces the net, so forward lean lies in the D1 plane. [Our inference from [G1]]

**Why the files disagree.** Research 06 reasoned that the serve's power movements are "forward and upward" and therefore sit in the side view's plane. That holds for vertical displacement and for forward lean at contact. It does not hold at the trophy position, where the body faces the side camera. Research 03 and 05 reasoned about the trophy position ("the body faces the side fence") and got the knee right. Neither file used measured foot or trunk orientation; this study adds it.

---

## 3. Knee: how often a three-level band would be wrong

### 3.1 Published 2D error against viewing angle

| Study | Set-up | Knee result | Reading for the serve |
|---|---|---|---|
| Wade et al. 2023 (research 05 [S14]) | Walking, sagittal view, OpenPose | Bias 1.5 ± 4.1° on the near side, 1.6 ± 6.9° on the far side | Best case, in-plane [Established] |
| Barzyk et al. 2024 (research 05 [S15]) | Countermovement jump, iPhone, 4K60 | Mean absolute error (MAE) 2.1° | Simple flexion, in-plane [Established] |
| Fukushima et al. 2024 (research 05 [S16]) | Athletic and sport movements | Joint MAE about 9–10° | Fast sport movement [Established] |
| Baldinger et al. 2025 [G11] | Lunges seen from four 45° oblique views | Knee RMSE 15.5–29.4°. Mean absolute deviation at peak flexion 8.9–33.3° (mean 19°). Rear-oblique views best. The authors attribute the deviation to perspective, not keypoint detection | 45° off-plane costs 10–30° at deep flexion [Established] |
| Puig-Diví et al. 2019 [G12] | Flat wire figure, Kinovea perspective-grid calibration, 90/75/60/45° | Coordinate errors of a few mm, smallest at 90° | Tests digitising within a *calibrated plane*. **It does not test segments rotated out of that plane**, so it does not show that knee flexion "from the side" is trustworthy (research 06 over-extended it) [Established; reading is Our inference] |

### 3.2 Simulation method

The script `side-view-geometry-calc.mjs`, section 4, draws 20,000 serves per scenario. [Our inference]

**Body model**
- Player 1.75 m tall. Thigh 0.245 × height and shank 0.246 × height (standard anthropometric ratios; primary table not re-checked, UNVERIFIED).
- Front ankle at (0.75, 0, 0.07) m; back ankle 0.18 m further along the baseline and 0.26 m further back [G7].
- True flexion drawn uniformly from 5–85°, with 40–60% of it at the shank.
- Knee azimuth α drawn per leg (scenarios below).
- The whole leg leans 8 ± 6° towards the net (hips pushed forward; assumed).

**Cameras**
- D1: 1080p, 24 mm lens, at (8.0, 0, 1.4) m looking along −x, level.
- Rear: at (0.75, −6.0, 2.8) m aimed at the hip, about 18° down.

**Keypoint noise.** This is the residual error after averaging about 5 frames around peak flexion, per axis, in metres at the player: hip 2.0 cm, knee 1.5 cm, ankle 1.5 cm. It is doubled for the front leg in the rear view, because from behind the back leg partly hides it (Wade's far-side error, research 05 [S14]). One scenario doubles all noise. The in-plane rear-view back knee comes out at SD 5–7°, in line with Wade.

**Estimators**
- **E1:** 2D knee angle in D1.
- **E2:** 2D knee angle in the rear view.
- **E3:** E1 de-projected with an estimated knee direction (true value ±12°, capped at 70° off-plane).
- **E4:** view-independent. It measures the *vertical* extents of the thigh and shank in D1, converted to metres at the ankle's depth. It takes each segment's inclination as acos(vertical extent ÷ segment length), with length known to ±1% from standing frames, and sums the two. This works because a level camera always shows vertical distances in-plane.

**Bands:** little < 20°, moderate 20–45°, deep ≥ 45° (research 05 §6.5).

### 3.3 Results

Share of serves in the wrong band (little ↔ deep confusions in brackets), with mean bias and SD in degrees:

| Scenario (front / back knee azimuth) | D1 raw (E1) front | D1 raw (E1) back | Rear (E2) front | Rear (E2) back | View-independent (E4) |
|---|---|---|---|---|---|
| Base: 25 ± 15° / 10° | 61% (13%); −23 ± 17 | 78% (32%); −33 ± 20 | 26% (1%); −4 ± 12 | 11% (0%); 0 ± 6 | 28% (1%); +2 ± 12 |
| Knee follows front foot (35° [G1]) / 10° | 47% (7%); −17 ± 15 | 77% (31%) | 31% (2%); −7 ± 14 | 12% (0%) | 28% (1%) |
| Coaching cue (45°) / 20° | 33% (2%); −12 ± 11 | 71% (20%) | 39% (4%); −12 ± 15 | 13% (0%) | 27% (1%) |
| Knee follows pelvis (5°) / 0° | 79% (35%); −34 ± 20 | 80% (42%) | 20% (0%) | 11% (0%) | 28% (1%) |
| Base with doubled keypoint noise | 59% (14%) | 75% (30%) | 40% (4%) | 21% (0%) | 36% (3%) |

De-projecting D1 (E3) does not rescue it. It gets 26–56% wrong for the front knee and 40–62% for the back knee, because 1/cos ψ blows up as the knee turns towards the camera.

**Conditional on the true angle** (base scenario). Each cell shows the median estimate, then the 5th–95th percentile range, then the share of serves in the wrong band:

| True flexion | D1 raw, back knee | Rear, back knee | Rear, front knee | View-independent (E4) |
|---|---|---|---|---|
| 10° | 4° [0–11]; 0% | 10° [2–19]; 3% | 10° [1–27]; 16% | 22° [0–44]; 57% |
| 30° | 7° [1–19]; 97% | 30° [20–39]; 5% | 27° [8–45]; 31% | 32° [15–52]; 25% |
| 60° | 13° [1–35]; 99% | 60° [49–69]; 1% | 55° [33–73]; 22% | 58° [41–73]; 11% |

A **two-level band** (deep ≥ 45° vs not) is wrong for 14% of serves with E4 whatever the knee direction. It is wrong for 6–7% from the rear back knee, and for 20–49% from D1 raw. (Script section 4b.)

### 3.4 Knee conclusions

- **D1's raw 2D knee angle is not a usable estimate.** In the D1 view, a deep knee bend usually shows up as little or moderate. This confirms research 03 §9 and research 05 §6.5, and contradicts research 06 §1, §2.2 and §3.7. [Our inference, §3.3]
- **The rear view measures the back knee well.** It is the knee nearer the camera and nearly in-plane. The front knee is partly hidden behind it, which is why research 06 thought the rear view "cannot" show knee flexion. The fix is to measure the nearer knee. [Our inference]
- **E4 is the only honest knee statement from D1, and only as "deep bend: yes/no" (experimental).** Small bends barely change a segment's vertical height (cos 10° = 0.985), so E4 cannot separate "little" from "moderate". The "little knee bend" fault in research 03 §10 therefore needs the rear view. [Our inference]
- **Depth matters less than drive.**
  - The splint study restricted the knees to 10° and cost 15–17% of ball speed (research 03 [S7]).
  - A deeper bend is not in itself the target. Net vertical impulse and the timing of the push predict impact height and racket speed better than peak force (research 03 [S48]).
  - In professionals, loading depth varied widely and was not related to performance [G8].
  - Kovacs coaches the "optimum depth to allow increased vertical back hip displacement", not more depth (research 03 [S51]).

  The lower-body metric the side view *can* measure well, hip rise, is the more coachable one. [Established for the findings; the product reading is Our inference]

---

## 4. Trunk: what the cited numbers actually measure

### 4.1 Definitions

| Reference value | Vector | Plane | Reference axis | Can a D1 2D angle reproduce it? |
|---|---|---|---|---|
| **Fleisig et al. 2003: "trunk tilted 48° above horizontal" at impact**, 20 Olympic players, two 200 Hz cameras, manually digitised 20-point model [G3] (the same data set as research 03 [S3]) | The methods definition could not be retrieved (paywalled). The model's only trunk points are hip and shoulder centres [G17]. So "48° above horizontal" is either (a) the shoulder line's elevation above horizontal, which equals lateral trunk tilt ("shoulder-over-shoulder"), or (b) the trunk long axis 48° above horizontal (42° from vertical) | 3D, against the horizontal plane | Horizontal | **No, under either reading.** (a) At impact the shoulder line is 65–84° out of the D1 plane; D1 reads a true 48° as 69–84° (§4.2). (b) D1 sees only the forward part of a 3D lean, and that part is contaminated (§4.2). The rear view reproduces reading (a) within 1–3° |
| Evidence for reading (a) | "Trunk tilt" leads the proximal-to-distal velocity sequence, which fits the upward tilt of the hitting shoulder [G3]. Kovacs presents the 48° at contact alongside shoulder-over-shoulder [G4]. It is numerically close to Whiteside's professionals at impact, 48 ± 4° (as tabulated in [G2]), and to Reid et al.'s absolute shoulder-line side tilt at impact, 41.7 ± 7.8° flat and 33.4 ± 10.2° kick [G5] | | | |
| Evidence against reading (a) | The meta-analysis files Fleisig's 48° under trunk *flexion* after converting to International Society of Biomechanics (ISB) conventions [G2] | | | **Status: UNRESOLVED.** Do not use 48° as a reference for any 2D angle |
| **Jacquier-Bret & Gorce 2024: "trunk inclination 25.0 ± 7.1°" at the trophy position** (research 03 [S31]) | Pooled from 15 data sets whose authors called it "lateral flexion", "trunk tilt" or "lateral flexion shoulder–pelvis alignment separation angle". Re-expressed in ISB joint-angle convention, i.e. **thorax relative to pelvis** [G2]. The pool includes Reid 2008 (30.5–32.1°), Reid & Giblin (28.3–34.3°), Tubez 2019 "peak trunk–pelvis girdles tilt (frontal)" 14.5–17.6° [G7], Wang (10.4–26.5°) and Whiteside (17–30°). We checked the pooled figure against these entries: the 15 values average 24.95° with an SD of 7.1°, reproducing 25.0 ± 7.1° exactly [Our calculation]. The meta-analysis's Table 3 shows Reid 2008 in the trunk-flexion column, but the pooled value only reproduces if Reid 2008 is included. The trophy position is defined as the racket's first vertical peak, which is close to maximum knee flexion [G2] | Frontal | The pelvis (not vertical) | **Approximately, but not with the mid-hip to mid-shoulder vector.** At the trophy position both the shoulder line and the hip line are within about 0–31° of the D1 plane. So the 2D angle *between* them approximates the frontal separation: a true 20° reads 20.9° (deuce) and 23.7° (ad) before keypoint noise (§4.2). Mid-hip to mid-shoulder against vertical is an *absolute* angle that adds the pelvis's own tilt, and matches no pooled definition |
| **Kovacs & Ellenbecker 2011: "shoulder-over-shoulder"** (research 03 [S1]) | Ground forces create an off-centre angular impulse that raises the hitting side and lowers the other, through right-to-left side bend for right-handers. During loading, "shoulder and pelvis lateral rear tilt" [G4]. Qualitative; the only number given is Fleisig's 48° at contact | Trunk frontal plane | Horizontal (shoulder line) | **At the trophy position, yes:** the shoulder line is 16–31° from the D1 plane, and the D1 2D tilt is within +1 to +4° of 3D. **At contact, no:** use the rear view |
| Reid, Elliott & Alderson 2007: absolute shoulder-line orientation at impact [G5] | Euler-decomposed shoulder alignment: left lateral flexion 41.7 / 33.4°, right rotation 41.6 / 64.4°, forward flexion 56.4 / 67.2° (flat / kick). At maximum knee flexion, lateral flexion shoulder–pelvis separation 31.5 ± 7.3° | 3D (Euler) | Global frame | The lateral component, rear view only. The "forward flexion" component is an Euler angle, not a 2D lean, so it is not comparable |

### 4.2 Projection check

The script, section 5, uses a rigid-trunk model with shoulder-line yaw taken from [G1]. [Our inference]

| Moment and court (right-hander) | True 3D posture | D1 2D reading | Rear 2D reading |
|---|---|---|---|
| Trophy, deuce | Side lean away from the net 30°, no arch | Trunk axis 29.1°; shoulder tilt 30.9° | Trunk 8.8°; shoulder tilt 65.0° (the line looks short, at 0.55 of its length) |
| Trophy, deuce | Same, with 10° back arch or forward lean | Trunk 26.6° / 31.4°; shoulder tilt 30.9° | Trunk 19.4° / −2.3° |
| Trophy, ad | Side lean 30°, arch 0 / ±10° | Trunk 26.4° (21.5–31.0°); shoulder tilt 33.8° | Shoulder tilt 48.7° |
| Trophy, both | Thorax-to-pelvis frontal separation 20° | 20.9° (deuce), 23.7° (ad) | — |
| Contact, deuce | Forward lean 20°, shoulder-over-shoulder 0 / 30 / 48° | Forward lean 18.3° / 7.9° / 1.5° | Shoulder line 0° / 32.5° / 50.8° |
| Contact, ad | Same | 19.9° / 19.6° / 22.8° | 0° / 30.1° / 48.2° |
| Contact, both | Shoulder-over-shoulder 48° | Shoulder line 69° (deuce) / 84° (ad), badly overstated | 50.8° / 48.2° |

### 4.3 Trunk conclusions

- **What D1 can band:** shoulder tilt at the trophy position, as a player-relative band backed by a key frame. It is in-plane, its reference definition is clear (Kovacs' "lateral rear tilt"), and research 05 §6.6 already assigned it to the side view. [Our inference]
- **What D1 can offer experimentally:** the trophy side bend, measured as the shoulder line against the hip line. This is the only D1 angle that corresponds to the pooled 25 ± 7°, and even that pool mixes definitions [G2].
- **What D1 cannot measure:** shoulder-over-shoulder at contact, which belongs to the rear view. It also cannot give forward lean at contact on the court half nearer the camera.
- **No reference value applies.** The side-view "trunk tilt" band must not be compared with 48° or 25°. Research 03 §8 already recommends player-relative bands. [Our inference]

---

## 5. Leg-drive proxies in the D1 plane

With a level or rectified camera, vertical displacement is always in the image plane, so every proxy below is view-independent. [Established geometry]

| Proxy | Engineer's definition | Reference values | Expected D1 error [Our inference] | Band? |
|---|---|---|---|---|
| **Hip rise** (% of height) | (mid-hip height at contact − lowest mid-hip height during loading) ÷ entered height. Mid-hip is the midpoint of the two hip keypoints, so pelvis turn and tilt largely cancel. Scale comes from the entered height and a standing frame | Centre of mass (CoM) rise during the acceleration phase 15.8 ± 3.4% of height; 22 male professionals (ATP 17–565), foot-up, 300 Hz Qualisys; r = 0.87 with impact height; between-player CV 21%, within-player 5.7% [G8]. CoM rise 0.26–0.30 m (15–17.5% of 1.70 m) in 10 Chinese national and provincial women [G9, our calculation from their tables]. The CoM also rises as the arms go up, so hip rise will differ; recreational values are UNVERIFIED | ±1.5–2% of height: keypoint noise of about 2 cm, plus the hip keypoint shifting between flexed and extended postures (UNVERIFIED) | **Yes.** Three levels, player-relative until population thresholds are validated |
| **Loading depth** (% of height) | (mid-hip height at ball release − lowest mid-hip height) ÷ height | CoM drop 5.5 ± 2.3% of height; between-player CV 42%; not correlated with racket speed or impact height [G8]. CoM drop 0.115–0.118 m (6.8–6.9%) [G9, our calculation]. Confounded by heel lift in foot-up servers | About ±1–1.5% of height | Descriptive only |
| **Peak upward hip speed** (m/s) | Vertical velocity of the mid-hip (or back hip) from a local quadratic fit over 7–9 frames | Back hip 2.22 ± 0.27 m/s, front hip 1.57 ± 0.33 m/s; 13 ITN 3 players; test–retest ICC 0.99 and 0.95 [G7]. Peak upward CoM speed 1.7 ± 0.2 m/s, r = 0.79 with impact height [G8]. By impulse–momentum, net vertical impulse per unit mass equals the vertical velocity gained, so take-off speed is the kinematic counterpart of the impulse that predicted impact height (r = 0.77) in research 03 [S48] | ±0.15–0.25 m/s at 60 fps (about ±10%); about half that at 120 fps | Yes, experimental |
| **Drive time** (s) | Contact time − time of lowest mid-hip | Acceleration phase 0.40 ± 0.07 s [G8]. CoM lowest 0.38 ± 0.08 s before impact; leg-drive duration 0.26 ± 0.07 s [G7] | ±35–50 ms at 60 fps, because the lowest point is a flat minimum | Player-relative trend |
| **Airborne at contact** | Both heel and toe keypoints above ground level at the contact frame | Elite servers leave the ground before contact | Reliable | Yes/no |
| **Contact height** (% of height) | Existing D5 metric | 142.6% (beginners) vs 149.2% (elite) (research 03 [S6]); 147.6 ± 2.6% (professionals) [G8] | ±3–7 cm (§6.7) | Values (existing) |
| Head rise | Like hip rise, using the head top | No tennis reference found | Confounded by trunk lean and head tilt | No: secondary cue |

The coaching reading of these proxies:
- Kovacs' "vertical back-hip displacement" (research 03 [S51]) is the hip rise and upward hip speed above, measured on the back hip. At the trophy position the pelvis faces D1, so both hips are visible. [Coaching interpretation → Our inference]
- Intuitive Tennis' "passive leg drive" (research 03 [S54]; content UNVERIFIED) argues against forcing a jump. A drive band should therefore describe rise and timing, not demand a bigger jump. [Coaching interpretation]

---

## 6. Framing: distance, height, lens, court side and tilt

### 6.1 The vertical envelope

| Evidence | Toss peak (zenith) | Source |
|---|---|---|
| High-performance men (UTR about 10.7) | 3.48 ± 0.24 m | research 03 [S27] |
| National junior men | 3.40 ± 0.24 m | research 03 [S28] |
| Competitive women (8 players) | Per-player means 3.17–3.81 m | [G16] |
| Recreational women (2 players; 200 Hz side view) | Per-player means 3.39–4.00 m; the highest (4.00 m) was on serves into the net | [G16] |
| Recreational men | No data found | UNVERIFIED |

Contact is at 142–150% of standing height (research 03 [S6]; [G8]), so about 2.8–2.9 m for a 1.95 m player.

**Rules.** The envelope itself is set by the parallel gap study `recreational-reference-ranges.md`:
- **Frame top:** at least **4.5 m** in the server's plane, **4.3 m** acceptable, **4.7 m** target (its §6.1, using design cases for tall, high-tossing players).
- **Peak above the frame:** estimate it by fitting a parabola with known gravity, labelled `estimated` (its §6.4).

This study adds the geometry that the envelope has to survive [Our inference]:
- The toss plane is about 0.3 m nearer the camera than the body.
- The server stands up to 1.0 m nearer the camera on the camera-side court, and 2–3 m nearer when serving from a doubles position.
- At least 0.1 m of ground must show below the feet.
- Tilt must be corrected.

Earlier drafts of this file used 4.2 m / 3.6 m; they were aligned to the 4.3 / 4.5 / 4.7 m envelope on 27 Sep 2026.

### 6.2 Formulas

These use research 06 §3.3, adapted so distances are measured from the centre mark and account for the court side. [Established geometry]

- vFOV = 2·atan(H169 / 2f). The 35 mm-equivalent focal length f is defined on the 43.27 mm diagonal of the 4:3 frame, so full-width 16:9 video has H169 = 19.47 mm. That gives vFOV = 44.2° (24 mm), 41.1° (26 mm) and 73.7° (13 mm); horizontal FOV is 71.6°, 67.3° and 106.2°. The app must read `videoFieldOfView` at runtime, because stabilisation and some formats crop the frame (research 06 §3.1).
- Ball-plane distance on the camera-side court: D_b = D_c − x_s − t_x.
  - D_c is the camera's distance from the centre mark.
  - x_s is the server's offset from the centre mark, 0.5–1.0 m towards the camera for a right-hander on the deuce court.
  - t_x is the toss and contact offset, about 0.3 m further towards the camera (to the right of the head for a right-hander).
  - On the far court half the server is 0.5–1.0 m beyond the centre mark: D_b = D_c + x_s − t_x.
- Level phone at height h: top = h + D_b·tan(vFOV/2); bottom at the feet = h − (D_b + 0.3)·tan(vFOV/2), which must be ≤ −0.1.
- Tilted phone: the envelope fits only if atan((top − h)/D_b) + atan((h + 0.1)/(D_b + 0.3)) ≤ vFOV. The upward tilt needed is atan((top − h)/D_b) − vFOV/2. **Tilt only moves the frame; it cannot make the frame hold more.**

### 6.3 The D1 short, low corner (camera 6 m from the centre mark, 1.2 m high, level)

| Server offset towards camera | Frame top, 24 mm | Frame top, 26 mm |
|---|---|---|
| 0 m (at the centre mark) | 3.51 m | 3.33 m |
| 0.5 m | 3.31 m | 3.15 m |
| 1.0 m | 3.11 m | 2.96 m |

These figures include the 0.3 m toss offset. With neither the server nor the toss offset it would be 3.63 m and 3.45 m, the figures in the task brief. In every realistic case the corner is below published mean toss peaks. [Our inference, §1 of the script]

### 6.4 Minimum camera distance from the centre mark

Distances are for the camera-side court half (deuce for a right-hander) in singles, worst case with the server 1.0 m and the toss 0.3 m towards the camera. The far court half needs about 1.5 m less. A doubles serving position on the camera-side half needs another 1.5–2 m. Each cell gives the distance for a frame top of 4.3 / 4.5 / 4.7 m.

| Phone height | 24 mm, level | 26 mm, level | 0.5x (13 mm), level |
|---|---|---|---|
| 1.2 m | 8.9 / 9.4 / 9.9 | 9.6 / 10.1 / 10.6 | 5.4 / 5.7 / 6.0 |
| 1.4 m | 8.4 / 8.9 / 9.4 | 9.0 / 9.6 / 10.1 | 5.2 / 5.4 / 5.7 |
| 1.6 m | 8.0 / 8.4 / 8.9 | 8.5 / 9.0 / 9.6 | 4.9 / 5.2 / 5.4 |
| 1.8 m | 7.5 / 8.0 / 8.4 | 8.0 / 8.5 / 9.0 | 4.6 / 4.9 / 5.2 |
| 2.0 m | 7.0 / 7.5 / 8.0 | 7.4 / 8.0 / 8.5 | 4.4 / 4.6 / 4.9 |
| **1.2–1.6 m, best upward tilt** | **6.5–6.6 / 6.7–6.8 / 6.9–7.0 m** (tilt 5–10°) | **7.0 / 7.2–7.3 / 7.4–7.5 m** (tilt 5–9°) | **3.9–4.3 m** (tilt 8–14°) |

[Our inference, script sections 1 and 1b]

**Australian courts.** Tennis Australia's planning guide gives these run-offs [G19] [Established]:
- Club/recreation minimum side run-off: 3.05 m.
- International minimum: 3.66 m (preferred 4.57 m).
- Distance between unfenced courts in a bank: 3.66 m.

A side fence is therefore at least about 8.5 m from the centre line (5.485 + 3.05), and a phone halfway between two unfenced courts is about 7.3 m out. The tilts needed for a 4.5 m top are [Our inference, section 1b]:

| Position | Lens | Tilt needed at 1.2–1.6 m | Maximum before the feet leave the frame |
|---|---|---|---|
| 8.5 m (side fence, club minimum) | 24 mm | 0–2.5° | — |
| 8.5 m | 26 mm | 1.4–4.1° | — |
| 7.3 m (between courts) | 24 mm | 3.7–6.7° | 7–10° |
| 7.3 m | 26 mm | 5.3–8.3° | 5.4–8.9°, so only just feasible; raise the phone or step back |

### 6.5 Recommended placement bands [Our inference]

All positions below are for a 4.5 m frame top.

| Lens | Preferred | Also works | Fallback / avoid |
|---|---|---|---|
| 24 mm main (Pro models) | Side fence, 8.5–9.5 m from the centre mark, 1.4–1.8 m; level, or tilted up to 2.5° | 6.8–8.5 m (e.g. between courts), 1.4–1.8 m, with the measured tilt the app asks for (≤ 5° by default; up to 8° once test 3 in §9 passes) | Under 6.8 m: 0.5x or move back |
| 26 mm main (iPhone 17, 16e, 17e) | Side fence, 8.5–9.6 m, 1.5–1.8 m, tilted up to 4° (level from 9.0 m at 1.6 m) | 7.3–8.5 m with tilt ≤ 5–8° (at 7.3 m, raise the phone to 1.6 m or more) | Under 7.3 m: the 16e and 17e have no ultra-wide (research 06 §3.5), so move back or raise the phone |
| 0.5x (13 mm) | Only when 1x cannot fit: 4.2–5.7 m (at or just outside the doubles sideline), 1.2–1.6 m | — | Absolute heights carry a 10–16 cm bias from the toss offset at these distances; pixels per metre are about half those of 1x at the same distance |

**Pixel density.** At 8.5–9.5 m from the centre mark on 1080p with a 24 mm lens, the player on the camera-side court is 7.5–9 m from the phone. A 1.75 m player is then about 260–310 px tall. On the far court (9–10.5 m from the phone) this falls to about 220–260 px, at or below research 06's 250 px warning. Prefer 4K capture (or crop from 4K) when the phone is at the fence. [Our inference, section 1]

### 6.6 Does a small upward tilt keep height metrics valid? Yes, if it is removed in software

- **Why it works.** The ray from the camera to each point does not depend on how the phone is turned. If the pitch is known, the image can be rectified exactly: apply the rotation homography K·R·K⁻¹ to the keypoints and ball centres, without re-rendering the video. [Established geometry]
- **Sensitivity to pitch error.** Heights are measured from the feet in the same frame, so a pitch error δ largely cancels. δ = 0.5–1° gives 0.3–1.6 cm error on toss-peak height above the feet, and 0.1–0.3 cm on contact height, for cameras 5–7 m away and 1.2–1.5 m high. [Our inference, section 2]
- **Uncorrected tilt is not acceptable.** Treating a tilted frame as level and scaling from the standing player gives errors on the toss peak of −9 cm at 5° and −18 cm at 10°, and on contact of −3 cm and −6 cm. [Our inference, section 2]
- **Implementation.** Read the gravity vector at capture: CoreMotion on native iOS; `DeviceOrientationEvent` in the PWA, which needs a permission prompt on iOS. Store the pitch and roll with the clip, and cross-check them against vertical structures such as net posts, fence posts or the standing player. Compute *all* 2D angles (shoulder tilt, side bend) on rectified keypoints. Cap the tilt at the value that keeps the feet in frame. Phone-sensor pitch accuracy against a spirit level is UNVERIFIED and needs a test.
- **Tilt cap.** Geometry alone allows tilts up to the feet limit (7–10° in §6.4). A tilted frame keystones the body, and pose-model accuracy on keystoned players is untested. Default to ≤ 5°, matching `recreational-reference-ranges.md` §6.3, and raise the cap to 8° only after the synthetic tilt test (§9, test 3) passes. [Our inference]
- **Yaw.** Gravity cannot measure turn to the left or right. Ask the player to point the lens along the baseline, with the baseline running into the centre of the screen, and estimate any residual turn from the baseline's vanishing point. An uncorrected turn of more than about 10° mixes the forward and sideways directions. [Our inference]

### 6.7 Toss offset out of the body plane

The scale plane is the player's body. A ball that is Δx nearer the camera reads (z − h)·Δx/(D − Δx) too high (research 06 §3.7). [Established geometry; values Our inference, section 3]

| Camera height | Distance | Peak (3.4 m) bias for 0.3 m offset | Contact (2.6 m) bias | False peak spread from a 0.10 m sideways toss SD |
|---|---|---|---|---|
| 1.2 m | 6 / 8 m | 11.6 / 8.6 cm | 7.4 / 5.5 cm | 3.7 / 2.8 cm |
| 1.5 m | 6 / 8 m | 10.0 / 7.4 cm | 5.8 / 4.3 cm | 3.2 / 2.4 cm |
| 2.0 m | 6 / 8 m | 7.4 / 5.5 cm | 3.2 / 2.3 cm | 2.4 / 1.8 cm |

Higher and further both help. Elite toss-peak SDs are about 6–7 cm (research 06 §2.1). The false spread is therefore material for consistency claims: the "toss consistency" copy should say it includes a small sideways-toss component unless the rear view is recorded. [Our inference]

### 6.8 Live framing check (implementable now) [Our inference]

Use the headroom check in `recreational-reference-ranges.md` §6.3 item 5: frame top at the player's plane T = (y_feet − y_top) / H_px × stature, with its threshold of at least 4.3–4.6 m depending on stature and sex. This study adds three refinements:
1. **Work on rectified coordinates** whenever the phone is tilted (§6.6).
2. **Toss-offset allowance.** Subtract 0.3·tan(vFOV/2), about 0.12 m, because the toss plane sits nearer the camera than the body (§6.2).
3. **Pixel-density check.** Warn if the standing body is under 250 px tall and suggest 4K. At the fence on the far court half this happens on 1080p.

### 6.9 Metric consequences

- Toss peak absolute: estimated. Toss spread: measured, but inflated by 2–4 cm per 10 cm of sideways toss spread.
- Contact height: bias +2 to +7 cm, serve-to-serve ±3 cm.
- These are in addition to the research 05 §6.3–6.4 figures.

---

## 7. Audio flight-time speed (D4) from the side view

### 7.1 Geometry

From D1 at (7.5, 0, 1.4) m, bounce points in the target box lie well outside the lens's reach [Our inference, section 6]:

| Bounce point | Angle off the camera axis |
|---|---|
| Wide / short corner | 47° |
| Box centre | 58° |
| T corner | 68° |

The lens covers only 35.8° either side of the axis (24 mm) or 33.7° (26 mm).

- **1x lenses.** The bounce is never in frame, so its distance from the phone (14–21 m) and the contact-to-bounce path length cannot be measured.
- **0.5x lens.** It covers 53.1° either side, so the short/wide corner creeps into frame, but only at a grazing angle with the ball 3–4 px wide. It is not usable.
- **Near-contact video path.** For comparison, a serve leaves the D1 image plane at 2° (T), 9° (body) or 15° (wide). The target tag therefore narrows the out-of-plane range the engine assumes (currently 0–25°, `SIDE_VIEW_ANGLES` in `ball/speed.ts`) to about ±4°.

### 7.2 Evidence on detecting bounce sounds

- **Caprioli et al. 2025 [G18]** [Established, pilot]
  - Set-up: GoPro 11, stereo, 48 kHz, 5 m to the side of the player at 1.1 m; fed forehands on clay, so bounces were a few metres from the microphone.
  - Rebounds detected in 86.25% (4 lower-level players) and 70.83% (2 more experienced players) of cases.
  - The authors report that the rebound sound "often" sits below ambient noise, and that a machine-learning classifier was needed to separate it.
  - Racket impacts in rallies were detected close to 100% on hard and clay courts, with adjacent-court noise.
  - Timing agreed with 240 fps video to about 9 ms.
  - Serves and far-court bounces were not studied.
- **Other evidence.**
  - No study was found that measured serve-bounce detection 15–25 m from a phone, or that compared bounce sound on hard, synthetic-grass, grass and clay courts (searched 27 Sep 2026). UNVERIFIED.
  - Environmental-noise work on racket sports characterises tennis by the racket strike (sound power about 95 dB LWAFmax per strike), not the bounce [G22].
- **Our reading** [Our inference]
  - The direct sound from a bounce 18 m away is about 11 dB weaker than from one 5 m away (inverse square). D1 also sits beside the neighbouring court, the noise source Caprioli found most harmful.
  - Sand-filled synthetic grass and clay probably give duller, weaker bounces than acrylic hard courts (UNVERIFIED).
  - Detection rates from D1 are therefore likely to be well below Caprioli's 71–86%.

### 7.3 Error budget when the bounce zone comes from the target tag

Script section 6 simulated 40,000 serves:
- Contact point 0.4–1.0 m from the centre mark, 0–0.6 m inside the court, 2.3–2.8 m high.
- Bounce uniform within the tagged third of the box, 12.9–18.2 m from the baseline.
- Launch speed 90–160 km/h; drag length 36–55 m (engine default).
- Arc 0.5–2% longer than the chord; air 10–38 °C.
- Onset timing SD 1 ms for contact and 5 ms for the bounce.

[Our inference]

| Component | Size | Effect on speed |
|---|---|---|
| Unknown bounce depth: path length 13.1 / 15.8 / 18.3 m for bounces at 12.9 / 15.6 / 18.2 m | ±17% | Dominant |
| Unknown sound delay (bounce distance): correction 27 / 33 / 40 ms for the same depths, on flights of 424–678 ms (160–100 km/h) | ±1–2% | Small |
| Speed of sound, 337–354 m/s over 10–38 °C | about ±1 ms | Negligible |
| Bounce onset timing (5–10 ms SD) | ±1–2% | Small |
| Average-to-launch conversion (drag, spin) | ±2–3% (research 05 §3.1) | Small |

| Scenario | Median error | 90th percentile error | 90% interval |
|---|---|---|---|
| D1, no tag | 10.2% | 19.8% | −17% to +23% |
| **D1, target tag (T / body / wide), depth unknown** | **10.2%** | **19.8%** | **−17% to +23%** |
| D1, tag plus a player-tagged depth half (short / deep) | 5.2% | 10.8% | −10% to +11% |
| Rear view, bounce located in video (±0.3 m in depth), onset SD 5 ms | 2.6% | 6.1% | −6% to +6% |
| Rear view, onset SD 10 ms | 2.8% | 6.7% | −7% to +6% |

The sideways target tag does not help, because path length depends almost entirely on bounce depth. A player-tagged depth half would halve the error, but it rests on what the player saw from 18 m away; it would be `player-entered`, and it adds a tap to every serve. [Our inference]

### 7.4 Recommendation

- **Drop the audio flight-time path from the side view.** A 90% interval of −17% to +23% (for example "105–150 km/h") fails the founder's brief, which says not to generate a precise speed when the footage cannot support one. It also fails D4's intent that a range should be informative. Research 05 §3.5 already says not to ship audio-only speed. [Our inference]
- **Keep a flight-time path only in the rear (outcomes) view.** There the bounce is located by the court homography, so this is research 05's method A. Audio may refine contact and bounce times, with the sound delay corrected from the located bounce. It stays `experimental`, is shown as a rounded range, and is validated against radar.
- **Engine change.** In `app/src/analysis/ball/speed.ts`, `speedFromFlightTime` has no camera-view guard, and its defaults (path 14–19 m, camera-to-bounce 10–28 m) describe the unknown-bounce case. Add a `cameraView` option. Return `unavailable` for `'side'` with the reason "bounce not in view", and require a located bounce for `'rear'`.

### 7.5 Surveillance-device law

State and territory laws that restrict listening devices from recording private conversations without consent are the riskier element in NSW, SA, WA, Tas and the ACT (research 07 §7, which relies on ALRC 2014 and may be outdated). [Regulation, via research 07]

Dropping the bounce path helps. The app no longer needs to keep high-gain audio for about a second after contact from a phone standing beside the neighbouring court, which is where conversations are most likely to be picked up. [Our inference]

What remains:
- Contact onset timing from a loud sound about 7 m away.
- Onset detection on the device's audio buffer.
- Only timestamps kept.
- The audio track stripped from stored clips by default.
- Apple's recording-consent and on-screen indicator requirement (research 07 §7, guideline 2.5.14).

Whether processing sound on the device without storing it counts as "recording" under each Act is not settled. That question belongs in the privacy review, and this note is not legal advice.

---

## 8. Proposed wording for DECISIONS

These drafts are for the product lead; they have not been applied to DECISIONS.md.

**D1 (primary view).**
- Camera on the server's hitting-arm side, on the baseline extension, lens pointing along the baseline at the server (the baseline runs into the centre of the screen). Landscape, 1x lens.
- Placement follows a framing rule rather than a fixed distance: in the server's plane the frame must reach from below the feet to at least 4.5 m. 4.3 m is acceptable, in which case a toss peak above the frame is estimated and labelled; 4.7 m is the target (envelope from `recreational-reference-ranges.md` §6.1).
  - Typical set-up: at the side fence (about 8.5–9.5 m from the centre mark on a court built to Tennis Australia's club minimum), phone 1.4–1.8 m high, level or tilted up by at most a few degrees.
  - Closer positions, down to about 6.8 m (24 mm lenses) or 7.3 m (26 mm lenses), work with a measured upward tilt (5° or less by default). The app reads the tilt from the motion sensors and removes it in software.
  - Serving from a doubles position on the camera-side half needs about 1.5–2 m more distance.
  - The 0.5x lens, where fitted, is a fallback at 4.2–5.7 m, with weaker absolute heights.
  - The live headroom check works out the frame top from the standing player and blocks recording below 4.3 m.
- Why: the side view measures what happens in the vertical plane along the serve direction:
  - toss height and forward placement, and the drop from peak to contact;
  - contact height and forward position;
  - rhythm;
  - leg drive (hip rise and drive time);
  - landing distance;
  - shoulder tilt at the trophy position.

  It does *not* measure knee bend (the knees point at the camera at the trophy position) or shoulder-over-shoulder tilt at contact (the shoulder line points at the camera).
- Second angle (optional): additionally unlocks a knee-bend band (the knee nearer the camera, in profile), shoulder-over-shoulder at contact, and experimental speed from flight time to a located bounce.

**D4 (speed).** Speed stays `unavailable` by default.
- An `experimental` range is shown only when all of these hold: side view, 120 fps or more, clean ball detections after contact, height scale known, and a target tag (T / body / wide) that bounds the ball's angle out of the image plane.
- In the outcomes (rear) view, a second experimental path uses average speed from the flight time between contact and the bounce located in video, with the sound delay corrected from that location.
- The side view never uses audio flight time. The bounce is out of frame and its distance is unknown, which gives about ±20% error.
- Audio is used only to time contact. It is processed on the device into timestamps, and raw audio is not kept.
- Always name the quantity (peak vs average), round it and show a range.

**D5 (hero metrics).**
- Toss consistency is the lead metric.
- Next: contact height (as a ratio of height), rhythm, landing distance, and leg drive (hip rise from the lowest point to contact as % of height, with drive time).
- Shoulder tilt at the trophy position appears as a player-relative band (low / typical / high) backed by a key frame.
- Knee bend appears only when the outcomes (rear) view is recorded, measured on the knee nearer the camera. The side view shows loading depth (hip drop) as a description, never as a "bend more" instruction, plus an optional experimental "deep bend: yes/no".
- Shoulder-over-shoulder at contact is a rear-view band.
- No band is compared with the published 48° or 25° trunk values, whose definitions differ from any 2D angle.
- Never show precise distal joint angles, racket drop, external rotation, pronation or racket-head speed.

---

## 9. Tests to add (synthetic generator, unit tests, annotation mode)

1. **Knee projection.**
   - Setup: use `tools/synth` to render a posed skeleton at knee azimuths of 0–60° and flexion of 5–85°, from D1 at 7–9 m and from a rear camera at 2.5–3 m.
   - Pass: E1, E2 and E4 bias and band error match §3.3 within ±5 points. E4 two-level error ≤ 15%. Rear back knee three-level error ≤ 15%.
   - Failure case to keep: a D1 clip with knees pointing at the camera must *not* produce a knee band.
2. **Framing rule.**
   - Setup: unit-test the §6.2 formulas against rendered frames for each lens, height and distance in §6.4.
   - Pass: the §6.8 live check reproduces the frame top within ±5 cm from a standing frame.
3. **Tilt rectification.** Render at pitches of 0, 5 and 10° with a known gravity vector, perturbed by ±1°. Pass: heights above the feet are within 2 cm, and shoulder-tilt angles are within 1° of the level render.
4. **Trunk projections.** Render the §4.2 postures. Pass: D1 shoulder tilt at the trophy position is within ±4° of 3D, and D1 refuses shoulder-over-shoulder at contact.
5. **Leg drive.** Render hip trajectories with a known rise (8–20% of height) and peak speed (1.2–2.4 m/s), with keypoint noise added at 60 and 120 fps. Pass: hip rise is within ±2% of height, and peak speed is within ±0.25 m/s at 60 fps.
6. **Speed guard.** `speedFromFlightTime` returns `unavailable` for `cameraView: 'side'`.
7. **Real-footage next steps** (not done here: downloading footage was not allowed).
   - Players: 10 across UTR 1–7.
   - Cameras: D1 plus rear plus a 240 fps reference camera, with a radar.
   - Knee and trunk reference: two synchronised phones triangulated, or IMUs.
   - Audio: bounce recordings at 15–25 m on hard, synthetic-grass, grass and clay courts, with and without play on the adjacent court, to measure detection rate against 240 fps video.

---

## 10. Corrections made to research files

- **Research 03 §9.** The side-view definition (4–6 m, 1.0–1.2 m) cannot frame the toss, and the "Acceleration and contact" row assigned trunk tilt at contact to the side view. The fix note points here; see that file's verification log.
- **Research 03 §4 and §6 reference values.** Added notes defining the pooled 25 ± 7.1° (side bend relative to the pelvis, heterogeneous) and saying the 48° definition is unresolved.
- **Research 05 §6.5.** Confirmed and quantified the rear-view knee assignment.
- **Research 05 §6.6.** Added the contamination of forward lean on the camera-side court and the rear-only status of shoulder-over-shoulder at contact.
- **Research 05 §3.5.** Added that the bounce is outside the side-view frame, and the simulated error budget.
- **Research 03 implications 2–3.** The side-view trunk band becomes shoulder tilt at the trophy position; leg drive (hip rise) is added to the side view.
- **Research 06 summary item 1, §1, §2.1, §2.2, §2.3, §3.7 and §8.1.** Corrected the claims that the side view measures knee flexion and trunk inclination well and that the rear view cannot. Added the Puig-Diví caveat.

Each edit is marked "Correction (gap study, 27 Sep 2026)" in place and logged in the file's verification log.

---

## 11. Open questions

1. **Knee direction at the trophy position.** Front-knee and back-knee azimuths, and pelvis yaw, at maximum knee flexion in recreational players. No study reports them; they decide how badly D1 foreshortens (§3.3 sensitivity).
2. **Fleisig et al. 2003's trunk-tilt definition.** It needs the full text; a library copy would settle §4.1.
3. **Whiteside et al. 2013's definitions** of "trunk inclination" and the absolute "tilt" [G10]. They were paywalled and are known only through the meta-analysis tables.
4. **Recreational toss peaks for men**, and a population distribution. Only 2 recreational women were found [G16].
5. **Recreational hip rise and upward hip speed**, and how mid-hip rise relates to CoM rise.
6. **Serve-bounce audio at 15–25 m, by surface**, and the adjacent-court false-alarm rate.
7. **Phone pitch accuracy** (CoreMotion and `DeviceOrientationEvent`) against a spirit level, including camera-to-sensor misalignment.

---

## Sources

- [G1] Fett J, Oberschelp N, Vuong JL, Wiewelhove T, Ferrauti A. Kinematic characteristics of the tennis serve from the ad and deuce court service positions in elite junior players. *PLoS One* 16(7):e0252650, 2021. https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0252650 (full text; global frame, foot axis and upper-torso definitions read) — accessed 2026-09-27
- [G2] Jacquier-Bret J, Gorce P. Kinematics characteristics of key point of interest during tennis serve among tennis players: a systematic review and meta-analysis. *Frontiers in Sports and Active Living* 6:1432030, 2024. Full text via Europe PMC XML (PMC11260724); Tables 3–5 parsed cell by cell. https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1432030/full — accessed 2026-09-27
- [G3] Fleisig G, Nicholls R, Elliott B, Escamilla R. Kinematics used by world class tennis players to produce high-velocity serves. *Sports Biomechanics* 2(1):51–64, 2003. Abstract via Europe PMC (PMID 14658245); full text not accessible (academia.edu returned 403; the publisher is paywalled). https://doi.org/10.1080/14763140308522807 — accessed 2026-09-27
- [G4] Kovacs M, Ellenbecker T. An 8-stage model for evaluating the tennis serve. *Sports Health* 3(6):504–513, 2011. Full text via Europe PMC (PMC3445225). https://pmc.ncbi.nlm.nih.gov/articles/PMC3445225/ — accessed 2026-09-27
- [G5] Reid M, Elliott B, Alderson J. Shoulder joint loading in the high performance flat and kick tennis serves. *British Journal of Sports Medicine* 41:884–889, 2007. https://pmc.ncbi.nlm.nih.gov/articles/PMC2658985/ (values via page extraction) — accessed 2026-09-27
- [G6] Reid M, Elliott B, Alderson J. Lower-limb coordination and shoulder joint mechanics in the tennis serve. *Medicine & Science in Sports & Exercise* 40(2):308–315, 2008. Abstract via Europe PMC (PMID 18202570) — accessed 2026-09-27
- [G7] Tubez F, Forthomme B, Croisier JL, Brüls O, Denoël V, Paulus J, Schwartz C. Inter-session reliability of the tennis serve and influence of the laboratory context. *Journal of Human Kinetics* 66:57–67, 2019. Full text via Europe PMC (PMC6458585). https://doi.org/10.2478/hukin-2018-0064 — accessed 2026-09-27
- [G8] Deghaies K, Lussiana T, Touzard P, Fourel L, Ozan S, Brechbuhl C, Gindre C, Bideau B, Martin C. Tennis serve constraints delimit but do not prohibit individual movement strategies among professional players. *Journal of Human Kinetics* 102:45–55, 2026. Full text via Europe PMC (PMC13215218). https://doi.org/10.5114/jhk/203795 — accessed 2026-09-27
- [G9] Chen Y, Wang T, Zhao Y, Zhan G, Tang Y, Wang Z. Kinematic differences between female national and provincial athletes in the tennis serve. *PeerJ* 12:e18410, 2024. 10 right-handed women (5 national, 5 provincial; 1.70 m; foot-up), two 1,000 fps cameras (one behind the baseline, one 8 m to the side, both 1.5 m high). Full text via Europe PMC (PMC11531263). https://doi.org/10.7717/peerj.18410 — accessed 2026-09-27
- [G10] Whiteside D, Elliott B, Lay B, Reid M. The effect of age on discrete kinematics of the elite female tennis serve. *Journal of Applied Biomechanics* 29(5):573–582, 2013. Abstract via Europe PMC (PMID 23270869); the publisher PDF returned 403, so values come via [G2] — accessed 2026-09-27
- [G11] Baldinger M, Reimer LM, Senner V. Influence of the camera viewing angle on OpenPose validity in motion analysis. *Sensors* 25(3):799, 2025. Full text via Europe PMC (PMC11819822) — accessed 2026-09-27 (research 05 [S17])
- [G12] Puig-Diví A et al. Validity and reliability of the Kinovea program in obtaining angles and distances using coordinates in 4 perspectives. *PLoS One* 14(6):e0216448, 2019. Full text via Europe PMC (PMC6550386) — accessed 2026-09-27 (research 06 [S6])
- [G13] Wade L et al. Examination of 2D frontal and sagittal markerless motion capture. *PLoS One*, 2023 — cited as research 05 [S14]
- [G14] Fukushima T et al. The potential of human pose estimation for motion capture in sports. *Sports Engineering* 27, 2024 — cited as research 05 [S16]
- [G15] Myers NL et al. Reliability and validity of a biomechanically based analysis method for the tennis serve. *International Journal of Sports Physical Therapy*, 2017. https://pmc.ncbi.nlm.nih.gov/articles/PMC5455193/ — accessed 2026-09-27 (research 06 [S4]; the knee-item κ was added here)
- [G16] Carboch J, Hrychová D. Kinematic analysis of the serve toss and its impact on serve outcome in competitive and recreational tennis players: a case study. *International Journal of Physical Education, Fitness and Sports* 14(1):45–51, 2025. DOI 10.54392/ijpefs2515. https://ijpefs.org/index.php/ijpefs/article/view/619 (PDF text extracted; Tables 1–2 read) — accessed 2026-09-27
- [G17] Elliott B, Fleisig G, Nicholls R, Escamilla R. Technique effects on upper limb loading in the tennis serve. *Journal of Science and Medicine in Sport* 6(1):76–87, 2003. http://biomechanics.stanford.edu/me337/projects/elliot03.pdf (methods read: the same Sydney 2000 data, 20-point model, knee flexion as a relative thigh–shank angle) — accessed 2026-09-27 (research 03 [S3])
- [G18] Caprioli L et al. Tennis timing assessment by a machine learning-based acoustic detection system: a pilot study. *Journal of Functional Morphology and Kinesiology* 10(1):47, 2025. Full text via Europe PMC (PMC11843912) — accessed 2026-09-27 (research 05 [S40])
- [G19] Tennis Australia. *Tennis Infrastructure Planning: Planning, Design & Delivery Resource*, 2018, Table 3.1.1 "Court dimensions and runoffs". https://www.tennis.com.au/wp-content/uploads/2013/04/TA-National-Tennis-Facility-Planning-and-Development-Guide.pdf — accessed 2026-09-27 (research 02 [S41])
- [G20] Crim J. Tennis serve stance (platform and pinpoint). TennisCompanion, undated. https://tenniscompanion.org/tennis-serve-stance/ — accessed 2026-09-27
- [G21] Tomaz (Mencinger T). Tennis serve technique: 7 steps to correct serve. Feel Tennis, undated. https://www.feeltennis.net/serve-technique/ — accessed 2026-09-27
- [G22] Geltinger A. Racket sports and environmental noise: assessing and predicting impulsive noise from tennis, padel and pickleball. *Noise News International*, 23 March 2026. https://noisenewsinternational.net/racket-sports-and-environmental-noise-assessing-and-predicting-impulsive-noise-from-tennis-padel-and-pickleball/ — accessed 2026-09-27

Internal: `app/src/analysis/ball/speed.ts` (flight-time and track speed; `SIDE_VIEW_ANGLES`), `app/src/analysis/pose/body.ts` (`trunkInclinationDeg`, `ANTHROPOMETRY`), `docs/research/gaps/side-view-geometry-calc.mjs` (all [Our inference] figures), and `docs/research/gaps/recreational-reference-ranges.md` §6 (recreational toss envelope, headroom check, apex fallback; parallel gap study whose envelope this file adopts).
