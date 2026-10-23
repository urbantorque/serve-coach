import { useEffect, useRef, useState } from 'react'
import { useWakeLock } from './useWakeLock'
import { Cue, Icon } from './primitives'
import '../styles/court.css'
import { TICK, earcon, haptic, unlockEarcons } from '../lib/earcon'
import { SPEED_PLACEMENT } from '../lib/placement'
import { PREVIEW_BLOCK_CUE, previewBlockFor, previewSupported, type PreviewBlock } from '../lib/framing/access'
import {
  PREVIEW_WINDOW,
  judgeFraming,
  previewFrame,
  readFraming,
  type FramingVerdict,
  type Placement,
} from '../lib/framing/judge'
import { MAX_RECORDING_SECONDS, recordClip, recordingOutcome, recordingType } from '../lib/framing/record'
import { loadEngine, nextVideoTimestamp } from '../lib/pose/poseEngine'
import { recordingConstraints } from '../lib/framing/camera'
import { primeSpeech, speakLocally } from '../lib/speech'
import {
  COUNTDOWN_S,
  RECORDING_DUTY,
  RECORDING_INTERVAL_MS,
  SERVE_COUNTS,
  countdownWord,
  handSample,
  onCourtDefault,
  shouldRearm,
  shouldStop,
  speakVerdict,
  spoken,
  type HandSample,
  type ServeCount,
} from '../lib/framing/handsFree'
import { readPrefs, writePrefs } from '../lib/storage/prefs'
import type { Frame } from '../lib/analysis/types'

/**
 * A viewfinder that says what the engine will be able to read, before the serve.
 *
 * The app can already hand filming off to the phone's own camera —
 * `capture="environment"` on the record input does exactly that — and that
 * hand-off stays the default. What it cannot do is talk back. The player films,
 * stops, uploads, waits about half a minute, and only then finds out the phone
 * was somewhere `spatial.ts` throws depth away from. An operating system camera
 * app structurally cannot tell them that, because nothing in it has ever seen
 * this engine. Only a preview inside the page can.
 *
 * So this runs the same pose model on a live stream at a fraction of the rate,
 * hands the frames to `judgeFraming`, and shows one instruction. It is an
 * addition to the two ways in, never a replacement: every failure below ends
 * with the player pointed back at their camera app and the file picker, and this
 * component is only ever mounted while its sheet is open.
 *
 * NOT VERIFIED ON A DEVICE. The judgement underneath is unit-tested against the
 * synthetic rig; this file is not, and cannot be from here. What has been seen
 * run in a browser is the refusal path — a denied camera produces the "allow the
 * camera" line and leaves the rest of the app untouched — the stream attaching
 * and playing, and the MediaPipe graph starting on the GPU delegate. What has
 * NOT been seen is a single detection against real pixels, because the pane the
 * page was loaded in reports `document.hidden` and `requestAnimationFrame`
 * therefore never fired: measured at 0 callbacks in 600 ms. That is the loop
 * behaving as designed and it is also why nobody here can claim the interval
 * below is affordable, or that a phone recovers a sane camera angle from a lens
 * the rig has never modelled.
 */

/**
 * How long to leave the pose model alone between detections, in milliseconds.
 *
 * A BUDGET, NOT A MEASUREMENT, and nobody has run this on a phone. It is chosen
 * from the one thing here that is fixed: `judgeFraming` settles over
 * `PREVIEW_WINDOW` samples, so at this spacing a verdict arrives about 2.8
 * seconds after the player stops moving — slow enough to be cheap, fast enough
 * that nudging the phone and looking up shows the result. Going faster would
 * spend more of the battery and the thermal headroom on a check that happens
 * immediately before the phone is asked for half a minute of real work; going
 * slower would make aiming feel dead.
 */
const DETECT_INTERVAL_MS = 400

/**
 * The share of wall-clock time the pose model may hold, at most.
 *
 * The interval above assumes a detection is quick. On a phone that falls back to
 * the CPU delegate it may not be, and a fixed interval would then have the model
 * running most of the time — heating the device right before the analysis that
 * needs it. So the gap after a detection is never shorter than the detection
 * itself, which caps the model at half of wall clock however slow it turns out
 * to be, and degrades to a longer settling time rather than to a hot phone.
 */
const MAX_POSE_DUTY = 0.5

/** A glyph per grade, so the verdict survives being read without colour. */
const BADGE: Record<FramingVerdict['grade'], string> = {
  looking: 'info',
  clear: 'check',
  hedged: 'info',
  refused: 'warn',
}

/** Before the first detection there is nothing to report, and it says so. */
const NOTHING_YET: FramingVerdict = judgeFraming({
  issues: [],
  spatial: null,
  yaw_measured: false,
  samples: 0,
})

interface Props {
  /**
   * Take the recording and analyse it.
   *
   * Absent where nothing wants one, and the whole recording control disappears
   * with it — this component's original job is to check framing, and it still
   * does that on its own.
   */
  onRecorded?: (file: File) => void
  /**
   * The drill a "Check this drill" tap came from (N1.4), said above the
   * viewfinder so the player knows what the next serves are counted for.
   */
  target?: string
  /**
   * Opened from the glance's "Record another" with hands-free on (C3): the
   * player has walked back to the baseline, so the next countdown starts by
   * itself once they stand still in a clear picture. A tap on the button still
   * works and takes over.
   */
  rearm?: boolean
  /**
   * Open the phone's own camera app instead (Q6), offered where the preview
   * cannot start. The cue said "film with your camera app" with nothing to tap,
   * so a blocked preview was a dead end on the one screen built for the court.
   */
  onCameraApp?: () => void
}

/** Blocks the camera app gets round. Not a busy camera, and not a coach still downloading. */
const CAMERA_APP_HELPS = new Set(['unsupported', 'denied', 'missing', 'unknown'])

/** Hand samples kept for the re-arm check: comfortably more than `REARM_S` of them. */
const REARM_WINDOW_S = 6

export default function FramingCheck({ onRecorded, target, rearm = false, onCameraApp }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  // Mounted only while the viewfinder is open, and that is a phone propped on
  // a fence while its owner walks to the baseline — the screen must not lock.
  useWakeLock(true)
  const [block, setBlock] = useState<PreviewBlock | null>(null)
  /** Download progress for the pose model, 0–1, while it is still arriving. */
  const [warming, setWarming] = useState<number | null>(null)
  const [verdict, setVerdict] = useState<FramingVerdict>(NOTHING_YET)

  /**
   * The live stream, so the recorder can be attached to the one already running.
   *
   * A second `getUserMedia` would open the camera twice — two encodes, two
   * hardware paths, and on some phones a refusal, since a rear camera is not
   * always shareable between two capture sessions.
   */
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  /**
   * True while recording, read inside the detection loop.
   *
   * A ref rather than state because `tick` closes over its scope once and would
   * otherwise keep reading whatever `recording` was when the effect ran.
   */
  const recordingRef = useRef(false)
  const [recording, setRecording] = useState(false)
  /**
   * Whether the preview is still running, in a place the recorder's callbacks
   * can read it.
   *
   * They are built in `toggleRecording`, outside the effect that owns the
   * stream, and `onstop` fires *after* that effect has been torn down — which is
   * the whole difficulty `recordingOutcome` exists to settle. The effect's own
   * `live` is a local and cannot be read from there; this is the same fact,
   * hoisted somewhere both can see it.
   */
  const liveRef = useRef(true)

  /*
   * Hands-free and the voice (N1.1, N1.2): kept in prefs, so a player who
   * films from the fence every time sets them once. A drill check defaults to
   * six serves, the basket its bar is out of.
   *
   * On by default on a phone (`onCourtDefault`, Q6) until the player sets
   * either: off, they were four decisions away and most players met the court
   * without them. A player's own choice, either way, still wins.
   */
  const [handsFree, setHandsFree] = useState(() => readPrefs().handsFree ?? onCourtDefault())
  const [speak, setSpeak] = useState(() => readPrefs().speakFraming ?? onCourtDefault())
  const [serveCount, setServeCount] = useState<ServeCount>(() => (target ? 6 : (readPrefs().handsFreeServes ?? 1)))
  const [countdown, setCountdown] = useState<number | null>(null)
  const countdownRef = useRef<number | null>(null)
  countdownRef.current = countdown
  const countdownTimer = useRef(0)
  /*
   * What the framing is judged for (C4): the swing, from four to five metres,
   * or a speed, from six to seven with the phone on its side. Kept in prefs
   * beside hands-free, since a player who films for a speed does it every time.
   */
  const [placement, setPlacement] = useState<Placement>(() => readPrefs().placement ?? 'form')
  const placementRef = useRef(placement)
  placementRef.current = placement
  /** Serves counted in this recording so far, for the pips (C1). */
  const [served, setServed] = useState(0)
  const servedRef = useRef(0)
  /** Waiting for the player to stand ready before starting on its own (C3). */
  const [rearming, setRearming] = useState(() => rearm && (readPrefs().handsFree ?? onCourtDefault()))
  const rearmingRef = useRef(rearming)
  rearmingRef.current = rearming
  const rearmSamplesRef = useRef<HandSample[]>([])
  /** The countdown, reachable from the detection loop, which closes over its scope once. */
  const startCountdownRef = useRef<() => void>(() => {})
  const handsFreeRef = useRef(handsFree)
  const speakRef = useRef(speak)
  const serveCountRef = useRef(serveCount)
  handsFreeRef.current = handsFree
  speakRef.current = speak
  serveCountRef.current = serveCount
  const samplesRef = useRef<HandSample[]>([])
  const recordStartRef = useRef(0)
  const lastSpokenRef = useRef<{ call: string; at: number } | undefined>(undefined)
  const say = (text: string) => {
    if (speakRef.current) speakLocally(text)
  }
  useEffect(() => () => clearInterval(countdownTimer.current), [])
  /**
   * Which container this browser will record, decided once.
   *
   * Absent means the control never appears. See `record.ts`: a record button
   * that produces a file the analyser then refuses is worse than no button.
   */
  const [type] = useState(recordingType)

  useEffect(() => {
    if (!previewSupported()) {
      setBlock('unsupported')
      return
    }

    let stream: MediaStream | null = null
    let frame = 0
    let live = true
    // Re-armed at every entry rather than only at the `useRef`, so a second
    // opening of the sheet — or React's development double-invoke, which runs
    // the cleanup between two mounts — does not inherit a `false` from the run
    // before it and refuse to hand over a recording nobody abandoned.
    liveRef.current = true

    const stop = () => {
      live = false
      liveRef.current = false
      cancelAnimationFrame(frame)
      // A recorder still running when the sheet closes holds the encoder open
      // and keeps accumulating chunks for a clip nobody will ever be handed.
      // `stop()` on an inactive recorder throws, so the state is checked rather
      // than the reference.
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      recorderRef.current = null
      recordingRef.current = false
      streamRef.current = null
      // Releasing the tracks is what turns the camera light off. A stream left
      // attached to a detached element keeps the hardware open for the rest of
      // the session, and on a phone that is the battery and the recording
      // indicator both.
      for (const track of stream?.getTracks() ?? []) track.stop()
      stream = null
    }

    /**
     * Give the camera back, then say what went wrong.
     *
     * Every failure after `getUserMedia` has already succeeded has to come
     * through here. Setting the block alone re-renders into the message branch,
     * which unmounts the `<video>` — and an unmounted element does not release
     * anything, so the hardware stayed open with the recording light on behind
     * a sentence saying the preview did not start. Two paths did exactly that:
     * a refused `play()` and a model download that failed at a court with no
     * signal. `stop()` also clears `live`, which is right: there is nothing left
     * for this effect to do once one of these has fired.
     */
    const giveUp = (why: PreviewBlock) => {
      const wasLive = live
      stop()
      if (wasLive) setBlock(why)
    }

    void (async () => {
      try {
        // The recording's constraints, not a preview's (L6.3): the recorder
        // films through this same stream, which used to be opened at 640 px
        // wide, so every serve recorded here was a 640-wide clip. The preview
        // reads it every 400 ms at most, and MediaPipe's landmarks are
        // normalised to the frame, so the bigger picture costs it nothing.
        stream = await navigator.mediaDevices.getUserMedia(recordingConstraints())
      } catch (err) {
        if (live) setBlock(previewBlockFor(err))
        return
      }

      const video = videoRef.current
      // Unmounted while the permission prompt was up, which is an entirely
      // ordinary thing for somebody to do.
      if (!live || !video) {
        stop()
        return
      }
      streamRef.current = stream

      video.srcObject = stream
      // Muted and inline are already set on the element, which is what lets this
      // start without a gesture. It can still be refused, and a refused preview
      // is a preview with no frames rather than a broken page.
      try {
        await video.play()
      } catch {
        giveUp('unknown')
        return
      }

      let landmarker
      try {
        landmarker = await loadEngine((p) => {
          if (live && p.stage === 'downloading') setWarming(p.ratio ?? 0)
        })
      } catch {
        // The model is 19 MB and the player may be at a court with no signal.
        // Nothing else here breaks: the sheet closes back onto the file picker.
        giveUp('engine')
        return
      }
      if (!live) return
      setWarming(null)

      /**
       * The last `PREVIEW_WINDOW` frames anybody was found in.
       *
       * A detection that finds nobody ages the window by one instead of adding
       * to it, so a player who walks out of shot empties it over the same seven
       * samples a verdict is built from — and `readFraming` then reports nobody
       * visible rather than a stale opinion about somewhere they used to stand.
       */
      const ring: Frame[] = []
      let index = 0
      let nextAt = 0

      const tick = (now: number) => {
        frame = requestAnimationFrame(tick)
        /*
         * Nothing to check while the serve is being recorded, and every reason
         * not to check it.
         *
         * The player has stopped aiming the phone and started serving, so the
         * verdict has no reader — and this is the worst moment in the whole app
         * to be spending thermal headroom: a hardware encoder is running on the
         * same stream, and the analysis that needs the GPU is thirty seconds
         * away. `MAX_POSE_DUTY` caps the model against wall clock; it cannot
         * know that half of wall clock is too much while something else has the
         * device.
         */
        // Hands-free is the exception (N1.1): it reads the pose at a lower rate
        // and duty while recording, only to see when the serve is over.
        if (recordingRef.current && !handsFreeRef.current) return
        if (now < nextAt) return
        // `readyState` below HAVE_CURRENT_DATA means there is no picture yet;
        // handing that to the model returns a pose from nothing.
        if (video.readyState < 2 || !video.videoWidth) return

        const started = performance.now()
        let image: { x: number; y: number; z: number; visibility?: number }[] | undefined
        let world: { x: number; y: number; z: number; visibility?: number }[] | undefined
        try {
          const result = landmarker.detectForVideo(video, nextVideoTimestamp(landmarker))
          image = result.landmarks?.[0]
          world = result.worldLandmarks?.[0]
        } catch {
          // A detection that throws is a frame that did not happen. The window
          // ages by one below, exactly as it would for a frame with nobody in it.
        }

        if (recordingRef.current) {
          const cost = performance.now() - started
          nextAt = performance.now() + Math.max(RECORDING_INTERVAL_MS - cost, (cost * (1 - RECORDING_DUTY)) / RECORDING_DUTY)
          samplesRef.current.push(handSample((started - recordStartRef.current) / 1000, image))
          const read = shouldStop(samplesRef.current, serveCountRef.current)
          // The pips, and a tone a player at the baseline can hear (C1, C2). Not
          // on the serve that ends the recording: the stop has its own tone.
          if (read.serves > servedRef.current) {
            servedRef.current = read.serves
            setServed(read.serves)
            if (!read.stop) earcon('served')
          }
          if (read.stop && recorderRef.current?.state === 'recording') {
            recorderRef.current.stop()
          }
          return
        }

        if (image && world) {
          ring.push(
            previewFrame(image, world, video.videoWidth / video.videoHeight, index++, started / 1000),
          )
          if (ring.length > PREVIEW_WINDOW) ring.shift()
        } else {
          ring.shift()
        }

        // Whichever is longer: the rest of the interval, or the gap that keeps
        // the model under `MAX_POSE_DUTY` of wall clock. At half, that gap is
        // the detection's own cost.
        const cost = performance.now() - started
        const minGap = (cost * (1 - MAX_POSE_DUTY)) / MAX_POSE_DUTY
        nextAt = performance.now() + Math.max(DETECT_INTERVAL_MS - cost, minGap)

        // Held at the old object when nothing about the verdict moved, so React
        // does not re-render a screen whose whole content is one unchanged
        // sentence two or three times a second. `also` is compared too even
        // though nothing here draws it — a caller that starts drawing it should
        // not have to discover that this comparison was quietly deciding not to.
        const next = judgeFraming({
          ...readFraming(ring),
          placement: placementRef.current,
          aspect: video.videoWidth / video.videoHeight,
        })

        // The next serve starting by itself (C3): the same hand samples the
        // recording reads, taken while the player walks back and stands ready.
        if (rearmingRef.current && handsFreeRef.current && countdownRef.current === null) {
          const at = started / 1000
          const samples = rearmSamplesRef.current
          samples.push(handSample(at, image))
          while (samples.length && at - samples[0].t > REARM_WINDOW_S) samples.shift()
          if (shouldRearm(samples, next.grade === 'clear', at)) {
            rearmingRef.current = false
            setRearming(false)
            startCountdownRef.current()
          }
        }
        // Said aloud when it changes, for a player already at the baseline (N1.2).
        if (speakRef.current && next.grade !== 'looking' && speakVerdict(next, lastSpokenRef.current, now)) {
          speakLocally(spoken(next.cue))
          lastSpokenRef.current = { call: next.call, at: now }
        }
        setVerdict((prev) =>
          prev.call === next.call &&
          prev.grade === next.grade &&
          prev.also.join() === next.also.join()
            ? prev
            : next,
        )
      }

      // requestAnimationFrame rather than an interval, so a phone put in a
      // pocket or a tab switched away stops running the model instead of
      // grinding on a preview nobody is looking at.
      frame = requestAnimationFrame(tick)
    })()

    return stop
  }, [])

  /**
   * Start recording, or stop and hand the clip over.
   *
   * One control rather than two, because the second press happens while the
   * player is walking back from the baseline and a screen with a live Start on
   * it is a screen that can be started twice.
   *
   * Everything that can fail here ends with the recording abandoned and the
   * preview still running, never with a broken screen: the file picker is still
   * behind this sheet and is still the way in that always works.
   */
  const toggleRecording = () => {
    const existing = recorderRef.current
    if (existing) {
      // `onstop` does the handing over, so a recording stopped by the cap and
      // one stopped by the player take exactly the same path out.
      if (existing.state === 'recording') existing.stop()
      return
    }
    // A tap during the countdown calls it off.
    if (countdown !== null) {
      clearInterval(countdownTimer.current)
      setCountdown(null)
      return
    }
    if (!streamRef.current || !type || !onRecorded) return
    // This tap is the gesture iOS wants before anything here can speak (L6.10),
    // or sound a tone (C2). A tap takes over from waiting to start on its own.
    primeSpeech()
    unlockEarcons()
    haptic(TICK)
    setRearming(false)
    if (!handsFree) {
      startRecording()
      return
    }
    startCountdown()
  }

  /**
   * Hands-free (N1.1): a countdown long enough to walk to the baseline, spoken
   * whether or not the verdict is, since nobody can see it from there. Started
   * by the tap above, or by the player standing ready after a glance (C3).
   */
  const startCountdown = () => {
    if (!streamRef.current || !type || !onRecorded || countdownRef.current !== null) return
    earcon('armed')
    let left = COUNTDOWN_S
    countdownRef.current = left
    setCountdown(left)
    speakLocally(countdownWord(left)!)
    countdownTimer.current = setInterval(() => {
      left -= 1
      const word = countdownWord(left)
      if (word) speakLocally(word)
      if (left > 0) {
        setCountdown(left)
        return
      }
      clearInterval(countdownTimer.current)
      setCountdown(null)
      startRecording()
    }, 1000) as unknown as number
  }
  startCountdownRef.current = startCountdown

  const startRecording = () => {
    const stream = streamRef.current
    if (!stream || !type || !onRecorded || !liveRef.current) return
    samplesRef.current = []
    servedRef.current = 0
    setServed(0)
    recordStartRef.current = performance.now()

    let capped = 0
    const settle = () => {
      clearTimeout(capped)
      recorderRef.current = null
      recordingRef.current = false
      setRecording(false)
    }
    let recorder: MediaRecorder
    try {
      recorder = recordClip(stream, type, MediaRecorder as never, {
        stopped: (file, chunks) => {
          settle()
          // Stopped by the button, or stopped by the sheet closing underneath it?
          // The recorder cannot say, and the two mean opposite things — see
          // `recordingOutcome`, which is where that is reasoned about and tested.
          if (recordingOutcome({ previewLive: liveRef.current, chunks }) !== 'analyse') return
          if (handsFreeRef.current) earcon('stopped')
          say('Stopped')
          onRecorded(file)
        },
        failed: settle,
      }) as unknown as MediaRecorder
    } catch {
      // A browser that passed `isTypeSupported` and then refused the same type
      // at construction or at start. Nothing to say about it that the player
      // can act on, so the control simply stops offering.
      recorderRef.current = null
      setRecording(false)
      return
    }

    recorderRef.current = recorder
    recordingRef.current = true
    setRecording(true)
    if (handsFree) earcon('recording')
    else say('Recording')

    // The backstop. See MAX_RECORDING_SECONDS: chunks accumulate in memory
    // until something stops the recorder, and the likeliest way for nothing to
    // is a player who has put the phone down and forgotten which button they
    // pressed.
    capped = setTimeout(() => {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    }, MAX_RECORDING_SECONDS * 1000) as unknown as number
  }

  // Said with the camera or without it (N1.4): a blocked viewfinder still
  // tells the player what their next serves are counted for.
  const targetLine = target && (
    <p className="framer-target">
      <Icon name="target" size={15} />
      <span>
        Checking <strong>{target}</strong>. Film six serves on it.
      </span>
    </p>
  )

  if (block) {
    return (
      <div className="framer">
        {targetLine}
        <p className="framer-cue framer-cue--blocked" role="status">
          <Cue text={PREVIEW_BLOCK_CUE[block]} />
        </p>
        {onCameraApp && CAMERA_APP_HELPS.has(block) && (
          <button type="button" className="btn btn--full framer-record" onClick={onCameraApp}>
            <Icon name="camera" size={17} />
            Film with your camera app
          </button>
        )}
        <p className="framer-foot">
          Filming with your own camera app works the same. Either way the framing gets checked
          on the clip; this moves that check earlier.
        </p>
      </div>
    )
  }

  return (
    <div className="framer">
      {targetLine}
      {/* Where the phone goes for a speed (C4), said where the player is about
          to move it, from the one place that wording lives. */}
      {placement === 'speed' && !recording && countdown === null && (
        <p className="framer-target">
          <Icon name="target" size={15} />
          <span>
            For a speed, stand the phone {SPEED_PLACEMENT.distance} back, on its side, {SPEED_PLACEMENT.where}.
          </span>
        </p>
      )}
      {rearming && handsFree && !recording && countdown === null && (
        <p className="framer-target" role="status">
          <Icon name="camera" size={15} />
          <span>Walk back to your spot and stand still. I start the count by myself.</span>
        </p>
      )}
      <div className={`framer-stage framer-stage--${verdict.grade}`}>
        {/* The preview is the instruction's evidence, not the instruction. A
            screen reader gets the verdict from the live region below, which is
            the same sentence, so the picture is hidden rather than described
            with something no code here can honestly claim to see. */}
        <video ref={videoRef} muted playsInline autoPlay aria-hidden="true" />
        {/* A different shape for each of the three grades that show a badge at
            all. Carrying the difference in the border colour alone would leave
            the verdict invisible to a player who cannot separate amber from red
            — and this screen exists to be read from across a court, where
            colour is the first thing to go. */}
        <span className="framer-badge">
          <Icon name={BADGE[verdict.grade]} size={15} />
        </span>
        {countdown !== null && (
          <span key={countdown} className="framer-count" aria-hidden="true">
            {countdown}
          </span>
        )}
        {/* The basket so far, readable from the baseline (C1). Only for a
            basket: one serve has nothing to count. */}
        {handsFree && serveCount > 1 && (recording || countdown !== null) && (
          <span className="framer-pips" role="img" aria-label={`${served} of ${serveCount} serves`}>
            {Array.from({ length: serveCount }, (_, i) => (
              <span key={i} className={`framer-pip${i < served ? ' is-on' : ''}`} />
            ))}
          </span>
        )}
      </div>

      {/* The download replaces the verdict rather than sitting under it: until
          the model is here there is no verdict, and a stale "hold still" over a
          progress line reads as a check that has already run. */}
      {warming !== null ? (
        <p className="framer-cue" role="status" aria-live="polite">
          Downloading the coach · {Math.round(warming * 100)}%
        </p>
      ) : (
        // `polite` so a verdict that changes while the player is reading the
        // last one waits its turn instead of cutting it off.
        <p className={`framer-cue framer-cue--${verdict.grade}`} role="status" aria-live="polite">
          <Cue text={verdict.cue} />
        </p>
      )}

      {/* What the framing is judged for (C4). Shown with or without a recorder:
          it changes the verdict, not the recording. */}
      {!recording && countdown === null && (
        <div className="framer-options">
          <div className="seg" role="group" aria-label="Filming for">
            {(['form', 'speed'] as const).map((p) => (
              <button
                key={p}
                type="button"
                className={`seg-item${placement === p ? ' is-on' : ''}`}
                aria-pressed={placement === p}
                onClick={() => {
                  setPlacement(p)
                  writePrefs({ placement: p })
                }}
              >
                {p === 'form' ? 'Your swing' : 'A speed'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Only where the browser will record something this app can then read.
          See `recordingType` — a control that produces a file the analyser
          refuses is worse than no control. */}
      {/* Hands-free and the voice (N1.1, N1.2). Hidden while recording: a
          setting changed mid-serve would change what the recording does. */}
      {onRecorded && type && !block && !recording && countdown === null && (
        <div className="framer-options">
          <button
            type="button"
            className={`chip chip--button chip--toggle${handsFree ? ' is-on' : ''}`}
            aria-pressed={handsFree}
            onClick={() => {
              setHandsFree(!handsFree)
              writePrefs({ handsFree: !handsFree })
            }}
          >
            Hands-free
          </button>
          <button
            type="button"
            className={`chip chip--button chip--toggle${speak ? ' is-on' : ''}`}
            aria-pressed={speak}
            onClick={() => {
              if (!speak) primeSpeech()
              setSpeak(!speak)
              writePrefs({ speakFraming: !speak })
            }}
          >
            Read it aloud
          </button>
          {handsFree && (
            <div className="seg" role="group" aria-label="Stop after">
              {SERVE_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`seg-item${serveCount === n ? ' is-on' : ''}`}
                  aria-pressed={serveCount === n}
                  onClick={() => {
                    setServeCount(n)
                    if (!target) writePrefs({ handsFreeServes: n })
                  }}
                >
                  {n === 1 ? '1 serve' : `${n} serves`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {onRecorded && type && !block && (
        <button
          type="button"
          className={`btn btn--full framer-record${recording ? ' framer-record--on' : ''}`}
          onClick={toggleRecording}
        >
          <Icon name={recording ? 'check' : 'camera'} size={17} />
          {recording
            ? 'Stop and analyse'
            : countdown !== null
              ? 'Cancel'
              : handsFree
                ? 'Start hands-free'
                : 'Record the serve here'}
        </button>
      )}

      <p className="framer-foot">
        {warming !== null
          ? 'This is the same download an analysis needs, so it only happens once.'
          : recording && handsFree
            ? `Recording. Serve, and I stop by myself once ${serveCount === 1 ? 'the serve is' : `${serveCount} serves are`} over. The clip is read on this device and never uploaded.`
            : recording
              ? 'Recording. Serve, then stop — the clip is read on this device and never uploaded.'
            : /*
               * The old line ended "and nothing here is recorded", which stopped
               * being true the moment this button existed. Left alone it would
               * have been the one false sentence on the most privacy-sensitive
               * screen in the app, sitting under a live camera.
               */
              type && onRecorded
              ? 'This reads the camera angle, the tilt and how much of you fits the shot — nothing about the serve itself. Nothing is recorded until you press record, and a recording is read on this device and never uploaded.'
              : 'This reads the camera angle, the tilt and how much of you fits the shot — nothing about the serve itself. Your video never leaves the device, and nothing here is recorded.'}
      </p>
    </div>
  )
}
