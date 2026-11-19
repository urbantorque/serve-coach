import { useEffect, useState } from 'react'
import { modelMotion } from '../lib/figure/modelMotion'
import type { Swing } from '../lib/figure/swing'
import AthleteCanvas from './AthleteCanvas'

/**
 * The model serve laid down as one picture, racket path and all (N5.2): the
 * picture beside an empty Progress on a laptop, where the right pane would
 * otherwise be a dark field. A still, not a loop, because nothing loops on a
 * screen that is not the waiting screen or the first run. Its own chunk.
 */
export default function ModelExposure({ racket = 'right' }: { racket?: 'left' | 'right' }) {
  const [swing, setSwing] = useState<Swing>()
  useEffect(() => {
    const m = modelMotion(racket)
    if (m) setSwing({ frames: m.frames, moments: Object.fromEntries(m.phases.map((p) => [p.id, p.frame])), racket })
  }, [racket])
  if (!swing) return null
  return (
    <AthleteCanvas
      swing={swing}
      mode="exposure"
      at={swing.moments.contact ?? swing.frames.length - 1}
      fit={{ height: 0.54, feet: 0.9, across: 0.5 }}
      label="A real serve from a motion capture lab, drawn as one picture."
      className="stage-canvas"
    />
  )
}
