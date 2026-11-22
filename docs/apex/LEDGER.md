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

## Wave 4. The front door

## Wave 5. Close
