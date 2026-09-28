# tools/validate

End-to-end checks of the app's engine against the synthetic corpus (`validation/synthetic`).

`smoke.mjs` starts the app's Vite dev server, opens `app/validation.html` (the dev-only harness,
see `app/src/validation/README.md`) in headless Edge through Playwright once per clip, and writes
`validation/results/smoke/<clip>.json` and `validation/results/smoke/SUMMARY.md`. It uses the app's
own `playwright` and `vite` (no install here) and needs the corpus rendered (`tools/synth`).

```sh
node tools/validate/smoke.mjs                         # default set: quick, baseline, fps sweep, view sweep,
                                                      # distance sweep, dusk, night240, crf36, slow motion
node tools/validate/smoke.mjs --clips baseline-s1     # one clip
node tools/validate/smoke.mjs --sets slomo --force    # one set, re-running clips that already have a result
node tools/validate/smoke.mjs --summary-only          # rebuild SUMMARY.md from the JSON files
```

Options: `--concurrency N` (pages in parallel; stage times then include contention), `--timeout-min N`,
`--full [--full-dir DIR]` (also dump the complete `window.__harnessResult`, with per-frame
landmarks and candidates; git ignores `validation/results/**/full/`), `--channel msedge|chrome`,
`--headed`, `--out DIR`.

Privacy: every request the browser context makes is routed; anything not addressed to the dev
server is recorded and aborted, so a policy gap shows up as a failure without anything leaving the
machine. During the warm-up the page and the running pose worker are probed with a request to
MediaPipe's telemetry endpoint. Exit code 1 if a clip fails or any request left for another host.

## End-to-end accuracy of the production build (`e2e-accuracy.mjs`, `e2e-replay.ts`)

`metrics-eval.ts` scores the engine on the offline harness's full-rate input. The app itself runs
the production pipeline (`runAnalysis`: sparse serve scan, per-window dense pose, ball search in
workers), which can hand the engine different evidence. `e2e-accuracy.mjs` scores that path:

```sh
node tools/validate/e2e-accuracy.mjs --port 5401                  # production build (vite build + preview), 8 clips
node tools/validate/e2e-accuracy.mjs --server dev --clips session # the dev server, one clip
node tools/validate/e2e-accuracy.mjs --skip-run                   # re-score the stored runs
```

It runs `app/src/analysis/pipeline/e2e/perf-bench.mjs` (one fresh headless Edge context per clip,
`?dump=1`), scores the runs with `perf-accuracy.mts` (the `metrics-eval.ts` scoring) and counts
serves against the truth contacts (counted, hits, false serves). Default clips: `baseline-s1`,
`dist12-s1`, `default75-s1`, `fence9-s1`, `fps240-s1`, `session`, `sample-checkin`, `sample-retest`.
Output: `validation/results/e2e-final/` (`runs/`, `accuracy.md`, `accuracy.json`, `counts.json`,
`SUMMARY.md`).

`e2e-replay.ts --dump validation/results/e2e-final/runs/<clip>__default.json` replays `analyseSession`
in Node on the exact input the production pipeline passed (poses, ball observations, tracks, toss
entries, onsets, capture context), checks it reproduces the stored serves, and diffs that input
against the offline one (`validation/results/metrics/pipeline/full/<clip>.json`, when present).

## Light from the pixels (`light-eval.ts`)

Runs the app's light evidence (`app/src/analysis/quality/light.ts`: mains flicker at its alias and a
dark sky over a lit court, which lower the condition class the player gave) on every rendered clip,
decoded with the app's `ffmpeg-static` to a 16 × 16 luma grid and sampled like the serve scan (4 Hz
plus a 15 Hz fill around the serve), the player's box from the truth landmarks left out.

```sh
app/node_modules/.bin/tsx tools/validate/light-eval.ts [--clips a,b] [--sets night240,dusk]
```

Output: `validation/results/light/SUMMARY.md` and `rows.json` (renders only; the thresholds are
initial values, not calibrated on real courts).
