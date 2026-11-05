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
  - A test holds every graded band to the camera's noise on it, with no
    exceptions left. At 32 fps, the app's own rate, arm extension sits at 1.02 of
    the rule, which is judged at 50 fps.
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
- **The band table's rate.** `CARD_NOISE_SD` is measured at 50 fps and the app
  reads at 32. Noise-only baskets from the guide's placement name arm extension as
  wandering on 1.3%, against the panel's one in a hundred. Measuring at the app's
  rate would fix it and changes the method.
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

The suite runs **2,229 checks** (2026-11-06). The last loop tag is
`loop-green-15`, from the August loop.

The entry chunk stands at 127.05 of 130 kB gzip and 372.75 of 385 kB raw.

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
