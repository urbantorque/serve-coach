import { ScoreRing, Icon } from './primitives'
import { tripsOf } from '../lib/progress'
import { serveStory } from '../lib/serveStory'
import type { ServeTag, Session } from '../lib/storage/db'

interface Props {
  sessions: Session[]
  tags?: ReadonlyMap<string, ServeTag>
  onOpen: (s: Session) => void
  onDelete: (id: string) => void
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

/**
 * Every serve, grouped by trip to the court, newest first (N3.5).
 *
 * The list was one long run of rows, and a basket of twelve read as twelve
 * unrelated reports. A trip is the app's own (`tripsOf`: serves under a day
 * apart), headed by its date, how many serves it held and its typical score,
 * the median the progress screen leads with too. Each row says what set that
 * serve apart, as the cards on Today do.
 */
export default function HistoryList({ sessions, tags, onOpen, onDelete }: Props) {
  const trips = tripsOf(sessions).reverse()
  return (
    <div className="history">
      {trips.map((trip) => {
        const newest = [...trip].sort((a, b) => b.createdAt - a.createdAt)
        const day = new Date(trip[0].createdAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
        return (
          <section className="history-trip" key={trip[0].id}>
            <h3 className="history-trip-head">
              <span>{day}</span>
              <span className="tnum">
                {trip.length === 1 ? '1 serve' : `${trip.length} serves, typical score ${median(trip.map((s) => s.overall))}`}
              </span>
            </h3>
            <ul>
              {newest.map((s) => (
                <li key={s.id}>
                  <button className="recent" onClick={() => onOpen(s)}>
                    <ScoreRing score={s.overall} status={s.overallStatus} size={42} animate={false} />
                    <span className="recent-text">
                      <strong>{serveStory(s, sessions, tags).title}</strong>
                      <span>
                        {new Date(s.createdAt).toLocaleString(undefined, {
                          day: 'numeric',
                          month: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    </span>
                  </button>
                  <button
                    className="icon-btn icon-btn--quiet"
                    onClick={() => onDelete(s.id)}
                    aria-label={`Delete serve from ${new Date(s.createdAt).toLocaleDateString()}`}
                  >
                    <Icon name="trash" size={17} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
