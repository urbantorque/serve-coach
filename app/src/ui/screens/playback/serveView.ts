/**
 * Pure view logic for Serve detail (DESIGN §8.11, §10.7; PRODUCT §6.6): where playback opens, which
 * overlay is on by default, how the per-serve values are grouped, and what the compare picker offers.
 */
import {
  REAR_ONLY_METRIC_IDS,
  SIDE_ONLY_METRIC_IDS,
  type CameraView,
  type KeyFrameEvent,
  type MetricId,
  type MetricValue,
  type ReasonCode,
  type ServeOutcome,
  type ServePhase,
} from '../../../analysis/types.ts'
import type { CoachingDecision, ServeAnalysis, SessionStats } from '../../../data/domain.ts'
import type { ExperimentRecord, ServeTagRecord, SessionRecord, VideoRecord } from '../../../data/records.ts'
import { EVENT_KEY } from '../../components/video/keyFrames.ts'
import type { FocusOverlay } from '../../components/video/overlayScene.ts'
import { shortDate } from '../../format/dates.ts'

/** Evidence frame per focus phase (PRODUCT §6.6; COACHING §8.1). */
export const PHASE_EVENT: Record<ServePhase, KeyFrameEvent> = {
  setup: 'setup',
  toss: 'apex',
  loading: 'trophy',
  drive: 'lowestHip',
  contact: 'contact',
  landing: 'landing',
  recovery: 'recovery',
}

/**
 * COACHING §8.1 `evidence.overlay` by library item id and by fault id (coaching-library.json;
 * serveView.test.ts fails if this drifts from the library).
 */
export const FOCUS_OVERLAY: Record<string, FocusOverlay> = {
  'toss-height-steady': 'apex-scatter',
  'toss-height-inconsistent': 'apex-scatter',
  'toss-spot-steady': 'apex-scatter',
  'toss-forward-inconsistent': 'apex-scatter',
  'toss-in-front': 'apex-vs-toe',
  'toss-behind': 'apex-vs-toe',
  'toss-within-reach': 'contact-height-line',
  'toss-too-far-forward': 'contact-height-line',
  'toss-to-reach-height': 'toss-arc',
  'toss-too-high': 'toss-arc',
  'legs-spring': 'hip-rise',
  'legs-quiet': 'hip-rise',
  'shoulder-tilt': 'shoulder-line',
  'shoulder-tilt-low': 'shoulder-line',
  'steady-rhythm': 'timing-strip',
  'rhythm-inconsistent': 'timing-strip',
  'flowing-motion': 'timing-strip',
  'trophy-pause-long': 'timing-strip',
  'reach-up': 'contact-height-line',
  'contact-low': 'contact-height-line',
  'contact-in-front': 'contact-vs-toe',
  'contact-behind': 'contact-vs-toe',
  'second-serve-margin': 'outcome-tally',
  'second-serve-unreliable': 'outcome-tally',
  'clear-the-net': 'outcome-tally',
  'net-miss-pattern': 'outcome-tally',
  'bring-it-down': 'outcome-tally',
  'long-miss-pattern': 'outcome-tally',
  'keep-going': 'none',
  none: 'none',
}

export interface FocusInfo {
  phase: ServePhase | null
  event: KeyFrameEvent
  overlay: FocusOverlay | null
  /** Per-serve metric ids the focus cites, in order. */
  metricIds: MetricId[]
}

/** The session's focus as it applies to one serve. No decision (or a gate) opens on contact with Body. */
export function focusInfo(decision: CoachingDecision | null | undefined): FocusInfo {
  if (!decision || decision.gate !== 'ok' || !decision.focus) return { phase: null, event: 'contact', overlay: null, metricIds: [] }
  const phase = decision.focus.phase
  return {
    phase,
    event: decision.evidence?.event ?? PHASE_EVENT[phase],
    overlay: FOCUS_OVERLAY[decision.focus.faultId] ?? null,
    metricIds: decision.evidence?.metricIds ?? [],
  }
}

/** The frame Serve detail opens on: the focus event when clear on this serve, else contact, else the window start. */
export function openingFrame(serve: Pick<ServeAnalysis, 'events' | 'window' | 'phases'>, event: KeyFrameEvent): number {
  const e = serve.events[EVENT_KEY[event]]
  if (e && e.confidence >= 0.5) return e.frameIndex
  const c = serve.events.contact
  if (c && c.confidence >= 0.5) return c.frameIndex
  return serve.window.startFrame
}

// ---------- per-serve values (the stat drawer) ----------

export interface MetricRow {
  id: MetricId
  value: MetricValue
  /** Where a player-entered value came from ("Pocket Radar, logged in Check this serve…"). */
  note?: string
}

/** The radar-reading part of a stored check (validation/annotation CheckAnnotation). */
export interface RadarCheck {
  updatedAt: string
  reference?: { radarKmh?: number; radarDevice?: string; radarUnit?: 'km/h' | 'mph'; radarEntered?: number }
}

const RADAR_DEVICE_WORDS: Record<string, string> = { 'pocket-radar': 'Pocket Radar', 'other-radar': 'a radar', other: 'another device' }

/**
 * "Radar speed (you logged)" for one serve from the readings entered in Check this serve (D4:
 * player-entered, a peak speed, with its source). The latest reading wins when several people logged
 * one. Null when none was logged.
 */
export function radarFromChecks(checks: readonly RadarCheck[] | undefined | null): { value: MetricValue; note: string } | null {
  const logged = (checks ?? []).filter((c) => typeof c.reference?.radarKmh === 'number' && Number.isFinite(c.reference.radarKmh))
  if (!logged.length) return null
  const latest = logged.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a))
  const r = latest.reference!
  const device = RADAR_DEVICE_WORDS[r.radarDevice ?? ''] ?? 'a radar'
  const entered = r.radarUnit === 'mph' && typeof r.radarEntered === 'number' ? ` You entered ${Math.round(r.radarEntered)} mph.` : ''
  const others = logged.length > 1 ? ` Latest of ${logged.length} readings.` : ''
  return {
    value: {
      id: 'speed-radar-entered',
      value: Math.round(r.radarKmh!),
      unit: 'km/h',
      status: 'player-entered',
      confidence: 1,
      basis: `Peak speed from ${device}, entered in Check this serve.`,
      provenance: 'confirmed-by-you',
    },
    note: `Peak speed from ${device}, logged in Check this serve on ${shortDate(new Date(latest.updatedAt))}.${entered}${others}`,
  }
}
/** A radar check tied to its serve (the session report gathers every serve's readings). */
export interface SessionRadarCheck extends RadarCheck {
  serveId: string
}

/**
 * "Radar speed (you logged)" for the session report (U2): from the readings entered in Check this
 * serve, the latest per serve. The value is the fastest logged reading, player-entered (D4: a peak
 * speed, never measured by the app), with its source ("Pocket Radar, peak"), the serve it came from
 * and how many serves have a reading. Null when none was logged.
 */
export function radarForSession(
  checks: readonly SessionRadarCheck[] | undefined | null,
  serveIndex: (serveId: string) => number | undefined,
): { value: MetricValue; source: string; serveLine: string; count: number } | null {
  const perServe = new Map<string, SessionRadarCheck>()
  for (const c of checks ?? []) {
    if (typeof c.reference?.radarKmh !== 'number' || !Number.isFinite(c.reference.radarKmh)) continue
    if (serveIndex(c.serveId) === undefined) continue
    const prev = perServe.get(c.serveId)
    if (!prev || c.updatedAt > prev.updatedAt) perServe.set(c.serveId, c)
  }
  const logged = [...perServe.values()]
  if (!logged.length) return null
  const top = logged.reduce((a, b) => (b.reference!.radarKmh! > a.reference!.radarKmh! ? b : a))
  const r = top.reference!
  const kmh = Math.round(r.radarKmh!)
  const devices = new Set(logged.map((c) => RADAR_DEVICE_WORDS[c.reference?.radarDevice ?? ''] ?? 'a radar'))
  const device = RADAR_DEVICE_WORDS[r.radarDevice ?? ''] ?? 'a radar'
  const source = devices.size > 1 ? 'Your radars, peak' : `${device.charAt(0).toUpperCase()}${device.slice(1)}, peak`
  const n = logged.length
  const serveLine = n === 1 ? `Serve ${serveIndex(top.serveId)}, logged in Check this serve` : `Fastest of ${n} serves you logged, serve ${serveIndex(top.serveId)}`
  return {
    value: {
      id: 'speed-radar-entered',
      value: kmh,
      unit: 'km/h',
      status: 'player-entered',
      confidence: 1,
      basis: `Peak speed from ${device}, entered in Check this serve.`,
      provenance: 'confirmed-by-you',
      n,
    },
    source,
    serveLine,
    count: n,
  }
}

export interface MetricGroup {
  title: string
  rows: MetricRow[]
}
export interface UnavailableItem {
  id: MetricId
  reasonCode?: ReasonCode
}

const GROUPS: { title: string; ids: MetricId[] }[] = [
  { title: 'Toss', ids: ['toss-apex-height', 'toss-forward', 'toss-lateral', 'toss-drop'] },
  { title: 'Loading', ids: ['shoulder-tilt-trophy', 'loading-depth', 'trophy-pause', 'deep-bend-flag', 'knee-bend-band'] },
  { title: 'Drive', ids: ['leg-drive', 'drive-time'] },
  { title: 'Contact', ids: ['contact-height-ratio', 'contact-forward', 'rhythm-release-to-contact', 'shoulder-over-shoulder-contact'] },
  { title: 'Landing', ids: ['landing-distance'] },
  { title: 'Speed and spin', ids: ['speed-experimental', 'speed-average-rear', 'speed-radar-entered', 'spin'] },
]

/**
 * Groups one serve's values by phase (DESIGN §8.11 item 4). Experimental values appear only with the
 * experimental toggle on, in their own group (D2). Unavailable values come last as reasons, and a
 * side-view serve always lists the rear-only slots as "Needs a view from behind" (D1).
 */
export function groupServeMetrics(
  metrics: Partial<Record<MetricId, MetricValue>>,
  view: CameraView,
  experimentalOn: boolean,
): { groups: MetricGroup[]; experimental: MetricRow[]; unavailable: UnavailableItem[] } {
  const groups: MetricGroup[] = []
  const experimental: MetricRow[] = []
  const unavailable: UnavailableItem[] = []
  const wrongView: readonly string[] = view === 'rear' ? SIDE_ONLY_METRIC_IDS : REAR_ONLY_METRIC_IDS
  const viewReason: ReasonCode = view === 'rear' ? 'NEEDS_SIDE_VIEW' : 'NEEDS_REAR_VIEW'
  for (const g of GROUPS) {
    const rows: MetricRow[] = []
    for (const id of g.ids) {
      const v = metrics[id]
      if (wrongView.includes(id)) {
        if (id !== 'speed-average-rear' || view === 'rear' || v) unavailable.push({ id, reasonCode: viewReason })
        continue
      }
      if (!v) continue
      if (v.status === 'unavailable') unavailable.push({ id, reasonCode: v.reasonCode })
      else if (v.status === 'experimental') {
        if (experimentalOn) experimental.push({ id, value: v })
      } else rows.push({ id, value: v })
    }
    if (rows.length) groups.push({ title: g.title, rows })
  }
  if (!unavailable.some((u) => u.id === 'spin')) unavailable.push({ id: 'spin', reasonCode: 'NOT_MEASURABLE' })
  return { groups, experimental, unavailable }
}

const PEEK_ORDER: MetricId[] = [
  'contact-height-ratio', 'toss-forward', 'rhythm-release-to-contact', 'toss-apex-height', 'toss-drop', 'contact-forward', 'leg-drive',
]

/** The drawer's peek values: the focus metric first, then the hero order; never experimental (D2). */
export function peekMetrics(metrics: Partial<Record<MetricId, MetricValue>>, focusIds: readonly MetricId[], count: number): MetricRow[] {
  const out: MetricRow[] = []
  const ok = (v: MetricValue | undefined): v is MetricValue => Boolean(v && v.status !== 'unavailable' && v.status !== 'experimental')
  for (const id of [...focusIds, ...PEEK_ORDER]) {
    if (out.length >= count) break
    const v = metrics[id]
    if (ok(v) && !out.some((r) => r.id === id)) out.push({ id, value: v })
  }
  return out
}

// ---------- video availability ----------

/** The line shown when the clip is gone (DESIGN §8.11; PRODUCT §6.6 states), or null when it plays. */
export function videoGoneLine(video: VideoRecord | null | undefined): string | null {
  if (!video) return 'No video for this serve. Phases and values are below.'
  if (video.storage === 'idb' || video.storage === 'native') return null
  if (video.role === 'demo' || video.storage === 'not-kept') {
    return video.role === 'demo' ? 'Sample serves have no video. Phases and values are below.' : 'Video not kept. Key frames kept.'
  }
  switch (video.deletedReason) {
    case 'retention': {
      const days = video.retention.retainUntil ? Math.round((video.retention.retainUntil - new Date(video.importedAt).getTime()) / 86_400_000) : 30
      return `Video deleted after ${days} days. Key frames kept.`
    }
    case 'after-analysis':
      return 'Video deleted after analysis. Key frames kept.'
    case 'storage-full':
      return 'Video removed to free up space. Key frames kept.'
    default:
      return 'You deleted this video. Key frames kept.'
  }
}

/** A clip whose record says it is stored, but whose file could not be read on this phone. */
export const VIDEO_MISSING_LINE = "This video can't be found on this phone. Phases and values are below."

/**
 * The player's line for the clip: why it is gone (videoGoneLine), or, when its record says it is
 * stored but the file did not load (`url` settled to null: a blob lost from the phone's storage, a
 * native file this build cannot reach), that it can't be found. Never a pose-quality reason: the
 * video is missing, not the analysis. Null while the clip plays or is still loading.
 */
export function playerVideoLine(video: VideoRecord | null | undefined, url: string | null | undefined): string | null {
  const gone = videoGoneLine(video)
  if (gone) return gone
  return url === null ? VIDEO_MISSING_LINE : null
}

// ---------- outcome words ----------

export function outcomeKind(outcome: ServeOutcome | undefined): 'in' | 'net' | 'long' | 'wide' | 'untagged' {
  return outcome === 'in' || outcome === 'net' || outcome === 'long' || outcome === 'wide' ? outcome : 'untagged'
}

// ---------- compare targets (DESIGN §8.12, COACHING §8.1) ----------

export type CompareKind = 'best' | 'last-session' | 'before-drill'

export interface CompareTarget {
  kind: CompareKind
  title: string
  /** Label pill over the other clip ("Your best, 12 Sep"). */
  pill: string
  /** Legend word for the dashed skeleton ("your best"). */
  legend: string
  serveId?: string
  sessionId?: string
  /** Why the row is disabled. */
  reason?: string
}

export interface CompareSessionData {
  session: SessionRecord
  serves: ServeAnalysis[]
  stats: SessionStats | null
  tags: ServeTagRecord[]
}

/** Same view, camera side and handedness, and the same kind of data (sample never meets real). */
export function isMatched(a: SessionRecord, b: SessionRecord, handedness: string, bServes: ServeAnalysis[]): boolean {
  return (
    a.view === b.view &&
    (a.cameraSide ?? 'chest') === (b.cameraSide ?? 'chest') &&
    a.isDemo === b.isDemo &&
    bServes.every((s) => s.handedness === handedness)
  )
}

export function compareTargets(input: {
  session: SessionRecord
  serve: ServeAnalysis
  universe: CompareSessionData[]
  experiment: ExperimentRecord | null
  /** A serve is usable when its pose track or video exists. */
  usable: (serveId: string) => boolean
}): CompareTarget[] {
  const { session, serve, universe, experiment, usable } = input
  const byId = new Map(universe.map((u) => [u.session.id, u]))
  const current = byId.get(session.id)
  const earlier = universe
    .filter((u) => u.session.id !== session.id && u.session.startedAt < session.startedAt && isMatched(session, u.session, serve.handedness, u.serves))
    .sort((a, b) => b.session.startedAt.localeCompare(a.session.startedAt))
  const date = (s: SessionRecord) => shortDate(s.visitId).replace(/^\w+ /, '')
  const representative = (u: CompareSessionData) => {
    const ids = [u.stats?.representativeServeId, ...u.serves.filter((s) => s.included).map((s) => s.id)]
    return ids.find((id): id is string => Boolean(id) && usable(id!))
  }

  // Best serve: this session and the last 3 matched sessions, among serves that went in (COACHING §8.1).
  let best: CompareTarget = { kind: 'best', title: 'Your best serve', pill: 'Your best', legend: 'your best', reason: 'No best serve yet: tag a few serves that went in.' }
  for (const u of [current, ...earlier.slice(0, 3)]) {
    if (!u) continue
    const inIds = u.tags.filter((t) => t.outcome === 'in').map((t) => t.serveId)
    const candidates = [u.stats?.bestServeId, ...inIds].filter((id): id is string => Boolean(id) && id !== serve.id && usable(id!))
    const pick = candidates.find((id) => u.serves.some((s) => s.id === id && s.included))
    if (pick) {
      best = { kind: 'best', title: 'Your best serve', pill: `Your best, ${date(u.session)}`, legend: 'your best', serveId: pick, sessionId: u.session.id }
      break
    }
  }

  // The most recent matched session that still has a serve to show.
  const prev = earlier.find((u) => representative(u) !== undefined)
  const prevServe = prev ? representative(prev) : undefined
  const last: CompareTarget =
    prev && prevServe
      ? { kind: 'last-session', title: 'Last session', pill: `Last session, ${date(prev.session)}`, legend: 'last session', serveId: prevServe, sessionId: prev.session.id }
      : { kind: 'last-session', title: 'Last session', pill: 'Last session', legend: 'last session', reason: 'No earlier session from the same side.' }

  let before: CompareTarget = { kind: 'before-drill', title: 'Before the drill', pill: 'Before the drill', legend: 'before the drill', reason: 'No drill started yet.' }
  const baseId = experiment?.baselineSessionIds[0]
  if (baseId === session.id) before = { ...before, reason: 'This session is the one before the drill.' }
  else if (baseId) {
    const u = byId.get(baseId)
    const matched = u ? isMatched(session, u.session, serve.handedness, u.serves) : false
    const id = u && matched ? representative(u) : undefined
    before =
      u && id
        ? { ...before, pill: `Before the drill, ${date(u.session)}`, serveId: id, sessionId: u.session.id, reason: undefined }
        : { ...before, reason: !u ? 'That session was deleted.' : matched ? 'That session has no serve to show.' : 'That session is from a different set-up.' }
  }
  return [best, last, before]
}

/** The ghost video blend needs the same camera position (DESIGN §8.12). */
export function sameCameraSetup(a: SessionRecord, b: SessionRecord): boolean {
  if (a.id === b.id) return true
  return a.setup !== undefined && a.setup === b.setup && a.orientation === b.orientation && a.view === b.view && a.cameraSide === b.cameraSide
}

/**
 * The pill over this serve in Compare: "Today, serve 3" only when the session is from today, else its
 * date ("26 Sep, serve 3"), so a sample or older session never reads as today's.
 */
export function thisServeLabel(session: Pick<SessionRecord, 'visitId'>, index: number, now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const when = session.visitId === today ? 'Today' : shortDate(session.visitId).replace(/^\w+ /, '')
  return `${when}, serve ${index}`
}
