/**
 * Export (ARCHITECTURE §8.4, D8): JSON `serve-coach-export@1` and CSV (UTF-8 with BOM, RFC 4180,
 * one file per table). Pure builders over stored records; the UI hands the result to the share sheet
 * or a download. Videos and images are never embedded.
 */
import { METRIC_IDS, type MetricId, type MetricValue } from '../analysis/types.ts'
import { getDb } from './db.ts'
import type { CaptureContext } from '../analysis/types.ts'
import type { CoachingRecord, MatchLogRecord, PracticeLogRecord, ProfileRecord, SessionRecord, TrackRecord } from './records.ts'
import { scrubDecision } from './scrub.ts'

export { HEALTH_WORDS, scrubDecision, scrubWhy } from './scrub.ts'

export const EXPORT_FORMAT = 'serve-coach-export'
export const EXPORT_VERSION = 1
export const APP_VERSION = '0.1.0'

export interface ExportOptions {
  /** Demo data is excluded unless chosen (ARCHITECTURE §11). */
  includeDemo?: boolean
  /**
   * Body-check and comfort detail is exported only when the player ticks this: the profile's comfort
   * (pain) flag and comfortRegions, practice-log body answers, and the coaching decisions' safety and
   * comfort wording (pain-referral decisions are left out whole without it).
   */
  includeComfort?: boolean
  /** Pose and ball tracks are large and off by default. */
  includePose?: boolean
  now?: Date
}

/** Metrics that have one value per serve (serves.csv columns), in catalogue order. */
export const PER_SERVE_METRIC_IDS: readonly MetricId[] = [
  'toss-apex-height', 'toss-forward', 'toss-lateral', 'toss-drop', 'contact-height-ratio', 'contact-forward',
  'rhythm-release-to-contact', 'trophy-pause', 'leg-drive', 'drive-time', 'loading-depth', 'deep-bend-flag',
  'shoulder-tilt-trophy', 'knee-bend-band', 'shoulder-over-shoulder-contact', 'landing-distance',
  'speed-experimental', 'speed-average-rear', 'speed-radar-entered', 'spin',
]

type ExportedCapture = Omit<CaptureContext, 'orientationSamples' | 'liveOnsets'> & {
  pitchMedianDeg?: number
  rollMedianDeg?: number
  liveOnsetCount?: number
}

function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** CaptureContext minus the raw attitude and onset series, summarised as medians and a count. */
export function summariseCapture(c: CaptureContext): ExportedCapture {
  const { orientationSamples, liveOnsets, ...rest } = c
  const out: ExportedCapture = { ...rest }
  if (orientationSamples?.length) {
    out.pitchMedianDeg = median(orientationSamples.map((s) => s.pitchDeg))
    out.rollMedianDeg = median(orientationSamples.map((s) => s.rollDeg))
  }
  if (liveOnsets) out.liveOnsetCount = liveOnsets.length
  return out
}

/** Typed arrays become plain number arrays so the JSON is portable. */
function plainTrack(t: TrackRecord): unknown {
  return JSON.parse(
    JSON.stringify(t, (_k, v: unknown) => (ArrayBuffer.isView(v) ? Array.from(v as unknown as ArrayLike<number>) : v)),
  )
}

function exportProfile(p: ProfileRecord | undefined, includeComfort: boolean): Partial<ProfileRecord> | null {
  if (!p) return null
  const out: Partial<ProfileRecord> = { ...p }
  if (!includeComfort) {
    delete out.comfort
    delete out.comfortRegions
  }
  return out
}

/**
 * Practice-log notes never leave the phone (COACHING §12.2). The body answer and the discomfort flag
 * are body-check answers: exported only with "Include comfort notes" (D8; Storage and privacy copy).
 */
function exportPractice(l: PracticeLogRecord, includeComfort: boolean): Omit<PracticeLogRecord, 'note'> {
  const { note: _note, body, discomfort, ...rest } = l
  return includeComfort ? { ...rest, ...(body ? { body } : {}), ...(discomfort !== undefined ? { discomfort } : {}) } : rest
}


/** product-gaps addition: match notes stay on the phone like practice notes (they can mention pain). */
function exportMatch(m: MatchLogRecord): Omit<MatchLogRecord, 'notes'> {
  const { notes: _notes, ...rest } = m
  return rest
}

export async function buildExportJSON(opts: ExportOptions = {}) {
  const db = getDb()
  const now = opts.now ?? new Date()
  const sessions = (await db.sessions.orderBy('startedAt').toArray()).filter((s) => opts.includeDemo || s.isDemo === 0)
  const ids = new Set(sessions.map((s) => s.id))
  const inScope = <T extends { sessionId: string }>(rows: T[]) => rows.filter((r) => ids.has(r.sessionId))
  const videos = inScope(await db.videos.toArray())
  const captureBySession = new Map<string, ExportedCapture>()
  for (const v of videos) {
    if (v.role === 'primary' || !captureBySession.has(v.sessionId)) captureBySession.set(v.sessionId, summariseCapture(v.capture))
  }
  const keep = (r: { isDemo?: 0 | 1 }) => opts.includeDemo || r.isDemo !== 1
  const experiments = (await db.experiments.toArray()).filter(keep)
  const includeComfort = opts.includeComfort ?? false
  const decisions = inScope(await db.coaching.toArray())
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    app: { version: APP_VERSION, engineVersion: sessions.at(-1)?.analysis?.engine.engineVersion ?? null, catalogueVersion: '1.1.0' },
    profile: exportProfile(await db.profile.get('me'), includeComfort),
    sessions: sessions.map((s: SessionRecord) => ({ ...s, capture: captureBySession.get(s.id) ?? null })),
    serves: inScope(await db.serves.toArray()),
    tags: inScope(await db.tags.toArray()),
    tallies: inScope(await db.tallies.toArray()),
    sessionStats: inScope(await db.sessionStats.toArray()),
    coachingDecisions: includeComfort ? decisions : decisions.map(scrubDecision).filter((d): d is CoachingRecord => d !== null),
    experiments,
    practiceLogs: (await db.practiceLogs.toArray()).filter(keep).map((l) => exportPractice(l, includeComfort)),
    matchLogs: (await db.matchLogs.toArray()).filter(keep).map(exportMatch),
    annotations: inScope(await db.annotations.toArray()),
    ...(opts.includePose ? { tracks: inScope(await db.tracks.toArray()).map(plainTrack) } : {}),
    notes:
      'Videos and images are not embedded. Typed arrays are exported as plain number arrays. Match logs are the player\'s own record and are never pooled with practice statistics.',
  }
}

// ---------- CSV ----------

const BOM = '﻿'

/** RFC 4180 field: quoted when it holds a comma, quote, CR or LF; quotes doubled. */
export function csvField(v: unknown): string {
  if (v === undefined || v === null) return ''
  const s = typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((r) => r.map(csvField).join(','))
  return BOM + lines.join('\r\n') + '\r\n'
}

function metricCells(m: MetricValue | undefined, withN: boolean): unknown[] {
  const cells: unknown[] = [
    m && m.status !== 'unavailable' ? m.value : '',
    m?.unit ?? '',
    m?.status ?? '',
    m?.reasonCode ?? '',
  ]
  if (withN) cells.push(m?.n ?? '')
  cells.push(m?.uncertainty?.low ?? '', m?.uncertainty?.high ?? '')
  return cells
}

function metricHeader(id: string, withN: boolean): string[] {
  return [id, `${id}__unit`, `${id}__status`, `${id}__reason`, ...(withN ? [`${id}__n`] : []), `${id}__low`, `${id}__high`]
}

export async function buildExportCSV(opts: ExportOptions = {}): Promise<Record<string, string>> {
  const json = await buildExportJSON(opts)
  const sessionById = new Map(json.sessions.map((s) => [s.id, s]))
  const tagByServe = new Map(json.tags.map((t) => [t.serveId, t]))
  const statsBySession = new Map(json.sessionStats.map((s) => [s.sessionId, s]))

  const servesHeader = [
    'session_id', 'visit_id', 'session_start', 'mode', 'camera_side', 'setup', 'orientation', 'tilt_status', 'fps_class',
    'serve_index', 'serve_number', 'side', 'outcome', 'outcome_source', 'intended_type', 'target_zone', 'included', 'exclusions',
    ...PER_SERVE_METRIC_IDS.flatMap((id) => metricHeader(id, false)),
  ]
  const servesRows = json.serves
    .slice()
    .sort((a, b) => (a.sessionId === b.sessionId ? a.index - b.index : a.sessionId < b.sessionId ? -1 : 1))
    .map((sv) => {
      const s = sessionById.get(sv.sessionId)
      const t = tagByServe.get(sv.id)
      return [
        sv.sessionId, s?.visitId, s?.startedAt, sv.mode, s?.cameraSide, s?.setup, s?.orientation, s?.tiltStatus, s?.fpsClass,
        sv.index, t?.serveNumber, t?.side, t?.outcome, t?.outcomeSource, t?.intendedType, t?.targetZone,
        sv.included ? 1 : 0, sv.exclusions.join(';'),
        ...PER_SERVE_METRIC_IDS.flatMap((id) => metricCells(sv.metrics[id], false)),
      ]
    })

  const sessionsHeader = [
    'session_id', 'visit_id', 'session_start', 'mode', 'view', 'camera_side', 'setup', 'orientation', 'tilt_status',
    'fps_class', 'template', 'is_retest', 'wind', 'is_demo',
    ...METRIC_IDS.flatMap((id) => metricHeader(id, true)),
  ]
  const sessionsRows = json.sessions.map((s) => {
    const st = statsBySession.get(s.id)
    return [
      s.id, s.visitId, s.startedAt, s.mode, s.view, s.cameraSide, s.setup, s.orientation, s.tiltStatus, s.fpsClass,
      s.template, s.isRetest, s.conditions?.wind, s.isDemo,
      ...METRIC_IDS.flatMap((id) => metricCells(st?.metrics[id], true)),
    ]
  })

  const practiceHeader = [
    'id', 'date', 'experiment_id', 'item_id', 'drill_id', 'drill_variant', 'minutes', 'reps', 'success_criterion_met',
    'feel', 'cue_helpful', 'cue_register_used', 'setting', 'body', 'discomfort', 'created_at',
  ]
  const practiceRows = json.practiceLogs.map((l) => [
    l.id, l.date, l.experimentId, l.itemId, l.drillId, l.drillVariant, l.minutes, l.reps, l.successCriterionMet,
    l.feel, l.cueHelpful, l.cueRegisterUsed, l.setting, l.body, l.discomfort, l.createdAt,
  ])

  const experimentsHeader = [
    'id', 'created_at', 'status', 'fault_id', 'cue_id', 'drill_id', 'primary_metric_id', 'direction',
    'baseline_session_ids', 'retest_session_ids', 'baseline_deleted', 'verdict', 'more_serves_to_confirm',
  ]
  const experimentsRows = json.experiments.map((e) => [
    e.id, e.createdAt, e.status, e.faultId, e.cueId, e.drillId, e.primaryMetricId, e.direction,
    e.baselineSessionIds.join(';'), e.retestSessionIds.join(';'), e.baselineDeleted ? 1 : 0,
    e.result?.verdict, e.result?.moreServesToConfirm,
  ])

  const matchHeader = ['date', 'competition', 'service_games', 'double_faults', 'first_serve_rough', 'cue_used', 'first_serves_in', 'first_serves_attempted']
  const matchRows = json.matchLogs.map((m) => [m.date, m.competition, m.serviceGames, m.doubleFaults, m.firstServeRough, m.cueUsed, m.firstServesIn, m.firstServesAttempted])

  return {
    'serves.csv': toCsv(servesHeader, servesRows),
    'sessions.csv': toCsv(sessionsHeader, sessionsRows),
    'practice.csv': toCsv(practiceHeader, practiceRows),
    'experiments.csv': toCsv(experimentsHeader, experimentsRows),
    'match_logs.csv': toCsv(matchHeader, matchRows),
  }
}
