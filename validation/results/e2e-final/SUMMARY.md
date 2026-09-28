# End-to-end accuracy of the production pipeline (synthetic corpus)

Generated 2026-09-27T23:56:32.246Z by `tools/validate/e2e-accuracy.mjs` (server: prod; 8 clips). **Synthetic serves only; no real footage.** One run per clip in headless Edge on a shared laptop, so times are indicative.

The full pipeline (`runAnalysis`: serve scan, per-serve pose, ball search in workers, engine, key frames, storage) runs on each clip as the app would, from the production build (`vite build` + `vite preview`, `app/src/analysis/pipeline/e2e/server.mjs`) unless another server was chosen. Runs are scored against the generator's truth with `perf-accuracy.mts` (the scoring of `tools/validate/metrics-eval.ts`). Every run file in `runs/` keeps the engine's full input, so `tools/validate/e2e-replay.ts` can replay the engine offline and diff its input against the offline validation input. Causes, fixes and the fused-event rule: `docs/VALIDATION.md` §3.3. Production runs from before the 28 September fixes, with replay diffs: `repro/`.

## Serve counting

| Clip | True serves | Found (windows) | Counted | Counted with a true contact | False serves | Contacts not counted | Contact withheld (D2) | Console errors | Wall s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline-s1 | 1 | 1 | 1 | 1 | 0 | none | none | 0 | 21.1 |
| default75-s1 | 1 | 1 | 1 | 1 | 0 | none | none | 0 | 15.3 |
| dist12-s1 | 1 | 1 | 1 | 1 | 0 | none | none | 0 | 27.4 |
| fence9-s1 | 1 | 1 | 1 | 1 | 0 | none | none | 0 | 28.4 |
| fps240-s1 | 1 | 1 | 1 | 1 | 0 | none | none | 0 | 23.4 |
| sample-checkin | 16 | 16 | 16 | 16 | 0 | none | none | 0 | 162.0 |
| sample-retest | 16 | 16 | 16 | 16 | 0 | none | none | 0 | 163.9 |
| session | 8 | 8 | 8 | 8 | 0 | none | none | 0 | 85.1 |
| **Total** | **45** | 45 | 45 | **45** | **0** | | | 0 | |

Recall 45 of 45 (100%); 0 false serves. METRICS §5.4 bar: precision and recall ≥ 99%.

## Event timing and metric errors

Mean absolute error (n serves scored). Heights as a ratio of standing height; leg drive and loading in % of height.

| Clip | Contact ms | Release ms | Apex ms | Lowest hip ms | Landing ms | Toss drop cm | Rhythm ms | Contact height | Toss height | Leg drive | Loading |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline-s1 | 0.8 (1) | 0.9 (1) | 0.3 (1) | 77.4 (1) | 152.7 (1) | 0.2 (1) | 0.3 (1) | 0.031 (1) | 0.071 (1) | 2.43 (1) | 0.04 (1) |
| default75-s1 | 0.2 (1) | 0.1 (1) | 0.1 (1) | 124.2 (1) | 171.2 (1) | 0.2 (1) | 0.3 (1) | 0.006 (1) | 0.009 (1) | 3.12 (1) | 0.83 (1) |
| dist12-s1 | 0.1 (1) | 3.4 (1) | 0.1 (1) | 99.4 (1) | 176.3 (1) | 0.2 (1) | 3.3 (1) | 0.005 (1) | 0.009 (1) | 1.45 (1) | 0.11 (1) |
| fence9-s1 | 0.3 (1) | 8.4 (1) | 0.1 (1) | 27.7 (1) | 171.9 (1) | 0.2 (1) | 8.3 (1) | 0.005 (1) | 0.009 (1) | 3.12 (1) | 0.99 (1) |
| fps240-s1 | 0.7 (1) | 0.6 (1) | 0.4 (1) | 123.4 (1) | 145.1 (1) | 0.2 (1) | 1.7 (1) | 0.043 (1) | 0.081 (1) | 2.99 (1) | 0.40 (1) |
| sample-checkin | 0.7 (16) | 11.1 (16) | 0.2 (16) | 71.3 (16) | 80.0 (16) | 0.3 (16) | 10.7 (16) | 0.013 (16) | 0.012 (16) | 2.55 (16) | 0.44 (16) |
| sample-retest | 0.8 (16) | 7.8 (16) | 0.1 (16) | 38.5 (16) | 51.3 (16) | 0.3 (16) | 7.4 (16) | 0.008 (16) | 0.013 (16) | 2.59 (16) | 0.31 (16) |
| session | 0.4 (8) | 11.1 (8) | 0.1 (8) | 56.8 (8) | 57.4 (8) | 0.2 (8) | 11.0 (8) | 0.057 (8) | 0.073 (8) | 2.21 (8) | 0.30 (8) |

## Statuses the engine emitted

| Clip | serve-count | toss-apex-height | contact-height-ratio | toss-drop | rhythm-release-to-contact | leg-drive | loading-depth |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline-s1 | estimated 1 | experimental 1 | experimental 1 | estimated 1 | estimated 1 | estimated 1 | estimated 1 |
| default75-s1 | estimated 1 | experimental 1 | experimental 1 | estimated 1 | estimated 1 | estimated 1 | estimated 1 |
| dist12-s1 | estimated 1 | experimental 1 | experimental 1 | estimated 1 | estimated 1 | experimental 1 | experimental 1 |
| fence9-s1 | estimated 1 | experimental 1 | experimental 1 | estimated 1 | estimated 1 | estimated 1 | estimated 1 |
| fps240-s1 | estimated 1 | experimental 1 | experimental 1 | estimated 1 | estimated 1 | estimated 1 | estimated 1 |
| sample-checkin | estimated 1 | experimental 16 | experimental 16 | estimated 16 | estimated 16 | estimated 16 | estimated 16 |
| sample-retest | estimated 1 | experimental 16 | experimental 16 | estimated 16 | estimated 16 | estimated 16 | estimated 16 |
| session | estimated 1 | experimental 8 | experimental 8 | estimated 8 | estimated 8 | estimated 8 | estimated 8 |

The test page imports each clip with no mount answer, so toss and contact heights are `experimental` (`PITCH_UNKNOWN`) and are not corrected for camera pitch; clips filmed closer than 6 m are capped at experimental as well.

## Stage times (s)

| Clip | Total | Model start | Serve scan (pass A) | Full-rate pass (pass B) | Pose busy | Ball busy | Key frames |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline-s1 | 20.1 | 5.1 | 5.9 | 7.6 | 6.5 | 7.2 | 0.5 |
| default75-s1 | 14.8 | 1.3 | 5.7 | 7.0 | 6.2 | 6.6 | 0.4 |
| dist12-s1 | 26.5 | 1.3 | 6.2 | 18.3 | 6.2 | 17.8 | 0.4 |
| fence9-s1 | 27.5 | 1.3 | 5.8 | 19.7 | 6.1 | 19.2 | 0.4 |
| fps240-s1 | 23.0 | 1.3 | 6.2 | 13.8 | 10.9 | 12.6 | 0.9 |
| sample-checkin | 161.4 | 0.6 | 61.7 | 91.1 | 179.9 | 114.1 | 4.7 |
| sample-retest | 163.1 | 0.7 | 63.3 | 91.2 | 180.2 | 128.3 | 4.6 |
| session | 84.2 | 1.0 | 33.7 | 45.4 | 89.2 | 70.4 | 2.3 |

## Reproduce

```sh
node tools/validate/e2e-accuracy.mjs --port 5401        # build, preview, run, score, write this file
node tools/validate/e2e-accuracy.mjs --skip-run         # re-score runs/ and rewrite this file
app/node_modules/.bin/tsx tools/validate/e2e-replay.ts --dump validation/results/e2e-final/runs/<clip>__default.json
```
