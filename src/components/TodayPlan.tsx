import { useState } from 'react'
import { Icon } from './primitives'
import { COURT_MINUTES, courtPlan, type CourtMinutes } from '../lib/courtPlan'
import { progressionFor } from '../lib/analysis/progressions'
import { readPrefs, writePrefs } from '../lib/storage/prefs'
import { primeSpeech, speakLocally } from '../lib/speech'
import { useWakeLock } from './useWakeLock'
import type { WeekItem, WeekPlan } from '../lib/weekPlan'
import { weekCalendar } from '../lib/calendar'
import { shareBlob } from '../lib/share/reportCard'

/**
 * The drill in large type, for a phone on the fence (N1.7).
 *
 * The report's drill card is a paragraph in 14 px under a heading; nobody reads
 * that from the baseline. This is the same drill, its feel and its pass bar,
 * big enough to read from there, read aloud on a tap, with a rep counter the
 * whole screen answers to and the screen kept awake while it is open.
 */
function CourtCard({ item, onClose }: { item: WeekItem; onClose: () => void }) {
  useWakeLock(true)
  const [reps, setReps] = useState(0)
  const feel = item.flaw ? progressionFor(item.flaw)?.cue : undefined
  const say = () => {
    primeSpeech()
    speakLocally([item.drill.name, item.drill.how, feel, item.check].filter(Boolean).join('. '))
  }
  return (
    <div className="court-card" role="dialog" aria-modal="true" aria-label={`Court card: ${item.drill.name}`}>
      <div className="court-card-top">
        <button type="button" className="btn btn--ghost" onClick={say}>
          Read aloud
        </button>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close the court card">
          <Icon name="close" size={20} />
        </button>
      </div>
      <h2 className="court-card-name">{item.drill.name}</h2>
      <p className="court-card-how">{item.drill.how}</p>
      {feel && <p className="court-card-feel">Feel: {feel}</p>}
      <p className="court-card-bar">{item.check}</p>
      <button type="button" className="court-card-count" onClick={() => setReps((r) => r + 1)}>
        <span className="tnum">{reps}</span>
        <span>{item.drill.reps}. Tap for each one.</span>
      </button>
      {reps > 0 && (
        <button type="button" className="btn btn--ghost" onClick={() => setReps(0)}>
          Start the count again
        </button>
      )}
    </div>
  )
}

/**
 * Today on court (N1.6): the week's drills fitted to the time the player has,
 * with the court card for the first one. Lazily loaded by Home.
 */
export default function TodayPlan({ week }: { week: WeekPlan }) {
  const [minutes, setMinutes] = useState<CourtMinutes>(() => readPrefs().courtMinutes ?? 45)
  const [card, setCard] = useState(false)
  const blocks = courtPlan(week, minutes)
  const first = week.items[0]
  return (
    <section className="block today" aria-labelledby="today-title">
      <div className="block-head">
        <h2 className="block-title" id="today-title">
          Today on court
        </h2>
        <div className="seg" role="group" aria-label="How long you have">
          {COURT_MINUTES.map((m) => (
            <button
              key={m}
              type="button"
              className={`seg-item${minutes === m ? ' is-on' : ''}`}
              aria-pressed={minutes === m}
              onClick={() => {
                setMinutes(m)
                writePrefs({ courtMinutes: m })
              }}
            >
              {m} min
            </button>
          ))}
        </div>
      </div>
      <ol className="today-list">
        {blocks.map((b, i) => (
          <li key={i}>
            <span className="tnum today-min">{b.minutes} min</span>
            <span>{b.line}</span>
          </li>
        ))}
      </ol>
      {first && (
        <button type="button" className="btn btn--ghost btn--full" onClick={() => setCard(true)}>
          <Icon name="target" size={17} />
          Open the court card
        </button>
      )}
      {/* The next sessions in the phone's own calendar (M3.1): reminders
          without a server. Shared or downloaded; the app sends nothing. */}
      <button
        type="button"
        className="btn btn--ghost btn--full"
        onClick={() => {
          const ics = weekCalendar(week, { now: new Date(), cadence: readPrefs().cadence, minutes })
          void shareBlob(new Blob([ics], { type: 'text/calendar' }), 'serve-practice.ics', 'Serve practice', 'text/calendar')
        }}
      >
        <Icon name="calendar" size={17} />
        Add to calendar
      </button>
      {card && first && <CourtCard item={first} onClose={() => setCard(false)} />}
    </section>
  )
}
