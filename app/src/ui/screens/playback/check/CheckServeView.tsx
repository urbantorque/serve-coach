/**
 * "Check this serve" (ARCHITECTURE §12; METRICS §5.6; docs/VALIDATION_PROTOCOL.md): a focused mode of
 * Serve detail (?mode=check) where a person marks ground truth on the real clip: toss release, the
 * peak and contact frames with the ball's centre, the front-foot landing with the toe, the standing
 * height (head top and heel), and optionally a radar reading. The app's answers stay hidden until the
 * marks are saved; then "App vs you" compares them. Checks stay on the phone and can be exported as
 * a JSON file for the validation set.
 */
import { CornersInIcon, CornersOutIcon, CrosshairSimpleIcon, UserIcon, VideoCameraSlashIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import type { AnnotatedPoint, ServeAnalysis } from '../../../../data/domain.ts'
import { useSettingsStore } from '../../../../data/index.ts'
import type { SessionRecord } from '../../../../data/records.ts'
import { compareWithMarks, mechanicsOf, type AgreementRow } from '../../../../validation/annotation/agreement.ts'
import {
  annotationId,
  clearStep,
  emptyDraft,
  EVENT_LABEL,
  fromAnnotation,
  hasAnyMark,
  nextPointOf,
  nudgePoint,
  progress,
  setEvent,
  setPoint,
  setSure,
  stepById,
  stepDone,
  stepFrame,
  toAnnotation,
  type MarkDraft,
  type StepId,
} from '../../../../validation/annotation/marks.ts'
import { markRevealed, saveCheck } from '../../../../validation/annotation/store.ts'
import type { CheckAnnotation } from '../../../../validation/annotation/types.ts'
import { AppBar, BottomActionBar, Button, DelayedSkeleton, EmptyState, SampleBanner, Skeleton } from '../../../components/index.ts'
import {
  createPlayhead,
  FrameScrubber,
  playerRegion,
  TransportRow,
  usePlayhead,
  useVideoController,
  VideoStage,
  type NPoint,
  type Playhead,
} from '../../../components/video/index.ts'
import { paths } from '../../../shell/paths.ts'
import { usePlayerZoom } from '../hooks.ts'
import type { ServePlayback } from '../useServePlayback.ts'
import { AgreementPanel } from './AgreementPanel.tsx'
import { appPointsFor } from './appPoints.ts'
import { ExportSheet, WhoSheet } from './CheckSheets.tsx'
import { checkScene } from './checkScene.ts'
import { annotatorLabel, useAnnotator, useChecksForServe, useStudyCode, type Annotator } from './data.ts'
import { Loupe } from './Loupe.tsx'
import { MarkPanel } from './MarkPanel.tsx'
import { usePinnedBlock } from './usePinnedBlock.ts'

/**
 * Serve detail's boxes (DESIGN §8.11), with portrait at 40% of the screen instead of the 45% cap: the
 * video, scrubber and transport stay pinned under the app bar while the marks scroll beneath, so the
 * frame being marked is always in view and the step card still gets room on a 390 × 844 phone.
 */
const PORTRAIT_BOX = 'min(40dvh, 693px)'
const LANDSCAPE_BOX = 'calc(min(100vw, 560px) * 9 / 16)'
/** Pinned only where the screen is tall enough to leave room for the marks below. */
/** Pinned directly under the fixed app bar (--appbar-h is px, so the offset holds at any text size). */
const PINNED = '[@media(min-height:640px)]:sticky [@media(min-height:640px)]:top-[calc(var(--appbar-h)+env(safe-area-inset-top))]'

/** Half a second either side of the app's serve window, so the person can find frames the app missed. */
const PAD_S = 0.5

export interface CheckServeViewProps {
  session: SessionRecord
  serve: ServeAnalysis
  serves: ServeAnalysis[]
  pb: ServePlayback
}

export function CheckServeView(props: CheckServeViewProps) {
  const { session, serve, pb } = props
  const checks = useChecksForServe(serve.id)
  const [annotator, setAnnotator] = useAnnotator()
  const [studyCode, setStudyCode] = useStudyCode(session.id)
  // Unsaved marks survive a change of who is marking (fixing the initials before saving). Saved marks
  // never pass to the next person, so a second annotator on the same phone starts blind.
  const [carried, setCarried] = useState<MarkDraft | null>(null)
  const title = `Check serve ${serve.index}`
  const back = { to: paths.serveDetail(session.id, serve.id), label: `Serve ${serve.index}` }

  if (!pb.videoUrl) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-bg">
        <AppBar title={title} back={back} />
        {session.isDemo ? <SampleBanner /> : null}
        <EmptyState
          icon={VideoCameraSlashIcon}
          title="Checking needs the video"
          body={
            pb.video && pb.video.role !== 'demo'
              ? "Marking frames needs the original clip, and this serve's video isn't on this phone any more. Key frames alone can't be checked."
              : session.isDemo
                ? 'Sample serves have no video, so there are no frames to mark.'
                : "Marking frames needs the original clip, and this serve's video isn't on this phone."
          }
          action={
            <Button variant="secondary" to={back.to}>
              Back to serve
            </Button>
          }
          className="mt-16"
        />
      </div>
    )
  }
  if (checks === undefined) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-bg">
        <AppBar title={title} back={back} />
        <DelayedSkeleton label="Loading check…">
          <Skeleton className="h-[min(45dvh,380px)]" />
        </DelayedSkeleton>
      </div>
    )
  }
  const id = annotationId(serve.id, annotator.initials)
  const mine = checks.find((c) => c.id === id) ?? null
  const others = checks.filter((c) => c.id !== id).length
  return (
    <CheckSession
      key={id}
      {...props}
      existing={mine}
      initialDraft={mine ? fromAnnotation(mine) : (carried ?? emptyDraft())}
      others={others}
      annotator={annotator}
      studyCode={studyCode || mine?.subjectCode || ''}
      onAnnotator={(a, code, unsaved) => {
        setStudyCode(code)
        if (a.initials === annotator.initials && a.role === annotator.role) return
        setCarried(unsaved)
        setAnnotator(a)
      }}
      title={title}
      back={back}
    />
  )
}

interface SessionProps extends CheckServeViewProps {
  existing: CheckAnnotation | null
  initialDraft: MarkDraft
  others: number
  annotator: Annotator
  studyCode: string
  /** `unsaved`: the marks to carry to the new person, or null when this person's marks are saved. */
  onAnnotator: (a: Annotator, studyCode: string, unsaved: MarkDraft | null) => void
  title: string
  back: { to: string; label: string }
}

function paddedWindow(serve: ServeAnalysis, pb: ServePlayback): { startFrame: number; endFrame: number } {
  const pad = Math.round(PAD_S * pb.timing.nominalFps)
  const last = pb.video?.meta.frameCount ? pb.video.meta.frameCount - 1 : Infinity
  return { startFrame: Math.max(0, serve.window.startFrame - pad), endFrame: Math.min(last, serve.window.endFrame + pad) }
}

function CheckSession({ session, serve, serves, pb, existing, initialDraft, others, annotator, studyCode, onAnnotator, title, back }: SessionProps) {
  const navigate = useNavigate()
  const experimentalOn = useSettingsStore((s) => s.experimentalMetrics)
  const win = useMemo(() => paddedWindow(serve, pb), [serve, pb])
  const [store] = useState<Playhead>(() => createPlayhead({ frame: win.startFrame }))
  const controller = useVideoController({ store, nominalFps: pb.timing.nominalFps, window: win })
  // The element itself (for the loupe), kept in state so rendering never reads a ref.
  const [videoNode, setVideoNode] = useState<HTMLVideoElement | null>(null)
  const attach = useCallback(
    (el: HTMLVideoElement | null) => {
      setVideoNode(el)
      controller.attach(el)
    },
    [controller],
  )
  const frame = usePlayhead(store, (s) => s.frame)
  const playing = usePlayhead(store, (s) => s.playing)
  const [zoom, setZoom] = usePlayerZoom()
  const pinRef = useRef<HTMLDivElement>(null)
  const pinned = usePinnedBlock(pinRef)

  const [draft, setDraft] = useState<MarkDraft>(initialDraft)
  const [mode, setMode] = useState<'mark' | 'result'>(existing ? 'result' : 'mark')
  // The record just saved, used until the live read of the stored check catches up.
  const [saved, setSaved] = useState<CheckAnnotation | null>(null)
  const [stepId, setStepId] = useState<StepId>('standing')
  const [chosen, setChosen] = useState<AnnotatedPoint | null>(null)
  const [loupe, setLoupe] = useState<NPoint | null>(null)
  const [announce, setAnnounce] = useState('')
  const [whoOpen, setWhoOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const drag = useRef<AnnotatedPoint | null>(null)
  const step = stepById(stepId)
  const revealed = Boolean(existing?.revealedAt)

  // The point the next tap places: the one chosen, else the next open one of this step.
  const target: AnnotatedPoint | null = step.points.length ? (chosen ?? nextPointOf(step, draft)) : null

  // ---------- results ----------
  const app = useMemo(() => appPointsFor(serve, pb.track), [serve, pb.track])
  const clip = pb.clip
  const heightM = pb.video?.capture.playerHeightM ?? pb.heightM
  const agreement = useMemo(
    () =>
      compareWithMarks({
        marks: (saved && (!existing || saved.updatedAt > existing.updatedAt) ? saved : existing) ?? { events: {}, points: {} },
        events: serve.events,
        metrics: serve.metrics,
        ctx: { clip, timing: pb.timing, handedness: serve.handedness, heightM },
        appStandingNorm: app.standingNorm,
        appMechanics: mechanicsOf(serve),
      }),
    [saved, existing, serve, clip, pb.timing, heightM, app.standingNorm],
  )
  useEffect(() => {
    // Blinding: the first time the comparison is shown for these marks is recorded.
    if (mode === 'result' && existing && !existing.revealedAt) void markRevealed(existing.id, new Date().toISOString())
  }, [mode, existing])

  const speed = experimentalOn ? (serve.metrics['speed-experimental'] ?? null) : null
  const usableSpeed = speed && speed.status !== 'unavailable' && speed.uncertainty ? speed : null

  // ---------- zoom (portrait clips) ----------
  const portrait = pb.orientation === 'portrait'
  // A generous fixed head room: the app's own toss peak would hint at its answer.
  const region =
    portrait && zoom === 'player' && pb.standing && pb.bodyHeightNorm
      ? playerRegion({ groundY: pb.standing.groundY, bodyHeightNorm: pb.bodyHeightNorm, heightM, columnX: pb.standing.columnX, peakY: pb.standing.groundY - 2.6 * pb.bodyHeightNorm })
      : null

  // ---------- transport ----------
  const seek = (f: number) => controller.seek(f)
  const stepBy = (delta: number) => controller.step(delta)

  const goStep = (id: StepId) => {
    setStepId(id)
    setChosen(null)
    const f = stepFrame(stepById(id), draft)
    if (f !== null) seek(f)
  }

  // ---------- marking ----------
  const onPick = (phase: 'start' | 'move' | 'end', p: NPoint, view: { scale: number }) => {
    if (mode !== 'mark' || playing) {
      if (phase === 'end' && playing) setAnnounce('Pause to mark a point.')
      return
    }
    if (!step.points.length) {
      if (phase === 'end') setAnnounce(step.event ? 'This mark is a frame: use Mark frame.' : '')
      return
    }
    const f = store.getState().frame
    if (phase === 'start') {
      // Pressing on a placed mark of this step (on this frame) moves it instead of placing the next one.
      const near = step.points
        .map((sp) => ({ id: sp.id, pt: draft.points[sp.id] }))
        .filter((x) => x.pt && x.pt.frameIndex === f)
        .map((x) => ({ id: x.id, d: Math.hypot((x.pt!.x - p.x) * clip.width, (x.pt!.y - p.y) * clip.height) * view.scale }))
        .sort((a, b) => a.d - b.d)[0]
      drag.current = near && near.d <= 24 ? near.id : (target ?? step.points[step.points.length - 1].id)
    }
    const id = drag.current
    if (!id) return
    setDraft((d) => setPoint(d, step, id, { frameIndex: f, x: p.x, y: p.y }))
    if (phase === 'end') {
      drag.current = null
      setLoupe(null)
      setChosen(null)
      const label = step.points.find((sp) => sp.id === id)?.label ?? 'Point'
      setAnnounce(`${label} marked on frame ${f}.`)
    } else {
      if (phase === 'start') controller.pause()
      setLoupe(p)
    }
  }

  const onBoxKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (mode !== 'mark' || !target) return
    const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
    const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
    if (!dx && !dy) return
    const pt = draft.points[target]
    if (!pt || pt.frameIndex !== store.getState().frame) return
    e.preventDefault()
    const k = e.shiftKey ? 5 : 1
    setDraft((d) => nudgePoint(d, target, dx * k, dy * k, clip))
  }

  // Keyboard: , and . step a frame (Shift: 10), outside inputs and the scrubber.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target instanceof HTMLElement ? e.target : null
      if (t && (t.closest('input,textarea,[role="slider"],[role="dialog"]') || t.isContentEditable)) return
      if (e.key === ',' || e.key === '<') controller.step(e.shiftKey || e.key === '<' ? -10 : -1)
      else if (e.key === '.' || e.key === '>') controller.step(e.shiftKey || e.key === '>' ? 10 : 1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [controller])

  // The app's points are drawn only once the comparison is shown (blinding). The active point is worked
  // out from primitives here, so the memoised scene never depends on the step object.
  const activePoint = useMemo(() => (mode === 'mark' ? (chosen ?? nextPointOf(stepById(stepId), draft)) : null), [mode, chosen, stepId, draft])
  const shownApp = mode === 'result' ? app.points : null
  const scene = useCallback((f: number) => checkScene({ frame: f, draft, active: activePoint, app: shownApp }), [draft, activePoint, shownApp])

  const save = async () => {
    setSaving(true)
    try {
      const a = toAnnotation(draft, {
        serveId: serve.id,
        sessionId: session.id,
        videoId: serve.videoId,
        initials: annotator.initials,
        role: annotator.role,
        captureFps: pb.video?.meta.captureFps ?? pb.timing.nominalFps,
        now: new Date().toISOString(),
        previous: existing,
        subjectCode: studyCode || undefined,
      })
      await saveCheck(a)
      setSaved(a)
      setMode('result')
      // The comparison starts at its summary, not wherever the marks list was scrolled to.
      window.scrollTo({ top: 0 })
    } finally {
      setSaving(false)
    }
  }

  const index = serves.findIndex((s) => s.id === serve.id)
  const next = index >= 0 ? serves[index + 1] : undefined

  // The frame each result row is best seen on: the person's own mark.
  const frameFor = (row: AgreementRow): number | null => {
    const ev = existing?.events
    const pt = existing?.points
    switch (row.id) {
      case 'event:tossRelease':
        return ev?.tossRelease?.frameIndex ?? null
      case 'event:tossApex':
      case 'metric:toss-apex-height':
      case 'metric:toss-forward':
        return ev?.tossApex?.frameIndex ?? pt?.ballAtApex?.frameIndex ?? null
      case 'event:contact':
      case 'metric:contact-height-ratio':
      case 'metric:contact-forward':
      case 'metric:toss-drop':
        return ev?.contact?.frameIndex ?? pt?.ballAtContact?.frameIndex ?? null
      case 'event:landing':
      case 'metric:landing-distance':
        return ev?.landing?.frameIndex ?? pt?.frontToeLanding?.frameIndex ?? null
      case 'metric:rhythm-release-to-contact':
        return ev?.tossRelease?.frameIndex ?? null
      case 'event:trophy':
      case 'metric:shoulder-tilt-trophy':
        return ev?.trophy?.frameIndex ?? pt?.shoulderFrontTrophy?.frameIndex ?? null
      case 'event:lowestHip':
      case 'metric:drive-time':
        return ev?.lowestHip?.frameIndex ?? pt?.midHipLowest?.frameIndex ?? null
      case 'metric:leg-drive':
        return pt?.midHipContact?.frameIndex ?? ev?.contact?.frameIndex ?? null
      case 'metric:loading-depth':
        return pt?.midHipLowest?.frameIndex ?? ev?.lowestHip?.frameIndex ?? null
      case 'scale:standing':
        return pt?.headTopSetup?.frameIndex ?? null
      default:
        return null
    }
  }

  const scrubMarks = useMemo(
    () => [
      ...Object.entries(draft.events).map(([k, e]) => ({ frame: e!.frameIndex, label: EVENT_LABEL[k as keyof typeof EVENT_LABEL] ?? k })),
      ...(draft.points.headTopSetup ? [{ frame: draft.points.headTopSetup.frameIndex, label: 'Height' }] : []),
    ],
    [draft],
  )

  const { done, total } = progress(draft)
  const topLeft = (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-(--overlay-label-bg) px-3 text-footnote font-label whitespace-nowrap text-(--overlay-line)">
      <CrosshairSimpleIcon size={16} aria-hidden="true" />
      {mode === 'result'
        ? 'App vs you'
        : target
          ? `Tap: ${step.points.find((p) => p.id === target)?.label}`
          : stepDone(step, draft)
            ? `${step.title} marked`
            : step.event
              ? 'Find the frame'
              : step.title}
    </span>
  )
  const zoomPill = portrait ? (
    <button
      type="button"
      onClick={() => setZoom(zoom === 'fit' ? 'player' : 'fit')}
      aria-pressed={zoom === 'player'}
      disabled={!pb.standing || !pb.bodyHeightNorm}
      className="relative inline-flex h-11 items-center gap-1.5 rounded-full bg-(--overlay-label-bg) px-3.5 text-footnote font-label text-(--overlay-line) hover:underline hover:underline-offset-[3px] disabled:opacity-50"
    >
      {zoom === 'fit' ? <CornersOutIcon size={18} aria-hidden="true" /> : <CornersInIcon size={18} aria-hidden="true" />}
      {zoom === 'fit' ? 'Zoom to you' : 'Whole frame'}
    </button>
  ) : null

  return (
    <div className="flex min-h-[100dvh] flex-col bg-bg" data-check-serve data-mode={mode}>
      <AppBar title={title} back={back} />
      {session.isDemo ? <SampleBanner /> : null}
      <div className="flex flex-col gap-2 pb-6">
        <div ref={pinRef} className={`z-(--z-sticky) flex flex-col gap-2 bg-bg pb-1 ${pinned ? PINNED : ''}`}>
          <VideoStage
            clip={clip}
            height={portrait ? PORTRAIT_BOX : LANDSCAPE_BOX}
            region={region}
            src={pb.videoUrl ?? undefined}
            videoRef={attach}
            store={store}
            scene={scene}
            labels={false}
            topLeft={topLeft}
            bottomRight={zoomPill}
            onPick={onPick}
            onBoxKeyDown={onBoxKeyDown}
            renderLayer={(view) => (loupe ? <Loupe video={videoNode} at={loupe} frame={frame} view={view} /> : null)}
            label={
              mode === 'mark'
                ? `Serve ${serve.index} video for marking. ${target ? `Tap to mark: ${step.points.find((p) => p.id === target)?.label}. Arrow keys move the mark.` : 'Use Mark frame for this step.'}`
                : `Serve ${serve.index} video with your marks and the app's points.`
            }
          />
          <p className="sr-only" aria-live="polite">
            {announce}
          </p>
          <FrameScrubber
            store={store}
            window={win}
            timing={pb.timing}
            onSeek={seek}
            onScrub={(active) => active && controller.pause()}
            marks={scrubMarks}
            caption={mode === 'mark' ? `${done} of ${total} marked` : undefined}
          />
          <TransportRow store={store} onStep={stepBy} onToggle={controller.toggle} onRate={controller.setRate} onBigStep={stepBy} />
        </div>

        {mode === 'mark' ? (
          <>
            <MarkPanel
              draft={draft}
              step={step}
              onStep={goStep}
              target={target}
              onTarget={setChosen}
              frame={playing ? null : frame}
              onMarkFrame={() => {
                if (!step.event) return
                const f = store.getState().frame
                setDraft((d) => setEvent(d, step.event!, f))
                setAnnounce(`${step.title} marked on frame ${f}.`)
              }}
              onSure={(sure) => step.event && setDraft((d) => setSure(d, step.event!, sure))}
              onClear={() => {
                setDraft((d) => clearStep(d, step))
                setChosen(null)
              }}
              onRadar={(radar) => setDraft((d) => ({ ...d, radar }))}
              onGoToFrame={seek}
            />
            <div className="gutter flex flex-col gap-1 border-t border-line pt-3">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1.5 text-footnote text-ink-2">
                  <UserIcon size={16} aria-hidden="true" className="shrink-0" />
                  <span className="truncate">
                    Marked by: {annotatorLabel(annotator)}
                    {studyCode ? ` · Player ${studyCode}` : ''}
                  </span>
                </span>
                <Button variant="tertiary" aria-label="Change who is marking" onClick={() => setWhoOpen(true)}>
                  Change
                </Button>
              </div>
              <p className="text-footnote text-ink-3">
                {revealed ? "You've seen the app's values for this serve. Changed marks are kept out of the blind set." : "The app's answers stay hidden until you save."}
              </p>
            </div>
          </>
        ) : (
          <>
            <AgreementPanel
              agreement={agreement}
              frameFor={frameFor}
              onSeek={seek}
              speed={usableSpeed}
              heightDefault={pb.video?.capture.playerHeightSource === 'default'}
              heightM={heightM}
              othersCount={others}
              blind={existing?.blind ?? true}
            />
            <div className="gutter flex flex-wrap gap-3 pt-2">
              <Button
                variant="secondary"
                compact
                fullWidth={false}
                onClick={() => {
                  setMode('mark')
                  goStep('standing')
                }}
              >
                Edit marks
              </Button>
              <Button variant="secondary" compact fullWidth={false} onClick={() => setExportOpen(true)}>
                Export checks
              </Button>
            </div>
          </>
        )}
      </div>
      <BottomActionBar>
        {mode === 'mark' ? (
          <>
            <Button disabled={!hasAnyMark(draft)} loading={saving} onClick={() => void save()}>
              Save check
            </Button>
            {!hasAnyMark(draft) ? <p className="text-center text-footnote text-ink-3">Mark at least one frame or point to save.</p> : null}
          </>
        ) : next ? (
          <Button onClick={() => navigate(`${paths.serveDetail(session.id, next.id)}?mode=check`, { replace: true })}>Next serve</Button>
        ) : (
          <Button to={back.to}>Done</Button>
        )}
      </BottomActionBar>
      <WhoSheet
        key={String(whoOpen)}
        open={whoOpen}
        onClose={() => setWhoOpen(false)}
        value={annotator}
        studyCode={studyCode}
        onSave={(a, code) => onAnnotator(a, code, existing ? null : draft)}
      />
      <ExportSheet open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  )
}

