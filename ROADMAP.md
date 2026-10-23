# ROADMAP — from prototype to product

Written 2026-09-23 after a full review of the app, the engine and the ledgers.
`docs/history/NEXT.md` stays the ledger for engine rounds; this file is the product plan that
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
  seeing what good looks like. The reasoning is in `docs/history/LEVEL-UP-REVIEW.md`.

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
points. `docs/history/LEVEL-UP-REVIEW.md` holds the reasoning and the `file:line` evidence.
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
      - **What:** the rewrites in `docs/history/LEVEL-UP-REVIEW.md` §1. The worst offenders:
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
      - **What:** the nine sections in `docs/history/LEVEL-UP-REVIEW.md` §5, and
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
- [x] **L5.2 A second witness for the tray** · M.
      - *Delta (Oct 17):* done.
        - The witness: `diagnose` reads the racket arm's abduction while
          cocking. That is the angle between the upper arm and the trunk in
          world space, trophy to drop, read only where the shoulder, elbow and
          hip were seen.
          - It is the median across the window, not the peak. On straight legs
            the trophy is found early, mid-backswing, and the peak there read
            88° on a laid-over arm.
        - It reaches `evaluateFlaws` as structural evidence. `waiters_tray` is
          named only when the palm is out of band and the arm cocks under 70°
          (`TRAY_ABDUCTION_MAX`, Touzard 2019).
          - An arm nobody saw leaves the tray unnamed.
          - The finding carries the witness as read.
        - The rig gained `trophyArmLayOver` (0–1). It lets the elbow down
          towards the ribs from the trophy to the drop and carries the hand to
          the shoulder line. Zero leaves every default serve byte-identical.
        - Measured on the rig:
          - clean: palm 6°, arm 121°;
          - palm alone: 74° on a 96° arm, not named;
          - lay-over alone: arm 66°, not named;
          - both: 76° on a 57° arm, named at rungs 3 and 9.
        - Bath cocks at 91–103° from the side, behind and in front, at 30 and
          60 fps, and none of the six is named.
        - Fixtures now lay the arm over wherever they mean a tray: the demos,
          the tests, and the injury demo. The injury demo also loads its knees
          (150°), because the sample's straight legs found the trophy before
          the lay-over. One triage fixture's forearm drop went from 0.4 to 0.3:
          with the arm let down too, 0.4 stretches it to cock at 74°.
        - Found in the preview: with more faults now named, the injury demo
          printed the held-back note, which was passive ("once these are
          fixed"). It now reads "once you fix these", with a copy check.
        - Proof: three checks in `flaws.test.ts` cover the palm, arm and both
          cases at rungs 3 and 9; Bath never named from any side, cocking at
          least 15° above the line; and a tray with no arm read never named.
          The tray's "Show me" was previewed.
        - Departure: the six Bath serves in the repo stand in for the forty.
          The forty run only through `npm run bench:mocap`, outside the suite.
      - **What:** shoulder abduction during cocking under about 70°
        (Touzard 2019) is required beside palm-to-sky.
      - *Proof:* the rig's arm-lay-over and palm dials; none of the 40 Bath
        serves is named. After L5.1.
- [x] **L5.3 Contact behind the head, named** · S–M.
      - *Delta (Oct 17):* done.
        - `contactAheadOf` (its own module, `contactAhead.ts`) is the one
          reading of where the hand met the ball against the hips, towards
          the net. The card's `contactAhead` row and the new
          `contact_ahead_pct` signal both call it.
        - The signal pairs with the card in `CARD_SIGNAL`:
          - it is read on the card's cited band (Vacek 2023, Connolly 2021,
            Fett 2021) and graded from below only;
          - the kick's floor of 0 comes through `SERVE_TYPE_SHIFT`;
          - it is read from the side only, and only when the swing settles
            which way the net is;
          - its noise floor is 3, from Bath's 1.5 deviation between takes.
        - `contact_behind` is a new fault in the toss group, because a ball
          met over the head starts with where the toss went. Its sentence
          says so, its drill ladder starts with the toss sent in front, and
          its card drill is the step-in toss. The angle-reach note says "where
          you hit the ball" when the camera stood behind. The still evidence
          says one frame cannot tell in front from behind.
        - The rig gained `contactBehind` (metres back from the default
          contact).
          - Clean reads 16.7.
          - 0.25 m back reads 2.4: named on a flat serve, not on a kick.
          - 0.35 m back reads −3.4: named on both.
          - From behind there is no reading.
        - Bath reads 12.6–26.1, inside the band, and is named at no rung. (The
          ledger's 15–34 is the forty from every placement; these are the six
          from the guide's spot.)
        - Fixed on the way:
          - The card priced this row through an inferred-depth cost, which
            made every reading from the guide's side-on placement
            "approximate" and left the fault unnameable. Read along the court's
            length from the side, no depth enters it, so the cost is gone.
          - A kick history's practice card keeps the kick's own drill over the
            fault's ladder.
          - Sharing the reading through `metrics.ts` pulled the card scorer
            into the entry bundle (129.2 kB). The reading moved to its own
            module, and the entry is 124.7 kB.
        - Proof: three checks in `flaws.test.ts` cover the rig's contact
          offsets on flat and kick, side-only reading with the toss group and
          copy, and Bath inside and unnamed at 30 and 60 fps. The
          "one serve, judged once" and plan-pricing checks hold the pair to one
          number and one confidence.
      - **What:** `contact_behind` in the toss group, from the cited
        contact-in-front band, with toss placement as its cause. Side view
        only, and the kick's floor is 0.
      - *Proof:* the rig's contact and ball offsets; Bath reads 15–34, inside
        the band.
- [x] **L5.4 Tossing arm, named** · S.
      - *Delta (Oct 17):* done.
        - `tossArmHoldOf` (`tossArm.ts`) is the one reading of how long the
          tossing hand stays above its shoulder, toss to contact. The card's
          "Tossing arm timing" row and the new `toss_arm_hold_pct` signal both
          call it.
        - The signal pairs in `CARD_SIGNAL`:
          - it is read on the card's band [55, 100], which was re-derived on
            Bath with the rig's dropped arm held under it;
          - it is graded from below and read from every angle;
          - its noise floor is 2, from Bath's 1.15 deviation.
        - `toss_arm_drops` is a new fault in the toss group:
          - "Your tossing arm comes down early" ("drops" is the racket's word);
          - a four-step ladder: toss and point, point and hold, half pace with
            the arm up, then points;
          - its moment is the trophy, and its still says why one frame cannot
            hold it.
        - Rig: the dropped-arm dial (`tossArmHold: 0.2`) reads 33% and is named
          from the side and from behind. Clean reads 86% and is not.
        - Bath reads 70–81% from every side at 30 and 60 fps, and none is
          named.
        - The sample serve was built with an early tossing arm, so the example
          report now leads with it, as the hierarchy puts the toss before the
          drop.
          - The look-for tests now follow whichever fault leads, and still
            check the drop shows at the drop.
          - The fault-trend test's clean history holds its arm up.
        - Proof: two checks in `flaws.test.ts` cover the rig at both angles,
          and Bath inside and unnamed. The example was previewed at 375×812,
          leading with the arm, with the trophy pair, the ticks and step 1 of
          4. The entry bundle is 125.2 kB.
      - **What:** `tossArmHold` is promoted into the toss group.
      - *Proof:* the rig's dropped-arm dial; Bath reads 72–79%.
- [x] **L5.5 A camera that stays still, or says it didn't** · M.
      - *Delta (Oct 17):* done.
        - `cameraMotion.ts` reads two things that do not depend on the pose:
          - the picture's scale, as the body's segments in the picture against
            the same segments in the world skeleton's picture plane;
          - the ground line, as the lowest the feet sit in the picture.
        - Both are read across the stance before the toss, where the player
          stands still, and the drift rate is carried to contact. It is not
          read across the swing:
          - over the swing a still camera reads 4–15% scale and 2–7% ground
            drift on the Bath serves, because the player travels towards or
            away from the lens and lands a foot nearer or further;
          - a phone stepping back looks exactly like a player stepping
            forward, so only the stance can tell them apart.
        - The limits are 7% scale and 3% of standing height.
          - Bath reads at most 2.1% and 0.2%.
          - The rig's heavy tracker noise reads 4.6% and 1.7%.
          - A 10% zoom reads 8%, and a 5% tilt reads 8.4%.
          - A phone that lurches once mid-swing is not caught; one drifting
            steadily in a hand, or sliding on a stand, is.
        - The skeleton carries `derivation.cameraMoved`. `restingTrust`, which
          prices the scale cost for the card and the diagnosis alike,
          multiplies every reading resting on the stance's scale by
          `CAMERA_MOVED` (0.4).
          - That is under the soft line, so the card says "approximate".
          - It is under the evidence floor, so the plan names no fault from
            it.
          - The reason given is "Your camera moved during the serve, so
            heights here are a guess."
        - The rig gained `cameraTilt`, the picture sliding up or down across
          the clip.
        - Proof: four checks in `robustness.test.ts`.
          - The zoom check flips from a confident wrong number to a hedged
            one: contact height 1.428 at confidence 1.00 becomes 1.488 at
            0.40, with the camera reason, while angles are untouched.
          - A tilt is seen.
          - Noise and pan are not; a low contact named from a still camera is
            not named from a zooming one.
          - No Bath serve, from any side at 30 or 60 fps, reads as moved.
      - **What:** a vertical-tilt dial on the rig. Drift in the ground line and
        in apparent size between the ready and contact is detected, and any
        reading built on image height is hedged when the camera moved.
      - *Proof:* the zoom KNOWN check flips from wrong to hedged.
- [x] **L5.6 The ball's height from its fall** · S.
      - *Delta (Oct 17):* done.
        - `ballFallMetres` in `ballTrack.ts` is ½·g·t², with t from the fitted
          arc's apex to contact. A ball struck before its top fell nothing.
        - `contactBelowPeak` now reads it, in metres. It is timed from the
          ball's own contact where the ball was followed to the racket, and
          from the hand's contact otherwise.
          - It used to be a picture height over the stance's standing height.
          - The band is the studies' own, with no conversion: ideal 0–1 m,
            range 0–1.8 m. The ladder is 0.05 / 0.27 / 1 m, the old statures
            times an adult's 1.8 m.
          - Its confidence no longer rests on `scale`, only on `contact`.
            A camera that moved, or a standing height guessed from the torso,
            costs it nothing.
          - The card prints "0.56 m".
        - Departure: Bath has no ball, so "the five Bath placements" cannot be
          read. Placement and camera independence are shown on the rig ball
          instead.
        - Proof: four checks in `ballFall.test.ts`.
          - Four toss placements (straight up, forward, forward and wide,
            forward and in), each filmed from yaws 82, 60, 45, 30 and 8. Every
            reading is ½·g·t² exactly, and the five cameras agree to 0.0 cm.
          - The rig's fall prints "0.56 m" and reads "Struck as the ball
            falls", the bottom of the published 0.56–0.94 m.
          - Under a drifting zoom the toss peak's confidence drops from 0.90 to
            0.36, and the fall stays above the soft line.
          - With the feet out of frame, the fall is unchanged and unhedged.
        - The example clip has no ball, so its contact area still lists the
          fall as not graded. The entry bundle is 125.7 kB.
      - **What:** Δh = ½g·t² from apex to contact, which needs no scale and
        has no perspective.
      - *Proof:* the rig ball at every placement; the five Bath placements
        agree within the noise floor.
- [x] **L5.7 Falling back, signed** · S–M.
      - *Delta (Oct 17):* done.
        - `landingTravel.ts` reads how far the hip centre travelled across the
          picture from contact to the finish, in standing heights.
          - It is signed by the swing's net direction, the sign
            `contactAhead` already reads with: positive is into the court,
            negative is falling back.
          - It is read from the side only. From in front or behind, the net is
            along the lens.
          - It refuses a finish under 0.1 s past contact, so a clip that stops
            at the ball does not read as a player who stood still.
        - `Diagnosis.landingTravel` carries it, and `landing_travel_ratio` is
          in `UNCALIBRATED`: measured, and falling back is not named, because
          no study gives a distance to grade against.
        - Departure: the proof's "negative `landingLean`" cannot carry it.
          - That dial moves the hips along the hip line, which by the finish
            runs across the court. From the side it reads a third as large and
            changes sign with the camera's angle.
          - The rig gained `landingTravel` instead: the hips go netwards after
            contact (negative is back) with the feet planted while the legs
            reach. It is the first dial that moves the whole body in the
            picture.
        - Departure: the hips are read in the picture, not against the feet.
          - The Bath serves leave the ground, and their hips against the
            ankles read either sign by the side filmed from.
          - The cost is that a panning phone reads as travel: a 0.05-frame pan
            reads 0.019.
        - Proof: seven checks in `landingTravel.test.ts`.
          - From yaw 82 the rig reads -0.167 / -0.084 / 0 / 0.084 / 0.167 for
            -0.3 to 0.3 m of travel, which is the dial over 1.8 m. From yaw 60
            it reads the cosine of the turn.
          - With tracker noise at 30 fps, five seeds keep the sign at ±0.15 m.
          - Every Bath serve from either side at 30 and 60 fps reads forward:
            24 reads, 0.077–0.233.
          - Nothing is read from yaw 30 or 8, nor from Bath bearings 0 and 180.
          - A clip cut at contact reads nothing.
          - The dial leaves every frame through contact bit-identical.
        - Data only, so nothing a player sees changed. The entry bundle is
          125.9 kB.
      - **What:** the landing is signed by the swing's net direction. Falling
        backwards is an `UNCALIBRATED` reading first.
      - *Proof:* a negative `landingLean` on the rig; every Bath serve lands
        forward.
- [x] **L5.8 The second serve that slows down** · M.
      - *Delta (Oct 17):* done.
        - `secondServeSlower` in `progress.ts` compares the card's
          drop-to-contact time across serves tagged first and second.
          - It needs five tagged serves of each number
            (`MIN_SERVES_EACH_SIDE`), each with a reading the card trusts,
            and one rubric era.
          - It counts every serve type, unlike the rest of the block: a time is
            not judged on a type's band, and a second serve is usually a
            different type.
          - It speaks when the second serve is slower by more than one take's
            camera noise on this reading, `CARD_NOISE_SD.dropToContact`
            (18.5 ms, from `realiseReal` on the Bath serves).
          - It also needs the gap to be twice its standard error, with each
            side's spread held to at least that noise.
          - A faster second serve is not a fault and says nothing.
        - The Progress screen's "First and second serves" block carries the
          line: "Your second serve swings **a beat slower** from the racket
          drop to the ball. Swing it as fast as your first; spin keeps it in."
          - There is no number in it, because the copy rules keep raw
            measurements off the screen. The two means are on the result.
          - Registered as a whole-history reader for R55.
        - Proof: six checks in `secondServe.test.ts` on the rig's
          `motionSeconds` tempo dial, with tracker noise.
          - 1.35 s first against 1.9 s second reads 165 against 207 ms, and is
            said.
          - The same tempo tagged both ways, a 10 ms gap (1.35 against 1.65 s),
            a faster second serve, and four second serves all say nothing.
          - Untagged serves do not move the first-serve time.
        - Seen at 375×812 on twelve seeded serves: the line sits under the two
          counts, with no console errors. The entry bundle is 126.1 kB.
      - **What:** with tagged first and second serves, compare drop-to-contact
        time. Say so when the second is slower past the noise bound
        (Chow 2003, Sheets 2011).
      - *Proof:* the rig's tempo dials, with the bound from `realiseReal`.
        After L2.7, or a tagged basket.
- [x] **L5.9 Noise that behaves like a tracker** · M.
      - *Delta (Oct 17):* done. The full account is in ANALYSIS-REVIEW.md,
        "Noise that behaves like a tracker".
        - The bench's 500 frames are consecutive frames of serves, about 0.1 s
          apart. Labels, MediaPipe (`det-mp-crop`) and RTMPose-s
          (`det-rtm-s`) on the same frames split three ways.
          - MediaPipe's own error is 0.87–2.05% of standing height per axis,
            RTMPose's 0.60–1.40%, and the labeller's 1.05–1.70%. The old
            jitter was 0.45%.
          - Frame-to-frame correlation is 0.0–0.43 at the bench's spacing.
          - MediaPipe swaps a pair on 1.0–3.7% of frames.
          - A new `bench.html?video=1` reads MediaPipe in VIDEO mode on a
            fixed crop per sequence, as the app does. It agrees to a few
            hundredths.
        - `trackerNoise.ts` holds the fits (`MEDIAPIPE_FIT`, `RTMPOSE_FIT`).
          `withTrackerNoise` puts them on a clean filming: per-landmark
          AR(1) error, carried to the clip's rate, and whole-limb swaps.
        - The floor table, before and after, is printed by
          `trackerNoise.test.ts` (old jitter / MediaPipe / RTMPose):
          - contact-ahead 2 / 7 / 6 against a floor of 3;
          - palm-to-sky 20 / 32 / 30 against 18;
          - elbow lift 0.018 / 0.052 / 0.029 against 0.017;
          - toss drift 0.21 / 0.42 / 0.39 against 0.22.
        - The decider was the faults. At today's floors, the skilled Bath
          serves under MediaPipe's noise were named:
          - a toss drift on 5.3% of takes, on all six serves;
          - contact behind on 1.9%, and a shallow drop on 1.4%.
          - Nearly all of that came from swaps: without them toss drift went
            to zero.
        - Departure: so the swaps were fixed and the floors kept.
          - `swapGuard.ts` trades a pair back when both landmarks jump to
            where the other was headed, and the limb is seen returning within
            three frames.
          - It touches no clean clip, and puts back every arm swap from the
            side, plus 65–85% of the leg and hip swaps.
          - `analyze.ts` runs it on every read and after the RTMPose pass.
            The suite's ensembles run it too.
        - Proof: five checks in `trackerNoise.test.ts`.
          - The model reproduces its fitted spread, correlation and swap rate.
          - The guard leaves the rig and the Bath serves alone from eight
            sides at 30–120 fps, and puts back what the model traded.
          - The gate: under RTMPose's noise no fault is named on more than 1%
            of skilled takes, under MediaPipe's none on more than 2.5%, and no
            toss drift at all. Contact behind is named on 1.4% under MediaPipe
            and 0.0% under RTMPose; nothing else is named.
        - The entry bundle is 126.1 kB.
      - **What:** fit drift and left/right swaps from MediaPipe's disagreement
        with RTMPose on the bench, then re-run every floor. This closes
        `ANALYSIS-REVIEW.md` Tier 1.8.
      - *Proof:* the floor table, before and after.
- [x] **L5.10 The ball pass in sweeps** · S–M.
      - *Delta (Oct 17):* done.
        - `SWEEP_SKIPS` in `analyze.ts` is the one list of what a basket sweep
          leaves out: the framing check, the stills, the racket boxes and the
          second pose model. The ball pass is no longer on it.
          - A basket filmed to pass the toss-height step used to come back
            "only 0 of those serves showed this clearly", every time.
        - The slow-motion probe is skipped whenever the clock was handed down
          (`knownStretch`). A swept serve with the ball would otherwise run it
          per serve, for an answer the first serve already settled.
        - A session's light read still skips the ball. Its full reads (the
          best and worst serves' pictures) read it, as the plan already priced
          them (`withBall`), so the still draws the ball.
        - `footprint.ts` counts a ball flight (`ballBytes`,
          `BYTES_PER_BALL_SAMPLE`), and `worstCase` carries one per serve.
        - Proof:
          - Two checks in `sweepBall.test.ts`: the sweep keeps the ball, and
            `sweepServes` over six rig serves with the rig's ball is judged by
            `checkDrill('toss_height')`. Low tosses come back "not yet" (0 of
            6 clean), good ones "passed" (6 of 6), and the same basket with no
            ball reads nothing.
          - Two in `footprint.test.ts`: a ball sample measures 162 bytes
            against a stated 130. A swept basket of eight with a ball each is
            10.9 MB, 0.1 MB of it the balls, inside the 64 MB ratchet.
        - Nothing on screen changed that a preview can show without a filmed
          basket. The entry bundle is 126.1 kB.
      - **What:** sweeps keep the ball pass, so `checkDrill` can judge toss
        height in a basket and session full reads keep the ball.
      - *Proof:* the sweep harness with a rig ball, and the footprint test.
- [ ] **L5.11 Benchmark the racket box** · M.
      - **What:** score EfficientDet against COCO's racket boxes. Only if it
        holds up, use the racket head under the shoulder as a witness for the
        drop.
      - *Proof:* the `/bench.html` table.
      - *Delta (Oct 17):* ready, not run, so still open.
        - The COCO subset never kept its racket boxes; they were only used to
          choose the frames. `scripts/fetch-bench.mjs` now keeps the boxes
          beside the player, and rebuilds a subset built without them.
        - That rebuild re-downloads COCO's annotation archive
          (`annotations_trainval2017.zip`, about 241 MB, from COCO's S3
          bucket), which waits on the owner's say-so.
        - `bench.html?set=coco-tennis&racket=1` scores the app's detector as
          the app runs it (EfficientDet-Lite0, a 0.2 floor, the best racket):
          - how often it finds a box the wrist accepts;
          - IoU ≥ 0.5 against the label;
          - the racket head's error as `racketFromBox` places it, as a share
            of the player's height;
          - whether detected and labelled heads agree on the witness question,
            head below the racket shoulder or not.
        - On today's data it says the labels are missing and how to get them.
        - The witness stays unused until that table says it holds up.
- [x] **L5.12 The 60 fps hint** · S.
      - *Delta (Oct 17):* done.
        - The too-few-frames refusal's second hint is now "Film in slow
          motion, which catches the swing many times over." It used to add
          "or set the camera to 60 frames per second", which a real-time
          60 fps clip read at 32 samples a second would not have honoured.
        - Proof: two checks in `fpsHint.test.ts`.
          - The refusal recommends slow motion and no frame rate, and the
            pattern is shown to catch the old line.
          - No string literal in the screens, the components or the engine's
            player copy tells anyone to film at 60 (98 files, comments
            stripped). The fixture plan's 60 fps clip is the developer's shoot
            list for D1.2 itself and lies outside them.
        - Seen at 375×812 on `?demo=glance-refused`, with no console errors.
      - **What:** until D1.2 is wired, the too-few-frames refusal recommends
        slow motion only.
      - *Proof:* a copy test.

### Wave L6 — Field reliability

- [x] **L6.1 One honest download** · M.
      - *Delta (Oct 17):* done.
        - The manifest is `engineManifest.ts`. It lists seven files (the
          SIMD runtime only), and `scripts/engine-manifest.mjs` reads their
          sizes off `public/`. The build and the test runner define them as
          `__ENGINE_MANIFEST__`.
          - 56.8 MB in all, said as 57 MB.
          - The home button's size now comes from it.
        - `engineDownload.ts`:
          - `fetchStreamed` rejects with `DownloadStalled` after
            `STALL_MS` (30 s) with nothing arriving: before the response,
            between chunks, or never answered. It aborts the request.
          - `downloadEngines` fetches every manifest file through the service
            worker's cache onto one bar, totalled from the manifest, never
            past its end.
          - `meteredConnection` reads Save-Data and cellular.
        - All three engines download through `fetchStreamed`. A stall rejects,
          the loader's catch clears `pending`, and the next attempt starts
          again.
          - The egress allow list's three engine entries became one, for
            `engineDownload.ts`, which calls `fetch(` literally so the scan
            still sees it.
        - The warm-up runs `downloadEngines`, then builds the engines from the
          cache. The button reads "Downloading… 23 of 57 MB", moving a
          megabyte at a time.
          - A stall reads "The download stopped. Tap to try again."
          - On a metered connection, before the tap: "You are on mobile data.
            The download is 57 MB, so wait for Wi-Fi if you can." With Data
            Saver on, it opens "Data Saver is on" instead.
        - Proof: seven checks in `engineDownload.test.ts`, with fake streams
          and a fake clock.
          - The manifest matches the files on disk.
          - The bar is one bar across three files, in order, and never runs
            past its end.
          - A fetch that never answers stalls at exactly 30 s, and is aborted.
          - A stream that stops mid-file stalls. One that keeps arriving just
            inside the limit is not cut off.
          - The real pose engine's stalled attempt clears the way for a second
            fetch.
          - The metered cases, and the Home render of every label.
        - Seen at 375×812 on the dev server: the bar ran "2 of 57 MB" …
          "21 of 57 MB" to "Downloaded, but this browser will not keep it".
          Dev has no service worker. The console showed no errors beyond
          MediaPipe's own GL lines.
        - The entry bundle is 127.0 kB.
      - **What:**
        - a build-time manifest of every engine file;
        - one "x of 57 MB" bar across all of them;
        - a stall timeout that rejects and clears `pending`;
        - a warning on saveData or a cellular connection.
      - *Proof:* fake streaming fetches, a fetch that never resolves, and fake
        timers.
- [x] **L6.2 Offline errors that say so** · S.
      - *Delta (Oct 17):* done.
        - An engine that will not load used to reach the player as "Something
          went wrong reading that video", with advice about MP4 files and the
          camera roll.
        - It now throws `EngineLoadError`, where an analysis and a session
          first load the pose engine. Its title and `hints` come from
          `engineFailureOf`, so the existing error screen shows them through
          `hintsOf`:
          - stalled (by class or by name): "The coach's download stopped";
          - no signal: "The coach is not on this phone yet", saying the
            download is 57 MB;
          - otherwise: "I could not start the coach".
        - Home's footer says "with or without a signal" only once the coach is
          cached. Before that it says "works without a signal once it is
          downloaded", and nothing about the signal until the cache answers.
        - Proof: three checks in `engineFailure.test.ts`: the
          classification, the copy of all three cases (none of it about the
          video file), and the Home render at `offlineReady` true, false and
          unknown.
        - Seen at 375×812 on the dev server, with no console errors. The entry
          bundle is 127.4 kB.
      - **What:** a failed engine load gets its own hints instead of
        video-format advice. Home's footer follows `offlineReady`.
      - *Proof:* a failure-classification test, and a Home render with
        `offlineReady=false`.
- [x] **L6.3 Record at the camera's best** · M.
      - *Delta (Oct 17):* done.
        - `framing/camera.ts` builds the constraints the framing preview and
          the recorder open the camera with (`recordingConstraints`): 1920 ×
          1080 at 60 fps, back camera, all as `ideal`s.
          - The recorder films through the preview's stream, which had been
            opened at 640 px wide, so every serve recorded in the app was a
            640-wide clip.
        - The recording itself moved out of `FramingCheck.tsx` into
          `recordClip` in `record.ts`. It reads the track's
          `getSettings()` as recording starts and remembers them against the
          file it hands over.
          - `analyzeServe` stamps them on the analysis as `capture` and keeps
            them for `?check`. That happens in the lazily loaded analysis, so
            the app shell never loads the module.
        - `?check` prints "camera last 1920×1080 at 60 fps", or "camera last
          none", from the last recording rather than by opening the camera.
          The device report's vocabulary test gained the new words
          deliberately.
        - Proof: six checks in `framing/__tests__/camera.test.ts`.
          - The constraints: ideals only, no `exact` and no `min`.
          - The settings reader rounds and drops nonsense.
          - A fake MediaStream and a fake MediaRecorder: the file carries
            1920×1080 at 60, a 720p 30 fps phone is recorded as what it gave,
            empty chunks are not counted, and a refused recorder throws to the
            caller.
          - The stored last camera reaches the pasted block.
        - Seen on `?check` at 375×812 with nothing kept and with a kept
          camera, with no console errors. The entry bundle is 127.4 kB.
      - **What:** the recording constraints come from a pure function (1080p
        ideal, 60 fps ideal). `getSettings()` is stamped on the analysis and
        into `?check`.
      - *Proof:* a constraints test and a fake-MediaStream recorder test.
- [x] **L6.4 Interruptions** · S–M.
      - *Delta (Oct 17):* done.
        - `useWakeLock` returns `held`, `refused`, `unsupported` or `off`.
          When the screen may lock, the analysing screen says once: "Keep the
          screen on until this finishes. If it locks, the reading pauses until
          you come back."
        - `interrupted.ts` leaves a marker in `sessionStorage` while an
          analysis runs, cleared in `run`'s `finally` however it ends.
          - One still there when the app's code loads is an analysis the page
            did not live to finish. Home says so once at the top: "Your last
            reading stopped part way, most likely because the screen locked.
            Pick the clip again to read it."
          - It is read at module load rather than in a state initializer,
            which strict mode runs twice. That was found in the preview,
            where the first run ate the marker.
        - `visibleWait.ts`: `timeoutWhileVisible` runs out only while the page
          is visible. When it falls due while hidden, it waits for the page to
          come back and then allows its whole time again.
          - `waitFor` in `extract.ts` uses it, so a seek on a locked screen
            waits instead of carrying on without the frame.
          - `waitFor` is exported, with its document and clock injectable.
        - Proof: five checks in `interruptions.test.ts`, with a fake page and
          a fake clock.
          - The timeout survives a minute hidden and then gives its full 6 s.
            On a visible page it is ordinary, and a cancelled wait leaves
            nothing behind.
          - A seek on a hidden page lands once the page returns. One that never
            lands on a visible page still ends.
          - The marker is said once, and a damaged one is ignored.
          - The line shows only for a refused or unsupported lock.
          - The analysing screen and Home render both.
        - Seen at 375×812 by leaving the marker and reloading: the note shows
          and the marker clears, with no console errors. The entry bundle is
          127.8 kB.
      - **What:**
        - `useWakeLock` returns its status, and a refused lock shows one line;
        - an interrupted analysis leaves a marker in `sessionStorage`, read on
          the next load;
        - seeks wait for the page to be visible again instead of timing out.
      - *Proof:* render tests, and extract tests with a fake
        `document.hidden`.
- [x] **L6.5 iOS storage safety** · S–M.
      - *Delta (Oct 17):* done.
        - `storage/nudge.ts` decides the one thing to say, from answers
          rather than probes, so tests can be any phone:
          - **move**: iOS Safari, not installed, at least one serve.
            "Safari clears this after a week away. Export your serves, add Serve
            Coach to your Home Screen, then restore them there." It offers
            Export now and Not now; Not now quiets it for three days.
          - **restore**: installed with no history. "Moving over from Safari?
            Restore the backup you exported there." The button opens Settings,
            where the restore lives.
          - **remind**: 20 serves filed since the last export.
        - `downloadBackup` stores `lastExportedAt` itself, so an export from
          Settings counts as well as one from the home screen.
        - Proof: four checks in `storageNudge.test.ts`, with iOS and installed
          stubbed as answers.
          - The move fires after the first save, stays quiet with no history or
            before it loads, and returns after the quiet.
          - The restore appears on either platform.
          - The reminder fires at 20, and only serves filed since the export
            count.
          - The Home render of each, with its buttons.
        - Seen at 375×812 with 21 seeded serves: the reminder sits at the top
          with Export now, and the console is clean. The entry bundle is
          128.3 kB.
      - **What:**
        - after the first save on iOS Safari: "Export, add to Home Screen,
          then restore";
        - an installed app with no history offers a restore;
        - `lastExportedAt` is stored, with a reminder after N serves.
      - *Proof:* render tests with `isIOS` and `isInstalled` stubbed.
- [x] **L6.6 An engine cache that follows the version** · S.
      - *Delta (Oct 17):* done.
        - `engineCacheName` in `scripts/engine-manifest.mjs` names the
          worker's engine cache from the MediaPipe and ONNX Runtime versions.
          The worker's route, the `__ENGINE_CACHE__` define and the test
          runner all read it there.
        - `engineCache.ts`:
          - `inEngineCache` asks that cache alone. It checks `has` first,
            because `open` would create it.
          - `pruneEngineCaches` deletes every older
            `serve-coach-pose-engine-*` cache and nothing else.
        - The pose, object and refine engines check readiness through it.
          `caches.match` searched every cache, so after an upgrade last
          version's files answered "ready to use offline".
        - The warm-up hook prunes once per load. Every upgrade used to leave
          the last 57 MB behind.
        - Proof: four checks in `engineCache.test.ts`, against a fake
          CacheStorage.
          - The name matches the installed versions.
          - Old-version files are not ready, and asking creates nothing.
          - The engines' own checks agree.
          - Older engine caches are deleted, while this one and the workbox
            precache stay.
        - The built `sw.js` and the entry chunk name the same cache,
          `serve-coach-pose-engine-0.10.18-ort-1.22.0`. The entry bundle is
          128.5 kB.
      - **What:** the cache name comes through a Vite define, the readiness
        check looks in that cache only, and older engine caches are deleted.
      - *Proof:* a fake CacheStorage test.
- [x] **L6.7 Keep videos only where it works** · S.
      - *Delta (Oct 17):* done.
        - `clipStoreAvailable` needs a private file system and
          `createWritable` on file handles. Safari has the first without the
          second, so the setting was offered and every keep failed in silence.
        - `keepClip` removes the file it created when the handle cannot be
          written, or the write fails. It used to leave a 0-byte "kept clip"
          for a reopened report to play.
        - A failed keep is said on the live report: "I could not keep this
          video on the phone, so it will not play here later."
        - The "never saved" lines follow the setting:
          - the report's fine print says "the video is kept on this phone
            only", "this video was not kept", or the old promise;
          - the replay note says "This clip was not kept on your phone";
          - the history sheet says "Reports, and the videos you chose to keep,
            stay on this device only".
          - The JSX copy ruling for the old sheet line went stale when it moved
            into an expression. It was removed, as that test asks, with its
            reason kept beside the line.
        - Proof:
          - Two checks in `clipStore.test.ts`: a Safari-like handle keeps
            nothing and leaves no empty file, and availability is offered only
            with `createWritable`.
          - Four render checks in `keptCopy.test.ts`: a reopened report with a
            kept clip, with the setting on and no clip, with it off, and a
            failed keep on the live report.
        - Seen at 375×812 on a reopened seeded report with keeping on, with no
          console errors. The entry bundle is 128.6 kB.
      - **What:** check for `createWritable` before offering the setting, tell
        the player when a keep fails, and make the "never saved" copy follow
        the setting.
      - *Proof:* a `clipStore` test with a handle that lacks `createWritable`,
        and a render test of a reopened report with a kept clip.
- [x] **L6.8 A crash screen that backs up first** · S.
      - *Delta (Oct 17):* done.
        - The crash screen offers "Save a backup first" before any way out
          that deletes.
          - `rawBackup.ts` opens the database with plain IndexedDB, takes every
            store as it lies, unchecked, and writes a file in the backup's own
            shape, so a restore reads it through the ordinary import.
          - It touches no React and no storage layer, either of which may be
            what crashed. It loads only when the button is pressed, as its own
            chunk.
        - "Clear saved reports and reload" now asks first: "This deletes every
          saved report on this phone, and any videos kept with them." It
          offers Delete them and reload, or Keep them, and acknowledges a
          saved backup. The old fine print saying videos were never stored is
          gone.
        - The screen is `CrashScreen`, apart from the boundary, so it can be
          rendered in a test. A dev-only `?demo=crash` route shows it.
        - Proof: two checks in `crashScreen.test.ts`.
          - The backup is offered and clearing takes two taps, in every state
            of each.
          - A rescue file built from raw stores restores through
            `importBackup`: the readable report comes back, the unreadable
            record that crashed the app does not, an unknown store is not
            carried, and the hand travels.
        - Seen at 375×812 on `?demo=crash`. The only console errors are the
          deliberate render error. The entry bundle is 129.0 kB.
      - **What:** "Save a backup first", using plain IndexedDB with no React,
        and a confirmation before anything is cleared.
      - *Proof:* a render test.
- [x] **L6.9 A time estimate** · S.
      - *Delta (Oct 17):* done.
        - `estimateLine` in `timings.ts` builds on `timingsOf`, which keeps
          warm and cold passes apart and says nothing below three warm ones.
          - The warm median, rounded to the second under 20 s and to five
            above: "About 25 seconds on this phone."
          - A cold engine uses this phone's cold median when it has one ("with
            the first download"). Otherwise it names the download as extra
            ("plus the first download"), since nothing here can price
            somebody's signal.
          - A basket is the per-serve figure times its serves, in minutes past
            90 s.
        - The analysing screen shows it under the file name, wrapping. It is
          computed there from the history App hands in, so the timings stay
          out of the entry chunk.
        - The analysing screen itself became lazy, fetched when a clip is
          picked (99c646c). That took 3 kB off the entry chunk, which had
          reached 129.0 of 130.
        - Proof: five checks in `estimate.test.ts`: nothing below three
          passes, the rounding, cold passes kept out of the warm figure, the
          two download sentences, a basket's figure, and the screen render.
        - Seen at 375×812 on a real run, with three seeded warm timings: "About
          20 seconds on this phone, plus the first download." An ellipsis cut
          the first version short; the line was given its own wrapping class.
          The console showed only MediaPipe's INFO line. The entry bundle is
          126.1 kB.
      - **What:** an estimate taken from this device's past `Analysis.cost`.
      - *Proof:* a unit test.
- [x] **L6.10 The small platform fixes** · S.
      - *Delta (Oct 17):* done.
        - `goHome` releases the clip's object URL. The update gate waits for
          home with no video held, and home kept the last report's, so a
          waiting update never landed until the next analysis.
        - `primeSpeech` in `speech.ts` speaks a silent utterance from the
          record tap. iOS lets speech start only from a gesture, and the glance
          speaks when the analysis ends. It goes through a local voice only;
          with none it does nothing.
        - `?check` gains a `platformVerdict` line: "wake yes clips yes frames
          yes voice no installed no", covering wake lock, writable clips,
          `requestVideoFrameCallback`, a local voice and installed status. The
          report's vocabulary test gained the five words deliberately.
        - Proof:
          - Three checks in `platformFixes.test.ts`: an App source check that
            home releases the clip and the gate waits for it; priming against a
            fake `speechSynthesis`, silent and local, refused with only a
            remote voice; and the verdict and its line.
          - The `selfCheck` text tests pass with the fixture's new
            `platform` field.
        - Seen on `?check` in the preview, with no console errors. The entry
          bundle is 126.1 kB.
      - **What:**
        - `goHome` releases the video, so updates can land;
        - the glance's speech is primed on the record tap;
        - `?check` gains probes for wake lock, `createWritable`, rVFC, a local
          voice and installed status.
      - *Proof:* an App test and the `selfCheck` text tests.
- [x] **L6.11 `useAnalysisRun`** · M.
      - *Delta (Oct 17):* done. `App.tsx` went from 2,051 lines to 1,147.
        - `components/useAnalysisRun.ts` holds the whole reading, moved by
          exact anchors with the bodies unchanged:
          - `run`, `compareServes`, the practice session's reading,
            `openClip`, `cancel` and `stopSweep`;
          - their refs, the progress and sweep state;
          - the update gate and the session's pause effect.
          - App hands it twelve things by the names the code used, and gets
            back what it renders from.
        - `appLoaders.ts` holds the lazy screens' loaders, which both
          files need.
        - Three small hooks took the rest: `useSets`, `useHistoryLookups`
          (records, strain, deltas and the serve before) and
          `usePendingDelete`.
        - `runDecisions.ts` holds the two decisions worth testing, as pure
          functions the hook now asks:
          - `updateMayLand`: home, no clip held, no sweep;
          - `sweepAfterRead`: a basket, a believed read, the clip still open,
            and not on the glance.
        - The tests that read `App.tsx` source now read the code where it
          lives: the screen graph and history readers, the session path's
          write check, and L6.10's gate check.
        - Proof: five checks in `analysisRun.test.ts`.
          - Both decisions' truth tables, the gate across every view kind.
          - `useAnalysisRun` mounted by itself through a probe: every action
            handed back, nothing in flight, and a running session seen as one.
          - `useHistoryLookups` and `useSets` mounted and read.
          - `App.tsx` under 1,200 lines.
        - Seen in the preview after the move:
          - a refused clip reached the error screen;
          - a good one reached its report, and back went home with it filed;
          - the only console line was MediaPipe's INFO.
        - The entry bundle is 126.8 kB.
      - **What:** `run`, `compareServes` and `openClip` move out of `App.tsx`
        with their refs, so the idle and sweep decisions can be tested.
      - *Proof:* hook tests, and `App.tsx` under 1,200 lines.
- [x] **L6.12 Ledgers that agree** · S.
      - *Delta (Oct 17):* done.
        - `LOOP.md` points at `roadmap/market-ready` and `ROADMAP.md`, says
          the `loop/top-ten` loop it describes has ended, and keeps its
          governing constraints.
        - `docs/history/NEXT.md` and `docs/history/PROGRESS.md` open with a historical banner.
          PROGRESS's "Resuming this loop" check count is still kept, because
          `handover.test.ts` holds it to the suite.
        - `run-tests.mjs` bundles into a directory of its own per run,
          `node_modules/.cache/serve-coach-run-<pid>-<time>`, and removes it
          at the end. `SERVE_COACH_TEST_CACHE` still overrides it.
        - Proof: the full suite ran through the new runner, 1,794 checks
          passed, and it left no run directory behind.
      - **What:** `LOOP.md` points at this branch and at `ROADMAP.md`.
        `docs/history/NEXT.md` and `docs/history/PROGRESS.md` are marked historical. The test cache is
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

`docs/history/LEVEL-UP-REVIEW.md` lists them as the owner's call.

---

## Lift programme (2026-10-17) — faster, truer, ready to ship

Waves L1–L6 are done apart from L5.11, which waits on a download. A whole-app
rating on 2026-10-17 gave **6/10 as a product and 8.5/10 as an engineering
prototype**.

| Area | Score |
|---|---|
| Privacy | 9.5 |
| Engineering | 8.5 |
| Speed | 6 |
| Engine truth on club footage | 5.5 |
| Field reliability | 5 |
| Market readiness | 2 |

This programme takes the low scores a machine can lift, highest value first.
The same rules hold:
- every item is proven by machine: the rig, the Bath bench, the open-data
  benches, the browser preview, or a throttled preview standing in for a
  phone;
- nothing re-skins;
- nothing sends data off the device.

What only a person can lift is listed at the end as the owner's call.

**What the engines weigh today, which shapes M1:**

| Engine | Size |
|---|---|
| MediaPipe pose (model and runtime) | 19.1 MB |
| Object detector | 4.6 MB |
| RTMPose refine (model and ONNX Runtime) | 33.1 MB |

ONNX Runtime asks for threads. But no build serves the cross-origin isolation
headers that threads need, so it always runs on one. All inference runs on the
main thread.

### Wave M0 — Keep the work safe
- [ ] **M0.1 A backup on demand** · S, needs the owner's OK on the folder.
      - **Why:** 450 commits, the vendored models and the benches exist on one
        OneDrive-synced disk with no remote.
      - **What:** `npm run backup` writes a timestamped `git bundle --all` to
        a folder outside OneDrive. It keeps the last five and checks each one
        with `git bundle verify`.
      - *Proof:* the bundle verifies, and a clone made from it passes
        `npm run typecheck`.
      - Choosing a remote stays with the owner.

### Wave M1 — The first analysis, sooner and smoother
- [~] **M1.1 Threads for the swing read** · S.
      - *Status:* 2026-10-21 (be3b3c2): measured, not adopted. The headers plugin is ready behind `ISOLATE=1` (launch config `serve-coach-isolated`), with `isolation.test.ts`; every route and demo page reported `crossOriginIsolated` with nothing blocked. Four threads read RTMPose-s in 53–56 ms against 87–98 on one (`footprint.html?threads=1|4`, interleaved). But all three isolated whole analyses of `Saque_con_pelota.webm` abandoned the swing refine (`refined: 0`, 100–228 s) and the one without isolation did not (`refined: 27`, 67 s). The machine swung between 12% and 100% CPU from other apps, so this is a lead, not a finding. Settle it on a quiet machine before shipping `_headers`; ONNX Runtime's `session.intra_op.allow_spinning = 0` is the first thing to try.
      - **What:** COOP `same-origin` and COEP `require-corp` headers in the dev
        server, in `vite preview`, and in a shipped `public/_headers` for
        static hosts.
      - Every asset is already same-origin. The checks prove that no request
        is blocked; nobody has to assume it.
      - *Proof:*
        - the preview reports `crossOriginIsolated`;
        - no request is blocked on any screen or demo route;
        - RTMPose's swing pass on the Bath clips is timed on one thread and
          on four, and both times are recorded;
        - the egress test is unchanged.
- [x] **M1.2 Pose inference off the main thread** (W5.4, re-scoped) · L.
      - *Done:* 2026-10-22 (c4da291), behind `?worker=1`. The spike (3ddac28) read 30 of 30 bench frames identically in a module worker, 38 ms a frame against 37. Every pose read in `extract.ts` now goes through `poseDetect.ts`: the main thread by default, the worker when asked for and Worker, OffscreenCanvas and createImageBitmap exist, the main thread again if it will not start. Tests take the fallback with no Worker. Off by default until a quiet machine has timed whole analyses both ways and counted long tasks; the viewfinder stays on the main thread.
      - **What:**
        - MediaPipe's landmarker and RTMPose run in one module worker, and
          frames reach it as transferred `ImageBitmap`s;
        - the main thread keeps the video, the seeking and the screen;
        - where workers or `OffscreenCanvas` are missing, the current
          main-thread path runs unchanged.
      - **Spike first:** does `tasks-vision` 0.10.18 load inside a worker from
        this app's own origin?
      - *Proof:*
        - the bench clips read the same through both paths: the same
          keyframes, the same faults, and landmarks within 1e-4;
        - during a Bath clip analysis in the preview, the longest main-thread
          task and the count of long tasks are measured before and after;
        - a test with no `Worker` takes the fallback.
- [x] **M1.3 A first read before the whole download** · M.
      - *Done:* 2026-10-22 (5d0e3f5). `analyze.ts` takes `waitForRefine: false` on a cold first analysis: the serve is read once the pose set is in, the refine model downloads behind the report, and the report carries `firstRead`, says so in plain words and offers the full read. Tested with a stubbed cache; the copy lint passes. The cleared-cache timing in the preview waits on the quiet machine M1.4 needs.
      - **What:**
        - on a cold first analysis, the serve is read as soon as the 19 MB
          pose set is in;
        - the refine and racket passes are skipped (`skipPoseRefine` and
          `skipRacketBoxes` already exist);
        - the rest keeps downloading behind the report;
        - the report says it is a first read, and offers the full read once
          the engines are in.
      - *Proof:*
        - a test with a stubbed cache shows the first read waits only on the
          pose files and is marked as a first read;
        - the copy lint passes;
        - in the preview with the cache cleared, the time to the first report
          is measured before and after.
- [~] **M1.4 A phone-shaped timing, without a phone** · S.
      - *Status:* 2026-10-21: blocked. The CDP throttle harness works (scratch `time.cjs`: fresh Chromium, `Emulation.setCPUThrottlingRate`, reads `cost` back from IndexedDB). But on this machine headless Chrome crashed after most reports, and other apps held the CPU at up to 100%, so no budget was checked against its numbers. It needs a quiet machine, or a headed browser.
      - **What:**
        - the preview runs at 4× and 6× CPU throttle through CDP;
        - a Bath clip, a basket and a session-length clip are timed;
        - every budget built on the "2.5× desktop" guess is checked against
          the throttled figures.
      - *Proof:* the measured table goes in `ANALYSIS-REVIEW.md`. A budget
        the table breaks is fixed, or its reason restated, in the same commit.

### Wave M2 — Engine truth on club footage
- [~] **M2.1 Noise floors per tracker** · M.
      - *Status:* 2026-10-22: measured, not adopted. With floors keyed to the fitted MediaPipe and RTMPose noise, false naming on the noisy Bath bench was already at most 1.4%, under the 2% gate, under the shared 0.45% floor, so changing every floor and the scoring version would buy nothing a player would see.
      - **What:**
        - each floor is keyed to the tracker that produced the reading:
          MediaPipe across the clip, RTMPose in the swing window;
        - the floors come from the fits `trackerNoise.ts` measured in L5.9,
          replacing the shared 0.45%;
        - two lists record the change: faults the old floors could never name
          that can now be named, and any that can no longer be named.
      - *Proof:*
        - every fault is falsely named on 2% or fewer of the noisy Bath bench
          tries;
        - the rig still finds its dialled-in faults at today's rates, or each
          change is listed with its reason;
        - the change folds into one scoring version.
- [ ] **M2.2 L5.11, the racket benchmark** — waits on the owner's OK for
      the COCO annotation download (241 MB).

### Wave M3 — Reasons to come back, without a server
- [x] **M3.1 The week plan in the calendar** · S.
      - *Done:* 2026-10-22 (30f628d). `calendar.ts` writes the next three sessions as one `.ics`, each with its drills in the notes and an alarm an hour before, shared or downloaded by the player only. Tests hold it to RFC 5545: CRLF, folding at 75 octets, escaped text, `DTSTART` and `VALARM`, and stable UIDs.
      - **What:**
        - "Add to calendar" on the week plan writes an `.ics` file;
        - it holds one event per planned session, with the drills in its
          notes and an alarm an hour before;
        - the file goes out through the share sheet or a download, so it
          leaves the device only if the player sends it.
      - *Proof:*
        - checks against RFC 5545: CRLF line endings, folding at 75 octets,
          escaped text, valid `DTSTART` and `VALARM`;
        - stable UIDs, so a re-export updates events rather than duplicating
          them;
        - the download is checked in the preview.
- [x] **M3.2 A report a coach can open** · M.
      - *Done:* 2026-10-22 (be5f2f5). `share/coachReport.ts` builds one scriptless HTML page: the stills with their measurements, the ranked faults and drills, each number against its band. A test parses it and finds no `<script>` and no `src` or `href` leaving the file; the copy lint passes.
      - **What:**
        - "Send to my coach" builds one self-contained HTML file and shares it
          the way the report card already is;
        - it holds the stills with their measurements drawn on, the named
          faults, the drills, and the numbers with their bands;
        - it has no scripts and no network references;
        - the player chooses who gets it.
      - *Proof:*
        - a test parses the file and finds no `<script>` and no `src` or
          `href` leaving it;
        - the copy lint passes;
        - the file opens and renders offline in the preview.

### Wave M4 — Ready to ship
- [x] **M4.1 A release that checks itself** · M.
      - *Done:* 2026-10-22 (b545b24). `npm run release` runs typecheck, lint, build and the suite, serves `dist/` with immutable hashed assets and an uncached worker and `index.html`, then proves in a browser: a manifest with three icons, the service worker in control, and home and the example report opening with the network off. `RELEASE_BREAK=<gate>` breaks one gate on purpose and the release stops.
      - **What:** `npm run release`:
        1. runs typecheck, lint, the suite, the build and the size budgets;
        2. serves `dist/` with production headers (M1.1). Hashed assets are
           immutable; the service worker and `index.html` are never cached;
        3. drives Playwright to check that the manifest is valid, the service
           worker is active, and a reload with the network off still opens
           home and the example report.
      - *Proof:* the script passes from a clean checkout, and fails when any
        one gate is broken on purpose.
- [x] **M4.2 Install-sheet screenshots** (W6.5, re-scoped) · S.
      - *Done:* 2026-10-22 (04ad513). `scripts/screenshots.mjs` captures home, the example report and the filming guide at 1080×2340 and one wide 2340×1080 from the production build. The manifest lists them with `form_factor`, outside the precache; `screenshots.test.ts` holds each entry to its PNG's real size. Progress and the glance need saved reports, so the guide stands in for them.
      - **What:** the real screens are captured from the production build at
        1080×2340: home, the example report, progress and the glance. One wide
        shot is added, and all are listed in the manifest `screenshots` with
        `form_factor`.
      - W6.5 asked for phone captures; these are the same screens, drawn by
        the same code.
      - *Proof:* the manifest test checks each entry's size against its file,
        and the entry bundle is unchanged.
- [x] **M4.3 Every control named, reachable and in order** · M.
      - *Done:* 2026-10-22 (536b361). A render test fails on any unnamed button, link or input on every screen, on a toggle without its state, and on focus out of reading order.
      - **What:**
        - every screen and demo route is rendered, and each button, link and
          input is checked for an accessible name;
        - the focus order is checked against reading order;
        - the players and charts follow `prefers-reduced-motion`.
      - *Proof:*
        - a render test fails on any unnamed control;
        - Playwright accessibility snapshots of each screen at 375×812;
        - a keyboard-only pass in the preview.

### Wave M5 — Code that stays easy to change
- [x] **M5.1 Behaviour checks instead of source checks** · S.
      - *Done:* 2026-10-22 (1eddee7). `leaveForHome` and `earlyRefusal` move into `runDecisions.ts` and are tested as behaviour; the go-home check fails when the order is broken by hand. The update gate's call stays a structural check, marked as deliberate.
      - **What:**
        - where a check reads `App.tsx` or `useAnalysisRun.ts` off disk with
          a regex, and a behaviour exists to test instead, the behaviour is
          tested. This covers the update gate, letting go of the clip on going
          home, and the early refusals;
        - the screen-graph table and the history-consumer list stay as they
          are, marked as deliberately structural.
      - *Proof:* each replaced check fails when its behaviour is broken by
        hand.
- [x] **M5.2 One status file** · S.
      - *Done:* 2026-10-22 (0ab42ae). `STATUS.md` says what works, what is open and what is the owner's call; the finished ledgers are in `docs/history/`; `handover.test.ts` reads `STATUS.md`.
      - **What:**
        - a short `STATUS.md` says what works, what is open and what is the
          owner's call;
        - the finished ledgers move to `docs/history/`;
        - `LOOP.md` and the handover check point at the new paths.
      - *Proof:* the handover test and every link check pass.

### Order of play
1. **M0.1** as soon as the owner names a folder.
2. **M1.1, then M1.4.** Both are cheap and give real numbers that every later
   speed claim is measured against.
3. **M1.2 and M1.3,** the two biggest gains a player will feel.
4. **M2.1,** then **M3.1 and M3.2** side by side.
5. **M4 and M5** last. M4.1 is the gate a first public build passes through.

### The owner's call — what a machine cannot lift
- **Real club players.** Five to ten, filmed by a club coach and sent through
  the existing `?fixture` export. Every engine score in the rating is capped
  until this happens.
- **A git remote** and a first tagged release (W6.3).
- **Hosting.** M4.1 makes the build ready. Where it lives, and publishing it,
  is the owner's decision.
- **Anything that sends data off the device:** opt-in data donation for
  level norms, coach links, leaderboards.
- **The COCO download** for L5.11.

## Notch programme (2026-10-18) — on court, at pace, and easier to read

A review on 2026-10-18 graded the app area by area. The reasoning is in
`NOTCH-REVIEW.md`.

| Area | Now | Target |
|---|---|---|
| Core principles | 9 | 9 |
| UX and flow | 6.5 | 8 |
| Coaching depth | 7 | 8 |
| Information architecture | 6 | 7.5 |
| Look and feel | 7.5 | 8.5 |
| Retention | 6 | 7.5 |
| Serve speed | 1 | 6 |
| Product overall | 6.5 | 7.5–8 |

The programme sits beside the Lift programme above, which is planned and not
yet started. The combined order of play is at the end.

The same rules hold:
- every item is proven by machine: the rig, the Bath bench, the open-data
  benches, unit and render tests, or the browser preview at 375×812;
- nothing re-skins;
- nothing leaves the device;
- every new line passes the copy lint;
- the entry bundle stays under 130 kB. It is at 126.8 kB, so every new screen
  or sheet loads lazily. *(2026-10-22: measured from a fresh build, the entry
  is 381.0 kB raw against a 385 kB budget and 128.5 kB gzip. `bundle.test.ts`
  reads `dist/`, so run `npm run build` before trusting its figure.)*

### Wave N0 — Fix what a player trips on
- [x] **N0.1 One message per line on the glance** · S.
      - *Done:* Done 2026-10-19 (16ced39). The repeat form names "this fault"; the score chip was already held to the noise floor.
      - **Why:** "▲ 9 vs your last serve" sits over "No change from your last
        serve." The second line is about the fault (`verdict.ts:651`), but it
        reads as the score.
      - **What:** the fault line names its subject, e.g. "Your tossing arm
        looks the same as last serve." Where the score's change is inside the
        noise floor, the glance chip says so the way the report does.
      - *Proof:*
        - a render test of the glance with a score rise and a `same` fault
          finds no sentence that denies the change;
        - the copy lint passes.
- [x] **N0.2 One drill per fault, everywhere it shows** · S.
      - *Done:* Done 2026-10-19 (21d94db, 1eef6dc). `areaOfFault` files a fault under its card area; a practice row with no fault takes the newest report's planned fault in that area, and any plan drill counts as already shown. Proved by a unit test and in the preview, not by a render test over every demo.
      - **Why:** a reopened report can show *Toss and point* (the focus),
        *Back-leg serves* (item 2, the legs) and *Push throws* (the practice
        card, the knee bend). That is two drills for the legs and three things
        to do.
      - **What:**
        - the practice card and the week plan take a fault's drill from
          `progressionFor(flaw)` at its current rung, as the focus card does;
        - when the practice card's fault is already on the report's list, it
          shows the progress line only, not a second drill.
      - *Proof:* a render test over every `?demo` report and the history demo
        finds no fault with two drill names, and no two drills for one body
        area.
- [x] **N0.3 A sentence that reads** · S.
      - *Done:* Done 2026-10-19 (21d94db). "after two rounds of its drill"; `COUNT_AS_NOUN` in `voice.ts`.
      - **Why:** "has not moved after twice of its drill" (`practice.ts:443-449`).
      - **What:** "…after two rounds of its drill". A voice-lint rule flags
        `times()` output used as a noun.
      - *Proof:* a unit test of every `practiceCue` branch at 1, 2 and 5 drills;
        the new lint rule fails on the old string.
- [x] **N0.4 Retry goes straight to capture** · S.
      - *Done:* Done 2026-10-19 (1eef6dc). `captureAgain` in `App.tsx`; checked in the preview: "Film it again" opens the framing check.
      - **Why:** "Analyse another", the refusal's "Film it again" and the error
        screen's "Try another video" all land on Home. The refusal's fix is the
        framing check.
      - **What:**
        - "Analyse another" opens the picker, or the viewfinder after an in-app
          recording;
        - "Film it again" and the error screen open the framing check, through
          the same `framingNonce` path;
        - the error screen gains "Check your framing" beside "How to film it".
      - *Proof:* the `screenFlow.ts` MOVES table is updated and
        `screenFlow.test` passes; render tests of each handler.
- [x] **N0.5 Empty states lead somewhere** · S.
      - *Done:* Done for the history sheet, 2026-10-19 (1eef6dc, `HistoryEmpty.tsx`). Progress is only reachable with history, so its sections were left.
      - **What:** the empty history sheet offers "Analyse a serve" and the
        example report. Every empty Progress section says what fills it.
      - *Proof:* a render test of each empty state finds an action or a "how to
        fill this" line.
- [x] **N0.6 Model serve captions its own moment** · S.
      - *Done:* Done 2026-10-19 (eb0e847). Caption and pill were always one value; the lit pill was scrolled off the row. `usePillInView` keeps it on screen in all three players.
      - **Why:** mid-play the model showed the contact caption with *Racket
        drop* lit.
      - **What:** the caption and the lit chip come from one phase index.
      - *Proof:* a unit test steps `RigPlayer` frame by frame and checks the
        caption against the chip on every frame. If the mismatch is not real,
        the test stays as a guard and the item closes.
- [x] **N0.7 `serveSpeed.ts` green and committed, still unwired** · S.
      - *Done:* Done 2026-10-19 (4e9550f). `TRACK_FLOOR` (a pixel) and 24 refined lines fixed the coverage; 240 fps with decoys read worse than 120 because racket lines filled all six refines. `MIN_FPS` 45 and `readingOf` make every miss reachable. Two test claims were restated to what is true: noise-free rulers within their own stated error (one is 80% off and says ±69%), and clean tracks within 5% inside 30° of the picture (at 45° the unknown focal length costs up to 9%, inside the range). Pixel check deferred to N2.4. Seen: at 3 px with decoys at 120 fps the range holds 88–91%, under the 95% claimed at a pixel; N2.1 must hold coverage at the noise it really reads at.
      - **What:**
        - the ruler check is gated on `scaleError` (the 79.8% outlier already
          flags itself at 69%);
        - find why 240 fps with decoys reads fewer clips than 120 fps;
        - the header and the code agree on `MIN_SAMPLES`;
        - the test's promised pixel check is added, or the promise removed;
        - every `SpeedMiss` that is declared can be reached.
      - *Proof:* `serveSpeed.test.ts` passes inside the full suite; a test
        reaches each miss reason.

### Wave N1 — The on-court loop
- [x] **N1.1 Hands-free recording** · M.
      - *Done:* 2026-10-21 (6295c23). `framing/handsFree.ts`: `shouldStop` on hand samples (a hand above the head starts a serve; 1.5 s of hands down or nobody in shot ends it; 8 s gone ends a basket short), a 5 s spoken countdown, 1 or 6 serves. While recording, the pose is read every 350 ms at a 25% duty. Rig-trace tests; the camera path itself is unchecked in the preview, which blocks the camera.
      - **Why:** a phone propped on the fence costs two walks per serve.
      - **What:**
        - "Record the serve here" starts a 5 s countdown, shown large and spoken
          through `speech.ts`;
        - a pure `shouldStop(samples)` reads the pose loop the viewfinder
          already runs. It stops about 1.5 s after the landing, or after N
          serves in basket mode, or at the 90 s cap;
        - a tap still stops it at any time.
      - *Proof:*
        - `shouldStop` unit tests on rig traces: one serve, a basket of six, a
          player who walks off, a ball bounce before the serve;
        - a render test of the countdown states;
        - a `?demo=live` screenshot.
- [x] **N1.2 A framing verdict you can hear** · S.
      - *Done:* 2026-10-21 (6295c23). `speakVerdict`: a change, at most every 3 s; "Recording" and "Stopped" said; "Read it aloud" remembered in prefs.
      - **Why:** the verdict cannot be read from the baseline.
      - **What:**
        - verdict changes are spoken, at most one every 3 s;
        - "Recording" and "Stopped" are spoken;
        - a toggle sits in the viewfinder and is remembered in prefs.
      - *Proof:* a unit test of which verdict changes speak, and of the
        debounce; a render test of the toggle.
- [x] **N1.3 A drill check from recorded serves** · M.
      - *Done:* 2026-10-21 (6295c23). `tripCheck.ts`: the trip's newest six judged serves since the ladder last moved (`Prefs.ladderMovedAt`), against the fault drilled when the trip began. On the glance, with "Move up a step". A trip is the app's own: serves under a day apart.
      - **Why:** the route the app recommends on court can never say "Move up a
        step". `checkDrill` runs only for picked baskets
        (`useAnalysisRun.ts:478-486`).
      - **What:**
        - a pure `tripDrillCheck(reports, flaw, rung)` pools the same trip's
          single-serve reports once `CHECK_SERVES` (6) can be judged;
        - the glance shows "4 of 6 clean so far" and offers the move once the
          pass bar is met.
      - *Proof:* unit tests (a passing trip, a failing trip, too few judged, a
        mixed trip from two days); a Glance render test.
- [x] **N1.4 "Check this drill" on the week plan** · M. Needs N1.3.
      - *Done:* 2026-10-21 (6295c23). On each item where the app can record; the viewfinder says "Checking <drill>"; the trip check counts for that drill until it moves. Checked in the preview.
      - **What:** each week-plan item gets "Check this drill". It opens the
        viewfinder with that drill as the target, and the glance counts
        towards the 6.
      - *Proof:* a render test; a `screenFlow` MOVES entry and its test.
- [x] **N1.5 Practice sessions move the ladder** · M.
      - *Done:* 2026-10-22 (ed8e80d). `session/evidence.ts`: `sessionDrillCheck` on the dashboard with "Move up a step"; `sessionEvidence` turns judged lines into judgement-only rows, stamped with the scoring version, that `weekPlan` counts towards graduation. A session is one trip by the app's own trip rule.
      - **Why:** a whole practice's evidence never reaches the ladder,
        graduation or the week plan (`weekPlan.ts:72`).
      - **What:**
        - a session's per-serve fault lines run through `checkDrill` for the
          fault being drilled;
        - the dashboard offers "Move up a step";
        - `weekPlan` and graduation accept session evidence, weighed as one trip.
      - *Proof:*
        - a unit test that a session with 6 clean judged serves passes;
        - a weekPlan test that a session counts as one trip, not as twelve;
        - the history-consumer list in `screenFlow.test` is updated.
- [x] **N1.6 Today's plan** · M.
      - *Done:* 2026-10-22 (6ab0ba5). `courtPlan.ts` and a lazy `TodayPlan` on Home, remembered length in `Prefs.courtMinutes`. Not on the glance: the glance is read between serves, after the plan is under way.
      - **Why:** there is no plain "what to do on court today".
      - **What:**
        - a pure `courtPlan(week, minutes)` splits a 30, 45 or 60 minute hit
          into warm-up, drill reps by rung, a filmed check of 6, and free
          serves;
        - it shows on Home above the week plan, and in a line at the top of the
          glance.
      - *Proof:* unit tests (each length, one fault, three faults, a graduated
        fault); a Home render test; a preview screenshot.
- [x] **N1.7 The court card** · M. Lazy.
      - *Done:* 2026-10-22 (6ab0ba5). In `TodayPlan`: name 34 px, body 24 px, feel cue, pass bar, read aloud, a whole-card rep counter, wake lock.
      - **What:**
        - a full-screen, large-type card for the current drill: its feel cue,
          its reps and its pass bar;
        - it can be read aloud;
        - a tap anywhere counts a rep;
        - the screen stays awake while it is open (`useWakeLock`).
      - *Proof:* a render test; a 375×812 screenshot with the body text at
        24 px or more; the entry bundle is unchanged.
- [x] **N1.8 The glance from any report** · S.
      - *Done:* 2026-10-21 (6295c23). The glance takes a saved report (no frames needed); back goes to the saved report.
      - **What:** reopened reports pass `onGlance` too (`App.tsx:808-812`).
      - *Proof:* a render test; a MOVES entry.
- [x] **N1.9 Tagging out of the fold** · S.
      - *Done:* 2026-10-22 (6ab0ba5). The one tag block moved under the focus card rather than a second compact copy.
      - **Why:** in-rate, first and second serves, sets and the toss map all
        depend on tags, and they are inside "More about this clip".
      - **What:** a compact row on live reports, under the drill: which serve,
        and where it landed. The fold keeps the full version.
      - *Proof:* a render-order test; the copy lint.
- [ ] **N1.10 Record a whole practice** · L. Optional.
      - **Why:** the 90 s cap means an in-app recording can never become a
        session.
      - **What:**
        - where `clipStoreAvailable()` is true, a "Record a practice" mode
          streams `MediaRecorder` chunks into the clip store instead of memory;
        - it has a 20-minute cap and a storage check before it starts;
        - it opens a session when it stops.
      - Where the store cannot write, the mode is not offered, and the guide
        says to use the camera app.
      - *Proof:*
        - unit tests of chunk assembly and of a recording cut off part way;
        - a preview run with a fake camera stream for 3 minutes ends in a
          session plan;
        - the egress test is unchanged.

### Wave N2 — Serve speed, honestly
Engine first, screens after the owner's OK. Showing a speed reverses the rule
in `outbound.ts:20` and `ANALYSIS-REVIEW.md:393`. Until a radar-checked serve
exists, a speed is:
- a range;
- in km/h, or mph by locale;
- only from slow-motion clips;
- `UNCALIBRATED`;
- never graded and never part of the score.

- [x] **N2.1 A pass for the struck ball** · L.
      - *Done:* 2026-10-22 (5d0e3f5). `analysis/speedPass.ts` reads every native frame from contact −40 ms to +200 ms in a net-side window at up to 1,280 px, gated on the clip's frame rate before any seek and bounded at 5 s. From rendered frames it read 42.8 m/s [40.7–45.0] for a true 42. The reading is stored and never shown (N2.7 is the owner's call). The throttled timing waits on M1.4.
      - **What:**
        - after the main read, a second pass from contact −40 ms to +200 ms
          reads every native frame, at the timestamps `seekTo` really reaches;
        - it reads a net-side window sized from the body, at near-native
          resolution (at least 720 lines across the window);
        - the slow-motion stretch comes from `container.ts` or `slowMotion.ts`,
          so each frame has a real time;
        - it runs on the worker from M1.2 where it exists.
      - *Proof:*
        - the rig, rendered at the window's real pixels per frame height,
          feeds `measureServeSpeed`;
        - coverage is at least 30% at 120 fps landscape side-on with decoys;
        - the range holds the true speed on at least 95% of tries;
        - the time the pass adds is measured at 4× throttle (M1.4) and is under
          4 s at 240 fps.
- [x] **N2.2 A ball centre that survives blur** · M.
      - *Done:* 2026-10-22 (3643208). `vision/struckBall.ts`: brightened pixels only, grown with hysteresis, each region an ellipse. Within 1.5 px of mid-exposure at 60/120/240 fps and 1, 0.5 and 0.06 of a frame's shutter; a long faint 1/60 s smear read 31 px off before the hysteresis. A new detector rather than `findStreaks`, which reads the unsigned difference and returns where the ball was as readily as where it is.
      - **What:**
        - `findStreaks` returns a streak's centre and its exposure length, and
          they feed `StruckFrame` candidates beside the round-blob finder;
        - a streak's centre is placed at the frame's mid-exposure time.
      - *Proof:* unit tests on synthetic smears at 60, 120 and 240 fps, and at
        three shutter lengths. The centre is within 1.5 px, and serve speed
        coverage does not drop against round blobs alone.
- [~] **N2.3 Impact from the sound** · M.
      - *Status:* 2026-10-22: measured, not adopted. With the strike heard to ±2.5 ms, readings went 7 → 7 at 60 fps and 28 → 28 at 120 (of about 50 each); at ±10 ms, 120 fps fell to 23. The impact search is not what limits coverage. Seen on the way: at 60 fps the plain range held the truth on 6 of 7, a small sample to watch when N2.1 reads 60 fps clips.
      - **What:**
        - when `audio/onsets.ts` finds a strike within the search window, its
          time, shifted by the learned offset (`fuse.ts`), replaces the ±40/+80
          ms impact search in `trackStruckBall`;
        - without a strike, the search stands.
      - *Proof:* the rig, with onset jitter of 2.5 and 10 ms, shows coverage
        gains at 60 and 120 fps, and range coverage stays at 95% or more.
- [x] **N2.4 Pixels from end to end** · M.
      - *Done:* 2026-10-22 (3643208). `serveSpeedPixels.test.ts`: a side-on phone renders the toss and the struck ball with drag; 5 of 6 serves at 120 and 240 fps read, every range held the truth, readings ran +1 to +5% high (worth a look in N2.1); 30 fps gives `frame_rate`. Takes about 20 s of the suite.
      - **What:** a test renders a toss and a struck ball (as a blob and as a
        streak) into bitmaps. It runs them through `findCandidates` and
        `findStreaks`, then `tossPath` and `measureServeSpeed`.
      - *Proof:* the test itself. The read lands within its range for 60,
        120 and 240 fps, and a 30 fps render gives `frame_rate`.
- [x] **N2.5 Every miss says how to get a speed** · S.
      - *Done:* 2026-10-22 (1cefbe7). `speedCopy.ts`, linted and number-free. The filming-guide line waits for N2.7: it would advertise a speed nobody can see yet.
      - **What:**
        - each `SpeedMiss` becomes a player sentence. For example:
          - `frame_rate`: "Film in slow motion to get a speed";
          - `view`: "Turn the phone sideways";
          - `not_found`: "I lost the ball after the hit";
        - the filming guide gains one line on slow motion for speed.
      - *Proof:* a unit test that every miss has a sentence; the copy lint;
        a test that no sentence contains a number.
- [x] **N2.6 Speed on the open-data clips** · S.
      - *Done:* 2026-10-22 (5d0e3f5). `/clipbench.html` has a speed column: a reading, its range, or the miss. Its table waits on a run on a quiet machine.
      - **What:** `/clipbench.html` gains a speed column: reading, range or
        miss for each clip.
      - Coverage is reported, not graded. None of the Commons clips is side-on,
        and none has a radar figure.
      - *Proof:* the bench runs and the table goes into `ANALYSIS-REVIEW.md`.
- [x] **N2.7 The speed on the report and the glance** · M. Owner's OK first.
      - *Done:* 2026-10-22, on the owner's OK ("worth showing serve speed"). `SpeedRow.tsx` under the hero: the best figure, the likely range with `Term` on "Likely", the range drawn on a short scale, and a km/h · mph switch that is remembered (`Prefs.speedUnit`; the locale's unit until then). The glance says it in one line; a miss is said only inside the report's fold. No status colour, and `speedCopy.test.ts` fails if anything that scores, grades or plans reads the speed. Render tests for a reading, a miss and none (`speedRow.test.ts`); checked at 375×812 in a browser, no console errors; the install screenshot recaptured. The old "no speed in mph, ever" rule is retired in `outbound.ts` and `ANALYSIS-REVIEW.md`.
      - **What:**
        - when a speed is read, one row sits under the hero: "About 150 km/h ·
          likely 138–162", drawn as a band on a short scale, with `Term` on
          "likely";
        - the glance shows the same in one line;
        - a miss shows only inside the fold, as its N2.5 sentence;
        - km/h or mph follows the locale, with an override in Settings.
      - *Proof:*
        - render tests with a reading, a miss and none;
        - a test that the speed never enters any score or band;
        - a 375×812 screenshot;
        - the copy lint.
- [x] **N2.8 Speed over time** · M. Needs N2.7.
      - *Status:* 2026-10-22: three of four parts done. `speedTrend.ts`: the newest trip against the one before it, said only when their ranges do not overlap (a trip's figure the middle serve, its range the middle of its serves' ranges, two readings at least, second serves left out); tagged first serves against second serves, a direction only when apart; and the fastest serve on record, which a serve takes only when its whole range sits above the holder's. On Progress as a "Serve speed" section. The record lives in `speedTrend.ts`, not `bests.ts`: the home screen loads `bests.ts` up front, and the record pushed the entry chunk to 385.03 kB against its 385 kB budget. Proof: `speedTrend.test.ts` (one trip, overlapping trips and overlapping sides say nothing; separated ranges say faster or slower; refused reports and second serves stay out; the record moves only on a clear range), the Progress render in `speedRow.test.ts`, and `fastestServe`, `speedByServeNumber` and `speedTrend` on the history-consumer list. **Not done: the session dashboard's best and median.** A session's light read skips the ball, and the speed needs the toss; reading the ball on every session serve would roughly double a session's reading time (91 seeks a serve to about 200). That trade is the owner's to make.
      - *Done:* 2026-10-22, the fourth part on the owner's call: session speeds as an opt-in on the plan, priced before the player chooses. `SPEED_READ_SAMPLES` is 60 seeks a serve on a light read of 91, about two-thirds more per serve read: the ball's pass from two frames before the toss to two after contact, priced at a second and a quarter of toss (the rig's is 28 seeks), and the speed pass over a quarter second round contact, priced at 60 fps. The plan sheet has "Without speeds" / "With speeds", off by default; each choice's time swaps to its price with speeds, and `speedCostLine` says the extra for each as the gap between the two rounded times shown, so the sentence and the figures always agree. The speed rides on the ball's pass (`skipBall` and `skipSpeed` both lifted for a speed read). Session reads now hand the engine the file's own frame rate (`knownFileFps`, read once with the stretch), where before every session serve would have been timed at 30 fps. The choice survives a reload (`normalisePracticeSession` keeps `withSpeed`), a stopped session prices what is left with speeds, and a malformed stored speed is dropped with its line kept. Each read serve keeps its speed on its line, and the dashboard says the fastest serve (the highest bottom of a range) and the typical one (two readings at least), or how to film for one when none came out. Proof: `sessionSpeed.test.ts` (pricing, the plan sheet, the reload, the line, the summary, the dashboard, and the driver asking every read for speeds only when chosen); checked at 375×812 in a browser through `?demo=session&plan` and `?demo=session`, no console errors.
      - **What:**
        - Progress shows a speed trend only where two trips' ranges do not
          overlap. That is the same gate idea as `secondServeSlower`;
        - first-serve against second-serve speed;
        - a fastest-serve record in `bests.ts`, held as a range;
        - the session dashboard shows the best and the median.
      - *Proof:* unit tests (overlapping ranges say nothing; separated ranges
        say "faster"; a single trip says nothing); history-consumer list
        updated.
- [x] **N2.9 Heights in metres from gravity** · M.
      - *Done:* 2026-10-22 (5d0e3f5). Where the toss's own ruler is within 8%, contact and toss heights are stored in metres as readings; about 1% off on the rig. Stored heights are shape-checked on read.
      - **Why:** this needs no slow motion and no assumed body size.
      - **What:**
        - where `tossPath`'s `scaleError` is under 8%, the toss height above
          the hand and the contact height are given in metres, as readings, not
          grades;
        - otherwise the 1.78 m body scale stands, and the card says which ruler
          it used.
      - *Proof:*
        - `bench:mocap` checks contact height against the Bath marker heights,
          and the error is stated;
        - a rig test across zoom and tilt dials.
- [~] **N2.10 Speed from the sound of the bounce** · S spike.
      - *Status:* 2026-10-22 (98b4dce): measured, not adopted. 20% median error and 38% worst against the 10% bar, from drag and the unknown bounce depth. The table is in `ANALYSIS-REVIEW.md`.
      - **What:** the time from strike to bounce, with court geometry, gives an
        average speed. This item measures only how wide its error is on the
        rig, with unknown bounce depth and sound delay.
      - It ships only if the error is under 10%, and then only as a cross-check
        on N2.7, never as a reading on its own.
      - *Proof:* a rig table in `ANALYSIS-REVIEW.md`.
- [x] **N2.11 A short track pinned to the toss** · M.
      - *Done:* 2026-10-22. Where the free fit needs five sightings of the struck ball, `SHORT_SAMPLES` reads three, with two more rows from where the toss had the ball at impact (`TossPath.anchorError`) and the moment of impact searched for, its range taken across every moment the samples allow. Candidates within `SEPARATION` (0.3 m) of the toss are left out, since the racket is there too: without that, a racket point read a serve 17% slow inside a range of 9%. Four samples are tested one out; three have no row to spare. Only for tracks the free fit could not take. Real-time clips are now read down to `LOWEST_FPS` (24).
      - *Proof:* `serveSpeed.test.ts`, from the speed placement at 30 and 60 fps with decoys: the range holds the truth 98.8%, p95 error 4.5%, worst 8.3%. From rendered pixels (`serveSpeedPixels.test.ts`) 60 fps read 4 of 4 and 30 fps 1 of 4, every range holding the truth. Decoys alone never read, now at 30, 60 and 240 fps.
- [x] **N2.12 Still points are not the struck ball** · S.
      - *Done:* 2026-10-22. A candidate found in the same place on another frame is dropped before the search: a ball lying on the court on the struck ball's path read a pinned serve 41% fast. It also lifted slow motion: 83 of 240 read against 76, p95 error 4.5% against 5.3%, and a rendered 240 fps serve that was `not_found` now reads 42.7 for a true 42.
- [x] **N2.13 A placement for a speed** · S.
      - *Done:* 2026-10-22. `SPEED_PLACEMENT`: the phone on its side, six to seven metres back, with the player in the half of the picture away from the net. Measured on the simulated launches: 30 fps from 3% of serves to 44%, 60 fps from 19% to 79%, 120 fps from 56% to 83%, the range holding the truth 97–100%. A new rule in the filming guide, and the `not_found` and `frame_rate` lines now say how. The guide's own upright placement is unchanged: it is the right one for the body, and an upright clip almost never gives a speed, which the guide now says.

### Wave N3 — Show what is already computed
- [x] **N3.1 What your misses have in common** · S.
      - *Done:* 2026-10-22 (e55a59d). Under first and second serves on Progress; `missesInCommon` is on the history-reader list.
      - **What:** `missesInCommon` (`progress.ts:1617`) gets a line under first
        and second serves on Progress, behind its existing gates.
      - *Proof:* a render test with seeded tags that pass the gates, and one
        where noise renders nothing.
- [x] **N3.2 Sets you can look back on** · S.
      - *Done:* 2026-10-22 (e55a59d). `bestSetLines` in the Progress records; "· best 7" on the glance's set chips.
      - **What:** `bestSet` (`sets.ts:95`) goes into the Progress records, and
        the glance's "Start a set" chip shows your best and today's target.
      - *Proof:* render tests.
- [x] **N3.3 Before and after, in the app** · M.
      - *Done:* 2026-10-22 (2b9be73). `beforeAfter` in `graduationCard.ts`, drawn by `FixedPair`: a "Fixed lately" section on Progress, and on the glance once a trip passes its step. Not on the report: the glance is where a step is passed.
      - **What:** when a drill check passes or a fault graduates, the report
        shows the old focus moment beside today's, through `MomentPair` and
        `graduationCard`.
      - *Proof:* a render test on seeded history; a `?demo=history`
        screenshot.
- [x] **N3.4 The glossary everywhere** · S.
      - *Done:* 2026-10-22 (2b9be73). `termSpans` + a lazy `TermCue` on the glance's why line and the week plan's check lines. The session dashboard's lines hold no glossary word, so it was left. Only four words are in the glossary; adding words is content work, not done here.
      - **What:** `Term` on fault titles and drill names in the glance, the
        week plan and the session dashboard.
      - *Proof:* a test that every glossary id in player copy renders as a
        `Term` wherever it appears.
- [x] **N3.5 History by trip** · S.
      - *Done:* 2026-10-22 (94f8edd). `HistoryList`: trips newest first, each with its count and median. Practice sessions are still listed on Home only.
      - **What:** rows are grouped by trip with the trip's median, and session
        rows sit in the same list.
      - *Proof:* a render test.
- [x] **N3.6 Sessions you can find** · S.
      - *Done:* 2026-10-22 (aa4e538). A Home strap once there is a report and until there is a session, and the guide's third rule.
      - **What:** a Home strap and a guide line: "Film a whole practice with
        your camera app, then pick it."
      - *Proof:* a render test; the copy lint.
- [x] **N3.7 The download offered at first run** · S.
      - *Done:* 2026-10-22 (aa4e538). `FirstRunDownload` on the first-run sheet, lazily loaded.
      - **What:** when the engines are not stored, the guide sheet gets one
        line with the size, a Wi-Fi note and the button. This complements M1.3.
      - *Proof:* a render test, in both the stored and the unstored state.
- [x] **N3.8 A target on the toss map** · S.
      - *Done:* already there: L4.7 (acab9f4) draws `TOSS_TARGET` as a dashed band. The review missed it.
      - **What:** draw the front-foot band the toss ladder aims for.
      - *Proof:* a geometry unit test; a preview screenshot.

### Wave N4 — Look and feel, inside the skin
- [x] **N4.1 The player drawn as well as the model** · M.
      - *Done:* 2026-10-22 (50e4046). The tracked body was already drawn with L4.4's tapered limbs; it looked thin because each still fitted the whole frame. Stills and the then-and-now pair now use `fitBody`; unsure joints draw faded (`splitBones`). Found on the way: `fitBody` squashed 16:9 bodies sideways by the aspect — fixed, so the moment pair's player half is in proportion now.
      - **What:** the tapered, filled limbs from L4.4 are used for the tracked
        body in `PoseStill`, `PosePlayer` and `MomentPair`.
        - Joints the tracker was unsure of are drawn faded, not invented.
        - The six-moment stills crop to the body, so the figure fills its tile.
      - *Proof:*
        - a unit test that a low-confidence joint is drawn faded;
        - a crop test that the body fills at least 70% of the tile height;
        - before and after screenshots at 375×812;
        - the report chunk grows by under 2 kB.
- [x] **N4.2 A lighter report** · S.
      - *Done:* 2026-10-22 (see the N4.2 commit). The focus card had seven top-level blocks already (L4.1); the drill check now leads it. "Then, in this order" and the practice card were left as they are: both already compact.
      - **What:**
        - a drill-check result, when there is one, leads the focus card;
        - "Then, in this order" folds to titles;
        - the practice card hides when it repeats the focus (with N0.2).
      - *Proof:* a render test caps the focus card at 8 visible children.
- [x] **N4.3 Progress as pictures** · M. Lazy.
      - *Done:* 2026-10-22 (d374ab2). `ProgressCharts.tsx`: a fault strip (dot per judged serve) and in-rate bars, each with a text version; four prose sections fold. The tiles were left as they are rather than turned into doors.
      - **What:** the tiles become doors to four groups: Path, Records, Serves
        and Charts. Each group leads with a chart:
        - the score over trips, with noise bands;
        - a strip showing when each fault appeared and cleared;
        - in-rate by serve.

        The prose sections move into `details`.
      - *Proof:*
        - a render test shows 7 or fewer sections open;
        - the chart geometry is unit tested, like `trendGeometry.ts`;
        - screenshots;
        - every chart has a text alternative.
- [x] **N4.4 Signposts you can read** · S.
      - *Done:* 2026-10-22 (2c9ccd7). Six overline classes at 12 px in `--fg-muted`; held by `wordsInChrome.test.ts`.
      - **What:** overlines that carry meaning move to the muted token at
        12 px: "Work on this next", "Then, in this order", "Your form". This is a
        contrast fix, not a re-tone.
      - *Proof:* `contrast.test` asserts 4.5:1 for every overline class; the
        floor test gains a 12 px rule for those classes.
- [x] **N4.5 One placement rule** · S.
      - *Done:* 2026-10-22 (2c9ccd7). The viewfinder and the triage refusal now take `PLACEMENT.where`; `placement.test.ts` holds all four sources to it.
      - **What:** the guide, the viewfinder cue, the report hints and the
        refusal hints all take their wording from `PLACEMENT`.
      - *Proof:* a copy test that the placement phrases match across all four.
- [x] **N4.6 Motion with a purpose** · S.
      - *Done:* 2026-10-22. `withTransition` (View Transitions API) from glance to report on a shared `score-ring` name; the ring fills only on a live report; under reduced motion the count-up starts at the score instead of flashing 0.
      - **What:**
        - the score ring fills once, on a live report only;
        - the glance hands over to the report with a shared-element move of the
          ring;
        - both are off under `prefers-reduced-motion`.
      - *Proof:* a render test that reduced motion gives the final state on
        the first frame; a preview check.

### Wave N5 — Truth a machine can lift
- [x] **N5.1 A toss finder for portrait and oblique** · M.
      - *Done:* 2026-10-22 (db19cd4). A player filling a portrait frame gets the full-width band above the shoulders at a sharper read; `tossRegion.test.ts` holds both shapes. The noisy-bench false-naming gate stays green.
      - **Why:** the toss column is tied to a side-on body, and portrait clips
        lose the ball.
      - **What:** the search column widens with the camera angle the engine
        already estimates, and in portrait it follows the tossing hand's path.
      - *Proof:*
        - rig sweeps over view angle and orientation show toss-found rates
          before and after;
        - Bath virtual-phone placements show no new false tosses;
        - the noisy-bench false-naming gate stays at 2% or below.
- [x] **N5.2 Ball coverage on every bench** · S.
      - *Done:* 2026-10-22 (db19cd4). `/clipbench.html` reports toss, struck-ball and speed coverage per clip. The standing table waits on a run on a quiet machine.
      - **What:** `/clipbench.html` and `bench:mocap` report the share of serves
        with a toss found, a struck ball found, and a speed. This becomes the
        standing coverage table in `ANALYSIS-REVIEW.md`.
      - *Proof:* the table itself, re-run in the same commit as any change to
        ball finding.

### Combined order of play (Lift and Notch)
1. **N0.1–N0.6** together: small, and the player meets them on day one.
   **N0.7** alongside.
2. **Lift M1.1 and M1.4.** These are the real timings every later budget is
   measured against, including N2.1's.
3. **N1.1, N1.2, N1.3, then N1.4 and N1.8.** The on-court loop.
4. **N3.1–N3.8.** Quick wins, mostly render tests.
5. **Lift M1.2,** the worker, **then N2.1–N2.6**: the speed engine, measured
   but not shown.
6. **The owner decides on showing a speed.** On a yes, **N2.7 and N2.8**.
   **N2.9** goes either way.
7. **N1.5, N1.6, N1.7,** then **N4.1–N4.6.**
8. **Lift M1.3, M2.1, M3.1, M3.2, N5.1, N5.2.**
9. **N1.10 and N2.10** if there is room.
10. **Lift M4 and M5** last. M4.1 is the gate a first public build passes
    through.

### The owner's call, added by this programme
- **Showing a serve speed at all.** It reverses a written rule.
- **A radar-checked serve.** One filmed serve with a radar reading would move
  the speed from `UNCALIBRATED` to checked. A machine cannot do this.
- The Lift programme's list stands: real players, a remote, hosting, egress,
  and the COCO download.

---

## Court programme (C0–C6) — 2026-10-23

From the design blueprint: the court surfaces designed for the distance they
are read from, in the settled skin, and speed drawn as ranges. Each item was
proved by machine. None of it has run on a phone: the camera, the tones and
the vibration were checked in desktop Chrome with a fake camera.

- [x] **C0 Split stylesheets on a budget** · S.
      - *Done:* 2026-10-23. `bundle.test.ts` measures every stylesheet a lazy
        chunk splits off, 6 kB gzip together (1.93 now). The viewfinder's rules
        moved from `guide.css` to `court.css`, and the speed row's from
        `report.css` to `speed.css`. Entry sheet 13.97 → 13.60 kB.
- [x] **C1 A verdict readable from the baseline** · S.
      - *Done:* 2026-10-23. A band at 2.6% of the picture's width replaces the
        3 px border, the badge is a tenth of the width, and the countdown is a
        third of it (it had never been styled). Serve pips appear on a basket.
        Checked in the browser with a fake camera.
- [x] **C2 Tones and a tap** · S.
      - *Done:* 2026-10-23. `earcon.ts` plays armed, recording, served and
        stopped in hands-free mode, and the record tap vibrates where it can.
        Not on the egress list: an oscillator sends nothing.
- [x] **C3 The loop with no taps** · M.
      - *Done:* 2026-10-23. `shouldRearm` is pure and tested on rig traces
        (standing, bouncing, a serve, walking out). The glance goes back to the
        camera after `BACK_TO_CAMERA_S` with "Stay here". It has a court mode
        with one big figure, and it speaks the speed first.
- [x] **C4 A speed placement for the framing judge** · S.
      - *Done:* 2026-10-23. "Your swing" or "A speed" on the viewfinder.
        `too-far` is quiet in the speed placement and an upright phone is told
        to turn. A test holds that no refusal moves with the placement.
- [x] **C5 Speed by trip, as ranges** · S.
      - *Done:* 2026-10-23. `speedByTrip` feeds both the bars on Progress and
        `speedTrend`, so the picture and the sentence cannot disagree. The
        report's band grows out from its best figure.
- [x] **C6 The struck ball on the replay** · S.
      - *Done:* 2026-10-23. `ServeSpeed.path` keeps the samples (rounded,
        validated on load, and a damaged path is dropped while the reading is
        kept). `drawStruckBall` draws them from contact on, with the reading on
        a plate. The demo's path is drawn by hand, because the rig flies no
        ball.
- [ ] **C7 The chain timeline following the scrubber.** Not started: on the
      report the timeline sits far from the player, so a synced playhead buys
      little until the two share a screen.

## Review fixes (Q1–Q7) — 2026-10-23

From the graded review of 2026-10-23: three small fixes a first player hits on
the report and in the filming guide. Each was proved by machine and looked at
in the browser at phone width on `?demo=basket`. Taking the hip–shoulder coil
off the graded card was the fourth. It was backed out here because the
diagnosis's open-chest fault reads the same band, and it runs as its own item
on its own branch (Q4).

- [x] **Q1 The fix is the report's headline** · S.
      - *Done:* 2026-10-23. The `h1` is `plan[0].title` under "Work on this
        next", with its why, and the band is a one-line caption to the ring
        (`VERDICT` is four strings now; the sub-lines went, one of them pointing
        at "the first fix below"). The focus card is headed "How to fix it" and
        opens on the drill check. A read under `SOFT_READ` says "Rough read"
        beside the score rather than only in the fold, except on a refused clip
        shown anyway, which has its banner. Two checks in `render.test.ts`.
- [x] **Q2 One first priority per report** · S.
      - *Done:* 2026-10-23. The season's practice card shows on the report
        only when it agrees with `plan[0]` (its drill or its label), and then
        always as `sameAsFocus`. The demo basket had "Work on this next: tossing
        arm" over "Practise this: knee bend at trophy"; the card is gone from
        it and stays on Progress. Matching a later plan item no longer counts
        on the report (it did since N0.2). One check in `render.test.ts`.
- [x] **Q3 The phone may turn, and the guide says when** · S.
      - *Done:* 2026-10-23. The manifest's `orientation` is `'any'`: locked
        to portrait, an installed Android app would not follow a phone turned
        for the speed placement or the court mode. The filming guide's step 2
        says "For the swing, stand the phone upright", and step 5 calls itself
        "the exception to step 2". They used to read as two flat orders that
        disagreed. Checked in the guide sheet at phone width; nothing on a
        phone yet.
- [x] **Q4 The coil is a reading, and the open chest has its own band** · S.
      - *Done:* 2026-10-23. "Shoulders turned past the hips" left
        `METRICS` and Loading's `metrics` for `READINGS`, so it is shown and
        no longer scores, heads the card or draws a target figure. Its noise
        floor (30°) was as wide as its 8–38° band. `SIGNALS.separation_deg`
        lost its card pairing (`CARD_SIGNAL`) and stands on real motion
        (`MOTION_SIGNALS` in `bands.test.ts`). The band's floor came down from
        8 to 5, because the forty Bath serves read 5.7–17° on this signal from
        every corner and end at 30 and 60 fps, four of them under 8. The rig's
        open chest (−44) is named at every rung. The noise floor stays 30, so a
        fault is named from −25, not −22. At sixty seeds from 45°, a chest 22°
        open is named on 25 rather than 31, 26° open on 41 rather than 46, and
        45° open on 54 at both. A level trunk is named on none. The checks that
        named an open chest now use hipYaw 116 (−30), not 108 (−22).
        `realChange.ts` was re-derived at 24 and 60 seeds. Loading went 17 → 10
        (9 and 8 measured), the trip 10 → 11, and the overall read differently
        14 → 15. Every other floor held. The coil's `CARD_NOISE_SD`,
        `ROW_CHANGE`, `FLAW_READING` and copy-claim rows went, and so did the
        coil's target figure (no band, so nothing to aim at). The scoring
        version stays 5, which has not shipped.
- [x] **Q5 No graded band narrower than its noise** · S.
      - *Done:* 2026-10-23. `bandNoise.test.ts` holds every graded card row
        to one rule: a serve at the middle of its band reads inside it on 95%
        of takes, so the half-width must be at least 1.96 × `CARD_NOISE_SD`.
        Every row clears it but arm extension (1.08 of what it needs: 9.63° of
        one-sided noise near a straight elbow, on a 35° band). It is `KNOWN`
        and stays graded on its four studies; steadying the reading is its
        fix, and the check fails when it clears. Load ratio is the next
        closest at 0.90. The test also fails if a row is graded with no
        measured noise (only the three ball rows may be), or if the noise
        table keeps a row the card no longer grades.
      - *Considered and not built:* gating the grip fault harder and grading
        the toss in front, both from the review. The tray already needs a
        second witness, the arm read from the shoulder, elbow and hip (L5.2),
        and is named on at most 2.5% of noisy skilled takes
        (`trackerNoise.test.ts`). A toss that isn't in front is already named
        at contact as `contact_behind`, on a cited band, with its own ladder.
- [x] **Q6 On court by default, and no dead end without a preview** · S.
      - *Done:* 2026-10-23. On a touch screen, hands-free and "Read it aloud"
        start on for a player who has set neither (`onCourtDefault` in
        `handsFree.ts`); a saved setting wins either way, and nothing is
        written until the player changes one. Speech is still unlocked by the
        record tap. Where the preview is unsupported, refused, unknown or has
        no camera, the viewfinder offers "Film with your camera app": the sheet
        closes and Home's `capture` input opens. A busy camera or a coach still
        downloading gets no such offer, because the camera app would not help.
        Three checks in `handsFree.test.ts`. Checked in the browser with touch
        emulation: both toggles on and "Start hands-free" with a fake camera,
        and the button closing the sheet and opening the camera input when
        the camera is refused. Not run on a phone.
- [x] **Q7 The viewfinder readable from the baseline** · S.
      - *Done:* 2026-10-23. Inside the skin, in the lazy `court.css`: the
        framing cue is 18px (was 16); the viewfinder's segments and toggles
        are 14px (were 12–12.5), and its segments 39px tall; its footnote is
        13.5px in the muted grey (was 12.5px, faint). In `player.css`, every
        segmented control's unpicked option is muted rather than faint, and
        each item takes a 44px press, growing only up and down so neighbours
        never overlap. The entry stylesheet grew by the hit-area rule alone.
        `wordsInChrome.test.ts` now holds `.seg-item`, `.framer-cue` and
        `.framer-foot` to the readable-label rule. Measured in the browser with
        touch emulation and a fake camera; not run on a phone in sunlight.
