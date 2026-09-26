# 06 — Capture protocol: filming your own serve at a local court

**Scope:** camera position, distance, lens, frame rate, light, court visibility, number of serves, the optional second angle, mounting, phone heat and storage, and filming etiquette at Australian public courts. Ends with a step-by-step in-app recording guide, a pre-recording checklist and automatic quality checks.
**Prepared:** 27 September 2026. Device facts reflect the iPhone 17 and 18 generation. The iPhone 18 Pro and an "iPhone Duo" appear on Apple's current pages, but I have not reviewed the full specifications for every current model.
**Evidence labels:** [Established] = peer-reviewed or strong consensus. [Coaching interpretation] = expert practice, not directly proven. [Vendor claim]. [Market data]. [Regulation]. [Our inference] = our reasoning or calculation (calculations are reproducible from the formulas given).

---

## Summary of recommendations

1. **Primary single angle: side-on view from the baseline extension.** The phone stands outside the doubles sideline, level with the baseline, facing the server's chest side. That means the camera is on the server's right for a right-hander and on the left for a left-hander. Use the 1x main lens in landscape with the phone level, at 1.5–2.1 m high and 6–9 m from the server (at least 7.5 m if the phone is at 1.5 m). This view captures the most coachable and measurable features for UTR 1–7: toss height and forward placement, contact height, knee flexion and leg drive, trunk inclination, rhythm, and landing distance. [Our inference, grounded in S3, S4, S6] *Correction (gap study, 27 Sep 2026):* replace "knee flexion … trunk inclination" with "leg drive (hip rise) and shoulder tilt at the trophy position". Knee flexion is foreshortened from this view, and needs the rear view (`gaps/side-view-geometry-contradictions.md`).
2. **Second angle, optional: rear view from behind the server, mounted on the back fence at 2.5–3.3 m.** It adds lateral toss position, shoulder tilt and swing path. It also adds estimated serve-in, direction and placement, and together with the side view it gives 3D toss position. [Our inference; S1, S2]
3. **Default capture: 1080p at 60 fps, custom exposure, stabilisation off, lens locked, HDR off.** Offer 1080p at 120 fps as a "high-speed" option. At night on Australia's 50 Hz grid, prefer 50 or 100 fps where the device supports it, or accept a 1/100 s exposure. [Our inference; S13, S14, S19–S21, S35, S36]
4. **Put the sun behind the camera.** Never film into the sun. [Vendor claim, S1]
5. **Serve counts:** at least 20 serves per stratum (for example, deuce-court first serves) before showing toss-consistency statistics. Serve-in rate needs pooling across sessions: 30 serves gives a 95% interval of about ±18 percentage points. [Our inference; S31, S32]
6. **Capture only the serve clips, dim the screen, shade the phone and watch its thermal state.** iPhones are rated for 0–35 °C ambient [Vendor claim (manufacturer specification); S10, S24], and Perth Airport averages 28.7 days a year at or above 35 °C [Established (Bureau of Meteorology statistics); S39].
7. **Record audio off by default** or use it only on-device for timing, keep bystanders out of frame or blur them, and follow child-safeguarding rules for anyone under 18. [Regulation; S41, S43, S44]

---

## 1. What the capture must support

The capture requirements follow from the metrics the product intends to report. This table links each metric to the view, frame rate and calibration it needs. Metric definitions belong to other workstreams; this only states the capture prerequisites.

| Metric or observation | Best view | Minimum fps (preferred) | Calibration needed | Notes |
|---|---|---|---|---|
| Toss apex height; toss-to-contact drop | Side (or rear) | 30 (60) | Scale in the server's plane | The ball is nearly stationary at the apex, so a parabola fit gives a sub-frame apex. [Our inference] |
| Toss forward/back placement vs front foot or baseline | Side | 30 (60) | Ground plane (court lines) | Not visible from the rear. |
| Toss lateral placement | Rear | 30 (60) | Ground plane | Not visible from the side. |
| Toss consistency (SD of the above) | Side and/or rear | 60 | As above | Needs ≥20 serves (section 7). |
| Contact height and reach | Side | 60 (120) | Scale | At 60 fps the contact frame is uncertain by ±8 ms. |
| Phase timing (release, trophy, racket drop, contact, landing) | Side | 60 (120) | None | Durations of 100–500 ms are well resolved at 60 fps. |
| Knee flexion, trunk inclination | Side | 60 | None (angles), but the view must be orthogonal | Accuracy drops with oblique views. [Established, S6] **Correction (gap study, 27 Sep 2026):** at the trophy position the knees point 50–90° towards the side camera, so knee flexion is best from the rear, on the knee nearer the camera. The side view measures leg drive as hip rise (vertical, so always in-plane), shoulder tilt at the trophy position, and forward lean at contact on the far court half only. See `gaps/side-view-geometry-contradictions.md` |
| Shoulder tilt, lateral trunk lean | Rear | 60 | None | *Correction (27 Sep 2026):* rear at **contact** (shoulder-over-shoulder). At the trophy position the shoulder line faces the side camera, so shoulder tilt there is a side-view metric |
| Landing distance inside baseline | Side (or elevated rear) | 30 | Ground plane | |
| Serve in or out, placement zone | Rear, elevated | 60 | Far service-box homography | Estimate only; single-angle side view relies on player entry. |
| Ball speed | Side with a wide lens, or rear | 120–240 | Full court calibration | Out of scope here; see the speed workstream. Experimental. |

---

## 2. Camera views used by coaches and biomechanists

### 2.1 Evidence base

- **Expert qualitative rating from 2D video is reliable.** Wood, Reid, Elliott, Alderson and Mian (UWA and Tennis Australia) had two expert coaches rate serves from 300 players, split into 150 male and 150 female across three age groups. They used 2D video from two camera viewing angles, with 13 variables on a 1–7 scale and 7,800 ratings. Agreement (Krippendorff's alpha) was 0.727–0.924 for overall serve score, 0.744–0.944 for rhythm, 0.775–1.000 for trunk action and 0.731–0.959 for leg drive. Shoulder internal-rotation speed was the weakest variable at 0.688–0.717. [Established, S3] Caveats (fact-check): the abstract does not name the two views, so "sagittal and rear-coronal" is UNVERIFIED (full text not accessible). Reliability is reported for ratings made with both views available, not per view, and the title describes the serves as elite, not recreational. That a single side view alone would be as reliable for UTR 1–7 players is [Our inference].
- **A validated clinical checklist uses two 2D views.** The Observational Tennis Serve Analysis (OTSA) filmed an anterior view 20 ft (6.1 m) from the baseline "T" at 20°, and a posterolateral view 14 ft (4.3 m) away at 45°. It used 3 first serves per player (28 professional women players for reliability, 33 recreational or college players for validity), assessed at maximal knee flexion. The composite-score ICC was 0.90, and 89% of checklist items showed moderate to almost-perfect agreement (kappa 0.36–1.0). [Established, S4]
- **A 2025 French study used a similar two-camera coaching set-up.** Guillot and colleagues placed one camera 2 m behind the server at 1.5 m height on the centre line, for the toss, posture and follow-through. A second camera sat 3 m to the side at 1.2 m height, for racket path, contact timing and weight transfer. [S5: peer-reviewed pilot study (18 young players), accepted 14 November 2025. The camera set-up is a methods detail of a motor-imagery study and was not itself validated, so treat it as Coaching interpretation of good practice, not Established evidence for these positions.]
- **Orthogonal views measure best.** Puig-Diví and colleagues (2019) tested Kinovea measurements at 5 m distance and 0.68 m height, from perspectives of 90°, 75°, 60° and 45°. The error of estimate was smallest at 90° and grew as the view became more oblique. [Established, S6] *Caveat (gap study, 27 Sep 2026):* the test used a flat wire figure with Kinovea's perspective-grid calibration, so every measured point lay in the calibrated plane. It does not test body segments rotated out of that plane, such as a knee pointing at the camera. For those, the 45°-view study in research 05 [S17] found knee errors of 15–29° RMSE.
- **Phase framework.** Kovacs and Ellenbecker's 8-stage model groups the serve into preparation (start, release, loading, cocking), acceleration (acceleration, contact) and follow-through (deceleration, finish). It gives observable checkpoints such as front-knee flexion above 15° during loading. [S7: the 8-stage model is a published framework in a peer-reviewed narrative review; the >15° knee-flexion figure is the authors' recommendation, so it is Coaching interpretation rather than an Established threshold.] The model does not prescribe camera views.
- **Laboratory ground truth is 3D motion capture at 200–500 Hz.** Tennis Australia's toss-variability work used a 22-camera, 500 Hz Vicon system. [S8] A 2025 junior toss study used Qualisys at 200 Hz. [S9] Phone video will not match this. The product should use these studies as reference values, not as accuracy targets. [Our inference]

### 2.2 View comparison for a solo player

| View | What it shows reliably | What it cannot show | Solo practicality |
|---|---|---|---|
| **Side, chest side** (baseline extension, outside the doubles alley) | Toss height and forward placement, contact height and position in front of the baseline, knee flexion, trunk inclination, leg drive (hip and head rise), landing, rhythm, toss-arm release | Lateral toss drift, shoulder tilt, serve direction or outcome; racket drop partly hidden behind head and back | High. Out of the ball's path; fence or tripod both work. |
| Side, back side | Racket drop behind the back, trunk rotation, landing | Toss release is often hidden by the torso; same blind spots as above | High |
| **Rear, elevated** (back fence, 2.5–3.3 m) | Lateral toss, shoulder and pelvis tilt, swing path, direction; in or out and placement if the far box is visible; landing via ground homography | Knee flexion, trunk inclination and forward toss placement (these movements run in depth) | Medium. Needs a fence mount for height. Same location SwingVision uses. [Vendor claim, S1, S2] |

*Correction (gap study, 27 Sep 2026; `gaps/side-view-geometry-contradictions.md` §2–4).* The body turns about 130° between the trophy position and contact, so each view flips between a front-on and a side-on view of the body.
- **Side (chest-side) view.**
  - At the trophy position the knees point 50–90° towards the camera. Simulated three-level knee bands are wrong for 47–80% of serves, so knee flexion comes off the side-view list.
  - The side view does measure shoulder tilt at the trophy position, forward lean at contact (reliable only on the far court half), and leg drive as vertical hip rise.
- **Rear view.**
  - It *does* show knee flexion. The back knee, nearer the camera, is within about 0–20° of the image plane (11–13% wrong band in simulation), and it is the front knee that is partly hidden.
  - It shows shoulder-over-shoulder tilt at contact.
  - Forward lean at contact and forward toss placement run in depth, as stated.
| Rear, low (tripod about 1.5 m) | As above for the body | Far service box seen through the net mesh (section 6.3) | High, but weak for outcomes |
| Front 45° (net-post area or in front of the server) | Chest, toss arm, racket face at contact | Depth measures; the ball travels toward the camera | Low. Risk of the ball hitting the phone; subject is 12 m or more away. |
| Overhead | Toss placement map, footwork | Everything vertical | Not feasible. A drone must stay 30 m from people and never fly over them, and parks and sporting events count as populous areas. [Regulation, S46] |

### 2.3 Recommendation and justification

**Primary: side view from the chest side.** [Our inference] Reasons:

1. The serve's power-generating actions run mainly forward and upward: leg drive, trunk inclination, contact height and landing. A 90° side view measures these with the least projection error. [S6, S7] *Correction (27 Sep 2026):* this holds for vertical displacement (leg drive as hip rise, contact height, toss) and for forward lean at contact. It does not hold for knee flexion or trunk side bend at the trophy position, when the body faces the side camera. See `gaps/side-view-geometry-contradictions.md`.
2. Toss apex height and forward placement, the most requested consistency statistics, are best seen side-on.
3. The view works with a 1.5 m tripod as well as a fence clip, so it suits a player alone at any court.
4. Expert ratings of 2D video were reliable in a large study of 300 players that used a side-type view as one of two angles. [S3] Per-view reliability was not reported in the abstract, and the players were elite, so the claim that the side view alone suffices for UTR 1–7 is [Our inference].

The chest side is recommended because the toss arm, the ball's release and both knees stay unobstructed, even though the racket drop is partly hidden. This is a trade-off, not an evidence-based rule, so the app should also support the back-side view. [Our inference]

**Outcome-first alternative:** some players care more about "Am I getting more first serves in?" than about mechanics. For them, the rear elevated view alone gives estimated serve-in and placement plus lateral toss, but loses sagittal mechanics. The app should present this as a choice at set-up and never mix statistics across views. [Our inference]

---

## 3. Geometry: lens, distance, height, orientation

### 3.1 Field of view of iPhone lenses (computed)

Current main cameras are 24 mm-equivalent on Pro models (17 Pro, 18 Pro) and 26 mm on the iPhone 17, 16e and 17e. Ultra-wides, where fitted, are 13 mm, which Apple quotes as a 120° field of view. [S10, S11, S12, S53, S54] A 35 mm-equivalent focal length is defined on the diagonal (43.27 mm) of the 4:3 still frame. I assume 16:9 video uses the full sensor width.

Field of view (FOV) for each side of the frame is `FOV = 2·atan(half-side / f_eq)`. [Our inference]

| Lens | Long side (landscape width, portrait height) | Short side of 16:9 (landscape height) | 4:3 diagonal |
|---|---|---|---|
| Main 24 mm | 71.6° | 44.2° | 84.1° |
| Main 26 mm | 67.3° | 41.1° | 79.5° |
| Ultra-wide 13 mm | 106.2° | 73.7° | 118.0° (Apple: 120°) |

Caveat: stabilisation modes crop the frame. Apple states that Enhanced Stabilization "zooms in slightly". [S14] The app should therefore read the real FOV at runtime from `AVCaptureDevice.Format.videoFieldOfView` [S17], request per-frame camera intrinsics [S18], and keep stabilisation off (it is off by default on a capture connection [S19]). Do not hard-code FOV values. [Our inference]

### 3.2 The vertical envelope to frame

In 13 nationally ranked junior males (15.8 ± 0.9 years, 181 ± 7 cm), toss zenith averaged 3.40 ± 0.24 m and impact 2.68 ± 0.13 m above ground on successful serves, with 0.72 m between zenith and impact. [Established, S9] Adult recreational values are not published in the sources reviewed (UNVERIFIED). Recreational tosses are commonly higher or lower than elite tosses, so design for ground (−0.2 m, so feet are visible) up to about 4.5 m, giving 4.7 m of vertical coverage. [Our inference]

*Update 2026-09-27 (see `gaps/recreational-reference-ranges.md` §2 and §6):*
- Some adult non-elite apex values now exist: group means of 2.98–3.57 m, and per-player means up to 4.00 m for one recreational woman. The 4.5 m design top is confirmed as about P99.
- D1 measures its 6–8 m from the centre mark, but a right-hander serving from the deuce court stands about 0.5–1 m nearer the camera. So D1's near and low settings put the frame top at only 3.2–3.7 m at the server.
- Measure the distance to the server instead: at least 7.5 m (24 mm lens) or at least 8.0 m (26 mm) at 1.5–1.6 m height, or use a measured up-tilt.

### 3.3 Distance needed

**Camera aimed at the middle of the span:** `D = (V/2) / tan(vertical FOV / 2)`

| Vertical span V | 1x 24 mm landscape | 1x 26 mm landscape | 0.5x 13 mm landscape | 1x 24 mm portrait |
|---|---|---|---|---|
| 4.0 m | 4.9 m (7.1 m wide) | 5.3 m | 2.7 m | 2.8 m (2.2 m wide) |
| 4.5 m | 5.6 m (8.0 m wide) | 6.0 m | 3.0 m | 3.1 m (2.5 m wide) |
| 5.0 m | 6.2 m (8.9 m wide) | 6.7 m | 3.3 m | 3.5 m (2.8 m wide) |

**Level (untilted) phone.** This is recommended because vertical lines stay vertical and heights stay in one plane. The camera must see from −0.2 m to 4.5 m, so `D = max(4.5 − h, h + 0.2) / tan(vertical FOV / 2)`:

| Camera height h | 1x 24 mm | 1x 26 mm | 0.5x 13 mm |
|---|---|---|---|
| 1.2 m | 8.1 m | 8.8 m | 4.4 m |
| 1.5 m (typical tripod) | 7.4 m | 8.0 m | 4.0 m |
| 1.8 m | 6.7 m | 7.2 m | 3.6 m |
| 2.1 m (fence clip at head height) | 5.9 m | 6.4 m | 3.2 m |

Court geometry makes this practical. A right-hander serving from the deuce court stands about 0.5 m from the centre mark. The doubles sideline is then about 5.0 m away (half the doubles width of 10.97 m, less 0.5 m). The ITF-recommended overall footprint of 60 ft × 120 ft (18 m × 37 m) implies about 3.5–3.7 m of side run-off. [S37] A camera at the side fence is therefore typically 8–9 m from the server, which fits the 1x lens at heights of about 1.5 m and above. [Our inference] Many community courts have less run-off than the ITF recommends (UNVERIFIED for Australian averages). Where the fence is closer than the table allows, tilt the phone up by 10° or less (corrected in software), or switch to 0.5x at 3.5–4.5 m.

### 3.4 Pixel density: is the player big enough?

This uses 1080p landscape, a 1.75 m player and a 6.7 cm ball. [Our inference]

| Lens and distance | px per metre | Player height | Ball diameter |
|---|---|---|---|
| 1x 24 mm, 6 m | 222 | 388 px | 15 px |
| 1x 24 mm, 8 m | 166 (4K: 333) | 291 px (4K: 582) | 11 px (4K: 22) |
| 1x 24 mm, 10 m | 133 (4K: 266) | 233 px (4K: 466) | 9 px (4K: 18) |
| 0.5x 13 mm, 4 m | 180 | 315 px | 12 px |
| 0.5x 13 mm, 6 m | 120 | 210 px | 8 px |

Suggested thresholds are a body height of at least 250 px (warn below this) with a target of 350–600 px, and a ball diameter of at least 8 px. These thresholds are UNVERIFIED and must be tuned during validation. Apple notes that its body-pose results degrade near the frame edges, with occlusion between people, with flowing clothing, and when people are bent over or upside down. [Vendor claim, S26; a 2020 session, so it may be outdated for current Vision models] Keep the server away from the edges of the frame.

### 3.5 Ultra-wide (0.5x) versus main (1x)

- **Distortion:** the 13 mm lens has strong barrel distortion. iOS applies geometric distortion correction by default when a device supports it. [S16] The Camera app's "Lens Correction" setting also defaults to on, although Apple describes it as applying to photos. [S15] Residual stretching at the frame edges (a perspective effect) still enlarges limbs near the corners. [Our inference]
- **Resolution and light:** at the same distance, 0.5x gives about half the pixels per metre of 1x. Its aperture is f/2.2 against f/1.78 on the 17 Pro main, about 0.6 stop less light, which matters at night. [S10] The 18 Pro main has a variable aperture (f/1.48–f/4.0), so the gap is larger there when the widest aperture is used. [S12]
- **Use 0.5x only when the court surround is too narrow for 1x.** Some models lack an ultra-wide camera, and SwingVision's set-up guide links to a third-party clip-on wide-angle lens (an Amazon listing) for them; SwingVision does not appear to sell its own. [Vendor claim, S1] The iPhone 16e and iPhone 17e have a single 26 mm 48MP Fusion main camera and no ultra-wide, so 0.5x is unavailable on them. [S53, S54]

### 3.6 Orientation

Record in **landscape**. Portrait at 3 m frames the vertical envelope but gives only about 2.5 m of width. That loses the landing, the court lines needed for calibration, and the ball's early flight. Vendors of court-analysis apps also require landscape so that court corners stay in frame. [Vendor claim, S50] [Our inference]

### 3.7 The limits of 2D: out-of-plane error

Anything that moves toward or away from the camera changes scale, and anything rotated out of the image plane is foreshortened. [Established geometry; S6]

| Situation | Error |
|---|---|
| Ball 0.1 m off the calibration plane, camera 8 m away | 1.3% scale error (about 4 cm at 3.4 m height) |
| Ball 0.3 m off the plane, camera 4 m away | 7.5% (about 25 cm) |
| Limb segment rotated 20° out of the image plane | Appears 94% of its true length |
| Limb segment rotated 30° out of the image plane | Appears 87% of its true length |

Two implications follow. [Our inference] First, a longer distance reduces the scale error, which is one more reason to prefer 1x at 6–9 m over 0.5x at 3 m. Second, joint angles near 90° to the camera, such as knee flexion from the side, are trustworthy. Shoulder external rotation and pronation are not measurable from one 2D view and should be marked "not available".

*Correction (gap study, 27 Sep 2026).* The segment-length figures above are right, but the knee example is not.
- **Why.** At the trophy position the knee flexion plane is 50–90° from the side camera's image plane, because the front foot sits 31–40° to the baseline and the pelvis is side-on, facing that camera.
- **Formula.** The apparent flexion is atan(tan β1·cos ψ) + atan(tan β2·cos ψ), where β1 and β2 are the thigh and shank inclinations and ψ is the plane's angle from the image plane.
- **Size of the effect.** A 60° bend appears as about 32° at ψ = 60° and as 17° at ψ = 75°.
- **What to use instead.** Knee flexion needs the rear view. In the side view, use vertical quantities (hip drop and rise), which stay in-plane. See `gaps/side-view-geometry-contradictions.md` §2–3.

---

## 4. Frame rate, shutter and resolution

### 4.1 What each frame rate unlocks

Apple devices from the iPhone 17 onwards record 24, 25, 30 and 60 fps in 4K. Pro models add 4K at 100 fps (Fusion Main camera only) and 120 fps. On the non-Pro iPhone 17, 120 fps is listed only as 1080p slo-mo. Slo-mo runs to 1080p at 240 fps. [S10, S11, S12, S13]

Recreational first-serve speeds in SwingVision's dataset average 59.5 mph (96 km/h) at NTRP 3.0 and 66.2 mph (107 km/h) at 4.0. [Market data / Vendor claim, S30] Racket-ball contact lasts about 5 ms. [Established physics; technical source S29]

| fps | Frame interval | Ball at 100 / 150 km/h moves per frame | Racket head at 25–35 m/s moves per frame | What it supports |
|---|---|---|---|---|
| 30 | 33 ms | 93 / 139 cm | 83–117 cm | Toss apex, posture, landing. Contact timing ±17 ms. Not recommended. |
| **60 (default)** | 16.7 ms | 46 / 69 cm | 42–58 cm | All toss metrics, phase timing, contact height (ball ±3 cm), joint angles at key frames |
| 120 (high-speed option) | 8.3 ms | 23 / 35 cm | 21–29 cm | Tighter contact and racket-drop frames; ball launch direction |
| 240 (1080p slo-mo) | 4.2 ms | 12 / 17 cm | 10–15 cm | Nearly one frame per contact duration; prerequisite for video-based speed (experimental) |

The table is [Our inference] computed from speed ÷ fps.

### 4.2 Motion blur and rolling shutter

- **Blur equals speed × exposure time.** A racket head at 35 m/s blurs 14 cm at 1/250 s, 3.5 cm at 1/1000 s and 1.8 cm at 1/2000 s. The app can fix exposure duration and ISO through custom exposure mode [S20]. Cap exposure at 1/1000 s or faster in daylight, and at 1/250–1/500 s under lights. [Our inference]
- **Rolling shutter.** CineD measured a 5.3 ms sensor readout on the iPhone 15 Pro main camera (4.7 ms ultra-wide). [Market data: independent trade-press lab test, not peer-reviewed; S27] In that time a racket at 30 m/s moves about 16 cm and a ball at 45 m/s about 24 cm. Fast objects are therefore skewed, so do not measure racket angles near contact. The slow toss ball is unaffected. [Our inference]

### 4.3 Capture settings the app should enforce

These are [Our inference] based on Apple documentation.

- **Lock the lens** so the camera cannot auto-switch mid-clip. The Camera app has a "Lock Camera" setting for this. [S14]
- **Turn off Auto FPS and low-light frame-rate reduction.** iPhone can drop to 24 fps in low light. [S14]
- **Stabilisation off.** It adds latency and crops the frame, and it changes geometry between frames. [S14, S19]
- **HDR (Dolby Vision) off.** This gives consistent tone for computer vision, smaller files and less heat.
- **Lock focus, exposure and white balance** after framing.
- **Set the frame rate explicitly** through `activeVideoMinFrameDuration`, within the format's `videoSupportedFrameRateRanges`. [S21] This lets the app request 50 or 100 fps, which the Camera app does not always expose. It is untested per device (UNVERIFIED).
- **Resolution:** default 1080p60 for heat, storage and older devices. Use 4K60 for the rear view or distances above 9 m, where the ball would be under 10 px at 1080p.
- **For imported Camera-app videos,** instruct users: 1080p or 4K at 60 fps, Lock Camera on, Enhanced Stabilization off, HDR off. SwingVision gives similar advice for imports: 1080p at 60 fps, filmed from behind the baseline, at least 5 ft high. [Vendor claim, S2]

---

## 5. Light: sun, backlight, night courts, flicker

### 5.1 Daylight

- **Sun behind the camera.** SwingVision tells users to set up on the side of the court where the sun is behind the device, and on the side opposite the windscreen. [Vendor claim, S1] Filming into the sun silhouettes the player and flares the lens. A toss against a bright sky loses contrast. [Our inference]
- **Australian sun path.** In the southern hemisphere the midday sun is in the northern sky. For a court running north–south, the east fence has the sun behind it in the morning and the west fence in the afternoon. The app should suggest a side from the phone's compass heading, the time of day and the sun's azimuth. [Our inference] The orientation of Australian community courts is UNVERIFIED.
- **Midday summer light** is bright and short-exposure friendly, but gives hard shadows and the highest heat and UV load (section 10). Fence shadows across the court can confuse line detection. [Our inference]

### 5.2 Night courts

- **Light levels.** Tennis Australia's information sheet (2003, pre-LED) lists 250 lux maintained for social play, 350 lux for club competition and 1,000 lux for international play. It notes that an overcast day can exceed 7,500 lux. [Regulation (sport-body guidance, 2003), S33] A lighting vendor cites "AS 2560.2.1-2021" and gives 250 lux for recreational and training use. [Vendor claim, S34] Fact-check correction: Standards Australia lists no "AS 2560.2.1-2021". AS 2560.2.1-2003 (outdoor tennis) was superseded by AS 2560.2:2021 (Sports lighting, Part 2: Specific applications, published 27 August 2021, amended 2022), which covers tennis. [Regulation (standard), S55] The standard itself is paywalled and was not read, so the 250 lux figure in it is UNVERIFIED.
- **Exposure consequence.** 250 lux is about 30 times, or roughly 5 stops, darker than an overcast day. Short exposures therefore push ISO and noise up. Use the main lens (larger aperture), accept 1/250–1/500 s, and expect more racket blur. Toss metrics are largely unaffected. [Our inference]
- **Flicker.** Australian mains power is 50 Hz. [S36] Lights that dim at each zero-crossing pulse at 100 Hz, and in 50 Hz regions flicker is avoided by filming at 25 or 50 fps. [S35] Sampling 100 Hz flicker at 60 fps aliases to about a 20 Hz brightness pulse. At 120 and 240 fps frame brightness varies strongly from frame to frame. [Our inference]

  Night options, in order of preference [Our inference]:
  1. Film at 50 or 100 fps where supported. The iPhone 17 Pro and 18 Pro record 4K at 100 fps. [S10, S12]
  2. Film at 60 fps with a 1/100 s (10 ms) exposure. This is flicker-free but gives about 30 cm of racket blur.
  3. Accept flicker and normalise brightness in software. This is adequate for pose and toss tracking.

  Whether modern LED court lights on Australian community courts flicker is not documented in the sources reviewed (UNVERIFIED). The app should detect flicker rather than assume it (section 14).

### 5.3 Backgrounds

The ball is easiest to track against sky, a dark windscreen or a plain wall. It is hardest against trees, people on adjacent courts or bright cloud. The set-up screen should show a live "ball visibility" check during a practice toss. [Our inference]

---

## 6. Court visibility and calibration

### 6.1 Reference dimensions

- Court length 23.77 m; singles width 8.23 m; doubles width 10.97 m.
- Service line 6.40 m from the net, which puts it 5.485 m from the baseline.
- Net height 0.914 m at the centre and 1.07 m at the posts.

[Established, S37] A ball is 6.54–6.86 cm in diameter under the ITF specification as summarised by Wikipedia [S56]; the ITF Rules of Tennis text itself was not read.

### 6.2 Side view: what must be visible

- **Ground-plane homography.** A homography needs at least 4 coplanar points. From the baseline extension the visible points are the intersections of the baseline and the service line with the near doubles and singles sidelines (these sidelines are 1.37 m apart). The server's feet on the baseline are also visible. [Our inference]
- **Framing.** Place the server about one third from the frame edge, with the court (toward the net) filling the rest. At 7–9 m the 1x frame is 10–13 m wide, which is enough to include the service line 5.5 m away. [Our inference]
- **Scale for heights.** Combine the homography with the vertical vanishing direction, which is trivial when the phone is level. Fall back to the player's entered height, measured in a standing-tall calibration frame. A third check is the ball's apparent diameter at the apex. At 11–15 px, one pixel of error is a 7–9% scale error, so this check is weak. [Our inference]
- **Manual fallback.** Let the user drag four markers onto court-line corners. A single-phone speed app on the App Store uses this approach, asking users to mark the four service-box corners. [Vendor claim, S51]

### 6.3 Rear view: net-tape occlusion and depth resolution

From a camera h metres high, the far service line appears above the net tape only if the sight line clears 0.914 m at the net. [Our inference]

| Camera position behind baseline | Height to see far service line above tape | Height to see far baseline above tape |
|---|---|---|
| 2 m | ≥ 2.90 m | ≥ 1.98 m |
| 3 m | ≥ 3.04 m | ≥ 2.06 m |
| 5 m | ≥ 3.33 m | ≥ 2.21 m |

Below these heights the bounce is seen through the net mesh, with lower contrast. SwingVision's import guide asks users to keep the net top from overlapping the far service line or baseline where possible. [Vendor claim, S2]

Depth resolution in the far service box (1x, 1080p, 3 m behind the baseline) is poor, so in/out calls within about 20–30 cm of a line should show as "close call" rather than as a verdict. [Our inference] Lateral resolution at the far service line is better, at about 1.6 cm/px.

| Camera height | Pixels spanning the 6.4 m box depth | Average cm per pixel |
|---|---|---|
| 1.2 m | 34 px | 19 cm/px |
| 1.5 m | 42 px | 15 cm/px |
| 2.0 m | 56 px | 11 cm/px |
| 3.0 m | 82 px | 8 cm/px |

At 60 fps the ball moves 45–70 cm between frames, so the bounce position must be interpolated. Its error is UNVERIFIED and must be validated against annotated video.

---

## 7. How many serves? The maths

### 7.1 Serve-in rate (a proportion)

Recreational first-serve-in rates are near 53–54% at NTRP 3.0–4.0 [Market data / Vendor claim, S30], close to the worst case for variance, p ≈ 0.5.

- Standard error: SE = √(p(1−p)/n).
- Intervals use the Wilson method, which the NIST handbook presents and notes is recommended by Agresti and Coull (1998) and Brown, Cai and DasGupta (2001). [S32]
- The minimum detectable change between two sessions of n serves each is (1.96 + 0.84)·√(2p(1−p)/n), at 80% power and a two-sided α of 0.05.

Calculations use p = 0.55. [Our inference]

| Serves n | SE | 95% interval (Wilson) | Smallest session-to-session change detectable |
|---|---|---|---|
| 10 | 15.7 pp | 27–80% | 62 pp |
| 20 | 11.1 pp | 34–74% | 44 pp |
| 30 | 9.1 pp | 38–71% | 36 pp |
| 50 | 7.0 pp | 41–68% | 28 pp |
| 100 | 5.0 pp | 45–64% | 20 pp |
| 200 | 3.5 pp | 48–62% | 14 pp |

Detecting a real 10-point improvement between two sessions needs about 389 serves per session; a 15-point improvement needs about 173.

**Implication:** a single session cannot answer "Am I getting more first serves in?" [Our inference] The dashboard should:
- show counts plus an interval (for example, "14/24 in, likely 39–76%", the Wilson 95% interval);
- pool results into rolling windows of about 100 serves;
- use a beta-binomial or Bayesian trend and phrase change as a probability, such as "about 80% likely you've improved";
- rely on faster-responding continuous metrics (toss SD, contact height) as leading indicators.

### 7.2 Toss consistency (a standard deviation)

The 95% interval for a population SD from n samples is s·√((n−1)/χ²₀.₉₇₅) to s·√((n−1)/χ²₀.₀₂₅). [S31] The relative SE is about 1/√(2(n−1)). [Our inference]

| Tosses n | 95% interval as a multiple of the observed SD | Relative SE | SD reduction detectable between two sessions (one-sided α 0.05, 80% power) |
|---|---|---|---|
| 5 | 0.60×–2.87× | 35% | 75% |
| 10 | 0.69×–1.83× | 24% | 58% |
| 15 | 0.73×–1.58× | 19% | 50% |
| 20 | 0.76×–1.46× | 16% | 44% |
| 30 | 0.80×–1.34× | 13% | 37% |
| 50 | 0.84×–1.25× | 10% | 30% |

**Reference values.** Professional female players' within-player toss SDs at the zenith were 6.6 cm lateral, 7.2 cm forward/back and 6.0 cm vertical (n = 8 players, 5 serves each). Impact height was the most consistent dimension (SD 3.5 cm). [Established, S8] The authors concluded that common coaching drills demanding a perfectly repeatable toss are too strict. [Coaching interpretation drawn from established data, S8] Lower variability in junior impact height strengthened the link between strength and serve speed. [Established, S9] Recreational SDs are not available in the sources reviewed (UNVERIFIED).

*Update 2026-09-27:* a targeted search still found no within-player apex SDs for recreational players. The only non-elite within-player values are for contact: about 3 cm in height and 12–13 cm forward/back, in two hobby men (Carboch & Hrychová 2022). Provisional spread bands are in `gaps/recreational-reference-ranges.md` §7.1.

**Measurement noise inflates the observed SD:** observed = √(true² + error²). With a true SD of 8 cm, a 3 cm error inflates the result by 7%, and a 5 cm error by 18%. [Our inference] The product must estimate its own error (section 15) and should prefer measures where the error is small relative to the true spread.

**Stratify.** Toss location differs by serve type and target, and wind magnifies variability. [S8, citing Reid et al. 2011] Pooling flat, slice and kick serves inflates the SD. Compute statistics per stratum: serve type × court side × first or second serve. [Our inference]

### 7.3 Recommended session design

This design is [Our inference]:

- **Core block:** 12 first serves from the deuce court, then 12 from the ad court. This is 24 serves, which gives a usable toss SD per side only when pooled, so recommend one side per session for trend purposes.
- **Optional block:** 12 second serves.
- **Minimums:**
  - toss-consistency statistic: 20 or more serves of one stratum;
  - mechanics observation: 5 or more serves (OTSA used 3; more guards against one-off serves);
  - showing trend verdicts: at least 3 sessions.
- **Duration:** roughly 6–10 minutes with a basket of 20–40 balls.
- **Representative clip:** choose the median serve for key-frame comparison, not the best one.

---

## 8. The second angle

### 8.1 What rear + side unlocks

| Capability | Side only | Plus rear |
|---|---|---|
| Toss position | Height, forward/back | **3D position:** lateral drift plus a toss "cloud" ellipse |
| Body | Knee, trunk inclination, leg drive (*corrected 27 Sep 2026:* leg drive as hip rise; shoulder tilt at the trophy position; no knee band) | Plus shoulder tilt, lateral lean, swing path (*corrected:* plus the knee band from the nearer knee, and shoulder-over-shoulder at contact) |
| Outcome | Player-entered | **Estimated** in/out, direction (T, body, wide), depth zone |
| Timing | One view | Cross-checked across views (more robust event detection) |
| Speed | Experimental (wide side view, 120–240 fps) | Rear gives launch direction to correct side-view speed (experimental) |

[Our inference; placement geometry from sections 6.3 and S1/S2.]

**Placement.** Back fence, 4–6 m behind the baseline, 2.5–3.3 m high, centred on the server or 0.5–1 m to the non-hitting side to reduce occlusion. Tilt the phone down about 8°. With the camera 3 m high and the server about 5.5 m away, the frame must reach from the top of the toss envelope (4.3 m, or 13° up) down to the server's feet (29° down). That takes about 42° of the 44° vertical FOV of 1x, so 0.5x is safer. The far service line (about 7° down) falls inside this range. Use 4K where possible. Even so, a ball at the far service line (about 24 m away) is only about 7 px across at 4K and about 4 px at 1080p on 1x, below the 8 px threshold in section 3.4, so far-court ball detection will be marginal (fact-check recalculation). [Our inference]

### 8.2 Synchronising two phones

Sound travels at about 335–350 m/s. [S38] Audio cues therefore arrive at different times at phones that are different distances from the sound. [Our inference]

| Difference in path length | Audio offset | Frames at 60 fps | Frames at 240 fps |
|---|---|---|---|
| 1 m | 2.9 ms | 0.17 | 0.7 |
| 3 m | 8.7 ms | 0.5 | 2.1 |
| 5 m | 14.6 ms | 0.9 | 3.5 |
| 10 m | 29.2 ms | 1.75 | 7.0 |

Methods, from recommended to fallback [Our inference]:

1. **Toss-parabola sync (recommended).** Both views see the ball's vertical motion. Fitting a parabola to each view and aligning the apex times gives sub-frame alignment (accuracy UNVERIFIED). Refine with the contact frame.
2. **Clap or impact sound, corrected by distance.** Clap at a point about equally distant from both phones, or subtract the distance-to-sound offsets known from calibration.
3. **Clock sync between devices over the network** as a coarse start-time alignment (accuracy UNVERIFIED).

Apple's new genlock on the iPhone 17 Pro targets professional multi-camera rigs. It is not a phone-to-phone solution for consumers. [Vendor claim, S25] A single iPhone can record two of its own cameras at once (`AVCaptureMultiCamSession`, for example 1x detail plus 0.5x context). [S22] That gives two fields of view, not two angles.

---

## 9. Mounting at public courts

Prices are converted at RBA rates for 25 September 2026: A$1 = US$0.7019, €0.6170 and £0.5310. [S52]

| Option | Height achievable | Suits | Price (original → AUD) |
|---|---|---|---|
| Chain-link fence clip (SwingVision fence mount, generic clips) | Fence top, 2–3.6 m | Side or rear | Generic clips £12–25 → A$23–47. [Market data, S50] |
| "The Fence Clip" secure mount (tool-installed, semi-permanent) | Fence height | Club or home courts | US$55 → A$78. [Market data, S47] |
| SwingVision Swing Stick (telescopic, sits on top of the fence) | Above the fence | Rear, elevated | Shown as $49.99 bundled with 1 month of Pro, or $143.99 with Pro Yearly. The currency is not labelled; if USD, that is A$71 / A$205 (UNVERIFIED; the fact-check could not re-read these prices because the shop page is rendered client-side). [Market data, S49] |
| Functional Tennis telescopic pole with fence hook | Up to 200 cm; packs to 51 cm | Side | €59.95 → A$97. The page offers an AUD currency option, but shipping to Australia is not stated (UNVERIFIED). [Market data, S48] |
| Full-height tripod or light stand | 1.5–2.0 m | Side (level phone at 7–8 m) | Local retail pricing UNVERIFIED |
| Phone leaning on a water bottle on the ground | About 0.1 m | Rear outcome tracking only (SwingVision's "ground" option). Not suitable for mechanics. | Free. [Vendor claim, S1] |
| Ball-basket handle clamp | About 0.8–1.0 m (UNVERIFIED) | Side, with a strong up-tilt or 0.5x | Low |

Practical rules [Our inference]:
- Mount on rigid posts or wire, not windscreen fabric.
- Re-check framing if the fence moves in the wind (the app detects camera motion, section 14).
- Never mount behind the opposite baseline, where balls hit the fence.
- The side-fence position at the baseline extension is outside the serve path.
- Don't leave a phone unattended on a public fence.

---

## 10. Phone heat, battery and storage

### 10.1 Heat

- **Apple's limits.** Recent iPhones are rated for 0–35 °C ambient operation. [Vendor claim (manufacturer specification), S10, S11, S12, S24] When too hot, charging slows or stops, the display dims, camera features may be disabled and a "needs to cool down" screen appears. Apple warns against extended use in direct sunlight. [S24]
- **Australian exposure.** Perth Airport averages 28.7 days a year at or above 35 °C (9.1 in January) and 4.5 days at or above 40 °C (1944–2026 record). Adelaide (Kent Town) averages 21.5 and 4.1 days (1977–2020). [Established, S39, S40] These are shade air temperatures. A phone in direct sun on a hard court will be hotter (magnitude UNVERIFIED).
- **Load factors.** 4K60, HDR, maximum screen brightness, on-device machine learning and charging all add heat. [Our inference] The iPhone 17 Pro adds a vapour chamber that Apple says sustains higher performance. [Vendor claim, S25]
- **Mitigations the app should build in** [Our inference]:
  - monitor `ProcessInfo.thermalState` and step down from 4K to 1080p, pause analysis, or prompt shading at "serious" [S23];
  - keep only serve clips;
  - black out or dim the screen while recording, with remote start and stop from a watch or second phone;
  - defer heavy analysis until the phone is cool or on Wi-Fi and power;
  - advise shade (hat, towel or umbrella over the phone), not charging while recording, and avoiding sessions in extreme heat.

  Tennis Australia publishes an Extreme Weather Policy that uses wet-bulb globe temperature (WBGT) for competitions. I could not fetch it (Cloudflare block); it is noted for the player-safety copy.

### 10.2 Storage

Approximate per-minute sizes in HEVC, as mirrored from iPhone Settings strings and compiled by a third party (verify on device):

| Format | MB per minute | 25 serves as about 6 s clips (2.5 min) | 10 min continuous |
|---|---|---|---|
| 1080p30 | 60 | 150 MB | 0.6 GB |
| **1080p60** | 90 | 225 MB | 0.9 GB |
| 4K30 | 170 | 425 MB | 1.7 GB |
| 4K60 | 400 | 1.0 GB | 4.0 GB |
| 1080p120 slo-mo | 170 | 425 MB | 1.7 GB |
| 1080p240 slo-mo | 480 | 1.2 GB | 4.8 GB |

Source: [Market data, S28]. The compiled figures are for the iPhone 8 to iPhone 15 and may be outdated for the iPhone 17 and 18. The "Most Compatible" (H.264) setting roughly doubles these sizes (350 MB/min for 1080p120 in the same table; 350–375 MB/min on the older iPhone 6s). Sizes for 4K at 100 and 120 fps are UNVERIFIED.

**Recommendation** [Our inference]:
- Record continuously into a ring buffer and keep only auto-detected serve clips, from 1.5 s before toss release to 2.5 s after contact.
- Keep derived data (poses, ball tracks) indefinitely.
- Let the user choose whether to keep originals, compress them, or delete them after analysis.
- Check free space before recording.

---

## 11. Etiquette, privacy and safeguarding at public courts

- **Filming in public is generally lawful.** Australia has no general right to privacy in one's image. Arts Law notes that council rules for filming in parks vary. [Regulation (legal guidance), S44] Play by the Rules says public spaces usually have no laws restricting image-taking, provided the images are not otherwise illegal. [Regulation (guidance), S43]
- **Audio is the legal risk.** The sound-recording function of a phone may be regarded as a "listening device" under state and territory surveillance-device laws, and all states and territories prohibit using a listening device to record a private conversation (the details, including any exceptions, differ between jurisdictions). [Regulation (legal guidance), S44] I could not fetch the NSW Act itself (HTTP 403). **Product rule:** record no audio by default. If impact sounds are used for timing, process them on-device, keep only timestamps and discard the audio track. [Our inference]
- **Privacy Act.** The Privacy Act does not apply to individuals acting in a private capacity. [Regulation, S45] The app company is a different matter. Once footage containing bystanders is uploaded, APP obligations may apply; see the privacy workstream. [Our inference]
- **Children.** Tennis Australia's Safeguarding Children Code of Conduct (effective 12 October 2023) says ATO personnel may photograph or video children only in a tennis context. It requires prior, specific parent or guardian approval and the child's consent, secure storage, deletion when no longer needed, and no publication without approval or de-identification. It explicitly does not stop parents filming only their own child. [Regulation (sport policy), S41, S42]
  - **Product implications** [Our inference]:
    - a coach mode that records consent;
    - an under-18 flow that requires a parent or guardian;
    - never auto-sharing;
    - blurring non-subject people in any exported clip.
- **Clubs and venues** may make photography rules a condition of entry. Play by the Rules asks people to respect requests not to be filmed. [S43]
- **Framing etiquette** [Our inference]. The side view looks across the court toward adjacent courts:
  - frame against the fence or windscreen where possible;
  - tell nearby players you are filming your own serve;
  - pause if children's coaching is happening in the background;
  - have the app flag and blur extra people.
- **Drones are not an option.** They must stay 30 m from people and cannot fly over people; parks and sporting events are populous areas. [Regulation, S46]

---

## 12. In-app recording guide (step by step)

Written as app copy. Each step has a live check (section 14).

1. **Choose your goal.** Choose "Technique + toss" (side view, default) or "Serves in + placement" (rear view). The app remembers your choice and never mixes statistics across views.
2. **Pick your side.** "You're right-handed, so set the phone on your right, level with the baseline, outside the tramlines." (Mirrored for left-handers.) If the sun would be in the lens, the app suggests the other side or the back-side view.
3. **Mount it.**
   - Fence clip at head height (1.8–2.1 m), or a tripod at 1.5 m or higher.
   - Phone in landscape, with the screen facing you for set-up.
   - Distance 6–9 m from where you serve (about 8–12 walking steps) on 1x, or 7.5 m or more if the phone is at tripod height (1.5 m).
   - If the fence is closer than 6 m, the app switches to 0.5x.
4. **Level it.** A spirit-level overlay turns green when roll and pitch are within ±2°. On a low tripod a small upward tilt is allowed and corrected in software.
5. **Frame it.** Stand at your serving spot, raise your racket and do one practice toss. The app confirms:
   - the full body is visible;
   - there is room above the toss;
   - you are not near the frame edge;
   - the baseline and service line are visible.
   If the lines are not detected, tap four corners.
6. **Calibrate.** Stand tall for 2 seconds. The app measures your height in pixels against your profile height and the court lines.
7. **Check the light.** The app runs an exposure and backlight check, plus a flicker check under lights, and sets the frame rate (60, or 50/100 at night where supported).
8. **Record.** Start remotely (watch or second phone) or with a 10-second countdown. The screen dims. Serve 12 first serves from one side, with a basket so you're not walking about. A soft chime confirms each detected serve.
9. **Tag outcomes** (side view). After each serve, say or tap "in", "net", "long" or "wide". This data is labelled "player-entered".
10. **Review and keep.** You see a clip count and quality summary, and the app flags any rejected serves. Choose whether to keep originals or only the analysis.
11. **Optional second phone.** Clip it on the back fence, as high as it will go, centred behind your serving spot. Toss one ball to sync both phones.

---

## 13. Pre-recording checklist (user-facing)

- [ ] Phone charged above 40%, 2 GB or more free, case off if it runs hot.
- [ ] Mount or tripod, plus a basket of at least 20 balls.
- [ ] Sun behind or beside the camera, not in front.
- [ ] Phone level, landscape, 1x lens, 6–9 m away, 1.5–2.1 m high.
- [ ] Whole body and 1 m above your toss in frame; baseline and service line visible.
- [ ] No one else between the camera and you; neighbours told if they're in the background.
- [ ] Under 18? Parent or guardian present and consented.
- [ ] Hot day? Phone shaded, screen dimmed, and you're hydrated. Stop if you feel unwell, and see a professional for pain.
- [ ] Night court? The app's flicker check has passed.

---

## 14. Automatic quality checks

These are [Our inference] unless cited. Thresholds are starting points to tune during validation.

| # | Check | Method | Threshold (initial) | Action |
|---|---|---|---|---|
| 1 | Level | CoreMotion gravity vector | Roll and pitch ±2° (±10° pitch allowed, flagged "tilted") | Spirit-level overlay |
| 2 | Orientation and lens lock | Capture configuration | Landscape; fixed device; stabilisation off; Auto FPS off | Block recording otherwise |
| 3 | Full-body framing | Live body-pose detection [S26] | All keypoints inside; 10% margin from edges | "Step back / move phone" |
| 4 | Headroom for toss | Head-to-top distance vs body height | At least 0.6× body height above the head | "Tilt up / move back" |
| 5 | Subject size | Body height in pixels | Warn below 250 px; target 350–600 | Suggest 4K or moving closer |
| 6 | Court lines | Line detection and homography fit | 4 or more intersections; reprojection error under 3 px | Otherwise manual tap or fallback to height scale (lower confidence) |
| 7 | Backlight and exposure | Histogram clipping; subject vs background luminance | Under 5% clipped in the subject box | "Sun in lens — swap sides" |
| 8 | Flicker | FFT of mean frame luminance over 2 s | Periodic component above 3% amplitude | Switch to 50/100 fps or a 10 ms exposure |
| 9 | Motion blur | Laplacian variance of the static body; ball streak length | Ball streak under 2× diameter at apex | Shorten exposure |
| 10 | Frame timing | Sample-buffer timestamps | No gaps over 1.5× the nominal interval | Flag dropped frames; lower resolution |
| 11 | Camera stability | Background feature tracking | Under 2 px drift per serve | Re-estimate homography per serve; warn about wobble |
| 12 | Extra people | Person count and overlap | 1 subject; others not overlapping | Pick the server by position; blur others in exports |
| 13 | Ball visibility | Toss tracking during the practice toss | Ball found in 80% or more of toss frames | "Change background / side" |
| 14 | Thermal and battery | `ProcessInfo.thermalState` [S23]; battery level | "Serious" or above; under 15% battery | Step down resolution, pause, advise shade |
| 15 | Storage | Free space vs estimate | 2 GB or more free | Warn before start |
| 16 | Serve segmentation | Detected serves vs expected; outlier timing | Every serve has release, apex and contact | Mark partial serves "excluded from stats" |
| 17 | Two-camera sync | Apex-time residual after alignment | Under 0.25 frame | Otherwise treat views as unsynchronised (no 3D) |
| 18 | Lens smudge | Global sharpness vs baseline | Drop of more than 30% | "Wipe the lens" (iOS also offers lens-cleaning hints [S15]) |

Each clip carries a quality score. Statistics exclude clips that fail checks 3, 6, 10 or 16. The dashboard shows how many serves contributed ("18 of 24 serves measured").

---

## 15. Validating this protocol

These are [Our inference] proposals, run with the accuracy workstream.

1. **Geometry sweep.** Film 5–10 players of different heights, handedness and levels at distances of 4, 6, 8 and 10 m, heights of 1.2, 1.5 and 2.0 m, and lenses 1x and 0.5x. Measure the pose-detection success rate, toss-apex detection rate and keypoint jitter to confirm the minimum pixel thresholds.
2. **Toss accuracy.** Place a calibration pole with 10 cm markings in the server's plane, and optionally a second phone at 240 fps. Compare apex heights. Hand-annotate 200 frames to estimate the measurement error that enters section 7.2.
3. **Frame-rate ablation.** Record the same serves at 240 fps and downsample to 120, 60 and 30. Measure the change in contact-frame and phase-timing error.
4. **Light matrix.** Test morning, midday and late sun with front, side and back light, plus night courts with LED and metal-halide lighting. Record flicker amplitude at 50, 60, 100 and 120 fps.
5. **Rear-view outcomes.** Compare automatic in/out and zones against human line annotation for 300 or more serves, reporting accuracy by distance from the line and by camera height.
6. **Heat soak.** Record 15-minute sessions at 1080p60 and 4K60 in direct sun above 30 °C, logging thermal state and dropped frames.

---

## Implications for the product

1. **(P0)** Ship one primary protocol, the chest-side view (1x, landscape, level phone, 6–9 m, 1.5–2.1 m high), with a guided set-up that ends in an automatic pass or fail. Offer the rear view as a separate "outcomes" mode, and never mix statistics across views.
2. **(P0)** Own the capture pipeline with AVFoundation rather than importing Camera-app videos by default. That means a locked lens, stabilisation off, HDR off, Auto FPS off, custom exposure (1/1000 s or faster in daylight), an explicit frame rate (60 by default, 50/100 at night where supported), and runtime FOV and intrinsics.
3. **(P0)** Treat toss apex height and forward placement, contact height, phase timing and landing distance as the measured launch statistics from the side view. Label serve-in as player-entered in single-view mode, and rear-view in/out and placement as estimated, with "close call" margins.
4. **(P0)** Put the statistical honesty in the interface. Show intervals, require at least 20 serves per stratum for toss SD, pool serve-in rate over rolling windows of about 100 serves, and express improvement as a probability across at least 3 sessions.
5. **(P0)** Run the 18 automatic quality checks, and show "X of N serves measured" on every summary.
6. **(P1)** Make the capture heat-aware and storage-light: clip-only retention, a dimmed screen, watch or remote start, a thermal-state fallback, and deferred analysis.
7. **(P1)** Default to privacy: no audio track, blur bystanders in exports, an under-18 guardian flow, a coach consent mode, and user-controlled deletion of originals.
8. **(P1)** Suggest a side using the sun: compass heading plus solar azimuth leads to "set up on the east fence this morning".
9. **(P2)** Build two-phone mode with toss-parabola sync for 3D toss clouds and combined mechanics-plus-outcome sessions.
10. **(P2)** Recommend or partner on a fence mount of about A$25–100. Test the ball-basket and low-tripod paths, and support manual court-corner tapping as a fallback.

## Open questions

1. What are real toss-apex heights and toss SDs for adult recreational players (UTR 1–7)? Our framing envelope and SD thresholds rest on elite and junior data.
2. What measurement error does phone-based toss tracking achieve at 6–9 m? This decides whether toss-SD changes of about 30% are detectable at all.
3. Which is better for UTR 1–7 coaching value: the chest-side or back-side side view? This needs a small A/B test with coaches rating clips.
4. Do LED lights on Australian community courts flicker at 100 Hz in practice? Can the target iPhones capture 50 and 100 fps through AVFoundation across the installed base?
5. How accurate is rear-view in/out detection from a 2.5–3.3 m fence mount at 1080p versus 4K, and within what distance of the line?
6. How hot does an iPhone get in direct Australian summer sun during a 10-minute 1080p60 session with on-device pose estimation, and what shading works?
7. How much side run-off do typical Australian public courts have? This determines how often players will be forced onto 0.5x.
8. Is remote start (watch or second phone) essential for solo users, or is a countdown enough?
9. What proportion of target users own a fence mount or tripod? Should the app market or bundle one?

---

## Sources

- **S1.** "Set Up Your Recording" (how-to guide). SwingVision Inc., 2026. https://swing.vision/guides/set-up-your-recording (read in a rendered browser because the page is client-side), accessed 2026-09-27.
- **S2.** "Import Existing Footage". SwingVision Inc., 2026. https://swing.vision/guides/import-existing-footage, accessed 2026-09-27.
- **S3.** Wood D, Reid M, Elliott B, Alderson J, Mian A. "The expert eye? An inter-rater comparison of elite tennis serve kinematics and performance." *Journal of Sports Sciences* 41(19):1779–1786, published online December 2023. DOI 10.1080/02640414.2023.2298102. Abstract via UWA repository: https://research-repository.uwa.edu.au/en/publications/the-expert-eye-an-inter-rater-comparison-of-elite-tennis-serve-ki/ (full text returned HTTP 403), accessed 2026-09-27.
- **S4.** Myers NL, et al. "Reliability and validity of a biomechanically based analysis method for the tennis serve." *International Journal of Sports Physical Therapy*, 2017. https://pmc.ncbi.nlm.nih.gov/articles/PMC5455193/, accessed 2026-09-27.
- **S5.** Guillot A, Gauthier J, Lejoncour J, Di Rienzo F. "Modulating the tennis racket grip during motor imagery influences serve accuracy and performance: A pilot study." Accepted in *Movement & Sport Sciences – Science & Motricité* on 14 November 2025 (per the preprint's cover note). arXiv 2511.15298. https://arxiv.org/pdf/2511.15298, accessed 2026-09-27.
- **S6.** Puig-Diví A, et al. "Validity and reliability of the Kinovea program in obtaining angles and distances using coordinates in 4 perspectives." *PLOS ONE*, 2019. https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0216448, accessed 2026-09-27.
- **S7.** Kovacs M, Ellenbecker T. "An 8-stage model for evaluating the tennis serve: implications for performance enhancement and injury prevention." *Sports Health* 3(6):504–513, 2011. https://pmc.ncbi.nlm.nih.gov/articles/PMC3445225/, accessed 2026-09-27.
- **S8.** Whiteside D, Giblin G, Reid M. "Redefining spatial consistency in the ball toss of the professional female tennis serve." 32nd International Conference of Biomechanics in Sports (2014), ISBS Conference Proceedings Archive, published 7 October 2014. https://ojs.ub.uni-konstanz.de/cpa/article/download/6097/5577/0, accessed 2026-09-27.
- **S9.** Vacek et al. "The role of toss zenith and impact height in the relationship between shoulder rotation strength and serve speed in junior tennis players." *Journal of Functional Morphology and Kinesiology*, 2025. https://pmc.ncbi.nlm.nih.gov/articles/PMC12641958/, accessed 2026-09-27.
- **S10.** "iPhone 17 Pro – Tech Specs." Apple, 2025. https://support.apple.com/en-us/125090, accessed 2026-09-27.
- **S11.** "iPhone 17 – Tech Specs." Apple, 2025. https://support.apple.com/en-us/125089, accessed 2026-09-27.
- **S12.** "iPhone 18 Pro – Technical Specifications" (AU). Apple, 2026. https://www.apple.com/au/iphone-18-pro/specs/, accessed 2026-09-27.
- **S13.** "Record a video with your iPhone camera" (iOS 27 User Guide, AU). Apple, 2026. https://support.apple.com/en-au/guide/iphone/iph61f49e4bb/ios, accessed 2026-09-27.
- **S14.** "Change video recording settings on iPhone" (AU). Apple, 2026. https://support.apple.com/en-au/guide/iphone/iphc1827d32f/ios, accessed 2026-09-27.
- **S15.** "Change advanced camera settings on iPhone" (AU). Apple, 2026. https://support.apple.com/en-au/guide/iphone/iphb362b394e/ios, accessed 2026-09-27.
- **S16.** "isGeometricDistortionCorrectionEnabled" (AVFoundation documentation). Apple Developer. https://developer.apple.com/documentation/avfoundation/avcapturedevice/isgeometricdistortioncorrectionenabled, accessed 2026-09-27.
- **S17.** "videoFieldOfView" (AVCaptureDevice.Format). Apple Developer. https://developer.apple.com/documentation/avfoundation/avcapturedevice/format/videofieldofview, accessed 2026-09-27.
- **S18.** "isCameraIntrinsicMatrixDeliveryEnabled" (AVCaptureConnection). Apple Developer. https://developer.apple.com/documentation/avfoundation/avcaptureconnection/iscameraintrinsicmatrixdeliveryenabled, accessed 2026-09-27.
- **S19.** "preferredVideoStabilizationMode" (AVCaptureConnection). Apple Developer. https://developer.apple.com/documentation/avfoundation/avcaptureconnection/preferredvideostabilizationmode, accessed 2026-09-27.
- **S20.** "setExposureModeCustom(duration:iso:completionHandler:)". Apple Developer. https://developer.apple.com/documentation/avfoundation/avcapturedevice/setexposuremodecustom(duration:iso:completionhandler:), accessed 2026-09-27.
- **S21.** "activeVideoMinFrameDuration" and "videoSupportedFrameRateRanges". Apple Developer. https://developer.apple.com/documentation/avfoundation/avcapturedevice/activevideominframeduration, accessed 2026-09-27.
- **S22.** "AVCaptureMultiCamSession". Apple Developer. https://developer.apple.com/documentation/avfoundation/avcapturemulticamsession, accessed 2026-09-27.
- **S23.** "ProcessInfo.thermalState". Apple Developer. https://developer.apple.com/documentation/foundation/processinfo/thermalstate-swift.property, accessed 2026-09-27.
- **S24.** "Keeping iPhone within acceptable operating temperatures" (support article 118431). Apple. https://support.apple.com/en-us/118431, accessed 2026-09-27.
- **S25.** "Apple unveils iPhone 17 Pro and iPhone 17 Pro Max" (Newsroom). Apple, September 2025. https://www.apple.com/newsroom/2025/09/apple-unveils-iphone-17-pro-and-iphone-17-pro-max/, accessed 2026-09-27.
- **S26.** "Detect Body and Hand Pose with Vision" (WWDC20 session 10653). Apple, 2020. https://developer.apple.com/videos/play/wwdc2020/10653/, accessed 2026-09-27.
- **S27.** "iPhone 15 Pro Lab Test: Rolling Shutter, Dynamic Range and Exposure Latitude." CineD, 29 November 2023. https://www.cined.com/iphone-15-pro-lab-test-rolling-shutter-dynamic-range-and-exposure-latitude/, accessed 2026-09-27. May be outdated for iPhone 17/18 sensors.
- **S28.** "What's the iPhone Video Size per Minute." VideoProc (Digiarty), undated. https://www.videoproc.com/iphone-video-processing/iphone-video-size-per-minute.htm, accessed 2026-09-27. Secondary compilation; verify on device.
- **S29.** Lindsey C. "The Physics of Tennis: Energy Flow Between a Tennis Ball and Stringbed." Tennis Warehouse University, 7 September 2021. https://twu.tennis-warehouse.com/learning_center/stringbeds.php, accessed 2026-09-27.
- **S30.** "What Separates a 3.0 from a 4.0 Tennis Player (According to the Data)." SwingVision Blog, 10 August 2026. https://blog.swing.vision/2026/08/10/3-0-vs-4-0-tennis-player-data/, accessed 2026-09-27.
- **S31.** "Chi-Square Test for the Standard Deviation" (section 1.3.5.8). NIST/SEMATECH e-Handbook of Statistical Methods. https://www.itl.nist.gov/div898/handbook/eda/section3/eda358.htm, accessed 2026-09-27.
- **S32.** "Confidence intervals for proportions" (section 7.2.4.1). NIST/SEMATECH e-Handbook of Statistical Methods. https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm, accessed 2026-09-27.
- **S33.** "Outdoor Court Lighting" information sheet. Tennis Australia, 2003. https://www.tennis.com.au/wp-content/uploads/2010/08/lighting-information-sheet.pdf, accessed 2026-09-27. Outdated: pre-LED, and it predates AS 2560.2:2021 (see S55).
- **S34.** "FAQs – Tennis Court Lighting." ADLT Tennis (vendor). https://www.adlttennis.com.au/faqs/, accessed 2026-09-27. Cites a standard designation ("AS 2560.2.1-2021") that Standards Australia does not list; see S55.
- **S35.** "Why Do LED Lights Flicker On Camera?" SlashGear, 12 January 2025. https://www.slashgear.com/1754988/why-do-led-lights-flicker-on-camera-explained/, accessed 2026-09-27.
- **S36.** "Mains electricity by country." Wikipedia. https://en.wikipedia.org/wiki/Mains_electricity_by_country, accessed 2026-09-27.
- **S37.** "Tennis court" (ITF dimensions). Wikipedia. https://en.wikipedia.org/wiki/Tennis_court, accessed 2026-09-27.
- **S38.** "Speed of Sound" (Beginner's Guide to Aeronautics). NASA Glenn Research Center. https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/speed-of-sound-interactive/, accessed 2026-09-27.
- **S39.** "Climate statistics for Australian locations – Perth Airport (009021), all years." Bureau of Meteorology. https://www.bom.gov.au/climate/averages/tables/cw_009021_All.shtml, accessed 2026-09-27.
- **S40.** "Climate statistics – Adelaide (Kent Town) (023090)." Bureau of Meteorology. https://www.bom.gov.au/climate/averages/tables/cw_023090_All.shtml, accessed 2026-09-27.
- **S41.** "Safeguarding Children Code of Conduct" (National Policy, effective 12 October 2023), clause 11.10. Tennis Australia. https://www.tennis.com.au/content/dam/tennisaustralia/documents/policies/safeguarding/safeguarding-children-code-of-conduct.pdf.coredownload.pdf, accessed 2026-09-27.
- **S42.** "Safeguarding policies and compliance." Tennis Australia. https://www.tennis.com.au/about-us/safeguarding/policies-compliance, accessed 2026-09-27.
- **S43.** "Taking and Sharing Images at Sport." Play by the Rules. https://www.playbytherules.net.au/common-issues/taking-and-sharing-images-sport, accessed 2026-09-27.
- **S44.** "Filming in Public Places" (information sheet). Arts Law Centre of Australia. https://www.artslaw.com.au/information-sheet/filming-in-public-places/, accessed 2026-09-27. Last-updated date not shown. NSW Surveillance Devices Act 2007 page returned HTTP 403 and was not read.
- **S45.** "Drones." Office of the Australian Information Commissioner. https://www.oaic.gov.au/privacy/your-privacy-rights/surveillance-and-monitoring/drones, accessed 2026-09-27.
- **S46.** "Flying in populous areas." Civil Aviation Safety Authority, last updated 11 October 2024. https://www.casa.gov.au/drones/drone-rules/flying-populous-areas, accessed 2026-09-27.
- **S47.** "SwingVision Secure CellPhone Fence Mount." The Fence Clip. https://www.thefenceclip.com/product-page/swingvision-secure-cellphone-fence-mount, accessed 2026-09-27.
- **S48.** "Camera Mount Setup." Functional Tennis. https://www.functionaltennis.com/pages/camera-mount-setup, accessed 2026-09-27.
- **S49.** "Swing Stick Phone Mount." SwingVision shop. https://swing.vision/shop/swing-stick-offer, accessed 2026-09-27.
- **S50.** "How to Film Your Tennis Match for AI Analysis (2026 Guide)." UNFORCE. https://unforce.io/how-to/film-your-tennis-match, accessed 2026-09-27.
- **S51.** "Tennis Serve Speed Tracker" (App Store listing and website). https://apps.apple.com/us/app/tennis-serve-speed-tracker/id6741385759 and https://www.tennis-serve.com/, accessed 2026-09-27.
- **S52.** "Exchange Rates" (daily, 25 September 2026). Reserve Bank of Australia. https://www.rba.gov.au/statistics/frequency/exchange-rates.html, accessed 2026-09-27.
- **S53.** "iPhone 16e – Tech Specs." Apple, 2025. https://support.apple.com/en-us/122208, accessed 2026-09-27. (Added by fact-check.)
- **S54.** "iPhone 17e – Technical Specifications" (AU). Apple, 2026. https://www.apple.com/au/iphone-17e/specs/, accessed 2026-09-27. (Added by fact-check.)
- **S55.** "AS 2560.2:2021 Sports lighting, Part 2: Specific applications" and "AS 2560.2.1-2003 Sports lighting, Part 2.1: Specific applications — Lighting for outdoor tennis" (status: superseded by AS 2560.2:2021). Standards Australia store. https://store.standards.org.au/product/as-2560-2-2021 and https://store.standards.org.au/product/as-2560-2-1-2003, accessed 2026-09-27. (Added by fact-check; standard text not read.)
- **S56.** "Tennis ball." Wikipedia. https://en.wikipedia.org/wiki/Tennis_ball, accessed 2026-09-27. (Added by fact-check; secondary summary of the ITF specification.)

Could not be fetched: the Tennis Australia Extreme Weather Policy (https://www.tennis.com.au/doc/extreme-weather-policy; Cloudflare block) and the full text of the NSW Surveillance Devices Act 2007 (HTTP 403). Neither is relied on for specific figures.

---

## Verification log (fact-check 2026-09-27)

An independent fact-check re-read primary sources, using direct fetches of the publisher, government or company pages rather than the author's summaries. Where a page rendered client-side, its underlying data files were read. All recalculated tables (FOV, distance, pixel density, out-of-plane error, net occlusion, rear-view depth resolution, frame-rate motion, blur, audio offset, Wilson intervals, minimum detectable change, SD intervals and detectable SD reduction) were recomputed in a script and matched, except where noted.

| # | Claim checked | Verdict | Source used |
|---|---|---|---|
| 1 | Wood et al. (2023): 300 players (150 M, 150 F, three age groups), 2 raters, 13 variables, 7,800 ratings; alpha 0.727–0.924 overall, 0.744–0.944 rhythm, 0.775–1.000 trunk, 0.731–0.959 leg drive, 0.688–0.717 shoulder IR; *J Sports Sci* 41(19):1779–1786; published 28 Dec 2023 | Confirmed (numbers and citation) | UWA repository abstract and metadata (S3) |
| 2 | Wood et al. used "sagittal and rear-coronal" views, and the side view alone was shown to be reliable | Corrected: the abstract says only "two camera viewing angles"; reliability is not reported per view, and the serves were elite. View names marked UNVERIFIED; the side-only claim relabelled Our inference | S3 abstract |
| 3 | OTSA (Myers et al. 2017): anterior view 20 ft at 20°, posterolateral 14 ft at 45°; 3 first serves; 28 professionals / 33 recreational or college; ICC 0.90; 89% of items moderate to almost-perfect; kappa 0.36–1.0 | Confirmed (added that the professionals were women) | PMC5455193 (S4) |
| 4 | Guillot et al.: camera 2 m behind at 1.5 m on the centre line; second camera 3 m to the side at 1.2 m; accepted Nov 2025 | Confirmed (accepted 14 Nov 2025). Tag corrected: it is a methods detail of an 18-player motor-imagery pilot, not evidence validating the set-up | arXiv 2511.15298 PDF (S5) |
| 5 | Puig-Diví et al. 2019: 5 m, 0.68 m high, 90/75/60/45°; smallest error at 90° | Confirmed | PLOS ONE (S6) |
| 6 | Kovacs & Ellenbecker 2011 8-stage model (*Sports Health* 3(6):504–513); front-knee flexion >15° in loading | Confirmed as stated. Tag corrected: the 15° figure is a recommendation in a narrative review, so it is Coaching interpretation, not an Established threshold | PMC3445225 (S7) |
| 7 | Whiteside, Giblin & Reid: 8 professional women, 5 serves each, 22-camera 500 Hz Vicon; zenith SDs 6.6 / 7.2 / 6.0 cm; impact-height SD 3.5 cm; drills "too stringent" | Confirmed. Year corrected from "c. 2014 (UNVERIFIED)" to ISBS 2014 (32nd conference, published 7 Oct 2014) | Paper PDF and ISBS archive page (S8) |
| 8 | Vacek et al. 2025: zenith 3.40 ± 0.24 m, impact 2.68 ± 0.13 m, 0.72 m difference, Qualisys 200 Hz; lower impact-height variability strengthened the strength–speed link | Confirmed. Sample detail added: n = 13 nationally ranked junior males, 15.8 years (the original said "elite") | PMC12641958 (S9) |
| 9 | iPhone 17 Pro: 24 mm f/1.78 main; 13 mm f/2.2 120° ultra-wide; 4K at 100 (Fusion Main only) and 120 fps; 1080p slo-mo to 240 fps; 0–35 °C operating; genlock | Confirmed. Added that 100 fps is Fusion Main only | Apple support 125090 (S10) |
| 10 | iPhone 17: 26 mm main; 4K 24/25/30/60 | Confirmed; 120 fps is slo-mo only on this model (added) | Apple support 125089 (S11) |
| 11 | iPhone 18 Pro: 24 mm main, 13 mm 120° ultra-wide, 4K 100/120 fps | Confirmed; added variable aperture f/1.48–f/4.0 | Apple AU specs (S12) |
| 12 | Whether the iPhone 16e has an ultra-wide (originally UNVERIFIED) | Resolved: the 16e and 17e have a single 26 mm 48MP main camera and no ultra-wide | Apple 16e and 17e spec pages (S53, S54) |
| 13 | Camera app: Enhanced Stabilization "zooms in slightly"; Lock Camera; Auto FPS drops to 24 fps; Lens Correction on by default, for photos; lens-cleaning hints | Confirmed | Apple iOS User Guide AU pages (S14, S15) |
| 14 | AVFoundation: stabilisation defaults to off on a connection; geometric distortion correction defaults to on where supported; videoFieldOfView gives horizontal FOV | Confirmed | Apple Developer documentation data (S16, S17, S19) |
| 15 | iPhone 17 Pro vapour chamber (Apple claims up to 40% better sustained performance); genlock aimed at professional multi-camera rigs (Blackmagic ProDock) | Confirmed as vendor claims | Apple Newsroom (S25) |
| 16 | SwingVision data: first-serve speed 59.5 mph (3.0) and 66.2 mph (4.0); first serves in 53.3% and 54.4% | Confirmed (Vendor claim / Market data; 250,000+ sessions of self-selected users) | SwingVision blog, 10 Aug 2026 (S30) |
| 17 | SwingVision guidance: sun behind the device; opposite the windscreen; water-bottle ground mode; imports at 1080p/60 fps from behind the baseline, at least 5 ft high; avoid net tape over far lines | Confirmed | SwingVision guide locale data files (S1, S2) |
| 18 | "SwingVision sells a clip-on wide lens" | Corrected: its guide links to a third-party Amazon wide-angle lens | SwingVision guide data (S1) |
| 19 | CineD rolling shutter: iPhone 15 Pro 5.3 ms main, 4.7 ms ultra-wide | Confirmed. Tag corrected from Established to Market data (trade-press lab test, not peer-reviewed) | CineD, 29 Nov 2023 (S27) |
| 20 | Tennis Australia lighting sheet: 250 / 350 / 1,000 lux maintained for social / club / international; overcast >7,500 lux; 2003 | Confirmed | TA PDF (S33) |
| 21 | "AS 2560.2.1-2021" gives 250 lux for recreational and training | Corrected: no such designation is listed. AS 2560.2.1-2003 was superseded by AS 2560.2:2021 (published 27 Aug 2021, amended 2022). The 250 lux figure remains a vendor claim; the standard's text is UNVERIFIED | Standards Australia store (S55); ADLT (S34) |
| 22 | Perth Airport: 28.7 days ≥35 °C a year (9.1 in January), 4.5 days ≥40 °C, 1944–2026; Adelaide (Kent Town): 21.5 and 4.1 days, 1977–2020 | Confirmed. Tag corrected: the 0–35 °C rating is a manufacturer specification (Vendor claim), not Regulation | BoM climate tables (S39, S40) |
| 23 | TA Safeguarding Children Code of Conduct effective 12 Oct 2023; clause 11.10 (prior parent/guardian approval, child consent, secure storage, deletion, no publication without approval or de-identification; parents may film their own child) | Confirmed | TA Code PDF (S41) |
| 24 | CASA: drones at least 30 m from people, never over people; parks and sporting events are populous areas; page updated 11 Oct 2024 | Confirmed | CASA page (S46) |
| 25 | OAIC: the Privacy Act does not apply to individuals acting in a private capacity | Confirmed | OAIC drones page (S45) |
| 26 | Arts Law: a phone with sound "is" a listening device; recording private conversations is prohibited in all states | Softened: Arts Law says it "may be regarded as" a listening device; all states and territories prohibit recording private conversations with one, and the details differ | Arts Law information sheet (S44) |
| 27 | RBA rates on 25 Sep 2026: A$1 = US$0.7019, €0.6170, £0.5310, and the AUD conversions in section 9 | Confirmed (the conversions recomputed correctly) | RBA (S52) |
| 28 | Mount prices: The Fence Clip US$55 (tool-installed); Functional Tennis pole €59.95, 200 cm, 51 cm packed; generic clips £12–25 | Confirmed. "Ships to Australia" is not stated on the page, so marked UNVERIFIED | S47, S48, S50 |
| 29 | Swing Stick $49.99 / $143.99 bundles | Unverified: the shop is rendered client-side and the prices could not be re-read | S49 |
| 30 | Wilson interval "recommended by NIST" | Corrected wording: NIST presents it and cites Agresti and Coull (1998) and Brown, Cai and DasGupta (2001) as recommending it | NIST handbook 7.2.4.1 (S32) |
| 31 | Example "14/24 in, likely 38–75%" | Corrected to 39–76% (Wilson 95%) | Recomputed |
| 32 | Rear view: 4K gives a far ball of at least 8 px | Corrected: about 7 px at 4K and 4 px at 1080p at the far service line | Recomputed |
| 33 | Ball diameter about 6.5–6.9 cm (originally UNVERIFIED) | Confirmed as 6.54–6.86 cm through a secondary source; the ITF primary text was not read | Wikipedia (S56) |
| 34 | Racket–ball contact about 5 ms | Confirmed | TWU (S29) |
| 35 | Apple Vision body pose degrades near frame edges, with occlusion and with flowing clothing | Confirmed. Added: people bent over or upside down (2020 session, may be outdated) | WWDC20 10653 (S26) |
| 36 | Per-minute storage sizes (HEVC 1080p60 90 MB, 4K60 400 MB, 1080p240 480 MB, and so on) | Confirmed against the source table. Noted that it covers the iPhone 8 to iPhone 15, so it may be outdated | VideoProc (S28) |
| 37 | Single-phone speed app calibrates by dragging the four service-box corners | Confirmed (Vendor claim) | tennis-serve.com (S51) |

**Tag honesty.** The fact-check changed the Established labels on S5 (camera set-up), the S7 threshold and S27, changed the S33 label, and replaced Regulation with Vendor claim on the phone temperature rating. The labels that remain are consistent with their sources.

**Not checked:** the SlashGear flicker explainer (S35), the Wikipedia mains-frequency entry (S36), NASA's speed-of-sound page (S38) and the per-device AVFoundation 50/100 fps support (which stays UNVERIFIED). These are either common physical facts or were already flagged in the text.

**Search limitation:** the fact-check's web-search quota was used up early, so every verification above comes from direct fetches of known primary URLs, not independent search results.

**Gap-study corrections (27 Sep 2026; `gaps/side-view-geometry-contradictions.md`).** Notes were added in place:

| Section | Correction |
|---|---|
| Summary item 1 | Side-view metric list updated |
| §1 table | Knee flexion and trunk inclination rows reassigned |
| §2.1 | Puig-Diví caveat: planar calibration does not cover out-of-plane segments |
| §2.2 | Knee flexion moves to the rear view (nearer knee). The side view keeps shoulder tilt at the trophy position, hip-rise leg drive and far-court forward lean |
| §2.3 reason 1 | Qualified |
| §3.7 | The knee example was wrong: the flexion plane is 50–90° off the side view at the trophy position |
| §8.1 | Body row updated |

The basis for these corrections is measured foot angles and shoulder turn [Fett et al. 2021], plus a projection simulation. The §3.3 distance tables are unchanged. D1's centre-mark distances are addressed in the gap study §6 and in `gaps/recreational-reference-ranges.md` §6.
