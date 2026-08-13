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

## Phase 2 — Core logic and reliability (R8–14)

The engine is honest about what it cannot see. The open question is whether it
notices the specific ways amateur footage goes wrong, or only the ways the
synthetic rig can produce.

- [x] **R8** — It invented a racket drop that never happened, at full
      confidence. `dropout`, the rig's existing occlusion dial, only ever
      touches leg landmarks and only ever *lowers visibility* — the easy case,
      already caught by the visibility check `metricConfidence` already runs.
      A new `occlusionSeconds` dial freezes the racket wrist at its position
      from the drop for a stated span, visibility untouched — the case R8 asked
      about, and the one `kalman.ts`'s own docstring already named as the real
      danger. Driven at 0.5 s: `dropDepth` flipped from 0.237 to -0.156 — not
      noise, a different sign, a racket drop reported as not having happened —
      at confidence 1.000. `blurOf`'s zig-zag statistic never saw it, because a
      track MediaPipe has frozen on a stale guess is smooth, not noisy, and
      zig-zag is a curvature statistic. Confirmed rather than assumed: a test
      pins that the existing statistic reads 0.00 here, specifically so nobody
      "simplifies" the fix back out.

      Fixed with a second, different question — not how erratic the track is,
      how far it travelled — asked only over drop-to-contact, the one stretch
      of any serve guaranteed to be a large excursion by construction (`drop`
      is the lowest point after the trophy, `contact` the highest of the
      swing). `frozenThroughSwing` in `kalman.ts`, threshold at a twelfth of
      standing height against the rig's own ~0.7 for a clean serve — enormous
      margin on both sides, and the full suite (400+ existing checks across
      every dialled fault) passed unchanged, so nothing already calibrated
      moved. The frozen case now scores blur 1.0 and is refused — sometimes as
      `too_blurry`, sometimes as `too_few_frames` when the frozen wrist also
      confuses where the drop and contact keyframes land; both are the same
      honest outcome and the test accepts either rather than asserting one.
- [x] **R9** — Every derivative in `kinematics.ts` — `rateOf`, `sampleRadius`,
      `frameRadius`, `refinedPeakTime` — already reads real per-sample gaps
      rather than assuming a fixed frame rate; that half of the assumption was
      already defended, at length, in prose already in the file. What was not
      defended: `extractFrames`, `scanForServes`, `preflight` and `readBitmaps`
      all requested an evenly-spaced grid of times from the video and then
      **filed the sample under the time they asked for**, not the time
      `video.currentTime` actually landed at after the seek. `seekTo`'s own
      docstring already named the failure case where a seek times out; it did
      not name the ordinary case, where a seek succeeds within tolerance but a
      few milliseconds off target — which is not rare, it is what a decoder
      snapping to its nearest real frame does on every seek. So every one of
      those carefully dt-aware functions downstream was computing exact
      derivatives from admittedly-inexact numbers.

      Fixed at the source: `seekTo` now returns the achieved
      `video.currentTime` (or `false` on genuine failure) instead of a bare
      boolean, and all five callers file that instead of the request. One real
      bug caught fixing it: three call sites used `!(await seekTo(...))` to
      detect failure, which reads a returned `0` — landing exactly on the first
      frame of a clip — as falsy and therefore as a failure. All now compare
      `=== false` explicitly.

      Verified live rather than assumed: the Node suite cannot reach this code
      at all — the synthetic rig builds `Frame[]` directly and has never gone
      through a `<video>` element — and the real browser tooling in this
      environment cannot run timer- or compositor-driven code while its pane is
      not displayed (the same limit the court trip already recorded, now
      costing a different kind of check). Worked around with a fake
      `HTMLVideoElement` driven by microtasks instead of timers — outside that
      throttling entirely — that returns a deliberately jittered
      `currentTime` on every seek. Before this fix that harness's output was a
      perfectly even grid regardless of the jitter fed in; after it, the
      recorded timestamps carry the jitter, exactly as they should.
- [x] **R10** — Already true, and it needed a rig capability and a test to say
      so rather than an inspection. `metricConfidence` already reads landmark
      visibility directly, and `blurOf` already folds it in through `unseen` —
      the wiring R10 asked whether existed was already there. What did not
      exist was a way to *drive* it: every clip problem the rig could dial was
      local — one limb, one frame, one occlusion — and dusk is not local, it
      dulls the whole body's visibility at once. A new `lightLevel` dial does
      that: every landmark's visibility scaled uniformly, position untouched,
      so anything that moves downstream moved because of confidence, not
      because the rig quietly changed the answer.

      First pass through this round measured nothing: calling `measure()`
      without a confidence context — which is a valid call, and what
      `dev/sampleAnalysis.ts` itself does — reports every metric at confidence
      1 by construction (`ctx ? metricConfidence(id, ctx) : 1` in
      `metrics.ts`), so a sweep against that always read back an unmoved
      1.000. Rebuilt to assemble the context the way `analyze.ts` actually
      does, blur included, and the real shape appeared: at dusk (`lightLevel`
      0.55) `dropDepth` and `contactHeight` fall to 0.46 confidence and
      `kneeBend` to 0.67, while the *values* do not move at all — the camera
      read them correctly, the app is only less sure of what it read. Below
      `LIMITS.visibility` the clip is refused outright as `body_not_visible`
      rather than measured at a confidence too low to trust — the cliff is by
      design, not a gap. All three pinned in `robustness.test.ts`.
- [ ] **R11** — How often is the ball missed, and how often is something else
      found? Deliverable: false-positive and false-negative figures on the rig,
      printed by the suite so they cannot age silently.
- [ ] **R12** — Does the multi-body hand-off check cover the sweep, or only the
      single serve? A basket filmed at a club has other people in it by
      definition. Deliverable: the check where the sweep can see it.
- [ ] **R13** — Does handedness and camera-angle detection survive noise, or only
      clean landmarks? Deliverable: both driven through the ensemble.
- [ ] **R14** — Rotation metadata and portrait clips. `axes.ts` assumes the
      sensor told the truth about which way was up. Deliverable: the assumption
      tested against a clip where it did not. **Phase close-out.**

## Phase 3 — UX and onboarding (R15–21)

- [ ] **R15** — What does a genuine first run look like today? There is a
      `guide-first` sheet and a `firstRunPickRef`; nobody has walked the whole
      path as a stranger. Deliverable: the walk written down, gaps named, no
      code.
- [ ] **R16** — Build the worst of those gaps. Assembled from `primitives.tsx`
      and existing tokens — constraint 3 is not negotiable for onboarding.
- [ ] **R17** — Build the second worst.
- [ ] **R18** — Can a player find the on-court record route at all? It is the
      best feature in the app and it hides behind a screen most people read as a
      file picker. Deliverable: discoverability, without a tour.
- [ ] **R19** — How many taps from "that is my fault" to "I did the drill"?
      Deliverable: the count, and one tap removed if there is one to remove.
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
