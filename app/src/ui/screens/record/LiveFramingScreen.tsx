import { BookOpenIcon, CompassIcon, DotsThreeIcon, FilmReelIcon, ListChecksIcon, SpeakerHighIcon, SpeakerSlashIcon, VideoCameraIcon, XIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { showToast } from '../../../data/index.ts'
import { useProfile, useSetting } from '../../../data/hooks.ts'
import { Button, IconButton, ListGroup, ListRow, RowIcon, Sheet, StatusChip } from '../../components/index.ts'
import { BodyCheckSheet, CheckItem, ChecklistRail, FramingOverlay, InstructionPill, RecordButton, SpotStateView } from '../../components/record/index.ts'
import { cx } from '../../components/cx.ts'
import { shortDate } from '../../format/dates.ts'
import { paths } from '../../shell/paths.ts'
import { CourtSide } from '../../theme/CourtSide.tsx'
import { startAnalysis } from './flow/jobs.ts'
import { clock, fpsLabel, resolutionLabel } from './flow/importLogic.ts'
import { PLANS, RETEST_PLAN, useRecordFlow } from './flow/flowStore.ts'
import { hasSeen, markSeen } from './flow/seenOnce.ts'
import { bodyCheckForReferral, noteBodyCheck } from '../focus/actions.ts'
import { fallbackMeta, playerFacts, recordingCapture, saveNewSession, TEMPLATE_BY_PLAN, type RecordingFacts } from './flow/sessionFactory.ts'
import { localDate } from '../../../platform/ids.ts'
import type { VideoMeta } from '../../../analysis/types.ts'
import { chime, lowTone, primeAudio, speak, spotStateFor } from './live/cues.ts'
import { evaluateLive, FRAMING, type LiveEvaluation } from './live/framing.ts'
import { CameraProblemView, CountdownView, LivePanel, PrealertView, RecordingView, TallyView, TurnPrompt, type TallyValues } from './live/LiveViews.tsx'
import { ClipRecorder, MAX_RECORDING_S, type RecordedClip } from './live/recorder.ts'
import { devClipId, useCamera } from './live/useCamera.ts'
import { useLevel } from './live/useLevel.ts'
import { usePosePass } from './live/usePosePass.ts'
import { useSceneStats } from './live/useSceneStats.ts'
import { useWakeLock } from './live/useWakeLock.ts'

type Stage = 'check' | 'prealert' | 'framing' | 'countdown' | 'recording' | 'saving' | 'tally'

interface Saved {
  clip: RecordedClip
  meta: VideoMeta
  facts: RecordingFacts
  startedAt: string
}

const MIN_CLIP_S = 10
const CHIME_AT_S = 15 * 60

function devSpotOff(): boolean {
  return import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('dev-spot') === 'off'
}

/**
 * R3 to R7 (DESIGN §10.3, CAPTURE §9): the live framing assistant, countdown, recording and tally.
 * Checks: level (motion sensors, iOS permission from a tap), in frame, room above (the D1 4.5 m
 * framing rule from the standing player), room ahead, steady, light, frame rate and size, from a
 * light MediaPipe pass on the preview. Ready only when the core checks pass; "Record anyway" is an
 * explicit override that is never offered over a measured 4.3 m or 5° block. Records video only.
 * Every state works without a camera or sensors (desktop): it says what is missing and offers import.
 */
export function LiveFramingScreen() {
  const navigate = useNavigate()
  const flow = useRecordFlow()
  const plan = flow.plan === 'retest' ? RETEST_PLAN : (PLANS.find((p) => p.id === flow.plan) ?? PLANS[0])
  const profile = useProfile()
  const captureDefaults = useSetting('captureDefaults')
  const player = playerFacts(profile)
  const bodyChecked = flow.bodyCheckedAt !== null
  const [stage, setStage] = useState<Stage>(() => (!bodyChecked ? 'check' : hasSeen('camera-prealert') || devClipId() ? 'framing' : 'prealert'))
  const [sound, setSound] = useState(true)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [sheet, setSheet] = useState<'menu' | 'detail' | null>(null)
  const [spotDismissed, setSpotDismissed] = useState(devSpotOff())
  const [anyway, setAnyway] = useState<string[] | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [saved, setSaved] = useState<Saved | null>(null)
  const [tally, setTally] = useState<TallyValues>(() => ({ in: null, total: plan.serves, net: 0, long: 0, wide: 0, thenTag: false }))
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const pillRef = useRef<HTMLDivElement>(null)
  const recorder = useRef<ClipRecorder | null>(null)
  const startedAt = useRef<{ epoch: number; perf: number }>({ epoch: 0, perf: 0 })
  /** Framing when Record was tapped (the pose pass pauses during the countdown). */
  const framingAtTap = useRef<LiveEvaluation['geometry']>(null)

  const liveStages = stage === 'framing' || stage === 'countdown' || stage === 'recording'
  const { attachVideo, ...camera } = useCamera(flow.fps === 50 ? 50 : Math.min(60, flow.fps))
  const level = useLevel(liveStages)
  const framing = stage === 'framing'
  const pose = usePosePass(camera.video, framing && camera.status === 'live', player.handedness)
  const scene = useSceneStats(camera.video, framing && camera.status === 'live', pose.snapshot)
  const wake = useWakeLock(liveStages)

  const close = useCallback(() => navigate(paths.record()), [navigate])

  // A camera that never answers (a pending permission prompt, a stuck driver) gets a way out after 8 s.
  const [slowStart, setSlowStart] = useState(false)
  useEffect(() => {
    if (camera.status !== 'starting') return
    const t = window.setTimeout(() => setSlowStart(true), 8000)
    return () => window.clearTimeout(t)
  }, [camera.status])
  const cameraSlow = slowStart && camera.status === 'starting'

  // Start the camera when framing begins; it stays on through countdown and recording.
  useEffect(() => {
    if (liveStages && camera.status === 'idle') camera.start()
  }, [liveStages, camera])


  const info = camera.info
  const frameW = info?.width || 0
  const frameH = info?.height || 0
  const frameOrientation: 'portrait' | 'landscape' = frameH >= frameW ? 'portrait' : 'landscape'
  const setupOrientation: 'portrait' | 'landscape' = flow.setup === 'fence' ? 'landscape' : 'portrait'
  const aspect = frameW && frameH ? frameW / frameH : setupOrientation === 'portrait' ? 9 / 16 : 16 / 9

  const evaluation: LiveEvaluation = useMemo(
    () =>
      evaluateLive({
        setupOrientation,
        orientation: frameOrientation,
        frameHeightPx: frameH || 1920,
        aspect,
        playerHeightM: player.heightM,
        tilt: level.tilt,
        motion: level.motion,
        pose: pose.status === 'unavailable' ? 'unavailable' : pose.snapshot,
        personSeen: pose.seen,
        steady: scene.steady,
        light: scene.light,
        fps: info?.fps ?? null,
        netOnRight: player.handedness === 'right',
      }),
    [setupOrientation, frameOrientation, frameH, aspect, player.heightM, player.handedness, level.tilt, level.motion, pose.status, pose.snapshot, pose.seen, scene.steady, scene.light, info?.fps],
  )

  const orientationWrong = frameW > 0 && frameOrientation !== setupOrientation
  const needTurnPrompt = orientationWrong && setupOrientation === 'landscape'
  const ready = evaluation.ready && !orientationWrong
  const pill = orientationWrong
    ? { kind: 'turn' as const, text: 'Turn the phone upright', detail: 'The upright set-up needs the phone standing on its end.' }
    : evaluation.instruction
      ? {
          kind: level.motion === 'prompt' && evaluation.instruction.checkId === 'level' ? ('motion' as const) : evaluation.instruction.checkId,
          text: evaluation.instruction.text,
          detail: evaluation.instruction.detail,
        }
      : { kind: 'ready' as const, text: 'Ready', detail: 'Walk to your spot, then tap Record.' }
  const blocking = evaluation.checks.filter((c) => c.core && c.state === 'block').length
  const recordLabel = ready ? 'Ready' : blocking > 0 ? (blocking === 1 ? '1 fix' : `${blocking} fixes`) : 'Checking'

  // Serving-spot state (R4) with its sound: shown while standing at the spot, until tapped away.
  const spot = spotStateFor({ ready, instruction: evaluation.instruction })
  const showSpot = framing && camera.status === 'live' && pose.atSpot && !spotDismissed && !needTurnPrompt
  const lastCue = useRef('')
  useEffect(() => {
    if (!showSpot) {
      lastCue.current = ''
      return
    }
    const key = `${spot.kind}:${spot.word}`
    if (key === lastCue.current || !sound) return
    lastCue.current = key
    if (spot.kind === 'ready') chime()
    else lowTone()
    speak(spot.kind === 'ready' ? 'Ready' : spot.line)
  }, [showSpot, spot.kind, spot.word, spot.line, sound])
  const [wasAtSpot, setWasAtSpot] = useState(pose.atSpot)
  if (pose.atSpot !== wasAtSpot) {
    // Leaving the spot re-arms the state for the next time the player stands there.
    setWasAtSpot(pose.atSpot)
    if (!pose.atSpot) setSpotDismissed(devSpotOff())
  }

  const beginCountdown = (overrides: string[] | null) => {
    primeAudio()
    framingAtTap.current = evaluation.geometry
    setAnyway(overrides)
    setSheet(null)
    setStage('countdown')
  }

  const onRecordPress = () => {
    primeAudio()
    if (ready) beginCountdown(null)
    else {
      pillRef.current?.focus()
      if (sound) speak(pill.text)
    }
  }

  // Recording: start, tick the timer, stop on Stop, after 20 minutes or when the page is hidden.
  const stopRecording = useCallback(() => recorder.current?.stop(), [])
  const onCountdownDone = useCallback(() => {
    const stream = camera.stream
    if (!stream || !ClipRecorder.supported()) {
      setStage('framing')
      showToast("This browser can't record video here. Film in the Camera app and import it.")
      return
    }
    const rec = new ClipRecorder(stream)
    recorder.current = rec
    startedAt.current = { epoch: Date.now(), perf: performance.now() }
    level.startLog(performance.now())
    try {
      rec.start()
    } catch {
      setStage('framing')
      showToast("We couldn't start the recorder. Try again, or film in the Camera app and import it.")
      return
    }
    setElapsed(0)
    setStage('recording')
    void rec.done.then(async (clip) => {
      const samples = level.stopLog()
      setStage('saving')
      const facts: RecordingFacts = {
        mimeType: clip.mimeType,
        durationS: clip.durationS,
        requested: { width: 1920, height: 1080, fps: flow.fps },
        delivered: { width: frameW, height: frameH, fps: info?.fps ?? 0 },
        orientation: frameOrientation,
        setup: flow.setup,
        cameraLabel: info?.label,
        orientationSamples: samples,
        recordingStartMs: startedAt.current.epoch,
        framingAtStart: framingAtTap.current
          ? {
              frameTopM: framingAtTap.current.frameTopM,
              bodyPx1080: (framingAtTap.current.bodyPx / Math.max(1, frameH)) * 1080,
              roomAheadM: framingAtTap.current.roomAheadM ?? 0,
              cameraHeightM: framingAtTap.current.cameraHeightM,
            }
          : undefined,
        recordedAnyway: anyway ?? undefined,
        expectedServeCount: plan.serves,
      }
      const fileName = `serve-${localDate(new Date(startedAt.current.epoch))}.${clip.mimeType.includes('mp4') ? 'mp4' : 'webm'}`
      let meta = fallbackMeta(fileName, facts)
      try {
        const { probeVideo } = await import('../../../analysis/video/probe.ts')
        const probe = await probeVideo(clip.blob, { fileName, mimeType: clip.mimeType })
        meta = probe.meta
      } catch {
        // WebM or an unfinished file: keep the delivered settings; the pipeline probes again.
      }
      setSaved({ clip, meta, facts, startedAt: new Date(startedAt.current.epoch).toISOString() })
      setStage('tally')
    })
  }, [camera.stream, level, flow.fps, flow.setup, frameW, frameH, info?.fps, info?.label, frameOrientation, anyway, plan.serves])

  useEffect(() => {
    if (stage !== 'recording') return
    let chimed = false
    const t = window.setInterval(() => {
      const s = (performance.now() - startedAt.current.perf) / 1000
      setElapsed(s)
      if (!chimed && s >= CHIME_AT_S) {
        chimed = true
        if (sound) chime()
      }
      if (s >= MAX_RECORDING_S) stopRecording()
    }, 250)
    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        recorder.current?.markInterrupted()
        stopRecording()
      }
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [stage, sound, stopRecording])

  // The camera is released as soon as the clip is saved.
  useEffect(() => {
    if (stage === 'tally') camera.stop()
  }, [stage, camera])

  const analyse = async (withTally: boolean) => {
    if (!saved) return
    setBusy(true)
    setSaveError(null)
    const b = flow.block
    // The serving spot chosen on Record is a set-up matching factor (METRICS §4.4), saved with the session.
    const block = { side: b.side, serveNumber: b.serveNumber, type: b.type, target: b.target, wind: b.wind, light: b.light, servingSpot: b.spot }
    // Hit-sound onsets are not captured by the in-browser recorder in this build, so none are claimed.
    const capture = recordingCapture(player, block, saved.facts, false)
    try {
      const { sessionId } = await saveNewSession({
        session: { capture, view: 'side', cameraSide: 'chest', mode: 'technique', template: TEMPLATE_BY_PLAN[flow.plan] ?? 'check-in', startedAt: saved.startedAt, block },
        tally:
          withTally && tally.in !== null
            ? {
                serveNumber: b.serveNumber,
                counts: {
                  in: tally.in,
                  total: tally.total,
                  ...(tally.net ? { net: tally.net } : {}),
                  ...(tally.long ? { long: tally.long } : {}),
                  ...(tally.wide ? { wide: tally.wide } : {}),
                },
              }
            : undefined,
      })
      void startAnalysis({
        sessionId,
        file: saved.clip.blob,
        run: { profile: { heightM: player.heightM, handedness: player.handedness }, view: 'side', capture, source: 'in-app-web', hitSoundTiming: false },
        clip: {
          title: `${shortDate(new Date(saved.startedAt))}, ${clock(saved.meta.durationMediaS)}`,
          line: `Side view, ${b.side}, ${b.serveNumber === 2 ? 'second' : 'first'} serves`,
          tech: `${resolutionLabel(saved.meta.width, saved.meta.height)}, ${fpsLabel(saved.meta.captureFps)}`,
          orientation: saved.meta.height >= saved.meta.width ? 'portrait' : 'landscape',
        },
        thenTag: tally.thenTag,
      })
      flow.clearBodyCheck()
      navigate(paths.processing(sessionId), { replace: true })
    } catch (error) {
      const quota = (error as { name?: string } | null)?.name === 'QuotaExceededError'
      setSaveError(quota ? 'This phone is out of space, so the recording could not be saved. Free up some space and try again.' : "We couldn't save the recording. Try again.")
      setBusy(false)
    }
  }

  const recordAgain = () => {
    setSaved(null)
    setTally((t) => ({ ...t, in: null, net: 0, long: 0, wide: 0 }))
    flow.clearBodyCheck()
    setStage('check')
  }

  const title = <h1 className="sr-only">Live framing</h1>

  // ----- Stages without the preview -----
  if (stage === 'check' || stage === 'prealert') {
    return (
      <CourtSide className="min-h-[100dvh] bg-bg">
        {title}
        {stage === 'prealert' ? (
          <PrealertView
            askMotion={level.motion === 'prompt'}
            onClose={close}
            onContinue={() => {
              markSeen('camera-prealert')
              primeAudio()
              if (level.motion === 'prompt') void level.request()
              setStage('framing')
            }}
          />
        ) : (
          <LivePanel onClose={close}>
            <p className="text-callout text-ink-2">A quick body check comes first, before every recording.</p>
          </LivePanel>
        )}
        <BodyCheckSheet
          open={stage === 'check'}
          onCancel={close}
          onClear={(check) => {
            void noteBodyCheck(check)
            flow.markBodyChecked()
            setStage(hasSeen('camera-prealert') || devClipId() ? 'framing' : 'prealert')
          }}
          onStop={(level) => {
            void noteBodyCheck(bodyCheckForReferral(level))
            showToast('No recording today. Your stats are safe.')
            close()
          }}
        />
      </CourtSide>
    )
  }

  if (stage === 'tally' || stage === 'saving') {
    const meta = saved?.meta
    const savedLine = meta ? `Saved: ${clock(meta.durationMediaS)}, ${resolutionLabel(meta.width, meta.height)}, ${fpsLabel(meta.captureFps)}` : 'Saving the recording…'
    return (
      <CourtSide className="min-h-[100dvh] bg-bg">
        {title}
        {stage === 'saving' || !saved ? (
          <LivePanel onClose={close}>
            <p className="text-title-2 text-ink" role="status">
              Saving the recording…
            </p>
          </LivePanel>
        ) : (
          <TallyView
            saved={savedLine}
            fpsNote={meta && meta.captureFps < 50 ? `${fpsLabel(meta.captureFps)}: timing is less precise. For 60 fps or more, record in the Camera app and import it.` : null}
            interrupted={saved.clip.interrupted ? `Recording stopped at ${clock(saved.clip.durationS)}. We kept what was recorded.` : null}
            tooShort={saved.clip.durationS < MIN_CLIP_S}
            secondServes={flow.block.serveNumber === 2}
            values={tally}
            onChange={(patch) => setTally((t) => ({ ...t, ...patch }))}
            busy={busy}
            error={saveError}
            onAnalyse={() => void analyse(true)}
            onSkip={() => void analyse(false)}
            onRecordAgain={recordAgain}
            onClose={close}
          />
        )}
      </CourtSide>
    )
  }

  // ----- Camera stages -----
  if (camera.status === 'problem' && camera.problem) {
    return (
      <CourtSide className="min-h-[100dvh] bg-bg">
        {title}
        <CameraProblemView problem={camera.problem} onRetry={camera.start} onClose={close} />
      </CourtSide>
    )
  }
  if (needTurnPrompt && stage === 'framing') {
    return (
      <CourtSide className="min-h-[100dvh] bg-bg">
        {title}
        <TurnPrompt onUpright={() => flow.setSetup('portrait')} onClose={close} />
      </CourtSide>
    )
  }

  const landscapeLayout = frameOrientation === 'landscape' && typeof window !== 'undefined' && window.innerWidth > window.innerHeight
  const heightNote = player.heightSource === 'default' ? `Using ${player.heightM.toFixed(2)} m for your height. Add yours in Profile for a truer check.` : null
  const g = evaluation.geometry

  return (
    <CourtSide className="fixed inset-0 flex flex-col bg-letterbox">
      {title}
      <div className={cx('relative min-h-0 flex-1 [container-type:size]', landscapeLayout ? 'flex items-center' : 'flex items-start justify-center')}>
        <div className="relative overflow-hidden" style={{ aspectRatio: `${aspect}`, width: `min(100cqw, calc(100cqh * ${aspect}))` }}>
          <video ref={attachVideo} muted playsInline autoPlay aria-label="Camera preview" className="absolute inset-0 size-full bg-letterbox object-contain" />
          {camera.status === 'live' ? (
            <FramingOverlay
              orientation={frameOrientation}
              feetY={pose.snapshot?.floorY ?? null}
              tilt={level.tilt}
              level={evaluation.levelState === 'level'}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center" role="status">
              <p className="text-callout text-ink-inverse">
                {cameraSlow ? 'The camera is taking a while. If your browser asked for permission, allow it, or try again.' : 'Starting the camera…'}
              </p>
              {cameraSlow ? (
                <div className="flex w-full max-w-[280px] flex-col gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSlowStart(false)
                      camera.stop()
                      camera.start()
                    }}
                  >
                    Try again
                  </Button>
                  <Button variant="secondary" icon={FilmReelIcon} to={paths.importVideo()}>
                    Import a video
                  </Button>
                </div>
              ) : null}
            </div>
          )}
          {!landscapeLayout ? (
            <div className={cx('absolute inset-x-1.5 bottom-2', railCollapsed && 'flex justify-center')}>
              <ChecklistRail checks={evaluation.checks} layout="portrait" collapsed={railCollapsed} onToggle={() => setRailCollapsed((c) => !c)} />
            </div>
          ) : null}
        </div>
        {landscapeLayout ? (
          <div className="absolute top-16 right-[max(12px,env(safe-area-inset-right))] bottom-[max(8px,env(safe-area-inset-bottom))] flex flex-col items-end justify-between gap-2">
            <ChecklistRail checks={evaluation.checks} layout="landscape" collapsed={railCollapsed} onToggle={() => setRailCollapsed((c) => !c)} />
            <div className="flex items-center gap-3">
              <IconButton icon={ListChecksIcon} label="Capture checks" variant="filled" onClick={() => setSheet('detail')} />
              <IconButton icon={DotsThreeIcon} label="More options" variant="filled" onClick={() => setSheet('menu')} />
              <RecordButton ready={ready} label={recordLabel} onPress={onRecordPress} layout="inline" />
            </div>
          </div>
        ) : null}
        {/* Top controls over the preview: close, the one instruction, sound. */}
        <div className="pad-safe-top absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-3 pt-3">
          <IconButton icon={XIcon} label="Close camera" onClick={close} className="bg-surface-inverse text-ink-inverse hover:bg-surface-inverse" />
          <InstructionPill ref={pillRef} kind={pill.kind} text={pill.text} detail={pill.detail} />
          <IconButton
            icon={sound ? SpeakerHighIcon : SpeakerSlashIcon}
            label={sound ? 'Turn sound and speech off' : 'Turn sound and speech on'}
            onClick={() => {
              primeAudio()
              setSound((s) => !s)
            }}
            className="bg-surface-inverse text-ink-inverse hover:bg-surface-inverse"
          />
        </div>
        {level.motion === 'prompt' && camera.status === 'live' ? (
          <div className="absolute inset-x-0 top-[40%] flex justify-center">
            <Button variant="secondary" fullWidth={false} icon={CompassIcon} onClick={() => void level.request()}>
              Show level
            </Button>
          </div>
        ) : null}
        {showSpot ? <SpotStateView {...spot} orientation={frameOrientation} onDismiss={() => setSpotDismissed(true)} /> : null}
      </div>

      {!landscapeLayout ? (
        <div className="pad-safe-bottom border-t-2 border-ink bg-surface">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 pt-3 pb-3">
            <button
              type="button"
              onClick={() => setSheet('detail')}
              className="inline-flex h-11 items-center justify-self-start rounded-full border-2 border-ink px-3 text-subhead tabular-nums text-ink hover:bg-surface-2"
            >
              {evaluation.checks.filter((c) => c.state === 'pass' || c.state === 'warn').length} of {evaluation.checks.length} ready
            </button>
            <RecordButton ready={ready} label={recordLabel} onPress={onRecordPress} />
            <IconButton icon={DotsThreeIcon} label="More options" variant="filled" onClick={() => setSheet('menu')} className="justify-self-end" />
          </div>
        </div>
      ) : null}

      <Sheet open={sheet === 'detail'} onClose={() => setSheet(null)} title="Capture checks" detent="large" closeStyle="done">
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-1">
            {evaluation.checks.map((c) => (
              <CheckItem key={c.id} check={c} showValue className="min-h-11" />
            ))}
          </ul>
          <div className="flex flex-col gap-2 rounded-card bg-surface-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-subhead text-ink">Framing, worked out from your height</p>
              <StatusChip status="estimated" />
            </div>
            {g ? (
              <ul className="flex flex-col gap-1 text-footnote tabular-nums text-ink-2">
                <li>
                  Room above your toss: {g.frameTopM.toFixed(1)} m (needs {Math.max(FRAMING.frameTop.min, g.frameTopMinM).toFixed(1)}; {FRAMING.frameTop.target} m is ideal)
                </li>
                <li>Phone height: about {g.cameraHeightM.toFixed(1)} m</li>
                <li>You: {Math.round(g.bodyPx)} px tall</li>
                {g.roomAheadM !== null ? <li>Room ahead of your front foot: {g.roomAheadM.toFixed(1)} m</li> : null}
              </ul>
            ) : (
              <p className="text-footnote text-ink-2">Stand tall at your serving spot for two seconds and these fill in.</p>
            )}
            <p className="text-footnote text-ink-3">
              {heightNote ?? `From your height, ${player.heightM.toFixed(2)} m (you logged). ${g && !g.tiltMeasured ? 'The tilt is unknown, so the phone is taken as level.' : ''}`}
            </p>
          </div>
          {info ? (
            <p className="text-footnote tabular-nums text-ink-2">
              Camera: {info.width && info.height ? resolutionLabel(info.width, info.height) : 'size unknown'}, {info.fps ? fpsLabel(info.fps) : 'frame rate unknown'}
              {info.fps && info.fps < 50 ? '. For 60, 120 or 240 fps, record in the Camera app and import.' : ''}
            </p>
          ) : null}
          {level.motion === 'denied' || level.motion === 'unsupported' ? (
            <div className="flex flex-col gap-2">
              <p className="text-callout text-ink">
                We can't read the phone's tilt. Keep it level by eye, lined up with the net post or a fence post. Heights will be marked estimated.
              </p>
              {level.motion === 'denied' ? (
                <Button variant="secondary" icon={CompassIcon} onClick={() => void level.request()}>
                  Ask again
                </Button>
              ) : null}
            </div>
          ) : null}
          {pose.status === 'unavailable' ? (
            <p className="text-callout text-ink">This browser can't run the body check, so In frame, Room above, Room ahead and Size can't be checked here. The analysis checks them afterwards.</p>
          ) : null}
        </div>
      </Sheet>

      <Sheet open={sheet === 'menu'} onClose={() => setSheet(null)} title="More options" closeStyle="done">
        <div className="flex flex-col gap-4">
          {!ready ? (
            evaluation.recordAnyway === 'not-offered' ? (
              <p className="text-callout text-ink">Record anyway isn't available while the phone is tilted more than 5°. Level the phone first.</p>
            ) : (
              <div className="flex flex-col gap-2">
                <Button
                  variant="secondary"
                  icon={VideoCameraIcon}
                  onClick={() =>
                    beginCountdown(
                      evaluation.recordAnyway === 'without-toss-height'
                        ? Array.from(new Set([...evaluation.failingCaptureIds, 'cq.toss-headroom']))
                        : evaluation.failingCaptureIds,
                    )
                  }
                >
                  {evaluation.recordAnyway === 'without-toss-height' ? 'Record without toss height' : 'Record anyway'}
                </Button>
                <p className="text-footnote text-ink-2">
                  {evaluation.recordAnyway === 'without-toss-height'
                    ? 'The picture is too short for your toss, so toss height, drop and consistency will be unavailable for this block. Everything else is analysed.'
                    : "We'll note what wasn't checked, and any number it affects will say so."}
                </p>
              </div>
            )
          ) : null}
          <ListGroup>
            <ListRow
              onPress={() => {
                flow.setSetup(flow.setup === 'fence' ? 'portrait' : 'fence')
                setSheet(null)
              }}
              leading={
                <RowIcon>
                  <VideoCameraIcon size={24} aria-hidden="true" />
                </RowIcon>
              }
              title={flow.setup === 'fence' ? 'Film upright instead' : 'Film sideways at the fence'}
              chevron={false}
            />
            <ListRow
              to={`${paths.setupChoice()}#guide`}
              leading={
                <RowIcon>
                  <BookOpenIcon size={24} aria-hidden="true" />
                </RowIcon>
              }
              title="Set-up guide"
            />
            <ListRow
              to={paths.importVideo()}
              leading={
                <RowIcon>
                  <FilmReelIcon size={24} aria-hidden="true" />
                </RowIcon>
              }
              title="Import a video instead"
            />
          </ListGroup>
          {wake === false ? <p className="text-footnote text-ink-2">Set Auto-Lock to Never while you record (Settings › Display & Brightness). Don't switch apps while recording.</p> : null}
          {heightNote ? <p className="text-footnote text-ink-3">{heightNote}</p> : null}
        </div>
      </Sheet>

      {stage === 'countdown' ? (
        <CountdownView seconds={captureDefaults?.countdownS ?? 10} sound={sound} onDone={onCountdownDone} onCancel={() => setStage('framing')} />
      ) : null}
      {stage === 'recording' ? <RecordingView elapsedS={elapsed} onStop={stopRecording} /> : null}
    </CourtSide>
  )
}
