import { useEffect, useState } from 'react'
import type { PhaseId } from '../lib/analysis/types'
import { modelMotion } from '../lib/figure/modelMotion'
import type { Swing } from '../lib/figure/swing'
import AthleteCanvas from './AthleteCanvas'

interface Props {
  racket: 'left' | 'right'
  /** The moment the coach is talking about. */
  moment: PhaseId
  /** The parts of the body to light. */
  work: string[]
  label: string
}

/**
 * A real serve, stopped at what the coach is describing, with the part it reads
 * lit. Its own chunk, because it carries the captured serve.
 */
export default function TeachStage({ racket, moment, work, label }: Props) {
  const [swing, setSwing] = useState<Swing>()
  useEffect(() => {
    const m = modelMotion(racket)
    if (m) setSwing({ frames: m.frames, moments: Object.fromEntries(m.phases.map((p) => [p.id, p.frame])), racket })
  }, [racket])
  if (!swing) return null
  return (
    <AthleteCanvas
      key={moment}
      swing={swing}
      mode="reveal"
      at={swing.moments[moment] ?? swing.frames.length - 1}
      rate={0.5}
      work={work}
      teach
      fit={{ height: 0.62, feet: 0.9 }}
      label={label}
      className="stage-canvas"
    />
  )
}
