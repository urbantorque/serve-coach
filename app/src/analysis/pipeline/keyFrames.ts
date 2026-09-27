/**
 * Key-frame pass (ARCHITECTURE §5.4 step 7). One forward decode through the event frames of every
 * serve writes, per serve:
 *   - an event thumbnail for each event found (480 px long side, JPEG q0.72, full frame);
 *   - an evidence crop for the four events that coaching evidence and overlays use (apex, trophy,
 *     lowestHip, contact): the player's box widened to the toss column and contact zone, 720 px
 *     long side, JPEG q0.8;
 * plus one small square session thumbnail (the representative serve at contact) for list rows.
 * They survive video deletion (D8). Planning is pure; extraction needs a FrameSource and an encoder.
 */
import type { KeyFrameRecord } from '../../data/records.ts'
import type { Rect, ServeAnalysis } from '../../data/domain.ts'
import type { KeyFrameEvent, PoseFrame, ServeEvents, ServePhase } from '../types.ts'
import type { FrameSource } from '../video/frameTypes.ts'
import { playerBox, statureFromPoses } from './windows.ts'

export const THUMB_LONG_SIDE_PX = 480
export const THUMB_QUALITY = 0.72
export const EVIDENCE_LONG_SIDE_PX = 720
export const EVIDENCE_QUALITY = 0.8
export const SESSION_THUMB_PX = 160
export const SESSION_THUMB_QUALITY = 0.75

export const EVIDENCE_EVENTS: readonly KeyFrameEvent[] = ['apex', 'trophy', 'lowestHip', 'contact']

/** KeyFrameEvent -> the ServeEvents field that times it (§5.5). Setup's frame is the last still one. */
const EVENT_SOURCE: Record<KeyFrameEvent, (keyof ServeEvents)[]> = {
  setup: ['motionStart', 'setupStart'],
  release: ['tossRelease'],
  apex: ['tossApex'],
  trophy: ['trophy'],
  lowestHip: ['lowestHip'],
  contact: ['contact'],
  landing: ['landing'],
  recovery: ['recoveryEnd'],
}

/** §5.5 table: the phase each strip event stands for (apex falls inside loading). */
const EVENT_PHASE: Record<KeyFrameEvent, ServePhase> = {
  setup: 'setup',
  release: 'toss',
  apex: 'loading',
  trophy: 'loading',
  lowestHip: 'drive',
  contact: 'contact',
  landing: 'landing',
  recovery: 'recovery',
}

export interface KeyFrameRequest {
  id: string
  serveId: string
  sessionId: string
  event: KeyFrameEvent
  phase: ServePhase
  role: KeyFrameRecord['role']
  frameIndex: number
  /** Normalised crop of the displayed frame; absent = full frame. */
  crop?: Rect
  longSidePx: number
  quality: number
  /** Square output (session thumbnail). */
  square?: boolean
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

function clampRect(r: Rect): Rect {
  const x0 = clamp01(r.x)
  const y0 = clamp01(r.y)
  const x1 = clamp01(r.x + r.w)
  const y1 = clamp01(r.y + r.h)
  return { x: x0, y: y0, w: Math.max(0.01, x1 - x0), h: Math.max(0.01, y1 - y0) }
}

/** Evidence crop for a serve: the player's box over the serve, up to the toss apex, widened 0.3 statures. */
export function evidenceCrop(serve: Pick<ServeAnalysis, 'toss' | 'contact'>, poses: readonly PoseFrame[], aspect: number): Rect | undefined {
  const box = playerBox(poses)
  if (!box) return undefined
  const bh = statureFromPoses(poses) || box.y1 - box.y0
  const bhx = bh / aspect
  let y0 = box.y0
  if (serve.toss?.apexXY) y0 = Math.min(y0, serve.toss.apexXY.y)
  let x0 = box.x0
  let x1 = box.x1
  const ball = serve.contact?.ballXY
  if (ball) {
    x0 = Math.min(x0, ball.x)
    x1 = Math.max(x1, ball.x)
    y0 = Math.min(y0, ball.y)
  }
  return clampRect({ x: x0 - 0.3 * bhx, y: y0 - 0.08 * bh, w: x1 - x0 + 0.6 * bhx, h: box.y1 - y0 + 0.13 * bh })
}

/** Square crop around one frame's pose, for the session list thumbnail. */
export function squareCrop(pose: PoseFrame | undefined, aspect: number): Rect | undefined {
  if (!pose?.landmarks) return undefined
  const box = playerBox([pose])
  if (!box) return undefined
  const sideH = Math.min(1, (box.y1 - box.y0) * 1.25)
  const sideW = Math.min(1, sideH / aspect)
  const cx = (box.x0 + box.x1) / 2
  const cy = (box.y0 + box.y1) / 2
  const x = Math.min(1 - sideW, Math.max(0, cx - sideW / 2))
  const y = Math.min(1 - sideH, Math.max(0, cy - sideH / 2))
  return { x, y, w: sideW, h: sideH }
}

export function eventFrames(serve: Pick<ServeAnalysis, 'events'>, frameCount: number): Partial<Record<KeyFrameEvent, number>> {
  const out: Partial<Record<KeyFrameEvent, number>> = {}
  for (const event of Object.keys(EVENT_SOURCE) as KeyFrameEvent[]) {
    for (const key of EVENT_SOURCE[event]) {
      const e = serve.events[key]
      if (e && Number.isInteger(e.frameIndex) && e.frameIndex >= 0 && e.frameIndex < frameCount) {
        out[event] = e.frameIndex
        break
      }
    }
  }
  return out
}

function phaseOf(serve: Pick<ServeAnalysis, 'phases'>, event: KeyFrameEvent, frameIndex: number): ServePhase {
  const span = serve.phases?.find((p) => frameIndex >= p.startFrame && frameIndex <= p.endFrame)
  return span?.phase ?? EVENT_PHASE[event]
}

export interface KeyFramePlanInput {
  sessionId: string
  serves: readonly ServeAnalysis[]
  /** Poses by serve id (the serve's window). */
  posesByServe: ReadonlyMap<string, readonly PoseFrame[]>
  frameCount: number
  aspect: number
  /** Serve whose contact frame becomes the session thumbnail. */
  representativeServeId?: string
}

/** Every key-frame image to write, and the serve -> ids map for ServeAnalysis.keyFrames. */
export function planKeyFrames(input: KeyFramePlanInput): { requests: KeyFrameRequest[]; byServe: Map<string, ServeAnalysis['keyFrames']> } {
  const requests: KeyFrameRequest[] = []
  const byServe = new Map<string, ServeAnalysis['keyFrames']>()
  for (const serve of input.serves) {
    const frames = eventFrames(serve, input.frameCount)
    const poses = input.posesByServe.get(serve.id) ?? []
    const crop = evidenceCrop(serve, poses, input.aspect)
    const ids: ServeAnalysis['keyFrames'] = {}
    for (const [event, frameIndex] of Object.entries(frames) as [KeyFrameEvent, number][]) {
      const phase = phaseOf(serve, event, frameIndex)
      const thumbId = `${serve.id}-${event}-thumb`
      requests.push({ id: thumbId, serveId: serve.id, sessionId: input.sessionId, event, phase, role: 'thumb', frameIndex, longSidePx: THUMB_LONG_SIDE_PX, quality: THUMB_QUALITY })
      const entry: { thumbId: string; evidenceId?: string } = { thumbId }
      if (EVIDENCE_EVENTS.includes(event) && crop) {
        entry.evidenceId = `${serve.id}-${event}-evidence`
        requests.push({ id: entry.evidenceId, serveId: serve.id, sessionId: input.sessionId, event, phase, role: 'evidence', frameIndex, crop, longSidePx: EVIDENCE_LONG_SIDE_PX, quality: EVIDENCE_QUALITY })
      }
      ids[event] = entry
    }
    byServe.set(serve.id, ids)
  }
  const rep = input.serves.find((s) => s.id === input.representativeServeId) ?? input.serves.find((s) => s.included) ?? input.serves[0]
  if (rep) {
    const frames = eventFrames(rep, input.frameCount)
    const event: KeyFrameEvent | undefined = frames.contact !== undefined ? 'contact' : frames.trophy !== undefined ? 'trophy' : (Object.keys(frames)[0] as KeyFrameEvent | undefined)
    if (event !== undefined) {
      const frameIndex = frames[event]!
      const poses = input.posesByServe.get(rep.id) ?? []
      const nearest = poses.reduce<PoseFrame | undefined>((best, p) => (p.landmarks && (!best || Math.abs(p.frameIndex - frameIndex) < Math.abs(best.frameIndex - frameIndex)) ? p : best), undefined)
      requests.push({
        id: `${input.sessionId}-session-thumb`,
        serveId: rep.id,
        sessionId: input.sessionId,
        event,
        phase: phaseOf(rep, event, frameIndex),
        role: 'session-thumb',
        frameIndex,
        crop: squareCrop(nearest, input.aspect),
        longSidePx: SESSION_THUMB_PX,
        quality: SESSION_THUMB_QUALITY,
        square: true,
      })
    }
  }
  return { requests, byServe }
}

/** Output size for a crop of a width x height frame, long side limited (never upscaled). */
export function outputSize(crop: Rect | undefined, width: number, height: number, longSidePx: number, square = false): { sx: number; sy: number; sw: number; sh: number; width: number; height: number } {
  const c = crop ?? { x: 0, y: 0, w: 1, h: 1 }
  const sx = Math.round(c.x * width)
  const sy = Math.round(c.y * height)
  const sw = Math.max(1, Math.min(width - sx, Math.round(c.w * width)))
  const sh = Math.max(1, Math.min(height - sy, Math.round(c.h * height)))
  if (square) {
    const side = Math.min(longSidePx, Math.max(sw, sh))
    return { sx, sy, sw, sh, width: side, height: side }
  }
  const scale = Math.min(1, longSidePx / Math.max(sw, sh))
  return { sx, sy, sw, sh, width: Math.max(1, Math.round(sw * scale)), height: Math.max(1, Math.round(sh * scale)) }
}

export type JpegEncoder = (image: ImageBitmap, region: ReturnType<typeof outputSize>, quality: number) => Promise<Blob>

/** OffscreenCanvas (or DOM canvas) JPEG encoder. */
export const encodeJpeg: JpegEncoder = async (image, r, quality) => {
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(r.width, r.height)
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('2D canvas unavailable for key frames')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, r.sx, r.sy, r.sw, r.sh, 0, 0, r.width, r.height)
    return canvas.convertToBlob({ type: 'image/jpeg', quality })
  }
  const canvas = Object.assign(document.createElement('canvas'), { width: r.width, height: r.height })
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('2D canvas unavailable for key frames')
  ctx.drawImage(image, r.sx, r.sy, r.sw, r.sh, 0, 0, r.width, r.height)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('JPEG encode failed'))), 'image/jpeg', quality))
}

/**
 * Decodes each requested frame once (in frame order) and encodes its images. Bitmaps are closed
 * as soon as their images are written; `onFrame` reports progress.
 */
export async function extractKeyFrames(
  source: Pick<FrameSource, 'bitmaps' | 'meta' | 'frameTimes'>,
  requests: readonly KeyFrameRequest[],
  options: { signal?: AbortSignal; encoder?: JpegEncoder; now?: Date; onFrame?: (done: number, total: number) => void } = {},
): Promise<KeyFrameRecord[]> {
  const encoder = options.encoder ?? encodeJpeg
  const createdAt = (options.now ?? new Date()).toISOString()
  const byFrame = new Map<number, KeyFrameRequest[]>()
  for (const r of requests) {
    const list = byFrame.get(r.frameIndex) ?? []
    list.push(r)
    byFrame.set(r.frameIndex, list)
  }
  const indices = [...byFrame.keys()].sort((a, b) => a - b)
  const out: KeyFrameRecord[] = []
  if (indices.length === 0) return out
  let done = 0
  for await (const frame of source.bitmaps({ indices }, { signal: options.signal, applyRotation: true })) {
    try {
      const { width, height } = frame.bitmap
      for (const r of byFrame.get(frame.index) ?? []) {
        const region = outputSize(r.crop, width, height, r.longSidePx, r.square)
        const blob = await encoder(frame.bitmap, region, r.quality)
        const record: KeyFrameRecord = {
          id: r.id,
          serveId: r.serveId,
          sessionId: r.sessionId,
          event: r.event,
          phase: r.phase,
          role: r.role,
          frameIndex: frame.index,
          tReal: frame.tReal,
          width: region.width,
          height: region.height,
          blob,
          createdAt,
        }
        if (r.crop) record.crop = r.crop
        out.push(record)
      }
    } finally {
      frame.bitmap.close()
    }
    options.onFrame?.(++done, indices.length)
  }
  return out
}
