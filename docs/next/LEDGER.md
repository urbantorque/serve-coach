# The Next programme: ledger

The plan is `HANDOVER.md` beside this file. This page records what each item
turned out to be and how it was proved, one line or a short paragraph per item,
newest at the bottom of each wave. A measured "not adopted" is a result.

Branch `next/premium`, cut from `master` at `e8bf74c` on 2026-11-16.

## Wave 0. Ground

- [x] **N0.1 Branch and baseline.** `next/premium` from `e8bf74c`. Baseline gate
  on the untouched tree: typecheck, eslint, build and tests green. After wave 0: all four green again, 2,246 checks across 171 suites after N0.4.
- [x] **N0.2 Old ledgers archived.** `ROADMAP.md`, `LOOP.md`,
  `ANALYSIS-REVIEW.md` and `NOTCH-REVIEW.md` moved to `docs/history/` with git
  history kept. No test reads them by path; source comments cite them by name,
  which `STATUS.md` already resolves to that folder, so the comments stand.
  `STATUS.md` now points at this ledger and the handover.
- [x] **N0.3 Shots at three sizes.** `scripts/lift-shots.mjs` takes
  `SIZE=phone|tablet|laptop` (390 x 844, 820 x 1180, 1440 x 900). Baseline in
  `docs/lift/next-before/`, `-tablet/` and `-laptop/`.
- [x] **N0.4 Dead modules removed.** `vision/detector.ts` (455 lines, "types and
  stubs only") and `vision/outbound.ts` (290, a smear detector nothing called),
  with their two test files (561 lines). `reachable.test.ts` drops their five
  refusal values and two sources. `analysis/invariants.ts` was on the list and
  is kept: it is the rig's invariant set, read by two test files, so it is test
  infrastructure rather than dead code.

## Wave 1. Design direction

- [x] **N1.1 Three directions on a Claude Design canvas.**
  https://claude.ai/artifact/TkMaXg3ryFfDYXykfGA3HN (private to the owner).
  Each direction shows a landing page (1440, fluid), the desktop review
  studio (1440 x 900) and the phone report (390 x 844), on real frames of an
  openly licensed amateur serve (`Saque_con_pelota`, CC BY-SA 3.0) and the
  app's own lit figure. A: Floodlit (today's dark and lime, raised, Archivo).
  B: Daylight (cool off-white, court blue, Geist, footage on dark stages).
  C: Broadcast (off-black, signal orange, condensed type, telemetry on the
  clip). Prices are placeholders; scores and angles are sample values.
- [x] **N1.2 The owner chose A, Floodlit** (2026-11-16). `DESIGN.md` is
  rewritten whole around it: the identity kept and raised, a laptop grid
  (rail, `--wide` 1280, two panes with `--aside`), breakpoints at 768, 1024
  and 1280, the review studio, the landing page, and a type floor. No colour
  changed, so `styleTokens.test.ts` and `contrast.test.ts` stand as they are.
- [x] **N1.3 The type floor.** 213 font sizes under 15 px across 16
  stylesheets moved up: 11 to 13 px to 14, 13.5 to 14.5 px to 15. Three
  signposts went to 15. `wordsInChrome.test.ts` now fails under 14 px (was
  11) and holds the tracked signposts at 15 (was 12). Walked all 30 phone
  states before and after: page heights moved by at most 0.1 screen, no
  horizontal overflow at 375 px on the live report or Progress, and the
  console said nothing new.

## Wave 2. Trust foundations

Findings checked against the code before work starts:

- STATUS's "every engine score is capped until real players are read" has no
  code behind it. No cap exists in `confidence.ts`, `verdict.ts` or
  `analyze.ts`; the only caps are the four-drill cap and the sweep cap. The
  score is shown uncapped. This feeds N2's "rethink the headline number".

## Wave 3. A website, not a phone page

- [x] **N3.1 Every screen has an address.** `lib/routes.ts` names one per
  screen (`/`, `/progress`, `/serves`, `/serve/<id>`, `/sample`,
  `/practice/<id>`, and `/report`, `/reading`, `/glance`, `/problem` for the
  screens that hold a clip) and sets the tab's title. The address is replaced,
  never pushed, so `backStack.ts` still owns the history and back still closes
  what is on top. Loading an address opens its screen: Progress and every
  serve at once, a stored serve, the sample and a practice session from
  storage, anything unknown on Today. Not a router library: the screen still
  lives in `App.tsx` state, which kept the change to about 50 lines and left
  `screenFlow.test.ts` true. `routes.test.ts` walks every screen there and back
  under `/` and a sub-path base. Walked in the browser: Progress and back,
  `/serves`, `/sample` and back, a stored serve reloaded at its address, and
  an unknown id landing on Today.
- [x] **N3.2 A laptop layout for Today, Progress and the first run.**
  `styles/wide.css`, the one home for screen layouts at 768 and 1024 px. From
  1024 the bar becomes a side rail with Film at the top, the column widens to
  `--wide`, Today puts the next session beside the week, Progress puts the
  shape of the serve beside the records and flows its sections in two
  columns, and the first run puts the figure beside the promise. Phone is
  untouched: all 30 phone states measure as before. At 1440 px Today went
  from 1.3 screens to 1 and Progress from 3.4 to 2.3.
- [x] **N3.3 The report as a review studio on a laptop.** The player's clip
  holds the left pane, sticky, while the number, the fix, the one action and
  the depth scroll on the right. The action bar sits under the fix instead of
  floating at the window's foot, and the hero's picture shrinks to a backdrop
  because the clip is already big. Reports went from about 3 laptop screens
  to 2.3. Gate green, 2,251 checks.

- [x] **N3.5 The practice session in two panes on a laptop.** The session's
  numbers and headline held on the left, its fixes, every serve and the rest
  on the right, the same pattern as the report. CSS only, phone unchanged.

Not wide on purpose: the glance, which is read on court from a phone. Left
for wave 5's rebuild: sheets (centred modals) and charts whose SVG labels
grow with the column. The first run still says "on this
phone" on a laptop; the landing page (wave 6) takes that line.

## Wave 2. Trust foundations, first slice

- [x] **N2.1 A test-retest bench on real footage.** `retest.html`,
  `src/dev/bench/retest.ts`, run by `node scripts/retest.mjs` into
  `docs/next/bench/retest.json`. It finds the serve's window on an openly
  licensed amateur clip, re-encodes that stretch through a canvas in the
  browser (a plain copy as the control, then darker, a step further back, at
  60% of the pixels and 1/40 s later) and reads every copy whole. Two runs,
  twelve changed copies of two serves (`Saque_con_pelota`, `0SAQUE`;
  `Saque_reves` was not taken for a serve). What it found, against the
  control:
  - **The faults are stable**: the same set of detected faults on 12 of 12.
  - **The headline mostly holds, the gates do not**: "Work on this next"
    named a different fix on 4 of 12, but 3 of those 4 had a refusal on one
    side (a refused copy takes its headline from a different path). Where
    both copies were measured, the fix changed on 1 of 9 (`Saque_con_pelota`,
    1/40 s later).
  - **The score moves about 5 points** (root mean square), and every changed
    copy scored lower than the plain one: worse footage reads as a worse serve.
  - **Heights move far past their stated noise**: per read, racket drop depth
    8.2 times `CARD_NOISE_SD`, contact height 5.2, leg drive 2.6, release
    height 2.3. Knee bend, load ratio and hand under elbow 1.3 to 1.6. Arm
    extension and shoulder tilt stayed inside. The heights share a ruler (the
    stature read off the same frames), which moves with the picture.
  - **The gates sit on a knife edge**: the same change to the same stretch,
    recorded afresh on each run (the canvas recording is not frame-exact), was
    refused as too blurry on one run and measured on the other, both ways;
    and a plain re-encode of `0SAQUE` was refused as too short. Both gates
    are hard thresholds with no margin (`triage.ts` `LIMITS`: three captured
    samples from drop to contact, a blur score of 0.75), and a 30 fps swing
    sits right on the first.
- [x] **N2.2 Real footage's noise, measured and not adopted.** `RETEST_SD` in
  `cardNoise.ts`. Used as the floor under the player's usual, a basket's
  wander and a new best, it failed eight checks that prove a real change is
  still found (a wandering basket, a racket drop's first best, a lower
  contact). Two 320 x 240 clips overstate a 1080p phone, so it waits for
  sharper open footage through the same bench. Nothing reads it yet.

- [x] **N2.3 Correction: a third of the bench's copies were broken, and two
  "findings" were the bench's own.** On 2026-11-19 the copies the bench had
  saved as failures turned out to be about 0.17 s long (18 KB): the canvas
  recording had stopped early on a machine busy with other work. Every
  refused and collapsed copy in N2.1's runs was one of those, so **N2.1's
  claims about the gates flipping and the headline changing are withdrawn**.
  The bench now reads every copy back, retries a short one up to three times,
  and reports it as short rather than reading it. A second wrong turn, kept
  here so nobody repeats it: a fresh page once read a saved copy as measured
  and a page that had read another clip first read it as "not a serve", which
  looked like the pose tracker carrying one clip into the next. A blank-frame
  reset was built for it, then reverted when a fresh page without it gave the
  same "not a serve": three reads a page had not been enough to tell.
- [x] **N2.4 What the whole copies show (two more runs, 2026-11-19).** With
  every copy whole:
  - **Saque_con_pelota is stable**: measured on all ten copies, the same
    faults, the score within 3 points of the control.
  - **0SAQUE sits exactly on the frame-count gate.** On the original file its
    racket drop and contact are three captured frames apart at 30 fps (36.28
    and 36.37 s), and `LIMITS.swingSamples` is three. Copies that lose one
    frame at the drop (the hand is below the shoulder for one or two frames
    only) fall to two and are refused, deterministically: one saved copy gave
    the same refusal on two fresh pages, three reads each.
  - **When the dip is smeared away, the drop is put in the wrong place and
    nothing says so.** The copies that "passed" with 13 to 15 swing samples
    had their drop near the trophy instead, so their drop-to-contact timing
    is several times too long, with full confidence. That is the honesty
    finding of this wave.
  - The heights still move past `CARD_NOISE_SD` on 0SAQUE's copies; whether
    that is the stature ruler or the misplaced drop is not yet separated.

- [x] **N2.5 On 0SAQUE the app never reports the real drop (KNOWN).** The
  bench now logs where each copy's drop landed. The copies that saw the dip
  found it 0.08 to 0.10 s before contact, and sat on or under the
  frame-count gate (two or three samples). The copies that lost it put the
  drop **exactly on the trophy**, and a drop on the trophy is read as a
  racket that never fell: the card says "Racket never falls" at the floor
  score and the diagnosis names a shallow drop. So on this serve the player is
  either refused or told a fault that did not happen. The guard
  (`sawTheDrop` in `diagnose.ts`) asks whether the wrist was visible and
  whether the swing went into the lens; neither catches a dip one or two
  frames long. `dropUnseen.test.ts` reproduces it on the rig (the dip erased
  from the picture, the world motion kept) and pins today's answer as KNOWN,
  beside two guards: a clean rig serve finds its drop 110 to 230 ms before
  contact at 25 to 120 fps, and a racket held high is still one that never
  fell. A first fix, flagging a drop found further than 0.31 s from contact,
  was built and reverted: the lost drop lands on the trophy, not there.

- [x] **N2.6 "Never fell" now needs a camera that could have seen a drop.**
  The saved trophy-landed copies showed two ways the dip goes: `smaller`
  lost the one frame that held it (wrist visibility 0.00), `darker` lost
  none and the hand simply rises to contact. `dropEvidence.ts` now holds the
  one question both the card and the diagnosis ask, and adds a third test to
  the two the diagnosis had: no frame lost in the last 0.31 s before contact.
  Where the drop sits on the trophy and could not have been seen, the card
  withholds the depth (it used to say "Racket never falls" without asking)
  and the diagnosis gives the depth and elbow-lift signals no weight, so no
  shallow drop is named. On the real copies: `smaller` withholds the depth and
  names nothing, the control reads its real drop ("Hand below the shoulder"),
  and `darker` still says the racket never falls, pinned as KNOWN. On the rig:
  a lost frame withholds, a racket held high and seen in every frame is still
  told it never falls, and every clean serve finds its drop 110 to 230 ms
  before contact at 25 to 120 fps.
  The cost, measured: on the modal club serve, takes that lose a frame where
  a drop lives now withhold the row, so the swing moves a point further
  between takes. `REAL_CHANGE` re-derived from the suite's own 90th
  percentiles: swing 5 to 6, trip 8 to 9, and load ratio's three-a-side
  floor 18 to 19 (one and two a side unchanged). A change in the swing area
  now needs one more point before Progress calls it real.

- [x] **N2.7 The frame-count gate refuses at one sample, not two.**
  `LIMITS.swingSamples` 3 to 2. At two, every reading timed across the swing
  already sits at 0.4 confidence, under the 0.55 soft line, so it is hedged
  with "film in slow motion to sharpen this" and never leads, and the
  sequence's confidence is already nothing; the rest of the card reads as
  ever. The case for it is the bench: the copies refused at two were the ones
  that had caught the real drop. Two runs over both clips with N2.6 and this
  in place: **all 20 copies measured, none refused** (it was 3 to 4 of 10
  refused or failed a run before). `triage.test.ts` holds two as read and one
  as refused.

What those 20 copies still show:
- **Where the drop lands is now the main instability.** 0SAQUE puts it
  0.09 to 0.14 s before contact on the copies that catch the dip, and on the
  trophy (0.44 to 0.54 s) on the rest, about half each. Saque_con_pelota
  spreads from 0.28 to 0.48 s, several on the trophy too. A drop on the
  trophy with no lost frame still reads as a racket that never fell
  (the KNOWN case), so this is frequent at 30 fps, not one clip's quirk.
- The score moved 1 to 9 points between copies (0SAQUE's smaller copy 9),
  most of it following where the drop landed.

Next in this wave, in order:
1. **The smeared dip, now known to be common.** At 30 fps a drop on the
   trophy cannot be told from a drop the picture lost unless a frame is
   missing. Candidates, each to be proved on the rig and on the saved copies:
   grade "never falls" only above about 45 samples a second (slow motion or
   60 fps) and withhold it below; or look for the drop in depth as well as
   height before calling it absent. The first is simple and honest; the
   second keeps more 30 fps readings.
   Checked and set aside on 2026-11-19: the hand hanging under the elbow as
   evidence of a drop. On the saved 320 x 240 copies the hand reads above the
   elbow almost throughout, drop or not, so it separates nothing here. With
   N2.6 in place, 0SAQUE's trophy-landed copies now withhold the depth (a
   frame lost, or the wrist seen poorly); Saque_con_pelota's still says the
   racket never falls, and nothing on hand says whether that player keeps it
   up. Ground truth, not another heuristic, is what decides this one.
2. **A stature ruler that holds**, then re-run the bench for the heights.
3. **Sharper footage**, then decide `RETEST_SD`.
4. **Other browsers**, once the owner agrees to the install.

- [x] **N3.4 The app names the device it is on.** `lib/device.ts`: a coarse
  pointer on a small screen is a phone, on a larger one a tablet, anything
  else a computer. Twenty-nine player-facing lines that said "this phone" or
  "your phone" now say the right thing on a laptop ("Your video never leaves
  this computer"); the three filming instructions keep "phone", because the
  camera is a phone whatever the reader holds. In Node it answers phone, so
  every locked line reads as before; `cardCopy.test.ts` now reads template
  strings too. Checked in the browser on the first run.

Sources looked for on 2026-11-17, for items 4 and the wave's "does the score
know a good serve from a poor one":
- **THETIS** (Gourgari, Goudelis, Karpouzis and Kollias, 2013): 55 players,
  beginner to intermediate, 12 shots including flat, kick and slice serves,
  three takes each, as RGB video with Kinect depth and 2D and 3D skeletons.
  The skeletons are a truth of sorts for the real pipeline, and the three
  serve types are a check on `SERVE_TYPE_SHIFT`. Its licence was not found
  in secondary sources: the owner should confirm it on the dataset's own site
  before anything is fetched (`docs/next/OWNER-STEPS.md`). Its secondary
  summaries disagree on whether expert players are included.
- **Wikimedia Commons**: no HD tennis serve video under CC BY or CC BY-SA
  turned up in a web search. A direct Commons category search by the owner,
  or a licensed clip of their own, is the next route.

## Wave 6. The commercial surface, first slice

- [x] **N6.1 What a first-time visitor reads under the promise.**
  `FirstRunMore.tsx`, loaded lazily after the first-run hero, so a phone's
  first screen and the entry chunk are what they were. Three steps of how it
  works, "I tell you what I cannot see" (graded against published serves,
  shown and never graded, a likely range for speed, hedged or left out where
  the camera cannot support it), the privacy promise, and the sample report
  again. Only what the app does today: no prices and no programmes it does not
  have. Three steps across and the honesty list beside its headline on a
  laptop; one column on a phone. A line that promised a missed racket drop is
  never called a fault was cut before commit, because the smeared case
  (N2.5, KNOWN) still is.

## Wave 4. Product depth

- [x] **N4.1 Two serves side by side, in motion and phase for phase.** The
  report's side-by-side (you beside a model serve, your best or your last)
  showed one still at the fix's moment. It now has a phase strip to set both
  bodies at any moment, and Play both, which runs the two serves together on
  one shared timeline: `lib/figure/syncPhases.ts` pins each serve's phases to
  the same instants and lets each run at its own pace between them, so both
  reach the trophy, the drop and contact at once and what differs is the serve,
  not its tempo. Four seconds a play-through, ending on contact; no playback
  under reduced motion, where the phase strip does the work. The ticks and
  crosses show only at the fix's own moment. `syncPhases.test.ts` holds every
  phase landing on its own frame, no running backwards, and a missing phase
  skipped. Walked on a phone (plays, pauses, lands on contact, the strip
  scrolls inside its own width) and on a laptop in the studio's right pane.
- [x] **N4.2 The commonest fault gets a demonstration.** "Your tossing arm
  comes down early", the headline on most of the sample serves, had no moving
  picture; it now has the rig's fault beside its fix (`tossArmHold` 0.3, at the
  drop, the tossing hand painted). Eight of the eleven named faults now
  demonstrate. Contact behind was tried at 0.5, 0.7 and 0.9 m and left out:
  the engine names it only from a side view with the net's direction certain,
  the demo serve is not one, and `faultDemo.test.ts` refuses a demonstration
  of a fault the read would not call on the same serve. Posture collapse and
  an early shoulder turn need a part the figure cannot paint yet.
- [x] **N4.3 A pathway for a second serve that goes in.** A third kind of
  goal beside a fault and pace: "Get more second serves in", for the double
  faults a UTR 2 to 6 player loses matches to. The first goal read off where
  the ball went, and only ever off the player's own taps: `secondServe.ts`
  counts each trip's second serves tagged with where they landed (at least
  eight a trip), and a goal is reached when a later trip's share is clearly
  higher, by a one-sided two-proportion test at 95% with a continuity
  correction. Without the correction a dozen serves a side called 6.5% of
  unchanged pairs better; with it under 5%, which `secondServe.test.ts` holds.
  Offered once a trip has enough tags; its weeks walk the plan's toss ladder
  (or its first fault), closing on a row that asks for second serves tagged;
  Today's check asks for the same; its note says the counts are the player's
  own; reaching it is a moment ("9 of 10 second serves in, from 3 of 10. By
  your own tags."). 3 of 10 to 9 of 10 reaches it; 5 of 10 to 7 of 10 does not.
- [x] **N4.4 Record a whole practice in the app (the old N1.10).** A single
  serve is recorded into memory and capped at 90 s; a basket is ten or twenty
  minutes, several hundred megabytes, which a phone cannot hold. A "Whole
  practice" switch in the viewfinder's options records a chunk a second
  straight to a file in the browser's private storage (`framing/practice.ts`),
  waits for the last write before closing it, and hands the session reader
  that file, read from disk; a write that fails throws the file away rather
  than hand over a basket with a hole. Capped at 20 minutes, stopped by hand,
  never by the one-serve auto-stop. Offered only where the browser can write
  such a file: an in-memory fallback is the thing this exists to avoid. A WebM
  recorded a chunk at a time says it is infinitely long, which the session
  path refuses, so `webmDuration.ts` writes the recorded length into its
  header (only where there is no seek index to shift; only the header passes
  through memory); Chrome's MP4 already carries it (a 14.7 s practice read
  14.7 s and seeked to the second). `practice.test.ts` and
  `webmDuration.test.ts` hold the order, the timing, the hole and the files it
  must not touch. Walking it found a real bug in the viewfinder: under React's
  development double-mount the first camera request's late `stop()` cleared
  the second mount's "live" flag, so record did nothing in development; only
  a run that was still live clears it now. Not walked past the 150 s session
  line in a browser: what happens after the stop is the existing path for a
  long clip.
- [x] **N4.5 Kick and slice pathways: cut, measured.** The handover asked for
  a pathway each for learning a kick and a slice. Neither has a target the
  camera can read. A slice is its sideways contact and sideways spin, and the
  side-on camera measures neither (`SERVE_TYPES.slice` in `coaching.ts`: "the
  lateral half of a slice is measured nowhere"). A kick is its topspin; what
  the camera sees of it is a steeper shoulder tilt (36 to 50 degrees against
  the flat serve's under 36), while published contact height and contact in
  front are the same as a flat serve's (Vacek 2023, Campbell 2013). A goal
  called "Learn a kick" would be reached by tilting the shoulders, which is
  confident nonsense. What already holds: a player who says they hit a kick or
  a slice has every fault goal read against that serve's own bands, and the
  second-serve goal (N4.3) counts what lands, which is what a kick is for.

## Wave 5. The premium rebuild

Audited first: every state shot at 390 by 844 and 1440 by 900
(`node scripts/lift-shots.mjs`, kept out of the repo at 55 MB) and read against
DESIGN.md, the taste skill and the dataviz skill. The type floor already held
(no size under 14 px anywhere) and the report's first screen already answers
its three questions in one phone screen, so the round went to what the shots
showed was wrong.

- [x] **N5.1 The lit figure is never a wireframe, and the model serve shows
  once.** `drawSkeleton` painted the wireframe's head ring and joint dots on
  top of the lit figure wherever it drew one, so the model serve, the fault
  demonstrations and the filming guide's model had white dots on their
  joints: the skeleton DESIGN.md bans as a main image. The figure now paints
  alone. The example report showed the model serve twice (beside the player's,
  phase for phase, since N4.1, and again looped further down); the second goes
  where the first shows (`render.test.ts` holds both). The "An example, not
  your serve" tag laid over the picture, which sat on the racket, is gone: the
  title and the note under the headline already say it.
- [x] **N5.2 No screen is a phone column on a dark field.** The glance on a
  laptop centred its reading, pushed its taps to the left edge and stretched
  "Record another" across the screen; it now has two panes, the reading on
  the left and the taps and the one action on the right. An empty Progress was
  one sentence floating a third of the way down: it now says what a second
  serve unlocks (each line a section the full screen has) and, on a laptop,
  sets the model serve beside it as one exposure, labelled "Not yours", a still
  because nothing loops off the first run and the waiting screen. The first
  run said "your video never leaves this phone" twice and ended on a second
  name for the sample report; it now ends on the same two choices it opens
  with, under the same names, and its privacy section says what the top line
  does not.
- [x] **N5.3 The shared poster's racket clears its header.** The poster sized
  the body to the stage and forgot the racket, which at contact sits about
  0.42 of a body above the hand, so a tall reach swung it through the "Serve
  Coach" mark. The figure is now measured with the racket and shrunk until it
  clears the header. Looked at as a 1080 by 1350 card: the exposure, the score,
  the speed with "about" and "no radar", the fix, and nothing touching.
- [x] **N5.4 Progress charts read against the dataviz checks.** Serves a week
  printed a number over every bar, drew an empty week as a stub that read as a
  small count, and had no dates: it now labels only this week and the busiest,
  draws an empty week flat on the floor, adds a hairline for a usual week with
  its key in the axis row, dates the axis, gives every bar its count on hover,
  and lists every week in its text alternative so a hover is never the only way
  to a number. First and second serves drew one bar on a filled track when only
  one serve had landings tagged: a one-bar chart, beside a sentence that
  already says the number, so the bars now need two rows. The score ribbon's
  markers grew to 8 px and a mouse reads a trip by hovering, not only by
  pressing.
- [x] **N5.5 Error screens on a laptop are one block.** A phone keeps a
  problem screen's actions at its foot, under the thumb; on a laptop that left
  the words at the top and a 1,200 px button at the bottom with nothing
  between. The crash screen and "I could not read that one" now hold the
  message and its actions together in the middle of the height, the button at
  a button's width.
- [x] **N5.6 The shared clip builds the poster.** The clip played a small
  figure high in an empty frame, swung its racket off the edge (and, in a
  then-and-now, into the other body's half), landed its number on the racket,
  and ended on a frozen pose rather than the exposure the poster is. It now
  plays the swing slowing into the ball (four tenths of real speed at the
  start, a sixth at contact, the body blended between tracked frames so the
  slow part glides rather than steps), lays down its traces and the racket's
  path as it goes, names each moment as it passes, stops at contact as the
  poster's exposure, and counts the number up as the poster's words land. Its
  last frame is the poster at two thirds, drawn by the same functions
  (`swingClip.test.ts` holds the words identical). A then-and-now sizes the
  pair, racket and all, inside their own halves and under the header, at one
  size, and says when either is a rough read. Both feet now name the device
  the serve was measured on, where the poster said "phone" on a laptop.
  Recorded for real in Chrome: two 720 by 900 MP4s of about 8.5 s, finite and
  seekable, each ending on the poster.
- [x] **N5.7 Today on a laptop is two full panes.** The right pane was three
  numbers over a dark field beside the goal, the last serves stopped two
  thirds of the way across, and two notes trailed at the foot. The notes now
  sit with the numbers beside the goal, and the serves run the width.
- [x] **N5.8 A sheet on a laptop is a dialog.** Settings and every other sheet
  rose from the bottom edge with a grip a mouse cannot drag and ran off the
  foot of the window. On a laptop they now sit in the middle, every corner
  rounded, scrolling inside. Settings told a laptop that "only a file survives
  a lost phone"; the line names the device it is on.

## Wave 6. The commercial surface, the rest

- [x] **N6.2 The static host's headers, proved on a real read.**
  `public/_headers`, in the format Cloudflare Pages and Netlify both read: a
  content security policy that lets a page load only from its own origin
  ('wasm-unsafe-eval' so the pose models compile, no JavaScript eval, no
  framing), the camera as the one device feature a page may ask for, nosniff,
  hashed builds kept for a year and the page and service worker always asked
  for. `vite preview` now answers with the same file (`lib/hostHeaders.ts`),
  so a preview of a build is the host. Proved there: the bench clip read to a
  report and then read in full with the sharper swing model, and the browser
  refused nothing. Cross-origin isolation is in the file ready and switched
  off, word for word what the dev server sends when asked, because M1.1's
  measurement still stands; `isolation.test.ts` now holds that instead of the
  file not existing. Cloudflare Pages is the host the rest of the wave is
  written for: static files, this header file, and small functions beside them.
- [x] **N6.3 A public accuracy page, privacy, terms and credits.** Four
  pages at `/accuracy`, `/privacy`, `/terms` and `/credits`, one lazy screen
  (`screens/InfoPage.tsx`), linked from the first run's foot, from under its
  "I tell you what I cannot see" list, and from Settings. The accuracy page
  ("How sure I am") is built from the tables the app grades with
  (`lib/accuracy.ts`), so it cannot drift: for each of the fourteen measured
  readings, how far it moves when the same serve is read again
  (`CARD_NOISE_SD`), what two small, dark public clips moved it where that was
  more (`RETEST_SD`, measured and not adopted), how often a serve held at the
  middle of its band keeps its grade (the band rule worked out, rounded down,
  never above 99: arm extension, the one known short band, keeps it 91 times
  in 100), and the source each band rests on. Then the three ball readings,
  graded with nothing measured under them; what is shown and never graded;
  how I know, including that the noise is a floor and that it proves
  steadiness, not agreement with a lab; and what I cannot see. Privacy and
  terms say only what the app does today, in its own voice, short enough for
  the copy lint; the operator's name and a contact address come from the build
  (`lib/site.ts`) and are left out until the owner sets them. Looked at on a
  phone and at 1440, where the title and the list of pages hold the left pane.
- [x] **N6.4 Free and Plus behind one gate, shut until paid plans exist.**
  `lib/plans.ts`: seven paid features (the full breakdown, side by side, the
  plan in steps, whole practices, speed over time, the coach's page, and the
  history past the newest five) and one `can(feature)` every screen asks
  through `useCan`. Free reads every serve, gives the score and the top fix
  with its drill, the whole breakdown on the first serve, and the five newest
  serves to reopen; the sample report is always whole. With the gate off,
  which is how the app ships until the owner sets `VITE_PAYMENTS`, `can` says
  yes to everything, so nothing locks before there is a way to pay; in
  development `?paywall` shows the gates and `?plan=plus` the paid side. Each
  paywall (`components/Locked.tsx`) stands where the feature was and shows
  what is behind it on the player's own data: their five area scores and how
  many fixes follow, their moment beside a model's and their best score, their
  goal and its steps, their fastest serve and how many trips have a speed,
  how many older serves are still on the device, how many serves a practice
  holds. A `/pricing` page ("Plans") sets free beside Plus and says plainly
  that everything is open while Plus is not on sale; a price shows only when
  the owner sets `VITE_PRICE_LINE`. `plans.test.ts` holds every answer `can`
  gives and that every feature is gated somewhere. Looked at with the gate on
  and off, on a phone and at 1440: off, no screen has a paywall.
  The entry chunk went over its 130 kB budget by 0.38 kB, so the plan copy
  moved out of the gate's module and Today loads the panel lazily; it is
  129.91 kB, inside by 0.09 kB, so the payment client (N6.5) loads lazily too.
  The pricing page's classes were renamed after a check found `.plan` already
  styled the report's drill list.
- [x] **N6.5 Paying for Plus, built to be switched on.** Stripe Checkout for
  a subscription, and no database or account: when a payment goes through,
  the server signs a small Plus pass (which subscription, and until when) with
  a key only it holds, and the app checks it on the device against the public
  half built into it (`lib/billing/pass.ts`, ECDSA through Web Crypto, so one
  module signs on the host and verifies in the browser). Four routes in
  `src/server/payments.ts`: a checkout, claiming the pass on the way back,
  renewing it near its end against what Stripe says now, and Stripe's own
  billing page to change a card or cancel. They run unchanged as a
  Cloudflare Pages function (`functions/api/[[route]].ts`), under test, and on
  the dev server against a stand-in for Stripe (`VITE_PAYMENTS=mock`,
  `server/stripeMock.ts`: its own checkout and billing pages, a throwaway key
  pair per run, no account, no key and no money). Plus reaches another device
  through a link whose pass rides in the address's fragment, which no server
  sees. Walked in a browser against the stand-in: Today's paywall, the plans,
  the checkout, paying, back on the plans with Plus to 19 December, every gate
  on Today and a report open, a reload, the billing page and cancelling (Plus
  runs to the period's end), the link on a second device, and a forged pass
  refused with Get Plus offered. `payments.test.ts` runs the same flow and
  every refusal; `pass.test.ts` holds that a pass cannot be forged or
  stretched; `serverBoundary.test.ts` that nothing the app ships imports the
  server, names its secrets, or loads the payment client unless payments are
  on. The egress scan lists the client's one same-origin call and leaves the
  server out with its reason. Privacy and the terms gain a section each, shown
  only with payments on. Stripe's test mode needs an account and keys, which
  are the owner's (`OWNER-STEPS.md`). The payment start-up reads the build
  setting itself, so a build without payments folds it away: the entry chunk
  is 129.98 kB of its 130, with 0.02 kB left, and the next screen that adds
  to it either takes something off or spends the one re-baseline the
  handover allows.
- [x] **N6.6 The landing page sells what it does, and search engines can
  read it.** The first run's long page gains a pricing section ("Free to read
  every serve"): what free keeps beside what Plus adds, the price only when the
  owner sets one, and, while Plus is not on sale, that everything is open; on
  a laptop the words sit beside the two lists rather than over a dark half.
  It already links how sure I am, privacy, terms and credits (N6.3).
  `index.html` no longer tells a laptop its video stays on "your phone", and
  carries a share title and card type. `lib/siteMeta.ts`, built into the page
  by `vite.config.ts`: with `VITE_SITE_URL` set, a canonical address, the
  preview picture's absolute address, a sitemap of the seven pages that stand
  alone and a robots.txt that keeps search engines out of `/api/`; unset, the
  page names no host and only robots.txt is written (`siteMeta.test.ts`, and
  checked in a build with a test address). Each info page sets its own
  description and canonical address while it shows. The preview picture,
  `public/og.jpg` (1200 by 630, 64 kB), is drawn by `scripts/og-image.mjs`
  with the app's own painting code: the model serve as one exposure beside
  the promise, never a photograph. Partly met, on purpose: the handover asked
  for "a real serve read in front of the visitor". The first run plays a real
  serve from the motion capture and offers the sample report, but reading a
  real video on the landing page would download the 57 MB coach before the
  visitor has asked for anything, so it waits for the visitor's own serve.
- [x] **N6.7 The owner's steps to a paid launch, in order.**
  `docs/next/OWNER-STEPS.md` rewritten around what this wave built: agree
  the free and paid split and the price, a Stripe product and price with the
  customer portal on, the pass key pair (`scripts/pass-keys.mjs`, which prints
  and writes nothing), a domain and a git remote, the Cloudflare Pages project
  with each build setting and secret named, Stripe's test mode before live,
  the privacy page and terms read by someone qualified, then live. With the
  two things to know first: a Plus pass is a bearer token, and a cancellation
  reaches the app at renewal. The open measurements (isolation, WebKit and
  Firefox, THETIS, sharper footage, a radar) keep their places.

Wave 6 shipped N6.2 to N6.7 on top of N6.1. Not built, and why: accounts and
synced numbers, which nothing needs yet and which would change the promise
the pages make; a live read of a real video on the landing page (N6.6). The
entry chunk sits at its budget, 0.02 kB inside.
The guidelines pass over the wave's screens found one gap, fixed: copying the
link that brings Plus to another device changed only the button's own label,
which a screen reader is not told; the confirmation now also reaches a polite
live region, checked in the browser against the stand-in.

## Wave 2. Trust foundations, the rest

- [x] **N2.9 Where the player's serves went now orders the plan, past chance
  only.** Finding 6 held: the in, net, long and wide taps reached Progress and
  nothing in the coaching. Now a report reads the player's earlier serves of
  the same type, rubric and serve number, each tagged with where it went, and
  asks of every named fault and every kind of miss whether the serves with
  that fault went that way more often than chance allows (`lib/missLinks.ts`).
  Where a fault this serve shows is linked, it moves up the plan to straight
  after the first fix, ahead of the faults that are not, under a line: "I moved
  this up. It showed on 18 of your 24 serves into the net, against 6 of your 24
  that went in." A linked fault the four-drill cap held back comes in and the
  last unlinked fix goes out, so the plan keeps its length; a rough reading on
  this serve still comes after a firm one. When the first fix is itself
  linked, the same counts sit under its headline. With too few tags, or
  nothing past chance, the plan is `causalPlan`'s word for word, with no line.
  "Past chance" is written down in the module: a one-sided exact test (Fisher's,
  stratified) asked within each sitting and camera view, Holm-corrected across
  every fault and miss asked; nothing before 48 tagged serves, and a pair only
  with seven a side of both splits; then the whole history has to lean the same
  way so the quoted counts agree with the line. The false-positive rate is 5%
  over a player's whole tagged history, not per read: it looks again only when
  the tags double, spending 2.5% at 48, 1.25% at 96 and so on, so the shares add
  to under 5% however long the history runs, and the answer holds still between
  looks. A fault that could not be read on a serve counts as neither with nor
  without it.
  `missLinks.test.ts` (21 checks): 400 players of pure noise tagging 384 serves,
  read at every look, ever saw a link 1.0% of the time, in steady sittings and in
  sittings that drift. Pooled into one stratum, a drifting season named links in
  22.3% of histories at one 5% look; within sittings, 1.8%. A strong link (a
  fault on half the serves, the net from 12% of serves to 40%) was found 14.8% of
  the time at 48 tagged serves, 31.3% at 96 and 71.8% at 192, against stated
  floors of 10, 25 and 60%; a weaker one (15% to 30%) 1.3, 2.8 and 9.3%: the test
  is built to stay quiet, and it does. On the real engine, 48 rig serves with a
  low contact planted on the net serves turn the plan "tossing arm, legs, low
  contact" into "tossing arm, low contact, legs"; the same serves tagged evenly
  say nothing. The exact test matches Fisher's by hand on the tea-tasting
  tables. `?demo=links` (and `&first`) shows both lines; looked at on a phone
  and at 1440, the console silent. The entry chunk took the two props only:
  129.98 kB of 130.
  **The Bath labels validate nothing here, measured.**
  `npm run bench:mocap -- --outcomes`: 39 labelled serves (20 in, 10 net, 9
  out) from one player, and
  no fault named on any of them from any of the five placements, at the level
  the engine infers or at stated levels 7 and 9 (nor at 60 or 120 fps in the
  plain bench). With no serve carrying a fault there is no table to test; the
  set is under the 48 a first look needs; "out" is not split into long and
  wide; and with no known truth about what sends this player's serves into
  the net, a link found or missed could not be scored anyway. Their one use:
  their mix, about half in and a quarter into the net, set the synthetic
  histories' outcomes.
  Not adopted: moving the first fix. It is the stored verdict the glance,
  Today's week, the drill check and the carry-forward all read, and moving it
  on one screen would make two disagree. A look after every serve: in a
  scratch run, 5% at every doubling already put the lifetime rate at 7.3 to
  8.5%. A first look at 24: a strong link would be found there 3.8% of the time,
  for half the budget. Left: Today's week and the coach's page keep the causal
  order (the week loads with the entry chunk). Found and not changed:
  Progress's `missesInCommon` names a gap at two standard errors across nine
  readings and three misses with no correction between them; its rate on
  noise is not measured.
- [x] **N2.10 A steady toss says which way it was seen.** The handover's
  finding 5: side-on, the angle the filming guide asks for, a toss wandering
  sideways points into the lens, and one 10 cm wobble reads 1 cm (F5, pinned
  in `depth.test.ts`). The card then called that toss "straight up with
  almost no drift", a claim about an axis the camera never saw. No sum
  recovers depth one camera does not have, so the reading now says what it
  covered: side-on, "with little drift towards the net or back. From the side
  I cannot see sideways drift"; from in front or behind, the other way round.
  A drift the camera does see is still named and drilled on its own axis, as
  before (`tossAxisWords.test.ts`: a 10 cm sideways wobble at 82° now says it
  is unseen, the same wobble at 15° is named sideways). The corner band, where
  neither axis beats a coin flip, already says nothing (R80b). Considered and
  not done: a second sanctioned placement behind the baseline. The back fence
  is measured in `CARD_NOISE_SD`, but the live framing check steers a player
  to the side, and teaching two placements on a first afternoon costs more
  than one sentence saying which half was unseen. The entry chunk then measured
  130.06 kB: the coaching tables Today reads carry the new lines. Its budget
  was re-baselined to 132 kB, the one move the handover allows, with the
  reason in `bundle.test.ts`; the next move is off the critical path, not up.
- [x] **N2.11 The headline number says what it is, and what nobody has checked.**
  The handover's finding 4: one score whose meaning is unvalidated, and
  STATUS's claim that every score is capped until real players are read has
  no code behind it (the Wave 2 note above). Kept, because it is the one
  figure a player tracks and the report's first screen and the poster are
  built on it; said for what it is instead. The accuracy page opens on it:
  every graded reading against its band, weighed by area into one number;
  read again, the same serve moves it 4 points or fewer nine times in ten,
  so a bigger change is the serve and not the camera (generated from
  `REAL_CHANGE.overall`, one past that 90th percentile, and tested against
  it); and no coach and no ranking has checked what a number means for a real
  player, so it is for setting against the player's own serves, not anyone
  else's. The report's "Tap a word" row gains "Your score", with the same
  facts in one line. Its definition, and every other one in that row, now
  opens against the row, after a look found the last word's box running off
  the right edge of a phone. Leading the report with the change against the
  player's usual was considered: it is already the line under the number
  whenever there is a usual to set it against.
- [x] **N2.12 Level is asked on the first serve, and changes only what a
  source says it should.** The handover's findings 2 and 3: a picked level
  moved a few hand-set ladders, and the rung anchors on palm angle, spine lean
  and elbow lift cite nothing. Its rule is to cite each band shift or leave it
  ungraded, so those three are now flat at the band every player without a
  stated level already gets (rung 5, above the default 4): a player who never
  states a level is graded exactly as before, and the Bath and rig checks that
  each rests on (clean at every rung, the rig's fault named at every rung)
  still hold. The two other ladders that move, hip lead and pronation, name
  no fault at any level. What level does change is cited: the order faults
  are worked in, arm before legs at club level and below (Whiteside 2013,
  Reid 2008, L3.9), and through it the first drill. On one serve with stiff
  legs and a racket that never lays back, a still-learning player is sent to
  "Let the racket fall" and a strong club player to "Back-leg serves"
  (`levelReal.test.ts`, which also fails any band that moves with level on no
  study). The level used to be asked only inside the closed "Everything I
  measured" fold; on a player's first serve it is now asked just under the
  first screen, in the picker's own words ("your score is the same at every
  level"), and goes once answered either way. The goal was already asked on
  Today's plan after the first serve and already changes the plan
  (`programme.test.ts`). A UTR 2 and a UTR 6 now get different first fixes
  and drills, and the same targets, which is what the sources support. One
  measured trade, recorded in `triage.test.ts`: the test suite grades at level
  5, which carried an uncited step stricter than the club band, so its
  lower-back warning now catches a gross 40° fold on 88% of takes rather than
  every one, and in exchange the known false warning from behind (4 of 144
  real takes that do not fold) is gone. A first attempt held the three at
  level 5's band instead; the band test refused it, because a Bath serve
  reads 18° and the club band its source rests on reaches 19.
- [x] **N2.13 The measurement records leave the shipped code; the tables stay
  apart, measured.** The handover asked for one band table, one noise table and
  one path from reading to grade, with the prose records moved out of runtime
  code. Done: the twenty records in `UNDER_RESOLVED` and `UNCALIBRATED`, which
  shipped to every player as strings nothing on screen reads, are written out
  in `docs/next/measurement-records.md` (generated from the engine's own values,
  then edited only to drop long dashes). The engine keeps the keys, so
  `depth.test.ts` still refuses a signal measured with no record, and the check
  that holds each stated deviation to what the ensemble measures now reads it
  from the document ("says 5.7, measures 5.7230"). The long comments beside the
  numbers stay where they are: the build strips them, and they are the reason
  each number is what it is. Not done, on reading what they hold: one noise
  table. `CARD_NOISE_SD` is a deviation per card reading, `NOISE_FLOOR` a
  naming floor per diagnosis signal (a multiple of a deviation, raised where a
  measured trade asked), and `CAMERA_ALLOWANCE` how far a phone's placement
  moves a reading; `RETEST_SD` is measured on real footage and not adopted.
  Four different quantities in four tables is not duplication, and folding
  them would hide which one a check stands on. The card and diagnosis bands
  already share one source where they read one number (`cardBand`, L5.1).
