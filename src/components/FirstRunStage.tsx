import { useEffect, useState } from 'react'
import { modelMotion } from '../lib/figure/modelMotion'
import type { Swing } from '../lib/figure/swing'
import AthleteCanvas from './AthleteCanvas'

/**
 * The first thing a new player sees: a real serve, moving. Its own chunk, so the
 * promise beside it can draw at once and the serve arrives a moment later.
 */
export default function FirstRunStage({ racket = 'right' }: { racket?: 'left' | 'right' }) {
  const [swing, setSwing] = useState<Swing>()
  useEffect(() => {
    const m = modelMotion(racket)
    if (m) setSwing({ frames: m.frames, moments: Object.fromEntries(m.phases.map((p) => [p.id, p.frame])), racket })
  }, [racket])
  if (!swing) return null
  return (
    <AthleteCanvas
      swing={swing}
      mode="loop"
      at={swing.moments.contact ?? 0}
      rate={0.4}
      // Feet at 70%, not 84% (N7.6): the sample report's peek sits under the serve.
      fit={{ height: 0.48, feet: 0.7, across: 0.44 }}
      label="A real serve from a motion capture lab, playing slowly."
      className="stage-canvas"
    />
  )
}
