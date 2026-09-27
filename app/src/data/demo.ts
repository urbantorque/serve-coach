/**
 * Sample data loader (ARCHITECTURE §11): "See a sample session" inserts the demo records with
 * isDemo = 1; "Remove sample data" in Profile deletes them. The player's own profile is never touched.
 */
import { getDb } from './db.ts'
import { deleteSession } from './deletion.ts'
import { DEMO_FIXTURES, type DemoFixtures } from './fixtures.ts'
import { toServeRecord } from './repos/serves.ts'
import { setSetting } from './repos/settings.ts'

export const DEMO_SEED_VERSION = 'fixtures@1'

export async function hasDemoData(): Promise<boolean> {
  return (await getDb().sessions.where('isDemo').equals(1).count()) > 0
}

export async function loadDemoData(fixtures: DemoFixtures = DEMO_FIXTURES): Promise<void> {
  const db = getDb()
  await db.transaction(
    'rw',
    [db.sessions, db.videos, db.serves, db.tags, db.tallies, db.sessionStats, db.coaching, db.experiments, db.practiceLogs, db.matchLogs],
    async () => {
      for (const s of fixtures.sessions) {
        await db.sessions.put(s.session)
        await db.videos.put(s.video)
        await db.serves.bulkPut(s.serves.map(toServeRecord))
        if (s.tags.length) await db.tags.bulkPut(s.tags)
        if (s.tally) await db.tallies.put(s.tally)
        await db.sessionStats.put(s.stats)
      }
      await db.coaching.put(fixtures.decision)
      await db.experiments.put(fixtures.experiment)
      await db.practiceLogs.bulkPut(fixtures.practiceLogs)
      await db.matchLogs.bulkPut(fixtures.matchLogs)
    },
  )
  await setSetting('demoSeedVersion', DEMO_SEED_VERSION)
}

export async function removeDemoData(): Promise<void> {
  const db = getDb()
  const ids = await db.sessions.where('isDemo').equals(1).primaryKeys()
  for (const id of ids) await deleteSession(id)
  await db.transaction('rw', [db.coaching, db.experiments, db.practiceLogs, db.matchLogs], async () => {
    await db.coaching.filter((r) => r.isDemo === 1).delete()
    await db.experiments.filter((r) => r.isDemo === 1).delete()
    await db.practiceLogs.filter((r) => r.isDemo === 1).delete()
    await db.matchLogs.filter((r) => r.isDemo === 1).delete()
  })
  await setSetting('demoSeedVersion', '')
}
