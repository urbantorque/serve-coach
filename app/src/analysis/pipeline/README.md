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
| `probe` | probe | 0 to 0.02 | Box probe, frame source (WebCodecs, else media element), time base (player override, slow-motion answer, container proof), budgets (10 min at 60 fps or less, 60 s at 120/240 fps, 2 GB). Session, video (retention per the player's setting) and job rows are written here. |
| `finding-serves` | audio, sparse | 0.02 (0.06 with audio) to 0.32 | Contact onsets only with hit-sound timing on (timestamps only; samples zeroed). Pass A: a 4 Hz pose scan of the whole clip, then a 15 Hz fill around arm-above-head activity (the engine contract's ~15-30 Hz where a serve can be). `cleanPoseFrames`, then `findServeWindows`, then planned windows. |
| `tracking-body`, `tracking-ball` | dense | 0.32 to 0.92 | Pass B per window: one decode; pose on every core frame (every 2nd at 240 fps) and every 3rd outside, in the pose worker with ROI crops; ball detection on every frame of [contact - 1.9 s, contact + 0.6 s] in the ball worker, on a GPU crop of the window's search region. The first toss's gravity check proves real time or corrects the time base (the window's ball pass is re-run). |
| `measuring` | keyframes | 0.92 to 0.96 | `analyseSession` (engine-core), key frames (below), compact tracks. |
| `coaching` | session | 0.96 to 0.98 | `decideFocus` from `src/coaching` when the build has it; skipped otherwise. |
| `saving` | session | 0.98 to 1 | One Dexie transaction: serves, tracks, key frames, stats, session analysis, job, coaching record (when the coaching module can convert it). |

Labels start with the Processing screen's row names ("Finding serves (8 found)", "Tracking the toss
(serve 3 of 8)", "Timing each phase", "Choosing your focus"). Events are throttled to 4 Hz, overall is
monotonic, and the ETA appears only after 5 s of measured throughput.

## Ball search (`ball/worker*.ts`)

The main thread crops each decoded frame on the GPU (`createImageBitmap(frame, sx, sy, sw, sh)`) to
the window's search region: the player's box widened 0.6 statures, up to the frame top (toss) and 1.5
statures into the court. The crop is downscaled only when the ball would be over 10 px in radius. The
bitmap is transferred to the ball worker, which reads it back in its own OffscreenCanvas and runs
`BallDetector`. Candidates come back in full-frame coordinates, so the tracker and toss analysis see
a full-frame run. Around the provisional contact time (the highest wrist in the last arm-above-head
run; the hit sound when hit-sound timing is on):

- before contact: toss band only, with the toss-phase plain-colour gate;
- near contact (± its uncertainty): toss band plus the post-contact corridor, no gate;
- after contact (side view): the corridor forward of the contact point, where a serve leaves within
  about 15° of horizontal.

Backpressure: `pushFrame` waits once 12 crops are queued, so decode runs ahead of both workers
without piling up frames.

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

- The AbortSignal reaches the decoder. On abort the ball worker is terminated and the pose source
  disposed at once. The session is marked `cancelled` and the job `cancelled`; no serve, track, key
  frame or stats row is written. The job keeps the Pass A windows for a later resume.
- Every failure maps to an `AnalysisError` with calm player copy (`errors.ts`). Examples: no serve
  found, unsupported format, too long, storage full, pose start-up failure.
- VideoFrames are closed as soon as both consumers are done (at most 3 open in tests). At most 12
  ball crops are queued and 2 pose frames are in flight.

## Measured (2026-09-27, headless Edge, Intel Core Ultra 5 laptop shared with other jobs; synthetic clips)

These use the real `engine.ts` and real workers. Times are noisy because the machine was busy.

| Clip | Total | Pass A | Pass B (pose / ball busy) | Key frames | Smoke harness |
| --- | --- | --- | --- | --- | --- |
| baseline-s1 (1 serve, 290 frames, 60 fps) | 16.2 s | 3.6 s (20 + 67 pose frames) | 7.8 s (7.6 / 6.4) | 0.4 s | 34.0 s (pose 13.1 s and ball 18.7 s, in series) |
| session (8 serves, 73.5 s, 4,411 frames) | 97.4 s | 33.2 s (295 + 576) | 56.0 s (55.4 / 44.7) | 6.9 s | none (single-serve clips only) |

- Pass B is bound by pose (about 60 ms a frame here); ball detection runs in parallel in its worker
  (about 42 ms a frame, 13 of them pixel readback). Without the ball worker, pose alone took the same
  time (`profile.mjs … noBall=1`).
- On the session clip the two-level Pass A saved no time. Serves come every 9 s, so the fill
  re-decodes most of the clip (37 s two-level against 35 s at a uniform 15 Hz). It pays off on real
  sessions with long gaps between serves.
- Cancellation settles in about 1.5 s. Every long await is raced against the signal because a
  disposed MediaPipe worker can leave a request pending: a cancel once took 48 s before
  `raceAbort`.

## Tests

- `npx vitest run src/analysis/pipeline src/analysis/ball/worker*`: unit tests and an orchestrator
  integration test (fake frame source, pose, ball client and engine; fake-indexeddb). They cover
  progress, cancellation, no serves, too long, slow-motion correction, clips with sound and
  persistence.
- `node src/analysis/pipeline/e2e/run-e2e.mjs [--port 5202]` needs `npx vite --port 5202
  --strictPort`. It runs the real pipeline in headless Edge on baseline-s1 and the 8-serve session
  clip, plus a cancellation run. It writes `validation/results/ui/engine-pipeline/e2e-report.json` and
  screenshots. While `engine.ts` is the engine-core stub, the runner uses the page's clearly labelled
  test-double engine (`?engine=double`), so the pipeline's own mechanics are exercised. Pass
  `--engine real` to force `engine.ts`.
- `e2e/profile.mjs` times Pass B with and without the ball worker (`?noBall=1`).
