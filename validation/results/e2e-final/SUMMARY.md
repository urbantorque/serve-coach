# End-to-end accuracy of the production pipeline (synthetic corpus)

Generated 2026-09-28T05:36:13.937Z by `tools/validate/e2e-accuracy.mjs` (server: prod; 8 clips). **Synthetic serves only; no real footage.** One run per clip in headless Edge on a shared laptop, so times are indicative.

The full pipeline (`runAnalysis`: serve scan, per-serve pose, ball search in workers, engine, key frames, storage) runs on each clip as the app would, from the production build (`vite build` + `vite preview`, `app/src/analysis/pipeline/e2e/server.mjs`) unless another server was chosen. Runs are scored against the generator's truth with `perf-accuracy.mts` (the scoring of `tools/validate/metrics-eval.ts`). Every run file in `runs/` keeps the engine's full input, so `tools/validate/e2e-replay.ts` can replay the engine offline and diff its input against the offline validation input. Causes, fixes and the fused-event rule: `docs/VALIDATION.md` §3.3. Production runs from before the 28 September fixes, with replay diffs: `repro/`.

## Serve counting

| Clip | True serves | Found (windows) | Counted | Counted with a true contact | False serves | Contacts not counted | Contact withheld (D2) | Console errors | Wall s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline-s1 | 1 | 1 | 1 | 1 | 0 | none | none | 0 | 17.3 |
| default75-s1 | 1 | 1 | 1 | 1 | 0 | none | none | 0 | 13.3 |
| dist12-s1 | 1 | 1 | 1 | 1 | 0 | none | none | 0 | 17.3 |
| fence9-s1 | 1 | 1 | 1 | 1 | 0 | none | none | 0 | 17.3 |
| fps240-s1 | 1 | 1 | 1 | 1 | 0 | none | none | 0 | 19.3 |
| sample-checkin | 16 | 16 | 16 | 16 | 0 | none | none | 0 | 147.7 |
| sample-retest | 16 | 16 | 16 | 16 | 0 | none | none | 0 | 148.3 |
| session | 8 | 8 | 8 | 8 | 0 | none | none | 0 | 77.8 |
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
| session | 0.4 (8) | 11.1 (8) | 0.1 (8) | 56.8 (8) | 57.4 (8) | 0.2 (8) | 11.0 (8) | 0.033 (8) | 0.048 (8) | 2.38 (8) | 0.33 (8) |

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

The test page imports each clip as daylight (the renders are) with no mount answer, so contact height is `experimental` (`PITCH_UNKNOWN`) and is not corrected for camera pitch; clips filmed closer than 6 m are capped at experimental as well. Toss height is experimental everywhere: its V1 pass through the app pipeline fails with truth landmarks (the method-only gate, 28 September), so it waits for a real-footage check. The pipeline also measures the light on the serve scan (`quality/light.ts`); none of these daylight renders is taken for court lights.

## Stage times (s)

| Clip | Total | Model start | Serve scan (pass A) | Full-rate pass (pass B) | Pose busy | Ball busy | Key frames |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline-s1 | 17.1 | 4.5 | 4.8 | 6.3 | 6.2 | 3.1 | 0.4 |
| default75-s1 | 12.4 | 0.9 | 4.8 | 5.9 | 5.8 | 3.2 | 0.4 |
| dist12-s1 | 16.8 | 1.0 | 5.4 | 9.8 | 5.7 | 9.4 | 0.3 |
| fence9-s1 | 16.2 | 0.9 | 4.8 | 9.8 | 5.9 | 9.6 | 0.4 |
| fps240-s1 | 18.4 | 1.0 | 5.4 | 10.7 | 10.3 | 6.2 | 0.8 |
| sample-checkin | 147.3 | 0.5 | 55.4 | 84.9 | 168.3 | 63.7 | 3.9 |
| sample-retest | 148.0 | 0.5 | 55.4 | 85.6 | 169.6 | 71.0 | 3.9 |
| session | 77.4 | 0.6 | 29.4 | 43.7 | 86.0 | 41.0 | 2.1 |

## Reproduce

```sh
node tools/validate/e2e-accuracy.mjs --port 5401        # build, preview, run, score, write this file
node tools/validate/e2e-accuracy.mjs --skip-run         # re-score runs/ and rewrite this file
app/node_modules/.bin/tsx tools/validate/e2e-replay.ts --dump validation/results/e2e-final/runs/<clip>__default.json
```
