/**
 * What "Check this serve" asks a person to mark, and the draft those marks build up. Pure and
 * framework-free. Definitions follow docs/VALIDATION_PROTOCOL.md §7 (annotation rules), so that two
 * people marking the same serve mean the same frame and the same pixel.
 */
import type { AnnotatedEvent, AnnotatedPoint } from '../../data/domain.ts'
import type { AnnotatorRole, CheckAnnotation, CheckReference, MarkPoint, RadarDevice } from './types.ts'

export type StepId = 'standing' | 'release' | 'apex' | 'trophy' | 'hips' | 'contact' | 'landing' | 'radar'

export interface StepPoint {
  id: AnnotatedPoint
  label: string
  optional?: boolean
}

export interface MarkStep {
  id: StepId
  /** Short name (chip and heading). */
  title: string
  /** One or two sentences: which frame, then what to tap. */
  instruction: string
  event?: AnnotatedEvent
  points: StepPoint[]
  optional?: boolean
}

export const MARK_STEPS: readonly MarkStep[] = [
  {
    id: 'standing',
    title: 'Height',
    instruction: 'Find a frame before the toss where the player stands tall and still. Tap the top of the head, then a heel on the ground.',
    points: [
      { id: 'headTopSetup', label: 'Top of head' },
      { id: 'floorSetup', label: 'Heel on the ground' },
      { id: 'frontToeSetup', label: 'Front toe', optional: true },
    ],
  },
  {
    id: 'release',
    title: 'Release',
    instruction: 'Step to the first frame where the ball has left the hand. For loading, also tap the middle of the hips, level with the hip joints.',
    event: 'tossRelease',
    points: [{ id: 'midHipRelease', label: 'Hip centre', optional: true }],
  },
  {
    id: 'apex',
    title: 'Peak',
    instruction: 'Step to the frame where the ball is highest, then tap the centre of the ball.',
    event: 'tossApex',
    points: [{ id: 'ballAtApex', label: 'Ball centre' }],
  },
  {
    id: 'trophy',
    title: 'Trophy',
    instruction:
      'Step to the trophy position: the tossing arm reaching up and the racket arm bent back, just before the legs push up. Tap the centre of the front shoulder (nearer the net), then the back shoulder.',
    event: 'trophy',
    points: [
      { id: 'shoulderFrontTrophy', label: 'Front shoulder' },
      { id: 'shoulderBackTrophy', label: 'Back shoulder' },
    ],
    optional: true,
  },
  {
    id: 'hips',
    title: 'Lowest hip',
    instruction: 'Step to the frame where the hips are lowest, between the toss and the push up. Tap the middle of the hips, level with the hip joints.',
    event: 'lowestHip',
    points: [{ id: 'midHipLowest', label: 'Hip centre' }],
    optional: true,
  },
  {
    id: 'contact',
    title: 'Contact',
    instruction: 'Step to the frame where the strings meet the ball, then tap the centre of the ball. For leg drive, also tap the middle of the hips.',
    event: 'contact',
    points: [
      { id: 'ballAtContact', label: 'Ball centre' },
      { id: 'midHipContact', label: 'Hip centre', optional: true },
    ],
  },
  {
    id: 'landing',
    title: 'Landing',
    instruction: 'Step to the first frame where the front foot is back on the ground, then tap the tip of that shoe.',
    event: 'landing',
    points: [{ id: 'frontToeLanding', label: 'Front toe' }],
  },
  {
    id: 'radar',
    title: 'Radar',
    instruction: 'If a radar measured this serve, enter the peak speed it showed.',
    points: [],
    optional: true,
  },
]

export const stepById = (id: StepId): MarkStep => MARK_STEPS.find((s) => s.id === id)!

/** Labels for the scrubber ticks and the stored-mark lists. */
export const EVENT_LABEL: Partial<Record<AnnotatedEvent, string>> = {
  tossRelease: 'Release',
  tossApex: 'Peak',
  trophy: 'Trophy',
  lowestHip: 'Low hip',
  contact: 'Contact',
  landing: 'Landing',
}

export const RADAR_DEVICE_LABEL: Record<RadarDevice, string> = {
  'pocket-radar': 'Pocket Radar',
  'other-radar': 'Other radar',
  other: 'Other device',
}

/** metrics.json speed-radar-entered.inputs.mphToKmh. */
export const MPH_TO_KMH = 1.609

/** Readings outside this range are refused as typing slips (a recreational serve is well inside it). */
export const RADAR_KMH_RANGE = { min: 40, max: 260 } as const

export interface MarkDraft {
  events: Partial<Record<AnnotatedEvent, { frameIndex: number; sure: boolean }>>
  points: Partial<Record<AnnotatedPoint, MarkPoint>>
  radar?: { value: number; unit: 'km/h' | 'mph'; device: RadarDevice }
  notes?: string
}

export const emptyDraft = (): MarkDraft => ({ events: {}, points: {} })

export function setEvent(d: MarkDraft, event: AnnotatedEvent, frameIndex: number): MarkDraft {
  const sure = d.events[event]?.sure ?? true
  return { ...d, events: { ...d.events, [event]: { frameIndex, sure } } }
}

export function clearStep(d: MarkDraft, step: MarkStep): MarkDraft {
  const events = { ...d.events }
  const points = { ...d.points }
  if (step.event) delete events[step.event]
  for (const p of step.points) delete points[p.id]
  return { ...d, events, points, ...(step.id === 'radar' ? { radar: undefined } : {}) }
}

export function setSure(d: MarkDraft, event: AnnotatedEvent, sure: boolean): MarkDraft {
  const e = d.events[event]
  if (!e) return d
  return { ...d, events: { ...d.events, [event]: { ...e, sure } } }
}

/**
 * Places a point. On a step with an event, tapping a point on a frame also marks that frame, since the
 * point is only meaningful on it (the ball's centre at the peak).
 */
export function setPoint(d: MarkDraft, step: MarkStep, point: AnnotatedPoint, at: MarkPoint): MarkDraft {
  const clamped = { frameIndex: at.frameIndex, x: Math.min(1, Math.max(0, at.x)), y: Math.min(1, Math.max(0, at.y)) }
  const next = { ...d, points: { ...d.points, [point]: clamped } }
  return step.event ? setEvent(next, step.event, at.frameIndex) : next
}

/** Moves a point by a number of source pixels (keyboard nudge). */
export function nudgePoint(d: MarkDraft, point: AnnotatedPoint, dxPx: number, dyPx: number, clip: { width: number; height: number }): MarkDraft {
  const p = d.points[point]
  if (!p) return d
  return {
    ...d,
    points: {
      ...d.points,
      [point]: { ...p, x: Math.min(1, Math.max(0, p.x + dxPx / clip.width)), y: Math.min(1, Math.max(0, p.y + dyPx / clip.height)) },
    },
  }
}

/** The next point of a step still to place (required first, then optional), or null. */
export function nextPointOf(step: MarkStep, d: MarkDraft): AnnotatedPoint | null {
  const open = step.points.filter((p) => !d.points[p.id])
  return (open.find((p) => !p.optional) ?? open[0])?.id ?? null
}

export function stepDone(step: MarkStep, d: MarkDraft): boolean {
  if (step.id === 'radar') return Boolean(d.radar)
  if (step.event && !d.events[step.event]) return false
  return step.points.every((p) => p.optional || d.points[p.id])
}

export function stepStarted(step: MarkStep, d: MarkDraft): boolean {
  if (step.id === 'radar') return Boolean(d.radar)
  return Boolean((step.event && d.events[step.event]) || step.points.some((p) => d.points[p.id]))
}

/** Required marks done, over the required steps (radar and optional points excluded). */
export function progress(d: MarkDraft): { done: number; total: number } {
  const required = MARK_STEPS.filter((s) => !s.optional)
  return { done: required.filter((s) => stepDone(s, d)).length, total: required.length }
}

export function hasAnyMark(d: MarkDraft): boolean {
  return Object.keys(d.events).length > 0 || Object.keys(d.points).length > 0 || Boolean(d.radar)
}

/** A frame for a step: its event frame, else its first point's frame. */
export function stepFrame(step: MarkStep, d: MarkDraft): number | null {
  if (step.event && d.events[step.event]) return d.events[step.event]!.frameIndex
  for (const p of step.points) if (d.points[p.id]) return d.points[p.id]!.frameIndex
  return null
}

/** Radar value in km/h, or an error sentence. */
export function radarKmh(value: number, unit: 'km/h' | 'mph'): { kmh: number } | { error: string } {
  if (!Number.isFinite(value) || value <= 0) return { error: 'Enter the speed as a number.' }
  const kmh = unit === 'mph' ? value * MPH_TO_KMH : value
  if (kmh < RADAR_KMH_RANGE.min || kmh > RADAR_KMH_RANGE.max) {
    return { error: `That reads as ${Math.round(kmh)} km/h. Check the number and the unit.` }
  }
  return { kmh: Math.round(kmh * 10) / 10 }
}

/** Initials only (ARCHITECTURE §6.6 "initials, local only"): up to 4 letters, upper case. */
export function cleanInitials(raw: string): string {
  return raw
    .replace(/[^a-z]/gi, '')
    .slice(0, 4)
    .toUpperCase()
}

export const annotationId = (serveId: string, initials: string): string => `check:${serveId}:${initials || 'ANON'}`

/** A study participant code: letters, digits and hyphens, up to 8, upper case ("p07" → "P07"). */
export function cleanSubjectCode(raw: string): string {
  return raw
    .replace(/[^a-z0-9-]/gi, '')
    .slice(0, 8)
    .toUpperCase()
}

export interface AnnotationMeta {
  serveId: string
  sessionId: string
  videoId: string
  initials: string
  role: AnnotatorRole
  captureFps: number
  now: string
  /** The stored record being edited, if any (keeps createdAt, the blind flag and revealedAt). */
  previous?: CheckAnnotation | null
  /** Study participant code, when the phone holds several players' sessions. */
  subjectCode?: string
}

function sameMarks(a: MarkDraft, b: MarkDraft): boolean {
  return JSON.stringify([a.events, a.points, a.radar ?? null]) === JSON.stringify([b.events, b.points, b.radar ?? null])
}

/** The record to store for a draft. Marks changed after the comparison was shown are no longer blind. */
export function toAnnotation(d: MarkDraft, meta: AnnotationMeta): CheckAnnotation {
  const prev = meta.previous ?? null
  const changed = prev ? !sameMarks(d, fromAnnotation(prev)) : true
  const blind = prev ? prev.blind && !(prev.revealedAt && changed) : true
  const reference: CheckReference | undefined = d.radar
    ? (() => {
        const r = radarKmh(d.radar.value, d.radar.unit)
        return 'kmh' in r
          ? { radarKmh: r.kmh, radarDevice: d.radar.device, radarQuantity: 'peak' as const, radarUnit: d.radar.unit, radarEntered: d.radar.value }
          : undefined
      })()
    : undefined
  return {
    id: annotationId(meta.serveId, meta.initials),
    sessionId: meta.sessionId,
    videoId: meta.videoId,
    serveId: meta.serveId,
    annotator: meta.initials || 'ANON',
    annotatorRole: meta.role,
    createdAt: prev?.createdAt ?? meta.now,
    updatedAt: meta.now,
    tool: 'in-app@1',
    captureFps: meta.captureFps,
    events: d.events,
    points: d.points,
    ...(reference ? { reference } : {}),
    ...(d.notes ? { notes: d.notes } : {}),
    blind,
    ...(prev?.revealedAt ? { revealedAt: prev.revealedAt } : {}),
    ...(meta.subjectCode ? { subjectCode: cleanSubjectCode(meta.subjectCode) } : {}),
  }
}

export function fromAnnotation(a: CheckAnnotation): MarkDraft {
  const r = a.reference
  return {
    events: { ...a.events },
    points: { ...a.points },
    ...(r?.radarKmh
      ? { radar: { value: r.radarEntered ?? r.radarKmh, unit: r.radarUnit ?? 'km/h', device: r.radarDevice ?? 'pocket-radar' } }
      : {}),
    ...(a.notes ? { notes: a.notes } : {}),
  }
}
