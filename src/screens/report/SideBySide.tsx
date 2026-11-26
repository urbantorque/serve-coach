import { useEffect, useMemo, useRef, useState } from 'react'
import AthleteCanvas from '../../components/AthleteCanvas'
import { Icon } from '../../components/primitives'
import Term from '../../components/Term'
import type { GlossaryId } from '../../lib/glossary'
import type { PhaseId } from '../../lib/analysis/types'
import { swingOf, type Swing } from '../../lib/figure/swing'
import { PHASE_ORDER, syncedFrame } from '../../lib/figure/syncPhases'
import type { MomentCheck } from '../../lib/lookFor'
import { shortDate } from '../../lib/progress'
import type { Session } from '../../lib/storage/db'

interface Props {
  swing: Swing
  /** The moment the first fix shows at. */
  moment: PhaseId
  /** That moment's name, as the report prints it. */
  label: string
  work: string[]
  racket: 'left' | 'right'
  /** Readouts from this moment, each ticked or crossed by its band. */
  checks: MomentCheck[]
  /** The player's best earlier serve, and the one before this. */
  best?: Session
  last?: Session
}

type Beside = 'model' | 'best' | 'last'

const PHASE_NAME: Record<PhaseId, string> = {
  ready: 'Ready',
  toss: 'Toss',
  trophy: 'Trophy',
  drop: 'Racket drop',
  contact: 'Contact',
  finish: 'Finish',
}

/** The moments with a meaning a tap away, named where the heading uses them (E3.4). */
const TERM_OF: Partial<Record<PhaseId, GlossaryId>> = { trophy: 'trophy', drop: 'racketDrop' }

/** How long one synced play-through takes: slow enough to watch two bodies at once. */
const PLAY_SECONDS = 4

const reducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The player's body beside something to compare it with, at the moment that
 * matters: a real model serve, their own best, or their last. One picture and
 * one choice, and the same scale either side so the difference is the serve.
 */
export default function SideBySide({ swing, moment, label, work, racket, checks, best, last }: Props) {
  const [beside, setBeside] = useState<Beside>('model')
  const [model, setModel] = useState<Swing | null>()
  /*
   * Which moment both bodies stand at, and, while playing, where the two are on
   * one shared timeline (N4.1, `syncPhases.ts`): each serve reaches every phase
   * at the same instant, so what differs is the serve, not its tempo.
   */
  const [at, setAt] = useState<PhaseId>(moment)
  const [playU, setPlayU] = useState<number | null>(null)
  const raf = useRef(0)

  useEffect(() => setAt(moment), [moment])

  useEffect(() => {
    if (playU === null) return
    const started = performance.now() - playU * PLAY_SECONDS * 1000
    const tick = (now: number) => {
      const u = (now - started) / (PLAY_SECONDS * 1000)
      if (u >= 1) {
        setPlayU(null)
        setAt('contact')
        return
      }
      setPlayU(u)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
    // Started once per play; the frame loop owns `playU` from there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playU === null])

  useEffect(() => {
    let live = true
    import('../../lib/figure/modelMotion')
      .then(({ modelMotion }) => {
        if (!live) return
        const m = modelMotion(racket)
        setModel(
          m
            ? {
                frames: m.frames,
                moments: Object.fromEntries(m.phases.map((p) => [p.id, p.frame])),
                racket,
              }
            : null,
        )
      })
      .catch(() => live && setModel(null))
    return () => {
      live = false
    }
  }, [racket])

  const bestSwing = useMemo(() => (best ? swingOf(best) : undefined), [best])
  const lastSwing = useMemo(() => (last ? swingOf(last) : undefined), [last])

  const options: { id: Beside; label: string; swing?: Swing | null; caption?: string }[] = [
    { id: 'model', label: 'A model serve', swing: model, caption: 'Model' },
    ...(bestSwing ? [{ id: 'best' as const, label: 'Your best', swing: bestSwing, caption: best ? `Your best, ${shortDate(best.createdAt)}` : undefined }] : []),
    ...(lastSwing && last?.id !== best?.id
      ? [{ id: 'last' as const, label: 'Your last', swing: lastSwing, caption: last ? `Your last, ${shortDate(last.createdAt)}` : undefined }]
      : []),
  ]
  const chosen = options.find((o) => o.id === beside) ?? options[0]
  const name = at === moment ? label.toLowerCase() : PHASE_NAME[at].toLowerCase()
  const frameOf = (s: Swing) => (playU !== null ? Math.round(syncedFrame(s.moments, playU)) : (s.moments[at] ?? 0))
  const phases = PHASE_ORDER.filter((p) => swing.moments[p] !== undefined)
  const canPlay = !reducedMotion() && !!chosen.swing
  const fit = { height: 0.66, feet: 0.93, across: 0.5 }
  /*
   * One picture, one idea (E2.5): at the fix's moment, the part is coral on
   * you, what I saw, and lime on the model, where to get to (DESIGN.md: coral
   * and lime as "from this, to that", on two bodies, never both on one). The
   * model only: a best or last serve of the player's own may still have the
   * fault, and lime on it would say otherwise. And only when both bodies are
   * drawn for the same racket hand, so the part lit is the same part.
   */
  const pair = at === moment && playU === null && work.length > 0 && chosen.id === 'model' && chosen.swing?.racket === swing.racket

  return (
    <section className="side" aria-labelledby="side-title">
      <h2 className="t-headline" id="side-title">
        Your {TERM_OF[at] ? <Term id={TERM_OF[at]!}>{name}</Term> : name}, side by side
      </h2>
      <div className="side-pair">
        <figure className="side-cell">
          <div className="side-stage">
            <AthleteCanvas swing={swing} mode="pose" at={frameOf(swing)} work={at === moment ? work : undefined} fit={fit} label={`Your ${name}, as the tracked body`} />
          </div>
          <figcaption>You</figcaption>
        </figure>
        <figure className="side-cell">
          <div className="side-stage">
            {chosen.swing ? (
              <AthleteCanvas
                swing={chosen.swing}
                mode="pose"
                at={frameOf(chosen.swing)}
                work={pair ? work : undefined}
                teach={pair}
                fit={fit}
                label={`${chosen.caption ?? 'The other serve'}, at the ${name}`}
              />
            ) : (
              <div className="side-wait" aria-busy={chosen.swing === undefined} />
            )}
          </div>
          <figcaption>{chosen.caption}</figcaption>
        </figure>
      </div>
      {pair && <p className="side-note">Coral is what I saw on you. Lime is where to get to.</p>}

      <div className="side-play">
        {canPlay && (
          <button
            type="button"
            className="side-play-btn"
            aria-label={playU !== null ? 'Pause both serves' : 'Play both serves together'}
            onClick={() => setPlayU(playU !== null ? null : 0)}
          >
            <Icon name={playU !== null ? 'pause' : 'play'} size={18} />
          </button>
        )}
        <div className="seg side-phases" role="group" aria-label="Moment to compare">
          {phases.map((p) => (
            <button
              key={p}
              type="button"
              className={`seg-item${playU === null && p === at ? ' is-on' : ''}`}
              aria-pressed={playU === null && p === at}
              onClick={() => {
                setPlayU(null)
                setAt(p)
              }}
            >
              {PHASE_NAME[p]}
            </button>
          ))}
        </div>
      </div>

      {options.length > 1 && (
        <div className="seg side-choice" role="group" aria-label="Compare your serve with">
          {options.map((o) => (
            <button key={o.id} type="button" className={`seg-item${o.id === chosen.id ? ' is-on' : ''}`} aria-pressed={o.id === chosen.id} onClick={() => setBeside(o.id)}>
              {o.label}
            </button>
          ))}
        </div>
      )}

      {checks.length > 0 && at === moment && playU === null && (
        <ul className="side-checks">
          {checks.map((c) => (
            <li key={c.id} className={c.inBand ? 'is-in' : 'is-out'}>
              <span className="side-mark">
                <Icon name={c.inBand ? 'check' : 'close'} size={13} />
              </span>
              <span className="sr-only">{c.inBand ? 'On target:' : 'Off target:'}</span>
              <span>
                <strong>{c.label}</strong> {c.readout}
              </span>
            </li>
          ))}
        </ul>
      )}
      {beside === 'model' && <p className="side-note">The model is a real serve, captured in a lab. It’s a good serve to learn from, not the only right one.</p>}
    </section>
  )
}
