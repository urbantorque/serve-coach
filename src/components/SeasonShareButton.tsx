import { useEffect, useRef, useState } from 'react'
import { Icon } from './primitives'
import { shareSeasonCard, type SeasonRecords } from '../lib/share/reportCard'

interface Props {
  records: SeasonRecords
}

/**
 * Share every cross-session record together, in one image — see
 * `renderSeasonCard`. A tiny, self-contained button rather than more
 * `App.tsx`: the sharing state and the handler are the whole thing, the
 * same shape `ConsistencyPanel`'s own share button already is.
 *
 * Renders nothing below two records — a card of one line is not a season,
 * it is one of the other cards with the wrong title, and a button that
 * shares a nearly-blank image is worse than no button.
 */
export default function SeasonShareButton({ records }: Props) {
  const [sharing, setSharing] = useState<'idle' | 'working' | 'done'>('idle')
  const sharedTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(sharedTimer.current), [])

  const count = [records.streak, records.bestScore, records.bestSpeed, records.bestGap].filter(Boolean).length
  if (count < 2) return null

  const share = async () => {
    setSharing('working')
    const outcome = await shareSeasonCard(records, Date.now())
    const done = outcome === 'shared' || outcome === 'downloaded'
    setSharing(done ? 'done' : 'idle')
    if (done) {
      clearTimeout(sharedTimer.current)
      sharedTimer.current = setTimeout(() => setSharing('idle'), 2500)
    }
  }

  return (
    // `aria-live` so "Preparing…"/"Saved" reaches a screen reader as the
    // button's own text changes under it — see ConsistencyPanel's own share
    // button for the same reasoning; this one mirrors it.
    <button
      className="btn btn--ghost btn--full"
      onClick={() => void share()}
      disabled={sharing === 'working'}
      aria-live="polite"
    >
      <Icon name={sharing === 'done' ? 'check' : 'share'} size={17} />
      {sharing === 'working' ? 'Preparing…' : sharing === 'done' ? 'Saved' : 'Share your season'}
    </button>
  )
}
