/**
 * The validation export, `serve-coach-validation@1` (ARCHITECTURE §12 "Export"): every check on this
 * phone with the app's automatic values for the same serve, the clip's timing and set-up, and the
 * engine stamp. It carries no video, no images, no names (initials only), no pain or comfort notes and
 * nothing from the profile except the height the app used. The clip is referenced by its fingerprint.
 * Read by tools/validate/annotation-eval.ts for pooled analysis. Pure: the caller gathers the records.
 */
import type { Handedness, MetricStatus, MetricValue } from '../../analysis/types.ts'
import type { AnnotatedPoint, EngineStamp, ServeAnalysis } from '../../data/domain.ts'
import type { SessionRecord, VideoRecord } from '../../data/records.ts'
import { compareWithMarks, type DerivedValues } from './agreement.ts'
import type { CheckAnnotation, MarkPoint } from './types.ts'

export const VALIDATION_FORMAT = 'serve-coach-validation'
export const VALIDATION_VERSION = 1

export interface ExportedMetric {
  value: number | string | null
  unit: string
  status: MetricStatus
  confidence: number
  uncertainty?: MetricValue['uncertainty']
  reasonCode?: string
  validationLevel?: MetricValue['validationLevel']
  conditionClass?: MetricValue['conditionClass']
  quantity?: MetricValue['quantity']
}

export interface ExportedEvent {
  frameIndex: number
  tReal: number
  confidence: number
  method: string
  uncertaintyS: number
}

export interface ValidationEntry {
  annotation: CheckAnnotation
  /** Sample (demo) data: never part of a real validation set. */
  sample: boolean
  /**
   * The player, so serves cluster by player: the check's study code when one study phone holds several
   * players, else a random key for this phone's player. Neither is linked to any identity in the file.
   */
  subject: { key: string; handedness: Handedness; heightM: number; heightSource: 'entered' | 'default' }
  clip: {
    videoId: string
    fingerprint: string | null
    width: number
    height: number
    nominalFps: number
    captureFps: number
    timeScale: number
    frameCount: number | null
    timeBaseStatus: 'proven' | 'unknown' | null
    orientation: 'portrait' | 'landscape'
    view: string
    setup: string | null
    cameraSide: string | null
    light: 'day' | 'lights' | 'indoor' | null
    source: string | null
  }
  serve: { id: string; index: number; window: ServeAnalysis['window']; included: boolean; exclusions: string[]; softFlags: string[]; hardRejects: string[] }
  engine: EngineStamp
  app: {
    events: Record<string, ExportedEvent>
    metrics: Record<string, ExportedMetric>
    /** The app's image points for the marked ones (ball at peak and contact, toe at landing, standing floor and head). */
    points: Partial<Record<AnnotatedPoint, MarkPoint>>
    /** The app's standing height in the frame (fraction of the frame height). */
    standingNorm: number | null
  }
  /** Convenience copy of what the marks imply and the per-serve differences (the tool recomputes them). */
  derived: { you: DerivedValues; rows: { id: string; diff: Record<string, number> | null; within: boolean | null }[] }
}

export interface ValidationExport {
  format: typeof VALIDATION_FORMAT
  version: typeof VALIDATION_VERSION
  exportedAt: string
  app: { engineVersions: string[]; catalogueVersions: string[] }
  privacy: string
  counts: { entries: number; annotators: number; sampleLeftOut: number }
  entries: ValidationEntry[]
}

export interface ExportSource {
  annotation: CheckAnnotation
  serve: ServeAnalysis
  video: VideoRecord | null
  session: SessionRecord | null
  appPoints: Partial<Record<AnnotatedPoint, MarkPoint>>
  appStandingNorm: number | null
}

export const PRIVACY_NOTE =
  'No video, images, names, notes of any kind, or profile details beyond the height the app used. Annotators are initials. The subject key is a study code, or a random key that stays on the phone that made it.'

function exportMetric(v: MetricValue): ExportedMetric {
  return {
    value: v.value,
    unit: v.unit,
    status: v.status,
    confidence: v.confidence,
    ...(v.uncertainty ? { uncertainty: v.uncertainty } : {}),
    ...(v.reasonCode ? { reasonCode: v.reasonCode } : {}),
    ...(v.validationLevel ? { validationLevel: v.validationLevel } : {}),
    ...(v.conditionClass ? { conditionClass: v.conditionClass } : {}),
    ...(v.quantity ? { quantity: v.quantity } : {}),
  }
}

/** Frame timing and size of the clip a serve came from, with sensible fallbacks. */
export function clipOf(video: VideoRecord | null, session: SessionRecord | null): { width: number; height: number; nominalFps: number; captureFps: number; timeScale: number } {
  const meta = video?.meta ?? session?.analysis?.capture.meta
  return {
    width: meta?.width ?? 1080,
    height: meta?.height ?? 1920,
    nominalFps: meta?.nominalFps ?? 60,
    captureFps: meta?.captureFps ?? meta?.nominalFps ?? 60,
    timeScale: meta?.timeScale ?? 1,
  }
}

export function isSample(src: Pick<ExportSource, 'video' | 'session'>): boolean {
  return src.session?.isDemo === 1 || src.video?.isDemo === 1
}

/** The annotation as exported: free text is never written (it could name someone or describe pain). */
export function exportedAnnotation(a: CheckAnnotation): CheckAnnotation {
  const copy = { ...a }
  delete copy.notes
  return copy
}

export function buildEntry(src: ExportSource, subjectKey: string): ValidationEntry {
  const { serve, video, session } = src
  const annotation = exportedAnnotation(src.annotation)
  const clip = clipOf(video, session)
  const heightM = video?.capture.playerHeightM ?? 1.75
  const heightSource = video?.capture.playerHeightSource ?? 'default'
  const agreement = compareWithMarks({
    marks: annotation,
    events: serve.events,
    metrics: serve.metrics,
    ctx: { clip, timing: { nominalFps: clip.nominalFps, timeScale: clip.timeScale }, handedness: serve.handedness, heightM },
    appStandingNorm: src.appStandingNorm,
  })
  const events: Record<string, ExportedEvent> = {}
  for (const [k, e] of Object.entries(serve.events)) {
    if (e) events[k] = { frameIndex: e.frameIndex, tReal: e.tReal, confidence: e.confidence, method: e.method, uncertaintyS: e.uncertaintyS }
  }
  const metrics: Record<string, ExportedMetric> = {}
  for (const [k, v] of Object.entries(serve.metrics)) if (v) metrics[k] = exportMetric(v)
  return {
    annotation,
    sample: isSample(src),
    // A study code (several players on one study phone) names the player; otherwise the phone's random key does.
    subject: { key: annotation.subjectCode || subjectKey, handedness: serve.handedness, heightM, heightSource },
    clip: {
      videoId: serve.videoId,
      fingerprint: video?.fingerprint ?? null,
      ...clip,
      frameCount: video?.meta.frameCount ?? null,
      timeBaseStatus: video?.meta.timeBaseStatus ?? null,
      orientation: clip.height > clip.width ? 'portrait' : 'landscape',
      view: serve.view,
      setup: video?.capture.setup ?? session?.setup ?? null,
      cameraSide: video?.capture.cameraSide ?? session?.cameraSide ?? null,
      light: video?.capture.conditions?.light ?? session?.conditions?.light ?? null,
      source: video?.source ?? null,
    },
    serve: {
      id: serve.id,
      index: serve.index,
      window: serve.window,
      included: serve.included,
      exclusions: [...serve.exclusions],
      softFlags: [...serve.plausibility.softFlags],
      hardRejects: [...serve.plausibility.hardRejects],
    },
    engine: serve.engine,
    app: { events, metrics, points: src.appPoints, standingNorm: src.appStandingNorm },
    derived: {
      you: agreement.derived,
      rows: agreement.rows.map((r) => ({ id: r.id, diff: r.diff ? (Object.fromEntries(Object.entries(r.diff).filter(([, v]) => typeof v === 'number')) as Record<string, number>) : null, within: r.within })),
    },
  }
}

/**
 * The export file's content. Sample serves are left out (sample data never enters exports; PRODUCT
 * §4.4 rule 11); their count is recorded.
 */
export function buildValidationExport(sources: readonly ExportSource[], opts: { now: Date; subjectKey: string }): ValidationExport {
  const real = sources.filter((s) => !isSample(s))
  const entries = real.map((s) => buildEntry(s, opts.subjectKey))
  const uniq = (xs: string[]) => [...new Set(xs)].sort()
  return {
    format: VALIDATION_FORMAT,
    version: VALIDATION_VERSION,
    exportedAt: opts.now.toISOString(),
    app: { engineVersions: uniq(entries.map((e) => e.engine.engineVersion)), catalogueVersions: uniq(entries.map((e) => e.engine.catalogueVersion)) },
    privacy: PRIVACY_NOTE,
    counts: { entries: entries.length, annotators: uniq(entries.map((e) => e.annotation.annotator)).length, sampleLeftOut: sources.length - real.length },
    entries,
  }
}

/** "serve-coach-validation@1-2026-09-27.json" (local date). */
export function validationFileName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${VALIDATION_FORMAT}@${VALIDATION_VERSION}-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`
}

/** A structural check for files read by the evaluation tool. */
export function isValidationExport(x: unknown): x is ValidationExport {
  const o = x as Partial<ValidationExport> | null
  return Boolean(o && o.format === VALIDATION_FORMAT && o.version === VALIDATION_VERSION && Array.isArray(o.entries))
}
