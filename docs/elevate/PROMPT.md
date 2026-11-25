# Elevate: a quick review, and the prompt for the next programme

Written 2026-11-26, after the plain-copy, report, Today and download passes
(commits d80b1d0 to 2fefc0b). Part 1 is what a quick review of the app and the
code found. Part 2 is a prompt to paste into a fresh session to run the next
programme.

---

## Part 1. Quick review

### What is already strong (protect and deepen these)

- **Honest by construction.** Every graded band cites a study or real motion.
  A clip the engine can't trust is refused with what to change. Speed is
  always "about" with its range. Very few consumer sports apps can say this.
- **It's the player's own serve.** The lit figure is drawn from their own
  landmarks, their footage is held at the fault's moment, and they're
  compared with their own usual and their own best, past their own noise.
- **A real coaching loop.** Two to four fixes, worst cause first. Drills on
  ladders. Guided sets that judge each serve against one fault. A hands-free
  screen to glance at between serves. A drill check that says "you've passed
  this step".
- **Private and offline.** Nothing leaves the phone. As of 2fefc0b the coach
  can be downloaded on Wi-Fi before going to court.
- **Discipline.** 2,441 checks. A voice lint on every string. Budgets on the
  bundle, stylesheets and heap. Demo routes for every main state.

### What holds it back

These were seen on screen at 390 and 1440 px wide, or read in the code.

**Flow and ease**

1. *Today's session sheet* stacks three exits ("Show the drill full screen",
   "Film a serve", "Add to calendar"), which DESIGN.md bans. The minute
   column ("5", "13", "8") has no unit, so it reads as scores.
2. *Settings*: neither hand is selected for a player who never chose, and
   "Work it out for me" wraps onto two lines inside its pill. A chosen option
   is marked by a lime outline alone.
3. The report still opens with the fault title and then a "why" sentence that
   repeats it ("Your tossing arm comes down early" / "Your tossing arm comes
   down before the swing...").
4. Today's goal card can lead with a negative link ("This drill isn't
   working yet. What now?") above the next step.

**Visualisations that should explain more**

5. *Serve cards on Today* look alike. Each shows the same figure at the same
   moment, and three in a row carry the same title. The history has no
   "scent": nothing shows which serve was better, what changed, or which one
   to open.
6. *Then and now on Progress* sets two figures side by side that look the
   same, with nothing marking the change. It's the app's best proof of
   progress, and it says nothing.
7. *Faults, serve by serve* is a row of mostly dark squares, which reads as a
   wall of failure. It doesn't show the drill's pass bar (four of six) or
   recent improvement.
8. *Under the Progress chart* sit three or four small notes in a row (tap
   hint, scoring change, six-week line, serve-type note).
9. The figure is used as the same thumbnail everywhere. Different moments,
   crops and annotations would let each picture carry one idea.

**Visual design**

10. *Laptop Today* leaves the right column mostly empty under three numbers.
    Laptop Progress is better, but its then-and-now figures are tall and
    carry nothing.
11. Selected states vary: a lime outline (Settings), a filled panel
    (segmented controls), a filled chip (tags). There are 29 `style={{`
    blocks plus named style constants (10 in `Home.tsx` alone), against
    DESIGN.md's tokens-only rule.
12. Motion is good on arrival (the report replay, the count-up), but moving
    between screens and opening folds has almost no shared motion language.

**Code that will slow the next programme**

13. The entry bundle is at 384.8 of 385 kB. Anything new on the first screen
    needs room made first. `icons.ts` (every glyph) sits in the entry.
14. The split stylesheets are at their 20 kB budget (STATUS.md).
15. Large files: `Report.tsx` 1,452 lines, `App.tsx` 1,196,
    `analysis/analyze.ts` 2,133, `progress.ts` 1,965.
16. Copy is pinned by many tests, so every wording change touches several
    test files. That's good for safety but slow to work with; shared copy
    constants would help.
17. There's no committed screen tour. Galleries are made by hand
    (`docs/lift/*.html`), and the scripts used in the last passes live
    outside the repo.

---

## Part 2. The prompt

Paste everything below the line into a new session in this repo.

---

You're leading the next programme for **Serve Coach**, a tennis-serve coach
that reads one phone clip entirely on the device. It's mature: the engine,
coaching and loops work, and 2,441 checks pass. Your job is to lift it from
good to premium. Focus on how it feels to use, how clearly it explains
itself, and how much its pictures say. Deepen what it's already best at
rather than adding breadth.

### Read first

1. `STATUS.md`: what works, what's open, how to work here.
2. `DESIGN.md`: the visual source of truth (Floodlit). It overrides any
   taste skill.
3. `docs/elevate/PROMPT.md` Part 1: the review this prompt comes from.
4. The memory notes on copy, design and scope, if your harness loads them.

### Non-negotiables

- **Raise the skin, never replace it.** Dark ground, one lime accent,
  Archivo, rounded and elevated. Two re-skins were built and rejected.
  Lime means "this is the thing": one main action per screen.
- **Serves only.** Other shots are left out and counted, never graded.
- **Nothing leaves the device.** No new network calls, analytics or
  accounts. Payments stay off.
- **Machine-provable work only.** No step may wait on filming, a coach
  panel or testers. Prove things with the synthetic rig, the benches, the
  demo routes and browser screenshots.
- **Honesty holds.** Never grade an unsupported reading. A speed always
  says "about" with its range. Soften refusals by lowering confidence, never
  by lowering the bar.
- **Copy rules** (`voice.ts` lints them):
  - Plain words for a recreational player, first person "I", contractions
    with the curly apostrophe.
  - At most 25 words and two sentences per string. No "very", "just" or
    "a little".
  - A visit is a "session", and the app "checks" a serve. "Drop" means
    only the racket drop. Ranges are written "76 to 86".
  - Don't give a player admin: guess, and let one tap correct the guess.
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
- **Look before you report.** Run every visual change under Playwright at
  390x844 and 1440x900. Screenshot it, read the console, run the
  web-design-guidelines review on the changed files, and finish with
  `playwright-cli close-all`.

### Wave 0: a baseline you can measure against

1. **Commit a screen tour.** Add `scripts/tour.mjs`. It visits every main
   state through the demo routes and saves phone and laptop screenshots plus
   console errors into `docs/elevate/gallery/` with an `index.html`:
   - landing;
   - Today with history (`?demo=history`);
   - Progress;
   - report (`?demo=report`, `?demo=live`);
   - court screen (`?demo=glance`, `-refused`, `-strain`, `-move`);
   - practice (`?demo=session`, `basket`);
   - guided set (`guided`, `guided-done`);
   - the lesson sheet, today's session sheet, Settings, the filming guide,
     and the camera's first-time card.

   This is the before.
2. **Score each screen** 1 to 10 against DESIGN.md's four tests:
   - one purpose;
   - one main action;
   - "that's mine";
   - uses the width on a laptop.

   Add three more scores: clarity of words, how much the visuals explain,
   and taps to the next useful thing. Write the scores into
   `docs/elevate/LEDGER.md`.
3. **Make room.** Split `icons.ts` so only first-screen glyphs stay in the
   entry, and record the kB freed. Find stylesheet room the same way.

### Wave 1: seamless flow

Map the core loop as taps and waits: landing → film or upload → checking →
report → drill → film a check → passed step → Today. Then:

- Remove every dead end and every second step that could be a default.
- Fix today's session sheet: one main action, labelled minutes, and the
  calendar as a quiet link.
- Fix Settings: a default chosen and shown, labels that fit, one consistent
  selected state across the app.
- Every wait says what it's doing and roughly how long. Every empty state
  says how to fill it. Every error says what to do next.
- Write down a shared motion language and apply it: sheets, folds, screen
  changes, a press. It must be at rest under reduced motion.

Prove each change with the before and after tour, plus a tap count where it
changed.

### Wave 2: visualisations that explain

- **Then and now:** mark the change on the player's two bodies. Draw the
  fault's angle or line on both, with the reading from and to, at the moment
  that matters. Only where the reading is supported; otherwise say what
  can't be shown.
- **Faults, serve by serve:** show the drill's pass bar and the recent
  window, so getting better looks like getting better, and nothing reads as
  a wall of failure.
- **Serve cards:** give each card scent: the score against the player's
  usual, what's new on it (a fault gone, a best), and a picture at the
  moment its own fault happens. No two neighbours should read the same.
- **Progress chart:** one line of words at most under it. Everything else
  appears on tap.
- **Report:** one picture, one idea. Where the figure carries a correction,
  show where to get to (lime) beside what I saw (coral), as DESIGN.md says.

Hold every chart to the dataviz rules: the axis fitted to the player's range
but never tighter than 24 points, the range drawn as well as the median, no
change shown that sits inside the player's noise, and a text version for
every picture.

### Wave 3: words that help

- **Read every string a player sees,** screen by screen, from the tour. Cut
  repetition, such as a headline the next sentence restates. Lead with what
  to do, then why.
- **Rewrite the eleven faults' title and "why"** so each says the thing, the
  cost and the feel, in that order, inside the lint. Keep a claim only if it
  can be supported.
- **Put shared phrases in one place** ("session", the speed line, the drill
  check), so a wording change is one edit. Pin the tests to those constants,
  not to sentences copied into the tests.
- **Explain jargon on the word itself,** with a tap. No separate glossary
  rows.

### Wave 4: deepen the core strengths

- **"That's mine":** use the player's own best serve as the target wherever
  a model serve stands in now and the player's own is good enough. Say which
  it is.
- **Close the drill loop:** after a drill block, the next report opens with
  whether the drill worked, against the player's own noise, and what to do
  if it didn't, before anything else.
- **The progress story:** "since you started" as proof, not a number. The
  first serve beside the latest at the same moment, the faults that went,
  the speed range that moved. Drawn only from supported readings.
- **On court:** the hands-free loop should feel effortless. Check every
  spoken line for length and clarity, the countdown's rhythm, and that a set
  of ten needs no screen.

### Wave 5: premium finish, laptop and code health

- **Laptop:** Today and Progress use the width with a purpose. The studio is
  the reason to open a laptop: make sure every review tool is reachable by
  keyboard and says what it does.
- **Styles:** move the inline styles and named style constants to tokens
  and classes, without breaking the stylesheet budget.
- **Code:** split `Report.tsx` and `App.tsx` where this programme touches
  them, by screen section. No behaviour change, and the suite proves it.
- **Close:** a final tour, a rescore of every screen, and `STATUS.md`
  updated. Each wave's before and after gallery is linked from the ledger.

### How to work

- Keep `docs/elevate/LEDGER.md`: one line per item with its wave, what it
  turned out to be and how it was proved. A measured "not adopted" is a
  result.
- Work in waves. Finish, gate, commit, push and check the live site before
  the next wave.
- When an item needs the owner (a price, a domain, egress, footage), write
  it in `docs/next/OWNER-STEPS.md` and move on.
- Report each wave with the before and after screenshots side by side, the
  score changes, and what you didn't verify. In particular, nothing here has
  run on a real phone.
