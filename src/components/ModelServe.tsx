import { useEffect, useState } from 'react'
import type { ModelServe as Serve } from '../lib/figure/modelMotion'
import RigPlayer from './RigPlayer'

interface Props {
  racket: 'left' | 'right'
  /** The serve, already built. Only a test passes it; the app loads it here. */
  serve?: Serve
}

/**
 * A model serve to watch (L4.3): a real serve from the Bath capture, looped,
 * with its six moments as pills and what each should look like under them.
 *
 * Loaded on mount rather than with the screen, so its data costs nothing until
 * somebody is looking at it. A serve that cannot be built removes itself.
 */
export default function ModelServe({ racket, serve: given }: Props) {
  const [serve, setServe] = useState<Serve | null | undefined>(given)

  useEffect(() => {
    if (given) return
    let live = true
    import('../lib/figure/modelMotion')
      .then(({ modelMotion }) => live && setServe(modelMotion(racket) ?? null))
      .catch(() => live && setServe(null))
    return () => {
      live = false
    }
  }, [racket, given])

  if (serve === null) return null
  return (
    <div className="model-serve">
      {serve ? (
        <RigPlayer
          serves={[serve]}
          moment="trophy"
          racket={racket}
          groupLabel="A model serve to watch, with its six moments."
          canvasLabel="A real serve, drawn as a lit figure, on a loop."
        />
      ) : (
        <div className="fault-demo-wait" aria-busy="true" />
      )}
      <p className="player-note">
        A real serve from a motion capture lab, with the ball drawn in. A good one to learn from, not
        the only right one.
      </p>
    </div>
  )
}
