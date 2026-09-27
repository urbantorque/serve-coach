import { getDb } from '../db.ts'
import type { PlayStyle, ProfileRecord } from '../records.ts'

export async function getProfile(): Promise<ProfileRecord | undefined> {
  return getDb().profile.get('me')
}

/** D11: a comp player (pennant, night comp or another league) is in the launch segment. */
export function computeInSegment(playStyle: PlayStyle[]): 0 | 1 {
  return playStyle.some((p) => p === 'pennant' || p === 'night-comp' || p === 'other-league') ? 1 : 0
}

/** Creates or updates the single profile row. `createdAt` is kept; `updatedAt` and `inSegment` are refreshed. */
export async function saveProfile(
  patch: Partial<Omit<ProfileRecord, 'id' | 'createdAt' | 'updatedAt' | 'inSegment'>>,
  now: Date = new Date(),
): Promise<ProfileRecord> {
  const db = getDb()
  return db.transaction('rw', db.profile, async () => {
    const existing = await db.profile.get('me')
    const iso = now.toISOString()
    const base: ProfileRecord = existing ?? {
      id: 'me',
      handedness: 'right',
      level: 'unknown',
      goal: 'first-serves-in',
      ageBand: '18-plus',
      playStyle: [],
      matchNights: [],
      inSegment: 0,
      comfortRegions: [],
      comfort: { painFlag: 0 },
      createdAt: iso,
      updatedAt: iso,
    }
    const next: ProfileRecord = { ...base, ...patch, id: 'me', createdAt: base.createdAt, updatedAt: iso }
    next.inSegment = computeInSegment(next.playStyle)
    await db.profile.put(next)
    return next
  })
}
