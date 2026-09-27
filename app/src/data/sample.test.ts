// The engine-built sample seed: typed arrays survive JSON, the insert is complete and removable.
import 'fake-indexeddb/auto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb, resetDbForTests } from './db.ts'
import { hasDemoData, loadDemoData, removeDemoData, sampleSessionId } from './demo.ts'
import { isSampleSeed, packTyped, SAMPLE_FEATURED_SESSION_ID, type SampleSeed, unpackTyped } from './sample.ts'

beforeEach(async () => {
  await resetDbForTests()
})

describe('packTyped / unpackTyped', () => {
  it('round-trips typed arrays (with NaN) through JSON', () => {
    const track = { pose: { xyv: new Float32Array([0.5, Number.NaN, 1]), frameIndices: new Int32Array([3, 4]), tReal: new Float64Array([0.1]), flags: new Uint8Array([1, 0]) }, n: 2 }
    const back = unpackTyped(JSON.parse(JSON.stringify(packTyped(track))) as typeof track)
    expect(back.pose.xyv).toBeInstanceOf(Float32Array)
    expect(Array.from(back.pose.xyv)[0]).toBe(0.5)
    expect(Number.isNaN(back.pose.xyv[1])).toBe(true)
    expect(Array.from(back.pose.frameIndices)).toEqual([3, 4])
    expect(back.pose.tReal).toBeInstanceOf(Float64Array)
    expect(Array.from(back.pose.flags)).toEqual([1, 0])
    expect(back.n).toBe(2)
  })
})

const seedPath = join(process.cwd(), 'public/demo/seed@1.json')

describe.skipIf(!existsSync(seedPath))('published sample seed (public/demo)', () => {
  const seed = JSON.parse(readFileSync(seedPath, 'utf8')) as SampleSeed
  const fetchBlob = async (file: string) => new Blob([readFileSync(join(process.cwd(), 'public/demo', file))])

  it('is a sample seed of real engine output with provenance', () => {
    expect(isSampleSeed(seed)).toBe(true)
    expect(seed.featuredSessionId).toBe(SAMPLE_FEATURED_SESSION_ID)
    expect(seed.provenance.length).toBe(seed.sessions.length)
    for (const s of seed.sessions) {
      expect(s.session.analysis).toBeDefined()
      for (const serve of s.serves) for (const m of Object.values(serve.metrics)) expect(m?.status).toBeTruthy()
      // A stored video never has sound (D4, D8).
      for (const v of s.videos) expect(v.audio === 'never-recorded' || v.audio === 'removed').toBe(true)
    }
  })

  it('carries the whole loop: a decision per session, one experiment with its verdict, small clips', () => {
    expect(seed.sessions.map((s) => s.session.id)).toEqual(['sample-s1', 'sample-s2', 'sample-s3'])
    const decided = new Set(seed.decisions.map((d) => d.sessionId))
    for (const s of seed.sessions) expect(decided.has(s.session.id)).toBe(true)
    expect(seed.experiments).toHaveLength(1)
    const exp = seed.experiments[0]
    expect(exp.baselineSessionIds).toContain('sample-s2')
    expect(exp.retestSessionIds).toEqual(['sample-s3'])
    expect(exp.result?.verdict).toBeTruthy()
    expect(seed.practiceLogs.length).toBeGreaterThan(0)
    // Every number the report shows is labelled; tags are the sample player's own entries.
    for (const s of seed.sessions) for (const t of s.tags) expect(t.outcomeSource).toBe('player')
    // Each playback clip is 8 MB or less and exists next to the seed.
    for (const s of seed.sessions)
      for (const v of s.videos) {
        if (!v.file) continue
        const bytes = readFileSync(join(process.cwd(), 'public/demo', v.file)).byteLength
        expect(bytes).toBeLessThanOrEqual(8_000_000)
        expect(v.sizeBytes).toBe(bytes)
      }
  })

  it('loads every row as sample data, with typed tracks, and removes cleanly', async () => {
    const id = await loadDemoData(seed, fetchBlob)
    expect(id).toBe(SAMPLE_FEATURED_SESSION_ID)
    expect(await sampleSessionId()).toBe(SAMPLE_FEATURED_SESSION_ID)
    const db = getDb()
    const sessions = await db.sessions.toArray()
    expect(sessions).toHaveLength(seed.sessions.length)
    expect(sessions.every((s) => s.isDemo === 1)).toBe(true)
    const track = await db.tracks.get(seed.sessions[0].serves[0].id)
    expect(track?.pose.xyv).toBeInstanceOf(Float32Array)
    expect((await db.videos.toArray()).every((v) => v.isDemo === 1)).toBe(true)
    await removeDemoData()
    expect(await hasDemoData()).toBe(false)
    expect(await db.tracks.count()).toBe(0)
    expect(await db.experiments.count()).toBe(0)
  })
})
