# CAPTURE: recording guidance and capture quality (v1)

**Status:** draft for build, 27 September 2026. **Follows:** DECISIONS D1 (primary view), D2 (honesty labels), D3 (player-entered outcomes), D4 (speed and spin), D7 (statistics honesty), D8 (privacy and storage) and D9 (platform). **Read with:** `METRICS.md` (metric definitions and display thresholds), `COACHING.md`, `ARCHITECTURE.md`, `PRODUCT.md` and `DESIGN.md` (visual tokens). Section 15 flags where this spec thinks a decision is wrong or incomplete.

**Evidence tags:** [Established] = peer-reviewed or strong consensus. [Coaching interpretation] = expert practice. [Vendor claim]. [Regulation]. [Our inference] = our reasoning or arithmetic, reproducible from the formulas given. **UNVERIFIED** = not yet checked on a real device or source. Research is cited as (research 06 [S14]).

---

## 0. Summary

| Topic | v1 rule |
|---|---|
| Primary view | Side-on, on the server's **hitting-arm side** (the chest side), on the **baseline extension**, **7-9 m from the serving spot**, phone **1.5-1.9 m high** (up to 2.1 m on a fence), **level**, **landscape**, **1x lens**, **60 fps**. The live check has the final say on distance and height (section 2). |
| Block | One block = **15 serves** (12-20 is fine) of one kind: one court side, first *or* second serves. |
| Minimums | 5 measured serves for a mechanics observation; 8 measured serves for any spread statistic (shown as an early read with a wide interval); 12 measured serves in each session for a "Did it work?" comparison (section 5). |
| Second angle | Optional raised rear view ("Outcomes view"). It unlocks toss left/right drift and experimental automatic in/out and placement after a court-corner tap. Statistics are never mixed across views (D1). |
| Audio | **Off by default.** An opt-in "Use the hit sound for timing" turns sound into timestamps on the phone and discards it (section 7.2; flagged in section 15). |
| Quality | 31 automatic checks with a severity of `info`, `warn` or `block`. Each has a player message and a fix, and each maps to the metrics it downgrades (section 8). Every summary shows "X of N serves measured". |
| Live assistant | Web prototype: `getUserMedia` preview, level from `DeviceMotionEvent`, a light MediaPipe pose pass at about 5 Hz, a practice-toss ball check, and a "Ready" state readable from the serving spot (section 9). |
| Native | Locked lens, fixed fps (including 50/100 fps at night), custom exposure, locked focus and white balance, intrinsics, attitude logging and thermal state move to AVFoundation (section 10). |
| Import | Photos/Files import with a slow-motion question and a gravity-based time-base check. Speed is never computed from a clip whose time base is not proven (section 11). |

---

## 1. What capture must deliver

Capture exists to meet the prerequisites of the metrics. The metric ids below are the shared ids; `METRICS.md` owns definitions, labels and display thresholds. This table only states what the *footage* must contain.

| Metric id | Must be in frame | fps: minimum (target) | Scale | Other capture prerequisites |
|---|---|---|---|---|
| `serve-count` | Server's whole body, toss | 24 (60) | none | Fixed camera |
| `toss-apex-height` | Ball from release to past the apex; feet | 24 (60) | Player height (entered) plus a standing frame | Level phone; apex inside the frame (else extrapolated, section 8, `cq.toss-headroom`) |
| `toss-forward` | Ball at apex; front foot at setup | 24 (60) | as above | Side view (forward is horizontal in the image) |
| `toss-drop` | Apex and contact | 24 (60) | as above | |
| `toss-height-spread`, `toss-forward-spread` | as above, for 8 or more measured serves of one stratum | 24 (60) | relative | Camera not moved within the block, or the block is split at the move |
| `contact-height-ratio` | Ball at contact; standing frame | 24 (60; 120 is better) | Player height | |
| `contact-forward` | Ball at contact; front foot at setup | 24 (60) | Player height | Side view |
| `rhythm-release-to-contact`, `rhythm-spread` | Toss release and contact | 24 (60) | none | Proven time base (section 11) |
| `trophy-pause` | Both arms from release to racket drop | 24 (60-120) | none | Proven time base |
| `knee-bend-band` | Both legs, feet | 24 (60) | none | Player at least 250 px tall; band only (D5) |
| `trunk-tilt-band` | Hips and shoulders at contact | 24 (60) | none | Side view |
| `landing-distance` | Feet before take-off and at landing; 1.8 m of court ahead of the front toe | 24 (60) | Player height | Side view |
| `repeatability` | As its components | | | |
| `serve-in-rate`, `first-serve-in-rate`, `double-faults` | nothing (player-entered in the side view, D3) | | | Block tagged 1st or 2nd; rear view gives `experimental` suggestions |
| `placement-zone` | nothing (player-entered target, D3) | | | Rear view plus corner tap gives `experimental` zones |
| `serve-type-mix` | nothing (player-entered intent, D4) | | | |
| `speed-experimental` | Clean ball detections after contact | **120** | Player height | Side view, proven time base, short exposure (D4) |
| `speed-radar-entered` | nothing | | | Player types in a radar reading |
| `spin` | always `unavailable` (D4) | | | |
| `capture-quality` | This spec (section 8.4) | | | |

Below the minimum frame rate a metric is `unavailable`; between the minimum and 50 fps, contact, `toss-drop` and timing metrics are downgraded (section 8.3).

"Forward" and "landing" are measured horizontally in the image, relative to the front toe at setup. They need neither court lines nor the baseline to be detected. Whether `METRICS.md` reports them against the front toe or against the baseline is its decision; capture guidance asks players to start with the front toe just behind the baseline, so the two are within a few centimetres. [Our inference]

---

## 2. Primary view: geometry

### 2.1 The position

- **Side:** the server's hitting-arm side: the right side for a right-hander, the left for a left-hander. From here the camera sees the chest at setup and trophy and the profile at contact, and the toss arm and ball release are not hidden by the body (research 06 §2.3). [Our inference]
- **Line:** on the baseline extension, outside the doubles sideline, with the phone pointing straight across the court along the baseline (square to the side fence). This keeps the net-ward movements (toss forward, contact forward, trunk tilt, landing) parallel to the image plane. Measurement error grows as the view becomes oblique (research 06 [S6]). [Established for the principle; Our inference for the serve]
- **Distance:** 7-9 m from the serving spot. For a right-hander serving from the deuce court about 0.5-1 m from the centre mark, that is 2-4 m outside the doubles sideline (the doubles sideline is 5.49 m from the centre mark, research 06 [S37]). On most courts this is at or near the side fence. [Our inference]
- **Height:** 1.5-1.9 m (chest to head height). A fence clip can go to 2.1 m, which lets the phone come closer (table 2.2).
- **Angle:** level. Roll and pitch within 2 degrees is the target (section 9.3). No upward tilt in the default guidance. See section 2.4 for the narrow-court fallback.
- **Orientation:** landscape. Portrait at a workable distance loses the landing and the ball's early flight (research 06 §3.6).
- **Lens:** 1x (main camera). Do not zoom. 0.5x is a fallback only (section 2.4).
- **Frame rate:** 60 fps by default (section 3.3 explains the other choices).

### 2.2 Why these numbers

The frame must include the feet with a small margin and the top of the highest toss with room to spare. Measured toss apexes are about 3.4-3.5 m in high-performance and junior players (3.48 ± 0.24 m, research 03 [S27]; 3.40 ± 0.24 m, research 06 [S9]). Recreational values are not published (UNVERIFIED), so this spec designs for a frame top of **at least 4.2 m** at the server (target) and never less than **3.9 m** (minimum). [Our inference]

For a level phone at height *h* and distance *d* from the server, the frame spans `h ± d·tan(VFOV/2)` at the server. Landscape 16:9 vertical fields of view are 44.2 degrees for the 24 mm main lens (Pro models) and 41.1 degrees for the 26 mm main lens (iPhone 17, 16e, 17e) (research 06 §3.1, [S10]-[S12], [S53], [S54]).

**Height of the top of the frame at the server (m), level phone** [Our inference, computed]

| Phone height | Lens | 5.5 m | 6.5 m | 7.0 m | 7.5 m | 8.0 m | 9.0 m |
|---|---|---|---|---|---|---|---|
| 1.2 m | 24 mm | 3.43 | 3.84 | 4.04 | 4.24 | 4.45 | 4.85 |
| 1.2 m | 26 mm | 3.26 | 3.63 | 3.82 | 4.01 | 4.20 | 4.57 |
| 1.4 m | 26 mm | 3.46 | 3.83 | 4.02 | 4.21 | 4.40 | 4.77 |
| 1.6 m | 24 mm | 3.83 | 4.24 | 4.44 | 4.64 | 4.85 | 5.25 |
| 1.6 m | 26 mm | 3.66 | 4.03 | 4.22 | 4.41 | 4.60 | 4.97 |
| 1.8 m | 26 mm | 3.86 | 4.23 | 4.42 | 4.61 | 4.80 | 5.17 |
| 2.0 m | 26 mm | 4.06 | 4.43 | 4.62 | 4.81 | 5.00 | 5.37 |

**Minimum server distance for a 4.2 m frame top with the feet in frame:** 26 mm lens: 8.0 m at 1.2 m height, 7.2 m at 1.5 m, 6.4 m at 1.8 m, 5.9 m at 2.0 m. 24 mm lens: 7.4, 6.7, 5.9 and 5.4 m. [Our inference]

**Player size and ball size at 1080p** (1.75 m player, 6.7 cm ball) [Our inference, computed; research 06 §3.4]

| Lens and distance | Pixels per metre | Player height | Ball diameter |
|---|---|---|---|
| 26 mm, 7 m | 206 | 360 px | 14 px |
| 26 mm, 8 m | 180 | 315 px | 12 px |
| 26 mm, 9 m | 160 | 280 px | 11 px |
| 24 mm, 9 m | 148 | 259 px | 10 px |
| 26 mm, 9 m at **720p** | 107 | 187 px | 7 px |

At 1080p the whole 7-9 m band keeps the player above the 250 px warning threshold and the ball above 8 px (thresholds in section 8.5; UNVERIFIED and to be tuned). At 720p (possible for in-browser recording, section 9.2) the phone should be higher and closer: at 1.9 m and 6.5 m the frame top is 4.34 m and the player is about 259 px. The live assistant computes this for the actual phone, so the copy only needs a starting point. [Our inference]

A level phone cannot also make the player a third of the frame height, which Apple advises for Vision body pose (research 05 [S1]): with 4.2 m or more of vertical coverage, a 1.75 m player fills about 30%. MediaPipe crops the person and resizes the crop to 256 × 256, so a player of 250-350 px loses little (research 05 [S4]). The ROI crop in the engine is the mitigation. [Our inference]

### 2.3 Deuce and ad, left-handers, doubles positions

- **The phone stays put for both sides.** For a right-hander with the phone on the right, the ad-court serving spot is about 1-2 m further from the phone than the deuce spot. The player is 15-25% smaller in the frame, and the frame top is higher. Each block is calibrated separately from the player's standing height, so this does not bias the statistics; it only changes the pixel budget. [Our inference]
- **Set up at the closer spot.** Headroom is tightest at the spot nearer the phone (deuce for right-handers, ad for left-handers), and player size is tightest at the further spot. If both sides will be recorded, aim for 7-8 m from the nearer spot.
- **Serve direction.** The swing plane turns only about 9 degrees between deuce and ad targets, which changes forward distances by about 1% (cos 9 degrees = 0.988). No correction is needed. [Our inference]
- **Left-handers:** mirror everything. The phone goes on the left.
- **Doubles serving position** (2-3 m from the centre mark) moves the server closer to the phone. The live check will ask for the phone to go back.

### 2.4 When the court is too narrow

Some community courts have less side run-off than the ITF recommends (research 06 §3.3; Australian averages UNVERIFIED). In order of preference:

1. **Raise the phone.** On a fence at 2.0-2.1 m, 26 mm needs only about 6 m.
2. **Small upward tilt, in-app capture only.** Up to 8 degrees of pitch is allowed when the app records the pitch from the motion sensors (section 9.3) and corrects heights in analysis. For imported clips tilt is unknown, so this is not offered.
3. **0.5x at 3.5-4.5 m.** Allowed with a warning: about half the pixels per metre, more edge stretch, and absolute heights become `estimated` (research 06 §3.5). The iPhone 16e and 17e have no ultra-wide (research 06 [S53], [S54]), so this option does not exist there.

### 2.5 Image conventions for the engine

- **Into-court direction.** Chest-side view: the net is on the image **right** for a right-hander and on the image **left** for a left-hander. The back-side view (phone on the non-hitting side) is mirrored. The engine confirms the direction from the landing step (section 8, `cq.view`). [Our inference from court geometry]
- **Baseline.** When the phone is exactly on the baseline extension and square to it, the baseline projects close to the vertical centre line of the image below the horizon. This is a useful optional cross-check, not a requirement. Lines on sand-filled synthetic grass are often faint (research 02 §6.2). [Our inference]

---

## 3. Player-facing setup guide (copy)

Tone: calm, short, second person, Australian English, no exclamation marks. Every live state has a glyph and a text label, never colour alone (research 09 [S6]). Strings in quotes are final copy unless marked *[placeholder]*.

### 3.1 Before you go

Title: "Before you head out"

- "Phone charged to at least 40%, with about 2 GB free."
- "Something to hold the phone steady at chest height: a tripod, a fence clip, or a bag or bench it can lean against."
- "Balls. A basket is easiest. With 4 to 6 balls, serve them all, pick them up and keep going. We skip the walking."
- "Water, a hat and sunscreen."
- "Warm up first. Your first few serves of the day aren't typical, so we'll record after you're loose."

### 3.2 Set up in six steps

Title: "Set up your phone"

1. **"Pick your side."** "Put the phone on your hitting-arm side. That's your right if you're right-handed, and your left if you're left-handed." *(Diagram A, section 4.)*
2. **"Line it up with the baseline."** "Stand the phone outside the court, in line with the baseline, about 3 to 4 big steps outside the outer sideline. That's usually at the side fence, roughly 7 to 9 metres from where you serve."
3. **"Chest to head height, and level."** "Set the phone about 1.5 to 1.9 m high. Keep it level. Don't tilt it up at the sky. The level guide turns solid when it's right."
4. **"Landscape, standard lens."** "Turn the phone sideways, with the camera facing across the court towards your serving spot. Use the standard 1x lens and don't zoom."
5. **"Check the sun."** "Stand at your serving spot and look at the phone. The sun should be behind the phone or off to one side, not behind you. If you're squinting a little, that's good: the camera isn't."
6. **"Stand tall, then toss."** "Walk to your spot and stand tall for two seconds. Then toss a ball as you would for a serve and catch it. We'll check you, your toss and the light, and tell you if anything needs to move."

Result states (large, readable from the serving spot; section 9.7):

- Ready: "Ready" (tick glyph, chime).
- One change: "Phone back 2 steps", "Raise the phone a little", "Phone closer 1 step", "Level the phone", "Hold still", "Step into the picture". Exactly one instruction at a time, the one that matters most.

Below the big state, for when the player is back at the phone: "Room above your toss: 4.4 m (needs 4.2)". "You: 320 px tall (good)". "Phone height: about 1.6 m". "60 fps, 1080p". "Light: good". "Steady".

### 3.3 Frame rate: what each choice unlocks

Title: "Frame rate". Default is 60. Copy for each option:

- **"60 fps (recommended)."** "Everything in your report: toss, contact, rhythm, landing and posture. Timing to about a sixtieth of a second." [Our inference; research 06 §4.1]
- **"30 fps."** "Works for your toss, contact height, posture and landing. Rhythm and timing are about half as precise, and speed isn't available."
- **"120 fps."** "Sharper contact frames and finer timing. Needed for the experimental speed range. Best in daylight. Files are about twice as big and the phone gets warmer." (D4)
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
- **Night:** "Court lights work. They're dimmer than daylight, so timing is a little less precise and the fast parts of your swing will blur. Your toss and posture are fine." Social-play lighting is about 250 lux against more than 7,500 lux on an overcast day (research 06 [S33]; the current standard AS 2560.2:2021 was not read, research 06 [S55]).
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

Per-minute sizes are a third-party compilation of iPhone Settings figures for the iPhone 8 to 15 (research 06 [S28] [Market data]) and must be re-measured on current phones. "Most Compatible" (H.264) roughly doubles them. The in-browser recorder uses a requested bitrate (section 9.2): 12 Mbit/s is 90 MB a minute. A kept serve clip spans 1.5 s before toss release to 2.5 s after contact (research 06 §10.2). Retention follows D8.

### 3.7 Recording a block

Title: "Record"

1. Block card (before each block): "Side: Deuce / Ad", "Serves: First / Second", "Mostly: Flat / Slice / Kick" (optional default for the block, player-entered), "Aiming at: T / Body / Wide / Mixed" (optional), "Wind: Calm / Breezy / Windy". *(Wind matters: toss variability rises in wind, research 06 [S8]. Matched comparisons can then exclude windy sessions.)*
2. "Tap Record, then walk to your spot. You have 10 seconds." Countdown beeps; a chime marks the start.
3. "Serve 15 at your normal pace. Take your time between serves."
4. "Walk back and tap Stop."
5. Tally, straight away: "While it's fresh: how many went in?" with optional "Net / Long / Wide" counters (D3). Per-serve tags stay available in the review flow.

Pain rule, shown once per session start and whenever pain is logged: "If a serve hurts, stop. Sharp pain, pain that builds, or pain that's still there tomorrow is a reason to see a physio or doctor." (COACHING.md owns the full safety gate, D6.)

---

## 4. Court diagram brief (for the designer)

Three drawings, built from `DESIGN.md` tokens. Line weights and colours come from there. Dimensions below are real and to scale.

### Diagram A: plan view (top-down), primary set-up

- **Canvas:** one half of the court plus the surround: the near baseline to just past the net, with 4 m of surround on the phone's side and 2 m elsewhere. Scale bar "0-5 m".
- **Court:** doubles width 10.97 m, singles 8.23 m, service line 6.40 m from the net (5.49 m from the baseline), centre service line, centre mark on the baseline (research 06 [S37]). Draw only the near half in full; the far half fades out.
- **Server:** a small top-down figure (head circle plus shoulder bar) on the deuce side, 0.6 m to the right of the centre mark and 0.2 m behind the baseline, shoulders angled side-on (left shoulder towards the net for the right-handed variant). Label "You".
- **Phone:** a phone glyph on the baseline extension, outside the right doubles sideline, 7.5 m from the server (8.1 m from the centre mark). Label "Phone, 7-9 m from you". A dimension line from the server to the phone.
- **Field-of-view wedge:** from the phone, pointing along the baseline towards the server, with a half-angle of 34 degrees, lightly filled. The server sits in the middle third of the wedge. A small arrow in the wedge reads "Into court" towards the net.
- **Sun:** a sun glyph behind the phone (outside the fence) with the caption "Sun behind the phone".
- **Callouts:** "Outside the outer sideline", "In line with the baseline", "Phone faces straight across".
- **Variants:** a mirrored left-hander version (phone on the left); an "ad side" ghost figure 1.2 m left of the centre mark with the caption "Same phone spot for the ad side; you'll look smaller".

### Diagram B: side elevation (what the camera sees)

- **View:** looking along the baseline, as if standing behind the phone.
- **Ground line** across the width. The server stands at centre, 1.75 m tall.
- **Toss:** a dotted arc from release (1.7 m, just in front of the head) up to an apex at 3.5 m, about 0.3 m towards the net, and down to contact at 2.6 m. Label "Toss apex".
- **Phone** at left, 1.6 m high, 7.5 m away, drawn level with a small spirit-level glyph.
- **Two field-of-view lines** from the lens, at plus and minus 22 degrees, meeting the server's plane at 4.6 m and below the ground. Shade the band between the apex and the top edge and label it "Room above your toss (keep 0.5 m or more)". The part of the frame below the ground is greyed with the label "A level phone sees some ground; that's fine".
- **Callouts:** "Level, not tilted up", "1.5-1.9 m high".
- A small inset "Portrait: loses your landing" with a cross, next to "Landscape" with a tick glyph (not emoji).

### Diagram C: the phone screen during framing (landscape)

- **Live preview** with a light guide overlay (keep it minimal, research 09 [S16]).
- **"Stand here" band:** a vertical band from 35% to 60% of the width, measured from the back-court edge (the edge away from the net).
- **Floor guide:** a dashed line at 85% of the height: "Feet about here".
- **Toss zone:** a soft shaded band over the top 20%: "Keep this clear above your toss".
- **Level guide:** a horizon line that rotates with roll, plus a centre dot that moves with pitch. It becomes solid with the text "Level" when within 2 degrees.
- **Checklist rail** on the right, collapsible, with glyph plus text: Level, In frame, Room above, Room ahead, Steady, Light, Ball seen, "60 fps".
- **Record button:** "Ready" when the core checks pass. Otherwise it shows the one fix, with "Record anyway" in an overflow menu.

### Diagram D (optional second angle): plan view

- The same court. A second phone on the back fence directly behind the server, 5 m behind the baseline, labelled "2.5-3.3 m high, tilted down slightly". Its field-of-view wedge reaches both far service boxes.
- A dashed sight-line over the net tape to the far service line, with the caption "High enough to see the far lines over the net".

Alt text for A: "Top-down tennis court. You serve from just behind the baseline near the centre. The phone stands outside the court on your hitting-arm side, in line with the baseline, 7 to 9 metres away, facing straight across at you, with the sun behind it."

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

The same-session re-test is confounded by fatigue and warm-up, so the verdict text must say so ("Compared within one session; check again next time"). COACHING.md owns that wording. [Our inference]

---

## 6. The optional second angle: raised rear ("Outcomes view")

### 6.1 Set-up copy

Title: "Add a view from behind (optional)"

1. "Clip the phone to the back fence behind your serving spot, as high as you can: 2.5 to 3.3 m is ideal, and 2 m at the least."
2. "Centre it behind where you serve, or up to a metre towards your non-hitting side so your body doesn't hide the ball."
3. "Landscape. Tilt it down a little so your feet and both far service boxes are in the picture. 0.5x is fine here. Use 4K if your phone offers it."
4. "Check the net tape isn't covering the far service line. If it is, the phone needs to go higher."
5. "Tap the four corners we show you on the far court." *(section 6.3)*

### 6.2 What it unlocks, exactly

| Capability | Side view only | With the rear view | Label |
|---|---|---|---|
| Toss left/right drift and its spread | not visible | measured from the rear clip | Spread `measured` (relative); absolute offset `estimated`. METRICS.md to assign ids; suggested `toss-lateral` and `toss-lateral-spread` |
| Serve in, net, long, wide | player-entered | automatic suggestions in the tagging flow | `experimental`; a suggestion the player confirms is stored as `player-entered` with provenance `auto-suggested` (D3) |
| `placement-zone` (T, body, wide) | player-entered target | bounce zone after the corner tap | `experimental`; bounces within about 20-30 cm of a line in depth show as "close call" (research 06 §6.3) |
| `serve-in-rate`, `first-serve-in-rate`, `double-faults` | from tags | from confirmed suggestions | as above |
| Contact left/right of the body | not visible | from the rear clip | `estimated` |
| Audio flight-time speed path (D4) | contact-to-bounce distance assumed | bounce position known | stays `experimental`, range only |
| Two-phone 3D toss | no | later, needs sync (research 06 §8.2) | not in v1 |

What it does **not** unlock: spin (always `unavailable`, D4), serve type (still player intent), and any mixing of statistics with the side view (D1).

**Honest limits.** A ball at the far service line is only about 7 px across at 4K on 1x and about 4 px at 1080p, below the 8 px detection threshold. Far-court detection is marginal (research 06 §8.1). Depth resolution in the far box is 8-19 cm per pixel depending on camera height (research 06 §6.3). Automatic outcomes therefore stay `experimental` until the rear-view validation passes (research 05 §11.3: 95% or more correct for bounces more than 30 cm from lines).

### 6.3 Court-corner tap (rear view)

The near-net corners are hidden by the net, so the tap uses far-court ground points [Our inference]:

1. far service line × left singles sideline;
2. far service line × right singles sideline;
3. far baseline × left singles sideline;
4. far baseline × right singles sideline;
5. optional: the far T (centre service line × service line), used as a check.

Fit a homography to the court model (`ball/homography.ts`, `COURT_KEYPOINTS`) with RMS reprojection error under 3 px at 1080p (research 06 §14, check 6). Otherwise ask the player to re-tap. The rear set-up is stored per court (by the player's court name) so it can be re-used when the phone goes back in the same place, subject to `cq.camera-stability`.

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

- **Audio off by default.** A phone's microphone may count as a listening device under state and territory surveillance-device laws, and recording other people's private conversations is restricted in most jurisdictions (research 06 [S44]; research 07 §7) [Regulation]. The in-app recorder requests video only. An opt-in toggle "Use the hit sound for timing" explains: "Your phone listens for the moment of contact. The sound is turned into timings on this phone and deleted; it's never saved or sent. Leave this off if people are talking nearby." When on, audio is analysed on the device into onset timestamps (`video/audio.ts`) and not stored. Imported clips already contain audio: it may be used for timing on the device, and the app's stored copy drops the audio track by default. [Our inference, following research 06 §11 and research 07 §7]
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
- `block`: live (before recording): the Record button does not reach "Ready", but "Record anyway" stays available and the failing check ids are stored in the capture context. After recording: the affected scope (serve, clip or metric set) is excluded from statistics and the metric shows `unavailable` with the check id as its reason. Excluded serves remain playable.

**Scope:** `live` (framing assistant), `clip` (whole recording), `serve` (one detected serve) or `session`.

**Output:** each check emits a `QualityCheck` (`types.ts`) with the extensions proposed in section 12. A metric that is downgraded or unavailable because of a capture problem carries the check id as its reason code (for example `unavailableReason: 'cq.toss-headroom'`). The UI can then link straight to the fix. `METRICS.md` owns the final status mapping; the gating matrix in 8.3 is the capture side's proposal.

**Units:** pixel thresholds are stated at a 1080-px frame height and scaled by `frameHeightPx / 1080`. Normalised coordinates follow `types.ts` (0-1, origin top-left, rotation-corrected).

**Thresholds are initial values** (UNVERIFIED), taken from research 06 §14 where they exist, and are to be tuned with the synthetic generator and the annotation mode (section 13). They live in one config module, `analysis/quality/thresholds.ts`.

### 8.2 Check catalogue

Each entry gives: **how** (web prototype computation from decoded frames, pose or ball data), **thresholds**, **severity**, **message / fix** (player copy) and **affects** (metric ids).

#### A. File and timing

**`cq.decode`** · clip · *how:* `probeVideo` succeeds and `openFrameSource` finds a decode path (WebCodecs, or the media-element fallback with `missingIndices` empty or under 1%). *Thresholds:* probe error or decode failure → block; media-element path → info; over 1% of frames unreachable → warn. *Message:* "We can't open this video." / fix: "Try exporting it again from Photos or Files as a standard video." *Affects:* everything (block).

**`cq.frame-rate`** · clip · *how:* `VideoMeta.captureFps` after the time-base step (section 11). *Thresholds:* 100 fps or more: pass, with info "High speed: sharper contact frames"; 50-99: pass; 24-49: warn; under 24: block. *Message (warn):* "Filmed at 30 fps. Your toss, contact height and posture are fine; timing is less precise." / fix: "Use 60 fps next time." *Affects:* `rhythm-release-to-contact`, `rhythm-spread`, `trophy-pause`, `contact-height-ratio` and `contact-forward` (downgraded, since the contact frame is uncertain by about ±17 ms at 30 fps, research 06 §4.1); `speed-experimental` is `unavailable` below 120 fps (D4).

**`cq.time-base`** · clip · *how:* `probe.timeBase.status` (`proven` or `unknown`) and `kind`; for in-app recordings the capture context proves it; for imports, the slow-motion answer plus `gravityTimeScaleCheck` (section 11.3). WebM recordings (estimated timeline, video README) are marked `estimated-timeline`. *Thresholds:* proven, or confirmed by physics within tolerance: pass; player answer with physics unavailable: warn; player answer contradicted by physics, or `possible-rendered-slomo` unresolved: block (timing only). *Message:* "We couldn't confirm this video's real speed, so timings are hidden." / fix: "Tell us if it was slow motion, or import the original from Files." *Affects:* timing metrics and `speed-experimental` (unavailable when blocked). Positions (toss, contact, landing) do not depend on the time base and are unaffected. [Our inference]

**`cq.dropped-frames`** · clip and serve · *how:* `analyzeFrameTiming` on real timestamps: gaps over 1.5× the median interval, variable-frame-rate segments (for example 60 → 30 fps in low light, research 06 [S14]), and `droppedFrameEstimate`. Map each gap to serve windows [release − 0.2 s, landing + 0.2 s]. *Thresholds:* no gap in any serve window and under 1% overall: pass; gaps outside serve windows, or 1-5% overall: info; a gap inside a serve window: warn for that serve; a gap within ±0.1 s of contact: block for that serve's timing and speed. *Message:* "Your phone skipped some frames during 3 serves, so their timing is left out." / fix: "Close other apps, keep the phone cool, and use 1080p." *Affects:* per serve: timing metrics, contact metrics, `speed-experimental`.

**`cq.resolution`** · clip · *how:* displayed short side (`VideoMeta.height` in landscape). *Thresholds:* 1080 or more: pass; 720-1079: info (player size decides); 480-719: warn; under 480: block. *Message:* "This video is low resolution, so you're small in the picture." / fix: "Record at 1080p or 4K." *Affects:* through `cq.player-size` and `cq.ball-visibility`.

**`cq.compression`** · clip · *how:* bits per pixel per frame = (video track bytes × 8) / (duration × width × height × fps). *Thresholds:* 0.05 or more: pass; 0.03-0.05: info; under 0.03: warn. Heavily re-compressed files (for example sent through a chat app) fall here. The values are guesses to tune. *Message:* "This video looks heavily compressed, which blurs the ball." / fix: "Import the original from Photos or Files instead of a copy sent through a chat app." *Affects:* toss and contact metrics (downgraded through ball-visibility confidence).

**`cq.clip-length`** · clip · *how:* duration and size. *Thresholds:* up to 15 min: pass; 15-30 min: info ("This will take a while"); over 30 min or over 4 GB: warn, and the trim step is offered. *Affects:* none (performance only).

#### B. Framing and geometry

**`cq.orientation`** · clip · *how:* displayed width vs height. *Thresholds:* landscape: pass; portrait: warn. *Message:* "Portrait crops your landing and the ball's flight." / fix: "Turn the phone sideways." *Affects:* nothing directly; `cq.court-room` and `cq.toss-headroom` catch the consequences.

**`cq.view`** · clip · *how:* combine four cues from the first 5 or more detected serves [Our inference; thresholds to tune]:
(1) `estimateFacingSide` during setup and at contact. Side-chest: face visible at setup ('front'), profile at contact. Rear: back or profile at setup, 'back' at contact. Side-back: 'back' at setup, profile at contact.
(2) Shoulder width relative to torso length at contact: narrow (under about 0.35) means a side view; wide (over about 0.6) means rear or front.
(3) Post-contact ball direction: across the frame means side; rising towards the frame centre while shrinking means rear; growing means front.
(4) Landing-step direction: horizontal in the image means side; upward in the image means rear.
Output: `side-chest`, `side-back`, `rear`, `front`, `unknown`, with a confidence. *Thresholds:* detected view matches the declared view: pass; `side-back`: warn; `rear` detected when side was declared (confidence 0.8 or more): ask the player and re-route to the rear pipeline; `front` or `unknown`: block for positional metrics. *Message (side-back):* "You filmed from your non-hitting side. Most things still work, but your body sometimes hides the toss release." / fix: "Next time put the phone on your right" (mirrored for left-handers). *Affects:* `front`/`unknown`: all positional and band metrics unavailable; timing `experimental`. `side-back`: release-based rhythm and toss metrics downgraded.

**`cq.camera-side`** · clip · *how:* profile handedness vs `inferHandedness`, and the into-court direction from the landing step vs the direction expected for that handedness and side. *Thresholds:* consistent: pass; inconsistent with confidence 0.8 or more: warn and ask. *Message:* "Were you serving left-handed today?" (or "Is the net on the left of your video?"). *Affects:* everything positional until resolved; the answer fixes the axis.

**`cq.player-size`** · clip (per side) · *how:* standing body height in pixels from `estimateStandingBodyHeight` (setup frames) × frame height, scaled to 1080. *Thresholds:* 300 px or more: pass; 250-299: info; 150-249: warn; under 150: block for pose-based metrics. Above 85% of the frame height also fails `cq.toss-headroom`. *Message:* "You're quite small in the picture, so posture readings are less certain." / fix: "Move the phone a step closer, or record at 4K." *Affects:* warn: `knee-bend-band`, `trunk-tilt-band`, `landing-distance` and absolute heights downgraded. Block: bands and landing unavailable; ball-based toss metrics continue with a downgraded scale.

**`cq.player-in-frame`** · serve · *how:* for frames from setup to landing, the fraction of core landmark samples (nose, shoulders, elbows, wrists, hips, knees, ankles, heels) with visibility 0.5 or more lying inside the frame with a 3% margin (`trackingQuality().inFrameFraction`). *Thresholds:* 0.98 or more: pass; 0.90-0.98: warn; under 0.90: block for that serve's pose metrics. *Message:* "Part of you went out of the picture on 2 serves." / fix: "Stand in the middle of the picture, or move the phone back a step." *Affects:* per serve: bands, `landing-distance`, `toss-forward` and `contact-forward` (which need the front foot).

**`cq.feet-visible`** · clip and serve · *how:* heel and foot-index landmarks with visibility 0.5 or more in setup and landing windows, and the floor line (`BodyHeightEstimate.groundY`) at or above 97% of the frame height. *Thresholds:* both: pass; feet occluded or cut off: warn. *Message:* "We can't see your feet clearly." / fix: "Make sure your feet are in the picture, with a little ground below them." *Affects:* `landing-distance` unavailable; the height scale falls back to ankles (downgraded); `toss-forward` and `contact-forward` unavailable when the front toe is missing.

**`cq.toss-headroom`** · live, serve and session · *how:* live: `groundY / unitsPerM` gives the frame-top height at the player (m), and the practice-toss apex margin (section 9.5). Recorded: whether the toss track's apex lies inside the frame with at least 4 ball diameters (about 0.27 m) to the top edge; whether the ball left through the top edge (track leaves at y ≤ 0.01 while rising, and re-enters falling). *Thresholds:* live frame top 4.2 m or more: pass; 3.9-4.2 m: info; under 3.9 m: block (live). Per serve: apex inside with margin: pass; inside with less margin: info; ball left the frame: warn, and the apex is extrapolated from the parabola with gravity constrained. Session: over 25% of serves extrapolated: warn. *Message:* "Your toss went out of the top of the picture on 5 serves." / fix: "Move the phone back a step or raise it." *Affects:* per serve: `toss-apex-height` and `toss-drop` downgraded (extrapolated) or unavailable when fewer than 3 samples remain on either side of the apex. Extrapolated serves are excluded from `toss-height-spread`; if fewer than 8 remain, the spread is unavailable.

**`cq.court-room`** · live and clip · *how:* horizontal room ahead of the front toe (into court) and behind the back heel, in metres: (edge distance in frame-height units) / `unitsPerM`. *Thresholds:* 1.8 m or more ahead and 1.0 m or more behind: pass; 1.2-1.8 m ahead: warn; under 1.2 m: block (live). *Message:* "There isn't much room in front of you in the picture, so your landing may be cut off." / fix: "Turn the phone slightly towards the net, or move it back." *Affects:* `landing-distance` (unavailable when the landing is out of frame), `contact-forward` (downgraded).

**`cq.camera-level`** · live and clip · *how:* live and in-app: pitch and roll from `DeviceMotionEvent` (section 9.3), logged at 10 Hz throughout recording. Imports: roll from the toss parabolas. Fit x(t) and y(t) as quadratics; the acceleration vector (aₓ, a_y) points along image gravity, so roll = atan2(aₓ, a_y), taking the median over 5 or more clean tosses. Pitch is unknown for imports. *Thresholds:* roll: 2 degrees or less: pass; 2-5: info (the analysis rotates coordinates); over 5: warn. Pitch (logged only): 3 degrees or less: pass; 3-8 degrees upward: info (heights corrected using the logged pitch and the lens model); over 8, or downward: warn. Import: info "tilt unknown; heights assume a level phone". *Message:* "Your phone was tilted, so heights are approximate." / fix: "Use the level guide next time." *Affects:* warn: absolute heights (`toss-apex-height`, `contact-height-ratio`) and `landing-distance` downgraded; spreads unaffected.

**`cq.camera-stability`** · live, clip and serve · *how:* pick 8-12 textured background patches (high gradient energy, outside the dilated server box and the toss region) from the median of the first second at the 640-px analysis size. Estimate each patch's translation by normalised cross-correlation within ±16 px, every 5th frame and every frame from release to landing. Take the robust median of the patch shifts, scaled to 1080. Derive: within-serve drift (max − min), jitter RMS, and step changes between serves (native: CoreMotion attitude jumps). This follows Apple's Action & Vision stability step (research 09 [S21]). *Thresholds:* within-serve drift up to 2 px: pass (research 06 §14, check 11); 2-6 px: warn (per-serve shift subtracted); over 6 px, or jitter RMS over 3 px: block for positional metrics ("handheld"). A step change over 6 px between serves: info, and the block is split at the move for spreads (spreads computed within each part and pooled). *Message (handheld):* "The phone was moving, so we could only time your serve." / fix: "Rest the phone on a fence, bag or tripod." *Message (step):* "The phone moved at 2:13. We've measured the serves before and after separately." *Affects:* handheld: all positional metrics unavailable; timing and count unaffected.

**`cq.lens`** · clip · *how:* live: the chosen device label (section 9.2). Imports: QuickTime camera metadata (lens model, 35 mm-equivalent focal length) through `parseMoovMetadata`, if the phone writes it (UNVERIFIED key names). *Thresholds:* main lens or unknown: pass; ultra-wide (16 mm-equivalent or less): warn; telephoto: info. *Message:* "The wide lens stretches the picture near the edges, so heights are approximate." / fix: "Use the standard 1x lens if you have room to stand back." *Affects:* absolute heights and `landing-distance` downgraded.

**`cq.scale-consistency`** · clip · *how:* only when the time base is proven. Compare the gravity-implied scale (fitted vertical toss acceleration ÷ 9.81 m/s²) with the height-derived scale (`scaleFromBodyHeight`). The ratio r should be 1 (`gravityTimeScaleCheck` inverted, with its model error of about 4%). In the side view the toss sits only about 0.1-0.2 m off the player's plane, so the plane error is about 2% at 7 m. [Our inference] *Thresholds:* |r − 1| up to 8%: pass; 8-15%: info; over 15%: warn. *Message:* "Your height and the ball's fall don't quite agree, so heights are approximate." / fix: "Check your height in Profile, and that the phone was level and side-on." *Affects:* warn: absolute heights, cm-based spreads and `landing-distance` downgraded; `speed-experimental` unavailable.

#### C. Light and image

**`cq.exposure`** · live, clip · *how:* every 0.5 s and at key frames, Rec. 709 luma inside the server's box: mean, the share clipped (255 or more after decode, or 250 in 8-bit) and the share crushed (5 or less). Temporal noise: the median absolute frame-to-frame difference on static background patches ÷ √2. *Thresholds:* subject clipped and crushed each under 5%, mean 60-200, noise σ 6 or less: pass; clipped or crushed 5-15%, mean 40-60, or noise 6-10: warn ("low light"); subject mean under 40 or noise over 10: warn plus lower pose confidence. Pose success itself (`cq.player-in-frame`, `cq.tracking`) is the hard gate. *Message:* "It's quite dark, so tracking is less precise." / fix: "Film in daylight, or under the brightest court." *Affects:* bands and toss metrics downgraded; `speed-experimental` unavailable at night unless blur checks pass.

**`cq.backlight`** · live, clip · *how:* subject mean luma ÷ background mean luma, and the share of clipped pixels in the region above the player's head (the toss sky). *Thresholds:* ratio 0.5 or more and toss sky clipped under 20%: pass; ratio under 0.5 or toss sky clipped at 20% or more: warn; both: warn plus a live "swap ends" prompt. *Message:* "The sun's behind you in the picture, so you're in shadow and the ball is hard to see." / fix: "Serve from the other end so the sun is behind the phone." *Affects:* via ball visibility and pose confidence.

**`cq.motion-blur`** · clip · *how:* (1) static sharpness: variance of the Laplacian on the torso box in setup frames, normalised by local contrast (smudge, focus or compression). (2) Effective exposure time from the rising toss. Where the fitted ball speed v is known, the blob's length along the velocity L gives t_exp ≈ (L − D) / v, with D the ball diameter. (3) Ball elongation at the apex (research 06 §14, check 9). [Our inference] *Thresholds:* estimated exposure 1/500 s or shorter: pass; 1/500-1/250 s: info ("arm blur near contact"); longer than 1/250 s, or apex elongation over 2× the diameter: warn. Static sharpness below 50% of the corpus median: warn ("lens smudge or focus"). *Message:* "The picture is a bit blurry around contact." / fix: "More light helps. In daylight, wipe the lens." *Affects:* contact metrics downgraded; `speed-experimental` unavailable when exposure is longer than 1/500 s (the ball streak at 150 km/h is over 8 cm, research 05 §2.2).

**`cq.flicker`** · live, clip · *how:* per-frame mean luma of static background patches (excluding the server box and the toss region) over 2-4 s windows. Detrend with a 0.25 s moving average. Compute the relative amplitude A = 2|X(f_a)| / (N × mean) with a Goertzel filter at the alias frequency f_a = the distance from 100 Hz to the nearest multiple of the frame rate, folded into [0, fps/2]: 20 Hz at 60 and 120 fps, 10 Hz at 30 fps, 100 Hz at 240 fps, and 0 at 25, 50 and 100 fps (no pulsing, only static banding) (research 05 §9.6). *Thresholds:* A under 1%: pass; 1-3%: info; 3% or more: warn (research 06 §14, check 8). *Message:* "The court lights are flickering in your video. We've corrected for it, but ball tracking is a little less certain." / fix: "At night, use 25 or 50 fps if your phone offers it." *Affects:* toss metrics downgraded; `speed-experimental` unavailable. The ball detector applies per-frame gain normalisation whenever A is 1% or more.

#### D. Scene

**`cq.extra-people`** · clip · *how:* MediaPipe with `numPoses: 2` (the pose builder's bystander setting). Count other people whose box is at least half the server's height; test overlap (IoU over 0) with the server's box inside serve windows. *Thresholds:* none: pass; present, never overlapping: info; overlapping in a serve window: warn. *Message (info):* "Someone else was in the picture. Your video stays on this phone." *Message (warn):* "Someone walked behind you on 2 serves, so we left those out." / fix: "Frame the shot against the fence where you can." *Affects:* per serve, via `cq.tracking`.

**`cq.tracking`** · serve · *how:* `ServerTracker` decisions inside the serve window: the fraction of 'lost' frames, any 'reacquired' event, and `swapsUnresolved` spans (pose report). *Thresholds:* no loss and no re-acquisition: pass; lost under 5% (gap-filled): info; 'reacquired' inside the window, or lost 5% or more: block for that serve's pose metrics. *Message:* "We lost track of you on 1 serve, so it's left out." *Affects:* per serve: pose-based metrics. Interpolated samples never produce a `measured` value (pose contract proposal).

**`cq.ball-visibility`** · live, serve, session · *how:* live: the practice toss is found (section 9.5). Recorded: the fraction of frames from release to contact with a `detected` (not predicted) ball observation, the toss-fit RMSE, and the median colour-likelihood contrast of the ball against its local background (`ball/colour.ts`). *Thresholds:* 80% or more of toss frames detected: pass (research 06 §14, check 13); 50-80%: warn for that serve; under 50%: block for that serve's toss metrics. Session: toss tracks in under 60% of serves: warn. *Message:* "We couldn't follow the ball on several serves." / fix: "A plain background helps: sky, a dark windscreen or a wall. Avoid trees or a busy court behind you, and keep the sun behind the phone." *Affects:* per serve: toss metrics and ball-based contact metrics unavailable; rhythm falls back to pose-based release (downgraded); `speed-experimental` unavailable.

#### E. Serve outcome of the pipeline

**`cq.serve-segmentation`** · serve and session · *how:* from the serve module's `ServeEvents`: a serve is *countable* when toss release and contact are found with confidence 0.6 or more. Excluded, and listed by reason: a caught toss (the ball falls past the release height with no contact), a serve cut off by the start or end of the recording, overlapping events, or a release-to-contact time outside 0.6-2.0 s. The expected count comes from the player, when given. *Thresholds:* session: measured ÷ detected 0.8 or more: pass; 0.5-0.8: warn; under 0.5, or fewer than 5 measured: block for session statistics (per-serve review still works). Detected count differing from the expected count by more than 2: info. *Message:* "We found 13 serves; you said about 15. Tap to mark any we missed." *Affects:* excluded serves are left out of every per-serve metric except the "not counted" list. `serve-count` reports both numbers. Caught tosses are counted separately and not included in toss spreads (`METRICS.md` may decide otherwise).

**`cq.audio-timing`** · clip (only when hit-sound timing is on, or for an import with audio) · *how:* `assessAudioTiming(meta).usable`, and the share of video contacts with an audio onset within ±30 ms. *Thresholds:* usable and 60% or more matched: pass; otherwise info. *Message:* "Hit sounds weren't clear, so contact timing uses the video only." *Affects:* the timing precision shown; the audio flight-time speed path (D4) is unavailable.

#### F. Device (live only; native unless stated)

**`cq.thermal`** · live · *how:* native: `ProcessInfo.thermalState` (research 06 [S23]). Web: no API in Safari. Proxy: a rising rate of dropped frames in the preview (`requestVideoFrameCallback` `presentedFrames` against the expected count) plus the elapsed recording time. *Thresholds (native):* nominal or fair: pass; serious: warn (step 4K down to 1080p, pause the live pose pass, prompt for shade); critical: finish and save the current block, then stop. *Message:* "Your phone is getting hot. Put it in the shade for a few minutes." *Affects:* none directly.

**`cq.battery`** · live · *how:* native: `UIDevice.batteryLevel`. Web: none in Safari (the Battery Status API is absent), so the check is skipped. *Thresholds:* 15% or more: pass; under 15%: warn before recording (research 06 §14, check 14). *Message:* "Battery is low. A block uses about [placeholder] %."

**`cq.storage`** · live · *how:* native: `volumeAvailableCapacityForImportantUsage`. Web: `navigator.storage.estimate()` (quota − usage), which reflects the site's quota, not free device space. Estimate the block size as MB/min × planned minutes (section 3.6) × 1.5. *Thresholds:* estimate fits: pass; does not fit: warn before recording. *Message:* "You're low on space. This block needs about 450 MB." / fix: "Free up space, or choose to keep key frames only."

### 8.3 Gating matrix (capture side proposal)

U = unavailable for the affected scope; D = downgraded (for `METRICS.md` to map: `estimated`, a wider band or lower confidence); – = no effect.

| Check (failing level) | Toss position | Toss spreads | Contact | Timing | Bands | Landing | Speed | Count |
|---|---|---|---|---|---|---|---|---|
| frame-rate 24-49 (warn) | – | – | D | D | – | – | U | – |
| frame-rate under 120 | – | – | – | – | – | – | U | – |
| time-base (block) | – | – | – | U | – | – | U | – |
| dropped frames in window (serve) | D | excl. | D/U | U | – | – | U | – |
| player-size (warn) | D | – | D | – | D | D | D | – |
| player-size (block) | D | – | D | – | U | U | D | – |
| player-in-frame (serve) | D | – | D | D | U | U | – | – |
| feet-visible | D | – | D | – | U (knee) | U | – | – |
| toss-headroom (serve) | D/U | excl. | – | – | – | – | – | – |
| court-room | – | – | D | – | – | U | U | – |
| camera-level (warn) | D | – | D | – | D | D | D | – |
| camera-stability: moved | – | split | – | – | – | – | – | – |
| camera-stability: handheld | U | U | U | – | D | U | U | – |
| view front/unknown | U | U | U | D (exp.) | U | U | U | – |
| view side-back | D | – | – | D | – | – | – | – |
| lens ultra-wide | D | – | D | – | D | D | D | – |
| scale-consistency (warn) | D | D | D | – | – | D | U | – |
| exposure (warn) | D | – | D | – | D | – | U | – |
| motion-blur (warn) | – | – | D | D | – | – | U | – |
| flicker (warn) | D | – | – | – | – | – | U | – |
| tracking (serve block) | – | – | D | D | U | U | – | – |
| ball-visibility (serve block) | U | excl. | U | D | – | – | U | – |
| serve-segmentation (serve) | excl. | excl. | excl. | excl. | excl. | excl. | excl. | listed |
| audio-timing (info) | – | – | – | – | – | – | U (audio path) | – |

Column members: Toss position = `toss-apex-height`, `toss-forward`, `toss-drop`. (`toss-drop` also inherits the Contact column, because it uses the contact frame.) Toss spreads = `toss-height-spread`, `toss-forward-spread`. Contact = `contact-height-ratio`, `contact-forward`. Timing = `rhythm-release-to-contact`, `rhythm-spread`, `trophy-pause`. Bands = `knee-bend-band`, `trunk-tilt-band`. Landing = `landing-distance`. Speed = `speed-experimental`. Count = `serve-count`. `repeatability` inherits from its components. Player-entered outcome metrics are unaffected by capture checks.

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
export const QC = {
  fps: { block: 24, warn: 50, highSpeed: 100, speedMin: 120 },
  resolutionShortSide: { block: 480, warn: 720, pass: 1080 },
  bitsPerPixel: { warn: 0.03, info: 0.05 },
  playerHeightPx1080: { block: 150, warn: 250, pass: 300, maxFrameFraction: 0.85 },
  inFrame: { marginFrac: 0.03, warn: 0.98, block: 0.90 },
  frameTopM: { min: 3.9, target: 4.2 },
  apexMarginBallDiameters: 4,
  extrapolatedShareWarn: 0.25,
  courtRoomM: { aheadPass: 1.8, aheadBlock: 1.2, behindPass: 1.0 },
  levelDeg: { rollPass: 2, rollWarn: 5, pitchPass: 3, pitchMaxUp: 8, liveReady: 3 },
  stabilityPx1080: { driftPass: 2, driftBlock: 6, jitterRmsBlock: 3, stepSplit: 6 },
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
  audioMatchS: 0.03, audioMatchedShare: 0.6,
  batteryWarn: 0.15, storageSafety: 1.5,
} as const
```

---

## 9. Live framing assistant (web prototype)

### 9.1 Goals and non-goals

- **Goals:** get the player to a passing framing in one or two walks between the phone and the serving spot. Make the result readable from 8 m. Record a clip with known settings and a capture context.
- **Non-goals (web):** exposure, focus, stabilisation and lens control; exact frame-rate choice; thermal monitoring; live serve counting. These are native (section 10).

### 9.2 Camera stream and recorder

- **HTTPS is required** for `getUserMedia` and motion sensors (localhost is fine in development).
- **Permissions in context** (research 09 §8): camera on the first "Set up" tap, after a one-screen explainer with a single "Continue". Motion permission on iOS via `DeviceMotionEvent.requestPermission()` from a user gesture ("Show level"). If motion permission is denied, the level check shows "Level guide unavailable: line the phone up with a fence post" and does not block Ready.
- **Constraints:** `{ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60, min: 24 } }, audio: hitSoundTiming }`. At night with flicker detected: try `frameRate: { exact: 50 }`, then fall back.
- **Lens choice:** after permission, `enumerateDevices()`. On iOS the back cameras appear as separate devices, including virtual multi-camera devices that switch lenses automatically. Prefer the device whose label denotes the plain wide camera ("Back Camera" in English) and avoid "Dual"/"Triple" virtual devices so the lens cannot switch mid-clip (research 06 §4.3, [S14]). Labels are localised and their exact strings are UNVERIFIED; fall back to `facingMode` and record the label chosen.
- **Read back** `track.getSettings()` (`width`, `height`, `frameRate`, `deviceId`) and show it as a chip: "1080p · 60 fps". If the delivered rate is under 50: chip "30 fps: timing less precise" and a link: "For 60, 120 or 240 fps, record in the Camera app and import." Whether iOS Safari delivers 60 fps from the back camera through `getUserMedia` is UNVERIFIED; the design adapts to whatever is delivered.
- **Recorder:** `MediaRecorder` with the first supported of `video/mp4;codecs=avc1.640028`, `video/mp4`, then `video/webm;codecs=vp9`, and `videoBitsPerSecond: 12_000_000` (90 MB/min; whether it is honoured is UNVERIFIED). MP4 is preferred because the probe gives an exact timeline for MP4/MOV, while WebM gets an estimated timeline that assumes a constant frame rate (video README). A WebM recording sets `cq.time-base` to info "estimated timeline", and timing metrics are downgraded. Chunks (`timeslice: 1000`) are written to IndexedDB/OPFS as they arrive, so a crash loses at most a second.
- **Wake lock:** `navigator.wakeLock.request('screen')` for the whole set-up and recording. If it is unavailable (for example in some home-screen modes, UNVERIFIED), show: "Set Auto-Lock to Never while you record (Settings › Display & Brightness)." The screen locking or the app going to the background stops the camera, so: "Don't switch apps while recording."

### 9.3 Level indicator

Use `DeviceMotionEvent.accelerationIncludingGravity`, not `DeviceOrientationEvent`. In landscape the phone sits near gamma = ±90 degrees, where the Euler angles are ill-conditioned. [Our inference]

1. Low-pass the vector with τ = 0.3 s. Normalise to **u**, the "up" direction in device axes (x right, y up the long edge in portrait, z out of the screen). Platforms have historically differed in the sign of this vector, so apply a per-platform sign s (UNVERIFIED; fixed by the device test below).
2. The back camera looks along −z. **Pitch** (positive = lens tilted up) = asin(−u_z).
3. **Roll** = atan2(u_y, u_x) − θ₀, wrapped to ±180 degrees, where θ₀ is 0 or 180 degrees for the two landscape orientations (from `screen.orientation.angle`).
4. **Display:** a horizon line rotated by −roll and a dot offset by pitch. Text: "Level", "Tilt the top away from you" or "Tilt the top towards you", "Rotate slightly clockwise" or "anticlockwise". Solid when |roll| and |pitch| are 2 degrees or less; "nearly level" within 3 (the Ready gate); amber beyond that.
5. **Logging:** pitch and roll at 10 Hz into `CaptureContext.orientationSamples` for the whole recording. A step change over 1 degree during recording marks a camera bump for `cq.camera-stability`.
6. **Device test (QA, required before trusting the signs):** phone flat on a table, face up; then upright in landscape against a wall; then tilted 10 degrees with the top edge away from you. The readings must be pitch −90 degrees (lens pointing at the floor), then pitch 0 and roll 0, then pitch −10 degrees. Repeat in both landscape orientations.

### 9.4 Light pose pass

- **Frames:** `requestVideoFrameCallback` on the preview `<video>`. Take every Nth frame to reach about 5 Hz, then `createImageBitmap` at a 384-px long side, or draw to an `OffscreenCanvas` if resize options are unsupported, then send to the pose worker (`MediaPipePoseSource`, `model: 'lite'`, `numPoses: 2`, VIDEO mode with monotonic timestamps). Keep at most 1 frame in flight.
- **Stand-tall step:** "Stand tall for two seconds." Take the median over 10 frames of `bodyHeightFromPose` → `heightNorm`, `groundY`, `headTopY`. With the player's height H (profile; default 1.75 m flagged as an assumption):
  - `unitsPerM = heightNorm / H`;
  - **frame top at the player** = `groundY / unitsPerM` (m);
  - **ground margin** = `(1 − groundY) / unitsPerM`;
  - **phone height** ≈ `(groundY − 0.5) / unitsPerM` (m, level phone), shown as "Phone height: about 1.6 m";
  - **body pixels** = `heightNorm × recording frame height`;
  - **room ahead / behind** from the toe and heel landmarks to the frame edges;
  - **people:** a count of other people at least half the player's size.
- **Suggestions** use the level-phone relation `top = h + d·t`, with t = tan(VFOV/2) taken as 0.39 (between the 24 mm and 26 mm lenses; ±4%). To add ΔT metres of headroom: raise the phone by ΔT, or move it back by ΔT / 0.39 metres. To grow the player to 300 px: move closer by d × (1 − px/300), with d ≈ `(1 / unitsPerM) / (2t)`. The copy converts metres to steps at 0.8 m per step and gives one instruction, preferring "raise" when the phone is below 1.8 m. [Our inference]

### 9.5 Practice toss and ball check

- "Toss a ball as you would for a serve, and catch it."
- **Region:** above the player's head, from the shoulder line to the frame top, 1.5 body-widths either side.
- **Detection at full preview rate** during a 3-second window after a toss arm rises past the shoulder: frame differencing plus yellow-green colour likelihood on a 160 × 160 downscale of the region (`ball/detector.ts` in a light mode), and a parabola fit.
- **Outputs:** ball found (6 or more consecutive detections), apex height `(groundY − apexY) / unitsPerM`, and apex margin to the frame top `apexY / unitsPerM`.
- **Pass:** found, and margin 0.3 m or more. Otherwise "Room above your toss: 0.1 m. Phone back 2 steps" or "We couldn't see the ball against this background."
- The colours sampled also seed the detector's colour model for the session.

### 9.6 Stability, light and flicker (live)

- **Steady:** registration on 8 background patches at 5 Hz at 320-px width. "Steady" after 2 s with under 1 px of motion at that scale.
- **Light:** luma statistics of the player box and the toss sky at 2 Hz → `cq.exposure` and `cq.backlight` messages.
- **Flicker:** draw each preview frame (full rate, via rVFC) to a 32 × 18 canvas, take the mean luma of the non-player cells, and run a 2 s Goertzel at the alias frequency for the delivered frame rate → "Lights are flickering" info with the 25/50 fps advice.

### 9.7 Screen states and cues

- **At the phone** (normal UI): preview, overlay (Diagram C), checklist rail, chips, and the Record button.
- **At the serving spot** (automatic when the player has been detected standing at the spot for 1 s): a full-bleed state for distance reading, with one large glyph (about 40% of the screen height) and one to three words, meeting DESIGN.md contrast. At 8 m, text 2 cm tall subtends about 8.6 arcminutes, above the roughly 5 arcminutes of a 6/6 letter. [Our inference]
- **Sound:** a soft two-tone chime for Ready, a single low tone for "needs a change", and an optional spoken phrase via `speechSynthesis` (on-device voice, en-AU where available). This is on by default during set-up and can be switched off.
- Each state has a text label and a glyph, never colour alone (research 09 [S6]).

### 9.8 Ready gate

**Ready** requires:

- level within 3 degrees (skipped if motion permission is denied);
- the player found alone or clearly dominant;
- `cq.player-in-frame` passing while standing;
- frame top 3.9 m or more (4.2 m target);
- room ahead 1.2 m or more;
- steady for 2 s;
- player 150 px or more (1080-equivalent);
- delivered frame rate 24 or more.

The practice toss is recommended, not required. When it has run, its failure blocks Ready. **Record anyway** is always available from the overflow menu; the failing ids go into `CaptureContext.recordedAnyway` and are reported in the capture-quality sheet.

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
| Resolution / HDR | as delivered | 1080p 8-bit SDR (Rec. 709), video HDR off; 4K only for the rear view or distances over 9 m (research 06 §4.3) |
| Stabilisation | uncontrolled | off on the connection (off by default, research 06 [S19]) |
| Exposure | auto | Custom exposure (research 06 [S20]): daylight 1/1000 s or shorter, ISO metered on the player's box during framing, then locked. At night 1/250-1/500 s; with flicker, 50/100 fps or a 10 ms multiple when speed is not needed (research 05 §9.6) |
| Focus / white balance | auto | autofocus on the player's box during framing, then `.locked`; white balance locked after framing |
| Geometry | lens assumed | `videoFieldOfView` stored; per-frame intrinsic matrix delivery on (research 06 [S17], [S18]); geometric distortion correction left at its default |
| Level | DeviceMotion | CoreMotion device motion (gravity) at 60 Hz, logged per frame; attitude jumps mark camera bumps |
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
2. **Summary card:** "4:12 · 1080p · 60 fps · iPhone" with chips for any warnings.
3. **Quick scan** (pose on about 30 frames spread through the clip, plus the toss detector on the first 3 toss-like events) → suggested view, handedness check and a provisional player size.
4. **Questions**, asking only what the probe and scan cannot answer:
   - "Where was the camera?" with a suggested answer ("Looks like a side view from your hitting-arm side"): *Side, my hitting-arm side* / *Side, other side* / *Behind me, raised* / *Somewhere else*.
   - "Which side were you serving from?" *Deuce / Ad / Both*. For *Both* in a side view, the scan clusters serves by the player's size and horizontal position (the far spot looks 15-25% smaller) and asks the player to confirm the split: "We found two groups: 9 and 7 serves. Deuce first?"
   - "First or second serves?" *First / Second / Mixed* (mixed means tagging in review).
   - The slow-motion question, when needed (11.3).
   - Height and handedness are prefilled from the profile and shown for confirmation.
5. **Trim** (optional; offered for clips over 5 minutes): a filmstrip range selector.
6. **Analyse**, with the same checks as in-app recordings. Pitch is unknown ("tilt unknown"); roll comes from the toss parabolas.
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
  cameraSide?: 'chest' | 'back'            // side view: hitting-arm (chest) side or the other side
  serveSide: 'deuce' | 'ad' | 'both'
  serveNumber: 1 | 2 | 'mixed'
  intendedType?: 'flat' | 'slice' | 'kick' // block default, player-entered (D3/D4)
  intendedTarget?: 'T' | 'body' | 'wide' | 'mixed'
  handedness: Handedness
  playerHeightM: number
  playerHeightSource: 'entered' | 'default'
  conditions?: { wind?: 'calm' | 'breezy' | 'windy'; light?: 'day' | 'lights' | 'indoor' }
  device?: { cameraLabel?: string; model?: string; lensModel?: string; focal35mmEquiv?: number }
  requested?: { width: number; height: number; fps: number }
  delivered?: { width: number; height: number; fps: number; mimeType?: string }
  orientationSamples?: { tMs: number; pitchDeg: number; rollDeg: number }[]   // live capture only
  framingAtStart?: { frameTopM: number; bodyPx1080: number; roomAheadM: number; cameraHeightM: number; tossApexMarginM?: number }
  hitSoundTiming: boolean
  slowMotionAnswer?: 'normal' | 'slomo-120' | 'slomo-240' | 'slomo-unknown' | 'not-sure'
  expectedServeCount?: number
  recordedAnyway?: string[]               // live check ids failing when "Record anyway" was chosen
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
}
```

Also adopt the builders' proposals: `VideoMeta.timeBaseStatus` and `timeBaseKind` (the video report), and the rule that interpolated pose samples never yield `measured` (the pose report).

---

## 13. Validating the capture checks

Real serve footage cannot be downloaded for this build (founder constraint). Validation therefore uses the synthetic generator (`tools/synth`), unit tests and the in-app annotation mode. Real-footage and device tests are the documented next step.

### 13.1 Synthetic matrix (tools/synth `Scenario` fields)

| Check | Scenario sweep | Pass criterion (proposed) |
|---|---|---|
| `cq.toss-headroom`, `cq.court-room` | `camera.heightM` 1.2-2.1 × `distanceM` 5-10 × `focal35mmEquivMm` 24/26 × `tossApexHeightM` overrides 3.0-4.6 | Agreement with the projected truth: 100% where the margin exceeds 10 cm; report the band |
| `cq.player-size` | distance 4-12 m × `shortSidePx` 720/1080/2160 | Tune thresholds from the curve of pose detection rate and joint error against body pixels |
| `cq.camera-level` (roll from tosses) | `rollDeg` 0, 2, 4, 8 | Median absolute error 1 degree or less with 12 tosses |
| `cq.camera-stability` | `shake` presets (tripod, light wind, handheld) | Tripod vs handheld classified 98% or more correctly |
| `cq.view` | `view` side/rear/front45 × `cameraSide` chest/back × handedness | 95% or more correct for side vs rear; confusion matrix reported |
| `cq.time-base` physics | `fps` 120/240 with `mediaFps` 30; normal 30/60 | Correct ratio in 95% or more of clips with 5 or more clean tosses; 0 false slow-motion calls on normal clips |
| `cq.flicker` | `look.flicker` on/off × fps 25/30/50/60/120/240 × lighting `night` | Detection 95% or more; false alarms 2% or less on daylight clips |
| `cq.motion-blur` | `shutterS` 1/60-1/2000 × `bodyBlurSamples` | Exposure estimate within ±30% of truth |
| `cq.exposure` | lighting bright/overcast/dusk/night | Messages fire only for dusk and night |
| `cq.dropped-frames` | ffmpeg post-process dropping 1-5 frames, VFR segments | 100% of gaps of 1.5× or more detected; serve mapping correct |
| `cq.compression` | `crf` sweep | bits-per-pixel threshold separates visibly damaged clips |
| `cq.lens` / distortion | 13 mm with `k1`, `k2` | Warn fires; report the height bias at the frame edges |
| `cq.ball-visibility` | outfits, surfaces (hard-blue, grass-green, clay-red), lighting | Report detection share by condition |
| `cq.scale-consistency` | wrong entered height (±10%), roll | Warn fires at 15% or more of scale error |

**Generator gaps to add:** a second figure walking on an adjacent court (`cq.extra-people`, `cq.tracking`); a low sun facing the camera (`cq.backlight`); a lens-smudge post-filter; audio with speech-like background noise (`cq.audio-timing`).

**Overall acceptance:** on good-condition synthetic clips, a false `block` on 1% or fewer of clips and a false `warn` on 5% or fewer. On deliberately degraded clips, the intended check fires on 95% or more. Coverage (the share of serves producing each metric) is reported alongside accuracy, because silent drop-outs flatter accuracy (research 05 §11.3).

### 13.2 Device QA (manual, needs real phones)

- iPhone 16e or 17e (26 mm, no ultra-wide), iPhone 17, a Pro model, and one Android phone.
- For each: `getUserMedia` resolution, fps and lens labels; `MediaRecorder` container, bitrate and timestamp regularity; DeviceMotion signs (section 9.3 test); wake lock in Safari and in the home-screen app; the Photos picker's transcoding; slow-motion import through Files; flicker under at least two Australian court-light installations; and a 15-minute 1080p60 session in direct sun above 30 °C with thermal state logged (research 06 §15.6).

### 13.3 Annotation mode

The founder or a coach marks the toss apex, contact and landing frames and taps "in frame" or "out" on the toss for real clips. These labels tune the headroom, ball-visibility and segmentation thresholds. They stay on the device unless the person exports them.

---

## 14. Known limitations and open questions

- **The web prototype cannot lock exposure, focus, frame rate or lens.** Blur and flicker are detected, not prevented. Thermal state is invisible. These are the main reasons for the native capture plugin. [Our inference]
- **The lens field of view is assumed** in the web prototype (the tan(VFOV/2) of 0.39 in 9.4). Only suggestions depend on it; measurements use the player's height scale.
- **Knee-bend band from the chest-side view.** The front knee points diagonally towards the phone, so flexion is foreshortened. Research 05 §6.5 and research 06 §2.2 disagree on which view is better. `METRICS.md` should keep `knee-bend-band` experimental until checked against annotation. [Our inference]
- **Pitch is unknown for imports.** Absolute heights assume a level phone, and `cq.scale-consistency` is the only guard.
- **Recreational toss heights and spreads are unpublished**, so the 4.2 m envelope and the spread expectations may need revising once real clips exist (research 06, open questions 1-2).
- **Court run-off in Australia is unknown**, so how often players need the fallbacks in 2.4 is unknown (research 06, open question 7).
- **Open:** does iOS Safari deliver 60 fps from `getUserMedia`? Do Australian LED court lights flicker? Is a countdown enough for solo players, or is Watch start essential (research 06, open question 8)?

---

## 15. Decisions this spec thinks are wrong or incomplete

1. **D1 height and distance (1.2-1.6 m high, 6-8 m from the centre mark) will often cut off the toss.** A level 26 mm phone (iPhone 17, 16e, 17e) at 1.4 m and 6.5 m from a deuce-court server has a frame top of 3.83 m at the server. At 1.2 m and 6 m it is 3.45 m, which is at or below a typical elite apex of 3.4-3.5 m (table 2.2). "From the centre mark" also hides a 1-2 m difference between the deuce and ad spots. **Proposal:** 1.5-1.9 m high (up to 2.1 m on a fence), 7-9 m from the serving spot, with the live headroom check deciding. This matches research 06 §3.3 (1.5-2.1 m; at least 7.5 m at 1.5 m).
2. **Audio default is undecided.** D4's audio flight-time path implies recording sound, but research 06 §11 and research 07 §7 recommend video-only capture by default because of surveillance-device laws. **Proposal:** add to D8: audio off by default; opt-in hit-sound timing, processed on the device into timestamps and never stored.
3. **"Four-corner court tap" (D1, rear view) needs defining.** Corners near the net are hidden by the net from a rear camera. **Proposal:** the far service-line and far baseline singles corners, plus an optional far T check (section 6.3).
4. **D1 says the side view needs no calibration beyond height.** That holds for heights. "Forward" and "landing" also need a horizontal reference: this spec uses the front toe at setup, not a detected baseline (section 1). `METRICS.md` should confirm the reference, or accept baseline detection as an experimental extra.
5. **Minimum serves.** Research 06 suggests 20 per stratum for toss statistics. This spec chooses a 15-serve block with interval-honest display and pooling (section 5.3). It is not a conflict with DECISIONS, but D7 should state the minimums once `METRICS.md` settles them.

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
