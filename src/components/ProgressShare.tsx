import { useMemo } from 'react'
import { Icon } from './primitives'
import { useShareState } from './useShareState'
import { clipsWork, shareGraduationCard, shareSeasonCard, shareThenNowClip, shareTripCard, type SeasonRecords } from '../lib/share/reportCard'
import type { GraduationCard } from '../lib/graduationCard'
import { swingOf } from '../lib/figure/swing'
import { SOFT_READ } from './statusLabels'
import { shortDate, tripsOf, tripSummary } from '../lib/progress'
import type { Session } from '../lib/storage/db'

interface Props {
  records: SeasonRecords
  sessions: Session[]
  strainLine?: string
  /** A fault fixed lately, then and now (L3.12). */
  fixed: GraduationCard[]
  /** The widest honest pair, for a clip of the two side by side. */
  thenNow?: { then: Session; now: Session }
}

const WEEK = 7 * 24 * 60 * 60 * 1000

function shareBothSwings({ then, now }: { then: Session; now: Session }) {
  const a = swingOf(then)
  const b = swingOf(now)
  if (!a || !b) return Promise.resolve('failed' as const)
  const weeks = Math.round((now.createdAt - then.createdAt) / WEEK)
  return shareThenNowClip(
    { swing: a, caption: shortDate(then.createdAt), score: then.overall, soft: then.quality.confidence < SOFT_READ },
    { swing: b, caption: shortDate(now.createdAt), score: now.overall, soft: now.quality.confidence < SOFT_READ },
    weeks > 1 ? `${weeks} weeks apart` : 'Then, and now',
  )
}

/**
 * One share button for the whole sheet (L4.9). It opens onto the cards there
 * are to share — the season, the last trip, each fault fixed lately — and each
 * leaves the phone only on its own tap. Three buttons in three places used to
 * mean three different ideas of what "share" was for on one screen.
 *
 * The same rules as the buttons it replaces: no season card below two records,
 * no trip card below two serves. With nothing to share it renders nothing.
 */
export default function ProgressShare({ records, sessions, strainLine, fixed, thenNow }: Props) {
  const trip = useMemo(() => {
    const trips = tripsOf(sessions)
    const last = trips[trips.length - 1]
    return last ? tripSummary(last, sessions) : undefined
  }, [sessions])
  const seasonCount = [records.streak, records.longestStreak, records.bestScore, records.bestGap].filter(Boolean).length
  const season = seasonCount >= 2
  const tripOk = trip !== undefined && trip.serves >= 2
  const clip = thenNow && clipsWork()
  if (!season && !tripOk && !fixed.length && !clip) return null

  return (
    <details className="share-menu">
      <summary className="btn btn--ghost btn--full share-menu-head">
        <Icon name="share" size={17} />
        Share your progress
      </summary>
      <div className="share-menu-list">
        {clip && <ShareOption label="Then and now, a slow clip" run={() => shareBothSwings(thenNow)} />}
        {season && <ShareOption label="Your season" run={() => shareSeasonCard(records, Date.now())} />}
        {tripOk && <ShareOption label="This session" run={() => shareTripCard(trip!, strainLine)} />}
        {fixed.map((card) => (
          <ShareOption key={card.flaw} label={`${card.name} fixed`} run={() => shareGraduationCard(card)} />
        ))}
      </div>
    </details>
  )
}

function ShareOption({ label, run }: { label: string; run: () => ReturnType<typeof shareSeasonCard> }) {
  const { sharing, trigger } = useShareState(run)
  return (
    <button
      type="button"
      className="share-option"
      onClick={() => void trigger()}
      disabled={sharing === 'working'}
    >
      <Icon name={sharing === 'done' ? 'check' : 'share'} size={15} />
      {sharing === 'working' ? 'Preparing…' : sharing === 'done' ? 'Saved' : label}
      <span className="sr-only" role="status" aria-live="polite">
        {sharing === 'done' ? 'Saved' : ''}
      </span>
    </button>
  )
}
