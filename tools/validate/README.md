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
