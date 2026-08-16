# Changelog

Player-visible changes, newest first. This file starts on 2026-08-15 — it does
not retroactively document the commits before it, which speak for themselves
in `git log`.

## 2026-08-16

- **Your progress sheet now tells you which joint warning keeps coming back.**
  The app has always flagged mechanics that risk a wrist, a shoulder or a lower
  back on the serve they happened on. But nobody hurts a wrist on one serve, and
  a warning read once and gone by the next clip is a warning people dismiss.
  Every flag your reports have ever carried is now counted across your recent
  trips to the court, and any that keeps recurring is stated at the top of the
  sheet: "Your lower back has folded under the swing on 3 of your last 6 trips."
  Counted in trips rather than serves, so one rough afternoon counts once
  however many serves you filmed on it, and it goes quiet once you have stopped
  doing it. The number it compares against only counts trips that could actually
  have answered — a clip the app refused, or one where it never got a clean look
  at that part of you, is not counted as a good day.
- **And it now tells you when you have stopped doing it.** The same count read
  the other way: a warning that was recurring and has not appeared for three
  trips reads "Your wrist has stopped turning hard through the ball on your last
  5 trips." Three clean trips rather than two, because two is enough evidence to
  ask you to watch something and not enough to tell you it is fixed. It says it
  for a few trips and then stops, rather than sitting on your screen forever.
- **An injury warning on a report now tells you whether you have seen it
  before.** The card that explains what your back or your wrist is doing ends
  with "Also on 2 of your 6 trips before this one" where there is a history
  behind it — the difference between a warning you note and one you act on, at
  the moment you are actually reading it. It counts the trips before this serve
  only, so reopening an old report tells you what was true when you filed it
  rather than what is true today.
- **The between-serves screen now warns you while you can still do something
  about it.** A report is read sitting down, after the basket is finished. If
  the serve you just hit folded your back and your back has folded on three of
  your last six trips, the glance says so: "That is your lower back on 3 of your
  last 6 trips." It is the only line on that screen that is not about your next
  serve — it is about how many more to hit today. It only appears when the serve
  in front of you raised the warning and it is already a pattern, so it cannot
  become something that nags you between every serve.
- **Fixed: a stored report from another version could blank the whole app, in
  seven more ways than the one already found.** A report is read back out of
  storage through a repair step whose job is to make sure nothing downstream can
  crash on it. It was checking whether each field was *present* and not whether
  it was *usable* — so a backup carrying a number where a word belongs, or a
  serve type this version has never heard of, went straight through and took the
  screen down. Every field a report carries is now checked by kind, and the
  suite mutates each one of them in turn and draws the result, which is how the
  seven were found.
- **Fixed: your form card and your report could disagree about your best serve.**
- **Fixed: "Showing your flat / first serve serves only."** The progress sheet
  built that sentence out of the chip label, which already ends in "serve".
- **Your settings now travel with your history.** Exporting and importing carried
  your reports and your logged drills and left behind the three things that say
  who you are — which hand you serve with, your rating, and which serve you were
  working on. On a new phone the app then asked for the hand again and quietly
  re-estimated the rating, which moves every target band your restored history
  was judged against. They now travel in the file, and a restore only fills in
  what the new phone has no answer for: importing an old backup can never roll
  back a hand you corrected last week or a rating you have climbed past.
- **An app update can no longer interrupt an analysis.** A new version used to
  take over and reload the page the moment it arrived — including part way
  through reading a serve, or several minutes into comparing a whole basket,
  which threw all of it away with no message. Updates are now held until you are
  back on the home screen with nothing running, where a reload costs nothing.
- **The analysing screen no longer competes with the coach for the phone.**
  Progress was reported to the screen once per tracked frame — several hundred
  redraws per serve, on the same thread doing the pose detection. It now updates
  ten times a second, which is faster than anyone reads a percentage.
- **"What this phone can do" now says what a serve actually costs on it.** Every
  report has quietly recorded how long its own analysis took since that was
  added, and nothing had ever read one.
- **Fixed: a saved basket from another version could blank the whole app.**
  Opening a stored comparison that was missing the serve numbers — a
  report restored from a hand-edited backup, or written by a build from
  before those numbers existed — took the entire screen down to "Something
  in the app broke", from a report that was otherwise perfectly readable.
  The read-back repair that exists to stop exactly this had never been
  taught to check that field, nor the best-against-worst block beside it.
  Both are now repaired or dropped on the way out of storage: a missing
  list falls back to numbering the serves as they appear, and half a
  best-against-worst block is left out rather than half-drawn.
- **Fixed: your "best serve" could come from before the scoring changed.**
  When the marking is recalibrated, old reports keep the numbers they were
  given — they have no video left to re-score — so the app is careful
  everywhere else not to compare across that line. The record on the report
  and on "Every serve so far" was the one place that did. A player whose top
  score predated a recalibration saw one figure on the home card and a
  higher, different one on the report, and the higher one could never be
  beaten because nothing scored since is on the same scale. Both screens now
  read the same record, from the current marking only.
- **Fixed: the download counter always used a period, even where your phone
  doesn't.** "Downloading the coach · 4.5 MB of 19.0 MB" is the only number
  the app shows with a decimal place, and it is on the first screen a first
  run ever reaches. It now reads in whatever your own language and region
  write a decimal point as, like every date already does.
- **A basket is a little quicker.** Comparing the serves in one clip asked
  the browser's storage whether the coach was already downloaded once per
  serve, up to six times, to answer a question that could not change after
  the first. It now asks only when there is something to find out.

## 2026-08-15

- **The between-serves screen now remembers your last serve.** Record, glance,
  record — and until now every glance forgot the one before it, so you could do
  exactly what the app asked and get the identical sentence back with nothing
  saying whether it worked. It now carries one extra line about the *previous*
  serve's fault: "closer than your last serve", "still there", "not on this
  one", or "further out than your last serve". It appears only within one trip
  to the court, only when both serves measured the same thing the same way, and
  only when the change is bigger than the wobble the camera itself introduces —
  so "no change yet" is a real answer and not a shrug. Nothing is scored,
  counted or awarded for it.
- **Serve speed is gone, all of it.** The "How fast you served" panel, the
  estimated serve-speed band, the measured hand speed, the rare measured
  ball-off-the-strings reading, the fastest-hand-speed record on "Every
  serve so far" and on the season share card, and the height question that
  turned any of it into km/h — removed. The estimate was two multiplications
  on top of a wrist, and a wrist is not a ball; the measured readings needed
  footage almost nobody films. A number that wide is not worth the room it
  took on the page. Everything the report says about the *shape* of your
  serve is untouched, and so is the toss tracking — the toss is still found
  in the pixels and still scores toss height and whether you hit at the peak.
  Reports saved before today keep their stored speed; nothing reads it.
- **A printed report is now readable.** This app has always been dark by
  design, and most browsers strip a page's own background when printing —
  which left a printed report as near-white text on paper that was already
  white. Printing now switches to dark text on a white page and drops the
  buttons, which do nothing once they're on paper.
- **Fixed: the hand-speed reading always used a period, even where your
  phone doesn't.** Every date in this app already reads in your own
  locale's format; the one number shown with a decimal place ("4.1 body
  heights/sec") didn't, because it went through a JavaScript method that
  always writes a period regardless of locale. It now reads in whatever
  your own language and region write a decimal point as.
- **Fixed: an invalid height silently vanished instead of saying why.**
  Entering a height outside the plausible range (or mistyping one) for the
  km/h speed conversion used to close the box and quietly discard it —
  including wiping out an already-saved height with a garbage resubmission.
  It now stays open with a plain reason ("try somewhere between 110 and 230
  cm") until you either fix it or clear the field on purpose.
- **The offline download's progress now reaches a screen reader.** Tapping
  "Download now to use offline" updates the button's own text every network
  chunk, which a screen reader was never told about — nothing announced
  until the download finished or failed. A quiet second copy of the same
  news, rounded to the nearest ten percent so it reads as progress rather
  than noise, now sits next to the button.
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
