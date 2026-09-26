# serve-synth: synthetic serve videos with exact ground truth

The founder does not allow real serve footage to be downloaded, so the analysis engine is validated
on rendered clips whose every quantity is known exactly. A kinematic serve model moves a stylised
3D player, a ball model flies the toss and the serve with drag and spin, a phone-like camera films it
in headless Edge (three.js / WebGL), and ffmpeg encodes H.264 MP4 (and VP9 WebM) with a synthetic
audio track. Every clip gets a `truth.json` with per-frame 2D/3D landmarks and ball positions, serve
events, phases and the true values of every metric the app reports.

Everything is deterministic: the same scenario id always produces the same motion, image noise and
audio.

## Commands

Run from the repository root (the tool has its own `package.json` / `node_modules`):

```sh
npx --prefix tools/synth tsx tools/synth/src/cli.ts --quick              # 3 short clips for CI (~30 s)
npx --prefix tools/synth tsx tools/synth/src/cli.ts --scenario baseline  # a group, job or clip id (comma list ok)
npx --prefix tools/synth tsx tools/synth/src/cli.ts --all                # quick set + full corpus (~45-60 min)
npx --prefix tools/synth tsx tools/synth/src/cli.ts --list               # what exists on disk, per group
npx --prefix tools/synth tsx tools/synth/src/audit.ts                    # render-free check of every job
npx --prefix tools/synth tsx tools/synth/src/verify.ts                   # frame counts / fps / audio / truth of clips on disk
cd tools/synth && npm test                                                # vitest unit tests
cd tools/synth && npm run typecheck
```

(`npx tsx tools/synth/src/cli.ts ...` also works when tsx is on the path.) Options: `--jobs N` render
jobs in parallel (default 2), `--force` re-render clips that already exist (otherwise they are
skipped), `--out DIR` (default `validation/synthetic`), `--channel msedge|chrome` (Edge is the
default: it decodes H.264 in the app's own browser tests), `--truth-only` rewrites `truth.json` and
the manifest for clips already on disk without rendering (only valid while the motion, camera and
render code are unchanged since the videos were encoded).

## Output

```
validation/synthetic/
  manifest.json                 every clip on disk: id, groups (scenario ids), tags, files, sizes,
                                video/camera/lighting/player summary, per-serve framing flags
  clips/<clipId>/<clipId>.mp4   H.264 High yuv420p BT.709 (limited range), CRF as listed, 1 s GOP,
                                AAC-LC 160 kbit/s mono 48 kHz
  clips/<clipId>/<clipId>.webm  VP9 + Opus (only where listed)
  clips/<clipId>/truth.json
```

Videos are ignored by git (root `.gitignore`); `validation/synthetic/.gitignore` also ignores the
corpus truth files (about 100 MB) except the quick set's, which InjectedPoseSource tests can use
without video.

## Coordinate systems and time

- **Court**: metres. Origin at the centre mark on the *outer* (back) edge of the server's baseline;
  +x toward the net, +y to the server's left when facing the net, +z up. The baseline paint covers
  x in [0, 0.08]. Deuce-court servers stand at y < 0.
- **Image**: `x, y` normalised to [0, 1] from the top-left of the displayed frame (no rotation
  metadata is written; coded size = displayed size). Landmark `z` is MediaPipe-style: depth relative
  to the hip midpoint, in the same scale as `x`, negative = closer to the camera
  (`z = (Z - Z_hipmid) * fx / (Z_hipmid * width)`).
- **Camera**: OpenCV convention, x right, y down, z forward. `X_cam = R X_court + t`.
- **Time**: `tReal` = real seconds since the centre of frame 0's exposure. `tMedia` = container time =
  `tReal / timeScale`. Frame `i` of a clip has `tReal = i / fps` (real capture rate) exactly. Each
  frame integrates a global-shutter exposure centred on its timestamp.

## Scenario groups (corpus)

The reference setup ("baseline") is: side view from the chest side, 5 m from the front toe, camera
1.2 m high aimed at 1.6 m, 26 mm-equivalent main lens, 1080x1920 portrait, 60 fps, bright sun
(1/1000 s), blue hard court, 1.80 m right-handed intermediate player. Five serves are sampled once
(deuce T / wide / body, ad T / wide) and every sweep reuses the same five, one clip per serve, so
results pair up by serve (`-s1` ... `-s5`). Sweeps change one factor at a time.

| Group | Clips | What changes |
|---|---|---|
| `quick` | `quick-side60` (+WebM), `quick-rear30-lefty`, `quick-slomo` | 540x960 CI set; the slow-motion clip is trimmed to toss..bounce |
| `baseline` | `baseline-s1..5` (+`baseline-s1.webm`) | reference |
| `fps-sweep` | `fps30-`, `baseline-`, `fps120-`, `fps240-s1..5` | one 240 fps render per serve, decimated by 8/4/2/1 (same 1/1000 s shutter) |
| `crf-sweep` | `crf18-`, `baseline-` (CRF 20), `crf28-`, `crf36-s1..5` | encoder quality only |
| `slomo` | `slomo-s1..2` | the 240 fps capture written as 30 fps media: 1 real s = 8 media s, `timeScale` 0.125, no slow-motion metadata (like an exported iPhone clip) |
| `view-sweep` | `rear-`, `front45-s1..5` | rear: 5 m behind, camera 1.5 m high; front-45: inside the court on the chest side |
| `distance-sweep` | `dist4-`, `dist7-`, `dist12-s1..5` | side view distance (5 m is the baseline) |
| `lighting-sweep` | `overcast-`, `dusk-s1..5` (60 fps), `night240-s1..5` (240 fps) | overcast 1/250 s; dusk 1/60 s (strong blur, heavy noise); night floodlights with 100 Hz mains flicker at 1/240 s |
| `shake` | `shake-s1..5` | handheld: 0.5 deg rotation / 1 cm translation, 0.3-6 Hz |
| `toss-out-of-frame` | `apexout-s1..5` | landscape 1920x1080, 4.5 m, camera 1.0 m aimed at 1.3 m: the toss apex leaves the frame, contact stays in |
| `left-handed` | `lefty-s1..5` | mirrored player, camera on his chest side |
| `height-sweep` | `h160-`, `h195-s1..5` | 1.60 m / 1.95 m players; toss heights, toss offsets, jump and landing scale with height |
| `beginner` | `beginner-s1..5` | beginner profile (see below); several serves are faults |
| `advanced` | `advanced-s1..5` | advanced profile, foot-up stance |
| `session` | `session` | 73 s continuous clip, 8 serves alternating deuce/ad, 1-3 pre-serve bounces, pauses and walking, distant hits from other courts in the audio |

`src/scenarios.ts` is the source of truth; `--list` prints the clip ids per group and what exists.

## Kinematic serve model (`src/kinematics`)

A 33-landmark skeleton (MediaPipe order) with Drillis-Contini segment ratios scaled by height, driven
by keyframed channels (pelvis position and yaw, thorax yaw / lateral lean / flexion, wrist targets
with elbow poles, feet, racket direction and face, gaze) interpolated with monotone cubics (no
overshoot, so a keyed peak is the true peak). Arms and legs use analytic two-bone IK. The model is
built for a right-hander; left-handers are exact mirror images (y -> -y, left/right labels swapped).

Phases: setup (optional pre-serve dribbles), toss, loading into the trophy position (with a hold),
racket drop and drive, contact, landing, recovery, then walking to the next serve position in
session clips. Solved constraints:

- toss release height is exact (the tossing arm is solved so the ball centre is at the height);
- the ball flies gravity-only from release through the requested apex, and contact happens when it
  falls to `contactHeightRatio * height`; so release-to-contact time follows from the heights;
- the string-bed centre meets the ball at the contact instant (pelvis position and arm angle solved);
- peak front-knee flexion equals the parameter (pelvis height solved from leg geometry);
- trunk inclination at contact equals the parameter (thorax angles solved);
- the pelvis is ballistic while airborne and the front toe lands at the requested distance.

Per-serve parameters (`src/params.ts`, `ServeParams`): player height and handedness (per player),
stance foot-up / foot-back, toss release height, toss apex height, apex forward / lateral offset
from the front toe, contact height ratio, max knee flexion, trunk inclination at contact and its
direction, trophy pause, drive duration (trophy end to contact), motion start to release time, jump
(pelvis rise), landing distance inside the baseline, serve speed, direction T / body / wide plus
aim scatter, optional fixed launch angle, spin and style (flat / slice / kick shift the toss and
speed). Release-to-contact time normally follows from the release, apex and contact heights; the
optional `releaseToContactS` override instead solves the apex height for an exact time. The truth file lists the generating values under `serves[].params`; metrics are always
recomputed from the realised motion.

### Serve-to-serve variability (known SDs)

Each varied parameter is sampled from Normal(mean, sd x sdScale) truncated at +/-2.5 SD by
resampling, then clamped to physical limits (`LIMITS` in params.ts). The realised SD of a normal
truncated at 2.5 SD is 0.9546 x the nominal SD; `truth.player.variability` lists mean, sd,
`sdEffective` (= 0.9546 sd) and limits for every parameter. Two post-sampling constraints can alter
rare draws: the apex is kept at least 0.12 m above contact and release at least 0.6 m below apex.

| Parameter | Intermediate mean / SD | Beginner mean / SD | Advanced mean / SD |
|---|---|---|---|
| height, stance | 1.80 m, foot-back | 1.75 m, foot-back | 1.85 m, foot-up |
| toss release height (m) | 1.72 / 0.04 | 1.62 / 0.10 | 1.80 / 0.02 |
| toss apex height (m) | 3.30 / 0.12 | 3.25 / 0.30 | 3.45 / 0.05 |
| apex forward of front toe (m) | 0.30 / 0.10 | 0.12 / 0.22 | 0.45 / 0.05 |
| apex lateral, hitting side (m) | 0.12 / 0.08 | 0.22 / 0.20 | 0.10 / 0.04 |
| contact height / height | 1.50 / 0.012 | 1.40 / 0.03 | 1.56 / 0.006 |
| max front-knee flexion (deg) | 42 / 4 | 15 / 5 | 65 / 2.5 |
| trunk inclination at contact (deg) | 20 / 3 | 9 / 4 | 26 / 1.5 |
| trophy pause (s) | 0.12 / 0.05 | 0.30 / 0.12 | 0.05 / 0.02 |
| drive duration (s) | 0.32 / 0.02 | 0.40 / 0.05 | 0.30 / 0.01 |
| jump, pelvis rise (m) | 0.08 / 0.02 | 0.00 / 0.01 | 0.20 / 0.02 |
| landing inside baseline (m) | 0.45 / 0.10 | 0.15 / 0.08 | 0.85 / 0.06 |
| serve speed (km/h, flat) | 150 / 6 | 105 / 10 | 178 / 4 |
| aim scatter depth / lateral (m) | 0 / 0.6, 0.4 | 0 / 1.2, 0.9 | 0 / 0.4, 0.25 |

The height sweep scales the metre-valued toss, jump and landing parameters (means and SDs) by
height / 1.80.

## Ball physics (`src/ball.ts`)

57 g, 67 mm ball; quadratic drag C_d 0.55, air 1.2 kg/m^3; Magnus lift with C_L = 1 / (2 + v / (r w))
from the style's spin (flat 900, slice 2200, kick 3200 rpm). RK4 at 0.5 ms; the first court touch
(ball centre at z = r) is refined by bisection to 1e-12 s; positions between steps use cubic Hermite
interpolation. The launch elevation and azimuth are solved so the first bounce lands on the aim
point (T / body / wide nominal targets plus scatter), unless a launch angle is fixed. After the
bounce: vertical COR 0.75, horizontal retention 0.65, drag, then the ball rolls to the back fence
(approximate; only the first bounce is truth-grade). The toss is gravity-only (no drag) so it is an
exact parabola. Pre-serve dribbles are vertical with COR 0.75.

## Camera (`src/camera.ts`)

Pinhole with optional OpenCV k1/k2 radial distortion (0 in the corpus). The focal length comes from
the 35 mm-equivalent focal length as phones quote it for the 4:3 stills sensor, with 16:9 video using
the full sensor width: `f_px = f35 * (1.25 * longSidePx) / 43.27`. 26 mm on 1080x1920 gives
fx = 1442.2 px. Views: `side` (on the baseline extension, chest side), `rear` (behind the server
looking at the net), `front45` (in the court, 45 deg between the net direction and the chest side);
distance is horizontal from the front toe, plus camera height and aim height. Handheld shake is a sum
of four sinusoids per axis (0.35-5.5 Hz, random phases, seeded) on yaw, pitch, roll (60 %) and
translation; per-frame camera poses are written to truth when shake is on.

## Rendering (`src/render`, `src/frames.ts`, `src/look.ts`)

three.js in headless Edge (ANGLE / Direct3D 11 on the GPU): stylised player (lathe / ellipsoid body
parts on rigid bones), racket with see-through strings, court with ITF lines and net, fences, trees,
floodlight poles. MSAA x4, soft shadow maps. Per frame:

- **Motion blur**: the ball is drawn analytically as the average of up to 48 sphere positions along
  its path during the shutter time (streak endpoints are in truth); the body is averaged over
  sub-frames across the shutter (1 bright, 3 overcast, 5 dusk, 2 night).
- **Lighting presets**: bright (sun 52 deg, 1/1000 s), overcast (1/250 s), dusk (sun 5 deg, warm,
  1/60 s), night (floodlights, 1/240 s, optional 100 Hz flicker of +/-30 % integrated over the
  shutter). Exposure per preset imitates phone auto-exposure (mean luma about 50-95 of 255).
- **Sensor**: exposure gain, white balance, ACES tone curve, sRGB, saturation, contrast, vignette,
  then Gaussian read noise plus signal-dependent shot noise (sigma^2 = read^2 + shot * value, partly
  luma-correlated), quantised to 8 bits.
- **Output**: the GPU converts to planar yuv420p (BT.709 limited range, 2x2 chroma mean) and streams
  it over a WebSocket; ffmpeg-static encodes libx264 High (preset medium, CRF per clip, GOP = 1 s of
  media, default B-frames) and optionally libvpx-vp9 (CRF = x264 CRF + 8). One render can feed many
  encoders (decimated frame rates, CRFs, slow-motion re-timing, WebM).

## Audio (`src/audio.ts`)

Mono, 48 kHz. Every sound is emitted at a known real time and place, travels to the camera at
343 m/s, is attenuated as 1/r (peak levels at 1 m: contact 1.2, bounce 0.45, later bounces 0.3,
dribble 0.3, footstep 0.08 of full scale) and is placed with sub-sample accuracy: the waveform is
exactly zero before its arrival time.

- contact "pop": broadband click (0.1 ms attack) plus 560 / 1150 / 2700 Hz ringing;
- bounce thud (serve bounce, two later bounces, pre-serve dribbles): 190 / 420 Hz with a 1.5 ms rise;
- footsteps at landing and when the back foot steps through;
- background: shaped noise at -50 dBFS RMS; floodlight hum (100 / 200 Hz, -58 dBFS) at night;
- `session` only: distant hits from other courts (20-45 m away), listed as `distractor`.

Note: the contact pop is *emitted* at the true contact time and *arrives* distance / 343 s later
(about 15 ms at 5 m), exactly like the bounce. `truth.audio.events[]` gives `emitTReal`,
`arrivalTReal`, `arrivalTMedia`, distance and peak level for every sound, so a detector can be scored
against either. In slow-motion media, sounds are placed at their media arrival time but not
time-stretched. Checked after encoding: contact onsets in the decoded AAC and Opus tracks are within
0.1 ms of `arrivalTMedia` (the encoders' priming delay is removed by the container edit list).

## truth.json

Top level: `format` (`serve-synth-truth/1`), `clipId`, `job`, `groups`, `tags`, `description`,
`generator`, `video`, `settings`, `coordinateSystems`, `player`, `court`, `serves`, `audio`, `frames`.

- `video`: `{ width, height, fps (media), captureFps (real), timeScale, frameCount, durationMediaS,
  rotationDeg, files: [{ container, file, codec, crf, audioCodec }] }`.
- `settings`: real `fps`, `mediaFps`, `timeScale`, `renderFps`, `decimate`, resolution, orientation,
  view, `distanceM`, `cameraHeightM`, `lookAtHeightM`, `focal35mmEquivMm`, `intrinsics`
  `{ fxPx, fyPx, cxPx, cyPx, k1, k2 }`, `extrinsics` `{ R (row-major 3x3), t, position }`,
  `shutterS`, `crf`, `lighting` `{ preset, flickerHz, flickerAmplitude }`, `sensorNoise`,
  `motionBlur`, `shake`, `surface`.
- `player`: profile, height, handedness, stance, anthropometry, `variability` (see above).
- `serves[]`: `events`, `phases`, `metrics`, `ball` (release, apex, contact, contact velocity, bounce,
  velocity before bounce, spin, aim point), `visibility` (toss release / apex / contact / bounce in
  frame, whole player in frame at contact), `params` (generating values), `design` (solver notes).
- `audio`: sample rate, background, hum, `events[]`.
- `frames[]`: `{ frameIndex, tReal, tMedia, landmarks, world, inFrame, occluded, balls, racket,
  camera? }`
  - `landmarks`: 33 x `{ x, y, z, visibility }` in MediaPipe order, or `null` when no landmark is in
    frame. `visibility` is 1 (in frame and not hidden), 0.4 (in frame, hidden by another body part)
    or 0 (outside the frame). Positions are exact whether or not the point is visible.
  - `world`: 33 x `[x, y, z]` court coordinates (m).
  - `inFrame`, `occluded`: 33-character strings of 0/1 per landmark.
  - `balls[]`: `{ id, serve, state (in-hand | dribble | toss | flight | after-bounce), p (3D centre),
    v (m/s), x, y, radius (projected radius / frame height), inFrame, occluded, held, streak
    [x0, y0, x1, y1] (centre at exposure start and end) }`.
  - `racket`: string-bed centre `{ head (3D), x, y, inFrame }`.
  - `camera` (shake only): `{ position, R }` for that frame.

This is the format `app/src/analysis/pose/injected.ts` `parseTruthPoseFrames` reads (it takes
`video.width/height` and `frames[].{frameIndex, tReal, landmarks}` and ignores the rest).

Visibility uses an approximate body model (capsules for limbs, hands, feet and neck, an elliptic
capsule for the torso, ellipsoids for head and pelvis, sized like the rendered parts). A landmark is
hidden when the line of sight from the camera, stopped just short of it, passes through a body part
other than its own segments; face points are also hidden when they face away from the camera; the
hips keep the pelvis volume so the far hip is hidden when the camera looks along the hip line. The
racket is not an occluder.

### Events

Each event is `{ tReal, tMedia, frameIndex (nearest frame = round(tReal * fps)), frame
(fractional = tReal * fps), inClip }`.

| Event | Definition |
|---|---|
| `motionStart` | start of the service motion (hands start to drop), after setup and dribbles |
| `tossRelease` | the ball leaves the tossing hand (start of free flight) |
| `tossApex` | highest point of the ball centre during the toss |
| `trophy` | midpoint of the trophy hold `[trophyStart, trophyEnd]` (racket arm cocked, tossing arm up, knees bent) |
| `trophyStart`, `trophyEnd` | start and end of the hold; `trophyEnd` starts the racket drop |
| `maxKneeFlexion` | instant of the 3D maximum of front-knee flexion |
| `racketLowPoint` | lowest racket-tip height between `trophyEnd` and contact |
| `takeoff` | both feet leave the court |
| `contact` | ball-string impact: ball centre at the contact point, string-bed centre one ball radius + 5 mm behind it along the outgoing direction |
| `landing` | front foot's toe touches the court after contact |
| `bounce` | ball centre reaches z = ball radius on the far side |
| `recoveryEnd` | back in a balanced ready stance |
| `dribbleFloorContacts[]` | pre-serve bounces (ball on the court) |

Phases: `setup` [setup start, motionStart), `toss` [motionStart, tossRelease), `loading`
[tossRelease, trophyEnd), `drive` [trophyEnd, contact), `contact` (instant), `landing` [contact,
landing absorption end = landing + 0.22 s), `recovery` [absorption end, recoveryEnd).

### Metric definitions (`serves[].metrics`)

Front foot = the tossing-side foot (left for right-handers, right for left-handers). Front toe =
that foot's `FOOT_INDEX` landmark (toe tip) at the toss-release instant. Hitting side = -y for
right-handers, +y for left-handers. All distances in metres, angles in degrees, speeds in km/h.

| Key | Definition |
|---|---|
| `tossReleaseHeightM` | ball-centre height above the court at toss release |
| `tossApexHeightM` | maximum ball-centre height during the toss |
| `tossApexForwardOfFrontToeM` | apex x minus front-toe x (positive = toward the net) |
| `tossApexLateralOfFrontToeM` | apex y minus front-toe y, signed positive toward the hitting side |
| `tossHeightAboveContactM` | apex height minus contact height (ball centre) |
| `contactHeightM`, `contactHeightRatio` | ball-centre height at contact; divided by player height |
| `contactForwardOfFrontToeM` | contact x minus front-toe x |
| `contactForwardOfBaselineM` | contact x (from the baseline's outer edge) |
| `releaseToContactS` | contact time minus toss-release time |
| `maxFrontKneeFlexion3DDeg` (+`...3DTReal`) | max over [motionStart, contact], sampled every 1 ms, of 180 deg minus the 3D angle hip-knee-ankle (HIP/KNEE/ANKLE landmarks, hip joint centres) of the front leg; 0 = straight |
| `maxBackKneeFlexion3DDeg` | the same for the back leg |
| `maxFrontKneeFlexion2DDeg` (+`...2DTReal`) | the same angle from the points projected into this clip's camera, in pixel units (isotropic, i.e. x scaled by width/height as in `body.ts`); its maximum can occur at a different instant from the 3D one |
| `frontKneeFlexion2DAtMax3DDeg` | 2D angle at the instant of the 3D maximum |
| `maxFrontKneeFlexion3DAtFramesDeg`, `...2DAtFramesDeg` | the maxima restricted to this clip's frame times (the best a perfect per-frame pose estimator can do at this frame rate) |
| `trunkInclinationContact3DDeg` | angle between the vector mid-hip -> mid-shoulder (landmark midpoints) and vertical, at contact |
| `trunkInclinationContact2DDeg`, `...2DSignedDeg` | angle of the projected mid-hip -> mid-shoulder vector from the image vertical, pixel units, at contact; signed positive when the shoulders are to image-right (same as `body.ts` `trunkInclinationDeg`) |
| `trunkInclinationContact2DAtContactFrameDeg` | the 2D angle at the frame nearest contact |
| `landingDistanceInsideBaselineM` | front-toe x at landing, measured from the baseline's outer edge (subtract 0.08 m for the inner edge of the line) |
| `landingFootLateralM` | lateral move of the front toe from release to landing, positive toward the hitting side |
| `ballSpeedAtContactKmh` | ball speed immediately after contact |
| `ballPeakSpeedKmh` | maximum 3D ball speed between contact and the first bounce (equals the contact speed unless the launch is steeply downward) |
| `avgSpeedContactToBounceKmh` | straight-line 3D distance from the ball centre at contact to the ball centre at first touch, divided by the flight time |
| `avgSpeedContactToBouncePathKmh`, `...HorizontalKmh` | path length / flight time; horizontal distance / flight time |
| `flightTimeS` | first-touch time minus contact time |
| `bounceXM`, `bounceYM` | court point directly below the ball centre at first touch |
| `bounceInServiceBox` | inside the correct service box, lines count in (false = fault) |
| `netClearanceM` | ball bottom above the net top where it crosses the net plane |
| `launchElevationDeg`, `launchAzimuthDeg` | outgoing direction: elevation (negative = downward) and azimuth from +x toward +y |
| `airborneS` | landing minus takeoff |
| `trophyPauseS` | trophy hold duration |

## Tests

`npm test` (vitest, Node): projection (35 mm-equivalent focal, pinhole and distortion maths,
extrinsics matrix, camera placement, three.js camera mapping, shake), ball physics (flight time,
bounce point and speeds vs the analytic drag-free parabola, drag and Magnus direction, launch solver,
toss and dribble), landmark continuity (multi-serve clips with walking and dribbles, left-hander,
planted feet, ball continuity at release / contact / bounce / dribbles, exact left-right mirroring),
truth format (readable by the app's `parseTruthPoseFrames`, events, realised metrics vs generating
parameters, slow-motion timing), audio placement and WAV header, occlusion.

`src/audit.ts` checks every job without rendering: release reachable, faults, landmark speeds
(< 30 m/s), toss apex / contact in frame, player fully in frame.

`src/feasibility/` renders stills and runs the app's MediaPipe Pose (full) on them: with a square
crop around the player it detects the figure in every still at 4-12 m with a mean error of about 3 %
of body height; on the full 1080x1920 frame detection drops to 0-50 % at 7-12 m, so the pipeline
needs a person ROI at those distances.

## Limitations

- The player is stylised, not photoreal; detector behaviour on real people will differ.
- Global shutter only (no rolling-shutter skew), no phone ISP sharpening / HDR / stabilisation, no
  rotation metadata, constant frame rate (no dropped frames).
- The toss has no drag (exact parabola); the outgoing flight has drag and spin.
- The ball for the next serve appears in the hand at the end of the previous recovery.
- Truth visibility uses an approximate body model and ignores the racket.
- Audio shapes are simple synthetic transients with no room reflections.
- Only the first bounce is modelled carefully; later bounces and the roll are approximate.
