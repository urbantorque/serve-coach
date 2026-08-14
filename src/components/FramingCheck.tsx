import { useEffect, useRef, useState } from 'react'
import { Cue, Icon } from './primitives'
import { PREVIEW_BLOCK_CUE, previewBlockFor, previewSupported, type PreviewBlock } from '../lib/framing/access'
import {
  PREVIEW_WINDOW,
  judgeFraming,
  previewFrame,
  readFraming,
  type FramingVerdict,
} from '../lib/framing/judge'
import {
  MAX_RECORDING_SECONDS,
  recordingFileName,
  recordingOutcome,
  recordingType,
} from '../lib/framing/record'
import { loadEngine, nextVideoTimestamp } from '../lib/pose/poseEngine'
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

/**
 * What to ask the camera for.
 *
 * A request, not a guarantee — a browser is free to hand back whatever it likes,
 * and several do. It costs nothing if ignored: every landmark MediaPipe returns
 * is normalised to the frame, so the recovered angle is the same at any
 * resolution and only the pixels being pushed around change.
 */
const PREVIEW_WIDTH = 640

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
}

export default function FramingCheck({ onRecorded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
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
        stream = await navigator.mediaDevices.getUserMedia({
          // `ideal`, not `exact`: a laptop has no environment-facing camera and
          // an `exact` constraint would fail outright rather than fall back to
          // the one camera there is.
          video: { facingMode: { ideal: 'environment' }, width: { ideal: PREVIEW_WIDTH } },
          audio: false,
        })
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
        if (recordingRef.current) return
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
        const next = judgeFraming(readFraming(ring))
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

    const stream = streamRef.current
    if (!stream || !type || !onRecorded) return

    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, { mimeType: type })
    } catch {
      // A browser that passed `isTypeSupported` and then refused the same type
      // at construction. Nothing to say about it that the player can act on, so
      // the control simply stops offering.
      recorderRef.current = null
      setRecording(false)
      return
    }

    const chunks: Blob[] = []
    let capped = 0

    recorder.ondataavailable = (e) => {
      if (e.data?.size) chunks.push(e.data)
    }
    recorder.onstop = () => {
      clearTimeout(capped)
      recorderRef.current = null
      recordingRef.current = false
      setRecording(false)
      // Stopped by the button, or stopped by the sheet closing underneath it?
      // The recorder cannot say, and the two mean opposite things — see
      // `recordingOutcome`, which is where that is reasoned about and tested.
      if (recordingOutcome({ previewLive: liveRef.current, chunks: chunks.length }) !== 'analyse') {
        return
      }
      const file = new File([new Blob(chunks, { type })], recordingFileName(type, new Date()), {
        type,
      })
      onRecorded(file)
    }
    recorder.onerror = () => {
      clearTimeout(capped)
      recorderRef.current = null
      recordingRef.current = false
      setRecording(false)
    }

    try {
      recorder.start()
    } catch {
      recorderRef.current = null
      setRecording(false)
      return
    }

    recorderRef.current = recorder
    recordingRef.current = true
    setRecording(true)

    // The backstop. See MAX_RECORDING_SECONDS: chunks accumulate in memory
    // until something stops the recorder, and the likeliest way for nothing to
    // is a player who has put the phone down and forgotten which button they
    // pressed.
    capped = setTimeout(() => {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    }, MAX_RECORDING_SECONDS * 1000) as unknown as number
  }

  if (block) {
    return (
      <div className="framer">
        <p className="framer-cue framer-cue--blocked" role="status">
          <Cue text={PREVIEW_BLOCK_CUE[block]} />
        </p>
        <p className="framer-foot">
          Filming with your own camera app and picking the video works exactly the same. The
          framing gets checked on the clip either way — this only moves that check earlier.
        </p>
      </div>
    )
  }

  return (
    <div className="framer">
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

      {/* Only where the browser will record something this app can then read.
          See `recordingType` — a control that produces a file the analyser
          refuses is worse than no control. */}
      {onRecorded && type && !block && (
        <button
          type="button"
          className={`btn btn--full framer-record${recording ? ' framer-record--on' : ''}`}
          onClick={toggleRecording}
        >
          <Icon name={recording ? 'check' : 'camera'} size={17} />
          {recording ? 'Stop and analyse' : 'Record the serve here'}
        </button>
      )}

      <p className="framer-foot">
        {warming !== null
          ? 'This is the same download an analysis needs, so it only happens once.'
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
