/**
 * A drill's key position, small, on today's session sheet (Mirror M2.4).
 *
 * `ModelPose` is the lesson's own "The fix": the clean model serve at the
 * moment the drill's fault is read at, from the camera it is shown from, so a
 * row of minutes and drill names shows the shape each drill builds. It says it
 * is the model. `OwnPose` is the player's last serve at the first drill's
 * fault, the part painted only when that serve had it: where the check will
 * start from. Neither is drawn without a body to draw.
 */
import { useMemo } from 'react'
import type { FlawId } from '../lib/analysis/flaws'
import type { PhaseId } from '../lib/analysis/types'
import { judgeServe } from '../lib/analysis/progressions'
import { fixPose } from '../lib/faultDemo'
import { swingOf, workParts, type Swing } from '../lib/figure/swing'
import { faultMoment } from '../lib/lookFor'
import type { Session } from '../lib/storage/db'
import { heldAt } from '../screens/report/heldMoment'
import AthleteCanvas from './AthleteCanvas'

const FIT = { height: 0.86, feet: 0.95 }
/** "the trophy", "contact": the moment as the held frame's caption names it. */
const at = (moment: PhaseId) => heldAt(moment).replace(/^Paused at /, '')

export function ModelPose({ flaw, racket }: { flaw: FlawId; racket: 'left' | 'right' }) {
  const pose = useMemo(() => fixPose(flaw, racket), [flaw, racket])
  const swing = useMemo<Swing | undefined>(
    () => pose && { frames: pose.serve.frames, moments: Object.fromEntries(pose.serve.phases.map((p) => [p.id, p.frame])), racket },
    [pose, racket],
  )
  if (!pose || !swing) return null
  return (
    <span className="drill-pose">
      <AthleteCanvas swing={swing} mode="pose" at={swing.moments[pose.moment] ?? 0} fit={FIT} label={`The model serve at ${at(pose.moment)}, the shape this drill builds`} />
    </span>
  )
}

export function OwnPose({ session, flaw }: { session: Session; flaw: FlawId }) {
  const swing = useMemo(() => swingOf(session), [session])
  if (!swing) return null
  const moment = faultMoment(session.fundamentals ?? [], flaw) ?? 'contact'
  const had = judgeServe(session, flaw) === 'named'
  return (
    <span className="drill-pose drill-pose--own">
      <AthleteCanvas
        swing={swing}
        mode="pose"
        at={swing.moments[moment] ?? swing.frames.length - 1}
        work={had ? workParts(flaw, swing.racket) : undefined}
        fit={FIT}
        label={`Your last serve at ${at(moment)}`}
      />
    </span>
  )
}
