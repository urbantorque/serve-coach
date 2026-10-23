import { useState } from 'react'
import { Icon } from './primitives'
import type { CourtMinutes } from '../lib/courtPlan'
import { progressionFor } from '../lib/analysis/progressions'
import { readPrefs } from '../lib/storage/prefs'
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
 * Today on court's tools (N1.6): the court card for the first drill, and the
 * week in the phone's calendar. The plan itself, with each drill's minutes, is
 * Home's "This week" since Q9; this is the part of it that can load late.
 */
export default function TodayPlan({ week, minutes }: { week: WeekPlan; minutes: CourtMinutes }) {
  const [card, setCard] = useState(false)
  const first = week.items[0]
  return (
    <div className="today">
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
    </div>
  )
}
