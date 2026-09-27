/**
 * Compare (DESIGN §8.12): the player's serve beside one of their own (best serve, last session, before
 * the drill), never a professional. Side by side: two players in left and right halves (portrait
 * clips or mixed) or stacked (landscape clips), one shared timeline and transport. Ghost: the other
 * serve's skeleton, dashed, over this video, scaled by standing height and anchored at the start toe.
 * Both are phase-synced: toss release, top of swing, contact and landing coincide.
 */
import { WarningCircleIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ServePhase } from '../../../analysis/types.ts'
import { useServe, useSession } from '../../../data/hooks.ts'
import { useSettingsStore } from '../../../data/stores/settings.ts'
import type { SessionRecord } from '../../../data/records.ts'
import type { ServeAnalysis } from '../../../data/domain.ts'
import { AppBar, DelayedSkeleton, EmptyState, SegmentedControl, Skeleton } from '../../components/index.ts'
import { cx } from '../../components/cx.ts'
import {
  buildScene,
  createPlayhead,
  ghostMapper,
  OverlayChips,
  PhaseTimeline,
  phaseAt,
  playerRegion,
  tossPeak,
  secondsAfterRelease,
  syncedFrame,
  TransportRow,
  useFollowerVideo,
  usePlayhead,
  VideoStage,
  type ClipRegion,
  type GhostAnchor,
  type OverlayId,
  type Playhead,
  type VideoController,
} from '../../components/video/index.ts'
import { PHASE_LABEL } from '../../copy/strings.ts'
import { usePlusGate } from '../plan/usePlusGate.tsx'
import { sameCameraSetup, type CompareTarget } from './serveView.ts'
import { useServePlayback, type ServePlayback } from './useServePlayback.ts'

export interface CompareViewProps {
  session: SessionRecord
  serve: ServeAnalysis
  pb: ServePlayback
  store: Playhead
  controller: VideoController
  target: CompareTarget
  mode: 'side' | 'ghost'
  onMode: (mode: 'side' | 'ghost') => void
  onDone: () => void
  overlay: OverlayId
  onOverlay: (id: OverlayId) => void
  disabled: Record<OverlayId, string | null>
  region: ClipRegion | null
  /** Player zoom applies to both halves together (DESIGN §8.12). */
  zoom: boolean
  focusPhase: ServePhase | null
}

function anchorOf(pb: Pick<ServePlayback, 'standing' | 'bodyHeightNorm' | 'clip'>): GhostAnchor | null {
  if (!pb.standing || !pb.bodyHeightNorm) return null
  return { toe: pb.standing.toe ?? { x: pb.standing.columnX, y: pb.standing.groundY }, bodyHeightNorm: pb.bodyHeightNorm, clip: pb.clip }
}

export function CompareView(props: CompareViewProps) {
  const { target } = props
  const other = useServe(target.serveId)
  const otherSession = useSession(target.sessionId)
  const otherPb = useServePlayback(other ?? undefined, otherSession ?? undefined)
  const bar = (
    <AppBar
      title="Compare"
      leading={<span />}
      trailing={
        <button type="button" onClick={props.onDone} className="-mr-2 h-11 rounded-control px-2 text-headline text-ink active:bg-surface-2">
          Done
        </button>
      }
    />
  )
  if (other === undefined || otherSession === undefined || (other && otherPb.loading)) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-bg">
        {bar}
        <DelayedSkeleton label="Loading the other serve…">
          <Skeleton className="mx-5 h-80" />
        </DelayedSkeleton>
      </div>
    )
  }
  if (!other || !otherSession) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-bg">
        {bar}
        <EmptyState icon={WarningCircleIcon} title="That serve is gone" body="It may have been deleted. Pick another serve to compare with." className="mt-16" />
      </div>
    )
  }
  return <CompareLoaded {...props} bar={bar} other={other} otherSession={otherSession} otherPb={otherPb} />
}

function CompareLoaded({
  session,
  serve,
  pb,
  store,
  controller,
  target,
  mode: requestedMode,
  onMode,
  overlay,
  onOverlay,
  disabled,
  region,
  zoom,
  focusPhase,
  bar,
  other,
  otherSession,
  otherPb,
}: CompareViewProps & { bar: ReactNode; other: ServeAnalysis; otherSession: SessionRecord; otherPb: ServePlayback }) {
  // T3 (PRODUCT §6.15): the ghost overlay is Plus; side by side stays free.
  const gate = usePlusGate('ghost-compare')
  const mode = requestedMode === 'ghost' && gate.ready && !gate.plus ? 'side' : requestedMode
  const [videoGhost, setVideoGhost] = useState(false)
  const [otherStore] = useState<Playhead>(() => createPlayhead())
  const map = useCallback(
    (frame: number) =>
      syncedFrame(frame, { timing: pb.timing, events: serve.events }, { timing: otherPb.timing, events: other.events, window: other.window }),
    [pb.timing, serve.events, otherPb.timing, other.events, other.window],
  )
  useEffect(() => {
    otherStore.setState({ frame: map(store.getState().frame) })
    return store.subscribe((s, prev) => {
      if (s.frame !== prev.frame) otherStore.setState({ frame: map(s.frame) })
    })
  }, [store, otherStore, map])
  const followerRef = useFollowerVideo(map, store, otherPb.timing.nominalFps)

  const hasVideo = Boolean(pb.videoUrl)
  const sameSetup = sameCameraSetup(session, otherSession)
  const differentSpots = !sameSetup || pb.orientation !== otherPb.orientation
  const canVideoGhost = sameSetup && Boolean(otherPb.videoUrl) && hasVideo

  const ghostMap = useMemo(() => {
    const cur = anchorOf({ standing: pb.standing, bodyHeightNorm: pb.bodyHeightNorm, clip: pb.clip })
    const oth = anchorOf({ standing: otherPb.standing, bodyHeightNorm: otherPb.bodyHeightNorm, clip: otherPb.clip })
    return cur && oth ? ghostMapper(cur, oth) : null
  }, [pb.standing, pb.bodyHeightNorm, pb.clip, otherPb.standing, otherPb.bodyHeightNorm, otherPb.clip])

  // Experimental numbers stay off the video unless the toggle is on (D2).
  const experimentalOn = useSettingsStore((s) => s.experimentalMetrics)
  const sceneCurrent = useCallback(
    (f: number) =>
      buildScene({
        overlay,
        frame: f,
        pose: pb.track?.pose,
        ball: pb.track?.ball,
        events: serve.events,
        handedness: serve.handedness,
        standing: pb.standing,
        bodyHeightNorm: pb.bodyHeightNorm,
        aspect: pb.clip.width / pb.clip.height,
        metrics: serve.metrics,
        ghost: mode === 'ghost' && ghostMap && otherPb.track?.pose ? { pose: otherPb.track.pose, frame: map(f), map: ghostMap } : null,
        experimentalOn,
      }),
    [overlay, pb.track, pb.standing, pb.bodyHeightNorm, pb.clip, serve, mode, ghostMap, otherPb.track, map, experimentalOn],
  )
  const sceneOther = useCallback(
    (f: number) =>
      buildScene({
        overlay,
        frame: f,
        pose: otherPb.track?.pose,
        ball: otherPb.track?.ball,
        events: other.events,
        handedness: other.handedness,
        standing: otherPb.standing,
        bodyHeightNorm: otherPb.bodyHeightNorm,
        aspect: otherPb.clip.width / otherPb.clip.height,
        metrics: other.metrics,
        experimentalOn,
      }),
    [overlay, otherPb.track, otherPb.standing, otherPb.bodyHeightNorm, otherPb.clip, other, experimentalOn],
  )

  const otherPeak = tossPeak(otherPb.track?.ball)?.y ?? null
  const otherRegion =
    zoom && otherPb.orientation === 'portrait' && otherPb.standing && otherPb.bodyHeightNorm
      ? playerRegion({ groundY: otherPb.standing.groundY, bodyHeightNorm: otherPb.bodyHeightNorm, heightM: otherPb.heightM, columnX: otherPb.standing.columnX, peakY: otherPeak })
      : null
  const bothLandscape = pb.orientation === 'landscape' && otherPb.orientation === 'landscape'
  const pill = (text: string) => (
    <span className="inline-flex h-7 max-w-full items-center truncate rounded-full bg-(--overlay-label-bg) px-2.5 text-footnote font-label text-(--overlay-line)">{text}</span>
  )
  const stageHeight = bothLandscape ? 'calc(min(100vw, 560px) * 9 / 16)' : 'min(40dvh, 332px)'
  const legend =
    mode === 'ghost'
      ? `Solid: today · Dashed: ${target.legend}`
      : bothLandscape
        ? `Top: today · Bottom: ${target.legend}`
        : `Left: today · Right: ${target.legend}`

  return (
    <div className="flex min-h-[100dvh] flex-col bg-bg" data-compare={mode}>
      {bar}
      <div className="flex flex-col gap-2 pb-8">
        <div className="gutter">
          <SegmentedControl
            label="Compare view"
            options={[
              { value: 'side', label: 'Side by side' },
              { value: 'ghost', label: gate.plus ? 'Ghost' : 'Ghost (Plus)' },
            ]}
            value={mode}
            onChange={(m) => (m === 'ghost' ? gate.request(() => onMode('ghost')) : onMode(m))}
          />
        </div>
        {gate.sheet}
        {mode === 'side' ? (
          <div className={cx(bothLandscape ? 'flex flex-col gap-2' : 'grid grid-cols-2 gap-4')}>
            <VideoStage
              clip={pb.clip}
              height={stageHeight}
              region={region}
              src={pb.videoUrl ?? undefined}
              videoRef={controller.attach}
              store={store}
              scene={pb.track ? sceneCurrent : null}
              labels={bothLandscape}
              topLeft={pill(`Today, serve ${serve.index}`)}
              label={`Today, serve ${serve.index}`}
            />
            <VideoStage
              clip={otherPb.clip}
              height={stageHeight}
              region={otherRegion}
              labels={bothLandscape}
              src={otherPb.videoUrl ?? undefined}
              videoRef={followerRef}
              store={otherStore}
              scene={otherPb.track ? sceneOther : null}
              topLeft={pill(target.pill)}
              label={target.pill}
            />
          </div>
        ) : (
          <VideoStage
            clip={pb.clip}
            height={pb.orientation === 'portrait' ? 'min(45dvh, 693px)' : 'calc(min(100vw, 560px) * 9 / 16)'}
            region={region}
            pannable={Boolean(region)}
            src={pb.videoUrl ?? undefined}
            videoRef={controller.attach}
            ghostSrc={videoGhost && canVideoGhost ? (otherPb.videoUrl ?? undefined) : undefined}
            ghostRef={followerRef}
            store={store}
            scene={pb.track ? sceneCurrent : null}
            topLeft={pill(`Today, serve ${serve.index}`)}
            label={`Today, serve ${serve.index}, with ${target.legend} as a ghost`}
          />
        )}
        <CompareReadout store={store} otherStore={otherStore} serve={serve} other={other} pb={pb} otherPb={otherPb} />
        {differentSpots ? <p className="gutter text-footnote text-ink-3">Filmed from different spots, so positions may not line up exactly.</p> : null}
        <PhaseTimeline
          store={store}
          phases={serve.phases}
          events={serve.events}
          window={serve.window}
          timing={pb.timing}
          focusPhase={focusPhase}
          onSeek={(f) => (hasVideo ? controller.seek(f) : store.setState({ frame: f }))}
          onScrub={(active) => active && controller.pause()}
        />
        <TransportRow
          store={store}
          onStep={(d) => (hasVideo ? controller.step(d) : store.setState({ frame: store.getState().frame + d }))}
          onToggle={hasVideo ? controller.toggle : undefined}
          onRate={hasVideo ? controller.setRate : undefined}
          playDisabledReason={hasVideo ? null : 'No video'}
        />
        <OverlayChips value={overlay} onChange={onOverlay} disabled={disabled} legend={legend} />
        {mode === 'ghost' ? (
          <div className="gutter flex flex-col gap-1">
            <button
              type="button"
              aria-pressed={videoGhost && canVideoGhost}
              aria-disabled={!canVideoGhost || undefined}
              aria-describedby={!canVideoGhost ? 'video-ghost-why' : undefined}
              onClick={() => canVideoGhost && setVideoGhost((v) => !v)}
              className={cx(
                'relative inline-flex h-9 w-fit items-center gap-1.5 rounded-full px-3.5 text-subhead after:absolute after:inset-x-0 after:-inset-y-1',
                !canVideoGhost
                  ? 'border-token border-dashed border-line text-ink-disabled'
                  : videoGhost
                    ? 'bg-ink font-label text-ink-inverse'
                    : 'border-token border-line-strong text-ink hover:bg-surface-2',
              )}
            >
              Show video ghost
            </button>
            {!canVideoGhost ? (
              <span id="video-ghost-why" className="text-footnote text-ink-3">
                {otherPb.videoUrl ? 'Different camera position' : 'No video for the other serve'}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** "Contact: 0.92 s vs 0.88 s after release": both clips' real times (DESIGN §8.12). */
function CompareReadout({
  store,
  otherStore,
  serve,
  other,
  pb,
  otherPb,
}: {
  store: Playhead
  otherStore: Playhead
  serve: ServeAnalysis
  other: ServeAnalysis
  pb: ServePlayback
  otherPb: ServePlayback
}) {
  const frame = usePlayhead(store, (s) => s.frame)
  const otherFrame = usePlayhead(otherStore, (s) => s.frame)
  const phase = phaseAt(serve.phases, frame)
  const tA = secondsAfterRelease(frame, pb.timing, serve.events)
  const tB = secondsAfterRelease(otherFrame, otherPb.timing, other.events)
  const fmt = (t: number) => `${Math.abs(t).toFixed(2)} s ${t < 0 ? 'before' : 'after'}`
  const name = phase ? PHASE_LABEL[phase.phase] : 'Serve'
  const text = tA !== null && tB !== null ? `${name}: ${fmt(tA)} vs ${fmt(tB)} release` : name
  return <p className="gutter text-footnote tabular-nums text-ink-2">{text}</p>
}
