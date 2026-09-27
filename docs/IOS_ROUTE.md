# iOS route

**Updated 27 September 2026.** How the web app becomes an iPhone app: a Capacitor 8 shell around the built web app first, then native plugins for capture and (optionally) pose, then a fully native app only if the evidence calls for it (DECISIONS D9; ARCHITECTURE §15). Launch dates and legal steps are in [LAUNCH_AU.md](LAUNCH_AU.md).

**Short version:** `npx cap add ios` **worked on Windows**. The Xcode project in `app/ios` is generated and configured (permission strings, privacy manifest, iOS 26.0 target), but it has **never been resolved, signed, compiled or run**. Everything from Swift package resolution onwards needs a Mac.

**Re-checked at the hardening commit after `33ac31f`** (28 September 2026, Windows):
- `CI=1 npx cap sync ios` exits 0. It copies `dist/` into `ios/App/App/public` and rewrites `Package.swift` with no tracked changes.
- `CI=1 npx cap doctor ios` (run on 27 September) reports `[error] Xcode is not installed`, which is expected on Windows.
- `npm run build` passes again (typecheck clean); the synced `dist/` is that build, 84 MB.

## 1. What was generated here (Windows 11, 27 September 2026)

Commands, run in `app/` with Node 24.18.0 and `@capacitor/cli` 8.5.2:

```sh
npm run build            # tsc -b && vite build -> dist/ (83 MB, see §5)
CI=1 npx cap add ios     # exit 0
CI=1 npx cap sync ios    # exit 0, after the capacitor.config.ts change
```

Output of `cap add ios` (abridged): "Adding native Xcode project in ios", "Copying web assets from dist to ios\App\App\public", "Creating capacitor.config.json in ios\App\App", "All Capacitor plugins have a Package.swift file and will be included in Package.swift", "ios platform added!". No CocoaPods were needed: Capacitor 8 generates a **Swift Package Manager** project by default (ARCHITECTURE [A2]), and its iOS checks only run on macOS. `CI=1` keeps the CLI non-interactive; the Capacitor CLI sends usage telemetry only from interactive terminals (`@capacitor/cli` `telemetry.js`), so nothing was sent.

**Files committed to the repo** (`app/ios`):

| Path | What it is | Changed by us? |
|---|---|---|
| `App/App.xcodeproj/project.pbxproj` | Xcode project, target `App`, bundle ID `au.com.servecoach.app` | Yes: deployment target 15.0 → **26.0** (4 places); `PrivacyInfo.xcprivacy` added to the App group and the Resources phase |
| `App/App/Info.plist` | App settings | Yes: see §2 |
| `App/App/PrivacyInfo.xcprivacy` | Privacy manifest | **New**: see §3 |
| `App/App/AppDelegate.swift`, `SceneDelegate.swift`, `Base.lproj/*.storyboard` | Capacitor template | No |
| `App/App/Assets.xcassets` | **Placeholder** Capacitor icon and splash | No; replace before TestFlight |
| `App/CapApp-SPM/Package.swift` | SPM host package; depends on `capacitor-swift-pm` 8.5.2 from GitHub | No ("managed by Capacitor CLI") |
| `debug.xcconfig`, `.gitignore` files | Template | No |

**Generated but ignored by git** (recreated by `npx cap sync ios`): `App/App/public/` (a copy of `dist/`), `App/App/capacitor.config.json`, `App/App/config.xml`, `capacitor-cordova-ios-plugins/`. The Xcode project lists `capacitor.config.json` and `config.xml` as resources, so **run `npx cap sync ios` before opening Xcode** on a fresh clone.

**`app/capacitor.config.ts`** now sets, for iOS: `contentInset: 'never'` (the web layout handles safe areas), `limitsNavigationsToAppBoundDomains: false`, `preferredContentMode: 'mobile'`, `allowsLinkPreview: false`. There is deliberately **no `server` block**: the web app ships inside the binary and loads from `capacitor://localhost`, never a remote URL (App Review 2.5.2 and 4.2). The Safari Web Inspector stays on in debug builds only (Capacitor's default).

## 2. Info.plist permission strings and settings

| Key | Value (summary) | Why |
|---|---|---|
| `NSCameraUsageDescription` | "Serve Coach records your serve so it can analyse it on this iPhone. Video only, no sound, and nothing is uploaded." | Required for `getUserMedia` in WKWebView and for native capture (research 07 [S41]; CAPTURE §10) |
| `NSPhotoLibraryUsageDescription` | Opens the videos you choose, including the original slow-motion file; nothing uploaded | The planned native import reads original slow-motion assets through the Photos library (research 05 §9.2 [S53]–[S55]). The standard photo picker (PHPicker, and the web file input) needs no permission |
| `NSPhotoLibraryAddUsageDescription` | Saves a clip to Photos only when you tap Save to Photos | Add-only saving (research 07 §11) |
| `NSMotionUsageDescription` | Reads the phone's tilt during set-up so heights come from a level picture; stays on the iPhone | **Precautionary.** In the shell, Capacitor grants the web view's motion request itself (`WebViewDelegationHandler.swift`), and CoreMotion device-motion readings do not prompt. Keep it only if a device test or App Review shows it is needed; remove an unused purpose string before submission (5.1.1(ii) says purpose strings must describe real use) |
| `NSMicrophoneUsageDescription` | **Not added** | Recording is video-only. Add only if live hit-sound timing ships natively, with the CAPTURE §10 copy (sound turned into timings on the phone and deleted) |
| `ITSAppUsesNonExemptEncryption` | `false` | The app makes no network calls and adds no encryption of its own; saves the export-compliance question on each upload |
| `UIRequiredDeviceCapabilities` | `arm64` (the template said `armv7`) | Every iOS 26 device is 64-bit |

Left as generated, **decide on the Mac**: iPhone and iPad (`TARGETED_DEVICE_FAMILY = "1,2"`; iPhone-only avoids iPad screenshots and review on iPad), and portrait plus landscape orientations (landscape stays until native capture sets orientation on the capture connection, ARCHITECTURE §15.2 step 2).

## 3. Privacy manifest (`PrivacyInfo.xcprivacy`)

Current contents: `NSPrivacyTracking` false, no tracking domains, **no collected data types**, **no required-reason APIs**.

That is accurate today:
- The only native code is the Capacitor template and framework.
- The framework's own manifests (`Capacitor/PrivacyInfo.xcprivacy` and `CapacitorCordova/PrivacyInfo.xcprivacy` in `@capacitor/ios` 8.5.2) declare no required-reason APIs and no collected data.
- A search of its Swift and Objective-C sources found no `UserDefaults`, `systemUptime`, `mach_absolute_time`, file-timestamp or free-space calls.
- The web app's IndexedDB and localStorage run inside WebKit, not through the app's own `UserDefaults`.

The App Store privacy label can therefore be "Data Not Collected" while nothing leaves the device (research 07 §9 [S38]).

Add entries when native code starts using these APIs (research 07 [S39][S40]):

| When | Category | Reason code |
|---|---|---|
| `ServeFiles.freeSpace()` reads `volumeAvailableCapacityForImportantUsage` | Disk space | `E174.1` |
| A native retention sweep reads file creation or modification dates in the app container | File timestamp | `C617.1` |
| Any plugin stores settings in `UserDefaults` (for example `@capacitor/preferences`) | User defaults | `CA92.1` |
| Capture timing calls `systemUptime` or `mach_absolute_time()` directly | System boot time | `35F9.1` |
| Any upload is added (usage counts, crash reports, sync, cloud AI) | Collected data types, and the App Store privacy answers | Declare what is sent; revisit "Data Not Collected" |

## 4. Steps on a Mac

1. **Tools:** Xcode 26 (Capacitor 8 needs 26+; uploads from April 2027 need the iOS 27 SDK, so test Xcode 27 early; Capacitor 8 on Xcode 27 is UNVERIFIED). Node 24.
2. **Build and sync:**
   ```sh
   cd app
   npm ci
   npm run build
   npx cap sync ios        # restores public/, capacitor.config.json, config.xml
   npx cap open ios        # opens App.xcodeproj
   ```
3. **Resolve packages:** Xcode fetches `capacitor-swift-pm` 8.5.2 from GitHub (File → Packages → Resolve Package Versions if it does not start). This is the first time the native dependency is downloaded.
4. **Signing:** select the organisation team (after Apple enrolment, [LAUNCH_AU.md](LAUNCH_AU.md) §2), automatic signing, bundle ID `au.com.servecoach.app`. Replace the placeholder icon and splash.
5. **Build and run on a device.** Check first:
   - the app loads offline from the bundle, with the CSP intact (`'self'` is `capacitor://localhost`);
   - MediaPipe's WebAssembly loads from the bundle (the asset handler must serve `.wasm` with a type WebAssembly accepts) and the telemetry request is still blocked;
   - the camera prompt uses the string above, and `getUserMedia` delivers the rear camera; the level reads correctly with no motion prompt;
   - WebCodecs decodes an H.264 and an HEVC clip (`VideoDecoder.isConfigSupported`);
   - the sample session opens and a synthetic clip imports and analyses end to end;
   - peak memory and analysis time for the reference clip (ARCHITECTURE §5.11: ≤ 90 s on an iPhone 15-class device, ≤ 180 s on iPhone 12-class);
   - IndexedDB survives an app restart, and large videos stay inside the quota.
6. **Device QA:** the CAPTURE §13.2 checklist on an iPhone 16e or 17e, an iPhone 17 and a Pro model.
7. **Archive and TestFlight:** Product → Archive → upload; internal testers first, external testers after Beta App Review (ARCHITECTURE §15.2 step 10).

## 5. Web bundle size

`dist/` is **83 MB**, all of which ships inside the app:

| Part | Size | Note |
|---|---|---|
| `mediapipe/wasm` | 34 MB | Three runtime variants (standard, module and no-SIMD, about 11–12 MB each). Ship only the variant the pose worker loads |
| `demo` | 32 MB | Sample-session clips (4.3–7.7 MB each), key frames (8.7 MB), seed (5.2 MB) |
| `models` | 15 MB | Pose Landmarker full (9.4 MB) and lite (5.8 MB). The pipeline defaults to full; lite is used for live framing |
| `assets` | 3.1 MB | JavaScript and CSS |

Pruning the unused WebAssembly variants alone would save about 22 MB *[our inference from the file sizes; confirm which variant loads on iOS first]*.

## 6. Native plugin plan

Plugins will live as local Swift packages under `app/ios-plugins/`, each with a TypeScript interface in `platform/native.ts` (ARCHITECTURE §15.2 step 6). Neither exists yet. The web engine stays the reference implementation: a native module replaces a TypeScript one only after it reproduces the golden per-serve outputs from `tools/validate` within stated tolerances (ARCHITECTURE §15.3).

| Plugin | Order | Purpose |
|---|---|---|
| `ServeFiles` | 1 | PHPicker import (`preferredAssetRepresentationMode = .current`, original slow motion), free space, delete, share, Save to Photos (add-only), exclude from backup |
| `ServeCapture` (`CaptureController` below) | 2 | AVFoundation capture with locked frame rate and exposure, per-frame attitude, thermal state, native framing checks (CAPTURE §10) |
| `ServeVideoReader` | 3, fallback | AVAssetReader decode when WebCodecs cannot decode a file |
| `ServePose` (`PoseEstimator` below) | 4, behind a flag | Apple Vision body pose (or a Core ML port) over file ranges. **Not the default** until it matches MediaPipe on our metrics: Vision has no heel or toe points, which landing distance needs (research 05 §1.1) |
| Background analysis | 5 | Today the web engine needs the app open. Candidates: finishing native passes after the app is backgrounded, with a local "Your session is ready" notification (PRODUCT §5.3). Which iOS background API fits (for example the iOS 26 continued-processing task) is **not researched yet** |
| `ServePhrasing` | Later | On-device Foundation Models phrasing (ARCHITECTURE §10); never cloud by default |

### 6.1 `CaptureController` (Swift sketch)

These interfaces are a design sketch for the Mac build. **They have not been compiled.** Names follow CAPTURE §10 and the TypeScript `CaptureContext` in `app/src/analysis/types.ts`, which the web layer builds from the result.

```swift
import AVFoundation
import CoreMotion
import WebKit

enum CaptureOrientation: String, Codable { case portrait, landscape }   // portrait is the D1 default
enum CaptureResolution: String, Codable { case hd1080 = "1080p", uhd4k = "4k" }
enum ThermalLevel: String, Codable { case nominal, fair, serious, critical }

struct CaptureConfiguration: Codable {
    var orientation: CaptureOrientation = .portrait
    var framesPerSecond: Int = 60                 // 50 | 60 | 100 | 120 | 240; fixed by min = max frame duration
    var resolution: CaptureResolution = .hd1080   // 4k suggested for landscape at the fence
    var maxExposureSeconds: Double = 1.0 / 1000   // daylight cap; 1/250-1/500 s under lights
    var hitSoundTiming: Bool = false              // microphone only when true; audio never written to the file
}

struct FramingStatus: Codable {
    var tMs: Double
    var pitchDeg: Double                          // CoreMotion gravity, camera frame
    var rollDeg: Double
    var frameTopM: Double?                        // headroom in the server's plane: 4.5 m target, record blocked below 4.3 m (D1)
    var playerHeightPx: Double?
    var meanLuma: Double
    var flickerHz: Double?                        // 100 Hz under 50 Hz mains lighting
    var thermal: ThermalLevel
}

struct AttitudeSample: Codable { var tMs: Double; var pitchDeg: Double; var rollDeg: Double }
struct ContactOnset: Codable { var tMs: Double; var strength: Double; var sharpness: Double }

struct RecordingResult: Codable {
    var fileURL: URL                              // app sandbox; read by the web layer through bounded byte ranges
    var orientation: CaptureOrientation
    var captureFps: Double
    var durationS: Double
    var codec: String                             // "hvc1" when the web view can decode it, else "avc1"
    var exposureS: Double
    var iso: Double
    var videoFovDeg: Double
    var intrinsics: [Double]?                     // 3x3 row-major, coded-frame pixels
    var attitude: [AttitudeSample]                // per frame, on the capture clock
    var droppedFrames: Int
    var liveOnsets: [ContactOnset]?               // only when hitSoundTiming is on; timestamps only
}

enum CaptureError: Error {
    case permissionDenied
    case formatUnavailable(fps: Int, resolution: CaptureResolution)
    case interrupted
    case insufficientStorage(bytesFree: Int64)
    case thermalCritical
}

protocol CaptureControllerDelegate: AnyObject {
    func captureController(_ controller: CaptureController, didUpdate status: FramingStatus)
    func captureController(_ controller: CaptureController, thermalDidChange level: ThermalLevel)
    func captureController(_ controller: CaptureController, didFail error: CaptureError)
}

protocol CaptureController: AnyObject {
    var delegate: CaptureControllerDelegate? { get set }
    var isRecording: Bool { get }

    /// Frame rates the 1x wide-angle camera supports at this resolution (videoSupportedFrameRateRanges).
    func supportedFrameRates(for resolution: CaptureResolution) -> [Int]
    /// Picks activeFormat, locks the frame rate, turns stabilisation and HDR off.
    func configure(_ configuration: CaptureConfiguration) async throws
    /// Native preview behind a transparent web view; the web layer draws the guide overlay.
    func startPreview(behind webView: WKWebView) async throws
    /// Meters on the player's box during framing, then locks exposure, focus and white balance.
    func lockExposureAndFocus(on playerBox: CGRect) async throws
    func startRecording() async throws
    func stopRecording() async throws -> RecordingResult
    func stopPreview()
}
```

The Capacitor side (`ServeCapturePlugin: CAPPlugin`) exposes `configure`, `startPreview`, `lockExposure`, `record`, `stop` and `stopPreview`, and emits `framingStatus` and `thermalState` events. A recording indicator stays visible whenever the camera records (2.5.14).

### 6.2 `PoseEstimator` (Swift sketch)

Mirrors the TypeScript `PoseEstimator` in `app/src/analysis/pipeline/passes.ts` (`init`, `estimate`, `dispose`, `stats`, `configure`) and returns frames in the engine's `PoseFrame` shape with `source: "apple-vision"` (already a valid source in `app/src/analysis/types.ts`). **Not compiled.**

```swift
import AVFoundation
import Vision

struct PoseLandmark: Codable {
    var x: Double          // normalised, origin top-left (Vision's bottom-left origin is flipped)
    var y: Double
    var z: Double?
    var visibility: Double // Vision joint confidence
}

struct PoseFrame: Codable {
    var frameIndex: Int
    var tReal: Double                      // capture seconds (real time for slow motion)
    var landmarks: [PoseLandmark?]?        // 33 slots in MediaPipe order; nil where Vision has no joint
    var score: Double
    var source: String = "apple-vision"
}

struct PoseRequest {
    var fileURL: URL
    var frameRanges: [ClosedRange<Int>]    // Pass B serve windows
    var regionOfInterest: CGRect?          // normalised crop around the player
    var strideOutsideCore: Int = 3         // every 3rd frame outside the core range
}

protocol PoseEstimator: AnyObject {
    var backend: String { get }            // "vision" or "coreml"
    func prepare() async throws
    func configure(maxPeople: Int)         // TS configure({ numPoses }): 2 in Pass A, 1 in Pass B
    func estimate(_ request: PoseRequest) -> AsyncThrowingStream<PoseFrame, Error>
    func cancel()
    func stats() -> (backend: String, detectErrors: [String])
}
```

**Joint mapping** (Vision `VNHumanBodyPoseObservation.JointName` → MediaPipe index): nose 0, left eye 2, right eye 5, left ear 7, right ear 8, left and right shoulder 11/12, elbows 13/14, wrists 15/16, hips 23/24, knees 25/26, ankles 27/28. **No Vision equivalent**, so `nil`: eye corners, mouth, hand points (17–22), heels (29/30) and toes (31/32). Vision's `neck` and `root` have no MediaPipe slot. The engine's contact-forward and landing metrics use the toe, so a Vision-only session must mark them unavailable.

## 7. When to go fully native

Any two of these, measured on real devices (ARCHITECTURE §15.3): WKWebView analysis more than 2× over budget or killed in more than 1% of analyses; native pose and ball tracking clearly better on validation; real-time features needed (live serve detection, Watch start); the commercial gates passed; a 4.2 or 2.5.2 rejection that persists after native capture.

## 8. Open questions for the Mac sprint

1. Does the `.wasm` runtime load from `capacitor://localhost` under the CSP, and at what memory cost?
2. Does WKWebView on iOS 26 deliver 60 fps from `getUserMedia`, and does `MediaRecorder` write MP4 with the right rotation?
3. Is iOS 26.0 the right minimum? Check adoption before launch; the alternative is a lower target with the native decode fallback (ARCHITECTURE §15.1).
4. Is `NSMotionUsageDescription` needed at all in the shell (§2)?
5. Does Capacitor 8.5.2 build cleanly with Xcode 27?
