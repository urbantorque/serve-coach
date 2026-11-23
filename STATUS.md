# Status

Serve Coach coaches a tennis serve from one phone clip, read entirely on the
device. This page says what works, what is open, and what is the owner's call.
The programme that brought it here is `docs/apex/HANDOVER.md`, its ledger is
`docs/apex/LEDGER.md` (Waves 0 to 5, closed), the visual rules are `DESIGN.md`,
and `README.md` says how to run it.

Finished ledgers from earlier loops are in `docs/history/` and `docs/next/`, with
the full design record that used to be the README
(`docs/history/README-design-record.md`). Source comments cite them by their old
names.

## What works

- **One serve, read and coached.** Filmed in the app or picked from the camera
  roll; MediaPipe finds the body and RTMPose refines the swing. The report opens
  on the player's own clip held at the moment of the first fix, with the shape
  to aim for where a figure can be drawn honestly, and leads with any injury
  warning. Two to four fixes, worst cause first.
- **Coaching you can see and follow.** Ten of the eleven faults are shown
  moving on a model serve, the fault beside its fix, from the camera the fault
  is read from; the eleventh is measured to have nothing a camera can show.
  Each fault has a short lesson: what it costs and what good looks like, every
  claim cited or marked as coaching, and the player's own earlier serve that
  had it right. A drill check runs as a guided set, hands-free, the phone on a
  bag: the step and cue said, each serve read against the drill's one fault,
  and the set ended when it has an answer. A serve filmed after a drill block
  is read against that drill first, past the player's own spread.
- **Honest by construction.** Every graded band rests on a study or on real
  serve motion, named beside it; a reading with neither is shown and never
  graded. A clip the engine cannot trust is refused with what to change. The
  `/accuracy` page is built from the tables the engine grades with.
- **Against the player's own serve.** Each serve read against their usual and
  their best, past their own measured noise.
- **On court.** Hands-free recording with a spoken countdown and framing check,
  a glance between serves, a court card, and today's session in minutes.
- **Over time.** Today answers what the serve is like now, whether it is
  getting better and what to do this week, on its first screen. Progress is one
  story: the serve now, then and now on the player's body, the faults serve by
  serve, speed (about, with its range, never graded), what changed, and one
  fold for the rest.
- **The laptop studio,** on the rail. Frame keys (arrows, J K L, 1 to 6),
  zoom and pan, lines and angles measured on the picture and kept with the
  serve and shown on the coach's page, the best serve's ghost at four
  strengths, a still or an annotated clip saved on the device, and two or
  four up: this serve beside the best, the last and one from a month before,
  every clip moved to the same moment together.
- **Sharing, by the player only.** A poster, a slow-motion clip, then and now,
  and a coach's page.
- **Offline and protected.** One stated download, a first read before the
  refinement model is in, a rolling local copy, and export and import that
  carry everything, the plan included.
- **The commercial surface, switched off.** Free and Plus behind one
  `can(feature)`, a signed pass with no accounts, Cloudflare Pages Functions for
  checkout (monthly, and by the year and with a trial when the owner sets them),
  claim, refresh and the portal, tested against a local stand-in. None of it
  makes a request until the owner switches it on.

## What is open

- **Nothing has run on a real phone,** and nothing has decoded in Safari's
  engine or Firefox (the owner's yes to a 200 MB download).
- **Real footage is thin:** four licensed tennis clips, all 640 by 480 or
  smaller. Whether the trophy and knee should be read off the picture side-on
  waits on sharper footage or the owner's own serves (A1.1).
- **The report's moment** holds the player's footage at the fix's moment and
  paints the body part the fix is about, but draws the target figure on 1 of
  7 serves, by the rule that no picture-space shape is re-measured as a 3D
  angle.
- **The front door** plays a licensed real serve with its own read. On slow
  4G with a four times slower processor its LCP is 1.7 to 1.9 s and the clip
  is in by 2.6 s (W6.10), measured in Chrome, not on a phone. Ask the coach
  is not built (egress, the owner's call).
- **A first read** reaches the report in about 45 s on an 18 s clip with two
  serves, the rest of the basket scored behind it (W6.9). Half of that is the
  scan that finds the serve, which also missed two of the four serves in one
  licensed clip; fixing it needs labelled serve times.
- **The drill library** has not had a coach's full review.
- **Recording a whole practice in the app** works where the browser can write
  a file as it records (N4.4), but has not run past 150 s in a browser or on a
  phone.

## The owner's call

Everything only the owner can do is in `docs/next/OWNER-STEPS.md`, in order:
what is free and what Plus costs (the Apex proposal is
`docs/apex/PLANS-PROPOSAL.md`), a Stripe account and its prices (monthly, and
optionally yearly and a trial), the pass keys, a domain and a git remote, the
Cloudflare Pages project, a reading of the terms and privacy page, and the
switch to live. Also: the owner's own serves in `bench-data/own/`, more licensed
footage, the 200 MB browser download, and whether Ask the coach may ever be
switched on.

## Resuming this loop

Work is on `apex`, cut from `main` at `b4d0e80`; nothing is pushed and there is
no remote. The programme closed with an independent review (a player 7, a
designer 7, a coach 6.5, an engine hunter 6, a first-time visitor 6, out of
ten against the brief) and its fixes, W5.1. The before and after galleries are
`docs/lift/apex-gallery.html` (phone) and `docs/lift/apex-gallery-laptop.html`.

The suite runs **2,430 checks** (2026-11-23, after W6.7). The last loop tag is
`loop-green-15`, from the August loop.

The entry chunk budget is 132 kB gzip and 385 kB raw (`bundle.test.ts`); it is
381.47 kB raw after W5.1 moved the restore out. The split stylesheets are at
their 20 kB budget: the next screen style needs room made first. Run
`npm run build` before trusting a size figure: `bundle.test.ts` reads `dist/`.

How to work here, in short:

- One commit per ledger item, ticked in `docs/apex/LEDGER.md` with what it
  turned out to be and how it was proved. A measured "not adopted" is a result.
- Before a commit, chained so a failure cannot commit: `npm run typecheck`,
  `npx eslint .`, `npm run build`, `npm test`. `npm run release` runs all of it
  and then checks the built app offline in a browser.
- `SCORING_VERSION` is 7: a change that moves a saved report's number bumps it
  and says whether it is `card-bands` or a `measurement`.
- Long browser timings on this machine are unreliable: other apps load the
  CPU. Measure on a quiet machine.
- Edit files that hold backslashes with the Edit or Write tool; shell heredocs
  drop them.
- This section is held to the suite by `handover.test.ts`: the check count
  above must stay within a few percent of the suite's own.
