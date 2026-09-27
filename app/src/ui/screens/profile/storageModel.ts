/**
 * Storage and privacy model (PRODUCT §6.13 item 4, DESIGN §10.12, ARCHITECTURE §8): sizes in words,
 * the retention choice and what a change would delete. Pure, so it is unit-tested.
 */
import type { RetentionPolicy, SettingValues, VideoRecord } from '../../../data/records.ts'

const DAY_MS = 24 * 60 * 60 * 1000

/** "1.2 GB", "34 MB", "8.5 MB", "820 KB", "0 KB" (decimal units, as phones show storage; non-breaking space before the unit). */
export function formatBytes(bytes: number): string {
  const b = Math.max(0, bytes)
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`
  if (b >= 1e6) {
    const mb = b / 1e6
    return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`
  }
  return `${Math.round(b / 1e3)} KB`
}

export type RetentionChoice = 'keep' | 'auto' | 'after-analysis'
export type RetentionDays = SettingValues['retention']['days']
export const RETENTION_DAYS: readonly RetentionDays[] = [7, 30, 90]

export function choiceOf(policy: RetentionPolicy): RetentionChoice {
  return policy === 'keep' ? 'keep' : policy === 'delete-after-analysis' ? 'after-analysis' : 'auto'
}

export function policyOf(choice: RetentionChoice): RetentionPolicy {
  return choice === 'keep' ? 'keep' : choice === 'after-analysis' ? 'delete-after-analysis' : 'auto-delete-days'
}

/** Stored, not pinned, not already deleted: the videos a policy change can affect. */
export function liveVideos(videos: readonly VideoRecord[]): VideoRecord[] {
  return videos.filter((v) => v.storage !== 'deleted' && v.storage !== 'not-kept' && v.retention.pinned !== 1 && v.isDemo !== 1)
}

/**
 * How many stored videos a new setting would delete at the next sweep (auto-delete with fewer days).
 * "Keep" and "delete after analysis" (new videos only) delete nothing now.
 */
export function wouldDeleteNow(videos: readonly VideoRecord[], next: SettingValues['retention'], now: Date = new Date()): number {
  if (next.policy !== 'auto-delete-days') return 0
  const cutoff = now.getTime() - next.days * DAY_MS
  return liveVideos(videos).filter((v) => new Date(v.importedAt).getTime() < cutoff).length
}

export function retentionFootnote(r: SettingValues['retention']): string {
  switch (r.policy) {
    case 'keep':
      return 'Videos stay until you delete them. Stats and key frames always stay.'
    case 'delete-after-analysis':
      return 'New videos are deleted once they are analysed. Stats and key frames stay, so playback steps through frames.'
    default:
      return `Videos older than ${r.days} days are deleted the next time you open Serve Coach.`
  }
}

export interface StorageTotals {
  /** Bytes of stored video (from the video records). */
  videoBytes: number
  videoCount: number
  /** Everything else the browser reports for this app (stats, key frames, the app itself), when known. */
  otherBytes: number | null
}

export function storageTotals(videos: readonly VideoRecord[], usageBytes: number | null): StorageTotals {
  const stored = videos.filter((v) => v.storage === 'idb' || v.storage === 'native')
  const videoBytes = stored.reduce((sum, v) => sum + (v.sizeBytes || 0), 0)
  return {
    videoBytes,
    videoCount: stored.length,
    // Unknown when the browser does not report usage, or reports less than the videos (files kept outside it).
    otherBytes: usageBytes === null || usageBytes < videoBytes ? null : usageBytes - videoBytes,
  }
}

export function storageLine(t: StorageTotals): string {
  const video = `${formatBytes(t.videoBytes)} of video`
  return t.otherBytes === null ? `On this phone: ${video}.` : `On this phone: ${video}, ${formatBytes(t.otherBytes)} of stats, frames and app data.`
}
