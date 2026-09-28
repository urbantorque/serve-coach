// Finding 11: after a serve is deleted the report keeps the session's numbers (and their n) as the
// engine worked them out, and says in words that they still include the deleted serve.
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, resetDbForTests } from '../../../data/db.ts'
import { loadDemoData } from '../../../data/demo.ts'
import { deletedServesLine, deleteServe, DELETED_SERVE_NOTE, restoreServe } from '../../../data/deletion.ts'
import { useSettingsStore } from '../../../data/stores/settings.ts'
import { paths } from '../../shell/paths.ts'
import { renderAt } from '../progress/insights/testing.tsx'

vi.setConfig({ testTimeout: 15_000 })

beforeEach(async () => {
  await resetDbForTests()
  await loadDemoData()
  useSettingsStore.setState({ experimentalMetrics: false })
})

describe('a deleted serve is labelled on the report', () => {
  it('the line says the numbers still include it; the values and n are unchanged, marked early reads', async () => {
    const before = await getDb().sessionStats.get('demo-s1')
    const { snapshot } = await deleteServe('demo-s1-serve-01')
    const after = await getDb().sessionStats.get('demo-s1')
    expect(after?.deletedServeIds).toEqual(['demo-s1-serve-01'])
    const spread = after?.metrics['toss-height-spread']
    expect(spread?.value).toBe(before?.metrics['toss-height-spread']?.value)
    expect(spread?.n).toBe(before?.metrics['toss-height-spread']?.n)
    expect(spread?.provisional).toBe(true)
    expect(spread?.basis).toContain(DELETED_SERVE_NOTE)
    expect(DELETED_SERVE_NOTE).not.toMatch(/analyse/i)

    renderAt(paths.sessionReport('demo-s1'))
    expect(await screen.findByText(deletedServesLine(1), {}, { timeout: 8000 })).toBeInTheDocument()

    // Undo puts the earlier statistics back, and the line goes.
    await restoreServe(snapshot!)
    expect((await getDb().sessionStats.get('demo-s1'))?.deletedServeIds).toBeUndefined()
  })

  it('plural wording', () => {
    expect(deletedServesLine(3)).toBe('These numbers were worked out before you deleted 3 serves, so they still include them.')
  })
})
