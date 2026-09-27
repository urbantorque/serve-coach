# validation/annotation: "Check this serve"

Hand-marked ground truth on real clips, the per-serve "App vs you" comparison, the
`serve-coach-validation@1` export and the pooled statistics. The path from synthetic-only evidence to
real footage: docs/VALIDATION_PROTOCOL.md says how the study runs; METRICS §1.3 and §5.6 say what a
pass allows. Pure and framework-free except `store.ts` (IndexedDB through the data layer).

| File | What it does |
|---|---|
| `types.ts` | `CheckAnnotation`: the §6.6 `ServeAnnotation` plus serve id, annotator role, blinding (`blind`, `revealedAt`), radar reference, optional study code. The checked metrics and events |
| `marks.ts` | What a person marks (`MARK_STEPS`: Height, Release, Peak, Contact, Landing, Radar) and the draft those marks build up; radar entry (km/h or mph, typing slips refused); initials and study codes; draft ⇄ stored record, with the blinding rule |
| `agreement.ts` | Values the marks imply (side-view image geometry, METRICS §1.1) and the per-serve comparison: timing in frames and ms, heights in cm and % of height, positions in cm, each against its `metrics.json` V2 threshold, in plain words |
| `export.ts` | The validation file: every check with the app's automatic values for the same serve, clip timing and set-up, engine stamp. No video, images, names, notes or profile beyond height; sample data left out |
| `store.ts` | Save, list, reveal and delete checks in the existing `annotations` table (schema v1, no migration); gather what the export needs |
| `stats.ts` | Bland–Altman (with the repeated-measures variant), proportional bias, MAE with a player-cluster bootstrap, ICC(2,1) with the McGraw & Wong interval, Wilson intervals, coverage, timing distributions; t and F distributions |
| `evaluate.ts` | Pooled evaluation of export files and the markdown report (used by `tools/validate/annotation-eval.ts`) |
| `synthetic.ts` | Synthetic exports with a known bias, for tests only |

## Honesty rules this module keeps

- **Blinding.** While marking, the UI shows no app value, event, phase or overlay. The first time "App
  vs you" is shown for a set of marks, `revealedAt` is stored; marks changed after that are
  `blind: false` and left out of the pooled analysis by default. Saved marks never carry over to the
  next annotator on the same phone.
- **Marked values are player-entered.** They render with the "You logged" state; the app's values keep
  their own states. A radar reading is stored as `speed-radar-entered` (player-entered, peak).
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
