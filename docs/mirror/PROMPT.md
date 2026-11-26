# Mirror: where the app stands, and the prompt for the next programme

Written 2026-11-26, after Elevate closed (12354377) and the laptop court
screen that followed it (E5.7, 9d0a443d). Part 1 is what the scores, the
tour and the shots say now. Part 2 is a prompt to paste into a fresh session
to run the programme.

---

## Part 1. Where it stands

### The scores

Elevate scored 23 screens from 1 to 10 on seven questions ("How a screen is
scored" in `docs/elevate/LEDGER.md`). After E5.7 the means and the lowest
screens are:

| Question | Mean | Lowest screens |
|---|---|---|
| Purpose | 8.1 | Progress, a practice video checked, the basket, a guided set passed (7) |
| Action | 7.8 | The sample report, the report after a drill (6) |
| That's mine | 5.9 | The sample report, the lesson sheet (4); the landing, checking a clip, the session sheet, a practice video (5) |
| Width | 6.9 | Checking a clip, a practice video before checking, the refused court screen (5); the sheets, Settings, the filming guide (6) |
| Words | 7.3 | The court screen with a strain warning, a guided set passed (6) |
| Visuals | 5.7 | A practice video before checking (3); the camera's first-time card, the session sheet, the refused court screen (4) |
| Taps | 9.0 | The filming guide, the lesson sheet, a practice video (7) |

Purpose, action and taps are close to done. The gap is pictures: the player
sees too little of their own serve, and several screens have no picture at
all.

### What the tour and the shots show

**Screens with no picture**

1. *The camera's first-time card* gives three rules in words over a dark
   camera. The filming guide already draws where the phone goes
   (`PlacementDiagram` in `FilmingGuide.tsx`); the card doesn't use it.
2. *A practice video, before checking*, offers "a sample of 12: five from
   the start, two from the middle and five from the end" in words, with no
   picture of the video at all.
3. *Today's session sheet* is a list of minutes and drill names. None of the
   drills is shown.
4. *A refused clip* is words only, even when the reason is where the phone
   stood, which a picture settles at once.
5. *Checking a clip* shows the model figure, lit where the current step is,
   while the player's own clip sits on the device.

**The player's own serve**

6. *The sample report* is the synthetic rig (`showExample` in `App.tsx`
   builds it from `sampleAnalysis(DEMO_DIALS.example)`). Meanwhile the
   landing plays a licensed real serve with its own read
   (`public/landing/serve.mp4` and `serve.json`). The first report a visitor
   sees is a mannequin's.
7. *The lesson sheet's* "This fault" is the model doing the fault, beside
   "The fix" on the model. The player's own serve at that moment isn't on
   the sheet.
8. *The laptop court screen* (E5.7) draws the player's figure. For a fresh
   recording the clip itself is in the app's view (`videoUrl` on the
   `glance` view in `App.tsx`), but it isn't handed to the screen.
9. *The demo routes have no real footage.* The report's clip is a rendered
   rig, so the tour can't score the screens that show a player's clip.
   That's why "that's mine" moved least in Elevate.

**One main action**

10. *Player controls are lime fills.* The report's play button
    (`watch-play`) and the lesson's pause sit beside the screen's main
    action. The tour counts two lime actions on the laptop report, the
    report after a drill and the basket.
11. *On a phone's Today,* the tab bar's Film tab is a lime fill beside
    "Start today's session".
12. *The tour counts lime controls under an open sheet* as the sheet's own,
    so every sheet's count (2 or 3) is wrong.

**Width**

13. *The lesson sheet, the session sheet and Settings* are a phone-width
    dialog in the middle of a laptop, over a blurred screen.
14. *The refused court screen on a laptop* is short words in one pane
    (width use 0.37 to 0.43).

**Room**

15. The entry chunk is 382.60 of 385 kB raw, and the split stylesheets are
    19.61 of their 20 kB. The entry stylesheet has room (8.89 of 14 kB).
    Every new picture must load with its own screen.

---

## Part 2. The prompt

Paste everything below the line into a new session in this repo.

---

You're leading the next programme for **Serve Coach**, a tennis-serve coach
that reads one phone clip entirely on the device. It's mature: the engine,
coaching and loops work, 2,474 checks pass, and Elevate has lifted how it
flows, explains and reads. This programme, **Mirror**, is about pictures.
Wherever the app talks about the player's serve, the player should see their
own serve. Wherever a screen explains something in words that a picture can
say honestly, it should show it.

### Read first

1. `STATUS.md`: what works, what's open, how to work here.
2. `DESIGN.md`: the visual source of truth (Floodlit). It overrides any
   taste skill.
3. `docs/mirror/PROMPT.md` Part 1: the review this prompt comes from.
4. `docs/elevate/LEDGER.md`: how a screen is scored, the close's table
   (E5.6) and the laptop court screen (E5.7).
5. The memory notes on copy, design and scope, if your harness loads them.

### Non-negotiables

- **Raise the skin, never replace it.** Dark ground, one lime accent,
  Archivo, rounded and elevated. Two re-skins were built and rejected. Lime
  means "this is the thing": one main action per screen. Coral (`--work`)
  is what I saw; lime is where to get to.
- **Pictures are honest.**
  - Draw the player's body or clip only from what the engine read, at a
    moment it read.
  - A demonstration on the model says it's the model.
  - A picture of a plan or a placement (where the phone goes, which serves
    a sample takes) is a diagram, not a reading, and never looks like one.
  - A refusal whose reason isn't about the camera gets no picture.
- **Pictures load with their screen.** Load them lazily. A picture drawn
  only on a laptop loads only on a laptop: a phone never fetches what it
  doesn't draw.
- **Serves only.** Other shots are left out and counted, never graded.
- **Nothing leaves the device.**
  - No new network calls, analytics or accounts. Payments stay off.
  - One exception, for M0.1: a file the app doesn't ship yet (the landing
    serve's stored report). Serve it from the app's own host, the way the
    landing serves its card, fetched only when its screen opens, with
    `egress.test.ts` still passing.
- **Machine-provable work only.** No step may wait on filming, a coach
  panel or testers. Prove things with the synthetic rig, the benches, the
  demo routes, the landing's licensed clip and browser screenshots.
- **Honesty holds.** Never grade an unsupported reading. A speed always says
  "about" with its range. Soften refusals by lowering confidence, never by
  lowering the bar.
- **Copy rules** (`voice.ts` lints them):
  - Plain words for a recreational player, first person "I", contractions
    with the curly apostrophe.
  - At most 25 words and two sentences per string. No "very", "just" or
    "a little".
  - A visit is a "session", and the app "checks" a serve. "Drop" means
    only the racket drop. Ranges are written "76 to 86".
  - Every picture has words: a caption, or a label a screen reader says.
- **Budgets:**
  - The entry chunk is 385 kB raw and 132 kB gzip. The split stylesheets
    are 20 kB. Make room before adding.
  - Run `npm run build` before trusting a size figure.
- **Gate before every commit**, chained so a failure stops it:
  `npm run typecheck && npx eslint . && npm run build && npm test`.
  Change `SCORING_VERSION` only by its rule.
- **Commits:**
  - One per ledger item, committed as
    `44911368+urbantorque@users.noreply.github.com`, ending
    `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Push `main`, then `main:apex`. Pages deploys from `main`; check the live
    site after each wave.
- **Look before you report.** Shoot every visual change with the tour at
  390x844 and 1440x900. Look at the shots, read the console, run the
  web-design-guidelines review on the changed files, and finish with
  `playwright-cli close-all`.

### Wave 0: real footage and a baseline

1. **M0.1 A real report to measure against.**
   - Extend `scripts/landing-serve.mjs` so the engine's read of the licensed
     landing clip is also saved as a stored report (for example
     `public/landing/report.json`).
   - Add the dev routes `?demo=real` (the report) and `?demo=real&glance`
     (the court screen), which open it with `serve.mp4` as its clip.
   - If the trimmed clip isn't a whole serve the engine reads, record that
     and use what it does read. Never fake a read.
   - Add both screens to the tour.
2. **M0.2 A sheet's own count.** Teach the tour to count lime actions only
   in the top layer (an open sheet or dialog). Record which counts change.
3. **M0.3 The baseline.** Shoot set `m0` at both sizes, 25 screens. Score
   the two new screens. Carry the rest from E5.7's table, rescoring only
   where a shot differs.
4. **M0.4 Make room.** Free room in the entry chunk and the split
   stylesheets, and record how much. A picture's styles go in its own
   chunk's sheet or in the entry sheet's room, never in a split sheet at its
   budget.

### Wave 1: one main action

- **M1.1 Play isn't the main action.** The report player's play button and
  the lesson's play and pause become the quiet control, keeping their size,
  keys and focus ring.
- **M1.2 The phone's Film tab.** Decide it by DESIGN.md's rule, one lime per
  screen. For example, the tab steps back to an outline where the screen's
  main action is something else, and stays lime where filming is the main
  action.
- **M1.3 The report's first screen** shows 18 to 21 controls on a laptop
  (7 or 8 on a phone). Fold or quieten what isn't the next step, and count
  before and after.

Prove the wave with the tour: one lime action on every screen at both sizes
(none while checking and on the practice plan, which wait on the player).

### Wave 2: pictures that explain

- **M2.1 The camera's first-time card:** the placement diagram above the
  three rules, and the rules cut to what the picture doesn't say.
- **M2.2 A refusal shows its fix when the reason is the camera.**
  - Not side-on: the placement diagram.
  - Body or racket out of the picture: a frame drawn round a figure, with
    the feet and racket inside it.
  - Other reasons (too short, too dark): words only.
  - Keep a table in code from reason to picture or none, tested so every
    reason is decided.
- **M2.3 A practice video, before checking:** draw the video as a strip
  with its length. Mark where the sample's twelve picks fall, and show
  "every serve" as the whole strip. "With speeds" adds its minutes on the
  same picture.
- **M2.4 Today's session sheet:** each drill row carries its key position,
  small, from the lesson's own fix pose. The check row carries the player's
  last serve at the drill's fault.
- **M2.5 Checking a clip:** as soon as the first frames are read, show the
  player's clip with the body found so far, in place of the model. The
  step's words stay.

### Wave 3: the player's own serve

Wave 3 needs M0.1: without real footage the tour can't score it.

- **M3.1 The sample report is the landing's real serve.** Use M0.1's stored
  report with its licensed clip, credited as on the landing and labelled as
  a sample. The rig stays for the demo routes.
- **M3.2 The laptop court screen holds the player's own clip** at the fix's
  moment when it has one (pass `videoUrl` from the glance view), and the
  figure otherwise. Prove it on `?demo=real&glance`.
- **M3.3 The lesson sheet's "This fault" is the player's own serve** at the
  fault's moment, the part painted, beside the fix on the model. The model's
  fault stays where the player's serve didn't read it. Each caption says
  whose serve it is.
- **M3.4 A practice video and the basket show serves, not rows:** each serve
  as a small figure at its own fault, by the serve cards' rules
  (`cardScents`).

### Wave 4: the laptop

- **M4.1 The lesson and session sheets on a laptop:** a wider dialog in two
  panes, the picture left and the steps right.
- **M4.2 Settings on a laptop:** the sections in two columns.
- **M4.3 The filming guide on a laptop:** the diagram and the model serve
  left, the rules right.
- **M4.4 The refused court screen on a laptop:** M2.2's picture takes the
  left pane where there is one.

### Wave 5: words, purpose and the close

- **M5.1 The court screen says why once.** The "why" shows the first time a
  fault comes up in a session; after that, the fix alone. Cut the strain
  and passed-set screens' first-screen words, and count before and after.
- **M5.2 One answer first.** Progress, the basket and a practice video each
  lead with one answer from what they already compute ("The fault was gone
  on 8 of 12"), with the list under it.
- **M5.3 The close.** A final tour, every screen rescored, `STATUS.md`
  updated, and each wave's before and after sheet linked from the ledger.

The aim, judged against the shots rather than promised: visuals and "that's
mine" at 6.5 or more, width at 7.5 or more, and one lime action on every
screen by the tour's count.

### How to work

- Keep `docs/mirror/LEDGER.md`: one line per item with its wave, what it
  turned out to be and how it was proved. A measured "not adopted" is a
  result.
- Shoot with the tour as it is (`node scripts/tour.mjs <set>`, the dev
  server on 5180). Name the sets `m0` to `m5`; they sit beside Elevate's in
  `docs/elevate/gallery/`, so any two can be set side by side.
- Work in waves. Finish, gate, commit, push and check the live site before
  the next wave.
- When an item needs the owner (a price, a domain, egress, footage), write
  it in `docs/next/OWNER-STEPS.md` and move on.
- Report each wave with the before and after shots side by side, the score
  changes, and what you didn't verify. In particular, nothing here has run
  on a real phone.
