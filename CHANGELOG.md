# Changelog

Player-visible changes, newest first. This file starts on 2026-08-15 — it does
not retroactively document the commits before it, which speak for themselves
in `git log`.

## 2026-08-15

- **Fixed: a few clip-refusal messages read passively.** "Every swing
  measurement is read off your racket hand…", "Long clips are scanned
  for the serve first…" and "That video could not be read." all named
  the passive voice this app's own coaching copy is never allowed —
  found by finally running these refusal messages, which live outside
  the coaching database, past the same editor. Now "…comes off your
  racket hand", "This app scans long clips…" and "That video would not
  read." Same meaning, same length, active voice throughout.
- **Your records, labelled.** The streak, longest run, best hand speed and
  best score lines on "Every serve so far" now sit under their own "Your
  records" heading, the same way every other section on that sheet
  already announces itself. The four lines and their order haven't
  changed — with all of them present at once they'd started reading as
  one unbroken paragraph instead of four distinct facts.
- **Your longest run, not just the one you're on.** "Every serve so far"
  and "Share your season" now also name the longest streak of trips
  you've ever kept — "Your longest run was 7 trips in a row." — sitting
  right beside the current streak. The current streak resets to zero the
  moment a gap runs long; this one doesn't, so it stays worth knowing
  even mid-slump. Ungameable the same way every record on this screen
  is: only moves by actually getting on court. See `longestStreakLine`
  in `src/lib/progress.ts`.
- **Fixed: the three "Preparing…" / "Saved" share buttons went silent for
  screen readers.** Sighted players watch the button's own label change
  while a report, basket or season card is prepared; a screen reader had
  no reason to say the same thing out loud, since nothing marked those
  words as worth announcing. All three share buttons now carry
  `aria-live="polite"`, so the same state a sighted player sees reaches
  an assistive-technology user too.
- **Share your whole season, not just one report.** "Every serve so far"
  now has its own "Share your season" button, next to the trip streak,
  tightest-gap, fastest-hand-speed and best-score lines it already shows —
  every existing card was scoped to one report or one basket, so a coach
  or a parent asked "how's it going" had only a single day's numbers to
  hand over. The new card carries all four records together, in the same
  order the sheet already lists them, and nothing else — no invented
  season score. Appears once there are at least two records to share. See
  `renderSeasonCard` in `src/lib/share/reportCard.ts`.
- **The best-score record reads onto "Every serve so far" and the report
  share card too.** The aggregate sheet groups it with the trip streak and
  the fastest-hand-speed record, the same "whole journey, not this one
  serve" cluster those two already sit in — "Your best serve yet scored
  68, set 14 Aug." "Save or share this report" carries the same sentence,
  stacked above the streak line, the same way the basket card already
  stacks its own two records. See `bestOverallScoreEverLine` in
  `src/lib/progress.ts`.
- **A personal-best record for your single highest-scoring serve.** Every
  report now names the best score any one serve of that type has ever
  earned — "Your best serve yet — 68." on the report that set it, "Your
  best serve so far scored 68, set 14 Aug." on any other — sitting under
  the score ring, beside the "vs your last serve" comparison. Scoped to
  the serve type on screen, the same rule the tightest-gap record already
  follows, since a flat serve and a kick serve are scored against
  different target bands. Ungameable like every other record on this
  screen: only moves by actually serving a higher score. See
  `bestOverallScore`/`bestOverallScoreLine` in `src/lib/progress.ts`.
- **A single basket's report says the same thing about itself.** Opening
  any basket now shows how its own gap compared to the one right before
  it — "6 points tighter than your last basket" — sitting between the
  best-against-worst comparison and the all-time tightest-gap record, a
  different question from either of those. Carries onto "Share this
  basket" too, the same way the all-time record already does. See
  `gapDeltaFor` in `src/lib/progress.ts`.
- **"How repeatable, over time" now says how your last basket compared.**
  The chart already carried this — the gap between your best and worst
  serve shrinking or widening since the basket before — it just never said
  so in words. "25 points tighter than your last basket," or wider, right
  under the chart. See `gapDeltaLine` in `src/lib/progress.ts`.
- **Fixed: the speed unit was spelled two different ways on the same
  screen.** "How fast you served" printed "body heights / sec" with spaces
  around the slash; the fastest-hand-speed record right beneath it printed
  "body heights/sec" without. Both now read the same way, everywhere a
  speed is shown. See `formatSpeed` in `src/lib/analysis/power.ts`.
- **The six-week milestone reads onto "Every serve so far" too.** The
  score-by-session chart there already had the shape of this fact; it just
  never stated it in words, the way the home card already does. Same
  sentence, same rule, both places.
- **The fastest hand speed joins the other two records there too.** Grouped
  with the streak rather than given its own chart — both are facts about
  the whole journey, not about form, which is what the rest of that screen
  is otherwise entirely about. See `bestHandSpeedEverLine` in
  `src/lib/progress.ts`.
- **The trip streak and the tightest gap now show up on "Every serve so
  far".** That screen already tracks your whole history — it just never
  mentioned either record. The streak sits under the hero score, the same
  line the home card already shows; the tightest-gap sentence sits under
  the "How repeatable, over time" chart it's read straight off. See the new
  `bestGapEverLine` in `src/lib/progress.ts`.
- **Fastest hand speed, tracked across every session.** The "How fast you
  served" panel now names your fastest measured hand speed ever, alongside
  this serve's own reading — "Your fastest hand speed yet — 5.0 body
  heights/sec." on the session that set it, "…so far is 5.0 body
  heights/sec, set 15 Aug." on any other, in km/h once you've told the app
  your height. Built from the measured hand speed only, never the estimated
  ball-speed band — the one number `power.ts` already keeps on every saved
  report so a season of them can be compared. See `bestHandSpeed`/
  `bestHandSpeedLine` in `src/lib/progress.ts`.
- **Both records now travel onto the share card.** "Save or share this
  report" and "Share this basket" carry the same trip-streak and
  tightest-gap sentences the two screens already show, in the card's lime
  accent above the drill box / footer. Absent from the image exactly when
  it's absent on screen — no card grows a blank gap for a record that
  doesn't exist yet. See `renderReportCard`/`renderBasketCard` in
  `src/lib/share/reportCard.ts`.
- **Tightest gap swept.** The consistency panel (after sweeping a basket, or
  reopening one that was) now names the smallest gap between your best serve
  and your worst across every basket you've ever swept — "Your tightest gap
  yet — 3 points…" on the basket that set it, "Your tightest gap so far is 3
  points, set 15 Aug." on any other. Ungameable like the streak: only moves
  by actually sweeping a tighter basket. See `bestConsistencyGap`/
  `bestGapLine` in `src/lib/progress.ts`.
- **Trip streak.** The home screen's "Your form" card now says how many trips
  to the court in a row have landed within nine days of the one before —
  "3 trips to the court in a row, roughly weekly." Counted from real analysed
  sessions, never from a tap, the same rule `sixWeekMilestone` and the drill
  button already hold. Silent until there are at least two trips in the
  current run. See `tripStreak`/`streakLine` in `src/lib/progress.ts`.
