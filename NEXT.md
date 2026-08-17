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

## Phase 5 — Security, privacy, QA, freeze (R29–35)

- [x] **R29** — Re-read `LOOP.md`'s constraint 7 before assuming it needed
      enforcing rather than checking: "no network call after load... the
      one load-time fetch is the pose model and the WASM runtime" was a
      claim in prose, asserted nowhere in the test suite. Grepped the whole
      tree for every syntactic way a browser starts a request rather than
      trusting memory of what the codebase does: two real call sites,
      `poseEngine.ts`'s `fetch(MODEL_URL)` and `reportCard.ts`'s
      `new Image()`. Traced further than the grep: `MODEL_URL`/`WASM_DIR`
      are `BASE_URL`-relative, same-origin paths, never a third-party host;
      the WASM runtime's own fetch lives inside `@mediapipe/tasks-vision`'s
      library code rather than this app's, so it was traced by hand into
      `node_modules` and confirmed to target the same same-origin path
      Emscripten's own loader was handed, not a Google-hosted one. The
      `Image()` call only ever loads a `data:` URI already in memory — never
      a request at all. Also checked and clean: `index.html` and
      `vite.config.ts`'s PWA/service-worker configuration precache only the
      app's own same-origin build output, no analytics SDKs in
      `package.json`, no `sendBeacon`/`WebSocket`/`EventSource` anywhere.

      `lib/__tests__/egress.test.ts`: scans every `.ts`/`.tsx` file under
      `src` (66 of them, tests excluded) for `fetch`, `XMLHttpRequest`,
      `sendBeacon`, `WebSocket`, `EventSource` and `new Image()`, and
      asserts the result is exactly the two named, justified sites above —
      a third check reads `index.html` for an external URL, since a remote
      font or an analytics tag there is egress no `.ts` scan would ever see.
      Text-matched on purpose, not parsed: a regex over source text can
      over-match a comment that merely mentions one of these names, so the
      allow list is checked against what the scan actually found rather
      than assumed correct, and a second check catches the opposite
      failure — an allowed site quietly removed, leaving a stale exception.

      No `@types/node` in this project. `fs`/`path`/`process.cwd` needed
      hand declarations, the same trade `harness.ts` already makes for
      `process.exit` — and `fs`/`path` specifically needed `@ts-expect-error`
      rather than a fresh `declare module`, because TypeScript's bundler
      resolution already recognises those names as real, typeless modules,
      so declaring them again reads as augmenting something that exists
      rather than describing something new.

      Verified the test has teeth, not just that it passes: dropped a
      temporary `fetch('https://example.com')` into an unrelated file,
      confirmed the suite failed with the exact file and pattern named,
      reverted it, confirmed green again.
- [x] **R30** — Read `buildBackup`/`Session` before assuming the disclosure
      was missing outright — it was not, quite. `StoragePanel.tsx` already
      named "keyframe pictures", from R24's own fix earlier this session.
      What was missing was *when*: that clause sat below the Export button,
      inside a sentence mainly about moving the finished file to a new
      phone — read, if at all, after the tap that already created it, not
      before.

      Confirmed the actual contents live rather than trusted the reading of
      the code: a real `buildBackup()` call against one seeded report
      produced 26 KB of JSON carrying six base64 PNG stills for that one
      serve alone (placeholder images — a real still runs 27–80 KB, per
      Phase 1's own measurement). Up to twenty recent reports keep all six
      of theirs, so a full history's export can carry upward of a hundred
      real photographs of whoever was on court — the tracked skeleton drawn
      over the player's own unrotated video frame, not an abstraction or a
      chart. A player exporting "their scores" to move to a new phone is
      also handing over a substantial photo library, and the one sentence
      that said so was positioned to be read last, if at all.

      Fixed by splitting that sentence and reordering, not by adding one:
      "An export is one file holding your scores and real photos of you
      serving, not just numbers" now sits above the Export/Import buttons,
      where a player reads it before deciding; "To carry it to a new phone,
      send the file to yourself..." keeps its place below them, since that
      half is instructions for after the decision rather than a fact that
      should shape it. Same `sheet-note` class both times — no new UI, no
      new colour. Verified live: the reordered copy renders correctly
      above the buttons, and export itself still works end to end
      (`serve-coach-2026-08-14.json`, `HTMLAnchorElement.prototype.click`
      instrumented to confirm) with the reorder in place.
- [x] **R31** — Traced the real ingestion path (`App.tsx`'s `run()` into
      `analyzeServe`, `extract.ts`, `phases.ts`) before assuming any of the
      five named cases was actually broken. Four were already handled, and
      honestly split between what could be re-verified here and what could
      only be read: a one-frame clip refuses with "too short to read"
      (`frames.length < 8`, already pinned by `engine.test.ts`); a
      thirty-minute clip is never read past `readWindow`'s bounded span
      regardless of length, already covered up to 30 s by
      `robustness.test.ts` and warned about on the report past
      `LONG_CLIP_SECONDS`; 4K cannot enlarge the pose or thumbnail canvases,
      both capped in `extract.ts` independent of source resolution; a
      rotated clip's container metadata is corrected by the browser's own
      decoder before a pixel reaches this app, a platform guarantee rather
      than app logic, with camera *tilt* — the real, different concern —
      already measured and tested from Phase 2. None of the three
      resolution/duration/rotation cases could be reproduced against a
      genuine file in an environment with no camera and no real footage;
      said plainly rather than claimed otherwise.

      The fifth was not already handled. A plain text file renamed to look
      like a video reached `describeDecodeFailure`, which conflates "a real
      video this browser cannot decode" with "never a video at all" under
      one `MediaError` code, and on a browser reporting no HEVC support
      guessed HEVC for both — "This browser cannot play that video... most
      likely HEVC", with hints about an iPhone setting irrelevant to the
      actual file. Confidently wrong, not merely unhelpful, and on exactly
      the browsers — most non-Safari ones — most likely to hit it.

      Fixed with `looksLikeNonVideo(type)` in `extract.ts`, checked in
      `App.tsx`'s `run()` before the decoder is asked to explain a failure
      it did not have. Reads the container MIME type, not the codec, so a
      real HEVC file is untouched; leaves an empty type or `audio/*` alone
      on purpose, so a browser declining to guess is not read as a refusal
      and an audio-only file still reaches `loadVideo`'s own more specific
      answer. Pulled out as a pure function specifically so this could be
      pinned rather than left to a live walk each time: four checks in the
      new `lib/pose/__tests__/extract.test.ts`, this file's first. Verified
      live against a text file, an image file, a garbage-content but
      correctly-typed `video/mp4` (confirmed to reach the existing HEVC
      guess unchanged), and an empty-type file (confirmed to fall through
      unchanged) — the last two proving the fix touches only what it
      should.
- [x] **R32** — Re-read both registries in full (`tiers.ts:290-391` and
      `:416-573`), cross-referenced against README's account of them
      (`:1055-1084`) and against `depth.test.ts`, which already reprints this
      same per-signal audit as a standing runtime warning on every run
      (`:855-869`, `:882-903`). Nothing was stale; every entry already carries
      what would move it, or says nothing will — the deliverable stated below
      is a restatement of a decision already on record, not a new one.

      `UNDER_RESOLVED` — `hip_lead_ms` is not withdrawn, it is *kept* at a
      floor raised to the measured 85 ms, so only gross arming clears it and
      every finding returns `high`. What would move it further: real footage
      to re-derive `NOISE_FLOOR` itself, presently modelled from published
      depth-error figures and not from a clip filmed through this app; or a
      time-based smoothing window in the peak-finder, matching
      `palmNormalAt`'s in `kinematics.ts`, in place of the current fixed-
      sample one — named in the comment as where a rebuild should start.
      `pronation_deg` is fully withdrawn, neither direction of floor rescues
      it, and it stays that way absent real footage at known rotation angles
      to settle whether its non-monotonic reading past ~40° is the estimator
      folding or the rig's own synthetic-dial limit.

      `UNCALIBRATED` — three of five are dead ends by construction, not by
      absence of evidence. `legs_peak_ms` times leg drive without measuring
      its amplitude, so no footage would let a millisecond value grade "no
      leg drive" — that wants a different quantity, not more evidence on this
      one. `wrist_peak_ms` and `elbow_peak_ms` exist only to prove the
      chain's own construction (image-plane readings beat world-*z* ones by
      two orders of magnitude) and say nothing about a player's serve;
      `elbow_peak_ms` additionally carries a 10.2 ms camera-angle artifact
      `axes.ts` cannot remove, since one image-*x* scalar cannot be de-mixed
      into two components — a structural block footage alone would not
      clear. `chain_span_ms` is superseded by design: dividing by tempo is
      the fix, and that fix is `chain_span_ratio`, the one entry with a real
      path to calibration, already stated in three parts in its own comment
      — settle the residual 21% tempo-dependence at 120 fps, get real
      footage since the rig cannot vary tempo any other way, and attach a
      coach's judgement to that footage.

      No code changed. README's account of the two registries is accurate as
      far as it goes and was not touched.
- [x] **R33** — Neither blocker moved: no commit since they were last written
      has touched `RecordScreen`, the glance screen, the target dial or
      `COURT-CHECK.md`, and a direct search this round found zero `.mp4`/
      `.mov`/`.webm`/`.mkv` files anywhere in the repo outside `node_modules` —
      there is no bundled real clip to substitute for a phone, so the
      dial-on-a-real-still question still cannot be answered from here.
      `RECORDED` is still empty, `MINIMUM_RECORDED` still 6. This round folds
      in what changed instead: R32's answer to which of the fixture shoot's
      unblocks are actually true.

      The "Still open" bullet below used to say footage would move "every
      entry in `UNCALIBRATED`". R32 found that overclaims it — of the five,
      only `chain_span_ratio` has a real path through footage; `legs_peak_ms`,
      `chain_span_ms`, `wrist_peak_ms` and `elbow_peak_ms` are dead ends by
      construction (they time the wrong quantity, or exist only to prove the
      chain's own construction, or carry a camera-angle artifact no clip
      count fixes) and would stay uncalibrated regardless of how much footage
      arrives. Footage would also settle `UNDER_RESOLVED.pronation_deg`, at
      known rotation angles — a connection the bullet did not draw before.
      Corrected below.
- [x] **R34** — A systematic sweep, not a quick pass: extracted all 454
      top-level exports outside `__tests__` and grepped the whole tree for
      references to each, checked every module for whether anything ever
      imports it, then read README.md end to end (1342 lines) and cross-
      checked every verifiable claim — file references, test counts, exported
      constants, byte figures — against current source.

      Two real duplicates and one dead type, all found by that sweep and
      nothing else: `Series` in `kinematics.ts` was declared and never used
      anywhere, not even in its own file — removed. `tiers.ts` redefined
      `lerp` and `progress.ts` redefined `mean`, both identical to the
      versions already exported from `geometry.ts`, which `progress.ts`
      already imports from for `statusOf` — both now import the shared
      version instead, and `clampTier` was simplified to call the shared
      `clamp` rather than repeat its own `Math.min(Math.max(...))`. Everything
      else the sweep turned up was a false positive on inspection: `leakProbe.ts`
      looks unreferenced by static import because it is loaded with a dynamic
      `import()` from the devtools console by design, exactly as its own doc
      comment says.

      README's claims mostly held up under direct re-checking rather than
      being waved through: the egress test's "66 source files" is still
      exactly what `egress.test.ts` prints today (a raw file count is 95, but
      that includes `__tests__`, which the claim and the test both exclude);
      `KEEP_STILLS`/`MAX_SESSIONS` are still 20/60; `progress.test.ts` still
      has exactly fifteen `check()` calls; the footprint budget's "roughly six
      times today's worst case" still matches `footprint.ts`'s own comment.
      The one real gap: the "Everything is in `src/lib`" file table never grew
      rows for five files that thirty rounds of work made central enough to
      discuss at length in the prose right below it — `progress.ts`
      (trend/then-and-now/milestone), `analysis/axes.ts` (which body axis
      image x actually measured) and the three-file `framing/` subsystem
      (`judge.ts`, `access.ts`, `record.ts`, the live preview's verdict,
      failure messages and in-page recording). Added, in the same terse style
      as the existing rows.
- [x] **R35** — Freeze.

      **Final green run**, this round, not inferred from earlier ones:
      `tsc --noEmit` clean, `eslint .` clean, `npm test` — **624 passed, 0
      failed** across 26 suites.

      **The open gaps, stated plainly, all four of them:**

      Two are blocked on resources this environment does not have and
      cannot simulate — a phone, and real footage — detailed in full in
      "Still open" below: **the court trip** (recording, the glance screen
      and the target dial have never run on a device) and **the fixture
      shoot** (`RECORDED` is empty, 0 of 6, so hip–shoulder separation and
      shoulder tilt stay unvalidated against anything real). Both were
      re-confirmed unchanged as recently as R33; nothing in R34 or this
      round touched anything that could have moved them.

      Two more were found along the way, named honestly, and never picked
      up — not blocked on resources, blocked on scope discipline that never
      pointed a round at them: **`FramePair`'s better-serve colour** assumes
      left is always the better serve, true only for the basket comparison
      and merely lucky for "Then, and now" (found by R21, explicitly out of
      that round's own accessibility-only scope), and **`PRACTICE_WINDOW`
      counts sessions, not trips** (found by R25 naming "a trip to the
      court", explicitly out of that round's own naming-not-redesigning
      scope). Both are now tracked as `[!]` entries below with what fixing
      each actually costs, since neither was previously reachable from
      "Still open" — only from prose in `README.md` and this file's own
      compacted phase history, which is what R35's "stated plainly" is for.

      **The loop is stopped.** Thirty-five rounds landed across five phases,
      one per iteration, each closed by measurement or a passing test rather
      than by assertion. No round was skipped, no round was faked, and the
      circuit breaker never fired once — `consecutiveFailedRounds` stayed at
      zero the entire programme. This is the terminal round `NEXT.md` itself
      names. **Do not start an R36.**

---

## Phase 6 — the defects that were blocked on nothing (R36–38)

Three defects, none of them needing a phone or a frame of real footage. Two
had been sitting in "Still open" below since Phase 3 and Phase 4, both marked
**blocked: needs a round willing to move a pixel** rather than blocked on a
resource. The third was found by reading `FramingCheck.tsx` during a sweep and
had never been written down anywhere.

- [x] **R36** — Read `FramingCheck.tsx`'s recorder lifecycle end to end before
      assuming the teardown was correct, and it was not. `MediaRecorder.onstop`
      fires once the encoder has flushed, which is after whatever asked it to
      stop — and two things ask. One is the player pressing "Stop and analyse".
      The other is the effect cleanup, which *must* stop a running recorder or
      the encoder accumulates chunks for a clip nobody will be handed.

      Both reached the same callback, and the callback could not tell them
      apart: it built a `File` from whatever chunks existed and called
      `onRecorded`. So closing the viewfinder mid-recording handed the clip to
      `openClip(file, true)`, and the screen jumped from a camera to a progress
      bar and spent a full analysis on a recording the player had just
      abandoned. Traced every route out of that sheet rather than assuming one:
      `Sheet` in `primitives.tsx` calls `onClose` from the close button, from
      Escape, and from a tap on the backdrop — and a backdrop tap on a phone
      held at arm's length on a baseline is the easiest of the three to do by
      accident. All three land in `Home.tsx`'s `setChecking(false)`, which
      unmounts the component, which runs the cleanup.

      A second fault sat underneath it and is closed by the same change: the
      cleanup releases the camera tracks immediately after asking the recorder
      to stop, so the final chunk of an abandoned recording may well be short.
      A clip that is discarded cannot be truncated into anything, which is why
      the decision is taken before a `File` is built rather than after.

      Fixed by naming the decision rather than adding a flag to the callback:
      `recordingOutcome({ previewLive, chunks })` in `framing/record.ts`, whose
      header already argues that the component cannot be tested here and the
      decisions can — the same split `access.ts` and `recordingType` already
      make. `FramingCheck` gains `liveRef`, which is the effect's own `live` in
      a place the recorder's callbacks can read it, since those are built in
      `toggleRecording` outside that scope and fire after it is gone. Re-armed
      at every effect entry rather than only at the `useRef`, so React's
      development double-invoke — mount, cleanup, mount — does not leave a
      remounted preview refusing to hand over a recording nobody abandoned.

      `framing/__tests__/record.test.ts`: four checks. The button path hands
      over; the sheet-closing path discards however much was recorded; an
      encoder that produced nothing is discarded either way; and the separation
      is liveness rather than length, checked at 1, 5 and 200 chunks — because
      the tempting wrong fix here is a length threshold, which would discard a
      short deliberate recording and keep a long abandoned one.

      Verified the tests have teeth rather than that they pass: dropped
      `previewLive` from the condition in a scratch copy, confirmed exactly the
      two checks that name it went red, restored, confirmed green.

      Still not verified on a device, and this changes nothing about that — see
      the court trip below. What is closed is a defect that was reachable by
      reading, which is the weakest tool available for this file.

- [x] **R37** — `FramePair`'s better-serve colour, carried since Phase 3 as
      **blocked: needs a round willing to move a pixel**. This is that round.

      `.pair-shots figure:first-child figcaption { color: var(--good) }` in
      `report.css` accented the left caption by *position*, with nothing about
      whether a ranking had been claimed. True by construction for the basket
      comparison, where `ConsistencyPanel` builds the captions from
      `pair.best`/`pair.worst`. Merely lucky, about half the time, for "Then,
      and now" — which orders by date because the whole point is showing what
      changed whichever direction it went. A player whose serve had gone
      backwards over six weeks was shown their older, worse serve tinted as the
      good one, on the one screen built to tell them whether they are improving.

      Worth being plain about what was and was not already right: the component
      has honoured this since it was written. `leftIsBetter` was optional and
      the screen-reader text was emitted only for the caller that passes it, so
      the accessible reading was correct throughout and only the colour lied.
      That is the reverse of the usual shape and it is why R21 could find the
      defect while auditing accessibility and still not be allowed to fix it.

      Fixed by making the claim travel as a class rather than as a position.
      `pairRankModifier` in `components/statusLabels.ts` — which exists for
      exactly this, a plain module beside the components so a value and a
      component never share a fast-refresh boundary — maps the claim onto
      `pair-shots--better-left` / `pair-shots--better-right`, or to the empty
      string where there is no claim. The CSS gates on those two. `false` is
      handled rather than ignored: a boolean read in only one of its two states
      is one waiting to be misread by its next caller, which is how this
      survived in the first place. The screen-reader text follows the same rule,
      so the two halves of the claim can no longer disagree.

      No new colour, no new token, no layout change — `--good` was already the
      accent this used, and the selector is the only thing that moved.

      `components/__tests__/framePair.test.ts`, a new directory the runner
      already discovers: three checks on the mapping, and two that read
      `report.css` off disk. The disk checks are the point. The defect lived in
      a stylesheet, so a suite that only ever looked at TypeScript would have
      stayed green for the whole time this was wrong — the same trade
      `egress.test.ts` makes, and made here for the same reason. One asserts no
      rule accents a caption by position alone; the other that both modifiers
      are styled, since gating only the left one is the same defect with the
      sides swapped.

      Verified the disk checks have teeth: restored the original selector in a
      scratch copy, confirmed both went red, restored, confirmed green.

      Verified live at `?demo=basket` rather than by reading the CSS. The ranked
      caller is unchanged — `pair-shots pair-shots--better-left`, left caption
      computes to `rgb(205, 249, 74)` (`--good`), right to `rgb(152, 162, 179)`,
      both screen-reader labels present. Stripping the modifier to reproduce
      exactly what "Then, and now" renders puts *both* captions on
      `rgb(152, 162, 179)` — neither claimed as better, which is the fix. No
      console errors. A screenshot was not possible for the reason the court
      trip below already records: the pane does not composite.

- [x] **R38** — `PRACTICE_WINDOW` counts trips now, not reports. Carried since
      R25 as **blocked: same reason as above, not resources**.

      The window's own doc comment has always said it exists to catch what is
      *still* wrong on the next visit, and it counted reports — so five of them
      could be one afternoon. That stopped being the unlucky case and became the
      ordinary one when R18 made the coached live preview the default way in on
      a phone: record, glance, record. A player filming five serves in one
      basket had a window holding one visit's own variance, and the headline
      grown from it — "you have drilled your racket drop twice and it has not
      moved. Take this one to a coach" — was reading ten minutes of tennis.

      `tripsOf` in `progress.ts`, beside `sameTrip` and built out of it. Chained
      rather than measured from the first serve of a trip, so a long afternoon
      is one visit however long it runs; the flip side, that filming every
      twenty hours for a week is also one trip, is a property of any gap rule
      rather than a fault in this one and is named at the function. It copies
      before sorting: `listSummaries` hands one array to several readers and the
      trend chart is holding it.

      Both reasons R25 gave for not doing this then turned out not to hold, and
      it is worth recording which, because they are why it sat for two phases.

        · "Redefining what the window counts changes
          `PracticeFocus.sessionsConsidered`'s meaning everywhere it is
          printed." It does not. That field counted *serves* before and counts
          serves now — "across your last 7 flat serves" is as true of two trips
          as "across your last 5" was of five reports. Checked against the copy
          rather than assumed: `practiceHeadline` reads it in four sentences and
          every one of them still parses.
        · The unstated one, found by writing the test: a first-visit player
          could have lost the card entirely. Windowing by trips with a
          two-*trip* floor would say nothing to somebody who filmed a basket
          this afternoon, which is paying for the fix with the first day. The
          floor stays two comparable serves. One trip is all the history there
          is, so the window is that trip, and the card appears exactly as it
          always did.

      One real cost, named at the call site rather than papered over: `eligible`
      now requires a metric in every serve of every trip rather than in each of
      five, so a measurement needing a side-on view drops out more readily on a
      mixed-angle history. That is the existing rule meeting more evidence, not
      a new rule — it was written to refuse averaging over an uneven number of
      readings, and it still does exactly that.

      `robustness.test.ts`: five checks beside the existing practice ones. Three
      on `tripsOf` — the cut, the chaining, and that it does not sort the
      caller's array underneath it — and two on the window, one per direction:
      a bad first visit followed by six good serves in one sitting stays in the
      window (7 serves considered, average below the recent visit's), and a
      player on their first visit still gets advice.

      Verified the teeth: restored `.slice(-windowSize)` over sessions in a
      scratch copy and confirmed exactly one check went red — the one written
      for the defect — with every pre-existing practice check still green,
      which is the evidence that the old contract is intact rather than merely
      that the new one holds.

      `README.md` updated in three places: the file table for both modules, the
      practice section's prose, and R25's own paragraph, which claimed this was
      named for a future round. It is that round.

- [x] **R39** — `captureThumbnails` was the one pass in the pipeline taking no
      `AbortSignal`. Found by sweeping every cancellation point in the tree
      rather than by a report: `extractFrames` checks per frame, `readBitmaps`
      checks per frame, `scanForServes` checks per sample, and this one checked
      never. Pressing stop therefore left six seeks and six JPEG encodes still
      to run against a report nobody was going to see.

      Ordinary rather than rare, which is what makes it worth a round. The sweep
      does *not* set `skipThumbnails` — only `skipFramingCheck` and `skipBall`,
      deliberately, since the stills are what let the best serve in a basket be
      shown beside the worst as pictures — so every swept serve captures six,
      and stopping a sweep is a first-class thing the UI offers a button for.

      Returns short rather than throwing `Cancelled`, and the two are not
      interchangeable here. By the time this runs the serve is fully measured
      and the stills are decoration on top of it; `sweepServes` drops a
      `Cancelled` serve without counting it, correctly, since stopping is not a
      verdict on a serve nobody finished reading. Throwing from here would
      therefore discard a complete measurement in order to save six seeks —
      the expensive half of the trade, and the same mistake the sweep's own
      "four serves out of six still answers the question" reasoning rejects. A
      short array leaves the later phases with no thumbnail, which the report
      already draws for, because the storage prune strips stills from older
      reports and that state has always been reachable.

      `pose/__tests__/extract.test.ts` gains a recording stub for the video and
      the canvas — the same trade `drawing.test.ts` makes for the overlay,
      counting seeks rather than inspecting pixels, because the number of seeks
      is the whole of the claim. Four checks: an uninterrupted run captures all
      six; a run stopped at the second frame seeks twice and encodes twice; the
      stills taken before the stop survive and are real data URIs; and stopping
      one frame later keeps exactly one more, stated as the relationship so a
      change that shifts both by one is still caught.

      The captures are awaited at the top level and asserted afterwards rather
      than inside `check`, which is synchronous and would record a pass before
      any assertion ran — the shape `engine.test.ts` already uses for the sweep.

      Verified the teeth: removed the guard in a scratch copy, confirmed three
      of the four checks went red, restored, confirmed green.

- [x] **R40** — A number nobody measured, asserted in two places, contradicting
      the module that refuses to assert it.

      Found while trying to answer "how long does a sweep take" without a phone,
      and worth recording that the attempt failed first: `sampleClip` can be
      pushed through the real pipeline — that is what `leakProbe.ts` does — but
      it draws no player, so `detectServe` refuses every clip before the
      thumbnail and ball passes run, and the pane this repo develops against
      reports `document.hidden`, which throttles the canvas recorder badly
      enough that a clip asked to be 3 s came back 1.06 s. A figure produced
      from that would have been about this pane, not about a phone. So no
      figure was produced.

      What the attempt did find is that the repo already contains one.
      `analyzeAllServes` states plainly that "nothing in this tree times a
      sweep... a figure invented for a comment would be a number nobody
      measured. It is one full analysis pass per serve, and that is the honest
      unit." `App.tsx`'s `openClip` then said "twenty-five seconds on a full
      basket", and `COURT-CHECK.md` step 8 repeated it. The module doing the
      work refused the number; two callers stated it anyway.

      It is also internally inconsistent, which is what raises it from untidy
      prose to constraint 1. A single pipeline pass is described as "half a
      minute" in roughly ten places across this codebase, and six of those
      cannot come to twenty-five seconds. A sweep is cheaper per serve than a
      full pass — it skips the framing check and the ball — but the extraction
      dominates and is unchanged, so nothing accounts for a factor of seven.

      Both sites now carry the honest unit instead, and `COURT-CHECK.md` step 8
      is promoted from "watch how long it takes" to timing it with a stopwatch
      and writing two numbers down, since that trip is the only thing that can
      settle it and the sweep is now the automatic path for a picked
      multi-serve clip.

      Deliberately not fixed, and named here instead: whether "half a minute"
      for a single pass is itself measured. It may well be, from a phase this
      ledger has compacted; it appears in ten files as a settled shared figure,
      and rewriting all of it on a suspicion would be inventing a second
      unmeasured claim to replace the first. The two sites fixed here are the
      ones that directly contradict an explicit refusal in the same repo. Step
      8's first number answers the rest.

      Doc-only, so no test. A source scan forbidding durations in prose would
      be brittle and would not have caught this one — the defect was not that a
      number existed, but that it disagreed with a refusal fifteen files away.

## Phase 7 — what the sweep spends, and what nothing was watching (R41–)

- [x] **R41** — The sweep captured thirty-six keyframe stills to show twelve.

      `MAX_CONSISTENCY_SERVES` is 6 and every swept serve captured its six
      stills; `pairStills` reads the two serves `ServeGap` names. The other four
      serves' stills were seeked to, decoded, drawn, JPEG-encoded and dropped —
      twenty-four wasted seeks on the most expensive path in the app, and since
      R18 the automatic one for any picked multi-serve clip.

      Not a subtle bug and not a new one: `AnalyzeOptions` had already split
      `skipThumbnails` out from `skipFramingCheck` and `skipBall` precisely so
      the stills could be kept independently, and the comment explaining that
      split argued for keeping them — "they are what lets the best serve in the
      basket be shown beside the worst one as pictures rather than as two
      sentences". True of two serves, and it bought them for six.

      Fixed by moving when they are captured rather than whether. The sweep now
      sets `skipThumbnails: true` like the other two, and `analyzeAllServes`
      captures stills afterwards for exactly the serves the comparison names.
      Same twelve pictures on screen, a third of the seeks.

      That forced three smaller things, each worth naming because each removes a
      duplicate rather than adding a path:

        · `buildConsistency` moved from `App.tsx` into `analyzeAllServes`.
          Deciding which two serves are worth going back for *is* that
          calculation, and it has to happen while the video element is still
          open — which is inside that function and nowhere else. `Sweep` now
          carries `consistency` and `pair`; `compareServes` reads them instead
          of recomputing. One computation, one owner, the `sweepWindow` rule.
        · `keyframeOverlay` and `bandsFor`, lifted out of `runAnalysis`. There
          are now two moments a still is drawn at, with entirely different
          things in scope, and they would otherwise have been two copies of one
          drawing call — the shape `readOutboundFlight` had to be rescued from,
          a formula written twice, tested once, agreeing at exactly one camera
          angle.
        · `rawSpaceOf`, which is the pair of transforms `PosePlayer` has done
          since it was written, given a name. A still is unrotated video pixels
          and everything on an `Analysis` is levelled, so a still captured after
          the fact has to rotate back or the skeleton sits off the body by
          exactly the roll that was corrected. That failure would read as a
          tracking bug rather than a plumbing one.

      `SweepRun` was split from `Sweep` for the same honesty reason the rest of
      this file works to: `sweepServes` is the loop, has no decoder, and is in
      no position to promise a `consistency`.

      `__tests__/sweepStills.test.ts`, eleven checks. The comparison names
      exactly two serves at basket sizes 2, 4 and 6; it finds them by their
      number in the clip rather than their array position, which is the case a
      sweep that skipped a serve produces routinely; one serve costs one seek
      per keyframe; **a pair costs 12 seeks where the sweep used to spend 36**,
      stated as arithmetic over `MAX_CONSISTENCY_SERVES` rather than as a
      remembered number; the four unpaired serves end with no thumbnail on any
      phase; the strip built afterwards has both sides of every row populated,
      which is the end-to-end claim; and `rawSpaceOf` is identity without tilt
      and genuinely rotates with it.

      WHAT IS NOT COVERED, and it is the wiring rather than the arithmetic: that
      `analyzeAllServes` really passes `skipThumbnails: true` down per serve
      needs a decoder, a landmarker and a real clip. Read, not run.

      LIVE VERIFICATION WAS NOT POSSIBLE THIS TIME, said plainly rather than
      skipped. `?demo=basket` is the only route to the paired strip and it
      depends on `sampleClip`, which records a canvas — and the pane reports
      `document.hidden`, which throttles that recorder. Earlier in the same
      session it still limped through, returning 1.06 s of film for a 3 s
      request; by the end of it `sampleClip` no longer resolved at all inside
      twenty seconds. Checked that this is the environment and not the change:
      the diff touches neither `sampleClip`, `sampleAnalysis.ts` nor the canvas
      path, every other piece of the demo route was driven by hand in the
      console and all of them returned correctly, and `?demo=` still renders a
      full report. It is the same block the court trip already records.

- [x] **R42** — `storage/backup.ts` had no tests at all, on the one path in the
      app that moves a player's entire record between devices. 260 lines, nine
      exports, zero imports from any test file. It has already produced one real
      defect — Phase 1's "a save that failed looked exactly like one that
      succeeded" — and the closest thing to coverage since was R30 driving one
      export by hand in a browser, which is a walk-through rather than a test.

      What made it untestable was the database under it rather than the logic,
      which is ordinary. `BackupStore` names that dependency and injects it,
      defaulting to the real `db.ts` so nothing that does not pass a store
      changes — the same trade `recordingType` makes for its two capability
      probes, and the reason `access.ts` and `record.ts` exist at all. The store
      in the test is a `Map`. Everything checked is the real `importBackup`
      running against it, not a reimplementation of the merge.

      `backupFileName` extracted while there: three lines of local-date stamping
      inside a function that also builds a Blob and clicks an anchor, so the one
      part of it checkable without a browser could not be. Same defect
      `recordingFileName` already avoids — an evening export west of Greenwich
      stamped with tomorrow, on the only thing telling two exports apart.

      `storage/__tests__/backup.test.ts`, twenty checks, every one of them about
      *losing* something, because that is the only thing that matters here. A
      restore that adds nothing is an annoyance; one that silently drops four
      reports, rolls a phone back, or abandons every row after the first failure
      is the reason somebody stops trusting the app with their history. Three
      refusals of files that are not backups; newer-wins in both directions plus
      the same-age no-op that makes re-importing safe; a rejected clip never
      re-entering the record; a damaged row skipped without costing the readable
      rows beside it; the Phase 1 defect from the other side — one row that will
      not fit leaves the other three landing, and is counted `failed` rather
      than `skipped`, which are opposite messages to a player; drill records
      merged per record so two phones can each keep what the other never saw; a
      pre-drill-record backup still restoring; one prune for the whole import;
      and a full round trip through a serialised file.

      Verified the teeth in two passes rather than one, and the second pass
      found a gap in how this ledger has been checking them. Removing the
      newer-wins guard turned exactly two checks red, as expected. Removing the
      per-row `catch` printed no `✗` at all — because `importBackup` then throws
      out through a top-level `await`, which kills the file before the harness
      can report anything. The suite still fails, on the runner's non-zero exit,
      exactly as `run-tests.mjs` says it does. Worth recording because several
      rounds in this phase confirmed "green" by grepping the output for `✗`,
      which is blind to a file that dies. `npm test`'s exit code is the check.

- [x] **R43** — `App.tsx`'s state-machine table was prose, and the prose was
      wrong twice.

      R7 looked at the implicit machine in that file and decided against a
      reducer, correctly and not reopened here: the four satellite pieces of
      state are each scoped to the screens that read them, so a combined state
      would carry fields most screens never touch. What it wrote instead was
      "every transition below was walked by hand for a screen it could strand
      and none was found", and then the table — a load-bearing claim about
      twenty-one `setView` call sites that nothing executed.

      Transcribing it into `lib/screenFlow.ts` from the *calls* rather than from
      the comment found both errors immediately, and they point opposite ways:

        · It claimed `analyzing` → `saved`. Nothing does that. `saved` is set in
          three places — `showExample`, `openSaved`, the dev `?demo` branch —
          and all three are reachable only from `home`, because the history
          sheet's opener is a prop only `Home` is given. A listed exit no code
          can take is the more dangerous of the two: it is exactly the entry a
          later reader trusts when deciding whether some new state needs
          clearing on the way through.
        · It omitted `home` → `error` and `report` → `error`. `run` refuses a
          file over `MAX_BYTES` and one whose declared type is not a video, and
          both `return` immediately after setting `error` — before `analyzing`
          is ever set. The prose said the error landing "is always reached by way
          of one of those two", which is true of the *caller* and reads as a
          claim about the *route*.

      Neither was a bug in the app. Both were a map disagreeing with the ground,
      which is what a table nothing executes eventually becomes.

      `screenFlow.ts` is deliberately inert: `App.tsx` does not import it, no
      `setView` is routed through it, and its own header says that if it ever
      starts deciding transitions rather than describing them, R7's argument has
      been quietly reversed. It is the table in a form a test can walk.

      `lib/__tests__/screenFlow.test.ts`, nine checks. Two are the graph
      properties R7's walk was actually claiming — nothing stranded, nothing
      unreachable. Two read `App.tsx` off disk in both directions, so a screen
      added there without arriving here fails, and so does a screen invented
      here that the file does not have; without those the table is just a second
      thing to remember, which is what the comment already was. Two more pin the
      corrections, including a source check that `run` really does set `error`
      twice before it first sets `analyzing`. And one states which screens are
      terminal — `saved` and `error`, both "look at this, then start again" —
      as a reading rather than a rule, so a third appearing gets a second look.

      Verified the teeth by restoring both of R7's errors in a scratch copy:
      exactly the two checks written for them went red, and the suite failed.

      The comment in `App.tsx` keeps what the table cannot carry — why a
      `report` ⇄ `report` move costs no decoder rebuild, why `glance` → `report`
      re-analyses nothing — and hands the enumeration over.

- [x] **R44** — The whole MediaPipe vision library sat in the entry chunk, so
      the app shell could not paint until it had downloaded and parsed.

      Measured before and after rather than asserted:

          before   index 505.34 kB  (165.99 kB gzip), one chunk
          after    index 373.01 kB  (125.69 kB gzip)
                 + vision 138.83 kB ( 41.55 kB gzip), fetched on demand

      132 kB raw and 40 kB gzip off the critical path, a quarter of what had to
      arrive before anything rendered. Confirmed it is genuinely deferred and
      not merely renamed: `dist/index.html` carries one module script and no
      `modulepreload` for the vision chunk.

      Nothing on the home screen ever needed it, which is what made this
      available. `isCachedOffline` asks the Cache API, `enginePaths` is two
      strings, and `nextVideoTimestamp` uses `PoseLandmarker` only as a WeakMap
      key — a type, erased at build. The first thing that genuinely needs the
      library is an analysis or the live viewfinder, and both are already about
      to fetch 19 MB of model and runtime, against which 139 kB is rounding
      error. The import is a plain `import()` in `poseEngine.ts`; the browser
      caches the module, so the repeated call costs a promise resolution rather
      than a second fetch.

      One type had to be named by hand. `create` described its fileset argument
      as `Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>`, which is
      a query on a *value* and stops working the moment the import is
      type-only — and the library declares `WasmFileset` without exporting it.
      Same expression, moved to a named type, so the dependency on an
      unexported name stays visible rather than being inlined at a call site.

      Verified at runtime, because a dynamic import that fails to resolve is
      exactly the defect a build-size table cannot see. Driven live in the dev
      server: `enginePaths` and `isCachedOffline` both answer with no MediaPipe
      loaded at all; `loadEngine` then reports all three progress stages,
      returns an object with a working `detectForVideo`, and lands on the GPU
      delegate. No console errors.

      The service worker still precaches it — 17 entries, 612 KiB against 606 —
      which is right: offline has to keep working, and precaching happens in the
      background after install rather than in front of the first paint.

- [x] **R45** — Every refusal a clip can hit before a single frame is read had
      no test. `describeDecodeFailure`'s four branches and `loadVideo`'s two
      early refusals were reachable only from a browser holding a broken file,
      so the one thing standing between a player and a dead end — the hint text
      — was never checked.

      Worth a round rather than filed as tidying, because of what these
      sentences do. The clip plays perfectly in the camera roll, so "this video
      could not be decoded" reads as the app being broken and has no action in
      it. The whole function exists to convert that into a thirty-second fix,
      and its central move is a *guess*: on a browser reporting no HEVC decoder
      it attributes both `MEDIA_ERR_DECODE` and `MEDIA_ERR_SRC_NOT_SUPPORTED`
      to High Efficiency, because that is overwhelmingly the cause and the
      advice is actionable. R31 already found the cost of that guess escaping
      its guard, and fixed it from the other side with `looksLikeNonVideo`.

      Nine checks, driven against a stubbed decoder and a stubbed `MediaError`
      whose codes are the spec's rather than invented — a stub numbering them
      differently would let every branch pass while agreeing with no browser.
      Every code, on both kinds of browser, produces a non-empty message and at
      least one non-blank hint; a browser without HEVC gets the format named,
      the Settings path, *and* the share-to-yourself escape for a clip already
      filmed, which the setting cannot help; a browser that decodes HEVC is
      never told its clip is probably HEVC, on any code; the two remaining
      failures stay told apart, since "re-export it" and "wait for iCloud to
      finish" are different actions; and a failure carrying no code at all —
      reachable, because `waitFor` resolves on its timeout rather than
      rejecting — still offers something concrete.

      `loadVideo`'s own three outcomes too: an ordinary clip is not refused, a
      clip with `NaN` or zero duration is refused rather than measured, and an
      audio-only file gets "There is no picture in that file" — which is the
      specific answer `looksLikeNonVideo` deliberately steps aside for by
      returning false on `audio/*`. The no-length refusal's advice is checked on
      both browsers, because the same failure means different things on each and
      only one of them should be sent to an iPhone camera setting.

      Verified the teeth: dropped the `!supportsHEVC()` guard so the guess
      became unconditional — the exact confidently-wrong failure R31 fixed the
      other half of — and two checks went red.

- [x] **R46** — "Half a minute" for an analysis pass, audited and then replaced
      with a measurement rather than with a caveat.

      R40 fixed two documents asserting a sweep duration the engine explicitly
      refuses to state, and left the wider question open: whether the "half a
      minute" figure those numbers were inconsistent with is itself measured.
      Traced it rather than guessed — `git log -S` puts it in `da2cc90`, the MVP
      baseline, *before* the twenty-five-round polish pass. It has been an
      estimate the whole time, and it now appears in seventeen files justifying
      real decisions: why the framing preflight is worth two seconds, why a
      rescore is arithmetic rather than a re-read, why the viewfinder must not
      heat the phone beforehand.

      Also established that nothing times the pipeline, and — the useful half —
      that `diagnose.ts` has timed *itself* all along, reporting `cost.ms`. So
      the app measured its cheap pure-computation pass and not the expensive
      video one. The mechanism and the precedent were both already here.

      `Analysis.cost` is that gap closed: `{ ms, coldEngine }`, two
      `performance.now()` calls, no seeks. `coldEngine` is asked *before*
      `loadEngine` because afterwards the answer is always yes, and a first
      analysis on a cold cache pays a 19 MB download inside the measured span —
      folding that in would report the network rather than the pipeline. This
      is free in exactly the sense the `outbound` note uses when it declines to
      keep an expensive thing nobody reads: that objection is to seeks, and
      there are none here.

      It has a real consumer, which is why it is kept rather than logged.
      `Analysis.cost` rides into a stored report and therefore into an exported
      backup, so `COURT-CHECK.md` step 8 no longer asks for a stopwatch — it
      says to sweep a basket, export, and read `cost` per entry. Pinned by a
      check in `backup.test.ts` that the field survives both `saveSession`'s
      spread and `normalise`'s, because that instruction is worthless the day
      either starts whitelisting fields.

      A LATENT BUG FELL OUT OF ADDING THE CALLER, which is the part worth
      recording. `isCachedOffline` opened with `if (!('caches' in window))` —
      *outside* the try block that catches everything else in it. In any context
      with no `window`, that is a `ReferenceError` rather than the `false` every
      other failure there returns, and nothing had ever reached it from one
      until `runAnalysis` began asking whether the engine was cold. Reproduced
      the throw in Node directly before changing anything, fixed at the source
      with `globalThis`, and confirmed the browser answer is unchanged.

      THE SEVENTEEN COMMENTS ARE NOT REWRITTEN, deliberately. A consistent
      estimate is a different problem from R40's two contradictory ones, and
      replacing seventeen prose figures with a second unmeasured phrasing would
      be churn that needs its own re-verification. What is stated instead, once
      and where a reader will find it: `Analysis.cost`'s own doc names the
      provenance, and `README.md` — the one document that claims to be accurate
      — now carries a note saying every duration in the repo is an estimate from
      before anything timed itself, and where the real numbers will come from.
      A future round sweeps them when step 8 comes back with figures.

      NOT VERIFIED END TO END, said plainly. The cost field could not be watched
      being populated: it is assembled at the end of a successful `runAnalysis`,
      and this environment cannot produce a clip with a player in it — an empty
      blob is refused at `loadVideo` long before. What was checked live is that
      the pipeline still runs and still refuses correctly with the new `await`
      in front of it, and that `isCachedOffline` still answers in a browser.

- [x] **R47** — The untested screen layer, which turned out to be two functions
      rather than fifteen files.

      The round opened on the premise that fifteen components and screens have
      no coverage, including `Report.tsx` at 774 lines and `PosePlayer.tsx` at
      771, and that a real bug had already been found in one of them by reading
      (R36). Surveying before extracting corrected that premise, and the
      correction is the finding:

          file             lines   own top-level fns   imports from lib
          Report.tsx         774          1                  10
          PosePlayer.tsx     771          0                   7
          Home.tsx           488          1                   4
          FramingCheck.tsx   505          0                   3

      The big files are JSX over decisions that already live in tested modules —
      `refusalFor` and `injuryNotes` in `verdict.ts`, `deltasAgainst` in
      `progress.ts`, `drawSkeleton` and `ghostFor` in `skeleton.ts`,
      `recordingType` in `record.ts`, `readQuality` in `statusLabels.ts`. This
      codebase has been doing the extraction all along; that is what those
      modules are. "Fifteen untested files" counted files rather than logic and
      overstated the risk accordingly.

      Two genuine exceptions, both now extracted and both worth having found:

        · `chartGeometry`, out of `Trend.tsx` into `components/trendGeometry.ts`.
          A hundred lines of path building behind the one thing on the progress
          sheet a player reads as evidence. A dot in the wrong place is not a
          cosmetic bug — it is the app asserting something about somebody's
          serve that did not happen, and the rubric-break logic exists precisely
          because a line drawn across a recalibration reads as a climb the
          player did not make. Fourteen checks: points inside the viewBox, a
          higher score drawn higher, a lone point centred rather than dividing
          by zero into a NaN that would empty the chart, one run per rubric, the
          break rule halfway between the two serves rather than on either, only
          the superseded run drawn as background, no fill under a run of one,
          and the label clamped inside a box both charts let overflow.
        · `nearestFrameIndex`, out of `PosePlayer.tsx` into `analysis/geometry.ts`.
          A binary search with a nearest-neighbour tie-break, and the player
          reasons at length about the case where it goes wrong: the browser
          snaps `currentTime` to a decoded frame boundary, so on a clip whose
          boundaries sit off the pose cadence it lands on the *neighbour* of the
          frame a keyframe was measured at, and the symptom is a callout that
          silently fails to draw. Ten checks, including that the answer never
          leaves the array across the whole range, and that a snapped playhead
          is never more than one sample from where it was measured — the failure
          bounded rather than denied.

      `strokeOf` stayed with the component on purpose: it is a choice about ink,
      and `trendGeometry.ts` deliberately knows nothing about how the paths it
      builds are painted.

      ONE TEST WAS WRONG AND THE CODE WAS RIGHT, which is worth recording since
      the reverse is what this phase keeps finding. The bridged-gap check
      asserted that a moment mid-gap takes the earlier edge; it went red, and
      the reason was that the moment chosen sat at the *exact* midpoint of a
      third-of-a-second hole, where there is no nearer edge. The tie-break is
      `<` rather than `<=`, so the later frame wins, consistently. Kept as its
      own named check rather than quietly moved off the boundary — an exact tie
      is a real case on a bridged gap, and now it is a decided one.

## Phase 8 — the measurements nobody is told about (R48–R64)

Activated from `PHASE-8.md`, which asked to be appended here and never was. That
file stays the derivation — every round below was written after reading the
engine, and it names the file it plugs into and the claim it is not allowed to
make. Read it before starting a round; these entries are the ledger, not the spec.

**Renumbered on activation, because the numbers collided.** `PHASE-8.md` proposes
R44–R58 and R44–R47 were already spent in Phase 7 on entirely different work —
the MediaPipe entry chunk, the pre-frame refusals, the "half a minute" audit and
the screen layer. Two rounds sharing a number in one ledger is the confidently
mislabelled failure this repo refuses everywhere else, so Phase 8 continues the
sequence instead. The mapping, once, so nobody has to reconstruct it:

      PHASE-8.md   here    what it is
      R44          done    the serve's own clock — landed already, see below
      R44b         R48     spend the frame budget where the swing is fastest
      R45          R49     the ghost: today's swing over your best one
      R46          R50     use the uncalibrated register the one honest way
      R47          R51     leg drive, measured rather than timed
      R48          R52     a pause between the trophy and the drop
      R49          R53     first serve against second serve
      R50          R54     share the replay as motion
      R51          R55     more than one player on one phone
      R52          R56     did it go in
      R53          R57     the drills as a week, not as a footnote
      R54          R58     a trip, in one card, for a coach
      R55          R59     make the fixture shoot something a user does by accident
      R56          R60     platform against pinpoint
      R57          R61     ball speed off the strings
      R58          R62     court lines — listed to be refused, not built

`PHASE-8.md`'s **R44 is already done** and is not renumbered, because it landed
before this activation: the landing floor became a share of the serve
(`MIN_LANDING_SHARE = 0.258`) in `9079deb`. It was run by the unattended loop
against `feature_backlog.json` rather than against this file, which is why no
entry for it appears in Phase 7 above. Recorded here so the ledger stops
disagreeing with the tree.

**R59 is promoted** out of its ranked position to run directly after R52, ahead
of the whole product band. It is the only round that unblocks real footage, and
real footage is what `groundTruth.ts`, hip–shoulder separation, shoulder tilt,
`UNDER_RESOLVED.pronation_deg` and `chain_span_ratio` are all waiting on. Work
that unblocks a person with a phone outranks work that does not.

**Two rounds below come from `feature_backlog.json` rather than from
`PHASE-8.md`** — R50b and R50c. They were nearly merged into R50 as duplicates
and are not: R50 puts deltas on `Consistency`, which is the basket; R50b puts one
on the glance through `carryForward`, which is between serves on court. Same
family, different surface, different refusals.

- [x] **R48** — Refused, and measuring the premise is what refused it. The round
      asked for a weighted sampling schedule on the two windows where the frame
      budget really binds. Its mechanism was that contact is already known before
      the fine read, since `readWindow` centres a located window on
      `times[index]`. That is true, and it is true of the one window that does
      not need it.

      **The budget binds and the contact time is known in disjoint cases, and
      they do not merely fail to overlap — they anti-correlate exactly:**

          window                              span   rate    budget   contact
          located serve (LEAD_IN + LEAD_OUT)  2.70   32.00   spare    known
          blind fallback (scan found none)    5.00   24.00   BINDS    unknown
          single pass, at its longest         4.50   26.67   BINDS    unknown
          single pass, 3.0 s                  3.00   32.00   spare    unknown

      The crossover is `MAX_FINE_FRAMES / FINE_FPS` = 3.75 s. A located window
      spans 2.7 and spends 86 of its 120 frames; the two that spend all 120 are
      the blind fallback, whose defining property is that the scan found nothing
      to aim at, and a single-pass clip, which `extractServe` never scans at all
      — `times` is forced to `[]` for anything under `SINGLE_PASS_SECONDS`
      regardless of what a caller passes. There is nothing to weight around in
      either.

      **A subtlety that made the premise look right:** `located: true` does not
      mean the contact time is known. A short clip read whole reports
      `located: true` and has no serve time behind it. The flag means "this
      window was not a blind guess", which is a different claim.

      **What it could ever have bought, had they overlapped:** the ceiling is
      `FINE_FPS` through a swing of about a sixth of a second, so 5.33 samples
      against the fallback's 4.00. A gain of 1.33 samples — and the fallback is
      the path that ends in "I could not find a serve in that clip" more often
      than any other, since `!located` drives its own refusal in `analyze.ts`.
      Spending engineering there to buy one sample on the clips most likely to be
      refused is the wrong end of the app.

      One check in `robustness.test.ts` pins the anti-correlation, stated in
      `MAX_FINE_FRAMES` and `FINE_FPS` rather than in 3.75 so the crossover moves
      when they do — **and it is written to go red exactly when this round
      becomes worth reopening.** `FINE_FPS` is now exported for it, on the same
      argument `MAX_FINE_FRAMES` already carries.

      Canary run, and reported rather than claimed: widening `LEAD_OUT` from 0.8
      to 1.9 pushes a located window to 3.80 and turns this check red with "a
      located window spans 3.799999999999997, past the crossover". It also turns
      `a located serve is still read exactly where it was found` red, for the
      different and correct reason that the window moved off the serve. Two
      checks, one of them mine, neither over-broad.
- [x] **R49** — Split, because the yaw gate turned out to need a number the
      stored report could not honestly supply. Sub-rounds:

        · **R49·1 — [x] tell an unread camera angle apart from one that reads 45.**
          The gate's whole job is refusing a pair whose camera moved, and
          `estimateYaw` returns 45 from two failure exits while 45 is also a real
          corner-on reading. Two clips that both failed to measure would differ
          by 0° and sail through a 5° gate — the confident-nonsense failure
          arriving *through* the guard written to prevent it.

          `Spatial.yaw_measured` labels the fallback, and rides onto the stored
          report via `triage.quality`, which is where a comparison between two
          saved serves has to read it: `Session` is `Omit<Analysis, 'frames'>`,
          so nothing can recompute it later. `normalise` repairs a row stored
          before the field to `false`, never `true` — a serve that really was
          measured and predates the field loses a comparison it could have had,
          which is the cheap side of that trade.

          No reading moved: `yaw_deg` is identical in both cases and every band
          set against it is untouched. Two checks, both canaried to one failure
          each — flipping the repair to default true reddens only the storage
          check, and making the fallback claim `measured` reddens only the
          engine check.

          Worth recording that the codebase already knew about this sentinel in
          two places and correctly declined to care, because for `axes.ts` and
          `diagnose.ts` the answer genuinely is the same either way. R49 is the
          first consumer for which it is not, which is what earned the field.

        · **R49·2 — [x] the pairing rule.** `pairTracks` in `lib/trackPair.ts`,
          a new file rather than an extension, because `poseTrack.ts` is imported
          by `db.ts` and this needs `progress.ts`'s `typeOf`/`scoringVersionOf` —
          which would have closed a cycle through storage to answer a question
          about geometry.

          The transform is taken **once, at contact, and held**, which the round
          did not say and which is the only reading of it that is not wrong:
          re-deriving it per frame subtracts the body's own motion along with the
          camera's, and the hip centre rising between the trophy and contact *is*
          the leg drive. Aspect is folded in at the same point, since a track
          stores x in frame widths and a portrait clip and a landscape one
          disagree about what an x of 0.1 is worth — without it a pair from two
          phones lines up nowhere. Residual after zoom, pan and orientation:
          **0.00039 of a shoulder-to-ankle**, which is stored-precision
          quantisation rather than surviving camera, about a ninetieth of the
          0.0341 floor.

          Two refusals beyond the five the round named, both of which fall out of
          the geometry being impossible rather than being new policy:
          `no_contact` when contact is outside the stored span, and `no_scale`
          when hips, shoulders or ankles are below `VISIBLE_FLOOR` at contact —
          the cropped-feet case `fixtures/README.md` deliberately shoots. All
          seven are enums, never sentences, and every one is silent: this is an
          extra picture on a report that is complete without one.

          **Nothing below the hips is returned at all**, rather than returned for
          the drawing layer to skip. The measured argument was already in
          `poseTrack.ts` — no leg load whatever moves the worst landmark 0.0387
          against a 0.0341 floor — and a rule enforced in the data cannot be
          forgotten by R49·3. The ankles are still read, for the scale.

          One defect found and closed here rather than left for R65: a row
          claiming `yaw_measured` with no `yaw_deg` behind it — reachable because
          `triage.quality` still has no stored-shape guard — made the gap `NaN`,
          which refuses as `camera_moved`. The right outcome under the wrong
          name, and a wrong name is what the next reader trusts.

          Seventeen checks in `lib/__tests__/trackPair.test.ts` plus three in
          `comparisons.test.ts`, which is the tenth-figure entry the round asked
          for and the first there that is a picture rather than a number.
          Canaried three times, one red check each and nothing else: dropping the
          aspect fold-in, tightening the yaw gate from `<=` to `<`, and removing
          the finite-yaw guard.

          **Considered and not added: a handedness refusal.** A left-handed serve
          drawn under a right-handed one is confusing, but it is not a false
          claim, and profiles do not exist yet (R55) so the app cannot know it is
          looking at two people. R49·3 is where that decision belongs, with a
          screen to hang it on.

          No production caller until R49·3 draws it, which is what the split is
          for — not behind a flag, and covered end to end.

        · **R49·3 — [x] draw it.** `drawPairedGhost` in `pose/skeleton.ts`,
          reusing `GHOST_BONES` and `PALETTE.ghost` — no new colour, and the same
          ink for the same reason that palette entry already gives: it is "the
          same player somewhere they were not", which describes a target pose and
          another of your own serves equally well. Dashed and dim is the whole
          distinction from a tracked body, so both halves are set inside the
          function rather than trusted to a caller, and the dash is put back
          before anything tracked is drawn — the failure that would otherwise
          dash the player's own body and pass every check written about the ghost.

          **THE ROUND'S SEQUENCING RULE IS WRONG, and finding that is most of the
          round.** R49 says to build the same-session case first, because two
          serves from one basket share a camera by construction and satisfy the
          5° gate for free. That case cannot reach this surface: `TrackPlayer`
          renders only where there is no video (`!live` in `Report.tsx`), and a
          basket always has one — the live `PosePlayer` wins. The pair this
          screen can actually hold is `previous`, which was already on
          `Report`'s props for the deltas. So the ghost ships across sessions,
          which is precisely the case the yaw gate was written for and the case
          R49b is an open question about. Nothing was built for the basket.

          `pairedLookup` extracted to `trackPair.ts` rather than left as a
          `useCallback` — R47's finding about this layer, applied while the code
          was being written instead of afterwards. It holds three decisions worth
          testing: contact alignment comes off the pair rather than being
          recomputed; nearest rather than last-started, which is the *opposite*
          of how the tracked body is chosen and deliberately so, since the two
          serves share no clock; and nothing at all outside the older swing's
          span, because clamping to its last pose would freeze a body mid-air for
          the rest of the replay.

          Nine checks — four on the lookup in `trackPair.test.ts`, five on the
          drawing in `drawing.test.ts`. The recording canvas stub gained
          `passes`, recording the style at rasterise time, because `strokes`
          records `strokeStyle` at `lineTo` time and every two-pass stroke in
          that file colours its path *after* building it: fine for geometry,
          useless for ink, and nothing had ever checked a colour before.
          Canaried twice — dropping the dash reset reddens four checks, all four
          because they are all defined in terms of dashedness and leaving it on
          genuinely breaks all four claims; dropping the null-landmark guard
          reddens exactly one.

          Verified live, and the negative case first: the seeded report predates
          `yaw_measured`, so `normalise` repairs it to `false` and the pair was
          refused as `yaw_unmeasured` with nothing on screen — R49·1's guard
          firing in life. With two reports that both carry a measured angle, the
          note appears and the ghost paints. Proved by subtraction rather than by
          looking: the same report sampled with and without a serve behind it
          differs by **120 dim pixels spanning canvas rows 328–640**, on a 734px
          canvas whose hip line sits at 490 and whose ankles sit at 683. The ink
          below the hip line is the displaced *arm* the probe gave the older
          serve, and it stops well short of the ankles. Console clean on a fresh
          tab; the probe rows were removed and the store put back as found.

          **DEPARTURE:** a `git checkout --` run to undo a canary reverted this
          round's whole `skeleton.ts` change, because the file was tracked and
          the module was not yet committed. Re-applied and re-verified green
          before continuing. `UNATTENDED-LOOP.md` says stash before reset for
          exactly this reason and the rule was not followed.

- [x] **R49b** — Bounded from `estimateYaw`, which is the half that needed no
      footage. The half that does — how often two clips *from one trip* agree —
      is still open and still behind R59, because it is a fact about how people
      film.

      **The worry was that the gate is dead on arrival.** If the reading wanders
      more than 5° between two takes of an identical camera, `pairTracks` refuses
      everything and the ghost never appears for anybody, whatever people do with
      their phones. Twelve seeds at each of six dialled angles say it does not:

          dial   mean read   deviation   worst spread   pairs within 5°
            30      29.0        2.77         11.00           83%
            45      46.4        1.80          7.00           94%
            60      62.3        1.43          5.00          100%
            75      78.0        1.29          5.00          100%
            82      84.3        1.03          3.00          100%
            88      85.1        1.11          4.00          100%

      From 60° up every pair of takes agrees inside the gate, and this app asks
      for side-on footage — so the whole five-degree budget is available for the
      camera actually moving rather than being spent on the tracker.

      **It improves with angle for a structural reason, not by luck.** The
      reading is `acos(span / SHOULDER_SPAN_RATIO)` and `d(acos p)/dp` is
      `-1/√(1-p²)`: unbounded as the projected span approaches full width, which
      is face-on, and smallest as it approaches zero, which is side-on. The
      estimator is best conditioned exactly where the app is used. Pinned from
      both sides — side-on must agree completely, face-on must not — so a change
      that flattened the curve goes red rather than passing quietly.

      **One limit worth writing down.** The mean saturates: 75° reads 78.0, 82°
      reads 84.3, 88° reads only 85.1. Past roughly 82 the reading stops tracking
      the dial. Fine for a gate on a difference between two readings, not fine
      for anything grading the absolute — the same shape of finding
      `UNCALIBRATED.external_rotation_deg` carries, reached from a different
      direction. **Nothing grades this absolute today**; recorded so nothing
      starts.

      Stated in `GHOST_YAW_TOLERANCE_DEG` rather than in 5, so the checks go red
      if either the gate or the estimator moves — canaried by tightening the gate
      to 1°, which reddens exactly the side-on check.

      **R50c still needs more than this.** It wants two clips filmed from the
      same *spot*, tighter than the ghost's 5°, and cycle 105's 315 ms branch
      jump between 50° and 55° is the reason. The table above says a 5° gate is
      affordable; it says nothing about a tighter one, and at 60° the worst
      spread is already 5.0.
- [~] **R50** — Use the uncalibrated register the one way it is honest: as a
      delta between two of the player's own serves, on `Consistency`, as data
      rather than as a graded signal. **Split**, because three readings with three
      different confounders is three rounds wearing one number, and the first of
      them had to build the machinery, the storage guard and the surface as well.

      **What none of them may say: any sentence containing a target.** "Your
      shoulder laid back 18° further on serve 4 than on serve 1" is a fact about
      two serves. "18° further than it should" is four invented numbers and the
      thing this register exists to prevent. No entry leaves `UNCALIBRATED`; each
      gains a line saying a delta is reported and an absolute still is not.

        · **R50·1 — [x] external rotation, and the machinery.**
          `Consistency.uncalibrated` is a list of `UncalibratedDelta`, keyed by
          the `UNCALIBRATED` identifier itself so a reading withdrawn there and a
          surface still printing it cannot drift apart. Each carries the two
          serve numbers, the change, and **the bound that licensed it** — stored
          rather than consumed, because it is the whole permission, and
          `usableDeltas` in `db.ts` re-applies the writer's own `delta > bound`
          rule on the way back out. A row that no longer clears its bound is
          dropped whole; there is no honest repair, since inventing a zero bound
          would licence every change ever measured.

          The extremes of the basket are named, not the first and last serves —
          the largest true change is the one worth reporting, and the bound is
          what stops that being a noise-maximising choice. No second lever
          threshold: `readExternalRotation` already returns a null `deg` below
          `MIN_ROTATION_LEVER`, and `signals` already omits a lean below
          `MIN_EVIDENCE`, so both existing refusals are inherited rather than
          copied. Both halves or neither — without the lean there is no bound,
          and without a bound the delta is a number nobody can say is not posture.

          **DEPARTURE, and it is the round's own example sentence.** R50 proposed
          "laid back 18° further on serve 4 than on serve 1" as the model of an
          honest line. It is honest and `voice.ts` refuses it: `MATH` fails any
          line carrying a figure in degrees. The usual escape is `readoutOf` and
          it is shut — `external_rotation_deg` has no ladder in `anatomy.ts` and
          cannot be given one, because a ladder is a set of absolute stops and
          this reading is in `UNCALIBRATED` precisely for having no zero. So
          `uncalibratedLine` ships the direction and not the magnitude: "Your
          hitting shoulder laid back further on serve 4 than on serve 1." Thirteen
          words, no figure, no target. Precedence call: the copy gate is
          mechanical and outranks the round's phrasing.

          **A DEFECT FOUND WHILE PLACING THE COPY CHECK, fixed here because the
          new checks landed in it.** `copy.test.ts` called `report()` two thirds
          of the way up the file, and `report()` exits non-zero only when it has
          failures to print — so the eight checks below it printed crosses and
          the file still exited 0. Proved rather than reasoned about: a
          deliberate `assert(false)` in the verdict section printed one cross and
          exited 0. Eight checks were decorative, including every check that the
          flaw table, the drill table and the copy table agree. `LOOP.md` names
          this file as one of three critics in executable form. The tally moved to
          the end; a static guard against its return is **R66**.

          Twelve checks — eight in `engine.test.ts` on the rule, four in
          `db.test.ts` on the stored shape, two in `copy.test.ts` on the line.
          Canaried three times, one intended failure each: dropping the bound
          rule in the writer, dropping it in the reader, and putting a degree
          figure back in the sentence.

          Verified live rather than read. `?demo=basket` still hangs on
          `sampleClip` exactly as R41 recorded, so the panel was driven through
          its real path instead — a report written straight into IndexedDB,
          reopened from the history, so `normalise` → `usableDeltas` →
          `ConsistencyPanel` all ran. The line renders between the serve chips
          and the spread rows, console clean, and the probe row was deleted after.
          Contrast measured on the rendered element: **4.87:1 at 11.5px**, the
          quietest text on the panel. A finding, in `README.md`, not a change.

        · **R50·2 — [x] landing balance delta.** Second entry through the same
          machinery: same shape, same storage guard, same refusal-rather-than-
          hedge rule, one new `uncalibratedLine` case.

          **THE ROUND'S OWN BOUND WAS THE WRONG NUMBER, and both the ledger and
          this entry said 0.0035.** That is where a square landing *sits* — the
          reading is a magnitude, so noise about a true zero folds positive
          instead of cancelling — and it is not how far a reading of it wanders.
          A delta is a difference between two readings, so the bound is the two
          measured deviations in quadrature: `hypot(0.0028, 0.0045)`, about
          0.0053 body heights, using the wider figure on one side so a comparison
          spanning the range gets the pessimistic reading. Against a measured
          0.0035-to-0.0657 span that is roughly a twelfth of the whole range, so
          this entry refuses often, which is the truth about the reading rather
          than a fault in the bound. Pinned by a check on the exact arithmetic:
          two readings 0.0045 apart look real against a floor of 0.0035 and are
          barely one deviation of a difference.

          The three deviation figures moved from prose into named exports on
          `diagnose.ts` — `LANDING_SQUARE_FLOOR`, `LANDING_SQUARE_DEVIATION`,
          `LANDING_WIDE_DEVIATION`. Declared as a change to a load-bearing module
          and it is constants only: nothing in that file reads them and no
          reading moved. The bound is computed from them rather than written
          down, so a re-measurement carries through instead of leaving two
          numbers to disagree.

          **The confounder is of a different kind from R50·1's**, which is the
          only reason this is a second entry rather than a copy. External
          rotation can be faked by a posture the app can also see, so its bound
          is arithmetic on a second measurement. Nothing fakes a landing offset —
          it is read off image x, what the camera measured rather than depth a
          network inferred, and it is the best-conditioned reading in the
          register. What can fake it is noise, so the bound is the noise. A check
          holds that neither entry's refusal silences the other.

          **The copy grades nothing, and one adjective is the whole risk.**
          "You finished further across your feet on serve 5 than on serve 2" —
          thirteen words. `offset` is unsigned, so the app does not know which
          way the body went, and ungraded, so it does not know that further was
          worse: a serve hit with real intent finishes travelling, and a
          professional lands well across their front foot on purpose. `fell`,
          `lost`, `off balance` and `collapsed` are all asserted against in
          `copy.test.ts`, because the tempting sentence is the graded one.

        · **R50·3 — premise measured, and the round's own number is the wrong
          one.** No production code this cycle: a round whose premise is
          unverified starts read-only, and this one's premise was a figure that
          means something else.

          The round says "the residual 21% tempo-dependence is the bound's whole
          content". `UNCALIBRATED.chain_span_ratio` and `README.md` both carry
          that 21%, and it is the *total* spread of the reading across a tempo
          sweep with seed-to-seed noise folded in. That is the right figure for
          the question the register asks — is this scale-free enough to band —
          and the wrong one for bounding a delta, **for exactly the reason 0.0035
          was wrong in R50·2**. Two rounds in the same family, both finding the
          headline figure is not the figure a difference needs.

          Measured across twelve seeds at each of the same three tempos the
          register swept:

              tempo    mean     sd      sd/mean
              1.10 s   0.1036   0.0065    6.3%
              1.35 s   0.1065   0.0060    5.6%
              1.70 s   0.1097   0.0070    6.4%

          Two terms, not one. **Noise at about 6% of the reading, flat across
          tempo** — which is what makes them separable at all — and a **mean that
          moves 5.7% across the whole 0.6 s range**, about 0.0102 per second of
          tempo difference. So a delta carries
          `hypot(√2 × 0.0065, 0.0102 × |Δt|)`: **0.0092 at equal tempo**, 8.6% of
          a reading near 0.107, growing only as the two serves' tempos diverge.
          Usable — a bound at 21% would have refused every comparison, and refused
          it mostly for a reason that is not tempo.

          Three checks in `depth.test.ts` pin the decomposition, including one
          written to go red **in both directions**: if the mean's movement ever
          approaches 21% the finding here is wrong, and if it falls under 2% the
          division has removed the dependence entirely, which is a different and
          better finding. R50·3 builds on these numbers rather than on the
          register's.

          **`UNCALIBRATED.chain_span_ratio` is not corrected**, deliberately. Its
          21% is accurate for what it claims and the entry is about bandability,
          not about deltas. What was missing is the decomposition, and that is now
          in `depth.test.ts` where the sweep lives.

- [x] **R67** — The store ratchet was counting pictures and tracks, and a report
      is not made of pictures and tracks.

      `storeWorstCase` in `footprint.test.ts` was stills plus track, full stop.
      That was a fair scope while those were the only two things anybody was
      adding — and it meant **three consecutive rounds put fields into a stored
      report without any number in the storage gate being able to move.**
      `yaw_measured` (R49·1) and `Consistency.uncalibrated` (R50·1) are both
      invisible to it, and so is everything a report has always carried:
      seventeen measurements with a headline, a blurb and a drill apiece, six
      captioned phases, the diagnosis, the triage block.

      Measured off the same rig the track figures come from: **9.2 kB of
      measurements and copy, 0.8 kB of captions** — a tenth of a report's own
      track, on every report the store keeps. Multiplied by `sessions` rather
      than by `min(sessions, KEEP_STILLS)`, because the prune ladder strips
      pictures and downgrades tracks and there is nothing in it that strips the
      words.

      **What that did to the ratchet is the finding.** `STORE_RATCHET_BYTES` was
      set "a third above the measured worst case" and the worst case undercounted
      by 0.6 MB. Counted whole, a full history is 2.9 MB against a 3.0 MB line —
      **1.03× of headroom, not 1.33×.** Left alone it would have fired on the
      next stored boolean and told nobody anything, which is the same uselessness
      as a line set too loose, arriving from the other side.

      Re-derived to 3.9e6 at the same third the comment always claimed. The
      policy did not move; the measurement it rests on was wrong. Both canaries
      still fire at the new line — twice the history breaches it, and a track
      four times as wide breaches it — and zeroing the new term reddens the
      headroom check *and* the breach canary, which is the evidence that the
      ratchet and the measurement are now coupled rather than merely both
      present.

      Phase 8's own additions, for the record and so the next field has something
      to be compared against: **19 bytes for the camera flag, 71 for one delta.**
      Inside the noise, and now countable.

- [x] **R66** — A tally that does not cover its own file.

      `lib/__tests__/tallies.test.ts` walks all 46 suites and holds two rules:
      exactly one `report()` per file, and nothing executable after it.

      **It found a fourth instance on its first run, and that one predates this
      session.** `triage.test.ts` tallied at line 677 with a helpers section
      below. Nothing was broken — an interface is erased and four function
      declarations are hoisted — so it was a true positive against the rule and
      a false one against the defect. The tally moved to the end anyway, and
      **the rule stays the strict one rather than the precise one** ("no
      `check(` after the tally"): a helpers section under a tally is exactly the
      shape that invites somebody to append a check into a dead zone, and
      "nothing goes after `report()`" is a rule a person can follow without
      thinking about hoisting.

      **A source scan rather than a harness change, deliberately.** Making
      `report()` idempotent or registering an exit hook would fix the symptom
      invisibly — a file with a stray mid-file tally would go green and stay
      wrong. The position *is* the invariant, so the position is checked.

      Canaried both ways: a second tally reddens both checks, a check appended
      after the tally reddens the second. And the scan checks its own pattern
      against strings — an indented call, a commented one, an awaited one, and a
      trailing comment that is correctly not executable — because a scan whose
      pattern quietly stopped matching would report every file clean and look
      exactly like a repo with nothing wrong in it.

- [ ] **R50b** — Did the racket lay back further than your last serve. The
      backlog's `er-delta-on-the-glance`, and a different surface from R50: the
      glance, between serves, through `carryForward`, which already compares two
      serves on one trip and already says nothing rather than hedging. Two extra
      refusals on top of its existing ones — the lever below `MIN_ROTATION_LEVER`
      on either serve, and a spine-lean difference large enough that
      `ER_LEAN_SENSITIVITY` says the change is mostly posture. **The floor is
      about 15°, so it will refuse most comparisons.** That is the truth about
      what a phone can see, not a failure, and it must not be softened.
- [ ] **R50c** — A trunk-sequence delta between two serves filmed from one spot.
      The backlog's `trunk-lead-delta-same-spot`. The width-derived trunk lead has
      an absolute belonging to the camera and a change that does not: 178–204 ms
      of separation at every yaw from 40° up against a dialled 190, deviation
      25–31 ms against the incumbent 40–54. Same `carryForward` shape, with one
      refusal that has no precedent yet — the two clips must have been filmed from
      the same spot, which is R49b's question and tighter here than the ghost's 5°.
- [ ] **R51** — Leg drive, measured rather than timed.
      `UNCALIBRATED.legs_peak_ms` says it in its own words: it "times the leg
      drive without measuring it — the same peak whether the player drives or
      not". Measure hip-centre vertical rise from trophy to contact in body
      heights, plus knee extension rate across the same span, **read from image y
      alone** — vertical for every camera the app accepts, and per that entry its
      mean does not move at all from 20° to 88° of yaw. Completes the pair with
      knee bend at the trophy, which is already graded: how far the legs loaded,
      and how much became upward motion. **Ships into `UNCALIBRATED` first**, with
      a rig sweep proving the reading tracks the dial — exactly what
      `legs_peak_ms` failed. Needs R60 to interpret what it measures.
- [ ] **R52** — A pause between the trophy and the drop. The rhythm group cannot
      see a hitch — the player who reaches the trophy, stops, and swings from a
      standstill, one of the most common club faults and one of the most visible
      on video. Read it as a trough in racket-hand planar speed off
      `kinematics.ts`, which already produces the series; planar speed off image x
      and y touches no inferred depth, the property that makes `chain_span_ms` the
      best-conditioned timing in the engine. **Sweep against `motionSeconds`
      first** — a slow deliberate serve is not a hitch, and a detector that cannot
      tell them apart is worse than none. If it cannot separate them on the rig,
      an `UNDER_RESOLVED` entry saying so is the finished round.
- [x] **R59** — *(promoted here, ahead of the product band)* Split, because
      "reachable on a phone" and "knows which of the six clips is next" are two
      different jobs and the first is what actually unblocks anybody.

        · **R59·1 — [x] reachable without a dev build.** The export was behind
          `import.meta.env.DEV` and everything about it assumed a desk: a console
          for the list of what was still missing, a dev server to run at all.
          `?fixture` is the door `?check` already uses, for the reason that one
          gives in its own comment — a path that only runs in a dev build cannot
          be run on the phone that matters — and it stays behind a query string
          so no ordinary player meets it. `FIXTURE_EXPORT` is read once at module
          scope in `App.tsx` and passed to `Report`, so `location.search` keeps
          one reader.

          `downloadFixture` now **returns** what it saved and what is still
          missing rather than only printing it. The console print stays, because
          from a desk it is genuinely the better place to read a dozen lines
          from; the screen gets the same list, in the validator's own wording, so
          what the app says and what the suite will say cannot drift. Rendered as
          `.note` lines — no new class and no new CSS, since a list of caveats
          about a file is exactly what that class already carries here.

          **THE COST, MEASURED RATHER THAN WAVED THROUGH, and it is on the
          critical path.** Before: entry 408.87 kB (137.22 gzip), no fixture
          chunk at all — the `DEV` guard eliminated it. After: entry **415.28 kB
          (139.53 gzip)** plus a 2.86 kB chunk fetched on demand. **+6.41 kB raw,
          +2.31 kB gzip on every player's first paint.**

          The cause is not the button. `groundTruth.ts` was already half in the
          entry chunk through `analyze.ts` and `judge.ts`, which both import
          `framingIssues`; `exportFixture.ts` imports `packFrames`,
          `validateFixtureSchema` and `labelProblem` from the same module, and
          Rollup puts a module shared between the entry and a lazy chunk into the
          entry. So the validator half of `groundTruth` is now weight every
          player carries to serve a path behind a query string. Checked that
          `trackPair.ts`'s `VISIBLE_FLOOR` import is *not* the cause — breaking
          that edge leaves the figure at 415.28 kB exactly.

          Paid rather than refused, on the grounds that 2.31 kB gzip is 1.7% of
          the critical path against five threads that are otherwise permanently
          stuck, and **queued for removal as R68** rather than left as a fact
          nobody wrote down. Splitting `groundTruth.ts` is a refactor and
          `LOOP.md` says a refactor is its own cycle.

          Two checks in `fixtures.test.ts` are the ones that made this safe to
          ship outside a dev build: a draft carries **no image of anybody at any
          depth** — searched over the serialised form rather than over known
          field names, because the failure being guarded against is a new field
          nobody thought to check — and the only thing a fixture says about a
          person is what the labeller typed. R30 found the opposite shape in the
          backup path and found it after the fact.

          A third reads `App.tsx` off disk, because a dev build cannot check this
          gate at all: `import.meta.env.DEV` is true there, so the flag is masked
          and the button appears either way. The regression it catches is one
          line — somebody tidying `FIXTURE_EXPORT` back to `DEV` alone, which
          would look like a cleanup in the diff and silently re-strand five
          threads. Canaried to exactly that one check.

          **Live verification is partial and the missing half is named.** The
          negative case ran: on a saved report the button is correctly absent,
          because `isLive` is false with no frames. The positive case needs a
          live analysis, which needs a clip with a player in it, which is the
          same block R41 recorded — `sampleClip` no longer resolves in this pane.
          The button has not been watched appearing.

        · **R59·2 — [x] the checklist, and it is not the one the round asked
          for.** The stub said to read it off `RECORDED` so it shows which clip is
          *next*. That cannot be built and should not be faked: `RECORDED` is a
          build-time list of files committed to the repo, and a phone standing on
          a court has no idea what is in it and never will. A progress bar there
          would be the app claiming to see something it cannot.

          So what ships is the shoot list itself, in order, as `lib/fixturePlan.ts`
          — six clips with what to film and what each settles, on the same screen
          as the save button. The list to work down, with the app claiming to
          know nothing about where anybody is on it.

          **What binds it to the gate is the round's real content.**
          `fixtures/index.ts` does not ask for six clips; it asks for six clips
          spanning three axes — both hands, two views, two frame rates. A list
          that satisfied somebody's sense of thoroughness and not those axes
          would send a person out with a phone, take an afternoon of somebody
          else's tennis, and come back with a set the suite still refuses.
          `fixturePlan.test.ts` runs the list through `MINIMUM_RECORDED` and the
          gate's own three axes, so the two cannot drift. Canaried by making both
          left-handed clips right-handed: two checks red, the spread and the
          "asked for early enough", which are two distinct properties of one fact.

          Order is checked too, because it is the thing a list can get wrong
          while still looking right: the everyday case first, since if that
          disagrees nothing after it matters; the deliberate feet-cropped failure
          last, since it is the clip you want least if you only get one; and the
          first left-hander no later than fourth, because it needs a second
          person and is the axis `SPREAD` cannot be satisfied without.

          Every line faces `cueIssues` and the 25-word cap. A shoot list written
          in lab register is one more reason not to go to the court — and these
          lines are interpolated into JSX, so R69·1's scanner cannot see them.
          They are linted at the source instead, which is the same division
          `copy.test.ts` and R69·1 already draw between them.

- [x] **R69** — Split: build the gate, then fix what it finds. Rewriting the home
      screen's hero paragraph is a product decision and does not belong in the
      round that built a lint.

        · **R69·1 — [x] the gate.** `lib/__tests__/jsxCopy.test.ts` walks every
          `.tsx` under `src`, pulls the text between tags, and runs it through
          `cueIssues` — the same editor `copy.test.ts` applies to six data
          tables and has never applied to a component. **Ninety-six readable
          lines across twenty-five components. Fifteen fail.**

          **Text-matched, not parsed, and the allow list is checked against what
          the scan found** rather than assumed correct — `egress.test.ts`'s trade,
          for `egress.test.ts`'s reason. A regex cannot tell a sentence from a
          label, so it over-matches, and the answer is to write down every match
          with a verdict rather than tune the pattern until the output looks
          tidy. A tuned regex is a gate nobody can audit. What the pattern
          *cannot* see is named at the function: anything interpolated, because
          it skips braces entirely — which is most of `statusLabels.ts`, reached
          by `copy.test.ts` through its own functions instead.

          Seven of the fifteen are the lint being wrong and each says how: two
          chart labels where a leading "Overall" reads as a preamble in a
          sentence and does not in a heading; two lines on the dev-only `?corpus`
          screen; two privacy statements where **the passive is the claim** — an
          active rewrite needs a subject and the whole promise is that there is
          no "we" doing the keeping; and R30's export warning, where "not just
          numbers" is a hedge carrying the meaning and dropping it inverts the
          sentence.

          **Eight are real and unfixed**, listed with their measured fault so
          fixing one is a diff against a number: a filler "just" in the filming
          guide, 30 words in `FramingCheck`, a passive in `HandednessPicker`, 26
          words in `StoragePanel`, 28 on the home hero, 28 more on the home
          privacy line, a passive in `Report`, and 26 words under the replay.

          **AND ONE OF THEM CONTRADICTS THE LEDGER.** R28 recorded tightening
          `StoragePanel`'s "To carry it to a new phone" line to fit the cap it
          was auditing everything else against. It measures **26**. Whether it
          drifted afterwards or was never under is not knowable from what is
          written down; what is knowable is that a phase close-out claimed a fix
          that does not hold, and nothing could have told anybody, because no
          gate has ever read that file.

          Canaried by putting a deliberately awful line into `StoragePanel`: the
          gate names the line, its word count and all three of its faults, so the
          failure message is the fix.

        · **R69·2 — [x] the eight, fixed.** Nothing in a component is now over
          the cap, passive, hedged or preambled except the seven where the lint
          is wrong, and every one of those says why.

          What changed, and each keeps what it was for:

            · The filming guide loses a filler "just".
            · `FramingCheck` 30 → 20 words, and "gets checked" survives because
              it is not the passive the lint means.
            · `HandednessPicker` reads "which arm the app measures" — active
              without inventing a "we", which is the trap the exempt privacy
              lines fall into and this one does not, because there *is* an
              actor here.
            · `StoragePanel` 26 → 24, **keeping R24's three transfer methods**.
              The fix is a full stop where an em dash was, not a deletion: R24
              added email, AirDrop and a cloud drive deliberately, and cutting
              them to make a word count would have been this round undoing a
              previous one to please a lint.
            · The home hero 28 → 23: "the fix that matters most".
            · The home privacy line 28 → 20, losing a hedge and a passive at
              once: "Your video stays on this device and never leaves it."
            · `Report`'s saved-report note drops "was saved".
            · The replay note 26 → 23.

          **A THIRD STALENESS INCIDENT, AND THE WORST SO FAR.** The pane served a
          stale transform of `Report.tsx` **through a hard reload** — the old
          sentence rendered on a fresh tab after `location.reload(true)`, with
          the file on disk definitively changed. Only restarting the dev server
          cleared it. Rounds 3 and 12 were stale *consoles*, which is a nuisance;
          this was stale *content*, and had I trusted it I would have recorded
          fixed copy as unfixed and gone looking for a bug that was not there.

          **The rule this session has now earned three times over: when the pane
          and the source disagree, the source is right.** `grep` settled all
          three. `copy.test.ts`
      is named as one of three critics in executable form, and it walks `METRICS`,
      `SERVE_TYPES`, `FUNDAMENTALS`, `AXIS_COPY`, `DRILLS` and `everyVerdictCue()`
      — every one of them a data table. **Every sentence written straight into
      JSX is unchecked**, and there are dozens: the refusal notes, the player
      notes under both replays, the storage panel's export warning, the handoff
      caveat, the "those pictures need the clip" line. R28 found a phase's copy
      had drifted over the cap inside the tables that *are* linted; outside them
      there is no gate at all. Found by auditing three new lines by hand at the
      first consolidation, which is not a thing anybody will keep doing.

      The shape is a source scan over `src/**/*.tsx` for string literals inside
      JSX text positions, handed to `cueIssues`. **What it may not do:** parse
      TypeScript. A regex over source text will over-match — a `className`, an
      `aria-label`, a URL — so the allow list has to be checked against what the
      scan actually found, exactly as `egress.test.ts` does, rather than assumed
      correct. **The honest outcome if it cannot separate prose from markup**: an
      entry saying so, plus a hand-maintained list of the files whose JSX copy is
      linted, which is worth more than nothing and less than a scan.

- [x] **R68** — Paid, five rounds after it was incurred, and measured at both
      ends.

      **Split the other way round from the obvious one.** The tempting move is to
      pull `framingIssues` out, since it is the one thing the running app needs
      from an eight-hundred-line fixture module. Its own doc comment argues
      against exactly that: it sits beside the fixture machinery so that whatever
      real footage that suite grows covers it, rather than becoming a separate
      heuristic nobody validates. That argument still stands — and it survives
      the split, because coverage follows imports rather than file boundaries,
      and `robustness.test.ts` and `judge.test.ts` import it exactly as before.

      So the *framing* half moved and `groundTruth.ts` kept its name and its
      subject: `analysis/framingIssues.ts` is the check plus its four thresholds,
      124 lines; `groundTruth.ts` is the fixture schema, 802. The running app
      imports the first, the fixture tools import the second, and neither pulls
      the other.

          before R59·1   index 408.87 kB (137.22 gzip), no fixture chunk
          after  R59·1   index 415.28 kB (139.53 gzip) + 2.86 kB on demand
          after  R68     index 410.07 kB (137.60 gzip) + 8.55 kB on demand

      **5.21 kB raw and 1.93 kB gzip off the critical path**, and the validator
      half is now in the chunk that actually uses it — which is why that chunk
      tripled. Residual against the pre-R59 baseline: **1.20 kB raw, 0.38 kB
      gzip**, down from 2.31, and it is the button, the note and the dynamic
      import's own plumbing. That is the honest price of the fixture path being
      reachable from a phone, and it is now small enough to stop arguing about.

      No test lost or gained — 1063 both sides — which is the check that the
      split moved code and not behaviour.

- [ ] **R53** — First serve against second serve. The app knows flat, kick and
      slice; it does not know first from second, and for a club player the gap
      between the two is usually a bigger problem than either — a second serve is
      a different motion, not a slower first, and the player who patty-cakes it is
      doing something the app currently averages away. Tag a serve with one tap on
      the glance, or infer it within a basket where serves arrive in pairs, and
      partition the spreads `consistency.ts` already computes. **Pure product on
      existing readings: no new measurement, no new refusal.**
- [~] **R54** — Spiked. The gate the round asks for did not exist, and the cost
      it is gated on still cannot be measured here.

        · **R54·1 — [x] the spike, and what it found.** R54 says to "gate on
          `?check` the way the record button already does". `?check` gates on
          `recordingVerdict`, which asks whether `MediaRecorder` will encode a
          container this browser can read back — **answered from a camera
          stream**. The replay is a body drawn to a canvas, and that goes through
          `HTMLCanvasElement.captureStream()`, an API `MediaRecorder` support
          says nothing about. A browser could pass every check in `selfCheck.ts`
          and hand the player a share button that produces nothing.

          `canvasRecordVerdict` asks it, in two halves rather than one: whether
          `captureStream` exists, and whether it yields a stream carrying a video
          track. The second is the one a `typeof` check would miss — an API that
          exists and returns an empty stream looks capable and is not. A throw
          reads as "no track" rather than propagating, the same trade every probe
          in that file makes, and doubly right in a panel somebody opened to find
          out what their phone does.

          Confirmed live: `captureStream` present, one video track. **And
          `document.hidden` is `true` in the same breath**, which is the whole
          reason the other half is still open.

          **THE COST IS STILL UNMEASURABLE HERE AND R54 STAYS GATED.** Constraint
          8 is about cost, not capability: a canvas recorder on a warm phone is
          guilty until measured. The pane throttles exactly this path — R40 asked
          a canvas for three seconds of film and got 1.06, R41 found it stopped
          resolving at all. What changed is that the question now has a place to
          put its answer: `?check` reports it, so the court trip brings back a
          reading rather than nobody having asked.

          The new line was caught by `REPORT_VOCABULARY`'s own guard the moment
          it was written — two words added deliberately, which is the list doing
          its job rather than a nuisance.

        · **R54·2 — build it, once a phone has answered.** Blocked on the court
          trip, not on code.

- [ ] **R54 (as written)** — Share the replay as motion. `reportCard.ts` renders one still,
      the app's only egress and the one thing a player actually sends somebody.
      `TrackPlayer` draws a moving body to a canvas and `recordingType`/
      `selfCheck.ts` already know which containers this browser will produce
      *and* play back. A three-second replay with the fault's keyframe held is the
      strongest thing this app could hand somebody, and it contains **no image of
      any person** — the rare share that is safe by construction. **Constraint 8
      is the risk**: a canvas recorder on a warm phone is guilty until measured,
      so gate on `?check` the way the record button already does. Too big for one
      cycle — spike first.
- [ ] **R55** — More than one player on one phone. `consistency.ts` already
      carries `possibleHandoff` and `IMPLAUSIBLE_HEIGHT_SPREAD`: the app can
      detect the body changed and does nothing with it, while every trend,
      streak, practice focus and injury count silently assumes one player. Named
      profiles in `db.ts` keyed into `Session`, with the existing handoff detector
      offering the switch rather than a settings screen nobody opens. Makes the
      app usable by a coach with a squad or two people in a family, at no cost to
      the privacy model. **The migration is the hard part, not the feature**:
      every stored report predates profiles and must land under one default
      player without a prompt, proved by a test that loads a pre-profiles record.
      Too big for one cycle — spike first.
- [ ] **R56** — Did it go in. One tap on the glance: in, long, net, wide. Nothing
      else — no score, no stats screen, no service box. The missing link between
      technique and the only outcome a player cares about, at no vision cost, and
      it makes every existing record in `progress.ts` more valuable
      retroactively. **The trap is the claim**: "your toss drifts more on the
      serves you miss" is a correlation over six data points and this codebase
      does not say things like that.
- [ ] **R57** — The drills as a week, not as a footnote. Thirteen drills in
      `coaching.ts` are only ever seen attached to a fault. `PracticeCard` records
      that a drill was done and `sixWeekMilestone` spans a training block; what is
      missing is the middle — a page saying what to do at the next practice, built
      from the 2–4 ranked drills the report already produces. **No streak, no
      badge, no congratulation**, which is `PracticeCard`'s existing restraint and
      exists because an app that celebrates the tap fills its own record with
      drills nobody did.
- [ ] **R58** — A trip, in one card, for a coach. `renderBasketCard` shares one
      basket; a coach wants the trip — the spread, the best and worst serve, the
      recurring strain line, and what the player was asked to work on. Every one
      already survives a reopened report without a clip. Ranked below R54 because
      it recombines shipped parts and the replay may be the better artifact.
- [~] **R60** — Split, because the premise check found the rig cannot produce
      the thing the round wants to detect.

        · **R60·1 — [x] give the rig a stance.** Every serve `syntheticServe.ts`
          has ever built stands with each ankle directly below its own hip and
          leaves it there until the landing — one stance, `2 × HALF_HIP` = 0.180 m
          wide, with no dial. So there was nothing to sweep a stance detector
          against, and **R64 is stuck on the same sentence**: it wants the landing
          read off the front ankle and cannot say how much that ankle's baseline
          varies between players, because the baseline *is* the stance. One dial
          unblocks both.

          `pinpointSlide` brings the back ankle towards the front one along the
          hip line, ramping from `ready` and finished by the trophy — because
          that is when it happens, and a slide still running through the drop
          would be a different motion no detector reading separation over time
          should be asked to name. Zero is the platform stance the rig has always
          built. At 0.8 the stance closes from 0.180 m to 0.036 m, which is 80%
          of the gap, as dialled.

          **A change to a load-bearing module, declared, with the number diff run
          before committing rather than at the block boundary.** Every reported
          reading is **bit-identical** to the pre-dial tree — only wall-clock
          timings and a 0.04% heap figure differ. That is the skip-at-zero rule
          working: the dial is not applied at zero rather than applied as a
          no-op, because floating point does not promise a zero-sized transform
          returns its input and every band in `tiers.ts` was set against the
          untouched path. Asserted on landmark values directly, not on a derived
          reading, since a measurement agreeing to four decimals would hide
          exactly the drift the rule exists to prevent.

          **The first draft of the check was wrong and the rig was right.**
          Summing |Δx| + |Δz| reported a platform stance "varying" by 5.7 cm on a
          rig whose feet never move — the hip line yaws through the serve, the
          ankles sit below the hips, and a per-axis sum turns a rotation into a
          width. `hypot` in the ground plane is what "how far apart are the feet"
          means. Worth recording because the failure looked like a rig bug and
          was a metric bug, which is the same direction of error R44 warns about.

          Canaried by making the dial a no-op: three checks red, the fourth —
          bit-identical at zero — correctly still green.

        · **R60·2 — the detector.** Read the stance from ankle separation over
          time and sweep it against the dial. **A context reading like serve
          type, never a graded fault**: nothing here is wrong, and its value is
          deciding which of two correct drills applies. R51 needs it.

- [ ] **R61** — Ball speed off the strings. `planSharedPass` in `detector.ts:273`
      throws "the detector contract exists, the pass does not"; the shared-grid
      design is written and the implementation is absent. **Build W7 only.** The
      ball is real pixels, already tracked, and its speed off the strings is the
      first thing in this app that would describe the *result* of the technique
      rather than the technique. **Do not build W6 as a measurement** —
      `racket.ts` says in its own header that the racket estimate "deliberately
      does not feed any measurement", because hand landmarks are the least
      reliable part of the pose output and are worst exactly where a racket number
      would have to be trustworthy. **Never in mph**: a speed in body heights per
      second is what was measured; mph is a claim about a court distance nobody
      surveyed. Too big for one cycle — spike first.
- [x] **R62** — Court lines, refused with the arithmetic rather than the instinct.

      The enabler for the three things every player asks for — foot faults,
      placement, where the ball landed — which is exactly why it needed a number
      rather than a shrug.

      **The frame does not contain the court.** The app asks for a player filling
      a useful share of the frame; the rig builds its 1.8 m player at 0.54 of
      frame height, which is what good footage looks like. Invert it and the
      frame spans 3.3 m vertically at the player's distance, so a 16:9 landscape
      frame is about **5.9 m wide** there — against **8.23 m** of singles court.
      The sidelines are not in shot and the far one is not close.

      Only at `MIN_FRAME_HEIGHT_SHARE` itself, one step above "too far away",
      does the visible width reach the court at 10.7 m. That is the framing where
      every pose reading the report is built from is already soft, so buying
      court lines by filming from there means paying for them with the serve.

      For scale: `ballTrack.ts` and `detector.ts` are 1,237 lines between them
      and took a programme of their own. A line detector is that again, with no
      calibration, no fixtures, and a homography to estimate from lines mostly
      outside the picture.

      **What would change it:** a camera further back, which costs the pose
      readings, or a second device. Not smoothing and not a better model — the
      lines are not faint, they are absent. Two checks in `axes.test.ts` hold
      both ends of the derivation, and the second is written to go red if the
      loosest accepted framing ever stops reaching the court, which would make
      the refusal stronger than stated rather than weaker. The enabler
      for foot faults, placement and where the ball landed — the three things
      every player asks for. Ranked last honestly: a vision project the size of
      the ball tracker, it fails on exactly the amateur footage this app is built
      to forgive (a phone at the baseline sees almost no court), and it would
      arrive with no calibration and no fixtures. The finished round is a README
      line recording the cost so the next person does not rediscover it.

- [ ] **R65** — `triage.quality` has no stored-shape guard, and R49·1 found it.
      The check in `db.test.ts` that reads a block's expected fields off the
      engine covers `chain`, `landing` and `externalRotation` — the three
      measured-and-never-shown blocks that shipped broken twice for exactly this
      reason. `triage.quality` is a fourth of the same kind and was never added:
      `normalise` repairs `yaw_measured` and passes every other field through
      untouched, so a row arriving without `confidence`, `blur`, `roll_deg`,
      `yaw_deg` or `swing_samples` comes back still missing it, and the consumers
      in `verdict.ts` read those without asking.

      **Not fixed in R49·1 on purpose** — the repair needs a decision that round
      had no business making. There is no honest default for a missing
      `confidence`: inventing 0.9 manufactures a measurement and 0 refuses every
      clip. The pattern that fits is the one `consistency` already uses in the
      same function — dropped rather than repaired when the shape is wrong — and
      that is a change to what a malformed report does, which deserves its own
      round. Only the five-field shape is reachable today; the rest is a row
      corrupted in place or written by a build that does not exist yet, which is
      the same argument `9f34238` already made for guarding anyway.

      **The round as written, which R49·2 and R49·3 carry out between them.**
      Today's swing drawn over your best one. Round two of
      `f8816b0`, whose commit body ends "round two is the build", and round two of
      the backlog's `track-ghost-compare`, whose round one landed at cycle 109.
      Everything needed exists: `Analysis.track` is stored, `replayFrom`/
      `trackFrameAt` read it, `TrackPlayer` draws it, `ghostFor` in `skeleton.ts`
      already draws a dashed body, `estimateYaw` is the gate. Align at contact,
      normalise to hip centre, scale by shoulder-to-ankle, draw the older track
      dashed under the newer.

      **Three refusals, all already measured.** Draw nothing below the hips —
      removing the leg load entirely moves the worst drawn landmark 0.0387
      against a 0.0341 floor, so a player told to watch their legs is watching
      noise. Refuse a yaw difference over 5°, silently, because it is not a
      similarity transform and normalisation leaves it bit-identical. Refuse
      across a rubric or serve-type change; `comparisons.test.ts` is where that
      rule lives and this is a tenth entry in it.

      **Build the same-session case first.** Two serves from one basket share a
      camera by construction, so the gate is satisfied for free and the feature
      ships whatever R49b's answer turns out to be.

**Blocked behind R59, and not startable before it:**

- [!] **R63** — Check how often the external-rotation lever refusal fires on real
      footage. The backlog's `er-lever-on-real-clips`. `MIN_ROTATION_LEVER` is
      0.25, set from a rig whose trophy arm is comfortably folded and whose lever
      sits near 1. A real club trophy is straighter, so the refusal could fire far
      more often in life than in the ensemble — in which case the reading exists
      on paper and almost never in practice. Cheap once fixtures exist: log the
      lever distribution across the corpus before anything grades the angle.
- [!] **R64** — Switch the landing reading to the front ankle, once stance width
      is known. The backlog's `landing-front-ankle-after-fixtures`. Cycle 110
      measured that the shipped reading loses up to half the collapse to a
      trailing back leg and that the front ankle alone is immune — 0.1155 at every
      back-foot drag setting, the same 0.0657 of separation, no contamination. The
      only thing stopping the switch is that the front-ankle baseline is 0.0498
      rather than ~0, and that baseline is the stance. Stance width is `HALF_HIP`,
      a rig constant with no dial, so the rig cannot say how much it varies
      between players.

## Still open, and not closed by anything above

- [!] **The court trip** — **blocked: needs a phone.** Recording off the
      viewfinder, the glance screen and the target dial shipped and none has run
      on a device; the pane they were built against reports `document.hidden`.
      `COURT-CHECK.md` is the twenty-minute list that settles it, and steps 1, 2
      and 9 need no racket. Two candidates were chased down without a phone and
      both came back clean: the glance already says "6 serves in that clip — this
      is number 6", and `?demo=live` captures no stills, so **the dial has still
      not been seen drawn on a real frame**. As of R33, the repo has no bundled
      real video anywhere in it either (checked directly — zero `.mp4`/`.mov`/
      `.webm`/`.mkv` outside `node_modules`), so there is nothing left to try
      without a phone. Unchanged since R25.

      R40 added one thing to it. Step 8 now asks for a stopwatch and two
      numbers — one full pass, one whole basket — because nothing in this tree
      times a sweep and it is now the automatic path for a picked multi-serve
      clip. R40 tried to produce that figure here and could not: the synthetic
      clip has no player in it, and the pane throttles the recorder badly
      enough that three seconds of requested film came back as one. That is the
      last thing on this list that looked like it might not need a device.
- [!] **The fixture shoot** — **blocked: needs real footage.** `RECORDED` in
      `src/lib/analysis/__tests__/fixtures/index.ts` is empty, 0 of
      `MINIMUM_RECORDED = 6`. Six clips clear the gate and the order is in
      `fixtures/README.md`: right-handed side-on at 30 fps, the same serve in
      slow motion, the same player front-on, a **left-hander** side-on at 30 fps,
      that left-hander at 60 fps from a second angle, and one right-hander
      side-on with the feet deliberately out of frame. The left-handed pair
      cannot be faked by mirroring — that is what a front camera does and the app
      already treats it as an artifact. Until those exist: hip–shoulder
      separation and shoulder tilt are unvalidated against anything real, and
      `UNDER_RESOLVED.pronation_deg` cannot be re-examined at known rotation
      angles. Of `UNCALIBRATED`'s five entries, footage moves only one —
      `chain_span_ratio`, and even then only alongside a coach's judgement
      attached to the clips (R32). The other four — `legs_peak_ms`,
      `chain_span_ms`, `wrist_peak_ms`, `elbow_peak_ms` — are dead ends by
      construction and stay uncalibrated no matter how much footage arrives.
Everything left below is blocked on a resource this repo does not have — a
phone, or real footage. Nothing remains that is blocked only on somebody
choosing to do it.

## The record

**Phase 4 — Feature and retention**, seven rounds landed, ledger in git at
`c4136f2`. The pattern across the phase: read the existing reasoning before
assuming a round needed either a build or a refusal, because the honest
answer kept turning out narrower or different than the round's own opening
question. `reportCard.ts`'s doc comment already refused paired keyframe
stills in the single-serve share card — but that refusal was about
*pictures*, not about `Consistency`, whose score, serve numbers and named
differences already survive a reopened report with no clip behind it, which
made a basket card buildable rather than a second refusal
(`renderBasketCard`/`shareBasketCard`, R22). The sharing code that round
produced had never been asked what a `recordingType`-style capability check
already asks elsewhere — a throwing or absent `canShare` was read as a hard
no instead of "try it anyway" — caught by applying an established codebase
pattern to code just written rather than by walking a UI (`attemptShare`,
R23). "A trip to the court" turned out to already exist, unnamed, as a
24-hour threshold inline in `thenAndNow`'s own comparison since it was
written (`sameTrip`, R25), and "two sheets deep" turned out to be one tap
and about one screen of scrolling, measured on a real viewport rather than
taken on faith (R27) — the second time this phase found a stated premise
simply wrong, after R18 found the same in Phase 3. R24 found working code
behind broken prose: export and import both worked correctly, but the panel
promised a file would carry a player's history to a new phone and never
said how to move one, fixed with three concrete transfer methods in the
same sentence class. R26 stretched `PracticeCard`'s own long-standing
"not a streak, a badge or a congratulation" restraint from a single drill
to a six-week training block, reporting a regression exactly as plainly as
an improvement because a milestone that only speaks on good news is the
same lie with the shape sanded off. And the close-out found the phase's
own copy holding up under a hand audit — no coach jargon anywhere, nothing
reusing a word the app already owns — bar one sentence of R24's own fix
that had grown to thirty-six words explaining how to move a file, tightened
to fit the cap it was auditing everything else against (R28).

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

- [x] **R70** — Audit rotation item 4: a `README.md` claim with no test behind it.

      **"the rest, up to `MAX_SESSIONS = 60`, keep only their numbers at about
      15 KB each".** Measured: **31.3 kB** — 21.3 of swing track and 10.0 of
      measurements and captions. Roughly double, on the number that same
      sentence multiplies by forty, so the stated full-history range was
      understated too: 5.1–11.5 MB rather than 4.2–10.5.

      **Nobody was careless.** The figure was true when it was written; the swing
      track was written afterwards and is kept on *every* report the ladder
      keeps, downgraded to 2.7 kB of keyframes only under quota pressure. This is
      the ordinary way a document goes wrong — not by being written badly but by
      the code moving underneath a sentence nothing was checking.

      And nothing could have caught it. `footprint.test.ts` is full of byte
      figures and every one of them is its own constant; none had ever been asked
      to agree with the prose. The new check asks, as a range rather than a
      figure — the claim is that the two stay in the same neighbourhood, not that
      a rig byte count is exact to the kilobyte — plus a second assertion that
      the track is still the larger half, so a round that stops storing tracks
      finds this paragraph rather than leaving it stale a second time.

      Canaried by dropping the track from the sum: exactly one check red.

- [x] **R60·2** — Refused, and the measurement is why. Nothing shipped into the
      engine.

      **The round's premise is exactly backwards.** R60 proposed reading platform
      against pinpoint from ankle separation over time, because "the back foot
      sliding up to the front is a large, slow, unambiguous motion along the axis
      the camera sees best". It is large, slow and unambiguous. It is along the
      axis a side-on camera sees **worst**: a serve stance is apart along the
      player's own depth axis, and `axes.ts` has established since it was written
      that at 82° image x is 99% depth and 14% lateral.

      Measured on the rig, using the dial R60·1 built for it — separation at
      `ready`, in image units, eight seeds each:

          camera yaw   gap      noise    noise as a share
             30°       0.0407   0.0030         7%
             45°       0.0301   0.0030        10%
             60°       0.0175   0.0030        17%
             82°       0.0050   0.0030        59%

      **The noise floor is flat and the signal walks into it.** Jitter is a
      fraction of the frame and does not care where the camera stands. Side-on,
      the stance is smaller than twice its own noise, and the first sweep of a
      narrowed-to-standing ratio built on that denominator returned a mean of
      12.0 with a deviation of 14.8 — not a weak reading, a meaningless one.

      **Readable face-on, and that is not a route.** At 30–45° the signal is seven
      to ten times its noise and a detector would work. `DEPTH_YAW_RANGE` accepts
      18–78° precisely because face-on loses the depth readings the rest of the
      report is made of, and that trade has nothing to do with feet. A reading
      available only on footage the app discourages is not one it can offer.

      **NOT PUT IN `UNDER_RESOLVED`, and a guard I did not write is why.** The
      first version of this round added it there, and `depth.test.ts`'s check
      that no floor is set below what its own repeatability asks for rejected it:
      that register is for readings the engine *computes* and cannot grade, and
      nothing computes this one. The check was right and the entry was a
      mislabelling. The refusal lives here and in four checks in `axes.test.ts`
      instead — including one asserting the signal *is* readable at 30°, so this
      stays an honest withdrawal rather than reading as an impossibility.

      **What would move it: nothing about smoothing or windows**, which is worth
      saying because that is where a rebuild would start. The signal is not noisy,
      it is absent — projected away by the camera position before any tracker
      sees it. It would take a second camera, or a foot-contact model inferring
      the stance from something other than the gap between two ankles.

      **R51 loses its interpreter.** It wanted this to decide which of two correct
      leg-drive drills applies. It will have to ship without knowing the stance,
      or say that it cannot tell.

- [x] **R50b** — The racket's lay-back, on the glance, between serves.

      `rotationMove` in `carryForward.ts`, joined to the trip by
      `rotationMoveOnTrip` in `progress.ts` — the same split `faultMove` already
      makes, so the analysis layer never imports the one that owns `sameTrip`.

      **A second function rather than a second field on `FaultMove`.** The two
      ask different questions and refuse for different reasons: one follows the
      fault the player was told about, the other a reading nothing grades. A trip
      where the named fault held still while the racket moved is exactly the case
      worth seeing, and one function returning both would invite a caller to
      treat them as a pair.

      **The floor is `√2 × 11.8` ≈ 16.7°, and R50b's estimate was right.** The
      round said "about 15°", from the 1.5 × deviation convention every graded
      floor in `tiers.ts` uses — a convention for a *single* reading against a
      band. Two readings differ with their deviations in quadrature, which is the
      arithmetic that belongs to a delta, and the two land close. Worth recording
      because R50·2 and R50·3 both had the stated figure wrong in the same family
      and this one did not.

      It refuses most comparisons, which the round said in advance and said must
      not be softened. `ER_DEVIATION_DEG` exported from `diagnose.ts`, prose until
      now, same treatment as the landing figures in R50·2.

      Both refusals inherited rather than re-implemented: a null `deg` already
      covers the lever, and `signals` already drops a lean below `MIN_EVIDENCE`.

      The line grades neither direction — laying back further is usually good and
      is not always, and nothing here knows what the number should be for a club
      player. Both directions are linted, and a check holds that they differ, so
      a screen that only spoke on good news would fail. Neutral icon both ways
      for the same reason.

      **Not reached by `everyVerdictCue()`**, which walks the flaw tables, so the
      copy is checked directly — R69's finding applied while writing rather than
      afterwards.

- [~] **R53** — Split. The round offers two routes to knowing which kind of serve
      it is looking at, and **one of them is not available**.

        · **R53·1 — [x] inference is refused, by two independent routes.**

          **The trap first, because the measurement looks like the opposite.**
          Dial the rig to a plausible second serve — lower reach, deeper knee
          bend, slower tempo — and the engine separates it from a first at
          **18.2 standard deviations** on contact height. That number is
          meaningless: the separation is the separation that was dialled. The rig
          was told the two differ in exactly those quantities by exactly those
          amounts, and the engine reading them back proves only that it can read
          its own inputs. The control is in the same check — `chain_span_ratio`,
          which nobody dialled, separates at **1.1 sd**.

          To know whether contact height separates a real first serve from a real
          second, by how much, and whether one player's second overlaps another's
          first, takes footage of both from the same player. `RECORDED` is empty.

          **The other route is worse.** "Serves arrive in pairs" is a fact about
          how people practise, not about a clip. Some players hit six firsts;
          some alternate; some hit ten seconds because that is what they came to
          work on. Numbering by position would invent the one field every
          partitioned spread then rests on, silently.

          Pinned as a check rather than written down and deleted, because the 18 sd
          figure is reproducible and misleading and somebody will measure it
          again. The check asserts the circularity itself — the dialled reading
          separates, the undialled one does not — and goes red if an undialled
          reading ever starts separating, which is exactly when R53 is worth
          reopening.

        · **R53·2 — the tap.** One tap on the glance, stored on the report, and
          the spreads partitioned by it. The only honest route, and it needs a
          stored field and a write path rather than a measurement.

- [x] **R65** — `triage.quality` has a stored-shape guard, and **the entry's own
      premise was wrong**.

      R65 said "the consumers in `verdict.ts` read those without asking". There
      are none. A sweep for readers of `triage.quality` outside tests finds
      exactly one — `pairTracks`, added by R49·1 — and it guards its own reads.
      Seventh time this session the ledger has been wrong about something, and
      the fourth where the round-as-written rested on it.

      **Built anyway, and the reason is the shape of the file it went into.**
      `pairTracks` had to write that defence itself *because* there was none
      here, and the next consumer would write a third. That is precisely how
      `withChain` ended up with three separate guards — the chain, the rotation
      and the landing each arrived, found no shape check, and added their own.
      One at the door is cheaper than one per reader, and a reader that forgets
      is a blank screen behind the ErrorBoundary. `pairTracks` keeps its own,
      which is not redundancy: `Pairable` accepts a live `Analysis`, which never
      passes through `normalise`.

      **THE FIRST VERSION BROKE SOMETHING AND AN EXISTING CHECK CAUGHT IT.**
      Dropping the whole triage lost `status`, and `importBackup` refuses to
      restore a clip the engine rejected by reading exactly that — so a rejected
      row came back into a history that had refused it. A rejected clip
      legitimately has readings nobody took; the rejection is the one thing about
      it that must survive. So `Triage.quality` is now optional and the **block**
      is what drops, not the verdict.

      That is also the decision R49·1 declined to make and left named: there is
      no honest default for a missing `confidence` — 0.9 manufactures a
      measurement, 0 refuses a clip that was fine — so the block goes and the
      scores, filmstrip, trend and practice card do not.

      `yaw_measured` is deliberately not in the required shape: it is younger
      than the block, absent on every report filed before it, and requiring it
      would drop most of a real history. Repaired to `false` inside the guard
      instead, for R49·1's reason.

      Five checks in `db.test.ts`, canaried to one.

- [~] **R58** — Split: what a coach's card says, then drawing it.

        · **R58·1 — [x] the content.** `tripSummary` in `progress.ts`, which owns
          trips. Pure, no canvas — the same split R49 took for the ghost, and for
          the same reason: what is honest to say about a trip is the hard part,
          and a decision taken inside a draw call is one nobody can test.

          **A trip, not a basket, and that is the whole difference from
          `renderBasketCard`.** `Consistency` is one clip swept; this is every
          report filed within one visit, which is what somebody means when they
          say how it went on Tuesday. Nothing assembled trip-level content before.

          **The refusal is the repeatability reading.** A trip nobody swept gets
          none rather than one built from the spread of separate clips — that
          would be comparing serves the app never compared, filmed minutes apart
          with a camera that may have moved between them. Canaried: defaulting it
          to 0 reddens exactly that check.

          The instruction is the **last** report's, not the most common: a trip
          whose fault changed partway through is one where the earlier advice was
          superseded, and on a two-serve trip "most common" is a coin toss.
          Strain is gated twice — recurring across trips *and* raised on this one
          — because a warning that has been quiet since March has no business on
          Tuesday's card.

          **R58's own claim checked rather than assumed:** every field survives a
          report with no clip left. The fixture carries no frames, no video, no
          thumbnails and no track — the state the prune ladder leaves — and the
          summary is complete anyway. That is what makes this a card at all: a
          coach reads it days later on a phone that threw the video away the
          moment it finished with it.

        · **R58·2 — draw it.** `renderBasketCard` is the shape to follow, ~260
          lines of canvas. Needs the browser, and the pane will not composite a
          screenshot — so verification is pixel sampling, as R49·3 did.

- [~] **R61** — Spiked, and the spike produced a three-way split rather than a
      go-ahead.

        · **R61·1 — [x] the spike.** Two numbers decide whether W7 is worth
          building, and both were derivable without the pass existing.

          **How much ball there is.** R62 established the frame spans ~5.9 m at
          the player on well-framed footage. At 30 fps that is **8.0 frames** at
          a club 22 m/s and **3.9** at a strong 45 — and the count *falls as the
          serve gets faster*. A reading whose precision drops as the quantity
          rises is worst exactly where a player cares most, and that shape is the
          finding rather than the raw count.

          **How blurred it is.** The ball travels `speed / fps` in one exposure:
          **0.73 m club, 1.50 m strong** — a quarter of the frame. `ballTrack.ts`
          finds the ball as a compact yellow-green blob scored `min(R,G) − B`
          over a **disc**, and a streak is not a disc. The toss works because a
          tossed ball is nearly stationary at its apex; an outbound ball never is.

          Sixty frames a second helps and does not solve it: 7.9 frames, and
          0.75 m of smear still 13% of the frame. Worth stating because "film it
          at 60" is the first thing anybody suggests.

          **NOT A REFUSAL.** Eight frames at club speed is a usable fit, and club
          speed is who this app is for. What it is is a set of constraints the
          build has to be shaped around rather than discover.

        · **R61·2 — build `planSharedPass`.** Infrastructure, and the thing that
          throws today. Needed by W6 and W7 alike, and it is the only part of
          this that is ordinary engineering.

        · **R61·3 — the outbound detector, as a streak.** The existing disc model
          will not find a ball smeared across a quarter of the frame, so this is
          a new detector rather than the tracker pointed at a new window. **It
          must refuse above the speed where the frames run out** — which is a
          refusal keyed to the very quantity being measured, and needs care: the
          honest form is to report the frame count alongside, and say nothing
          below a floor. **Never in mph**, per the round.
