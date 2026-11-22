# The Apex programme: ledger

One line per item, ticked when it lands, with what it turned out to be and how
it was proved. The plan is `docs/apex/HANDOVER.md`; the six areas are A to F.
Newest at the bottom of each wave. A measured "not adopted" is a result.

Branch `apex`, cut from `main` at `b4d0e80` on 2026-11-22.

## Wave 0. Ground

- [x] **A0.1 The baseline.** The gate on `apex` as cut: typecheck, eslint,
  build and 2,359 checks, all green. The `apex-before` shots in
  `docs/lift/apex-before/` (50 files at 390 by 844) and
  `docs/lift/apex-before-laptop/` (48 at 1440 by 900), none failed. The first
  attempt found the dev server down and every shot refused; the server was
  started again and the whole set retaken.
- [ ] **A0.2 The owner's three inputs, asked once.** Their own serves, the
  WebKit and Firefox download, and more licensed footage (handover section 7).

## Wave 1. Truth and the moment

- [x] **A1.1 N2.8's two questions, asked of real footage: the 3D knee
  straightens on one leg, and MediaPipe heavy is no better. Heavy not
  adopted.** `scripts/real-probe.mjs` reads every clip in `bench-data/clips/`
  (and `bench-data/own/` when it exists) with the app's own `analyzeServe` in
  the dev server, keeps every pose sample, and asks inside the serve the
  engine found (ready to contact) how far MediaPipe's 3D knee angle sits from
  the picture's at the deepest picture bend, and whether either wrist jumps
  more than 0.3 of a body height in one frame between the trophy and just past
  contact. `src/lib/pose/devModels.ts` lets a bench page swap in a bigger
  model from `bench-data/models/`; `import.meta.env.DEV` is false in a build,
  so the app always fetches its own. Results in
  `docs/apex/bench/real-probe.json` and `real-probe-heavy.json`.
  - **What there is to read.** Four licensed tennis clips, every one 640 by
    480 or smaller: three measured (`0SAQUE` and `Saque_con_pelota`, side-on
    at 320 by 240; `Blaz_Rola_NCAAs_2013`, from behind the far baseline at
    640 by 480), and `Sharapova_Amelia_Island` refused as not a serve. A
    fifth, `Saque_reves`, was a table tennis serve; it is out of the benches
    and the results (A1.2).
  - **The 3D knee, with the app's model.** On both side-on clips one knee
    agrees with the picture at its deepest bend (2.2 and 3.2 degrees apart)
    and the other reads 19.1 and 13.5 degrees straighter in 3D. On the Rola
    clip, filmed from in front, the gaps are 63 and 19 degrees, but a picture
    angle from the front is not the true angle, so that clip says little.
    This is the same direction as the drawn body (55 degrees straighter in
    N2.8), smaller, and on one leg. The trophy and knee bend stand on the 3D
    knee, so it remains the engine's main suspect; two low-resolution clips
    are not enough to change what it reads.
  - **The wrist at contact.** No arm read hanging down at contact on the side-on
    clips: `Saque_con_pelota` had no jump past 0.3, `0SAQUE` had two on the
    racket wrist (0.34 and 0.41) in the last 0.1 s before contact, which is the
    speed of a real hand there at 30 frames a second. The Rola clip had one,
    on the tossing wrist after the trophy. N2.8's raised-arm failure did not
    show on real footage, on three serves.
  - **MediaPipe heavy, not adopted.** Against the full model on the same
    clips: the 3D knee further from the picture (15.7 to 46.7 degrees
    straighter on the side-on clips), eight wrist jumps on the Rola serve
    where full had one, reads 1.1 to 1.6 times slower, and on `0SAQUE` a
    different serve of the clip chosen. Nothing it read was better.
  - **Next.** Whether the trophy and knee bend should be read off the picture
    when the camera is side-on needs the mocap bench and the retest bench run
    both ways, and real footage sharper than 320 by 240 to settle it: owner
    serves, or more licensed clips (both asked, A0.2).
- [x] **A1.2 Tennis only.** The owner's call: the app is about tennis serves
  and nothing else. `Saque_reves` (a table tennis serve) is out of
  `bench-data/clips/` and its attribution, the clip bench, the retest bench's
  default set and both probe results; two comments that used it as an example
  now describe the failure without it. The app itself already refused it as
  "not a serve", and still refuses any clip with no tennis serve in it.

- [x] **B1.0 The report moment, three takes, on a Claude Design canvas.**
  "Serve Coach: the report moment, three takes" (artifact
  `aab94563-67dd-45e8-9e8d-90c98a49fbfb`): today's report beside A, the held
  frame (the serve stops on the fault, today in coral, the target in lime, the
  score small under the fix), B, four areas in place of one score, and C, the
  change since the player's best serve, each at 390 by 844 and 1440 by 900, on
  a licensed frame ("Blaž Rola NCAAs 2013" by ZooTennis.com, CC BY 3.0). The
  recommendation was A, with C as what A becomes from the second trip on, and
  the owner picked A on 2026-11-22. B is honest only if every area is graded, and
  contact is shown and never graded.
  - **What the canvas gets wrong, found building it.** Take A draws the lime
    target as a redrawn leg on the photograph. The app refuses that for an
    angle measured in 3D (`targetShape.ts`: no image-space construction
    re-measures to a world angle), and A1.1 has just shown the 3D knee
    disagreeing with the picture. On the player's own footage the target is
    the target shape, a diagram in its own plane, captioned "Shape to aim
    for"; only a height fault's ghost (`ghostFor`) may sit on the body.
- [x] **B1.1 The fix shows the shape to aim for, and the held frame plays
  again.** Common to all three takes, so built before the pick.
  - **The shape to aim for under the fix, on a laptop.** `faultMetric`
    (`lib/lookFor.ts`) finds the card row the leading fault is read from (the
    row `faultMoment` already took the held moment from), and `targetDrawn`
    (`analysis/targetShape.ts`) is every reason `TargetShape` withholds a
    figure, now in one place the report and the card both ask. Drawn on 1 of 7
    dialled serves: a low contact; the toss arm, leg drive and clean serves
    have no figure, which is the rule. `heldTarget.test.ts` proves the report
    draws it exactly when the row would, with its caveat, and never inside the
    band or on a soft reading.
  - **Not on a phone, yet.** Under the fix it pushed "What to do now" behind
    the action bar at 375 by 812, undoing N7.8; as a plate on the picture it
    covered the score, and cutting it down would drop the viewpoint line the
    figure must carry. It goes on the picture once the score leaves it, which
    is the design pick. Hidden below 1024 px until then.
  - **The key's swatch was lime beside a coral line**, on every card that
    draws a figure: the line takes the status colour and the swatch did not.
    It does now, so "You" is keyed in the colour it is drawn in.
  - **Play it again.** A glass button on the held frame replays the clip into
    the hold (the stage is keyed, so each press is a fresh reveal), hidden
    while it plays and under a warning, where the picture is short. Proved in
    Chrome on `Saque_con_pelota`: hidden during the replay, the picture moving
    mid-way, and the same held frame after.
  - `?demo=held-target` opens a report led by a low contact.

## Wave 2. The report and the coaching

- [x] **B2.1 The held frame on a phone (take A; the owner's pick, confirmed
  after it was built as the recommendation).** Off the studio
  the picture is the held frame and nothing else, and the score steps down
  under the fix.
  - **The shape to aim for on the picture**, where the score was: the card's
    figure and key side by side on glass, caveat and viewpoint whole, across
    the foot of the picture. The faults that lead with a figure are read high
    on the body (the toss, the contact), so the feet are what it covers.
    Where no figure is drawn, the foot of the picture says what it is held on
    ("Held at the trophy").
  - **The tally**, small under the fix: the score with its verdict, the speed
    with its range and "No radar has checked it" (N7.4), in two lines.
  - **The drill still clears the action bar.** Measured at 375 by 812: 44 to
    68 px clear on the sample, the low-contact, basket and live reports (50 to
    90 before). The picture gave back the height the number took (38 dvh, at
    most 340 px). At 375 by 667 the drill was under the bar before and still is.
  - **Under an injury warning nothing moves:** the short picture keeps the
    number as N7.8 fitted it, and no plate is drawn on it.
  - **The laptop studio is unchanged**: score on its panel, figure under the
    fix (B1.1).
  - `heldTarget.test.ts` now proves the plate is on the picture exactly when
    the row draws a target, the moment line is there when it does not, the
    score is in the tally and not on the picture, the figure is never drawn
    twice, and the short picture keeps its score.
- [x] **C1.1 A guided set.** A drill check is now filmed one serve at a time,
  hands-free, and the app talks the player through it with the phone on a bag.
  - **What it says.** Before the first countdown, the step, the count and the
    cue ("Toss and point, 6 serves. Point at the ball."), and the countdown
    waits until that is said (`speakThen`). After each serve, on the glance,
    that serve against the drill's one fault and the set so far ("Clean, 3 of
    4 clean so far.", or "Not yet, 2 of 4 clean so far. Point at the ball.").
    A serve the engine could not judge for the fault is said to be that and
    counts neither way. When the set has its answer, the result
    (`tripCheckLine`), and the loop back to the camera stops.
  - **One fault only.** Between two serves the score, the speed and the
    report's first fix stay on the screen and are not said: the drill asked
    for one thing.
  - **Every ladder has a spoken cue.** `Progression.say`, six words at most,
    is required by the type, so a ladder cannot ship without one.
    `guidedSet.test.ts` runs every line a set can say, for every step of all
    11 ladders, through the copy lint and a check for characters a voice
    mangles; the lint caught "just" in the toss height cue. It also plays
    whole sets: passed after six clean, ended early after three named.
  - **Proved in Chrome** with a fake on-device voice that logs what it is
    given. `?demo=guided` (four serves in) said "Not yet, 2 of 4 clean so
    far. Let the tip fall behind you." and kept the loop back to the camera;
    `?demo=guided-done` said "Clean on 5 of 6 serves this trip. You have
    passed this step." with no loop. Through Chrome's fake camera, Home's
    session, "Film a check", hands-free: the intro at 17.0 s, "Recording in
    5 seconds" at 20.0 s, then 3, 2, 1, Go. Console clean.
  - **Not built: a read during the recording.** The read after a rep is the
    glance's full read of that serve, not a faster one-fault read off the
    hands-free hand samples. A new measurement read off those samples would be
    untested on real serves, so the glance's normal read is used instead.
    Six in one recording is still a tap away in the viewfinder's options.
- [x] **C1.2 Every drill demonstrated, or measured to have nothing to show.**
  Ten of the eleven ladders now open a moving demonstration (the fault beside
  its fix on the model serve); eight had one.
  - **Contact behind**, watching the ball: met 0.35 m further back, named on
    the demo serve and not on its fix, the ball 0.32 body heights from the
    fix's at contact. N4.2 had left it out when the demo serve could not
    settle which way the net was; contact ahead's floor has since moved (H40).
  - **Posture collapse, seen from behind the baseline.** A demonstration can
    now be drawn from the camera its fault is read from (`DemoSpec.view`).
    From the side the sideways bend runs along the lens (0.035 body heights),
    and the engine does not name it there either; from behind, the head and
    shoulders are 0.15 apart at contact, and the picture says "Seen from
    behind the baseline, where this fault shows." The trunk is painted on the
    figure for the first time, with the upright fix dashed from the same hips.
  - **The early shoulder turn has no demonstration**, measured: at most 0.042
    body heights from the side, behind or a corner, under the 0.1 a player can
    see. A turn about the trunk's own axis needs a view from above, which no
    camera of the player's gives. Arming the ball (retired) likewise.
  - **The rule, as a test.** `faultDemo.test.ts` fails if any ladder has
    neither a demonstration nor a place in `NO_DEMO`, and builds every
    `NO_DEMO` entry from three cameras to hold it under the bar, so the list
    cannot become a way round it. Every demonstration is still named by the
    engine on its own serve, for either hand.
  - **The ball's flight is fitted only for a toss height demo.** Fitting it
    for a ball met at the strings shrank both bodies.
  - Shots in Chrome at 390 by 844 and 1440 by 900 (`?demo=lean`,
    `?demo=met-behind`, then the drill's sheet); console clean.
  - **Not done:** drills cut or added as a coach would. The library review
    still needs a coach's eye on each cited claim, which this round has not
    had.
- [x] **C1.3 A lesson for each fault.** Every drill's sheet folds open "Why
  it matters": one or two costs (pace, reach, clearing the net, the body,
  timing) and what good looks like, for all 11 ladders (`analysis/lessons.ts`).
  - **Cited or marked.** Each claim names its study (`SOURCES`, with the full
    reference and doi) or says "How coaches teach it, not a measurement." 16
    claims cite a study and 8 are marked. Each says no more than its study
    measured: who was studied is in the line ("junior players", "skilled
    servers"), and a figure from another task (the pause that cost a fifth of
    arm speed, measured off the court) is not quoted. Measurements are said in
    body terms ("a hand's width", "a third of their height"), as the copy lint
    asks. A trunk-bend claim from the WTA study was cut: it compared rankings,
    not pace, and was filed under pace.
  - **On the player's own serve.** Under the lesson, the latest earlier serve
    the engine judged clean of the fault: "Your serve on Saturday had this
    right, so your body can already do it." Never a serve it could not judge
    for the fault, the serve itself, or a later one (`ownGood.ts`).
  - **What good looks like on a model serve** is the demonstration above it
    (C1.2).
  - `lessons.test.ts`: every ladder has a lesson and no lesson lacks a
    ladder, every claim is cited or marked, every cited source has a
    reference someone could look up, more claims are cited than marked, and
    all 48 lines pass the copy lint. `ownGood.test.ts` holds the own-serve line.
  - Shots in Chrome at 360, 390 and 1440 wide (`?demo=lean`,
    `?demo=met-behind`, `?demo=lesson-own`), every lesson text at 14 px or
    more, console clean. The rows borrow the ladder's step style without its
    numbers, so nothing reads as an order. That left the split stylesheets at
    20.00 kB gzip, on their budget: the next screen style needs room made first.
- [x] **C1.4 The check that closes the loop.** A serve filmed after a drill
  block is read against that drill's fault first, at the top of its report:
  "After Toss and point, this serve sits inside your usual spread. No change I
  can trust yet, so keep going." (`drillLoop.ts`)
  - **A drill block** is a drill marked done between the last filmed serve and
    this one. It names its fault by its ladder step, or by the card row it was
    logged against.
  - **Past their own noise** is `baseline.ts`'s own test (the player's usual,
    their spread, the camera's noise), asked of the fault's card row. Towards
    the target, away from it, past the spread but inside the band ("a change,
    not a fix"), or inside the spread ("no change I can trust yet").
  - **Said as one serve where it cannot be more:** with too short a history to
    know the spread, or for a fault read off the body with no card row (the
    tray, the elbow, the trunk), the line gives that serve's verdict and says
    it is one serve. A serve it could not read for the fault says so.
  - `drillLoop.test.ts`: the drill names its fault, no drill means no line, a
    drill before the last serve does not count, and each outcome on a
    twelve-serve history with every line through the copy lint.
  - In Chrome at 390 and 1440 (`?demo=loop`, the season with the latest
    serve's drill marked done before it): the line above "Work on this next",
    console clean.

## Wave 2 report

Wave 2 built the held frame on a phone (B2.1) and all of area C: a guided
set that talks the player through a drill check hands-free, ten of eleven
faults demonstrated moving (the eleventh measured to have nothing to show), a
cited lesson for each fault, and the loop check above. Cut: a faster read
during recording, and the coach's review of the drill library. Waiting on the
owner: A0.2's three inputs.

## Wave 3. The loop and the studio

- [x] **D1.1 Backups carry the plan.** A backup moved the reports, the drill
  records, the hand, the level and the serve type, and left the plan behind:
  a paid player restoring onto a new phone lost their goal and every ladder
  step. It now carries the goal, each fault's step with when it moved and
  when it last passed, the cadence and the court time (`portablePrefs`).
  - **Restored on the hand's rule:** what this phone has already decided
    stands, and the file fills only what it has not. Ladders are filled fault
    by fault, so a fault started on the new phone keeps its own step, and a
    nonsense step (negative, fractional, past any ladder) is refused.
  - `backup.test.ts` proves the export and both restores;
    `backupContents.test.ts`'s ruling on `prefs` now names the plan, and it
    is still not personal.
  - **The entry chunk went 1.15 kB over its 385 kB raw budget** with C1.4's
    check in the app shell and this restore. The check now runs in the
    report, which loads on its own (`drillLogs` passed down), and the entry
    is 384.32 kB: under, with less than a kilobyte to spare.
- [x] **D1.2 Progress as one story.** Twenty blocks down to ten for a
  season-long player (`?demo=history`, counted in Chrome at both sizes).
  - **The order answers the player's question.** The typical serve over time
    with its records inside it (what is my serve like now), then and now on
    their own body, the faults serve by serve, and speed (is it getting
    better), then one "What changed" block holding what was fixed, what keeps
    coming back, and what the best serves share.
  - **One fold for the rest.** "Go deeper" is one detail view: first and
    second serves, serves per week, the serve path, the records, the season's
    weakest spot, how the last trip served, the change since the last serve,
    repeatability and the table, each a titled part. It was a heading over
    seven separate folds, with two more open sections above it.
  - **On a laptop** the score panel spans two rows beside then-and-now and
    the faults, and speed sits under it, where it had left a column dark.
  - **Smaller and lighter:** the sub-heads take the subhead style, and the
    dead fold rules came out of the split stylesheets, which pay for the
    one rule spacing the parts.
  - `render.test.ts` holds Progress to one fold; `progressDashboard.test.ts`
    still finds the records under the ribbon and the path one tap away.
- [x] **D1.3 Today answers "is it getting better".** Today's first screen
  said what the serve is like now (the typical score) and what to do this week
  (the goal and the next session), and answered the third question only with a
  chip, which stays hidden when the change is inside the camera's own noise:
  most of the time. It now says it in a line from the second full trip, on
  the six-week milestone's own rule ("6 weeks in, a typical serve scores 79,
  about where you started."; "2 trips in" before a week has passed).
  `progress.test.ts` holds the short form; Progress still waits six weeks.
  Read off the first screen in Chrome at 390 and 1440 for the season player:
  all three answered above the fold.
- [x] **E1.1 The studio: keys, zoom, draw and measure, a still.** On a
  laptop the player under a fresh report gains a row of tools (`Draw and
  measure`).
  - **Keys:** J and L step a frame, K plays and pauses, beside the arrows,
    space and 1 to 6 it had; plus and minus zoom in steps to four times, 0
    resets; Escape puts a tool down. Zoomed, a drag pans, held inside the
    picture. The zoom moves the video, the body lines and the marks as one.
  - **Draw and measure:** a line (two taps) reads its lean from upright, an
    angle (three taps, the corner in the middle) reads its opening, both
    measured on the picture and labelled so; the 3D readings stay the
    report's (`studioMarks.ts`).
  - **Saved with the serve:** marks live on the serve's own tag
    (`ServeTag.marks`), so they go when the report goes, travel in a backup
    with the tags, and come back after a reload: drawn over the kept clip on
    a reopened report. A malformed mark is dropped on its own; 24 at most.
  - **A still:** the frame at the clip's own size with the body lines and
    every mark and read-out, made in the browser and saved as a picture.
  - `studioMarks.test.ts`: the read-outs (plumb, flat, a right angle, the
    picture's shape counted), marks kept and cleared on the tag, a reload
    dropping only what cannot be drawn.
  - **In Chrome** on `Saque_con_pelota` at 1440 by 900: J and L moved the
    frame 0 to 2 to 1; a line read 8 degrees from upright and an angle 151;
    zoomed twice, the marks rode with the picture; the still downloaded
    with both; reloaded and reopened, both marks sat on the kept clip.
  - **Not built:** the ghost's opacity control, four-up compare (two-up, this
    serve beside the best, is there on a kept clip), an annotated short clip,
    the marks on the coach page, and Studio as a rail entry with its
    `DESIGN.md` line.

## Wave 3 report

Backups now carry the plan (D1.1); Progress is ten blocks, not twenty, and
reads as one story (D1.2); Today answers whether the serve is getting better
in a line (D1.3); the laptop studio has frame keys, zoom, lines and angles kept
with the serve, and a still (E1.1). Cut or not reached: moments worth
returning for and practice sessions feeding the week's plan (area D), and the
studio's ghost opacity, four-up compare, annotated clip, coach-page marks and
rail entry (area E). Measured: the entry chunk twice over its raw budget by
under a kilobyte, each time made room for.

## Wave 4. The front door

- [x] **F1.1 A year, a trial, and a proposed free and Plus table.** Ready for
  the owner's numbers; nothing is on sale and no price is set.
  - **A year:** a second Stripe price (`STRIPE_ANNUAL_PRICE_ID`, owner only)
    and a "Pay by the year" button that appears only when
    `VITE_PRICE_LINE_ANNUAL` says what it costs. A yearly checkout with no
    yearly price is refused in words.
  - **A trial:** `TRIAL_DAYS`, a whole number from 1 to 30 or nothing, sent to
    Stripe as the subscription's trial; the pricing page says so and its
    button says "Start the free trial". Plus is on from the first day, and
    the pass runs to the trial's end, then renews with the subscription.
  - **Against the stand-in:** `payments.test.ts` checks the yearly price is
    asked for, a plain checkout stays monthly, a year buys a pass past 300
    days, a 7-day trial ends a pass with the trial, and 0, 45, 2.5 and
    "seven" ask for no trial. In Chrome on the `serve-coach-pay-offers`
    launch entry (test prices, a 7-day trial): the trial and the yearly
    checkout each went through the stand-in's page and came back with Plus
    on; console clean.
  - **The table** is `docs/apex/PLANS-PROPOSAL.md`: every built feature from
    B to E placed free or Plus, safety and backups never paid, five rows
    marked as proposals for the owner.
  - **The entry chunk went 0.03 kB over** with the two new settings in the
    billing config every screen loads; they moved to `billing/offers.ts`,
    read by the pricing page alone. The entry is 384.94 kB raw against 385:
    60 bytes to spare, so the next thing on the first screen has to make room.
- [x] **F1.2 First run to first read, counted, and one tap removed.** A
  stranger with a clip on a phone (390 by 844, a fresh browser, the dev
  server on this laptop, `Saque_con_pelota`, 18 s at 320 by 240):
  - **Before:** three taps to the file picker: "Film my serve", "Got it" on
    the three filming rules, then "Videos" in the viewfinder (3.2 s). The
    rules stood over the viewfinder, so "Videos" could not be reached past
    them, and they are rules for filming, which this player is not doing.
  - **After:** two. The rules carry "Pick a video instead", which marks them
    seen and opens the picker (3.6 and 5.0 s on two quiet runs).
  - **The read itself:** 109.3 and 115.2 s from the pick to the report on two
    quiet runs, with the coach downloaded once from the local server; 140 to
    156 s while the gate was running beside it. That is the engine reading
    every frame of an 18 s clip, and it is the long pole of a first visit.
    Not shortened here; the analysing screen's wait is unchanged.

## Wave 4 report

Plus can be offered by the year and with a trial once the owner sets them,
proved against the stand-in (F1.1), and a free and Plus table is proposed
(`PLANS-PROPOSAL.md`); a player with a clip reaches the picker in two taps,
not three (F1.2). Measured: a first read takes about 110 s on an 18 s clip.
Found already met: every locked Plus feature previews a real piece of the
player's own data. Not built: a landing that plays a licensed real serve, and
Ask the coach (egress; the owner's call).

## Wave 5. Close

- [x] **W5.1 The independent review, and its findings fixed.** Five reviewers,
  each briefed on its own and given the code, the ledger, the shots and the
  running app, none shown this round's own verdict. Scores against the brief,
  as given: **a UTR 3 player 7, a product designer 7, a coach 6.5, an engine
  regression hunter 6, a first-time visitor 6.** Each finding below was
  re-checked in the code or the app before it was acted on.
  - **Fixed: the loop check could say "inside your usual spread" about a
    reading it never took** (the engine hunter). It asked `againstUsual`,
    which skips a row the serve could not read, a move inside the player's
    own furthest readings, and anything past its three strongest; each came
    out as "within". It now asks the drill's own row: unread when this serve
    could not read it, and towards, away or level against the band otherwise.
    Good news is hedged as one serve, like bad ("A good sign, so film a few
    more to be sure"), where it had said "The drill is working".
  - **Fixed: a backup restore could wipe studio marks.** Tag rows merged whole,
    newest wins; now field by field (`mergeTags`), so a newer "second serve"
    from a file keeps the marks drawn here, and a mark drawn here keeps the
    file's older outcome.
  - **Fixed: "your serve on Saturday had this right" could point at a kick for
    a flat serve, or at older scoring.** Same type and rulebook only. Two
    taps on one spot are no longer a mark that reads 0 or 90 degrees.
  - **Fixed: the guided set could run on a step with no served ball** (the
    coach): "Toss and point, 6 serves" for a toss that is caught. One rule
    (`filmable`, beside the ladders) now governs the intro, the drill sheet's
    "Film a check" and Today's session, which on a self-checked step ends on
    "Film a serve", a plain recording with nothing counted for the step.
    `?demo=guided` uses the first served step.
  - **Fixed: three lesson citations claimed more than their sources** (the
    coach). Kovacs's toss-over-the-head shoulder line was about where the
    toss goes sideways, not front to back: cut. The toss-too-high wait is
    Newton's (beginners wait at the top), the pause's cost Elliott's: both
    cited. Kibler's half of the energy is said as a model. Campbell's players
    are said to be elite young players, and posture's "good" line no longer
    praises the sideways tilt the cost line warns of (now marked coaching).
    14 claims cite a study and 9 are marked.
  - **Fixed: a fix led by a card row held the picture at contact** (the
    player and the designer): "Racket drop" over a frame of contact. It holds
    at the row's own moment now; on `Saque_con_pelota` in Chrome, "Held at
    the racket drop" under a racket-drop fix.
  - **Checked, not changed:** the "First serve filmed" card half under the
    action bar at 375 to 390 wide is the page meeting a fixed bar at the
    fold; it scrolls clear, and the drill sits above the bar. Under an injury
    warning the drill is under the bar on a phone, as B2.1 recorded.
  - **Agreed and open:** the report's held frame is still the player's footage
    with a moment named and no fault drawn on the body except on a height
    fault, and the target figure on 1 of 7 serves (B1.1's rule); the laptop
    studio lacks the ghost's opacity, compare four-up, an annotated clip and
    a rail entry; the landing shows a drawn figure, not a licensed real
    serve; a first read takes about 110 s on an 18 s clip; Plus never
    appears while payments are off (by design, the owner's switch); the
    posture ladder's cue ("eyes on the spot") is not the sideways stacking
    the fault names, and the coach's review of the drill library is not done.
  - **The entry chunk, made room in.** The fixes took it to 385.48 kB raw
    against 385. Restoring a backup runs rarely, from Settings or a rolling
    copy, and it was all on the first screen: it is `storage/restore.ts` now,
    loaded when a restore runs. The entry is 381.47 kB, 3.5 kB under.
  - Tests: `drillLoop.test.ts` (a soft row, an outranked row, the hedge),
    `ownGood.test.ts` (another type, older rules), `studioMarks.test.ts`
    (dot marks, the merge both ways), `guidedSet.test.ts` (no intro on a
    self step, for every step of every ladder; `filmable`).
- [x] **W5.2 The close.** `npm run release` green (typecheck, lint, build, the
  suite with its budgets, the manifest, the worker, home and the example
  opening offline). `apex-after` shots at 390 by 844 (50 files) and 1440 by
  900 (48), every state of the before set; the galleries are
  `docs/lift/apex-gallery.html` and `apex-gallery-laptop.html`. The console
  across both sets says what it said before the round: MediaPipe's load notes,
  and errors only on the crash and offline-with-no-engine states built to show
  them. `STATUS.md` rewritten for this round, with the review's scores as
  given and what is open; `OWNER-STEPS.md` gains the year and the trial.

## Wave 5 report

Five independent reviewers scored the app against the brief: 7, 7, 6.5, 6
and 6. Their findings were re-checked and seven fixed (W5.1), the most
serious a loop check that could call a reading it never took "inside your
usual spread". What keeps the scores where they are is mostly the same list
as the handover's own: no real phone, thin real footage, the report's moment
not yet drawn on the body, a studio without its compare and ghost controls,
and a landing that does not yet demonstrate. Waiting on the owner: A0.2's
three inputs, the free and Plus table and prices, and Ask the coach.

## Wave 6. The open items

- [x] **W6.1 The posture ladder coaches the fault it names.** The engine names
  a sideways fold at the waist, read from behind; the ladder coached the eyes
  ("eyes on the spot you hit"), which fixes a head pulled down. The coach in
  W5 found it. The first step is now "Shoulder over shoulder" (the drill the
  shoulder-tilt row already hands out: the hitting shoulder under the tossing
  arm, the trunk straight, swung through), replacing "Toss and look" so a
  player on this ladder keeps their step number. The cue points at the ball's
  height ("Reach tall to the ball"), and the mistake names bending at the
  waist to get the shoulder down. The copy lint caught "a little" in the cue.
- [x] **W6.2 The studio's open items: marks for the coach, the ghost's
  strength, Studio on the rail.**
  - **The coach page lists what the player drew:** each mark with its moment
    and read-out ("At 1.25 s, a line: 0 degrees from upright, measured on the
    picture."), escaped as text like every line there (`coachContext.ts`,
    `coachReport.ts`; `coachContext.test.ts`).
  - **The best serve's body has a strength:** full, half, faint or off, from
    a "Best:" button in the studio's tools or the G key (`pairedAlpha`).
    `drawing.test.ts` holds the half ghost to half strength and the off
    ghost to no dashed line at all. Not shown in Chrome: neither licensed
    clip measures the camera's angle, so the app, rightly, pairs no best
    serve under it.
  - **Studio on the laptop rail,** under Progress, opening the latest serve in
    the review studio; hidden on a phone, which keeps its two places and the
    film button. In Chrome at 1440 it opened `serve-demo28`; at 390 it is
    not there; console clean. `DESIGN.md` now says so, and that Pathways stays
    a sheet from Today's goal; the owner's design question is marked settled.
- [x] **W6.3 The held frame points at the body part on a row-led fix.** The
  held frame already painted a named fault's part over the player's own
  footage, translucent in the work colour (`paintWorkOn`), and the player and
  the designer in W5 saw none: their real clip's first fix came from a card
  row, which names no fault, so nothing was painted. Each card row now
  points at the part it measures (`rowParts`): the tossing arm for the toss
  rows, the legs for knee bend and leg drive, the trunk for shoulder tilt,
  the hitting forearm for the racket drop, and so on; the two timing rows
  point at nothing, since no one part is the timing. It points; it draws no
  angle, so the no-picture-space-angles rule (`targetShape.ts`) stands.
  `rowParts.test.ts` holds every row to a part or a named timing, in the
  vocabulary a fault paints in, on the player's own side. In Chrome on
  `Saque_con_pelota` at 390: "Held at the racket drop" with the forearm and
  hand painted over the player's arm; no page errors.
- [x] **W6.4 The last practice carries into the next session.** A practice
  session's summary already said what changed from its start to its end;
  nothing carried that forward. Today's session now opens with it: "Last
  practice. As the session went on you started to bring the tossing arm down
  sooner. Shorter baskets today, with a rest between." (`lastPracticeLine`,
  from the latest finished practice; nothing from an unfinished one or one
  that held steady.) Practice serves already counted as evidence for the
  programme (`sessionEvidence`); the moments worth returning for (a goal, a
  fault fixed, a step passed with then and now, records, the weekly recap)
  were already built, so area D's other two items were found met.
  - **Two old wording faults fixed on the way:** a reading inside a sentence
    kept its capital ("went from Peaks well above"), and a row named by a
    question read "Your how far the ball falls first went from". The three
    question-shaped rows have plain words now, in the table the "than usual"
    headlines share.
  - `nextTime.test.ts` runs the line for every card row both ways through the
    copy lint, and refuses an unfinished practice. **Not seen in Chrome:** no
    demo route seeds a finished practice session with a drift.
- [x] **W6.5 The studio saves an annotated clip.** "Save clip" plays the
  serve's own window at the player's speed and records each frame as the
  studio shows it, the video with the body lines and every mark and read-out,
  with the browser's own `MediaRecorder`, then saves the file on the device
  (`recordStudioClip`; the still and the clip share one frame painter). It
  takes as long as it plays, stops at the window's end, at the player's loop,
  or at a time limit, and is offered only where the browser can record. In
  Chrome on `Saque_con_pelota` at 1440: an 839 KB WebM in 6.0 s, decoding at
  the clip's own 320 by 240, a frame from its middle showing the body lines
  and a drawn line reading 8 degrees from upright; no page errors.

- [x] **W6.6 The landing plays a real serve.** The first screen plays an
  openly licensed clip of someone else's serve ("Saque con pelota", Dardo 86 7,
  CC BY-SA 3.0) as the report plays the player's own: full speed to the toss,
  slowed to 0.4 into the moment the fix is about, held there about 3 s with
  that part of the body picked out, then on through the swing and round again.
  Reduced motion gets the held frame; no autoplay gets the held frame; data
  saver, no decoder or no first frame in 2.5 s gets the drawn serve as before.
  It stops while off screen or in a hidden tab.
  - **The read is the engine's own, saved once.** `scripts/landing-serve.mjs`
    reads the clip in Chrome with `analyzeServe`, trims the serve's window
    with Chrome's recorder as H.264 (90 kB, every browser plays it) and saves
    the body's picture points (33 kB). The recorder starts a few frames from
    where it is asked, so the script matches the copy to the clip picture by
    picture and moves the points with it: checked against the original at
    four moments, the held drop within one frame.
  - **The words beside it are its read.** The peek says 79, "Hitting elbow at
    drop", Overhead throws, 15 throws, labelled "On this serve". The sample
    report's peek (75, the tossing arm) described a serve the landing did not
    show. `landingServe.test.ts` re-scores the saved card on today's rubric
    and fails when the peek, the held moment or the painted part drift from
    it, and asks for the script again when a measurement changes. Where the
    drawn serve stands in, the label says "A real serve I read".
  - **Credited** on the picture with a link to the file page, and in both
    credits lists; the trimmed copy carries the same licence. Not precached:
    only a first visit fetches it.
  - In Chrome at 390 by 844 and 1440 by 900: the stage held at the drop with
    the hitting arm painted, the credit legible on the bright sky, the clip's
    foot faded into the stage; the time sampled every half second showed
    the lead-in, the slow part, the hold and the loop; data saver showed the
    drawn serve with its own label; console clean. **Not checked:** Safari
    and Firefox (the owner's download), and LCP on the throttled profile.
  - **The egress guard caught it first:** the landing's one same-origin GET
    of its own JSON was not on `egress.test.ts`'s list, and the gate refused
    the commit until it was named there with its reason.
- [x] **W6.7 Four up in the studio.** A reopened report with kept clips now
  sets this serve beside up to three earlier ones: the best, the last, and
  one from about a month before (nearest thirty days, at least three weeks
  back), each only if its clip is still on the device, each serve once, the
  same serve type, never a refused clip (`compareSet.ts`). Two up (this and
  the first of them) stays for everyone, as before; "Four up" is offered to
  Plus with two or more earlier clips kept. Every clip moves together: a
  moment's button puts each at its own instance of that moment, and "Play
  all from the toss" starts each just before its own toss at half speed. A
  fourth pane with no clip holds the model serve at the chosen moment.
  - `compareSet.test.ts`: the order, a best that is also the last shown once
    and the serve before it not called the last, only kept clips, the
    month's three-week floor and thirty-day aim, and no later serve, other
    serve type, refused clip, or best from an older rubric.
  - In Chrome at 1440 by 900 with four serves seeded through the app's own
    store and clip store: captions "This serve", "Your best", "Your last",
    "A month before" with dates; Trophy put all four clips at their trophy;
    Play all ran all four at half speed together. With the month's clip
    gone, the model serve filled the fourth pane at the racket drop. Two up
    and back by keyboard; console clean. **Not checked:** four different
    players' clips (the seed used one licensed clip four times).

## Wave 6 report

The coach's posture finding, the studio's open items (marks for the coach,
the ghost's strength, Studio on the rail, an annotated clip, four up), the
held frame pointing at the body part on a row-led fix, the last practice
carried into the next session, and a landing that plays a licensed real serve
with its own read. Found already met: area D's moments. Still open: a faster
first read, recording a whole practice in the app, a coach's review of the
drill library, and everything waiting on the owner.
