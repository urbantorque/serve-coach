/**
 * Serve detail (DESIGN §10.7, §8.9 to §8.12; PRODUCT §6.6): evidence-first annotated playback. It
 * opens on the focus event's frame with the focus overlay; the video box keeps the clip's aspect
 * ratio (portrait clips capped at 45% of the screen, with "Zoom to you"); the phase timeline,
 * transport and overlay chips sit at a fixed y for every serve; the "This serve" drawer lists the
 * serve's values with their data states. Compare (side by side or ghost) is phase-synced. When the
 * video was deleted, playback steps through the stored key frames with overlays. "Check this serve"
 * (?mode=check, More actions) opens the annotation mode in check/CheckServeView.tsx.
 */
import {
  ArrowsLeftRightIcon,
  CornersInIcon,
  CrosshairSimpleIcon,
  CornersOutIcon,
  HardDrivesIcon,
  ProhibitIcon,
  SquaresFourIcon,
  TrashIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import type { KeyFrameEvent, MetricId } from '../../../analysis/types.ts'
import type { ServeAnalysis } from '../../../data/domain.ts'
import { useServes, useSession } from '../../../data/hooks.ts'
import {
  deleteServe as deleteServeRow,
  getTrack,
  listKeyFramesForServe,
  putServesWithTracksAndFrames,
  setServeIncluded as setServeIncludedRow,
  setTag as setTagRow,
  showToast,
  useSettingsStore,
} from '../../../data/index.ts'
import type { KeyFrameRecord, ServeTagRecord, SessionRecord } from '../../../data/records.ts'
import { deleteTag as deleteTagRow } from '../../../data/repos/tags.ts'
import { scheduleCoachingSync } from '../../../integration/schedule.ts'
import {
  AppBar,
  Button,
  DelayedSkeleton,
  EmptyState,
  OutcomeMark,
  SampleBanner,
  Sheet,
  Skeleton,
  StatusChip,
} from '../../components/index.ts'
import { cx } from '../../components/cx.ts'
import {
  buildScene,
  chipForFocus,
  createPlayhead,
  EVENT_KEY,
  KeyFrameStrip,
  OverlayChips,
  overlayUnavailableReason,
  OVERLAY_IDS,
  PhaseTimeline,
  playerRegion,
  tossPeak,
  TransportRow,
  usePlayhead,
  useVideoController,
  VideoStage,
  type NPoint,
  type OverlayId,
  type Playhead,
} from '../../components/video/index.ts'
import { OUTCOME_WORDS, REASON_FALLBACK, reasonShortForm } from '../../copy/strings.ts'
import { paths } from '../../shell/paths.ts'
import { CompareView } from './CompareView.tsx'
import { useCompareUniverse, useDecision, useExperiment, useSessionTags, useTracks } from './data.ts'
import { useAutoHide, useDevFixtures, usePlayerZoom } from './hooks.ts'
import { OverflowMenu } from './OverflowMenu.tsx'
import {
  compareTargets,
  focusInfo,
  groupServeMetrics,
  openingFrame,
  outcomeKind,
  peekMetrics,
  videoGoneLine,
  type CompareTarget,
} from './serveView.ts'
import { CheckServeView } from './check/CheckServeView.tsx'
import { StatDrawer } from './StatDrawer.tsx'
import { TagAttributes } from './TagAttributes.tsx'
import { initialTagging, tagPatch, type TagAttrs, type TagOutcome } from './tagging.ts'
import { TagPad } from './TagPad.tsx'
import { stepStill, stillFor, useServePlayback, type ServePlayback } from './useServePlayback.ts'
// Tag, include/exclude and delete change what coaching sees: re-decide the focus (D6).
const synced =
  <A extends unknown[], R>(write: (...a: A) => Promise<R>) =>
  async (...a: A): Promise<R> => {
    const r = await write(...a)
    scheduleCoachingSync()
    return r
  }
const setTag = synced(setTagRow)
const deleteTag = synced(deleteTagRow)
const setServeIncluded = synced(setServeIncludedRow)
const deleteServe = synced(deleteServeRow)


/** Portrait video box: 45% of the viewport, never taller than 693 px (DESIGN §8.11). */
export const PORTRAIT_BOX = 'min(45dvh, 693px)'
export const LANDSCAPE_BOX = 'calc(min(100vw, 560px) * 9 / 16)'

function serveTitle(serve: { index: number } | undefined, serveId: string): string {
  const n = serve?.index ?? Number(/(\d+)$/.exec(serveId)?.[1] ?? Number.NaN)
  return Number.isFinite(n) ? `Serve ${n}` : 'Serve'
}

export function ServeDetailScreen() {
  const { sessionId = '', serveId = '' } = useParams()
  const [search] = useSearchParams()
  const devLoading = useDevFixtures(sessionId)
  const session = useSession(sessionId)
  const serves = useServes(sessionId)
  const serve = serves?.find((s) => s.id === serveId)
  const decision = useDecision(sessionId)
  const tags = useSessionTags(sessionId)
  const pb = useServePlayback(serve, session)
  const title = serveTitle(serve, serveId)
  const back = { to: paths.sessionReport(sessionId), label: 'Report' }

  const loading = devLoading || session === undefined || serves === undefined || decision === undefined || tags === undefined || (serve !== undefined && pb.loading)
  if (loading) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-bg">
        <AppBar title={title} back={back} />
        <DelayedSkeleton label="Loading serve…">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[min(45dvh,380px)]" />
            <div className="gutter flex flex-col gap-3">
              <Skeleton variant="text" className="w-2/3" />
              <Skeleton className="h-2 w-full rounded-full" />
              <Skeleton className="h-12 w-full rounded-control" />
            </div>
          </div>
        </DelayedSkeleton>
      </div>
    )
  }
  if (!session || !serve) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-bg">
        <AppBar title={title} back={back} />
        <EmptyState
          icon={WarningCircleIcon}
          title="Serve not found"
          body="It may have been deleted. The session report lists the serves you have."
          action={
            <Button variant="secondary" to={back.to}>
              Back to report
            </Button>
          }
          className="mt-16"
        />
      </div>
    )
  }
  if (search.get('mode') === 'check') return <CheckServeView key={serve.id} session={session} serve={serve} serves={serves ?? []} pb={pb} />
  return <ServeDetailView key={serve.id} session={session} serve={serve} serves={serves ?? []} tags={tags ?? []} pb={pb} decision={decision ?? null} />
}

interface ViewProps {
  session: SessionRecord
  serve: ServeAnalysis
  serves: ServeAnalysis[]
  tags: ServeTagRecord[]
  pb: ServePlayback
  decision: Parameters<typeof focusInfo>[0]
}

function ServeDetailView({ session, serve, serves, tags, pb, decision }: ViewProps) {
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const experimentalOn = useSettingsStore((s) => s.experimentalMetrics)
  const experiment = useExperiment()
  const sessionTracks = useTracks(useMemo(() => serves.map((s) => s.id), [serves]))
  const focus = useMemo(() => focusInfo(decision), [decision])
  const at = search.get('at') as KeyFrameEvent | null
  const startEvent = at && at in EVENT_KEY ? at : focus.event
  const [store] = useState<Playhead>(() => createPlayhead({ frame: openingFrame(serve, startEvent) }))
  const controller = useVideoController({ store, nominalFps: pb.timing.nominalFps, window: serve.window })
  const playing = usePlayhead(store, (s) => s.playing)
  const [controlsVisible, toggleControls, pokeControls] = useAutoHide(playing)
  const [zoom, setZoom] = usePlayerZoom()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [tagOpen, setTagOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [compare, setCompare] = useState<{ target: CompareTarget; mode: 'side' | 'ghost' } | null>(null)

  const [decodeError, setDecodeError] = useState(false)
  const hasVideo = Boolean(pb.videoUrl) && !decodeError
  const stepping = !hasVideo && pb.stillFrames.length > 0
  // Follow the frame only when stepping through stills (keeps video playback cheap).
  const stillFrame = usePlayhead(store, (s) => (stepping ? s.frame : -1))
  const goneLine = decodeError ? "This video can't be played on this phone right now. Key frames are below." : videoGoneLine(pb.video)
  const tag = tags.find((t) => t.serveId === serve.id)
  const index = serves.findIndex((s) => s.id === serve.id)
  const prev = index > 0 ? serves[index - 1] : undefined
  const next = index >= 0 && index < serves.length - 1 ? serves[index + 1] : undefined

  // ---------- overlays ----------
  const data = { pose: pb.track?.pose, ball: pb.track?.ball, events: serve.events }
  const disabled = Object.fromEntries(OVERLAY_IDS.map((id) => [id, overlayUnavailableReason(id, data)])) as Record<OverlayId, string | null>
  const [overlay, setOverlay] = useState<OverlayId>(() => {
    const wanted = chipForFocus(focus.overlay)
    if (!disabled[wanted]) return wanted
    return disabled.body ? 'none' : 'body'
  })

  const peers = useMemo<NPoint[]>(() => {
    if (focus.overlay !== 'apex-scatter' || !sessionTracks) return []
    return serves
      .filter((s) => s.id !== serve.id && s.included)
      .map((s) => tossPeak(sessionTracks[s.id]?.ball))
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .map(({ x, y }) => ({ x, y }))
  }, [focus.overlay, sessionTracks, serves, serve.id])

  const scene = useCallback(
    (frame: number) =>
      buildScene({
        overlay,
        frame,
        pose: pb.track?.pose,
        ball: pb.track?.ball,
        events: serve.events,
        handedness: serve.handedness,
        standing: pb.standing,
        bodyHeightNorm: pb.bodyHeightNorm,
        aspect: pb.clip.width / pb.clip.height,
        metrics: serve.metrics,
        focus: focus.overlay,
        peers,
      }),
    [overlay, pb.track, pb.standing, pb.bodyHeightNorm, pb.clip, serve, focus.overlay, peers],
  )

  // ---------- zoom (portrait clips only) ----------
  const portrait = pb.orientation === 'portrait'
  const sessionPeakY = useMemo(() => {
    const ys = Object.values(sessionTracks ?? {})
      .map((t) => tossPeak(t.ball)?.y)
      .filter((y): y is number => typeof y === 'number')
    return ys.length ? Math.min(...ys) : null
  }, [sessionTracks])
  const region =
    portrait && zoom === 'player' && pb.standing && pb.bodyHeightNorm
      ? playerRegion({ groundY: pb.standing.groundY, bodyHeightNorm: pb.bodyHeightNorm, heightM: pb.heightM, columnX: pb.standing.columnX, peakY: sessionPeakY })
      : null

  // ---------- transport ----------
  const phaseFrames = useMemo(() => [...new Set(serve.phases.map((p) => p.keyFrame))].sort((a, b) => a - b), [serve.phases])
  const seek = (frame: number) => {
    if (hasVideo) controller.seek(frame)
    else store.setState({ frame: Math.min(serve.window.endFrame, Math.max(serve.window.startFrame, Math.round(frame))), playing: false })
  }
  const step = (delta: -1 | 1) => {
    pokeControls()
    if (hasVideo) return controller.step(delta)
    const frames = stepping ? pb.stillFrames : phaseFrames
    const f = stepStill(frames, store.getState().frame, delta)
    if (f !== null) seek(f)
  }
  const goServe = (s: ServeAnalysis | undefined) => {
    if (s) navigate(paths.serveDetail(session.id, s.id), { replace: true })
  }
  const openCheck = () => navigate(`${paths.serveDetail(session.id, serve.id)}?mode=check`)

  // Keyboard: Space plays, , and . step (the timeline has its own arrow keys).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof HTMLElement ? e.target : null
      if (t && (t.closest('input,textarea,[role="slider"],[role="dialog"],[role="menu"]') || t.isContentEditable)) return
      if (e.key === ' ' && hasVideo && t?.tagName !== 'BUTTON') {
        e.preventDefault()
        controller.toggle()
      } else if (e.key === ',') step(-1)
      else if (e.key === '.') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ---------- per-serve values ----------
  const { groups, experimental, unavailable } = groupServeMetrics(serve.metrics, serve.view, experimentalOn)
  const focusIds = focus.metricIds.filter((id) => serve.metrics[id])
  const peek = peekMetrics(serve.metrics, focus.metricIds as MetricId[], portrait ? 2 : 3)

  // ---------- compare ----------
  const universe = useCompareUniverse(pickerOpen || compare !== null)
  const targets = useMemo(
    () =>
      universe
        ? compareTargets({
            session,
            serve,
            universe,
            experiment: experiment ?? null,
            usable: (id) => universe.some((u) => u.usable.includes(id)),
          })
        : null,
    [universe, session, serve, experiment],
  )

  // ---------- actions ----------
  const toggleIncluded = async () => {
    const included = !serve.included
    await setServeIncluded(serve.id, included)
    showToast(included ? 'Serve included in your stats.' : 'Serve excluded from your stats.', {
      label: 'Undo',
      onPress: () => void setServeIncluded(serve.id, !included),
    })
  }

  const confirmDelete = async () => {
    setDeleteOpen(false)
    // Snapshot for Undo (ARCHITECTURE §8.3: the UI owns the 8 s Undo).
    const track = await getTrack(serve.id)
    const frames: KeyFrameRecord[] = []
    for (const role of ['thumb', 'evidence', 'evidence-full'] as const) frames.push(...(await listKeyFramesForServe(serve.id, role)))
    const oldTag = tag ?? null
    await deleteServe(serve.id)
    navigate(paths.sessionReport(session.id), { replace: true })
    showToast(`Serve ${serve.index} deleted.`, {
      label: 'Undo',
      onPress: () => {
        void (async () => {
          await putServesWithTracksAndFrames([serve], track ? [track] : [], frames)
          if (oldTag) await setTag(oldTag.serveId, oldTag.sessionId, oldTag)
        })()
      },
    })
  }

  const onTag = async (outcome: TagOutcome, attrs: TagAttrs) => {
    await setTag(serve.id, session.id, { ...tagPatch(outcome, attrs), via: 'serve-detail' })
    setTagOpen(false)
  }

  const kind = outcomeKind(tag?.outcome)
  const tagPill = (
    <button
      type="button"
      onClick={() => setTagOpen(true)}
      aria-label={tag?.outcome ? `Outcome: ${tag.outcome === 'unknown' ? 'not sure' : tag.outcome}, you logged. Change` : 'Tag this serve'}
      className="relative inline-flex h-8 items-center gap-1.5 rounded-full bg-(--overlay-label-bg) px-3 text-footnote font-label text-(--overlay-line) after:absolute after:-inset-1.5 hover:underline hover:underline-offset-[3px]"
    >
      {kind !== 'untagged' ? <OutcomeMark outcome={kind} size={10} /> : null}
      {kind !== 'untagged' ? OUTCOME_WORDS[kind] : tag?.outcome === 'let' ? 'Let' : 'Tag'}
    </button>
  )
  const servePill = (
    <span className="inline-flex h-8 items-center rounded-full bg-(--overlay-label-bg) px-3 text-footnote font-label whitespace-nowrap text-(--overlay-line)">
      Serve {serve.index} of {serves.length}
    </span>
  )
  const zoomPill = portrait && (hasVideo || stepping) ? (
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

  const strip = pb.thumbs ? (
    <KeyFrameStrip
      events={serve.events}
      frames={pb.thumbs}
      orientation={pb.orientation}
      store={store}
      focusEvent={focus.phase ? focus.event : null}
      pose={pb.track?.pose}
      bodyHeightNorm={pb.bodyHeightNorm}
      clip={pb.clip}
      onSelect={(f) => {
        seek(f)
        setDrawerOpen(false)
      }}
      className={portrait ? '-mx-5' : undefined}
    />
  ) : null

  const compareButton = (
    <Button variant="secondary" compact icon={ArrowsLeftRightIcon} onClick={() => setPickerOpen(true)}>
      Compare
    </Button>
  )

  const statusNotes = (
    <>
      {!serve.included ? (
        <div role="note" className="flex items-start gap-2 rounded-control bg-surface-2 p-3 text-footnote text-ink-2">
          <ProhibitIcon size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span className="flex-1">
            {serve.plausibility.hardRejects.length
              ? "Something on this serve didn't add up, so it isn't in your stats."
              : serve.exclusions.length
                ? `Excluded from your stats: ${reasonShortForm(serve.exclusions[0])}.`
                : 'Excluded from your stats.'}
          </span>
          <button type="button" onClick={() => void toggleIncluded()} className="-my-3 h-11 shrink-0 font-label text-ink underline underline-offset-[3px]">
            Include again
          </button>
        </div>
      ) : null}
      {serve.plausibility.softFlags.length ? (
        <div role="note" className="flex items-start gap-2 rounded-control bg-surface-2 p-3 text-footnote text-ink-2">
          <WarningCircleIcon size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-attention" />
          <span className="flex-1">One value on this serve looks unusual, so we're less sure of it.</span>
          <button type="button" onClick={openCheck} className="-my-3 h-11 shrink-0 font-label text-ink underline underline-offset-[3px]">
            Check this serve
          </button>
        </div>
      ) : null}
    </>
  )

  const drawerHeader = (
    <div className="flex flex-col gap-3">
      {statusNotes}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2 text-footnote font-label text-ink-3">
            Outcome {tag?.outcome ? <StatusChip status="player-entered" /> : null}
          </span>
          <span className="flex items-center gap-2 text-body text-ink">
            {kind !== 'untagged' ? <OutcomeMark outcome={kind} size={10} /> : null}
            {tag?.outcome ? (tag.outcome === 'unknown' ? 'Not sure' : tag.outcome === 'let' ? 'Let' : OUTCOME_WORDS[kind]) : 'Not tagged'}
            {tag?.serveNumber ? <span className="text-ink-2">· {tag.serveNumber === 1 ? '1st' : '2nd'} serve</span> : null}
            {tag?.side ? <span className="text-ink-2">· {tag.side === 'deuce' ? 'Deuce' : 'Ad'}</span> : null}
          </span>
          {tag?.targetZone || tag?.intendedType ? (
            <span className="text-footnote text-ink-2">
              {[tag.intendedType && `${tag.intendedType[0].toUpperCase()}${tag.intendedType.slice(1)}`, tag.targetZone && `aimed ${tag.targetZone === 'T' ? 'at the T' : tag.targetZone}`]
                .filter(Boolean)
                .join(', ')}
            </span>
          ) : null}
        </div>
        <Button variant="secondary" compact fullWidth={false} onClick={() => setTagOpen(true)}>
          {tag?.outcome ? 'Change' : 'Tag serve'}
        </Button>
      </div>
    </div>
  )

  const drawerExtras = portrait ? (
    <div className="flex flex-col gap-3">
      <span className="text-footnote font-label text-ink-3">Key frames</span>
      {strip}
      {compareButton}
    </div>
  ) : null

  const phaseReady = serve.phases.length > 0

  if (compare) {
    return (
      <CompareView
        session={session}
        serve={serve}
        pb={pb}
        store={store}
        controller={controller}
        target={compare.target}
        mode={compare.mode}
        onMode={(mode) => setCompare({ ...compare, mode })}
        onDone={() => setCompare(null)}
        overlay={overlay}
        onOverlay={setOverlay}
        disabled={disabled}
        region={region}
        zoom={portrait && zoom === 'player'}
        focusPhase={focus.phase}
      />
    )
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-bg" data-serve-detail data-orientation={pb.orientation}>
      <div inert={drawerOpen || undefined} className="flex flex-col">
        <AppBar
          title={serveTitle(serve, serve.id)}
          back={{ to: paths.sessionReport(session.id), label: 'Report' }}
          trailing={
            <OverflowMenu
              items={[
                { label: 'Compare with your best', icon: ArrowsLeftRightIcon, onSelect: () => setPickerOpen(true) },
                { label: 'Check this serve', icon: CrosshairSimpleIcon, onSelect: openCheck },
                { label: serve.included ? 'Exclude this serve' : 'Include again', icon: ProhibitIcon, onSelect: () => void toggleIncluded() },
                { label: 'Delete serve', icon: TrashIcon, destructive: true, onSelect: () => setDeleteOpen(true) },
              ]}
            />
          }
        />
        {session.isDemo ? <SampleBanner /> : null}
        <main className={cx('flex flex-col gap-2', portrait ? 'pb-44' : 'pb-56')}>
          <VideoStage
            clip={pb.clip}
            height={portrait ? PORTRAIT_BOX : LANDSCAPE_BOX}
            region={region}
            pannable={Boolean(region)}
            src={hasVideo ? (pb.videoUrl ?? undefined) : undefined}
            videoRef={controller.attach}
            onVideoError={() => setDecodeError(true)}
            still={stepping ? stillFor(pb.stillFrames, pb.stills, stillFrame) : null}
            store={store}
            scene={pb.track?.pose || pb.track?.ball ? scene : null}
            topLeft={servePill}
            topRight={tagPill}
            bottomRight={zoomPill}
            controlsVisible={controlsVisible}
            onTap={() => (hasVideo ? toggleControls() : undefined)}
            onSwipe={(dir) => goServe(dir > 0 ? next : prev)}
            label={`Serve ${serve.index} of ${serves.length}${hasVideo ? '' : ', key frames'}. Swipe to change serve.`}
          >
            {!hasVideo && !stepping ? (
              <div className="absolute inset-0 grid place-items-center p-8 text-center text-callout text-(--overlay-line)">
                <span className="flex max-w-[260px] flex-col items-center gap-2">
                  <HardDrivesIcon size={28} aria-hidden="true" />
                  {goneLine ?? REASON_FALLBACK}
                </span>
              </div>
            ) : null}
          </VideoStage>
          {stepping && goneLine ? (
            <p role="note" className="gutter flex items-center gap-2 text-footnote text-ink-2">
              <HardDrivesIcon size={16} aria-hidden="true" className="shrink-0" />
              {goneLine}
            </p>
          ) : null}
          {phaseReady ? (
            <PhaseTimeline
              store={store}
              phases={serve.phases}
              events={serve.events}
              window={serve.window}
              timing={pb.timing}
              focusPhase={focus.phase}
              onSeek={seek}
              onScrub={(active) => active && controller.pause()}
            />
          ) : (
            <p className="gutter text-footnote text-ink-3">Phases were not found on this serve.</p>
          )}
          <TransportRow
            store={store}
            onStep={step}
            onToggle={hasVideo ? () => (pokeControls(), controller.toggle()) : undefined}
            onRate={hasVideo ? controller.setRate : undefined}
            onPrevServe={prev ? () => goServe(prev) : undefined}
            onNextServe={next ? () => goServe(next) : undefined}
            playDisabledReason={hasVideo ? null : (goneLine ?? 'No video')}
            stepLabel={hasVideo ? undefined : { back: 'Previous key frame', forward: 'Next key frame' }}
          />
          {OVERLAY_IDS.some((id) => id !== 'none' && !disabled[id]) ? <OverlayChips value={overlay} onChange={setOverlay} disabled={disabled} /> : null}
          {!portrait ? (
            <div className="flex flex-col gap-3 pt-2">
              {strip}
              <div className="gutter">{compareButton}</div>
            </div>
          ) : null}
        </main>
      </div>
      <StatDrawer
        peek={peek}
        focusIds={focusIds}
        groups={groups}
        experimental={experimental}
        unavailable={unavailable}
        header={drawerHeader}
        extras={drawerExtras}
        expanded={drawerOpen}
        onExpandedChange={setDrawerOpen}
      />
      <TagSheet
        key={String(tagOpen)}
        open={tagOpen}
        onClose={() => setTagOpen(false)}
        serveIndex={serve.index}
        session={session}
        tag={tag}
        onTag={onTag}
        onClear={async () => {
          await deleteTag(serve.id)
          setTagOpen(false)
        }}
      />
      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title={`Delete serve ${serve.index}?`}>
        <div className="flex flex-col gap-4 pb-2">
          <p className="text-callout text-ink-2">
            This removes this serve's values, tracking, key frames and outcome tag. The session, its video and your other serves stay.
          </p>
          <Button variant="destructive" onClick={() => void confirmDelete()}>
            Delete serve
          </Button>
          <Button variant="tertiary" fullWidth onClick={() => setDeleteOpen(false)}>
            Keep serve
          </Button>
        </div>
      </Sheet>
      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Compare with">
        <ul className="flex flex-col gap-2 pb-2">
          {(targets ?? []).map((t) => (
            <li key={t.kind}>
              <button
                type="button"
                aria-disabled={t.reason ? true : undefined}
                onClick={() => {
                  if (t.reason) return
                  setPickerOpen(false)
                  setCompare({ target: t, mode: 'side' })
                }}
                className={cx(
                  'flex min-h-14 w-full items-center gap-3 rounded-control px-3 py-2 text-left',
                  t.reason ? 'cursor-not-allowed' : 'hover:bg-surface-2 active:bg-surface-2',
                )}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2">
                  <SquaresFourIcon size={20} aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className={cx('text-headline', t.reason ? 'text-ink-disabled' : 'text-ink')}>{t.title}</span>
                  <span className="text-footnote text-ink-2">{t.reason ?? t.pill}</span>
                </span>
              </button>
            </li>
          ))}
          {!targets ? <li className="text-footnote text-ink-3">Finding serves to compare…</li> : null}
          <li className="pt-1 text-footnote text-ink-3">We compare you with your own serves, never with a professional.</li>
        </ul>
      </Sheet>
    </div>
  )
}

function TagSheet({
  open,
  onClose,
  serveIndex,
  session,
  tag,
  onTag,
  onClear,
}: {
  open: boolean
  onClose: () => void
  serveIndex: number
  session: SessionRecord
  tag: ServeTagRecord | undefined
  onTag: (outcome: TagOutcome, attrs: TagAttrs) => Promise<void>
  onClear: () => Promise<void>
}) {
  const [attrs, setAttrs] = useState<TagAttrs>(() => ({
    ...initialTagging(session).attrs,
    ...(tag?.serveNumber ? { serveNumber: tag.serveNumber } : {}),
    ...(tag?.side ? { side: tag.side } : {}),
    ...(tag?.intendedType ? { intendedType: tag.intendedType } : {}),
    ...(tag?.targetZone ? { targetZone: tag.targetZone } : {}),
  }))
  return (
    <Sheet open={open} onClose={onClose} title={`Tag serve ${serveIndex}`}>
      <div className="flex flex-col gap-4 pb-2">
        <TagAttributes attrs={attrs} onChange={setAttrs} />
        <TagPad current={tag?.outcome} onTag={(o) => void onTag(o, attrs)} />
        <div className="flex items-center justify-center gap-6">
          <Button variant="tertiary" onClick={() => void onTag('let', attrs)}>
            Let
          </Button>
          {tag?.outcome ? (
            <Button variant="tertiary" onClick={() => void onClear()}>
              Clear tag
            </Button>
          ) : null}
        </div>
        <p className="text-footnote text-ink-3">Outcomes are what you logged. We can't see where the ball landed from the side.</p>
      </div>
    </Sheet>
  )
}
