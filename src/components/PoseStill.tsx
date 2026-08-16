import { useEffect, useRef } from 'react'
import { drawSkeleton, fitContain } from '../lib/pose/skeleton'
import { poseFrameAt, type KeyframePoses } from '../lib/storage/poseTrack'
import type { PhaseId } from '../lib/analysis/types'

/**
 * One keyframe, drawn as the body the tracker saw, where the photograph is gone.
 *
 * The prune ladder strips a report's keyframe JPEGs past `KEEP_STILLS`, so a
 * report from two months ago rendered six grey rectangles: the numbers survived
 * and the pictures did not. This draws what was actually measured instead, from
 * `Analysis.poses`, which is fifteen to thirty times cheaper than the stills and
 * therefore still there.
 *
 * DELIBERATELY NOT A REPLACEMENT PHOTOGRAPH. It is the tracked body on the
 * report's own background, with no attempt to look like a frame of video — no
 * court, no fence, no player. Somebody who has seen both must never be in doubt
 * about which they are looking at, because the two carry different information:
 * a still shows the grip and the light, and this shows only what the numbers
 * were read from. Drawn in the same skeleton the player and the live stills use,
 * so it is the same body in the same style rather than a second rendering with
 * its own opinions.
 *
 * Owns the whole "what goes in this slot" decision, placeholder included, rather
 * than returning nothing and leaving the caller to guess. A report written
 * before poses existed and a keyframe nothing could read are the same thing from
 * the strip's point of view — an empty box — and having one component decide
 * that is what keeps the two branches in the filmstrip identical.
 */
export default function PoseStill({
  poses,
  index,
  racket,
  label,
}: {
  poses: KeyframePoses | undefined
  /** Position in the report's own `phases` array — see `keyframePoses`. */
  index: number
  racket: 'left' | 'right'
  /** The keyframe's name, for anything that cannot see the drawing. */
  label: string
  /** Which keyframe, where the skeleton has an angle callout for it. */
  annotation?: PhaseId
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const frame = poseFrameAt(poses, index)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !frame || !poses) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    /*
     * Drawn at the canvas' backing resolution rather than its CSS size, and
     * re-read on every paint rather than measured once: these sit in a
     * horizontally scrolling strip whose items are sized by CSS, so the element
     * has no width at all on the first paint of a report that opens scrolled.
     */
    const w = canvas.clientWidth || canvas.width
    const h = canvas.clientHeight || canvas.height
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    drawSkeleton(ctx, {
      frame,
      aspect: poses.aspect,
      /*
       * `fitContain` rather than the whole canvas, so the body keeps the
       * proportions the clip was filmed at. Stretching a portrait serve to fill
       * a landscape box would change every angle the drawing shows, which is the
       * one thing this picture is for.
       */
      rect: fitContain(canvas.width, canvas.height, poses.aspect),
      racket,
    })
  }, [frame, poses, racket])

  if (!frame) return <div className="strip-placeholder" />
  return (
    <canvas
      ref={ref}
      className="strip-pose"
      // The drawing carries no text, so the keyframe's own name is the whole of
      // what a screen reader gets — and it says what this is rather than
      // implying a photograph that is not there.
      role="img"
      aria-label={`${label}, as the tracked body`}
    />
  )
}
