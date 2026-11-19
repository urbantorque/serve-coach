# Status

Serve Coach coaches a tennis serve from one phone clip, read entirely on the
device. This page says what works, what is open, and what is the owner's call.
The programme that brought it here is `docs/next/HANDOVER.md`, its ledger is
`docs/next/LEDGER.md` (Waves 0 to 7, closed), the visual rules are `DESIGN.md`,
and `README.md` says how to run it.

Finished ledgers from earlier loops are in `docs/history/`, with the full design
record that used to be the README (`README-design-record.md`). Source comments
cite them by their old names.

## What works

- **One serve, read and coached.** Filmed in the app or picked from the camera
  roll; MediaPipe finds the body and RTMPose refines the swing. The first screen
  answers how did I do, what do I fix and what do I do now, over the player's
  own footage with the fault drawn on it, and leads with any injury warning.
  Two to four fixes, worst cause first, each with a lesson and a ladder of
  drills checked by filming a basket.
- **Honest by construction.** Every graded band rests on a study or on real
  serve motion (the forty Bath serves), named beside it; a reading with neither
  is shown and never graded. Only a fault that needs work and that a study
  measures can lead the report. A clip the engine cannot trust is refused with
  what to change. The `/accuracy` page is built from the tables the engine
  grades with.
- **Against the player's own serve.** Each serve read against their usual and
  their best, past their own measured noise; what their tagged misses share,
  past chance only, can reorder the plan behind the first fix.
- **On court.** Hands-free recording with a spoken countdown and framing check,
  a glance of one screen between serves, a court card, and today's session in
  minutes with a capped throwing dose and a warm-up.
- **Over time.** A programme towards one goal, Progress as the shape of the
  serve, speed by trip (about, with its likely range, never graded), second
  serves as their own view, and practice sessions from a long clip.
- **Sharing, by the player only.** A poster, a slow-motion clip, then and now,
  and a coach's page in the report's own order.
- **Offline and protected.** One stated download, a first read before the
  refinement model is in, a rolling local copy of the history, export and
  import, and a crash screen that keeps data.
- **The commercial surface, switched off.** Free and Plus behind one
  `can(feature)`, a signed pass with no accounts, Cloudflare Pages Functions
  for checkout, claim, refresh and the portal, tested against a local stand-in
  (`VITE_PAYMENTS=mock`). Pricing, accuracy, privacy, terms and credits pages,
  host headers with a content security policy, sitemap and social card. None
  of it makes a request until the owner switches it on.
- **Both sizes.** A phone first; on a laptop the report is a review studio,
  with the clip on the left and the words, the fix and the action on the right.

## What is open

- **Nothing has run on a real phone,** and nothing has decoded in Safari's
  engine or Firefox (that needs the owner's yes to a 200 MB download).
- **Real footage is thin.** The pose models scored against truth on a drawn
  body (N2.8) refused 37 of 40 Bath serves: MediaPipe read the raised arm at
  contact as hanging down. A faceless figure is not a player, and two small
  public clips were all measured (N2.2), but the gap between the two is the
  most important unknown. Licensed 720p footage would settle it.
- **The real-footage noise** (`RETEST_SD`) is measured on two 320 by 240 clips
  and not adopted; the accuracy page shows it as measured and not used.
- **Threads and the pose worker** stay opt-in until a quiet machine times them
  (`ISOLATE=1`, `?worker=1`). This machine's timings are not trustworthy.
- **Known limits of the read**, each measured in the ledger: arm extension sits
  at 1.12 of the band rule; the scan can land on the toss on long clips; clips
  of unknown rate and blind windows read noisier than the table; a tilted phone
  from the side of 4 to 5 degrees is neither corrected nor told; load ratio on
  half-bent legs can flip between two timings.
- **Backups** do not yet carry `Prefs.goal` and `ladder`.
- **Recording a whole practice in the app** (N1.10) is not started.

## The owner's call

Everything only the owner can do is in `docs/next/OWNER-STEPS.md`, in order:
what is free and what Plus costs, a Stripe account, the pass keys, a domain and
a git remote, the Cloudflare Pages project, a reading of the terms and privacy
page by someone qualified, and the switch to live. Also: a radar-checked
serve, licensed footage or the owner's own serves, THETIS's licence, the 200 MB
browser download, threads on a quiet machine, and whether the laptop rail adds
Studio and Pathways as `DESIGN.md` says.

## Resuming this loop

Work is on `next/premium`, cut from `master` at `e8bf74c`; nothing is pushed
and there is no remote. The programme's last wave closed with an independent
review (a player, a coach, a designer and an engine hunter, each finding
re-checked by a skeptic) and its fixes, N7.1 to N7.7. The before and after
gallery is `docs/lift/next-gallery.html` (phone) and
`docs/lift/next-gallery-laptop.html`.

The suite runs **2,360 checks** (2026-11-20, after the close-out). The last loop tag is
`loop-green-15`, from the August loop.

The entry chunk budget is 132 kB gzip (`bundle.test.ts`, re-baselined once in
N2.10); the next screen loads lazily rather than raising it. Run
`npm run build` before trusting a size figure: `bundle.test.ts` reads `dist/`.

How to work here, in short:

- One commit per ledger item, ticked in `docs/next/LEDGER.md` with what it
  turned out to be and how it was proved. A measured "not adopted" is a result.
- Before a commit: `npm run typecheck`, `npx eslint .`, `npm run build`,
  `npm test`. `npm run release` runs all of it and then checks the built app
  offline in a browser.
- `SCORING_VERSION` is 7: a change that moves a saved report's number bumps it
  and says whether it is `card-bands` or a `measurement`.
- Long browser timings on this machine are unreliable: other apps load the
  CPU. Measure on a quiet machine.
- Edit files that hold backslashes with the Edit or Write tool; shell heredocs
  drop them.
- This section is held to the suite by `handover.test.ts`: the check count
  above must stay within a few percent of the suite's own.
