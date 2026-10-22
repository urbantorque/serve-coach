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

- **One serve, read and coached.** Filmed in the app or picked from the
  camera roll. The report has a score, the fix that matters most, two to
  four drills worst cause first, each on a ladder, and the serve played back.
- **On court.** Hands-free recording with a spoken countdown, and a stop
  once the serve is over. A spoken framing verdict. The glance between
  serves. A drill check across a trip's recorded serves, and "Check this
  drill" from the week plan. Today's plan in minutes, and a court card
  readable from the baseline.
- **Practice sessions.** A long clip becomes a session, with a dashboard and
  its own drill check. Its judged serves count towards graduation.
- **Progress.** The score by trip, a fault strip, in-rate bars, records, best
  sets, what the misses share, and faults drawn then and now when they clear.
- **Sharing, by the player only.** A report card, the week in the phone's
  calendar (`.ics`), and a scriptless HTML report for a coach.
- **Offline.** One download with its size stated, a first read before the
  refinement model is in, backups, and a crash screen that keeps data.
- **Serve speed, on the report.** The launch speed and its likely range,
  under the score and on the glance, in km/h or mph. Read on slow motion, and
  on ordinary 30 and 60 fps clips filmed from the speed placement (six to
  seven metres back, net side of the picture open). A miss says what to change.
  Never graded, and still uncalibrated against a radar. Contact and toss heights
  in metres come from the toss's own gravity and are stored, not shown.

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
- **Measured and not adopted:** per-tracker noise floors (M2.1) and speed
  from the bounce's sound (N2.10). Both results are in the ledger.

## The owner's call

- **Speed over time** (N2.8): trends, first against second serve, and a
  fastest-serve record. Showing a speed was approved and is done (N2.7).
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

Work is on `roadmap/market-ready`, and its ledger is `ROADMAP.md`: the Notch
programme (N0–N5) and the Lift programme (M0–M5), with one order of play at
the end of the Notch section. Pick the first open item there.

The suite runs **1,910 checks** (2026-10-22). The last loop tag is
`loop-green-15`, from the August loop.

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
