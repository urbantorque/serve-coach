# serve-synth: synthetic serve videos with exact ground truth

The founder does not allow real serve footage to be downloaded, so the analysis engine is validated
on rendered clips whose every quantity is known exactly. A kinematic serve model moves a stylised
3D player, a ball model flies the toss and the serve with drag and spin, a phone-like camera films it
in headless Edge (three.js / WebGL), and ffmpeg encodes H.264 MP4 (and VP9 WebM) with a synthetic
audio track. Every clip gets:

- `truth.json`: per-frame 2D/3D landmarks and ball positions, serve events, phases and the true
  values of the kinematic and ball metrics;
- `truth-extra.json`: derived truth that `truth.json` does not carry (leg drive, drive time, loading
  depth, shoulder tilt at the trophy position, shoulder-over-shoulder at contact, knee bands,
  landing distance from the start toe, outcomes, capture-quality inputs) and **a map from every
  canonical metric id to its truth value** ([Canonical metric ids](#canonical-metric-ids)).

Everything is deterministic: the same scenario id always produces the same motion, image noise and
audio.

## Commands

Run from the repository root (the tool has its own `package.json` / `node_modules`):

```sh
npx --prefix tools/synth tsx tools/synth/src/cli.ts --quick              # 3 short clips for CI (~30 s)
npx --prefix tools/synth tsx tools/synth/src/cli.ts --scenario baseline  # a group, job or clip id (comma list ok)
npx --prefix tools/synth tsx tools/synth/src/cli.ts --all                # quick set + full corpus (~45-60 min)
npx --prefix tools/synth tsx tools/synth/src/cli.ts --list               # what exists on disk, per group
npx --prefix tools/synth tsx tools/synth/src/augmentTruth.ts             # truth-extra.json for every clip + truth-series.json (~20 s)
npx --prefix tools/synth tsx tools/synth/src/audit.ts                    # render-free check of every job
npx --prefix tools/synth tsx tools/synth/src/verify.ts                   # corpus integrity (files, sizes, frame counts, coverage)
cd tools/synth && npm test                                                # vitest unit tests
cd tools/synth && npm run typecheck
```

(`npx tsx tools/synth/src/cli.ts ...` also works when tsx is on the path; `npm run augment` and
`npm run verify` inside `tools/synth` are shortcuts.)

`cli.ts` options: `--jobs N` render jobs in parallel (default 2), `--force` re-render clips that
already exist (otherwise they are skipped), `--out DIR` (default `validation/synthetic`),
`--channel msedge|chrome` (Edge is the default: it decodes H.264 in the app's own browser tests),
`--truth-only` rewrites `truth.json`, `truth-extra.json` and the manifest for clips already on disk
without rendering (only valid while the motion, camera and render code are unchanged since the
videos were encoded). After rendering, `cli.ts` writes `truth-extra.json` for the new clips itself.

`augmentTruth.ts [clipId ...] [--frames-only] [--out DIR]`: with no ids it processes every clip in
the manifest. `--frames-only` skips the continuous (model-rebuilt) derivation. It never touches
videos, `truth.json` or the manifest.

`verify.ts [--no-app-probe] [--json FILE] [--out DIR]`: see [Integrity check](#integrity-check-verifyts).

## Output

```
validation/synthetic/
  manifest.json                   every clip: id, job, groups (scenario ids), tags, files, sizes,
                                  video/camera/lighting/player summary, per-serve framing flags
  truth-series.json               spreads (sample SDs) across the serves of each clip series
  clips/<clipId>/<clipId>.mp4     H.264 High yuv420p BT.709 (limited range), CRF as listed, 1 s GOP,
                                  AAC-LC 160 kbit/s mono 48 kHz
  clips/<clipId>/<clipId>.webm    VP9 + Opus (only where listed)
  clips/<clipId>/truth.json
  clips/<clipId>/truth-extra.json derived truth and the canonical-metric map
```

Videos are ignored by git (root `.gitignore`); `validation/synthetic/.gitignore` also ignores the
corpus `truth.json` files (about 100 MB) except the quick set's, which InjectedPoseSource tests can
use without video. `truth-extra.json` (about 15 KB each, 1.9 MB in all) and `truth-series.json`
stay in git.

## Corpus status (verified 2026-09-27)

122 clips, 49,236 frames, 550 MB. `verify.ts` passes on all 122: every listed file exists with its
recorded size, every `truth.json` parses with the app's `parseTruthPoseFrames`, and every MP4 has the
truth's frame count, frame rate, size and an audio track by both ffmpeg (framecrc packet count) and
the app's own container probe (`probeVideo`); the two WebMs pass the ffmpeg check. Every clip defined
in `src/scenarios.ts` is present (116 rendered 2026-09-26 plus the 6 D1 set-up clips rendered
2026-09-27); nothing on disk is undefined or orphaned. `truth-extra.json` exists for all 122, all
with the continuous derivation (the rebuilt motion matches the stored landmarks to 0.053 mm or better).

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
1.2 m high aimed at 1.6 m (4.6 deg up), 26 mm-equivalent main lens, 1080x1920 portrait, 60 fps, bright
sun (1/1000 s), blue hard court, 1.80 m right-handed intermediate player. Five serves are sampled once
(deuce T / wide / body, ad T / wide) and every sweep reuses the same five, one clip per serve, so
results pair up by serve (`-s1` ... `-s5`). Sweeps change one factor at a time. The baseline predates
the 2026-09-27 revision of DECISIONS D1 (level phone, 7-8 m from the centre mark); the `default75` and
`fence9` groups film the revised D1 set-ups.

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
| `default75` | `default75-s1..3` | **D1 default set-up**: portrait 1080x1920, camera on the hitting-arm (chest) side on the baseline extension **7.5 m from the centre mark**, **level** phone 1.4 m high, 60 fps; the three deuce serves |
| `fence9` | `fence9-s1..3` | **D1 alternative**: landscape 1920x1080 at the side fence, **9 m from the centre mark**, **level** phone 1.6 m high, 60 fps; the three deuce serves (D1 prefers 4K here; only 1080p is rendered) |

`src/scenarios.ts` is the source of truth; `--list` prints the clip ids per group and what exists.

True framing of the side set-ups (from `truth-extra.json` `captureQuality`; frame top and bottom are
measured in the vertical plane through the server's front toe; standing height in pixels is stature x
fy / depth of the hip midpoint):

| Set-up | Frame top at the server | Standing height |
|---|---|---|
| `default75` (portrait, 7.5 m from the centre mark, level 1.4 m) | 6.14-6.19 m | 359-363 px |
| `fence9` (landscape, 9 m, level 1.6 m) | 4.83-4.86 m | 297-300 px |
| `baseline` (portrait, 5 m from the toe, 1.2 m aimed at 1.6 m) | 5.14 m | 520 px |
| `dist7` / `dist12` (as baseline, 7 / 12 m) | 6.46 / 9.78 m | 371 / 216 px |
| `apexout` (landscape, 4.5 m, 1.0 m aimed at 1.3 m) | 3.04 m | 575 px |

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

Not varied: the thorax posture at the trophy position is the same in every serve and profile
(shoulder-line elevation 16.83 deg in 3D at the kinematic trophy), and the pelvis never tilts
sideways (the hip line is level in 3D). See [Limitations](#limitations).

Per-serve parameters (`src/params.ts`, `ServeParams`): player height and handedness (per player),
stance foot-up / foot-back, toss release height, toss apex height, apex forward / lateral offset
from the front toe, contact height ratio, max knee flexion, trunk inclination at contact and its
direction, trophy pause, drive duration (trophy end to contact), motion start to release time, jump
(pelvis rise), landing distance inside the baseline, serve speed, direction T / body / wide plus
aim scatter, optional fixed launch angle, spin and style (flat / slice / kick shift the toss and
speed). Release-to-contact time normally follows from the release, apex and contact heights; the
optional `releaseToContactS` override instead solves the apex height for an exact time. The truth
file lists the generating values under `serves[].params`; metrics are always recomputed from the
realised motion.

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
exact parabola. Pre-serve dribbles are vertical with COR 0.75. The ball passes through the net (no
net collision); a negative `netClearanceM` marks a serve that would have hit it.

## Camera (`src/camera.ts`)

Pinhole with optional OpenCV k1/k2 radial distortion (0 in the corpus). The focal length comes from
the 35 mm-equivalent focal length as phones quote it for the 4:3 stills sensor, with 16:9 video using
the full sensor width: `f_px = f35 * (1.25 * longSidePx) / 43.27`. 26 mm on 1080x1920 gives
fx = 1442.2 px. Views: `side` (on the baseline extension, chest side), `rear` (behind the server
looking at the net), `front45` (in the court, 45 deg between the net direction and the chest side).

The camera anchor (`ViewSpec.anchor`) says what the distance is measured from:

- `stance` (default, every group except `default75` / `fence9`): horizontal distance from the first
  serve's front toe at toss release, camera aimed at a point above that toe (`lookAtHeightM`);
- `centre-mark` (side view only; the D1 set-ups): the camera stands on the baseline extension
  (x = 0) `distanceM` from the centre mark and is aimed along the baseline at the point above the
  centre mark; with `lookAtHeightM = heightM` the phone is level. The server's position does not move
  the camera (a right-hander on the deuce court stands about 0.35 m nearer to it than the centre mark).

`truth.settings.distanceFrom` and `manifest.clips[].camera.anchor` (new clips) record the anchor.
Handheld shake is a sum of four sinusoids per axis (0.35-5.5 Hz, random phases, seeded) on yaw,
pitch, roll (60 %) and translation; per-frame camera poses are written to truth when shake is on.

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
DECISIONS D4: the side view never uses audio for speed; audio only times contact.

## truth.json

Top level: `format` (`serve-synth-truth/1`), `clipId`, `job`, `groups`, `tags`, `description`,
`generator`, `video`, `settings`, `coordinateSystems`, `player`, `court`, `serves`, `audio`, `frames`.

- `video`: `{ width, height, fps (media), captureFps (real), timeScale, frameCount, durationMediaS,
  rotationDeg, files: [{ container, file, codec, crf, audioCodec }] }`.
- `settings`: real `fps`, `mediaFps`, `timeScale`, `renderFps`, `decimate`, resolution, orientation,
  view, `distanceM`, `distanceFrom` (clips rendered from 2026-09-27), `cameraHeightM`, `lookAtHeightM`,
  `focal35mmEquivMm`, `intrinsics` `{ fxPx, fyPx, cxPx, cyPx, k1, k2 }`, `extrinsics` `{ R (row-major
  3x3), t, position }`, `shutterS`, `crf`, `lighting` `{ preset, flickerHz, flickerAmplitude }`,
  `sensorNoise`, `motionBlur`, `shake`, `surface`, `t0MotionS` (motion time of frame 0).
- `player`: profile, height, handedness, stance, `setupStance` (head-top height etc. in the first
  setup), anthropometry, `variability` (see above).
- `serves[]`: `events`, `phases`, `metrics`, `ball` (release, apex, contact, contact velocity, bounce,
  velocity before bounce, spin, aim point), `visibility` (toss release / apex / contact / bounce in
  frame, whole player in frame at contact), `params` (generating values), `design` (solver notes).
- `audio`: sample rate, background, hum, `events[]`.
- `frames[]`: `{ frameIndex, tReal, tMedia, landmarks, world, inFrame, occluded, balls, racket,
  camera? }`
  - `landmarks`: 33 x `{ x, y, z, visibility }` in MediaPipe order, or `null` when no landmark is in
    frame. `visibility` is 1 (in frame and not hidden), 0.4 (in frame, hidden by another body part)
    or 0 (outside the frame). Positions are exact whether or not the point is visible.
  - `world`: 33 x `[x, y, z]` court coordinates (m), rounded to 0.1 mm.
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

### Known defects in the stored truth.json files

- **Flight time key.** The 116 clips rendered on 2026-09-26 store the flight time as
  `metrics.flightTReal` (the writer of the day treated it as an instant and subtracted the clip start
  `t0MotionS`). It is correct wherever `t0MotionS` = 0, i.e. every clip except `quick-slomo`, where it
  reads -0.798 s instead of 0.513 s. Clips rendered from 2026-09-27 store `flightTimeS`. Use
  `truth-extra.json` `serves[].flightTimeS` (= `events.bounce.tReal - events.contact.tReal`) in both cases.
- **Knee maxima window.** `maxFrontKneeFlexion3DDeg` and `maxBackKneeFlexion3DDeg` are maxima over
  [motionStart, contact]. That window includes the airborne leg tuck just before contact and the back
  leg's push-off, so they are not loading measures: the back-knee value (62-80 deg for the
  intermediate) is always the push-off / swing, and for `beginner-s1` / `-s3` the front-knee value is the
  in-air tuck 9 ms before contact (31 / 34 deg against 9.5 / 6.8 deg of loading). The canonical knee
  truth uses the knee angles at the trophy position instead (`truth-extra.json` `knees`).

### Events

Each event is `{ tReal, tMedia, frameIndex (nearest frame = round(tReal * fps)), frame
(fractional = tReal * fps), inClip }`.

| Event | Definition |
|---|---|
| `motionStart` | start of the service motion (hands start to drop), after setup and dribbles |
| `tossRelease` | the ball leaves the tossing hand (start of free flight) |
| `tossApex` | highest point of the ball centre during the toss |
| `trophy` | midpoint of the trophy hold `[trophyStart, trophyEnd]` (racket arm cocked, tossing arm up, knees bent): **the kinematic trophy position** |
| `trophyStart`, `trophyEnd` | start and end of the hold; `trophyEnd` starts the racket drop |
| `maxKneeFlexion` | instant of the 3D maximum of front-knee flexion over [motionStart, contact] (see the defect note above) |
| `racketLowPoint` | lowest racket-tip height between `trophyEnd` and contact |
| `takeoff` | both feet leave the court |
| `contact` | ball-string impact: ball centre at the contact point, string-bed centre one ball radius + 5 mm behind it along the outgoing direction |
| `landing` | front foot's toe touches the court after contact |
| `bounce` | ball centre reaches z = ball radius on the far side |
| `recoveryEnd` | back in a balanced ready stance |
| `dribbleFloorContacts[]` | pre-serve bounces (ball on the court) |
| `hipLowest` (in `truth-extra.json`) | lowest mid-hip height in [tossRelease, contact - 0.08 s]: the METRICS.md 2.4.4 trophy detector and the leg-drive lowest point |

Phases: `setup` [setup start, motionStart), `toss` [motionStart, tossRelease), `loading`
[tossRelease, trophyEnd), `drive` [trophyEnd, contact), `contact` (instant), `landing` [contact,
landing absorption end = landing + 0.22 s), `recovery` [absorption end, recoveryEnd).

**The lowest mid-hip is not `trophyEnd`.** METRICS.md 2.4.4 says the synthetic `trophyEndS` is where
the pelvis is lowest; in the rendered motion it is not. Relative to the kinematic hold, `hipLowest`
falls 0.093-0.204 s before `trophyEnd` for the intermediate profile (3-17 ms before `trophyStart`),
0.376-0.648 s before `trophyEnd` for the beginner (whose hips are lowest at or just after release), and
at `trophyEnd` for the advanced profile. Score a trophy detector against `truth-extra.json`
`events.hipLowest` if it implements the lowest-hip rule, or against `events.trophy` / `trophyEnd` if it
means the racket-cocked posture.

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
| `maxFrontKneeFlexion3DDeg` (+`...3DTReal`) | max over [motionStart, contact], sampled every 1 ms, of 180 deg minus the 3D angle hip-knee-ankle (HIP/KNEE/ANKLE landmarks, hip joint centres) of the front leg; 0 = straight. Includes the airborne tuck (see above) |
| `maxBackKneeFlexion3DDeg` | the same for the back leg (dominated by the push-off / swing) |
| `maxFrontKneeFlexion2DDeg` (+`...2DTReal`) | the same angle from the points projected into this clip's camera, in pixel units (isotropic, i.e. x scaled by width/height as in `body.ts`); its maximum can occur at a different instant from the 3D one |
| `frontKneeFlexion2DAtMax3DDeg` | 2D angle at the instant of the 3D maximum |
| `maxFrontKneeFlexion3DAtFramesDeg`, `...2DAtFramesDeg` | the maxima restricted to this clip's frame times (the best a perfect per-frame pose estimator can do at this frame rate) |
| `trunkInclinationContact3DDeg` | angle between the vector mid-hip -> mid-shoulder (landmark midpoints) and vertical, at contact (not a canonical metric: D5 removed trunk tilt) |
| `trunkInclinationContact2DDeg`, `...2DSignedDeg` | angle of the projected mid-hip -> mid-shoulder vector from the image vertical, pixel units, at contact; signed positive when the shoulders are to image-right (same as `body.ts` `trunkInclinationDeg`) |
| `trunkInclinationContact2DAtContactFrameDeg` | the 2D angle at the frame nearest contact |
| `landingDistanceInsideBaselineM` | front-toe x at landing, measured from the baseline's outer edge (subtract 0.08 m for the inner edge of the line) |
| `landingFootLateralM` | lateral move of the front toe from release to landing, positive toward the hitting side |
| `ballSpeedAtContactKmh` | ball speed immediately after contact |
| `ballPeakSpeedKmh` | maximum 3D ball speed between contact and the first bounce (equals the contact speed unless the launch is steeply downward) |
| `avgSpeedContactToBounceKmh` | straight-line 3D distance from the ball centre at contact to the ball centre at first touch, divided by the flight time |
| `avgSpeedContactToBouncePathKmh`, `...HorizontalKmh` | path length / flight time; horizontal distance / flight time |
| `flightTimeS` (`flightTReal` in the 2026-09-26 files) | first-touch time minus contact time |
| `bounceXM`, `bounceYM` | court point directly below the ball centre at first touch |
| `bounceInServiceBox` | inside the correct service box, lines count in (false = fault) |
| `netClearanceM` | ball bottom above the net top where it crosses the net plane |
| `launchElevationDeg`, `launchAzimuthDeg` | outgoing direction: elevation (negative = downward) and azimuth from +x toward +y |
| `airborneS` | landing minus takeoff |
| `trophyPauseS` | trophy hold duration (`trophyEnd - trophyStart`) |

## truth-extra.json

Written by `src/augmentTruth.ts` (library: `src/extraTruth.ts`), format `serve-synth-truth-extra/1`.

### Two derivations

- **`continuous`**: the clip's scenario (`truth.job` in `src/scenarios.ts`) is rebuilt without
  rendering and the kinematic model is sampled every 0.5 ms, with exact event instants (the lowest
  mid-hip is refined by golden-section search). Written only if the rebuilt motion reproduces every
  stored landmark of every frame to within 0.2 mm (`derivation.rebuildMaxDeviationMm`; the stored
  values are rounded to 0.1 mm, so a faithful rebuild differs by about 0.05 mm) and the contact times
  agree. Otherwise `continuous` is null and `derivation.continuousSkipped` says why. This check also
  proves the generator code has not drifted since the clip was encoded.
- **`atFrames`**: the same quantities from the stored `frames[].world` (3D) and `frames[].landmarks`
  (2D as filmed) at this clip's frame times, using the frame nearest each instant: what an ideal
  per-frame pose estimator could see at this frame rate. The lowest mid-hip is a flat minimum, so its
  frame-sampled time moves by several milliseconds with the 0.1 mm rounding, even at 240 fps.

The `canonical` map uses `continuous` when present (all 122 clips today), else `atFrames`; each entry
says which in `source`.

### Conventions

- **Mid-hip**: midpoint of the LEFT_HIP and RIGHT_HIP landmarks (hip joint centres); heights are court z.
- **Tossing side / hitting side**: tossing = left for a right-hander, right for a left-hander (the
  front foot and front shoulder at the trophy position); hitting = the other side.
- **Kinematic trophy**: `events.trophy` of truth.json (midpoint of the hold). **hipLowest**: the
  lowest mid-hip in [tossRelease, contact - 0.08 s].
- **Line angles** for a line from point B (back) to point F (front):
  - `deg3D` = atan2(z_F - z_B, horizontal distance B-F): elevation above the horizontal plane,
    positive when F is higher;
  - `deg2D` = atan2(v_B - v_F, |u_F - u_B|) in pixels of this clip's frame as filmed (image y down),
    positive when F is higher in the image, independent of which way the player faces;
  - `deg2DLevel` = the same after projecting through the camera **turned level** about its centre
    (same position and horizontal heading, pitch and roll removed): the METRICS.md 1.1 level
    correction (pure-rotation homography). Equal to `deg2D` for the level D1 set-ups.
- **Knee flexion** = 180 deg minus the angle hip-knee-ankle (0 = straight), in 3D or on the image
  (`deg2D`, `deg2DLevel`).

### Per serve (`serves[]`)

`index`, `courtSide`, `direction` (aim), `style`, `outcome`, `flightTimeS`, `canonical`,
`continuous`, `atFrames`. `continuous` and `atFrames` have the same fields:

| Field | Definition |
|---|---|
| `events.hipLowest` | `{ tReal, frameIndex, frame, inClip }` of the lowest mid-hip |
| `legDrive.lowestHeightM` | mid-hip height at `hipLowest` |
| `legDrive.heightAtReleaseM`, `heightAtContactM` | mid-hip height at toss release and at contact (atFrames: nearest frames) |
| `legDrive.hipRiseM`, `hipRisePctHeight` | **leg drive**: heightAtContact - lowestHeight; x 100 / player height |
| `legDrive.driveTimeS` | **drive time**: contact time - `hipLowest` time |
| `legDrive.loadingDepthM`, `loadingDepthPctHeight` | **loading depth**: heightAtRelease - lowestHeight; x 100 / player height (0 when the hips are lowest at release) |
| `legDrive.peakUpwardHipSpeedMs` (+`TReal`) | maximum upward mid-hip speed between `hipLowest` and contact (central differences; experimental proxy, research gap doc 5) |
| `shoulderTiltTrophy` | `{ atTReal, deg3D, deg2D, deg2DLevel }` of the line hitting shoulder -> tossing shoulder at the kinematic trophy: positive = front (tossing) shoulder up |
| `shoulderTiltHipLowest` | the same at `hipLowest` |
| `trophySideBend` | shoulder-line angle minus hip-line angle (same definitions) at the kinematic trophy: the experimental D1 side bend (gap doc 4.3). The model's hip line is level, so `deg3D` equals the shoulder tilt |
| `shoulderOverShoulderContact` | `{ atTReal, deg3D, deg2D, deg2DLevel }` of the line tossing shoulder -> hitting shoulder at contact: positive = hitting shoulder up |
| `knees.front`, `knees.back` | `{ deg3D, deg2D, deg2DLevel }` knee flexion of the tossing-side (front) and hitting-side (back) leg at the kinematic trophy; `knees.atHipLowest` the same at `hipLowest` |
| `knees.loadingMaxFront3DDeg`, `loadingMaxBack3DDeg` | 3D maxima over the loading window [tossRelease, min(takeoff, contact - 0.08 s)] |
| `landing.landingToeXM`, `startToeXM`, `fromStartToeM` | tossing-side toe x at landing and at toss release (S0); their difference = **landing distance** as METRICS.md 3.16 defines it (from the start toe, not the baseline) |
| `hipLowestMinusTrophyStartS`, `...TrophyEndS` | timing of `hipLowest` against the kinematic hold |

`outcome` is the D3 tag a player would enter: `in` (bounce in the correct box, lines in), `net`
(negative net clearance or a bounce short of the net), `long` (beyond the service line), `wide`
(otherwise). `flightTimeS` = bounce - contact event times.

### Per clip (`clip`)

Clip-level canonical entries (below), `placement-zone-counts` (`intended` = aims, `actual` = zones of
good serves, `fault`), `serve-type-mix-counts`, and `capture-quality`, whose `value` holds the true
capture conditions behind the METRICS.md 3.25 checks: `captureFps`, `mediaFps`, `timeScale`, size,
orientation, view, `distanceM` and `distanceFrom`, camera height, look-at height, focal length,
`pitchDeg` (positive = looking up) and `rollDeg`, lighting, `shutterS`, `flickerHz`, `shake`, `crf`,
`standingHeightPx` (stature x fy / depth of the hip midpoint in frame 0) and the same scaled to a
1080-px short side and to a 1080-px frame height, and per serve `frameTopAtServerM` /
`frameBottomAtServerM` (image top / bottom row in the vertical plane through the front toe at release,
facing the camera), `tossApexInFrame`, `apexRowFromTopFrac` (projected apex row / frame height;
negative = above the frame), `apexHeadroomOk` (apex >= 3 % below the top), `bodyInside3pcMargin...`
(every landmark inside a 3 % margin from motionStart to landing) and `contactBallStreakDiameters`
(longest serve-ball motion streak in ball diameters over the contact frame and the next two).

## Canonical metric ids

Each canonical entry is `{ value, alt?, unit, source, availability: { supported, reason? } }`.
`availability` applies DECISIONS D1 / D4 / D5 to this clip: `VIEW_NOT_SUPPORTED` when the metric
belongs to another view (`front45` supports none of the view-specific metrics), `FPS_TOO_LOW` for
`speed-experimental` below 120 fps, `NOT_MEASURABLE` for `spin`, `PLAYER_ENTERED` for outcomes the
player tags. It says whether the app may report the metric from this clip at all, not which honesty
label it earns. `trunk-tilt-band` no longer exists (replaced by `shoulder-tilt-trophy`), and
`knee-bend-band` is rear-view only.

| Id | Level | Views | Truth (`value`; `alt` in brackets) |
|---|---|---|---|
| `serve-count` | clip | side, rear | serves whose contact lies inside the clip [`servesInTruth`] |
| `toss-apex-height` | serve | side, rear | `tossApexHeightM / player.heightM` (ball centre) [`m`] |
| `toss-forward` | serve | side | `tossApexForwardOfFrontToeM` (m) |
| `toss-drop` | serve | side, rear | `tossHeightAboveContactM` (m) [`timeS` = contact - tossApex] |
| `toss-height-spread` | clip | side, rear | sample SD (n - 1) of `tossApexHeightM` over the clip's serves; null below 2 [`n`]; series values in `truth-series.json` |
| `toss-forward-spread` | clip | side | sample SD of `tossApexForwardOfFrontToeM` |
| `contact-height-ratio` | serve | side, rear | `contactHeightRatio` [`m`] |
| `contact-forward` | serve | side | `contactForwardOfFrontToeM` (m) |
| `rhythm-release-to-contact` | serve | side, rear | `releaseToContactS` |
| `rhythm-spread` | clip | side, rear | sample SD of `releaseToContactS` |
| `trophy-pause` | serve | side, rear | `trophyPauseS` (the kinematic hold) |
| `leg-drive` | serve | side | `legDrive.hipRisePctHeight`: 100 x (mid-hip height at contact - lowest mid-hip height in [tossRelease, contact - 0.08 s]) / player height [`m`] |
| `drive-time` | serve | side | `legDrive.driveTimeS`: contact - time of that lowest mid-hip |
| `loading-depth` | serve | side | `legDrive.loadingDepthPctHeight`: 100 x (mid-hip height at toss release - lowest mid-hip height) / player height [`m`]. Descriptive only (D5) |
| `deep-bend-flag` | serve | side (experimental) | front-knee 3D flexion at the kinematic trophy >= 45 deg [`frontKneeAtTrophy3DDeg`, `frontKneeLoadingMax3DDeg`, `truthJsonMaxFrontKneeFlexion3DDeg`, `generatingMaxKneeFlexionDeg`] |
| `shoulder-tilt-trophy` | serve | side | `shoulderTiltTrophy.deg3D` [`deg2D`, `deg2DLevel` in this view, `atTReal`, `atHipLowest3D`, `atHipLowest2DLevel`, `sideBend2DLevel`]. A 2D band should be scored against `deg2DLevel` |
| `knee-bend-band` | serve | **rear only** | band of the back-knee 3D flexion at the kinematic trophy: < 20 `little`, 20-45 `moderate`, >= 45 `deep` (research 05 6.5) [`backKneeAtTrophy3DDeg`, `...2DDeg`, `...2DLevelDeg` in this view, `bandMetricsMdEdges` (METRICS.md 3.14: < 25 low, 25-55 typical, > 55 high), `frontKneeAtTrophy3DDeg`, `frontKneeBand`, `backKneeLoadingMax3DDeg`] |
| `shoulder-over-shoulder-contact` | serve | **rear only** (experimental) | `shoulderOverShoulderContact.deg3D` [`deg2D`, `deg2DLevel` in this view] |
| `landing-distance` | serve | side | `landing.fromStartToeM` (from S0) [`fromBaselineM` = `landingDistanceInsideBaselineM`] |
| `repeatability` | clip | side, rear | null: an app-defined composite; its components are the spreads |
| `serve-in-rate` | clip | side, rear (player-entered; rear auto experimental) | k / n of serves with `bounceInServiceBox` [`k`, `n`] |
| `first-serve-in-rate` | clip | player-entered | null: the generator has no serve number |
| `double-faults` | clip | player-entered | null: not modelled |
| `placement-zone` | serve | player-entered target (side), experimental (rear) | intended zone = `serves[].direction` [`actual` = thirds of the singles half-width from the centre line at the first bounce (T inner, body middle, wide outer), null for a fault; `bounceXM`, `bounceYM`] |
| `serve-type-mix` | serve | player-entered | `serves[].style` (flat / slice / kick) |
| `speed-experimental` | serve | side, >= 120 fps, target tag | `ballSpeedAtContactKmh` (launch speed just after contact) [`peakKmh`, `targetTag` = aim] |
| `speed-average-rear` | serve | rear (experimental) | `avgSpeedContactToBouncePathKmh` (path length / flight time) [`chordKmh`, `flightTimeS`] |
| `speed-radar-entered` | serve | any (player-entered) | null: no radar is simulated [`radarEquivalentKmh` = `ballPeakSpeedKmh`] |
| `spin` | serve | none (always unavailable) | null [`generatingSpinRpm`, for reference only] |
| `capture-quality` | clip | side, rear | the `captureQuality` inputs above; the app's Good / Fair / Limited grade is not predicted |

## truth-series.json

For each clip series (clip id without its `-sN` suffix), the clips, the number of serves, and the
mean and sample SD (n - 1) of toss apex height (`toss-height-spread`), toss forward
(`toss-forward-spread`), release-to-contact (`rhythm-spread`), contact height ratio, leg drive and
drive time over all its serves. Clips of one series share the player and the serve seed, so
`baseline-s1..5` are five serves of one player; series made from the same render (fps and CRF
sweeps, lighting, views, distances, shake) repeat the baseline serves and have the baseline's
spreads. Every series has n <= 8, below the app's minimum for spreads (METRICS.md 3.6 needs n >= 8
per stratum; the session's 8 serves are split across two court sides).

## Integrity check (verify.ts)

Reads `manifest.json` as written (no filtering) and fails on:

- a listed file (MP4, WebM, truth.json) that is missing or differs from its recorded byte size, or a
  missing `truth-extra.json`;
- a `truth.json` that does not parse with the app's `parseTruthPoseFrames`, names another clip, or
  disagrees with the manifest's size, fps or frame count;
- a video whose frame count, frame rate, size or audio stream differ from the truth, read two ways:
  ffmpeg stream copy to framecrc (one line per packet; equivalent to `ffprobe -count_packets`) and,
  for MP4, the app's own container probe (`app/src/analysis/video/probe.ts`, mp4box; skip with
  `--no-app-probe`);
- a clip defined in `src/scenarios.ts` that is not in the manifest (reported per group), or a clip
  folder that is not in the manifest. `--json FILE` writes the per-clip results.

## Tests

`npm test` (vitest, Node): projection (35 mm-equivalent focal, pinhole and distortion maths,
extrinsics matrix, camera placement, three.js camera mapping, shake), ball physics (flight time,
bounce point and speeds vs the analytic drag-free parabola, drag and Magnus direction, launch solver,
toss and dribble), landmark continuity (multi-serve clips with walking and dribbles, left-hander,
planted feet, ball continuity at release / contact / bounce / dribbles, exact left-right mirroring),
truth format (readable by the app's `parseTruthPoseFrames`, events, realised metrics vs generating
parameters, slow-motion timing), audio placement and WAV header, occlusion, and derived truth
(`test/extraTruth.test.ts`: line-tilt, levelling and frame-top geometry, bands, zones and outcomes,
leg drive on an analytic trajectory, coverage of every canonical id and absence of
`trunk-tilt-band`, the drift check refusing a mismatched rebuild, frame-sampled vs continuous
agreement, the side-view geometry findings below, view and frame-rate availability, and the D1
camera placement with a frame top above 4.5 m).

`src/audit.ts` checks every job without rendering: release reachable, faults, landmark speeds
(< 30 m/s), toss apex / contact in frame, player fully in frame.

`src/feasibility/` renders stills and runs the app's MediaPipe Pose (full) on them: with a square
crop around the player it detects the figure in every still at 4-12 m with a mean error of about 3 %
of body height; on the full 1080x1920 frame detection drops to 0-50 % at 7-12 m, so the pipeline
needs a person ROI at those distances.

## What the corpus shows about the side view

From `truth-extra.json` across the corpus (level-corrected 2D minus 3D; research values from
`docs/research/gaps/side-view-geometry-contradictions.md`):

| Quantity | Side view (118 serves) | Rear view (6 serves) | Research expectation |
|---|---|---|---|
| Shoulder tilt at the trophy | +0.8 to +3.1 deg | +24.4 to +24.6 deg | D1 within +1 to +4 deg |
| Shoulder-over-shoulder at contact | +7 to +35 deg | +1.7 to +2.5 deg | D1 badly overstated; rear within 1-3 deg |
| Back-knee flexion at the trophy | -5.8 to -35 deg | -0.9 to -1.0 deg | D1 reads low; rear back knee about 0 bias |
| Front-knee flexion at the trophy | -1.6 to -7.5 deg | | D1 -17 to -36 deg (knee pointing at the camera) |

The model's front knee bends nearly in the side-view image plane, so this corpus **understates** the
D1 front-knee problem the research predicts; do not use it to argue that a side-view knee band works.

## Limitations

- The player is stylised, not photoreal; detector behaviour on real people will differ.
- Global shutter only (no rolling-shutter skew), no phone ISP sharpening / HDR / stabilisation, no
  rotation metadata, constant frame rate (no dropped frames).
- The toss has no drag (exact parabola); the outgoing flight has drag and spin; no net collision.
- The ball for the next serve appears in the hand at the end of the previous recovery.
- Truth visibility uses an approximate body model and ignores the racket.
- Audio shapes are simple synthetic transients with no room reflections.
- Only the first bounce is modelled carefully; later bounces and the roll are approximate.
- **Shoulder tilt at the trophy is a constant** (16.83 deg 3D in every serve and profile) and the pelvis
  never tilts sideways, so `shoulder-tilt-trophy` can be checked for measurement bias at one angle
  but not for band or player-relative discrimination; that needs a varied thorax-lean parameter and a
  re-render. Shoulder-over-shoulder at contact varies only 1.6-16.7 deg (3D).
- The front knee points more along the side-view image plane than the research's measured knee
  azimuths (above).
- Serve number (first / second), double faults and radar readings are not modelled.
- `default75` / `fence9` cover only the three deuce serves of the intermediate right-hander at 60 fps
  and 1080p (no ad court, no 4K for the fence set-up, no measured up-tilt).
