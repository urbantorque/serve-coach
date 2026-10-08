import { useRef } from 'react'
import type { Phase } from '../lib/analysis/types'

interface Props {
  /** This serve's kept clip, as an object URL. */
  url: string
  phases: Phase[]
  /** Width over height, so the box holds its shape before the video's first frame arrives. */
  aspect?: number
  /** The best earlier serve's kept clip, to play beside this one, when it was kept too. */
  beside?: { url: string; phases: Phase[]; aspect?: number }
}

/** Where both clips start when played together: just before the toss. */
const LEAD_SECONDS = 0.3

/**
 * A reopened report's own video, kept on this device (D6.4).
 *
 * The real clip, not the tracked body: a kept video carries what a skeleton
 * cannot — the ball, the racket, the court. The keyframe buttons seek to the
 * moments the report reads, on the file's own clock, which is the clock the
 * report's keyframes are stored on.
 *
 * Beside the best serve, when its clip was kept too: two videos, started
 * together from just before each toss at half speed, so the same moment of
 * both serves is on screen at once.
 */
export default function KeptVideo({ url, phases, aspect, beside }: Props) {
  const shape = (a?: number) => (a && Number.isFinite(a) ? { aspectRatio: String(a) } : undefined)
  const mine = useRef<HTMLVideoElement>(null)
  const theirs = useRef<HTMLVideoElement>(null)

  const seek = (t: number) => {
    const v = mine.current
    if (!v) return
    v.pause()
    v.currentTime = t
  }

  const tossOf = (ps: Phase[]) => ps.find((p) => p.id === 'toss')?.t ?? ps[0]?.t ?? 0

  const playTogether = () => {
    const pairs: [HTMLVideoElement | null, Phase[]][] = [
      [mine.current, phases],
      [theirs.current, beside?.phases ?? []],
    ]
    for (const [v, ps] of pairs) {
      if (!v) continue
      v.pause()
      v.currentTime = Math.max(0, tossOf(ps) - LEAD_SECONDS)
      v.playbackRate = 0.5
    }
    for (const [v] of pairs) void v?.play().catch(() => undefined)
  }

  return (
    <div className="kept">
      {beside ? (
        <div className="kept-pair">
          <figure className="kept-one">
            <video ref={mine} src={url} controls playsInline preload="metadata" style={shape(aspect)} />
            <figcaption>This serve</figcaption>
          </figure>
          <figure className="kept-one">
            <video ref={theirs} src={beside.url} controls playsInline preload="metadata" muted style={shape(beside.aspect)} />
            <figcaption>Your best</figcaption>
          </figure>
        </div>
      ) : (
        <video ref={mine} className="kept-video" src={url} controls playsInline preload="metadata" style={shape(aspect)} />
      )}
      <div className="kept-actions">
        {beside && (
          <button className="chip chip--button" onClick={playTogether}>
            Play both from the toss
          </button>
        )}
        {phases.map((p) => (
          <button key={p.id} className="chip chip--button" onClick={() => seek(p.t)}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}
