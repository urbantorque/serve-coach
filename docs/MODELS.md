# Bundled models and runtimes

All model and runtime files are served from the app's own origin so analysis works offline.

| File | Source | Size (bytes) | SHA-256 (downloaded 2026-09-27) |
| --- | --- | --- | --- |
| `app/public/models/pose_landmarker_lite.task` | https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task | 5777746 | `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` |
| `app/public/models/pose_landmarker_full.task` | https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task | 9398198 | `4eaa5eb7a98365221087693fcc286334cf0858e2eb6e15b506aa4a7ecdcec4ad` |

Both are MediaPipe task bundles (zip) containing `pose_detector.tflite` and `pose_landmarks_detector.tflite`.
The URLs point at `latest`, so re-downloading may change the model; record the new hash here and
re-run validation if it does.

The MediaPipe Tasks Vision wasm runtime is copied from `node_modules/@mediapipe/tasks-vision/wasm`
to `app/public/mediapipe/wasm` by `npm run copy:mediapipe` (also runs on `postinstall`). It is
gitignored because it is reproducible from the pinned package version.
