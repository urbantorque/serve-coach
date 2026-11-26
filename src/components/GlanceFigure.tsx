/**
 * The serve the court screen is about, drawn beside its reading on a laptop
 * (E5.7): the player's own body, held at the moment the fix is read at, with
 * the part it is about painted in `--work`, as the report and the serve cards
 * paint it. A laptop has the width for a picture; a phone is read from the
 * fence and keeps its one column. Loaded on a laptop only, so a phone never
 * fetches the figure.
 */
import { useMemo } from 'react'
import type { FlawId } from '../lib/analysis/flaws'
import type { Analysis } from '../lib/analysis/types'
import { swingOf, workParts } from '../lib/figure/swing'
import { faultMoment } from '../lib/lookFor'
import type { Session } from '../lib/storage/db'
import { heldAt, heldCaption } from '../screens/report/heldMoment'
import AthleteCanvas from './AthleteCanvas'

interface Props {
  analysis: Analysis | Session
  /** The fault the screen's line is about: its moment is the one held. */
  about?: FlawId
  /** Painted only when this serve had it. */
  paint?: boolean
}

export default function GlanceFigure({ analysis, about, paint }: Props) {
  const swing = useMemo(() => swingOf(analysis), [analysis])
  if (!swing) return null
  const moment = (about && faultMoment(analysis.fundamentals ?? [], about)) || 'contact'
  const at = swing.moments[moment] ?? swing.moments.contact ?? swing.frames.length - 1
  return (
    <figure className="glance-figure">
      <div className="glance-stage">
        <AthleteCanvas
          swing={swing}
          mode="pose"
          at={at}
          work={about && paint ? workParts(about, swing.racket) : undefined}
          fit={{ height: 0.7, feet: 0.92 }}
          label={`Your serve, ${heldAt(moment).toLowerCase()}`}
        />
      </div>
      <figcaption>{heldCaption(moment)}</figcaption>
    </figure>
  )
}
