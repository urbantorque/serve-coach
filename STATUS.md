# Status

Serve Coach analyses a tennis serve from a phone clip, entirely on the
device. This page says what works, what is open, and what is the owner's
call. The ledger of how each item was built and proved is `ROADMAP.md`; the
reasoning behind the current programme is `NOTCH-REVIEW.md`; the design
record is `README.md`; the working rules are `LOOP.md`.

Finished ledgers from earlier loops are in `docs/history/`: `NEXT.md`,
`PROGRESS.md`, `BACKLOG.md`, `PHASE-8.md`, `UNATTENDED-LOOP.md` and
`LEVEL-UP-REVIEW.md`. Source comments still cite them by name, and they are
in that folder under the same names.

## What works

- **The structure.** Today, Progress and one lime film button. A new player
  gets one screen and one action. Filming is the whole screen; everything else is
  a sheet or a fold. `DESIGN.md` holds the visual rules.
- **One serve, read and coached.** Filmed in the app or picked from the camera
  roll. The first screen answers how did I do, what do I fix and what do I do
  now, over the player's own footage with the fault drawn on it. The figure is a
  lit form on the tracked joints, and the model serve is a real serve from the
  Bath capture. Two to four drills, worst cause first, each on a ladder.
- **Against the player's own serve.** Each serve read against their usual and
  their best, past their own noise, from a dozen serves over three trips. What
  their fastest and in-court serves share, when chance could not have. All
  synthetic so far: the sums keep their rate, which is not the same as being
  right on a real clip.
- **The wait.** The coach says what it looks for on a real serve, then shows the
  player's own body as the tracker reads it, then the whole swing as one picture.
- **On court.** Hands-free recording with a spoken countdown, a spoken framing
  verdict, a glance of one screen between serves, a drill check across a trip, and
  a court card readable from the baseline.
- **Practice sessions.** A long clip becomes a session, led by what changed.
- **A programme.** A goal, a road of steps at the player's own pace, moments that
  land on the serve that earned them, a weekly recap, and serve load as guidance.
- **Progress.** The shape of the serve as a ribbon, speed by trip, faults going
  dark, the body then and now, and second serves as their own view.
- **Sharing, by the player only.** A poster of the swing, a slow-motion clip made
  on the phone, then and now as a clip, the week in the phone's calendar, and a
  coach's page with the player's record and what the camera cannot see.
- **Offline, and protected.** One download with its size stated, a first read
  before the refinement model is in, a rolling local copy of the history, an offer
  to restore it, and a crash screen that keeps data.
- **Serve speed.** The launch speed and its likely range, in km/h or mph. Read on
  slow motion, and on ordinary 30 and 60 fps clips from the speed placement. A miss
  says what to change. Never graded, and still uncalibrated against a radar.

- **Built for the court (C0–C6).** The framing verdict is a band readable
  from the baseline, with serve pips, a countdown a third of the picture wide,
  and short tones. The next serve can start by itself once the player stands
  ready. The glance has a court mode that opens on one big figure and speaks the
  speed first. A speed placement exists for the framing check. Progress shows
  speed by trip as range bars, and the replay draws the struck ball. None of it
  has run on a phone yet.

- **Review fixes (Q1–Q12).** From the graded review of 2026-10-23:
  - The report's headline is the fix, with "Rough read" beside the score when
    the read is soft, and one first priority per page.
  - The installed app turns with the phone.
  - The coil is shown, not scored, and the open chest has its own band.
  - A test holds every graded band to the camera's noise on it, on the read the
    app really makes. One row is over: arm extension, at 1.12 of the rule, named
    in the test with why (H38, H42).
  - On a phone the viewfinder starts hands-free with the voice on, offers the
    camera app where the preview cannot start, and is readable from the
    baseline.
  - The court glance puts "Record another" under the figure.
  - Home says the week once, with today's minutes on the drills, and shows a
    passed drill step for three days with the fault then and now.
  - A session's fixes name the drill at the player's own step, with how to do
    it and the court card.
  - The clip-reading engine is out of the entry chunk (Q12).
    `entryGraph.test.ts` fails if the entry reaches the engine again.

- **A phone on the same network, over HTTPS.** `npm run preview:lan` serves
  the build with a certificate the phone trusts once, from an authority
  limited to private addresses, so the camera, the service worker and install
  work off localhost (README, "Trying it on your phone without a host").
  Proved with `openssl verify` against the LAN address and in Chrome on that
  address: a secure context, the worker active, the camera open. Not yet
  installed on a phone.

## What is open

- **The pose worker as the default.** Every pose read in the analysis goes
  through one switch, and `?worker=1` reads in a module worker with identical
  landmarks (M1.2). It stays opt-in until a quiet machine has timed whole
  analyses both ways and counted the long tasks.
- **M1.4, and the timing half of M1.1.** This machine runs at up to 100% CPU
  from other apps, and headless Chrome crashes after reports, so no
  phone-shaped timing could be trusted. The threaded refine stays behind
  `ISOLATE=1` until a quiet machine settles it.
- **N1.10.** Recording a whole practice in the app. Optional, not started.
- **Bench tables.** The clip-bench speed and toss columns exist; the table
  needs a run on a quiet machine.
- **Nothing from the lift has run on a real phone.** The live body on the wait,
  the clip recorder on iOS Safari, sounds under the ringer switch, and the bar
  over the home indicator were all walked in Chrome only. Protection was walked
  in Chrome, not Safari or Firefox.
- **What the noise table is.** `CARD_NOISE_SD` is measured on the app's own read now
  (H38), and it is a floor. Its noise is the suite's, independent from frame to frame,
  about a quarter of the error fitted to MediaPipe's wrist. Under that fitted error
  six rows would fail the band rule and arm extension would read about 24°, on any
  table. The player's usual holds its stated 5% of false readings under the suite's
  noise (0.17% and 0.42%) and under MediaPipe's fit (3.2% and 4.6%), and runs past it
  under RTMPose's, 5.3% from the guide and 6.0% from behind (H43). Only real clips can
  say which is nearer.
- **Arm extension.** 1.12 of the band rule at 30 samples a second, and known. A
  steadier reading was built and not adopted, for reasons in H42.
- **The scan can land on the toss.** On a clip over 4.5 s, the 12 Hz scan picks the
  highest hand, and the tossing hand tops out within a fortieth of the player's height
  (about 4 cm) of the racket hand's wrist on most placements. On motion capture 65% of
  takes landed near the toss, and a read ends at or before contact on about a third of
  takes. On real video it was 5 landings
  of 13, none cut off at contact, and two servers is too few to say. It is not in the
  table, which models a window around contact.
- **Contact locks to the samples.** Most of contact ahead's remaining noise is
  `refineExtremum`'s tent. A cubic took it from 3.5 to about 1.9 in a scratch test, and
  every reader of the contact moment would move with it.
- **Clips whose rate is unknown.** They are read on the even grid, which is noisier than
  the table: in a located window toss path about twice it, contact ahead 1.35, drop to
  contact 1.26 (H38); on a whole clip of 2.5 to 4.5 s toss path 2.1, contact ahead and
  contact height 1.6, hand under elbow and drop to contact 1.5.
  Clean serves are told a fault there: a toss wandering on 14 to 18 takes of 1,440 from
  behind, and the ball met behind on 4 or 5 of 1,440 from the guide (H45).
- **Clips the budget cannot walk.** A 30 fps clip past four seconds, and the blind window
  at 25 or 30 fps where the scan found nothing, are read at the grid's count on frames of
  their own. Rows run up to 1.65 of the table on a long clip and 2.7 (contact ahead) on
  the blind window at 30 fps, where 3 clean takes of 720 from the guide are told the
  ball was met behind them. One take of a long clip can move several of its deviations
  from the same clip read whole, and one frame more of clip moves the chain's timings by
  about their noise (H44, H45).
- **Files under 19 fps.** The grid stays there and calls a third to three quarters of
  takes at 12 to 15 fps too blurry, which is not the reason (H35).
- **Two samples lost at contact.** They are never bridged on an even read under 26.8 a
  second, nor on the spread of a clip the budget cannot walk where the three gaps around
  them come to more than 0.112 s (any two-frame gap at 30 fps, any three-frame gap at
  60, always on the blind window of a 25 or 50 fps file). Where the hole covers contact
  the serve is refused as a clip that ends before contact, which is not the reason: 75%
  of such holes on a 20 fps walk, 25 to 29% at 24 and 25 fps, 27% on a 30 fps clip of
  4.4 s. Bridging further gives too few frames instead. A body lost at contact wants a
  reason of its own (H44, H45, H46).
- **What the basket can still miss.** The arm line runs on front-back views only and
  from behind finds a real change of 0 to 30° across six serves on about 4 baskets of
  40, half the basket 30° apart on 15 to 17, and a 20° split almost never; the landing
  line from the side finds 0.12 m on 13 of 40. A basket where fewer than half the
  serves lost their racket drop is still called steady: one or two of six on 117 to 229
  of 240, one of three on 41 to 53% (H45, H46).
- **Load ratio on legs that half bend.** Between a full load and rigid legs the load is
  timed from the hips on some takes and from the arms on others, and a still basket
  that mixes them is told its time from trophy to contact drifts or changes most: 16 to
  24% of still baskets of six at 155 to 160° with no drop, up to 14% with one at 150°.
  Progress then names it the one to practise. Comparing the row only where every serve
  was timed the same way is the fix it wants; the rate is held where it is (H46). On the
  commonest club serve load ratio moves two and a half times the table (H45).
- **A tilted phone from the side.** The player's lean is in the roll the app reads, so
  a phone tilted one way is levelled too far and one tilted the other way up to about
  8° not at all: contact height moves up to 0.072 at six degrees. A tilt of 4° to 5° is
  neither corrected nor told (H37).
- **Which clips the read has seen.** Chrome only, on H.264 made for the test, a first
  frame off zero included. No Safari, no HEVC, no B-frames, no phone file. On a
  composition offset with no edit list Chrome shows each keyframe for the frames just
  before it, and a first frame that lasts a frame and a half or more may be read twice
  (H46).
- **`FiringTimeline` at 60 fps and above.** It still draws `chain.wrist`, which
  reads the follow-through there (H16).
- **Backups.** `Prefs.goal` and `ladder` are not in them yet.
- **Measured and not adopted:** per-tracker noise floors (M2.1) and speed
  from the bounce's sound (N2.10). Both results are in the ledger.

## The owner's call

- **A radar-checked serve.** One would move the speed from `UNCALIBRATED` to
  checked.
- **Real club players**, filmed by a coach and sent through `?fixture`. Every
  engine score is capped until this happens.
- **A git remote, hosting, and a first tagged release.** `npm run release`
  makes the build ready.
- **Anything that sends data off the device.**
- **M0.1** (a backup folder outside OneDrive) and **M2.2** (the 241 MB COCO
  download).

## Resuming this loop

Work is on `lift/whole-app`, and its ledger is the last section of `ROADMAP.md`
(H1 onward). The reasoning is `docs/lift/LIFT-PLAN.md`, the visual rules are
`DESIGN.md`, and `docs/lift/gallery.html` shows every state before and after.

The suite runs **2,269 checks** (2026-11-12). The last loop tag is
`loop-green-15`, from the August loop.

The entry chunk stands at 127.30 of 130 kB gzip, as `bundle.test.ts` measures it
(level 9), and 373.46 of 385 kB raw.

Before trusting a size figure, run `npm run build`: `bundle.test.ts` reads
`dist/`. The entry chunk is close to its budgets, so new screens load lazily.

How to work here, in short:

- One commit per ledger item, each ticked in `ROADMAP.md` with what it turned
  out to be and how it was proved. A measured "not adopted" is a result.
- Run the full chain before a commit: `npm run typecheck`, `npx eslint .`,
  `npm run build`, `npm test`. `npm run release` runs all of it and then
  checks the built app offline in a browser.
- Long browser timings on this machine are unreliable: other apps load the
  CPU, and headless Chrome crashes after reports. Measure on a quiet machine.
- Edit files that hold backslashes (regexes, escapes) with the Edit or Write
  tool; shell heredocs drop them.
- This section is held to the suite by `handover.test.ts`: the check count
  above must stay within a few percent of the suite's own.
