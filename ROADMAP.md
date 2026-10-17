# ROADMAP — from prototype to product

Written 2026-09-23 after a full review of the app, the engine and the ledgers.
`NEXT.md` stays the ledger for engine rounds; this file is the product plan that
sits above it. Every item obeys `LOOP.md`'s eight constraints — in particular,
no new colours, no re-skin, no confident nonsense, nothing leaves the device.

## Where it stands

*Refreshed 2026-10-09, at the end of the depth programme. The 2026-09-23
picture follows it, for the record.*

- **Every graded band says what it stands on.** A published study, or a
  re-derivation on real serve motion with its fault dialled into the rig; four
  measurements with neither are shown and not scored (D2.1). Card and diagnosis
  judge each shared reading against one band (D2.3).
- **Real motion is the check, not the rig.** The forty Bath serves run through
  every floor, band and new reading from five phone placements; contact height
  no longer depends on where the phone stood (D7.4).
- **New readings, all data before they are faults:** stance, arm cock, toss
  placement, landing feet, the hitch, the firing order, the chest's turn from
  the side — which now names an early turn on the recommended angle (D3.6).
- **The report shows its evidence:** the measurement on the keyframe stills,
  the toss map, the firing order, what the camera angle could not see, and the
  player's own video if they keep it (D4.6, D3.9, D6.4).
- **`App.tsx` is 1,586 lines**, history and the offline warm-up in hooks and
  one report render for live and reopened serves (W5.2, W5.3).
- **Still open:** D1.2's browser pass (needs a real-time 60 fps clip), the
  research questions under D7.2 (a second mocap set), W5.4 and W6.3–W6.5, the
  fixture shoot. And still **no git remote.**
- **Next:** the Level-up programme at the end of this file (L1–L6). It covers
  trust fixes, every serve in a session, a score that can show progress, and
  seeing what good looks like. The reasoning is in `LEVEL-UP-REVIEW.md`.

### As it stood on 2026-09-23

The engine is the strongest part of the product and the least visible. Twenty
measurements, six keyframes, an honest confidence model, a causal fault graph,
1,200+ checks. What surrounds it was built one round at a time and it shows:

- **The shell leaks.** No browser history, so the phone's back gesture leaves the
  app from any screen. Returning players see an empty home for a beat on load.
  The example report is dressed as a real serve, dated today, "measured on this
  device". Developer surfaces (device check, `?fixture`) are one tap from a player.
- **The report is long.** About twelve sections; the fix that matters competes
  with the machinery that found it.
- **The best features hide.** Progress lives in a bottom sheet, glance mode only
  exists after an in-app recording, backup sits inside the history sheet, and
  there is no settings surface at all.
- **App.tsx is 1,950 lines** of state, routing, demo seeding, pipeline and five
  inline sheets. Every product change pays that tax.
- **The truth gap.** Zero real-footage fixtures (`RECORDED = []`, need 6), no
  on-device timing, no court trip. Every band is derived from the synthetic rig.
- **No git remote.** Months of work exist on one disk.

## The seven areas

Ranked by what loses a player soonest.

### 1 · First-run trust — *does it work on my clip, and does it feel like an app*
The phone's back gesture must behave; the first screen must not flicker; the
example must say it is an example; a dropped file must survive the first-run
guide; the screen must not sleep during a thirty-second analysis.
**Done when** back closes a sheet or returns home from every screen, and a
cold load with history paints the history.

### 2 · A report you can act on in ten seconds
Lead with the one fix and its drill; fold the evidence (clip reading, playback,
area cards) behind clear section headings rather than deleting it; strip the
coach and lab jargon the voice lint cannot see ("explosive phase", "the brake").
**Done when** the focus card and drill are the whole first viewport and nothing
above the fold is machinery.

### 3 · Polish inside the settled system
No new palette — `LOOP.md` §3 and two rejected redesigns settle that. Polish is
motion, rhythm and states: sheets that animate out as well as in, screens that
cross-fade, skeletons instead of flashes, a filming guide with a picture instead
of prose, rotating tips that actually rotate, hard-coded tints named as tokens so
the next surface cannot drift.
**Done when** every hard-coded hex in `src/styles` is a token or a documented
one-off, and every screen change has a transition that respects reduced motion.

### 4 · Reasons to come back
Progress promoted from a sheet to a real screen; a settings surface (hand,
level, backup, device) so choices are not trapped inside a report; undo on
delete; glance mode reachable for any clip, not only in-app recordings.
**Done when** a player can change their hand without re-running an analysis and
can find their backup without opening history.

### 5 · Architecture that can carry a product
Split `App.tsx` into hooks (`useHistory`, `useAnalysisRun`,
`useProgressInsights`, `useOfflineWarmup`) and components (`ProgressScreen`,
`HistorySheet`, `ErrorScreen`, `FirstRunSheet`), move demo routing into
`dev/`, render `Report` once. Move pose inference into a Web Worker so the UI
thread stays live during analysis.
**Done when** `App.tsx` is under 700 lines and a worker owns MediaPipe.

### 6 · Engine truth
Finish the racket-detector work (a weak box must not hide the wrist estimate;
stale 19 MB copy), then the items only a phone can close: the six-clip fixture
shoot, the court trip's timings, R64's front-ankle landing. These need the
owner's phone and are listed so they stay visible, not so they are faked.
**Done when** `RECORDED.length >= 6` and `COURT-CHECK.md` has a real row.

### 7 · Market readiness
A git remote and a tagged release; manifest `id`, shortcuts and screenshots so
the install sheet sells the app; a hosted build with the offline badge proven
on iOS and Android; code-split the report and progress screens off the entry
chunk; an honest store-style listing drawn from README's first paragraph.
**Done when** someone can install it from a URL and use it in aeroplane mode.

---

## Execution plan

Waves run in order. Each item is one commit, green on
`npm run typecheck && npm run lint && npm test`, checked in the browser when
the player can see it. `[x]` done · `[~]` in progress · `[ ]` todo ·
`[!]` needs the owner · `[=]` already true, left alone.

Branch `roadmap/market-ready`, off `loop/top-ten`. 1,245 checks green at
the end of the first run (1,223 before it).

### Wave 1 — foundations and trust
- [x] **W1.1** Racket-detector work landed; a box under the draw floor now
      falls back to the wrist estimate instead of hiding it. Stale 19 MB copy
      fixed, and README's two orphaned table rows put back.
- [x] **W1.2** Back gesture: `lib/backStack.ts` keeps one history entry per
      open screen or sheet. Five checks against a fake history.
- [x] **W1.3** No empty-state flash on a cold open with history; the offline
      badge holds its space until the cache answers. Also fixed a race in
      `?demo=history`.
- [x] **W1.4** The example report is labelled, cannot be shared, and no longer
      has the player's real history (deltas, streak, drill logging) wired to it.
      New screens now open at their top.
- [x] **W1.5** Device check moved out of the history list into Settings.
      `?fixture` stays in production on purpose — the owner's fixture shoot runs
      on a phone (see `FIXTURE_EXPORT`).
- [x] **W1.6** Screen wake lock while analysing and while the viewfinder is open.
- [x] **W1.7** Undo on delete (five seconds, committed on close).

### Wave 2 — report and copy
- [x] **W2.1** `voice.ts` now lints coach jargon; it caught "Steep cartwheel",
      two "Cartwheel" fixes, "Struck well after the drop" and the area-headline
      templates ("is the brake", "Sharpen explosive phase next"). A new check
      lints every runtime headline.
- [=] **W2.2** Report structure: at phone size the first viewport is already
      score, the fix and its drill. Nothing to invent.
- [x] **W2.3** Analysing notes rotate on a timer; camera file names become
      "Your clip".

### Wave 3 — polish in the system
- [x] **W3.1** Sheets animate out.
- [=] **W3.2** Screens already rise on entry; exit transitions judged not
      worth a second render path.
- [x] **W3.3** Top-down placement diagram at the top of the filming guide.
- [x] **W3.4** 23 raw colours named or mixed from tokens, identical values; a
      check now fails on any new one outside `tokens.css`.

### Wave 4 — retention surfaces
- [x] **W4.1** Progress is a screen (`screens/Progress.tsx`), not a sheet, with
      a real empty state.
- [x] **W4.2** Settings sheet: hand, backup, device check.

### Wave 5 — architecture
- [x] **W5.1** Demo routes → `dev/demoRoutes.ts`. `App.tsx` 1,948 → ~1,630 lines.
- [x] **W5.2** `useHistory` and `useOfflineWarmup` hooks out of `App.tsx`. *Done
      (2026-10-09): `components/useHistory.ts` holds the reports, the practice
      log, the serve tags, the refresh and the demo seed; `useOfflineWarmup.ts`
      the badge and the download. `App.tsx` is 168 lines shorter; the seeded
      home and the offline badge checked in the preview.*
- [x] **W5.3** One `Report` render instead of two (report / saved). *Done
      (2026-10-09): one `<Report>` for a live or a reopened report. Everything
      drawn from the history is passed the same way to both. What needs the
      frames (re-reading, rescoring, re-judging, comparing a basket) is passed
      only for a live one. The example keeps its own bare render. Checked in
      the preview on `?demo=report` and `?demo=basket`, which also surfaced
      and fixed a passive line in `practice.ts`.*
- [ ] **W5.4** Pose inference in a Web Worker — spike first, and it needs a
      phone to measure, so it pairs with the court trip.

### Wave 6 — market readiness
- [x] **W6.1** Manifest `id`, two long-press shortcuts (`?open=progress|guide`),
      Open Graph tags.
- [x] **W6.2** Report and progress lazy-loaded: entry chunk 142 → 125 kB gzipped;
      the size ratchet taken down to 130 / 385.
- [ ] **W6.5** Manifest `screenshots` for the richer install sheet — needs real
      captures from a phone, not the synthetic rig.
- [!] **W6.3** Git remote and first tagged release — owner's call.
- [!] **W6.4** Fixture shoot (six clips) and court trip — owner's phone.

### Verification, end of first run
Phone-sized (iPhone 15) Playwright pass over home, settings, guide, example
report and progress: zero console errors. It found two defects — a focus
ring drawn round every sheet panel, and "Export no serves" — both fixed. A
web-interface-guidelines pass found three more (heading levels, overscroll
chaining, touch-action), fixed.

---

## Engine programme (2026-09-23, second run) — free data only, no filming

The owner asked for the engine work to proceed with no footage from them and
only free models and data. `ANALYSIS-REVIEW.md` is the reasoning; this is the
ledger.

- [x] **E1** Real-footage evidence without a camera: the CC BY *Tennis Player
      Actions* dataset (500 labelled smartphone serve frames) behind
      `npm run setup:bench` and a dev-only `bench.html`; five openly licensed
      Commons serve clips behind `clipbench.html`. Nothing of either ships.
- [x] **E2** The object detector returned nothing on the GPU delegate — the
      racket boxes were always empty on a phone with a GPU. CPU now.
- [x] **E3** The player crop: the pose model reads a square round the server.
      Benchmark: frames with no pose 101 → 8 of 500, arm error −⅓.
- [x] **E4** `refineExtremum` (tent fit): drop-to-contact bias at 30 fps
      +31 → +10 ms, RMS 35 → 14 ms, on noisy rig serves.
- [x] **E5** Real timestamps to MediaPipe's VIDEO mode.
- [x] **E6** Knee-bend band re-anchored to the 27-study meta-analysis
      (35–62° → 35–80°); the first cited band in the app.
- [x] **E7** RTMPose-s re-reads the swing (toss → contact), all-or-nothing
      inside a 6 s budget, arms/knees/ankles only. Benchmark on the same crop:
      elbows 2.35% → 1.59% of height, wrists 2.02% → 1.72%. Offline download
      24 → 57 MB.
- [~] **E8** Read the real frame rate (MP4 `stts`) and sample the swing at the
      source rate on high-frame-rate files. *Carried into D1.1 (done) and D1.2
      (measured, not yet wired).*
- [x] **E9** Slow motion detected from the motion itself (drop→contact ≥ 320 ms with a ≥ 2.6 s motion); timings hedged and said so, ratios still scored. Rescaling left until a stretch factor can be measured rather than assumed.
- [x] **E10** Ball tracker on a native-resolution crop above the tossing
      shoulder instead of a 256-px whole frame.
- [x] **E11** Cite or re-derive the other 20 card bands (contact height needs a
      definition first: wrist, not ball). *Carried into D2.1 and D2.2, both
      done.*

---

## Depth programme (2026-10-06) — richer features, deeper engine, no human testing

The owner's brief: build only what deepens the capabilities the app already
has, and nothing whose proof needs a person — no filming, no court trip, no
coach panel, no beta. Every item here is proven by a machine:

- **The rig** (`syntheticServe.ts`): dial the thing in, assert the app reads it
  back, and hold it under the noise ensembles in `robustness.test.ts`.
- **Open data**: `/bench.html` (500 labelled serve frames) and `/clipbench.html`
  (CC-licensed Commons clips), run in the preview browser — real pixels, no
  filming.
- **Published research** for every new target band. A reading with no citation
  is shown as information and never graded — the existing `UNCALIBRATED`
  pattern, used on purpose rather than as a holding pen.
- **The browser preview** for everything a player sees.

The rig cannot prove a reading is *accurate* on real people, only that it is
consistent with the rig. That is why bands come from literature and not from
the rig, and why a new fault may not reach the focus card until it is cited.
`LOOP.md`'s eight constraints hold throughout.

**Out of scope, because a person has to do it:** W5.4 (worker timing on a
phone), W6.3–W6.5, the fixture shoot, the court trip, `ANALYSIS-REVIEW.md`
Tier 0.1 and Tier 3, a grip-photo classifier and racket/ball networks (both
need hand-labelled training data), accounts, sharing links and pricing.

Sizes: **S** ≤ 1 round · **M** 2–3 · **L** 4+.

### Wave D1 — See the fast part of the serve (timing foundation)
Most later readings need more than four or five samples through the swing. Do
this first.

- [x] **D1.1 Read the real frame rate** (was E8) · M. *Done: `pose/container.ts` reads mdhd/stts and Android's `com.android.capture.fps`; tested on byte-built boxes. Original plan:* A small MP4/MOV box parser
      (`mdhd` timescale, `stts` deltas, the capture-rate metadata iOS and
      Android write for slow motion). *Proof:* byte-built box fixtures in the
      test suite, including variable-rate `stts`.
- [~] **D1.2 Sample the swing at the source rate** · M. *Measured
      (2026-10-09), not yet wired: re-reading a 32 fps clip's trophy-to-contact
      at the file's own rate, inside the 120-frame budget, takes contact's bias
      from 7–12 ms to under 2 at 60, 120 and 240 fps, and widens the drop's
      spread from 1–2 ms to 2.5–10, because the drop's smoothing is counted in
      samples sized from the clip's average rate and a dense window shrinks it in
      time. The browser pass waits on the drop being smoothed in seconds.*
      *Engine half held (2026-10-09), and that wait retired: smoothing the
      drop over a span of time was built and measured against the rig's posed
      instants, and made it no better (9.1 ms against 8.3 at 120 fps, 15.0
      against 11.7 at 240). The dense drop spreads because its bottom is flat
      for tens of milliseconds and more samples land on it, and it stays inside
      one 32 fps sample, where nothing read at the drop can tell.
      `swingDensity.test.ts` holds it: contact 11.9 → 1.5 ms (60 fps), 10.4 →
      2.6 (120) and 6.5 → 3.5 (240) inside the 120-frame budget. Still open:
      the browser pass that reads those frames. It needs a real-time MP4 of a
      serve at 50 fps or more to prove MediaPipe's video tracking across a
      third pass, and none is in the repo or the bench.* *Partly delivered by D1.3: a stretched clip's window is now read four or eight times wider, so its swing is sampled that much denser. Real-time high-frame-rate files are still capped at 32 fps. Original plan:* Keep 32 fps for
      ready → trophy; read trophy → contact + 0.1 s at 60/120/240 inside the
      existing frame budget. *Proof:* `buildServe(dials, fps)` at 30/60/120/240,
      keyframe error against the rig's true instants, ensemble at each rate.
- [x] **D1.3 Rescale slow motion instead of hedging it** · S. *Done, and wider than planned: the stretch also comes from the ball's fall (gravity at 1/2/4/8×, `slowMotion.ts`, as the methods research advised), the serve is re-read with a real-time window, and the engine measures a retimed copy. A 4× rig clip measures identically to the real one. Original plan:* When D1.1 finds a
      capture rate above the playback rate, convert every timing to real seconds
      and lift the 0.3 hedge. Keep the motion-based detector (E9) as the
      fallback when metadata is absent. *Proof:* the same rig serve, stretched
      2×/4×/8×, returns the same timings.
- [x] **D1.4 Fuse the contact instant** · M. *Done (2026-10-09), with two
      of the three cues: `readContact` takes the ball's moment as half a sample
      after the last time it was on its arc, within a racket's reach of the
      hand. The hand decides unless its peak came 100 ms or more after the ball
      had left its arc. A hand can be tracked late but a ball cannot be hit
      before the racket arrives, so the earliest cue wins there and every
      keyframe is found again from the ball's moment. A gap wider than a real
      serve's lag (60 ms, from the Bath capture) hedges every reading taken at
      contact, and says why. The racket box does not vote: it is drawn, never
      tested on footage (F7). The report stores which cue decided
      (`Analysis.contact`). `contact.test.ts` dials a gravity-true ball, a
      0–40 ms lag, a hand tracked after the hit and a hand lost before the top.
      Original plan:* Take contact from the wrist peak,
      the ball-arc break and the racket box crossing the ball. Record which one
      decided; disagreement lowers confidence instead of picking a winner.
      *Proof:* rig with ball, wrist lag and dropped wrist frames dialled.
- [x] **D1.5 The ball in fixture replay** · S. *Done (2026-10-09): a fixture
      carries the ball the report stored (schema-checked), the export writes
      it, and replay takes `runAnalysis`'s landmark steps in order — the
      sideways-picture refusal, contact from the hand and the ball, then
      `measure()` with the ball. Clipbench prints both ball readings and which
      cue decided contact. Original plan:* `groundTruth.ts` calls
      `measure()` without a ball, so the ball metrics escape every replay.
      *Proof:* the replay suite and clipbench carry `tossPeakHeight` and
      `contactBelowPeak`.
- [x] **D1.6 The small engine defects** (`ANALYSIS-REVIEW.md` F8) · M.
      *Finished (2026-10-09).* The serve finder's tolerance is a quarter of
      the clip's own reach, from the resting hand to the highest point
      (`REACH_TOLERANCE_SHARE`), not 0.12 of the frame. It keeps the old
      figure for a player filling 60% of the frame. At a third of that size
      the old one counted a practice swing as a serve, which a new check in
      `engine.test.ts` holds at three sizes. One yaw formula was already
      true: since D7.2, `estimateYaw` alone feeds the view, the `axes.ts`
      routing and the framing advice, all through `court_yaw_deg`.
      *Gap fill — done:* a lost sample is now filled by a cubic through two
      measured samples either side. One lost sample at the drop or contact at
      30 fps: 0.07 → 0.014 body heights. Making the filter coast, as F8
      proposed, was tried and measured worse (0.09–0.12). *Gravity — already
      fine:* the ball tracker accepts ±55% of the expected gravity, so the
      1.78 m assumption moves nothing. *Blur window — left alone:* the
      whole-serve median is a deliberate, measured choice (`triage.ts`), not
      an oversight.

### Wave D2 — One serve, judged once, by cited standards
Clean up the judgement before new readings are added to it.

- [x] **D2.1 Cite or re-derive the remaining bands** (was E11) · L. *Done
      (2026-10-09). `MetricCopy.source` is compulsory: a published `study`
      (from `.scratch/research-biomech.md`, converted to engine units) or a
      `motion` re-derivation. Thirteen bands cite studies and four are
      motion-derived; four measurements stopped being scored and show as
      "Measured, not scored" on their card (`READINGS`, `Fundamental.readings`):
      the tossing arm (a coaching standard with no angle), body extension and
      motion length (no figure; the latter's ceiling told slow serves they
      paused, which D3.4 showed tempo is not), and arm sync (no figure, no rig
      fault). Four bands were re-anchored where the research or the forty Bath
      serves contradicted them. Release height's floor moved 1.12 → 0.96, eye
      level (Kovacs), after flagging up to 15 real serves. Shoulder tilt's
      ceiling moved 32 → 36, 1.5 SD over the pooled 25°. Arm extension's floor
      moved 160 → 145, where the 14–30° of published elbow flexion had all read
      short. Contact in front's ceiling moved 20 → 40 after calling most real
      serves too far forward, and the kick's band went from over the head to
      0–40, since published kicks are struck in front. `bands.test.ts` checks
      that every motion band holds the rig's dialled fault outside it, and that
      the six fixture serves read inside every graded band from the guide's
      placement. The exception is hand height at contact, pinned to D7.4.
      Original plan:* One citation
      per band in `coaching.ts`, from the sources already in
      `ANALYSIS-REVIEW.md` §3.5 (Fleisig 2003, the 27-study meta-analysis,
      Kovacs & Ellenbecker). A band nothing supports becomes ungraded.
      *Proof:* a check fails on any graded band without a `source`.
- [x] **D2.2 Define contact height** · S. *Done (2026-10-09): "Ball height at
      contact" (`ballContactHeight`) when the ball was followed to the racket,
      read at the ball's own moment, on a band from published impact heights
      (Girard 2005, Vacek 2023) — 1.43 to 1.80 in the engine's units. Otherwise
      "Hand height at contact", the old reading relabelled. One row, never both,
      each with its own id so neither trend mixes two quantities. The diagnosis
      still grades the hand's height, whose ladder is calibrated. Original
      plan:* "Ball height at contact" when D1.4 has
      the ball; otherwise "wrist height", labelled as such, with its own band.
      *Proof:* rig with the ball found and not found.
- [x] **D2.3 Merge card and diagnosis bands** · M. *Done (2026-10-09), on five
      pairs, not two: `flaws.test.ts` reads every card row and every signal off
      rig serves and found the coil and the racket drop carrying one number as
      well. `CARD_SIGNAL` lists them, the ladder reads each card row's band at
      every rung, and the serve-type shift is read off the card's own overrides.
      A check holds them at every rung and serve type, and fails on any unlisted
      pair. Flat, because none of the five has a per-level figure the camera can
      resolve. The diagnosis still names a fault only past its noise floor, so
      whatever it names the card calls out of band too. Two card bands moved,
      each to a readout rung edge: the coil's floor from 15 to 8, which had called
      nearly every Bath serve short (they coil 5–16°), and leg drive's top opened,
      which had told the highest Bath serves (up to 0.26) to drive less. Leg drive
      is graded since D2.5, so it keeps its grade. No fault the diagnosis names
      on the forty Bath serves changed. Original plan:* Contact height and toss peak
      each get one band. Leg drive is not graded on the card while its signal is
      `UNCALIBRATED` in the diagnosis. *Proof:* a check that every signal shared
      by card and diagnosis reads one band.
- [x] **D2.4 Serve type reaches the diagnosis** · S. *Done (2026-10-08):
      `diagnose()` takes `serveType`, and `SERVE_TYPE_SHIFT` moves a diagnosis
      band exactly where the card moves its band for the same number — today
      the kick toss's floor, 0.18 lower, and nothing for contact height, which
      the card no longer separates (Vacek 2023). A check holds the two tables
      to each other. Changing the serve type on a report now judges it again
      rather than carrying the flat verdict over. Original plan:* `diagnose()` takes
      `serveType`, so a good kick contact cannot become a `low_contact` focus.
      *Proof:* rig kick serve, flat and kick verdicts compared.
- [x] **D2.5 Replace the strict hips-first rule** · S. *Done differently, on the
      research: hips-first is measured and no longer named, and a new
      `no_leg_drive` grades the hips' rise (Deghaies 2026, Reid 2008), placed
      after the toss in the fix order. Original plan:* `arming_the_ball` becomes
      "trunk before arm", which the IMU study supports; the pelvis-vs-trunk order
      stays measured and ungraded. *Proof:* `hipLead` sweep stops naming a fault.

### Wave D3 — New readings on footage the app already accepts
Each reading lands ungraded, then graded once D2.1 gives it a source. The rig
already has dials for D3.2–D3.4; until now nothing read them.

- [x] **D3.1 Toss placement relative to the front foot** · M. *Done
      (2026-10-09), measured and not graded: `readTossPlacement` sets the top
      of the toss against the front ankle — ahead of it from the side, across it
      from behind, neither from a corner — from the ball's apex when tracked and
      the tossing hand's release at half the confidence when not, on
      `Diagnosis.tossPlacement`. A rig ball (`rigBall`), filmed through the
      rig's own camera, reads back linearly on both axes with only the camera's
      angle off square leaking between them. Declared `UNCALIBRATED`: the
      published distances (Connolly 2021, Vacek 2023) are for contact, and
      turning them into a toss band is D2.1's to cite. Original plan:* Where the ball
      peaks, in body heights from the front ankle: front/back on a side view,
      left/right on a back view. Fall back to the tossing hand's release
      direction when there is no ball, hedged. The most useful single reading
      for a club player, and the base for kick vs flat. *Proof:* rig toss
      offsets on both axes, both camera yaws, with and without the ball.
- [x] **D3.2 Stance: platform or pinpoint** · S. *Done (2026-10-09):
      `readStance` reads how much of the ready gap between the feet closes by
      the trophy, on the diagnosis as context and on the report as a chip. It
      reads the `pinpointSlide` dial to two hundredths from the guide's
      placement, holds all 24 noise seeds, calls every Bath serve a platform
      from the side and from behind, and refuses a corner camera, where the
      feet's projection moves with the hips. 0.25–0.4 is no call. Original
      plan:* Ankle separation across
      ready → trophy (dial `pinpointSlide`, R60's blocked round). Information,
      not a fault: both stances are correct. *Proof:* pinpoint sweep, noise
      ensemble.
- [x] **D3.3 Landing and balance** · M. *Done (2026-10-09), measured and not
      graded: `Diagnosis.landingFeet` reads how far the hips moved off the
      front ankle between contact and the finish (R64's front-ankle reading,
      with the stance out of the baseline by starting at contact) and how far
      the back foot followed. From behind, the first tracks `landingLean`
      exactly at every `landingBackFootDrag` and the second reads the drag
      exactly at every lean. Hip travel is not read: the rig films with its
      hips fixed in the picture, so nothing here could validate it. Ungraded,
      because the research has no numeric norm for a fall across the front
      foot. Original plan:* Front-ankle landing (R64), hip travel
      after contact, back-foot drag (dials `landingLean`, `landingBackFootDrag`).
      Graded only for a fall across the front foot, which also loads the back.
      *Proof:* both dials swept, the two kept apart.
- [x] **D3.4 The hitch at the trophy** · M, after D1.2. *Done (2026-10-09),
      measured and not graded, without waiting on D1.2: the rig films at any
      rate, and the reading is refused below 60 fps anyway. `readHitch` times
      the WHOLE body (both hands and the hips) under 6% of its own peak speed
      between the toss and the drop, as a share of the motion, which is what
      keeps tempo out — R52's confound. At 60 and 120 fps a 0.15 s hitch reads
      apart from none at tempos 1.0–2.0 s, and every Bath serve reads 0.000.
      No band: no study gives a pause length. Original plan:* A pause measured
      against the player's own swing tempo — what reverted R52 lacked — at native
      rate (dial `trophyHitchSeconds`). *Proof:* hitch and tempo dialled
      together, kept separate at 60 fps and above; refused below.
- [x] **D3.5 Early arm cocking** · S. *Done (2026-10-09), measured and not
      graded: `Diagnosis.armCock` is the racket hand over the shoulder at the
      knee trough, read off image y. A new rig dial, `lateArmCock`, reads back
      in step from 0.156 to 0.044 at 20°, 45° and 82° alike, with 0.024 of
      deviation (0.009 on real motion). It is declared in `UNCALIBRATED`, and
      does not join the sequence group yet: the study gives a shoulder angle,
      no study gives it as a hand height, and the forty Bath serves read
      0.10–0.17, the cocked end the research calls the amateur signature. A band
      drawn from them would grade the signature as normal. Original plan:* Racket-wrist height against the shoulder
      at the knee trough — the published amateur signature (WTA 2026), readable
      side-on. Joins the sequence group. *Proof:* new rig dial for arm timing,
      ensemble.
- [x] **D3.6 Side-on trunk rotation** · M. *Done (2026-10-09), as timing,
      never degrees. `chestTurn.ts` reads how wide the shoulder and hip lines
      look against their own length from the world skeleton, with the tilt
      taken out. It reports when each passed half-turned to the net, against
      the racket's low point. The width cannot tell a coil past side-on from
      the same turn the other way, which is the caution below, so the instant
      used is the last half-open crossing before contact. From the side,
      `early_shoulder_rotation` is judged on `chest_open_ms`: half turned
      before the drop is a chest unwinding ahead of the swing (trunk fastest
      58 ms before impact, Fleisig 2003; low point about 130 ms before,
      Newton 2025). From a corner it still uses the coil. The forty Bath serves
      turn 75–200 ms after the drop from both sides, and none is named. The
      rig's open chest reads up to 280 ms early from 82°, 86° and 90°.
      Twenty-four noisy clean serves are never named. The noise floor is 21 ms,
      from real motion. Timing against the hips was rejected: that is the order
      `hip_lead_ms` retired. Limit: an 8° camera change moves a borderline
      chest across the line. The bench clips gave no real-pixel check. None
      of the five Commons clips is filmed from the side, and the reading
      declined on all three that were measured. Original plan:* *Research
      caution:* no published
      validation, and the width ratio is least sensitive at the trophy. Report
      timing and order, never degrees. Shoulder span over hip span through
      trophy → contact needs no depth, so `early_shoulder_rotation` can fire on
      the recommended angle instead of lying dormant. *Proof:* `shoulderYaw`/`hipYaw`
      sweep at 82–90° camera yaw; plausibility on bench frames.
- [!] **D3.7 Swing direction at contact** — dropped. The methods research
      (`.scratch/research-methods.md` §9; Sheets 2011) puts the kick-vs-flat
      difference in the racket's sideways path, which is depth on a side-on
      camera. Kick is cued from toss and contact placement instead.
- [x] **D3.8 The order the body fires in** · M, after D1.2. *Done
      (2026-10-09), at 60 fps and above: "The order you fired in" draws the
      legs, trunk, elbow and hand against contact, and `Diagnosis.firingOrder`
      checks legs before elbow before hand, with 15 ms of slack. The trunk is
      drawn and not checked: its peak is read from inferred depth and lands with
      or after the elbow's on the rig and on real serves, so putting it in the
      check would accuse real servers. A new rig dial, `lateLegDrive`, swaps
      the order; 24 noisy clean serves never read out of order; every Bath
      serve read is in order. Said on the report in words; not a named fault in
      the plan. Original plan:* Legs → trunk → arm
      peak times (`legs_peak_ms`, `wrist_peak_ms`, `chain_span_ms`, all
      `UNCALIBRATED` today) drawn as a timeline. Graded on order only, per
      Fleisig 2003, and only at ≥ 60 fps. *Proof:* dialled order swaps.
- [x] **D3.9 The back view as a full mode** · M. *Done (2026-10-09). With
      D3.6 every named fault is read from the side, from behind and from a
      corner, except the toss drift's two axes. The side sees it front-to-back
      only, the back fence sideways only, a 30° corner sideways, a 45° corner
      neither. `angleReach.ts` lists those, with where to film from. The report
      says, under "How I read this clip", what this clip could not see and
      where to stand: "From this angle I could not see whether your toss drifts
      sideways. Film from behind the baseline to check it." It is read off the
      findings the clip has, not the angle's name. From behind, at 0°, 8° and
      15° under noise, sideways drift, sideways trunk lean and shoulder tilt
      each separate their dialled fault from none. The six real serves from
      the back fence are read sideways, and none names toss drift or posture
      collapse. Original plan:* Sideways toss drift, shoulder
      tilt and sideways trunk lean read where a back camera sees them best. Each
      report says which faults its angle could not see ("film from the back
      fence to check your shoulder turn"). *Proof:* `cameraYaw` 0–15° rig
      ensemble; a check that every dormant fault names the angle that would wake
      it.

### Wave D4 — From diagnosis to programme
The diagnosis is good; what follows it is one sentence of text. This wave adds
the coaching around it.

- [x] **D4.1 Drill model v2** · M. *Done as ladders (`progressions.ts`): a
      cue, 3–5 steps, an easier way in, the mistake, and a bar of N of 6 serves
      judged by the engine. Three drills replaced on the research. Original
      plan:* `Drill` gains a feel cue, 3–5 progression
      steps (shadow → service line → half pace → full → under pressure), an
      easier version, the common mistake, and a pass mark the app can check
      (`{ metricId, threshold, ofServes }`). Written for every reachable fault,
      under `voice.ts`. *Proof:* type-level totality over `FlawId`; copy lint.
- [x] **D4.2 "Show me" from the rig** · M. Two model serves, side by side
      on one clock, under the top drill. Five faults pass both proofs (named by
      the engine; at least 0.1 body heights apart at the judged moment). Three
      were measured and dropped as invisible on a stick figure: hip-before-
      shoulder timing, early shoulder turn and toss drift. A dashed overlay was
      tried first and was unreadable.
- [x] **D4.3 Check my drill** · M. *Done on the basket sweep rather than a separate drill mode: `checkDrill` counts clean serves against the ladder's bar, the player moves up or down by tap, and the rung is remembered per fault. Original plan:* Film a basket in drill mode; only the focus
      measurement is scored against its pass mark, serve by serve. Pass moves
      you up a step; a miss offers the easier version. Extends the `practice`
      store with the step. *Proof:* seeded sessions through every transition.
- [x] **D4.4 A weekly plan on Home** · S. *Done (2026-10-09): "This week" on
      Home lists the last report's ranked fixes (`causalPlan`, so the order is
      the report's), each on the rung of its ladder the player has moved to,
      with the basket that checks it. It replaces the one-line "last drill"
      reminder; the R57b objection to repeating the report does not apply,
      because the rung and the check are what the report's later fixes never
      show. A refused clip filmed since does not blank it. Render checks in
      `render.test.ts`. Original plan:* The current step of each of the 2–4
      ranked fixes, in `HIERARCHY` order, with what to film to check it. No
      notifications. *Proof:* render test; plan follows triage order.
- [x] **D4.5 Your best serve as the model** · S. *Done (2026-10-09):
      `bestPriorTo` picks the best earlier serve of the same type and rubric
      (score, then the steadier basket, then the newer), never a refused clip.
      The ghost draws it, falling back to the last serve when the best cannot
      be paired, and says which it is. The focus card adds one line setting the
      fault's card reading against the best serve's, and closer or further than
      last time. It stays silent for faults with no card row. Original plan:* The ghost overlay is the
      player's best serve of the same type (score, then repeatability), not
      their last. Add "closer to your best" deltas on the focus measurements.
      *Proof:* seeded history picks the right serve; type never mixed.
- [x] **D4.6 Evidence on the frame** · M. *Done (2026-10-09), on the stills,
      which are the only picture a reopened report keeps. `keyframeOverlay`
      now draws the live player's height targets (`ghostFor`) on the toss and
      contact stills: the target zone, the gap to it and "Aim for". It also
      draws where the toss peaked against the front foot on the toss still, in
      the toss map's own sentence (`tossMarkFor`, `tossPlaceCopy.ts`). Both are
      refused on a levelled clip. The knee arc was already there.
      `stillEvidence.ts` says, fault by fault, what its still shows (low
      contact: the target; toss height: the flight; collapsed elbow: the arc),
      or why one frame cannot: a rise is two moments, a wander is a path, a
      turn towards the lens moves nothing. `stillEvidence.test.ts` renders
      every entry through the real overlay. `?demo=shapes&stills` draws the
      rig's stills on dark tiles to look at. Original plan:* "Watch this moment" draws the
      measurement itself — knee arc, contact-height line, toss-placement
      marker — on the keyframe still. *Proof:* render test per fault; preview.

### Wave D5 — Connect technique to results
The outcome taps already exist and nothing reads them.

- [x] **D5.1 Tag any serve** · S. *Done (2026-10-09): "Tag this serve" on
      every report, reopened ones included, through the glance's own store and
      rule (a tap never clears the other fact; tapping again takes it back).
      A basket's serves are tagged from each serve's own report, which the
      chips already open. Backup already carried tags (R56). The example report
      takes no tags. Original plan:* First/second and In/Long/Net/Wide on every
      report and on each serve chip in a basket, not only in Glance.
      *Proof:* render tests; tags survive backup round-trip.
- [x] **D5.2 What your misses have in common** · M. *Done (2026-10-09), data
      only as planned: `missesInCommon` in `progress.ts`. Per kind of miss, the
      graded reading that best separates those serves from the ones that went
      in, said only with five tagged serves on each side, one serve type and
      one rubric era, a gap wider than the reading's `NOISE_FLOOR` and at
      least twice its own standard error. A planted difference is found; a
      null history, a thin one and a mixed-type one say nothing. Original
      plan:* Across tagged serves,
      compare each measurement between serves that went in and serves that
      missed. Say it only when the gap clears that signal's `NOISE_FLOOR` and
      enough serves sit on each side: "Your serves into the net had the toss
      further in front." Computed in `progress.ts`, data only. *Proof:* seeded
      tags with a planted difference, and a null history that must say nothing.
- [x] **D5.3 First and second serves apart** · S. *Done (2026-10-09): Progress
      lists first and second serves on their own — count and average score of
      the tagged ones, one serve type and rubric era — and each serve type's
      in-rate from the player's taps, once there are five. Original plan:*
      Progress splits by serve number. In-rate from tags per serve type.
      *Proof:* seeded sessions.
- [x] **D5.4 Serve count per week** · S. *Done (2026-10-09): Progress shows
      this week's serves beside the four before, and one plain line when a
      week is half again the recent average and ten serves over it, with a
      baseline of four weeks that had serves. A count; nothing about load or
      injury. Original plan:* Serves detected per week and a plain
      note when a week jumps well above the last four. A count, not a medical
      claim. *Proof:* seeded history; copy lint.

### Wave D6 — Richer surfaces for what already works
- [x] **D6.1 Glance for any clip** · S. *Done (2026-10-09): every live report
      has "At a glance" under its verdict, so a clip picked from the camera
      roll reaches the glance too; the glance's "Show me everything" returns.
      In `screenFlow.ts` as `report → glance`. Original plan:* Not only
      in-app recordings (was W4).
      *Proof:* `screenFlow` table and test.
- [x] **D6.2 A spoken summary after each glance** · S. *Done (2026-10-09):
      "Read aloud" on the glance, off until the player turns it on and then
      remembered (`Prefs.speakGlance`). It reads the refusal, or the score and
      the one fix, through `lib/speech.ts`, which speaks only with a
      `localService` voice and is silent otherwise; the toggle only appears
      when the device has one. `egress.test.ts` now counts speech as a request
      and holds it to that file. Original plan:* `speechSynthesis` with
      on-device voices only (`localService`); silent otherwise, so §7 holds.
      *Proof:* egress test extended; voice choice unit-tested.
- [x] **D6.3 The toss map** · M, after D3.1. *Done (2026-10-09), as a strip
      rather than a top-down map, because one camera reads one axis: "Your
      tosses, front to back" from the side, "side to side" from behind. Each
      serve in the basket against the front foot; a dot for in, a diamond for a
      miss, an empty ring untagged, so identity is never colour alone, with a
      touch readout and a list for screen readers. Existing tokens only
      (`--great`, `--work`): they pass colour-blind separation and contrast
      and sit above the dataviz lightness band, as every token in this skin
      does. `?demo=basket` shows it. Original plan:* Every serve's toss peak in a
      basket on one top-down plot, coloured by outcome when tagged. A view
      coaches use constantly. Existing tokens only. *Proof:* render test;
      preview at phone size.
- [x] **D6.4 Keep the clip if you want to** · M. *Done (2026-10-09). "Your
      videos" in Settings turns it on (`Prefs.keepClips`, off by default), and
      `storage/clipStore.ts` refuses to write without it. Clips live in the
      origin-private file system, one per video, named by the clip part of its
      reports' ids, so a basket's serves share one file. They are bounded at
      12 clips and half the space the browser offers, oldest first, and a clip
      is refused rather than the store emptied for it. Kept videos are the
      first rung when the disk pushes back, before any still or report. A clip
      goes with its last report: deleted by hand, by the routine bound, or by
      clearing. A reopened report plays the real video in the replay's slot,
      with buttons for the six moments. It plays beside the best earlier
      serve's video, from each toss at half speed, when that one was kept too.
      `clipStore.test.ts` covers every tier and the opt-in against an
      in-memory directory. In the preview, a Commons clip analysed with the
      setting on was kept (962 kB) and played back from a reopened report,
      its Contact button landing on 16.08 s.* Opt-in, on-device (OPFS), under
      the existing storage pressure rules, so a saved report replays real video
      and before/after can be played side by side. *Proof:* storage tests at
      each pressure tier; nothing written without the opt-in.
- [!] **D6.5 Suggest the serve type** — dropped with D3.7.
- [x] **D6.6 Progress by fault** · S. *Done (2026-10-09): "Faults over your
      last serves" on Progress — each fault named in the last ten serves of
      one type and era, on how many of the serves that could be judged for it,
      whether it is named less or more often lately (two serves either way),
      and the ladder step the player is on. Original plan:* Trends per named fault and per
      progression step, beside the per-measurement charts. *Proof:* seeded
      history.
- [!] **D6.7 RTMPose-m for the swing window** · M, optional. *Measured and
      not adopted (2026-10-09). The footprint check, run in the browser
      (`footprint.html?model=s|m`), reads the WASM heap where
      `lib/footprint.ts` cannot. RTMPose-s holds 73 MB after loading and 30
      reads, at 54 ms a read. RTMPose-m holds 150 MB at 137 ms a read, on
      desktop Chrome, one thread, the app's own settings. Memory passes: 150 MB
      sits well inside the 500 MB rule beside the pose engine and the video.
      Time does not. The refinement has 6 s for about 30 crops
      (`REFINE_BUDGET_MS`), and RTMPose-m takes 4.1 s of it on a desktop. On a
      phone several times slower, `refineSwing` would stop at its budget and
      refine nothing, which is worse than RTMPose-s refining everything. Worth
      revisiting with WebGPU, which this build does not ship.* Adopt only if
      `/bench.html` beats RTMPose-s on wrists and elbows and the memory
      footprint test still passes; try WebGPU for `onnxruntime-web` alongside.
      *Proof:* the benchmark table in `ANALYSIS-REVIEW.md` §7, re-run.
      *Benchmark half met (2026-10-07):* it beats RTMPose-s on both sets.
      Wrists are −16% on Tennis Player Actions and −26% on 146 COCO overhead
      frames from every side (−18% on the edge-on ones);
      `bench.html?set=coco-tennis`. The footprint test is still to run.

### Order of play
D1 first, because D3.4, D3.7 and D3.8 depend on it and D1.4 sharpens every
contact-frame number. D4 and D5 do not depend on D1–D3 and carry the most
player value per round, so they can run alongside it. D2 must land before D3's
readings are graded. D6 last, except D6.1, which is one round and can go any
time.

### Findings on real footage and the rig (2026-10-06)
Measured, not guessed: `/clipbench.html` run headless on the five Commons
clips, frame sheets read by eye, and the rig's own limb lengths.

- **Two refusals were right.** The Sharapova clip has her returning and
  rallying, with no serve of hers in it. `Saque_reves` is table tennis. Both
  "not a serve" answers stand.
- **Contact height is not miscalibrated on real clips.** The two real club
  serves read wrist contact at 1.31–1.32, inside the 1.28–1.50 band.
  Anthropometry puts a real wrist lower (about 1.18–1.28 on a floor-based
  stature). The engine's own chain (ankle ground, nose ÷ 0.93) reads higher,
  so the band and the chain agree. **Left alone.**
- **The rig's arm stretches to reach its clean contact.** At
  `contactReach: 1.38` the forearm is 0.70 m against its own 0.44 m at ready.
  The reach at which it keeps its length is about 1.22. Every expectation
  dialled at the default sits on a body no player has. That is worth fixing in
  the rig (a reach-limited arm, with the jump carrying the rest), but it moves
  every noise floor derived from the rig. It needs its own round.
- **Drop depth reads at or below zero on every real rear-oblique clip**
  (−0.05/−0.06), so "the racket stops short behind you" leads on real
  footage. At 320×240 from behind, the frames cannot settle whether the drops
  were shallow or the wrist was misplaced behind the back. Open, and the next
  thing to check when better open footage turns up.
- **Arm extension** reads 160–171 on real clips. Elite literature has 14–30° of
  bend at impact (interior 150–166). The band floor of 160 sits mid-elite, but
  real readings clear it. Left alone until a clip reads below it.
- **Two ball bands contradicted the literature and are fixed** (D2.1, first
  part). The toss ceiling (1.72, and 1.78 at the top rung) sat below every
  published skilled toss peak (1.82–2.08 from the ankle line). The
  fall-before-contact band (0–0.09) called every skilled server late, since the
  ball falls 0.3–0.5 of standing height into a good serve. Both were argued from
  the wrist's contact height rather than the ball's. Ceilings are now 2.1, and
  the fall band is 0–0.55. Scoring version 3.
- **Still to cite** (rest of D2.1): shoulder tilt (meta-analysis 25 ± 7 at the
  trophy matches the 14–32 band), drop to contact (forward swing 0.13 s matches
  110–230 ms), leg drive card band (Deghaies 2026), and the provisional
  wrist-based contact height.

### Real serve motion, measured (2026-10-07)
`npm run bench:mocap` films the 40 finished serves in the Bath motion-capture
set (CC BY 4.0) with a virtual phone from five placements, at 30, 60 and
120 fps, and runs the engine's own steps on them (`ANALYSIS-REVIEW.md` §9).
No pose model runs, so what it finds is the engine's, not MediaPipe's. Timing
holds up: contact within 18 ms of the 180 Hz capture at 30 fps, and the drop
within 20 ms. Three things do not, and each is pinned as a KNOWN check in
`mocap.test.ts`:

- **`shallow_drop` is the first fix on every real serve, from every angle.**
  The hand stays level with the shoulder at a real drop while the racket head
  falls 35–44 cm. The drop bands describe the back-scratch image. This also
  answers "drop depth reads at or below zero on rear-oblique clips" above.
- **The guide's placement is filed as an angled view, and the back fence as
  side-on.** A textbook stance points the shoulders at the net; the rig poses a
  player square to it. `contactAhead` never reaches the card from where the
  guide puts the phone. *Fixed by D7.2's first half: the guide's placement is
  side-on on all 40 serves and reports `contactAhead`.*
- **The toss keyframe lands 90–210 ms after the tossing hand peaks**, because
  it is read against the shoulder while the trunk tilts. *Fixed by D7.3: it lands within
  a few milliseconds of the hand's peak.*

### Wave D7 — Agree with real motion
Every item is proven against the Bath set (the KNOWN checks flip) and anchored
to the literature, never re-derived from one player.

- [x] **D7.1 Re-anchor the drop** · M. *Done (2026-10-07): a hand near the
      shoulder is a full drop, one floor at every level, and a racket that
      never fell is scored and read out as such on the card. The elbow-angle
      grading was not used: this set's elbow angles carry a marker offset
      (`ANALYSIS-REVIEW.md` §9). The rig's drop pose is left as it was, because
      the new band holds it. Original plan:* Grade the racket's fall by what a camera
      can see of it: the elbow folded (interior angle at the low point; WTA
      top-40 67°, lower-ranked 52°, Gao 2026) and the hand behind the head.
      Stop asking the hand to drop below the shoulder. Re-pose the rig's drop
      (`dropBelowShoulder` 0.45 m is a back-scratch) and re-derive the floors
      that move with it. *Proof:* KNOWN drop check flips; real drops pass from
      every placement; rig `collapsed_elbow` still fires.
- [~] **D7.2 A camera model that matches a real stance** · L. *First half
      done (2026-10-07, scoring version 5): the rig's stance, trunk turn and
      arms re-posed on the Bath serves, and the view, the `axes.ts` routing and
      the framing advice read against the court (`court_yaw_deg`). The guide
      placement is filed side-on and reports `contactAhead` on all 40 serves;
      the back fence is not. The realistic rig also exposed five limits of a
      camera read from one shoulder span, now pinned as KNOWN checks
      (`ANALYSIS-REVIEW.md` §9). Still open:*
      - [x] **A second camera cue that says which side.** *Done
        (2026-10-07): after a capture the court angle comes from the swing's
        direction (`courtYawFromSwing`), 2.9° median error from 24 placements
        with depth noise, against 20° from the stance. Every bench placement is
        filed correctly, and the corner KNOWN check in `depth.test.ts` flipped.
        The rig's world landmarks now turn with the camera, as MediaPipe's do,
        which reversed R50c's "the trunk lead is camera-invariant".*
      - **The two stance questions that remain.** The comparison gate refuses
        a sixth of same-spot pairs near the guide's placement, and a camera 5°
        under the depth floor is read as readable on 22% of poor-light takes.
        Both ask about the shoulders, so the swing does not answer them: a
        swing varies 9–17° from serve to serve at a fixed camera, which would
        make the gate worse. *Proof:* the KNOWN checks in `axes.test.ts` and
        `robustness.test.ts` flip.
      - **`SWING_OFF_NET_DEG` beyond one player.** 19° comes from the Bath
        server. Check it against a second mocap set or published racket-path
        angles, per serve type, before relying on corner classification for
        kick serves.
      - **`SHOULDER_SPAN_RATIO` against pose-model shoulders.** COCO's
        hand-labelled frontal shoulders have a median width of 0.229 of height,
        against the 0.21 ratio. The ratio decides whether the guide's placement
        saturates on real footage. Settle it with item 1, since a court
        direction that does not use the span makes this moot for the view.
      - **Rig fidelity.** Its feet turn with its hips (Bath feet stay apart
        along the net axis), and its hand turns through contact far less than
        real serves (pronation 20–39° against a Bath median of 93°).
      - **R60·2 reopened.** From the guide's placement the stance reads at 18
        times its noise, because a real front foot is ahead towards the net.
        Platform against pinpoint is readable after all.
- [x] **D7.3 Toss from the hand** · M, was S. *Done (2026-10-07), without
      re-posing the rig's tossing arm: the release is the first top of the
      hand's lift after its fastest rise (`findRelease`), not its highest
      point, so a held arm that the legs lift later does not count. The height
      is the hand over the hips from the world landmarks plus the hips' rise
      and fall from the picture. Picture height alone read 40 ms late from the
      guide's placement, because of perspective. On the Bath serves the toss
      lands a median 4–7 ms from the hand's peak at every placement and frame
      rate without noise, and within ±50 ms (p10–p90) with tracker noise. It
      was 90–210 ms late. The KNOWN check flipped. The readings taken at the
      toss moved modestly on real serves (hold 70 → 75%, sync-at-release
      0.11 → 0.04, total time +25 ms), and no new fault is named. The
      toss-drift floor rose from 0.006 to 0.007 by its own 1.5× rule. Original
      plan:* Take release from the tossing hand's own path (its peak, or its
      upward speed falling away), not from wrist-over-shoulder. *Proof:* toss
      keyframe within ±40 ms of the hand's peak on the Bath set; rig toss
      readings re-checked.
- [x] **D7.7 Hand-under-elbow from the guide's placement** · S. *Done
      (2026-10-08), with neither option below: the reading was wrong rather
      than its grade. Read off the picture, a lens at waist height tips the
      order of a hand and an elbow a few centimetres apart. The order now comes
      from the world landmarks, which carry no perspective, and the forty Bath
      serves read 6.5–8.9% at the lowest and 12–13% at the median from every
      placement and rate (were 0% and 8–15%). The rig reads the same either
      way. Found while checking D7.3.* Two of the 40 real full drops read 0% from the guide's
      placement at 30 fps. This was already true before D7.3. The 4% floor sits
      at that placement's lowest tenth, so a real drop can be read out as
      "Hand never gets under the elbow". From that camera the reading cannot
      separate a real drop from none at the low end. Decide whether to
      withdraw its grade or move it to a placement-aware floor. *Proof:* no
      real drop from any bench placement reads under the floor.
- [x] **D7.8 Say a rotated phone, not a missing contact** · S. *Done
      (2026-10-08): `turnedPicture` reads the roll off the whole clip before a
      serve is looked for, from the ankles-to-shoulders direction averaged
      round the circle, which on level clips stays within 5.3° of upright from
      every placement. Past 30° the clip is refused as tilted, on its side or
      upside down. It also closed a gap the sweep found: a clip rolled 30–40°
      used to be levelled by `estimateRoll`'s 25° clamp and measured with the
      rest still in it. `?demo=turned` shows the screen. Found while checking
      D7.3, already true before it.* A clip rolled 89–110° is refused
      as "The clip ends before the racket reaches the ball", because the
      keyframes found in a sideways picture put contact on the toss. Estimate
      roll before the full skeleton exists, as the note on R14 in
      `triage.test.ts` describes. *Proof:* rolled clips get a camera-angle
      refusal.
- [x] **D7.4 Contact height that does not depend on the phone** · M. *Leniency
      done (2026-10-07): bands re-anchored to published impact heights, a
      measured `CAMERA_ALLOWANCE` before `low_contact` is named, and contact
      height no longer rates the player, since the phone moves it four rungs.
      Perspective done (2026-10-09), without a camera model. The hips' height
      still comes from the picture: they sit in the body's plane. The hand's
      height above them now comes from the world skeleton, which is metric and
      has no perspective, over the stature that skeleton gives
      (`handHeight.ts`), the same move D7.7 made for the hand's order. On the
      forty Bath serves the five placements' medians went from 1.112–1.267 to
      1.211–1.234, within the noise floor of their midpoint, and every serve
      reads 1.174–1.246 from every place. The rig, drawn without perspective,
      moves by at most 0.013. `CAMERA_ALLOWANCE` re-derived to 0.012 (was
      0.06). The KNOWN exception in `bands.test.ts` flipped and is gone. A
      zoom drift now reaches half as much of the reading. The band's floor
      stays at 1.14, now because every real serve sits above it.
      `handHeight.test.ts`. Original plan:* Correct for
      the hand's depth against the body plane, or report the height only from
      placements where it holds, and cite the wrist band (D2.2). *Proof:* the
      five placements agree within the noise floor on the Bath set.
- [x] **D7.5 Say why a clip without contact was refused** · S. *Done
      (2026-10-07): worse than the message — the retry against the other hand
      found a "serve" with every keyframe on one sample, which triage refused
      as too few frames. Contact on the toss is now refused as "The clip ends
      before the racket reaches the ball." A clip cut between the trophy and
      contact still reaches triage's refusal.
      Original plan:* A capture that
      ends before the racket comes over is told it looks left-handed.
      *Proof:* the two unfinished Bath serves get a no-contact refusal.
- [x] **D7.6 Noise ensembles on real motion** · S. *Done (2026-10-08):
      `realiseReal` films the six fixture serves sixty times each with the
      rig's noise, scaled to the player's size in the picture, and
      `depth.test.ts` holds every floor against both ensembles and prints the
      table. Real motion asked for more on five signals, all read from depth or
      at a fast moment: palm-to-sky 11 → 18, lean 7 → 10, elbow lift 0.012 →
      0.017, pronation 31 → 76, and the coil 9 → 30, now `UNDER_RESOLVED`.
      At 9 the coil named early shoulder rotation on 28% of real takes, and
      every one of the forty serves flickered; at 30 it names none, and an open
      chest is still caught 85% of the time from a corner. Forty serves agree with the six
      (`ANALYSIS-REVIEW.md` §9). Original plan:* `filmMocap` takes the rig's
      `noise`, `depthNoise` and `depthBias`, so the ensembles behind every
      `NOISE_FLOOR` can be re-run on real serves and the self-referential
      floors (`ANALYSIS-REVIEW.md` F1) checked. *Proof:* a floor table, rig
      against real motion.

---

## Level-up programme (2026-10-09) — trust, sessions, progress, seeing good

This programme came from a six-area review: coaching and ease of use, visuals,
engine accuracy, grading and progression, long sessions, and everyday pain
points. `LEVEL-UP-REVIEW.md` holds the reasoning and the `file:line` evidence.
This section is the ledger.

The Depth programme's rules still hold:
- every item is proven by machine (the rig, the Bath bench, the open-data
  benches, a published study, or the browser preview);
- `LOOP.md`'s eight constraints apply throughout;
- nothing changes a colour or sends data off the device.

Items that change the score fold into the unshipped scoring version 5, so a
player's history breaks only once.

### Wave L1 — Stop saying wrong things
Small items, and everything after builds on them.

- [x] **L1.1 Score only what was measured** · S. *Done (2026-10-09):
      `overallOf` and `isMeasured` in `coaching.ts`. On the modal club serve the
      overall moved 63 → 72. The card, the share image, the trend and the deltas
      all skip the empty area. History reads the same way with no migration,
      because an empty area is read off its shape. `?demo=collapsed` shows the
      card. Original plan:*
      - **What:** an area with no graded rows leaves the overall and the share
        card. Its card says "Not measured on this clip" instead of drawing a 0
        ring. No area delta is shown when one side of it is empty.
      - **Why:** today the commonest club serve loses about 9 points to a
        Rhythm area the engine never measured. *Proof:*
        `collapsedSwing.test.ts` asserts the overall is the weighted mean of
        the non-empty areas (71, not 62).
- [x] **L1.2 One confidence for card and plan** · S–M. *Done (2026-10-09):
      `restingTrust` and `blurTrust` price six diagnosis signals as their card
      rows are priced; the card and the plan now read 0.50/0.50 with the feet
      cropped and 0.70/0.70 on rigid legs. `triage` and `causalPlan` lead on
      firm findings (`isFirm`) and fall back to soft ones only when nothing
      firm was named, which is the rule `pickFocus` already followed. Spine lean
      is hedged from the side only, not on `depth_unreliable`, since that flag
      also fires from behind, where the lean is read best. So `posture_collapse`
      joins `ANGLE_BOUND`, and the posture tests and the injury demo now film
      from behind. Left open: a soft lead, when it is all there is, carries no
      "read this loosely" line on the focus card. Original plan:*
      - **What:** diagnosis signals take their confidence from
        `metricConfidence`, which covers:
        - scale from the torso;
        - a trophy found from the arms;
        - the hand and the ball disagreeing about contact;
        - blur;
        - depth.
      - Spine lean also gets `DEPTH_COLLAPSED`.
      - *Proof:* the rig's `cropFeet`, rigid-leg and contact-lag cases, plus a
        check that no named fault rests on a signal whose card twin is soft.
- [x] **L1.3 Injury flags on measured footing** · M. *Done (2026-10-09),
      with one departure. Each flag now needs its own fault named on a firm
      reading: the tray, `posture_collapse` or `shallow_drop`. That puts the
      noise floor, the camera allowance and `isFirm` under every warning
      without a second threshold. The wrist flag reads the palm alone. The tray
      card says "Watch your elbow and wrist" (Touzard 2019), and the back card
      gives no count of serves.
      Measured on the six Bath serves × 24 noisy takes:
      - from the guide's placement, 0 of 144 takes raise a warning;
      - the rig's clean serve raises none;
      - the tray is caught on 96% of takes and a 40° fold on 100%.
      The departure: from the back fence the fold's own noise reaches its line
      on 4 of 144 real takes, so "zero false flags" holds from the side only.
      That is pinned as a KNOWN check, for a floor re-derived from behind or
      L2.7's basket verdict to close. Original plan:*
      - **Wrist:** drop the pronation half of the flag (it is under-resolved),
        or replace it with the cocking signature. Require palm-to-sky past the
        tray's own floor.
      - **Lower back:** cite a threshold (Gao 2026).
      - **Both:** a flag must clear the noise floor before it is raised. Card
        copy claims only what is measured.
      - *Proof:* zero false flags across `realiseReal` on the six Bath serves
        (60 takes each) and across the rig's noise ensembles. The rig's
        injury dials still flag at least 90% of the time.
- [x] **L1.4 Retire the hold and pause drills; one drill source** · S. *Done
      (2026-10-09): seven stopping drills replaced by shared flowing ones (push
      throws, a ball in a sock, overhead throws, hit up and out, shoulder over
      shoulder), each one object across rows, areas and ladders.
      `drillForMetric` hands a fault's number its ladder rung on the practice
      card and the fallback focus, and the practice card takes the player's
      rung and the serve type's drill. The check reads 224 reachable drills and
      finds none that stops the swing. The duplicate card on one page is
      L1.6's. Original plan:*
      - **What:** when a reading maps to a fault, `PracticeCard` and
        `pickFocus` hand out the ladder rung the player is on
        (`progressionFor`). The pause at the drop, "slow sink hold", "freeze
        at the trophy", "reach and freeze" and the heels-up basket are
        replaced. Kick servers get the kick drill.
      - *Proof:*
        - no reachable drill text matches freeze, hold, pause or stop dead;
        - a practice test with a kick history;
        - no two drill cards on a page share a name.
- [x] **L1.5 Copy truth pass, and the lint's blind spots** · S. *Done
      (2026-10-09). About 30 lines were rewritten across nine files, and four of
      the seven technical conflicts were fixed: the early-turn cue, the kick
      toss, the stride and the back-leg hips. The focus title stays the label;
      the one label that was a sentence became "Tossing arm timing". The coach
      referral now waits for four logged sessions of a drill.
      `voice.ts` holds "drop" to the racket. The editor now reads names,
      labels, titles, ladder lines, captions, every practice headline and every
      toss placement. The posture ladder's head-up framing for a sideways fold
      is left as it was. Original plan:*
      - **What:** the rewrites in `LEVEL-UP-REVIEW.md` §1. The worst offenders:
        - focus titles taken from readouts rather than from the target;
        - `practiceHeadline`'s grammar;
        - the best-serve line said in words;
        - toss placement in foot-lengths.
      - **The lint** is extended to drill names, labels, fault titles, phase
        captions, runtime-built sentences, and "drop" used for anything but
        the racket.
      - *Proof:* `copy.test.ts` walks a registry of every string a player can
        see, and renders each template with every label.
- [x] **L1.6 One "start here"** · S. *Done (2026-10-09). The basket line
      stays by the chips, which README §"Consistency across a basket" chose on
      purpose, but now defers to the first fix. `PracticeCard` gained
      `sameAsFocus`: the season's line and the log stay, and the drill is not
      printed twice. Home's "Working on" shows only when it agrees with the
      week's plan. `findPracticeFocus` skips readings under
      `SOFT_MEASUREMENT`. Original plan:*
      - **What:** the basket headline sits below the plan. `PracticeCard` is
        hidden when it repeats the focus. Home's "Working on" comes from the
        same plan, or at least from confidence-filtered rows.
      - *Proof:* render tests in the `?demo=basket` shape, and a practice test
        with soft rows excluded.
- [x] **L1.7 Never trade a report for an error** · S. *Done (2026-10-09),
      with two departures:
      - The report's serve is still read again, because the full read carries
        the ball and the refinement that swept serves skip, and the spread
        would mix unlike readings.
      - No "Read it left-handed" button. The engine already retries with the
        other hand, so the both-hands failure now says so instead of pointing
        at a badge that is not there.
      `withoutComparison` keeps the report. A refused clip is not swept, and a
      refused serve in a sweep is counted unclear. Original plan:*
      - **What:**
        - A failed sweep falls back to the single report already saved, with
          a note.
        - No automatic sweep when the clip's own read was refused.
        - A refused serve inside a sweep counts as "too unclear".
        - The report's own serve is reused, not read again.
        - The wrong-hand error gets a "Read it left-handed" button.
      - *Proof:* the `sweepServes` harness with a stub `measure`, and an App
        flow test that lands on the report.
- [x] **L1.8 Honest basket statistics** · S. *Done (2026-10-09). The spread
      is now the standard deviation less as much camera noise as that many
      takes could show at the 99th percentile (`noiseReach`, Wilson–Hilferty
      χ²), on the six-serve scale. `CARD_NOISE_SD` holds 15 readings measured
      on Bath × 2 placements and the rig, and is re-measured by
      `consistency.test.ts`. Measured: zero false "changes most" lines on 48
      real noise-only baskets, and a planted contact wander is still flagged
      (46). Removing only the average noise still flagged arm extension on one
      basket in fifty, which is why the bound is the 99th percentile.
      Off-target steady rows show in amber with a note. Best against worst
      needs 3 points. The share card's spread rows are unchanged. Original
      plan:*
      - **What:** spread becomes a standard deviation or MAD with the camera's
        own noise subtracted, soft rows excluded, and scaled to today's
        six-serve scores. Best-against-worst is hidden when the gap is under
        the noise. A steady fault row says "steady, but outside the target",
        not 100.
      - *Proof:* a basket of one Bath serve under pure noise never gives a
        "changes serve to serve" headline.
- [x] **L1.9 An example report a coach would sign** · S. *Done
      (2026-10-09). The rig's hip dip and rise scale with its knee bend
      (`loadShare`); the default is unchanged. Only two tests moved, both
      because straight legs now honestly name `no_leg_drive`. The example uses
      `DEMO_DIALS.example`, which adds a racket that stays above the shoulder:
      two fixes, legs then drop, overall 74. The example's headline still says
      "A solid, repeatable serve" off one serve, which is L3's to fix. Original
      plan:*
      - **What:** the rig's hip rise is coupled to its knee bend, so straight
        legs cannot drive hard. The example is rebuilt on the real plan path:
        ranked fixes, the ladder, and Show me.
      - *Proof:*
        - the rig's leg drive falls as `trophyKneeAngle` straightens;
        - the example's triage names at least two faults;
        - a coherence check: knee "straight" never appears beside leg drive
          "strong".
- [x] **L1.10 One placement everywhere** · S. *Done (2026-10-09).
      `lib/placement.ts` feeds ten placement sentences, and
      `placement.test.ts` scans the source for a distance given anywhere
      else; it found the guide diagram's own label. The live check's dead
      side-on row is gone, so the guide's placement reads "ready", and the
      judge test that said reconciling the two "is a job for a person" now
      asserts that they agree. One departure: the angle lines are merged per
      place to film from rather than shown only when a named fault makes them
      matter, because a fault the camera cannot see is never named. Original
      plan:*
      - **What:** one `PLACEMENT` constant feeds the guide, the live check, the
        refusals and the tips. The live check accepts what the guide draws.
        "Film from behind" appears only when the unseen axis matters to the
        faults named.
      - *Proof:* the rig at the drawn placement passes the live check and
        still measures contact in front. A string test checks every hint uses
        the constant.

### Wave L2 — Every serve in a session
Today a clip over 400 MB is refused, and a clip that gets in yields about 8
serves, effectively at random. L2.1–L2.3 correct the basket path that exists.
L2.4 onward is session mode.

- [x] **L2.1 Find every serve** · S–M. *Done (2026-10-09). A 3-sample-a-second
      floor under the scan budget, every candidate refined, and each peak
      judged against the best reach within two minutes. On rig-trace sessions
      the finder went from 7/10, 8/50 and 8/120 to 10/10, 50/50 and 120/120,
      with no practice swing counted, at 804, 3,663 and 9,855 samples.
      Departures:
      - Adaptive sampling, sparse while the player walks, moves to L2.12; the
        floor alone does the job.
      - The report's serve is still read twice; see L1.7.
      - A smash within two minutes still mutes nearby serves. That is a KNOWN
        check, for L2.10.
      Original plan:*
      - **What:**
        - re-read every candidate, not 8;
        - a density floor with adaptive coarse sampling;
        - a rolling reach reference over ±2 min;
        - `MAX_SERVES`' comment corrected.
      - *Proof:*
        - rig-shaped timelines are all found: 10 serves in 2 min, 50 in 10,
          120 in 30;
        - a cost-formula test;
        - the wide-parabola test replaced.
- [x] **L2.2 Say what was read** · S. *Done (2026-10-09):
      - `coverageLine` on the panel ("This clip holds 10 serves. I compared 6
        of them, serves 5 to 10"), only when serves were never attempted;
      - "Found 10 serves · comparing 5–10" on the analysing screen;
      - the size refusal now speaks to a session as well as a serve;
      - README's "well inside the size the app accepts" is corrected, since the
        limit admits about 7 min of 1080p.
      Original plan:*
      - **What:** "Found 50 serves · compared 45–50" on the analysing screen
        and the report. Refusal copy that knows about sessions. README
        `:156` and `:1076` corrected.
      - *Proof:* render tests and the copy lint.
- [x] **L2.3 Sides are not strangers** · S. *Done (2026-10-09), without
      clustering. A pair past the 18% line is a hand-off only when its ground
      line did not move with its height; the slope for one body is camera
      height over stature (`SAME_BODY_SLOPE`). The six Bath serves at 4 m and
      5.75 m read 0.52 and are never flagged. Someone 20% shorter on the same
      spot is flagged. The plan said 15%, but the 18% line never caught that
      and was not moved. Original plan:*
      - **What:** the "someone else served" check runs within each position
        cluster, so a change of side no longer trips it.
      - *Proof:* `filmMocap` at 4 m and at 5.75 m is not flagged; a real 15%
        height difference still is.
- [x] **L2.4 Session intake and the plan sheet** · S.
      - *Delta (Oct 9):* done.
        - A clip's length is read from its metadata (`probe.ts`) before
          `run`, and a clip past 150 s opens the session screen, unrefused for
          size and never copied to the clip store.
        - Eight seeks on the file time the device; the plan offers a sample
          of 12 or every serve, priced in minutes, or unpriced and saying why.
        - Proof: `planChoices` and `costLeft` on fixed numbers; a 30-minute
          60 fps `moov` behind a 2 GB Blob-shaped file is read in 1.3 MB.
        - Run in Chromium on a 280-second WebM looped from the bench footage:
          priced at about 9 and 12 minutes. The scan found 14 serves, and the
          sample read 12. The page was hidden at serve 9, which paused it; it
          carried on without scanning again. Picking the file again opened the
          finished session.
        - Two departures, both recorded as limits:
          - a stop during the scan loses the scan, because only finished serves
            are checkpointed;
          - the estimate charges three full reads for pictures that L2.8 has
            not added yet, so it runs about a minute long.
      - **What:**
        - clips are routed by duration;
        - the session path skips `MAX_BYTES` and never copies the file to
          OPFS;
        - a calibration on the file itself gives the time estimate;
        - the player picks a sample of 12 or every serve.
      - *Proof:* the estimator on a fake clock, and a byte-built 30-minute
        60 fps `moov` parsed in under 32 MB. After L2.1.
      - *Progress (Oct 9):* the planner is in (`session/plan.ts`): the
        routing rule, the 5/2/5 sample, the cost in seeks and the per-seek
        calibration, all tested on a fake clock. The screens are not.
- [x] **L2.5 Checkpointed runner and session stores** · M.
      - *Delta (Oct 9):* done, wired through L2.4's screen.
        - The pause when the page is hidden was run in Chromium.
        - The pause when the phone runs hot uses Chrome's Compute Pressure at
          `critical` (`warmth.ts`), tested with a fake observer. Safari has
          no such signal, so there the reading runs on.
        - A wake lock is held while it reads.
        - `lineOf` moved to `line.ts` so the store adds nothing to the entry
          bundle. The entry bundle is 128.3 kB against a 130 kB budget; it was
          125.1 kB before L2.
      - *Progress (Oct 9):* the engine half is in.
        - `session/session.ts` holds the row and the line, about 1.2 kB a serve.
        - `session/runner.ts` saves after the scan and after every serve.
        - DB v4 adds a `practiceSessions` store, carried in the backup with
          newest-edit-wins.
        - Tested: a stop between serves and mid-serve; a resume that reads only
          what is left without scanning again; unreadable and refused serves
          become unclear lines; 120 serves make one 147 kB row that grows by at
          most 1,250 bytes a serve (with L2.7's fields).
        - The two pauses followed with L2.4's screens (above).
      - **What:**
        - one `ServeLine` row per serve, its frames dropped at once;
        - the run pauses when the page is hidden and resumes when the same
          file is matched;
        - a pause when the phone is warm;
        - new stores in DB v4, carried in the backup.
      - *Proof:*
        - the footprint does not grow with the number of serves;
        - `planResume` tests;
        - a fake-video sweep of 120 serves.
      - After L2.4.
- [x] **L2.6 The light read** · M.
      - *Delta (Oct 9):* measured, and the light read declined; the measuring
        fixed contact height instead.
        - At 16 fps, 54 of 312 noisy takes were refused (rig plus the six Bath
          serves from two placements, 24 seeds each).
        - At 20 fps none were refused, and seven readings held within one noise
          deviation of the 32 fps read. Drop depth (1.21), contact height
          (1.64) and toss-arm hold (3.30) did not.
        - Sessions read at 32 fps with the sweep's skips.
        - `frameRate.test.ts` pins the verdict and fails the day those three
          hold.
        - Contact height was read off the nearest sample. It is now the top of
          the reach between samples (`between.ts`), and its distance between
          32 and 50 fps fell from 1.58 to 0.68 deviations. Folded into
          `SCORING_VERSION` 5, unshipped.
        - KNOWN: contact in front still moves 2.47 deviations between 32 and
          50 fps, because the contact moment moves up to 12 ms.
      - *Original plan:*
      - **What:** only the readings that hold at 16 fps, within `NOISE_FLOOR`
        of the 32 fps read: toss placement from the hand, contact height,
        knee bend, tempo, landing.
      - *Proof:* noise ensembles on the rig and on Bath. After L2.5.
- [x] **L2.7 Session statistics and a basket verdict** · M.
      - *Delta (Oct 9):* done, in `session/stats.ts`.
        - Each line now keeps `past` (each named fault's miss, in floors) and
          the player's place across the picture (`scale.x`).
        - Seeded timelines of forty lines with the camera's noise:
          - steady sessions: a change found in 3 of 200, never split, never
            moved, never given a fault named on a fifth of serves;
          - a drop moved by three deviations: found in 100 of 100;
          - sides split cleanly from the guide and from behind in 50 of 50;
          - a knocked phone was placed at the right serve in 50 of 50.
        - Bath, as twelve baskets of 24 noisy takes: single takes named 4
          faults in 288; the baskets named none. A planted missing leg drive is
          the basket's.
        - Departure: the representative set is spread by score, not chosen to
          cover sides and segments as well.
      - **What, as data only:**
        - a robust spread;
        - side clusters and camera segments;
        - early against late, by D5.2's rule;
        - fault frequency ranked by `HIERARCHY`;
        - the representative 8.
      - **The verdict:** a fault is named for a basket by how often it appears
        and how far past its floor.
      - *Proof:*
        - seeded timelines with planted drift, a side change and a bump;
        - a null session says nothing;
        - the 40 Bath serves as one player's basket under `realiseReal` give
          fewer false positives than judging single serves.
      - After L2.6.
- [x] **L2.8 The session dashboard** · M.
      - *Delta (Oct 9):* done.
        - Seven of the nine sections from §5: the headline, the counts, 2–4
          fixes, a strip per serve for contact height and the toss, start
          against end, best and worst with contact stills, and since last
          session.
        - `?demo=session` added.
        - Serves per week now counts every serve a session found.
        - Proof: render tests at every stage; every sentence the dashboard can
          build passes `cueIssues` (that check caught one passive); a
          375×812 preview with no console errors.
        - Departures:
          - first and second serves, and bulk tagging, are left out, because a
            session has no tagging yet;
          - the counts leave out swings with no hit and time on camera, which
            need L2.9 and L2.10;
          - no serve from a session joins the report history.
        - The stills use the kept light reads plus the report's overlay, six
          seeks a serve. The plan's three full reads (600 seeks) are charged in
          full only when a pause dropped the kept analyses, so otherwise the
          estimate runs about a minute long.
        - The run moved out of `App.tsx` into `session/drive.ts` to keep
          the entry bundle at 128.5 kB.
      - **What:** the nine sections in `LEVEL-UP-REVIEW.md` §5, and
        `?demo=session`. Serves per week counts sessions, not reports.
      - *Proof:* render tests, the copy lint, and a 375×812 preview. After L2.7.
- [x] **L2.9 Hear the serves** · L.
      - *Delta (Oct 9):* done.
        - `audio/mp4Audio.ts` reads the AAC track's frames from the `moov`
          sample tables (ISO and QuickTime entries, `stco` and `co64`) and
          builds ADTS headers.
        - `audio/decode.ts` decodes twenty seconds at a time with WebCodecs,
          or as ADTS with `decodeAudioData`, carrying a second across each
          seam. A non-AAC file of up to 200 MB is decoded whole.
        - `audio/onsets.ts` finds impacts; `audio/fuse.ts` learns the
          offset and marks each peak heard or not. `classifyServes` uses it
          as the fourth agreement, only where the sound is believed.
        - Proof:
          - synthetic PCM: 6 of 6 impacts within 3 ms, with no bounces, steps
            or voices heard, and the same at three levels of hiss;
          - byte-built audio boxes;
          - fusion tests;
          - the session fixture with shadow serves: picture alone, 3 shadows
            called serves; with the sound, all 3 set aside, 30 of 30 serves
            kept, the offset learned within half a scan step;
          - a faint sound (3 serves in 10 heard) is not believed and loses
            nothing;
          - in Chromium, an AAC MP4 encoded from a synthetic court was heard
            10 of 10 with nothing extra, at 168× real time via WebCodecs and
            189× as ADTS; the bench's Wikimedia WebM decoded whole at 171× real
            time (111 impacts in 140 s).
        - Departure: impacts do not propose places to look. Refining around
          all 111 rally impacts took the bench scan from 132 s to 241 s, and
          the coarse pass already reads every serve's rise. Hearing adds about
          a second.
      - **What:**
        - read the audio sample tables and decode the audio in ADTS chunks;
        - detect onsets and fuse them with the reach peaks;
        - learn the audio-to-video offset rather than assume it;
        - use WebCodecs where present, and fall back to the visual scan.
      - *Proof:*
        - onsets found in synthetic PCM;
        - byte-built audio boxes;
        - a Commons clip decoded in the preview, with its speed recorded.
      - After L2.4.
- [x] **L2.10 Who is serving** · M.
      - *Delta (Oct 9):* done for three of the four agreements; the fourth, an
        impact heard, waits on L2.9.
        - The scan keeps the pose it already detected. `shapeAt` calls a peak
          serve-shaped when the other hand went above the head before it and
          the feet held under 0.6 body heights a second through the load.
        - The reach reference comes only from serve-shaped peaks. Others go to
          a not-sure list, stored and counted on the dashboard.
        - The shape is believed only with at least two shaped peaks that are
          also a majority of those judged, so a shaky or panning camera falls
          back to reach alone.
        - The player crop is placed per minute of a long clip.
        - Proof:
          - L2.1's KNOWN smash check flipped: 10 of 10 serves with the shape,
            3 of 10 on reach alone, kept as the reason;
          - 50 serves with 5 smashes: all found, no strays, all 5 smashes put
            aside;
          - a swaying camera keeps all 10;
          - plain sessions are unchanged;
          - `cropSegment` tests;
          - the bench's NCAA broadcast clip is read on reach alone with nothing
            put aside.
        - Departure: "still at the line" is measured as still feet, not as a
          place on the court. A smash hit standing still still counts as a
          serve.
        - Also: `Cancelled` and `looksLikeNonVideo` moved to
          `pose/errors.ts`, which took the extractor out of the entry bundle
          (129.4 to 124.9 kB).
      - **What:** a crop per segment, and a serve accepted only when four
        things agree:
        - the player is still at the line;
        - the tossing arm rises;
        - the reach peaks;
        - an impact is heard.
      - Anything else goes to a "not sure" list.
      - *Proof:* timelines with distractors. After L2.1 and L2.5.
- [x] **L2.11 Session highlights** · S.
      - *Delta (Oct 9):* done.
        - Highlights are `{number, kind, from, to}` stretches (2 s before the
          reach peak to 1 s after), saved when a session finishes. For older
          rows they are derived from the lines.
        - Picking the same file again finds the session and plays each pick
          from the player's own file, looping inside its stretch.
        - Proof:
          - range and stored-row tests;
          - file-identity tests (`fileKeyOf`);
          - a source scan showing nothing on the session path writes or loads
            the whole file;
          - render tests with and without the file;
          - played in Chromium on the 280 s clip.
        - Also fixed: a one-serve session was told "No fault showed on most of
          them". Under five serves read it now says there are too few.
      - **What:** the best 3 and worst 3 stored as mm:ss ranges and replayed
        when the same file is opened again. A multi-GB file is never copied.
      - *Proof:* `clipStore` and file-identity tests. After L2.8.
- [ ] **L2.12 Play-scan locate** · M, optional.
      - **What:** muted playback at 2–4× with frame callbacks instead of seeks,
        chosen per device from the calibration.
      - *Proof:* a fake-video logic test, and the frame rate measured in the
        preview.

### Wave L3 — A score that can show progress
On club serves, noise moves the headline number more than fixing a fault
does, and nothing marks a fault as fixed.

- [x] **L3.1 Calibrate "real change" on club serves** · S–M.
      - *Delta (Oct 9):* done.
        - `analysis/realChange.ts` holds a floor for every score comparison,
          and `realChange.test.ts` measures each one. The ensembles are:
          - the modal club serve;
          - ten club faults dialled one at a time (the "fault family");
          - the six Bath serves.
          Each serve is filmed 24 and 60 times, at 30 and 50 fps. A floor is
          one past the largest p90 drift of any single serve.
        - Like-for-like floors (both serves graded on the same rows):
          - overall 6;
          - toss 7, swing 6, loading 18, contact 21, rhythm 36;
          - form (3 serves against 2–3) 8;
          - the six-week milestone 9;
          - the basket gap 14;
          - best against worst 6–9, by basket size.
          The old line was 3 everywhere.
        - Read differently. The modal serve's takes straddle the drop collapse
          on 3 pairs in 5. Between serves graded on different rows, a change
          is soft up to 14 overall and 42 on the swing; past that, it counts.
          Other areas never flip in the ensembles, so a change there between
          serves read differently is always soft.
        - Gated:
          - the report hero and the area cards;
          - the Progress hero and its bars;
          - Home's form chip;
          - the milestone and the gap line;
          - best against worst, which now also needs the two serves graded
            alike;
          - the practice card's verdict, on per-row floors at 1–3 serves a
            side;
          - the glance. It has a new chip, and the spoken line says "about
            the same as your last serve". It compares against the same last
            serve as the report.
        - Soft is drawn as the neutral chip with "≈", captioned "measured
          differently from your last serve".
        - Proof:
          - the derivation: no serve shows a noise-only change as real more
            than one time in ten;
          - fixes still show: full reach (+9) and a held toss arm (+6) read as
            up, and the modal serve fixed outright reads as soft, never same;
          - render tests and progress tests;
          - the preview, at `?demo=glance-score`, `-same` and `-soft`.
        - Departures:
          - The worst single serve sets each floor, not a pooled population.
            Pooling let steady serves cover for a wobbly toss's own noise.
          - Row means do not shrink by √n. Scores pile up at 100 on the toss
            path, and leg drive takes few values. So the row floors are
            measured at 1–3 serves a side, and the 3-a-side floor holds past
            that.
          - The demo basket's worst serve is now a low reach rather than a
            high racket. A collapsed drop no longer pairs with a full one.
        - KNOWN:
          - The ensembles have no ball, so the ball rows take their area's
            floor.
          - Fixing the modal club serve outright (+13) is soft, because the
            collapse changes the rows. Until L3.4, the credit comes from the
            fault line.
          - The scale is still compressed: one fix moves the overall 6–9.
      - **What:** run ensembles on the weighted overall and on each area, for
        the modal club serve, the fault family and Bath. Set thresholds from
        the p90 drift. Gate on them every delta chip, the Progress hero and the
        spoken glance. A keyframe collapse that flips under noise is reported
        as soft.
      - *Proof:* the noise ensembles. After L1.1.
- [x] **L3.2 A trip score with a range** · M.
      - *Delta (Oct 17):* done.
        - `tripPoints` turns one serve type's history into trips: `tripsOf`'s
          visits, split where the rubric changed. Each carries its median, its
          low–high range and its serve count.
        - Headlines:
          - the Progress hero reads "71 · typical flat serve, Tuesday · your 5
            serves ran 66–75";
          - Home's form tile reads the same, compactly.
          - Both chips compare against the previous trip, and only when both
            trips had three serves or more (`MIN_TRIP_SERVES`).
        - The trend chart plots trip medians with a faint range bar, and the
          table lists trips with their serves and range.
        - The best record (`bestTrip`) and the six-week line both come from
          trips of three or more serves, median against median. The single
          first serve is no longer the "before".
        - The trip floor is measured (`REAL_CHANGE.trip`, 10). A trip median
          of three moves at most 9 on noise, against 10 for one serve, and it
          moves less than a single serve on every serve in the ensembles.
          This floor replaces the form floor and the milestone floor.
        - Proof:
          - progress, engine, robustness and comparisons tests on seeded trips;
          - the derivation in `realChange.test.ts`;
          - a render test of the range bars;
          - the preview of Home and Progress on `?demo=history`.
        - KNOWN: on the collapse-border serve, a median of three helps
          little (9 against 10), because the flips are bimodal. Bigger trips
          help more.
      - **What:** the headline becomes the trip median with its range, as in
        "Tuesday: 71, your serves ran 66–75". The trend plots trip medians,
        and the best and the six-week line come from trips of three or more
        serves.
      - *Proof:* seeded histories, and in the ensemble the trip median drifts
        less than a single serve. After L3.1.
- [x] **L3.3 A season ledger that outlives pruning** · S–M.
      - *Delta (Oct 17):* done.
        - `storage/ledger.ts` holds one row per trip (serve type and rubric),
          in DB v5's `tripLedger`. A row carries the median, the range, the
          area medians, how often each fault was named and the ladder steps.
          A busy row measures 373 bytes.
        - Rows are written:
          - by `saveSession`, after each save, reading only the reports within
            three days by the `createdAt` index;
          - by a quota prune, which folds every trip in before deleting
            anything, so older histories are covered;
          - by `deleteSession`, which rewrites the trip when its row knew
            exactly one serve more;
          - and `clearSessions` clears the ledger.
        - The merge rule is `sameVisit` plus "more serves wins": a pruned
          trip keeps the row that knew all of it.
        - Reports are no longer deleted by count. Stills stay on the newest
          20 and tracks on the newest 60, and past that a report is 11.3 kB
          of words and poses. Deletion happens only under quota pressure.
          A routine prune looks only `ROUTINE_BAND` (8) past each limit.
        - Readers of the ledger:
          - the trend (`tripPoints` via `withLedger`);
          - `bestTrip`;
          - the six-week line;
          - both streaks.
        - The backup carries `trips`. A restore merges them and folds in the
          restored reports' trips, and `ImportResult.pruned` counts the
          reports it lost, which the storage panel says.
        - Proof:
          - `planPrune` on 300 keys at every level;
          - `ledger.test.ts`: rows, the merge rule, normalising, a 90-serve
            season pruned to 25 that draws the same trips, best, six-week line
            and streaks, and backup round-trips;
          - the footprint test, which prices the horizon report and the
            ledger row;
          - a live IndexedDB probe in the preview: v5 upgrade, save, delete,
            clear.
        - KNOWN:
          - A trip chained across more than three days is recorded from the
            part read.
          - A serve deleted from an already-pruned trip keeps its place in
            that trip's median.
          - `listSummaries` still reads every report on open. A thousand
            serves is about 14 MB.
      - **What:** about 0.5 kB per trip in its own store and in the backup,
        with the ladder steps. Reports are capped by their stills, not by
        count. A restore returns how many it pruned.
      - *Proof:* `planPrune` with 300 synthetic reports, the footprint test, and
        a backup round-trip.
- [x] **L3.4 Graduation and re-test** · S–M.
      - *Delta (Oct 17):* done.
        - A fault graduates (`graduation.ts`) when, of its last 6 judged
          serves, at least the ladder's `pass` are clean, across two trips or
          more. `judgeServe` is `checkDrill`'s own rule. Graduation is
          worked out from the history each time, so a relapse undoes it.
        - The week plan (`weekPlan.ts`):
          - folds the last 12 plan-bearing reports, oldest first;
          - keeps each fault until it graduates, marked "Not seen on your
            last serve. Stay on this step until it holds across two trips.";
          - orders the plan by the hierarchy;
          - gives each fault fixed on the last two trips one line, e.g.
            "Racket drop: clean on 6 of your last 6 serves, over two trips.
            Next: the toss.";
          - asks for a re-check on the fourth trip after graduation, and
            every fourth after that, including while that trip is being
            played.
        - `checkDrill` now runs against `drilledFault`, the top of the plan
          before the report. The report shows that check under the fault's
          name, with its own move up, when it is no longer the top fix.
        - "Take this one to a coach" is said only from the top rung
          (`rungsLeft` 0) or for a row with no ladder. Below that the card
          says "Work through the rest of its ladder before you take it to a
          coach."
        - The settings and device-check sheets now load lazily. The entry
          was at 129.5 kB of its 130 budget and is now 125.7.
        - Proof: `weekPlan.test.ts` on seeded histories covers:
          - a kept fault, ordered by the hierarchy;
          - one trip not counting;
          - graduation and its line;
          - a relapse;
          - the third trip against the fourth, and the fourth while it is
            played;
          - the drilled fault and its passing basket;
          - the coach rule.
          Home was checked in the preview.
        - Departure: no stored state. Graduation, the carried plan and the
          re-check are all derived, so they cannot drift from the history.
      - **What:**
        - `checkDrill` runs against the fault being drilled;
        - a fixed fault gets one line, e.g. "Racket drop: clean on 5 of your
          last 6 serves, over two trips. Next: the toss.";
        - the week plan advances in hierarchy order;
        - a re-check every fourth trip;
        - "take it to a coach" only after a full rung cycle.
      - *Proof:* seeded histories and `weekPlan` tests. After L3.3.
- [x] **L3.5 The serve path** · M.
      - *Delta (Oct 17):* done.
        - `servePath.ts` gives each part of the hierarchy one of four states:
          not seen yet, working on (step k of n), holding (graduated), or
          locked in (holding for 4 trips or more). It reads `standing`
          (`graduation.ts`), so the path, the week plan and the graduation
          lines cannot disagree.
        - The headline is said in words: "5 of 7 parts holding." A relapse
          moves the part back and says so: "The racket drop has slipped back:
          the fault came back on 3 of your last 6 serves."
        - It is shown on Progress under the score, using the report's own
          tags.
        - Proof:
          - seeded diagnoses for every state;
          - a rig sequence with the drop turned on, off for two trips, and
            on again: working, then holding, then slipped back, while the
            rig's legs stay worked on throughout;
          - a render test;
          - the preview on `?demo=history`.
        - Departure: seven parts, not six. Every hierarchy group has a fault
          the engine names, the swing's timing included. Faults marked
          `notNamed` are left off.
        - Also: `progress.test.ts`'s history-walk timing now takes the best
          of five batches. It was reading 1.5–12× for 4× the reports on code
          nobody had changed, because the machine was loaded.
      - **What:** each of the six hierarchy groups is one of: not seen yet,
        working on (step k of n), holding, or locked in. The headline is said
        in words, e.g. "4 of 6 parts holding". A relapse moves a group back
        and says so plainly.
      - *Proof:* seeded diagnoses, rig sequences with a fault turned on and
        off, and a render test. After L3.4.
- [x] **L3.6 Attendance at the player's own cadence** · S.
      - *Delta (Oct 17):* done.
        - The cadence is inferred (`inferCadence`) from the median gap
          between the last 8 visits, or set in Settings (`CadencePicker`,
          `Prefs.cadence`). It reads as weekly up to 10 days, fortnightly up
          to 21, and monthly after that. It is weekly until there are three
          visits.
        - Counted forgivingly: a streak keeps across up to 9 / 18 / 38 days
          (`CADENCE_GAP_MS`), and the line says the pace, e.g. "6 trips to
          the court in a row, roughly every two weeks."
        - A visit is:
          - a trip of analysed reports;
          - a ledger trip whose reports were pruned;
          - or a practice session that read at least one serve.
          A session stopped before any serve was read does not count.
        - A stored cadence this build does not know is ignored.
        - Proof:
          - seeded fortnightly trips show a 6-trip streak that the old 9-day
            rule broke;
          - weekly, missed-week and monthly inference;
          - a set cadence wins;
          - a read and an unread practice session.
          The Settings picker was checked in the preview.
      - **What:** the cadence is inferred from the median gap between trips, or
        set in Settings. It is counted forgivingly, and only analysed trips
        count.
      - *Proof:* seeded fortnightly trips show a streak.
- [x] **L3.7 Sets from the player's own tags** · S–M.
      - *Delta (Oct 17):* done.
        - The glance offers "Start a set of 10" for first or for second
          serves, under the landing chips.
        - A set (`sets.ts`) counts the next ten serves whose landing was
          tapped, of its serve number or of none. Serves tagged as the other
          number do not count.
        - The aim is the player's own in-rate for that serve number (the
          newest 40 taps) over ten, plus one, at most ten. Below 5 taps there
          is no aim: the first set is "your mark to beat next time".
        - The running line counts as it goes. On the tenth landing the set
          moves into the records (`Prefs.sets`, newest 60), and the glance
          says, e.g., "Set of 10 first serves: 8 in. You reached your aim of
          7. Your best set of first serves yet." A shortfall is said as
          plainly.
        - Sets travel in the backup and merge by start time.
        - Proof:
          - tag fixtures for the aim, the serve numbers kept apart, what a
            set counts, records and the backup merge;
          - glance render tests;
          - the preview, starting and stopping a set.
      - **What:** "Start a set of 10" on the glance. The target is the
        player's own in-rate plus one. First and second serves are kept
        apart, and the best set is a record.
      - *Proof:* tag fixtures and a glance render test.
- [x] **L3.8 Personal bests as body positions** · S.
      - *Delta (Oct 17):* done.
        - `bests.ts` works per card row with a readout ladder and a measured
          camera noise. A best fires when the newest trip's median reading:
          - comes from 3 or more readings the card stood behind;
          - lands on a rung no earlier trip reached;
          - and sits closer to the band than every earlier trip by more than
            1.5 deviations of camera noise.
          It is said as the body position, e.g. 'Racket drop: first trip at
          "Hand below the shoulder".'
        - Shown in Progress's records and as one line on Home's form tile.
        - `CARD_NOISE_SD` moved to `analysis/cardNoise.ts`, re-exported from
          `consistency.ts`, so Home does not pull in the diagnosis.
        - Proof:
          - seeded readings: a first trip, a new rung, a rung reached before,
            a crossing inside the noise, moving away from the band,
            approximate readings, a trip of two;
          - the rig's drop from above the shoulder to below it, which also
            sets "Hand hangs under the elbow" (the same motion seen by a
            second row);
          - a Progress render.
        - Departure: the band decides the direction, not a target rung. A
          band can span two rungs, and its midpoint can fall a hair under a
          rung edge: the drop's band [-0.1, 0.3] reads "level with the
          shoulder" in floating point.
      - **What:** fires when a trip median crosses a readout rung and beats
        the old best by more than the noise floor, e.g. "first trip with a full
        racket drop".
      - *Proof:* seeded histories and the rig.
- [x] **L3.9 Say what the level does, and let it order the plan** · S.
      - *Delta (Oct 17):* done.
        - The picker now asks "Which faults should I point out?" and says
          "Your score is the same at every level". The report's line reads
          "Faults pointed out for club level, aiming one step above it".
        - `hierarchyFor(tier)`: at rung 4 and below (`ARM_FIRST_AT`), the
          drop group comes before the legs (Whiteside 2013, Reid 2008), and
          Kovacs's order holds above that. Triage, `causalPlan`, the week
          plan and the graduation lines all use it. The example report now
          reads drop, then legs.
        - The leg-drive floor is now 0.032, down from 0.10. That is a full
          extension with no jump from 35° of knee bend, the floor of
          `kneeBend`'s band. The sweep of `contactHipHeight` against
          `trophyKneeAngle`:
          - 133° rises 0.0435 and was named on every take;
          - 145° rises 0.032 ± 0.006;
          - 170° rises 0.0086.
          In the ensemble a full extension with no jump is named on 10% of
          takes or fewer, while straight planted legs and legs still bent at
          contact are named on 80% or more. The card has a new "Legs
          straighten up" rung, and the in-band line says "straighten up"
          rather than "drive up hard".
        - Knock-ons:
          - the demo serve is now planted on straight legs, so it still
            names its legs;
          - the demo basket's worst reach is 0.97;
          - `realChange` re-derived: loading 17, the basket gap 13, leg-drive
            rows [6, 4, 4];
          - the trip-against-one-serve check is ≤ per serve (Bath 3 ties at
            4) and < on the worst.
        - Proof:
          - a plan-order check at rungs 2–8 and on the two orders;
          - the floor sweep, now a test in `depth.test.ts`;
          - the leg detector's rates;
          - copy claims re-stamped;
          - the preview of the example report.
        - KNOWN: a club player with barely bent knees who still pushes a
          little (170° at the rig's default hips, 0.016–0.032) is not named
          for the legs. `kneeBend`'s card row still flags the shallow load.
      - **What:**
        - the legend asks "Which faults should I point out?" and says "Your
          score is the same at every level";
        - at rung 4 and below, the arm action comes before the legs;
        - the leg-drive floor is re-derived against a full extension with no
          jump, by sweeping `contactHipHeight` against `trophyKneeAngle`.
      - *Proof:* a `jsxCopy` test and a plan-order check per rung.
- [x] **L3.10 Why this score** · S.
      - *Delta (Oct 17):* done.
        - `analysis/breakdown.ts` reads each measured area off the score's
          own sums:
          - its share of the overall, among the areas measured;
          - its points (score × share);
          - the weakest row and how far `chainScore`'s weakest-link term
            pulled the area down;
          - the rows this clip could not grade;
          - the rows graded only approximately.
        - A folded "Why this score" opens under each card's blurb, one short
          sentence a line, e.g. "Counts for about a fifth of your overall. /
          Tossing arm timing, at 47, pulled this area down 9 points. / Not
          graded on this clip: Toss height."
        - Shares are said as fractions in words, because the copy lint keeps
          raw percentages off the screen.
        - Proof:
          - the contributions sum to the overall on five demo serves,
            including one with an unmeasured area;
          - the pull matches the weakest-link term on a worked example;
          - dropped and approximate rows are named;
          - every line passes `cueIssues`;
          - the preview of the example report.
      - **What:** a folded line per area giving its weight, how far the weakest
        row pulled it down, and which rows were dropped or approximate.
      - *Proof:* the contributions sum to the overall; the copy lint.
- [x] **L3.11 Re-score in place when only the bands move** · M.
      - *Delta (Oct 17):* done.
        - `SCORING_KINDS` (types.ts) classes every bump as `card-bands` or
          `measurement`:
          - 2 and 3 moved only the curve and the bands;
          - 4 and 5 changed measurements.
          `rescorable(from)` holds when every bump since was `card-bands`.
        - `rescoreStoredCard` (metrics.ts) rebuilds each stored row from its
          value against today's bands. It keeps the row's confidence,
          softness and axis, and a "Racket never falls" override. It then
          sums the area and the overall the way `measure` does.
        - `useHistory` runs `rescoreStoredSession` (a lazy chunk, 0.4 kB) on
          the reports that qualify, once per load, and re-reads the list.
        - Proof:
          - with a table where the last bump was band-only, a v4 report of
            three demo serves re-scored equals a fresh v5 score, row by row
            and overall;
          - the never-fell drop survives;
          - the re-scored history has no break.
          On the real table a v4 report is not re-scored, and every version
          must be classed.
        - Today nothing qualifies, because v4→v5 changed measurements. The
          machinery is for the next band-only bump.
      - **What:** a scoring-version bump is classed as band-only or as a
        measurement change. A band-only bump re-scores the stored values
        instead of starting a new era.
      - *Proof:* a v4 history re-scored equals a fresh v5 score.
- [x] **L3.12 Serve profile and the graduation card** · M.
      - *Delta (Oct 17):* done.
        - `serveProfile.ts` gives the newest trip's median on eleven rows,
          said only as the readout's body position. It has no status, colour
          or target, and a row needs half the trip's serves to have a reading.
          On Progress it reads "How you served, Tuesday".
        - `graduationCard.ts` builds each recent graduation from the keyframe
          poses every report keeps, at the moment the fault is judged:
          - the newest serve before the fix that showed the fault;
          - the newest serve since that was clean on it.
          `renderGraduationCard` draws "FIXED", the fault, its line, and the
          two figures at one shared scale with their dates.
        - Progress offers "Share: Racket drop fixed" under the serve path. It
          is the only way the card leaves the phone.
        - Proof:
          - five rig dial sets give five distinct profiles;
          - profiles carry words, not grades;
          - the card picks its two halves on the right sides of the fix and
            refuses a history with no poses;
          - a recording-canvas render test (heading, line, both dates,
            figures stroked);
          - a Progress render;
          - the card drawn on a real canvas in the preview.
        - Departure: figures, not photographs. The stills survive on the
          newest 20 reports only, and the "then" is usually older than that.
          Shared cards have so far carried no images of the person except the
          single-report card.
      - **What:** an ungraded "how you serve" card per trip. When a fault is
        retired, its then-and-now pair becomes a share image. Nothing leaves
        the device except through the share button.
      - *Proof:* distinct rig dials give distinct profiles; a render test for
        the share card.

### Wave L4 — See what good looks like
Everything here is built from `primitives.tsx` and the existing tokens.

- [x] **L4.1 A shorter report** · M.
      - *Delta (Oct 17):* done.
        - The report now reads: the hero, the serve picker, the one fix with
          its plan, the season focus, the video, and the six moments. Then
          one `<details>` titled "More about this clip".
        - The fold holds, in this order: the "Score all serves" button and
          the basket, the toss map, the notes, how the clip was read, tagging,
          every area, and the firing order.
        - It starts closed. It opens by itself when a basket arrives while
          the report is on screen, because the player has just asked for it.
          A reopened basket report starts closed like any other.
        - Proof:
          - a render test checks the DOM order, hero through areas;
          - the same test checks that everything after the six moments sits
            inside the fold, and that the fold starts closed;
          - the basket demo was previewed at 375×812, closed and open, with
            the chevron turning and no console errors.
      - **What:** hero → focus → plan → video and six moments → one folded
        "More about this clip". The folded part holds the basket, toss map, how
        the clip was read, tagging, areas and firing order.
      - *Proof:* a DOM-order render test and a preview at 375×812.
- [x] **L4.2 A ladder that starts where the player is** · S.
      - *Delta (Oct 17):* done.
        - `startingRung` picks the start from the engine's own severity:
          high → step 1, medium → step 2, low → step 3. It never starts on
          the last step, which is the match. A moved rung still wins.
        - The plan's drill (`focusFor`) is now that rung of the fault's ladder.
          It is no longer `FLAW_DRILL`'s fixed drill, which had started a
          serious tray on step 4 of 5.
        - The season card and the serve path start from the newest report
          that named the fault (`lastSeverity`), so they show the step that
          report's plan showed. With no grade, a ladder starts where a medium
          fault does.
        - Every rung is a `Step`: a drill plus a `StepCheck`.
          - `engine` means a served ball: film a basket of six.
          - `self` means a toss, a throw, a swing with no ball, or a seated or
            racket-up serve. These carry a bar the player can see.
          - That makes 27 app-checked steps and 16 self-checked ones. The last
            step is always the app's.
        - On the report:
          - the feel cue sits under the drill, unfolded;
          - the step says how it is passed;
          - a self-checked step offers "I can do this" to move up;
          - the folded ladder tags each step "film it to check" or "check it
            yourself";
          - plan items 2–4 are closed `<details>` that open to the how and
            the check.
        - The week plan prints each step's own check.
        - Proof:
          - every ladder maps high/medium/low to rungs 1/2/3 in order;
          - a seeded severity gives that rung in `causalPlan`, and
            `drillForMetric` agrees;
          - `@ts-expect-error` on a step with no check is the type-level
            proof, and a runtime walk covers every ladder and axis: served
            reps go to the app, the rest to the player, every bar passes the
            copy lint;
          - render tests cover the feel unfolded, the check line and button,
            and later fixes folded with their how;
          - the injury demo was previewed at 375×812, with the self-pass
            moving to step 2 of 5.
        - `stepOf` now matches by name, since wrapped and stored drills are
          different objects.
      - **What:**
        - the starting rung comes from the fault's severity;
        - each step declares an engine check or a self-check;
        - the feel cue is shown unfolded;
        - plan items 2–4 expand to show how.
      - *Proof:* seeded severities map to rungs, type-level totality over
        checks, and render tests.
- [x] **L4.3 A model serve to watch** · S.
      - *Delta (Oct 17):* done.
        - The fault demo's player is now `RigPlayer`: one body or several on
          one clock, with play/pause, optional speeds, the six moment pills,
          and `PHASE_COPY`'s checkpoint caption for the active moment. It has
          an optional redraw cap.
        - `modelServe(racket)` builds the clean serve, the same
          `CLEAN_SERVE` every fault demo draws its fix from.
        - `ModelServe` loads it on mount, in a 2.3 kB chunk shared with the
          fault demos.
        - Where it shows:
          - in the filming guide, as a closed "Watch a model serve" that
            mounts the player only once opened;
          - on the analysing screen, under the status and the cancel button.
            This copy has no speeds and draws at most 15 times a second, so
            it takes no frames from pose estimation. It is lazy, so the entry
            grows by 0.1 kB;
          - on the example report, between the six moments and the fold.
        - Each copy uses the player's own hand.
        - Proof:
          - a render test checks that the model is the demos' fix, with six
            pills in order, a checkpoint caption, a pause control, and a quiet
            variant;
          - the same test finds it closed in the guide, under the progress bar
            while analysing, and on the example but not on a player's own
            report;
          - all three were previewed at 375×812. A real clip analysed in 36 s
            with the model looping, and no new console errors.
      - **What:** the clean rig serve looped with the moment pills and the
        checkpoint captions, in the guide, on the analysing screen and in the
        example.
      - *Proof:* a render test.
- [x] **L4.4 A figure worth looking at** · M.
      - *Delta (Oct 17):* done.
        - Every body already went through `drawSkeleton`: the stills, the
          players, the share cards and the rig players. L4.4 made that one
          renderer better rather than merging renderers.
        - Limb weight:
          - each bone is a tapered band, heavier at the joint nearer the
            trunk, with a faint torso area;
          - the racket arm is a step heavier than the tossing arm;
          - each colour is one filled path, so a joint is never painted
            twice, and every shape winds one way, so no joint is punched out;
          - the joint dots stay.
        - The racket:
          - the rig places one on every frame (`Frame.racket`). It is turned
            off the forearm towards down-and-back by a lay-back that rides a
            track through the serve, and the drop value is the new dial
            `racketLayBack` (default 80°);
          - it is drawing-only: a test checks that no landmark moves with the
            dial;
          - it is mirrored with the hand, and a tracked frame still has its
            racket estimated from the hand.
        - The ball: `rigStrikeFlight` throws it from the tossing hand at its
          top to the middle of the strings at contact, under gravity at the
          rig's scale. Every model serve carries one. `ballMarkerAt` moved
          beside the flight it reads, so the model player does not pull in
          the analysis pipeline.
        - The fault and its target:
          - `work` paints the named bones in `--work`, at their own weight;
          - `target` strokes the fix's same bones dashed, under the body,
            hung from the fault's own joint, and resets the dash afterwards;
          - each demo now names the limb its dial moves (`DemoLimb`).
        - The player box fits the racket but not the ball, which rises out of
          the top as it does in footage. Fitted to the apex, the bodies shrank
          by a third.
        - Proof: `figure.test.ts` (11 checks) covers:
          - the thigh's taper and the arm weights;
          - one fill per ink and one winding;
          - the dots;
          - the rig racket drawn where placed, and none invented for a tracked
            frame;
          - the dial turning the racket 30° more at the drop and under 3° at
            contact;
          - the mirror;
          - the ball meeting the strings;
          - work ink only when asked, and the dashed target under the body;
          - the demo limb on both hands.
          Preview stills cover the model's six moments, the tray demo at the
          trophy, and the example's stills.
        - Left as it was:
          - `TargetShape` is still its own SVG. It draws one joint's two
            segments, not a body.
          - The stored-pose stills still draw no racket, because they keep no
            hand sequence to estimate one from.
      - **What:** one renderer for every model and skeleton, with:
        - limb weight and joint dots;
        - a racket from the forearm, with a rig lay-back dial;
        - the ball's flight;
        - the wrong segment in `--work`;
        - the target dashed.
      - *Proof:* drawing tests and preview stills. Unlocks L4.5 and L4.6.
- [x] **L4.5 Show me for the faults players get** · M.
      - *Delta (Oct 17):* done. Seven faults now have a demo; four are new.
        - Shallow drop: the hand is left high and the racket held up, using a
          new negative `racketLayBack` that turns the head to the sky. At the
          clean drop the two racket heads are 0.68 body heights apart.
        - Toss height: a toss that goes too high, 2.45 statures against the
          model's 1.8. The balls are 0.76 apart at the trophy, and the stage
          fits the ball when the ball is the part to watch.
        - Toss drift: the tossing hand wanders 0.2 m on its way up. The hands
          are 0.13 apart at the toss.
        - The legs: straight at the trophy, with no rise to contact.
          - No single instant is a tenth apart on matched hips, because the
            fault is the hips' travel.
          - Its measure is therefore that travel, trophy to contact, in the
            fixed camera's picture height: 0.117 apart.
          - Measured against the ankles it read 0.04, because a clean serve
            leaves the ground.
        - Each demo names one part to watch: the racket head, the hitting
          elbow, the tossing hand, the ball or the hips.
          - The panel says "Watch the racket head."
          - `highlightOf` paints that part in `--work` on the faulty body and
            hangs the fix's own version from the point the part moves from,
            dashed and drawn over the body (`targetOver`).
          - For the hips, the dashed version keeps its own height, because
            the rise is the fault.
        - Drawn balls:
          - `rigStrikeFlight` is now built around a chosen apex (default 1.8,
            inside the toss band [1.38, 2.1]). The ball rides the tossing hand,
            leaves where the hand meets its arc (0.018 body heights from the
            wrist), and falls into the strings;
          - the L4.4 ball peaked at 2.21, which would have read as a too-high
            toss;
          - the engine now diagnoses each demo with the ball the picture
            draws.
        - The player's moment pills come from the clean serve's keyframes. A
          racket that never falls has its drop found at the trophy, and
          parking there showed two identical bodies.
        - Proof: in `faultDemo.test` (25 checks), on both hands:
          - each demo is named on the fault and not on the fix, read with the
            drawn ball;
          - the part it names is the widest difference among landmarks,
            racket head and ball, and at least `DEMO_MIN_DIFFERENCE` (the hips
            by their travel);
          - every demo paints something and dashes a target.
          `figure.test` adds a check for the target drawn on top. Preview: a
          grid of all seven at their moments, and the shallow drop in the app.
        - Not shown, with the measurements in `faultDemoDials.ts`: arming
          the ball, early shoulder rotation and the sideways posture
          collapse.
      - **What:** shallow drop, toss height, toss drift and the legs. The
        landmark that differs is highlighted and named.
      - *Proof:* in `faultDemo.test`, the difference is at least
        `DEMO_MIN_DIFFERENCE` and the engine names the fault on exactly one of
        the pair. After L4.4.
- [x] **L4.6 Your frame beside the model's** · M.
      - *Delta (Oct 17):* done.
        - `lookFor.ts` holds three things:
          - `LOOK_FOR`, a line per moment saying what to check;
          - `momentChecks`, the confident readouts measured at a moment, at
            most three, off target first;
          - `momentMark`, which ticks a moment when every confident reading
            at it is inside its band and crosses it when one is not. Hedged
            readings never count, and a moment with no reading gets no mark.
        - `faultMoment` finds where the top fault shows: the moment its own
          card row is read.
        - `MomentPair` sits in the top fix, under its reason:
          - "Your racket drop beside the model's" shows the player's tracked
            body and the clean model at that moment;
          - both are fitted to the same box by their own extent
            (`fitBody`), so they are one size whatever the filming distance;
          - the model is mirrored for a left-hander and holds its racket and
            ball;
          - under them sit two or three readouts, each ticked or crossed;
          - it draws nothing for a report that kept no poses.
        - The six moments' captions are now the look-for lines, each led by
          its tick or cross, with screen-reader words.
        - `modelFrameAt` lives in `demoDraw.ts`, beside the other light
          helpers.
        - Proof (`lookFor.test.ts`, 7 checks):
          - across 6 sample reports, every mark equals band membership
            recomputed from the rows (10 ticks and 14 crosses);
          - every check is from its own moment, banded and trusted;
          - the example's drop shows at the drop;
          - the look-for copy passes the lint;
          - a left-handed model swings with the left hand and holds a racket;
          - render checks cover the pair, its absence with no poses, and its
            place in the top fix;
          - the strip carries one mark per moment with a reading;
          - the example was previewed at 375×812.
        - Departure: both halves are drawn bodies, never the photograph
          beside a figure. A photo and a drawing at two scales would make the
          difference look like the camera.
      - **What:** at the focus fault's moment, and later all six, the player's
        still sits beside the clean serve's, scaled and mirrored for the hand,
        with 2–3 ticks from the readouts. The six moments' captions become
        "what to look for", each with a tick or a cross.
      - *Proof:* the ticks equal band membership; a left-handed mirror test.
        After L4.4.
- [x] **L4.7 Targets on the toss map, in foot-lengths** · S.
      - *Delta (Oct 17):* done.
        - The band is re-derived on Bath, not cited. The published figures
          are for contact, measured from the toe (0.28–0.37 of height). This
          reading is the top of the toss, from the ankle, and from the hand
          wherever no ball was tracked, which is every Bath serve.
        - `TOSS_TARGET` in `tossPlacement.ts`, each band with its `motion`
          footing:
          - in front: 0 to 0.3 statures, from over the front foot to two
            foot-lengths. Bath reads 0.04–0.16 from the side at 30 and 60 fps;
          - across: −0.075 to 0.15, from half a foot-length to the tossing
            side to one foot-length to the hitting side. Bath reads −0.004 to
            0.072 from behind and from in front.
        - The rig's toss, dialled off line, falls outside both bands:
          - 0.2 m behind reads −0.12, and 0.9 m in front reads 0.52;
          - 0.2 m to the tossing side reads −0.14, and 0.4 m to the hitting
            side reads 0.20.
        - The clean rig toss reads inside both.
        - On the map:
          - a dashed, faint zone sits under the marks;
          - under the strip: "Aim inside the dashed band: over your front
            foot to two foot-lengths in front. 3 of 4 tosses peaked there."
        - The reading stays in `UNCALIBRATED`. The band is a picture of where
          to aim, and no fault is named from it.
        - Proof: `tossTarget.test.ts` (5 checks) covers Bath inside on both
          axes, the rig's drift outside with the clean toss inside, the map's
          count and copy, and the band drawn. The basket demo was previewed at
          375×812.
      - **What:** a target band from the cited contact-in-front figures, or
        re-derived on Bath under D2.1's rule.
      - *Proof:* a bands test: Bath inside, the rig's drift outside.
- [x] **L4.8 The ghost that stays** · S.
      - *Delta (Oct 17):* done.
        - The bug: when the ball is followed to the racket, the card swaps
          the hand's contact height for the ball's (`ballContactHeight`). The
          contact ghost was looking for the hand's row, so AIM FOR vanished on
          exactly the clips the app read best.
        - The fix: `HEIGHT_TARGETS.contact` names a `ballMetric`. When that
          row exists and the ball's position is passed in, `ghostFor`
          measures from the ball, against the ball's band, and wears its
          target phrase. The plate still hangs off the hand.
        - `ballInFrame` gives the ball in landmark space, and both callers
          pass it: the stills in `analyze.ts` and `PosePlayer`.
        - The best serve on a live report: `PosePlayer` takes the same
          `TrackPair` the replay draws.
          - It runs on the video's clock, with the contact as the shared
            zero.
          - It is never drawn on a frame that has an AIM FOR target, and
            never on a roll-corrected clip.
          - The report says what the dashed body is under the video too.
        - Proof:
          - a `stillEvidence` check with a tracked ball and the pipeline's
            own contact read: a low contact keeps its AIM FOR, the ghost is
            measured from the ball, and it wears the ball row's target;
          - a render check: a live report with a pairable best serve says so,
            and one without promises nothing;
          - preview: a real clip analysed twice (two files, one camera) shows
            the note under the live video.
      - **What:** AIM FOR uses the ball's contact height when the ball was
        tracked. The best-serve ghost also shows on a live report.
      - *Proof:* a `stillEvidence` test with a tracked ball.
- [x] **L4.9 Progress as a dashboard** · M.
      - *Delta (Oct 17):* done.
        - `ProgressTiles` is four tiles in the first screen, two by two:
          - the typical serve on the latest trip, with its day, its range and
            its trip-on-trip chip;
          - records: the best trip and the count of body bests;
          - the serve path: "5/7 parts holding" with a dot per part in its
            state's colour;
          - a sparkline of the last ten trips.
          The last three are buttons that scroll to their sections, and the
          form tile stays a fact.
        - Then and now (`FramePair oneAtATime`): pills choose the moment and
          one pair gets the room. The basket comparison still shows all six.
        - Repeatability: a longer bar is now steadier, the room left before
          the widest gap plus a margin (`steadyWidth`). The note says "Longer
          is steadier".
        - One share button (`ProgressShare`): "Share your progress" opens
          onto the season card, this trip, and each fault fixed lately. Each
          card leaves only on its own tap, and the old rules for when a card
          is offered still hold.
        - Proof: `progressDashboard.test.ts` (4 checks) covers:
          - the tiles before every section, with the trip median, the path
            count and one dot per part, and each door's target present;
          - one moment with a pill for each, while the basket comparison is
            unchanged;
          - bars that grow as the gap closes, rendered newest first;
          - exactly one share button with the cards inside.
          Preview of the seeded history at 375×812: tiles, share menu,
          then-and-now, and bars at 80, 78 and 64%.
      - **What:**
        - tiles for form (trip median and range), records, the serve path and
          the chart;
        - then-and-now one moment at a time;
        - repeatability drawn so that a longer bar means steadier;
        - one share button.
      - *Proof:* render tests and preview screenshots. After L3.2 and L3.5.
- [x] **L4.10 Home that knows the player** · S.
      - *Delta (Oct 17):* done.
        - Once there is history, the pitch ("World-class eyes on your serve")
          shrinks to one line, "Your next serve".
        - The form card moved up to sit straight after This week, above the
          help straps a returning player has already read. A new player sees
          the full hero and the example strap as before.
        - Proof:
          - a render test with seeded history checks the compact hero, then
            This week, then the form, then the straps, and that an empty
            history keeps the full pitch;
          - at 375×812 the seeded history shows the hero at 92 px, This week
            at 310 and the form card at 616, all in the first screen. On a
            phone, "Record now" adds about 67 px and the form still starts
            near 683.
      - **What:** once there is history, a compact hero, with This week and
        the player's form in the first viewport.
      - *Proof:* a render test with seeded history, and the preview.
- [x] **L4.11 Words in the chrome** · S.
      - *Delta (Oct 17):* done.
        - Defined on a tap: `glossary.ts` holds one linted sentence each for
          trophy, racket drop, stance and firing order. `Term` makes the word
          itself the control, dotted underneath with `aria-expanded`, and the
          meaning opens under it until the next tap anywhere. On the report it
          appears in three places:
          - a "Tap a word" row under the six moments, for trophy and racket
            drop;
          - the stance chip;
          - the firing-order heading.
        - "Hip–shoulder separation" is now "Shoulders turned past the hips".
        - One narrator: the coach says "I". The voice lint has a `NARRATOR`
          rule, and "we", "our" and "us" now fail every linted line. The two
          that remained were changed: "Every area I scored", and "since the
          scoring changed". "The app" stays only where a line means the
          program itself, such as an older version or the app going to the
          background. The model serve's note no longer calls the drawing the
          app's.
        - The type floor: 20 declarations under 11 px went to 11, covering
          kickers, tags, compact chips, chart axes, table heads and the
          target-shape keys.
        - Proof: `wordsInChrome.test.ts` (7 checks) covers:
          - every meaning passes the copy rules;
          - a term is a closed disclosure;
          - all four terms are reachable on a 60 fps report;
          - the rename;
          - the narrator rule, plus a scan of every string in every component
            for "we", "our" and "us";
          - a CSS floor over all 12 stylesheets, with nothing under 11 px.
          Preview: the Trophy meaning open under the six moments at 375×812.
        - Left as it was: the on-image callouts size their own canvas text
          with the picture, so the stylesheet floor does not reach them.
      - **What:**
        - trophy, racket drop, stance and firing order are defined on a tap;
        - "Hip–shoulder separation" is renamed;
        - the app speaks with one narrator voice;
        - no text a player must read is under about 11 px.
      - *Proof:* a `jsxCopy` test and a CSS floor check.

### Wave L5 — Engine depth for the club serve

- [x] **L5.1 Sources for the diagnosis ladders** · M.
      - *Delta (Oct 17):* done.
        - Every `SignalSpec` now carries a compulsory `source`, one of:
          - `card`: the signal reads a card row's number against that row's
            band;
          - `study`: published, with a year;
          - `motion`: re-derived on Bath with a rig fault;
          - `unnamed`: no fault is named from it.
        - Sources by signal:
          - card: separation, drop, legs, contact, toss peak, and now toss
            drift;
          - study: chest-open (Fleisig 2003, Newton 2025);
          - motion: tray, posture and collapsed elbow;
          - unnamed: hip lead and pronation, whose faults are already never
            named.
        - None needed `UNCALIBRATED`.
        - The three motion bands stand without moving, under the engine's own
          naming rule. Bath sits inside the club (rung-5) band, nothing on Bath
          is named even at rung 9, the rig's fault is named at rung 3, and the
          clean rig is named at no rung.
          - Tray: Bath 21–35°; the rig's tray reads 74.
          - Posture: Bath 8–18° from behind and in front; the rig's 40° lean
            reads 39.
          - Elbow: Bath −0.002 to 0.079; the rig's back scratch reads −0.144.
        - Toss drift and toss path are judged as one:
          - both now call `tossPathSpread` (the spread of the hand's path, in
            percent of height). The diagnosis used to read the worst single
            point of the same window;
          - drift reads the card's band ([0, 3] %), pairs with
            `tossPathWobble` in `CARD_SIGNAL`, and gains a `pct` unit, so the
            "one serve, judged once" test holds it to the card's number;
          - its noise floor was re-derived on the new scale: the rig moves 0.143
            and Bath 0.128, so 0.22.
        - Fixtures moved because a smaller wobble now sits inside the card's
          band:
          - the posture-attribution fixture: 0.09 to 0.15 m;
          - the cause-before-symptom fixture: 0.15 to 0.2 m;
          - the toss-outranks-swing fixture: 0.09 to 0.15 m;
          - the climbing-band check now rides the palm, with drift among the
            flat bands.
        - Proof: two checks in `bands.test.ts`.
          - Every signal names its footing: card pairs read the card's band at
            every rung, studies name a year, motion signals have a rig fault,
            and `unnamed` feeds only unnamed faults. A signal without a source
            fails the type and the check.
          - The motion bands hold Bath in and the rig fault out, at 30 and
            60 fps, from every view each is read from.
      - **What:** D2.1's rule and `bands.test.ts` are extended to the
        diagnosis. Tray, posture, toss drift and collapsed elbow are each
        cited, re-derived on Bath with a rig fault, or moved to
        `UNCALIBRATED`. Toss drift and the card's toss path are judged as one.
      - *Proof:* the extended test fails on any graded signal without a
        source.
- [ ] **L5.2 A second witness for the tray** · M.
      - **What:** shoulder abduction during cocking under about 70°
        (Touzard 2019) is required beside palm-to-sky.
      - *Proof:* the rig's arm-lay-over and palm dials; none of the 40 Bath
        serves is named. After L5.1.
- [ ] **L5.3 Contact behind the head, named** · S–M.
      - **What:** `contact_behind` in the toss group, from the cited
        contact-in-front band, with toss placement as its cause. Side view
        only, and the kick's floor is 0.
      - *Proof:* the rig's contact and ball offsets; Bath reads 15–34, inside
        the band.
- [ ] **L5.4 Tossing arm, named** · S.
      - **What:** `tossArmHold` is promoted into the toss group.
      - *Proof:* the rig's dropped-arm dial; Bath reads 72–79%.
- [ ] **L5.5 A camera that stays still, or says it didn't** · M.
      - **What:** a vertical-tilt dial on the rig. Drift in the ground line and
        in apparent size between the ready and contact is detected, and any
        reading built on image height is hedged when the camera moved.
      - *Proof:* the zoom KNOWN check flips from wrong to hedged.
- [ ] **L5.6 The ball's height from its fall** · S.
      - **What:** Δh = ½g·t² from apex to contact, which needs no scale and
        has no perspective.
      - *Proof:* the rig ball at every placement; the five Bath placements
        agree within the noise floor.
- [ ] **L5.7 Falling back, signed** · S–M.
      - **What:** the landing is signed by the swing's net direction. Falling
        backwards is an `UNCALIBRATED` reading first.
      - *Proof:* a negative `landingLean` on the rig; every Bath serve lands
        forward.
- [ ] **L5.8 The second serve that slows down** · M.
      - **What:** with tagged first and second serves, compare drop-to-contact
        time. Say so when the second is slower past the noise bound
        (Chow 2003, Sheets 2011).
      - *Proof:* the rig's tempo dials, with the bound from `realiseReal`.
        After L2.7, or a tagged basket.
- [ ] **L5.9 Noise that behaves like a tracker** · M.
      - **What:** fit drift and left/right swaps from MediaPipe's disagreement
        with RTMPose on the bench, then re-run every floor. This closes
        `ANALYSIS-REVIEW.md` Tier 1.8.
      - *Proof:* the floor table, before and after.
- [ ] **L5.10 The ball pass in sweeps** · S–M.
      - **What:** sweeps keep the ball pass, so `checkDrill` can judge toss
        height in a basket and session full reads keep the ball.
      - *Proof:* the sweep harness with a rig ball, and the footprint test.
- [ ] **L5.11 Benchmark the racket box** · M.
      - **What:** score EfficientDet against COCO's racket boxes. Only if it
        holds up, use the racket head under the shoulder as a witness for the
        drop.
      - *Proof:* the `/bench.html` table.
- [ ] **L5.12 The 60 fps hint** · S.
      - **What:** until D1.2 is wired, the too-few-frames refusal recommends
        slow motion only.
      - *Proof:* a copy test.

### Wave L6 — Field reliability

- [ ] **L6.1 One honest download** · M.
      - **What:**
        - a build-time manifest of every engine file;
        - one "x of 57 MB" bar across all of them;
        - a stall timeout that rejects and clears `pending`;
        - a warning on saveData or a cellular connection.
      - *Proof:* fake streaming fetches, a fetch that never resolves, and fake
        timers.
- [ ] **L6.2 Offline errors that say so** · S.
      - **What:** a failed engine load gets its own hints instead of
        video-format advice. Home's footer follows `offlineReady`.
      - *Proof:* a failure-classification test, and a Home render with
        `offlineReady=false`.
- [ ] **L6.3 Record at the camera's best** · M.
      - **What:** the recording constraints come from a pure function (1080p
        ideal, 60 fps ideal). `getSettings()` is stamped on the analysis and
        into `?check`.
      - *Proof:* a constraints test and a fake-MediaStream recorder test.
- [ ] **L6.4 Interruptions** · S–M.
      - **What:**
        - `useWakeLock` returns its status, and a refused lock shows one line;
        - an interrupted analysis leaves a marker in `sessionStorage`, read on
          the next load;
        - seeks wait for the page to be visible again instead of timing out.
      - *Proof:* render tests, and extract tests with a fake
        `document.hidden`.
- [ ] **L6.5 iOS storage safety** · S–M.
      - **What:**
        - after the first save on iOS Safari: "Export, add to Home Screen,
          then restore";
        - an installed app with no history offers a restore;
        - `lastExportedAt` is stored, with a reminder after N serves.
      - *Proof:* render tests with `isIOS` and `isInstalled` stubbed.
- [ ] **L6.6 An engine cache that follows the version** · S.
      - **What:** the cache name comes through a Vite define, the readiness
        check looks in that cache only, and older engine caches are deleted.
      - *Proof:* a fake CacheStorage test.
- [ ] **L6.7 Keep videos only where it works** · S.
      - **What:** check for `createWritable` before offering the setting, tell
        the player when a keep fails, and make the "never saved" copy follow
        the setting.
      - *Proof:* a `clipStore` test with a handle that lacks `createWritable`,
        and a render test of a reopened report with a kept clip.
- [ ] **L6.8 A crash screen that backs up first** · S.
      - **What:** "Save a backup first", using plain IndexedDB with no React,
        and a confirmation before anything is cleared.
      - *Proof:* a render test.
- [ ] **L6.9 A time estimate** · S.
      - **What:** an estimate taken from this device's past `Analysis.cost`.
      - *Proof:* a unit test.
- [ ] **L6.10 The small platform fixes** · S.
      - **What:**
        - `goHome` releases the video, so updates can land;
        - the glance's speech is primed on the record tap;
        - `?check` gains probes for wake lock, `createWritable`, rVFC, a local
          voice and installed status.
      - *Proof:* an App test and the `selfCheck` text tests.
- [ ] **L6.11 `useAnalysisRun`** · M.
      - **What:** `run`, `compareServes` and `openClip` move out of `App.tsx`
        with their refs, so the idle and sweep decisions can be tested.
      - *Proof:* hook tests, and `App.tsx` under 1,200 lines.
- [ ] **L6.12 Ledgers that agree** · S.
      - **What:** `LOOP.md` points at this branch and at `ROADMAP.md`.
        `NEXT.md` and `PROGRESS.md` are marked historical. The test cache is
        set per run by default.

### Order of play

1. **L1 first.** Every item is small, and the waves after it build on it:
   - the plan's confidence (L1.2) feeds the basket verdict;
   - the score fix (L1.1) feeds every delta;
   - one drill source (L1.4) feeds graduation.
2. **Then L2.1–L2.3 and L3.1.** The first three correct the basket path that is
   wrong today. L3.1 decides what counts as a change.
3. **Then four tracks side by side:**
   - sessions (L2.4–L2.8);
   - progression (L3.2–L3.5);
   - seeing good (L4.1–L4.6);
   - reliability (L6.1–L6.5).
4. **Last: engine depth (L5) and audio (L2.9),** because each is a measurement
   round of its own.

Out of scope, because they need a person or data leaving the device:
- a git remote;
- level norms from population data;
- leaderboards and coach sharing;
- phone timing (W5.4);
- the fixture shoot.

`LEVEL-UP-REVIEW.md` lists them as the owner's call.
