import { useEffect, useState } from 'react'
import type { FlawId } from '../lib/analysis/flaws'
import type { FaultDemo } from '../lib/faultDemo'
import { PART_NAME, VIEW_LINE } from '../lib/faultDemoDials'
import RigPlayer from './RigPlayer'

interface Props {
  flaw: FlawId
  racket: 'left' | 'right'
}

/**
 * The named fault, moving, beside its fix — see `lib/faultDemo.ts`.
 *
 * The rig is loaded with the tap rather than with the report: it is the whole
 * synthetic serve, and the report is complete without a picture nobody asked
 * for. A demonstration that cannot be built removes itself rather than leaving
 * an empty box under a heading.
 */
export default function FaultDemoPanel({ flaw, racket }: Props) {
  const [demo, setDemo] = useState<FaultDemo | null | undefined>(undefined)

  useEffect(() => {
    let live = true
    import('../lib/faultDemo')
      .then(({ faultDemo }) => live && setDemo(faultDemo(flaw, racket) ?? null))
      .catch(() => live && setDemo(null))
    return () => {
      live = false
    }
  }, [flaw, racket])

  if (demo === null) return null
  return (
    <div className="fault-demo">
      {demo ? (
        <RigPlayer
          serves={[demo.fault, demo.fix]}
          labels={['This fault', 'The fix']}
          moment={demo.moment}
          racket={demo.racket}
          fault={{ part: demo.part }}
          fitBall={demo.fitBall}
          groupLabel="A model serve with this fault, beside the same serve fixed."
          canvasLabel="Two figures serving side by side: on the left with this fault, on the right without it."
        />
      ) : (
        <div className="fault-demo-wait" aria-busy="true" />
      )}
      {/* What to look at, named (L4.5): the one part the two bodies differ in. */}
      {demo && <p className="fault-demo-watch">Watch {PART_NAME[demo.part]}.</p>}
      {/* A view other than side-on, said, so nobody holds it against their own clip (C1.2). */}
      {demo && VIEW_LINE[demo.view] && <p className="player-note">{VIEW_LINE[demo.view]}</p>}
      <p className="player-note">
        A demo serve, not yours. The left figure shows the fault in red and the fix dashed, and the right one shows it fixed.
      </p>
    </div>
  )
}
