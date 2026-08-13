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
