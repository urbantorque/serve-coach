import { useState } from 'react'
import { Icon } from './primitives'
import { progressionFor } from '../lib/analysis/progressions'
import { primeSpeech, speakLocally } from '../lib/speech'
import { useWakeLock } from './useWakeLock'
import type { WeekItem } from '../lib/weekPlan'

/**
 * The drill in large type, for a phone on the fence (N1.7).
 *
 * The report's drill card is a paragraph in 14 px under a heading; nobody reads
 * that from the baseline. This is the same drill, its feel and its pass bar,
 * big enough to read from there, read aloud on a tap, with a rep counter the
 * whole screen answers to and the screen kept awake while it is open.
 */
export function CourtCard({ item, onClose }: { item: Pick<WeekItem, 'drill' | 'flaw' | 'check'>; onClose: () => void }) {
  useWakeLock(true)
  const [reps, setReps] = useState(0)
  const feel = item.flaw ? progressionFor(item.flaw)?.cue : undefined
  const say = () => {
    primeSpeech()
    speakLocally([item.drill.name, item.drill.how, feel, item.check].filter(Boolean).join('. '))
  }
  return (
    <div className="court-card" role="dialog" aria-modal="true" aria-label={`Drill: ${item.drill.name}`}>
      <div className="court-card-top">
        <button type="button" className="btn btn--ghost" onClick={say}>
          Read aloud
        </button>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close the drill">
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
