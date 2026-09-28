/**
 * When a clip was recorded (extra item E2): imports used to be dated at import time. The container
 * usually knows better:
 *   1. QuickTime `com.apple.quicktime.creationdate` (iPhone: local time with its UTC offset, the start
 *      of recording; moov/meta or udta/meta mdta keys);
 *   2. the classic udta `©day` text atom (the same kind of string, some cameras and editors);
 *   3. an mdta `creation_time` / `date` key (ffmpeg and some Android writers);
 *   4. moov/mvhd creation_time (every MP4 writer can set it; Android's MediaRecorder writes UTC).
 * Placeholder values are ignored: 0 (1904), anything before 2005 or more than a day in the future.
 *
 * recordingTimeFor() gives the import flow its order: the container's recording time, else the file's
 * last-modified time (a copy can move it, so it is second; one from the last 5 minutes is the copy made
 * for the import and is skipped), else the time of the import. The player can still change the day on
 * the import screen (localDateOf / withLocalDate); whatever they choose is the session's date, and the
 * pipeline hands that date, not the container's, to coaching.
 */
import { metadataString, QT_KEYS, type ContainerMetadata } from './qtMetadata.ts'

export type ContainerTimeSource = 'quicktime-creationdate' | 'udta-day' | 'mdta-creation-time' | 'mvhd'
export type RecordingTimeSource = 'container' | 'file-modified' | 'import-time'

export interface ContainerTime {
  /** ISO 8601, UTC. */
  iso: string
  source: ContainerTimeSource
}

export interface RecordingTime {
  /** ISO 8601, UTC. */
  iso: string
  source: RecordingTimeSource
}

/** Seconds from 1904-01-01 (QuickTime/ISO epoch) to 1970-01-01. */
const EPOCH_1904_S = 2082844800
const EARLIEST_MS = Date.UTC(2005, 0, 1)
const DAY_MS = 86_400_000

/** A plausible recording time (ms since 1970) or null. */
function plausible(ms: number, nowMs: number): number | null {
  return Number.isFinite(ms) && ms >= EARLIEST_MS && ms <= nowMs + DAY_MS ? ms : null
}

/**
 * Parses the date strings recorders write: ISO 8601 with a `Z`, a `+hh:mm` or a `+hhmm` offset
 * ("2026-09-27T19:41:08+1000", Apple), with or without fractional seconds, or a space instead of `T`
 * ("2026-09-27 09:41:08", ffmpeg, read as UTC). A date without a time is not a recording time.
 */
export function parseRecorderDate(text: string): number | null {
  const m = /^\s*(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?\s*(Z|[+-]\d{2}:?\d{2}|[+-]\d{2})?\s*$/i.exec(text)
  if (!m) return null
  const [, y, mo, d, h, mi, sec = '0', frac = '0', tz] = m
  const base = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec), Math.round(Number(`0.${frac}`) * 1000))
  if (!Number.isFinite(base)) return null
  if (!tz || tz.toUpperCase() === 'Z') return base
  const sign = tz.startsWith('-') ? -1 : 1
  const digits = tz.slice(1).replace(':', '')
  const offsetMin = Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4) || '0')
  return base - sign * offsetMin * 60_000
}

/** The recording time the container states, by the priority above; undefined when none is plausible. */
export function containerRecordingTime(metadata: ContainerMetadata | undefined, nowMs = Date.now()): ContainerTime | undefined {
  if (!metadata) return undefined
  const fromText = (value: unknown, source: ContainerTimeSource): ContainerTime | undefined => {
    const text = metadataString(value as never)
    const ms = text ? parseRecorderDate(text) : null
    const ok = ms === null ? null : plausible(ms, nowMs)
    return ok === null ? undefined : { iso: new Date(ok).toISOString(), source }
  }
  const apple = fromText(metadata.movie[QT_KEYS.creationDate] ?? metadata.userData[QT_KEYS.creationDate], 'quicktime-creationdate')
  if (apple) return apple
  const day = fromText(metadata.userData[QT_KEYS.udtaDay], 'udta-day')
  if (day) return day
  for (const [key, value] of Object.entries(metadata.movie)) {
    if (/(^|\.)(creation_?time|creation_?date|date)$/i.test(key)) {
      const t = fromText(value, 'mdta-creation-time')
      if (t) return t
    }
  }
  const mvhd = metadata.mvhdCreationTime
  if (mvhd !== undefined && mvhd > 0) {
    const ok = plausible((mvhd - EPOCH_1904_S) * 1000, nowMs)
    if (ok !== null) return { iso: new Date(ok).toISOString(), source: 'mvhd' }
  }
  return undefined
}

/**
 * The date an imported clip is filed under: the container's recording time (VideoMeta.createdAt from
 * the probe), else the file's last-modified time, else now (the import). The import screen shows it
 * and lets the player change it.
 */
export function recordingTimeFor(input: { createdAt?: string; fileLastModified?: number; nowMs?: number }): RecordingTime {
  const nowMs = input.nowMs ?? Date.now()
  const container = input.createdAt ? plausible(Date.parse(input.createdAt), nowMs) : null
  if (container !== null) return { iso: new Date(container).toISOString(), source: 'container' }
  const modified = input.fileLastModified !== undefined ? plausible(input.fileLastModified, nowMs) : null
  // A file "changed" in the last few minutes was most likely just copied or exported for the import
  // (iOS Photos hands over a fresh copy), so it says nothing about when it was filmed.
  if (modified !== null && nowMs - modified > FRESH_COPY_MS) return { iso: new Date(modified).toISOString(), source: 'file-modified' }
  return { iso: new Date(nowMs).toISOString(), source: 'import-time' }
}

/** A last-modified time this close to the import is the copy, not the recording. */
const FRESH_COPY_MS = 5 * 60_000

const pad2 = (n: number) => String(n).padStart(2, '0')

/** The local calendar date ('YYYY-MM-DD', the phone's time zone) of an ISO time: the import screen's date field. */
export function localDateOf(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * The player's corrected date (E2): `iso` moved to the local calendar date `ymd`, keeping its local
 * time of day (the evening-light prefill and the order within the day stay). Null for a malformed
 * date, one before 2005, or one after today.
 */
export function withLocalDate(iso: string, ymd: string, nowMs = Date.now()): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  const base = new Date(iso)
  if (!m || Number.isNaN(base.getTime())) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), base.getHours(), base.getMinutes(), base.getSeconds(), base.getMilliseconds())
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null
  if (d.getTime() < EARLIEST_MS || localDateOf(d.toISOString()) > localDateOf(new Date(nowMs).toISOString())) return null
  // Today with a time of day still to come (a clip "filmed" later today): now instead.
  return new Date(Math.min(d.getTime(), nowMs)).toISOString()
}
