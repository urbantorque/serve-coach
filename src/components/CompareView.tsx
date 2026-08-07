import { useMemo, useState } from 'react'
import { readoutOf } from '../lib/analysis/anatomy'
import { SERVE_TYPES } from '../lib/analysis/coaching'
import type { PhaseId } from '../lib/analysis/types'
import { typeOf } from '../lib/progress'
import type { Session } from '../lib/storage/db'
import { Icon } from './primitives'

interface Props {
  /** The serve being looked at. */
  current: Session
  /** Everything else on file, to choose an opponent from. */
  others: Session[]
}

/** Positions worth putting side by side. Ready and finish tell a player little. */
const COMPARED: PhaseId[] = ['toss', 'trophy', 'drop', 'contact']

interface Row {
  id: string
  label: string
  unit: string
  decimals: number
  mine: number
  theirs: number
  scoreDelta: number
}

/**
 * This serve against another one.
 *
 * Everything here already exists on disk — six annotated stills and every
 * measurement, per report — and until now none of it was ever put next to
 * anything. A number moving from 41 to 58 is abstract; the same trophy position
 * photographed six weeks apart is not, and it is the thing a player will
 * actually show someone.
 *
 * The default opponent is their best serve rather than their previous one. The
 * previous serve is whatever they happened to film last, which on a bad day
 * makes today look like progress; their best is a real target and does not move
 * around underneath them.
 */
export default function CompareView({ current, others }: Props) {
  // Same serve type only. A kick serve and a flat one are scored against
  // different target bands, so the score difference between them is mostly the
  // difference in what was being asked for — not a difference in the player.
  const currentType = typeOf(current)
  const candidates = useMemo(
    () =>
      others
        .filter((s) => s.id !== current.id && typeOf(s) === currentType)
        .sort((a, b) => b.overall - a.overall),
    [current.id, currentType, others],
  )
  const otherTypes = others.filter((s) => s.id !== current.id && typeOf(s) !== currentType).length
  const [againstId, setAgainstId] = useState(() => candidates[0]?.id)
  const against = candidates.find((s) => s.id === againstId) ?? candidates[0]

  const rows = useMemo<Row[]>(() => {
    if (!against) return []
    const mine = new Map(current.fundamentals.flatMap((f) => f.metrics).map((m) => [m.id, m]))
    const theirs = new Map(against.fundamentals.flatMap((f) => f.metrics).map((m) => [m.id, m]))
    const out: Row[] = []
    for (const [id, a] of mine) {
      const b = theirs.get(id)
      // Only what both serves measured. A measurement present in one report and
      // not the other — contact depth needs a side-on camera — has no comparison
      // to make, and showing it against a blank invites reading it as a loss.
      if (!b) continue
      out.push({
        id,
        label: a.label,
        unit: a.unit,
        decimals: a.decimals,
        mine: a.value,
        theirs: b.value,
        scoreDelta: a.score - b.score,
      })
    }
    // Biggest movers first, in both directions: the point is what changed.
    return out.sort((x, y) => Math.abs(y.scoreDelta) - Math.abs(x.scoreDelta))
  }, [current, against])

  if (!against) {
    return (
      <p className="sheet-empty">
        {otherTypes > 0
          ? `Your other ${otherTypes === 1 ? 'serve was a different serve' : 'serves were different serves'} — a ${SERVE_TYPES[currentType].label.toLowerCase()} can only be compared against another one, because the targets differ. Film a second one and they will appear here.`
          : 'Analyse a second serve and you can put them side by side here.'}
      </p>
    )
  }

  const overallDelta = current.overall - against.overall

  return (
    <div className="compare">
      <label className="compare-pick">
        <span>Compare against</span>
        <select value={against.id} onChange={(e) => setAgainstId(e.target.value)}>
          {candidates.map((s, i) => (
            <option key={s.id} value={s.id}>
              {i === 0 ? 'Your best · ' : ''}
              {new Date(s.createdAt).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
              })}
              {' · '}
              {s.overall}
            </option>
          ))}
        </select>
      </label>

      <div className="compare-head">
        <div className="compare-score">
          <span className="compare-score-value tnum">{current.overall}</span>
          <span className="compare-score-label">this serve</span>
        </div>
        <div className={`compare-arrow compare-arrow--${verdict(overallDelta)}`}>
          {overallDelta > 0 ? '+' : ''}
          {overallDelta}
        </div>
        <div className="compare-score">
          <span className="compare-score-value tnum">{against.overall}</span>
          <span className="compare-score-label">
            {new Date(against.createdAt).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
            })}
          </span>
        </div>
      </div>

      <section className="block">
        <h3 className="block-title">The same positions, side by side</h3>
        <div className="compare-strip">
          {COMPARED.map((id) => {
            const a = current.phases.find((p) => p.id === id)
            const b = against.phases.find((p) => p.id === id)
            if (!a?.thumbnail && !b?.thumbnail) return null
            return (
              <figure key={id} className="compare-pair">
                <figcaption>{a?.label ?? id}</figcaption>
                <div className="compare-pair-images">
                  <span>
                    {a?.thumbnail ? (
                      <img src={a.thumbnail} alt={`${a.label}, this serve`} loading="lazy" />
                    ) : (
                      <div className="strip-placeholder" />
                    )}
                    <em>now</em>
                  </span>
                  <span>
                    {b?.thumbnail ? (
                      <img src={b.thumbnail} alt={`${b.label}, the serve compared against`} loading="lazy" />
                    ) : (
                      // Stills are dropped from older reports before their
                      // numbers are, so a comparison can outlive its pictures.
                      <div className="strip-placeholder">
                        <span>Picture not kept</span>
                      </div>
                    )}
                    <em>then</em>
                  </span>
                </div>
              </figure>
            )
          })}
        </div>
      </section>

      <section className="block">
        <h3 className="block-title">What actually changed</h3>
        <ul className="compare-rows">
          {rows.map((r) => (
            <li key={r.id} className={`compare-row compare-row--${verdict(r.scoreDelta)}`}>
              <span className="compare-row-label">{r.label}</span>
              <span className="compare-row-values">
                <em>{readoutOf(r.id, r.theirs)}</em>
                <Icon name="chevron" size={13} />
                <strong>{readoutOf(r.id, r.mine)}</strong>
              </span>
              <span className="compare-row-delta tnum">
                {r.scoreDelta > 0 ? '+' : ''}
                {r.scoreDelta}
              </span>
            </li>
          ))}
        </ul>
        <p className="compare-note">
          Then on the left, now on the right. The figure is the change in score, not in the
          measurement — a position can shift a long way inside its band and barely matter.
        </p>
      </section>
    </div>
  )
}

/** A change smaller than this is serve-to-serve noise, not an improvement. */
const MEANINGFUL = 3

const verdict = (delta: number) =>
  Math.abs(delta) < MEANINGFUL ? 'flat' : delta > 0 ? 'better' : 'worse'
