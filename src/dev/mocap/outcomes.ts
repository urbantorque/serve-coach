/**
 * Can the Bath serves' own outcomes check the link between a fault and a miss
 * (N2.9)? Run with `npm run bench:mocap -- --outcomes`.
 *
 * The set is one player's 42 serves, each labelled in, out or net from a
 * synchronised camera, which is exactly the shape of a player's tagged history.
 * So each serve is filmed from every placement, read by the engine, and its
 * faults set against its label the way `missLinks` sets a player's: one test,
 * the first look's share of the rate. The engine is asked at the level it
 * infers and at two stated levels above it, since a band one rung up from a
 * strong player is where a fault would first be named.
 *
 * What it can show is whether the test has anything to read on a real labelled
 * history. It cannot check the test's rates: nobody knows whether any fault
 * truly sends this player's serves into the net, so a link found or not found
 * here is neither right nor wrong.
 */
import { filmMocap, swingCompleted, type MocapServe } from '../../lib/analysis/mocapServe'
import { FIRST_LOOK, LINK_ALPHA, faultsOf, linksIn, type Row } from '../../lib/missLinks'
import { runEngine } from './engine'
import { PLACEMENTS } from './report'

export interface OutcomeRow {
  placement: string
  fps: number
  tier: string
  read: number
  labels: Record<string, number>
  /** Faults named, by label. */
  named: Record<string, Record<string, number>>
  links: string[]
}

export function benchOutcomes(serves: MocapServe[], tiers: (number | undefined)[] = [undefined, 7, 9], fps = 30): OutcomeRow[] {
  const labelled = serves.filter((s) => swingCompleted(s) && s.outcome)
  const out: OutcomeRow[] = []
  for (const placement of PLACEMENTS) {
    for (const tier of tiers) {
      const rows: Row[] = []
      const named: OutcomeRow['named'] = {}
      for (const serve of labelled) {
        const result = runEngine(filmMocap(serve, { ...placement.phone, fps }), fps, 'flat', tier)
        if (!result.ok) continue
        const faults = faultsOf(result.run.diagnosis.flaws)
        // One capture session, filmed from one place: one stratum.
        rows.push({ outcome: serve.outcome!, stratum: 'bath', faults })
        for (const [flaw, on] of Object.entries(faults)) {
          if (on) (named[serve.outcome!] ??= {})[flaw] = (named[serve.outcome!]?.[flaw] ?? 0) + 1
        }
      }
      const labels: Record<string, number> = {}
      for (const r of rows) labels[r.outcome] = (labels[r.outcome] ?? 0) + 1
      out.push({
        placement: placement.name,
        fps,
        tier: tier === undefined ? 'inferred' : String(tier),
        read: rows.length,
        labels,
        named,
        links: linksIn(rows, LINK_ALPHA / 2).map((l) => `${l.flaw} with ${l.miss} (p ${l.p.toExponential(1)})`),
      })
    }
  }
  return out
}

export function formatOutcomes(rows: OutcomeRow[]): string {
  const lines = [`The app asks nothing before ${FIRST_LOOK} tagged serves of one kind; this set is read anyway, at the first look's ${(100 * LINK_ALPHA) / 2}%.`]
  for (const r of rows) {
    const labels = Object.entries(r.labels).map(([k, v]) => `${v} ${k}`).join(', ')
    const named = Object.entries(r.named)
      .map(([label, flaws]) => `${label}: ${Object.entries(flaws).map(([f, n]) => `${f} ${n}`).join(', ')}`)
      .join(' · ')
    lines.push(
      `${r.placement.padEnd(30)} ${r.fps} fps, level ${r.tier.padEnd(8)} ${r.read} read (${labels}); faults named: ${named || 'none'}; links: ${r.links.join(', ') || 'none'}`,
    )
  }
  return lines.join('\n')
}
