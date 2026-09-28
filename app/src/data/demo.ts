/**
 * Sample data loader (ARCHITECTURE §11): "See a sample session" inserts the demo records with
 * isDemo = 1; "Remove sample data" in Profile deletes them. The player's own profile is never touched.
 *
 * The published sample is the engine-built seed in public/demo/ (data/sample.ts): real pipeline and
 * coaching output on computer-generated video. The hand-authored fixtures (fixtures.ts) remain the
 * fallback when the seed cannot be fetched (tests, an offline first run) and for UI development.
 */
import { getDb, withBlockNumbers } from './db.ts'
import { deleteSession } from './deletion.ts'
import { DEMO_FIXTURES, DEMO_SESSION_IDS, type DemoFixtures } from './fixtures.ts'
import { toServeRecord } from './repos/serves.ts'
import { setSetting } from './repos/settings.ts'
import { fetchSampleSeed, insertSampleSeed, SAMPLE_FEATURED_SESSION_ID, type BlobFetcher, type SampleSeed } from './sample.ts'

export const DEMO_SEED_VERSION = 'fixtures@1'
export const SAMPLE_SEED_VERSION = 'engine-seed@1'

export async function hasDemoData(): Promise<boolean> {
  return (await getDb().sessions.where('isDemo').equals(1).count()) > 0
}

/** The sample session to open after loading: the engine-built one when present, else the fixtures'. */
export async function sampleSessionId(): Promise<string> {
  const db = getDb()
  if (await db.sessions.get(SAMPLE_FEATURED_SESSION_ID)) return SAMPLE_FEATURED_SESSION_ID
  const any = await db.sessions.where('isDemo').equals(1).first()
  return any?.id ?? DEMO_SESSION_IDS.at(-1) ?? SAMPLE_FEATURED_SESSION_ID
}

async function loadFixtures(fixtures: DemoFixtures): Promise<void> {
  const db = getDb()
  await db.transaction(
    'rw',
    [db.sessions, db.videos, db.serves, db.tags, db.tallies, db.sessionStats, db.coaching, db.experiments, db.practiceLogs, db.matchLogs],
    async () => {
      const numbered = new Map(withBlockNumbers(fixtures.sessions.map((s) => s.session)).map((r) => [r.id, r]))
      for (const s of fixtures.sessions) {
        await db.sessions.put(numbered.get(s.session.id) ?? s.session)
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

/**
 * Loads the sample and returns the id of the session to open. With no argument it loads the
 * engine-built seed (falling back to the fixtures when the seed is unavailable); pass fixtures (tests)
 * or a seed to load that instead. Loading twice replaces the previous sample.
 */
export async function loadDemoData(source?: DemoFixtures | SampleSeed, fetchBlob?: BlobFetcher): Promise<string> {
  if (source && 'demo' in source) {
    await loadFixtures(source)
    return DEMO_SESSION_IDS.at(-1) ?? 'demo-s3'
  }
  const seed = source ?? (await fetchSampleSeed())
  if (seed) {
    if (await hasDemoData()) await removeDemoData()
    await insertSampleSeed(seed, fetchBlob)
    await setSetting('demoSeedVersion', SAMPLE_SEED_VERSION)
    return seed.featuredSessionId
  }
  // The app says the sample is real engine output, so a production build never substitutes the
  // hand-made fixtures: the caller shows "We couldn't load the sample. Try again."
  if (import.meta.env.PROD) throw new Error('The sample session could not be loaded.')
  await loadFixtures(DEMO_FIXTURES)
  return DEMO_SESSION_IDS.at(-1) ?? 'demo-s3'
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
