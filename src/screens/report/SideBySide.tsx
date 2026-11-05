import { useEffect, useMemo, useState } from 'react'
import AthleteCanvas from '../../components/AthleteCanvas'
import { Icon } from '../../components/primitives'
import type { PhaseId } from '../../lib/analysis/types'
import { swingOf, type Swing } from '../../lib/figure/swing'
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

/**
 * The player's body beside something to compare it with, at the moment that
 * matters: a real model serve, their own best, or their last. One picture and
 * one choice, and the same scale either side so the difference is the serve.
 */
export default function SideBySide({ swing, moment, label, work, racket, checks, best, last }: Props) {
  const [beside, setBeside] = useState<Beside>('model')
  const [model, setModel] = useState<Swing | null>()

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
  const name = label.toLowerCase()
  const fit = { height: 0.66, feet: 0.93, across: 0.5 }

  return (
    <section className="side" aria-labelledby="side-title">
      <h2 className="t-headline" id="side-title">
        Your {name}, side by side
      </h2>
      <div className="side-pair">
        <figure className="side-cell">
          <div className="side-stage">
            <AthleteCanvas swing={swing} mode="pose" at={swing.moments[moment] ?? 0} work={work} fit={fit} label={`Your ${name}, as the tracked body`} />
          </div>
          <figcaption>You</figcaption>
        </figure>
        <figure className="side-cell">
          <div className="side-stage">
            {chosen.swing ? (
              <AthleteCanvas
                swing={chosen.swing}
                mode="pose"
                at={chosen.swing.moments[moment] ?? 0}
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

      {options.length > 1 && (
        <div className="seg side-choice" role="group" aria-label="What to set your serve beside">
          {options.map((o) => (
            <button key={o.id} type="button" className={`seg-item${o.id === chosen.id ? ' is-on' : ''}`} aria-pressed={o.id === chosen.id} onClick={() => setBeside(o.id)}>
              {o.label}
            </button>
          ))}
        </div>
      )}

      {checks.length > 0 && (
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
      {beside === 'model' && <p className="side-note">The model is a real serve, captured in a lab. It is a good serve to learn from, not the only right one.</p>}
    </section>
  )
}
