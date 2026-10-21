import { useEffect, useRef } from 'react'
import { drawSkeleton, fitContain } from '../lib/pose/skeleton'
import type { CardPose } from '../lib/graduationCard'

function Half({ pose, label }: { pose: CardPose; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round((canvas.clientWidth || 140) * dpr)
    canvas.height = Math.round((canvas.clientHeight || 180) * dpr)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawSkeleton(ctx, { frame: pose.frame, aspect: pose.aspect, rect: fitContain(canvas.width, canvas.height, pose.aspect), racket: pose.racket })
  }, [pose])
  return (
    <figure className="fixed-pair-half">
      <canvas ref={ref} className="strip-pose" role="img" aria-label={`${label}, as the tracked body`} />
      <figcaption>{label}</figcaption>
    </figure>
  )
}

/**
 * The fault's moment, then and now, side by side (N3.3).
 *
 * A fault fixed, or a step passed, was a sentence and a share card nobody
 * opened; the evidence for it was the player's own two serves, and only the
 * share card ever drew them. Same renderer and same fit as the filmstrip.
 */
export default function FixedPair({ then, now, title, line }: { then: CardPose; now: CardPose; title: string; line?: string }) {
  const day = (at: number) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return (
    <div className="fixed-pair">
      <p className="fixed-pair-title">{title}</p>
      <div className="fixed-pair-row">
        <Half pose={then} label={`Then, ${day(then.at)}`} />
        <Half pose={now} label={`Now, ${day(now.at)}`} />
      </div>
      {line && <p className="fixed-pair-line">{line}</p>}
    </div>
  )
}
