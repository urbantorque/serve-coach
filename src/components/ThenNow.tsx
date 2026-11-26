import { useMemo, useState } from 'react'
import type { FlawId } from '../lib/analysis/flaws'
import type { PhaseId } from '../lib/analysis/types'
import { swingOf, workParts } from '../lib/figure/swing'
import { shortDate } from '../lib/progress'
import type { Session } from '../lib/storage/db'
import { thenNowLine, thenNowMark } from '../lib/thenNowMark'
import AthleteCanvas from './AthleteCanvas'

const MOMENTS: { id: PhaseId; label: string }[] = [
  { id: 'toss', label: 'Toss' },
  { id: 'trophy', label: 'Trophy' },
  { id: 'drop', label: 'Racket drop' },
  { id: 'contact', label: 'Contact' },
  { id: 'finish', label: 'Finish' },
]

/**
 * Then against now, as the player's own body at the same moment and the same
 * size. It used to need photographs, so it showed two blank tiles as soon as the
 * stills were pruned. A stored swing is small enough to outlive them.
 *
 * And it marks the change (E2.1). Two alike figures said nothing; now both are
 * held at the moment one fault is read at, the fault is painted in `--work` on
 * whichever serve had it, and each serve's reading sits under it in the
 * report's own words, with the whole picture said in one line below. Only a
 * fault with a graded reading on both serves is marked (`thenNowMark`); with
 * none, the screen says so rather than drawing a change it cannot stand behind.
 */
export default function ThenNow({ then, now, prefer }: { then: Session; now: Session; prefer?: FlawId }) {
  const mark = useMemo(() => thenNowMark(then, now, prefer), [then, now, prefer])
  const [moment, setMoment] = useState<PhaseId>(mark?.moment ?? 'contact')
  const a = useMemo(() => swingOf(then), [then])
  const b = useMemo(() => swingOf(now), [now])
  if (!a || !b) return null
  const fit = { height: 0.66, feet: 0.93 }
  const marked = mark && moment === mark.moment ? mark : undefined
  // The four moments a serve is compared at, and the fault's own when it is another.
  const moments = MOMENTS.filter((m) => m.id !== 'toss' || mark?.moment === 'toss')
  if (mark && !moments.some((m) => m.id === mark.moment)) moments.unshift({ id: mark.moment, label: mark.moment === 'ready' ? 'Ready' : mark.moment })
  const cell = (s: Session, swing: NonNullable<typeof a>, side: 'then' | 'now') => {
    const reading = marked?.[side]
    return (
      <figure className="side-cell">
        <div className="side-stage">
          <AthleteCanvas
            swing={swing}
            mode="pose"
            at={swing.moments[moment] ?? 0}
            fit={fit}
            work={reading?.had ? workParts(marked!.flaw, swing.racket) : undefined}
            label={`Your serve on ${shortDate(s.createdAt)}${reading ? `: ${reading.readout}` : ''}`}
          />
        </div>
        <figcaption>
          {shortDate(s.createdAt)}
          {reading && <span className={`then-now-read${reading.had ? ' is-had' : ''}`}>{reading.readout}</span>}
        </figcaption>
      </figure>
    )
  }
  return (
    <section className="then-now" aria-labelledby="then-title">
      <h2 className="t-headline" id="then-title">
        Then and now
      </h2>
      {mark && <p className="t-overline">{mark.name}, at the {MOMENTS.find((m) => m.id === mark.moment)?.label.toLowerCase() ?? mark.moment}</p>}
      <div className="side-pair">
        {cell(then, a, 'then')}
        {cell(now, b, 'now')}
      </div>
      <p className="progress-foot">
        {mark ? thenNowLine(mark, shortDate(then.createdAt), shortDate(now.createdAt)) : 'Nothing I grade was read on both of these serves, so I can’t mark a change on them.'}
      </p>
      <div className="seg" role="group" aria-label="Which moment">
        {moments.map((m) => (
          <button key={m.id} type="button" className={`seg-item${m.id === moment ? ' is-on' : ''}`} aria-pressed={m.id === moment} onClick={() => setMoment(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
    </section>
  )
}
