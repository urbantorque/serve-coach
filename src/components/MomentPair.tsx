import { useEffect, useRef, useState } from 'react'
import type { DemoServe } from '../lib/faultDemo'
import { ballOn, modelFrameAt } from '../lib/demoDraw'
import type { MomentCheck } from '../lib/lookFor'
import { drawSkeleton, fitBody } from '../lib/pose/skeleton'
import { poseFrameAt, type KeyframePoses } from '../lib/storage/poseTrack'
import type { Frame, PhaseId } from '../lib/analysis/types'
import { Icon } from './primitives'

interface Props {
  /** The report's keyframe poses, and which row is this moment. */
  poses: KeyframePoses | undefined
  index: number
  phase: PhaseId
  /** The moment's name, as the strip prints it. */
  label: string
  racket: 'left' | 'right'
  /** Two or three readouts from this moment, each ticked or crossed by its band. */
  checks: MomentCheck[]
  /** The model, already built. Only a test passes it; the app loads it here. */
  model?: DemoServe
}

/**
 * Your frame beside the model's (L4.6): the player's tracked body at the
 * moment their top fault shows, beside the clean serve's at the same moment,
 * both fitted to the same box by their own extent and drawn by the same
 * renderer — so the two read at one size whatever distance the clip was
 * filmed from — and the model mirrored for a left-hander. Under them, the
 * readouts from that moment, ticked or crossed by the band the card prints.
 *
 * The model is loaded on mount, from the chunk the fault demonstrations use;
 * the player's half needs nothing but the report.
 */
export default function MomentPair({ poses, index, phase, label, racket, checks, model: given }: Props) {
  const [model, setModel] = useState<DemoServe | null | undefined>(given)

  useEffect(() => {
    if (given) return
    let live = true
    import('../lib/faultDemo')
      .then(({ modelServe }) => live && setModel(modelServe(racket) ?? null))
      .catch(() => live && setModel(null))
    return () => {
      live = false
    }
  }, [racket, given])

  const mine = poseFrameAt(poses, index)
  if (!mine || !poses) return null
  const theirs = model ? modelFrameAt(model, phase) : undefined
  const name = label.toLowerCase()

  return (
    <figure className="moment-pair">
      <figcaption className="t-overline moment-pair-title">Your {name} beside the model’s</figcaption>
      <div className="moment-pair-stills">
        <div className="moment-pair-cell">
          <FigureCanvas frame={mine} aspect={poses.aspect} racket={racket} label={`Your ${name}, as the tracked body`} />
          <span className="moment-pair-label">You</span>
        </div>
        <div className="moment-pair-cell">
          {theirs && model ? (
            <FigureCanvas
              frame={theirs}
              aspect={1}
              racket={racket}
              ball={ballOn(model, theirs, racket)}
              label={`The model serve's ${name}`}
            />
          ) : (
            <div className="moment-pair-wait" aria-busy={model === undefined} />
          )}
          <span className="moment-pair-label">Model</span>
        </div>
      </div>
      {checks.length > 0 && (
        <ul className="moment-checks">
          {checks.map((c) => (
            <li key={c.id} className={c.inBand ? 'is-in' : 'is-out'}>
              <Icon name={c.inBand ? 'check' : 'close'} size={13} />
              <span className="sr-only">{c.inBand ? 'On target:' : 'Off target:'}</span>
              <span>
                <strong>{c.label}</strong> {c.readout}
              </span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  )
}

/** One body, fitted to its box by its own extent, at the screen's density. */
function FigureCanvas({
  frame,
  aspect,
  racket,
  ball,
  label,
}: {
  frame: Frame
  aspect: number
  racket: 'left' | 'right'
  ball?: { x: number; y: number; path?: { x: number; y: number }[] }
  label: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round((canvas.clientWidth || 160) * dpr)
    canvas.height = Math.round((canvas.clientHeight || 220) * dpr)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawSkeleton(ctx, { frame, aspect, rect: fitBody(frame, aspect, canvas.width, canvas.height), racket, ball })
  }, [frame, aspect, racket, ball])
  return <canvas ref={ref} className="moment-pair-canvas" role="img" aria-label={label} />
}
