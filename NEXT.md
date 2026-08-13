# NEXT

The work ledger for the programme in `LOOP.md`. This file, not the git log and
not anybody's memory, is the source of truth for what is done.

Status marks: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked.

Take the topmost round that is neither done nor blocked. One round per
iteration — do not start a second because the first turned out small. If a round
proves bigger than one iteration, split it here into named sub-rounds, do the
first, and leave the rest. Never leave half-built code behind a flag.

Each entry is a **question with a deliverable**. Several will answer "already
true"; that answer, pinned by a test that would fail if it stopped being true, is
a finished round.

Note entries **delta only**. The close-out round of each phase compresses that
phase's entries and drops the working notes underneath them.

---

## Phase 3 — UX and onboarding (R15–21)

- [x] **R15** — Walked live in the browser as a stranger, `localStorage`
      cleared each time, not just read from the source. The path through
      **Analyse a serve** works exactly as designed: the guide-first sheet
      opens with the four filming rules, the continue button is genuinely
      disabled until a hand is picked ("Pick a hand to continue" →
      "Got it — choose my video"), and `seenFilmingGuide`/`handedness` land in
      `localStorage` correctly. Confirmed by driving the real components, not
      by inspection.

      Two real gaps, worst first.

      1. **"Check your framing first" skips onboarding entirely.** It is the
         second-most prominent control on the home screen — sitting right
         below the two main buttons, worded as an invitation ("Point the phone
         at your spot and see what the coach can read") — and its `onClick`
         is the one entry point on the whole screen with no
         `needsFilmingGuide` check. Confirmed live: tapped first, on a
         completely fresh install, it opens the camera viewfinder directly.
         No rules, no hand question, and `localStorage` after is `{}`. A
         stranger who explores before committing — which this control is
         worded to invite — never gets oriented, and a clip recorded from here
         has no stated hand to cross-check against for every analysis after
         it, not just this one.
      2. **Reading "How to film it" does not count as having read it.** The
         read-only strap shows the identical four rules but its `Sheet` closes
         with a bare `setSheet(null)` — no `writePrefs`. A conscientious
         stranger who reads it first, then taps "Analyse a serve", is shown
         the same four rules again before being asked for their hand. Minor,
         not broken — the two "show the filming guide" surfaces just do not
         share completion state.

      One flagged, not confirmed. `finishFirstRunGuide` closes the sheet, then
      calls the hidden file input's `.click()` from inside `setTimeout(…, 60)`
      — a synthetic click on a file input outside its own event handler needs
      the browser to still consider the tap "active". Instrumented live: the
      deferred call does reach the input correctly, but this environment
      cannot produce a genuinely trusted tap to check whether one survives the
      delay — the pane cannot composite a real click without being displayed,
      the same limit R4 and R9 already ran into. Sixty milliseconds is very
      likely inside every major browser's activation window, which is
      measured in seconds — so this is a low-confidence item for
      `COURT-CHECK.md`, not a claimed defect.

      No code this round, as asked. R16 takes the worst of the two confirmed
      gaps.
- [x] **R16** — Fixed at the root rather than patched at the one call site R15
      named. The guide-first sheet was one sheet built for a single reason to
      open it — `finishFirstRunGuide` always finished by clicking the file
      picker — so every button that wanted something else on a first run had
      nowhere correct to send the player. `onGuideThen(intent)` in `App.tsx`
      remembers which of three reasons opened it: `'pick'` (Analyse a serve),
      `'record'` (Record now), or `'check'` (Check your framing first, the
      gap R15 named). Finishing the guide now branches on that — `'check'`
      bumps `framingNonce`, the same counter `Glance`'s "Record another"
      already uses to ask the home screen to open its viewfinder, so no new
      cross-component state was needed; `'pick'` and `'record'` still click
      the one hidden file input, which now carries `capture="environment"`
      only for `'record'` rather than a second near-duplicate input.

      Fixing "Record now" cost nothing extra once the mechanism existed and
      was in the same two files, so it went in too: a first run through it
      used to land on a generic file browser instead of the phone's camera
      app, silently, because it funnelled through the same single-destination
      `finishFirstRunGuide` "Check your framing" did. Both are the identical
      root cause. The continue button's own label now says which of the three
      it is about to do — "choose my video" / "open my camera" / "check my
      framing" — rather than a fixed sentence that was wrong two times out of
      three.

      Found and deliberately left alone: a file dropped on the dropzone during
      a first run is discarded rather than carried through the guide, so the
      player has to find and pick it again afterwards. Same family of bug,
      genuinely separate fix — it needs holding a `File` across the
      interstitial rather than redirecting a click — so it is named here and
      not built, per the one-round rule.

      Verified live, not by inspection: `localStorage` cleared, each of the
      three buttons dispatched as the *first* tap in a fresh session. All
      three now open the guide; the continue button reads correctly for each;
      finishing correctly opens the camera checker for `'check'` (confirmed
      the hidden file input is never clicked), and correctly carries
      `capture="environment"` into the click for `'record'` (confirmed at the
      moment `HTMLInputElement.prototype.click` fires, not merely present in
      the DOM). Assembled entirely from existing primitives, tokens and
      copy patterns — no new colour, no restyled surface, per constraint 3.
- [x] **R17** — Build the second worst: reading the read-only "How to film
      it" strap now counts as having read it. The naive fix — mark
      `seenFilmingGuide` when that sheet closes — was checked against the
      caution this round opened with and confirmed it would have regressed
      things: `needsFilmingGuide` gated both the rules and the handedness
      question as one flag, so a stranger who only read the rules would then
      have "Analyse a serve" skip straight to the file picker with no hand
      ever asked. Split the gate instead. `Home.tsx`'s prop is now
      `needsHandedness`, true only until `prefs.handedness` is set — the
      three entry points still open the shared interstitial until a hand is
      on record, never more, never less. The read-only guide sheet
      (`sheet === 'guide'`) marks `seenFilmingGuide` in its own `onClose`.
      The interstitial itself (`sheet === 'guide-first'`) reads that same
      flag to decide whether `<FilmingGuide />` renders again — skipped with
      the title changed to "One more thing" when the rules were already
      read, shown under the original "First, how to film it" title
      otherwise — but `HandednessPicker` renders unconditionally either way,
      because the sheet only opens at all when a hand is still missing.

      Verified live, both directions, `localStorage` cleared each time: read
      "How to film it" first, closed with Escape, confirmed `seenFilmingGuide`
      landed true with no `handedness` yet; tapped "Analyse a serve" next and
      confirmed the rules did not render a second time while the handedness
      question still did, picked a hand, confirmed `handedness` landed in
      `localStorage` and the file picker (not the camera) was the input
      clicked. Reran the untouched path as a control — a fully fresh install
      tapping "Analyse a serve" first — and confirmed the rules and the
      handedness question still render together exactly as R16 left them.
      No new copy beyond the one conditional sheet title; no new colour, no
      restyled surface, per constraint 3.
- [x] **R18** — Walked the home screen live as a stranger, coarse pointer,
      `localStorage` cleared, rather than assuming a gap from memory — R15's
      audit had looked closely at this same screen and not flagged this.
      Read the DOM's own layout order and computed styles rather than judging
      from source: on a phone, "Analyse a serve" (primary) and "Record now"
      (ghost, equally sized) sit at the very top, both reading as "hand me a
      video" — one a file browser, one the phone's own blind camera app. The
      actual best feature, `FramingCheck`'s live verdict on angle and tilt
      while aiming plus a record button of its own, sat fourth of five
      controls, styled identically to two purely informational straps, and
      its own copy ("Point the phone at your spot and see what the coach can
      read") never once said the word record. A player who wants to record
      now has an obviously-labelled button already on screen for exactly
      that, and it is the worse one — the better route not hidden by
      position so much as by every signal on screen agreeing it is optional.

      Fixed by removing the choice rather than re-labelling it. Where a live
      preview can start at all (`previewSupported()`, checked once before
      either button renders), "Record now" now opens `FramingCheck` directly
      — real-time coaching, then its own record button — instead of handing
      off blind. The separate "Check your framing first" strap, now the same
      destination on a phone, does not also render there; it stays exactly
      as it was on desktop, which never had a "Record now" button to fold
      into and still needs its own way to the same check. The blind
      hand-off — `capture="environment"` straight to the OS camera app —
      is now the fallback for the one case that still needs it: a browser
      that cannot start a live preview at all, where `FramingCheck`'s own
      denial screen already points back at that same camera app and the file
      picker, unchanged from before this round.

      Verified live in both configurations: with a live preview available,
      confirmed exactly one "Record now" appears (not two), that tapping it
      through a fresh first run correctly asks for a hand then opens the
      framing checker — not the hidden file input, confirmed by instrumenting
      `HTMLInputElement.prototype.click` and finding it never fires — and
      that `localStorage` records `seenFilmingGuide`/`handedness` exactly as
      R16/R17 left them. Reset to a desktop viewport and confirmed the strap
      is untouched: no "Record now" button renders at all there, coarse-only
      as it always was, and "Check your framing first" still opens the same
      sheet it did before this round. No new colour, no restyled surface —
      the promoted button reuses the exact `btn--ghost btn--big` classes
      "Record now" already had; the change is which handler is behind the
      same label, decided by a condition already computed on every render.
- [x] **R19** — Traced the path by reading `Report.tsx` and `App.tsx` rather
      than guessing, then confirmed live with seeded sessions rather than
      trusting the trace alone. The count from a fresh report: three taps,
      across two screens the report itself never mentions. `onLogDrill` lives
      only on `PracticeCard`, and the only place that ever rendered was the
      progress sheet — back to home (1), tap "Your form" (2, and absent
      entirely below two comparable sessions), scroll, tap "I did this drill"
      (3). A player reading "Work on this next" on the report they just
      filmed had no way to know a logging control existed anywhere, let alone
      where.

      One tap removed — three of them, in fact, all at once, by removing the
      screen change rather than shortening the route to it. `practice`,
      `logDrill` and `undoDrill` were already sitting at the top of
      `App.tsx`, already computed from the whole session history rather than
      from whichever report happens to be open, already exactly what the
      progress sheet's card was built on. `Report.tsx` now takes the same
      three as props and renders the same `PracticeCard` component,
      unmodified, directly under "Work on this next" — a season-long focus
      beside a single serve's causal fix, deliberately not merged into one,
      because `practice` and `plan[0]` can honestly name different
      measurements and conflating them would mean logging a drill against a
      metric id the practice tracker was never asked about. Wired at both
      `<Report>` call sites, a fresh analysis and a reopened saved one alike,
      since `practice` does not care which report is on screen.

      Verified live, not by inspection: two sample sessions saved directly
      through `saveSession` (deterministic synthetic dials, so both share the
      same weakest measurement — the exact condition `findPracticeFocus`
      requires), reloaded, opened a saved report, and found "Practise this"
      rendered immediately under the fix with "I did this drill" live —
      tapped it, watched the count and the headline both update in place, hit
      "Undo the last one", watched both revert. Confirmed the progress
      sheet's own copy of the same card is untouched and reads the same
      state. No new markup, no new CSS: the same component, unmodified, in
      one more place.
- [ ] **R20** — Does the timeline hold 60 fps on a long clip with the overlay
      drawing? Deliverable: the frame budget measured, worst offender fixed.
- [ ] **R21** — Keyboard, focus, contrast and reduced motion across the surfaces
      added since the last accessibility pass — `Glance`, `FramePair`, the dial,
      the device check. Deliverable: the same standard the player already meets,
      without moving a pixel of the design. **Phase close-out.**

## Phase 4 — Feature and retention (R22–28)

- [ ] **R22** — The share card is one serve; a coach wants the basket.
      Deliverable: an export a coach can read without the app, or the reasoned
      refusal written into `reportCard.ts` the way 5c's was.
- [ ] **R23** — Does one-tap share actually work everywhere? `navigator.share`
      with files is refused by more browsers than accept it. Deliverable: the
      fallbacks tested rather than assumed.
- [ ] **R24** — Is export and import a thing a non-technical player can do?
      Deliverable: the path walked, and the worst step fixed.
- [ ] **R25** — Is a session a thing the app knows about? Reports are keyed per
      serve; a trip to the court is not represented anywhere. Deliverable: the
      answer, and whether it earns a type.
- [ ] **R26** — A milestone that is not a badge. Deliverable: something worth
      telling somebody after six weeks that survives the no-gamification rule.
- [ ] **R27** — What brings somebody back on Thursday? "Then, and now" exists and
      is two sheets deep. Deliverable: reachability measured, not a notification.
- [ ] **R28** — Copy pass over every line added in Phases 1–4, against the
      twenty-five-word cap and the coach jargon the lint cannot see. **Phase
      close-out.**

## Phase 5 — Security, privacy, QA, freeze (R29–35)

- [ ] **R29** — Egress audit. Every request the running app makes after load,
      enumerated and justified or removed. Deliverable: a test that fails when a
      new one appears.
- [ ] **R30** — What does an export contain that a player would not expect to
      hand somebody? Deliverable: the contents stated in the UI at the moment of
      export.
- [ ] **R31** — Stress the ingestion: a thirty-minute clip, a one-frame clip, a
      rotated clip, 4K, and a file that is not a video at all. Deliverable: five
      answers a player can act on, none of them a stack trace.
- [ ] **R32** — Re-read `UNDER_RESOLVED` and `UNCALIBRATED`. Deliverable: per
      signal, the exact evidence that would move it — or the statement that none
      exists and it stays withdrawn.
- [ ] **R33** — Fold in whatever the court trip and the fixture shoot returned,
      or restate both asks with what has been learned since. Neither is closed by
      anything above.
- [ ] **R34** — DRY and dead-code purge across the whole tree, then README end to
      end against the code. It is the deliverable, not an afterthought.
- [ ] **R35** — Freeze. Final green run recorded, the open gaps stated plainly,
      the loop stopped. Do not start an R36.

---

## Still open, and not closed by anything above

- [!] **The court trip** — **blocked: needs a phone.** Recording off the
      viewfinder, the glance screen and the target dial shipped and none has run
      on a device; the pane they were built against reports `document.hidden`.
      `COURT-CHECK.md` is the twenty-minute list that settles it, and steps 1, 2
      and 9 need no racket. Two candidates were chased down without a phone and
      both came back clean: the glance already says "6 serves in that clip — this
      is number 6", and `?demo=live` captures no stills, so **the dial has still
      not been seen drawn on a real frame**. R33 folds in whatever comes back.
- [!] **The fixture shoot** — **blocked: needs real footage.** `RECORDED` in
      `src/lib/analysis/__tests__/fixtures/index.ts` is empty, 0 of
      `MINIMUM_RECORDED = 6`. Six clips clear the gate and the order is in
      `fixtures/README.md`: right-handed side-on at 30 fps, the same serve in
      slow motion, the same player front-on, a **left-hander** side-on at 30 fps,
      that left-hander at 60 fps from a second angle, and one right-hander
      side-on with the feet deliberately out of frame. The left-handed pair
      cannot be faked by mirroring — that is what a front camera does and the app
      already treats it as an artifact. Until those exist: hip–shoulder
      separation and shoulder tilt are unvalidated against anything real,
      `NOISE_FLOOR` has no measurement behind it, and every entry in
      `UNCALIBRATED` stays there.

## The record

**Phase 2 — core logic and reliability**, seven rounds landed, ledger in git
at `0f0817e`. The pattern across the phase: measuring what a round asked
about, rather than inspecting the code and guessing, kept finding real gaps.
A racket wrist MediaPipe froze on a stale guess through an occlusion read as
a clean track to the existing blur statistic and reported a fabricated
racket drop at full confidence — caught only by asking whether the hand had
travelled at all, a different question from how erratic its track was
(`frozenThroughSwing`, `kalman.ts`). Every sample the extraction pipeline
took was filed under the time it *asked* the video to seek to rather than
the time the seek actually reached, feeding fictional precision into every
downstream derivative (`seekTo`, `pose/extract.ts`) — and fixing it surfaced
a real `!(...)` falsy-zero bug along the way. The ball tracker's curvature
gate checked height against time and nothing about width, so two unrelated
background objects on their own smooth paths could be stitched into a false
toss a quarter of the time (`X_CONSISTENCY_BAND`, `vision/ballTrack.ts`,
24%→7%). A basket's consistency comparison never checked the serves came
from the same body at all (`possibleHandoff`, `consistency.ts`). Two rounds
measured and found the code already correct — confidence under poor light,
handedness under noise — and needed a new rig capability and an ensemble
test to say so with evidence rather than an inspection. And one round found
an asymmetric, unresolved cost rather than a bug: camera-angle detection
rarely mis-reads an unreadable angle as readable, but readable angles near
the boundary are over-hedged as unreadable most of the time, and two
candidate fixes each helped one angle while hurting another — measured and
pinned rather than force-fixed. Severe rotation, driven past the roll
correction's own clamp, is refused rather than measured through it.

**Phase 1 — performance, storage, architecture health**, seven rounds landed,
ledger in git at `e8579f2`. Every constant governing the biggest allocation the
app ever holds — sampled frames per serve, serves per basket, the heap budget —
was measured or given a name it never had (`footprint.ts`, `MAX_FINE_FRAMES`),
with the budget computed from those constants rather than copied from them so
raising either turns a test red. The JS heap held flat across ten consecutive
real analyses, on the clip this repo can produce without real footage
(`leakProbe.ts`); two canvas users only a found serve would reach stay open
against the same missing-footage block as the fixture shoot and the court trip.
A stored report's real byte cost was measured rather than guessed — 27–80 KB a
still depending on aspect ratio, not the flat 48,000-character stand-in the
tests had used — and the three-level pressure ladder that bounds history size
went from asserted to driven (`planPrune`, `storage/db.test.ts`). The most
concrete find: a report that survived every retry and still could not be saved
used to vanish exactly like one that had, because `void` was the fallback
value for both "saved" and "silently didn't" — fixed in `App.tsx` and
`importBackup` alike. And the implicit state machine in `App.tsx` stayed
implicit, on the finding that its four satellite pieces are each scoped to one
screen already; every transition is now a table on `View` instead of a
reducer nothing needed.

**The five themes**, completed across 36 commits; outcomes in `README.md`, full
ledger in git at `4e552d0`. Ground truth and the fixture gate; the basket
promoted to the main event with best-against-worst named and paired; a
player-side drill record in its own store; recording and glancing on court; the
target dial in the callout plate rather than a wedge at the joint, because the
arc is a locator and the number is world-space.

**The device-truth phase**, five rounds landed, ledger in git at `b0ad033`.
`lib/selfCheck.ts` and the `?check` panel, in the production bundle unlike
`?demo` because a check that only runs in a dev build cannot be run on the phone
that matters. `deviceReportText` renders it deterministically under a fixed
`REPORT_VOCABULARY`, walked by a test, with the user agent deliberately absent.
`COURT-CHECK.md` written. And the defect it found before a phone did:
`recordingType` picked a container from a list *ordered by* likely decodability
and never asked the decoder, so a browser where that guess is wrong would have
handed the player a file nothing could open. It asks now; a readable container
beats a higher-ranked unreadable one; a silent decoder falls back rather than
deleting a working button.
