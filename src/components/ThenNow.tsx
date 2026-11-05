import { useMemo, useState } from 'react'
import type { PhaseId } from '../lib/analysis/types'
import { swingOf } from '../lib/figure/swing'
import { shortDate } from '../lib/progress'
import type { Session } from '../lib/storage/db'
import AthleteCanvas from './AthleteCanvas'

const MOMENTS: { id: PhaseId; label: string }[] = [
  { id: 'trophy', label: 'Trophy' },
  { id: 'drop', label: 'Racket drop' },
  { id: 'contact', label: 'Contact' },
  { id: 'finish', label: 'Finish' },
]

/**
 * Then against now, as the player's own body at the same moment and the same
 * size. It used to need photographs, so it showed two blank tiles as soon as the
 * stills were pruned. A stored swing is small enough to outlive them.
 */
export default function ThenNow({ then, now }: { then: Session; now: Session }) {
  const [moment, setMoment] = useState<PhaseId>('contact')
  const a = useMemo(() => swingOf(then), [then])
  const b = useMemo(() => swingOf(now), [now])
  if (!a || !b) return null
  const fit = { height: 0.66, feet: 0.93 }
  return (
    <section className="then-now" aria-labelledby="then-title">
      <h2 className="t-headline" id="then-title">
        Then, and now
      </h2>
      <div className="side-pair">
        <figure className="side-cell">
          <div className="side-stage">
            <AthleteCanvas swing={a} mode="pose" at={a.moments[moment] ?? 0} fit={fit} label={`Your serve on ${shortDate(then.createdAt)}`} />
          </div>
          <figcaption>{shortDate(then.createdAt)}</figcaption>
        </figure>
        <figure className="side-cell">
          <div className="side-stage">
            <AthleteCanvas swing={b} mode="pose" at={b.moments[moment] ?? 0} fit={fit} label={`Your serve on ${shortDate(now.createdAt)}`} />
          </div>
          <figcaption>{shortDate(now.createdAt)}</figcaption>
        </figure>
      </div>
      <div className="seg" role="group" aria-label="Which moment">
        {MOMENTS.map((m) => (
          <button key={m.id} type="button" className={`seg-item${m.id === moment ? ' is-on' : ''}`} aria-pressed={m.id === moment} onClick={() => setMoment(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
    </section>
  )
}
