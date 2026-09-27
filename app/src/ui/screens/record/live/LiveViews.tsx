import { CameraIcon, CheckCircleIcon, DeviceRotateIcon, FilmReelIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react'
import { useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, IconButton } from '../../../components/index.ts'
import { Stepper, Toggle } from '../../../components/record/index.ts'
import { cx } from '../../../components/cx.ts'
import { paths } from '../../../shell/paths.ts'
import { CAMERA_PREALERT, MOTION_PREALERT } from '../flow/copy.ts'
import type { CameraProblem } from './camera.ts'
import { beep, chime } from './cues.ts'

/** Full-screen Court-side panel with a close control, for the states around the camera preview. */
export function LivePanel({ children, onClose, className }: { children: ReactNode; onClose: () => void; className?: string }) {
  return (
    <div className={cx('flex min-h-[100dvh] flex-col bg-bg pad-safe-top', className)}>
      <div className="gutter flex h-13 items-center">
        <IconButton icon={XIcon} label="Close camera" onClick={onClose} className="-ml-2" />
      </div>
      <div className="gutter mx-auto flex w-full max-w-(--content-max) flex-1 flex-col justify-center gap-6 pb-10">{children}</div>
    </div>
  )
}

/** Camera and motion pre-alert, first time only (DESIGN §10.3: one "Continue" each; research 09 [S14]). */
export function PrealertView({ askMotion, onContinue, onClose }: { askMotion: boolean; onContinue: () => void; onClose: () => void }) {
  return (
    <LivePanel onClose={onClose}>
      <span className="grid size-16 place-items-center rounded-full bg-surface-2 text-ink">
        <CameraIcon size={32} aria-hidden="true" />
      </span>
      <h2 className="text-title-1 text-balance text-ink">Camera and level</h2>
      <p className="text-body text-ink">{CAMERA_PREALERT}</p>
      {askMotion ? <p className="text-body text-ink">{MOTION_PREALERT}</p> : null}
      <p className="text-callout text-ink-2">Your phone will ask for permission next.</p>
      <Button onClick={onContinue}>Continue</Button>
    </LivePanel>
  )
}

const PROBLEM_COPY: Record<CameraProblem, { title: string; body: string; retry: boolean }> = {
  denied: { title: 'Camera access is off', body: "You can turn it on in your browser's settings for this site, or import a video you've already filmed.", retry: true },
  busy: { title: 'The camera is busy', body: 'Close other camera apps and try again.', retry: true },
  'not-found': { title: 'No camera found', body: "We couldn't find a camera on this device. Import a video you filmed on your phone instead.", retry: true },
  insecure: { title: 'The camera needs a secure page', body: 'Browsers only open the camera on a secure (https) address. Open Serve Coach from its https address, or import a video.', retry: false },
  unsupported: { title: "This browser can't use the camera here", body: "Import a video you've filmed in the Camera app instead. Everything else works the same.", retry: false },
  unknown: { title: "We couldn't start the camera", body: 'Try again, or import a video you filmed in the Camera app.', retry: true },
}

/** Degraded state: no camera (PRODUCT §6.3.4). Says what happened and offers import. */
export function CameraProblemView({ problem, onRetry, onClose }: { problem: CameraProblem; onRetry: () => void; onClose: () => void }) {
  const copy = PROBLEM_COPY[problem]
  return (
    <LivePanel onClose={onClose}>
      <span className="grid size-16 place-items-center rounded-full bg-surface-2 text-ink">
        <WarningCircleIcon size={32} aria-hidden="true" />
      </span>
      <h2 className="text-title-1 text-balance text-ink">{copy.title}</h2>
      <p className="text-body text-ink">{copy.body}</p>
      <div className="flex flex-col gap-3">
        <Button icon={FilmReelIcon} to={paths.importVideo()}>
          Import a video
        </Button>
        {copy.retry ? (
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </div>
    </LivePanel>
  )
}

/** Sideways set-up only (DESIGN §10.3 R2): clears itself as soon as the frames are landscape. */
export function TurnPrompt({ onUpright, onClose }: { onUpright: () => void; onClose: () => void }) {
  const reduce = useReducedMotion()
  return (
    <LivePanel onClose={onClose} className="text-center">
      <DeviceRotateIcon size={96} aria-hidden="true" className={cx('mx-auto text-ink', !reduce && 'animate-[spin_3s_ease-in-out_infinite]')} />
      <h2 className="text-title-1 text-balance text-ink">Turn your phone sideways</h2>
      <p className="text-callout text-ink-2">Standard 1x lens, lens pointing along the baseline at you.</p>
      <Button variant="secondary" onClick={onUpright}>
        Film upright instead
      </Button>
    </LivePanel>
  )
}

/** R5 countdown: inverse field, 240 px numerals, a beep each second, a chime at zero; tap to cancel. */
export function CountdownView({ seconds, sound, onDone, onCancel }: { seconds: number; sound: boolean; onDone: () => void; onCancel: () => void }) {
  const [left, setLeft] = useState(seconds)
  // Callbacks live in refs so a parent re-render never restarts the second that is running.
  const done = useRef(onDone)
  const withSound = useRef(sound)
  useEffect(() => {
    done.current = onDone
    withSound.current = sound
  }, [onDone, sound])
  useEffect(() => {
    if (left <= 0) {
      if (withSound.current) chime()
      done.current()
      return
    }
    if (withSound.current) beep()
    const t = window.setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => window.clearTimeout(t)
  }, [left])
  return (
    <button
      type="button"
      onClick={onCancel}
      aria-label={`Recording starts in ${left} seconds. Tap to cancel.`}
      className="fixed inset-0 z-(--z-camera) flex flex-col items-center justify-center gap-4 bg-surface-inverse text-ink-inverse"
    >
      <span aria-hidden="true" className="font-wide tabular-nums leading-none font-strong" style={{ fontSize: 'min(240px, 60vw)' }}>
        {left}
      </span>
      <span className="text-[17px] font-label">Walk to your spot</span>
      <span className="text-footnote opacity-80">Tap anywhere to cancel</span>
    </button>
  )
}

/** "0:42", "12:03". */
function clockOf(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/**
 * R6 recording: true black (the one allowed pure black, for OLED power and heat), the recording
 * indicator (red dot, "Recording", timer; App Store 2.5.14) and a large Stop. Nothing else.
 */
export function RecordingView({ elapsedS, onStop }: { elapsedS: number; onStop: () => void }) {
  return (
    // DESIGN §10.3 R6: true black is the one allowed pure black (OLED power and heat); keywords, not hex.
    <div className="fixed inset-0 z-(--z-camera) flex flex-col pad-safe-top pad-safe-bottom" style={{ background: 'black', color: 'white' }}>
      <div className="flex items-center gap-2 px-5 pt-4" role="status" aria-live="off">
        <span aria-hidden="true" className="size-3 rounded-full bg-(--recording)" />
        <span className="text-[17px] font-label">Recording</span>
        <span className="ml-2 text-[28px] tabular-nums font-label" aria-label={`${Math.floor(elapsedS)} seconds`}>
          {clockOf(elapsedS)}
        </span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-end gap-3 pb-10">
        <p className="text-footnote opacity-60">Tap Stop when you're back</p>
        <button type="button" onClick={onStop} aria-label="Stop recording" className="grid size-[88px] place-items-center rounded-full border-4" style={{ borderColor: 'white' }}>
          <span aria-hidden="true" className="size-8 rounded-[8px] bg-(--recording)" />
        </button>
        <span className="text-footnote font-label" aria-hidden="true">
          Stop
        </span>
      </div>
    </div>
  )
}

export interface TallyValues {
  in: number | null
  total: number
  net: number
  long: number
  wide: number
  thenTag: boolean
}

export interface TallyViewProps {
  saved: string
  /** Shown when the delivered rate is under 50 fps (PRODUCT §6.3.5: warn when it differs). */
  fpsNote?: string | null
  /** "Recording stopped at 3:40. We kept what was recorded." */
  interrupted: string | null
  tooShort: boolean
  secondServes: boolean
  values: TallyValues
  onChange: (patch: Partial<TallyValues>) => void
  busy: boolean
  error: string | null
  onAnalyse: () => void
  onSkip: () => void
  onRecordAgain: () => void
  onClose: () => void
}

/** R7 tally (DESIGN §10.3, D3): "While it's fresh: how many went in?" Optional faults; Analyse or Skip. */
export function TallyView(p: TallyViewProps) {
  const v = p.values
  const faults = v.net + v.long + v.wide
  const unsorted = v.in !== null ? v.total - v.in - faults : 0
  if (p.tooShort) {
    return (
      <LivePanel onClose={p.onClose}>
        <h2 className="text-title-1 text-balance text-ink">That's too short to contain a serve</h2>
        <p className="text-body text-ink-2">{p.saved}</p>
        <Button onClick={p.onRecordAgain}>Record again</Button>
        <Button variant="tertiary" onClick={p.onSkip}>
          Analyse it anyway
        </Button>
      </LivePanel>
    )
  }
  return (
    <LivePanel onClose={p.onClose} className="[&>div:last-child]:justify-start">
      <p className="flex items-center gap-2 text-footnote text-ink-2">
        <CheckCircleIcon size={20} aria-hidden="true" className="shrink-0 text-ink" />
        {p.saved}
      </p>
      {p.fpsNote ? <p className="text-footnote text-ink-2">{p.fpsNote}</p> : null}
      {p.interrupted ? <p className="text-callout text-ink">{p.interrupted}</p> : null}
      <h2 className="text-title-1 text-balance text-ink">{p.secondServes ? "While it's fresh: how many second serves went in?" : "While it's fresh: how many went in?"}</h2>
      <Stepper label="Serves in" size="hero" value={v.in} max={v.total} suffix={`of ${v.total}`} onChange={(n) => p.onChange({ in: n })} />
      <div className="flex flex-col gap-2">
        <h3 className="text-footnote font-label text-ink-2">Faults (optional)</h3>
        <Stepper label="Net" value={v.net} max={v.total} onChange={(n) => p.onChange({ net: n })} />
        <Stepper label="Long" value={v.long} max={v.total} onChange={(n) => p.onChange({ long: n })} />
        <Stepper label="Wide" value={v.wide} max={v.total} onChange={(n) => p.onChange({ wide: n })} />
        {v.in !== null && faults > 0 && unsorted > 0 ? <p className="text-footnote text-ink-3">{unsorted === 1 ? '1 fault not sorted' : `${unsorted} faults not sorted`}</p> : null}
        <Stepper label="Serves in the block" value={v.total} min={1} max={60} onChange={(n) => p.onChange({ total: n, in: v.in !== null ? Math.min(v.in, n) : null })} />
      </div>
      <Toggle label="Tag each serve after analysis" description="In, net, long or wide takes about 2 seconds a serve." checked={v.thenTag} onChange={(on) => p.onChange({ thenTag: on })} />
      <p className="text-footnote text-ink-3">You can tag each serve after analysis either way.</p>
      {p.error ? (
        <p className="flex items-start gap-2 text-callout text-critical" role="alert">
          <WarningCircleIcon size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
          {p.error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 pt-2">
        <Button onClick={p.onAnalyse} loading={p.busy}>
          Analyse
        </Button>
        <Button variant="tertiary" onClick={p.onSkip}>
          Skip for now
        </Button>
      </div>
    </LivePanel>
  )
}
