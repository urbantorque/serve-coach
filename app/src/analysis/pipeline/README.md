# Analysis pipeline (engine-pipeline)

`runAnalysis(file, options)` is the production entry point (ARCHITECTURE §5). It orchestrates the
engine layers; the measurement logic itself lives in `engine.ts` (engine-core), `ball/`, `pose/` and
`video/`. The UI finds it through `ui/screens/record/flow/analysisAdapter.ts`.

```ts
import { runAnalysis } from '../analysis/pipeline/index.ts'
const result = await runAnalysis(file, {
  sessionId, profile: { heightM, handedness }, view: 'side', capture, fpsOverride, signal,
  onProgress: (event) => { /* { type: 'progress', progress } | { type: 'serve-ready', … } | { type: 'warning', … } */ },
})
// Rejects with AnalysisError { code, playerMessage, recoverable, detail }.
```

## Stages

| Step (progress `step`) | Engine stage | Overall span | What happens |
| --- | --- | --- | --- |
| `probe` | probe | 0 to 0.02 | Box probe, frame source (WebCodecs, else media element), time base (player override, slow-motion answer, container proof), budgets (10 min at 60 fps or less, 60 s at 120/240 fps, 2 GB). Session, video (retention per the player's setting) and job rows are written here. The landmarker starts loading at the same time (runtime, model, GPU warm-up: 1-5 s), so Pass A rarely waits for it. |
| `finding-serves` | audio, sparse | 0.02 (0.06 with audio) to 0.32 | Contact onsets only with hit-sound timing on (timestamps only; samples zeroed). Pass A: a 4 Hz pose scan of the whole clip, then a 15 Hz fill around arm-above-head activity (the engine contract's ~15-30 Hz where a serve can be). `cleanPoseFrames`, then `findServeWindows`, then planned windows. |
| `tracking-body`, `tracking-ball` | dense | 0.32 to 0.92 | Pass B per window: pose on every core frame (every 2nd at 240 fps) and a 20 Hz grid outside it, with ROI crops, the windows shared out over the pose lanes (`densePoseLaneCount`: 2 on 8-thread devices); ball detection on every frame of [contact - 1.9 s, contact + 0.6 s] (the toss phase every 2nd frame at 240 fps) in a pool of ball workers, on YUV crops of the toss band and corridor. The first toss's gravity check proves real time or corrects the time base (the window's ball pass is re-run). |
| `measuring` | keyframes | 0.92 to 0.96 | `analyseSession` (engine-core), key frames (below), compact tracks. |
| `coaching` | session | 0.96 to 0.98 | `decideFocus` from `src/coaching` when the build has it; skipped otherwise. |
| `saving` | session | 0.98 to 1 | One Dexie transaction: serves, tracks, key frames, stats, session analysis, job, coaching record (when the coaching module can convert it). |

Labels start with the Processing screen's row names ("Finding serves (8 found)", "Tracking the toss
(serve 3 of 8)", "Timing each phase", "Choosing your focus"). Events are throttled to 4 Hz, overall is
monotonic, and the ETA appears only after 5 s of measured throughput.

## Ball search (`ball/worker*.ts`)

Each window's ball frames are decoded in software when the codec allows it (`prefer-software`):
the frames are then in CPU memory, and the main thread copies the crop out of each one in its own YUV
layout (`VideoFrame.copyTo` of a rectangle, about 1 ms; `video/planar.ts`). The copy is transferred
to a ball worker, and `BallDetector` box-downscales it straight from the YUV and converts to RGB only
the few boxes it refines. Nothing touches the GPU, so ball detection no longer stalls the pose worker:
the old GPU crop and worker readback cost 8 ms a frame alone and about 50 ms beside pose. Frames the
YUV path cannot take (10-bit, HDR, unknown colour space) and codecs without a software decoder take
the GPU path (`createImageBitmap` crop, read back in the worker).

The crop is the window's search region cut down to what the detector ever searches in the side view:
the toss band and the post-contact corridor, plus 0.02 frame heights (`windows.ts ballSearchCrop`).
Other views keep the player's box widened 0.6 statures, up to the frame top and 1.5 statures into the
court. Candidates come back in full-frame coordinates, so the tracker and toss analysis see a
full-frame run. Around the provisional contact time (the highest wrist in the last 0.25 s of the last
arm-above-head run; the hit sound when hit-sound timing is on):

- before contact: toss band only, with the toss-phase plain-colour gate;
- near contact (± the search doubt, `ballSearchDoubtS`: 0.45 s for a pose-timed contact, 0.25 s for
  a sound-timed one): toss band plus the post-contact corridor, no gate;
- after contact (side view): the corridor forward of the contact point, where a serve leaves within
  about 15° of horizontal.

The toss band is the setup band reaching 0.45 statures further towards the court, and always
covering the provisional contact's wrist column (`tossSearchBand`); with no setup band the whole
window crop, never the corridor alone. These fixes come from the
2026-09-28 production-build accuracy run (`validation/results/e2e-final/SUMMARY.md`): on dist12-s1
and default75-s1 the toss drifted past the band's forward edge and the ball was lost 0.27 s before
contact (the engine then placed contact where the ball vanished); on the multi-serve clips a contact
estimate 0.33-0.54 s early (the tossing arm, still up, won the old 0.6 s search) cut the toss track
before its fall, and 3 of 27 serves went uncounted. The engine also receives every ball candidate
of every window (`engineObservations`), as the offline validation input does, so it can follow the
toss back into the hand.

Backpressure: `pushFrame` waits once the worker's share of 12 queued crops is reached, so decode runs
ahead of the workers without piling up frames.

## Decoding

- Pass A decodes the whole clip once for its 4 Hz scan and the activity spans again for the fill,
  with a decode-ahead of 3 frames (`prefetch.ts`) so decoding overlaps inference.
- Samples no wanted frame depends on are not decoded at all (`video/nalRef.ts`: H.264 pictures with
  nal_ref_idc 0, HEVC sub-layer non-reference pictures of the top layer). Every decoded frame is
  bit-identical either way. On the synthetic corpus (libx264 with B-frames) that is 48% of the
  samples, and the 4 Hz scan of the 16-serve clip decodes in 4.9 s instead of 9.8 s; phone encoders
  that write only I and P pictures have none to skip.
- A decode run is split at a flush only when it would skip more than 45 samples (`decodePlan.ts`): a
  flush costs about as much as decoding 35.

## Key frames

Per serve, for each event found: a 480 px thumbnail (JPEG q0.72), plus a 720 px evidence crop (q0.8)
for apex, trophy, lowest hip and contact. One 160 px square session thumbnail (`role: 'session-thumb'`,
`getSessionThumb`). About 20 KB per thumbnail. They survive video deletion (D8).

## Honesty and privacy

- Metric statuses come from the engine and the ball layer unchanged. The pipeline adds none.
  Experimental speed is only computed where the ball layer allows it (side view, 120 fps or more,
  target tag); the pipeline never passes audio to a speed function.
- Audio is decoded only with hit-sound timing on and a real-time base. Only onset timestamps leave
  `audio.ts`.
- A stored video never has sound. Until `data/stripAudio.ts` exists (it is picked up automatically),
  a clip with an audio track is analysed from the picked file and no copy is kept. The player sees
  "We couldn't remove the sound from this video, so we didn't keep a copy. Your original is unchanged."

## Cancellation, failure and memory

- The AbortSignal reaches the decoder. On abort the ball workers are terminated and the pose
  sources disposed at once, including a landmarker still loading (it is disposed the moment it
  arrives). The session is marked `cancelled` and the job `cancelled`; no serve, track, key
  frame or stats row is written. The job keeps the Pass A windows for a later resume.
- Every failure maps to an `AnalysisError` with calm player copy (`errors.ts`). Examples: no serve
  found, unsupported format, too long, storage full, pose start-up failure.
- VideoFrames are closed as soon as their consumer is done (in tests: the decode-ahead queue plus
  3). At most 12 ball crops are queued (split between the ball workers) and 2 pose frames are in
  flight per lane.

## Measured (2026-09-28, headless Edge 154, Intel Core Ultra 5 226V / Arc 130V laptop; synthetic clips)

`perf-bench.mjs` (real `engine.ts`, real workers, a fresh browser context per run) and
`perf-accuracy.mts`. "Before" is commit b576aaa, the same clips and machine, 2026-09-27. The machine
was shared with other jobs, so single runs vary by about ±10%.

| Clip | Total before → after | Pass A | Pass B (pose busy / ball busy) | Key frames |
| --- | --- | --- | --- | --- |
| baseline-s1 (1 serve, 60 fps) | 25.8 → 14.8 s | 5.3 → 4.0 s | 13.3 → 6.0 s (13.0 / 11.0 → 5.8 / 2.3) | 0.8 → 0.4 s |
| dist12-s1 (1 serve, 12 m) | 22.0 → 12.8 s | 5.4 → 4.3 s | 14.5 → 7.3 s | 0.6 → 0.3 s |
| fps240-s1 (1 serve, 240 fps) | 50.1 → 16.8 s | 7.2 → 4.1 s | 39.2 → 10.9 s (37.8 / 31.5 → 10.5 / 4.5) | 2.1 → 0.7 s |
| session (8 serves, 73.5 s) | 139.2 → 77.3 s | 41.3 → 29.7 s | 85.5 → 44.1 s (84.6 / 70.3 → 87.5 on 2 lanes / 28.2) | 9.1 → 1.9 s |
| sample-checkin (16 serves, 134.5 s) | 254.0 → 151.4 s | 70.9 → 56.8 s | 161.1 → 88.6 s (159.3 / 132.7 → 176.0 on 2 lanes / 47.3) | 18.1 → 3.7 s |

Accuracy is unchanged within the runs' rounding: the same serves found and analysed (sample-checkin 14
of 16 analysed before and after; session 7 of 8), pose error identical (sample-checkin 0.1075 BH,
session 0.1053 BH; the 240 fps clip 0.093 → 0.098 BH because the context outside the core is now
posed at 20 Hz, not 80 Hz), apex timing within 0.2 ms, toss height ratio error 0.010 / 0.049-0.050 /
0.071 / 0.081 before and after, contact height ratio error 0.010 → 0.012 on sample-checkin.

The 90 s target for the 16-serve clip was not reached. What bounds it on this machine:

- Pass A (57 s) is pose-bound (MediaPipe's WebGL path costs 25-35 ms a frame whatever the model:
  lite was no faster), and serve finding is so sensitive to its poses that every change tried moved
  far-side (ad court) serves of the 8-serve session clip across a threshold and lost them: tracking
  the fill with numPoses 1 (Pass A 32 s instead of 44 s; 7 of 8 serves found), feeding decoder
  frames with a scale instead of pre-scaled bitmaps (7 of 8), software decoding (6 of 8) and a
  CPU-delegate fill (6 of 8). Pass A is therefore bit-identical to before; only its decoding and
  start-up got cheaper.
- Pass B pose with numPoses 2 costs 33-34 ms a frame; numPoses 1 is 25% cheaper but lags (see
  `DENSE_NUM_POSES`). Reusing Pass A poses for the context, 30 Hz in the slow parts of the core and a
  512 px crop cap each saved 1-20% but moved heights or event timing, so they are off by default
  (`RunAnalysisOptions.passB`).
- Running Pass B on CPU-delegate lanes while Pass A still held the GPU (speculative windows) cut the
  16-serve clip to 104 s with numPoses 1, but slowed Pass A by 15 s through GPU-process contention,
  and with numPoses 2 a CPU lane manages only about 91 ms a frame (pose throughput probe). Not kept.

- Cancellation settles within about 0.5 s (probe, Pass A and Pass B checked in the browser). Every
  long await is raced against the signal because a disposed MediaPipe worker can leave a request
  pending: a cancel once took 48 s before `raceAbort`.

## Tests

- `npx vitest run src/analysis/pipeline src/analysis/ball/worker*`: unit tests and an orchestrator
  integration test (fake frame source, pose, ball client and engine; fake-indexeddb). They cover
  progress, cancellation, no serves, too long, slow-motion correction, clips with sound and
  persistence.
- `node src/analysis/pipeline/e2e/run-e2e.mjs [--port 5202] [--server prod|dev|external]` builds and
  serves the production bundle itself (below). It runs the real pipeline in headless Edge on baseline-s1 and the 8-serve session
  clip, plus a cancellation run. It writes `validation/results/ui/engine-pipeline/e2e-report.json` and
  screenshots. While `engine.ts` is the engine-core stub, the runner uses the page's clearly labelled
  test-double engine (`?engine=double`), so the pipeline's own mechanics are exercised. Pass
  `--engine real` to force `engine.ts`.
- `e2e/profile.mjs` times Pass B with and without the ball worker (`?noBall=1`).
- `e2e/perf-bench.mjs --clips a,b --variants "|poseLanes=1" [--repeat n] [--server prod|dev|external]`
  times the production pipeline per clip and variant (query knobs in `pipeline-e2e.ts`) and writes the
  engine's full input (poses, ball observations, tracks, toss entries, onsets, capture context), each
  ball window's search configuration and candidates, Pass A's poses and the output serves;
  `e2e/perf-accuracy.mts --dir DIR` scores those runs against the synthetic truth (serve count,
  event timing, metric errors, pose error).
- **Production build by default.** `--server prod` (the default for run-e2e.mjs, perf-bench.mjs and
  `tools/validate/e2e-accuracy.mjs`) runs `vite build` with `e2e/vite.prod.config.mjs` (the app's own
  config plus the e2e page, into `node_modules/.serve-e2e/dist`) and serves it with `vite preview`,
  which also serves the synthetic corpus under `/__synthetic/` (`e2e/server.mjs`). `--server dev`
  starts the dev server; `--server external` uses one already on the port.
- `tools/validate/e2e-accuracy.mjs` is the scored end-to-end set (five single-serve side clips and
  the three multi-serve clips); `tools/validate/e2e-replay.ts --dump RUN.json` replays the engine on
  a run's own input in Node and diffs it against the offline validation input.
