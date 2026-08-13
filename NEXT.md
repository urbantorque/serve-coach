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

## Phase 4 — Feature and retention (R22–28)

- [x] **R22** — Read `reportCard.ts` before assuming either answer. Its own
      doc comment already carries a reasoned refusal — the paired keyframe
      stills (best-against-worst, then-against-now) are deliberately absent
      from the single-serve card, because half of a comparison shared
      without the dates or serve numbers that give it meaning says nothing.
      That refusal is about *pictures*, though, and does not reach
      `Consistency`: the score, which serve was which, and the named
      differences between the best and the worst all already read as words,
      and `ConsistencyPanel` proves every one of them survives a reopened
      report with no clip behind it. A basket export was buildable, not a
      second refusal — the data just needed a second drawing function, not
      a second engine.

      `renderBasketCard`/`shareBasketCard` in `reportCard.ts` draw exactly
      what survives without the clip: the consistency score, per-serve
      chips, the best-against-worst comparison in the same body-language
      phrases `ConsistencyPanel` uses, and `possibleHandoff`'s caution when
      it applies — ahead of the comparison it qualifies, since dropping the
      one sentence that says "read this carefully" would be the
      confident-nonsense failure this app is built against, aimed at a
      coach who never sees the panel's own warning. Deliberately scoped down
      from the panel's own nineteen measured spreads (live count, on the
      demo basket) to the two `Consistency` already flags as worth
      naming — `weakest`/`steadiest` — on the same restraint the
      single-serve card already applies to itself: everything would not be
      a card read at the net, it would be the panel again in a different
      frame. A "Share this basket" button in `ConsistencyPanel.tsx`, styled
      identically to `Report.tsx`'s own share button and reusing its exact
      state machine (`idle`/`working`/`done`), calls it.

      A real bug found by rendering the card, not by reading the layout
      math: the first version right-aligned the best and worst readouts a
      fixed 200px apart, which collided into overlapping unreadable text
      the moment one phrase ("Struck at full racket reach" against "Struck
      below full reach") ran wider than the gap — confirmed against the
      demo basket's own data, not a synthetic worst case. Fixed by stacking
      each value on its own full-width line instead of two competing
      right-aligned columns, then reconfirmed against both the ordinary
      basket and a forced `possibleHandoff` case.

      Verified live: rendered the card directly against the demo basket's
      real `Consistency` object and inspected the PNG, twice — once for the
      overlap bug, once after the fix — then drove the actual button
      through its full state machine (`Preparing…` → a real
      `HTMLAnchorElement.download` triggered with the correct
      `basket-2026-08-14.png` name → `Saved`) with `.click()` instrumented
      rather than trusting the state names alone. Full suite green.
- [x] **R23** — Read `shareBlob` (added in R22) before assuming it already
      handled every refusal, and found it had never been asked "what if the
      capability check itself is unreliable" — the exact question
      `record.ts`'s `recordingType` already asks about `isTypeSupported` and
      `canPlayType`, applied nowhere in the sharing path. Two real gaps, both
      the same shape: `nav.canShare?.({...})` sat outside the `try`, so a
      browser whose `canShare` throws would have propagated an unhandled
      rejection out of the whole share flow instead of falling back to a
      download; and a browser with `share` but no `canShare` — an older or
      partial implementation — was refused a share attempt entirely, the
      identical mistake `recordingType` already guards against for a
      `canPlayType` that is absent rather than negative. Neither was a
      hypothetical: this is precisely how "refused by more browsers than
      accept it" happens in practice — not one missing API, several
      partially-present ones each closing the door a different way.

      Fixed by extracting the decision into `attemptShare`, injected with a
      `ShareNavigator` the same way `recordingType` is injected with a fake
      `MediaRecorder`/`<video>`, so the choosing can be tested without a
      browser to really share into. A throwing or absent capability check
      now reads as "try it", never as a hard no, on both counts; the
      existing try/catch around the real `share()` call is what actually
      decides shared, cancelled or fallen-through — unchanged, because it
      was already reading `AbortError` correctly.

      Eight tests in the new `share/__tests__/reportCard.test.ts` drive
      every combination a fake `navigator` can produce: no `share` at all;
      `canShare` saying no without `share` ever being called; `share`
      present with no `canShare` tried anyway; a throwing `canShare` tried
      anyway; a clean share; a dismissal read as cancelled, not failed; a
      real failure read as failed, not cancelled; and a closed-set pin on
      the four possible outcomes so a fifth cannot get added without this
      file noticing. Verified live as well, not only in Node: both share
      buttons (`Report.tsx`'s and R22's basket one) driven end to end
      through the refactored code with `HTMLAnchorElement.prototype.click`
      instrumented, confirming the real download names still land correctly
      after the extraction.
- [x] **R24** — Walked live, `StoragePanel`/`backup.ts` read first but not
      trusted as the answer: two sessions seeded via `saveSession` directly
      (no real footage available), history sheet opened, export tapped with
      `HTMLAnchorElement.prototype.click` instrumented to confirm a real
      file (`serve-coach-2026-08-14.json`) rather than trusting the
      resolved promise alone. Every button already does what it says —
      export downloads and reports a count, import merges rather than
      replaces, and three failure paths tried live (malformed JSON, valid
      JSON that is not a backup, re-importing the same data) each produced
      a plain sentence a non-technical player could act on, none of them a
      stack trace. Neither button was the worst step.

      The worst step was between them, and only visible by reading every
      word of copy on the panel rather than testing behaviour alone: "An
      export is one file holding your scores and keyframe pictures. Moving
      it is the only way your history follows you to a new phone." — a
      promise made and left unkept in the same sentence. Backup exists,
      per `backup.ts`'s own doc comment, specifically so history survives a
      new phone; the one non-technical player for whom that use case
      matters most reads a sentence that names the destination and never
      the route. A player who already knows a downloaded file can be
      emailed, AirDropped or dropped in a cloud drive does not need the
      sentence at all; the player this feature is supposed to serve does.

      Fixed with copy alone — `StoragePanel.tsx`'s `sheet-note`, same class,
      same position, one sentence longer: three concrete, platform-agnostic
      ways to move a file (email, AirDrop, a cloud drive) and what to do
      with it on the other end ("open it there and tap Import from a
      file"), closing the loop the old sentence opened and never finished.
      No new UI, no new colour — constraint 3's normal tasteful-refinement
      latitude covers a sentence. Verified live: the new copy renders in
      full inside the history sheet with the seeded sessions still present,
      nothing truncated, nothing broken.
- [x] **R25** — Read `db.ts`'s `Session` type and `sessionKey.ts` before
      assuming the answer was no. It was not: `sessionKeyFor`/`clipIdOf`
      already group serves by *clip* — which basket a serve came from — and
      `progress.ts`'s `thenAndNow` already refuses to compare two reports
      filed minutes apart, in a comment that says "the same trip to the
      court" outright. The concept was never missing. It was unnamed: a
      24-hour threshold, `MIN_THEN_AND_NOW_GAP_MS`, written inline into the
      one function that needed it, untested on its own, and not something a
      second caller could reuse without reading that function's comment and
      reconstructing the comparison by hand.

      Named rather than built: `sameTrip(a, b, gapMs)` in `progress.ts`,
      `thenAndNow` rewritten to call it. No behaviour changed — the same
      24-hour threshold, the same strict comparison at the boundary — only
      the concept now has a signature instead of living inside one
      function's control flow. Deliberately not a stored `Trip` type: no
      feature asked to persist a trip, reference one by id, or query "every
      trip in the last month" — clipIdOf earned its extraction because
      `progress.ts` and `consistency.ts` both needed to collapse by clip
      already, and nothing here shows the same double demand for a
      persisted visit. A type earned by two callers is a real
      abstraction; a type earned by zero is a guess at a future one, which
      is exactly what this programme's own rule against premature structure
      says to leave alone.

      Found and named, not fixed: `findPracticeFocus`'s window
      (`PRACTICE_WINDOW = 5`) counts sessions, not trips. Its own doc
      comment says the point is catching "the thing that is *still* wrong
      three weeks later" rather than a single day's noise — but a player
      who records six serves in one sitting through the coached live
      preview R18 just made the default mobile path fills that entire
      window with one trip, and the recommendation becomes about that
      sitting's variance rather than what persists across visits. Real, and
      out of scope here: R25 asked whether the concept existed and whether
      it needed a type, not to redefine what a practice window counts —
      changing that changes `PracticeFocus.sessionsConsidered`'s meaning
      everywhere it is printed, which is its own round.

      Pinned with nine tests in the new `lib/__tests__/progress.test.ts` —
      the first either `sameTrip` or `thenAndNow` has had: the boundary
      itself (exactly the threshold apart reads as a different trip, not
      the same one), argument order not mattering, a custom gap being
      honoured, and `thenAndNow` choosing the true oldest and newest rather
      than two reports in the middle.
- [x] **R26** — Read `LOOP.md` in full for the constraint this round's own
      wording assumes rather than finding a rule by that name — there is
      none written down as such. What exists is `PracticeCard`'s own
      standard, already in the codebase: "deliberately not a streak, a
      badge or a congratulation... an app that celebrates the tap is asking
      to be tapped, which would fill the record with drills nobody did and
      make the evidence worthless." The deliverable was stretching that
      rule from a single rep to a training block, honestly, not inventing
      an achievement system and calling it something else.

      `sixWeekMilestone` (`progress.ts`): one sentence, gated on the same
      rubric-era discipline `thenAndNow`/`buildProgress` already apply,
      comparing the current rolling `recentAverage` against the score the
      player's very first serve in this era got, once a real six weeks
      separate them. Reports every direction the same way — improved, flat,
      or backwards — because a milestone that only speaks up on good news
      is the same lie a badge tells with the shape sanded off. Surfaced on
      the home screen's "Your form" card, reusing the existing
      `.progress-foot` class verbatim: no new colour, no new component, one
      more line that is either there or is not.

      `Progress` gained one field, `first` — the era's oldest point,
      alongside the `latest` it already carried — rather than have the new
      function re-derive the era `buildProgress` had already computed.
      Fifteen tests now live in `lib/__tests__/progress.test.ts` (R25's
      `sameTrip`/`thenAndNow` cases plus six new ones here): the boundary
      itself, a flat six weeks read as flat rather than forced into a
      direction, a regression reported exactly as plainly as an
      improvement, and a recalibration refusing to be used as the "before"
      for a score it did not produce. Verified live as well: seeded a first
      serve six weeks back and three recent ones through direct IndexedDB
      writes (no real footage to film one with), confirmed the sentence
      renders correctly with real numbers and disappears cleanly on a
      two-serve, two-day history that has not earned one yet.
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

**Phase 3 — UX and onboarding**, seven rounds landed, ledger in git at
`b1f8a01`. Four of the seven turned on the same discipline: walk the surface
live, as a stranger, rather than trust a reading of the source — R15's audit
found two real gaps in the first-run guide by driving it, not by inspecting
`onGuideThenPick`, and R18 found a worse one in the same spirit three rounds
later on a screen R15 had already looked at closely, because the actual
question ("which button gets tapped, and where does it lead") only answers
itself live. `onGuideThen(intent)` (`App.tsx`) replaced a guide sheet built
for one destination with one that remembers which of three reasons opened
it — a file picker, the phone's camera app, or the live framing check — so
"Record now" and "Check your framing first" both land where their own
copy says they will (R16). The same guide's single `seenFilmingGuide` flag
was found doing two jobs that needed splitting — "has read the rules" and
"has stated a hand" — after the naive one-line fix was checked against a
written caution first and found to regress the second job silently (R17).
"Record now" itself turned out to be two different technical routes to the
same promise, and the prominent, obviously-labelled one was the worse
route — a blind hand-off to the OS camera, no feedback, sitting above the
app's actual best feature, a live framing coach with its own record button,
demoted to a strap that never said the word "record" (R18). A drill-logging
control that already worked correctly was reachable only by leaving the
report entirely — three taps, two screens, and nothing on the report itself
said it existed — fixed by reusing the exact same `practice`/`logDrill`
component in a second location rather than writing anything new (R19). And
one round measured rather than fixed: `PosePlayer`'s trail and ball-flight
drawing already bucket into a fixed stroke count regardless of clip length,
per an earlier round's own comment naming the cost it replaced — trusting
that comment would have been the same mistake the phase kept finding
elsewhere, so R20 drove `drawSkeleton` at ten times the frames and pinned
the flat stroke count in `drawing.test.ts` instead of restating the
comment. R21 closed the phase with a live accessibility pass over the four
surfaces added since the last one: `Glance`'s lead score had no accessible
name (`role="img"` now supplies one); `FramePair`'s best-against-worst
colouring carried no signal for anyone who cannot see colour, fixed with
screen-reader text for the one caller that can honestly claim a "better"
side, and left unclaimed for "Then, and now", which orders by date and
cannot; `DeviceCheck`'s copy button changed its own label on success or
failure and told nobody listening, closing the same `aria-live` gap already
closed elsewhere in the app; and the keyframe callout's target dial was
found already meeting the standard — its every value has a textual twin in
the fundamentals list, its accent colour measures at roughly 9.7:1 against
its plate even under an adversarial background, and its redraws were
already gated by R20's own finding. Named, not fixed, because fixing it
would move a pixel this phase was not allowed to move: `FramePair`'s
CSS colours the left figure as the better serve unconditionally, which is
true by construction for the basket comparison and merely lucky, half the
time, for "Then, and now" — a real defect for a future round, not an
accessibility gap this one could close.

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
