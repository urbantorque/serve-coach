# Serve Coach

Frame-by-frame tennis serve analysis that runs entirely on your device.

Film one serve. The app finds the six key positions in the motion, measures
twenty things about your toss, loading, swing, contact and rhythm, and hands
back the two to four changes worth making, in the order that causes the
others — worst cause first, each with a drill. Two of the twenty come from the
ball and are absent when it cannot be found.

Your video is never uploaded. There is no account and no server: nothing you
film, and nothing measured from it, leaves the device. The app itself is a
service worker and it does check for its own updates, so a devtools network
tab is not empty — but no request carries your data, and everything works with
the network off.

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
open it on your phone, and add it to your home screen. Tap **Download now to
use offline** on the home screen while you still have signal — that fetches the
19 MB of pose model and WASM runtime and caches them. After that the app works
with the network switched off entirely, including in aeroplane mode on a court
with no signal. Running an analysis fetches the same assets, so the badge also
turns itself green the first time you use the app for real; the button exists
so that getting ready does not require analysing something first.

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

**The ball, not just the arm.** Two measurements come from tracking the ball
itself in the pixels — how high the toss really goes, and, scored under Contact
rather than Toss, whether you hit it at the top of its flight or stood waiting
for it to fall. Neither is visible from the arm, and both are among the first
things a coach looks at. The ball is found by demanding that a run of candidate
blobs fit a free-fall arc with the curvature the player's own height implies,
which is what stops a passing bird or somebody else's ball being reported as
your toss. When it cannot be found — against a cluttered background, or simply
out of frame above you — those two measurements are absent rather than guessed.

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

**Poor light degrades the whole body at once, and confidence follows it down
smoothly, before there is a cliff.** Every other clip problem here is local —
one limb, one moment. Dusk is not: the tracker gets a little less sure of
everywhere at the same time, and the numbers it reports do not move, only how
much the app is willing to stand behind them — the toss, the trophy, the
contact, all softened together rather than one card quietly going first. Below
a visibility floor the clip is refused outright rather than measured at a
confidence too low to mean anything, which is a real edge rather than a
number that simply gets smaller forever.

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

**Consistency across a basket.** A clip with more than one serve in it is
measured all the way through before the report appears — one video pass per
serve, with a row filling in on the analysing screen as each lands, and whatever
was measured kept if you stop it early. The report then opens on the serve you
just hit with the basket's verdict beside the serve picker, and the full spread
sits below the fix. It used to be a button under the report that most people
never pressed, which made the app's own argument — that the gap between your
best serve and your worst one matters more than the average — something it
stated and did not act on. One serve tells you about that serve; several tell you
about the technique, and for a club player the gap between the best and worst
serve is usually a bigger problem than the average.

**And which serve was the good one.** The spread rows say how far each element
travelled and say it anonymously — "struck below full reach → struck at full
racket reach" is true of the basket and names neither serve. A player standing
on a court can count their serves, so the panel now names both: the best and the
worst by the same score already on the chips, and the three measurements where
they differed. Only differences big enough to be said in different words are
printed. Two serves can differ by a real number of degrees and both read "arm
dead straight", and pointing at that pair would be pointing at something the
player cannot see in their own clip.

Underneath that, the two serves as pictures: the same six positions, the good
serve beside the bad one, each still already carrying the tracked skeleton and
the angle that position is judged on. It is the one place in the report where
somebody sees their own good trophy position next to their own bad one, which is
what a coach does with a phone at the net.

Those twelve images are never stored. Nearly all of a saved report's size is its
keyframe stills, which is why old reports lose their stills before they lose
anything else — filing twelve more under the heading of a comparison would make
the comparison the largest thing in the record. So the pictures last as long as
the clip is open and a re-opened report has the words instead, which say the
same thing and cost nothing.

Getting them at all meant separating three decisions that had been sharing one
name. `skipThumbnails` also turned off the framing preflight and the ball pass —
a whole second pass over the video, per serve — so the only way to keep a swept
serve's stills was to buy eight ball passes with them. That is why the serves in
a basket had no stills, and it was never a decision anybody took about stills. Each element is scored on
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

**Record it here, and glance at it between serves.** The viewfinder that checks
your framing can also record, off the same stream it is already watching, where
the browser will record something the app can then read back. The loop it
replaces was minutes long — film in the camera app, stop, leave it, find the clip
in the picker — and every step of that is spent not serving.

A clip recorded that way lands on a glance rather than the report: the score, the
one thing to change, and a button back to the viewfinder. The report is the right
screen for somebody sitting down with their serve and the wrong one for somebody
holding a basket of balls, and it is one tap away. The glance runs no analysis of
its own and ranks nothing differently — it is the same report with less of it said
at once — and a clip the engine could not read gets the refusal with no score
attached, because there is no room here for the caveats the report carries.

The pose model stops while recording. The player has stopped aiming and started
serving, so there is no verdict left to read, and a hardware encoder is running on
the same stream thirty seconds before the analysis needs the GPU.

**What this phone can do.** Open the app at `?check`, or tap it at the foot of
the history sheet, and it says what this particular browser will record, what it
will open, whether the camera and the offline download are there, and how much
room the browser has given it. It makes no request and stores nothing.

It exists because the recording path used to choose a container by an ordering
that assumed what a browser can decode, and never asked. The ordering is a good
guess and it was the whole of the reasoning: whatever the encoder accepted first
was handed back. On any browser where the guess is wrong, the player serves, the
file lands, and nothing opens it — which is the exact failure the ordering exists
to avoid, surviving inside it. Printing the two columns beside each other is what
made that visible, so they are still printed beside each other.

**The recorder now asks both questions.** A container this browser will not play
back is not the container it records in, whatever the ranking says. Where there
is no `canPlayType` to ask, the answer falls back to encoder support alone —
absence of evidence must not delete a working button, which is the same rule the
analysis path follows when a threshold cannot be read. A browser that records
only what it cannot open gets no record button and says so, because a control
that produces a file the app then refuses is worse than no control, and the file
picker is a first-class path rather than a degraded one.

The check also asks about HEVC, which is the same failure arriving through the
file picker instead: Chrome on Windows answers no, which is why an iPhone clip
that plays perfectly in the camera roll cannot be read.

`COURT-CHECK.md` is the twenty-minute list that uses it: nine steps in order,
each saying what it proves, ending in what to send back. The first three are
worth doing without a racket — they cover what this browser will record and
whether the app really works with the network off, which are the two things most
likely to be silently wrong.

The whole thing is also one block of text, always on screen and always
selectable, with a copy button as an accelerator rather than as the only way
out — `navigator.clipboard` is refused often enough on a phone that a button
which is the only route strands somebody. **The user agent is deliberately
absent.** It is the field most likely to identify one person's device across
sites, and it adds nothing the rest of the block says: a UA string is what you
read when you want to *guess* at capabilities, and every line there is the
capability itself, asked directly. Leaving it out is also what makes the block's
vocabulary finite — a test walks the report and fails on any string outside a
fixed list, so a field added later cannot quietly carry a file name or a serve
into something the player is being invited to paste to somebody.

**Save or share a report.** One button renders the score, the thing to work on,
the five areas and the annotated keyframes into a single image, and hands it to
the share sheet or saves it. That is the only way anything leaves the app, and it
is the player who does it — the app itself never sends anything anywhere.

The target dial goes with it, because it is drawn into the still rather than
composed on screen — a shared card showing a bare arc where the report shows an
arc, a band and a reading would be the quieter claim about the same serve, and
the honest half is the one that would have been lost. The two paired comparisons
do not. That card is one serve; a pair is a statement about a set of them, and
half a comparison shared without its dates or serve numbers is a picture of two
serves with nothing saying which is which.

**What to practise.** Any single report picks the weakest thing in that serve,
which on a given day might just be the serve you happened to film. Across
sessions the app looks for the thing that is *still* wrong — ranked by lowest
average rather than by whoever lost the most recent report — and says whether it
is actually moving. Being told to work on the same thing forever, with no sense
of whether it is working, is the fastest way to stop bothering.

**"Stuck" and "never tried it" are different answers.** A measurement flat across
five sessions means one thing if the player has been drilling it and something
else entirely if they have not, and nothing in the record could tell those apart
— so the card said the same thing to both. There is now one tap to say the drill
was done, and four sentences where there was one: drilled and moving, drilled and
not moving, never logged, and no records at all. The last stays separate on
purpose. A history from before the button existed is not evidence that somebody
has not been practising.

Drilled and not moving is the one worth having. It says to take that one to a
coach, because a player who has done the work and watched the number sit still
is being failed by "spend your time here", and hearing it a fourth time is how
somebody stops opening the app.

There is no streak, no badge and no congratulation for the tap. What it records
is evidence, and an app that celebrates it is asking to be tapped — which fills
the record with drills nobody did and makes the sentence above worthless.

It also says what to *groove*, which is a different question from what to fix.
Ranking by score cannot see a measurement that lands in its band every time and
wanders right across it — and for a club player that wandering is usually what
is costing them the point. The element that came out least repeatable in more
than one basket gets a sentence under the drill: a second thing to work on when
it is a different measurement, and a stronger reason to stay on the first when
it is the same one. It is read off the same trend the progress screen draws
rather than worked out again, because two screens with their own opinion about
which element wanders would eventually disagree in front of the player.

**Then, and now.** A chart says the number went from 58 to 66. It cannot show
that the racket now falls behind the back where it used to stop at the shoulder,
and that is the thing somebody wants to see after six weeks of the same drill. So
the progress view puts the oldest serve that still has pictures beside the newest
one, the same six positions paired up — the same grid the basket comparison uses,
because they are the same picture with different captions.

The oldest that still has pictures, rather than a fixed distance back: stills
survive on the newest twenty reports and are dropped from everything older, so
that is the widest honest comparison there is. Asking for "three months ago"
would quietly return whatever happened to still have images. Both serves have to
be the same type, from the same scoring era, and at least a day apart — two
reports from one afternoon are one trip to the court, and showing them under a
heading about progress would call an hour's variation improvement.

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
| `storage/db.ts` | the reports, and separately the drills the player says they did |
| `analysis/phases.ts` | finds the six keyframes |
| `analysis/metrics.ts` | turns landmarks into measurements |
| `analysis/coaching.ts` | target bands, serve types, every line of coaching copy, one drill per fault |
| `analysis/anatomy.ts` | says each measurement as a body position instead of a number |
| `analysis/kinematics.ts` | the motion as continuous series: rotation, spine, palm, and their rates |
| `analysis/tiers.ts` | the rating ladder, and the band one rung above the player |
| `analysis/flaws.ts` | named breakdowns, their evidence, and which cause which |
| `analysis/diagnose.ts` | the diagnostic pass, out as one JSON object |
| `analysis/spatial.ts` | which way is up, where the camera stood, and whether depth is readable |
| `analysis/kalman.ts` | holds a landmark through blur, and scores how degraded or how frozen the track is |
| `analysis/triage.ts` | the primary fault as stored data, or the reason the clip could not be read |
| `analysis/verdict.ts` | the same walk continued into the two-to-four plan the player reads |
| `analysis/syntheticServe.ts` | a parametric serve with no camera — drives the tests and the `?demo` report |
| `analysis/voice.ts` | the house style as code: strips filler, caps length, lints the copy |
| `analysis/confidence.ts` | how far to trust each measurement, and why |
| `analysis/geometry.ts` | angles, smoothing, scoring curve |
| `analysis/racket.ts` | where the racket is, inferred from the hand |
| `analysis/groundTruth.ts` | fixture format and validator for real labelled clips |
| `vision/ballTrack.ts` | finds the tossed ball in the pixels |
| `storage/backup.ts` | persistence, export and import of the history |
| `selfCheck.ts` | what this browser will record, open, store and show, asked on the device |
| `footprint.ts` | what an analysis is holding in bytes, and what it cannot count |
| `analysis/analyze.ts` | orchestrates the above |

### Decisions worth knowing about

**The report never shows the number it measured.** Everything spatial is a ratio
of standing height, because that is what survives a change of camera — and
"1.38×" is a coordinate multiplier that means nothing to a player. Each
measurement carries a ladder of body positions instead (`analysis/anatomy.ts`),
so the card reads "peaks a ball above the racket" and the target underneath it
is read back through the same ladder. The value is still on the report object
for fixtures, the consistency sweep and the dev tools; it just never reaches the
screen.

**Targets are one rung above the player, never a fixed standard.** The
measurements are scored against bands describing a well-struck serve, which is
the right thing to score and the wrong thing to *aim* at — a club player asked
for a tour racket drop has been handed a target indistinguishable from none, and
on the flexibility-bound signals, chasing one is how people get hurt.
`analysis/tiers.ts` carries a ladder anchored at four rating points, and the
diagnostic pass always hands back the band belonging to the tier above the
player. Give it a rating and it uses it; give it nothing and it estimates one
from the serve, deliberately pessimistically.

**One answer, or an honest refusal.** A club serve has six things wrong with it
and most of them are downstream of the first, so `analysis/triage.ts` collapses a
diagnosis to a single instruction using a hierarchy — grip, toss, posture, drop,
sequencing, contact. Whatever the deepest fault is, the shallowest one wins, and
a flaw already attributed to another detected flaw is never chosen. When the clip
itself cannot carry an answer — nobody visible, too few frames through the swing,
a hand smeared past recognition — it returns a reason and nothing else, because
half an answer off a clip that bad is the half the player would act on.

**Every window is measured in seconds, never in frames.** Two frames is 16 ms of
slow motion and 66 ms on a phone. Windows counted in frames therefore mean
different things on different clips, and one of them used to average the two
ends of a pronation measurement into each other and report an ordinary serve as
a pushed contact. A test now reads the same serve at 24, 30, 50 and 120 fps and
fails if the verdict moves.

**A requested sampling time and an achieved one are not the same number.**
Every derivative in `kinematics.ts` already divided by the real gap between two
samples rather than assuming a fixed rate — that half of "frames are not evenly
spaced" was already handled. The other half was not: `extractFrames` asked the
video to seek to an evenly-spaced grid of times and then recorded the sample
under the time it *asked for*, not the time `video.currentTime` actually landed
at. A decoder does not seek to an exact instant, it snaps to the nearest real
frame — a few milliseconds off target on an ordinary seek, not only on the rare
one that times out — so every one of those careful per-sample derivatives was
computing an exact answer from an admittedly inexact input. `pose/extract.ts`
now files every sample under where the seek actually landed.

**The diagnosis is data, and only data.** `analysis/diagnose.ts` returns numbers,
booleans and enums: signals, named flaws with the band they missed, severity,
and which flaw caused which. No sentence is composed anywhere in that path — a
test walks the output and fails on any string that is not an identifier. It also
never returns a frame or a landmark, so a stored report cannot pin a decoded
clip in memory.

**The house style is enforced by a test, not a style guide.** Coaching copy rots
towards the polite, the hedged and the long, a word at a time. `analysis/voice.ts`
caps every line at two sentences and twenty-five words, strips openers and
hedges, and lints the whole copy database in `__tests__/copy.test.ts` — a
pleasantry fails the build. Copy marks its instruction with `**double
asterisks**`, which is the only thing rendered in bold and is flattened for the
share card.

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
from 21,600 frames to at most 596: 420 for the coarse pass, plus the twenty-odd
frames the refinement spends on each of up to eight candidates.

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
24–120 fps, and including the leg drive, they never move more than about 0.03 of
standing height between samples. A hand-off to somebody a metre away moves them
half a body height in a single frame. Past a threshold five times the fastest real
motion, the app says so and halves the confidence — not another weighted term,
because no amount of good light and frame rate makes a report built from two
bodies trustworthy.

**That check cannot see a hand-off between serves, only inside one.** A
basket is measured one serve at a time, each read from its own window, ready
to finish — so a coach who serves once in the middle of it produces a serve
with nothing to jump *from*, and the comparison happily lines their numbers up
against the player's own. What a fixed camera can still say is whether the
serves agree on whose body it was filming: standing height should hold
steady, filmed from one spot in one session, and a serve that reads clearly
taller or shorter than the rest gets a note on the comparison rather than a
silent blend of two people's serves.

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

**Handedness reads a gap in time, which is why noise does not touch it.** Which
arm holds the racket is decided by which one peaks *later* — the tossing arm
early, the racket arm at contact — and that gap, measured in seconds, is wide
enough that ordinary tracking jitter has never once closed it in testing: swept
across sixty realisations of poor-light noise, zero flipped. Camera-angle
detection shares the same landmarks and is not nearly so settled: it recovers
the angle from a shoulder span, and the arithmetic that does it grows far more
sensitive to noise the more face-on the camera stands. A clip too face-on to
read depth from is still almost never confidently read as one that can be, but
a clip only a couple of degrees inside the readable range is over-hedged as
unreadable more often than not — a real cost in lost readings, measured and
tracked rather than fixed, because the two fixes tried each helped one camera
angle and made another worse.

**The first-run guide is one sheet with three reasons to open it, and it has to
remember which.** Analyse a serve, Record now and Check your framing first are
three different destinations after the four filming rules and the hand
question — a file picker, the phone's camera app, and the live viewfinder —
and until this was named as `firstRunIntent` the guide only ever knew one of
them: finishing it always opened the file picker, whatever had actually been
tapped. A first run through Check your framing first had no route through the
guide at all and skipped it entirely; a first run through Record now landed on
a generic file browser instead of the camera. Both are the same root cause,
fixed once: the continue button reads which of the three it is about to do,
and finishing branches on it — reusing the same `framingNonce` counter
`Glance`'s "Record another" already bumps to open the viewfinder, rather than
inventing a second way to ask for it.

**Reading the rules and stating a hand are two different facts, not one.**
The interstitial above gated on a single flag, `seenFilmingGuide`, for both
whether to show the four filming rules and whether to ask which hand serves —
so a stranger who read "How to film it" on the home screen first, unprompted,
then tapped Analyse a serve, would see the identical four rules again before
being asked for a hand never actually collected. The fix is not "stop asking
after the rules are read": that would let the same stranger skip the hand
question entirely, since nothing else on the path asks for it and every swing
measurement is read off the racket arm the hand names. `Home.tsx`'s gate is
now `needsHandedness`, true only until a hand is stored — the read-only guide
sheet marks `seenFilmingGuide` on its own close, and the interstitial it
shares with the first run reads that flag itself to decide whether `FilmingGuide`
renders inside it this time, always asking the hand regardless.

**The animation loop runs only while the clip is moving.** It used to run for as
long as the report was on screen — sixty redraws a second of a paused picture
that had not changed, which on a phone shows up as the handset getting warm
rather than as a bug. Paused, the overlay is redrawn only when something about
it actually changes.

**A frozen track is a different failure from a jittery one, and needed a
different check.** A hand smeared by fast motion produces a noisy track that
the existing blur statistic is built to catch — large frame-to-frame swings
around the true path. A hand MediaPipe has lost behind the body for a stretch
often does the opposite: the model holds roughly still on its last plausible
guess rather than declining, at full visibility, because it is obliged to
return a wrist every frame and a learned prior about where wrists plausibly
sit is not noisy. That read as a *clean* track to a statistic built on
curvature — a racket wrist frozen for half a second through the drop scored
zero blur, and `dropDepth` came back a confident, invented number. The engine
now also asks whether the racket hand travelled at all through the
drop-to-contact window — the one stretch of any serve guaranteed to be a
large, fast excursion — and a track that did not is refused rather than
measured, whatever its curvature says.

**A curvature match is not enough to say two points came from the same
object.** The toss is found by fitting a run of candidate blobs to a
free-fall arc — but that fit only ever reads *height* against time, because
that is where gravity shows up, and it has nothing to say about *width*. Two
background objects each on their own smooth path — another ball, a bird, a
reflection, the ordinary clutter of a busy court — can each contribute a few
frames whose height happens to sit near one shared parabola, and the search
had no way to know those points came from different things: measured across
hundreds of simulated clips with two or three such objects and no real ball
anywhere, a false toss was reported in a quarter of them. A real ball has no
sideways acceleration worth modelling, so its accepted points sit close to
one straight line; points stitched together across two objects drifting in
different directions do not, and the fit is now checked for that too — which
took the same measurement to one in fourteen, and a harder stress test of
pure decorrelated noise, with no coherent object in frame at all, from 85%
of trials to none.

**A detector the engine cannot resolve is withdrawn, not hedged.** Hedging is for
a number that is roughly right; it is the wrong answer for one that is a coin
flip, because the softest caveat still leaves an accusation on the card.
`pancake_contact` was named on 10% of serves the rig calls clean, so it is now
measured and never reported to a player, and `pronation_deg` is graded against
nothing. Two registers record the two ways this happens and both are printed by
the suite as standing warnings: `UNDER_RESOLVED` in `analysis/tiers.ts` for a
signal that moves further between two takes of one serve than the band it would
be graded against — `hip_lead_ms` deviates 57 ms against a 45 ms serious miss —
and `UNCALIBRATED` for the opposite, a signal steady enough to grade with no
honest band to grade it against. The five-link kinetic chain is entirely in the
second: the wrist link holds to 0.5 ms across the noise ensemble where trunk
rotation read from world *z* moves 53 ms, and not one of the five names a flaw,
because nothing here can say what a good one looks like.

**Fixing what makes a number ungradable does not make it gradable.** The chain's
span is measured in milliseconds and therefore grades tempo: the same serve
served slowly has a longer chain, so a band in milliseconds would mark a
deliberate server as having no sequence at all. Dividing by how long the motion
took is the obvious repair, it is now computed, and it stays in `UNCALIBRATED`
for two separate reasons the suite prints on every run. The division removes most
of the dependence and not all of it — swept at 1.1, 1.35 and 1.7 seconds the raw
span spreads 58% about its own mean and the ratio still spreads 21%, because the
span is not in fact proportional to the motion. And even at zero, being
scale-free is what a quantity needs before a band could exist, not a band:
nobody here knows what this number should be for a club player, and the rig
cannot be asked, because every track in it hangs off one normalised phase
schedule. The note this replaces recorded that ratio as scale-free to within 5%
and stated neither its frame rate nor its dials. It does not reproduce, which is
why the sweep is now printed rather than transcribed.

**Image x is not "sideways" — it is whichever body axis the camera laid across
the sensor.** Toss drift was read straight off image x and called sideways by
the metric, by the flaw and by the copy. Filmed side-on, the angle this app
recommends, image x is 0.99 front-to-back and 0.14 across the body, so the number
was depth drift wearing the wrong name — and the drill handed out for it was
"stand side-on beside a fence and brush the ball past it", which constrains the
axis nobody had measured. `analysis/axes.ts` now owns that conversion and nothing
else re-derives it; the axis travels from the reading through the flaw to
`FLAW_DRILL_BY_AXIS`, so a toss that wandered forwards is drilled forwards.
The band moved with it honestly: the depth case keeps its calibration because
dividing by a 0.99 gain shifts it under one percent, and the lateral case is
marked provisional, because until the rig gained a lateral dial there was no way
to drive that axis at all.

**The ghost is drawn only where a translation can express the correction, and
never over a number the app has hedged.** Showing a target beats stating one, but
a picture asserts more than a sentence does. The ghost is a rigid translation of
the player's own tracked body, so it can say "be higher" and cannot say anything
about a joint angle — the trophy ghost was withdrawn for that reason, not because
the knee is hard to see. Its legs are not drawn, because lifting them implied a
leg drive of 0.305 against the serve's real 0.089 and quietly reassigned the fix
to a card scored separately. The gap line ends at the near edge of the target
band rather than its middle, which at one dial was overstating the player's
actual shortfall by 7.6×. A measurement below `SOFT_MEASUREMENT`, or absent, gets
no ghost at all.

**The live framing check borrows every threshold and admits what it cannot
tell.** A viewfinder with its own idea of good enough would wave through clips
the upload path then throws out, so `lib/framing/judge.ts` owns the *order* of
what to say and not one number: cropping and distance come from
`framingIssues`, which of them refuse from `blockingFramingIssue`, camera angle
from `DEPTH_YAW_RANGE`, tilt from `NOTABLE_ROLL`. The sharpest thing it does is
refuse to overclaim: roll is the angle of the player's own standing axis off
image vertical, and a leaning player and a tilted phone produce that reading
identically — so the cue names the picture, offers both fixes and says it cannot
tell which. A test rotates the body about the ankles on a level phone and asserts
both cases give the same words, so the admission cannot be edited back out.

**A severely rotated clip is refused rather than measured through a clamp.**
Every height and axis in this app assumes image y is vertical, which is only
true if a clip's rotation was honoured on the way in — a real test of that
needs a genuinely mis-rotated file from a real phone, which is the same block
`COURT-CHECK.md` is already waiting on. What can be checked is the reachable
proxy: `estimateRoll` clamps its own reading to ±25° so the correction it
drives never over-rotates a frame, and that clamp could have quietly meant a
clip actually rotated 60 or 89 degrees got corrected as if it were a mild 25
and then reported in full. It does not — the confidence cost the roll drives
already pushes a clip that far off level under `LIMITS.spatial` on its own,
so it is refused rather than measured through the clamp, at every severity
tested from 30° to 89°.

---

## Testing

```bash
npm test
```

The analysis engine is pure TypeScript with no DOM dependency, so it is tested
in Node with no browser and no test framework — `scripts/run-tests.mjs` bundles
it with esbuild and runs it.

The tests drive a **parametric synthetic serve** (`analysis/syntheticServe.ts`)
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
test fixture** button on every report that produces a labelling draft.

The draft is built to fail, and it says how. It asks for a description before it
will write a file at all — the placeholder used to be the default value of that
field, so the commonest way to produce an unlabelled fixture was to do nothing,
and the validator only said so three steps later once the file was already in
`RECORDED` and the suite was red for what read like a code fault. It writes the
unit each measurement wants beside the measurement, because `expect.metrics` is
compared in the engine's own units and a labeller holding a tape measure has no
way to know that contact height is counted in the player's own standing heights.
And it prints what is left to do, derived from the validator rather than written
out, so a rule added to the gate appears in the list the same day.

The folder is currently empty, and the suite says so loudly: hip–shoulder separation
and shoulder tilt are computed almost entirely from world-space `z`, which the
rig models as exact and MediaPipe emphatically does not, so those two are
unvalidated against anything real until it is not.

**Is the heap flat across repeated analyses?** Object URLs, the extraction
canvases, the pose landmarker and `MediaRecorder`'s chunk buffer are all real
browser objects a Node test cannot see. `src/dev/leakProbe.ts` pushes a blank
recorded clip through the real `analyzeServe` pipeline ten times in a row in a
running browser — same decoder, same object URL lifecycle, same landmarker a
real serve uses — and reads the JS heap between each. Run across ten analyses it
oscillated in a 0.66 MB band with no upward trend, after an initial drop as
start-up buffers freed. It cannot reach `captureThumbnails` or `findBall`,
because both need a serve the pipeline actually finds, and a blank clip is
refused before either runs — the same missing-real-footage block the fixture
shoot and the court trip are already waiting on.

During development, `?demo` renders a report from a simulated serve,
`?demo=live` also mounts the player, `?demo=basket` shows the consistency
comparison, and `?demo=glance` and `?demo=glance-refused` show the two halves of
the on-court screen — so the UI can be worked on without filming anything. **The
routes** are dev-only and are compiled out of a production build.

The rig behind them is not, and should not be: `dev/sampleAnalysis.ts` is also
what the home screen's **See an example report** is built from, so it ships as a
6.7 kB chunk that is fetched only when somebody presses that button. The line
that used to sit here said all of it was absent from the production bundle,
which a build listing disproves in one glance.

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

**What the player did is stored apart from what the camera measured.** A report
is the camera's record and nothing in it is a claim about the person holding the
phone. A drill marked as done is the opposite, and it lives in its own store for
three reasons that agree: correcting the handedness or tapping another serve
re-runs the pipeline and files a fresh report, which would erase a field sitting
on that row; preserving it instead would mean reading a row of keyframe images
back before every save, which is the cost the pruning was rewritten to stop
paying; and a note that somebody did a drill in March has no reason to be deleted
when the report that suggested it is pruned. It rides along in an export, merged
newer-wins per record so two phones each keep what the other never saw, and a
history with none of it behaves exactly as it always did.

**What one analysis holds, and it is not what a stored one holds.** The two
budgets have opposite shapes and reading either as the other is how somebody
optimises the wrong thing. In memory the sampled frames dominate: 120 frames of
33 landmarks twice over is 1.1 MB against 0.3 MB of stills, and a swept basket of
eight serves is about 11 MB. In storage there are no frames at all — a saved
`Session` is `Omit<Analysis, 'frames'>` — so nearly all of it is stills, which is
why pruning drops pictures before numbers.

A landmark costs about 120 bytes to hold four numbers that are 32 bytes, because
V8 boxes each double rather than storing it in the object. That constant is
measured on every test run rather than asserted, and the suite prints the whole
accounting. The canvases turn out to be the smallest thing in the pipeline: the
ball pass runs 256 px wide and the stills 420, both scaled down, so 4K footage
does not enlarge them.

`footprint.ts` counts what is on the JavaScript heap, exactly, and names what it
cannot see rather than estimating it — the decoded video the browser holds, the
WASM heap with its 9 MB model, and the GPU-side copies of anything drawn. So the
headline is bounded on one side only: the JavaScript half of an analysis is
around fifty times under the ceiling this app is held to, and everything that
could breach it is in that unseen list.

**The two numbers that bound the largest allocation now have names.** How many
frames one serve is extracted at was a module-private constant, and how many
serves a clip is broken into was a default argument — so the product of the two,
which is the biggest thing the app ever holds, was written down in one place and
understood in none. Both are exported, and a budget test computes the worst case
the constants allow *from those constants* rather than from a copy. Raising
either is what turns it red. The budget itself is a ratchet at about six times
today's worst case, not the device ceiling divided by something: nobody has
measured a phone, and three of the largest things in an analysis are unreachable
from script, so a split would be arithmetic dressed as evidence.

**History is bounded, numbers before pictures.** Nearly all of a stored report's
size is its six keyframe stills, and those are the part nobody revisits after a
few weeks — while the measurements are what the trend chart and the practice
advice are built from. So the stills are dropped from older reports first and the
numbers survive much longer, which is the opposite of deleting whole reports
oldest-first. If the browser refuses a write because storage is full, the app
frees space and retries rather than silently losing the serve you just recorded.

**What one stored report actually costs.** Measured rather than guessed: a real
keyframe still — JPEG at quality 0.72, 420 px wide, with the tracked skeleton and
callouts drawn onto it, the shape `captureThumbnails` actually writes — runs
27–80 KB depending on the clip's aspect ratio, cheapest on a landscape clip and
costliest on a portrait one. A stored report is six of those plus roughly 15 KB
of everything else a `Session` carries, so one report is **179–494 KB**, stills
still nearly all of it. `KEEP_STILLS = 20` reports keep theirs; the rest, up to
`MAX_SESSIONS = 60`, keep only their numbers at about 15 KB each — so a full
history is **4.2–10.5 MB**, and which end of that a player lands on is decided
by their camera orientation, not by anything the app does. The pressure ladder
that enforces those two limits — routine pruning after every save, then
stripping stills across the whole history, then deleting the oldest reports
outright — is driven by a test now rather than trusted: `storage/db.test.ts`
exercises `planPrune`'s selection at every boundary the three levels create.

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

**A report that could not be saved says so.** `saveSession` frees space and
retries before giving up — stripping stills across the whole history, then
deleting the oldest reports — but a device that is still out of room after that
used to fail silently: the report stayed on screen looking saved, and the only
sign anything was wrong was its absence from the history weeks later. The report
screen now carries a warning when that happens, telling you to export or free up
space. Importing a backup has the same honesty: a report that will not fit is
counted apart from one that was already on file, because the two need different
advice — an up-to-date report needs nothing, one that failed to save is worth
freeing space and importing again for.
