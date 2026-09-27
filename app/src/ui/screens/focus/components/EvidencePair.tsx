import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo } from 'react'
import type { KeyFrameEvent } from '../../../../analysis/types.ts'
import type { CoachingSession, FocusEvidence } from '../../../../coaching/index.ts'
import { getKeyFrameFor } from '../../../../data/index.ts'
import { cx } from '../../../components/index.ts'
import { KEY_FRAME_LABEL } from '../../../copy/strings.ts'
import { FOCUS_COPY } from '../copy.ts'
import { sharedDomain, sketchFor, type Sketch, type SketchDomain } from './sketch.ts'

/**
 * A calm data drawing in the frame's place when no key frame was saved (sample data, or video and
 * frames deleted): ground line, front-toe line, standing height, and the serve positions at equal
 * scale. No numbers; the stats below carry them with their data-state chips.
 */
function FrameSketch({ sketch, domain, portrait, label }: { sketch: Sketch; domain: SketchDomain; portrait: boolean; label: string }) {
  const W = portrait ? 90 : 160
  const H = portrait ? 160 : 90
  const [x0, x1] = domain.x
  const [y0, y1] = domain.y
  const scale = Math.min((W - 10) / (x1 - x0), (H - 10) / (y1 - y0))
  const ox = (W - (x1 - x0) * scale) / 2 - x0 * scale
  const oy = (H + (y1 - y0) * scale) / 2 + y0 * scale
  const X = (x: number) => ox + x * scale
  const Y = (y: number) => oy - y * scale
  const sorted = [...sketch.points].sort((a, b) => Number(a.key) - Number(b.key))
  const r = Math.max(1.6, Math.min(3, 4 * scale))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block h-full w-full">
      <line x1={X(0)} x2={X(0)} y1={6} y2={H - 6} stroke="var(--color-line-strong)" strokeWidth={0.6} />
      {sorted.map((p, i) => (
        <circle
          key={i}
          cx={X(p.x)}
          cy={Y(p.y)}
          r={p.key ? r * 1.6 : r}
          fill={p.key ? 'var(--color-ink)' : 'var(--color-ink-3)'}
          stroke="var(--color-surface-2)"
          strokeWidth={p.key ? 1.2 : 0.7}
        />
      ))}
    </svg>
  )
}

function useKeyFrameUrl(serveId: string | undefined, event: KeyFrameEvent | null): { loading: boolean; url?: string; width?: number; height?: number } {
  const rec = useLiveQuery(async () => {
    if (!serveId || !event) return null
    return (await getKeyFrameFor(serveId, event, 'evidence')) ?? (await getKeyFrameFor(serveId, event, 'thumb')) ?? null
  }, [serveId, event])
  const url = useMemo(() => (rec?.blob ? URL.createObjectURL(rec.blob) : undefined), [rec])
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url])
  return { loading: rec === undefined, url, ...(rec ? { width: rec.width, height: rec.height } : {}) }
}

interface FrameProps {
  image: { loading: boolean; url?: string; width?: number; height?: number }
  domain: SketchDomain | null
  event: KeyFrameEvent | null
  caption: string
  sketch: Sketch | null
  portrait: boolean
  size: 'card' | 'page'
  focusMark?: boolean
}

function Frame({ image, domain, event, caption, sketch, portrait, size, focusMark }: FrameProps) {
  const { loading, url } = image
  const dims = portrait ? (size === 'page' ? 'aspect-[9/16] w-full' : 'h-32 w-18') : size === 'page' ? 'aspect-video w-full' : 'h-[85px] w-[151px]'
  const label = `${caption}: ${sketch?.kind === 'contact' ? 'contact points' : 'toss peaks'} drawn from your measurements`
  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      <div className={cx('relative overflow-hidden rounded-media bg-surface-2', dims)}>
        {url ? (
          <img src={url} width={image.width} height={image.height} alt={`${caption}, ${event ? KEY_FRAME_LABEL[event].toLowerCase() : 'key'} frame`} className="h-full w-full object-cover" />
        ) : !loading && sketch && domain ? (
          <FrameSketch sketch={sketch} domain={domain} portrait={portrait} label={label} />
        ) : null}
      </div>
      <figcaption className="flex items-center gap-1 text-footnote text-ink-2">
        <span className="truncate">{caption}</span>
        {focusMark && event ? <span className="text-ink-3">· {KEY_FRAME_LABEL[event]}</span> : null}
      </figcaption>
    </figure>
  )
}

export interface EvidencePairProps {
  evidence: FocusEvidence
  session?: CoachingSession
  compareSession?: CoachingSession
  heightM: number
  portrait: boolean
  size?: 'card' | 'page'
}

/**
 * Evidence frames (DESIGN §8.8, §10.9): this session's representative serve beside the player's own
 * best serve (or the last matched session), both in the clip's orientation. Never a professional.
 */
export function EvidencePair({ evidence, session, compareSession, heightM, portrait, size = 'page' }: EvidencePairProps) {
  const keyServe = session?.serves.find((s) => s.id === evidence.keyServeId)
  const keySketch = sketchFor(session, evidence.overlay, evidence.keyServeId, heightM)
  const compareSketch = evidence.compareServeId
    ? sketchFor(compareSession ?? session, evidence.overlay, evidence.compareServeId, heightM, evidence.overlay === 'apex-scatter' ? undefined : evidence.compareServeId)
    : null
  const compareCaption = evidence.compareTo === 'previous-session' ? FOCUS_COPY.lastSession : FOCUS_COPY.yourBest
  const domain = sharedDomain([keySketch, compareSketch])
  const keyImage = useKeyFrameUrl(evidence.keyServeId, evidence.keyFrameEvent)
  const compareImage = useKeyFrameUrl(evidence.compareServeId, evidence.keyFrameEvent)
  const anySketch = !!keySketch && !keyImage.loading && !keyImage.url
  if (!evidence.keyServeId && !evidence.compareServeId) return null
  return (
    <div className="flex flex-col gap-2">
      <div className={cx('grid gap-4', evidence.compareServeId ? 'grid-cols-2' : 'grid-cols-1')}>
        <Frame
          image={keyImage}
          domain={domain}
          event={evidence.keyFrameEvent}
          caption={FOCUS_COPY.thisServe(keyServe?.index)}
          sketch={keySketch}
          portrait={portrait}
          size={size}
          focusMark
        />
        {evidence.compareServeId ? (
          <Frame image={compareImage} domain={domain} event={evidence.keyFrameEvent} caption={compareCaption} sketch={compareSketch} portrait={portrait} size={size} />
        ) : null}
      </div>
      {anySketch ? <p className="text-footnote text-ink-3">{FOCUS_COPY.sketchNote}</p> : null}
    </div>
  )
}
