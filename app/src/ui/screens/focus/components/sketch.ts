import type { CoachingSession } from '../../../../coaching/index.ts'

export interface SketchPoint {
  x: number
  y: number
  key?: boolean
}

export interface Sketch {
  kind: 'apex' | 'contact'
  points: SketchPoint[]
  heightCm: number
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Points for the no-frame sketch: toss peaks (apex overlays) or contact points (contact overlays). */
export function sketchFor(session: CoachingSession | undefined, overlay: string, highlightId: string | undefined, heightM: number, onlyId?: string): Sketch | null {
  if (!session) return null
  const kind = overlay.startsWith('apex') || overlay === 'toss-arc' ? 'apex' : overlay.startsWith('contact') ? 'contact' : null
  if (!kind) return null
  const heightCm = heightM * 100
  const points: SketchPoint[] = []
  for (const s of session.serves) {
    if (!s.included || (onlyId && s.id !== onlyId)) continue
    const m = s.metrics
    const x = num(kind === 'apex' ? m['toss-forward']?.value : m['contact-forward']?.value)
    const hv = kind === 'apex' ? m['toss-apex-height'] : m['contact-height-ratio']
    const cm = num(hv?.secondary?.cm)
    const ratio = num(hv?.value)
    const y = cm ?? (ratio !== null ? ratio * heightCm : null)
    if (x === null || y === null) continue
    points.push({ x, y, key: s.id === highlightId })
  }
  return points.length ? { kind, points, heightCm } : null
}


export interface SketchDomain {
  x: [number, number]
  y: [number, number]
}

/** One shared domain for both frames, zoomed to the serves (equal scale, front-toe line kept in view). */
export function sharedDomain(sketches: (Sketch | null)[]): SketchDomain | null {
  const pts = sketches.flatMap((s) => s?.points ?? [])
  if (!pts.length) return null
  const xs = [0, ...pts.map((p) => p.x)]
  const ys = pts.map((p) => p.y)
  return { x: [Math.min(...xs) - 35, Math.max(...xs) + 35], y: [Math.min(...ys) - 35, Math.max(...ys) + 35] }
}
