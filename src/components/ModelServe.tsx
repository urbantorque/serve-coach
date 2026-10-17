import { useEffect, useState } from 'react'
import type { DemoServe } from '../lib/faultDemo'
import RigPlayer from './RigPlayer'

interface Props {
  racket: 'left' | 'right'
  /** The serve, already built. Only a test passes it; the app loads it here. */
  serve?: DemoServe
  /** Fewer controls and a capped redraw rate, for the analysing screen. */
  quiet?: boolean
}

/**
 * A model serve to watch (L4.3): the clean rig serve, looped, with its six
 * moments as pills and what each should look like under them.
 *
 * Loaded on mount rather than with the screen: the rig is the whole synthetic
 * serve, and it shares its chunk with the fault demonstrations. A serve that
 * cannot be built removes itself.
 */
export default function ModelServe({ racket, serve: given, quiet = false }: Props) {
  const [serve, setServe] = useState<DemoServe | null | undefined>(given)

  useEffect(() => {
    if (given) return
    let live = true
    import('../lib/faultDemo')
      .then(({ modelServe }) => live && setServe(modelServe(racket) ?? null))
      .catch(() => live && setServe(null))
    return () => {
      live = false
    }
  }, [racket, given])

  if (serve === null) return null
  return (
    <div className={`model-serve${quiet ? ' model-serve--quiet' : ''}`}>
      {serve ? (
        <RigPlayer
          serves={[serve]}
          moment="trophy"
          racket={racket}
          groupLabel="A model serve to watch, with its six moments."
          canvasLabel="A stick figure serving cleanly, on a loop."
          speeds={!quiet}
          maxFps={quiet ? 15 : undefined}
        />
      ) : (
        <div className="fault-demo-wait" aria-busy="true" />
      )}
      <p className="player-note">
        A drawn model serve, not a real player. Tap a moment to stop on it and read what to look
        for.
      </p>
    </div>
  )
}
