# Serve Coach

Frame-by-frame tennis serve analysis that runs entirely on your device.

Film one serve. The app finds the six key positions in the motion, measures
eighteen things about your toss, loading, swing, contact and rhythm, and tells
you which single change will buy you the most — with a drill to do about it.

Your video is never uploaded. There is no account, no server and no network
call after the first load.

---

## Quick start

```bash
npm install
```

```bash
npm run dev
```

The first `dev` or `build` vendors what the app needs to run offline: it
downloads the pose model once (~9 MB), copies the MediaPipe WASM runtime out of
`node_modules` into `public/`, and generates the app icons. That step is
`npm run setup:assets` if you want it on its own — re-running is safe, it skips
whatever is already there. It is the only time the project touches the network.

Other commands:

```bash
npm test
```

```bash
npm run build
```

To use it at the court, build and host `dist/` on any static host over HTTPS,
open it on your phone, and add it to your home screen. After the first analysis
the model is cached and the app works with the network switched off entirely —
including in aeroplane mode on a court with no signal.

**Hosting under a subdirectory.** By default the build assumes it owns the whole
origin. To serve it from a path — a GitHub Pages project site, a staging folder,
a page inside an existing club website — set `BASE_PATH`:

```bash
BASE_PATH=/serve-coach/ npm run build
```

That one value drives the asset URLs, the service worker's scope, the manifest's
`start_url`, and the runtime paths the pose model and WASM runtime are fetched
from. Getting it wrong does not produce a broken layout, it produces an app that
cannot load its model and so cannot do anything at all — which is why it is one
setting rather than four.

**Adding it to the home screen is not cosmetic.** On iOS an installed app is
exempt from Safari's seven-day clearance of site storage; a bookmarked one is
not. That exemption is the difference between a training history that survives
between sessions and one that quietly disappears — see **Privacy** below.

---

## How to film

The measurements are only as good as the clip. Four things matter:

1. **Side-on, 4–5 metres away**, level with the baseline.
2. **Whole body in frame, feet included**, with room above the racket at full
   stretch. Every height is measured against your own body, so cropped feet
   make the numbers fuzzier.
3. **Three to five seconds, one serve.** Start before the hands go down, stop
   after you land.
4. **Slow motion if your phone has it.** The racket travels from behind your
   back to the ball in about a sixth of a second.

A front or back view works too — you get everything except how far in front of
your body contact happens, which only a side view can see. The app detects the
camera angle and drops that one measurement rather than guessing at it.

---

## What it measures

Six keyframes are located in the motion — **ready, toss, trophy, racket drop,
contact, finish** — and each fundamental is measured on the frame where it
actually happens.

| Area | Measurements |
| --- | --- |
| **Toss** | how high the ball actually goes, tossing-arm extension at release, release height, how long the arm stays up, sideways drift of the toss path |
| **Loading** | knee bend at the trophy, hip–shoulder separation, shoulder tilt, leg drive |
| **Swing** | racket drop depth, hitting elbow at the drop, drop-to-contact time |
| **Contact** | contact height, whether you hit the ball at its peak or waited for it to drop, arm extension, body extension, contact point in front |
| **Rhythm** | motion length, share of the motion spent after the trophy, whether both arms arrive together |

Every measurement is scored against a target band, with a plain-English
explanation of what the number means and — only when it needs one — what to
change. Spatial measurements are divided by the player's own standing height,
so they mean the same thing for a junior filmed close up and an adult filmed
from the back fence.

**The ball, not just the arm.** Two of the toss measurements come from tracking
the ball itself in the pixels — how high it really goes, and whether you hit it
at the top of its flight or stood waiting for it to fall. Neither is visible
from the arm, and both are among the first things a coach looks at. The ball is
found by demanding that a run of candidate blobs fit a free-fall arc with the
curvature the player's own height implies, which is what stops a passing bird or
somebody else's ball being reported as your toss. When it cannot be found —
against a cluttered background, or simply out of frame above you — those two
measurements are absent rather than guessed.

**Which serve you were hitting.** A good kick serve makes contact more over the
head than in front, and needs more shoulder tilt than a flat one. Judged against
flat-serve targets it scores badly for doing exactly what a kick serve should,
so the report says which serve it assumed and lets you change it. Switching is
instant — the serve type moves the targets, not the measurements.

**Every measurement carries its own confidence.** Degradation is local, not
global: cropped feet bend every height ratio and leave the joint angles
untouched; too few frames through the swing softens only the swing timing; legs
that never load make the trophy position hard to place and soften the four
things measured there. Numbers the app cannot stand behind are marked
approximate, are given a reduced vote in their area's score, and can never
become the "work on this next" advice. Being sent to fix a fault the app cannot
actually see is the fastest way to lose a player who knows their own serve.

**Bad clips are caught in two seconds, not thirty.** Before committing to the
full pipeline the app samples a handful of frames and checks the framing. If
nobody is in shot, or the player is too far away to measure, it says so
immediately — while you are still on court holding the phone, which is the only
moment "step closer and film it again" is worth anything. Cropped feet alone are
survivable and produce a real report with the heights marked approximate.

**Several serves in one clip.** Film a whole basket if that is easier. Each
serve shows up as a peak in hand height; the app finds them all, reports on the
last one by default — the one you just hit — and lets you switch to any other
without re-filming.

**Consistency across a basket.** From a multi-serve clip you can measure every
serve and compare them. One serve tells you about that serve; several tell you
about the technique, and for a club player the gap between the best and worst
serve is usually a bigger problem than the average. Each element is scored on
how little it moved relative to its own target band, ordered worst first. The
headline score leans on the least repeatable elements rather than the flat
average — a serve is a chain, and one toss that wanders ruins it however steady
everything else was.

**Frame by frame.** The player steps one tracked frame at a time, which is how
you actually read a serve — the difference between a good contact and a poor one
is a couple of frames wide. Stepping moves sample to sample rather than by a
fixed time, because landmarks only exist where the video was tracked and landing
between two of them would draw a stale skeleton over a fresh picture.

Keyboard: `←` `→` step a frame, `space` plays, `1`–`6` jump to the six key
positions, `home` and `end` go to the ends. The scrubber is a real slider, and
the keyframe stills are buttons — everything the player does is reachable
without a mouse.

**The keyframe stills carry the tracking.** The video is never stored, so the six
stills are all that outlives a session — which is why the skeleton and the angle
each position is judged on are drawn onto them at capture time, rather than only
existing in the live player.

**Side by side.** Any serve can be put next to another one — your best by
default, rather than your last, because your last is whatever you happened to
film and on a bad day makes today look like progress. The same four positions
are shown as paired stills with every shared measurement ranked by how much it
moved. All of it comes from data already on the device; nothing is re-analysed.

**The shape you are aiming for.** The target bands describe a position, and a
position is far easier to copy than to read. Turning on "target shape" draws a
dashed figure at each key position, scaled to your body and aligned on your
hips. It is not an illustration — it is the same parametric rig the tests run
against, with every dial set to the middle of the band the report scores you
against, so the picture and the numbers cannot drift apart.

**Save or share a report.** One button renders the score, the thing to work on,
the five areas and the annotated keyframes into a single image, and hands it to
the share sheet or saves it. That is the only way anything leaves the app, and it
is the player who does it — the app itself never sends anything anywhere.

**What to practise.** Any single report picks the weakest thing in that serve,
which on a given day might just be the serve you happened to film. Across
sessions the app looks for the thing that is *still* wrong — ranked by lowest
average rather than by whoever lost the most recent report — and says whether it
is actually moving. Being told to work on the same thing forever, with no sense
of whether it is working, is the fastest way to stop bothering.

**Progress over time.** Saved reports feed a trend view: overall score by
session, and what changed per fundamental since your last serve. Because a
single serve is noisy, the headline figure is a rolling average of your last
three rather than whichever one you just hit, and any change under 3 points is
shown as "no real change" rather than dressed up as progress.

---

## How it works

```
video file
   ↓  seek frame by frame (no playback, no upload)
MediaPipe Pose Landmarker  →  33 landmarks per frame, 2D image + 3D world
   ↓
phase detection            →  the six keyframes
   ↓
biomechanics               →  joint angles, heights, timings
   ↓
scoring + coaching copy    →  report
```

Everything is in `src/lib`:

| File | Responsibility |
| --- | --- |
| `pose/poseEngine.ts` | loads the model and WASM; owns the per-landmarker video clock |
| `pose/extract.ts` | samples the video and runs detection |
| `pose/skeleton.ts` | draws the tracked body — shared by the player and the stills |
| `share/reportCard.ts` | renders a report as one shareable image |
| `analysis/serves.ts` | picks out each serve in a multi-serve clip |
| `analysis/consistency.ts` | compares the same measurements across a basket |
| `practice.ts` | finds the weakness that persists across sessions |
| `storage/sessionKey.ts` | one stored report per serve, not per analysis run |
| `analysis/phases.ts` | finds the six keyframes |
| `analysis/metrics.ts` | turns landmarks into measurements |
| `analysis/coaching.ts` | target bands, serve types, every line of coaching copy |
| `analysis/confidence.ts` | how far to trust each measurement, and why |
| `analysis/geometry.ts` | angles, smoothing, scoring curve |
| `analysis/racket.ts` | where the racket is, inferred from the hand |
| `analysis/modelServe.ts` | the shape the target bands describe, for drawing |
| `analysis/groundTruth.ts` | fixture format and validator for real labelled clips |
| `vision/ballTrack.ts` | finds the tossed ball in the pixels |
| `storage/backup.ts` | persistence, export and import of the history |
| `analysis/analyze.ts` | orchestrates the above |

### Decisions worth knowing about

**Joint angles come from the 3D world landmarks, not the image.** An angle
measured in the image plane changes when the camera moves. Shoulder tilt is the
clearest case: filmed side-on the shoulder line points nearly at the camera, its
horizontal component collapses, and a real 20° tilt projects as 60°+. For the
same reason every horizontal ratio is normalised by body height rather than
shoulder width, which foreshortens to almost nothing side-on.

**The toss and the racket drop are postures, not places.** They are tracked as
hand height *relative to the shoulder*, which is unaffected by the player
leaving the ground. Tracking them in absolute height lets the leg drive corrupt
them — a player who holds the tossing arm up while launching has a hand that
keeps rising even as the arm folds. Contact is the exception and is measured in
absolute height, because it genuinely is a place: the highest the hand gets.

**Each keyframe is bounded by an independently-found one.** The racket drop is
the lowest point *after the trophy*, not the lowest point in the second before
contact — early in the motion the racket simply hangs by the hip, which is
further below the shoulder than the drop ever gets. Searching a fixed window
finds whatever sits at the window's edge, and which one wins changes with the
frame rate.

**Sampling is capped at 32 fps.** Phone video is almost universally 30 fps, so
sampling faster re-reads the same decoded frames at ~55 ms apiece and learns
nothing. Slow-motion footage still gets more samples through the swing, because
it spreads the same motion over more seconds of file.

**The report's focus ranks over every measurement, not over the areas.** An area
score is an average, so the weakest area is not reliably where the worst fault
lives — a player with rigid legs could otherwise be told to work on their tempo
because Rhythm averaged a little below Loading, while the knee bend that
actually cost them the serve went unmentioned.

**Measuring a whole basket scans the clip once.** The scan covers the entire
video while each extraction covers only a couple of seconds of it, so repeating
the scan per serve was the most expensive thing the pipeline did — about 40% of
the total work for a three-serve comparison.

**Locating serves costs a fixed budget, not one proportional to the clip.** Every
sample is a video seek plus a pose detection, roughly 55 ms, and that floor is set
by decoding rather than by anything here. Sampling the whole clip at a fixed rate
therefore cost 55 ms for every 83 ms of footage: a three-minute basket spent over
two minutes finding serves before it measured one, and a ten-minute clip — well
inside the size the app accepts — spent seven. Since the app actively suggests
filming a basket, that had to be bounded.

The scan now spends a fixed number of frames however long the clip is, in two
passes. A coarse pass spread across the whole clip finds roughly where the reach
peaks are; a second pass re-reads a second either side of each candidate at the
full rate. The refinement is what makes the cap safe: sampling coarsely does not
move a serve, but it under-reads how high the hand got, and `findServes` discards
any peak more than a tolerance below the best — so an under-read serve is not
merely imprecise, it is dropped, and the player is told one of their serves could
not be read. Spending the samples where the answer lives gives better peak
heights than a uniform scan at four times the cost. A thirty-minute clip went
from 21,600 frames to 464.

Both passes land on one grid across the whole clip rather than being laid out from
each candidate, so windows around two serves close together genuinely share their
frames instead of each paying for the same instants.

**The tracking is checked for staying on one person.** The pose model is asked for
one body and chooses which one every frame, with no obligation to pick the same
one twice — so a coach standing to one side, or somebody on the next court, can
take over mid-clip and the report is then assembled from two different people.
Nothing else in the pipeline can see it: every landmark is present, visibility
stays high, and the numbers look entirely ordinary.

Physics gives it away. Hips are the steadiest thing on a serving body: across
24–120 fps, and including the leg drive, they never move more than about 0.026 of
standing height between samples. A hand-off to somebody a metre away moves them
half a body height in a single frame. Past a threshold six times the fastest real
motion, the app says so and halves the confidence — not another weighted term,
because no amount of good light and frame rate makes a report built from two
bodies trustworthy.

**The scale reference avoids extremes of noisy data.** Every height in the report
is a ratio against the player's standing height, so a bias in that one number
bends all of them at once. Taking the highest head position and the lowest foot
position would do exactly that — the extreme samples of a jittery series are by
construction the ones noise pushed furthest, so the body would measure taller the
worse the tracking got, silently shrinking every ratio. The ground comes from the
median foot position across the stance; standing height comes from the median
head position over the opening of the motion, before the player sinks into the
load.

**Joint angles are read from positions averaged over a frame either side.** An
angle near full extension is under-read on noisy tracking: 180° is a ceiling, so
jitter on a nearly-straight limb can bend it but cannot straighten it past flat,
and the error does not cancel out. Left alone, a genuinely straight arm measures
bent — and arm extension is one of the measurements that tells a player to change
something. Averaging positions first (they *do* have symmetric, cancelling noise)
cuts that error by about two thirds. Every angle read this way sits at an
extremum of its own motion, where the value is locally flat, so the window costs
no real accuracy.

**Clips that are not serves are rejected rather than scored.** A serve lifts the
racket hand from around the hip to well above the head; if that did not happen,
the app says so and explains how to film it instead of reporting confident
nonsense. It also reports a confidence figure and flags what degraded it.

**"Not a serve" and "cannot read that file" are different answers.** A clip the
browser cannot decode is usually HEVC — which iPhones record by default, Safari
plays, and Chrome on Windows frequently will not. The file looks perfect in the
camera roll, so a generic decode error reads as the app being broken and leaves
nothing to act on. The app names the codec and points at the iPhone setting that
changes it. Telling that player to keep their feet in frame would send them off
to refilm something that fails identically.

**The wrong hand is diagnosed as the wrong hand.** Selecting the wrong serving
hand makes the app watch the tossing arm, which never sweeps from hip to
overhead — so it used to report "that does not look like a serve" about a serve
that plainly was one, with filming advice that could not fix it. It now checks
the other arm before rejecting, and says which hand it actually saw. The usual
cause is a front-facing camera mirroring the clip.

**The animation loop runs only while the clip is moving.** It used to run for as
long as the report was on screen — sixty redraws a second of a paused picture
that had not changed, which on a phone shows up as the handset getting warm
rather than as a bug. Paused, the overlay is redrawn only when something about
it actually changes.

---

## Testing

```bash
npm test
```

The analysis engine is pure TypeScript with no DOM dependency, so it is tested
in Node with no browser and no test framework — `scripts/run-tests.mjs` bundles
it with esbuild and runs it.

The tests drive a **parametric synthetic serve** (`__tests__/syntheticServe.ts`)
built from the quantities a coach would name: knee bend, shoulder tilt, hip and
shoulder rotation, where the hands are, how long the motion takes, and where the
camera is. That means a test can dial in a specific fault and assert the app
reports *that* fault and not some other one — and can check a measurement reads
back the value it was built from.

Covered: keyframe order and position, handedness (both hands), rejection of
non-serves, measurement accuracy against dialled-in values, invariance to camera
angle and frame rate, splitting a multi-serve clip into individual serves, and
that scoring stays sane under absurd input.

**Does the advice survive the noise?** Accuracy on clean landmarks is not the
same question as reliability on real ones. A second suite runs an ensemble — the
same serve under two dozen independent noise realisations at the jitter level
MediaPipe actually produces — and asserts not that the numbers are right but
that they do not move enough to change what the player is told. It is a ratchet:
a change that makes the pipeline noticeably noisier turns this red while every
accuracy test still passes. It found three real faults on its first run, all of
which are fixed and now have regression tests:

- The contact-depth measurement took its *sign* from the difference of two
  single jittering landmarks, so noise could mirror it — turning a contact 20 cm
  in front into one 20 cm behind, and the best measurement in the serve into the
  worst. It is now fitted across the whole trophy-to-contact sweep, and dropped
  entirely when there is too little sideways travel to call.
- The trophy was the knee-angle minimum and nothing else. On a player who barely
  bends, that series is flat to within its own jitter and the minimum landed
  wherever the noise dipped — the trophy wandered over 0.4 s of a 1.35 s motion,
  for exactly the stiff-legged club player this app is for. It now falls back to
  the arms when the legs give no signal; the wander is 0.02 s.
- Cropped feet did not trigger the torso fallback, because MediaPipe places
  off-frame ankles somewhere near the edge of the picture rather than declining
  to place them. Standing height came out finite and wrong, and every height in
  the report was divided by it — while the report told the player their heights
  were "estimated from your upper body", which was not true. The check is now on
  whether the ankles were *seen*.

**Ground-truth fixtures.** `src/lib/analysis/__tests__/fixtures/` holds real
clips, hand-labelled, stored as the pose output rather than the video — a few
hundred kilobytes instead of a few hundred megabytes, and hermetic, so a
regression can only come from the analysis code. Dev builds have a **Save as
test fixture** button on every report that produces a labelling draft. The
folder is currently empty, and the suite says so loudly: hip–shoulder separation
and shoulder tilt are computed almost entirely from world-space `z`, which the
rig models as exact and MediaPipe emphatically does not, so those two are
unvalidated against anything real until it is not.

During development, `?demo` renders a report from a simulated serve,
`?demo=live` also mounts the player, and `?demo=basket` shows the consistency
comparison — so the UI can be worked on without filming anything. All are
dev-only and are not in the production bundle.

**A re-analysis is a correction, not a new serve.** Telling the app it read the
wrong hand, or flicking between the serves in one clip, re-runs the pipeline —
so reports are keyed by the clip and the serve within it rather than by when
they were produced. Otherwise each correction files a duplicate, which then
shows up as an extra point on the trend chart and eats a slot in the window the
practice advice looks across.

**Reports outlive the code that wrote them.** Anything loaded from storage is
run through `normalise` in `storage/db.ts`, which fills in fields added by later
versions and drops only what is genuinely unusable. An `ErrorBoundary` sits
behind that: if a render still fails, it offers a reload and a "clear saved
reports" escape hatch, because a blank page caused by bad stored data would
otherwise recur on every load with no way for the user to clear it.

---

**History is bounded, numbers before pictures.** Nearly all of a stored report's
size is its six keyframe stills, and those are the part nobody revisits after a
few weeks — while the measurements are what the trend chart and the practice
advice are built from. So the stills are dropped from older reports first and the
numbers survive much longer, which is the opposite of deleting whole reports
oldest-first. If the browser refuses a write because storage is full, the app
frees space and retries rather than silently losing the serve you just recorded.

## Privacy

The video is read from a local object URL, decoded in the page, and never sent
anywhere. Reports are stored in IndexedDB on the device; the clips themselves
are never saved, which is also why reopening an old report shows the numbers and
the keyframe stills but not the video. Clearing site data removes everything.

**Which is also the risk.** Browsers treat site storage as disposable — Safari
clears it after seven days without a visit unless the site has been added to the
home screen, and a player who films every other weekend crosses that line
constantly. So the app asks for persistent storage once there is a history worth
keeping, nudges iPhone users to install it, and can export the whole history to
a file you can carry to a new phone. Import merges rather than replaces, and a
report already on the device wins if it is the newer of the two, so restoring an
old backup cannot roll back training you have done since.
