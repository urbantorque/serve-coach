import { InfoIcon, VideoCameraIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { RECORDING_KEEP_DAYS as KEEP_DAYS, sweepRecordings, type RecordingSummary } from '../../../../data/index.ts'
import { Button, Sheet } from '../../../components/index.ts'
import { paths } from '../../../shell/paths.ts'
import { useShell } from '../../../shell/shellContext.ts'
import { activeRecordings } from './recorder.ts'
import { clipLength, recordedWhen } from './recovery.ts'

/** Wait after launch before looking, so the first screen paints first. */
const LOOK_AFTER_MS = 1200

type Step = 'offer' | 'confirm-delete'

/**
 * Offers an interrupted in-app recording on the next launch (ARCHITECTURE §5.12): the chunks written
 * while recording are still on the phone, so the player can analyse the clip or delete it. Shown once
 * per launch on tab-bar screens only (never over the camera or a full-screen flow). The launch sweep
 * also applies the clean-up rules (data/repos/recordings.ts).
 */
export function RecordingRecovery() {
  const navigate = useNavigate()
  const { tabBar } = useShell()
  const [queue, setQueue] = useState<RecordingSummary[]>([])
  const [step, setStep] = useState<Step>('offer')
  const [busy, setBusy] = useState<'analyse' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    const t = window.setTimeout(() => {
      sweepRecordings({ activeIds: activeRecordings })
        .then((res) => {
          if (live) setQueue(res.recoverable)
        })
        .catch(() => undefined)
    }, LOOK_AFTER_MS)
    return () => {
      live = false
      window.clearTimeout(t)
    }
  }, [])

  const current = queue[0]
  const next = () => {
    setQueue((q) => q.slice(1))
    setStep('offer')
    setError(null)
    setBusy(null)
  }

  const analyse = async () => {
    if (!current) return
    setBusy('analyse')
    setError(null)
    try {
      const { analyseRecovered } = await import('./recoverActions.ts')
      const sessionId = await analyseRecovered(current)
      next()
      navigate(paths.processing(sessionId))
    } catch (e) {
      const quota = (e as { name?: string } | null)?.name === 'QuotaExceededError'
      setError(quota ? 'This phone is out of space, so the recording could not be saved. Free up some space and try again.' : "We couldn't open this recording. Try again, or delete it.")
      setBusy(null)
    }
  }

  const remove = async () => {
    if (!current) return
    setBusy('delete')
    try {
      const { deleteRecovered } = await import('./recoverActions.ts')
      await deleteRecovered(current)
      next()
    } catch {
      setError("We couldn't delete this recording. Try again.")
      setBusy(null)
    }
  }

  const open = Boolean(current) && tabBar
  const stoppedCleanly = Boolean(current?.header?.stoppedAt)

  return (
    <Sheet
      open={open}
      onClose={next}
      title={step === 'confirm-delete' ? 'Delete this recording?' : 'A recording was interrupted'}
      dismissible={busy === null}
    >
      {current ? (
        <div className="flex flex-col gap-4 pb-2" data-recovery={current.recordingId}>
          {step === 'offer' ? (
            <>
              <p className="text-callout text-ink tabular-nums">
                We kept {clipLength(current.seconds)} of video from {recordedWhen(current.startedAt)}. You can still analyse it.
              </p>
              <p className="flex items-start gap-2 text-footnote text-ink-2">
                <InfoIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                <span>
                  {stoppedCleanly
                    ? 'It was recorded, then Serve Coach closed before it was analysed.'
                    : 'Serve Coach closed while it was recording, so the last second may be missing.'}{' '}
                  It stays on this phone for {KEEP_DAYS} days unless you delete it.
                </span>
              </p>
              {error ? (
                <p role="alert" className="flex items-start gap-1.5 text-footnote text-critical">
                  <WarningCircleIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                  {error}
                </p>
              ) : null}
              <div className="flex flex-col gap-3">
                <Button icon={VideoCameraIcon} onClick={() => void analyse()} loading={busy === 'analyse'} disabled={busy !== null}>
                  Analyse recording
                </Button>
                <Button variant="secondary" onClick={next} disabled={busy !== null}>
                  Not now
                </Button>
                <Button variant="destructive" onClick={() => setStep('confirm-delete')} disabled={busy !== null}>
                  Delete recording
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-callout text-ink tabular-nums">
                The {clipLength(current.seconds)} of video from {recordedWhen(current.startedAt)} is deleted from this phone. This can't be undone.
              </p>
              {error ? (
                <p role="alert" className="flex items-start gap-1.5 text-footnote text-critical">
                  <WarningCircleIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                  {error}
                </p>
              ) : null}
              <div className="flex flex-col gap-3">
                <Button variant="destructive" onClick={() => void remove()} loading={busy === 'delete'} disabled={busy !== null}>
                  Delete recording
                </Button>
                <Button variant="secondary" onClick={() => setStep('offer')} disabled={busy !== null}>
                  Keep it
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </Sheet>
  )
}
