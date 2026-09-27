/**
 * Test helpers for the insight screens (used only by *.test.tsx): render a route inside the real
 * router and theme, seed the player's own (non-sample) copy of the demo fixtures, and the honesty
 * checks every screen must pass (DESIGN §13.7 items 1, 4, 8).
 */
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { expect } from 'vitest'
import { getDb } from '../../../../data/db.ts'
import { DEMO_FIXTURES } from '../../../../data/fixtures.ts'
import { toServeRecord } from '../../../../data/repos/serves.ts'
import { lintCopy } from '../../../copy/lint.ts'
import { routes } from '../../../shell/routes.ts'
import { ThemeProvider } from '../../../theme/ThemeProvider.tsx'

export function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  )
  return router
}

const own = <T,>(x: T): T => JSON.parse(JSON.stringify(x).replaceAll('demo-', 'own-').replaceAll('"isDemo":1', '"isDemo":0')) as T

/**
 * The player's own data: the three fixture sessions re-labelled as non-sample, plus two earlier
 * side-view sessions (statistics only) so Progress has a usual band and a trend.
 */
export async function seedPlayer(opts: { painFlag?: boolean } = {}): Promise<void> {
  const db = getDb()
  const fx = DEMO_FIXTURES
  await db.transaction('rw', [db.sessions, db.serves, db.tags, db.tallies, db.sessionStats, db.coaching, db.experiments, db.practiceLogs, db.profile], async () => {
    await db.profile.put({ ...fx.profile, comfort: { painFlag: opts.painFlag ? 1 : 0 } })
    for (const s0 of fx.sessions) {
      const s = own(s0)
      await db.sessions.put(s.session)
      await db.serves.bulkPut(s.serves.map(toServeRecord))
      if (s.tags.length) await db.tags.bulkPut(s.tags)
      if (s.tally) await db.tallies.put(s.tally)
      await db.sessionStats.put(s.stats)
    }
    for (const [id, date, spread] of [
      ['own-s0a', '2026-08-29', 19.5],
      ['own-s0b', '2026-09-05', 18],
    ] as const) {
      const base = own(fx.sessions[0])
      await db.sessions.put({ ...base.session, id, visitId: date, startedAt: `${date}T08:00:00+10:00`, createdAt: `${date}T08:00:00+10:00` })
      const stats = structuredClone(base.stats)
      stats.sessionId = id
      // The stratum summary is the canonical session value (ui/format/sessionValues.ts): keep both in step.
      stats.metrics['toss-height-spread']!.value = spread
      for (const st of stats.strata) if (st.metrics['toss-height-spread']) st.metrics['toss-height-spread'] = { ...st.metrics['toss-height-spread'], value: spread }
      await db.sessionStats.put(stats)
    }
    await db.coaching.put(own(fx.decision))
    await db.experiments.put(own(fx.experiment))
    await db.practiceLogs.bulkPut(fx.practiceLogs.map(own))
  })
}

/** Every number carries its state; copy passes the lint; no degrees; experimental hidden unless allowed. */
export function expectHonest(opts: { experimentalAllowed?: boolean } = {}) {
  for (const el of document.querySelectorAll<HTMLElement>('[data-metric]')) {
    expect(el.dataset.status, el.dataset.metric).toBeTruthy()
    if (!opts.experimentalAllowed) expect(el.dataset.status, `${el.dataset.metric} is experimental`).not.toBe('experimental')
  }
  const text = document.body.textContent ?? ''
  expect(lintCopy(text)).toEqual([])
  expect(text).not.toMatch(/\d\s*°/)
  expect(text).not.toMatch(/\bNaN\b|undefined|Infinity/)
}

/** The screen has at most one primary (optic) action (DESIGN §1, §8.3). */
export function primaryCount(): number {
  return document.querySelectorAll('[data-variant="primary"]').length
}
