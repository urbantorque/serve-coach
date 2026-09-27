import { ClockCountdownIcon, FilmReelIcon, InfoIcon, PlayCircleIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { getVideoBlob, listVideosBySession } from '../../../data/index.ts'
import { useSession } from '../../../data/hooks.ts'
import type { SessionRecord, VideoRecord } from '../../../data/index.ts'
import { Button, Card, DelayedSkeleton, EmptyState, ProgressStages, Screen, Sheet, Skeleton } from '../../components/index.ts'
import { ClipCard } from '../../components/record/index.ts'
import { shortDate } from '../../format/dates.ts'
import { paths } from '../../shell/paths.ts'
import { simulatedRunner } from './flow/analysisAdapter.ts'
import { clock, fpsLabel, resolutionLabel } from './flow/importLogic.ts'
import { cancelAnalysis, hasHandle, jobFile, retryAnalysis, startAnalysis, useJob, type JobState } from './flow/jobs.ts'
import { etaText, stagesFor } from './flow/stages.ts'

function useNow(active: boolean, ms = 1000): number {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (!active) return
    const t = window.setInterval(() => setNow(performance.now()), ms)
    return () => window.clearInterval(t)
  }, [active, ms])
  return now
}

function ErrorCard({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-3">
      <p className="flex items-start gap-2 text-callout text-ink" role="alert">
        <WarningCircleIcon size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-attention" />
        {message}
      </p>
      {children}
    </Card>
  )
}

/** Restarts analysis from the stored copy after a reload (ARCHITECTURE §5.9 resume, simplified). */
async function restartFromStore(session: SessionRecord): Promise<boolean> {
  const videos = await listVideosBySession(session.id)
  const video: VideoRecord | undefined = videos.find((v) => v.role === 'primary' && v.storage === 'idb')
  if (!video) return false
  const blob = await getVideoBlob(video.id)
  if (!blob) return false
  const capture = video.capture
  void startAnalysis({
    sessionId: session.id,
    file: blob,
    run: { profile: { heightM: capture.playerHeightM, handedness: capture.handedness }, view: session.view, capture },
    clip: {
      title: `${shortDate(session.visitId)}, ${clock(video.meta.durationMediaS)}`,
      line: session.view === 'rear' ? 'View from behind' : 'Side view',
      tech: `${resolutionLabel(video.meta.width, video.meta.height)}, ${fpsLabel(video.meta.captureFps)}`,
      orientation: video.meta.height >= video.meta.width ? 'portrait' : 'landscape',
    },
  })
  return true
}

function JobView({ job, sessionId }: { job: JobState; sessionId: string }) {
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState(false)
  const running = job.phase === 'running'
  const now = useNow(running)
  const state = job.phase === 'done' ? 'done' : job.phase === 'failed' ? 'failed' : job.paused ? 'paused' : 'running'
  const stages = stagesFor(job.progress, state).map((s) =>
    s.state === 'paused' ? { ...s, detail: 'Paused while Serve Coach was in the background' } : s,
  )
  const overall = job.phase === 'done' ? 1 : (job.progress?.overall ?? 0)

  // Done: the report replaces this screen (or tagging when the player asked for it on the tally).
  useEffect(() => {
    if (job.phase !== 'done') return
    const t = window.setTimeout(() => navigate(job.thenTag ? paths.tagging(sessionId) : paths.sessionReport(sessionId), { replace: true }), 220)
    return () => window.clearTimeout(t)
  }, [job.phase, job.thenTag, navigate, sessionId])

  return (
    <>
      <ClipCard {...job.clip} file={jobFile(sessionId)} />
      {job.phase === 'unavailable' ? (
        <ErrorCard message={job.error?.message ?? ''}>
          <div className="flex flex-col gap-2">
            <Button variant="secondary" onClick={() => retryAnalysis(sessionId)}>
              Try again
            </Button>
            {import.meta.env.DEV ? (
              <Button variant="tertiary" onClick={() => retryAnalysis(sessionId, simulatedRunner())}>
                Simulate progress (developer)
              </Button>
            ) : null}
          </div>
        </ErrorCard>
      ) : (
        <ProgressStages
          stages={stages}
          overall={overall}
          eta={running && !job.paused ? etaText(job.progress, job.startedAtMs, now) : undefined}
        />
      )}
      {job.resumed ? <p className="text-footnote text-ink-2">Picking up where it left off.</p> : null}
      {job.notes.map((note) => (
        <p key={note} className="flex items-start gap-2 text-footnote text-ink-2">
          <InfoIcon size={20} aria-hidden="true" className="shrink-0" />
          {note}
        </p>
      ))}

      {job.firstServe && running ? (
        <Card className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-headline text-ink">
            <PlayCircleIcon size={24} aria-hidden="true" className="shrink-0" />
            Serve {job.firstServe.index + 1} is ready.
          </p>
          <p className="text-callout text-ink-2">Watch it while we finish.</p>
          <Button variant="secondary" to={paths.serveDetail(sessionId, job.firstServe.serveId)}>
            {`Watch serve ${job.firstServe.index + 1}`}
          </Button>
        </Card>
      ) : null}

      {job.phase === 'failed' && job.error ? (
        <ErrorCard message={job.error.message}>
          <div className="flex flex-col gap-2">
            {job.error.code === 'no-serves' || !job.error.recoverable ? (
              <Button variant="secondary" to={`${paths.setupChoice()}#guide`}>
                See set-up tips
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => retryAnalysis(sessionId)}>
                Try again
              </Button>
            )}
            <Button variant="tertiary" to={paths.importVideo()}>
              Choose another video
            </Button>
          </div>
        </ErrorCard>
      ) : null}

      {job.phase === 'cancelled' ? (
        <Card className="flex flex-col gap-3">
          <p className="text-callout text-ink">
            {job.servesReady > 0 ? `Analysis cancelled. We kept the ${job.servesReady} serves already done.` : 'Analysis cancelled. Your video is still saved.'}
          </p>
          <Button variant="secondary" onClick={() => retryAnalysis(sessionId)}>
            Resume
          </Button>
        </Card>
      ) : null}

      {running ? (
        <div className="flex flex-col gap-4">
          <p className="flex items-start gap-2 text-footnote text-ink-3">
            <ClockCountdownIcon size={20} aria-hidden="true" className="shrink-0" />
            You can leave this screen: Record shows the progress and the report opens when it's ready. Keep Serve Coach open while it analyses. It usually takes a minute or two.
          </p>
          <Button variant="tertiary" onClick={() => setConfirm(true)}>
            Cancel analysis
          </Button>
        </div>
      ) : null}

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Cancel the analysis?">
        <div className="flex flex-col gap-3">
          <p className="text-callout text-ink">
            {job.servesReady > 0
              ? `We'll keep the ${job.servesReady} serves already done. You can resume the rest later.`
              : 'Nothing has been analysed yet. Your video stays saved, so you can start again later.'}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              cancelAnalysis(sessionId)
              setConfirm(false)
            }}
          >
            Cancel analysis
          </Button>
          <Button variant="tertiary" data-autofocus onClick={() => setConfirm(false)}>
            Keep going
          </Button>
        </div>
      </Sheet>
    </>
  )
}

/** A session with no job in memory: finished, failed, or stopped when the app closed. */
function StoredView({ session }: { session: SessionRecord }) {
  const [restarting, setRestarting] = useState<'idle' | 'busy' | 'missing'>('idle')
  if (session.status === 'ready') {
    return (
      <EmptyState
        icon={PlayCircleIcon}
        title="This session is analysed"
        body="Your report is ready."
        action={<Button to={paths.sessionReport(session.id)}>Open report</Button>}
      />
    )
  }
  const stopped = session.status === 'queued' || session.status === 'analysing' || session.status === 'paused' || session.status === 'cancelled'
  return (
    <ErrorCard
      message={
        session.status === 'failed'
          ? (session.error?.message ?? 'The analysis stopped before it finished.')
          : stopped
            ? 'This analysis stopped when Serve Coach closed. Your video is saved, so you can start it again.'
            : 'This session is being imported.'
      }
    >
      <div className="flex flex-col gap-2">
        {restarting === 'missing' ? (
          <p className="text-footnote text-ink-2">There's no saved copy of this video on this phone. Import it again to analyse it.</p>
        ) : (
          <Button
            variant="secondary"
            loading={restarting === 'busy'}
            onClick={() => {
              setRestarting('busy')
              void restartFromStore(session).then((ok) => setRestarting(ok ? 'idle' : 'missing'))
            }}
          >
            Analyse again
          </Button>
        )}
        <Button variant="tertiary" icon={FilmReelIcon} to={paths.importVideo()}>
          Import a video
        </Button>
      </div>
    </ErrorCard>
  )
}

/**
 * Processing (DESIGN §10.4, §8.18; PRODUCT §6.4): the clip, four stage rows with real progress from
 * the analysis pipeline, an overall bar, the ETA after 5 s of throughput, the first finished serve,
 * Cancel (completed serves are kept) and a notice that the player can leave this screen. When done,
 * the session report (or tagging) replaces it.
 */
export function ProcessingScreen() {
  const { sessionId = '' } = useParams()
  const job = useJob(sessionId)
  const session = useSession(sessionId)
  const inMemory = job !== undefined && hasHandle(sessionId)

  return (
    <Screen title="Analysing" back={{ to: paths.record(), label: 'Record' }}>
      {inMemory && job ? (
        <JobView job={job} sessionId={sessionId} />
      ) : session === undefined ? (
        <DelayedSkeleton>
          <div className="flex flex-col gap-4">
            <Skeleton variant="row" className="h-24" />
            <Skeleton variant="row" />
            <Skeleton variant="row" />
          </div>
        </DelayedSkeleton>
      ) : session === null ? (
        <EmptyState
          icon={WarningCircleIcon}
          title="We couldn't find this session"
          body="It may have been deleted."
          action={
            <Button variant="secondary" to={paths.sessions()}>
              Go to Sessions
            </Button>
          }
        />
      ) : (
        <StoredView session={session} />
      )}
    </Screen>
  )
}
