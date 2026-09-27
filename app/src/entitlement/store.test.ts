import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTests } from '../data/db.ts'
import { deleteEverything } from '../data/deletion.ts'
import { setSetting } from '../data/repos/settings.ts'
import { getEntitlement, getPaywallState, markPaywallShown } from './store.ts'

beforeEach(async () => {
  await resetDbForTests()
})

describe('paywall state store', () => {
  it('starts empty and records T1 once, with the experiment', async () => {
    expect(await getPaywallState()).toEqual({})
    const now = new Date(2026, 8, 28, 19)
    await markPaywallShown('t1', { experimentId: 'exp-1' }, now)
    await markPaywallShown('t1', { experimentId: 'exp-2' }, new Date(2026, 8, 30))
    const s = await getPaywallState()
    expect(s.t1ExperimentId).toBe('exp-1')
    expect(s.t1ShownAt).toBe(now.toISOString())
    expect(s.log).toHaveLength(2)
  })

  it('records T2 by month and T3 by feature', async () => {
    await markPaywallShown('t2', { month: '2026-09' }, new Date(2026, 8, 28))
    await markPaywallShown('t3', { feature: 'season-view' }, new Date(2026, 8, 28))
    const s = await getPaywallState()
    expect(s.t2Months).toEqual(['2026-09'])
    expect(s.log?.at(-1)).toMatchObject({ trigger: 't3', feature: 'season-view' })
  })

  it('reads the prototype plan flag', async () => {
    expect((await getEntitlement()).plus).toBe(false)
    await setSetting('entitlement', { tier: 'plus', plan: 'monthly', source: 'prototype', via: 't3', feature: 'ghost-compare' })
    expect(await getEntitlement()).toMatchObject({ plus: true, entitlement: { via: 't3' } })
  })

  it('"Delete everything" clears it', async () => {
    await markPaywallShown('t2', { month: '2026-09' })
    await deleteEverything()
    expect(await getPaywallState()).toEqual({})
  })
})
