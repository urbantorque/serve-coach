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
