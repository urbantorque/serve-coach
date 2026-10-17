import { useMemo } from 'react'
import { Icon } from './primitives'
import { useShareState } from './useShareState'
import { shareGraduationCard, shareSeasonCard, shareTripCard, type SeasonRecords } from '../lib/share/reportCard'
import type { GraduationCard } from '../lib/graduationCard'
import { tripsOf, tripSummary } from '../lib/progress'
import type { Session } from '../lib/storage/db'

interface Props {
  records: SeasonRecords
  sessions: Session[]
  strainLine?: string
  /** A fault fixed lately, then and now (L3.12). */
  fixed: GraduationCard[]
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
export default function ProgressShare({ records, sessions, strainLine, fixed }: Props) {
  const trip = useMemo(() => {
    const trips = tripsOf(sessions)
    const last = trips[trips.length - 1]
    return last ? tripSummary(last, sessions) : undefined
  }, [sessions])
  const seasonCount = [records.streak, records.longestStreak, records.bestScore, records.bestGap].filter(Boolean).length
  const season = seasonCount >= 2
  const tripOk = trip !== undefined && trip.serves >= 2
  if (!season && !tripOk && !fixed.length) return null

  return (
    <details className="share-menu">
      <summary className="btn btn--ghost btn--full share-menu-head">
        <Icon name="share" size={17} />
        Share your progress
      </summary>
      <div className="share-menu-list">
        {season && <ShareOption label="Your season" run={() => shareSeasonCard(records, Date.now())} />}
        {tripOk && <ShareOption label="This trip" run={() => shareTripCard(trip!, strainLine)} />}
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
      aria-live="polite"
    >
      <Icon name={sharing === 'done' ? 'check' : 'share'} size={15} />
      {sharing === 'working' ? 'Preparing…' : sharing === 'done' ? 'Saved' : label}
    </button>
  )
}
