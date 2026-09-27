# validation/annotation: "Check this serve"

Hand-marked ground truth on real clips, the per-serve "App vs you" comparison, the
`serve-coach-validation@1` export and the pooled statistics. The path from synthetic-only evidence to
real footage: docs/VALIDATION_PROTOCOL.md says how the study runs; METRICS §1.3 and §5.6 say what a
pass allows. Pure and framework-free except `store.ts` (IndexedDB through the data layer).

| File | What it does |
|---|---|
| `types.ts` | `CheckAnnotation`: the §6.6 `ServeAnnotation` plus serve id, annotator role, blinding (`blind`, `revealedAt`), radar reference, optional study code. The checked metrics and events, and `AppMechanics` (the engine's unrounded leg-drive, loading, drive-time and shoulder values) |
| `marks.ts` | What a person marks (`MARK_STEPS`: Height, Release, Peak, Trophy, Lowest hip, Contact, Landing, Radar) and the draft those marks build up; radar entry (km/h or mph, typing slips refused); initials and study codes; draft ⇄ stored record, with the blinding rule |
| `agreement.ts` | Values the marks imply (side-view image geometry, METRICS §1.1) and the per-serve comparison: timing in frames and ms, heights in cm and % of height, positions in cm, leg drive and loading in % of height, drive time in frames, each against its `metrics.json` V2 threshold, in plain words; the shoulder line in words only |
| `export.ts` | The validation file: every check with the app's automatic values for the same serve (including `app.mechanics`), clip timing and set-up, engine stamp. No video, images, names, notes or profile beyond height; sample data left out |
| `store.ts` | Save, list, reveal and delete checks in the existing `annotations` table (schema v1, no migration); gather what the export needs |
| `stats.ts` | Bland–Altman (with the repeated-measures variant), proportional bias, MAE with a player-cluster bootstrap, ICC(2,1) with the McGraw & Wong interval, Wilson intervals, coverage, timing distributions; t and F distributions |
| `evaluate.ts` | Pooled evaluation of export files and the markdown report (used by `tools/validate/annotation-eval.ts`) |
| `synthetic.ts` | Synthetic exports with a known bias, for tests only |

## Legs and shoulders (added 2026-09-28)

The optional **Trophy** and **Lowest hip** steps, plus an optional hip centre at release and at
contact, let a person check four more metrics (METRICS §3.15, §3.27 to §3.29):

| Metric | From the marks | V2 target (metrics.json) | App side |
|---|---|---|---|
| `leg-drive` | 100 × (hip height at contact − hip height at its lowest), hip heights as (floor − mark) ÷ standing height | MAE ≤ 2.5% of height | `ServeAnalysis.legDrive.hipRisePctH` (unrounded), else the stored value |
| `loading-depth` | 100 × (hip height at release − hip height at its lowest) | MAE ≤ 2.5% of height | `legDrive.hipDropPctH` |
| `drive-time` | (contact frame − lowest-hip frame) × ms per frame | MAE ≤ 2 frames | `legDrive.driveTimeMs` |
| `shoulder-tilt-trophy` | φ = atan2(y_B − y_F, netDir · (x_F − x_B) · aspect) on the trophy frame; the front shoulder is chosen by geometry, as the engine does | none: the band is judged by coach agreement (≥ 80%) | `shoulder.trophyTilt2DDeg`. Validation data only: the app never shows degrees for a band (D5), so "App vs you" describes the difference in words |

The trophy and lowest-hip frames are reported in the timing rows without a target of their own: the
hips move slowly at their lowest point (judged through drive time), and the engine's trophy is its
lowest-hip point, which a person's trophy position need not match. Older export files without
`app.mechanics` still pair leg drive, loading and drive time on the stored (rounded) values; the
shoulder line then has no app value.

## Honesty rules this module keeps

- **Blinding.** While marking, the UI shows no app value, event, phase or overlay. The first time "App
  vs you" is shown for a set of marks, `revealedAt` is stored; marks changed after that are
  `blind: false` and left out of the pooled analysis by default. Saved marks never carry over to the
  next annotator on the same phone.
- **Marked values are player-entered.** They render with the "You logged" state; the app's values keep
  their own states. A radar reading is stored as `speed-radar-entered` (player-entered, peak), and
  Serve detail shows the latest one in the serve's "Radar speed (you logged)" row with its source
  (`ui/screens/playback/serveView.ts` `radarFromChecks`).
- **One serve proves nothing.** The comparison card says so; only pooled results (the tool) can move a
  validation level, and only through a reviewed edit of `metrics.json`.
- **Speed** is compared only with the app's experimental range, and only when the experimental toggle is
  on. Spin is never compared.

## UI

`app/src/ui/screens/playback/check/` (Serve detail → More actions → Check this serve, `?mode=check`).
Screenshots and the end-to-end dry run on the synthetic clip `baseline-s1`:
`validation/results/ui/harden-annotation/` (script: `app/src/ui/screens/playback/dev/shoot-check.mjs`).

## Tests

`npx vitest run src/validation/annotation` (formulas against published values, the export's privacy
rules, storage and blinding), `src/ui/screens/playback/check` (the screen), and
`app/node_modules/.bin/tsx --test tools/validate/annotation-eval.test.ts` (the tool on synthetic
annotations with a known bias).
