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

## Phase 1 — Performance, storage, architecture health (R1–7)

Constraint 8 — no component over ~500 MB on a phone — is an assertion nobody has
checked, and so is every claim about what a stored report costs. This is also
where the state machine hiding in `App.tsx` gets a name.

- [x] **R1** — Ledger re-cut from forty rounds to thirty-five, against the six
      pillars. The eight rounds already banked are carried, not redone: the
      device-truth phase's five landed rounds are compressed into the record at
      the foot of this file, and its two court-trip blocks are carried forward
      whole. Phases re-led — what was Phase 3 leads now, because memory and
      storage are the oldest unchecked assertions in the repo.
- [x] **R2** — `lib/footprint.ts`, with the constants **measured on every run**
      rather than asserted: the test allocates the real shapes and reads the
      heap, and fails on a two-fold move either way. Worst single serve **1.4 MB**
      (1.1 frames, 0.3 stills), a swept basket of eight **10.9 MB**, canvases
      negligible because the ball pass runs 256 px wide and the stills 420, both
      scaled down — 4K footage does not enlarge them. A landmark costs **120
      bytes to hold 32 bytes of numbers**, because V8 boxes each double; that one
      constant is most of the total.

      Two findings worth keeping. **The memory and storage budgets have opposite
      shapes** — in memory the frames dominate, in storage there are no frames at
      all, so a test asserting the README's "stills are nearly all of it" against
      an in-memory report fails, correctly. And **the answer is bounded on one
      side only**: the JavaScript half is ~50× under the ceiling, and everything
      that could breach it is in `UNSEEN` — the decoded video, the WASM heap, the
      GPU copies. None of those is reachable from script, so they are named
      rather than estimated. R3 has to bound what it can and say so.
- [ ] **R3** — Bound the pipeline to it. Deliverable: a test that fails when the
      bound is exceeded, not a comment saying what the bound should be.
- [ ] **R4** — Is the heap flat across ten consecutive analyses? Object URLs,
      canvases, the landmarker, `MediaRecorder` chunks, the paired stills held in
      App state. Deliverable: the leak, or the proof there is none.
- [ ] **R5** — What does one stored report actually cost? Stills are JPEG at
      0.72; `KEEP_STILLS = 20`, `KEEP_STILLS_UNDER_PRESSURE = 3`. Deliverable:
      the real byte cost, and a test that drives the pressure ladder rather than
      trusting it.
- [ ] **R6** — What happens when the browser refuses a write? Quota exceeded
      mid-save, an import larger than the quota, a device that never grants
      persistence. Deliverable: each path ends somewhere a player can act.
- [ ] **R7** — Where does App state live? 19 hooks across ~1,100 lines, and
      `view`, `sweep`, `pair` and `thenNow` are stages of one machine.
      Deliverable: the machine made explicit, or the reason it stays implicit
      written beside the code, plus a test on whichever transitions can strand a
      screen. **Phase close-out**: README synced, dead code purged, entries
      compressed.

## Phase 2 — Core logic and reliability (R8–14)

The engine is honest about what it cannot see. The open question is whether it
notices the specific ways amateur footage goes wrong, or only the ways the
synthetic rig can produce.

- [ ] **R8** — What does a limb hidden for half a second do to the report?
      `kalman.ts` holds a landmark through blur; occlusion is a different
      failure, and MediaPipe answers it by guessing rather than by declining.
      Deliverable: occlusion driven in the rig, and confidence that falls.
- [ ] **R9** — Are frames assumed evenly spaced? Real clips drop frames and
      phones record variable frame timing. Deliverable: the assumption located,
      and either defended in prose or removed in code.
- [ ] **R10** — What does bad light do? Low contrast lowers landmark visibility
      before it lowers accuracy. Deliverable: the visibility signal traced into
      `confidence.ts`, and a clip filmed at dusk degrading rather than lying.
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
