/**
 * Tagging (DESIGN §10.8, §8.14; PRODUCT §6.7, §7.3): in, net, long or wide in under 2 s a serve, one
 * thumb. The video box is a fixed 390 × 219 for both clip orientations (a portrait clip is cropped to
 * the player, from below the feet to above the session's highest toss), so the pad sits at the same y
 * on every serve. The clip plays once from toss release to 1.5 s after contact and holds (reduced
 * motion: it opens paused on contact). Serve number, side, target and type are sticky for the rest of
 * the block. Every tag is player-entered and saved on tap. A session tally is the alternative.
 */
import { ArrowCounterClockwiseIcon, CheckCircleIcon, MinusIcon, PlusIcon, XIcon } from '@phosphor-icons/react'
import { useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import type { MetricValue as MetricValueData, ServeNumber } from '../../../analysis/types.ts'
import type { ServeAnalysis } from '../../../data/domain.ts'
import { useServes, useSession, useTally } from '../../../data/hooks.ts'
import { deleteTag as deleteTagRow, setTag as setTagRow, setTally as setTallyRow } from '../../../data/index.ts'
import { scheduleCoachingSync } from '../../../integration/schedule.ts'
import type { ServeTagRecord, SessionRecord, TallyCounts } from '../../../data/records.ts'
import {
  AppBar,
  Button,
  DelayedSkeleton,
  EmptyState,
  IconButton,
  MetricValue,
  OutcomeMark,
  SampleBanner,
  SegmentedControl,
  Sheet,
  Skeleton,
  StatusChip,
} from '../../components/index.ts'
import { cx } from '../../components/cx.ts'
import { createPlayhead, playerRegion, tossPeak, useVideoController, VideoStage, type Playhead } from '../../components/video/index.ts'
import { paths } from '../../shell/paths.ts'
import { useSessionTags, useTracks } from './data.ts'
import { useDevFixtures } from './hooks.ts'
import { outcomeKind } from './serveView.ts'
import { TagAttributes } from './TagAttributes.tsx'
import {
  afterSkip,
  afterTag,
  afterUndo,
  announce,
  countTags,
  faultWords,
  goTo,
  initialTagging,
  resumeIndex,
  tagPatch,
  tallyConflict,
  type TaggingState,
  type TagOutcome,
} from './tagging.ts'
import { TagPad } from './TagPad.tsx'
import { useServePlayback } from './useServePlayback.ts'

// Every tag or tally change re-decides the coaching focus (D6), debounced while tagging.
const setTag: typeof setTagRow = async (...a) => {
  const r = await setTagRow(...a)
  scheduleCoachingSync()
  return r
}
const deleteTag: typeof deleteTagRow = async (...a) => {
  await deleteTagRow(...a)
  scheduleCoachingSync()
}
const setTally: typeof setTallyRow = async (...a) => {
  await setTallyRow(...a)
  scheduleCoachingSync()
}

/** Fixed Tagging video box (DESIGN §10.8): 219 px tall for either orientation. */
export const TAGGING_BOX_H = 219

export function TaggingScreen() {
  const { sessionId = '' } = useParams()
  const devLoading = useDevFixtures(sessionId)
  const session = useSession(sessionId)
  const serves = useServes(sessionId)
  const tags = useSessionTags(sessionId)
  const exit = paths.sessionReport(sessionId)
  const close = <IconButton icon={XIcon} label="Save and exit" to={exit} />

  if (devLoading || session === undefined || serves === undefined || tags === undefined) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-bg">
        <AppBar title="Tag serves" leading={close} />
        <DelayedSkeleton label="Loading serves…">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[219px]" />
            <div className="gutter grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-22 rounded-control" />
              ))}
            </div>
          </div>
        </DelayedSkeleton>
      </div>
    )
  }
  if (!session || !serves?.length) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-bg">
        <AppBar title="Tag serves" leading={close} />
        <EmptyState
          icon={CheckCircleIcon}
          title={session ? 'No serves to tag' : 'Session not found'}
          body={session ? 'We did not find serves in this session.' : 'It may have been deleted. Your other sessions are in the Sessions tab.'}
          action={
            <Button variant="secondary" to={session ? exit : paths.sessions()}>
              {session ? 'Back to report' : 'Go to Sessions'}
            </Button>
          }
          className="mt-16"
        />
      </div>
    )
  }
  return <Tagging session={session} serves={serves} tags={tags ?? []} />
}

function Tagging({ session, serves, tags }: { session: SessionRecord; serves: ServeAnalysis[]; tags: ServeTagRecord[] }) {
  const navigate = useNavigate()
  const reduce = useReducedMotion() ?? false
  const serveIds = useMemo(() => serves.map((s) => s.id), [serves])
  const [state, setState] = useState<TaggingState>(() => initialTagging(session, resumeIndex(serveIds, tags)))
  const [mode, setMode] = useState<'serves' | 'tally'>('serves')
  const [spoken, setSpoken] = useState('')
  const [summaryOpen, setSummaryOpen] = useState(false)
  const serve = serves[Math.min(state.index, serves.length - 1)]
  const tag = tags.find((t) => t.serveId === serve.id)
  const counts = countTags(serveIds, tags)
  const tracks = useTracks(serveIds)
  const sessionPeakY = useMemo(() => {
    const ys = Object.values(tracks ?? {})
      .map((t) => tossPeak(t.ball)?.y)
      .filter((y): y is number => typeof y === 'number')
    return ys.length ? Math.min(...ys) : null
  }, [tracks])

  const doTag = useCallback(
    async (outcome: TagOutcome) => {
      const previous = tags.find((t) => t.serveId === serve.id) ?? null
      await setTag(serve.id, session.id, tagPatch(outcome, state.attrs))
      const next = afterTag(state, serveIds, outcome, previous)
      setSpoken(announce(state.index, outcome, serveIds.length, next.finished))
      setState(next)
      if (next.finished) setSummaryOpen(true)
    },
    [tags, serve.id, session.id, state, serveIds],
  )

  const undo = useCallback(async () => {
    const { state: next, entry } = afterUndo(state)
    if (!entry) return
    if (entry.previous) await setTag(entry.serveId, session.id, entry.previous)
    else await deleteTag(entry.serveId)
    setSpoken(`Undone. Serve ${entry.index + 1} of ${serveIds.length}.`)
    setState(next)
    setSummaryOpen(false)
  }, [state, session.id, serveIds.length])

  const skip = () => {
    const next = afterSkip(state, serveIds.length)
    setState(next)
    if (next.finished) setSummaryOpen(true)
  }
  const go = (i: number) => setState((s) => goTo(s, i, serveIds.length))

  // Keyboard (DESIGN §8.14): I, N, L, W; Space = replay; Z = undo; arrows = previous / next serve.
  const replayRef = useRef<() => void>(() => undefined)
  useEffect(() => {
    if (mode !== 'serves') return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof HTMLElement ? e.target : null
      if (e.metaKey || e.ctrlKey || e.altKey || (t && t.closest('input,textarea,[role="dialog"],[role="radiogroup"]'))) return
      const k = e.key.toLowerCase()
      const map: Record<string, TagOutcome> = { i: 'in', n: 'net', l: 'long', w: 'wide' }
      if (map[k]) {
        e.preventDefault()
        void doTag(map[k])
      } else if (k === 'z') {
        e.preventDefault()
        void undo()
      } else if (k === ' ' && t?.tagName !== 'BUTTON') {
        e.preventDefault()
        replayRef.current()
      } else if (k === 'arrowright') go(state.index + 1)
      else if (k === 'arrowleft') go(state.index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const hasTarget = Boolean(session.defaultTarget) || tags.some((t) => t.targetZone)
  const title = mode === 'tally' ? 'Session tally' : 'Tag serves'

  return (
    <div className="flex min-h-[100dvh] flex-col bg-bg" data-tagging={mode}>
      <AppBar
        title={title}
        leading={<IconButton icon={XIcon} label="Save and exit" to={paths.sessionReport(session.id)} />}
        trailing={
          mode === 'serves' ? (
            <span className="text-right text-subhead tabular-nums text-ink-2 [text-wrap:balance]" aria-label={`Serve ${state.index + 1} of ${serves.length}`}>
              {state.index + 1} of {serves.length}
            </span>
          ) : undefined
        }
      />
      {session.isDemo ? <SampleBanner /> : null}
      <p className="sr-only" role="status" aria-live="polite">
        {spoken}
      </p>
      {mode === 'serves' ? (
        <div className="flex flex-col pb-[max(32px,env(safe-area-inset-bottom))]">
          <TagVideo
            key={serve.id}
            session={session}
            serve={serve}
            count={serves.length}
            reduce={reduce}
            sessionPeakY={sessionPeakY}
            onSwipe={(d) => go(state.index + d)}
            replayRef={replayRef}
          />
          <ProgressMarks serveIds={serveIds} tags={tags} current={state.index} />
          <div className="gutter flex flex-col gap-3">
            <div className="flex flex-col">
              <TagAttributes attrs={state.attrs} onChange={(attrs) => setState((s) => ({ ...s, attrs }))} showTarget showType />
              {/* min-h, not h: at 200% text the hint wraps and must push the pad down (finding 74). */}
              <p className="min-h-5 text-footnote text-ink-3" data-block-hint>
                {state.pointPlay ? "We'll switch between first and second serves for you." : 'Applies to the rest of this block.'}
                {!hasTarget ? <span className="sr-only"> Target is optional.</span> : null}
              </p>
            </div>
            <TagPad current={tag?.outcome} onTag={(o) => void doTag(o)} />
            <div className="flex h-11 items-center justify-around">
              <Button variant="tertiary" onClick={() => void doTag('let')}>
                Let
              </Button>
              <Button variant="tertiary" onClick={skip}>
                Skip
              </Button>
              <Button variant="tertiary" icon={ArrowCounterClockwiseIcon} disabled={!state.undo.length} onClick={() => void undo()}>
                Undo
              </Button>
            </div>
            <div className="flex justify-center">
              <Button variant="tertiary" onClick={() => setMode('tally')}>
                Use a tally instead
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <TallyPanel session={session} serveCount={serves.length} counts={counts} onDone={() => navigate(paths.sessionReport(session.id))} onBack={() => setMode('serves')} />
      )}
      <Sheet open={summaryOpen} onClose={() => setSummaryOpen(false)} title={`Tagged ${counts.tagged} of ${counts.total} ${counts.total === 1 ? 'serve' : 'serves'}`}>
        <div className="flex flex-col gap-4 pb-2">
          <SummaryLine counts={counts} />
          <Button onClick={() => navigate(paths.sessionReport(session.id))}>Done</Button>
          <Button
            variant="tertiary"
            fullWidth
            onClick={() => {
              setSummaryOpen(false)
              go(0)
            }}
          >
            Review tags
          </Button>
        </div>
      </Sheet>
    </div>
  )
}

/** "8 of 15 in. 3 net, 3 long, 1 wide." with the You logged chip (player-entered, D3). */
export function SummaryLine({ counts }: { counts: ReturnType<typeof countTags> }) {
  const n = counts.tagged - counts.let
  const value: MetricValueData = {
    id: 'serve-in-rate',
    value: n > 0 ? counts.in / n : 0,
    unit: 'k-of-n',
    status: 'player-entered',
    confidence: 1,
    basis: 'Your tags',
    n,
    secondary: { k: counts.in },
    provenance: 'from-your-tags',
  }
  const faults = faultWords(counts)
  return (
    <div className="flex flex-col gap-1">
      <MetricValue metricId="serve-in-rate" value={value} size="metric" />
      {faults ? <p className="text-callout text-ink-2">{faults.charAt(0).toUpperCase() + faults.slice(1)}.</p> : null}
      {counts.let ? <p className="text-footnote text-ink-3">{counts.let === 1 ? '1 let (not counted).' : `${counts.let} lets (not counted).`}</p> : null}
    </div>
  )
}

function ProgressMarks({ serveIds, tags, current }: { serveIds: string[]; tags: ServeTagRecord[]; current: number }) {
  const by = new Map(tags.map((t) => [t.serveId, t.outcome]))
  const tagged = serveIds.filter((id) => by.get(id) && by.get(id) !== 'unknown').length
  return (
    <div className="gutter flex h-[46px] items-center">
      <ol aria-label={`${tagged} of ${serveIds.length} serves tagged`} className="flex flex-wrap items-center">
        {serveIds.map((id, i) => {
          const o = by.get(id)
          const kind = outcomeKind(o)
          return (
            <li
              key={id}
              aria-hidden="true"
              className={cx('grid size-[22px] place-items-center rounded-full', i === current && 'outline-2 outline-offset-[-1px] outline-ink')}
            >
              {kind !== 'untagged' ? (
                <OutcomeMark outcome={kind} size={10} />
              ) : o === 'let' ? (
                <span className="text-caption text-ink-3">L</span>
              ) : (
                <span className="size-2.5 rounded-full border-2 border-line-strong" />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** The serve's clip in the fixed 219 px box: plays once from release to 1.5 s after contact, then holds. */
function TagVideo({
  session,
  serve,
  count,
  reduce,
  sessionPeakY,
  onSwipe,
  replayRef,
}: {
  session: SessionRecord
  serve: ServeAnalysis
  count: number
  reduce: boolean
  sessionPeakY: number | null
  onSwipe: (d: 1 | -1) => void
  replayRef: { current: () => void }
}) {
  const pb = useServePlayback(serve, session)
  const fps = pb.timing.nominalFps
  const release = serve.events.tossRelease?.frameIndex ?? serve.window.startFrame
  const contact = serve.events.contact?.frameIndex ?? Math.round((serve.window.startFrame + serve.window.endFrame) / 2)
  const stopAt = Math.min(serve.window.endFrame, contact + Math.round((1.5 / pb.timing.timeScale) * fps))
  const [store] = useState<Playhead>(() => createPlayhead({ frame: reduce ? contact : release }))
  const controller = useVideoController({ store, nominalFps: fps, window: serve.window, stopAt })
  const started = useRef(false)

  const replay = useCallback(() => {
    controller.seek(release)
    controller.play()
  }, [controller, release])
  useEffect(() => {
    replayRef.current = replay
  }, [replay, replayRef])

  // Play once on open (reduced motion: stay on the contact frame; the player taps Replay).
  useEffect(() => {
    if (!pb.videoUrl || started.current || reduce) return
    started.current = true
    const t = window.setTimeout(() => {
      controller.seek(release)
      controller.play()
    }, 300)
    return () => window.clearTimeout(t)
  }, [pb.videoUrl, reduce, controller, release])

  const region =
    pb.orientation === 'portrait' && pb.standing && pb.bodyHeightNorm
      ? playerRegion({ groundY: pb.standing.groundY, bodyHeightNorm: pb.bodyHeightNorm, heightM: pb.heightM, columnX: pb.standing.columnX, peakY: sessionPeakY })
      : null
  const still = !pb.videoUrl ? (pb.stills.get(contact) ?? [...pb.stills.values()][0] ?? null) : null

  return (
    <VideoStage
      clip={pb.clip}
      height={TAGGING_BOX_H}
      region={region}
      src={pb.videoUrl ?? undefined}
      videoRef={controller.attach}
      still={still}
      store={store}
      onSwipe={onSwipe}
      topLeft={
        <span className="inline-flex h-8 items-center rounded-full bg-(--overlay-label-bg) px-3 text-footnote font-label text-(--overlay-line)">
          Serve {serve.index} of {count}
        </span>
      }
      bottomRight={
        pb.videoUrl ? (
          <button
            type="button"
            onClick={replay}
            aria-keyshortcuts="Space"
            className="relative inline-flex h-11 items-center gap-1.5 rounded-full bg-(--overlay-label-bg) px-3.5 text-footnote font-label text-(--overlay-line) hover:underline hover:underline-offset-[3px]"
          >
            <ArrowCounterClockwiseIcon size={18} aria-hidden="true" />
            Replay
          </button>
        ) : null
      }
      label={`Serve ${serve.index} of ${count}. Swipe to change serve.`}
    >
      {!pb.videoUrl && !still && !pb.loading ? (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-callout text-(--overlay-line)">
          {session.isDemo ? 'Sample serves have no video. Tag from memory.' : 'No video for this serve. Tag from memory.'}
        </div>
      ) : null}
    </VideoStage>
  )
}

/** Session tally (DESIGN §8.14 tally counter; D3): serves in of N, optional net, long and wide. */
function TallyPanel({
  session,
  serveCount,
  counts,
  onDone,
  onBack,
}: {
  session: SessionRecord
  serveCount: number
  counts: ReturnType<typeof countTags>
  onDone: () => void
  onBack: () => void
}) {
  const existing = useTally(session.id)
  const [serveNumber, setServeNumber] = useState<ServeNumber>(session.defaultServeNumber ?? 1)
  const stored = existing ? (serveNumber === 1 ? existing.firstServes : existing.secondServes) : undefined
  const [draft, setDraft] = useState<TallyCounts | null>(null)
  const t: TallyCounts = draft ?? stored ?? { in: 0, total: serveCount }
  const setT = (patch: Partial<TallyCounts>) => {
    const next = { ...t, ...patch }
    next.total = Math.max(1, next.total)
    next.in = Math.min(next.total, Math.max(0, next.in))
    setDraft(next)
  }
  const faults = t.total - t.in
  const sorted = (t.net ?? 0) + (t.long ?? 0) + (t.wide ?? 0)
  const unsorted = faults - sorted
  // Only once the player has entered or changed a tally.
  const conflict = draft || stored ? tallyConflict(counts, t.in) : null
  const [resolution, setResolution] = useState<'tags' | 'tally' | undefined>(existing?.conflictResolution)

  const save = async () => {
    await setTally({
      sessionId: session.id,
      ...(existing ?? {}),
      [serveNumber === 1 ? 'firstServes' : 'secondServes']: t,
      ...(resolution ? { conflictResolution: resolution } : {}),
      enteredAt: new Date().toISOString(),
    })
    onDone()
  }

  const stepper = (label: string, key: 'net' | 'long' | 'wide') => (
    <div className="flex h-11 items-center justify-between gap-3">
      <span className="text-body text-ink">{label}</span>
      <div className="flex items-center gap-3">
        <IconButton icon={MinusIcon} label={`One fewer ${label.toLowerCase()}`} variant="filled" onClick={() => setT({ [key]: Math.max(0, (t[key] ?? 0) - 1) })} />
        <span className="w-8 text-center text-headline tabular-nums text-ink" aria-live="polite">
          {t[key] ?? 0}
        </span>
        <IconButton icon={PlusIcon} label={`One more ${label.toLowerCase()}`} variant="filled" onClick={() => setT({ [key]: Math.min(faults, (t[key] ?? 0) + 1) })} />
      </div>
    </div>
  )

  return (
    <div className="gutter flex flex-col gap-5 pt-2 pb-[max(32px,env(safe-area-inset-bottom))]">
      <SegmentedControl<'1' | '2'>
        label="Which serves"
        options={[
          { value: '1', label: 'First serves' },
          { value: '2', label: 'Second serves' },
        ]}
        value={String(serveNumber) as '1' | '2'}
        onChange={(v) => {
          setServeNumber(Number(v) as ServeNumber)
          setDraft(null)
        }}
      />
      <section aria-label="Serves in" className="card flex flex-col items-center gap-3 p-5">
        <span className="flex items-center gap-2 text-footnote font-label text-ink-2">
          Serves in <StatusChip status="player-entered" />
        </span>
        <div className="flex items-center gap-5">
          <button
            type="button"
            aria-label="One fewer in"
            onClick={() => setT({ in: t.in - 1 })}
            className="grid size-16 place-items-center rounded-full border-token border-line-strong bg-surface text-ink active:scale-[0.98] motion-reduce:active:scale-100"
          >
            <MinusIcon size={28} aria-hidden="true" />
          </button>
          <span className="flex items-baseline gap-2" aria-live="polite">
            <span className="text-metric-hero font-wide tabular-nums text-ink">{t.in}</span>
            <span className="text-subhead text-ink-2">of {t.total}</span>
          </span>
          <button
            type="button"
            aria-label="One more in"
            onClick={() => setT({ in: t.in + 1 })}
            className="grid size-16 place-items-center rounded-full border-token border-line-strong bg-surface text-ink active:scale-[0.98] motion-reduce:active:scale-100"
          >
            <PlusIcon size={28} aria-hidden="true" />
          </button>
        </div>
        <div className="flex items-center gap-3 text-footnote text-ink-2">
          <span>Serves hit</span>
          <IconButton icon={MinusIcon} label="One fewer serve hit" onClick={() => setT({ total: t.total - 1 })} />
          <span className="w-6 text-center tabular-nums">{t.total}</span>
          <IconButton icon={PlusIcon} label="One more serve hit" onClick={() => setT({ total: t.total + 1 })} />
        </div>
      </section>
      <section aria-label="Faults, optional" className="flex flex-col">
        <span className="text-footnote font-label text-ink-3">Faults (optional)</span>
        {stepper('Net', 'net')}
        {stepper('Long', 'long')}
        {stepper('Wide', 'wide')}
        {unsorted > 0 && sorted > 0 ? <p className="text-footnote text-ink-3">{unsorted === 1 ? '1 fault not sorted' : `${unsorted} faults not sorted`}</p> : null}
      </section>
      {conflict && serveNumber === 1 ? (
        <section aria-label="Tags and tally differ" className="flex flex-col gap-2 rounded-control bg-surface-2 p-3">
          <p className="text-callout text-ink">
            Your tags say {conflict.tags} in; your tally says {conflict.tally}. Which is right?
          </p>
          <SegmentedControl<'tags' | 'tally'>
            label="Which is right"
            options={[
              { value: 'tags', label: 'Use tags' },
              { value: 'tally', label: 'Use tally' },
            ]}
            value={resolution ?? 'tally'}
            onChange={setResolution}
          />
        </section>
      ) : null}
      <p className="text-footnote text-ink-3">
        A tally gives your serves-in count. Linking outcomes to your toss and contact needs a tag on each serve.
      </p>
      <Button onClick={() => void save()}>Save tally</Button>
      <Button variant="tertiary" fullWidth onClick={onBack}>
        Tag each serve instead
      </Button>
    </div>
  )
}
