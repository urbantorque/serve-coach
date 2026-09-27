# CAPTURE: recording guidance and capture quality (v1)

**Status:** draft for build, 27 September 2026. Revised the same day to follow the revised DECISIONS D1, D4 and D5 and the new D11 (see the revision log at the end). **Follows:** DECISIONS D1 (primary view), D2 (honesty labels), D3 (player-entered outcomes), D4 (speed and spin), D5 (hero metrics), D7 (statistics honesty), D8 (privacy and storage), D9 (platform) and D11 (launch segment). **Read with:** `METRICS.md` (metric definitions and display thresholds; `metrics.json` holds the threshold table shared with this spec), `COACHING.md`, `ARCHITECTURE.md`, `PRODUCT.md` and `DESIGN.md` (visual tokens). Geometry and ranges come from two gap studies: `research/gaps/side-view-geometry-contradictions.md` (cited as "gap geometry §n") and `research/gaps/recreational-reference-ranges.md` (cited as "gap ranges §n"). Section 15 flags where this spec thinks a decision is wrong or incomplete.

**Evidence tags:** [Established] = peer-reviewed or strong consensus. [Coaching interpretation] = expert practice. [Vendor claim]. [Regulation]. [Our inference] = our reasoning or arithmetic, reproducible from the formulas given. **UNVERIFIED** = not yet checked on a real device or source. Research is cited as (research 06 [S14]).

---

## 0. Summary

| Topic | v1 rule |
|---|---|
| Primary view | Side-on, on the server's **hitting-arm side**, on the **baseline extension**, lens pointing **along the baseline** (the baseline runs up the centre of the screen), **1x lens**, **60 fps**. **Default, "Portrait between courts":** portrait, **7-8 m from the centre mark**, phone **1.3-1.6 m** high, **level**. **Alternative, "Landscape at the fence":** landscape, **8.5-9.5 m** from the centre mark, **1.4-1.8 m** high, **4K preferred**, level or a measured upward tilt of **5 degrees or less**. The framing rule decides: the frame must reach **4.5 m** above the court at the server (4.7 m target). The live check blocks recording below **4.3 m** (section 2). |
| Tilt and aim | Pitch and roll are read from the motion sensors, logged, and removed in software by a rotation homography on keypoints and ball centres. Uncorrected tilt is never used for heights. Yaw is estimated from the baseline in the picture (`cq.yaw`, section 2.4). |
| Block | One block = **15 serves** (12-20 is fine) of one kind: one court side, first *or* second serves. |
| Minimums | 5 measured serves for a mechanics observation; 8 measured serves for any spread statistic (shown as an early read with a wide interval); 12 measured serves in each session for a "Did it work?" comparison (section 5). |
| Second angle | Optional raised rear view ("Outcomes view"), 1x lens. It unlocks toss left/right drift, the knee-bend band and shoulder-over-shoulder at contact (both experimental), experimental automatic in/out and placement after a court-corner tap, and experimental average speed to a bounce located in video. Statistics are never mixed across views (D1). |
| Audio | **Off by default.** An opt-in "Use the hit sound for timing" turns sound into contact timestamps on the phone and discards it. Audio never measures speed (D4; section 7.2; flagged in section 15). |
| Quality | 32 automatic checks, each with a severity of `info`, `warn` or `block`. Each has a player message and a fix, and each maps to the metrics it downgrades (section 8). Every summary shows "X of N serves measured". |
| Live assistant | Web prototype: `getUserMedia` preview in either orientation; level from `DeviceMotionEvent` (Ready is withheld while the tilt is unknown); a baseline guide for aim; a light MediaPipe pose pass at about 5 Hz; a live headroom figure; a practice-toss ball check; and a "Ready" state readable from the serving spot (section 9). |
| Native | Locked lens, fixed fps (including 50/100 fps at night), custom exposure, locked focus and white balance, intrinsics, per-frame attitude logging, 4K for the landscape and rear set-ups, and thermal state move to AVFoundation (section 10). |
| Import | Photos/Files import with a slow-motion question and a gravity-based time-base check. Speed is never computed from a clip whose time base is not proven. Pitch comes from the picture where possible; otherwise heights carry `TILT_UNKNOWN` (section 11). |

---

## 1. What capture must deliver

Capture exists to meet the prerequisites of the metrics. The metric ids below are the canonical shared ids; `METRICS.md` owns definitions, labels and display thresholds. This table states only what the *footage* must contain. "Rectified" means pitch and roll removed before measuring (section 2.4).

| Metric id | View | Must be in frame | fps: minimum (target) | Scale | Other capture prerequisites |
|---|---|---|---|---|---|
| `serve-count` | side, rear | Server's whole body, toss | 24 (60) | none | Fixed camera |
| `toss-apex-height` | side | Ball from release to past the apex; feet | 24 (60) | Player height (entered) plus a standing frame | Tilt measured and rectified; live frame top 4.3 m or more (`cq.toss-headroom`); apex inside the frame, else extrapolated and `estimated` |
| `toss-forward` | side | Ball at apex; front foot at setup | 24 (60) | as above | Lens along the baseline (`cq.yaw` 10 degrees or less) |
| `toss-drop` | side | Apex and contact | 24 (60) | as above | as `toss-apex-height` |
| `toss-height-spread`, `toss-forward-spread` | side | as above, for 8 or more measured serves of one stratum | 24 (60) | relative | Camera not moved within the block, or the block is split at the move; forward spread also needs `cq.yaw` 10 degrees or less |
| `contact-height-ratio` | side | Ball at contact; standing frame | 24 (60; 120 is better) | Player height | Tilt measured and rectified |
| `contact-forward` | side | Ball at contact; front foot at setup | 24 (60) | Player height | `cq.yaw` 10 degrees or less |
| `rhythm-release-to-contact`, `rhythm-spread` | side | Toss release and contact | 24 (60) | none | Proven time base (section 11) |
| `trophy-pause` | side | Both arms from release to racket drop | 24 (60-120) | none | Proven time base |
| `leg-drive` | side | Both hip keypoints from ball release, through the lowest point, to contact; feet at setup (ground reference) | 24 (60) | Player height | Rectified; hips not hidden by the tossing arm or racket |
| `drive-time` | side | as `leg-drive` | 24 (60; 120 is better) | none | Proven time base. The lowest hip point is a flat minimum, so expect about ±35-50 ms at 60 fps (gap geometry §5) |
| `loading-depth` | side | Hips from ball release to the lowest point | 24 (60) | Player height | Rectified. Descriptive only, never a "bend more" instruction (D5) |
| `deep-bend-flag` | side (experimental) | Hip, knee and ankle of both legs at maximum bend; standing frames for segment lengths | 24 (60) | Segment lengths from standing frames | Rectified (uses vertical extents only); yes/no only |
| `shoulder-tilt-trophy` | side | Both shoulders at the trophy position | 24 (60) | none (angle) | Rectified before the angle is taken; player-relative band |
| `knee-bend-band` | **rear only** | Hip, knee and ankle of the nearer (back) leg, unoccluded at maximum bend | 24 (60) | none (angle) | Raised rear set-up on 1x (section 6.1); keypoints rectified from the court-corner tap (section 6.3) |
| `shoulder-over-shoulder-contact` | **rear only** (experimental) | Both shoulders at contact | 24 (60) | none (angle) | As `knee-bend-band` |
| `landing-distance` | side | Feet before take-off and at landing; 1.8 m of court ahead of the front toe | 24 (60) | Player height | `cq.yaw` 10 degrees or less |
| `repeatability` | side | As its components | | | |
| `serve-in-rate`, `first-serve-in-rate`, `double-faults` | any | nothing (player-entered in the side view, D3) | | | Block tagged 1st or 2nd; the rear view gives `experimental` suggestions (0.5x allowed for these only) |
| `placement-zone` | any | nothing (player-entered target, D3) | | | Rear view plus corner tap gives `experimental` zones |
| `serve-type-mix` | any | nothing (player-entered intent, D4) | | | |
| `speed-experimental` | side | Clean ball detections 4-50 ms after contact, which needs about 2.7 m of frame ahead of the front toe | **120** | Player height | Proven time base; short exposure; a **target tag** (T / body / wide) on the serve or block; `cq.yaw` 10 degrees or less (D4) |
| `speed-average-rear` | rear (experimental) | Contact, and the bounce in the far service box above the net tape | 60 (120) | Court homography from the corner tap | 1x lens; bounce located in video; proven time base. Audio, if on, times contact only (D4) |
| `speed-radar-entered` | any | nothing | | | Player types in a radar reading |
| `spin` | none | always `unavailable` (D4) | | | |
| `capture-quality` | all | This spec (section 8.4) | | | |

Below the minimum frame rate a metric is `unavailable`. Between the minimum and 50 fps, contact, `toss-drop`, `drive-time` and timing metrics are downgraded (section 8.3).

**Not measured from the side view (D1).** Knee bend (at the trophy position the knees point roughly at the camera) and shoulder-over-shoulder tilt or forward lean at contact (the shoulder line points at the camera). A side-view session never produces `knee-bend-band` or `shoulder-over-shoulder-contact`; the capture flow offers the rear view instead (section 6).

"Forward" and "landing" are measured horizontally in the image, relative to the front toe at setup. They need neither court lines nor the baseline to be detected, but they assume the lens points along the baseline; `cq.yaw` checks that (section 2.4). Whether `METRICS.md` reports them against the front toe or against the baseline is its decision; capture guidance asks players to start with the front toe just behind the baseline, so the two are within a few centimetres. [Our inference]

---

## 2. Primary view: geometry

### 2.1 Two set-ups, one framing rule

Both set-ups share these rules (D1):

- **Side:** the server's hitting-arm side: the right side for a right-hander, the left for a left-hander. From here the camera sees the chest at setup and trophy and the profile at contact, and the toss arm and ball release are not hidden by the body (research 06 §2.3). [Our inference]
- **Line and aim:** on the baseline extension, outside the doubles sideline, with the lens pointing along the baseline at the server, so the baseline runs up the centre of the screen. This keeps the net-ward movements (toss forward, contact forward, hip rise, landing) parallel to the image plane. A residual turn (yaw) mixes sideways position into forward position (section 2.4). [Established for the principle (research 06 [S6]); Our inference for the serve]
- **Distances are measured from the centre mark** (D1). The server's own offset from the centre mark (0.5-1.0 m in singles, 2-3 m in doubles) is absorbed by the live check, which measures the frame at the player.
- **Lens:** 1x main camera. Do not zoom. The 0.5x lens is not used for side-view metrics (METRICS §1.1; section 2.6). Stabilisation off where the platform allows (section 10).
- **Frame rate:** 60 fps by default (section 3.3).
- **The framing rule** (D1; gap ranges §6.1): in the server's plane, the frame must reach from below the feet to at least **4.5 m**. **4.3 m** is accepted, with a toss peak above the frame estimated and labelled; **4.7 m** is the target. The live headroom check computes this from the standing player (section 9.4) and blocks recording below 4.3 m (section 9.8).

| | **Portrait between courts (default)** | **Landscape at the fence (alternative)** |
|---|---|---|
| Distance from the centre mark | **7-8 m**: between two courts, or 1.5-2.5 m outside the doubles sideline | **8.5-9.5 m**: at the side fence (a court built to Tennis Australia's club minimum has at least 3.05 m of side run-off, so the fence is at least about 8.5 m out; gap geometry §6.4) |
| Phone height | **1.3-1.6 m** (chest height) | **1.4-1.8 m** |
| Angle | **Level**. Residual pitch and roll are measured and removed | Level, or a **measured upward tilt of up to 5 degrees** when the app asks for it, removed in software |
| Resolution | 1080p (4K optional) | **4K preferred**. At 1080p a player on the far half of the court drops below the 250 px warning |
| Frame top at the server (camera-side half, worst case; table 2.2a/b) | 4.9-6.4 m | 4.1-5.1 m level; each 2 degrees of measured tilt adds about 0.3 m |
| Player 1.75 m tall at 1080p, camera-side / far half | 310-450 px / 260-340 px | 275-335 px / 220-265 px (4K doubles these) |
| Room ahead of the front toe | 2.1-2.8 m (camera-side half), 2.8-3.7 m (far half) | 5 m or more |
| Best for | Everything, except the experimental speed range on the camera-side half (section 2.3) | Speed sessions; courts with no room between them; players who prefer the fence |
| Serving from a doubles spot | Move the phone 1.5-2 m further back | On the camera-side half a level phone frames only about 3.4-4.4 m. Stand the phone upright at the same spot instead (portrait at 8.5-9.5 m frames 4.5 m or more) |

Every figure in the table is [Our inference], computed with the formulas in 2.2 for a 1.75 m player and 1x lenses of 24 mm or 26 mm equivalent.

### 2.2 Why these numbers

**The vertical envelope.** The highest plausible recreational toss is about 3.9-4.1 m at the 95th percentile of serves, 4.1-4.3 m at the 99th, and 4.4-4.6 m for tall, high-tossing players. The highest published per-player mean is 4.00 m, from a recreational woman on the serves she netted (gap ranges §6.1, [N1]). A frame top of **4.5 m** frames at least 99% of serves without extrapolation. The **4.7 m** target absorbs a levelling error (1 degree at 7.5 m is 13 cm), the ball's radius and a toss plane slightly nearer the camera. **4.3 m** is the accepted floor (about P99 for players of average height), with apexes above the frame fitted from the parabola and labelled `estimated` (gap ranges §6.4). The previous gate (4.2 m target, 3.9 m minimum) let through set-ups that cut off the P95-P99 recreational toss. [Our inference, from gap ranges §6]

**What the envelope has to survive** (gap geometry §6.1):
- the toss plane is about 0.3 m nearer the camera than the body;
- the server stands 0.5-1.0 m nearer the camera on the camera-side half of the court (deuce for a right-hander), and 2-3 m nearer when serving from a doubles position;
- at least 0.1 m of ground must show below the feet;
- tilt must be corrected.

**Formulas** (gap geometry §6.2, extended to portrait) [Established geometry]:
- Ball-plane distance on the camera-side half: D_b = D_c − x_s − 0.3, where D_c is the phone's distance from the centre mark and x_s the server's offset towards the phone. On the far half: D_b = D_c + x_s − 0.3.
- Level phone at height h: frame top = h + D_b · tan(V/2). V is the vertical field of view: the frame's **long** side in portrait (71.6 degrees for the 24 mm lens, 67.3 degrees for 26 mm) and its **short** side in landscape (44.2 and 41.1 degrees) (research 06 §3.1). The horizontal half-angle is ±22.1 / ±20.55 degrees in portrait and ±35.8 / ±33.65 degrees in landscape.
- DECISIONS D1 quotes a portrait long-side half-angle of about 31-33 degrees, which allows for stabilisation crop. The full-width values are 35.8 and 33.65 degrees. Table 2.2a therefore also shows a cropped 32-degree column. The app reads `videoFieldOfView` at runtime rather than trusting either (research 06 §3.1).

**Table 2.2a. Portrait, level.** Frame top in the ball's plane (m) / standing height of a 1.75 m player at 1080p (px). Camera-side half, singles, server 1.0 m nearer than the centre mark (the worst case). [Our inference, computed]

| From centre mark | Phone height | 24 mm | 26 mm | 26 mm, cropped to 32 degrees |
|---|---|---|---|---|
| 7.0 m | 1.3 m | 5.41 / 388 | 5.09 / 421 | 4.86 / 448 |
| 7.0 m | 1.6 m | 5.71 / 388 | 5.39 / 421 | 5.16 / 448 |
| 7.5 m | 1.3 m | 5.77 / 358 | 5.43 / 388 | 5.17 / 414 |
| 7.5 m | 1.6 m | 6.07 / 358 | 5.73 / 388 | 5.47 / 414 |
| 8.0 m | 1.3 m | 6.13 / 333 | 5.76 / 361 | 5.49 / 384 |
| 8.0 m | 1.6 m | 6.43 / 333 | 6.06 / 361 | 5.79 / 384 |

On the far half (server 1.0 m further away) the frame top is 6.1-7.9 m and the player 260-340 px. The ball is 13-18 px across on the camera-side half and 10-13 px on the far half. The frame is 2.1-2.8 m either side of the player on the camera-side half (about 2.6 m at 7 m from the phone) and 2.8-3.7 m on the far half. A level portrait phone sees the court from about 1.8-2.4 m in front of it, so the baseline between the phone and the player is in view. Portrait still frames 4.5 m from about 5.5-6.5 m from the centre mark, depending on lens and height. [Our inference, computed]

**Table 2.2b. Landscape at the fence, level.** Same worst case and units. [Our inference, computed]

| From centre mark | Phone height | 24 mm | 26 mm |
|---|---|---|---|
| 8.5 m | 1.4 m | 4.32 / 310 | 4.10 / 336 |
| 8.5 m | 1.6 m | 4.52 / 310 | 4.30 / 336 |
| 8.5 m | 1.8 m | 4.72 / 310 | 4.50 / 336 |
| 9.0 m | 1.4 m | 4.53 / 291 | 4.29 / 315 |
| 9.0 m | 1.6 m | 4.73 / 291 | 4.49 / 315 |
| 9.0 m | 1.8 m | 4.93 / 291 | 4.69 / 315 |
| 9.5 m | 1.4 m | 4.73 / 274 | 4.47 / 297 |
| 9.5 m | 1.6 m | 4.93 / 274 | 4.67 / 297 |
| 9.5 m | 1.8 m | 5.13 / 274 | 4.87 / 297 |

On the far half at 1080p the player is 220-265 px and the ball 9-10.5 px, so 4K is preferred (443-531 px). With the 26 mm lens, a level phone at the fence meets 4.5 m on the camera-side half only from about 9 m at 1.6 m high (gap geometry §6.5). A measured upward tilt fixes that: 2 degrees adds about 0.3 m of frame top and 5 degrees about 0.7-0.8 m (26 mm at 8.5 m and 1.4 m: 4.10, 4.39 and 4.84 m at 0, 2 and 5 degrees), with at least 0.4 m of ground still below the feet. [Our inference, computed]

**Why portrait is now the default.** At a given distance, pixels per metre are the same in either orientation, because pixels are square. What portrait changes is how close the phone can come. Its tall axis still frames 4.5 m at 7-8 m with room to spare (4.9 m or more in the worst case), so the player is 310-450 px tall. Landscape needs 8.5-9.5 m and gives 275-335 px on the camera-side half at 1080p (D1 rounds these to about 450 and 290 px). What portrait gives up is width: ±20.5-22 degrees across, about 4.2-5.6 m at the player on the camera-side half. That covers setup, landing (1.8 m ahead of the front toe) and the room behind the heel, but not always 50 ms of outgoing ball for speed (section 2.3). Research 06 §3.6 rejected portrait at 3 m, where the frame is only 2.5 m wide; at 7-8 m that objection no longer holds. [Our inference]

**Pixel density.** The live check warns when the standing player is under **250 px** tall on the subject, counted in raw pixels, not scaled by frame height (section 8.1), and suggests 4K or a closer phone. In the ROI evaluation, MediaPipe with the engine's region-of-interest crop detected a 216 px player (portrait, 12 m) in 100% of frames with about 0.03 BH error, mirror-tolerant (pose README). So 250 px keeps a margin. Nothing smaller has been tested, so pose metrics are blocked below 200 px. [Established for the rendered-clip result; thresholds are Our inference]

A level phone cannot also make the player a third of the frame height, as Apple advises for Vision body pose (research 05 [S1]). In portrait at 7-8 m the player fills about 16-23% of the frame height. MediaPipe crops the person and resizes the crop to 256 × 256, so a player of 250-450 px loses little (research 05 [S4]), and the ROI crop in the engine is the mitigation. [Our inference]

### 2.3 Deuce and ad, left-handers, doubles positions and speed sessions

- **The phone stays put for both sides.** For a right-hander with the phone on the right, the ad-court serving spot is about 1-2 m further from the phone than the deuce spot. The player is 15-25% smaller in the frame and the frame top is higher. Each block is calibrated separately from the player's standing height, so this does not bias the statistics; it only changes the pixel budget. In portrait the far half still gives 260-340 px, above the 250 px warning. At the fence in landscape it gives 220-265 px at 1080p, so use 4K there. [Our inference]
- **Measure from the centre mark.** The camera-side half governs headroom, and portrait passes it with room to spare anywhere in the 7-8 m band. The far half governs player size.
- **Serve direction.** The swing plane turns only about 9 degrees between deuce and ad targets, which changes forward distances by about 1% (cos 9 degrees = 0.988). No correction is needed. [Our inference]
- **Left-handers:** mirror everything. The phone goes on the left.
- **Doubles serving positions** (2-3 m from the centre mark). On the camera-side half this brings the server 2-3 m nearer the phone. Portrait at 7 m then frames only 3.8-4.5 m, so **move the phone 1.5-2 m further back** (8.5-9 m from the centre mark), which restores 4.5 m or more. On the far half the doubles spot takes the server further away. Headroom grows, but the player can fall to about 215-275 px at 1080p, so record in 4K or keep the phone at the near end of the band. Landscape at the fence does not suit the doubles spot on the camera-side half: level, it frames only about 3.4-4.4 m, and even a 5 degree tilt reaches 4.5 m only at the far end of the band (9.5 m, 1.8 m high). Standing the phone upright at the same spot fixes it. The block card asks "Singles spot / Doubles spot" (section 3.7), so the live check expects it and statistics are stratified by it. This matters for the launch segment, whose weekly comp fixtures are mostly doubles (D11; research 10 §2.2). [Our inference]
- **Speed sessions** (the experimental speed range, D4). Speed method A needs clean ball detections up to 50 ms after contact (METRICS §3.22). Contact is up to about 0.7 m ahead of the front toe (gap ranges §7.6), and a 160 km/h serve travels 2.2 m in 50 ms, so the frame needs about **2.7 m ahead of the front toe**. Portrait gives that only when the player is at least 6.7 m (24 mm) or 7.3 m (26 mm) from the phone: about 8-8.7 m from the centre mark on the camera-side half, or about 6.3 m on the far half. Landscape at the fence always gives it. When the speed toggle is on, `cq.court-room` applies the 2.7 m rule and its fix is "Move the phone to about 8.5 m, or use the side fence sideways". [Our inference]

### 2.4 Tilt and aim: read, rectify, check

- **Pitch and roll are measured, not assumed.** In-app recordings log them from the motion sensors: 10 Hz in the web prototype, per frame natively (sections 9.3 and 10). Before computing any height or 2D angle, the engine maps keypoints and ball centres through the rotation homography K·R·K⁻¹ (METRICS §1.1; gap geometry §6.6). The video is not re-rendered.
- **Why it matters.** Treating a tilted frame as level reads the toss peak about 9 cm low at 5 degrees and 18 cm low at 10 degrees, and contact 3 cm and 6 cm low. After correction, a residual pitch error of 0.5-1 degree costs only 0.3-1.6 cm on the peak above the feet (gap geometry §6.6). [Our inference]
- **Limits.** Ready needs roll within 3 degrees and pitch within 3 degrees. In landscape at the fence, an upward pitch of up to 5 degrees is also allowed, but only when the app asks for it (section 9.3). A recorded pitch beyond ±5 degrees is outside D1's cap. Heights and 2D angles from that recording are `unavailable` (reason `cq.camera-level`), because pose accuracy on keystoned bodies is untested. The cap may rise to 8 degrees once the synthetic tilt test passes (gap geometry §9, test 3). Roll is corrected whatever its size.
- **Cross-check from the picture.** Looking along the baseline, a level phone shows the baseline as a line up the centre of the screen that meets the horizon at its vanishing point. The vanishing point's row gives the pitch, and its column gives the yaw. Fence and net posts give the roll. In portrait the court is visible from about 1.8-2.4 m in front of the phone, so the baseline is usually available. The engine logs the difference between sensor and picture. This doubles as validation data for sensor pitch accuracy, which is UNVERIFIED (gap geometry open question 7). [Our inference]
- **No sensor reading** (motion permission denied, or an imported clip). The picture estimate is used when it is found with good confidence (tilt source `image`); otherwise the tilt is unknown. Either way, every height metric is capped at `estimated` with reason `TILT_UNKNOWN`, because the picture method is not yet validated (section 8.2, `cq.camera-level`). In the app, Ready is withheld while the tilt is unknown (section 9.8).
- **Yaw cannot be read from gravity** (gap geometry §6.6). The player aims the lens along the baseline using the on-screen baseline guide. `cq.yaw` estimates the remaining turn from the baseline's direction and vanishing column, with the landing-step direction as a fallback. A yaw of ε:
  - shifts forward positions by the sideways offset × sin ε: a toss 0.3 m to the side reads 2.6 cm off at 5 degrees and 5.2 cm at 10 degrees;
  - leaks sideways toss scatter into the forward spread (lateral σ × sin ε);
  - scales landing distance by cos ε;
  - widens speed method A's out-of-plane bound by ε.

  Pass at 5 degrees or less; warn at 5-10 degrees; above 10 degrees, forward metrics and speed are `unavailable` (section 8.2). [Our inference]

### 2.5 What the side view cannot see, and its known biases

- **Knee bend.** At the trophy position the knees point roughly at the camera: the flexion plane is 50-90 degrees out of the image plane. A 2D knee angle then reads 17-36 degrees low, and a three-level band would be wrong for 47-80% of serves (gap geometry §3). The side view offers only loading depth (`loading-depth`, descriptive) and the experimental `deep-bend-flag` (yes/no). The knee band is rear-only.
- **Shoulder-over-shoulder at contact.** At contact the shoulder line is 65-84 degrees out of the image plane, and forward lean at contact is contaminated on the camera-side half (gap geometry §4). Rear-only.
- **Shoulder tilt at the trophy position** is in-plane: the shoulder line is 16-31 degrees from the image plane. It is measured on rectified keypoints as a player-relative band (`shoulder-tilt-trophy`) and is never compared with the published 48 degree or 25 ± 7 degree trunk values (D5).
- **Toss offset.** A toss 0.3 m nearer the camera than the body reads about 8-12 cm high, and 10 cm of sideways toss spread adds 2-4 cm of apparent height spread (D1; gap geometry §6.7). At the portrait default (ball plane about 5.7-7 m away, phone 1.3-1.6 m high) the peak bias is about 8-10 cm. Absolute toss height is therefore `estimated`, and the consistency copy says the spread includes a small sideways component unless the rear view is recorded. [Our inference]

### 2.6 When space is tight

Tennis Australia's club minimum side run-off is 3.05 m, so a side fence is at least about 8.5 m from the centre line, and a phone halfway between two unfenced courts is about 7.3 m out (gap geometry §6.4, [G19]). Courts built below that standard are UNVERIFIED in number. In order of preference:

1. **Portrait, closer in.** Portrait still frames 4.5 m from about 5.5-6.5 m from the centre mark on the camera-side half. The live check decides.
2. **Portrait, raised.** Each extra 0.3 m of phone height adds 0.3 m of frame top.
3. **Landscape at the fence with a measured upward tilt of up to 5 degrees** (section 2.4).

The 0.5x lens is no longer a side-view fallback. Portrait covers the cases it served, and metrics do not support it (METRICS §1.1). The iPhone 16e and 17e have no ultra-wide in any case (research 06 [S53], [S54]).

### 2.7 Image conventions for the engine

- **Into-court direction.** Chest-side view: the net is on the image **right** for a right-hander and on the image **left** for a left-hander. The back-side view (phone on the non-hitting side) is mirrored. The engine confirms the direction from the landing step (section 8, `cq.view`). [Our inference from court geometry]
- **Baseline.** When the phone is on the baseline extension and pointed along it, the baseline projects to the vertical centre line of the image, below the horizon. The live baseline guide (section 9.6) and `cq.yaw` use it. Lines on sand-filled synthetic grass are often faint (research 02 §6.2); then the landing step is the fallback. [Our inference]
- **Orientation.** Coordinates are the displayed, rotation-corrected frame in either orientation, and distances use isotropic frame-height units (METRICS §1.1), so portrait needs no special case in the metrics. Orientation matters to capture only through the field of view (headroom allowance, room ahead) and the level algorithm (section 9.3).

---

## 3. Player-facing setup guide (copy)

Tone: calm, short, second person, Australian English, no exclamation marks. Every live state has a glyph and a text label, never colour alone (research 09 [S6]). Strings in quotes are final copy unless marked *[placeholder]*.

### 3.1 Before you go

Title: "Before you head out"

- "Phone charged to at least 40%, with about 2 GB free."
- "Something to hold the phone upright and steady at chest height: a tripod or light stand, or a fence clip. A bag or bench works at a pinch; we'll tell you if it's too low."
- "Balls. A basket is easiest. With 4 to 6 balls, serve them all, pick them up and keep going. We skip the walking."
- "Water, a hat and sunscreen."
- "Warm up first. Your first few serves of the day aren't typical, so we'll record after you're loose."

### 3.2 Set up in six steps

Title: "Set up your phone"

1. **"Pick your side."** "Put the phone on your hitting-arm side. That's your right if you're right-handed, and your left if you're left-handed." *(Diagram A, section 4.)*
2. **"Line it up with the baseline."** "Stand the phone outside the court, in line with the baseline, 2 to 3 big steps outside the outer sideline. Between two courts, halfway across is usually right. Point the camera straight along the baseline at where you serve, so the line runs up the middle of the screen."
3. **"Chest height, and level."** "Set the phone about 1.3 to 1.6 m high, around chest height. Keep it level. Don't tilt it up at the sky. The level guide turns solid when it's right."
4. **"Upright, standard lens."** "Stand the phone upright, with the camera facing your serving spot. Use the standard 1x lens and don't zoom."
5. **"Check the sun."** "Stand at your serving spot and look at the phone. The sun should be behind the phone or off to one side, not behind you. If you're squinting a little, that's good: the camera isn't."
6. **"Stand tall, then toss."** "Walk to your spot and stand tall for two seconds. Then toss a ball as you would for a serve and catch it. We'll check you, your toss and the light, and tell you if anything needs to move."

Cards shown under the steps, only when they apply:

- **"Using the side fence instead?"** (always available as a link under step 4): "Clip the phone sideways to the side fence, in line with the baseline, about 1.4 to 1.8 m high. If we ask, tilt the top back a little. We measure the tilt and take it out. Use 4K if your phone offers it." *(Landscape at the fence, section 2.1.)*
- **"Serving from your doubles spot?"** (when the block card says Doubles spot): "You'll be 2 to 3 m closer to the phone, so move the phone 2 big steps further back."
- **"Measuring speed?"** (only when the experimental speed toggle is on): "We need to see the ball fly for a moment after you hit it. Put the phone about 8.5 m from the centre mark, or clip it sideways to the side fence. Tag your target (T, body or wide) for each block." (D4; section 2.3)

Result states (large, readable from the serving spot; section 9.7):

- Ready: "Ready" (tick glyph, chime).
- One change: "Step into the picture", "Hold still", "Allow motion access", "Level the phone", "Point along the baseline", "Phone back 2 steps", "Raise the phone a little", "Phone closer 1 step", "Turn the phone upright". Exactly one instruction at a time, the one that matters most (priority order in section 9.8).

Below the big state, for when the player is back at the phone:

- "Room above your toss: 5.1 m (needs 4.5)". Between 4.3 and 4.5 m: "Room above your toss: 4.4 m. 4.5 is better; very high tosses will be estimated." Below 4.3 m: "Room above your toss: 4.2 m (needs at least 4.3)". The 4.7 m target is shown as a marker on the bar.
- "You: 390 px tall (good)".
- "Phone height: about 1.5 m".
- "Level: 1° (we'll correct it)", or "Level: unknown. Allow motion access".
- "Baseline: centred", or "Baseline: turn the phone a little left".
- "60 fps, 1080p". "Light: good". "Steady".

PRODUCT §7.2 and DESIGN §8.20 still carry the old "needs 4.2" copy and a landscape-only framing screen; they should adopt these strings and a portrait layout (revision log).

### 3.3 Frame rate: what each choice unlocks

Title: "Frame rate". Default is 60. Copy for each option:

- **"60 fps (recommended)."** "Everything in your report: toss, contact, rhythm, leg drive, landing and shoulder tilt. Timing to about a sixtieth of a second." [Our inference; research 06 §4.1]
- **"30 fps."** "Works for your toss, contact height, leg drive, shoulder tilt and landing. Rhythm and the timing of your leg drive are about half as precise, and speed isn't available."
- **"120 fps."** "Sharper contact frames and finer timing. Needed for the experimental speed range, together with your target (T, body or wide) and room in the picture for the ball's first metres of flight. Best in daylight. Files are about twice as big and the phone gets warmer." (D4; section 2.3)
- **"240 fps slow motion."** "The sharpest contact frames. Daylight only. Big files. If you film in the Camera app's Slo-mo, import it through Files so we can read the real frame rate (see Import)." (section 11)
- **"25 or 50 fps (under lights)."** "Court lights can pulse 100 times a second on Australia's 50 Hz power. 25 or 50 fps avoids the pulsing where your phone offers it." (section 3.4)

Engineering note: in the web prototype the choice is a request. The app reads back the delivered rate (section 9.2) and shows it.

### 3.4 Light

Title: "Light"

- **Sun (all day):** "Keep the sun behind the phone or to its side. Filming into the sun turns you into a silhouette and hides the ball against a bright sky." (research 06 [S1] [Vendor claim]; research 06 §5.1)
- **Which end of the court:** "Most courts run north to south. In the morning, set the phone on the east side; in the afternoon, on the west side. If you're right-handed that means serving from the south end in the morning and the north end in the afternoon; left-handers, the other way round." Tennis Australia recommends a north-south court axis (research 02 [S41]). The derivation: the side view looks along the baseline, so on a north-south court the phone looks east or west, and the low sun must be behind it. [Our inference]
- **Midday:** "Midday is fine for the camera: the sun is high and to the side. It's the hottest and harshest part of the day for you and your phone, so keep sessions short." In the southern capitals the noon sun is always in the northern sky: about 71-86 degrees up in late December and only 24-39 degrees up in late June (Hobart 24, Melbourne 29, Sydney 33, Perth 35, Brisbane 39). [Our inference, computed as 90 − latitude ± 23.4 degrees]
- **Winter:** "In winter the sun stays low in the north, even at midday. If your court runs east to west, put the phone where it faces south." [Our inference]
- **Backlight:** "The sky behind you is very bright, so you look dark. Move to the other end of the court, or turn the phone so a fence or windscreen is behind you." (triggered by `cq.backlight`)
- **Background:** "A plain background helps us follow the ball: sky, a dark windscreen or a wall. Trees and busy courts behind you make it harder." (research 06 §5.3)
- **Night:** "Court lights work. They're dimmer than daylight, so timing is a little less precise and the fast parts of your swing will blur. Your toss, leg drive and shoulder tilt are fine." Social-play lighting is about 250 lux against more than 7,500 lux on an overcast day (research 06 [S33]; the current standard AS 2560.2:2021 was not read, research 06 [S55]). Tennis Australia's planning guide gives 250 lux for recreational and 350 lux for competition courts (research 02 [S41]).
- **Comp-night players** (D11; research 10 §7.1, M11): "If you can, record your first check-in in daylight. Night sessions still count, and we label them, but a daylight session gives you a clean starting point to compare with." A session recorded under lights carries a "Recorded under lights" chip (set by `cq.exposure` or by "Light: Lights" on the block card), and its downgrades are listed in the capture-quality sheet. A "Did it work?" comparison between a day session and a night session says so; COACHING owns the wording. [Our inference]
- **Flicker (under lights only):** "These lights pulse faster than you can see, which makes the picture flicker. If your phone offers 25 or 50 fps, use it at night. If not, keep 60 fps and we'll correct for it." Australian mains is 50 Hz, so affected lamps pulse at 100 Hz, which aliases to 20 Hz at 60 or 120 fps and to 10 Hz at 30 fps. Rates that divide evenly into 100 Hz (25, 50, 100 fps) sample the same phase each frame (research 05 §9.6; research 06 [S35], [S36]). Whether current LED court lights flicker is UNVERIFIED, so the app detects it rather than assuming it.

### 3.5 Heat

Title: "Hot day?"

"Phones are designed for air temperatures up to 35 °C, and a phone in full sun gets hotter than the air. To keep recording:
- shade the phone with a towel or cap over the top, clear of the lens;
- take it out of a thick case;
- don't charge it while you record;
- record your serves, then stop. Don't leave it running between blocks;
- if you see a temperature warning, stop. The phone may stop recording on its own.

Look after yourself too: drink water, wear a hat, and stop if you feel unwell. If anything hurts, stop and see a physio or doctor."

Basis: iPhones are rated for 0-35 °C ambient, and too-hot phones dim, slow or disable the camera (research 06 [S10], [S24] [Vendor claim]). Perth Airport averages 28.7 days a year at or above 35 °C and Adelaide (Kent Town) 21.5 days (research 06 [S39], [S40]) [Established]. How much hotter a phone gets on a sunlit hard court is UNVERIFIED (research 06 §10.1).

### 3.6 Storage

Title: "Space on your phone"

"At 60 fps, video takes about 90 MB a minute. A block of 15 serves, with ball pick-ups, is about 5 minutes, or roughly 450 MB while you record. After analysis we keep only the serves (about 7 MB each at 60 fps), or just key frames and stats, depending on your storage setting."

| Format | MB per minute (HEVC) | One 5 s serve clip | 5-minute block |
|---|---|---|---|
| 1080p30 | 60 | 5 MB | 300 MB |
| **1080p60** | 90 | 7.5 MB | 450 MB |
| 1080p120 | 170 | 14 MB | 850 MB |
| 1080p240 | 480 | 40 MB | 2.4 GB |
| 4K60 | 400 | 33 MB | 2.0 GB |

The landscape set-up at the fence prefers 4K, about 2 GB for a 5-minute block at 60 fps, so the storage check (`cq.storage`) runs before recording.

Per-minute sizes are a third-party compilation of iPhone Settings figures for the iPhone 8 to 15 (research 06 [S28] [Market data]) and must be re-measured on current phones. "Most Compatible" (H.264) roughly doubles them. The in-browser recorder uses a requested bitrate (section 9.2): 12 Mbit/s is 90 MB a minute. A kept serve clip spans 1.5 s before toss release to 2.5 s after contact (research 06 §10.2). Retention follows D8.

### 3.7 Recording a block

Title: "Record"

1. Block card (before each block): "Side: Deuce / Ad", "Serves: First / Second", "Standing at: Singles spot / Doubles spot", "Mostly: Flat / Slice / Kick" (optional default for the block, player-entered), "Aiming at: T / Body / Wide / Mixed" (optional; a single target is required for the experimental speed range, D4), "Wind: Calm / Breezy / Windy", "Light: Day / Lights". *(Wind matters: toss variability rises in wind, research 06 [S8]. Matched comparisons can then exclude windy sessions. The doubles spot moves the server 2-3 m, so the live check expects it (section 2.3), and matched comparisons keep the two spots apart. Comp-night players mostly serve in doubles, D11.)*
2. "Tap Record, then walk to your spot. You have 10 seconds." Countdown beeps; a chime marks the start.
3. "Serve 15 at your normal pace. Take your time between serves."
4. "Walk back and tap Stop."
5. Tally, straight away: "While it's fresh: how many went in?" with optional "Net / Long / Wide" counters (D3). Per-serve tags stay available in the review flow.

Pain rule, shown once per session start and whenever pain is logged: "If a serve hurts, stop. Sharp pain, pain that builds, or pain that's still there tomorrow is a reason to see a physio or doctor." (COACHING.md owns the full safety gate, D6.)

---

## 4. Court diagram brief (for the designer)

Three drawings, each with a portrait-default version and a landscape-at-the-fence variant, plus the optional rear view. They are built from `DESIGN.md` tokens; line weights and colours come from there. Dimensions below are real and to scale.

### Diagram A: plan view (top-down)

- **Canvas:** one half of the court plus the surround: the near baseline to just past the net, with 4.5 m of surround on the phone's side and 2 m elsewhere. Scale bar "0-5 m".
- **Court:** doubles width 10.97 m, singles 8.23 m, service line 6.40 m from the net (5.49 m from the baseline), centre service line, centre mark on the baseline (research 06 [S37]). Draw only the near half in full; the far half fades out.
- **Server:** a small top-down figure (head circle plus shoulder bar) on the deuce side, 0.6 m to the right of the centre mark and 0.2 m behind the baseline, shoulders angled side-on (left shoulder towards the net for the right-handed variant). Label "You".
- **Phone (default):** an upright phone glyph on the baseline extension, 7.5 m from the centre mark (2.0 m outside the doubles sideline). Label "Phone, upright, 7-8 m from the centre mark". The dimension line runs from the centre mark to the phone, because D1 measures from the centre mark.
- **Field-of-view wedge:** from the phone, pointing along the baseline towards the server, with a half-angle of 20.5 degrees (portrait, 1x), lightly filled. The baseline runs down the middle of the wedge, and the wedge is about 4.5 m wide at the server. A small arrow in the wedge reads "Into court" towards the net.
- **Sun:** a sun glyph behind the phone, with the caption "Sun behind the phone".
- **Callouts:** "Outside the outer sideline", "In line with the baseline", "Baseline up the middle of the screen".
- **Variant A2 (alternative):** a sideways phone glyph at the side fence, 9 m from the centre mark, with a 34-degree half-angle wedge. Label "Or: sideways at the fence, 8.5-9.5 m".
- **Ghosts:** an ad-side figure 1.2 m left of the centre mark, captioned "Same phone spot for the ad side; you'll look smaller". A doubles-spot figure 2.5 m right of the centre mark, with an arrow moving the phone 1.5-2 m further out, captioned "Serving from your doubles spot? Phone 2 steps further back".
- **Mirrored left-hander version** (phone on the left).

### Diagram B: side elevation (what the camera sees)

- **View:** looking along the baseline, as if standing behind the phone.
- **Ground line** across the width. The server stands 6.75 m from the phone (7.5 m from the centre mark), 1.75 m tall.
- **Toss:** a dotted arc from release (1.7 m, just in front of the head) up to an apex at 3.5 m, about 0.3 m towards the net, and down to contact at 2.6 m. Label "Toss apex". A fainter dashed arc peaks at 4.3 m, labelled "A very high toss".
- **Phone** at left, upright, 1.45 m high, drawn level with a small spirit-level glyph.
- **Two field-of-view lines** from the lens, at plus and minus 33.7 degrees (portrait, 26 mm), meeting the server's plane at about 5.9 m and well below the ground. Shade the band from 4.5 m to the top edge and label it "Room above your toss (needs 4.5 m; 4.7 m is ideal)". The court from about 2 m in front of the phone is inside the frame: "An upright phone sees plenty of court; that's fine".
- **Callouts:** "Level, not tilted up", "1.3-1.6 m high".
- **Variant B2 (landscape at the fence):** the phone sideways, 1.6 m high, 9 m from the centre mark (8.25 m from the server), with field-of-view lines at ±20.5 degrees meeting the server's plane at about 4.7 m. A small inset shows the phone tilted up 5 degrees, captioned "Tilted a little? Fine when the app measured it".
- **Inset** (replaces the earlier "Portrait: loses your landing" inset): "Upright, between courts" with a tick glyph; "Sideways, at the fence" with a tick glyph; "Tilted without the level guide" with a cross glyph. Glyphs, not emoji.

### Diagram C: the phone screen during framing (portrait; landscape variant)

- **Live preview** with a light guide overlay (keep it minimal, research 09 [S16]).
- **Baseline guide:** a dashed vertical line on the centre column, from the bottom edge up to the horizon, labelled "Baseline along here". It turns solid when `cq.yaw` passes.
- **"Stand here" band:** a vertical band about 20% of the width, centred on the baseline guide, from the floor guide up to head height.
- **Floor guide:** a dashed line at about two-thirds of the height in portrait (about 80% in landscape): "Feet about here".
- **Toss zone:** a soft shaded band over the top 10% in portrait (15% in landscape): "Keep this clear above your toss".
- **Level guide:** a horizon line that rotates with roll, plus a centre dot that moves with pitch. It becomes solid with the text "Level" when within 2 degrees. When the app has asked for an upward tilt at the fence, the dot's target moves to the requested pitch.
- **Checklist:** a collapsible sheet along the bottom in portrait (a rail on the right in landscape), with glyph plus text: Level, Baseline, In frame, Room above, Room ahead, Steady, Light, Ball seen, "60 fps".
- **Record button:** "Ready" when the core checks pass. Otherwise it shows the one fix, with "Record anyway" in an overflow menu. For the headroom block the overflow offers "Record without toss height" instead (section 9.8).
- `DESIGN.md` §10.3 (R2-R6) currently specifies these screens in landscape only, with a "Turn your phone sideways" prompt; they need portrait layouts (revision log).

### Diagram D (optional second angle): plan view

- The same court. A second phone on the back fence behind the server, 5-7 m behind the server and within 1 m of the server's line towards the non-hitting side. Label "2.5-3.3 m high, tilted down a little, standard 1x lens". Its field-of-view wedge reaches both far service boxes.
- A dashed sight line over the net tape to the far service line, captioned "High enough to see the far lines over the net".

Alt text for A: "Top-down tennis court. You serve from just behind the baseline near the centre. The phone stands upright outside the court on your hitting-arm side, in line with the baseline, 7 to 8 metres from the centre mark, facing along the baseline at you, with the sun behind it. A second option shows the phone sideways at the side fence, 8.5 to 9.5 metres out."

Alt text for B: "Side view of you serving. The upright phone at chest height sees from the court up to about 6 metres above it at your spot, well above even a very high toss."

Alt text for C: "Phone screen held upright. A dashed line up the middle shows where the baseline should run. You stand on it, with your feet about two-thirds of the way down the screen. The top of the picture is kept clear for your toss. A checklist along the bottom shows level, baseline, room above and the other checks."

---

## 5. How many serves

### 5.1 Serve-in rate (a proportion)

Recreational first-serve-in rates sit near 53-54% (research 06 [S30] [Vendor claim]), close to the worst case for variance. Wilson 95% intervals (research 06 [S32]), computed [Our inference]:

| Serves in the session | Example | Wilson 95% interval | Width | Smallest session-to-session change detectable (80% power) |
|---|---|---|---|---|
| 8 | 4/8 | 22-78% | 57 pp | n/a |
| 12 | 7/12 | 32-81% | 49 pp | 57 pp |
| 15 | 8/15 | 30-75% | 45 pp | 51 pp |
| 20 | 11/20 | 34-74% | 40 pp | 44 pp |
| 30 | 17/30 | 39-73% | 33 pp | 36 pp |
| 60 | 33/60 | 42-67% | 24 pp | 25 pp |
| 100 | 55/100 | 45-64% | 19 pp | 20 pp |

**Conclusion:** no practical session size answers "Am I getting more first serves in?" on its own. Serve-in rate is always shown with n and its interval, and trends pool sessions into rolling windows of about 100 serves (D7; research 06 §7.1). Session size should instead be chosen for the process metrics that lead progress (D7).

### 5.2 Toss spread (a standard deviation)

95% interval for a standard deviation from n serves, as a multiple of the observed value (chi-square method, research 06 [S31]), and the reduction needed before two sessions of n serves each can show a real improvement (one-sided α 0.05, 80% power, F-test). Computed [Our inference]:

| Measured serves n | 95% interval | Relative SE | Detectable reduction between two sessions |
|---|---|---|---|
| 5 | 0.60×-2.87× | 35% | about 75% |
| 8 | 0.66×-2.04× | 27% | 63% |
| 12 | 0.71×-1.70× | 21% | 54% |
| 15 | 0.73×-1.58× | 19% | 50% |
| 20 | 0.76×-1.46× | 16% | 44% |
| 30 | 0.80×-1.34× | 13% | 37% |
| 40 | 0.82×-1.28× | 11% | 33% |

How to read it: with 15 serves, an observed toss-height spread of 20 cm means the true spread is probably between about 15 and 32 cm. Two sessions of 15 serves can confirm a halving of the spread, not a 20% improvement. Pooling sessions (for example 3 sessions, 40 or more serves) tightens this.

Measurement noise adds to the observed spread: observed = √(true² + error²). With a true spread of 8 cm, a 3 cm tracking error inflates it by 7% and a 5 cm error by 18% (research 06 §7.2). Professional women's toss spreads were 6-7 cm (research 06 [S8]) [Established]; recreational spreads are not published (UNVERIFIED) and are expected to be larger, which makes tracking error relatively smaller. [Our inference]

### 5.3 Recommendation

- **A block is 15 serves** (12-20 is fine) of **one stratum**: one court side × first or second serve. The player's intended type and target are block defaults that can be changed per serve in review (D3). Pooling flat, slice and kick, or the two sides, inflates the spread (research 06 §7.2, citing [S8]). [Our inference]
- **Why 15 and not 20:** going from 15 to 20 serves narrows the spread interval only from 0.73-1.58× to 0.76-1.46×, but costs a third more time and shoulder load. About 15-20% of serves are expected to fail at least one per-serve check, so 15 recorded serves usually yields the 12 measured serves a comparison needs. Research 06 §7.3 suggested 20 per stratum for toss statistics. This spec deliberately chooses 15 and relies on honest intervals and pooling instead. [Our inference] Copy: "15 serves is the sweet spot. If you've got the energy and the balls, 20 is even better."
- **Capture-side minimums** (display rules are owned by `METRICS.md`):
  - 5 measured serves for a mechanics observation and a representative key frame (research 06 §7.3; the OTSA checklist used 3 serves, research 06 [S4]);
  - 8 measured serves for a spread statistic, shown with its interval and marked as an early read;
  - 12 measured serves in *each* session for a matched "Did it work?" comparison (D6, D7);
  - 3 sessions for a trend verdict (research 06 §7.3).
- **Representative clip:** the key frame shown is the median serve, not the best one (research 06 §7.3).

### 5.4 Deuce/ad and first/second serve guidance (copy)

- "One side per block. Start on the deuce side (the right half as you face the net) unless you're working on the ad side. The phone stays where it is. We calibrate each side separately and only compare like with like."
- "If you only have time for one side, use the same side each session so your progress lines up."
- "Record second serves as their own block. A kick or slice toss sits in a different place, usually further back and to the side, so mixing them in would make your toss look less consistent than it is." Basis: elite adolescents made contact about 17 cm further forward on flat serves than on kick serves (research 03 §7 [S35]) [Established]. That the second-serve toss sits slightly further back and to the side is a coaching inference (research 03 §10).
- "Serving points (first serve, then a second if you miss) is coming later. For now, pick first or second for the block."

### 5.5 Session templates (booked court)

Sized for a 30-60 minute booking (research 02 §6.1 and implication 4). [Our inference]

| Template | Flow | Serves recorded |
|---|---|---|
| **Check-in (30 min)** | Warm up 10 min → Block A (15 first serves, deuce) → tally → read the focus → drill 10 min | 15 |
| **Experiment (45-60 min)** | Warm up → Block A (15) → focus and drill 10 min → Block B (15, same side and serve) → "Did it work?" (matched A vs B) | 30 |
| **Both sides (45 min)** | Warm up → Block A deuce (15) → Block B ad (15) | 30 |
| **Second-serve check-in (30 min)** | Warm up 10 min → Block A (15 second serves from your usual side) → tally → read the focus → drill 10 min | 15 |

The same-session re-test is confounded by fatigue and warm-up, so the verdict text must say so ("Compared within one session; check again next time"). COACHING.md owns that wording. [Our inference]

The second-serve check-in was added for the launch segment, whose match-night pain is double faults and too few first serves in (D11; research 10 §7.1, M3). Second serves are their own stratum (section 5.3), so the template never mixes them with first serves. Players who serve from a doubles spot in comp can record the block from that spot; the block card records it (section 3.7).

---

## 6. The optional second angle: raised rear ("Outcomes view")

### 6.1 Set-up copy

Title: "Add a view from behind (optional)"

Intro: "A raised view from behind shows things the side view can't: your toss drifting left or right, your knee bend, how your shoulders tilt at contact, and where the ball lands."

1. "Clip the phone to the back fence behind your serving spot, as high as you can: 2.5 to 3.3 m is ideal, and 2 m at the least. About 5 to 7 m behind you is right."
2. "Centre it behind where you serve, or up to a metre towards your non-hitting side so your body doesn't hide the ball."
3. "Turn it sideways and use the standard 1x lens. Tilt it down a little so your feet and both far service boxes are in the picture. Use 4K if your phone offers it."
4. "Check the net tape isn't covering the far service line. If it is, the phone needs to go higher."
5. "Tap the four corners we show you on the far court." *(section 6.3)*

Fallback card: "Only room for the 0.5x lens? It still works for in/out and placement suggestions, but not for your knee bend, shoulder tilt, toss drift or speed." In the engine, the rear mechanics metrics and `speed-average-rear` are then `unavailable` (reason `cq.lens`). The 0.5x lens is not supported for metrics (METRICS §1.1), and it roughly halves the ball's size in the far box, which is already marginal at 1x (6.2, honest limits).

**Why these conditions** [Our inference, from gap geometry §2-3]:
- **What keeps the back knee near the image plane is the viewing direction, not the tilt.** The knee nearer the rear camera is the back knee, whose foot sits roughly parallel to the baseline. Its flexion plane is then within about 0-20 degrees of a rear image plane, so the 2D angle is nearly true. In simulation, a camera 2.8 m high and 6 m behind the server read the back knee with a bias of about 0 degrees and an SD of 5-7 degrees, putting 11-13% of serves in the wrong band (gap geometry §3.3). Only that position has been simulated. The spec keeps set-ups near it:
  - within 1 m of the server's line, so the azimuth error stays under about 10 degrees;
  - a ray from the lens to the knee no steeper than about 25 degrees, that is, camera height − 0.5 m ≤ 0.47 × the distance behind the server (at most 3.3 m high at 6 m, or 2.85 m at 5 m).
- **The downward tilt only does the framing.** Tilt the phone down about 8 degrees (up to 12 if the feet are cut off), which frames the feet, the far service line and most tosses. At 2.8 m high and 6 m behind the server: feet 25 degrees below level, far service line 7 degrees below, a 4.0 m toss 11 degrees above, for 36 degrees in all, inside the 41-44 degrees of a landscape 1x frame. Tosses above about 4.3 m may leave the top with the 26 mm lens. Toss drift is still measured from the rest of the track, because the ball's sideways speed is almost constant. The tilt itself is removed before any angle is measured, using the pitch and roll recovered from the court-corner tap (6.3).

### 6.2 What it unlocks, exactly

| Capability | Metric id | Rear capture conditions | Label |
|---|---|---|---|
| Toss left/right drift and its spread | No canonical id yet; `METRICS.md` to assign | 1x; ball visible from release to below the apex | Spread `measured` (relative); absolute offset `estimated` |
| Knee-bend band, nearer (back) knee | `knee-bend-band` | 1x; 2.5-3.3 m high; 5-7 m behind the server and within 1 m of the server's line; tilted down about 8 degrees (at most 12); ray to the knee no steeper than about 25 degrees (6.1); hip, knee and ankle of the back leg unoccluded at maximum bend; keypoints rectified to a level virtual camera from the court-corner tap (6.3) | `experimental` band |
| Shoulder-over-shoulder at contact | `shoulder-over-shoulder-contact` | As the knee band, with both shoulders visible at contact | `experimental` |
| Serve in, net, long, wide | `serve-in-rate`, `first-serve-in-rate`, `double-faults` | Corner tap with RMS under 3 px; far service line above the net tape; 4K preferred. 0.5x is allowed for these | Suggestions are `experimental`; a suggestion the player confirms is stored as `player-entered` with provenance `auto-suggested` (D3) |
| Placement zone (T, body, wide) | `placement-zone` | As above | `experimental`; bounces within about 20-30 cm of a line in depth show as "close call" (research 06 §6.3) |
| Average speed from contact to the bounce | `speed-average-rear` | 1x; corner tap; bounce located in video in the far box above the net tape; proven time base; 60 fps minimum, 120 better | `experimental`, rounded range only (D4). Audio, if on, times contact only |
| Contact left/right of the body | No canonical id | From the rear clip | `estimated` |
| Tossing-arm direction and hip turn (two of Kovacs's checkpoints that the side view cannot see) | Not metrics in v1 | Key frames only | Shown as a picture, never scored (`research/gaps/intuitive-tennis-kovacs-primary-content.md` §4.1) |
| Two-phone 3D toss | Not in v1 | Later; needs sync (research 06 §8.2) | |

What it does **not** unlock: spin (always `unavailable`, D4), serve type (still player intent), and any mixing of statistics with the side view (D1). There is no audio flight-time speed path in either view: audio only times contact (D4).

**Honest limits.** A ball at the far service line is only about 7 px across at 4K on 1x and about 4 px at 1080p, below the 8 px detection threshold, so far-court detection is marginal (research 06 §8.1). Depth resolution in the far box is 8-19 cm per pixel depending on camera height (research 06 §6.3). Automatic outcomes therefore stay `experimental` until the rear-view validation passes (research 05 §11.3: 95% or more correct for bounces more than 30 cm from lines). The rear mechanics bands are `experimental` until the knee-projection test (gap geometry §9, test 1) and real annotated footage agree.

### 6.3 Court-corner tap (rear view)

The near-net corners are hidden by the net, so the tap uses far-court ground points [Our inference]:

1. far service line × left singles sideline;
2. far service line × right singles sideline;
3. far baseline × left singles sideline;
4. far baseline × right singles sideline;
5. optional: the far T (centre service line × service line), used as a check.

Fit a homography to the court model (`ball/homography.ts`, `COURT_KEYPOINTS`) with RMS reprojection error under 3 px at 1080p (research 06 §14, check 6). Otherwise ask the player to re-tap. The rear set-up is stored per court (by the player's court name) so it can be re-used when the phone goes back in the same place, subject to `cq.camera-stability`.

**Rectification for the rear mechanics bands.** With the intrinsics (native) or the assumed 1x lens (web), the same homography gives the camera's rotation relative to the court, and so its pitch and roll. Before any rear-view 2D angle (`knee-bend-band`, `shoulder-over-shoulder-contact`) is taken, keypoints are mapped through the rotation homography to a level virtual camera, as in the side view (section 2.4). The motion-sensor reading is the cross-check. If the two disagree by more than 2 degrees, the player is asked to re-tap, and the rear mechanics bands stay `unavailable` until they agree. [Our inference]

### 6.4 v1 scope

- **v1:** the rear view is its own session type ("Outcomes view"), analysed alone.
- **v1.1:** paired views. If side and rear clips of the same block are both imported, serves are matched by order and toss-apex time. The rear clip then supplies experimental outcome suggestions for the side-view serves. Statistics are still computed per view.
- **Later:** synchronised two-phone 3D toss (toss-parabola sync, research 06 §8.2).

---

## 7. Etiquette, privacy and safeguarding at public courts

### 7.1 Copy (shown once before the first recording, and from the Record tab's "?" at any time)

Title: "Filming at the courts"

- "Film yourself, not others. Frame the shot so the fence or windscreen is behind you where you can."
- "If people are on the next court, a quick 'I'm just filming my serve' goes a long way."
- "If kids are having a lesson in the background, move your phone or wait until they've finished."
- "Some clubs and councils have rules about filming. If there's a sign or you're not sure, ask."
- "Your videos stay on this phone. Nothing is uploaded."
- "Under 18? A parent or guardian needs to be with you and agree to the recording."
- "Coaches: film a junior player only with the parent's or guardian's permission and the player's agreement."
- "Don't leave your phone on the fence and walk away."

### 7.2 Product rules

- **Audio off by default.** A phone's microphone may count as a listening device under state and territory surveillance-device laws, and recording other people's private conversations is restricted in most jurisdictions (research 06 [S44]; research 07 §7) [Regulation]. The in-app recorder requests video only. An opt-in toggle "Use the hit sound for timing" explains: "Your phone listens for the moment of contact. The sound is turned into timings on this phone and deleted; it's never saved or sent. Leave this off if people are talking nearby." When on, audio is analysed on the device into contact-onset timestamps (`video/audio.ts`) and not stored. Audio is used only to time contact (D4). It never measures speed: in the side view the bounce is out of frame and its distance unknown, which would give about ±20% error (gap geometry §7), and the rear view's speed path locates the bounce in video. Imported clips already contain audio: it may be used for timing on the device, and the app's stored copy drops the audio track by default. [Our inference, following research 06 §11 and research 07 §7]
- **Recording indicator** (App Store 2.5.14, research 07 [S30]): a red dot, the word "Recording" and a running timer are visible whenever the camera records, including on the dimmed screen.
- **No sharing in v1.** Nothing is uploaded (D8). Exports are JSON/CSV (D8). If clip export is added later, non-server people are blurred first (research 06 §11). [Our inference]
- **Extra people** are detected (`cq.extra-people`). The app notes their presence, never analyses them, and never uses footage of bystanders for anything (research 07 §7).
- **Location metadata.** Imported iPhone videos usually carry location in their metadata [Our inference; UNVERIFIED which keys]. The app does not read it and does not copy it into derived data.
- **Minors.** Tennis Australia's Safeguarding Children Code requires prior, specific parent or guardian approval and the child's consent for filming by people it covers, and explicitly allows parents to film their own child (research 06 [S41]) [Regulation (sport policy)]. The age policy, including any Declared Age Range check, belongs to `PRODUCT.md` (research 07 §3, §9).
- **Venue rules** can be stricter than the law; Play by the Rules asks people to respect requests not to be filmed (research 06 [S43]).
- **Filming in public is generally lawful** in Australia; there is no general right to privacy in one's image, and the Privacy Act does not apply to individuals acting in a private capacity (research 06 [S44], [S45]) [Regulation]. Drones are not an option (research 06 [S46]).

---

## 8. Automatic quality checks

### 8.1 Conventions

**Severity**

- `info`: shown only in the capture-quality detail sheet. No effect on labels.
- `warn`: shown on the session summary with its fix. Dependent metrics are downgraded: status `estimated` instead of `measured`, a wider uncertainty, or a lower `confidence`, per `METRICS.md`.
- `block`:
  - **Live (before recording):** the Record button does not reach "Ready". "Record anyway" stays available in the overflow menu for every live block **except** `cq.toss-headroom` below 4.3 m, which D1 says blocks recording. For that one, the overflow offers "Record without toss height" instead (section 9.8). The failing check ids are stored in the capture context.
  - **After recording:** the affected scope (serve, clip or metric set) is excluded from statistics, and the metric shows `unavailable` with the check id as its reason. Excluded serves remain playable.

**Scope:** `live` (framing assistant), `clip` (whole recording), `serve` (one detected serve) or `session`.

**Output:** each check emits a `QualityCheck` (`types.ts`) with the extensions proposed in section 12. A metric that is downgraded or unavailable because of a capture problem carries the check id as its reason code (for example `unavailableReason: 'cq.toss-headroom'`), so the UI can link straight to the fix. Where `METRICS.md` has its own reason code for the same condition, the check id is kept alongside it (for example `cq.camera-level` with `TILT_UNKNOWN`). `METRICS.md` owns the final status mapping; the gating matrix in 8.3 is the capture side's proposal.

**Units:**
- **Subject sizes are raw pixels on the subject** in the decoded, rotation-corrected frame: standing body height in pixels and ball diameter in pixels. They are not scaled by frame height, which would penalise the portrait default: a 450 px player in a 1080 × 1920 frame would scale to about 253 px and warn, although portrait was chosen for its pixel density.
- **Frame-level thresholds** (resolution) use the frame's short side.
- **Image-motion thresholds** (stability) are stated at a 1080 px short side and scaled by `shortSidePx / 1080`.
- Normalised coordinates follow `types.ts` (0-1, origin top-left, rotation-corrected); distances use isotropic frame-height units (METRICS §1.1).

**Thresholds are initial values** (UNVERIFIED), taken from research 06 §14 and the gap studies where they exist, and are to be tuned with the synthetic generator and the annotation mode (section 13). They live in one config module, `analysis/quality/thresholds.ts`. The subject-size and ball-size thresholds are shared with METRICS (`subject-size`, METRICS §3.25) and are held once, in `metrics.json`; `thresholds.ts` reads them from there (8.5).

### 8.2 Check catalogue

Each entry gives: **how** (web prototype computation from decoded frames, pose or ball data), **thresholds**, **severity**, **message / fix** (player copy) and **affects** (metric ids).

#### A. File and timing

**`cq.decode`** · clip · *how:* `probeVideo` succeeds and `openFrameSource` finds a decode path (WebCodecs, or the media-element fallback with `missingIndices` empty or under 1%). *Thresholds:* probe error or decode failure → block; media-element path → info; over 1% of frames unreachable → warn. *Message:* "We can't open this video." / fix: "Try exporting it again from Photos or Files as a standard video." *Affects:* everything (block).

**`cq.frame-rate`** · clip · *how:* `VideoMeta.captureFps` after the time-base step (section 11). *Thresholds:* 100 fps or more: pass, with info "High speed: sharper contact frames"; 50-99: pass; 24-49: warn; under 24: block. *Message (warn):* "Filmed at 30 fps. Your toss, contact height and shoulder tilt are fine; timing is less precise." / fix: "Use 60 fps next time." *Affects:* `rhythm-release-to-contact`, `rhythm-spread`, `trophy-pause`, `drive-time`, `contact-height-ratio` and `contact-forward` (downgraded, since the contact frame is uncertain by about ±17 ms at 30 fps, research 06 §4.1); `speed-experimental` is `unavailable` below 120 fps (D4).

**`cq.time-base`** · clip · *how:* `probe.timeBase.status` (`proven` or `unknown`) and `kind`; for in-app recordings the capture context proves it; for imports, the slow-motion answer plus `gravityTimeScaleCheck` (section 11.3). WebM recordings (estimated timeline, video README) are marked `estimated-timeline`. *Thresholds:* proven, or confirmed by physics within tolerance: pass; player answer with physics unavailable: warn; player answer contradicted by physics, or `possible-rendered-slomo` unresolved: block (timing only). *Message:* "We couldn't confirm this video's real speed, so timings are hidden." / fix: "Tell us if it was slow motion, or import the original from Files." *Affects:* timing metrics, `drive-time`, `speed-experimental` and `speed-average-rear` (unavailable when blocked). Positions (toss, contact, hip rise, landing) do not depend on the time base and are unaffected. [Our inference]

**`cq.dropped-frames`** · clip and serve · *how:* `analyzeFrameTiming` on real timestamps: gaps over 1.5× the median interval, variable-frame-rate segments (for example 60 → 30 fps in low light, research 06 [S14]), and `droppedFrameEstimate`. Map each gap to serve windows [release − 0.2 s, landing + 0.2 s]. *Thresholds:* no gap in any serve window and under 1% overall: pass; gaps outside serve windows, or 1-5% overall: info; a gap inside a serve window: warn for that serve; a gap within ±0.1 s of contact: block for that serve's timing and speed. *Message:* "Your phone skipped some frames during 3 serves, so their timing is left out." / fix: "Close other apps, keep the phone cool, and use 1080p." *Affects:* per serve: timing metrics, `drive-time`, contact metrics, `speed-experimental`.

**`cq.resolution`** · clip · *how:* the displayed frame's **short side** (width in portrait, height in landscape). *Thresholds:* 1080 or more: pass; 720-1079: info (player size decides); 480-719: warn; under 480: block. *Message:* "This video is low resolution, so you're small in the picture." / fix: "Record at 1080p or 4K." *Affects:* through `cq.player-size` and `cq.ball-visibility`.

**`cq.compression`** · clip · *how:* bits per pixel per frame = (video track bytes × 8) / (duration × width × height × fps). *Thresholds:* 0.05 or more: pass; 0.03-0.05: info; under 0.03: warn. Heavily re-compressed files (for example sent through a chat app) fall here. The values are guesses to tune. *Message:* "This video looks heavily compressed, which blurs the ball." / fix: "Import the original from Photos or Files instead of a copy sent through a chat app." *Affects:* toss and contact metrics (downgraded through ball-visibility confidence).

**`cq.clip-length`** · clip · *how:* duration and size. *Thresholds:* up to 15 min: pass; 15-30 min: info ("This will take a while"); over 30 min or over 4 GB: warn, and the trim step is offered. *Affects:* none (performance only).

#### B. Framing and geometry

**`cq.orientation`** · live and clip · *how:* displayed width vs height, the declared set-up, and the estimated camera-to-player distance d ≈ f_px · H / body_px (f_px from `videoFieldOfView`, or the assumed 1x lens with about ±6% error; METRICS §1.1). *Thresholds:* side view, portrait: pass (the default set-up). Side view, landscape with d between 7.5 and 10.5 m (the fence band of 8.5-9.5 m from the centre mark, give or take the serving offset): pass. Side view, landscape outside that band: info; the headroom, tilt and player-size checks decide. Rear view: landscape: pass; portrait: info. *Message (info, landscape close in):* "Upright usually works better this close to the court." / fix: "Stand the phone upright." *Affects:* nothing directly. It sets the orientation-dependent inputs of `cq.toss-headroom` (the toss-offset allowance) and `cq.court-room` (the field of view).

**`cq.view`** · clip · *how:* combine four cues from the first 5 or more detected serves [Our inference; thresholds to tune]:
(1) `estimateFacingSide` during setup and at contact. Side-chest: face visible at setup ('front'), profile at contact. Rear: back or profile at setup, 'back' at contact. Side-back: 'back' at setup, profile at contact.
(2) Shoulder width relative to torso length at contact: narrow (under about 0.35) means a side view; wide (over about 0.6) means rear or front.
(3) Post-contact ball direction: across the frame means side; rising towards the frame centre while shrinking means rear; growing means front.
(4) Landing-step direction: horizontal in the image means side; upward in the image means rear.
Output: `side-chest`, `side-back`, `rear`, `front`, `unknown`, with a confidence. *Thresholds:* detected view matches the declared view: pass; `side-back`: warn; `rear` detected when side was declared (confidence 0.8 or more): ask the player and re-route to the rear pipeline; `front` or `unknown`: block for positional metrics. *Message (side-back):* "You filmed from your non-hitting side. Most things still work, but your body sometimes hides the toss release." / fix: "Next time put the phone on your right" (mirrored for left-handers). *Affects:* `front`/`unknown`: all positional and body metrics unavailable; timing `experimental`. `side-back`: release-based rhythm and toss metrics downgraded.

**`cq.camera-side`** · clip · *how:* profile handedness vs `inferHandedness`, and the into-court direction from the landing step vs the direction expected for that handedness and side. *Thresholds:* consistent: pass; inconsistent with confidence 0.8 or more: warn and ask. *Message:* "Were you serving left-handed today?" (or "Is the net on the left of your video?"). *Affects:* everything positional until resolved; the answer fixes the axis.

**`cq.player-size`** · clip (per side) · *how:* standing body height in **raw pixels**: `estimateStandingBodyHeight` (setup frames) × the decoded frame's pixel height. *Thresholds* (shared with METRICS `subject-size`; the values live in `metrics.json` and are proposed here): 300 px or more: pass; 250-299: info; 200-249: warn (the pixel-density warning); under 200: block for pose-based metrics. *Basis:* in the ROI evaluation a 216 px player (portrait, 12 m) was detected in 100% of frames with about 0.03 BH error, mirror-tolerant, and nothing smaller was tested (pose README); research 06 §3.4 suggested 250 px as the warning. [Established for the rendered-clip result; thresholds Our inference] *Message (warn):* "You're quite small in the picture, so readings are less certain." / fix (landscape): "Record in 4K, or move the phone a step closer." / fix (portrait): "Move the phone a step closer, or record in 4K." *Affects:* warn: `leg-drive`, `loading-depth`, `deep-bend-flag`, `shoulder-tilt-trophy`, `landing-distance` and absolute heights downgraded (rear view: `knee-bend-band` and `shoulder-over-shoulder-contact` too). Block: those unavailable; ball-based toss metrics continue with a downgraded scale.

**`cq.player-in-frame`** · serve · *how:* for frames from setup to landing, the fraction of core landmark samples (nose, shoulders, elbows, wrists, hips, knees, ankles, heels) with visibility 0.5 or more lying inside the frame with a 3% margin (`trackingQuality().inFrameFraction`). Both hips must also be visible from ball release to contact for `leg-drive`, `drive-time` and `loading-depth`. *Thresholds:* 0.98 or more: pass; 0.90-0.98: warn; under 0.90: block for that serve's pose metrics. *Message:* "Part of you went out of the picture on 2 serves." / fix: "Stand in the middle of the picture, or move the phone back a step." *Affects:* per serve: body metrics (`leg-drive`, `drive-time`, `loading-depth`, `deep-bend-flag`, `shoulder-tilt-trophy`), `landing-distance`, `toss-forward` and `contact-forward` (which need the front foot).

**`cq.feet-visible`** · clip and serve · *how:* heel and foot-index landmarks with visibility 0.5 or more in setup and landing windows, and at least 0.1 m of ground below the floor line (`BodyHeightEstimate.groundY`) inside the frame. *Thresholds:* both: pass; feet occluded or cut off: warn. *Message:* "We can't see your feet clearly." / fix: "Make sure your feet are in the picture, with a little ground below them." *Affects:* `landing-distance` unavailable; the height scale falls back to ankles (downgraded, which also downgrades `leg-drive` and `loading-depth`); `toss-forward` and `contact-forward` unavailable when the front toe is missing.

**`cq.toss-headroom`** · live, serve and session · *how:*
- **Live:** from the stand-tall frames, on rectified coordinates (section 2.4), the frame top at the player's plane is T_body = (y_feet − y_top) / H_px × stature, where y_top is the lowest point of the rectified top edge over the player's column (section 9.4). The toss-offset allowance is then subtracted: T = T_body − 0.3 m × tan(V/2) for the active orientation. That is 0.11-0.12 m in landscape (the value in gap geometry §6.8) and 0.20-0.22 m in portrait, because the toss plane sits about 0.3 m nearer the camera. The practice-toss apex margin is a second input (section 9.5).
- **Recorded:** per serve, whether the toss apex lies inside the frame with at least 4 ball diameters (about 0.27 m) to the top edge, and whether the ball left through the top edge (the track leaves at y ≤ 0.01 while rising and re-enters falling).

*Thresholds:*
- **Live:** T ≥ T_min: pass. T_min = max(4.5 m, 1.54 × stature + drop_high + 0.35 m), with drop_high 1.00 m for men and 1.25 m for women or when sex is not given (gap ranges §6.3, item 5). T_min rises above 4.5 m only for players taller than about 1.88 m (women, or sex not given) or 2.05 m (men). 4.3 m ≤ T < T_min: info ("very high tosses will be estimated"). T < 4.3 m: block, not bypassed by "Record anyway" (section 9.8). The readout also shows the 4.7 m target.
- **Per serve:** apex inside with margin: pass; inside with less margin: info; ball left the frame: warn, and the apex is extrapolated from the parabola with gravity constrained and labelled `estimated` (reason "apex above frame"). If the gap between exit and re-entry exceeds 0.65 s (apex more than about 0.5 m above the frame), the apex is `unavailable` (gap ranges §6.4).
- **Session:** over 25% of serves extrapolated: warn, and the next-time tip is "Move the phone about 1 m back, or raise it".

*Message:* "Your toss went out of the top of the picture on 5 serves." / fix: "Move the phone back a step or raise it." *Affects:* per serve: `toss-apex-height` and `toss-drop` downgraded (extrapolated) or unavailable when fewer than 3 samples remain on either side of the apex. Extrapolated serves are excluded from `toss-height-spread`; if fewer than 8 remain, the spread is unavailable. A block recorded through "Record without toss height" has `toss-apex-height`, `toss-drop` and `toss-height-spread` `unavailable` for **every** serve, including those whose apex stayed in frame, because keeping only the lower tosses would bias the spread low.

**`cq.court-room`** · live and clip · *how:* horizontal room ahead of the front toe (into court) and behind the back heel, in metres at the player: (edge distance in frame units) × `mPerHU`. *Expected values* [Our inference, section 2.2]: portrait at 7-8 m from the centre mark (horizontal half-angle ±20.5 degrees for 26 mm and ±22.1 degrees for 24 mm, about 2.6 m either side at 7 m from the phone): 2.1-2.8 m ahead on the camera-side half and 2.8-3.7 m on the far half. Landscape at the fence: 5 m or more. *Thresholds:* 1.8 m or more ahead and 1.0 m or more behind: pass; 1.2-1.8 m ahead: warn; under 1.2 m ahead: block (live). **Speed rule:** when the experimental speed toggle is on and the frame rate is 120 fps or more, room ahead under 2.7 m: warn, and `speed-experimental` is `unavailable` (reason `cq.court-room`). 2.7 m = contact up to 0.7 m ahead of the front toe (gap ranges §7.6) + 50 ms of flight at 160 km/h (2.2 m), the window speed method A uses (METRICS §3.22). Portrait meets it on the camera-side half only from about 8-8.7 m. *Message:* "There isn't much room in front of you in the picture, so your landing may be cut off." / speed: "We need to see more of the ball's flight to estimate speed." / fix: "Move the phone back a step." (Speed: "Move the phone to about 8.5 m, or clip it sideways to the side fence.") The fix never says to turn the phone towards the net, which would break `cq.yaw`. *Affects:* `landing-distance` (unavailable when the landing is out of frame), `contact-forward` (downgraded), `speed-experimental` (speed rule).

**`cq.camera-level`** · live and clip · *how:*
- **Sensor (in-app):** pitch and roll from `DeviceMotionEvent` (section 9.3) or CoreMotion (section 10), logged throughout recording. Tilt source `sensor`.
- **Picture:** the baseline's vanishing point (row → pitch), and fence and net posts (roll), as a cross-check. When there is no sensor reading (motion permission denied, or an import), it is the source if found with confidence 0.7 or more. Tilt source `image`.
- **Toss parabolas (every clip):** fit x(t) and y(t) as quadratics; the acceleration vector (aₓ, a_y) points along image gravity, so roll = atan2(aₓ, a_y), taking the median over 5 or more clean tosses.
- All heights and 2D angles use rectified coordinates (section 2.4).

*Thresholds:*
- **Roll:** 2 degrees or less: pass; 2-10 degrees: info (rectified); over 10 degrees: warn.
- **Pitch, tilt source `sensor`:** 2 degrees or less: pass; 2-5 degrees either way: info (rectified; no downgrade); beyond ±5 degrees: block for heights and 2D angles (D1 cap; it may rise to 8 degrees after the synthetic tilt test, section 2.4). Sensor and picture differing by more than 2 degrees: warn (heights downgraded; both values logged).
- **Tilt source `image`:** info. Rectified with the picture estimate, but heights are capped at `estimated` with reason `TILT_UNKNOWN` until the picture method is validated.
- **No tilt source:** warn. Heights are capped at `estimated` with reason `TILT_UNKNOWN`, and the level assumption carries METRICS' tilt σ of 2 degrees (METRICS §1.1). Live, Ready is withheld (section 9.8).

*Message (block):* "Your phone was tilted more than we can correct, so heights are left out." / *(unknown):* "We couldn't measure your phone's tilt, so heights are approximate." / fix: "Use the level guide next time, and allow motion access when asked." *Affects:* block: `toss-apex-height`, `toss-drop`, `contact-height-ratio`, `leg-drive`, `loading-depth`, `deep-bend-flag`, `shoulder-tilt-trophy` and `landing-distance` unavailable. Unknown or image: the same metrics capped at `estimated` (`TILT_UNKNOWN`). Spreads keep their status, because the tilt is shared by every serve in the block and barely changes the differences between them.

**`cq.yaw`** · live and clip · *how:*
1. **Baseline.** Detect the baseline between the phone and the player: a long, near-vertical line segment in the lower half of the rectified image, from court-line edge detection. Extend it to its vanishing point. Yaw ε = atan((x_vp − c_x) / f_x), with f_x the horizontal focal length in pixels (about 1,440 px for a 26 mm lens across a 1080 px portrait frame, so 5 degrees is about 126 px). The vanishing point's row is the picture's pitch estimate (section 2.4).
2. **Fallback: the landing step.** With a yaw of ε, a step towards the net also moves the foot's ground-contact point in depth by sin ε per metre, which shows as a change in the image row of the contact point. So ε = atan(Δdepth / Δforward), median over 5 or more serves.
3. **Neither available:** yaw unknown.

*Thresholds:* |ε| 5 degrees or less: pass. 5-10 degrees: warn. Forward metrics carry an extra σ = lateral σ × sin ε (lateral σ 0.10 m unless the rear view measured it) and a bias bound of 0.3 m × sin ε. Over 10 degrees: block for forward metrics and speed. Unknown: info, and forward metrics are treated as if ε were 10 degrees in the warn band. *Live:* the baseline guide (section 9.6) turns solid within 5 degrees. *Message (warn):* "The phone was turned a little away from the baseline, so forward distances are approximate." / fix: "Point the phone straight along the baseline, so the line runs up the middle of the screen." *Affects:* warn: `toss-forward`, `toss-forward-spread`, `contact-forward` and `landing-distance` downgraded; `speed-experimental`'s out-of-plane bound widened by ε. Block: those metrics and `speed-experimental` `unavailable`. Heights are unaffected. The matching σ terms belong in METRICS §3.3, §3.10, §3.16 and §3.22. [Our inference; gap geometry §6.6]

**`cq.camera-stability`** · live, clip and serve · *how:* pick 8-12 textured background patches (high gradient energy, outside the dilated server box and the toss region) from the median of the first second at the 640-px analysis size. Estimate each patch's translation by normalised cross-correlation within ±16 px, every 5th frame and every frame from release to landing. Take the robust median of the patch shifts, scaled to a 1080 px short side. Derive: within-serve drift (max − min), jitter RMS, and step changes between serves (native: CoreMotion attitude jumps). This follows Apple's Action & Vision stability step (research 09 [S21]). *Thresholds:* within-serve drift up to 2 px: pass (research 06 §14, check 11); 2-6 px: warn (per-serve shift subtracted); over 6 px, or jitter RMS over 3 px: block for positional metrics ("handheld"). A step change over 6 px between serves: info, and the block is split at the move for spreads (spreads computed within each part and pooled). *Message (handheld):* "The phone was moving, so we could only time your serve." / fix: "Rest the phone on a fence, bag or tripod." *Message (step):* "The phone moved at 2:13. We've measured the serves before and after separately." *Affects:* handheld: all positional metrics, including hip rise and landing, unavailable; `shoulder-tilt-trophy` downgraded; timing and count unaffected.

**`cq.lens`** · clip · *how:* live: the chosen device label (section 9.2). Imports: QuickTime camera metadata (lens model, 35 mm-equivalent focal length) through `parseMoovMetadata`, if the phone writes it (UNVERIFIED key names). *Thresholds:* main lens or unknown: pass; telephoto: info; ultra-wide (16 mm-equivalent or less): side view: block for positional and body metrics (the 0.5x lens is not supported for metrics, METRICS §1.1; timing and count continue); rear view: warn, with outcome suggestions kept and the rear mechanics metrics and `speed-average-rear` `unavailable`. *Message:* "This was filmed with the 0.5x lens, which we can't measure your serve from." / fix: "Use the standard 1x lens. Stand the phone upright if you need more room above your toss." *Affects:* as above.

**`cq.scale-consistency`** · clip · *how:* only when the time base is proven. Compare the gravity-implied scale (fitted vertical toss acceleration ÷ 9.81 m/s²) with the height-derived scale (`scaleFromBodyHeight`). The ratio r should be 1 (`gravityTimeScaleCheck` inverted, with its model error of about 4%). The toss sits about 0.3 m nearer the camera than the player's plane (gap geometry §6.1), about 4-5% of the distance at 6-7 m, so the expected offset is corrected before comparing (METRICS `CONTACT_DEPTH_SIGMA_M`). [Our inference] *Thresholds:* |r − 1| up to 8%: pass; 8-15%: info; over 15%: warn. *Message:* "Your height and the ball's fall don't quite agree, so heights are approximate." / fix: "Check your height in Profile, and that the phone was level and side-on." *Affects:* warn: absolute heights, `leg-drive`, cm-based spreads and `landing-distance` downgraded; `speed-experimental` unavailable.

#### C. Light and image

**`cq.exposure`** · live, clip · *how:* every 0.5 s and at key frames, Rec. 709 luma inside the server's box: mean, the share clipped (255 or more after decode, or 250 in 8-bit) and the share crushed (5 or less). Temporal noise: the median absolute frame-to-frame difference on static background patches ÷ √2. **Light level** (for night comps, D11): natively, an estimate of scene brightness from the locked exposure (EV100 = log2(N²/t) − log2(ISO/100)), banded as daylight, overcast or court lights; the band edges need calibration against a lux meter (UNVERIFIED). In the web prototype there is no exposure metadata, so luma and noise are the proxy. Tennis Australia guidance gives 250 lux for recreational and 350 lux for competition lighting (research 02 [S41]). *Thresholds:* subject clipped and crushed each under 5%, mean 60-200, noise σ 6 or less: pass; clipped or crushed 5-15%, mean 40-60, or noise 6-10: warn ("low light"); subject mean under 40 or noise over 10: warn plus lower pose confidence. Pose success itself (`cq.player-in-frame`, `cq.tracking`) is the hard gate. A court-lights estimate, or the player choosing "Lights" on the block card, adds the session chip "Recorded under lights". *Message:* "It's quite dark, so tracking is less precise." / fix: "Film in daylight, or under the brightest court." *Affects:* body metrics and toss metrics downgraded; `speed-experimental` unavailable at night unless the blur checks pass.

**`cq.backlight`** · live, clip · *how:* subject mean luma ÷ background mean luma, and the share of clipped pixels in the region above the player's head (the toss sky). *Thresholds:* ratio 0.5 or more and toss sky clipped under 20%: pass; ratio under 0.5 or toss sky clipped at 20% or more: warn; both: warn plus a live "swap ends" prompt. *Message:* "The sun's behind you in the picture, so you're in shadow and the ball is hard to see." / fix: "Serve from the other end so the sun is behind the phone." *Affects:* via ball visibility and pose confidence.

**`cq.motion-blur`** · clip · *how:* (1) static sharpness: variance of the Laplacian on the torso box in setup frames, normalised by local contrast (smudge, focus or compression). (2) Effective exposure time from the rising toss. Where the fitted ball speed v is known, the blob's length along the velocity L gives t_exp ≈ (L − D) / v, with D the ball diameter. (3) Ball elongation at the apex (research 06 §14, check 9). [Our inference] *Thresholds:* estimated exposure 1/500 s or shorter: pass; 1/500-1/250 s: info ("arm blur near contact"); longer than 1/250 s, or apex elongation over 2× the diameter: warn. Static sharpness below 50% of the corpus median: warn ("lens smudge or focus"). *Message:* "The picture is a bit blurry around contact." / fix: "More light helps. In daylight, wipe the lens." *Affects:* contact metrics downgraded; `speed-experimental` unavailable when exposure is longer than 1/500 s (the ball streak at 150 km/h is over 8 cm, research 05 §2.2).

**`cq.flicker`** · live, clip · *how:* per-frame mean luma of static background patches (excluding the server box and the toss region) over 2-4 s windows. Detrend with a 0.25 s moving average. Compute the relative amplitude A = 2|X(f_a)| / (N × mean) with a Goertzel filter at the alias frequency f_a = the distance from 100 Hz to the nearest multiple of the frame rate, folded into [0, fps/2]: 20 Hz at 60 and 120 fps, 10 Hz at 30 fps, 100 Hz at 240 fps, and 0 at 25, 50 and 100 fps (no pulsing, only static banding) (research 05 §9.6). *Thresholds:* A under 1%: pass; 1-3%: info; 3% or more: warn (research 06 §14, check 8). *Message:* "The court lights are flickering in your video. We've corrected for it, but ball tracking is a little less certain." / fix: "At night, use 25 or 50 fps if your phone offers it." *Affects:* toss metrics downgraded; `speed-experimental` unavailable. The ball detector applies per-frame gain normalisation whenever A is 1% or more.

#### D. Scene

**`cq.extra-people`** · clip · *how:* MediaPipe with `numPoses: 2` (the pose builder's bystander setting). Count other people whose box is at least half the server's height; test overlap (IoU over 0) with the server's box inside serve windows. *Thresholds:* none: pass; present, never overlapping: info; overlapping in a serve window: warn. *Message (info):* "Someone else was in the picture. Your video stays on this phone." *Message (warn):* "Someone walked behind you on 2 serves, so we left those out." / fix: "Frame the shot against the fence where you can." *Affects:* per serve, via `cq.tracking`.

**`cq.tracking`** · serve · *how:* `ServerTracker` decisions inside the serve window: the fraction of 'lost' frames, any 'reacquired' event, and `swapsUnresolved` spans (pose report). *Thresholds:* no loss and no re-acquisition: pass; lost under 5% (gap-filled): info; 'reacquired' inside the window, or lost 5% or more: block for that serve's pose metrics. *Message:* "We lost track of you on 1 serve, so it's left out." *Affects:* per serve: pose-based metrics. Interpolated samples never produce a `measured` value (pose contract proposal).

**`cq.ball-visibility`** · live, serve, session · *how:* live: the practice toss is found (section 9.5). Recorded: the fraction of frames from release to contact with a `detected` (not predicted) ball observation, the toss-fit RMSE, the median colour-likelihood contrast of the ball against its local background (`ball/colour.ts`), and the ball's diameter in raw pixels near the apex. *Thresholds:* 80% or more of toss frames detected: pass (research 06 §14, check 13); 50-80%: warn for that serve; under 50%: block for that serve's toss metrics. Ball diameter under 8 px (shared threshold, `metrics.json`; research 06 §3.4): warn. Session: toss tracks in under 60% of serves: warn. *Message:* "We couldn't follow the ball on several serves." / fix: "A plain background helps: sky, a dark windscreen or a wall. Avoid trees or a busy court behind you, and keep the sun behind the phone." *Affects:* per serve: toss metrics and ball-based contact metrics unavailable; rhythm falls back to pose-based release (downgraded); `speed-experimental` unavailable.

#### E. Serve outcome of the pipeline

**`cq.serve-segmentation`** · serve and session · *how:* from the serve module's `ServeEvents`: a serve is *countable* when toss release and contact are found with confidence 0.6 or more. Excluded, and listed by reason: a caught toss (the ball falls past the release height with no contact), a serve cut off by the start or end of the recording, overlapping events, or a release-to-contact time outside 0.6-2.0 s. The expected count comes from the player, when given. *Thresholds:* session: measured ÷ detected 0.8 or more: pass; 0.5-0.8: warn; under 0.5, or fewer than 5 measured: block for session statistics (per-serve review still works). Detected count differing from the expected count by more than 2: info. *Message:* "We found 13 serves; you said about 15. Tap to mark any we missed." *Affects:* excluded serves are left out of every per-serve metric except the "not counted" list. `serve-count` reports both numbers. Caught tosses are counted separately and not included in toss spreads (`METRICS.md` may decide otherwise).

**`cq.audio-timing`** · clip (only when hit-sound timing is on, or for an import with audio) · *how:* `assessAudioTiming(meta).usable`, and the share of video contacts with an audio onset within ±30 ms. *Thresholds:* usable and 60% or more matched: pass; otherwise info. *Message:* "Hit sounds weren't clear, so contact timing uses the video only." *Affects:* the precision of the contact time only; rhythm metrics fall back to the video contact. Audio is never used for speed, in either view (D4).

#### F. Device (live only; native unless stated)

**`cq.thermal`** · live · *how:* native: `ProcessInfo.thermalState` (research 06 [S23]). Web: no API in Safari. Proxy: a rising rate of dropped frames in the preview (`requestVideoFrameCallback` `presentedFrames` against the expected count) plus the elapsed recording time. *Thresholds (native):* nominal or fair: pass; serious: warn (step 4K down to 1080p, pause the live pose pass, prompt for shade); critical: finish and save the current block, then stop. *Message:* "Your phone is getting hot. Put it in the shade for a few minutes." *Affects:* none directly.

**`cq.battery`** · live · *how:* native: `UIDevice.batteryLevel`. Web: none in Safari (the Battery Status API is absent), so the check is skipped. *Thresholds:* 15% or more: pass; under 15%: warn before recording (research 06 §14, check 14). *Message:* "Battery is low. A block uses about [placeholder] %."

**`cq.storage`** · live · *how:* native: `volumeAvailableCapacityForImportantUsage`. Web: `navigator.storage.estimate()` (quota − usage), which reflects the site's quota, not free device space. Estimate the block size as MB/min × planned minutes (section 3.6) × 1.5. *Thresholds:* estimate fits: pass; does not fit: warn before recording. *Message:* "You're low on space. This block needs about 450 MB." / fix: "Free up space, or choose to keep key frames only."

### 8.3 Gating matrix (capture side proposal)

U = unavailable for the affected scope; D = downgraded (for `METRICS.md` to map: `estimated`, a wider band or lower confidence); – = no effect; excl. = the serve is left out of the spread.

| Check (failing level) | Toss position | Toss spreads | Contact | Timing | Body | Landing | Speed | Count |
|---|---|---|---|---|---|---|---|---|
| frame-rate 24-49 (warn) | – | – | D | D | D (drive-time) | – | U | – |
| frame-rate under 120 | – | – | – | – | – | – | U | – |
| time-base (block) | – | – | – | U | U (drive-time) | – | U | – |
| dropped frames in window (serve) | D | excl. | D/U | U | D | – | U | – |
| player-size (warn) | D | – | D | – | D | D | D | – |
| player-size (block) | D | – | D | – | U | U | D | – |
| player-in-frame (serve) | D | – | D | D | U | U | – | – |
| feet-visible | D | – | D | – | D | U | – | – |
| toss-headroom (serve) | D/U | excl. | – | – | – | – | – | – |
| toss-headroom: recorded without toss height | U (height, drop) | U (height spread) | – | – | – | – | – | – |
| court-room (warn or block) | – | – | D | – | – | U | U | – |
| court-room: speed rule | – | – | – | – | – | – | U | – |
| camera-level: pitch over the cap | U (height, drop) | – | U (height) | – | U | U | D | – |
| camera-level: tilt unknown or from the picture | D (`TILT_UNKNOWN`) | – | D (height) | – | D | D | D | – |
| camera-level: roll over 10 degrees, or sensor vs picture over 2 degrees (warn) | D | – | D | – | D | D | D | – |
| yaw 5-10 degrees (warn) or unknown | D (forward) | D (forward) | D (forward) | – | – | D | D | – |
| yaw over 10 degrees (block) | U (forward) | U (forward) | U (forward) | – | – | U | U | – |
| camera-stability: moved | – | split | – | – | – | – | – | – |
| camera-stability: handheld | U | U | U | – | U (tilt D) | U | U | – |
| view front/unknown | U | U | U | D (exp.) | U | U | U | – |
| view side-back | D | – | – | D | – | – | – | – |
| lens ultra-wide (side view) | U | U | U | – | U | U | U | – |
| scale-consistency (warn) | D | D | D | – | D | D | U | – |
| exposure (warn) | D | – | D | – | D | – | U | – |
| motion-blur (warn) | – | – | D | D | – | – | U | – |
| flicker (warn) | D | – | – | – | – | – | U | – |
| tracking (serve block) | – | – | D | D | U | U | – | – |
| ball-visibility (serve block) | U | excl. | U | D | – | – | U | – |
| serve-segmentation (serve) | excl. | excl. | excl. | excl. | excl. | excl. | excl. | listed |
| audio-timing (info) | – | – | – | – | – | – | – | – |

Column members: Toss position = `toss-apex-height`, `toss-forward`, `toss-drop` ("forward" = `toss-forward` only; "height, drop" = the other two). `toss-drop` also inherits the Contact column, because it uses the contact frame. Toss spreads = `toss-height-spread`, `toss-forward-spread`. Contact = `contact-height-ratio`, `contact-forward`. Timing = `rhythm-release-to-contact`, `rhythm-spread`, `trophy-pause`. Body (side view) = `leg-drive`, `drive-time`, `loading-depth`, `deep-bend-flag`, `shoulder-tilt-trophy` ("tilt" = `shoulder-tilt-trophy`). Landing = `landing-distance`. Speed = `speed-experimental`. Count = `serve-count`. `repeatability` inherits from its components. Player-entered outcome metrics are unaffected by capture checks.

**Rear-view sessions.** `knee-bend-band` and `shoulder-over-shoulder-contact` follow the Body column for the pose checks. They are also `unavailable` when the lens is ultra-wide (`cq.lens`) or when the court-corner tap fails (RMS over 3 px, or tap pitch vs sensor pitch over 2 degrees; section 6.3). Outcome suggestions, `placement-zone` and `speed-average-rear` follow the tap and the far-box ball visibility. `speed-average-rear` also follows time-base, frame-rate (under 60 fps: U) and lens (ultra-wide: U).

### 8.4 Roll-up: the `capture-quality` metric

- `QualityReport.overall`:
  - `poor` if any clip-level block, measured ÷ detected under 0.5, or fewer than 5 measured serves;
  - `usable` if any warn, or measured ÷ detected 0.5-0.8;
  - `good` otherwise.
- **Display:** "Capture: Good · 14 of 16 serves measured". One line, "Next time:", with the single fix that would have recovered the most serves or metrics (ranked by the number of metric values downgraded or removed). The detail sheet lists every non-passing check with its message.
- **"X of N serves measured"** is per metric (a serve can count for rhythm but not for toss height). The session header uses the lead metric's count (toss, D5). Every rate and spread shows its own n (D7).
- The capture tip is carried into the next session's set-up screen: "Last time your toss left the picture. Try the phone one step further back."

### 8.5 Threshold constants (initial, UNVERIFIED)

```ts
// analysis/quality/thresholds.ts (initial values; tune in validation, section 13)
// Subject-size and ball-size thresholds are shared with METRICS (subject-size) and live once, in metrics.json.
import metrics from '../../../../docs/specs/metrics.json'   // path illustrative; the build copies metrics.json into the engine

export const QC = {
  fps: { block: 24, warn: 50, highSpeed: 100, speedMin: 120 },
  resolutionShortSide: { block: 480, warn: 720, pass: 1080 },
  bitsPerPixel: { warn: 0.03, info: 0.05 },
  // Raw pixels on the subject, never scaled by frame height. Proposed values: body { block: 200, warn: 250, pass: 300 }, ball { warn: 8 }.
  subjectPx: metrics.captureThresholds.subjectPx,
  ballDiameterPx: metrics.captureThresholds.ballDiameterPx,
  inFrame: { marginFrac: 0.03, warn: 0.98, block: 0.90 },
  frameTopM: { block: 4.3, min: 4.5, target: 4.7, statureFactor: 1.54, dropHighM: { male: 1.0, female: 1.25, unknown: 1.25 }, marginM: 0.35 },
  tossOffsetM: 0.3,                 // allowance = tossOffsetM × tan(V/2) for the active orientation
  groundBelowFeetM: 0.1,
  apexMarginBallDiameters: 4,
  apexExtrapolationMaxGapS: 0.65,
  extrapolatedShareWarn: 0.25,
  courtRoomM: { aheadPass: 1.8, aheadBlock: 1.2, behindPass: 1.0, aheadSpeed: 2.7 },
  levelDeg: { rollPass: 2, rollWarn: 10, pitchPass: 2, pitchMaxUp: 5, pitchMaxDown: 5, readyRoll: 3, readyPitch: 3, readyPitchUpLandscape: 5, sensorVsImageWarn: 2, imageConfidenceMin: 0.7 },
  yawDeg: { pass: 5, block: 10, lateralSigmaM: 0.10, lateralBiasM: 0.3 },
  orientation: { landscapeFenceDistanceM: [7.5, 10.5] },
  stabilityPx1080: { driftPass: 2, driftBlock: 6, jitterRmsBlock: 3, stepSplit: 6 },   // at a 1080 px short side
  scaleRatio: { pass: 0.08, warn: 0.15 },
  exposure: { clipPass: 0.05, clipWarn: 0.15, meanLow: 60, meanVeryLow: 40, noisePass: 6, noiseHigh: 10 },
  backlight: { subjectToBackground: 0.5, tossSkyClipped: 0.2 },
  exposureTimeS: { info: 1 / 500, warn: 1 / 250, speedMax: 1 / 500 },
  apexElongationWarn: 2.0,
  flickerAmp: { info: 0.01, warn: 0.03 },
  droppedGapFactor: 1.5, droppedOverallInfo: 0.01, droppedOverallWarn: 0.05, contactGuardS: 0.1,
  tracking: { lostInfo: 0.05 },
  ballDetectedShare: { pass: 0.8, block: 0.5, sessionWarn: 0.6 },
  segmentation: { eventConfidence: 0.6, measuredShareWarn: 0.8, measuredShareBlock: 0.5, minMeasured: 5, releaseToContactS: [0.6, 2.0] },
  rearTap: { rmsPxMax: 3, pitchVsSensorMaxDeg: 2 },
  audioMatchS: 0.03, audioMatchedShare: 0.6,
  batteryWarn: 0.15, storageSafety: 1.5,
} as const
```

`metrics.json` does not yet have a `captureThresholds` block, and METRICS §3.25 still states `subject-size` as 350/250/200 px scaled to a 1080 px frame height. The METRICS reviser owns that table. This spec proposes raw pixels with pass 300, warn below 250 and block below 200, and asks that one table serve both specs (revision log).

---

## 9. Live framing assistant (web prototype)

### 9.1 Goals and non-goals

- **Goals:** get the player to a passing framing in one or two walks between the phone and the serving spot. Make the result readable from 8 m. Record a clip with known settings and a capture context.
- **Non-goals (web):** exposure, focus, stabilisation and lens control; exact frame-rate choice; thermal monitoring; live serve counting. These are native (section 10).

### 9.2 Camera stream and recorder

- **HTTPS is required** for `getUserMedia` and motion sensors (localhost is fine in development).
- **Permissions in context** (research 09 §8): camera on the first "Set up" tap, after a one-screen explainer with a single "Continue". Motion permission on iOS via `DeviceMotionEvent.requestPermission()` from a user gesture ("Show level"). **If motion permission is denied,** the level item shows "Level unknown: allow motion access", with a button to ask again. Ready is withheld until either permission is given or the picture-based level is found (section 2.4). "Record anyway" stays available; its heights carry `TILT_UNKNOWN` (section 8.2, `cq.camera-level`).
- **Orientation.** A PWA cannot lock orientation on iOS (`DESIGN.md`), so the capture flow follows the device. It expects portrait by default, or landscape when the player chose the fence set-up, and stores the orientation at Record. Portrait held upside down asks the player to turn it the right way up.
- **Constraints:** `{ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60, min: 24 } }, audio: hitSoundTiming }`. At night with flicker detected: try `frameRate: { exact: 50 }`, then fall back. Whether iOS Safari delivers upright portrait frames (1080 × 1920) when the phone is upright, or landscape pixels with a rotation, and how `MediaRecorder` writes that rotation, are UNVERIFIED. The app reads `track.getSettings()` and the preview's `videoWidth` and `videoHeight`, and the probe reads the saved file's displayed size and rotation, so the engine's rotation-corrected coordinates (METRICS §1.1) handle either case.
- **Lens choice:** after permission, `enumerateDevices()`. On iOS the back cameras appear as separate devices, including virtual multi-camera devices that switch lenses automatically. Prefer the device whose label denotes the plain wide camera ("Back Camera" in English) and avoid "Dual"/"Triple" virtual devices so the lens cannot switch mid-clip (research 06 §4.3, [S14]). Labels are localised and their exact strings are UNVERIFIED; fall back to `facingMode` and record the label chosen.
- **Read back** `track.getSettings()` (`width`, `height`, `frameRate`, `deviceId`) and show it as a chip: "1080p · 60 fps". If the delivered rate is under 50: chip "30 fps: timing less precise" and a link: "For 60, 120 or 240 fps, record in the Camera app and import." Whether iOS Safari delivers 60 fps from the back camera through `getUserMedia` is UNVERIFIED; the design adapts to whatever is delivered.
- **Recorder:** `MediaRecorder` with the first supported of `video/mp4;codecs=avc1.640028`, `video/mp4`, then `video/webm;codecs=vp9`, and `videoBitsPerSecond: 12_000_000` (90 MB/min; whether it is honoured is UNVERIFIED). MP4 is preferred because the probe gives an exact timeline for MP4/MOV, while WebM gets an estimated timeline that assumes a constant frame rate (video README). A WebM recording sets `cq.time-base` to info "estimated timeline", and timing metrics are downgraded. Chunks (`timeslice: 1000`) are written to IndexedDB/OPFS as they arrive, so a crash loses at most a second.
- **Wake lock:** `navigator.wakeLock.request('screen')` for the whole set-up and recording. If it is unavailable (for example in some home-screen modes, UNVERIFIED), show: "Set Auto-Lock to Never while you record (Settings › Display & Brightness)." The screen locking or the app going to the background stops the camera, so: "Don't switch apps while recording."

### 9.3 Level indicator

Use `DeviceMotionEvent.accelerationIncludingGravity`, not `DeviceOrientationEvent`. In landscape the phone sits near gamma = ±90 degrees, where the Euler angles are ill-conditioned. Portrait is well conditioned, but the same gravity-vector method is used for both orientations so there is one code path. [Our inference]

1. Low-pass the vector with τ = 0.3 s. Normalise to **u**, the "up" direction in device axes (x right, y up the long edge in portrait, z out of the screen). Platforms have historically differed in the sign of this vector, so apply a per-platform sign s (UNVERIFIED; fixed by the device test below).
2. The back camera looks along −z. **Pitch** (positive = lens tilted up) = asin(−u_z). It does not depend on orientation.
3. **Roll** = atan2(u_y, u_x) − θ₀, wrapped to ±180 degrees, where θ₀ = 90° − `screen.orientation.angle`: 90 degrees in portrait (angle 0), and 0 or 180 degrees for the two landscape orientations (angles 90 and 270). The sign convention of `screen.orientation.angle` against device axes is fixed by the device test.
4. **Display:** a horizon line rotated by −roll and a dot offset by pitch. Text: "Level", "Tilt the top away from you" or "Tilt the top towards you", "Rotate slightly clockwise" or "anticlockwise". Solid when |roll| and |pitch| are 2 degrees or less; "nearly level" within 3 (the Ready gate); amber beyond that.
5. **Requested tilt (landscape at the fence only).** When the frame top is short and raising the phone is not possible, the app may ask for an upward tilt: pitch = atan((T_min + a − h) / D_b) − V/2 (gap geometry §6.2; a is the toss-offset allowance). It asks only if that is 5 degrees or less and the feet stay at least 0.1 m inside the bottom edge. The dot's target then moves to the requested pitch, and the text reads "Tilted 4° (we'll correct it)". Otherwise the one instruction is "Turn the phone upright". Portrait never asks for a tilt.
6. **Logging:** pitch and roll at 10 Hz into `CaptureContext.orientationSamples` for the whole recording. A step change over 1 degree during recording marks a camera bump for `cq.camera-stability`.
7. **Device test (QA, required before trusting the signs):** phone flat on a table, face up; then upright in portrait against a wall; then in each landscape orientation against the wall; then each of those tilted 10 degrees with the top edge away from you. The readings must be pitch −90 degrees (lens pointing at the floor), then pitch 0 and roll 0 in each upright position, then pitch −10 degrees. Compare the pitch with a spirit level (sensor accuracy is UNVERIFIED; gap geometry open question 7).

### 9.4 Light pose pass

- **Frames:** `requestVideoFrameCallback` on the preview `<video>`. Take every Nth frame to reach about 5 Hz, then `createImageBitmap` at a 384-px long side, or draw to an `OffscreenCanvas` if resize options are unsupported, then send to the pose worker (`MediaPipePoseSource`, `model: 'lite'`, `numPoses: 2`, VIDEO mode with monotonic timestamps). Keep at most 1 frame in flight.
- **Stand-tall step:** "Stand tall for two seconds." Rectify the keypoints with the current pitch and roll (section 2.4), then take the median over 10 frames of `bodyHeightFromPose` → `heightNorm`, `groundY`, `headTopY`. With the player's height H (profile; default 1.75 m flagged as an assumption):
  - `unitsPerM = heightNorm / H`;
  - **frame top at the player** T_body = (`groundY` − y_top) / `unitsPerM`, where y_top is the lowest point of the rectified top edge over the player's column (0 for a level phone);
  - **frame top for the toss** T = T_body − 0.3 × tan(V/2) for the active orientation (section 8.2, `cq.toss-headroom`);
  - **ground margin** = (y_bottom − `groundY`) / `unitsPerM`, with y_bottom the highest point of the rectified bottom edge over the player's column;
  - **phone height** ≈ (`groundY` − y_horizon) / `unitsPerM`, with y_horizon the rectified principal-point row, shown as "Phone height: about 1.5 m";
  - **body pixels** = `heightNorm` × the recording's pixel height (raw pixels, section 8.1);
  - **room ahead / behind** from the toe and heel landmarks to the frame edges;
  - **people:** a count of other people at least half the player's size.
- **Suggestions** use the level-phone relation top = h + d·t, with t = tan(V/2) for the active orientation: about 0.67 in portrait (0.62-0.72 across lenses and crop) and 0.39 in landscape (±4%). To add ΔT metres of headroom: raise the phone by ΔT, or move it back by ΔT / t metres. To grow the player to 300 px: move closer by d × (1 − px/300), with d ≈ (1 / `unitsPerM`) / (2t) metres (the frame's height at the player, divided by 2t). The copy converts metres to steps at 0.8 m per step and gives one instruction, preferring "raise" when the phone is below 1.6 m (portrait) or 1.8 m (landscape). It never suggests turning the phone towards the net, which would break `cq.yaw`. [Our inference]

### 9.5 Practice toss and ball check

- "Toss a ball as you would for a serve, and catch it."
- **Region:** above the player's head, from the shoulder line to the frame top, 1.5 body-widths either side.
- **Detection at full preview rate** during a 3-second window after a toss arm rises past the shoulder: frame differencing plus yellow-green colour likelihood on a 160 × 160 downscale of the region (`ball/detector.ts` in a light mode), and a parabola fit.
- **Outputs** (on rectified coordinates, section 2.4): ball found (6 or more consecutive detections), apex height `(groundY − apexY) / unitsPerM`, and apex margin to the frame top `(apexY − y_top) / unitsPerM`.
- **Pass:** found, and margin 0.3 m or more. Otherwise "Room above your toss: 0.1 m. Phone back 2 steps" or "We couldn't see the ball against this background."
- The colours sampled also seed the detector's colour model for the session.

### 9.6 Stability, light and flicker (live)

- **Steady:** registration on 8 background patches at 5 Hz at 320-px width. "Steady" after 2 s with under 1 px of motion at that scale.
- **Light:** luma statistics of the player box and the toss sky at 2 Hz → `cq.exposure` and `cq.backlight` messages.
- **Flicker:** draw each preview frame (full rate, via rVFC) to a 32 × 18 canvas, take the mean luma of the non-player cells, and run a 2 s Goertzel at the alias frequency for the delivered frame rate → "Lights are flickering" info with the 25/50 fps advice.
- **Baseline (aim):** at 2 Hz, detect the baseline in the lower half of the rectified preview and its vanishing column (`cq.yaw`, section 8.2). The dashed baseline guide (Diagram C) turns solid within 5 degrees, and the text says which way to turn: "Turn the phone a little left" or "right". If no line is found (faint lines on synthetic grass, or a shadow), the item shows "Baseline: line it up by eye" as info, and the landing-step fallback is used after recording.
- **Headroom:** the frame top T from the stand-tall step (9.4) is refreshed whenever the player stands still at the spot for 1 s, so moving or raising the phone updates the "Room above your toss" readout without a new stand-tall step.

### 9.7 Screen states and cues

- **At the phone** (normal UI): preview, overlay (Diagram C), checklist rail, chips, and the Record button.
- **At the serving spot** (automatic when the player has been detected standing at the spot for 1 s): a full-bleed state for distance reading, with one large glyph (about 40% of the screen height) and one to three words, meeting DESIGN.md contrast. At 8 m, text 2 cm tall subtends about 8.6 arcminutes, above the roughly 5 arcminutes of a 6/6 letter. [Our inference]
- **Sound:** a soft two-tone chime for Ready, a single low tone for "needs a change", and an optional spoken phrase via `speechSynthesis` (on-device voice, en-AU where available). This is on by default during set-up and can be switched off.
- Each state has a text label and a glyph, never colour alone (research 09 [S6]).

### 9.8 Ready gate

**Ready** requires:

- the tilt known (sensor, or a picture estimate with confidence 0.7 or more), with roll within 3 degrees and pitch within 3 degrees. In landscape at the fence, an upward pitch of up to 5 degrees is also accepted when the app asked for it (section 9.3);
- the baseline guide within 5 degrees (`cq.yaw`), or no baseline found (info only);
- the player found alone or clearly dominant;
- `cq.player-in-frame` passing while standing;
- frame top T of at least 4.3 m after the toss-offset allowance. The item passes at T_min (normally 4.5 m) and shows the 4.7 m target; 4.3 m to T_min is Ready with an info note;
- room ahead of 1.2 m or more;
- steady for 2 s;
- the player 200 px or more (raw pixels);
- a delivered frame rate of 24 or more.

In a speed session, room ahead under 2.7 m or a frame rate under 120 fps does not withhold Ready, because speed is an experimental extra. The item reads "No speed this time" with its fix (section 2.3), and `speed-experimental` is `unavailable` for the block.

When several items fail, the single instruction shown is the first in this order: step into the picture → hold still → allow motion access → level the phone → point along the baseline → room above → room ahead → player size → frame rate.

The practice toss is recommended, not required. When it has run, its failure blocks Ready.

**Record anyway** is available from the overflow menu for every failing item except one: a frame top under 4.3 m, which D1 says blocks recording. For that item the overflow offers **"Record without toss height"** instead. The block is recorded, and `toss-apex-height`, `toss-drop` and `toss-height-spread` are `unavailable` for all its serves (reason `cq.toss-headroom`); everything else is analysed normally. In both cases the failing ids go into `CaptureContext.recordedAnyway` and are reported in the capture-quality sheet, and the consequences follow section 8.3:

- tilt unknown: heights capped at `estimated` (`TILT_UNKNOWN`);
- pitch over the cap: heights and 2D angles `unavailable`;
- yaw over 10 degrees: forward metrics and speed `unavailable`;
- player under 200 px: pose metrics `unavailable`;
- room ahead under 1.2 m: `landing-distance` `unavailable`.

### 9.9 During recording

- **Countdown:** 10 s by default (5-20 s adjustable) with beeps and a start chime.
- **Screen:** all-black except the recording indicator (red dot, "Recording", timer) and a large Stop target. An OLED black screen reduces power and heat. Web pages cannot set screen brightness.
- **Monitoring:** the pose pass and ball check stop. Only a 1 Hz stability sample and the rVFC frame-count monitor keep running, to avoid dropped frames and heat.
- **Stop:** a tap on Stop, or automatically after 20 minutes (with a chime at 15).

### 9.10 After stop

1. Finalise the recording.
2. `probeVideo` on the saved blob, which reads only boxes and is fast.
3. Run `cq.frame-rate`, `cq.dropped-frames` and `cq.resolution` immediately: "Saved: 5:12, 1080p, 60 fps."
4. Show the tally screen (section 3.7).
5. Analysis starts in the background with staged progress (research 09 §8).

### 9.11 Performance budget and fallbacks

| Task | Rate | Budget (iPhone, UNVERIFIED) | Fallback |
|---|---|---|---|
| Pose (lite, 384 px, 2 poses) | 5 Hz | under 50 ms per frame | 2 Hz, or CPU delegate |
| Practice-toss detection (160 px region) | stream rate, 3 s window | under 5 ms per frame | every 2nd frame |
| Flicker luma (32 × 18) | stream rate | under 1 ms | 30 Hz sampling (alias still detectable at 10 Hz) |
| Stability (8 patches, 320 px) | 5 Hz | under 5 ms | 2 Hz |

Pose timings measured so far come from a Windows laptop GPU (15-34 ms per frame with the lite model; pose report). Phone figures are unknown.

### 9.12 Browser capability matrix (to verify on devices)

| Capability | Needed for | iOS Safari / home-screen PWA | Android Chrome | Status |
|---|---|---|---|---|
| `getUserMedia` back camera at 1080p | preview and recording | expected | expected | UNVERIFIED |
| 60 fps via `frameRate` | default capture | unknown | device-dependent | UNVERIFIED |
| 120/240 fps | high-speed | not expected | rare | use Camera app + import |
| Per-lens device selection | lens lock | labels expected | varies | UNVERIFIED |
| `MediaRecorder` MP4/H.264 | recording | expected (Safari records MP4) | newer versions | UNVERIFIED |
| `requestVideoFrameCallback` | live sampling | Safari 15.4+ (research 05 [S65]) | yes | per research |
| `DeviceMotionEvent` + permission | level | permission prompt required | no prompt | sign convention UNVERIFIED |
| Upright portrait frames from `getUserMedia`; rotation written by `MediaRecorder` | portrait default | unknown | unknown | UNVERIFIED |
| Screen Wake Lock | long recording | Safari 16.4+ (home-screen behaviour UNVERIFIED) | yes | partly UNVERIFIED |
| `navigator.storage.estimate()` | storage check | expected | yes | UNVERIFIED |
| Exposure, focus and fps locking | blur and flicker control | no | partial (Image Capture) | native only in v1 |
| Thermal and battery APIs | heat | no | no thermal | native only |

---

## 10. Native iOS capture (AVFoundation, Capacitor plugin)

The web UI stays; a `ServeCapture` native plugin owns the camera. The preview is drawn natively behind a transparent WKWebView, and the plugin emits framing results and returns the recorded file URL plus the capture context (D9; research 06 §4.3, research 05 §9).

| Capability | Web prototype | Native build |
|---|---|---|
| Lens | label heuristics | `builtInWideAngleCamera` (a physical device, not a virtual multi-camera device), so no mid-clip lens switching |
| Frame rate | requested, then read back | `activeFormat` from `videoSupportedFrameRateRanges`; `activeVideoMinFrameDuration` = `activeVideoMaxFrameDuration` = 1/fps. This fixes the rate and prevents low-light frame dropping. Offer 50/100 fps at night where the format allows (research 06 [S21]; per-device support UNVERIFIED) |
| Resolution / HDR | as delivered | 1080p 8-bit SDR (Rec. 709) for the portrait default; 4K for Landscape at the fence (the far-half player drops below 250 px at 1080p, section 2.2) and for the rear view; video HDR off (research 06 §4.3) |
| Orientation | follows the device | Portrait capture sets the connection's rotation (`videoRotationAngle` 90) so files are written upright; landscape uses 0 or 180. Intrinsics are delivered in sensor orientation and are rotated with the frame (which convention the per-frame matrix uses is UNVERIFIED) |
| Stabilisation | uncontrolled | off on the connection (off by default, research 06 [S19]) |
| Exposure | auto | Custom exposure (research 06 [S20]): daylight 1/1000 s or shorter, ISO metered on the player's box during framing, then locked. At night 1/250-1/500 s; with flicker, 50/100 fps or a 10 ms multiple when speed is not needed (research 05 §9.6) |
| Focus / white balance | auto | autofocus on the player's box during framing, then `.locked`; white balance locked after framing |
| Geometry | lens assumed | `videoFieldOfView` stored; per-frame intrinsic matrix delivery on (research 06 [S17], [S18]); geometric distortion correction left at its default |
| Level | DeviceMotion | CoreMotion device motion (gravity) at 60 Hz, logged per frame in both orientations; it drives the rectification (section 2.4); attitude jumps mark camera bumps |
| Timestamps / drops | container timestamps | `CMSampleBuffer` PTS; `didDrop` reasons logged per frame |
| Live framing pose | MediaPipe lite in WKWebView | Apple Vision 2D body pose at 5 Hz for framing (no heels or toes, research 05 §1.1); MediaPipe (bundled) stays the analysis model |
| Thermal | proxy only | `ProcessInfo.thermalState` notifications: serious → drop the live pose pass, step 4K to 1080p for the next block, prompt for shade; critical → close the file cleanly and stop (research 06 [S23]) |
| Screen | black UI | brightness lowered while recording and restored after; idle timer disabled |
| Retention | whole block, trimmed after analysis | Ring buffer: `AVAssetWriter` segments of 10 s with 1 s keyframes. Live serve windows from the 5 Hz pose; segments without serves deleted at block end (keeping 1.5 s before release and 2.5 s after contact, research 06 §10.2) |
| Codec | MP4/H.264 from MediaRecorder | HEVC when the WKWebView's `VideoDecoder.isConfigSupported('hvc1…')` is true on that device, otherwise H.264 |
| Audio | off, or opt-in onsets | `AVAudioSession` only when hit-sound timing is on; onsets computed from live buffers; audio never written to the file |
| Remote start | countdown | countdown in v1; Apple Watch start/stop (WatchConnectivity) in v1.1 |
| Storage / battery | quota estimate / none | `volumeAvailableCapacityForImportantUsage`; `UIDevice.batteryLevel` |
| Permissions | browser prompts | `NSCameraUsageDescription`: "Serve Coach uses the camera to record your serve. Video is analysed on this phone and isn't uploaded." `NSMicrophoneUsageDescription` only if hit-sound timing ships: "Used only when you turn on hit-sound timing. Sound is turned into timings on this phone and deleted." Imports use PHPicker, which needs no library permission (research 07 [S41]) |
| Recording indicator | web UI | the same indicator; iOS also shows its own camera indicator (2.5.14) |

---

## 11. Import an existing clip

### 11.1 Entry points

- **Web:** Record tab → "Import a video" → `<input type="file" accept="video/*,.mov,.mp4">` without `capture`, so iOS offers Photo Library, Take Video or Choose Files. Copy under the button: "For slow-motion videos, choose Files. How?" (section 11.4).
- **Native:** PHPicker with `preferredAssetRepresentationMode = .current`, avoiding a transcode (research 05 [S57]); the original version for slow motion (research 05 [S54]); `PHAssetMediaSubtype.videoHighFrameRate` to recognise slow motion (research 05 [S53]); a Files picker; and "Open in Serve Coach" from the share sheet.

### 11.2 Flow

1. **Probe** (instant, no decode): container, codec, duration, displayed size, rotation, fps, VFR segments, `timeBase`, QuickTime metadata (device, lens), audio presence and bitrate. Run `cq.decode`, `cq.frame-rate` (provisional), `cq.resolution`, `cq.compression` and `cq.clip-length`.
2. **Summary card:** "4:12 · 1080p · 60 fps · iPhone · upright" with chips for any warnings.
3. **Quick scan** (pose on about 30 frames spread through the clip, plus the toss detector on the first 3 toss-like events) → suggested view, handedness check and a provisional player size.
4. **Questions**, asking only what the probe and scan cannot answer:
   - "Where was the camera?" with a suggested answer ("Looks like a side view from your hitting-arm side"): *Side, my hitting-arm side* / *Side, other side* / *Behind me, raised* / *Somewhere else*.
   - "Which side were you serving from?" *Deuce / Ad / Both*. For *Both* in a side view, the scan clusters serves by the player's size and horizontal position (the far spot looks 15-25% smaller) and asks the player to confirm the split: "We found two groups: 9 and 7 serves. Deuce first?"
   - "First or second serves?" *First / Second / Mixed* (mixed means tagging in review).
   - The slow-motion question, when needed (11.3).
   - Height and handedness are prefilled from the profile and shown for confirmation.
5. **Trim** (optional; offered for clips over 5 minutes): a filmstrip range selector.
6. **Analyse**, with the same checks as in-app recordings. There is no sensor tilt. Pitch comes from the picture (the baseline's vanishing point, or posts) when it is found with confidence 0.7 or more; otherwise it is unknown. Either way heights are capped at `estimated` with `TILT_UNKNOWN` (section 2.4). Roll comes from the toss parabolas, and yaw from the baseline or the landing step (`cq.yaw`).
7. **Rights reminder** (first import only): "Only import videos you're allowed to use. If the player is under 18, a parent or guardian needs to agree." (section 7)

"Somewhere else" views get `serve-count` and timing metrics labelled `experimental`; positional metrics are `unavailable` ("This camera angle doesn't show your toss height reliably").

### 11.3 Slow motion: ask, confirm, check physics

**Background.** Slow-motion originals imported with their real timeline (Files, AirDrop with all data, USB) have timestamps at 100 fps or more, so the time base is `proven`. Clips shared from Photos by most routes are re-rendered at a normal rate with the slow section baked in. Nothing verified marks the factor, and their 1× ramps at each end mean one time scale cannot describe the whole clip (video README; research 05 §9.2). Their audio is stretched or muted.

**Rule.** The time base must be `proven` (container or timestamps), or confirmed by the gravity check, before any duration is shown. Speed is never computed unless the time base is `proven` (D4 prerequisites; research 05 §9.2).

**Question**, asked when `timeBase.status` is `unknown` for an Apple-device clip, or when `kind` is `possible-rendered-slomo`: "Was this filmed in slow motion?" *No, normal speed* / *Yes, slow motion* / *Not sure*. If yes: "Which speed?" *120 fps* / *240 fps* / *Not sure*.

**Physics check.** For each clean toss track, `gravityTimeScaleCheck` (in `ball/toss.ts`) uses the fitted vertical acceleration and the height scale. A free-falling ball must accelerate at 9.81 m/s², so the timestamps' true scale factor is s = √(A / (g × unitsPerM)), with an interval and the nearest standard ratio (1, 1/2, 1/4, 1/8, 1/16). Per serve:

| Player says | Physics (median of per-toss factors, 3 or more tosses) | Result |
|---|---|---|
| Normal | consistent with 1 | Accept. Time base `physics`-confirmed; timing labels unaffected |
| Normal | consistent with 1/4 or 1/8 | Ask: "The ball fell 8 times slower than gravity allows at normal speed. This looks like 240 fps slow motion. Use 240 fps?" Yes → apply. No → timing `unavailable` (reason `cq.time-base`) |
| 120 or 240 | consistent with the answer | Apply with `applyTimeScale(meta, fps, scale, 'user')`, recorded as physics-confirmed. Timing downgraded to `estimated`; speed `unavailable` (time base not proven) |
| 120 or 240 | inconsistent | Ask once more, showing the implied rate; if still unresolved, timing is `unavailable` |
| Not sure | consistent with a standard ratio | Apply the ratio; timing `estimated` |
| any | unavailable (no clean toss or no scale) | Normal: accept with `cq.time-base` warn (timing downgraded). Slow motion: timing `unavailable` |

**Ramped clips.** Because the ends of a rendered slow-motion clip play at 1×, the per-serve factor is used. Serves whose factor does not match the clip's accepted ratio (they fall in a ramp) are excluded from timing metrics and listed as "timing uncertain (slow-motion ramp)". Positional metrics are unaffected. The contract proposal for a piecewise `timeMap` (video report) would remove this limitation.

**Audio** in time-scaled clips is unusable for timing (`assessAudioTiming`), so `cq.audio-timing` reports info.

**Sanity check for normal clips too.** The gravity check runs on every clip with a proven time base as `cq.scale-consistency`. That catches a wrong player height or a tilted phone.

### 11.4 Import help copy

Title: "Getting the best copy of your video"

- "Filmed in the Camera app? Use 1080p or 4K at 60 fps, with Enhanced Stabilization and HDR off." (research 06 §4.3, [S14])
- "For slow motion, don't send it through Messages or a chat app first. In Photos, tap Share, then Options, turn on All Photos Data, and Save to Files. Then choose Files here." (Route from the video README; UNVERIFIED on a current iPhone.)
- "Picking straight from your Photo Library can make a smaller copy. If your video looks blurry here, use Files instead." (Whether Safari's picker transcodes is UNVERIFIED; `cq.compression` and `cq.frame-rate` detect the damage.)

---

## 12. Data contract proposals (additive, for `types.ts`)

```ts
/** Everything the capture step knows that the footage alone cannot prove. Stored with each clip. */
export interface CaptureContext {
  source: 'in-app-web' | 'in-app-native' | 'import'
  declaredView: CameraView
  setup?: 'portrait-between-courts' | 'landscape-fence' | 'rear-raised' | 'other'   // section 2.1, 6.1
  orientation: 'portrait' | 'landscape'   // displayed orientation at Record (or of the imported file)
  cameraSide?: 'chest' | 'back'            // side view: hitting-arm (chest) side or the other side
  serveSide: 'deuce' | 'ad' | 'both'
  servingSpot?: 'singles' | 'doubles'      // block card; doubles moves the server 2-3 m (section 2.3)
  serveNumber: 1 | 2 | 'mixed'
  intendedType?: 'flat' | 'slice' | 'kick' // block default, player-entered (D3/D4)
  intendedTarget?: 'T' | 'body' | 'wide' | 'mixed'   // a single target is required for speed-experimental (D4)
  speedSession?: boolean                   // experimental speed toggle on at Record: 2.7 m room-ahead rule, 120 fps
  handedness: Handedness
  playerHeightM: number
  playerHeightSource: 'entered' | 'default'
  conditions?: { wind?: 'calm' | 'breezy' | 'windy'; light?: 'day' | 'lights' | 'indoor' }
  device?: { cameraLabel?: string; model?: string; lensModel?: string; focal35mmEquiv?: number }
  requested?: { width: number; height: number; fps: number }
  delivered?: { width: number; height: number; fps: number; mimeType?: string }
  tilt: {
    source: 'sensor' | 'image' | 'unknown'  // 'image' and 'unknown' cap heights at estimated (TILT_UNKNOWN)
    requestedPitchDeg?: number              // landscape at the fence only, at most 5 (section 9.3)
    imagePitchDeg?: number; imageRollDeg?: number; imageConfidence?: number
  }
  orientationSamples?: { tMs: number; pitchDeg: number; rollDeg: number }[]   // live capture only
  yaw?: { deg: number; source: 'baseline' | 'landing-step'; confidence: number }  // from cq.yaw
  framingAtStart?: {
    frameTopM: number             // T after the toss-offset allowance (section 8.2)
    frameTopAllowanceM: number    // 0.3 × tan(V/2) for the orientation used
    frameTopMinM: number          // T_min for this player
    bodyPx: number                // raw pixels (section 8.1)
    shortSidePx: number
    roomAheadM: number; roomBehindM: number
    cameraHeightM: number
    pitchDeg?: number; rollDeg?: number; yawDeg?: number
    tossApexMarginM?: number
  }
  hitSoundTiming: boolean
  slowMotionAnswer?: 'normal' | 'slomo-120' | 'slomo-240' | 'slomo-unknown' | 'not-sure'
  expectedServeCount?: number
  recordedAnyway?: string[]               // live check ids failing when "Record anyway" was chosen
  recordedWithoutTossHeight?: boolean     // headroom under 4.3 m: toss-height metrics unavailable for the block
  rearTap?: { rmsPx: number; pitchDeg: number; rollDeg: number }   // rear view: court-corner homography (section 6.3)
  native?: { exposureS?: number; iso?: number; videoFovDeg?: number; intrinsics?: number[]; thermal?: { tMs: number; state: 'nominal' | 'fair' | 'serious' | 'critical' }[] }
}

/** Extends QualityCheck (all optional, so existing code keeps compiling). */
export interface QualityCheck {
  id: string                 // 'cq.*' ids from section 8.2
  pass: boolean
  severity: 'info' | 'warn' | 'block'
  message: string            // player copy
  value?: number
  scope?: 'live' | 'clip' | 'serve' | 'session'
  serveIds?: string[]
  fix?: string               // player copy for "Next time"
  affects?: string[]         // metric ids from the gating matrix
  threshold?: { pass?: number; warn?: number; block?: number; unit?: string }
  metricsReason?: string     // METRICS reason code for the same condition, e.g. 'TILT_UNKNOWN'
}
```

`framingAtStart.bodyPx1080` from the earlier draft is replaced by raw `bodyPx` plus `shortSidePx`. Also adopt the builders' proposals: `VideoMeta.timeBaseStatus` and `timeBaseKind` (the video report), and the rule that interpolated pose samples never yield `measured` (the pose report).

---

## 13. Validating the capture checks

Real serve footage cannot be downloaded for this build (founder constraint). Validation therefore uses the synthetic generator (`tools/synth`), unit tests and the in-app annotation mode. Real-footage and device tests are the documented next step.

### 13.1 Synthetic matrix (tools/synth `Scenario` fields)

| Check | Scenario sweep | Pass criterion (proposed) |
|---|---|---|
| `cq.toss-headroom`, `cq.court-room` | `video.orientation` portrait/landscape × `camera.anchor` 'centre-mark' × `distanceM` 5-10 × `camera.heightM` 1.2-1.9 × serving offset (singles near and far half, doubles) × `focal35mmEquivMm` 24/26 × `tossApexHeightM` overrides 3.0-4.6 × pitch (`lookAtHeightM`) 0 to +5 degrees | The live frame top T within ±5 cm of the projected truth from a standing frame (gap geometry §9, test 2); pass/info/block classification 100% correct where the margin exceeds 10 cm; room ahead within ±10 cm; report the band |
| `cq.player-size` | distance 4-12 m × `shortSidePx` 720/1080/2160 × orientation | Tune the raw-pixel thresholds from the curve of pose detection rate and joint error against body pixels, extending the ROI evaluation below 216 px |
| `cq.camera-level` (roll from tosses) | `rollDeg` 0, 2, 4, 8 | Median absolute error 1 degree or less with 12 tosses |
| Tilt rectification (section 2.4) | pitch 0, 5 and 10 degrees with the known gravity vector perturbed by ±1 degree | Heights above the feet within 2 cm, and `shoulder-tilt-trophy` within 1 degree, of the level render (gap geometry §9, test 3). Passing this is the condition for raising the pitch cap to 8 degrees |
| `cq.camera-level` (picture pitch) and `cq.yaw` | yaw via `lookAtForwardM` (ε = atan(lookAtForwardM / distanceM)) 0, 3, 5, 8, 12, 15 degrees × pitch 0-5 degrees × line contrast (painted hard court, faint synthetic grass) × orientation | Baseline pitch and yaw within 1.5 degrees where the line is found; landing-step yaw within 4 degrees over 10 serves; classification at the 5 and 10 degree edges 95% or more correct outside ±1 degree (proposed) |
| Speed room (`cq.court-room` speed rule) | portrait vs landscape × distance × serve speed 120-180 km/h at 120 fps | The 2.7 m rule agrees with whether 3 or more clean detections fall inside the frame 4-50 ms after contact in 95% or more of serves |
| `cq.camera-stability` | `shake` presets (tripod, light wind, handheld) | Tripod vs handheld classified 98% or more correctly |
| `cq.view` | `view` side/rear/front45 × `cameraSide` chest/back × handedness | 95% or more correct for side vs rear; confusion matrix reported |
| `cq.time-base` physics | `fps` 120/240 with `mediaFps` 30; normal 30/60 | Correct ratio in 95% or more of clips with 5 or more clean tosses; 0 false slow-motion calls on normal clips |
| `cq.flicker` | `look.flicker` on/off × fps 25/30/50/60/120/240 × lighting `night` | Detection 95% or more; false alarms 2% or less on daylight clips |
| `cq.motion-blur` | `shutterS` 1/60-1/2000 × `bodyBlurSamples` | Exposure estimate within ±30% of truth |
| `cq.exposure` | lighting bright/overcast/dusk/night | Messages fire only for dusk and night |
| `cq.dropped-frames` | ffmpeg post-process dropping 1-5 frames, VFR segments | 100% of gaps of 1.5× or more detected; serve mapping correct |
| `cq.compression` | `crf` sweep | bits-per-pixel threshold separates visibly damaged clips |
| `cq.lens` / distortion | 13 mm with `k1`, `k2` | Side view: block fires; rear view: outcome suggestions kept and mechanics bands unavailable |
| Rear rectification (section 6.3) | rear camera 2.0-3.3 m high × 5-7 m behind × lateral offset 0-1.5 m × tilt 8-18 degrees | Pitch and roll from the corner homography within 1 degree; back-knee band error within ±5 points of gap geometry §3.3 (test 1) |
| `cq.ball-visibility` | outfits, surfaces (hard-blue, grass-green, clay-red), lighting | Report detection share by condition |
| `cq.scale-consistency` | wrong entered height (±10%), roll | Warn fires at 15% or more of scale error |

**Generator gaps to add:** a second figure walking on an adjacent court (`cq.extra-people`, `cq.tracking`); a low sun facing the camera (`cq.backlight`); a lens-smudge post-filter; audio with speech-like background noise (`cq.audio-timing`); a serving offset for the doubles spot, if `anchor: 'centre-mark'` does not already cover it (UNVERIFIED); and faint court lines for the baseline detector. Portrait output, the centre-mark anchor, look-at pitch and yaw, roll and deuce/ad court sides already exist in `tools/synth` (`camera.ts`, `setup.ts`), as do the two D1 set-ups as scenarios `default75` (portrait, 7.5 m, 1.4 m) and `fence9` (landscape, 9 m, 1.6 m).

**Overall acceptance:** on good-condition synthetic clips, a false `block` on 1% or fewer of clips and a false `warn` on 5% or fewer. On deliberately degraded clips, the intended check fires on 95% or more. Coverage (the share of serves producing each metric) is reported alongside accuracy, because silent drop-outs flatter accuracy (research 05 §11.3).

### 13.2 Device QA (manual, needs real phones)

- iPhone 16e or 17e (26 mm, no ultra-wide), iPhone 17, a Pro model, and one Android phone.
- For each: `getUserMedia` resolution, fps and lens labels in portrait and landscape, and the rotation `MediaRecorder` writes; sensor pitch against a spirit level and against the baseline's vanishing point (section 2.4); `MediaRecorder` container, bitrate and timestamp regularity; DeviceMotion signs (section 9.3 test); wake lock in Safari and in the home-screen app; the Photos picker's transcoding; slow-motion import through Files; flicker under at least two Australian court-light installations; and a 15-minute 1080p60 session in direct sun above 30 °C with thermal state logged (research 06 §15.6).

### 13.3 Annotation mode

The founder or a coach marks the toss apex, contact and landing frames and taps "in frame" or "out" on the toss for real clips. These labels tune the headroom, ball-visibility and segmentation thresholds. They stay on the device unless the person exports them.

---

## 14. Known limitations and open questions

- **The web prototype cannot lock exposure, focus, frame rate or lens.** Blur and flicker are detected, not prevented. Thermal state is invisible. These are the main reasons for the native capture plugin. [Our inference]
- **The lens field of view is assumed** in the web prototype (tan(V/2) of about 0.67 in portrait and 0.39 in landscape, section 9.4). Only suggestions and the toss-offset allowance depend on it; measurements use the player's height scale.
- **Portrait in the browser is untested.** Whether iOS Safari delivers upright portrait frames through `getUserMedia`, and how `MediaRecorder` records rotation, are UNVERIFIED (section 9.2). `DESIGN.md` specifies the live framing screens in landscape only.
- **Sensor pitch accuracy** against a spirit level, including camera-to-sensor misalignment, is UNVERIFIED (gap geometry open question 7). Rectification is only as good as that reading. The picture-based pitch and yaw (baseline vanishing point) are untested, which is why they cap heights at `estimated`.
- **Keystoned bodies.** Pose accuracy on tilted frames is untested, hence the 5 degree cap (section 2.4).
- **Pitch is unknown for imports** unless the picture gives it. Heights then carry `TILT_UNKNOWN`, and `cq.scale-consistency` is the only other guard.
- **Recreational toss heights and spreads rest on very thin data** (two recreational women; no recreational men; gap ranges §2, §6). The 4.3 / 4.5 / 4.7 m envelope may need revising once annotated clips exist.
- **The rear knee and shoulder conditions** (section 6.1) generalise from one simulated camera position (2.8 m high, 6 m behind). They need the knee-projection test (gap geometry §9, test 1) and real footage.
- **Court run-off in Australia** below Tennis Australia's club minimum is unknown, so how often players need the fallbacks in 2.6 is unknown (research 06, open question 7).
- **Night capture** for the comp-night segment (D11): the lux bands in `cq.exposure` are uncalibrated, and whether Australian LED court lights flicker is unknown (research 10 §9, test 7).
- **Open:** does iOS Safari deliver 60 fps from `getUserMedia`? Is a countdown enough for solo players, or is Watch start essential (research 06, open question 8)?

---

## 15. Decisions this spec thinks are wrong or incomplete

1. *Retired 27 September 2026.* This item disputed the earlier D1 placement (1.2-1.6 m high, 6-8 m from the centre mark, level), which often cut off the toss. The revised D1 replaces it with a framing rule (frame top 4.5 m; 4.3 m accepted; 4.7 m target), a portrait default and a landscape-at-the-fence alternative, which this spec now follows (section 2). The number is kept so that references to later items stay valid.
2. **Audio default is still not written into a decision.** The revised D4 settles *how* audio is used: to time contact only, processed into timestamps, with raw audio not kept. It does not say whether audio is on or off by default. Research 06 §11 and research 07 §7 recommend video-only capture by default because of surveillance-device laws. **Proposal:** add to D8: audio off by default; opt-in hit-sound timing, processed on the device into contact timestamps and never stored.
3. **"Four-corner court tap" (D1, rear view) needs defining.** Corners near the net are hidden by the net from a rear camera. **Proposal:** the far service-line and far baseline singles corners, plus an optional far T check (section 6.3). The same homography also supplies the pitch and roll that rectify the rear mechanics bands.
4. **Horizontal reference.** Heights need no calibration beyond the player's height and a measured tilt. "Forward" and "landing" also need a horizontal reference: this spec uses the front toe at setup, not a detected baseline (section 1), plus the yaw check (`cq.yaw`). `METRICS.md` should confirm the reference, or accept baseline detection as an experimental extra.
5. **Minimum serves.** Research 06 suggests 20 per stratum for toss statistics. This spec chooses a 15-serve block with interval-honest display and pooling (section 5.3). It is not a conflict with DECISIONS, but D7 should state the minimums once `METRICS.md` settles them.
6. **"Blocks recording below 4.3 m" (D1) and "Record anyway."** D1 says the live check blocks recording below 4.3 m. This spec keeps that literally: "Record anyway" cannot bypass the headroom block. Players who cannot move the phone get an explicit "Record without toss height", whose block has no toss-height metrics at all (section 9.8). **For the product lead to confirm** that this labelled escape is within D1's intent. The alternative is a hard stop with no recording.
7. **D1's portrait figures depend on the field of view assumed.** D1 quotes a frame top of about 5 m and about 450 px of player height, using a long-side half-angle of 31-33 degrees. At the full-width 1x angles (33.65 degrees for 26 mm, 35.8 degrees for 24 mm), a player on the camera-side half at 7-8 m from the centre mark is 310-420 px tall, and 450 px holds only for a cropped field of view or a server about 6 m from the phone. On the far half it is 260-340 px (table 2.2a). The rule is unaffected, because the live check measures the real frame; the copy should say "about 300-450 px".
8. **Portrait and D4's speed range.** Portrait at 7-8 m leaves only 2.1-2.8 m of frame ahead of the front toe on the camera-side half. Speed method A needs about 2.7 m (50 ms of flight after contact). Speed sessions therefore need the phone at about 8.5 m, or the landscape set-up (section 2.3). D1 and D4 do not mention this; they should, or the experimental speed range will quietly fail for most portrait users serving from the near side.
9. **Toss-offset allowance.** Gap geometry §6.8 gives a 0.12 m allowance, which is 0.3 m × tan(V/2) for the landscape field of view. In portrait the same formula gives 0.20-0.22 m. This spec uses the orientation's own value (section 8.2); the gap study's wording should say it is landscape-specific.

---

## Sources used

All primary sources are listed, with access dates and fact-check logs, in the research files. Those relied on here:

- **Research 06 (capture protocol):** [S1], [S2] SwingVision set-up and import guides; [S4] OTSA; [S6] Puig-Diví 2019; [S8] Whiteside, Giblin & Reid 2014; [S9] Vacek 2025; [S10]-[S12], [S53], [S54] iPhone specifications; [S14], [S15] iOS Camera settings; [S17]-[S21], [S23] AVFoundation and ProcessInfo documentation; [S24] Apple operating temperatures; [S28] storage per minute; [S30] SwingVision data blog; [S31], [S32] NIST handbook; [S33] Tennis Australia lighting sheet; [S35], [S36] flicker and mains frequency; [S37] court dimensions; [S39], [S40] Bureau of Meteorology; [S41]-[S46] safeguarding, filming, privacy and drone rules; [S55] AS 2560.2:2021.
- **Research 05 (CV feasibility):** [S1] Apple Vision subject size; [S4], [S5] MediaPipe; §2.2 blur table; §6 metric methods; §9 iPhone capture realities, including [S53]-[S58] (slow-motion assets and PHPicker) and [S65] (requestVideoFrameCallback); §11 validation.
- **Research 02 (Australian market):** §6 court booking, [S41] Tennis Australia orientation and lighting guidance, surfaces.
- **Research 03 (biomechanics):** [S27] toss zenith in high-performance men; §7 [S35] contact position by serve type; §10 second-serve toss placement (coaching inference).
- **Research 07 (privacy and Apple):** §7 surveillance-device laws; [S30] App Review 2.5.14; [S41] purpose strings and PHPicker.
- **Research 09 (UX benchmarks):** §7 live framing checklist; §8 permissions and waiting; [S6] non-colour status; [S16] minimal camera overlays; [S21] Action & Vision stability step.
- **Engine reports:** the video report (time base, slow motion, WebM timeline), the pose report (tracking, `numPoses`, interpolation rule) and `app/src/analysis/ball/toss.ts` (the gravity time-scale check).
- **Gap studies (27 September 2026):** `research/gaps/side-view-geometry-contradictions.md` (framing formulas, minimum distances, tilt rectification and its error, yaw, toss offset, knee and trunk projections, leg-drive proxies, the audio speed error budget; its sources [G1]-[G22], including [G19] Tennis Australia run-offs); `research/gaps/recreational-reference-ranges.md` (recreational toss envelope, headroom check, apex extrapolation, provisional bands and plausibility bounds; [N1] Carboch & Hrychová 2025); `research/gaps/intuitive-tennis-kovacs-primary-content.md` §4.1 (checkpoints only the rear view shows); `research/gaps/australian-segment-evidence.md` (segment context).
- **Research 10 (segment decision):** §2.2 persona (doubles-heavy night comps), §7.1 M3 (second-serve check-in) and M11 (night capture handling), §9 test 7 (lights).
- **Synthetic generator:** `tools/synth/src/camera.ts`, `setup.ts` and `scenarios.ts` (centre-mark anchor, look-at pitch and yaw, portrait output, scenarios `default75` and `fence9`).
- **Pose ROI evaluation:** `app/src/analysis/pose/README.md` (a 216 px player detected in 100% of frames with the ROI crop).
- **Geometry arithmetic** for tables 2.2a and 2.2b and the other new [Our inference] figures: the formulas in section 2.2 with the research 06 §3.1 fields of view, a 1.75 m player, a 6.7 cm ball, a 0.3 m toss offset and a 1.0 m serving offset. Tilted cases use top = h + D_b · tan(V/2 + pitch) and bottom = h − D · tan(V/2 − pitch).

---

## Revision log (2026-09-27)

**Decision-driven changes**

- **D1 (revised).**
  - Portrait between courts (7-8 m from the centre mark, 1.3-1.6 m, level) is now the default. Landscape at the fence (8.5-9.5 m, 1.4-1.8 m, 4K preferred, measured tilt of 5 degrees or less) is the alternative. Distances are measured from the centre mark, and the framing rule (4.5 m minimum, 4.3 m accepted with extrapolation, 4.7 m target) replaces fixed distances. This touched sections 0, 2, 3.2, 4, 8.2, 8.5, 9.4 and 9.8.
  - New section 2.4: tilt is read from the sensors and rectified, the pitch cap is 5 degrees, a picture cross-check is added, `TILT_UNKNOWN` applies without a sensor reading, and yaw has its own check.
  - The 0.5x lens is dropped as a side-view fallback (section 2.6).
  - New section 2.5 says what the side view cannot measure, and gives the toss-offset bias.
  - Section 9.3 extends the level algorithm to portrait. Section 10 adds native rotation, with 4K for the fence and rear set-ups.
- **D4 (revised).**
  - The audio flight-time speed path is removed everywhere: sections 6.2 and 7.2, and `cq.audio-timing`. Audio times contact only.
  - A target tag and 50 ms of in-frame flight (the 2.7 m room-ahead rule) are added to the prerequisites of `speed-experimental`.
  - `speed-average-rear` is added for the rear view.
- **D5 (revised).**
  - `trunk-tilt-band` is removed. The side view gains `leg-drive`, `drive-time`, `loading-depth`, `deep-bend-flag` and `shoulder-tilt-trophy`, with their capture needs (section 1).
  - `knee-bend-band` and `shoulder-over-shoulder-contact` are rear-only, with height, distance, ray and rectification conditions (sections 6.1-6.3).
  - The gating matrix's "Bands" column is now "Body" (section 8.3). The knee note in section 14 is deleted.
- **D11 (new).**
  - The block card gains "Standing at: Singles spot / Doubles spot" and "Light", and the doubles-spot guidance is new (sections 2.3 and 3.7).
  - Section 5.5 gains the second-serve check-in template (research 10 M3).
  - Night-capture handling (M11): a light-level band in `cq.exposure`, a "Recorded under lights" chip, and a daylight-first recommendation (section 3.4).
- **Other corrections found while revising.**
  - `cq.court-room` no longer tells players to turn the phone towards the net, which would break the yaw rule.
  - `cq.scale-consistency` now uses the 0.3 m toss offset.
  - Stability thresholds scale by the short side.
  - `framingAtStart.bodyPx1080` becomes raw `bodyPx`.
  - Section 15 gains items 6-9: the Record anyway rule, D1's portrait pixel figures, portrait and speed, and the portrait toss-offset allowance.

**Reviewer issues**

| # | Severity | Issue | Verdict | Reason and what was applied |
|---|---|---|---|---|
| 1 | critical | Placement rule contradicts revised D1 | **Accepted** | D1 is binding. Applied: sections 0, 2, 3.2 and Diagrams A-C, both set-ups; `cq.orientation` (portrait passes; landscape passes in the fence band); `QC.frameTopM` {block 4.3, min 4.5, target 4.7}; live frame top on rectified coordinates minus the toss-offset allowance; `cq.court-room` re-derived for ±20.5 degrees, including 50 ms of outgoing ball; doubles warning (+1.5-2 m); section 15 item 1 retired. One adjustment: the 0.12 m allowance holds for landscape only, so portrait uses 0.20-0.22 m, the same formula (section 15 item 9). |
| 2 | major | No yaw estimate or gate | **Accepted** | Gravity cannot see yaw, and forward metrics depend on it. Applied: new `cq.yaw` (baseline vanishing column, landing-step fallback; pass 5 degrees or less, warn 5-10 with an added σ of lateral σ × sin ε, block above 10 for forward metrics and speed), the live baseline guide (section 9.6 and Diagram C), and `QC.yawDeg`. The METRICS §3.3, §3.10, §3.16 and §3.22 σ terms are for the METRICS reviser. |
| 3 | major | Pixel thresholds scaled by frame height penalise portrait | **Accepted** | Scaling by frame height would warn on a 450 px portrait player. Applied: raw subject pixels (section 8.1); `cq.player-size` at 300/250/200 px, justified by the ROI evaluation's 216 px result; ball size under 8 px as a warning; values held once in `metrics.json`. `metrics.json` has no `captureThresholds` block yet, and METRICS §3.25 still says 350/250/200 scaled, so both are left to the METRICS reviser. |
| 4 | major | Removed side-view metrics and the audio speed path still listed | **Accepted** | They contradict D4 and D5. Applied: section 1 rewritten with the D5 metrics and rear-only rows; the Body column in section 8.3; the audio path removed from section 6.2 and `cq.audio-timing`; target tag added to the speed prerequisites; the section 14 knee note deleted. |
| 5 | critical | Default set-up fails `cq.orientation`; the level algorithm is landscape-only | **Accepted** | Same root cause as issue 1, and resolved together. Also applied: named set-ups; step 4 "Upright, standard lens" with the fence card; section 9.3 θ₀ = 90° − `screen.orientation.angle`, with a portrait device test; native 4K for Landscape at the fence; alt text updated. |
| 6 | major | Headroom gate too lax; 8 degree pitch; motion-denied path records uncorrected tilt | **Accepted** | D1 sets 4.3/4.5/4.7 m and a 5 degree cap, and bans uncorrected tilt. Applied: pass at T_min (4.5 m, higher only for very tall players), info at 4.3-4.5 m, block below 4.3 m; `pitchMaxUp` 5; Ready withheld while the tilt is unknown, with `TILT_UNKNOWN` capping heights if recorded anyway; "Record anyway" cannot bypass the 4.3 m block, and "Record without toss height" makes the whole block's toss-height metrics unavailable (flagged as section 15 item 6); readout copy updated. PRODUCT §6.3.4 and §7.2 and DESIGN §8.20 are outside this reviser's files and are flagged below. |
| 7 | minor | The rear view allows 0.5x, and the section 6.2 table is stale | **Accepted** | The rear view now carries mechanics metrics, and METRICS §1.1 excludes 0.5x. Applied: 1x required for the rear mechanics bands and `speed-average-rear`; 0.5x kept for outcome suggestions only (reason `cq.lens`); section 6.2 table replaced with the D1 rear list, including height, distance, knee-ray and tilt conditions and rectification from the corner tap (section 6.3). |

No issue was rejected.

**Flags for other specs (not edited here)**

- METRICS §3.25 and `metrics.json`: a raw-pixel `subject-size` table and a `captureThresholds` block.
- METRICS: yaw σ terms, and the `TILT_UNKNOWN` reason code.
- METRICS §1.1: the portrait field of view for `K` (the long side, 67.3 or 71.6 degrees, is vertical in portrait).
- PRODUCT §6.3.4 and §7.2 step 6, and DESIGN §8.20: the new headroom readout ("needs 4.5", 4.7 m target, 4.3 m block).
- DESIGN §10.3 R2-R6: portrait live-framing layouts, the baseline guide, and removal of the "Turn your phone sideways" gate.
- ARCHITECTURE (iOS set-up step): "portrait UI with landscape capture" should become capture in either orientation, with portrait the default.
- Research 10 §2.2 persona: its set-up line still quotes the pre-revision D1 (1.2-1.6 m, 6-8 m).
- Gap geometry §6.8: say that the 0.12 m toss-offset allowance is the landscape value.
- COACHING (the note citing "CAPTURE.md §15" for a 3.45 m frame top) and PRODUCT (the D1 conflict note citing CAPTURE §2.2 and §15): revised D1 resolves that conflict, and section 15 item 1 is retired, so those notes should be dropped.
