# Changelog

Player-visible changes, newest first. This file starts on 2026-08-15 — it does
not retroactively document the commits before it, which speak for themselves
in `git log`.

## 2026-08-15

- **Trip streak.** The home screen's "Your form" card now says how many trips
  to the court in a row have landed within nine days of the one before —
  "3 trips to the court in a row, roughly weekly." Counted from real analysed
  sessions, never from a tap, the same rule `sixWeekMilestone` and the drill
  button already hold. Silent until there are at least two trips in the
  current run. See `tripStreak`/`streakLine` in `src/lib/progress.ts`.
