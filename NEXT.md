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
- [~] **R49** — Split, because the yaw gate turned out to need a number the
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

        · **R49·3 — draw it.** The older track dashed under the newer in
          `TrackPlayer`, nothing below the hips. Needs the browser.

- [ ] **R49b** — How often two clips from one trip agree on camera angle within
      5°. The backlog's `ghost-yaw-agreement-in-life`, and the open question R49
      names and defers. Shared with R50c, which wants something tighter still —
      cycle 105 found a 315 ms branch jump between 50° and 55°. **Nobody knows
      the answer, because it is a fact about how people film and there are no
      fixtures.** Blocked behind R59 for the real answer; what can be done first
      is bounding it from `estimateYaw` in `spatial.ts`.
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

        · **R50·2 — landing balance delta**, against the written-down 0.0035
          floor. Same machinery; the bound is the floor rather than a confounder,
          since `landing.offset` is a magnitude and its zero is 0.0035 rather
          than 0.0000. `LandingBalance` already carries its own three refusals.
        · **R50·3 — chain span ratio delta**, bounded by the tempo difference and
          refused when that bound eats it. The residual 21% tempo-dependence is
          the bound's whole content, so this one needs `motionSeconds` on both
          serves and refuses without it.

- [ ] **R66** — A tally that does not cover its own file. R50·1 found
      `copy.test.ts` calling `report()` mid-file and fixed that one instance; a
      sweep at the time found no other file with checks below its tally, which is
      exactly the state a static guard is for, because the next file to grow past
      its `report()` will be silent about it too. Assert, over every `*.test.ts`
      under `src`, that `report()` is the last statement — the same source-scan
      trade `egress.test.ts` and `framePair.test.ts` already make, and made here
      for the same reason: the defect lived in a position, and no suite that only
      reads exports would ever see it. **What it may not do:** parse. A regex over
      source text is the right tool and the allow list has to be checked against
      what the scan found, as `egress.test.ts` does, rather than assumed correct.
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
- [ ] **R59** — *(promoted here, ahead of the product band)* Make the fixture
      shoot something a user does by accident. **Unblocks the two items this file
      has been stuck on since R25**, and with them `groundTruth.ts`, hip–shoulder
      separation, shoulder tilt, `UNDER_RESOLVED.pronation_deg` and
      `chain_span_ratio`. `RECORDED` is empty, 0 of `MINIMUM_RECORDED = 6`;
      `dev/exportFixture.ts` exists but lives behind a dev build; the six clips
      are listed in `fixtures/README.md` and every one is a normal serve filmed
      normally, bar a left-hander and one clip with the feet deliberately
      cropped. Make the export a first-class path with the checklist attached, so
      whoever holds the phone produces the set in one session without reading the
      repo. **Does not break the egress rule** — the player saves a file and
      decides what to do with it, exactly as the share card works.
- [ ] **R53** — First serve against second serve. The app knows flat, kick and
      slice; it does not know first from second, and for a club player the gap
      between the two is usually a bigger problem than either — a second serve is
      a different motion, not a slower first, and the player who patty-cakes it is
      doing something the app currently averages away. Tag a serve with one tap on
      the glance, or infer it within a basket where serves arrive in pairs, and
      partition the spreads `consistency.ts` already computes. **Pure product on
      existing readings: no new measurement, no new refusal.**
- [ ] **R54** — Share the replay as motion. `reportCard.ts` renders one still,
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
- [ ] **R60** — Platform against pinpoint. The app has no idea which stance it is
      looking at, and the two want different leg-drive advice and different
      balance at the finish. Readable from ankle separation over time — the back
      foot sliding up to the front is a large, slow, unambiguous motion along the
      axis the camera sees best. **A context reading like serve type, not a graded
      signal**: nothing here is a fault. Its value is deciding which of two
      correct drills is the right one, and R51 needs it to interpret what it
      measures.
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
- [ ] **R62** — Court lines, listed to be refused rather than built. The enabler
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
