# Elevate ledger

The programme in `docs/elevate/PROMPT.md` (Part 2), started 2026-11-26 from
`main` at 68e8910. One line per item: its wave, what it turned out to be, and
how it was proved. A measured "not adopted" is a result. Items are numbered by
wave, E0.1 onward; each is one commit, gated
(`npm run typecheck && npx eslint . && npm run build && npm test`).

The galleries are `docs/elevate/gallery/index.html`, opened from disk: pick any
two sets to see them side by side, at 390 by 844 or 1440 by 900. Each set is
one run of `node scripts/tour.mjs <set>` against the dev server.

## How a screen is scored

Each main screen, 1 to 10, from the tour's shots at both sizes:

- **Purpose**: one clear purpose (DESIGN.md's first test).
- **Action**: one main action, and lime only on it (the second test).
- **Mine**: a player's first reaction is "that's mine" (the third). A dash
  where the screen holds nothing of the player's (a settings sheet, a card of
  rules).
- **Width**: on a laptop it uses the width (the fourth). The tour logs how much
  of the width past the rail carries words or pictures on the first screen
  (`widthUse`): a phone column alone in the middle reads about 0.4.
- **Words**: plain, short, no repetition, no admin, leads with what to do.
- **Visuals**: how much the pictures explain on their own.
- **Taps**: taps to the next useful thing, scored 10 for none (it comes to the
  player), 9 for one, 7 for two, 5 for three, 3 for more. The count is beside
  the score.

The scores are judgement against the shots, made by the same reader each wave
from the same tour. The tour's own measures (screens tall, words on the first
screen, lime actions on the first screen, text under 14 px, sideways scroll,
width use, console errors) are machine figures and sit in each set's
`log.json`.

## Wave 0: a baseline to measure against

- [x] **E0.1 A committed screen tour.** `scripts/tour.mjs` visits 23 states
  through the demo routes and the app's own taps (the landing, the sample
  report, the camera's first-time card, the filming guide, a real clip being
  checked, a fresh, reopened and after-a-drill report, the lesson sheet, Today,
  today's session sheet, Progress, Settings twice, the court screen five ways,
  a guided set twice, a practice video before and after, and a basket), at
  390 by 844 (touch, 2x) and 1440 by 900, and writes each shot, a whole-page
  shot where the page is longer than a screen, and the page's own measures
  into `docs/elevate/gallery/<set>/`, then rebuilds `index.html`. MediaPipe's
  own log lines are kept but not counted as the app's errors. `--sheet a b
  size` renders two sets side by side as one picture. Proved by the run: set
  `w0`, 46 shots, none failed, no console errors from the app. Shot at
  68e8910; the laptop shots from Today on were taken with E0.3's icon split
  already in the working tree, which draws the same pixels.

- [x] **E0.2 Every screen scored.** The baseline below, from set `w0`.

| Screen | Purpose | Action | Mine | Width | Words | Visuals | Taps | What holds it back |
|---|---|---|---|---|---|---|---|---|
| 01 Landing | 9 | 8 | 5 | 7 | 7 | 5 | 9 (1) | The real serve plays with no fault drawn on it; the peek card's "Hitting elbow at drop" is jargon; "Download it now" is a second lime thing. Laptop: the right pane is empty under the words. |
| 02 Sample report | 8 | 6 | 4 | 7 | 6 | 6 | 9 (1) | The title is restated by the next sentence; "What to do now" and "Film your serve" pull two ways; laptop has two lime actions. |
| 03 Camera's first-time card | 9 | 8 | – | 6 | 9 | 4 | 9 (1) | Words only: the set-up is not drawn, though the filming guide has the drawing. "Upload a video instead" is a second lime thing. |
| 04 Filming guide | 9 | 8 | – | 6 | 7 | 8 | 7 (2) | "very fast" (filler the voice lint bans); five long steps before the one action. |
| 05 Checking a clip | 9 | 9 | 5 | 5 | 6 | 6 | 10 (0) | Says what it is doing but never how long; the figure is a model, not the player. |
| 06 Fresh report | 8 | 6 | 7 | 8 | 6 | 6 | 9 (1) | "What to do now" and "Start the drill" open the same lesson; "Change" and "Tell me how this serve went" add lime; the title is restated below it. The rig's clip is blank, so the held frame shows only the painted arm: the tour cannot judge that picture. |
| 07 Report, reopened | 8 | 6 | 7 | 8 | 6 | 6 | 9 (1) | As 06. |
| 08 Lesson sheet | 8 | 7 | 4 | 6 | 8 | 8 | 7 (2) | "This fault / The fix" are both the model, never the player's own; the play button is the biggest lime thing; the sheet's action is below the fold. |
| 09 Report after a drill | 6 | 6 | 7 | 8 | 5 | 5 | 9 (1) | Three grey lines before the fault ("About the same", "Your best session yet", "No change I can trust yet") that half contradict; whether the drill worked is not the lead. |
| 10 Today | 8 | 7 | 5 | 5 | 7 | 4 | 9 (1) | The goal card leads with "This drill isn't working yet. What now?"; serve cards are the same figure at the same moment, three with the same title; laptop's right column is empty under three numbers. |
| 11 Today's session sheet | 7 | 3 | 5 | 6 | 6 | 4 | 9 (1) | Three stacked exits (two big buttons and a link); the minutes ("5", "13", "8") have no unit and read as scores, in lime. |
| 12 Progress | 7 | 8 | 6 | 7 | 6 | 5 | 9 (1) | Four notes under the chart; then and now are two alike figures with nothing marked; the fault rows are walls of dark squares with no pass bar; laptop leaves a hole under the tiles and the speed chart's labels are oversized. |
| 13 Settings | 8 | 8 | – | 6 | 8 | – | 9 (1) | The chosen option is marked by a lime outline alone, unlike every other selected state. |
| 13b Settings, never chosen | 8 | 6 | – | 6 | 6 | – | 9 (1) | Neither hand is selected; "Work it out for me" wraps inside its pill; "No backup yet. Once you've filmed a serve" beside 29 serves. |
| 14 Court screen | 8 | 7 | 5 | 4 | 6 | 3 | 10 (0) | The phone's court layout shows "81 mph" with no "about"; "Tell me how this serve went (optional)" is lime beside the main action; laptop: a narrow centre column, the actions top right, the rest empty (width 0.49). |
| 15 Court, refused | 9 | 9 | – | 4 | 8 | 4 | 10 (0) | Laptop width 0.41. |
| 16 Court, strain | 6 | 7 | 5 | 4 | 6 | 3 | 10 (0) | The strain warning sits under the fix and the button, not first. |
| 17 Court, a fault moving | 8 | 7 | 6 | 4 | 7 | 3 | 10 (0) | The move is a line of text; nothing shows it. |
| 18 Guided set | 5 | 7 | 5 | 4 | 5 | 3 | 10 (0) | The headline names the tossing arm while the set checks the racket drop; "This fault looks the same" leaves which fault open. |
| 19 Guided set, passed | 6 | 4 | 5 | 4 | 6 | 3 | 9 (1) | Two lime buttons: "Film another serve" and "Move up a step". |
| 20 Practice video, checked | 7 | 5 | 5 | 6 | 7 | 6 | 7 (2) | No main action ("Back home" at the foot); laptop's left pane is empty under the summary. |
| 21 Practice video, before | 9 | 7 | – | 5 | 6 | 3 | 9 (1) | "Cancel" is the biggest button; "Times are from your phone, on this video" is unclear. |
| 22 Basket | 7 | 6 | 6 | 8 | 6 | 5 | 9 (1) | As 06, with "First serve filmed" on a basket of five. |
| **Mean** | **7.7** | **6.7** | **5.4** | **5.8** | **6.5** | **4.8** | **9.0** | |

  Across both sizes: no text under 14 px and no sideways scroll on any shot;
  lime actions on the first screen: on the phone, one on 13 shots, two on
  6, three on the session sheet, none on the checking screen and the two
  practice screens; on the laptop, two or three on 12 of 23.

- [x] **E0.3 Room in the budgets.** Measured with `bundle.test.ts`'s own
  method (gzip level 9) on a build of 68e8910 and on this commit:

  | | Before | After | Freed |
  |---|---|---|---|
  | Entry chunk, raw | 384.83 kB | 381.56 kB | 3.27 kB (of a 385 budget: room 0.17 → 3.44) |
  | Entry chunk, gzip | 130.70 kB | 129.57 kB | 1.13 kB (of 132: room 1.30 → 2.43) |
  | Entry stylesheet, gzip | 8.35 kB | 8.23 kB | 0.12 kB (of 14) |
  | Split stylesheets, gzip | 19.82 kB | 19.75 kB | 0.07 kB (of 20: room 0.18 → 0.25) |

  What moved. The glyphs: `icons.ts` keeps the 17 an entry module draws, and
  the 13 only lazy screens draw (back, calendar, chevron, clock, gallery,
  pause, play, repeat, share, sound, target, trash, warn) are in
  `iconsMore.ts`, fetched 1.2 s after the first paint (`main.tsx`) or sooner
  by any `Icon` that needs one, which holds its box until it lands
  (`glyphs.ts`). `scripts/icons.mjs` writes both files, and
  `iconSplit.test.ts` fails if an entry module names a later glyph. The
  delta chip's rules moved from `progress.css` to `today.css`: Today draws the
  chip, and it was unstyled there until Progress had been opened once, a
  defect found by listing the classes entry modules use that only a lazy sheet
  styles. About 110 lines of rules nothing draws came out (`.empty` and its
  parts and `.error-detail` in `states.css`, `.session-figure--*`,
  `.model-serve--quiet`).

  Not adopted: a deeper cut of the entry chunk. Source-mapped, it is React
  (141 kB), then the coaching tables (`coaching.ts` 21 kB, `progressions.ts`
  15 kB), `progress.ts` and `db.ts` (15 kB each) and `App.tsx` (14 kB). Today
  reads the tables to name the goal and the next drill, so moving them is a
  restructure, not a split; it waits until an item needs more than 3.4 kB.
  The split stylesheets have no dead weight worth the name left (a class
  scan with the code's strings, and a scan of the modules nothing imports),
  so their room stays thin: an item that adds a lazy screen's styles pays for
  them in the same commit, from what it replaces.

## Wave 1: seamless flow

- [x] **E1.1 The core loop, as taps and waits.** Read off the code and the
  `w0` tour, for a returning player on a phone (hands-free is on by default
  there):

  | Step | Taps | Wait | What it asks for |
  |---|---|---|---|
  | Landing or Today, to the camera | 1 (Film) | | A first-timer also taps "Got it" on the three rules (2). |
  | Filming one serve | 1 (start) | 5 s spoken countdown | Recording stops on its own after the serve, or at 90 s. Upload instead: 1 tap and the phone's picker. |
  | Checking | 0 | 45 to 54 s for an 18 s clip on a laptop (W6.9); unmeasured on a phone | Says what it is doing; says how long only once a serve has been checked before. |
  | Court screen | 0 | back to the camera in 15 s | "Open the full report" is 1 tap. |
  | Report, to the drill | 1 (Start the drill) | | "What to do now" opens the same sheet. |
  | Lesson sheet, to the check | 1 (Film serves to check it), after a scroll | | The film button is below the fold on a phone. |
  | A check of six serves | 0 a serve | 5 s countdown each, back in 15 s | Each serve is judged against the drill's one fault. |
  | Passed, to the next step | 1 (Move up a step) | | Beside "Film another serve", both lime. |
  | Back to Today | 1 | | |
  | Today, to today's drill | 2 (Start today's session, Show the drill full screen) | | The film check is a second big button; the calendar a third. |

  So a whole loop, from Today to a passed step and back, is 6 taps and a
  scroll, plus the six serves themselves, which take none. What this wave
  changes: the check waits with no estimate the first time; three screens
  ask the player to choose between two or three equal exits (the session
  sheet, the passed set, the practice video); Settings shows no choice for a
  player who never made one. No step in the loop is a dead end; the practice
  video's screen ends on "Back home" with the next drill a small button
  inside the first fix.

- [x] **E1.2 Today's session sheet: one main action.** The foot held three
  stacked exits: "Show the drill full screen" (lime), "Film serves to check
  it" (a full-width button) and "Add to calendar". Now the drill is the one
  main action; the check is filmed from its own row in the plan ("Film 6
  serves to check the first drill's step", with a camera), at the point in
  the session it comes; and the calendar is a quiet link beside the time.
  The minutes read "13 min", not a bare "13" in lime that looked like a
  score, and the drill rows' minutes are no longer lime. A plan with no
  drill yet ends on "Film a serve" as its one action. Taps are unchanged (2
  from Today to the drill or to the check); exits at the foot 3 to 1, lime
  things on the sheet 2 to 1. Proved by the tour (`11-session-sheet`, both
  sizes) and the gate.

- [x] **E1.3 Settings shows its guesses.** A player who never chose saw
  neither hand selected, and "How often do you get to a court?" offered a
  fourth pill, "Work it out for me", that wrapped onto two lines and never
  said what it had worked out. Now the hand the latest serve was read with
  (right, with no serves) is shown chosen, under "From your serves, I’ve
  guessed right-handed. Tap the other if that’s wrong."; and the pace the
  streak is already read at (`inferCadence`, from the serves, the session
  ledger and the practice videos) is shown chosen among three pills that fit
  on one line, under "I’ve guessed this from your sessions." One tap on the
  other option sets it, as before. `App.tsx` passes the history in place of
  the count, so it stays 1,196 lines. Proved by the tour (`13b-settings-new`
  against `w0`: no hand chosen and a wrapped pill before; both guesses
  chosen and every pill on one line after) and the gate. The "No backup
  yet" line under it is a demo-route artifact (the seeded serves are never
  stored), not this screen's.

- [x] **E1.4 One look for "chosen".** Eight rules marked a chosen option
  four ways: a lime outline (Settings), a filled panel (segmented controls),
  a lime glow (pressed chips), a lime fill (serve chips, serve tags). Each
  now draws one token, `--chosen` (a raised fill, `#2d3649`, with a top light
  `--chosen-edge`), and none draws lime, which stays for the main action. A
  guessed tag is outlined in the faint text colour until confirmed. Not
  choices, and left alone: the current tab, the framing pips, a chart's
  picked dot. `chosenState.test.ts` reads every stylesheet and fails if a
  chosen rule leaves `--chosen` or uses lime; `contrast.test.ts` still
  passes. Proved by the tour (Settings, the session sheet's time, the
  report's tags) and the gate.

- [x] **E1.5 Every wait says how long; every empty state and error says
  what to do.** The audit: the practice video says its minutes before and
  its time left while it runs; the coach's download says its size and its
  progress; the empty Progress screen says "Film two serves" with the button
  under it; a refused clip lists what to change; the crash screen offers a
  reload and a backup. The one gap was the first checks on a device:
  `estimateLine` says nothing until it has timed three, so a first-time
  player watched a bar with no length. They now read "About a minute or
  two. After a few serves I’ll know this phone’s own pace." (with "plus the
  first download" when the coach is not yet in), until the device's own
  figure replaces it. The range stands on W6.9's laptop timing (45 to 54 s
  for an 18 s clip); no phone has been timed, so its top is left wide, and
  a sweep's cells count its serves off instead. `estimate.test.ts` holds the
  line to the voice lint and to the screen. Proved by the gate.

- [x] **E1.6 One main action where there were two or none.** Four screens:
  - *A passed guided set* had two lime buttons, "Film another serve" and
    "Move up a step". The step takes the lime now and filming another serve
    is a plain button, on the court layout and off it.
  - *The optional serve tags* ("Tell me how this serve went (optional)"), on
    the court screen and the report, were a lime link beside the main
    action. They are a quiet link now: optional reads as optional.
  - *A checked practice video* had no main action: "Back home" was the
    biggest button, and the first fix's drill a small chip inside it. The
    drill is now the one main action ("Show the drill full screen"), unless a
    passed step takes it, and "Back home" is quiet. Before the video is read,
    "Cancel" is quiet beside the two ways to read it.
  - *Today's goal card* led with "This drill isn’t working yet. What now?" in
    lime, above the next step. The fold now sits under "Start today's
    session", quiet: the card says the goal, then the next thing, then what
    isn't working.

  Lime actions on the first phone screen, from the tour's own count: the
  passed set 2 to 1, the checked practice video 0 to 1, Today 2 to 2 (the
  film button and the main action; the lime link is gone). Taps unchanged.
  Proved by the tour (`10-today`, `19-guided-done`, `20-practice`,
  `21-practice-plan`) and the gate.

- [x] **E1.7 One motion language, written and applied.** Presses gave by
  eleven amounts, from 0.9 to 0.985, eight pressable things gave nothing,
  and only the fault cards' folds moved as they opened. DESIGN.md's Motion
  section now names one movement per kind of change: a press by the size of
  what is pressed (`--press-wide` 0.985 for a card or a row, `--press` 0.97
  for a button, `--press-small` 0.94 for a chip, a pill or a round control),
  a fold whose contents rise 6 px into place at `--base` (one shared
  `details[open]` rule; the fault cards' own copy of the keyframes went, and
  their `both` fill became `backwards`), a sheet at `--base` leaving in
  200 ms, a screen at `--slow`, and the arrivals that keep their own timing
  (the report's replay, the score's count-up, the waiting screen's loops).
  `motion.test.ts` reads every stylesheet: every press is one of the three
  tokens, there is one fold and it leaves nothing on `transform`, every
  other duration is a token or listed with why, and reduced motion still
  stops everything. Proved by the test and the gate; how a press feels under
  a finger is the one thing here a machine cannot judge.

- [x] **E1.8 Wave 1's close.** Set `w1`, shot at f6bb529: 46 shots, none
  failed, no console errors from the app. Before and after:
  `gallery/index.html?a=w0&b=w1`. The rescore, screens that moved:

  | Screen | Purpose | Action | Words | Why |
  |---|---|---|---|---|
  | 05 Checking a clip | | | 6 → 7 | Says how long, the first time too |
  | 06, 07 Report; 22 Basket | | 6 → 7 | | The optional tags are a quiet link; chosen chips are not lime |
  | 10 Today | | 7 → 8 | 7 → 8 | Leads with the goal and the next thing; the stuck line is quiet, under the action |
  | 11 Today's session sheet | 7 → 8 | 3 → 8 | 6 → 7 | One main action; minutes said as minutes; the check where it comes |
  | 13 Settings | | 8 → 9 | | One chosen look, no lime outline |
  | 13b Settings, never chosen | | 6 → 9 | 6 → 8 | The guesses chosen and said; every pill on one line |
  | 14, 16, 17, 18 Court screen | | 7 → 8 | | The optional tags quiet |
  | 19 Guided set, passed | | 4 → 8 | | One lime action: move up a step |
  | 20 Practice video, checked | | 5 → 8 | | The first drill is the main action |
  | 21 Practice video, before | | 7 → 8 | | "Cancel" quiet beside the two choices |
  | **Mean, all 23** | **7.7** (7.7) | **7.8** (6.7) | **6.7** (6.5) | |

  Mine, width, visuals and taps did not move this wave. The tour's own
  count of lime actions on the first phone screen: the passed set 2 to 1,
  the practice video 0 to 1. (On a sheet it counts the lime behind the
  scrim too, so it reads 3 on the session sheet before and after.) Not
  verified: how a press feels under a finger, and anything on a real phone.

## Wave 2: visualisations that explain

- [x] **E2.0 Room for the wave's styles.** The split stylesheets were at
  19.86 of 20 kB gzip after Wave 1, and this wave's pictures need rules.
  A stricter scan than E0.3's (class names only where a `className` or a
  class string names them, comments stripped) found rules no screen draws:
  the four Progress tiles the record row replaced (`.tiles`, `.tile`), the
  practice video's old row of four counts (`.session-figures`) and its blank
  pick, the filmstrip's grid (`.strip`, whose tiles' own box rule stays),
  and the report's old footer. About 1.5 kB of source, 0.25 kB gzip: the
  split sheets measure 19.73 kB with this wave's styles in. Proved by the
  scan, `bundle.test.ts` and the tour (no screen changed).

- [x] **E2.1 Then and now marks the change.** Two figures of the player's
  own serve, side by side at contact, looked alike and marked nothing. Now
  `thenNowMark` picks one fault with a graded reading on both serves (the
  row `faultMetric` returns, the one with a study or real serve motion
  behind its band), judged on both with enough evidence (`MIN_EVIDENCE`):
  one that went first, then the latest serve's first fix, then one still
  there. Both bodies are held at the moment it is read at, the fault is
  painted in coral on whichever serve had it, each serve's reading sits
  under its date in the report's own words ("No push off the court" then
  "Legs straighten up"), and one line says the picture in words ("Leg drive:
  on Oct 10, no push off the court; on Nov 23, legs straighten up. That
  fault has gone."). With no graded reading on both, it says it can't mark a
  change rather than draw one. Proved by `thenNowMark.test.ts` on the rig's
  serve dialled with and without the fault, and by the tour (`12-progress`).

- [x] **E2.2 Faults, serve by serve, shows the way out.** A row of mostly
  dark squares, lime where the fault was gone, read as a wall of failure and
  never showed the drill's pass mark. Now the last six serves are framed as
  the window a drill check reads, with a bar under them filling toward the
  ladder's own mark (`pass`, 4 or 5), older serves faded beside them; a
  clean serve is the status green, not the main action's lime, and a named
  one is quiet. The line says it: "Gone on 2 of your last 6. A drill check
  needs 4." It never says a step is passed: only a check does that.
  Proved by `faultRows.test.ts` (the line, the voice lint, no claim of a
  pass) and the tour.

- [x] **E2.3 Serve cards with scent.** Every card held the same figure at
  contact, and on a season of one fault three neighbours carried the same
  title. `cardScents` now gives each card its own picture (held at the
  moment its title is about, the fault painted where the serve had it; a
  record held at contact), the score against the player's usual before it,
  shown only past their own noise (the overall's own change threshold and
  the spread of their usual, as a small chip), and a title that differs from
  its neighbour's ("Your tossing arm comes down early", then "Tossing arm
  again", then "Tossing arm, 3 in a row", oldest first). Proved by
  `serveCards.test.ts` (no two neighbours alike, the run's words, the usual
  said only past the noise) and the tour (`10-today`).

- [x] **E2.4 One line of words under the chart.** Under the score chart sat
  a tap hint, a scoring-change note, the six-week line and the serve-type
  note: four lines. Now the caption is one line, the picked session or else
  the six-week read; a change of scoring is labelled "New scoring" on the
  chart at the break, and said in the chart's text version; what the line
  leaves out (the other serve types) moved above it, into its heading; the
  tap hint went. Proved by `scoreRibbon.test.ts` (a new check: nothing under
  the chart when there is nothing to say, the note as the one line) and the
  tour.

- [x] **E2.5 The report's side by side: from this, to that.** At the fix's
  moment the player's part was coral and the model's was plain, so the pair
  said "here is the fault" but not "here is where to get to". Now the
  model's same part is lit in lime, with one line under the pair: "Coral is
  what I saw on you. Lime is where to get to." On two bodies, never both
  colours on one (DESIGN.md); on the model only, since the player's own best
  or last serve may still have the fault; and only when both are drawn for
  the same racket hand. Proved by the tour and a shot of the section.

- [x] **E2.6 Wave 2's close.** Set `w2`, shot at 19347e9: 46 shots, none
  failed, no console errors from the app. Before and after:
  `gallery/index.html?a=w1&b=w2`, with `w1-w2-phone.jpg` and
  `w1-w2-laptop.jpg` for the changed screens. The rescore, screens that
  moved:

  | Screen | Mine | Words | Visuals | Why |
  |---|---|---|---|---|
  | 02 Sample report, 06 and 07 Report | | | 6 → 7 | The side by side says from this to that: coral on you, lime on the model |
  | 09 Report after a drill; 22 Basket | | | 5 → 6 | The same pair |
  | 10 Today | 5 → 6 | | 4 → 6 | Each card held at its own fault, its usual said past the noise, no two titles alike |
  | 12 Progress | 6 → 7 | 6 → 7 | 5 → 7 | Then and now marks one fault on both bodies; the fault rows show the window and the mark; one line under the chart |
  | **Mean, all 23** | **5.5** (5.4) | **6.7** (6.7) | **5.2** (4.8) | |

  Purpose, action, width and taps did not move. The tour's own measures:
  Progress's first phone screen carries 76 words where it carried 88. Not
  verified: anything on a real phone, and whether a player reads the framed
  six as the drill check's window without being told (the line under the
  grid says it).

## Wave 3: words that help

- [x] **E3.1 Every string a player sees, read from the tour.** What the
  reading found and changed:
  - *A speed without "about".* The court screen's big figure said "81 mph",
    the range a line under it; DESIGN.md bans a speed without "about", so
    "about" now sits before the figure, as on the report and Today.
  - *Straight apostrophes in copy*, against the copy rules' curly one: "Today's
    session" and "Start today's session", "the first drill's step", "The
    coach's download stopped", and twelve more in the slow-motion and still
    notes, the accuracy page's citations, the coach's page, the share card
    and the info pages. A scan of every string and JSX text now finds none
    outside the dev tools.
  - *Filler.* The filming guide said the racket swings up "very fast"; it now
    says "in about an eighth of a second", the Newton 2025 figure the engine
    already cites (13% of 0.97 s).
  - *An unclear line.* Before a practice video is read, "Times are from your
    phone, on this video" now says "I timed these on your phone, for this
    video."
  - The report's headline restated by the next sentence is E3.2's.
  Proved by the scan, the voice lint and the gate.

- [x] **E3.2 The faults, said as the thing, the cost and the feel.** Each
  fault's title says the thing; the line under it used to say it again
  ("Your tossing arm comes down early" / "Your tossing arm comes down before
  the swing..."). Every line under a title (eleven faults, three of them
  with a second side or an axis of their own) now says what the fault costs,
  then what to feel instead, and never repeats the title: "Your front
  shoulder follows it down, so you meet the ball lower. Keep the arm pointing
  at the ball until the racket starts up." The costs are the old lines'
  claims, kept; the feels are the drills' own cues. Inside the lint (25
  words, two sentences), and no line tells the swing to pause or stop.
  `faultCopy.test.ts` holds every line to two sentences that do not restate
  their title. Proved by it, `copy.test.ts` (44 checks) and the gate.

- [x] **E3.3 Shared phrases in one place.** The drill check's verdict was
  written out in three files and its button in four ("Move up a step" on the
  court screen, the report, a practice video and the lesson; Today said "You
  passed this step. Go to the next one"), and the tests copied the
  sentences again. `lib/phrases.ts` holds them once (`PASSED_STEP`,
  `PASSED_LAST_STEP`, `STAY_ON_STEP`, `MOVE_UP`, `faultGone`,
  `filmMoreToCheck`, and `sessions` for a counted session); every screen
  builds from it, Today's button says "Move up a step" like the rest, and
  `render`, `guidedSet` and `tripCheck` tests check for the constants. A
  wording change is now one edit. The speed's words already lived in
  `speedCopy.ts`. Proved by the gate.

- [x] **E3.4 Jargon explained on the word itself.** The report carried a
  row of its own, "Tap a word to see what it means: Trophy, Racket drop,
  Your score", apart from where any of the three words was used. It went.
  The held frame's caption and the side by side's heading now carry their
  moment as the tap ("Paused at the trophy", "Your trophy, side by side"),
  and the score's own words ("A solid serve to build on") open what the
  score is. `wordsInChrome.test.ts` now holds the rule itself: a word the
  report uses in prose is a tap there, and the row is gone. Proved by it,
  the gate and the tour.

- [x] **E3.5 The court's speed fits a phone with its "about".** Wave 3's
  tour caught what E3.1 broke: "about" set beside the court screen's big
  speed widened the row, and on a 390 px phone the score's own label was
  cut to "sco". "about" now sits on its own small line over the figure,
  where it still says itself before the number and the row is as wide as it
  was. And the tour now counts what it missed: text cut off by a box that
  hides its overflow (`clipped`, screen-reader-only text aside), beside
  sideways scroll; its click on the session sheet matches either
  apostrophe. Proved by the tour (`14-glance`, phone: nothing clipped) and
  the gate.

- [x] **E3.6 Wave 3's close.** Set `w3`, shot at 1a14006: 46 shots, none
  failed, nothing clipped, no console errors from the app. Before and after:
  `gallery/index.html?a=w2&b=w3`, and `w2-w3-phone.jpg`. The rescore,
  clarity of words, screens that moved:

  | Screen | Words | Why |
  |---|---|---|
  | 02 Sample report, 06 and 07 Report, 09 After a drill, 22 Basket | 6 → 7 (09: 5 → 6) | The line under the fault says its cost and its feel, not the title again; words are a tap where they're used |
  | 04 Filming guide | 7 → 8 | No filler: the swing's real time |
  | 14 Court screen | 6 → 7 | The speed says "about" where it is read |
  | 21 Practice video, before | 6 → 7 | Says who timed what |
  | **Mean, all 23** | **7.1** (6.7) | |

  Nothing else moved. Not verified: whether "in about an eighth of a
  second" reads as a reason to film slow motion to someone who has never
  thought about it, and anything on a real phone.

## Wave 4: deepen the core strengths

- [x] **E4.1 "That's mine": the player's own serve as the target.** The
  report's side by side set the player beside a model serve, a lab serve
  that is not theirs, even when one of their own earlier serves had the fault
  right. Now, where there is one (the latest earlier serve of the same type,
  under the same scoring, that the engine judged clean of this fault, the
  rule `ownGoodLine` already kept), it leads: "Yours, Nov 20, without this
  fault", with the fault's part lit in lime on their own body, and the key
  says so: "Coral is what I saw on this serve. Lime is the same part on your
  own serve that had it right." The model, their best and their last stay
  one tap away. Lime on their own serve is only drawn because that serve was
  judged clean of this very fault. Proved by the gate and the tour.
  Considered and left: the lesson sheet's "This fault / The fix" figures,
  which are dialled demonstrations of one movement on the model, not a
  comparison.

- [x] **E4.2 The drill loop closes at the top of the report.** After a drill
  block, whether it worked was the third of three grey lines above the fix,
  under "About the same as your last serve" and "Your best session yet".
  Now it leads, as its own panel: a verdict in a few words
  (`LOOP_VERDICT`: "Moving the right way", "No change yet", "Too soon to
  tell"...), the measured line against the player's own spread as before,
  and what to do next (`loopNext`): a check of six serves when it moved the
  right way, "Keep at Toss and point next session, then film 6 serves to
  check it" when it did not, and the practice record's own advice when the
  drill has stopped moving the fault over several sessions. The flat
  "About the same" line goes when the loop is there. No verdict claims a
  fix or a pass. `drillLoop.test.ts` holds the words and the next step.
  Proved by it, the gate and the tour (`09-report-after-drill`).

- [x] **E4.3 The progress story, as proof.** Then and now was headed
  "Then and now" over two bodies, with what had moved scattered further
  down the screen. It is now the story's head: "Since you started" when the
  earlier serve is the player's first of that serve type at all, and "Since
  Oct 10" otherwise (the seeded season started in September under the old
  scoring, so it says the date, not "started"). Under the pair, E2.1's
  marked change, then the faults gone since ("Gone since then: leg drive.")
  and the speed range that moved, each a line the screen already holds to
  the player's own noise (the graduation rule's fixed faults, the speed
  trend). Nothing new is claimed; what was spread over the screen is
  gathered under the two bodies it is about. Proved by the gate and the tour
  (`12-progress`).

- [x] **E4.4 On court, read from a fence.** Three things the court screen
  got wrong for a player walking back:
  - *A guided set's headline named another fault.* The set checking the
    racket drop showed "Your tossing arm comes down early" in big type while
    the voice said "Not yet" about the drop. The big line is now the set's
    fault and this serve's verdict on it ("Racket drop: still there"), and
    the other fault's "looks the same" line is not shown in a set.
  - *The strain warning came after the numbers and the button.* On court it
    now leads, above the numbers, as it does on the report.
  - *What is read aloud* was the speed, the score, the fix and its whole
    "why", about forty words between two serves. It is now the speed, the
    score and the fix's name; the why is for reading.
  Checked and left as they are: the countdown (five seconds, spoken, then
  recording starts on its own), and a guided set of six needs no screen (each
  serve returns to the camera on its own). Counting ten serves in still
  needs a tap per serve on where it landed: the app cannot see the court,
  and says so. Proved by the gate and the tour (`18-guided`,
  `16-glance-strain`).

- [x] **E4.5 The comparison's labels fit a phone.** Checking E4.1 on the
  demo built for it (`?demo=lesson-own`, a serve after one judged clean of
  its fault) showed the side by side leading with "Yours, Nov 25, without
  this fault" and lime on the player's own arm, as meant; and its pills
  wrapping, "Yours, done right" and "A model serve" each on two lines, the
  defect Settings had in Wave 1. The pills are short now ("Done right",
  "Model", "Your best", "Your last"); the caption under the figure says the
  rest ("Yours, Nov 25, without this fault", "Your best, Oct 3"). Measured in the browser at
  390 px: every pill one line, 35 px tall. (That demo's earlier serve is the
  same frames with the fault judged clean, so its two bodies look alike; on
  real serves they differ.)

- [x] **E4.6 Wave 4's close.** Set `w4`, shot at 91f4018: 46 shots, none
  failed, nothing clipped, no console errors from the app. Before and after:
  `gallery/index.html?a=w3&b=w4`, and `w3-w4-phone.jpg`. The rescore,
  screens that moved:

  | Screen | Purpose | Mine | Words | Why |
  |---|---|---|---|---|
  | 09 Report after a drill | 6 → 8 | | 6 → 7 | Whether the drill worked leads, with what to do next |
  | 12 Progress | | 7 → 8 | | "Since Oct 10": the change, the faults gone, the speed that moved, under the two bodies |
  | 16 Court, strain | 6 → 8 | | | The warning leads, above the numbers |
  | 18 Guided set | 5 → 8 | | 5 → 7 | The big line is the set's own fault and this serve's verdict |
  | 19 Guided set, passed | 6 → 7 | | | The same |
  | **Mean, all 23** | **8.1** (7.7) | **5.6** (5.5) | **7.2** (7.1) | |

  The report's own-serve comparison (E4.1) shows only where the player has
  an earlier serve judged clean of the fault, which the tour's report demos
  do not, so it is not in these scores; it was checked on
  `?demo=lesson-own` (E4.5). Not verified: anything on a real phone, and
  the spoken lines' length as heard, not counted.
