import { useEffect, useRef, useState } from 'react'
import type { Phase, PhaseId } from '../lib/analysis/types'
import type { Swing } from '../lib/figure/swing'
import type { StudioMark } from '../lib/storage/db'
import AthleteCanvas from './AthleteCanvas'
import StudioLayer from './StudioLayer'

/** An earlier serve's kept clip, to play beside this one. */
export interface KeptPane {
  /** What the caption says: "Your best", "Your last, 3 Nov". */
  label: string
  url: string
  phases: Phase[]
  aspect?: number
}

interface Props {
  /** This serve's kept clip, as an object URL. */
  url: string
  phases: Phase[]
  /** Width over height, so the box holds its shape before the video's first frame arrives. */
  aspect?: number
  /** Earlier serves whose clips were kept too, best first (`compareSet`). */
  others?: KeptPane[]
  /** Four up is offered: a Plus player with at least two earlier clips kept. */
  four?: boolean
  /** The player's racket side, for the model serve that fills an empty fourth pane. */
  racket?: 'left' | 'right'
  /** What was drawn on this serve in the studio (E1.2), shown over the clip, not editable here. */
  marks?: StudioMark[]
}

/**
 * The model's pane, framed as a kept clip is. Inline, because the report's
 * stylesheets are at their budget and this shows only in four up.
 */
const MODEL_PANE = {
  position: 'relative',
  overflow: 'hidden',
  width: '100%',
  borderRadius: 'var(--r-md)',
  border: '1px solid var(--hairline)',
  background: 'var(--stage)',
} as const

/** Where every clip starts when played together: just before the toss. */
const LEAD_SECONDS = 0.3

/**
 * A reopened report's own video, kept on this device (D6.4).
 *
 * The real clip, not the tracked body: a kept video carries what a skeleton
 * cannot — the ball, the racket, the court. The keyframe buttons seek to the
 * moments the report reads, on the file's own clock, which is the clock the
 * report's keyframes are stored on.
 *
 * Beside earlier serves whose clips were kept too: two up, this and the best,
 * or four up in the studio (Apex E), this beside the best, the last and one
 * from about a month before. Every clip moves together: a moment's button
 * puts each at its own instance of that moment, and "Play all from the toss"
 * starts each just before its own toss at half speed, so the same moment of
 * every serve is on screen at once. A fourth pane with no clip to fill it
 * holds the model serve at the chosen moment.
 */
export default function KeptVideo({ url, phases, aspect, others = [], four = false, racket = 'right', marks }: Props) {
  const shape = (a?: number) => (a && Number.isFinite(a) ? { aspectRatio: String(a) } : undefined)
  const videos = useRef<(HTMLVideoElement | null)[]>([])
  const fourUp = four && others.length >= 2
  const [layout, setLayout] = useState<'two' | 'four'>('two')
  const wide = fourUp && layout === 'four'
  const panes: KeptPane[] = [{ label: 'This serve', url, phases, aspect }, ...(wide ? others.slice(0, 3) : others.slice(0, 1))]
  const [held, setHeld] = useState<PhaseId>('contact')

  // The model serve, only when a fourth pane needs it, and only then loaded.
  const needsModel = wide && panes.length < 4
  const [model, setModel] = useState<Swing>()
  useEffect(() => {
    if (!needsModel || model) return
    let gone = false
    void import('../lib/figure/modelMotion').then(({ modelMotion }) => {
      const m = modelMotion(racket)
      if (m && !gone) setModel({ frames: m.frames, moments: Object.fromEntries(m.phases.map((p) => [p.id, p.frame])), racket })
    })
    return () => {
      gone = true
    }
  }, [needsModel, model, racket])

  const seek = (id: PhaseId) => {
    setHeld(id)
    panes.forEach((p, i) => {
      const v = videos.current[i]
      const t = p.phases.find((x) => x.id === id)?.t
      if (!v || t === undefined) return
      v.pause()
      v.currentTime = t
    })
  }

  const tossOf = (ps: Phase[]) => ps.find((p) => p.id === 'toss')?.t ?? ps[0]?.t ?? 0

  const playTogether = () => {
    const all = panes.map((p, i) => [videos.current[i], p.phases] as const)
    for (const [v, ps] of all) {
      if (!v) continue
      v.pause()
      v.currentTime = Math.max(0, tossOf(ps) - LEAD_SECONDS)
      v.playbackRate = 0.5
    }
    for (const [v] of all) void v?.play().catch(() => undefined)
  }

  // Four clips one above the other two would run off a laptop's screen.
  const fit = wide ? { maxHeight: '36svh' } : undefined
  const heldLabel = phases.find((p) => p.id === held)?.label ?? 'contact'

  return (
    <div className="kept">
      {fourUp && (
        <div className="kept-actions kept-layout" role="group" aria-label="How many serves to show">
          <button className="chip chip--button" aria-pressed={layout === 'two'} onClick={() => setLayout('two')}>
            Two up
          </button>
          <button className="chip chip--button" aria-pressed={layout === 'four'} onClick={() => setLayout('four')}>
            Four up
          </button>
        </div>
      )}
      {panes.length > 1 ? (
        <div className="kept-pair">
          {panes.map((p, i) => (
            <figure className="kept-one" key={`${i}-${p.url}`}>
              <video
                ref={(el) => {
                  videos.current[i] = el
                }}
                src={p.url}
                controls
                playsInline
                preload="metadata"
                muted={i > 0}
                style={{ ...shape(p.aspect), ...fit }}
              />
              <figcaption>{p.label}</figcaption>
            </figure>
          ))}
          {needsModel && (
            <figure className="kept-one">
              <div style={{ ...MODEL_PANE, ...(shape(aspect) ?? { aspectRatio: '4 / 3' }), ...fit }}>
                {model && (
                  <AthleteCanvas
                    swing={model}
                    mode="pose"
                    at={model.moments[held] ?? model.moments.contact ?? 0}
                    fit={{ height: 0.74, feet: 0.9, across: 0.5 }}
                    label={`The model serve at ${heldLabel.toLowerCase()}.`}
                    className="stage-canvas"
                  />
                )}
              </div>
              <figcaption>Model serve, at {heldLabel.toLowerCase()}</figcaption>
            </figure>
          )}
        </div>
      ) : (
        <div className="kept-frame">
          <video
            ref={(el) => {
              videos.current[0] = el
            }}
            className="kept-video"
            src={url}
            controls
            playsInline
            preload="metadata"
            style={shape(aspect)}
          />
          {marks?.length && aspect ? (
            <StudioLayer marks={marks} aspect={aspect} time={0} zoomed={false} onAdd={() => undefined} onTap={() => undefined} />
          ) : null}
        </div>
      )}
      <div className="kept-actions">
        {panes.length > 1 && (
          <button className="chip chip--button" onClick={playTogether}>
            {panes.length > 2 ? 'Play all from the toss' : 'Play both from the toss'}
          </button>
        )}
        {phases.map((p) => (
          <button key={p.id} className="chip chip--button" aria-pressed={panes.length > 1 ? held === p.id : undefined} onClick={() => seek(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}
