# Video + audio input layer

Turns a phone video file into frames with exact timestamps, a trustworthy time base, and
audio transients. It is framework-free TypeScript. The pure modules run in Node (the
vitest `engine` project). The decode paths need browser APIs: WebCodecs, canvas,
HTMLVideoElement and Web Audio.

| File | What it does | Runs in |
|---|---|---|
| `probe.ts` | Parses MP4/MOV with mp4box.js, reading only the boxes it needs and skipping `mdat`. Outputs `VideoMeta`, the frame table, decoder config inputs, audio track info and the time-base assessment. | Node + browser |
| `timing.ts` | Edit lists, the presentation-order frame table, fps, VFR, dropped frames and rate segments. | pure |
| `timeBase.ts` | Slow-motion and time-base assessment, `applyTimeScale()`, `mediaToReal()`. | pure |
| `rotation.ts` | Rotation from the `tkhd` matrix, coded-to-display point maps, and the canvas transform. | pure |
| `qtMetadata.ts` | QuickTime `keys`/`ilst` (mdta), `udta` text atoms, and the keys declared by timed-metadata (`mebx`) tracks. | pure |
| `codecs.ts` | Codec families, and the HEVC codec string for the Dolby Vision base layer. | pure |
| `decodePlan.ts` | Frame selection, the keyframe pre-roll plan, and the timeline estimate for WebM. | pure |
| `decoder.ts` | WebCodecs `VideoDecoder` fed with samples read straight from the file. | browser, worker-safe |
| `seekDecoder.ts` | Fallback that seeks an `HTMLVideoElement` and confirms each frame with `requestVideoFrameCallback`. | browser main thread |
| `render.ts` | Downscales and rotates a frame to the analysis resolution (OffscreenCanvas or canvas). | browser |
| `frameSource.ts` | Factory. Picks the path, reports why, and gives one API over both paths. | browser |
| `audio.ts` | Onset detection DSP (pure) plus decoding with WebCodecs `AudioDecoder` or `decodeAudioData`. | pure + browser |
| `index.ts` | Public exports. | |

## Time conventions

- **Frame `index`**: presentation order among the frames a player actually shows. Frame 0 is
  the first frame `<video>` displays. Samples outside the edit list are not given an index.
  These are the pre-roll frames left by a stream-copy trim; they are still decoded when needed.
- **`tMedia`**: presentation time on the movie timeline, in seconds, with the edit list
  applied (`(cts - edit.media_time) / timescale` plus any leading empty edit). It equals
  `HTMLVideoElement.currentTime` and `requestVideoFrameCallback` `mediaTime` for the same
  frame. This was verified in Edge for every fixture.
- **`tReal`** is `tMedia * meta.timeScale`. `timeScale` is 1 unless the container proves
  otherwise, or the user or the physics module supplies a value via `applyTimeScale`.

## API

```ts
import { openFrameSource, applyTimeScale, codedToDisplay } from './analysis/video'

const source = await openFrameSource(file)             // File from <input type=file>
source.path        // 'webcodecs' | 'media-element'
source.pathReason  // e.g. "WebCodecs supports avc1.640028."
source.meta        // VideoMeta (types.ts)
source.probe?.timeBase // { kind, status: 'proven' | 'unknown', evidence[], warnings[] }

// RGBA at analysis resolution, rotation applied (DecodedFrame from types.ts)
for await (const f of source.frames({ startReal: 1.2, endReal: 2.4 }, { maxLongSidePx: 640 })) {
  f.index; f.tMedia; f.tReal; f.image.data // Uint8ClampedArray
}

// For MediaPipe: a GPU ImageBitmap, rotated, with no CPU copy
for await (const b of source.bitmaps({ step: 2 }, { maxLongSidePx: 256 })) {
  landmarker.detectForVideo(b.bitmap, b.tMedia * 1000)
  b.bitmap.close()
}

// Zero-copy: the decoder's own VideoFrame (or an ImageBitmap on the fallback path).
// MediaPipe accepts VideoFrame. Map its coded-orientation output with pendingRotationDeg.
for await (const raw of source.rawFrames({ startIndex: 100, endIndex: 160 })) {
  const result = landmarker.detectForVideo(raw.image, raw.tMedia * 1000)
  const p = codedToDisplay(lm.x, lm.y, raw.pendingRotationDeg)
  raw.close() // required, and promptly: the decoder stalls when frames are held
}

// The time base, corrected by the user (e.g. "that was 240 fps slow-mo") or by physics
source.setMeta(applyTimeScale(source.meta, 240, source.meta.nominalFps / 240, 'user'))
```

A selection is `{ startIndex?, endIndex?, step? }`, `{ startReal, endReal, step? }` or
`{ indices }`. Every generator accepts `{ signal, onStats }`. `onStats` receives
`DecodeStats`, which records requested and yielded counts, `missingIndices`, samples fed
(including keyframe pre-roll) and elapsed time. Breaking out of a `for await` loop, or
aborting, closes the decoder.

Lower level: `probeVideo(fileOrBytes)` returns a `ProbeResult` with `meta`, the `frames`
table, the `video.samples` table (decode order, with byte offsets), `audio`, `metadata`,
`timing` and `timeBase`. The same code runs in Node for tests.

### Audio

```ts
import { decodeAudioTrack, decodeAudioFileData, detectOnsets, assessAudioTiming, toAudioOnsets, blobSource, hasAudioDecoder } from './analysis/video'

const audio = probe.audio && hasAudioDecoder()
  ? await decodeAudioTrack(probe.audio, blobSource(file))   // reads only the audio samples; applies the edit list itself
  : await decodeAudioFileData(await file.arrayBuffer())      // whole file in memory
const timing = assessAudioTiming(meta)                       // unusable for time-scaled (rendered slow-mo) clips
const onsets = detectOnsets(audio.samples, audio.sampleRate, {
  offsetS: audio.startTimeS, timeScale: meta.timeScale, labelKinds: timing.usable,
})
toAudioOnsets(onsets) // AudioOnset[] (types.ts); strength = dB above the pre-onset noise floor
```

The pipeline:

1. A 100 Hz high-pass filter.
2. An onset envelope: the rise in dB of the 2 ms energy over the minimum of the previous
   5 ms, at a 1 ms hop. Spectral flux is available as an option.
3. Adaptive peak picking: local median plus 6 × the robust sigma, with at least 6 dB of
   rise and 50 ms between onsets.
4. Sample-accurate refinement: the first sample above noise + 10% of the rise, after a
   quiet stretch of at least 3 ms, corrected for the half-window bias.
5. Features: rise time, the share of energy above 2 kHz, spectral centroid and SNR.
6. `sharpness` from 0 to 1, and the label `contact`, `bounce` or `unknown`.

**The label is a heuristic tuned only on synthetic sounds. Treat it as `experimental`
until it has been validated on labelled real recordings.**

## Decode paths and browser support

`openFrameSource` tries the paths in this order:

1. **WebCodecs** (`decoder.ts`). Used when the file is MP4/MOV, `VideoDecoder` exists, and
   `isConfigSupported` accepts the codec. It is frame-exact. Decoding starts at the keyframe
   before the first wanted frame, stepping back one more GOP for open-GOP leading pictures.
   Frames outside the request are closed immediately. Samples that no wanted frame depends on
   are not fed at all (`nalRef.ts`: H.264 pictures whose slices all have nal_ref_idc 0; HEVC
   sub-layer non-reference pictures of the top temporal layer), so every frame that comes out
   is bit-identical while a sparse selection decodes less: 48% of the synthetic corpus's samples
   (libx264 B-frames), and the 16-serve clip's 4 Hz scan in 4.9 s instead of 9.8 s (hardware,
   Edge 154, 2026-09-28). Phone encoders that write only I and P pictures have nothing to skip.
   `DecodeStats.samplesSkipped` counts them; `skipDisposable: false` turns it off. A decode run
   is split at a flush only when that skips more than 45 samples (`MIN_SKIP_SAMPLES`: a flush
   cost about as much as decoding 35). `DecodeOptions.hardwareAcceleration` asks for a software
   decoder for one call (check `FrameSource.canDecodeWith` first): its frames live in CPU memory,
   and `planar.ts` copies a crop out of one in its own YUV layout (about 1 ms for a 950 x 1270
   crop, against 13 ms for the same `copyTo` of a hardware frame, which reads the GPU back).
   Memory is bounded by a decode queue of 12, 6 pending output frames and 8 MB read batches. Dolby Vision `dvh1`/`dvhe`
   (iPhone HDR) is decoded as its HEVC base layer, using an `hvc1.*` string built from
   `hvcC`.
2. **Media element** (`seekDecoder.ts`). Used for WebM/VP9, for codecs WebCodecs rejects,
   and when WebCodecs is missing. It seeks to `tMedia + 0.25 frame`, then confirms the frame
   on screen with `requestVideoFrameCallback` `mediaTime`. If the wrong frame appears, it
   tries once more at mid-frame. A frame that still cannot be reached is listed in
   `missingIndices`, never silently replaced. For MP4 the probe's frame table is used. For
   WebM the timeline is estimated: a least-squares fit to frame-callback times during a
   short muted playback, snapped to a standard rate within 0.5%, with the first frame
   measured by seeking to 0. This assumes a constant frame rate. The element itself applies
   rotation.

| Platform | Status |
|---|---|
| Edge 153 / Chrome 153 on Windows, headless | **Tested: 12/12 browser checks pass on both.** H.264, HEVC (`hvc1`, via the platform decoder), VP9 WebM (fallback), AudioDecoder, OffscreenCanvas and rVFC are all available. |
| iOS / iPadOS Safari and WKWebView (Capacitor) | **Not tested (no device or Xcode here).** From Apple's release notes as I know them: `VideoDecoder`, `EncodedVideoChunk`, `VideoFrame` and 2D `OffscreenCanvas` arrived in Safari/iOS 16.4; `requestVideoFrameCallback` in 15.4; H.264 and HEVC decode are hardware-backed. `AudioDecoder` arrived much later (Safari 26 era), so on older iOS the audio falls back to `decodeAudioData`, whose AAC priming handling on Safari is unmeasured. WKWebView follows the OS Safari version. Verify on a device before relying on any of this. |
| Firefox | Not tested. The code falls back cleanly if `VideoDecoder` or `isConfigSupported` refuses the codec. |

## Slow motion and the time base: what the container can and cannot prove

`probe.timeBase` records `kind`, `status`, `evidence[]` and `warnings[]`. `VideoMeta`
receives `captureFps`, `timeScale` and `fpsSource`.

| Situation | What we do | Status |
|---|---|---|
| Timestamps advance at 100 fps or more (e.g. iPhone 120/240 fps slow-mo originals from Files, AirDrop "All Photos Data", or USB import) | `captureFps` = timeline rate, `timeScale` = 1, `fpsSource` = `'timestamps'` | proven |
| `com.android.capture.fps` present (Android MediaRecorder slow motion or time lapse; float or string) | `captureFps` = the key's value, `timeScale` = timeline fps / capture fps, `fpsSource` = `'container'` | proven |
| `com.apple.quicktime.full-frame-rate-playback-intent` = 0 on a high-rate file | Reported as `playbackIntent: 'slow-motion'`; timestamps are still real time | proven |
| The same key = 0 on a timeline of 60 fps or less, frame-interval ramps (e.g. 240 → 30 → 240), or an edit list with rate ≠ 1 | `kind: 'possible-rendered-slomo'`; `timeScale` stays 1 | **unknown** |
| An ordinary 24–60 fps clip | `timeScale` 1. For Apple devices, a warning that it could be a rendered slow-mo export | **unknown** |

Research notes. Web search was limited in this session, so only the first two sources were
checked directly:

- **Checked:** Apple's AVFoundation docs define
  `quickTimeMetadataFullFrameRatePlaybackIntent` (iOS 18 / macOS 15) as movie-level
  metadata: 1 means play at full frame rate, 0 means play in slow motion. exiftool's
  QuickTime Keys table lists it as `full-frame-rate-playback-intent`, with the
  `com.apple.quicktime.` prefix stripped.
- **Checked:** exiftool lists `com.android.capture.fps` (a float) together with
  `com.android.manufacturer` and `com.android.model`.
- **Handled:** iPhone files keep these keys in `moov/meta` (handler `mdta`); ffmpeg writes
  them under `moov/udta/meta`. Both locations are read.
- **Not verified (no real footage):**
  - whether the iPhone Camera app writes `full-frame-rate-playback-intent`;
  - which keys iPhone timed-metadata tracks declare. `mebx` key names are listed but their
    values are not decoded; they live in media samples.
  - how Photos stores the slow-motion ramp. My understanding is that it lives in Photos
    adjustment data (`.AAE`), not in the MOV.
- **Not feasible from the container:** a slow-mo clip shared from iOS Photos
  (Messages, WhatsApp, "Save to Files" without "All Photos Data") is re-rendered to a
  normal-rate timeline, and the slow section is baked in. Nothing verified marks the
  factor, and the ramps at each end run at 1×, so a single `timeScale` cannot describe the
  clip anyway (see the contract proposal for a piecewise time map). The ball-toss gravity
  fit (elsewhere) or the player must supply it. The audio in such clips is time-stretched
  or muted, so `assessAudioTiming` marks it unusable.
- **Samsung:** "super slow-mo" metadata appears to sit in a proprietary SEF trailer. It is
  not documented in exiftool's Samsung tables and is not parsed here.

## Measured results

Measured on this Windows 11 machine (8 logical CPUs) with headless Edge 153 and Chrome 153,
using the Playwright runner below. These are not phone numbers.

**Correctness.** Every clip carries its frame number as a 16-bit barcode, and each decoded
frame is read back:

- **WebCodecs, every frame exactly once, in order, barcode = index, `tMedia` error 0:**
  - 60 fps H.264 High with B-frames, 120/120 frames;
  - index, real-time, step and explicit-list selections;
  - rotation 90 (RGBA 180×320; raw `VideoFrame` 320×180 with `pendingRotationDeg` 90);
  - stream-copy trim with an edit-list pre-roll (102 frames, first barcode 18);
  - a VFR step (60 → 30 fps);
  - 240 fps MOV;
  - fragmented MP4;
  - HEVC `hvc1`.
- **Abort and early break:** both release the decoder, and decoding afterwards is correct.
- **Media-element path:**
  - MP4 (probe timeline): 120/120 correct, including rotation;
  - VP9 WebM (estimated timeline): 60/60 correct, after fixing the timeline estimate for
    WebM's millisecond timestamps.

**Throughput** (frames per second; the second figure in each cell is from the 5 s clip,
300 frames, H.264 High, testsrc2 plus barcode; 720p ≈ 5.5 Mbit/s, 1080p ≈ 11 Mbit/s):

| Output | 720p60 (Edge / Chrome) | 1080p60 (Edge / Chrome) |
|---|---|---|
| Raw `VideoFrame`, closed immediately (decode only) | 837–1037 / 900 | 464–650 / 485 |
| RGBA at 640 px, GPU canvas + `getImageData` (default) | 138–164 / 132–138 | 184–229 / 200 |
| RGBA at 640 px, CPU canvas (`willReadFrequently`) | 87–104 / 92 | 72–92 / 77 |
| RGBA at full resolution, GPU canvas (120 frames) | 149 / 128 | 109 / 91 |
| ImageBitmap at 256 px (rotated, for pose) | 174–193 / 169 | 275–348 / 338 |
| Media-element seek path (first 60 frames) | 29–36 / 29 | 14–16 / 18 |

Edge figures are the range over the runs made with the current code. Each Chrome figure is
from a single run. The spread comes from warm-up (the 720p case runs first) and other
agents' processes on the same machine. With the earlier CPU-canvas defaults, full-res RGBA
ran at 44 fps (1080p) and 256 px bitmaps at 77–114 fps; that is why both now use a GPU
canvas.

**Audio onset timing** (`detectOnsets`):

- **Node, synthetic:** 20 broadband clicks × 10 noise seeds per condition, at 48 and
  44.1 kHz, noise RMS from 0.005 to 0.03, click amplitude from 0.1 to 0.6, both envelope
  methods. All 1,000 detected. |error| median 0.021 ms, p95 0.083 ms, max 0.162 ms; mean
  signed error +0.027 ms.
- **Browser, AAC 192 kbit/s in MP4 (`cfr60.mp4`):** contacts +0.021 ms and +0.063 ms; the
  low 180 Hz "bounce" thump +0.50 ms. Kinds were all labelled correctly (sharpness 1.0 vs
  0.25).
- **Priming:** the results are identical through WebCodecs `AudioDecoder` (with our own
  edit-list trim of 1024 priming samples = 21.3 ms) and through Edge/Chrome
  `decodeAudioData`, which also trims the priming.

## Tests

```sh
npx vitest run src/analysis/video                            # Node unit tests (generate clips via ffmpeg-static if missing)
node src/analysis/video/__fixtures__/run-browser-tests.mjs   # Edge headless; --channel=chrome, --headed, --only=audio, --json
node src/analysis/video/__fixtures__/fixtures.mjs --perf     # (re)build clips; --force to rebuild
```

`__fixtures__/fixtures.mjs` builds the clips with ffmpeg-static, all with the frame-number
barcode:

- `cfr60.mp4`: 60 fps H.264 with B-frames and GOP 30, plus AAC with contact clicks at
  0.5 s and 1.0 s and a bounce thump at 1.5 s;
- `rot90.mp4`;
- `trimmed.mp4`;
- `fragmented.mp4`;
- `vfr.mp4`;
- `hfr240.mov`, with Apple keys;
- `android240.mp4`, with `com.android.capture.fps`;
- `vp9.webm`;
- `hevc.mp4`;
- `perf720.mp4` and `perf1080.mp4`.

Clips go to `__fixtures__/clips/`, which is gitignored and rebuilt on demand. Node-only
code lives in `.mjs` files (with `fixtures.d.mts` for types), so the app TypeScript program
never needs `@types/node`.

## Known limitations

- **Validation:** nothing has been validated on real phone footage (not permitted). The
  Apple and Android metadata parsing was exercised only on files written by ffmpeg and on
  synthetic atoms.
- **Time base:**
  - one `timeScale` per clip, so ramped (rendered) slow motion cannot be represented;
  - only the first media edit is used (other edits and rate ≠ 1 produce warnings);
  - mirroring matrices are reported but not applied.
- **Media-element path:**
  - main thread only;
  - roughly 15–35 fps;
  - WebM timelines assume a constant frame rate;
  - `meta.hasAudio` is unknown (false) for WebM, since there is no container parse.
- **Audio:**
  - `decodeAudioFileData` holds the whole file in memory, so prefer `decodeAudioTrack`;
  - the contact/bounce thresholds come from synthetic signals only.
- **HEVC:** support depends on the platform decoder. It worked here in headless Edge and
  Chrome on Windows; elsewhere the factory falls back to the media element, which may also
  be unable to play HEVC.
