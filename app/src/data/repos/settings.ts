import { getDb } from '../db.ts'
import { DEFAULT_SETTINGS, type SettingKey, type SettingRecord, type SettingValues } from '../records.ts'

/** Returns the stored value, or the documented default when the key was never set. */
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValues[K]> {
  const row = (await getDb().settings.get(key)) as SettingRecord<K> | undefined
  return row ? row.value : DEFAULT_SETTINGS[key]
}

export async function setSetting<K extends SettingKey>(key: K, value: SettingValues[K], now: Date = new Date()): Promise<void> {
  const row: SettingRecord<K> = { key, value, updatedAt: now.toISOString() }
  await getDb().settings.put(row as unknown as SettingRecord)
}

export async function getAllSettings(): Promise<SettingValues> {
  const rows = await getDb().settings.toArray()
  const out: SettingValues = { ...DEFAULT_SETTINGS }
  for (const row of rows) {
    ;(out as unknown as Record<string, unknown>)[row.key] = row.value
  }
  return out
}
