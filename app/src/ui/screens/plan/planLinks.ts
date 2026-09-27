/**
 * Links into the Plan screen that carry the paywall moment (`via`), the Plus feature named (T3) and
 * the in-app path to return to. Only in-app paths are accepted for `from`.
 */
import type { EntitlementSetting } from '../../../data/records.ts'
import { isPlusFeature, type PlusFeature } from '../../../entitlement/index.ts'
import { paths } from '../../shell/paths.ts'

export type PlanVia = NonNullable<EntitlementSetting['via']>

/** An in-app path ("/progress?x=1"), never another origin or a protocol-relative URL. */
export function safeFrom(from: string | null | undefined): string | null {
  if (!from || !from.startsWith('/') || from.startsWith('//') || from.startsWith('/\\') || from.startsWith(paths.plan())) return null
  return from.length <= 300 ? from : null
}

export function planLink(opts: { via?: PlanVia; feature?: PlusFeature; from?: string } = {}): string {
  const q = new URLSearchParams()
  if (opts.via) q.set('via', opts.via)
  if (opts.feature) q.set('feature', opts.feature)
  const from = safeFrom(opts.from)
  if (from) q.set('from', from)
  const s = q.toString()
  return s ? `${paths.plan()}?${s}` : paths.plan()
}

export function readPlanLink(search: URLSearchParams): { via?: PlanVia; feature?: PlusFeature; from: string | null } {
  const v = search.get('via')
  const via = v === 't1' || v === 't2' || v === 't3' ? v : undefined
  const f = search.get('feature')
  return { via, feature: f && isPlusFeature(f) ? f : undefined, from: safeFrom(search.get('from')) }
}
